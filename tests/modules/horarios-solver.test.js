import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generarSemana, construirHuecos, motivoDescarte, ORIGEN, AJUSTES } from "../../src/modules/horarios/solver.js";
import { detectarConflictos, BLOQUEA } from "../../src/modules/horarios/conflictos.js";

const LUNES = "2026-08-03";   // lunes de verdad
const AREAS = [{ id: 1, nombre: "SALA" }, { id: 2, nombre: "COCINA" }];
const TRAMOS = [
  { id: 10, nombre: "MAÑANA", inicio_min: 660, fin_min: 960 },    // 11:00–16:00
  { id: 20, nombre: "TARDE", inicio_min: 1200, fin_min: 1560 },   // 20:00–02:00
];
const gente = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: i + 1, nombre: `Persona ${i + 1}`, ...extra }));
const contratos = (ids, horas) => ids.map((id) => ({ worker_id: id, desde: "2020-01-01", hasta: null, horas_semana: horas }));
// Una necesidad para cada día de la semana.
const nec = (area_id, tramo_id, minimo, objetivo = null) =>
  [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ local: "X", area_id, tramo_id, dow, minimo, objetivo }));

describe("solver — los huecos", () => {
  test("una necesidad de 2 son DOS huecos, no uno de tamaño 2", () => {
    const h = construirHuecos({ lunes: LUNES, tramos: TRAMOS, necesidades: [{ area_id: 1, tramo_id: 10, dow: 0, minimo: 2 }] });
    assert.equal(h.length, 2);
    assert.ok(h.every((x) => x.obligatorio), "los dos son mínimo");
  });

  test("el objetivo por encima del mínimo son huecos DESEABLES, no obligatorios", () => {
    const h = construirHuecos({ lunes: LUNES, tramos: TRAMOS, necesidades: [{ area_id: 1, tramo_id: 10, dow: 0, minimo: 1, objetivo: 3 }] });
    assert.deepEqual(h.map((x) => x.obligatorio), [true, false, false]);
  });

  test("una necesidad con vigencia no cuenta fuera de su rango", () => {
    const base = { area_id: 1, tramo_id: 10, dow: 0, minimo: 1 };
    assert.equal(construirHuecos({ lunes: LUNES, tramos: TRAMOS, necesidades: [{ ...base, desde: "2026-09-01" }] }).length, 0);
    assert.equal(construirHuecos({ lunes: LUNES, tramos: TRAMOS, necesidades: [{ ...base, hasta: "2026-07-01" }] }).length, 0);
    assert.equal(construirHuecos({ lunes: LUNES, tramos: TRAMOS, necesidades: [{ ...base, desde: "2026-01-01", hasta: "2026-12-31" }] }).length, 1);
  });

  test("una necesidad de un tramo borrado se ignora, no revienta", () => {
    assert.equal(construirHuecos({ lunes: LUNES, tramos: TRAMOS, necesidades: [{ area_id: 1, tramo_id: 999, dow: 0, minimo: 1 }] }).length, 0);
  });
});

