import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  tramosPlanificados, tramosFichados, emparejar, construirJornada, firmaDeEventos,
  REVISAR, INFORMA,
} from "../../src/modules/fichajes/jornadas.js";

// Un evento: el minuto local es lo que importa aquí (minutos desde las 00:00 del día
// de negocio, pudiendo pasar de 1440).
let _id = 0;
const ev = (tipo, min, extra = {}) => ({ id: ++_id, tipo, minuto_local: min, epoch_ms: min * 60000, ...extra });
const turno = (ini, fin, extra = {}) => ({ id: ini, tipo: "turno", inicio_min: ini, fin_min: fin, ...extra });
const tipos = (j) => j.incidencias.map((i) => i.tipo);

describe("jornadas — lo planificado", () => {
  test("solo cuentan los turnos: una libranza no son 0 minutos, es que no hay turno", () => {
    const t = tramosPlanificados([turno(720, 960), { id: 2, tipo: "libranza", inicio_min: 0, fin_min: 0 }]);
    assert.equal(t.length, 1);
  });
  test('el "20-cierre" se cierra con la hora de cierre del local', () => {
    const [t] = tramosPlanificados([turno(1200, 1200, { fin_abierto: true })], { horaCierreMin: 1560 });
    assert.equal(t.fin, 1560);
    assert.equal(t.abierto, true);
  });
  test("sin hora de cierre configurada se respeta lo guardado, no se inventa", () => {
    const [t] = tramosPlanificados([turno(1200, 1440, { fin_abierto: true })]);
    assert.equal(t.fin, 1440);
  });
});

describe("jornadas — lo fichado", () => {
  test("una entrada y una salida son un tramo", () => {
    assert.deepEqual(tramosFichados([ev("entrada", 720), ev("salida", 960)]),
      [{ inicio: 720, fin: 960, pausa: 0 }]);
  });
  test("LA PAUSA NO PARTE EL TRAMO: quien para a media tarde no ha hecho dos turnos", () => {
    const t = tramosFichados([ev("entrada", 720), ev("pausa_inicio", 800), ev("pausa_fin", 830), ev("salida", 960)]);
    assert.equal(t.length, 1);
    assert.equal(t[0].pausa, 30);
  });
  test("el turno partido sí son dos tramos", () => {
    const t = tramosFichados([ev("entrada", 660), ev("salida", 900), ev("entrada", 1200), ev("salida", 1560)]);
    assert.deepEqual(t.map((x) => [x.inicio, x.fin]), [[660, 900], [1200, 1560]]);
  });
  test("lo que quedó abierto o suelto viene marcado, no descartado", () => {
    assert.equal(tramosFichados([ev("entrada", 720)])[0].sinSalida, true);
    assert.equal(tramosFichados([ev("salida", 1560)])[0].sinEntrada, true);
  });
  test("los eventos anulados no cuentan", () => {
    const t = tramosFichados([ev("entrada", 720), ev("salida", 800, { anulado_por: 9 }), ev("salida", 960)]);
    assert.deepEqual(t, [{ inicio: 720, fin: 960, pausa: 0 }]);
  });
});

