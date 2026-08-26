import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { construirJornada, horasCompletas } from "../../src/modules/fichajes/jornadas.js";
import {
  clasificarJornada, cuentaDeJornada, conContextoDeAusencia, candidatasDeLote,
  MOTIVOS, LISTA, REVISION, ABIERTA, VALIDADA, CADUCADA,
} from "../../src/modules/fichajes/revision.js";
import { navegarRevision, rangoPorDefecto } from "../../src/modules/fichajes/bolsa.js";
import { indiceDeAusencias, ausenciaDelDia } from "../../src/modules/rrhh/ausencias.js";

// La pantalla de Revisión pasa a enseñar TRES magnitudes —cuadrante, reloj y lo que cuenta— y
// a dejar validar desde la propia fila. Esto sujeta las reglas nuevas y, sobre todo, sujeta que
// no se hayan aflojado las viejas por el camino.

let _id = 0;
const ev = (tipo, min, extra = {}) => ({ id: ++_id, tipo, minuto_local: min, epoch_ms: min * 60000, ...extra });
const turno = (inicio, fin) => ({ id: 1, inicio_min: inicio, fin_min: fin, tipo: "turno" });
const jor = (eventos, asignaciones = [], opts = {}) =>
  construirJornada({ eventos, asignaciones, diaCerrado: true, ...opts });

describe("saber cuántas horas hizo no es lo mismo que no tener incidencias", () => {
  test("una jornada limpia está completa", () => {
    assert.equal(horasCompletas(jor([ev("entrada", 600), ev("salida", 1080)], [turno(600, 1080)])), true);
  });

  test("fichó un día que no le tocaba: hay incidencia, pero las horas se saben", () => {
    // Este es EL caso que justifica que sean dos preguntas distintas. Hay que decidir algo,
    // sí, pero la cifra que se decide ya está delante: no hace falta escribir ninguna hora.
    const j = jor([ev("entrada", 600), ev("salida", 1080)], []);
    assert.equal(j.requiereRevision, true, "sigue pidiendo decisión");
    assert.equal(horasCompletas(j), true, "y aun así se sabe qué contar");
  });

  test("se fue sin fichar la salida: no hay ninguna cifra que ofrecer", () => {
    assert.equal(horasCompletas(jor([ev("entrada", 600)], [turno(600, 1080)])), false);
  });

  test("fichó la salida sin haber fichado la entrada, igual", () => {
    assert.equal(horasCompletas(jor([ev("salida", 1080)], [turno(600, 1080)])), false);
  });

  test("tenía turno y no fichó nada", () => {
    assert.equal(horasCompletas(jor([], [turno(600, 1080)])), false);
  });

  test("turno partido con uno de los dos sin fichar: TAMPOCO está completa", () => {
    // El que más fácil se escapa: hay horas fichadas y ningún tramo roto, pero falta un turno
    // entero del cuadrante. Contar solo lo fichado se comería medio día sin avisar.
    const j = jor([ev("entrada", 660), ev("salida", 900)], [turno(660, 900), { id: 2, inicio_min: 1200, fin_min: 1440, tipo: "turno" }]);
    assert.ok(j.incidencias.some((i) => i.tipo === "sin_fichar"));
    assert.equal(horasCompletas(j), false);
  });

  test("las pausas no la rompen", () => {
    const j = jor([ev("entrada", 600), ev("pausa_inicio", 800), ev("pausa_fin", 830), ev("salida", 1080)], [turno(600, 1080)]);
    assert.equal(horasCompletas(j), true);
  });

  test("y con basura no revienta", () => {
    for (const v of [null, undefined, {}, { minFichado: 0 }]) assert.equal(horasCompletas(v), false);
  });
});

