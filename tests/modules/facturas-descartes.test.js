// «Este albarán NO es de esta factura».
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indiceDescartes, descartadosDe, sinDescartados } from "../../src/modules/facturas/descartes.js";
import { proponerConciliacion } from "../../src/modules/facturas/conciliacion.js";

const F = { id: 1, proveedor: "GRAU", fecha: "2026-08-31", total: 300, tipo: "factura" };
const alb = (id, total, fecha = "2026-08-15") => ({ id, proveedor: "GRAU", fecha, total, tipo: "albaran" });

describe("el descarte es por PAREJA, no por albarán", () => {
  test("descartado en la factura A, sigue proponiéndose en la B", () => {
    // El mismo albarán puede ser perfectamente de la factura del mes siguiente: esconderlo de
    // todas sería peor que no poder descartarlo.
    const idx = indiceDescartes([{ factura_id: 1, albaran_id: 50 }]);
    assert.equal(descartadosDe(idx, 1).has("50"), true);
    assert.equal(descartadosDe(idx, 2).has("50"), false);
  });

  test("los ids se comparan como texto vengan como vengan", () => {
    // De la base llegan como número y del navegador como texto.
    const idx = indiceDescartes([{ factura_id: "7", albaran_id: 50 }]);
    assert.equal(descartadosDe(idx, 7).has("50"), true);
  });

  test("una factura sin descartes devuelve un conjunto vacío, no null", () => {
    assert.equal(descartadosDe(indiceDescartes([]), 9).size, 0);
    assert.deepEqual(sinDescartados([alb(1, 10)], descartadosDe(new Map(), 9)).length, 1);
  });
});

describe("la propuesta respeta lo descartado", () => {
  test("el descartado desaparece de los candidatos", () => {
    const p = proponerConciliacion(F, [alb(10, 100), alb(11, 200)], { descartados: new Set(["11"]) });
    assert.deepEqual(p.albaranes.map((a) => a.id), [10]);
    assert.equal(p.descartados, 1);
  });

  test("y lo dice, para que no parezca que nunca hubo candidatos", () => {
    const p = proponerConciliacion(F, [alb(10, 100), alb(11, 200)], { descartados: new Set(["11"]) });
    assert.ok(p.motivos.some((m) => /descartado/i.test(m)), p.motivos.join(" | "));
  });

  test("descartar el que hacía cuadrar deja la factura en «parcial»", () => {
    const cuadra = proponerConciliacion(F, [alb(10, 100), alb(11, 200)]);
    assert.equal(cuadra.estado, "cuadra");
    const roto = proponerConciliacion(F, [alb(10, 100), alb(11, 200)], { descartados: new Set(["11"]) });
    assert.equal(roto.estado, "parcial");
    assert.equal(roto.diferencia, -200);   // faltan 200 € para llegar a la factura
  });

  test("descartarlos TODOS no se lee como «nunca hubo albaranes»", () => {
    // Es la diferencia entre «este proveedor no deja albarán» y «alguien los descartó»: la
    // primera no hay que revisarla y la segunda quizá sí.
    const p = proponerConciliacion(F, [alb(10, 100)], { descartados: new Set(["10"]) });
    assert.equal(p.estado, "sin-albaranes");
    assert.match(p.motivos[0], /se descartaron a mano/);
  });

  test("sin descartes, todo se comporta exactamente igual que antes", () => {
    const a = proponerConciliacion(F, [alb(10, 300)]);
    const b = proponerConciliacion(F, [alb(10, 300)], { descartados: null });
    assert.equal(a.estado, b.estado);
    assert.equal(a.motivos.join(), b.motivos.join());
  });
});

describe("descartar no es deshacer", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const i = server.indexOf('app.post("/api/facturas/:id/descartar"');
  const fn = server.slice(i, server.indexOf("\n});\n", i));

  test("un albarán ya conciliado con esa factura no se descarta: se deshace", () => {
    // Mezclarlos dejaría un albarán suelto Y descartado, sin que se vea en ningún sitio.
    assert.match(fn, /conciliado_con = \?`, \[ids, String\(f\.id\)\]\)/);
    assert.match(fn, /deshaz la conciliación primero/);
  });

  test("y deshacer una conciliación NO borra descartes", () => {
    const j = server.indexOf('app.post("/api/facturas/:id/conciliar"');
    const conciliar = server.slice(j, server.indexOf("\n});\n", j));
    assert.doesNotMatch(conciliar, /facturas_conciliacion_descartes/);
  });

  test("la tabla lleva PK tonta e índice único, no clave primaria compuesta", () => {
    // Una PK compuesta es justo lo que el diff de Replit no sabe ordenar al desplegar.
    assert.match(server, /CREATE TABLE IF NOT EXISTS facturas_conciliacion_descartes[\s\S]{0,200}id SERIAL PRIMARY KEY/);
    assert.match(server, /CREATE UNIQUE INDEX IF NOT EXISTS ux_conc_descarte ON facturas_conciliacion_descartes \(factura_id, albaran_id\)/);
  });
});
