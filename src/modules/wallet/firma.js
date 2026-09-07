// La firma PKCS#7 del pase de Apple. LA ÚNICA PIEZA IMPURA de todo el módulo wallet: escribe
// ficheros temporales y lanza el binario de openssl.
//
// Por qué openssl y no `crypto`: Node sabe firmar (`crypto.createSign`) pero no sabe construir
// una estructura CMS/PKCS#7, que es lo que Apple exige, y aquí no se pueden añadir dependencias
// npm (node-forge queda descartado). openssl ya está en la imagen y el proyecto ya lanza
// binarios externos así — `gs` para comprimir PDF en server.js. Está declarado en `.replit`
// junto a `sqlite` y `ghostscript` para que no dependa de lo que traiga la imagen base.
//
// Por qué ficheros temporales y no tuberías: `openssl smime` quiere rutas para el certificado,
// la clave y el intermedio. Se escriben en el directorio temporal del sistema con permisos 0600,
// se borran SIEMPRE en el `finally`, y dentro va una clave privada: si esto se dejara en
// `tmp_uploads/` acabaría publicado por `express.static`.

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

/** SHA-1 en hexadecimal, que es lo que pide el manifest del pase. */
export const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

/**
 * ¿Hay openssl en esta máquina? Sin él, el botón de Apple no se enseña y se dice por qué, en
 * vez de dar un error al pulsarlo.
 *
 * La respuesta se guarda: esto se pregunta en CADA visita a la página de una tarjeta, y lanzar
 * un proceso para saber algo que no cambia mientras el servidor esté vivo es tiempo de un
 * cliente esperando en la barra. Un binario no aparece ni desaparece a mitad de ejecución; si
 * alguien lo instala, se reinicia y ya está.
 */
let _openssl = null;
export function hayOpenssl() {
  if (_openssl !== null) return _openssl;
  try {
    execFileSync("openssl", ["version"], { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    _openssl = true;
  } catch { _openssl = false; }
  return _openssl;
}

/**
 * Firma los bytes del manifest y devuelve el PKCS#7 *detached* en DER.
 *
 * `p12` es el certificado del Pass Type ID exportado con su clave privada; `wwdrPem` es el
 * intermedio de Apple, que hay que incluir con `-certfile` o iOS no puede encadenar la firma
 * hasta la raíz y rechaza el pase sin decir por qué.
 *
 * `-binary` para que no se toquen los saltos de línea, `-noattr` para no meter atributos
 * firmados que Apple no espera, y `-outform DER` porque el fichero `signature` es DER crudo, no
 * PEM.
 */
export function firmarPKCS7(manifest, { p12, password = "", wwdrPem } = {}) {
  if (!Buffer.isBuffer(manifest) || !manifest.length) throw new Error("Nada que firmar");
  if (!p12 || !p12.length) throw new Error("Falta el certificado .p12 de Apple");
  if (!wwdrPem || !wwdrPem.length) throw new Error("Falta el certificado intermedio de Apple (WWDR)");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pkpass-"));
  const rP12 = path.join(dir, "cert.p12");
  const rCert = path.join(dir, "cert.pem");
  const rClave = path.join(dir, "clave.pem");
  const rWwdr = path.join(dir, "wwdr.pem");
  const rMan = path.join(dir, "manifest.json");
  const rFirma = path.join(dir, "signature");

  try {
    fs.writeFileSync(rP12, p12, { mode: 0o600 });
    fs.writeFileSync(rWwdr, wwdrPem, { mode: 0o600 });
    fs.writeFileSync(rMan, manifest, { mode: 0o600 });

    // La contraseña va por `env:` y no en la línea de órdenes: los argumentos de un proceso los
    // ve cualquiera que pueda listar procesos en la máquina.
    const env = { ...process.env, PKPASS_PW: String(password || "") };
    const comun = { stdio: ["ignore", "pipe", "pipe"], timeout: 20000, env };

    // OpenSSL 3 no lee por defecto los .p12 antiguos (RC2/3DES), que es justo lo que exporta
    // Llavero. `-legacy` los abre; si la versión no lo admite, se reintenta sin él.
    const sacar = (args, legacy) => execFileSync("openssl",
      ["pkcs12", "-in", rP12, "-passin", "env:PKPASS_PW", ...args, ...(legacy ? ["-legacy"] : [])], comun);
    const conFallback = (args) => {
      try { return sacar(args, true); } catch { return sacar(args, false); }
    };

    fs.writeFileSync(rCert, conFallback(["-clcerts", "-nokeys"]), { mode: 0o600 });
    fs.writeFileSync(rClave, conFallback(["-nocerts", "-nodes"]), { mode: 0o600 });

    execFileSync("openssl", [
      "smime", "-sign", "-binary", "-noattr",
      "-in", rMan, "-out", rFirma, "-outform", "DER",
      "-signer", rCert, "-inkey", rClave, "-certfile", rWwdr,
    ], comun);

    return fs.readFileSync(rFirma);
  } catch (e) {
    // El error de openssl viene en stderr y es lo único que dice si la contraseña está mal, si
    // el certificado caducó o si el .p12 no es lo que se creía. Sin esto, quien suba un
    // certificado equivocado solo ve «no se pudo firmar» y no tiene por dónde empezar.
    const detalle = String((e && e.stderr && e.stderr.toString()) || e.message || "").trim().split("\n").slice(-3).join(" ");
    throw new Error(`No se pudo firmar el pase: ${detalle || "openssl falló"}`);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* el temporal se queda; no vale la pena tirar la petición por eso */ }
  }
}

/**
 * Lo que se puede saber de un certificado sin usarlo: para quién es y cuándo caduca.
 *
 * Se enseña en el panel porque el fallo típico de esto no es un error de código, es que el
 * certificado caducó hace tres semanas y nadie se enteró hasta que un cliente dijo que no podía
 * guardarse la tarjeta. Con la fecha delante, se renueva antes.
 */
export function datosDelCertificado(p12, password = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pkpass-info-"));
  const rP12 = path.join(dir, "cert.p12");
  try {
    fs.writeFileSync(rP12, p12, { mode: 0o600 });
    const env = { ...process.env, PKPASS_PW: String(password || "") };
    const opts = { stdio: ["ignore", "pipe", "pipe"], timeout: 20000, env, encoding: "utf8" };
    const pem = (() => {
      const args = ["pkcs12", "-in", rP12, "-passin", "env:PKPASS_PW", "-clcerts", "-nokeys"];
      try { return execFileSync("openssl", [...args, "-legacy"], opts); }
      catch { return execFileSync("openssl", args, opts); }
    })();
    const cert = new crypto.X509Certificate(pem);
    return { subject: cert.subject, caduca_en: cert.validTo, caducado: new Date(cert.validTo) < new Date() };
  } catch (e) {
    const detalle = String((e && e.stderr && e.stderr.toString()) || e.message || "").trim().split("\n").slice(-2).join(" ");
    throw new Error(`No se pudo leer el certificado: ${detalle || "openssl falló"}`);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* nada que hacer */ }
  }
}