describe("validar de un clic: quién puede y quién no", () => {
  const limpia = jor([ev("entrada", 600), ev("salida", 1080)], [turno(600, 1080)]);
  const sinPlan = jor([ev("entrada", 600), ev("salida", 1080)], []);
  const sinSalida = jor([ev("entrada", 600)], [turno(600, 1080)]);

  test("una jornada limpia, sí", () => {
    assert.equal(clasificarJornada({ jornada: limpia, eventos: [], diaCerrado: true }).unClic, true);
  });

  test("una con incidencia pero horas completas, TAMBIÉN", () => {
    // Es la diferencia entre el lote y el clic: aquí hay una persona leyendo esa fila.
    const c = clasificarJornada({ jornada: sinPlan, eventos: [], diaCerrado: true });
    assert.equal(c.estado, REVISION);
    assert.equal(c.puedeLote, false, "el automatismo no se la puede llevar");
    assert.equal(c.unClic, true, "pero una persona sí puede resolverla desde la lista");
  });

  test("si falta una hora, NO: ahí no hay nada que contar", () => {
    const c = clasificarJornada({ jornada: sinSalida, eventos: [], diaCerrado: true });
    assert.equal(c.unClic, false);
    assert.equal(c.motivoUnClic, MOTIVOS.horas_incompletas);
  });

  test("el día que todavía corre, no", () => {
    const c = clasificarJornada({ jornada: limpia, eventos: [], diaCerrado: false });
    assert.equal(c.estado, ABIERTA);
    assert.equal(c.unClic, false);
  });

  test("una ya validada, no: no hay nada que hacer", () => {
    const c = clasificarJornada({ jornada: limpia, eventos: [], diaCerrado: true, validacion: { minutos: 480, firma: "a" }, firmaActual: "a" });
    assert.equal(c.estado, VALIDADA);
    assert.equal(c.unClic, false);
  });

  test("una caducada SÍ, si sus horas están completas", () => {
    // Se validó y después cambió el registro. Volver a confirmar la cifra nueva es
    // exactamente lo que hay que hacer, y no necesita abrir nada.
    const c = clasificarJornada({ jornada: limpia, eventos: [], diaCerrado: true, validacion: { minutos: 480, firma: "vieja" }, firmaActual: "nueva" });
    assert.equal(c.estado, CADUCADA);
    assert.equal(c.unClic, true);
  });

  test("con el periodo cerrado, no", () => {
    const c = clasificarJornada({ jornada: limpia, eventos: [], diaCerrado: true, periodoCerrado: true });
    assert.equal(c.unClic, false);
    assert.equal(c.motivoUnClic, MOTIVOS.periodo_cerrado);
  });

  test("EL INVARIANTE: poder de un clic nunca implica poder en lote", () => {
    // El lote es un automatismo y se lleva decenas de golpe. Si `unClic` lo arrastrara,
    // validaría incidencias que nadie ha mirado.
    const casos = [
      { jornada: limpia, eventos: [], diaCerrado: true },
      { jornada: sinPlan, eventos: [], diaCerrado: true },
      { jornada: sinSalida, eventos: [], diaCerrado: true },
      { jornada: limpia, eventos: [{ id: 1, origen: "manual" }], diaCerrado: true },
      { jornada: limpia, eventos: [], diaCerrado: true, periodoCerrado: true },
    ];
    for (const c of casos) {
      const r = clasificarJornada(c);
      if (r.puedeLote) assert.equal(r.unClic, true, "lo que va en lote tiene que poder ir de un clic");
      assert.ok(!(r.unClic && r.puedeLote && r.estado !== LISTA), "el lote solo toca jornadas limpias");
    }
  });

  test("y el lote sigue llevándose exactamente lo mismo que antes", () => {
    const filas = [
      { estado: LISTA, puedeLote: true, unClic: true },
      { estado: REVISION, puedeLote: false, unClic: true },
      { estado: LISTA, puedeLote: false, unClic: false },
      { estado: CADUCADA, puedeLote: false, unClic: true },
    ];
    assert.equal(candidatasDeLote(filas).length, 1, "unClic no puede colar a nadie en el lote");
  });
});

