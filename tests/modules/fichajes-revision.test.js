// Clasificar una jornada para poder revisar por excepciones.
//
// Cada test de aquí es una decisión de negocio: qué se puede validar de golpe y qué no. Si
// alguno cambia, cambia lo que el sistema da por bueno sin que lo mire nadie.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  clasificarJornada, resumirRevision, mereceSalir, candidatasDeLote, tieneCorreccionAMano,
  LISTA, REVISION, ABIERTA, VALIDADA, CADUCADA, MOTIVOS,
} from "../../src/modules/fichajes/revision.js";
import { construirJornada, firmaDeEventos, REVISAR, INFORMA } from "../../src/modules/fichajes/jornadas.js";

// Un turno de 16:00 a 00:00 y su fichaje, que es el caso de todos los días.
const PLAN = [{ id: 1, worker_id: 7, inicio_min: 960, fin_min: 1440, tipo: "turno" }];
const ev = (id, tipo, minuto, extra = {}) => ({ id, tipo, minuto_local: minuto, epoch_ms: minuto * 60000, ...extra });
const FICHADO_LIMPIO = [ev(1, "entrada", 958), ev(2, "salida", 1444)];   // −2 y +4 min: dentro de tolerancia

const jornadaDe = (eventos, asignaciones = PLAN, opts = {}) =>
  construirJornada({ eventos, asignaciones, toleranciaMin: 10, diaCerrado: true, ...opts });

describe("lo que se puede validar de golpe", () => {
  test("una jornada limpia entra en el lote", () => {
    const j = jornadaDe(FICHADO_LIMPIO);
    const c = clasificarJornada({ jornada: j, eventos: FICHADO_LIMPIO, diaCerrado: true });
    assert.equal(c.estado, LISTA);
    assert.equal(c.puedeLote, true);
    assert.equal(c.motivo, null);
  });

  test("una incidencia INFORMATIVA no la saca del lote", () => {
    // Entrar veinte minutos tarde es un dato, no una decisión. Si esto obligara a abrir la
    // jornada, media plantilla acabaría en la cola de revisión todos los días y la cola
    // dejaría de significar nada.
    const tarde = [ev(1, "entrada", 985), ev(2, "salida", 1440)];    // +25 min
    const j = jornadaDe(tarde);
    assert.ok(j.incidencias.some((i) => i.tipo === "entrada_tarde" && i.nivel === INFORMA));
    assert.ok(!j.incidencias.some((i) => i.nivel === REVISAR));
    const c = clasificarJornada({ jornada: j, eventos: tarde, diaCerrado: true });
    assert.equal(c.estado, LISTA);
    assert.equal(c.puedeLote, true);
  });

  test("salir tarde tampoco, mientras siga siendo informativo", () => {
    const j = jornadaDe([ev(1, "entrada", 960), ev(2, "salida", 1482)]);   // +42 min
    assert.ok(j.incidencias.some((i) => i.tipo === "salida_tarde" && i.nivel === INFORMA));
    assert.equal(clasificarJornada({ jornada: j, eventos: [], diaCerrado: true }).puedeLote, true);
  });
});

describe("lo que NO se valida sin que lo mire una persona", () => {
  test("se fue sin fichar la salida", () => {
    const evs = [ev(1, "entrada", 960)];
    const c = clasificarJornada({ jornada: jornadaDe(evs), eventos: evs, diaCerrado: true });
    assert.equal(c.estado, REVISION);
    assert.equal(c.motivo, MOTIVOS.incidencia);
  });

  test("tenía turno y no consta ningún fichaje", () => {
    const c = clasificarJornada({ jornada: jornadaDe([]), eventos: [], diaCerrado: true });
    assert.equal(c.estado, REVISION);
  });

  test("fichó la salida sin haber fichado la entrada", () => {
    const evs = [ev(1, "salida", 1440)];
    assert.equal(clasificarJornada({ jornada: jornadaDe(evs), eventos: evs, diaCerrado: true }).estado, REVISION);
  });

  test("fichó un día que no tenía turno", () => {
    const c = clasificarJornada({ jornada: jornadaDe(FICHADO_LIMPIO, []), eventos: FICHADO_LIMPIO, diaCerrado: true });
    assert.equal(c.estado, REVISION);
  });

  test("jornada por encima de las 12 horas", () => {
    const largo = [ev(1, "entrada", 480), ev(2, "salida", 1290)];    // 13,5 h
    const j = jornadaDe(largo, [{ id: 1, worker_id: 7, inicio_min: 480, fin_min: 1290, tipo: "turno" }]);
    assert.ok(j.incidencias.some((i) => i.tipo === "jornada_larga"));
    assert.equal(clasificarJornada({ jornada: j, eventos: largo, diaCerrado: true }).estado, REVISION);
  });
});

