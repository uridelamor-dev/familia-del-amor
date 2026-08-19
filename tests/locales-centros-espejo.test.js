import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CENTROS, AMBITO_POR_RUTA } from "../src/modules/locales/centros.js";

// El panel no puede importar ESM, así que `centros.js` tiene un espejo escrito a mano en
// app.js. Un espejo desincronizado es peor que no tenerlo: la pantalla enseñaría un
// establecimiento y la API contestaría con otro, y nadie sabría cuál de los dos miente.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

const bloque = (txt, desde, hasta) => {
  const i = txt.indexOf(desde);
  assert.notEqual(i, -1, `no está: ${desde}`);
  const j = txt.indexOf(hasta, i + desde.length);
  return txt.slice(i, j === -1 ? i + 3000 : j);
};

describe("el espejo del panel dice lo mismo que el módulo", () => {
  const espejo = bloque(panel, "const CENTROS_FE = [", "const ambitoDeVista");

  test("las mismas barras, centro por centro", () => {
    for (const c of CENTROS) {
      for (const b of c.barras) {
        assert.ok(espejo.includes(`"${b}"`), `al panel le falta la barra ${b}`);
      }
      assert.ok(espejo.includes(`principal: "${c.principal}"`), `al panel le falta el principal de ${c.id}`);
    }
  });

  test("los mismos ámbitos juntos", () => {
    for (const c of CENTROS) {
      for (const a of c.juntos) assert.ok(espejo.includes(`"${a}"`), `al panel le falta el ámbito ${a}`);
    }
  });

  test("y ninguna barra de más: el panel no puede juntar lo que el servidor separa", () => {
    const delModulo = new Set(CENTROS.flatMap((c) => c.barras));
    for (const m of espejo.matchAll(/"([^"]+ - [^"]+)"/g)) {
      assert.ok(delModulo.has(m[1]), `el panel junta «${m[1]}», que el módulo no conoce`);
    }
  });
});

describe("cada pantalla junta lo mismo que su ruta", () => {
  // Si el panel cree que Compras va junto y el servidor no (o al revés), el rótulo diría
  // «Blanes» y la respuesta traería solo una de las dos barras.
  const PARES = [
    ["analitica", "/api/analitica"], ["agora", "/api/agora"],
    ["facturas", "/api/facturas"], ["productos", "/api/productos"],
    ["rrhh", "/api/rrhh"], ["horarios", "/api/horarios"], ["fichajes", "/api/fichajes"],
    ["inventarios", "/api/inventario"],
  ];
  const mapaFE = bloque(panel, "const AMBITO_POR_VISTA = {", "};");

  for (const [vista, ruta] of PARES) {
    test(`${vista} ↔ ${ruta}`, () => {
      const enServidor = AMBITO_POR_RUTA.find(([p]) => ruta.startsWith(p));
      assert.ok(enServidor, `${ruta} no está mapeada en el servidor`);
      assert.match(mapaFE, new RegExp(`${vista}: "${enServidor[1]}"`), `el panel no dice ${enServidor[1]} para ${vista}`);
    });
  }

  test("reservas y reseñas van al centro como todo lo demás", () => {
    // Por dentro es UN establecimiento en todos los departamentos. Los dos locales de cara al
    // cliente no salen de aquí: la web va por WEB_LOCALES y las reseñas se casan con la ficha
    // de Google por su nombre.
    for (const v of ["reservas", "reviews"]) {
      assert.match(mapaFE, new RegExp(`${v}: "${v}"`), `al panel le falta el ámbito ${v}`);
      assert.ok(AMBITO_POR_RUTA.some(([p, a]) => p === `/api/${v}` && a === v), `al servidor le falta /api/${v}`);
      for (const c of CENTROS) assert.ok(c.juntos.includes(v), `${v} debería juntarse`);
    }
  });

  test("la web, WhatsApp y el Dashboard quedan fuera de los dos", () => {
    for (const v of ["web", "whatsapp", "dashboard"]) {
      assert.ok(!new RegExp(`\\b${v}: "`).test(mapaFE), `el panel junta ${v}`);
      assert.ok(!AMBITO_POR_RUTA.some(([p]) => p === `/api/${v}`), `el servidor junta ${v}`);
    }
  });
});

describe("el cableado del servidor pasa por el módulo, no por copias", () => {
  test("los helpers de ámbito traducen al centro", () => {
    assert.match(bloque(server, "function localScope(req, pedido)", "\n}"), /localCentro\(suyo, ambitoDeRuta\(req\.path\)\)/);
    assert.match(bloque(server, "function localesAccesibles(req)", "\n}"), /visiblesEn\(ambitoDeRuta/);
    assert.match(bloque(server, "function horLocal(req, pedido)", "\n}"), /localCentro\(String\(pedido/);
  });

  test("una factura que entra por el grupo de la Cooperativa es gasto del centro", () => {
    const fac = readFileSync(new URL("../facturas.js", import.meta.url), "utf8");
    assert.match(fac, /local = localCentro\(canon, "compras"\)/);
  });

  test("el histórico de fichajes se lee sumando, porque no se puede mover", () => {
    // `fic_eventos` es inmutable por ley: la columna `local` de un fichaje pasado se queda
    // donde está, y por eso se lee con local = ANY(?) en vez de migrarla.
    assert.match(server, /const ficLocales = \(local\) => barrasDelCentro\(local, "personal"\)/);
    assert.ok(!/UPDATE fic_eventos[\s\S]{0,80}SET local/.test(server), "no se puede reescribir el local de un fichaje");
  });
});