describe("jornadas — emparejar plan y reloj", () => {
  test("EL TURNO PARTIDO EMPAREJA POR SOLAPE, no por orden", () => {
    // Alguien ficha el segundo turno antes de que se cierre el primero (olvidó la salida
    // y el encargado la mete después): por orden saldría cruzado.
    const plan = [{ inicio: 660, fin: 900 }, { inicio: 1200, fin: 1560 }];
    const fic = [{ inicio: 1195, fin: 1570 }, { inicio: 655, fin: 905 }];
    const { parejas, planSinFichar, fichadoSinPlan } = emparejar(plan, fic);
    assert.equal(planSinFichar.length, 0);
    assert.equal(fichadoSinPlan.length, 0);
    for (const p of parejas) assert.ok(Math.abs(p.plan.inicio - p.fichado.inicio) < 20, "cada plan con SU fichaje");
  });

  test("un turno que nadie fichó queda sin pareja", () => {
    const r = emparejar([{ inicio: 660, fin: 900 }, { inicio: 1200, fin: 1560 }], [{ inicio: 655, fin: 905 }]);
    assert.equal(r.parejas.length, 1);
    assert.deepEqual(r.planSinFichar, [{ inicio: 1200, fin: 1560 }]);
  });

  test("un fichaje sin turno detrás también", () => {
    const r = emparejar([], [{ inicio: 1200, fin: 1560 }]);
    assert.equal(r.parejas.length, 0);
    assert.equal(r.fichadoSinPlan.length, 1);
  });

  test("dos fichajes contra un solo turno: se queda el que más solapa", () => {
    const r = emparejar([{ inicio: 1200, fin: 1560 }], [{ inicio: 1190, fin: 1250 }, { inicio: 1250, fin: 1560 }]);
    assert.equal(r.parejas.length, 1);
    assert.equal(r.parejas[0].fichado.inicio, 1250, "310 min de solape gana a 50");
    assert.equal(r.fichadoSinPlan.length, 1);
  });
});