describe("la tercera magnitud: lo que cuenta", () => {
  const j = jor([ev("entrada", 600), ev("salida", 1080)], [turno(600, 1020)]);

  test("sin decisión es una propuesta: lo que marcó el reloj, sin las pausas", () => {
    const c = cuentaDeJornada({ jornada: j });
    assert.equal(c.minutos, j.minEfectivo);
    assert.equal(c.origen, "propuesto");
  });

  test("con decisión manda la decisión, aunque no coincida con el reloj", () => {
    const c = cuentaDeJornada({ jornada: j, validacion: { minutos: 420 } });
    assert.equal(c.minutos, 420);
    assert.equal(c.origen, "validado");
    assert.equal(c.propuesto, j.minEfectivo, "se conserva lo que decía el reloj, para poder compararlo");
  });

  test("validar CERO horas es una decisión, no un hueco", () => {
    // «Este día no cuenta» se guarda como 0. Si se leyera como «sin validar» volvería a la
    // cola una y otra vez.
    const c = cuentaDeJornada({ jornada: j, validacion: { minutos: 0 } });
    assert.equal(c.minutos, 0);
    assert.equal(c.origen, "validado");
  });

  test("nunca sale en negativo ni se inventa nada", () => {
    assert.equal(cuentaDeJornada({}).minutos, 0);
    assert.equal(cuentaDeJornada({ jornada: { minEfectivo: -30 } }).minutos, 0);
  });
});

describe("la ausencia se ve, pero NO tapa la incidencia", () => {
  const fila = { estado: REVISION, puedeLote: false, unClic: false, minEfectivo: 0, incidencias: [{ tipo: "sin_fichar" }] };
  const idx = indiceDeAusencias([
    { worker_id: 7, tipo: "baja", desde: "2026-08-10", hasta: "2026-08-20", estado: "aprobada" },
    { worker_id: 9, tipo: "vacaciones", desde: "2026-08-01", hasta: "2026-08-15", estado: "pendiente" },
  ]);

  test("una baja aprobada se etiqueta", () => {
    const a = ausenciaDelDia(idx, 7, "2026-08-12");
    assert.equal(a.tipo, "baja");
    assert.equal(a.etiqueta, "Baja médica");
  });

  test("los dos extremos entran: `hasta` es el último día de ausencia, no el de volver", () => {
    assert.ok(ausenciaDelDia(idx, 7, "2026-08-10"));
    assert.ok(ausenciaDelDia(idx, 7, "2026-08-20"));
    assert.equal(ausenciaDelDia(idx, 7, "2026-08-21"), null);
  });

  test("una PENDIENTE no se etiqueta: todavía no es una realidad", () => {
    assert.equal(ausenciaDelDia(idx, 9, "2026-08-05"), null);
  });

  test("y etiquetarla no cambia NADA de la jornada", () => {
    // Un turno publicado durante una baja aprobada es una incoherencia real del cuadrante:
    // se arregla republicando el horario, no escondiendo el aviso. Lo único que cambia es
    // que ahora se lee el porqué sin salir de la pantalla.
    const con = conContextoDeAusencia(fila, ausenciaDelDia(idx, 7, "2026-08-12"));
    assert.equal(con.estado, REVISION, "sigue pidiendo una decisión");
    assert.equal(con.puedeLote, false);
    assert.equal(con.unClic, false);
    assert.deepEqual(con.incidencias, fila.incidencias, "la incidencia se queda entera");
    assert.equal(con.minEfectivo, fila.minEfectivo);
    assert.equal(con.ausencia.tipo, "baja");
  });

  test("sin ausencia el campo queda a null, no desaparece", () => {
    assert.equal(conContextoDeAusencia(fila, null).ausencia, null);
  });
});

