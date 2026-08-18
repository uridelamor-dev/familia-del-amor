import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generarSemana, construirHuecos, colocaciones, motivoDescarte, ORIGEN, AJUSTES, PASO_REFUERZO } from "../../src/modules/horarios/solver.js";
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

// ── Los turnos que se hacen DE VERDAD en la casa ────────────────────────────
// Dos turnos completos de 8 h (08-16 y 16-00) y refuerzos de 4 h con hora variable: uno
// puede ser de 10 a 14 y otro de 11 a 15, o por la tarde de 19 a 23 o de 20 a 00. La
// primera versión de este módulo ataba las necesidades a franjas fijas y esos refuerzos
// —que son media plantilla en fin de semana— no cabían en el modelo.
const T_REAL = [
  { id: 10, nombre: "MAÑANA", inicio_min: 480, fin_min: 960 },    // 08:00–16:00
  { id: 20, nombre: "TARDE", inicio_min: 960, fin_min: 1440 },    // 16:00–00:00
];
const refuerzo = (dow, minimo, { duracion = 240, desde, hasta, etiqueta, area_id = 1, objetivo = null } = {}) =>
  ({ area_id, tramo_id: null, dow, minimo, objetivo, duracion_min: duracion,
     ventana_inicio_min: desde, ventana_fin_min: hasta, etiqueta });