describe("solver — a quién se descarta y por qué", () => {
  const hueco = { dia: "2026-08-08", dow: 5, area_id: 1, tramo_id: 20, inicio_min: 1200, fin_min: 1560 };
  const ctx = (extra = {}) => ({ asignadas: new Map(), ausencias: [], contratos: [], disponibilidad: [], ajustes: {}, ...extra });

  test("sin nada en contra, no hay descarte", () => {
    assert.equal(motivoDescarte({ id: 1 }, hueco, ctx()), null);
  });

  test("de vacaciones, no", () => {
    const r = motivoDescarte({ id: 1 }, hueco, ctx({
      ausencias: [{ worker_id: 1, tipo: "vacaciones", desde: "2026-08-01", hasta: "2026-08-15", estado: "aprobada" }] }));
    assert.equal(r.motivo, "ausencia");
    assert.equal(r.detalle, "vacaciones");
  });

  test("una ausencia PENDIENTE de aprobar no bloquea", () => {
    assert.equal(motivoDescarte({ id: 1 }, hueco, ctx({
      ausencias: [{ worker_id: 1, tipo: "permiso", desde: "2026-08-08", hasta: "2026-08-08", estado: "pendiente" }],
    })), null);
  });

  test("quien ha dicho que ese día no puede, no", () => {
    assert.equal(motivoDescarte({ id: 1 }, hueco, ctx({
      disponibilidad: [{ worker_id: 1, dow: 5, inicio_min: 1080, fin_min: 1440, preferencia: "no_disponible" }] })).motivo,
      "no_disponible");
  });

  test("no disponible en OTRA franja del mismo día no estorba", () => {
    assert.equal(motivoDescarte({ id: 1 }, hueco, ctx({
      disponibilidad: [{ worker_id: 1, dow: 5, inicio_min: 600, fin_min: 900, preferencia: "no_disponible" }],
    })), null);
  });

  test("no se puede estar en dos sitios a la vez", () => {
    const asignadas = new Map([["1", [{ dia: "2026-08-08", inicio_min: 1200, fin_min: 1560 }]]]);
    assert.equal(motivoDescarte({ id: 1 }, hueco, ctx({ asignadas })).motivo, "solape");
  });

  test("EL CIERRE DEL VIERNES CHOCA CON LA MAÑANA DEL SÁBADO", () => {
    // Viernes 20:00→02:00 (fin_min 1560) y sábado 11:00: son 9 horas de descanso, no 12.
    const asignadas = new Map([["1", [{ dia: "2026-08-07", inicio_min: 1200, fin_min: 1560 }]]]);
    const manana = { dia: "2026-08-08", dow: 5, area_id: 1, tramo_id: 10, inicio_min: 660, fin_min: 960 };
    const r = motivoDescarte({ id: 1 }, manana, ctx({ asignadas }));
    assert.equal(r.motivo, "descanso");
    assert.equal(r.detalle, 9);
  });

  test("y al revés: poner la mañana antes no lo esconde", () => {
    const asignadas = new Map([["1", [{ dia: "2026-08-08", inicio_min: 660, fin_min: 960 }]]]);
    const nocheAntes = { dia: "2026-08-07", dow: 4, area_id: 1, tramo_id: 20, inicio_min: 1200, fin_min: 1560 };
    assert.equal(motivoDescarte({ id: 1 }, nocheAntes, ctx({ asignadas })).motivo, "descanso");
  });

  test("un turno partido el MISMO día sí se permite: es lo normal en hostelería", () => {
    const asignadas = new Map([["1", [{ dia: "2026-08-08", inicio_min: 660, fin_min: 900 }]]]);
    const noche = { dia: "2026-08-08", dow: 5, area_id: 1, tramo_id: 20, inicio_min: 1200, fin_min: 1500 };
    assert.equal(motivoDescarte({ id: 1 }, noche, ctx({ asignadas })), null);
  });

  test("siete días seguidos, no", () => {
    const dias = ["08-02", "08-03", "08-04", "08-05", "08-06", "08-07"].map((d) => ({ dia: "2026-" + d, inicio_min: 660, fin_min: 900 }));
    assert.equal(motivoDescarte({ id: 1 }, { ...hueco, inicio_min: 660, fin_min: 900 },
      ctx({ asignadas: new Map([["1", dias]]) })).motivo, "dias_seguidos");
  });

  test("no se pasa del contrato más allá del margen", () => {
    const asignadas = new Map([["1", [{ dia: "2026-08-04", inicio_min: 0, fin_min: 1140 }]]]);   // 19 h
    assert.equal(motivoDescarte({ id: 1 }, hueco, ctx({ asignadas, contratos: contratos([1], 20) })).motivo, "excede_contrato");
  });

  test("sin contrato registrado no se limita por horas: no se inventa uno", () => {
    const asignadas = new Map([["1", [{ dia: "2026-08-04", inicio_min: 0, fin_min: 1400 }]]]);
    assert.equal(motivoDescarte({ id: 1 }, hueco, ctx({ asignadas })), null);
  });
});

