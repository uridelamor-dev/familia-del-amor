import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CENTROS, AMBITO_POR_RUTA, ambitoDeRuta, centroDe, esJunto, canonico,
  barras, visiblesEn, detalleCentro, esBarraSecundaria,
} from "../../src/modules/locales/centros.js";

// La Tapeta de Blanes y la Cooperativa son dos barras de un mismo negocio. Se juntan en
// ventas, compras, personal e inventarios; siguen separadas en reservas, web y reseñas,
// porque eso sí es de cada barra: dos direcciones, dos cartas, dos agendas de mesas.
const TAPETA = "La Tapeta - Blanes";
const COOP = "Cooperativa - Blanes";
const JUNTOS = ["ventas", "compras", "personal", "inventarios"];
const SEPARADOS = ["reservas", "web", "reviews", "whatsapp"];

describe("qué barra pertenece a qué centro", () => {
  test("las dos de Blanes son el mismo centro", () => {
    assert.equal(centroDe(TAPETA).id, "blanes");
    assert.equal(centroDe(COOP).id, "blanes");
  });

  test("los demás establecimientos van por libre", () => {
    for (const l of ["La Tapeta - Lloret", "Can Mateu - Tordera", "Oficina"]) {
      assert.equal(centroDe(l), null, `${l} no debería tener centro`);
    }
  });

  test("vacío, nulo o un nombre inventado no revientan", () => {
    for (const v of ["", null, undefined, "   ", "Bar Pepe"]) assert.equal(centroDe(v), null);
  });
});

describe("el nombre con el que se lee y se escribe", () => {
  test("en lo que se junta, la Cooperativa pasa a ser el centro", () => {
    for (const a of JUNTOS) assert.equal(canonico(COOP, a), TAPETA, `falla en ${a}`);
  });

  test("en lo que NO se junta, la Cooperativa sigue siendo ella", () => {
    for (const a of SEPARADOS) assert.equal(canonico(COOP, a), COOP, `no debe juntarse en ${a}`);
  });

  test("sin ámbito no se junta nada: no se toca a ciegas", () => {
    assert.equal(canonico(COOP, null), COOP);
    assert.equal(canonico(COOP, ""), COOP);
    assert.equal(canonico(COOP, "loquesea"), COOP);
  });

  test("los demás locales pasan intactos, se junte o no", () => {
    for (const a of [...JUNTOS, ...SEPARADOS, null]) {
      assert.equal(canonico("La Tapeta - Lloret", a), "La Tapeta - Lloret");
      assert.equal(canonico("Oficina", a), "Oficina");
    }
  });

  test("el principal se devuelve a sí mismo", () => {
    for (const a of [...JUNTOS, ...SEPARADOS]) assert.equal(canonico(TAPETA, a), TAPETA);
  });
});

describe("las barras que hay que mirar (para lo que no se puede reescribir)", () => {
  // `fic_eventos` es inmutable por ley y `ventas_diarias` la escribe el TPV de cada barra:
  // ese histórico no se migra, se lee sumando con local = ANY(?).
  test("en lo que se junta, las dos", () => {
    for (const a of JUNTOS) {
      assert.deepEqual([...barras(COOP, a)].sort(), [COOP, TAPETA].sort(), `falla en ${a}`);
      assert.deepEqual([...barras(TAPETA, a)].sort(), [COOP, TAPETA].sort());
    }
  });

  test("en lo separado, solo la suya", () => {
    for (const a of SEPARADOS) assert.deepEqual(barras(COOP, a), [COOP]);
  });

  test("siempre un array, para que quien lo use no tenga que preguntar", () => {
    assert.deepEqual(barras("La Tapeta - Lloret", "compras"), ["La Tapeta - Lloret"]);
    assert.deepEqual(barras("", "compras"), []);
    assert.ok(Array.isArray(barras(null, null)));
  });

  test("devuelve una copia: quien la reciba no puede estropear el catálogo", () => {
    const b = barras(COOP, "compras");
    b.push("Bar Pepe");
    assert.equal(barras(COOP, "compras").length, 2, "se ha colado un cambio en CENTROS");
  });
});

