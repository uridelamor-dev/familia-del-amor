// FASE 5 — la franquicia de la bolsa y el circuito de liquidación, en lo puro.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  movimientoBolsa, movimientosParaJornada, saldoDe, claveJornada, TOLERANCIA_BOLSA_MIN,
  revertidos, estaRevertido, motivoNoLiquidar, motivoNoRevertir,
  CONCEPTOS, CONCEPTOS_LIQUIDACION, CONCEPTOS_REVERSIBLES, enHoras, conSigno,
} from "../../src/modules/fichajes/bolsa.js";

describe("la franquicia NO es un umbral", () => {
  // La tabla que decidió Uriel, entera. Si alguien cambia la fórmula, aquí se ve cuál de
  // los dos comportamientos ha puesto en su lugar.
  const casos = [
    [0, 0], [1, 0], [5, 0], [9, 0], [10, 0], [11, 1], [12, 2], [25, 15], [60, 50],
    [-1, 0], [-5, 0], [-9, 0], [-10, 0], [-11, -1], [-12, -2], [-25, -15], [-60, -50],
  ];
  for (const [dif, esperado] of casos) {
    test(`una diferencia de ${dif} min apunta ${esperado}`, () => {
      assert.equal(movimientoBolsa(480 + dif, 480), esperado);
    });
  }

  test("LO QUE LA DISTINGUE DE UN UMBRAL: 10 y 11 se diferencian en 1, no en 11", () => {
    // Con un umbral, +10 valdría 0 y +11 valdría 11: un salto de once minutos por un minuto
    // de diferencia, y el incentivo de quedarse siempre en el diez. Con franquicia, la
    // curva es continua y nadie gana nada por afinar.
    assert.equal(movimientoBolsa(490, 480) , 0);
    assert.equal(movimientoBolsa(491, 480), 1);
    assert.equal(movimientoBolsa(491, 480) - movimientoBolsa(490, 480), 1);
  });

  test("es simétrica: lo que se perdona de más se perdona de menos", () => {
    for (let d = 0; d <= 120; d++) {
      assert.equal(movimientoBolsa(480 + d, 480), 0 - movimientoBolsa(480 - d, 480),
        `no es simétrica en ${d} min`);
    }
  });

  test("nunca cambia el signo de la diferencia", () => {
    for (let d = -300; d <= 300; d++) {
      const m = movimientoBolsa(480 + d, 480);
      if (m !== 0) assert.ok(Math.sign(m) === Math.sign(d), `${d} → ${m} cambió de signo`);
      assert.ok(Math.abs(m) <= Math.abs(d), `${d} → ${m} apunta MÁS de lo que se desvió`);
    }
  });

  test("valores grandes: un turno doble entero", () => {
    assert.equal(movimientoBolsa(960, 480), 470);
    assert.equal(movimientoBolsa(0, 480), -470, "no vino a trabajar");
  });

  test("la franquicia por defecto son 10 minutos", () => {
    assert.equal(TOLERANCIA_BOLSA_MIN, 10);
    assert.equal(movimientoBolsa(505, 480), movimientoBolsa(505, 480, 10));
  });

  test("con franquicia 0 la diferencia entra entera", () => {
    assert.equal(movimientoBolsa(486, 480, 0), 6);
    assert.equal(movimientoBolsa(474, 480, 0), -6);
  });

  test("una franquicia enorme se lo come todo", () => {
    assert.equal(movimientoBolsa(600, 480, 600), 0);
  });

  test("una franquicia negativa o absurda se trata como 0, no revienta", () => {
    assert.equal(movimientoBolsa(486, 480, -5), 6);
    assert.equal(movimientoBolsa(486, 480, "hola"), 6);
  });

  test("null/undefined en la franquicia caen al valor por defecto", () => {
    assert.equal(movimientoBolsa(486, 480, null), 0);
    assert.equal(movimientoBolsa(486, 480, undefined), 0);
  });

  test("un planificado ausente cuenta como cero, no como NaN", () => {
    assert.equal(movimientoBolsa(60, null), 50);
    assert.equal(movimientoBolsa(60, undefined), 50);
  });
});