describe("solver — genera un cuadrante que se sostiene", () => {
  const base = {
    lunes: LUNES, areas: AREAS, tramos: TRAMOS,
    trabajadores: gente(8),
    contratos: contratos([1, 2, 3, 4, 5, 6, 7, 8], 30),
    necesidades: [...nec(1, 10, 2), ...nec(1, 20, 2), ...nec(2, 10, 1), ...nec(2, 20, 1)],
  };

  test("cubre todos los mínimos cuando hay gente de sobra", () => {
    const r = generarSemana(base);
    assert.equal(r.resumen.sinCubrirObligatorios, 0, JSON.stringify(r.sinCubrir.slice(0, 3)));
    assert.equal(r.asignaciones.length, 42, "6 personas × 7 días");
    assert.ok(r.asignaciones.every((a) => a.origen === ORIGEN));
  });

  test("EL RESULTADO NO TIENE NI UN CONFLICTO QUE BLOQUEE", () => {
    // La prueba de fuego: lo que genera se pasa por el MISMO detector que valida lo que
    // hace una persona a mano. Si el generador produjera algo impublicable, no serviría.
    const r = generarSemana(base);
    const conf = detectarConflictos({
      lunes: LUNES, asignaciones: r.asignaciones, trabajadores: base.trabajadores,
      contratos: base.contratos, tramos: TRAMOS, areas: AREAS,
    });
    assert.deepEqual(conf.filter((c) => c.nivel === BLOQUEA), []);
  });

  test("ES DETERMINISTA: los mismos datos dan el mismo cuadrante", () => {
    const a = generarSemana(base), b = generarSemana(base);
    assert.deepEqual(a.asignaciones, b.asignaciones);
  });

  test("y no depende del orden en que lleguen las filas de la base", () => {
    const revuelto = {
      ...base,
      necesidades: [...base.necesidades].reverse(),
      trabajadores: [...base.trabajadores].reverse(),
    };
    assert.deepEqual(generarSemana(revuelto).asignaciones, generarSemana(base).asignaciones);
  });

  test("REPARTE POR CONTRATO: nadie se queda muy corto habiendo trabajo", () => {
    const r = generarSemana({ ...base, trabajadores: gente(7), contratos: contratos([1, 2, 3, 4, 5, 6, 7], 24) });
    const min = Math.min(...r.resumen.personas.map((p) => p.minutos));
    const max = Math.max(...r.resumen.personas.map((p) => p.minutos));
    assert.ok(max - min <= 300, `entre el que más y el que menos hay ${(max - min) / 60} h`);
  });

  test("respeta a quien no puede los sábados", () => {
    const r = generarSemana({
      ...base,
      disponibilidad: [{ worker_id: 1, dow: 5, inicio_min: 0, fin_min: 1560, preferencia: "no_disponible" }],
    });
    assert.equal(r.asignaciones.filter((a) => a.worker_id === 1 && a.dia === "2026-08-08").length, 0);
  });

  test("no pone a nadie de vacaciones a trabajar", () => {
    const r = generarSemana({
      ...base,
      ausencias: [{ worker_id: 2, tipo: "vacaciones", desde: "2026-08-03", hasta: "2026-08-09", estado: "aprobada" }],
    });
    assert.equal(r.asignaciones.filter((a) => a.worker_id === 2).length, 0);
  });

  test("quien lo ha pedido entra antes, a igualdad de todo lo demás", () => {
    const r = generarSemana({
      ...base, trabajadores: gente(8),
      disponibilidad: [{ worker_id: 8, dow: 5, inicio_min: 1200, fin_min: 1560, preferencia: "prefiere" }],
    });
    const suyos = r.asignaciones.filter((a) => a.worker_id === 8 && a.dia === "2026-08-08" && a.inicio_min === 1200);
    assert.equal(suyos.length, 1);
    assert.match(suyos[0].porque, /pedido/);
  });
});

describe("solver — cuando NO cabe, lo dice", () => {
  test("con media plantilla de vacaciones deja huecos y EXPLICA por qué", () => {
    const r = generarSemana({
      lunes: LUNES, areas: AREAS, tramos: TRAMOS,
      trabajadores: gente(4),
      contratos: contratos([1, 2, 3, 4], 40),
      necesidades: [...nec(1, 10, 2), ...nec(1, 20, 2)],
      ausencias: [1, 2].map((id) => ({ worker_id: id, tipo: "vacaciones", desde: LUNES, hasta: "2026-08-09", estado: "aprobada" })),
    });
    assert.ok(r.resumen.sinCubrirObligatorios > 0, "no se rellena con quien sea");
    const motivos = new Set(r.sinCubrir.flatMap((s) => s.porque.map((p) => p.motivo)));
    assert.ok(motivos.has("ausencia"), "se dice que están de vacaciones");
    // Y con nombres, que es lo que permite arreglarlo
    const conNombres = r.sinCubrir[0].porque.find((p) => p.motivo === "ausencia");
    assert.ok(conNombres.quienes.length >= 1);
  });

  test("los huecos obligatorios sin cubrir salen los primeros", () => {
    const r = generarSemana({
      lunes: LUNES, areas: AREAS, tramos: TRAMOS,
      trabajadores: gente(1), contratos: contratos([1], 40),
      necesidades: [...nec(1, 10, 1, 3)],
    });
    assert.equal(r.sinCubrir[0].obligatorio, true);
  });

  test("SIN NADIE no revienta: devuelve todo sin cubrir y un resumen honesto", () => {
    const r = generarSemana({ lunes: LUNES, areas: AREAS, tramos: TRAMOS, trabajadores: [], necesidades: nec(1, 10, 2) });
    assert.equal(r.asignaciones.length, 0);
    assert.equal(r.sinCubrir.length, 14);
    assert.equal(r.resumen.cubiertos, 0);
  });

  test("sin necesidades definidas no se inventa un cuadrante", () => {
    const r = generarSemana({ lunes: LUNES, areas: AREAS, tramos: TRAMOS, trabajadores: gente(5), necesidades: [] });
    assert.deepEqual(r.asignaciones, []);
    assert.deepEqual(r.sinCubrir, []);
  });

  test("el resumen señala con nombre a quien se queda corto de horas", () => {
    const r = generarSemana({
      lunes: LUNES, areas: AREAS, tramos: TRAMOS,
      trabajadores: gente(6), contratos: contratos([1, 2, 3, 4, 5, 6], 40),
      necesidades: nec(1, 10, 1),   // solo 7 turnos de 5 h para 6 personas de 40 h
    });
    assert.ok(r.resumen.cortos.length >= 5);
    assert.ok(r.resumen.cortos.every((p) => p.nombre && p.desviacion < 0));
  });
});