describe("los fichajes metidos a mano", () => {
  test("una jornada corregida a mano NO entra en el lote aunque haya quedado limpia", () => {
    // Alguien añadió la salida que faltaba. La jornada ya cuadra, pero las horas que salen de
    // esa corrección no las ha confirmado nadie: meterlas en el lote sería enterrarla.
    const evs = [ev(1, "entrada", 958), ev(2, "salida", 1444, { origen: "manual" })];
    const j = jornadaDe(evs);
    assert.equal(j.incidencias.filter((i) => i.nivel === REVISAR).length, 0, "la corrección arregló el problema");
    const c = clasificarJornada({ jornada: j, eventos: evs, diaCerrado: true });
    assert.equal(c.estado, REVISION);
    assert.equal(c.motivo, MOTIVOS.manual);
  });

  test("un fichaje anulado cuenta igual", () => {
    const evs = [ev(1, "entrada", 958), ev(9, "salida", 1200, { anulado_por: 3 }), ev(2, "salida", 1444)];
    assert.equal(clasificarJornada({ jornada: jornadaDe(evs), eventos: evs, diaCerrado: true }).motivo, MOTIVOS.manual);
  });

  test("pero en cuanto se valida una vez, deja de aparecer para siempre", () => {
    // No es un segundo sistema de aprobación: se aprovecha la validación que ya existía.
    const evs = [ev(1, "entrada", 958), ev(2, "salida", 1444, { origen: "manual" })];
    const firma = firmaDeEventos(evs);
    const c = clasificarJornada({
      jornada: jornadaDe(evs), eventos: evs, diaCerrado: true,
      validacion: { minutos: 486, firma }, firmaActual: firma,
    });
    assert.equal(c.estado, VALIDADA);
  });

  test("el detector mira origen y anulación, no el texto del motivo", () => {
    assert.equal(tieneCorreccionAMano([{ origen: "kiosco" }]), false);
    assert.equal(tieneCorreccionAMano([{ origen: "kiosco_offline" }]), false, "la tablet sin cobertura no es una corrección");
    assert.equal(tieneCorreccionAMano([{ origen: "manual" }]), true);
    assert.equal(tieneCorreccionAMano([{ origen: "kiosco", anulado: true }]), true);
  });
});

describe("las que todavía no toca validar", () => {
  test("mientras el día corre, la jornada está abierta", () => {
    const evs = [ev(1, "entrada", 960)];
    const c = clasificarJornada({ jornada: jornadaDe(evs, PLAN, { diaCerrado: false }), eventos: evs, diaCerrado: false });
    assert.equal(c.estado, ABIERTA);
    assert.equal(c.puedeLote, false);
  });

  test("una jornada limpia de hoy tampoco se valida todavía", () => {
    const c = clasificarJornada({ jornada: jornadaDe(FICHADO_LIMPIO, PLAN, { diaCerrado: false }), eventos: FICHADO_LIMPIO, diaCerrado: false });
    assert.equal(c.estado, ABIERTA);
  });
});