describe("LA FRANQUICIA ES POR JORNADA, NO POR MES", () => {
  const dia = (d, minValidado, existentes = []) => movimientosParaJornada({
    workerId: 7, local: "Blanes", dia: d, periodo: "2026-08", autor: "direccion",
    minPlanificado: 480, minValidado, firma: "A", existentes,
  });

  test("dos días de +6 y +7 suman CERO, no +3", () => {
    // Con la franquicia aplicada al total del mes, los 13 minutos habrían dejado +3. Cada
    // jornada tiene la suya: seis minutos un lunes y siete un martes no son un desvío.
    const libro = [...dia("2026-08-10", 486).insertar, ...dia("2026-08-11", 487).insertar];
    assert.equal(libro.length, 0, "ninguno de los dos llega a escribir nada");
    assert.equal(saldoDe(libro), 0);
  });

  test("dos días de +15 suman +10, uno por cada franquicia", () => {
    const libro = [...dia("2026-08-10", 495).insertar, ...dia("2026-08-11", 495).insertar];
    assert.equal(saldoDe(libro), 10, "5 de cada día");
  });

  test("un día de +6 y otro de −6 no se compensan entre ellos: los dos son cero", () => {
    const libro = [...dia("2026-08-10", 486).insertar, ...dia("2026-08-11", 474).insertar];
    assert.equal(saldoDe(libro), 0);
    assert.equal(libro.length, 0);
  });

  test("veinte días de +9 siguen siendo cero", () => {
    let libro = [];
    for (let d = 1; d <= 20; d++) libro = libro.concat(dia(`2026-08-${String(d).padStart(2, "0")}`, 489).insertar);
    assert.equal(saldoDe(libro), 0, "180 minutos de desvío que nadie ha trabajado de más");
  });
});

describe("revalidar con franquicia: contra-asientos, nunca UPDATE", () => {
  const base = { workerId: 7, local: "Blanes", dia: "2026-08-10", periodo: "2026-08", autor: "direccion", minPlanificado: 480 };
  const aplicar = (libro, r) => libro.concat(r.insertar.map((m, i) => ({ ...m, id: libro.length + i + 1 })));

  test("+25 y luego +8: queda +15 y −15, saldo 0", () => {
    let libro = aplicar([], movimientosParaJornada({ ...base, minValidado: 505, firma: "A", existentes: [] }));
    assert.equal(saldoDe(libro), 15);

    libro = aplicar(libro, movimientosParaJornada({ ...base, minValidado: 488, firma: "B", existentes: libro }));
    assert.equal(saldoDe(libro), 0, "el objetivo nuevo es 0 y se llega con el contra-asiento");
    assert.equal(libro.length, 2, "el +15 y su −15; NO hay una fila de +0 que no dice nada");
    assert.deepEqual(libro.map((m) => m.minutos), [15, -15]);
    assert.equal(libro[0].minutos, 15, "el original sigue intacto: no se ha modificado");
  });

  test("+25 y luego +30: saldo +20, no +35", () => {
    let libro = aplicar([], movimientosParaJornada({ ...base, minValidado: 505, firma: "A", existentes: [] }));
    libro = aplicar(libro, movimientosParaJornada({ ...base, minValidado: 510, firma: "B", existentes: libro }));
    assert.equal(saldoDe(libro), 20);
    assert.deepEqual(libro.map((m) => m.minutos), [15, -15, 20]);
  });

  test("y volver a revalidar a 0 no vuelve a contra-asentar", () => {
    let libro = aplicar([], movimientosParaJornada({ ...base, minValidado: 505, firma: "A", existentes: [] }));
    libro = aplicar(libro, movimientosParaJornada({ ...base, minValidado: 488, firma: "B", existentes: libro }));
    const otra = movimientosParaJornada({ ...base, minValidado: 488, firma: "B", existentes: libro });
    assert.deepEqual(otra.insertar, [], "no queda nada vigente que anular y el objetivo sigue siendo 0");
    assert.equal(saldoDe(libro), 0);
  });

  test("de dentro de la franquicia a fuera: no había nada y ahora hay +15", () => {
    let libro = aplicar([], movimientosParaJornada({ ...base, minValidado: 486, firma: "A", existentes: [] }));
    assert.equal(libro.length, 0);
    libro = aplicar(libro, movimientosParaJornada({ ...base, minValidado: 505, firma: "B", existentes: libro }));
    assert.equal(saldoDe(libro), 15);
    assert.equal(libro.length, 1, "no hay nada que contra-asentar porque no se escribió nada");
  });
});

