// Los vales impresos, cableados.
//
// Introspección sobre `server.js` y el panel. Blindan las cosas que, cuando se rompen, no dan
// ningún error: un vale que se puede canjear infinitas veces, un vale que resulta no ser anónimo,
// y unos QR que se sirven a quien no debe.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/promos/schema.js", import.meta.url), "utf8");

/** El handler de emisión de la tirada, acotado. */
const emitir = (() => {
  const i = server.indexOf('app.post("/api/promos/vales", requireAuth');
  assert.ok(i > 0, "no está el handler de emisión de vales");
  const f = server.indexOf('app.get("/api/promos/vales", requireAuth', i);
  assert.ok(f > i);
  return server.slice(i, f);
})();

describe("un vale se canjea UNA vez", () => {
  test("la emisión usa la constante, nunca un número a mano", () => {
    // `usos_max = 0` es ILIMITADO. Un vale con 0 son cien desayunos gratis con un solo papel, y
    // no da ningún error: se descubre contando la caja.
    assert.match(emitir, /usosMax: USOS_POR_VALE/);
    assert.ok(!/usosMax: 0/.test(emitir), "¡se está emitiendo un vale ilimitado!");
  });

  test("la constante entra por import, no se redefine aquí", () => {
    assert.match(server, /USOS_POR_VALE[\s\S]{0,200}from "\.\/src\/modules\/promos\/vales\.js"/);
  });
});

describe("el vale es anónimo de verdad", () => {
  test("se emite sin teléfono y sin nombre", () => {
    assert.match(emitir, /telefono: ""/);
    assert.match(emitir, /nombre: ""/);
  });

  test("queda marcado como impreso y con su tirada", () => {
    // Sin eso, cien vales son cien filas idénticas sin nombre en el panel.
    assert.match(emitir, /origen: "impreso"/);
    assert.match(emitir, /tirada: tirada\.clave/);
  });

  test("el esquema tiene la columna y su índice, aditivos", () => {
    assert.match(esquema, /ALTER TABLE pro_qr ADD COLUMN IF NOT EXISTS tirada TEXT/);
    assert.match(esquema, /CREATE INDEX IF NOT EXISTS idx_pro_qr_tirada/);
  });

  test("el índice del canje sigue dejando fuera a los que no tienen teléfono", () => {
    // Es lo que permite que un vale anónimo se canjee: si el índice los incluyera, el segundo
    // vale de la tirada chocaría con el primero y saldría «ya se usó».
    assert.match(esquema, /idx_pro_canje_cliente[\s\S]{0,200}WHERE telefono <> ''/);
  });
});

describe("una tirada no se puede repetir", () => {
  test("se rechaza un nombre que ya existe", () => {
    // Si se dejara, el ZIP de una tirada sería a veces los cien de septiembre y a veces los
    // ciento cincuenta de septiembre y octubre. Nadie sabría qué se imprimió.
    assert.match(emitir, /FROM pro_qr WHERE tirada = \?/);
    assert.match(emitir, /res\.status\(409\)/);
  });

  test("se comprueba ANTES de emitir nada", () => {
    const iComprueba = emitir.indexOf("FROM pro_qr WHERE tirada = ?");
    const iEmite = emitir.indexOf("proEmitir(");
    assert.ok(iComprueba > 0 && iEmite > iComprueba, "media tirada emitida y luego un 409 es lo peor de los dos mundos");
  });
});