describe("solver — refuerzos de 4 h con hora variable", () => {
  test("un turno completo tiene UNA colocación; un refuerzo, todas las que quepan", () => {
    const [fijo] = construirHuecos({ lunes: LUNES, tramos: T_REAL, necesidades: [{ area_id: 1, tramo_id: 10, dow: 0, minimo: 1 }] });
    assert.deepEqual(colocaciones(fijo), [{ inicio_min: 480, fin_min: 960 }]);

    // Refuerzo de 4 h entre las 09:00 y las 16:00 → de 09-13 hasta 12-16.
    const [ref] = construirHuecos({ lunes: LUNES, tramos: T_REAL, necesidades: [refuerzo(0, 1, { desde: 540, hasta: 960 })] });
    const c = colocaciones(ref);
    assert.equal(c[0].inicio_min, 540);
    assert.equal(c[c.length - 1].fin_min, 960, "la última colocación llega justo al final de la ventana");
    assert.ok(c.every((x) => x.fin_min - x.inicio_min === 240), "todas duran lo que se pidió");
    assert.ok(c.every((x) => x.inicio_min >= 540 && x.fin_min <= 960), "y ninguna se sale de la ventana");
  });

  test("LA VENTANA DE TARDE LLEGA HASTA MEDIANOCHE: cabe el 20-00", () => {
    // Con paso de 30 min desde las 18:00, 20:00 cae justo; pero si la ventana no fuese
    // múltiplo del paso, el último trozo tiene que pegarse igualmente al final.
    const [ref] = construirHuecos({ lunes: LUNES, tramos: T_REAL, necesidades: [refuerzo(0, 1, { desde: 1130, hasta: 1440 })] });
    const c = colocaciones(ref);
    assert.equal(c[c.length - 1].inicio_min, 1200);
    assert.equal(c[c.length - 1].fin_min, 1440, "acaba a las 00:00 en punto");
  });

  test("una ventana más corta que la duración no genera un hueco imposible", () => {
    assert.deepEqual(construirHuecos({ lunes: LUNES, tramos: T_REAL, necesidades: [refuerzo(0, 1, { desde: 600, hasta: 700 })] }), []);
  });

  test("un refuerzo sin ventana tampoco: no se inventa una", () => {
    assert.deepEqual(construirHuecos({ lunes: LUNES, tramos: T_REAL, necesidades: [refuerzo(0, 1, {})] }), []);
  });

  test("EL GENERADOR ELIGE LA HORA, no solo la persona", () => {
    // Una persona que no puede antes de las 11: el refuerzo tiene que colocarse a las 11,
    // no descartarla porque la primera colocación posible fuera a las 09.
    const r = generarSemana({
      lunes: LUNES, areas: AREAS, tramos: T_REAL,
      trabajadores: gente(1), contratos: contratos([1], 40),
      necesidades: [refuerzo(0, 1, { desde: 540, hasta: 960 })],
      disponibilidad: [{ worker_id: 1, dow: 0, inicio_min: 0, fin_min: 660, preferencia: "no_disponible" }],
    });
    assert.equal(r.asignaciones.length, 1, "no se queda sin cubrir");
    assert.equal(r.asignaciones[0].inicio_min, 660, "lo coloca a las 11:00");
    assert.equal(r.asignaciones[0].fin_min, 900, "y acaba a las 15:00");
    assert.equal(r.asignaciones[0].refuerzo, true);
  });

  test("dos refuerzos el mismo día pueden salir a HORAS DISTINTAS", () => {
    const r = generarSemana({
      lunes: LUNES, areas: AREAS, tramos: T_REAL,
      trabajadores: gente(2), contratos: contratos([1, 2], 40),
      necesidades: [refuerzo(0, 2, { desde: 540, hasta: 960 })],
      // A la 2 no le va bien antes de las 11; a la 1 le da igual.
      disponibilidad: [{ worker_id: 2, dow: 0, inicio_min: 0, fin_min: 660, preferencia: "no_disponible" }],
    });
    assert.equal(r.asignaciones.length, 2);
    const horas = r.asignaciones.map((a) => a.inicio_min).sort((a, b) => a - b);
    assert.ok(horas[1] >= 660, "el de la persona que no puede pronto se va más tarde");
  });

  test("un refuerzo respeta el descanso igual que un turno completo", () => {
    // Cierra el domingo a las 00:00 y el lunes hay refuerzo de mañana: no llegan 12 h.
    const r = generarSemana({
      lunes: LUNES, areas: AREAS, tramos: T_REAL,
      trabajadores: gente(1), contratos: contratos([1], 40),
      necesidades: [
        { area_id: 1, tramo_id: 20, dow: 0, minimo: 1 },              // lunes 16-00
        refuerzo(1, 1, { desde: 480, hasta: 720 }),                   // martes, mañana temprano
      ],
    });
    // El de la mañana del martes no puede ser esa misma persona antes de las 12:00.
    const martes = r.asignaciones.filter((a) => a.dia === "2026-08-04");
    assert.equal(martes.length, 0, "no cabe nadie, y se dice");
    assert.equal(r.sinCubrir.find((s) => s.dia === "2026-08-04").porque[0].motivo, "descanso");
  });

  test("SEMANA REALISTA: dos turnos de 8 h más refuerzos de 4 h el fin de semana", () => {
    const necesidades = [];
    for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
      necesidades.push({ area_id: 1, tramo_id: 10, dow, minimo: 2 });   // sala mañana
      necesidades.push({ area_id: 1, tramo_id: 20, dow, minimo: 2 });   // sala tarde
      necesidades.push({ area_id: 2, tramo_id: 10, dow, minimo: 1 });   // cocina mañana
      necesidades.push({ area_id: 2, tramo_id: 20, dow, minimo: 1 });   // cocina tarde
      if (dow >= 4) {                                                    // vie/sáb/dom
        necesidades.push(refuerzo(dow, 1, { desde: 540, hasta: 960, etiqueta: "Refuerzo mañana" }));
        necesidades.push(refuerzo(dow, 1, { desde: 1080, hasta: 1440, etiqueta: "Refuerzo tarde" }));
      }
    }
    const r = generarSemana({
      lunes: LUNES, areas: AREAS, tramos: T_REAL,
      trabajadores: gente(14), contratos: contratos([1,2,3,4,5,6,7,8,9,10,11,12,13,14], 32),
      necesidades,
    });
    assert.equal(r.resumen.sinCubrirObligatorios, 0, JSON.stringify(r.sinCubrir.slice(0, 3)));

    const refuerzos = r.asignaciones.filter((a) => a.refuerzo);
    assert.equal(refuerzos.length, 6, "dos refuerzos cada uno de los tres días fuertes");
    assert.ok(refuerzos.every((a) => a.fin_min - a.inicio_min === 240), "todos de 4 h");

    // Y lo que de verdad importa: lo generado no tiene ni un conflicto que bloquee.
    const conf = detectarConflictos({
      lunes: LUNES, asignaciones: r.asignaciones, trabajadores: gente(14),
      contratos: contratos([1,2,3,4,5,6,7,8,9,10,11,12,13,14], 32), tramos: T_REAL, areas: AREAS,
    });
    assert.deepEqual(conf.filter((c) => c.nivel === BLOQUEA), []);
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

// ── Ausencias y disponibilidad: qué respeta el generador ─────────────────────
// Estos tests no cambian el solver: comprueban que consume de verdad lo que la Fase 2 le
// empieza a dar de comer, y que distingue una ausencia (restricción real) de una preferencia.
describe("qué respeta el generador de las ausencias y la disponibilidad", () => {
  const LUNES = "2026-08-17";
  const EQUIPO = [{ id: 1, nombre: "Ana" }, { id: 2, nombre: "Beto" }];
  const AREAS = [{ id: 10, nombre: "SALA", orden: 1 }];
  const TRAMOS = [{ id: 20, nombre: "TARDE", orden: 1, inicio_min: 960, fin_min: 1440 }];
  // Una sola plaza el lunes: así se ve exactamente a quién elige.
  const NECESIDADES = [{ area_id: 10, tramo_id: 20, dow: 0, minimo: 1, objetivo: 1 }];
  const CONTRATOS = [
    { worker_id: 1, desde: "2020-01-01", hasta: null, horas_semana: 40 },
    { worker_id: 2, desde: "2020-01-01", hasta: null, horas_semana: 40 },
  ];
  const generar = (extra) => generarSemana({
    lunes: LUNES, trabajadores: EQUIPO, areas: AREAS, tramos: TRAMOS,
    necesidades: NECESIDADES, contratos: CONTRATOS, ...extra });

  test("una ausencia APROBADA impide asignar", () => {
    const r = generar({ ausencias: [{ worker_id: 1, tipo: "vacaciones", desde: LUNES, hasta: "2026-08-21", estado: "aprobada" }] });
    assert.equal(r.asignaciones.length, 1);
    assert.equal(r.asignaciones[0].worker_id, 2, "le toca al otro");
  });

  test("una PENDIENTE no impide nada: todavía no se la han concedido a nadie", () => {
    // Es la diferencia que sostiene todo el circuito. Si una solicitud bloqueara, pedir
    // vacaciones sería concedérselas.
    const r = generar({ ausencias: [{ worker_id: 1, tipo: "vacaciones", desde: LUNES, hasta: "2026-08-21", estado: "pendiente" }] });
    assert.equal(r.asignaciones.length, 1);
    assert.equal(r.asignaciones[0].worker_id, 1, "sigue siendo la primera candidata");
  });

  test("una RECHAZADA tampoco", () => {
    const r = generar({ ausencias: [{ worker_id: 1, tipo: "vacaciones", desde: LUNES, hasta: "2026-08-21", estado: "rechazada" }] });
    assert.equal(r.asignaciones[0].worker_id, 1);
  });

  test("y una CANCELADA tampoco", () => {
    const r = generar({ ausencias: [{ worker_id: 1, tipo: "vacaciones", desde: LUNES, hasta: "2026-08-21", estado: "cancelada" }] });
    assert.equal(r.asignaciones[0].worker_id, 1);
  });

  test("cuando no hay nadie porque están todos de vacaciones, lo DICE con nombres", () => {
    const r = generar({ ausencias: [
      { worker_id: 1, tipo: "vacaciones", desde: LUNES, hasta: "2026-08-21", estado: "aprobada" },
      { worker_id: 2, tipo: "baja", desde: LUNES, hasta: "2026-08-21", estado: "aprobada" },
    ] });
    assert.equal(r.asignaciones.length, 0);
    assert.equal(r.sinCubrir.length, 1);
    const porque = r.sinCubrir[0].porque.find((p) => p.motivo === "ausencia");
    assert.equal(porque.n, 2);
    assert.deepEqual(porque.quienes.sort(), ["Ana", "Beto"]);
  });

  test("«no disponible» esa franja también impide asignar", () => {
    const r = generar({ disponibilidad: [
      { worker_id: 1, dow: 0, inicio_min: 960, fin_min: 1440, preferencia: "no_disponible" },
    ] });
    assert.equal(r.asignaciones[0].worker_id, 2);
  });

  test("pero solo en la franja que se pisa con el turno", () => {
    // «Los lunes no puedo antes de las 16:00» no impide un turno de tarde.
    const r = generar({ disponibilidad: [
      { worker_id: 1, dow: 0, inicio_min: 0, fin_min: 960, preferencia: "no_disponible" },
    ] });
    assert.equal(r.asignaciones[0].worker_id, 1, "el turno empieza justo a las 16:00: no se pisan");
  });

  test("y solo ese día de la semana", () => {
    const r = generar({ disponibilidad: [
      { worker_id: 1, dow: 3, inicio_min: 960, fin_min: 1440, preferencia: "no_disponible" },
    ] });
    assert.equal(r.asignaciones[0].worker_id, 1);
  });

  test("«prefiere» NO prohíbe: es una preferencia y desempata a favor", () => {
    // Con las dos igual de libres, gana quien lo ha pedido. Pero si fuera una prohibición,
    // marcar «prefiero trabajar los lunes» acabaría dejando sin cubrir el lunes.
    const r = generar({ disponibilidad: [
      { worker_id: 2, dow: 0, inicio_min: 960, fin_min: 1440, preferencia: "prefiere" },
    ] });
    assert.equal(r.asignaciones[0].worker_id, 2);
    assert.match(r.asignaciones[0].porque, /lo había pedido/);
  });

  test("y si el que lo prefiere no puede, se asigna igual al otro", () => {
    const r = generar({
      disponibilidad: [{ worker_id: 2, dow: 0, inicio_min: 960, fin_min: 1440, preferencia: "prefiere" }],
      ausencias: [{ worker_id: 2, tipo: "baja", desde: LUNES, hasta: LUNES, estado: "aprobada" }],
    });
    assert.equal(r.asignaciones[0].worker_id, 1, "una preferencia no deja un turno sin cubrir");
  });

  test("la ausencia manda sobre la disponibilidad", () => {
    // Quien está de vacaciones no trabaja aunque haya declarado que prefiere ese día.
    const r = generar({
      disponibilidad: [{ worker_id: 1, dow: 0, inicio_min: 960, fin_min: 1440, preferencia: "prefiere" }],
      ausencias: [{ worker_id: 1, tipo: "vacaciones", desde: LUNES, hasta: LUNES, estado: "aprobada" }],
    });
    assert.equal(r.asignaciones[0].worker_id, 2);
  });

  test("las fechas de vigencia de una franja se respetan", () => {
    // `desde`/`hasta` en hor_disponibilidad permiten una excepción temporal. El modelo lo
    // soporta y el solver lo lee; la pantalla del trabajador todavía no las escribe.
    const fuera = generar({ disponibilidad: [
      { worker_id: 1, dow: 0, inicio_min: 960, fin_min: 1440, preferencia: "no_disponible",
        desde: "2026-09-01", hasta: "2026-09-30" },
    ] });
    assert.equal(fuera.asignaciones[0].worker_id, 1, "esa semana la franja no está vigente");
    const dentro = generar({ disponibilidad: [
      { worker_id: 1, dow: 0, inicio_min: 960, fin_min: 1440, preferencia: "no_disponible",
        desde: "2026-08-01", hasta: "2026-08-31" },
    ] });
    assert.equal(dentro.asignaciones[0].worker_id, 2, "dentro de su vigencia sí impide");
  });

  test("«disponible» explícito no cambia nada", () => {
    const r = generar({ disponibilidad: [
      { worker_id: 2, dow: 0, inicio_min: 960, fin_min: 1440, preferencia: "disponible" },
    ] });
    assert.equal(r.asignaciones[0].worker_id, 1, "sin preferencia declarada, manda el orden de siempre");
  });
});