describe("el libro de OTRO día no se toca", () => {
  test("apuntar el martes NO contra-asienta el lunes", () => {
    // Lo encontré escribiendo estos tests: al pasarle el libro entero, el +15 del lunes
    // entraba como «vigente» del martes y se anulaba. Con la firma de eventos por medio
    // habría salido un contra-asiento de un día que nadie había tocado.
    const lunes = { id: 1, dia: "2026-08-10", concepto: "jornada", minutos: 15, clave_idem: claveJornada(7, "2026-08-10", "fA") };
    const r = movimientosParaJornada({
      workerId: 7, local: "Blanes", dia: "2026-08-11", periodo: "2026-08",
      minPlanificado: 480, minValidado: 487, firma: "fB", existentes: [lunes] });
    assert.deepEqual(r.insertar, [], "el martes cae dentro de la franquicia y no escribe nada");
    assert.equal(saldoDe([lunes, ...r.insertar]), 15, "el lunes sigue en pie");
  });

  test("y sí contra-asienta el suyo", () => {
    const martes = { id: 2, dia: "2026-08-11", concepto: "jornada", minutos: 15, clave_idem: claveJornada(7, "2026-08-11", "vieja") };
    const r = movimientosParaJornada({
      workerId: 7, local: "Blanes", dia: "2026-08-11", periodo: "2026-08",
      minPlanificado: 480, minValidado: 487, firma: "fB", existentes: [martes] });
    assert.equal(r.insertar.length, 1);
    assert.equal(r.insertar[0].concepto, "contra");
    assert.equal(r.insertar[0].referencia_id, 2);
  });
});

describe("EL PASADO NO SE RECALCULA", () => {
  test("la clave de un día NO depende de la franquicia", () => {
    // Es la garantía entera de que desplegar esto no cambia ni un saldo. La clave sale de
    // la firma de los EVENTOS. Si dependiera de la franquicia, subirla a 15 mañana
    // contra-asentaría media empresa de golpe y los saldos bailarían solos.
    assert.equal(claveJornada(7, "2026-08-10", "firma-A"), claveJornada(7, "2026-08-10", "firma-A"));
    const conFranquicia = movimientosParaJornada({
      workerId: 7, local: "B", dia: "2026-08-10", periodo: "2026-08",
      minPlanificado: 480, minValidado: 505, toleranciaMin: 10, firma: "F", existentes: [] });
    const sinFranquicia = movimientosParaJornada({
      workerId: 7, local: "B", dia: "2026-08-10", periodo: "2026-08",
      minPlanificado: 480, minValidado: 505, toleranciaMin: 0, firma: "F", existentes: [] });
    assert.equal(conFranquicia.insertar[0].clave_idem, sinFranquicia.insertar[0].clave_idem);
    assert.notEqual(conFranquicia.insertar[0].minutos, sinFranquicia.insertar[0].minutos);
  });

  test("un movimiento viejo escrito SIN franquicia se respeta tal cual", () => {
    // El día se apuntó con +25 cuando no había franquicia. Al recalcular con la regla nueva
    // no se toca: la firma no ha cambiado, así que no ha pasado nada que revisar.
    const viejo = { id: 1, concepto: "jornada", minutos: 25, clave_idem: claveJornada(7, "2026-07-04", "F") };
    const r = movimientosParaJornada({
      workerId: 7, local: "B", dia: "2026-07-04", periodo: "2026-07",
      minPlanificado: 480, minValidado: 505, toleranciaMin: 10, firma: "F", existentes: [viejo] });
    assert.equal(r.sinCambios, true);
    assert.deepEqual(r.insertar, []);
    assert.equal(saldoDe([viejo]), 25, "el saldo histórico sigue siendo el que era");
  });

  test("solo se recalcula si CAMBIAN LOS FICHAJES, que es una decisión de una persona", () => {
    const viejo = { id: 1, concepto: "jornada", minutos: 25, clave_idem: claveJornada(7, "2026-07-04", "F") };
    const r = movimientosParaJornada({
      workerId: 7, local: "B", dia: "2026-07-04", periodo: "2026-07",
      minPlanificado: 480, minValidado: 505, toleranciaMin: 10, firma: "OTRA", existentes: [viejo] });
    assert.equal(r.sinCambios, false);
    assert.equal(r.insertar[0].concepto, "contra");
  });
});

describe("nadie puede colar minutos crudos en el libro", () => {
  test("pasar `minutos` a mano REVIENTA en vez de saltarse la franquicia", () => {
    // Es la defensa contra el fallo probable: un endpoint nuevo dentro de un año que apunte
    // la diferencia en bruto. Un error se ve; una franquicia olvidada, no.
    assert.throws(
      () => movimientosParaJornada({ workerId: 7, local: "B", dia: "2026-08-10", periodo: "2026-08", minutos: 25, firma: "A" }),
      /minValidado/);
  });

  test("y con minValidado/minPlanificado funciona", () => {
    assert.doesNotThrow(() => movimientosParaJornada({
      workerId: 7, local: "B", dia: "2026-08-10", periodo: "2026-08", minValidado: 505, minPlanificado: 480, firma: "A" }));
  });
});