describe("qué se ofrece en la barra del panel", () => {
  const TODOS = [TAPETA, COOP, "La Tapeta - Lloret", "Oficina"];

  test("en lo que se junta, la Cooperativa desaparece de la lista", () => {
    for (const a of JUNTOS) {
      const v = visiblesEn(a, TODOS);
      assert.ok(!v.includes(COOP), `la Cooperativa no debería poder elegirse en ${a}`);
      assert.ok(v.includes(TAPETA) && v.includes("La Tapeta - Lloret") && v.includes("Oficina"));
    }
  });

  test("en reservas, web y reseñas sigue estando", () => {
    for (const a of SEPARADOS) assert.deepEqual(visiblesEn(a, TODOS), TODOS, `falla en ${a}`);
  });

  test("sin ámbito se ofrece todo, como siempre", () => {
    assert.deepEqual(visiblesEn(null, TODOS), TODOS);
  });

  test("una lista vacía o basura no revienta", () => {
    assert.deepEqual(visiblesEn("compras", []), []);
    assert.deepEqual(visiblesEn("compras", null), []);
  });
});

describe("de qué ámbito es cada ruta", () => {
  const casos = [
    ["/api/ventas", "ventas"], ["/api/agora/informes", "ventas"], ["/api/analitica/x", "ventas"],
    ["/api/facturas/compras", "compras"], ["/api/productos", "compras"],
    ["/api/rrhh/trabajadores", "personal"], ["/api/horarios/semana", "personal"],
    ["/api/fichajes/hoy", "personal"], ["/api/hr/applications", "personal"],
    ["/api/inventario/proveedores", "inventarios"], ["/api/inv/x", "inventarios"],
  ];
  for (const [ruta, esperado] of casos) {
    test(`${ruta} → ${esperado}`, () => assert.equal(ambitoDeRuta(ruta), esperado));
  }

  test("lo no mapeado devuelve null y se comporta como antes", () => {
    for (const r of ["/api/reservas", "/api/reviews/x", "/api/web/y", "/api/whatsapp/z",
                     "/api/dashboard", "/api/auth/me", "/", ""]) {
      assert.equal(ambitoDeRuta(r), null, `${r} no debería juntar nada`);
    }
  });

  test("la query no confunde al mapa", () => {
    assert.equal(ambitoDeRuta("/api/horarios/semana?local=Cooperativa%20-%20Blanes"), "personal");
  });

  test("las reservas NO están en el mapa, y es la mitad del sentido de todo esto", () => {
    assert.ok(!AMBITO_POR_RUTA.some(([p]) => p.startsWith("/api/reservas")),
      "juntar las reservas sentaría a dos grupos en la misma mesa");
  });
});

describe("lo que se le dice a quien mira", () => {
  test("estando en el centro se avisa de qué lleva dentro", () => {
    assert.match(detalleCentro(TAPETA, "compras") || "", /Cooperativa/);
  });

  test("donde no se junta, no se dice nada", () => {
    assert.equal(detalleCentro(TAPETA, "reservas"), null);
    assert.equal(detalleCentro("La Tapeta - Lloret", "compras"), null);
  });

  test("y estando en la barra secundaria tampoco: ella no incluye a nadie", () => {
    assert.equal(detalleCentro(COOP, "compras"), null);
  });

  test("esBarraSecundaria distingue la barra del centro", () => {
    assert.equal(esBarraSecundaria(COOP), true);
    assert.equal(esBarraSecundaria(TAPETA), false);
    assert.equal(esBarraSecundaria("La Tapeta - Lloret"), false);
  });
});

describe("el catálogo está bien formado", () => {
  test("el principal es siempre una de sus barras", () => {
    for (const c of CENTROS) assert.ok(c.barras.includes(c.principal), `${c.id}: principal fuera de barras`);
  });

  test("ninguna barra está en dos centros a la vez", () => {
    const vistas = new Set();
    for (const c of CENTROS) for (const b of c.barras) {
      assert.ok(!vistas.has(b), `${b} está en dos centros`);
      vistas.add(b);
    }
  });

  test("solo se juntan ámbitos que existen", () => {
    const conocidos = new Set([...JUNTOS, ...SEPARADOS]);
    for (const c of CENTROS) for (const a of c.juntos) {
      assert.ok(conocidos.has(a), `${c.id} junta un ámbito desconocido: ${a}`);
    }
  });
});
