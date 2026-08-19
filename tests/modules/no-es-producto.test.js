import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { noEsProducto, nombresDeLaCasa, repasarLineas } from "../../src/modules/facturas/no-es-producto.js";

// Los casos son LITERALES de dos pantallas de verdad: la lista de Productos con «La Cooperativa
// (Blanes)» dentro, y la cola de unificar con horas de operario y hojas de la gestoría.
const NOMBRES = nombresDeLaCasa({ empresas: ["MATEU DEL AMOR SL", "LA TAPETA RESTAURACIO SL"] });
const marcada = (d) => noEsProducto(d, NOMBRES);

describe("nombres de la casa: es el nombre entero, no que lo mencione", () => {
  test("«La Cooperativa (Blanes)» no es un producto", () => {
    const r = marcada("La Cooperativa (Blanes)");
    assert.ok(r, "tendría que marcarse");
    assert.match(r.motivo, /establecimiento nuestro/);
  });

  test("pero «24 cartes … per la cooperativa» SÍ lo es", () => {
    // Son cartas impresas PARA la Cooperativa: mercancía de Gràfiques Blanes. Si esto se
    // marcara, el aviso sería ruido desde el primer día y nadie volvería a mirarlo.
    assert.equal(marcada("24 cartes 14 x 25 cm. 2c pvc 3mm per la cooperativa"), null);
    assert.equal(marcada("12 cartes 14 x 25 cm. 2c pvc 3mm per la coope"), null);
  });

  test("los demás establecimientos y sociedades, igual", () => {
    for (const d of ["LA TAPETA", "Can Mateu - Tordera", "La Tapa Ibérica", "Viva la Pepa",
                     "Botiga d'en Mateu", "MATEU DEL AMOR SL", "La Tapeta Blanes"]) {
      assert.ok(marcada(d), `debería marcarse: ${d}`);
    }
  });

  test("y con un poco de paja al lado sigue sin ser un producto", () => {
    assert.ok(marcada("La Cooperativa (Blanes) 2026"));
    assert.ok(marcada("LA TAPETA - BLANES S.L."));
  });

  test("«Blanes» a secas NO marca nada: es un municipio, no un artículo", () => {
    // Si el municipio contara como nombre de la casa, cualquier línea que lo mencione caería.
    assert.equal(marcada("Blanes"), null);
    assert.equal(marcada("Agua de Blanes 1,5L"), null);
  });
});

describe("productos de verdad que NUNCA pueden marcarse", () => {
  // Son la razón de no leer los nombres de la plantilla: hay personas que se llaman como
  // productos, y al revés.
  const buenos = [
    "Clara 33cl", "Rosa de Navarra", "Aceite de oliva virgen extra 5L",
    "ANCHOA FILETE EN ACEITE DE GIRASOL - 100F 0.850 K (0.500 K ESC)",
    "BACALLA CUES 100/200 C/6Kg (CB)", "Coca-Cola Zero 33cl", "Pilar de jamón ibérico",
    "SANGRIA BOX 5 L", "Estrella Damm barril 30L", "Pan de cristal congelado",
  ];
  for (const d of buenos) {
    test(`«${d}»`, () => assert.equal(marcada(d), null, "esto es mercancía"));
  }
});

describe("gastos que no son mercancía", () => {
  const casos = [
    ["TEMPS OPERARI PER REPARACIÓ DE PERSIANA ELÈCTRICA.", /operario|mantenimiento/],
    ["Albarán Nº 2602388 de 07/07/2026 SANGRIA BOX 5 L", /albarán/],
    ["MANO DE OBRA MONTAJE", /mano de obra|mantenimiento/],
    ["Horas de trabajo técnico", /horas/],
    ["Cuota mensual mantenimiento extintores", /cuota|mantenimiento/],
    ["DESPLAZAMIENTO", /desplazamiento/],
  ];
  for (const [d, re] of casos) {
    test(`«${d.slice(0, 44)}…»`, () => {
      const r = marcada(d);
      assert.ok(r, "debería marcarse");
      assert.match(r.motivo, re);
    });
  }

  test("media hoja de la gestoría tampoco es un artículo", () => {
    const r = marcada("DE AHINARA CORRALES VIDAL: COMUNICACIÓN A LA SEGURIDAD SOCIAL TRANSFORMACIÓN. MODIFICACIÓN CONTRATO Y DATOS BASE. DOCUMENTO TRANSFORMACIÓN CONTRATOS DE TRABAJO DE FIJOS DISCONTINUOS A FIJOS Y COMUNICACIÓN REGISTRO AL SEPE.");
    assert.ok(r);
    assert.match(r.motivo, /laboral|largo/);
  });
});

describe("no revienta con lo que llegue", () => {
  for (const v of ["", null, undefined, "   ", "···", 12345]) {
    test(`«${String(v)}»`, () => assert.doesNotThrow(() => noEsProducto(v, NOMBRES)));
  }
  test("vacío o basura no se marca: marcarlo sería inventar un aviso", () => {
    assert.equal(marcada(""), null);
    assert.equal(marcada("   "), null);
  });
});

describe("repasarLineas devuelve solo las señaladas, con su motivo", () => {
  test("separa el grano de la paja y conserva la fila entera", () => {
    const filas = [
      { clave: "a", descripcion: "La Cooperativa (Blanes)", importe: 371 },
      { clave: "b", descripcion: "Coca-Cola Zero 33cl", importe: 20 },
      { clave: "c", descripcion: "TEMPS OPERARI PER REPARACIÓ", importe: 30 },
    ];
    const r = repasarLineas(filas, NOMBRES);
    assert.equal(r.length, 2);
    assert.deepEqual(r.map((x) => x.clave), ["a", "c"]);
    assert.equal(r[0].importe, 371, "la fila viaja entera: el aviso tiene que poder decir cuánto");
    assert.ok(r[0].aviso.motivo);
  });

  test("una lista vacía o basura no revienta", () => {
    assert.deepEqual(repasarLineas([], NOMBRES), []);
    assert.deepEqual(repasarLineas(null, NOMBRES), []);
  });
});

describe("el catálogo de nombres se deriva, no se copia", () => {
  test("salen los ocho establecimientos y sus formas de escribirlos", () => {
    const claves = nombresDeLaCasa().map((n) => n.clave);
    for (const c of ["cooperativa", "tapeta", "can mateu", "tapa iberica", "botiga mateu"]) {
      assert.ok(claves.some((x) => x === c || x.includes(c)), `falta ${c}`);
    }
  });

  test("las empresas de la base entran sin tocar código", () => {
    const claves = nombresDeLaCasa({ empresas: ["INVENTADA SL"] }).map((n) => n.clave);
    assert.ok(claves.includes("inventada"));
  });

  test("y ningún nombre queda vacío tras quitar municipios y formas jurídicas", () => {
    for (const n of nombresDeLaCasa()) assert.ok(n.clave.length > 0, `${n.nombre} quedó en nada`);
  });
});
