// El .pkpass, abierto y comprobado por dentro.
//
// El pase se monta con el escritor de ZIP de las facturas (`crearZip`), que no comprime, y con
// un manifest de SHA-1. Si cualquiera de las dos cosas se descuadra, iOS dice «el pase no es
// válido» y no dice cuál de los diez ficheros falla: por eso hay que comprobarlo aquí, con el
// ZIP abierto, y no en un móvil.
//
// El firmante se inyecta, así que esto corre sin certificados de Apple y sin openssl.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { construirPkpass, IMAGENES_OBLIGATORIAS } from "../src/modules/wallet/pkpass.js";
import { pasePlanoApple } from "../src/modules/wallet/wallet.js";

const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const firmarFalso = (manifest) => Buffer.from("FIRMA-DE-MENTIRA:" + sha1(manifest), "utf8");

const IMAGENES = [
  { nombre: "icon.png", datos: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
  { nombre: "icon@2x.png", datos: Buffer.from([0x89, 0x50, 0x4e, 0x47, 4, 5, 6]) },
  { nombre: "logo.png", datos: Buffer.from([0x89, 0x50, 0x4e, 0x47, 7, 8, 9]) },
];

const PASE = pasePlanoApple({
  qr: { clase: "carnet", token: "TOK123", codigo: "12345678", nombre: "Marta" },
  cfg: { pass_type_id: "pass.org.familiadelamor.tarjeta", team_id: "ABCDE12345" },
  base: "https://familiadelamor.org",
});

/**
 * Un lector de ZIP mínimo: recorre las cabeceras locales, que es lo que de verdad lee quien abre
 * el archivo. Escrito aquí y no importado de ningún sitio a propósito — si usara el mismo código
 * que el escritor, un error de formato compartido pasaría desapercibido.
 */
function abrirZip(buf) {
  const out = {};
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const metodo = buf.readUInt16LE(p + 8);
    const crc = buf.readUInt32LE(p + 14);
    const tam = buf.readUInt32LE(p + 18);
    const lNombre = buf.readUInt16LE(p + 26);
    const lExtra = buf.readUInt16LE(p + 28);
    const nombre = buf.slice(p + 30, p + 30 + lNombre).toString("utf8");
    const ini = p + 30 + lNombre + lExtra;
    out[nombre] = { datos: buf.slice(ini, ini + tam), metodo, crc };
    p = ini + tam;
  }
  return out;
}

describe("estructura del .pkpass", () => {
  const buffer = construirPkpass({ pase: PASE, imagenes: IMAGENES, sha1, firmar: firmarFalso });
  const zip = abrirZip(buffer);

  test("es un ZIP y termina con su índice", () => {
    assert.equal(buffer.readUInt32LE(0), 0x04034b50, "no empieza por una cabecera local de ZIP");
    assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50, "no termina con el fin de índice central");
  });

  test("dentro están los cinco ficheros que hacen un pase", () => {
    for (const n of ["pass.json", "manifest.json", "signature", ...IMAGENES_OBLIGATORIAS]) {
      assert.ok(zip[n], `falta ${n} dentro del pase`);
    }
  });

  test("nada va comprimido (método «store»)", () => {
    // Apple no exige deflate y el escritor de ZIP del proyecto no comprime. Si alguien lo
    // cambiara sin ajustar las cabeceras, el archivo dejaría de abrirse.
    for (const [nombre, e] of Object.entries(zip)) {
      assert.equal(e.metodo, 0, `${nombre} va comprimido y no debería`);
    }
  });

  test("los SHA-1 del manifest cuadran con los ficheros que van dentro", () => {
    // Éste es el fallo que iOS no sabe explicar. Aquí sí.
    const manifest = JSON.parse(zip["manifest.json"].datos.toString("utf8"));
    for (const [nombre, hash] of Object.entries(manifest)) {
      assert.ok(zip[nombre], `el manifest nombra ${nombre}, que no está en el ZIP`);
      assert.equal(hash, sha1(zip[nombre].datos), `el hash de ${nombre} no cuadra`);
    }
  });

  test("el manifest NO se incluye a sí mismo ni a la firma", () => {
    const manifest = JSON.parse(zip["manifest.json"].datos.toString("utf8"));
    assert.equal(manifest["manifest.json"], undefined);
    assert.equal(manifest["signature"], undefined);
  });

  test("la firma es sobre los bytes exactos del manifest que va en el ZIP", () => {
    // Serializar el JSON dos veces —una para firmar y otra para meterlo— es la forma silenciosa
    // de romper esto: el orden de las claves cambia y el pase deja de validar.
    assert.equal(zip["signature"].datos.toString("utf8"), "FIRMA-DE-MENTIRA:" + sha1(zip["manifest.json"].datos));
  });

  test("pass.json llega intacto y se puede volver a leer", () => {
    const leido = JSON.parse(zip["pass.json"].datos.toString("utf8"));
    assert.equal(leido.serialNumber, "TOK123");
    assert.equal(leido.barcodes[0].message, "https://familiadelamor.org/tarjeta.html?t=TOK123");
  });

  test("el mismo pase produce siempre los mismos bytes", () => {
    // Determinista: la fecha del ZIP se pasa desde fuera y no se lee el reloj. Es lo que permite
    // comparar dos pases y saber si ha cambiado algo de verdad.
    const otro = construirPkpass({ pase: PASE, imagenes: IMAGENES, sha1, firmar: firmarFalso });
    assert.deepEqual(otro, buffer);
  });
});

describe("lo que no se deja pasar", () => {
  test("sin los iconos obligatorios no se construye nada", () => {
    // iOS rechaza el pase entero si falta icon.png, y sin decir cuál falta.
    assert.throws(
      () => construirPkpass({ pase: PASE, imagenes: [IMAGENES[0]], sha1, firmar: firmarFalso }),
      /icon@2x\.png/);
  });

  test("una firma vacía es un error, no un pase roto", () => {
    assert.throws(
      () => construirPkpass({ pase: PASE, imagenes: IMAGENES, sha1, firmar: () => Buffer.alloc(0) }),
      /firma/i);
  });

  test("sin pase, sin hash o sin firmante se dice qué falta", () => {
    assert.throws(() => construirPkpass({ imagenes: IMAGENES, sha1, firmar: firmarFalso }), /pass\.json/);
    assert.throws(() => construirPkpass({ pase: PASE, imagenes: IMAGENES, firmar: firmarFalso }), /sha1/);
    assert.throws(() => construirPkpass({ pase: PASE, imagenes: IMAGENES, sha1 }), /firmante/);
  });
});
