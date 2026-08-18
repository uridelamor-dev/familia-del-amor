import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  periodoDe, periodosEntre, claveJornada, hash32, saldoDe, vigentesDeJornada,
  movimientosParaJornada, estaCerrado, motivoBloqueo,
} from "../../src/modules/fichajes/bolsa.js";

describe("bolsa — periodos de nómina", () => {
  test("mes natural: el 8 de agosto es del 1 al 31 de agosto", () => {
    assert.deepEqual(periodoDe("2026-08-08"), { desde: "2026-08-01", hasta: "2026-08-31", etiqueta: "2026-08", diaInicio: 1 });
  });

  test("del 21 al 20: el 25 de julio ya es la nómina de AGOSTO", () => {
    // Es como lo llama todo el mundo: el periodo se etiqueta con el mes en que termina.
    assert.deepEqual(periodoDe("2026-07-25", { diaInicio: 21 }),
      { desde: "2026-07-21", hasta: "2026-08-20", etiqueta: "2026-08", diaInicio: 21 });
  });

  test("del 21 al 20: el 15 de julio todavía es la de julio", () => {
    const p = periodoDe("2026-07-15", { diaInicio: 21 });
    assert.equal(p.desde, "2026-06-21");
    assert.equal(p.etiqueta, "2026-07");
  });

  test("el cambio de año no rompe nada", () => {
    assert.deepEqual(periodoDe("2027-01-05", { diaInicio: 21 }),
      { desde: "2026-12-21", hasta: "2027-01-20", etiqueta: "2027-01", diaInicio: 21 });
    assert.equal(periodoDe("2026-12-15").hasta, "2026-12-31");
  });

  test("FEBRERO: el periodo que empieza el 31 se recorta al último día que existe", () => {
    const p = periodoDe("2026-02-05", { diaInicio: 31 });
    assert.equal(p.desde, "2026-01-31");
    assert.equal(p.hasta, "2026-02-27", "el 28 de febrero arranca el siguiente");
  });

  test("NINGÚN DÍA SE QUEDA SIN PERIODO, y ninguna fecha inventada", () => {
    // Se recorren dos años enteros con los tres arranques que tienen sentido. El caso que
    // rompía: con `ini = 31`, el 28 de febrero no caía en ningún periodo y el anterior
    // arrancaba un "2026-02-31" que no existe.
    for (const diaInicio of [1, 21, 31]) {
      let dia = "2026-01-01";
      while (dia <= "2027-12-31") {
        const p = periodoDe(dia, { diaInicio });
        assert.ok(p.desde <= dia && dia <= p.hasta, `${dia} (arranque ${diaInicio}) fuera de su propio periodo ${p.desde}→${p.hasta}`);
        for (const f of [p.desde, p.hasta]) {
          const [a, m, d] = f.split("-").map(Number);
          const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
          assert.ok(d >= 1 && d <= ultimo, `${f} no es una fecha real`);
        }
        dia = new Date(Date.parse(dia + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
      }
    }
  });

  test("año bisiesto", () => {
    assert.equal(periodoDe("2028-02-10").hasta, "2028-02-29");
  });

  test("los periodos de un rango salen seguidos y sin huecos", () => {
    const ps = periodosEntre("2026-06-10", "2026-09-05", { diaInicio: 21 });
    assert.deepEqual(ps.map((p) => p.etiqueta), ["2026-06", "2026-07", "2026-08", "2026-09"]);
    for (let i = 1; i < ps.length; i++) {
      const finAnterior = new Date(ps[i - 1].hasta + "T00:00:00Z").getTime();
      const inicio = new Date(ps[i].desde + "T00:00:00Z").getTime();
      assert.equal(inicio - finAnterior, 86400000, "un día exacto entre el fin de uno y el inicio del otro");
    }
  });
});

describe("bolsa — el saldo se deriva, no se guarda", () => {
  test("es la suma de TODO, sin filtros", () => {
    assert.equal(saldoDe([{ minutos: 60 }, { minutos: -20 }, { minutos: 5 }]), 45);
  });
  test("un movimiento que ya no cuenta tiene enfrente su contra-asiento, y suman cero", () => {
    assert.equal(saldoDe([
      { id: 1, concepto: "jornada", minutos: 100 },
      { id: 2, concepto: "contra", minutos: -100, referencia_id: 1 },
      { id: 3, concepto: "jornada", minutos: 60 },
    ]), 60);
  });
  test("sin movimientos el saldo es cero, no es null", () => {
    assert.equal(saldoDe([]), 0);
  });
  test("el vigente de un día es el que nadie ha contra-asentado", () => {
    const libro = [
      { id: 1, concepto: "jornada", minutos: 35, clave_idem: "a" },
      { id: 2, concepto: "contra", minutos: -35, referencia_id: 1 },
      { id: 3, concepto: "jornada", minutos: -25, clave_idem: "b" },
    ];
    assert.deepEqual(vigentesDeJornada(libro).map((m) => m.id), [3]);
  });
});

describe("bolsa — recalcular es idempotente", () => {
  // Un turno de 8 h. Los minutos que acaban en el libro salen SIEMPRE de la diferencia con
  // el plan menos la franquicia: aquí se prueba el mecanismo del libro, y por eso los
  // números se eligen para que la franquicia de 10 deje justo la cantidad que se comprueba.
  const base = { workerId: 7, local: "Blanes", dia: "2026-08-08", periodo: "2026-08", autor: "direccion", minPlanificado: 480 };

  test("la primera vez escribe un movimiento", () => {
    const r = movimientosParaJornada({ ...base, minValidado: 525, firma: "A", existentes: [] });
    assert.equal(r.insertar.length, 1);
    assert.equal(r.insertar[0].minutos, 35, "45 de diferencia menos 10 de franquicia");
    assert.equal(r.insertar[0].concepto, "jornada");
    assert.equal(r.insertar[0].dif_min, 45, "y se guarda la diferencia bruta");
    assert.equal(r.insertar[0].tolerancia_min, 10, "y la franquicia que se le aplicó");
  });

  test("RECALCULAR TRES VECES CON LOS MISMOS DATOS = UN SOLO MOVIMIENTO", () => {
    let libro = [];
    for (let i = 0; i < 3; i++) {
      const r = movimientosParaJornada({ ...base, minValidado: 525, firma: "A", existentes: libro });
      libro = libro.concat(r.insertar.map((m, k) => ({ ...m, id: libro.length + k + 1 })));
    }
    assert.equal(libro.length, 1, "el segundo y el tercero no tienen nada que escribir");
    assert.equal(saldoDe(libro), 35);
  });

  test("no se escribe una fila de cero cuando no había nada", () => {
    assert.deepEqual(movimientosParaJornada({ ...base, minValidado: 480, firma: "A", existentes: [] }).insertar, []);
  });

  test("CORREGIR EL DÍA = DOS MOVIMIENTOS NUEVOS Y CERO MODIFICADOS", () => {
    const previo = { id: 1, concepto: "jornada", minutos: 35, clave_idem: claveJornada(7, "2026-08-08", "A") };
    const r = movimientosParaJornada({ ...base, minValidado: 445, firma: "B", existentes: [previo] });

    assert.equal(r.insertar.length, 2);
    assert.equal(r.insertar[0].concepto, "contra");
    assert.equal(r.insertar[0].minutos, -35, "el contra-asiento deja el anterior a cero");
    assert.equal(r.insertar[0].referencia_id, 1, "y apunta a cuál anula");
    assert.equal(r.insertar[1].minutos, -25, "−35 de diferencia más 10 de franquicia");
    assert.equal(r.anular, undefined,
      "no se devuelve nada que modificar: el contra-asiento YA es la anulación");

    const libro = [previo, ...r.insertar.map((m, i) => ({ ...m, id: i + 2 }))];
    assert.equal(saldoDe(libro), -25, "35 − 35 − 25");
    assert.equal(libro.length, 3, "los tres movimientos se quedan: el libro cuenta la historia");
  });

  test("NO SE DESCUENTA DOS VECES: contra-asiento O marca de estado, nunca los dos", () => {
    // El fallo que hubo: además del contra-asiento se marcaba el movimiento viejo, y la
    // corrección se restaba dos veces (salía −60 en lugar de −25).
    const previo = { id: 1, concepto: "jornada", minutos: 35, clave_idem: claveJornada(7, "2026-08-08", "A") };
    const r = movimientosParaJornada({ ...base, minValidado: 445, firma: "B", existentes: [previo] });
    const libro = [previo, ...r.insertar.map((m, i) => ({ ...m, id: i + 2 }))];
    assert.equal(saldoDe(libro), -25);
  });

  test("y volver a recalcular tras la corrección tampoco duplica", () => {
    const previo = { id: 1, concepto: "jornada", minutos: 35, clave_idem: claveJornada(7, "2026-08-08", "A") };
    const r1 = movimientosParaJornada({ ...base, minValidado: 445, firma: "B", existentes: [previo] });
    const libro = [previo, ...r1.insertar.map((m, i) => ({ ...m, id: i + 2 }))];
    const r2 = movimientosParaJornada({ ...base, minValidado: 445, firma: "B", existentes: libro });
    assert.equal(r2.sinCambios, true);
    assert.deepEqual(r2.insertar, []);
    assert.equal(saldoDe(libro), -25, "recalcular no mueve el saldo");
  });

  test("la clave distingue días, personas y versiones del registro", () => {
    assert.notEqual(claveJornada(7, "2026-08-08", "A"), claveJornada(8, "2026-08-08", "A"));
    assert.notEqual(claveJornada(7, "2026-08-08", "A"), claveJornada(7, "2026-08-09", "A"));
    assert.notEqual(claveJornada(7, "2026-08-08", "A"), claveJornada(7, "2026-08-08", "B"));
    assert.equal(claveJornada(7, "2026-08-08", "A"), claveJornada(7, "2026-08-08", "A"));
  });

  test("el hash es estable y no colisiona con lo que se le va a dar", () => {
    assert.equal(hash32("101:entrada:123|102:salida:456"), hash32("101:entrada:123|102:salida:456"));
    const vistos = new Set();
    for (let i = 0; i < 5000; i++) vistos.add(hash32(`101:entrada:${i}|102:salida:${i + 360}`));
    assert.equal(vistos.size, 5000, "5.000 versiones distintas, 5.000 claves distintas");
  });
});

describe("bolsa — periodo cerrado", () => {
  const cierres = [
    { local: "Blanes", etiqueta: "2026-07", desde: "2026-07-01", hasta: "2026-07-31", cerrado_en: "2026-08-03T10:00:00+02:00" },
    { local: "Blanes", etiqueta: "2026-06", desde: "2026-06-01", hasta: "2026-06-30", cerrado_en: "2026-07-02T10:00:00+02:00", reabierto_en: "2026-07-05T09:00:00+02:00" },
    { local: "Lloret", etiqueta: "2026-07", desde: "2026-07-01", hasta: "2026-07-31", cerrado_en: "2026-08-03T10:00:00+02:00" },
  ];

  test("un día de julio en Blanes está cerrado", () => {
    assert.equal(estaCerrado(cierres, "Blanes", "2026-07-15"), true);
  });
  test("agosto no", () => {
    assert.equal(estaCerrado(cierres, "Blanes", "2026-08-01"), false);
  });
  test("un periodo REABIERTO deja de bloquear", () => {
    assert.equal(estaCerrado(cierres, "Blanes", "2026-06-15"), false);
  });
  test("cerrar en un local NO cierra en otro", () => {
    assert.equal(estaCerrado(cierres, "Girona", "2026-07-15"), false);
  });
  test("el mensaje dice qué periodo, desde cuándo y qué hacer", () => {
    const m = motivoBloqueo(cierres, "Blanes", "2026-07-15");
    assert.match(m, /2026-07/);
    assert.match(m, /2026-08-03/);
    assert.match(m, /reabrir/);
  });
  test("sin bloqueo no hay mensaje", () => {
    assert.equal(motivoBloqueo(cierres, "Blanes", "2026-08-01"), null);
  });
});