describe("qué se puede liquidar", () => {
  test("con saldo a favor, la cantidad justa vale", () => {
    assert.equal(motivoNoLiquidar(455, 455), null);
    assert.equal(motivoNoLiquidar(455, 120), null);
    assert.equal(motivoNoLiquidar(455, 1), null);
  });

  test("NO SE PUEDE PASAR DEL SALDO", () => {
    assert.match(motivoNoLiquidar(300, 360), /no se pueden liquidar/i);
    assert.match(motivoNoLiquidar(300, 301), /no se pueden liquidar/i);
  });

  test("saldo cero: no hay nada que liquidar", () => {
    assert.match(motivoNoLiquidar(0, 60), /a cero/i);
  });

  test("SALDO NEGATIVO: no se paga ni se compensa, y se dice por qué", () => {
    // No es un «no puedes». Es que cobrarle horas a alguien tiene consecuencias laborales
    // que no se deciden desde un botón de esta pantalla.
    const m = motivoNoLiquidar(-180, 60);
    assert.match(m, /negativo/i);
    assert.doesNotMatch(m, /error/i);
  });

  test("cero o negativo como cantidad no vale", () => {
    assert.match(motivoNoLiquidar(455, 0), /cuántos minutos/i);
    assert.match(motivoNoLiquidar(455, -60), /cuántos minutos/i);
  });
});

describe("deshacer un movimiento", () => {
  const pago = { id: 9, concepto: "pago", minutos: -455 };
  const comp = { id: 10, concepto: "compensacion", minutos: -120 };
  const jorn = { id: 11, concepto: "jornada", minutos: 15 };

  test("un pago y una compensación se pueden deshacer", () => {
    assert.equal(motivoNoRevertir(pago, [pago]), null);
    assert.equal(motivoNoRevertir(comp, [comp]), null);
  });

  test("un ajuste manual también", () => {
    assert.equal(motivoNoRevertir({ id: 12, concepto: "ajuste", minutos: 120 }, []), null);
  });

  test("LAS HORAS DE UNA JORNADA NO SE DESHACEN DESDE AQUÍ", () => {
    // Deshacer un +15 de jornada sería decidir las horas de alguien desde un botón en vez
    // de desde sus fichajes. Se corrige el fichaje y se revalida; el contra-asiento sale solo.
    assert.match(motivoNoRevertir(jorn, [jorn]), /se corrigen sus fichajes/i);
    assert.match(motivoNoRevertir({ id: 13, concepto: "contra", minutos: -15 }, []), /fichajes/i);
  });

  test("ni un arrastre ni una liquidación antigua", () => {
    assert.ok(motivoNoRevertir({ id: 14, concepto: "arrastre", minutos: 60 }, []));
    assert.ok(motivoNoRevertir({ id: 15, concepto: "liquidacion", minutos: -60 }, []));
  });

  test("DOS VECES NO", () => {
    const libro = [pago, { id: 16, concepto: "reversion", minutos: 455, referencia_id: 9 }];
    assert.match(motivoNoRevertir(pago, libro), /ya estaba deshecho/i);
  });

  test("y el saldo vuelve exactamente a donde estaba", () => {
    const libro = [{ id: 1, concepto: "jornada", minutos: 455 }, pago];
    assert.equal(saldoDe(libro), 0);
    const conReversion = [...libro, { id: 16, concepto: "reversion", minutos: 455, referencia_id: 9 }];
    assert.equal(saldoDe(conReversion), 455);
  });

  test("saber si está deshecho NO necesita ninguna columna de estado", () => {
    const libro = [pago, comp, { id: 16, concepto: "reversion", minutos: 455, referencia_id: 9 }];
    assert.deepEqual([...revertidos(libro)], [9]);
    assert.equal(estaRevertido(pago, libro), true);
    assert.equal(estaRevertido(comp, libro), false);
  });

  test("una reversión sin referencia no anula nada por accidente", () => {
    assert.deepEqual([...revertidos([{ id: 3, concepto: "reversion", minutos: 5, referencia_id: null }])], []);
  });

  test("un movimiento que no existe se dice, no revienta", () => {
    assert.match(motivoNoRevertir(null, []), /no existe/i);
  });
});

