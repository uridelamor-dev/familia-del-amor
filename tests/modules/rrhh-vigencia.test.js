// ¿Está esta persona laboralmente activa? Tres preguntas distintas, y confundirlas rompe cosas.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { marcadoActivo, activoEnFecha, activoAhora, bajaEfectiva, pertenecioAlPeriodo, turnosTrasLaBaja } from "../../src/modules/rrhh/vigencia.js";

const ALTA = { id: 1, fecha_alta: "2026-03-01", fecha_baja: null, activo: 1 };
const BAJA31 = { id: 2, fecha_alta: "2020-01-01", fecha_baja: "2026-08-31", activo: 1 };
const DESACTIVADO = { id: 3, fecha_alta: "2020-01-01", fecha_baja: null, activo: 0 };

describe("cómo se lee la columna activo", () => {
  test("ausente o nula significa activo", () => {
    // `activo INTEGER DEFAULT 1`, pero hay filas antiguas y consultas que no la traen.
    assert.equal(marcadoActivo({}), true);
    assert.equal(marcadoActivo({ activo: null }), true);
    assert.equal(marcadoActivo({ activo: 1 }), true);
    assert.equal(marcadoActivo({ activo: true }), true);
  });
  test("solo 0, false o «0» desactivan", () => {
    for (const v of [0, false, "0"]) assert.equal(marcadoActivo({ activo: v }), false, String(v));
  });
});

describe("activoEnFecha: ¿trabajaba ESE día? (la pregunta del cuadrante)", () => {
  test("la fecha de baja es el ÚLTIMO DÍA TRABAJADO, inclusive", () => {
    // Convenio de la Seguridad Social, y el que ya usaba descansos.js. Quien causa baja el
    // 31 trabaja el 31; el 1 de septiembre ya no.
    assert.equal(activoEnFecha(BAJA31, "2026-08-30"), true);
    assert.equal(activoEnFecha(BAJA31, "2026-08-31"), true, "el día de la baja SÍ trabaja");
    assert.equal(activoEnFecha(BAJA31, "2026-09-01"), false);
  });
  test("antes de su alta no estaba", () => {
    // Sin esto, quien entra el jueves sale «librando» el lunes anterior en el cuadrante.
    assert.equal(activoEnFecha(ALTA, "2026-02-28"), false);
    assert.equal(activoEnFecha(ALTA, "2026-03-01"), true);
  });
  test("desactivado a mano y sin fecha de baja: no hay dónde situar el corte, así que no", () => {
    assert.equal(activoEnFecha(DESACTIVADO, "2026-08-25"), false);
  });
  test("desactivado a mano PERO con fecha de baja: manda la fecha", () => {
    // Es lo que permite seguir pintando su media semana en el cuadrante de esa semana.
    const x = { ...BAJA31, activo: 0 };
    assert.equal(activoEnFecha(x, "2026-08-20"), true);
    assert.equal(activoEnFecha(x, "2026-09-05"), false);
  });
});

describe("activoAhora: ¿puede trabajar HOY? (login, kiosco, generador)", () => {
  test("una baja futura NO impide entrar todavía", () => {
    // El caso que pidió Uriel: baja el 31 y hoy es 25 → sigue trabajando y entrando.
    assert.equal(activoAhora(BAJA31, "2026-08-25"), true);
    assert.equal(activoAhora(BAJA31, "2026-08-31"), true);
    assert.equal(activoAhora(BAJA31, "2026-09-01"), false);
  });
  test("desactivar una cuenta surte efecto AHORA, aunque tenga baja futura", () => {
    // Desactivar es una decisión del presente: si esperara a la fecha de baja, echar a
    // alguien de un día para otro no cortaría su acceso.
    assert.equal(activoAhora({ ...BAJA31, activo: 0 }, "2026-08-25"), false);
    assert.equal(activoAhora(DESACTIVADO, "2026-08-25"), false);
  });
  test("quien todavía no ha entrado tampoco entra", () => {
    assert.equal(activoAhora(ALTA, "2026-02-28"), false);
  });
});

describe("pertenecioAlPeriodo: ¿estuvo en algún momento? (histórico y export legal)", () => {
  test("quien se fue en agosto sigue saliendo en el periodo de agosto", () => {
    // Contestar aquí con activoAhora haría desaparecer a alguien de su propio registro de
    // jornada, que la ley obliga a conservar cuatro años.
    assert.equal(pertenecioAlPeriodo(BAJA31, "2026-08-01", "2026-08-31"), true);
    assert.equal(pertenecioAlPeriodo(BAJA31, "2026-09-01", "2026-09-30"), false);
  });
  test("quien entró a mitad del periodo también cuenta", () => {
    assert.equal(pertenecioAlPeriodo(ALTA, "2026-02-01", "2026-03-15"), true);
    assert.equal(pertenecioAlPeriodo(ALTA, "2026-01-01", "2026-01-31"), false);
  });
  test("desactivado sin fecha de baja: no se le quita del histórico", () => {
    // No hay fecha con la que decidir que no estuvo, y el registro tiene que seguir entero.
    assert.equal(pertenecioAlPeriodo(DESACTIVADO, "2026-08-01", "2026-08-31"), true);
  });
});

describe("turnosTrasLaBaja: avisar, nunca borrar", () => {
  const ASIG = [
    { id: 1, worker_id: 2, dia: "2026-08-20", estado: "publicado" },
    { id: 2, worker_id: 2, dia: "2026-09-03", estado: "publicado" },
    { id: 3, worker_id: 2, dia: "2026-09-05", estado: "borrador" },
    { id: 4, worker_id: 9, dia: "2026-09-04", estado: "borrador" },
  ];
  test("separa lo publicado de lo que está en borrador", () => {
    // Un publicado se mandó al grupo: cambiarlo exige una versión nueva. Un borrador no.
    const r = turnosTrasLaBaja(ASIG, BAJA31);
    assert.equal(r.total, 2);
    assert.deepEqual(r.publicados.map((a) => a.id), [2]);
    assert.deepEqual(r.borrador.map((a) => a.id), [3]);
  });
  test("no cuenta lo anterior a la baja ni lo de otra persona", () => {
    const r = turnosTrasLaBaja(ASIG, BAJA31);
    assert.ok(!r.publicados.some((a) => a.dia === "2026-08-20"));
    assert.ok(!r.borrador.some((a) => a.worker_id === 9));
  });
  test("sin baja ni desactivación no hay nada que avisar", () => {
    assert.equal(turnosTrasLaBaja(ASIG, ALTA).total, 0);
  });
  test("desactivado sin fecha: TODOS sus turnos futuros cuentan", () => {
    const r = turnosTrasLaBaja(ASIG, { ...DESACTIVADO, id: 2 });
    assert.equal(r.total, 3);
  });
});

describe("bajaEfectiva: la puerta del panel", () => {
  test("no mira la fecha de alta", () => {
    // A quien empieza el mes que viene hay que poder darle su usuario para que lo pruebe.
    const futuro = { fecha_alta: "2026-12-01", fecha_baja: null, activo: 1 };
    assert.equal(bajaEfectiva(futuro, "2026-08-25"), false);
    assert.equal(activoAhora(futuro, "2026-08-25"), false, "pero trabajar hoy, no");
  });
  test("el día de la baja todavía entra; el siguiente no", () => {
    assert.equal(bajaEfectiva(BAJA31, "2026-08-31"), false);
    assert.equal(bajaEfectiva(BAJA31, "2026-09-01"), true);
  });
  test("sin fecha de baja no bloquea nunca", () => {
    assert.equal(bajaEfectiva(ALTA, "2030-01-01"), false);
  });
});
