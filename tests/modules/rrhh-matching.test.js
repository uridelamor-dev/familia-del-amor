// RRHH — emparejado de operadores de Ágora con perfiles (lógica pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizaNombre, emparejaOperadores, rendimientoDeEmpleado } from "../../src/modules/rrhh/matching.js";

describe("normalizaNombre", () => {
  test("quita acentos, puntuación y colapsa espacios", () => {
    assert.equal(normalizaNombre("  José  Pérez-García "), "jose perez garcia");
    assert.equal(normalizaNombre("ANA"), "ana");
    assert.equal(normalizaNombre(null), "");
  });
});

describe("emparejaOperadores", () => {
  const perfiles = [
    { id: 1, nombre: "José Pérez", agora_username: "Jose Perez" },
    { id: 2, nombre: "Ana López", agora_username: null },
    { id: 3, nombre: "Marc Roig", agora_username: null },
    { id: 4, nombre: "Marc Roig", agora_username: null }, // homónimo → colisión
  ];
  test("exacto por agora_username ya guardado (ignora acentos/caja)", () => {
    const r = emparejaOperadores(["JOSE PEREZ"], perfiles);
    assert.equal(r[0].match, "exacto");
    assert.equal(r[0].worker_id, 1);
  });
  test("probable por nombre único", () => {
    const r = emparejaOperadores(["Ana Lopez"], perfiles);
    assert.equal(r[0].match, "probable");
    assert.equal(r[0].worker_id, 2);
  });
  test("colisión (homónimos) → ninguno con candidatos, no auto-enlaza", () => {
    const r = emparejaOperadores(["Marc Roig"], perfiles);
    assert.equal(r[0].match, "ninguno");
    assert.equal(r[0].worker_id, null);
    assert.equal(r[0].candidatos.length, 2);
  });
  test("operador sin perfil → ninguno sin candidatos", () => {
    const r = emparejaOperadores(["Pepe Nuevo"], perfiles);
    assert.equal(r[0].match, "ninguno");
    assert.deepEqual(r[0].candidatos, []);
  });
  test("ignora vacíos, '—' y deduplica por nombre normalizado", () => {
    const r = emparejaOperadores(["", "—", "Ana Lopez", "ana lopez"], perfiles);
    assert.equal(r.length, 1);
    assert.equal(r[0].worker_id, 2);
  });
});

describe("rendimientoDeEmpleado", () => {
  const filas = [{ empleado: "Jose Perez", ventas: 1200, cancelado: 30 }, { empleado: "Ana López", ventas: 800, cancelado: 0 }];
  test("encuentra la fila por nombre normalizado", () => {
    assert.equal(rendimientoDeEmpleado(filas, "JOSE PEREZ").ventas, 1200);
    assert.equal(rendimientoDeEmpleado(filas, "ana lopez").ventas, 800);
  });
  test("sin enlace o sin fila → null", () => {
    assert.equal(rendimientoDeEmpleado(filas, null), null);
    assert.equal(rendimientoDeEmpleado(filas, "Otro"), null);
  });
});