describe("el circuito completo de Juan", () => {
  test("de las jornadas al saldo cero, sin perder una sola línea", () => {
    const dia = (d, val, existentes) => movimientosParaJornada({
      workerId: 7, local: "Blanes", dia: d, periodo: "2026-08", autor: "direccion",
      minPlanificado: 480, minValidado: val, firma: "f" + d,
      existentes: existentes.map((m) => ({ ...m, dia: m.dia ?? d })) });

    let libro = [];
    const meter = (r) => { libro = libro.concat(r.insertar.map((m, i) => ({ ...m, id: libro.length + i + 1 }))); };

    meter(dia("2026-08-10", 505, libro));   // +25 → +15
    meter(dia("2026-08-11", 487, libro));   // +7  → 0
    assert.equal(saldoDe(libro), 15);
    assert.equal(libro.length, 1, "el martes no ensucia el libro");

    // El resto del mes hasta las 7 h 35 (455 min) del enunciado.
    libro.push({ id: 99, concepto: "jornada", minutos: 440, clave_idem: "x" });
    assert.equal(saldoDe(libro), 455);

    libro.push({ id: 100, concepto: "pago", minutos: -180, saldo_antes: 455 });
    assert.equal(saldoDe(libro), 275, "+4 h 35 min");
    assert.equal(conSigno(saldoDe(libro)), "+4 h 35 min");

    libro.push({ id: 101, concepto: "compensacion", minutos: -120, saldo_antes: 275 });
    assert.equal(conSigno(saldoDe(libro)), "+2 h 35 min");

    libro.push({ id: 102, concepto: "pago", minutos: -155, saldo_antes: 155 });
    assert.equal(saldoDe(libro), 0);

    // Y años después: se puede señalar cada minuto.
    assert.equal(libro.filter((m) => m.concepto === "pago").length, 2);
    assert.equal(libro.filter((m) => m.concepto === "compensacion").length, 1);
    assert.equal(libro.find((m) => m.dia === "2026-08-10").dif_min, 25, "la diferencia bruta de aquel lunes");
    assert.equal(libro.find((m) => m.dia === "2026-08-10").tolerancia_min, 10, "y la franquicia que se le aplicó");
    // Cinco: el lunes, el resto del mes, los dos pagos y la compensación. El martes NO
    // está, y es lo correcto: aquel día no desvió nada del cuadrante.
    assert.equal(libro.length, 5, "ni una línea borrada");
  });
});

describe("los conceptos", () => {
  test("los antiguos siguen existiendo: no se renombra nada", () => {
    for (const c of ["jornada", "ajuste", "contra", "liquidacion", "arrastre"]) {
      assert.ok(CONCEPTOS[c], `desapareció el concepto ${c}`);
    }
  });

  test("los nuevos distinguen pagar de devolver con descanso", () => {
    assert.deepEqual(CONCEPTOS_LIQUIDACION, ["pago", "compensacion"]);
    assert.ok(CONCEPTOS.pago && CONCEPTOS.compensacion && CONCEPTOS.reversion);
    assert.notEqual(CONCEPTOS.pago, CONCEPTOS.compensacion, "no significan lo mismo y no lo dicen igual");
  });

  test("`jornada` y `contra` NO son reversibles desde la pantalla", () => {
    assert.ok(!CONCEPTOS_REVERSIBLES.includes("jornada"));
    assert.ok(!CONCEPTOS_REVERSIBLES.includes("contra"));
  });

  test("nada habla de euros, precios ni nóminas", () => {
    const texto = JSON.stringify(CONCEPTOS).toLowerCase();
    for (const p of ["euro", "€", "precio", "nómina", "irpf", "bruto", "neto", "salario"]) {
      assert.ok(!texto.includes(p), `«${p}» no pinta nada en la bolsa`);
    }
  });
});

describe("cómo se leen los minutos", () => {
  test("horas y minutos, con el cero a la izquierda", () => {
    assert.equal(enHoras(455), "7 h 35 min");
    assert.equal(enHoras(65), "1 h 05 min");
    assert.equal(enHoras(45), "45 min");
    assert.equal(enHoras(0), "0 min");
    assert.equal(enHoras(-455), "7 h 35 min", "el valor absoluto: el signo lo pone quien lo pinta");
  });

  test("el signo se ve, y el menos es un menos de verdad", () => {
    assert.equal(conSigno(455), "+7 h 35 min");
    assert.equal(conSigno(-455), "−7 h 35 min");
    assert.equal(conSigno(0), "0");
  });
});