describe("jornadas — la jornada entera", () => {
  const PLAN_TARDE = [turno(1200, 1560)];   // 20:00 → 02:00

  test("el turno clavado no genera ni una incidencia", () => {
    const j = construirJornada({
      asignaciones: PLAN_TARDE, diaCerrado: true,
      eventos: [ev("entrada", 1200), ev("salida", 1560)],
    });
    assert.deepEqual(j.incidencias, []);
    assert.equal(j.minPlanificado, 360);
    assert.equal(j.minFichado, 360);
    assert.equal(j.minDesviacion, 0);
    assert.equal(j.requiereRevision, false);
  });

  test("dentro de la tolerancia tampoco: cinco minutos no son una incidencia", () => {
    const j = construirJornada({
      asignaciones: PLAN_TARDE, toleranciaMin: 10, diaCerrado: true,
      eventos: [ev("entrada", 1205), ev("salida", 1553)],
    });
    assert.deepEqual(j.incidencias, []);
    assert.equal(j.minDesviacion, -12, "pero la desviación en minutos sí se cuenta");
  });

  test("media hora tarde y una hora de más al cierre sí se anotan, con los minutos", () => {
    const j = construirJornada({
      asignaciones: PLAN_TARDE, diaCerrado: true,
      eventos: [ev("entrada", 1230), ev("salida", 1620)],
    });
    assert.deepEqual(tipos(j).sort(), ["entrada_tarde", "salida_tarde"]);
    assert.equal(j.incidencias.find((i) => i.tipo === "entrada_tarde").minutos, 30);
    assert.equal(j.incidencias.find((i) => i.tipo === "salida_tarde").minutos, 60);
    assert.equal(j.requiereRevision, false, "llegar tarde se informa, no bloquea nada");
  });

  test("TENÍA TURNO Y NO FICHÓ: incidencia que pide revisión, y el plan NO se copia", () => {
    const j = construirJornada({ asignaciones: PLAN_TARDE, eventos: [], diaCerrado: true });
    assert.deepEqual(tipos(j), ["sin_fichar"]);
    assert.equal(j.incidencias[0].nivel, REVISAR);
    assert.equal(j.minPlanificado, 360);
    assert.equal(j.minFichado, 0, "el registro dice la verdad: no fichó");
    assert.equal(j.minDesviacion, -360);
  });

  test("mientras el día corre, un turno de noche que no ha empezado NO es incidencia", () => {
    const j = construirJornada({ asignaciones: PLAN_TARDE, eventos: [], diaCerrado: false });
    assert.deepEqual(j.incidencias, []);
  });

  test("fichó un día que no tenía turno", () => {
    const j = construirJornada({ asignaciones: [], diaCerrado: true, eventos: [ev("entrada", 720), ev("salida", 960)] });
    assert.deepEqual(tipos(j), ["sin_planificar"]);
    assert.equal(j.incidencias[0].minutos, 240);
  });

  test("se fue sin fichar la salida: solo se avisa al cerrar el día", () => {
    const abierta = { asignaciones: PLAN_TARDE, eventos: [ev("entrada", 1200)] };
    assert.deepEqual(tipos(construirJornada({ ...abierta, diaCerrado: false })), []);
    assert.deepEqual(tipos(construirJornada({ ...abierta, diaCerrado: true })), ["sin_salida"]);
  });

  test("NO SE CUENTA DOS VECES: quien entró y no fichó la salida no «faltó al trabajo»", () => {
    const j = construirJornada({ asignaciones: PLAN_TARDE, diaCerrado: true, eventos: [ev("entrada", 1200)] });
    assert.deepEqual(tipos(j), ["sin_salida"],
      "el turno abierto empareja con su plan; si no, saldría también 'sin_fichar'");
  });

  test("fichó la salida sin la entrada: se avisa siempre, corriendo el día o no", () => {
    const j = construirJornada({ asignaciones: PLAN_TARDE, diaCerrado: false, eventos: [ev("salida", 1560)] });
    assert.deepEqual(tipos(j), ["sin_entrada"]);
  });

  test("EL TURNO PARTIDO: un tramo bien y el otro sin fichar", () => {
    const j = construirJornada({
      asignaciones: [turno(660, 900), turno(1200, 1560)], diaCerrado: true,
      eventos: [ev("entrada", 660), ev("salida", 900)],
    });
    assert.deepEqual(tipos(j), ["sin_fichar"]);
    assert.equal(j.incidencias[0].minutos, 360, "el tramo de noche entero");
    assert.equal(j.minPlanificado, 600);
    assert.equal(j.minFichado, 240);
  });

  test("la pausa se descuenta del efectivo y de la desviación, no de la presencia", () => {
    const j = construirJornada({
      asignaciones: PLAN_TARDE, diaCerrado: true,
      eventos: [ev("entrada", 1200), ev("pausa_inicio", 1350), ev("pausa_fin", 1380), ev("salida", 1560)],
    });
    assert.equal(j.minFichado, 360);
    assert.equal(j.minPausa, 30);
    assert.equal(j.minEfectivo, 330);
    assert.equal(j.minDesviacion, -30);
    assert.deepEqual(j.incidencias, [], "hacer la pausa que toca no es ninguna incidencia");
  });

  test("una jornada de 14 h pide revisión aunque estuviera planificada", () => {
    const j = construirJornada({
      asignaciones: [turno(600, 1440)], diaCerrado: true,
      eventos: [ev("entrada", 600), ev("salida", 1440)],
    });
    assert.ok(tipos(j).includes("jornada_larga"));
    assert.equal(j.requiereRevision, true);
  });

  test("lo que pide revisión sale primero: es lo que hay que mirar", () => {
    const j = construirJornada({
      asignaciones: [turno(660, 900), turno(1200, 1560)], diaCerrado: true,
      eventos: [ev("entrada", 700), ev("salida", 900)],
    });
    assert.equal(j.incidencias[0].nivel, REVISAR);
    assert.equal(j.incidencias[j.incidencias.length - 1].nivel, INFORMA);
  });
});

describe("jornadas — la firma de la validación", () => {
  test("los mismos eventos dan la misma firma, en cualquier orden de lectura", () => {
    const a = [ev("entrada", 720), ev("salida", 960)];
    assert.equal(firmaDeEventos(a), firmaDeEventos([...a].reverse()));
  });
  test("UN FICHAJE NUEVO CAMBIA LA FIRMA: la validación queda caducada", () => {
    const a = [ev("entrada", 720), ev("salida", 960)];
    assert.notEqual(firmaDeEventos(a), firmaDeEventos([...a, ev("entrada", 1200)]));
  });
  test("y anular uno también, aunque la fila siga estando", () => {
    const a = [ev("entrada", 720), ev("salida", 960)];
    const b = a.map((e, i) => (i === 1 ? { ...e, anulado_por: 5 } : e));
    assert.notEqual(firmaDeEventos(a), firmaDeEventos(b),
      "validar 8 horas y que el registro diga otra cosa sin enterarse es justo lo que hay que impedir");
  });
});
