// CÓMO SE ENTREGA EL PASE. No qué lleva dentro —eso ya lo blinda `wallet-pkpass-forma`— sino
// las cabeceras con las que sale, que es lo que decide si iOS se lo ofrece a Wallet.
//
// ── EL FALLO QUE ESTO ARREGLA ────────────────────────────────────────────────────────────────
//
// En el iPhone salía «Safari no puede descargar este archivo». El pase estaba perfecto: se
// comprobó el de PRODUCCIÓN entero —ZIP íntegro, los hashes del manifest, los seis campos
// obligatorios, el firmante con su Pass Type ID y su Team ID, la firma sobre `manifest.json` y
// la cadena hasta los certificados de Apple: todo correcto—. Y el transporte también: 200, el
// MIME bueno y su `Content-Length`.
//
// Lo único que se desviaba de cómo Apple documenta la entrega era `Content-Disposition:
// attachment`, que empuja a Safari a su GESTOR DE DESCARGAS en vez de al traspaso a Wallet. Ese
// gestor no sabe guardar un `.pkpass`, y de ahí que el error hablara de descargar.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  return server.slice(i, server.indexOf("\n});", i) + 4);
};
const APPLE = ruta('app.get("/api/wallet/apple/:token"');

describe("las cabeceras con las que sale el pase", () => {
  test("EL TIPO MIME ES EL QUE APPLE EXIGE", () => {
    // Es lo único que Apple pide para que iOS reconozca un pase.
    assert.match(APPLE, /res\.setHeader\("Content-Type", "application\/vnd\.apple\.pkpass"\)/);
  });

  test("NO SE ENTREGA COMO `attachment`", () => {
    // Es el cambio que arregla el fallo: con `attachment`, Safari en iOS lo manda a descargas.
    const disp = APPLE.match(/res\.setHeader\("Content-Disposition", `([^`]*)`\)/);
    assert.ok(disp, "la ruta no declara Content-Disposition");
    assert.ok(!/attachment/.test(disp[1]), `se entrega como attachment: ${disp[1]}`);
    assert.match(disp[1], /^inline;/, `se esperaba inline: ${disp[1]}`);
  });

  test("y conserva el nombre del fichero, que en escritorio sí importa", () => {
    assert.match(APPLE, /inline; filename="\$\{nombreArchivoPase\(\)\}"/);
  });

  test("no se guarda en cachés compartidas: dentro va el token de una persona", () => {
    assert.match(APPLE, /res\.setHeader\("Cache-Control", "private, no-store"\)/);
  });

  test("el cuerpo se manda tal cual, sin envolver en JSON", () => {
    assert.match(APPLE, /res\.end\(buffer\)/);
  });
});

describe("lo que NO cambia", () => {
  test("un carné anulado o un cupón siguen sin poder ir a la wallet", () => {
    assert.match(APPLE, /if \(!puedeIrAWallet\(qr, info\.estado\)\) return res\.status\(409\)/);
  });

  test("y la ruta sigue detrás del interruptor y del freno de peticiones", () => {
    assert.match(APPLE, /if \(tarjetaApagada\(res\)\) return;/);
    assert.match(APPLE, /if \(!pulsoRateLimit\(req, res, TJ_VER_MAX\)\) return;/);
  });

  test("Google Wallet no se toca: es otra ruta y otro camino", () => {
    const google = ruta('app.get("/api/wallet/google/:token"');
    assert.ok(!/Content-Disposition/.test(google), "el enlace de Google ahora manda cabeceras de fichero");
  });
});