describe("las que ya tienen una decisión detrás", () => {
  const firma = firmaDeEventos(FICHADO_LIMPIO);

  test("validada y con la firma intacta se queda quieta", () => {
    const c = clasificarJornada({
      jornada: jornadaDe(FICHADO_LIMPIO), eventos: FICHADO_LIMPIO, diaCerrado: true,
      validacion: { minutos: 486, firma }, firmaActual: firma,
    });
    assert.equal(c.estado, VALIDADA);
    assert.equal(c.puedeLote, false, "no se vuelve a validar ni se genera otro movimiento");
  });

  test("si después cambió el registro, la validación CADUCA y vuelve a revisión", () => {
    const conMas = [...FICHADO_LIMPIO, ev(3, "salida", 1500)];
    const c = clasificarJornada({
      jornada: jornadaDe(conMas), eventos: conMas, diaCerrado: true,
      validacion: { minutos: 486, firma }, firmaActual: firmaDeEventos(conMas),
    });
    assert.equal(c.estado, CADUCADA);
    assert.equal(c.puedeLote, false);
    assert.equal(c.motivo, MOTIVOS.caducada);
  });

  test("una caducada NO se cuela en el lote por estar limpia", () => {
    // Es el error que más caro saldría: dar por buenas otra vez unas horas que ya no son las
    // que alguien miró.
    const c = clasificarJornada({
      jornada: jornadaDe(FICHADO_LIMPIO), eventos: FICHADO_LIMPIO, diaCerrado: true,
      validacion: { minutos: 486, firma: "otra" }, firmaActual: firma,
    });
    assert.equal(c.puedeLote, false);
  });
});

describe("el periodo cerrado", () => {
  test("una jornada limpia de un mes cerrado NO se valida", () => {
    const c = clasificarJornada({
      jornada: jornadaDe(FICHADO_LIMPIO), eventos: FICHADO_LIMPIO, diaCerrado: true, periodoCerrado: true,
    });
    assert.equal(c.estado, LISTA, "está limpia, eso no cambia");
    assert.equal(c.puedeLote, false, "pero no se toca");
    assert.equal(c.motivo, MOTIVOS.periodo_cerrado);
  });
  test("y no se cuenta en el botón", () => {
    const r = resumirRevision([{ estado: LISTA, puedeLote: false, minEfectivo: 480 }]);
    assert.equal(r.listas_para_validar, 0);
    assert.equal(r.bloqueadas_por_cierre, 1);
    assert.equal(r.minutos_a_validar, 0);
  });
});

describe("qué sale en la lista", () => {
  test("un día sin turno y sin fichajes no es una jornada", () => {
    // Si entraran, un mes de doce personas serían trescientas setenta filas vacías.
    assert.equal(mereceSalir(jornadaDe([], [])), false);
  });
  test("pero uno con turno sí, aunque no fichara", () => {
    assert.equal(mereceSalir(jornadaDe([])), true);
  });
  test("y uno con fichajes sin turno también", () => {
    assert.equal(mereceSalir(jornadaDe(FICHADO_LIMPIO, [])), true);
  });
  test("una ya validada sale siempre, para poder verla", () => {
    assert.equal(mereceSalir(jornadaDe([], []), { validacion: { minutos: 0 } }), true);
  });
});

describe("el resumen y el lote salen de la MISMA clasificación", () => {
  const filas = [
    { estado: LISTA, puedeLote: true, minEfectivo: 480 },
    { estado: LISTA, puedeLote: true, minEfectivo: 300 },
    { estado: LISTA, puedeLote: false, minEfectivo: 480 },
    { estado: REVISION, puedeLote: false },
    { estado: ABIERTA, puedeLote: false },
    { estado: VALIDADA, puedeLote: false },
    { estado: CADUCADA, puedeLote: false },
  ];
  test("cuenta cada cosa en su sitio", () => {
    const r = resumirRevision(filas);
    assert.deepEqual(
      { l: r.listas_para_validar, b: r.bloqueadas_por_cierre, rv: r.requieren_revision, a: r.abiertas, v: r.validadas, c: r.caducadas },
      { l: 2, b: 1, rv: 1, a: 1, v: 1, c: 1 });
    assert.equal(r.minutos_a_validar, 780);
  });
  test("el botón y la lista de candidatas dicen el mismo número", () => {
    // Si divergieran, el botón prometería validar N y validaría otra cosa.
    assert.equal(candidatasDeLote(filas).length, resumirRevision(filas).listas_para_validar);
  });
});