describe("las rutas", () => {
  test("están registradas y solo para quien lleva promociones", () => {
    for (const r of ['app.post("/api/promos/vales", requireAuth(PROMOS_ROLES)',
                     'app.get("/api/promos/vales", requireAuth(PROMOS_ROLES)',
                     'app.get("/api/promos/vales/:tirada/zip", requireAuth(PROMOS_ROLES)',
                     'app.post("/api/promos/vales/:tirada/anular", requireAuth(PROMOS_ROLES)',
                     'app.get("/api/promos/qr/:id/imagen", requireAuth(PROMOS_ROLES)']) {
      assert.ok(server.includes(r), `falta ${r}`);
    }
  });

  test("«vales» va ANTES que cualquier /api/promos/:id", () => {
    // Express recorre en orden y gana la primera que casa: si `/:id` fuera antes, «vales»
    // llegaría como si fuera el id de una promoción.
    const vales = server.indexOf('"/api/promos/vales"');
    const conId = server.indexOf('"/api/promos/:id/anular-sin-usar"');
    assert.ok(vales > 0 && conId > 0);
    assert.ok(vales < conId, "«vales» se declara después de /:id y nunca se alcanzará");
  });

  test("los QR no se sirven en caché compartida", () => {
    // Dentro va el token de un cupón concreto.
    for (const ruta of ['app.get("/api/promos/vales/:tirada/zip"', 'app.get("/api/promos/qr/:id/imagen"']) {
      const i = server.indexOf(ruta);
      assert.match(server.slice(i, i + 2600), /Cache-Control", "private, no-store/, `${ruta} sin no-store`);
    }
  });
});

describe("la descarga", () => {
  const zip = server.slice(server.indexOf('app.get("/api/promos/vales/:tirada/zip"'),
                           server.indexOf('app.post("/api/promos/vales/:tirada/anular"'));

  test("un solo vale baja el SVG suelto, sin envolverlo en un ZIP", () => {
    assert.match(zip, /if \(vales\.length === 1\)/);
    assert.match(zip, /image\/svg\+xml/);
  });

  test("con varios, el ZIP lleva los QR, el CSV y el LÉEME", () => {
    assert.match(zip, /csvDeVales\(/);
    assert.match(zip, /valesLeeme\(/);
    assert.match(zip, /crearZip\(archivos\)/);
    assert.match(zip, /application\/zip/);
  });

  test("el QR lleva el enlace de siempre, no una URL escrita a mano", () => {
    // Es el invariante de todo el sistema: una sola función compone esa URL, y es la que sabe
    // leer el escáner de la barra.
    assert.match(zip, /proEnlace\(req, q\)/);
    assert.ok(!/cupon\.html/.test(zip), "se está componiendo la URL a mano");
  });
});

describe("anular una tirada", () => {
  const anular = server.slice(server.indexOf('app.post("/api/promos/vales/:tirada/anular"'),
                              server.indexOf('app.get("/api/promos/qr/:id/imagen"'));

  test("solo toca los que NADIE ha usado", () => {
    // Quitarle el desayuno a quien ya lo canjeó no tendría sentido, y además borraría el
    // sentido de su canje.
    assert.match(anular, /anulado_en IS NULL AND usos = 0/);
  });

  test("no borra: anula", () => {
    assert.ok(!/DELETE FROM pro_qr/.test(server), "un vale no se borra nunca: se anula");
  });
});

describe("el panel", () => {
  test("la tarjeta de vales está en la pestaña de emitir", () => {
    assert.match(panel, /\$\{promoTarjetaVales\(\)\}/);
    assert.match(panel, /function promoTarjetaVales\(\)/);
  });

  test("avisa de lo que hay que saber antes de imprimir", () => {
    const f = panel.slice(panel.indexOf("function promoTarjetaVales()"), panel.indexOf("async function valeEmitir()"));
    assert.match(f, /sirve una sola vez/i);
    assert.match(f, /sin darnos ning[uú]n dato/i);
  });

  test("emitir se confirma antes: no se deshace del todo", () => {
    const f = panel.slice(panel.indexOf("async function valeEmitir()"), panel.indexOf("async function valeBajar("));
    assert.match(f, /confirm\(/);
  });

  test("el botón «Reenviar» desaparece cuando no hay teléfono", () => {
    // `proEnviarWA` devuelve «Sin teléfono» y el endpoint contesta 409: un botón que nunca puede
    // funcionar se acaba pulsando igual y parece que algo está roto.
    const f = panel.slice(panel.indexOf("function promoTablaQr()"), panel.indexOf("function renderPromos()"));
    assert.match(f, /q\.telefono \? ` · <button[^`]*promo-reenviar/);
  });

  test("un vale impreso se distingue por su tirada, no por un guion", () => {
    const f = panel.slice(panel.indexOf("function promoTablaQr()"), panel.indexOf("function renderPromos()"));
    assert.match(f, /q\.tirada[\s\S]{0,120}Vale impreso/);
  });
});