describe("solver — la cuenta de la vieja: ¿hay gente para lo que se pide?", () => {
  const base = {
    lunes: LUNES, areas: AREAS, tramos: TRAMOS,
    trabajadores: gente(4), contratos: contratos([1, 2, 3, 4], 20),   // 80 h de plantilla
  };

  test("cuando los mínimos NO caben en las horas contratadas, lo dice sin rodeos", () => {
    // 7 días × 2 personas × 5 h = 70 h de sala + 7 × 6 h de tarde = 112 h contra 80.
    const r = generarSemana({ ...base, necesidades: [...nec(1, 10, 2), ...nec(1, 20, 1)] });
    assert.equal(r.resumen.capacidad.faltaGente, true);
    assert.match(r.resumen.capacidad.mensaje, /faltan \d+ h de plantilla/);
    assert.ok(r.resumen.capacidad.horasMinimas > r.resumen.capacidad.horasDisponibles);
  });

  test("cuando sí caben, no se acusa a nadie de falta de plantilla", () => {
    const r = generarSemana({ ...base, necesidades: nec(1, 10, 1) });   // 35 h contra 80
    assert.equal(r.resumen.capacidad.faltaGente, false);
    assert.equal(r.resumen.capacidad.mensaje, null);
  });

  test("LAS VACACIONES DESCUENTAN A PRORRATA, no entero ni nada", () => {
    const conVacas = generarSemana({
      ...base, necesidades: nec(1, 10, 1),
      // De lunes a miércoles: 3 de 7 días fuera → aporta 4/7 de sus 20 h.
      ausencias: [{ worker_id: 1, tipo: "vacaciones", desde: LUNES, hasta: "2026-08-05", estado: "aprobada" }],
    });
    const sinVacas = generarSemana({ ...base, necesidades: nec(1, 10, 1) });
    const perdidas = sinVacas.resumen.capacidad.horasDisponibles - conVacas.resumen.capacidad.horasDisponibles;
    assert.ok(Math.abs(perdidas - 20 * 3 / 7) < 0.2, `descuenta ${perdidas} h y deberían ser ${(20 * 3 / 7).toFixed(1)}`);
  });

  test("sin contratos registrados no se inventa una capacidad", () => {
    const r = generarSemana({ lunes: LUNES, areas: AREAS, tramos: TRAMOS, trabajadores: gente(4), necesidades: nec(1, 10, 1) });
    assert.equal(r.resumen.capacidad.horasDisponibles, 0);
  });
});

describe("solver — el primer hueco que se resuelve es el más difícil", () => {
  test("el sábado noche se cubre aunque los candidatos escaseen", () => {
    // Cuatro personas; tres no pueden el sábado por la noche. Si el generador fuera en
    // orden de calendario, colocaría a la única disponible el lunes y el sábado quedaría
    // vacío. Al ir por dificultad, el sábado se cubre.
    const r = generarSemana({
      lunes: LUNES, areas: AREAS, tramos: TRAMOS,
      trabajadores: gente(4), contratos: contratos([1, 2, 3, 4], 40),
      necesidades: [...nec(1, 10, 1), ...nec(1, 20, 1)],
      disponibilidad: [1, 2, 3].map((id) => ({ worker_id: id, dow: 5, inicio_min: 1200, fin_min: 1560, preferencia: "no_disponible" })),
    });
    const sabadoNoche = r.asignaciones.filter((a) => a.dia === "2026-08-08" && a.inicio_min === 1200);
    assert.equal(sabadoNoche.length, 1, "el hueco difícil está cubierto");
    assert.equal(sabadoNoche[0].worker_id, 4);
  });
});
