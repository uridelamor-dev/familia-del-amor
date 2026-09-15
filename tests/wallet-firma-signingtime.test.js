// LA FIRMA DEBE LLEVAR FECHA. Es lo que hacía que el pase no se pudiera añadir.
//
// ── EL FALLO, Y POR QUÉ COSTÓ TANTO ENCONTRARLO ──────────────────────────────────────────────
//
// El pase se descargaba bien y se rechazaba en silencio. Todo lo comprobable daba correcto: el
// ZIP íntegro, los hashes del manifest sobre los bytes exactos, los campos de `pass.json`, el
// certificado firmante con su Pass Type ID y su Team ID, y la firma verificando —incluso con la
// CADENA hasta los certificados reales de Apple— con `openssl smime -verify`.
//
// El motivo lo dijo Apple, y solo apareció en el registro del sistema al abrir el pase:
//
//     [com.apple.passkit:Validation] Signature validation: *** FAILED ***
//     [com.apple.passkit:General]    Invalid data error reading pass …
//                                    Signature must contain a signing date
//
// La firma se hacía con `-noattr`, que quita TODOS los atributos autenticados, `signingTime`
// incluido. A openssl no le hace falta esa fecha para verificar; a PassKit sí. Por eso las
// comprobaciones locales pasaban y el iPhone rechazaba el pase.
//
// Dos hipótesis anteriores se descartaron con evidencia y no con razonamiento: que faltara
// `Content-Length` (Node sí lo pone) y que `Content-Disposition: attachment` fuera la causa
// (se cambió a `inline`, se desplegó, y seguía fallando).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firmarPKCS7, hayOpenssl } from "../src/modules/wallet/firma.js";

const firma = readFileSync(new URL("../src/modules/wallet/firma.js", import.meta.url), "utf8");

describe("el comando de firma", () => {
  test("NO USA `-noattr`: quitaría la fecha que PassKit exige", () => {
    // Se ancla en `"smime"`: la PRIMERA llamada a openssl del fichero es la que extrae del .p12.
    const i = firma.indexOf('"smime"');
    const orden = firma.slice(i, firma.indexOf("], comun);", i));
    assert.ok(!orden.includes('"-noattr"'), "vuelve a firmar con -noattr: el pase no se podrá añadir");
  });

  test("y sigue siendo PKCS#7 detached en DER, con el intermedio dentro", () => {
    const i = firma.indexOf('"smime"');
    const orden = firma.slice(i, firma.indexOf("], comun);", i));
    for (const a of ['"-sign"', '"-binary"', '"-outform", "DER"', '"-certfile", rWwdr']) {
      assert.ok(orden.includes(a), `falta ${a}`);
    }
  });

  test("el porqué queda escrito junto a la llamada", () => {
    // Quitar `-noattr` parece gratuito si no se sabe qué costó averiguarlo.
    assert.match(firma, /Signature must contain a signing date/);
  });
});

describe("la firma que se produce", { skip: !hayOpenssl() && "no hay openssl" }, () => {
  let dir, p12, wwdr, manifest;

  test("preparar un certificado desechable", () => {
    dir = mkdtempSync(join(tmpdir(), "firma-test-"));
    const cmd = (args) => execFileSync("openssl", args, { stdio: "ignore" });
    cmd(["req", "-x509", "-newkey", "rsa:2048", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"),
         "-days", "2", "-nodes", "-subj", "/CN=Prueba"]);
    cmd(["req", "-x509", "-newkey", "rsa:2048", "-keyout", join(dir, "wk.pem"), "-out", join(dir, "w.pem"),
         "-days", "2", "-nodes", "-subj", "/CN=WWDR de prueba"]);
    cmd(["pkcs12", "-export", "-inkey", join(dir, "k.pem"), "-in", join(dir, "c.pem"),
         "-out", join(dir, "t.p12"), "-passout", "pass:x"]);
    p12 = readFileSync(join(dir, "t.p12"));
    wwdr = readFileSync(join(dir, "w.pem"));
    manifest = Buffer.from('{"icon.png":"abc"}', "utf8");
  });

  test("LLEVA `signingTime`, que es lo que pedía Apple", () => {
    const sig = firmarPKCS7(manifest, { p12, password: "x", wwdrPem: wwdr });
    writeFileSync(join(dir, "sig.der"), sig);
    const asn1 = execFileSync("openssl", ["asn1parse", "-inform", "DER", "-in", join(dir, "sig.der")],
      { encoding: "utf8" });
    assert.match(asn1, /signingTime/, "la firma no lleva fecha: PassKit la rechazará");
    // Y los otros dos atributos autenticados que vienen con ella.
    assert.match(asn1, /contentType/);
    assert.match(asn1, /messageDigest/);
  });

  test("y sigue verificando sobre los bytes exactos del manifest", () => {
    writeFileSync(join(dir, "man.json"), manifest);
    // `openssl smime -verify` escribe «Verification successful» por STDERR, no por stdout.
    const salida = execFileSync("sh",
      ["-c", `openssl smime -verify -binary -inform DER -in "${join(dir, "sig.der")}" ` +
             `-content "${join(dir, "man.json")}" -noverify -out /dev/null 2>&1`],
      { encoding: "utf8" });
    assert.match(String(salida), /Verification successful/);
  });

  test("un manifest alterado sigue rompiendo la firma", () => {
    writeFileSync(join(dir, "malo.json"), Buffer.concat([manifest, Buffer.from("x")]));
    assert.throws(() => execFileSync("openssl",
      ["smime", "-verify", "-binary", "-inform", "DER", "-in", join(dir, "sig.der"),
       "-content", join(dir, "malo.json"), "-noverify", "-out", "/dev/null"],
      { stdio: "ignore" }), "una firma que acepta un manifest alterado no sirve de nada");
    rmSync(dir, { recursive: true, force: true });
  });
});
