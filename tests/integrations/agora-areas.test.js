import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INFORMES, AREAS, listaInformes } from "../../src/integrations/agora/reports.js";

// Analítica está partida en dos: VENTAS (lo que entra) y CONTROL (lo que no llega a cobrarse).
// Un informe nuevo sin `area` caería en «ventas» por defecto, y una cancelación colada entre
// las ventas no es un error visible: es un número que suma donde no debe.
describe("cada informe del TPV sabe de qué área es", () => {
  const claves = AREAS.map((a) => a.key);

  test("todos declaran su área explícitamente", () => {
    for (const [k, d] of Object.entries(INFORMES)) {
      assert.ok(d.area, `«${k}» no dice de qué área es`);
      assert.ok(claves.includes(d.area), `«${k}» dice «${d.area}», que no es un área`);
    }
  });

  test("control es lo que NO llega a cobrarse", () => {
    for (const k of ["cancelaciones", "descuentos", "invitaciones"]) {
      assert.equal(INFORMES[k].area, "control", k);
    }
  });

  test("ventas es lo que entra", () => {
    for (const k of ["producto", "empleado", "pagos", "hora"]) {
      assert.equal(INFORMES[k].area, "ventas", k);
    }
  });

  test("las dos áreas tienen informes: una vacía sería un botón que no hace nada", () => {
    for (const a of claves) {
      assert.ok(Object.values(INFORMES).some((d) => d.area === a), `«${a}» se queda sin informes`);
    }
  });

  test("el área viaja al panel en la lista de informes", () => {
    for (const i of listaInformes()) assert.ok(claves.includes(i.area), i.key);
  });
});

describe("el panel y el servidor dicen las mismas áreas", () => {
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("ANAL_AREAS coincide con AREAS", () => {
    const m = panel.match(/const ANAL_AREAS = \[([\s\S]*?)\];/);
    assert.ok(m, "falta ANAL_AREAS en el panel");
    const enPanel = [...m[1].matchAll(/key:\s*"(\w+)"/g)].map((x) => x[1]);
    assert.deepEqual(enPanel, AREAS.map((a) => a.key));
  });

  test("el buscador filtra la tabla ya cargada, sin volver a preguntar al TPV", () => {
    // Volver a consultar por cada tecla castigaría al TPV del local, que está en producción.
    const i = panel.indexOf("function analBuscar(");
    assert.notEqual(i, -1);
    const bloque = panel.slice(i, panel.indexOf("\n}", i));
    assert.ok(!/apiRaw|loadAnalInforme/.test(bloque), "buscar no puede lanzar una consulta");
  });

  test("al buscar, el total se recalcula sobre lo que se ve", () => {
    // Dejar el total del informe entero debajo de tres filas filtradas es la forma más fácil
    // de leer un número que no es.
    assert.match(panel, /Total\$\{nq \? " de lo buscado" : ""\}/);
  });
});