describe("moverse por las fechas", () => {
  const HOY = "2026-08-26";

  test("se abre en el periodo de nómina, no en catorce días sueltos", () => {
    assert.deepEqual(rangoPorDefecto(HOY, { diaInicio: 21 }), { desde: "2026-08-21", hasta: "2026-09-20" });
    assert.deepEqual(rangoPorDefecto(HOY, { diaInicio: 1 }), { desde: "2026-08-01", hasta: "2026-08-31" });
  });

  test("la nómina se llama por el mes en que TERMINA", () => {
    const n = navegarRevision({ desde: "2026-07-21", hasta: "2026-08-20", hoy: HOY, diaInicio: 21 });
    assert.equal(n.modo, "periodo");
    assert.match(n.titulo, /agosto/);
  });

  test("el modo se deduce de las fechas, sin guardarlo en ningún sitio", () => {
    assert.equal(navegarRevision({ desde: "2026-08-24", hasta: "2026-08-30", hoy: HOY, diaInicio: 21 }).modo, "semana");
    assert.equal(navegarRevision({ desde: "2026-08-01", hasta: "2026-08-09", hoy: HOY, diaInicio: 21 }).modo, "custom");
  });

  test("ir al anterior y volver deja el mismo rango", () => {
    for (const r of [{ desde: "2026-07-21", hasta: "2026-08-20", d: 21 }, { desde: "2026-08-17", hasta: "2026-08-23", d: 1 }]) {
      const a = navegarRevision({ desde: r.desde, hasta: r.hasta, hoy: HOY, diaInicio: r.d }).anterior;
      const vuelta = navegarRevision({ desde: a.desde, hasta: a.hasta, hoy: HOY, diaInicio: r.d }).siguiente;
      assert.deepEqual({ desde: vuelta.desde, hasta: vuelta.hasta }, { desde: r.desde, hasta: r.hasta });
    }
  });

  test("hacia delante no se puede ir si el rango ya alcanza hoy", () => {
    // Solo habría jornadas abiertas. Una flecha que lleva a una pantalla vacía es una
    // promesa incumplida.
    assert.equal(navegarRevision({ desde: "2026-08-21", hasta: "2026-09-20", hoy: HOY, diaInicio: 21 }).siguiente, null);
    assert.equal(navegarRevision({ desde: "2026-08-24", hasta: "2026-08-30", hoy: HOY, diaInicio: 1 }).siguiente, null);
  });

  test("los atajos anclan en lo que se está mirando, no siempre en hoy", () => {
    // Desde el periodo en curso, «Semana» lleva a la semana de hoy. Desde junio, a la última
    // semana de junio: quien lo pulsa quiere afinar donde está mirando, no viajar a hoy.
    const enCurso = navegarRevision({ desde: "2026-08-21", hasta: "2026-09-20", hoy: HOY, diaInicio: 21 });
    assert.equal(enCurso.semana.desde, "2026-08-24");
    const junio = navegarRevision({ desde: "2026-05-21", hasta: "2026-06-20", hoy: HOY, diaInicio: 21 });
    assert.equal(junio.semana.hasta <= "2026-06-21", true, "la semana del ancla, no la de hoy");
  });

  test("el día 31 como arranque de periodo no inventa un 31 de febrero", () => {
    const r = rangoPorDefecto("2026-02-15", { diaInicio: 31 });
    assert.equal(r.desde, "2026-01-31");
    assert.equal(r.hasta, "2026-02-27");
    const n = navegarRevision({ ...r, hoy: HOY, diaInicio: 31 });
    assert.equal(n.modo, "periodo", "el periodo recortado sigue reconociéndose como periodo");
    assert.ok(n.anterior.desde < r.desde);
  });

  test("y en año bisiesto tampoco", () => {
    const r = rangoPorDefecto("2028-02-15", { diaInicio: 31 });
    assert.equal(r.hasta, "2028-02-28", "2028 es bisiesto: el periodo llega al 28, y el 29 abre el siguiente");
  });
});

describe("una validación caducada ofrece la cifra NUEVA, no la vieja", () => {
  // Se validó 8 h y después llegó otro fichaje. Si la fila siguiera enseñando las 8 h, el
  // botón diría «Validar 8 h 00 min» y el servidor guardaría lo que marca el reloj AHORA:
  // el botón diría una cantidad y escribiría otra.
  const j = { minEfectivo: 600, minFichado: 600, fichado: [{ inicio: 600, fin: 1200 }], plan: [], parejas: [], incidencias: [] };

  test("manda lo que dice el reloj ahora", () => {
    const c = cuentaDeJornada({ jornada: j, validacion: { minutos: 480 }, caducada: true });
    assert.equal(c.minutos, 600);
    assert.equal(c.origen, "propuesto");
  });

  test("y se conserva lo que se había decidido antes, para poder ver de dónde se viene", () => {
    assert.equal(cuentaDeJornada({ jornada: j, validacion: { minutos: 480 }, caducada: true }).decididoAntes, 480);
  });

  test("mientras no caduque, manda la decisión", () => {
    assert.equal(cuentaDeJornada({ jornada: j, validacion: { minutos: 480 } }).minutos, 480);
  });
});
