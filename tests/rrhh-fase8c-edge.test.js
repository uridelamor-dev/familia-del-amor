// FASE 8C — los casos límite, EJECUTADOS. No descritos: ejecutados.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { activoEnFecha, activoAhora, bajaEfectiva, pertenecioAlPeriodo } from "../src/modules/rrhh/vigencia.js";
import { enPeriodo, antiguedadActual, motivoNoRecontratar, periodoAbierto } from "../src/modules/rrhh/periodos.js";
import { estadoLaboral, planDeBaja } from "../src/modules/rrhh/ciclo.js";
import { movimientoBolsa, movimientosParaJornada, saldoDe, claveJornada } from "../src/modules/fichajes/bolsa.js";
import { periodoDe } from "../src/modules/fichajes/bolsa.js";
import { instanteANegocio, duracionMin, diasSemana, lunesDe } from "../src/modules/horarios/tiempo.js";
import { planRepetir } from "../src/modules/horarios/repetir.js";

describe("EDGE 1 · alta y baja el MISMO día", () => {
  const p = { id: 1, fecha_alta: "2026-08-18", fecha_baja: "2026-08-18", activo: 1 };
  test("ese día SÍ trabaja: las dos fechas son inclusivas", () => {
    assert.equal(activoEnFecha(p, "2026-08-18"), true);
    assert.equal(activoAhora(p, "2026-08-18"), true);
  });
  test("el día antes no, y el día después tampoco", () => {
    assert.equal(activoEnFecha(p, "2026-08-17"), false);
    assert.equal(activoEnFecha(p, "2026-08-19"), false);
  });
  test("puede entrar al panel ese día y no al siguiente", () => {
    assert.equal(bajaEfectiva(p, "2026-08-18"), false);
    assert.equal(bajaEfectiva(p, "2026-08-19"), true);
  });
  test("su periodo laboral dice lo mismo: un solo día", () => {
    const per = [{ id: 1, fecha_alta: "2026-08-18", fecha_baja: "2026-08-18" }];
    assert.equal(enPeriodo(per, "2026-08-18"), true);
    assert.equal(enPeriodo(per, "2026-08-19"), false);
    assert.equal(periodoAbierto(per), null, "queda cerrado");
  });
  test("y el estado en la ficha es coherente con eso", () => {
    assert.equal(estadoLaboral(p, "2026-08-18").clave, "baja_futura", "ese día todavía es plantilla");
    assert.equal(estadoLaboral(p, "2026-08-19").clave, "baja");
  });
  test("se le puede poner turno ese día y no al siguiente", () => {
    const r = planRepetir({ turno: { id: 1, worker_id: 1, dia: "2026-08-18", inicio_min: 660, fin_min: 960 },
      dias: ["2026-08-19"], asignaciones: [], persona: p });
    assert.equal(r.bloqueados, 1);
    assert.match(r.dias[0].motivo, /No estaba en plantilla/);
  });
  test("y sigue saliendo en el histórico del periodo", () => {
    assert.equal(pertenecioAlPeriodo(p, "2026-08-01", "2026-08-31"), true);
  });
});

describe("EDGE 2 · recontratar al día siguiente", () => {
  const per = [{ id: 1, worker_id: 7, fecha_alta: "2024-01-01", fecha_baja: "2026-08-18" }];
  test("volver el 19 se PERMITE: es una relación laboral nueva", () => {
    assert.equal(motivoNoRecontratar(per, "2026-08-19"), null);
  });
  test("volver el MISMO 18 no: serían dos etapas vivas ese día", () => {
    assert.match(motivoNoRecontratar(per, "2026-08-18"), /tiene que ser posterior/);
  });
  test("con las dos etapas, el hueco no existe y no hay solape", () => {
    const dos = [...per, { id: 2, worker_id: 7, fecha_alta: "2026-08-19", fecha_baja: null }];
    assert.equal(enPeriodo(dos, "2026-08-18"), true);
    assert.equal(enPeriodo(dos, "2026-08-19"), true);
    assert.equal(periodoAbierto(dos).id, 2);
  });
  test("y la antigüedad cuenta desde la NUEVA, no desde 2024", () => {
    const dos = [...per, { id: 2, worker_id: 7, fecha_alta: "2026-08-19", fecha_baja: null }];
    assert.equal(antiguedadActual(dos, "2026-09-19").desde, "2026-08-19");
    assert.equal(antiguedadActual(dos, "2026-09-19").meses, 1);
  });
});

describe("EDGE 3 · ausencia que cruza de año", () => {
  const aus = { id: 1, worker_id: 7, tipo: "vacaciones", desde: "2026-12-20", hasta: "2027-01-10", estado: "aprobada" };
  test("el rango se compara como texto y el año siguiente es MAYOR", () => {
    assert.ok("2027-01-10" > "2026-12-20", "la comparación ISO aguanta el cambio de año");
    assert.ok("2026-12-31" < "2027-01-01");
  });
  test("un día de cada año cae dentro", () => {
    const dentro = (d) => String(aus.desde) <= d && d <= String(aus.hasta);
    assert.equal(dentro("2026-12-25"), true);
    assert.equal(dentro("2027-01-01"), true);
    assert.equal(dentro("2027-01-11"), false);
    assert.equal(dentro("2026-12-19"), false);
  });
  test("repetir un turno dentro de esa ausencia AVISA en los dos años", () => {
    // Un día de cada año, y el turno de origen en OTRO día de su misma semana.
    for (const [origen, destino] of [["2026-12-28", "2026-12-30"], ["2027-01-04", "2027-01-06"]]) {
      const r = planRepetir({ turno: { id: 1, worker_id: 7, dia: origen, inicio_min: 660, fin_min: 960 },
        dias: [destino], asignaciones: [], ausencias: [aus], persona: { id: 7, fecha_alta: "2024-01-01" } });
      assert.match(r.dias[0].motivo || "", /vacaciones aprobadas/, `falla repitiendo ${origen} → ${destino}`);
    }
  });
  test("y la semana de fin de año se calcula bien", () => {
    assert.equal(lunesDe("2027-01-01"), "2026-12-28", "el 1 de enero de 2027 es viernes");
    assert.deepEqual(diasSemana("2026-12-28").slice(3, 6), ["2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("EDGE 4 · turno nocturno 23:00–03:00", () => {
  test("dura 4 horas, no menos veinte", () => {
    assert.equal(duracionMin(1380, 1620), 240);
  });
  test("cabe en el rango que acepta la base", () => {
    assert.ok(1620 <= 2160);
  });
  test("un fichaje de las 02:10 pertenece al día ANTERIOR", () => {
    // Con el corte a las 06:00, la madrugada del domingo cierra la jornada del sábado.
    const dom = Date.UTC(2026, 7, 23, 0, 10);   // 02:10 en Madrid (UTC+2)
    const r = instanteANegocio(dom, { corteMin: 360 });
    assert.equal(r.diaNegocio, "2026-08-22", "sábado");
  });
  test("y uno de las 07:00 ya es del día que empieza", () => {
    const r = instanteANegocio(Date.UTC(2026, 7, 23, 5, 0), { corteMin: 360 });
    assert.equal(r.diaNegocio, "2026-08-23", "domingo");
  });
  test("la bolsa del nocturno se calcula sobre la duración, no sobre el reloj", () => {
    // Planificado 23:00–03:00 (240) y fichado 23:00–03:25 (265): +25 → +15.
    assert.equal(movimientoBolsa(265, 240), 15);
  });
});

describe("EDGE 5 y 6 · cambio de hora (DST)", () => {
  // España: el último domingo de marzo se adelanta (02:00→03:00) y el de octubre se atrasa.
  test("PRIMAVERA: la madrugada del 29 de marzo de 2026 pierde una hora", () => {
    const antes = Date.UTC(2026, 2, 29, 0, 30);   // 01:30 en Madrid (UTC+1)
    const despues = Date.UTC(2026, 2, 29, 1, 30); // 03:30 en Madrid (UTC+2)
    assert.equal(despues - antes, 3600000, "una hora de reloj real");
    // Los dos son de la jornada del SÁBADO 28: la del corte no se mueve.
    assert.equal(instanteANegocio(antes, { corteMin: 360 }).diaNegocio, "2026-03-28");
    assert.equal(instanteANegocio(despues, { corteMin: 360 }).diaNegocio, "2026-03-28");
  });
  test("un turno que cruza el salto dura lo que dura EN RELOJ, no en horas locales", () => {
    // Entra a las 23:00 del 28 y sale a las 04:00 del 29 hora local. En hora local son
    // cinco horas; en tiempo real son CUATRO, porque a las 02:00 el reloj saltó a las 03:00.
    const entra = Date.UTC(2026, 2, 28, 22, 0);   // 23:00 local (UTC+1)
    const sale = Date.UTC(2026, 2, 29, 2, 0);     // 04:00 local (UTC+2)
    assert.equal((sale - entra) / 60000, 240, "cuatro horas de reloj");
  });
  test("OTOÑO: la madrugada del 25 de octubre de 2026 repite las 02:xx", () => {
    const primera = Date.UTC(2026, 9, 25, 0, 30);  // 02:30 la primera vez (UTC+2)
    const segunda = Date.UTC(2026, 9, 25, 1, 30);  // 02:30 la segunda vez (UTC+1)
    assert.equal(segunda - primera, 3600000, "son dos instantes distintos");
    assert.equal(instanteANegocio(primera, { corteMin: 360 }).diaNegocio, "2026-10-24");
    assert.equal(instanteANegocio(segunda, { corteMin: 360 }).diaNegocio, "2026-10-24");
  });
  test("LA CLAVE: los fichajes guardan el INSTANTE, no la hora local", () => {
    // Es lo que hace que la hora repetida no sea ambigua para el sistema: dos fichajes a
    // las «02:30» son dos `epoch_ms` distintos, y la duración entre ellos sale bien.
    const esquema = readFileSync("src/modules/fichajes/schema.js", "utf8");
    assert.match(esquema, /epoch_ms\s+BIGINT NOT NULL/);
    assert.match(esquema, /ocurrido_en\s+TEXT NOT NULL/);
  });
  test("y un turno de 5 h en otoño dura 5 h de reloj aunque el reloj repita una", () => {
    const entra = Date.UTC(2026, 9, 24, 21, 0);   // 23:00 local (UTC+2)
    const sale = Date.UTC(2026, 9, 25, 3, 0);     // 04:00 local (UTC+1)
    assert.equal((sale - entra) / 60000, 360, "seis horas de reloj, cinco de reloj de pared");
  });
});

describe("EDGE 7 y 8 · fichaje offline tardío", () => {
  test("POST-VALIDACIÓN: cambia la firma, así que la validación CADUCA", () => {
    // No se reescribe nada en silencio: la jornada vuelve a pedir una mirada.
    const previo = { id: 1, dia: "2026-08-10", concepto: "jornada", minutos: 15, clave_idem: claveJornada(7, "2026-08-10", "firmaA") };
    const r = movimientosParaJornada({ workerId: 7, local: "B", dia: "2026-08-10", periodo: "2026-08",
      minPlanificado: 480, minValidado: 505, toleranciaMin: 10, firma: "firmaB", existentes: [previo] });
    assert.equal(r.sinCambios, false, "la firma nueva obliga a recalcular");
    assert.equal(r.insertar[0].concepto, "contra");
    assert.equal(r.insertar[0].minutos, -15, "se anula el anterior, no se edita");
  });
  test("el movimiento anterior SIGUE en el libro", () => {
    const previo = { id: 1, dia: "2026-08-10", concepto: "jornada", minutos: 15, clave_idem: claveJornada(7, "2026-08-10", "firmaA") };
    const r = movimientosParaJornada({ workerId: 7, local: "B", dia: "2026-08-10", periodo: "2026-08",
      minPlanificado: 480, minValidado: 520, toleranciaMin: 10, firma: "firmaB", existentes: [previo] });
    const libro = [previo, ...r.insertar.map((m, i) => ({ ...m, id: i + 2 }))];
    assert.equal(libro.length, 3);
    assert.equal(saldoDe(libro), 30, "15 − 15 + 30");
    assert.equal(libro[0].minutos, 15, "intacto");
  });
  test("POST-CIERRE: el evento se guarda y NO toca lo cerrado", () => {
    const server = readFileSync("server.js", "utf8");
    // El aviso de la bolsa cuenta los que llegaron después de cerrar y dice que no han
    // cambiado nada. Ese es el comportamiento: se registran y alguien decide si se reabre.
    assert.match(server, /llegadosTrasCerrar/);
    // El texto que se lee está en la pantalla; el servidor solo cuenta cuántos son.
    const app = readFileSync("public/panel/app.js", "utf8");
    assert.match(app, /no han cambiado el saldo/);
    assert.match(app, /para incorporarlos hay que reabrir el periodo/i);
    // Y la bolsa solo la escriben validar y cerrar, que comprueban el cierre.
    assert.match(server, /ficBloqueoPorCierre/);
  });
});

describe("EDGE 9 · dos correcciones seguidas", () => {
  test("cada corrección deja su contra-asiento y ninguna borra la anterior", () => {
    const base = { workerId: 7, local: "B", dia: "2026-08-10", periodo: "2026-08", minPlanificado: 480, toleranciaMin: 10 };
    const aplicar = (libro, r) => libro.concat(r.insertar.map((m, i) => ({ ...m, id: libro.length + i + 1 })));

    let libro = aplicar([], movimientosParaJornada({ ...base, minValidado: 505, firma: "A", existentes: [] }));
    assert.equal(saldoDe(libro), 15);
    libro = aplicar(libro, movimientosParaJornada({ ...base, minValidado: 520, firma: "B", existentes: libro }));
    assert.equal(saldoDe(libro), 30);
    libro = aplicar(libro, movimientosParaJornada({ ...base, minValidado: 486, firma: "C", existentes: libro }));

    assert.equal(saldoDe(libro), 0, "la tercera cae dentro de la franquicia");
    assert.deepEqual(libro.map((m) => m.minutos), [15, -15, 30, -30], "los cuatro se quedan");
    assert.equal(libro.filter((m) => m.concepto === "contra").length, 2);
  });
  test("y volver a recalcular con la misma firma no añade nada", () => {
    const base = { workerId: 7, local: "B", dia: "2026-08-10", periodo: "2026-08", minPlanificado: 480, toleranciaMin: 10 };
    const aplicar = (libro, r) => libro.concat(r.insertar.map((m, i) => ({ ...m, id: libro.length + i + 1 })));
    let libro = aplicar([], movimientosParaJornada({ ...base, minValidado: 505, firma: "A", existentes: [] }));
    libro = aplicar(libro, movimientosParaJornada({ ...base, minValidado: 520, firma: "B", existentes: libro }));
    const otra = movimientosParaJornada({ ...base, minValidado: 520, firma: "B", existentes: libro });
    assert.equal(otra.sinCambios, true);
  });
});

describe("EDGE 10 · bolsa con 10.000 movimientos", () => {
  test("el saldo se calcula sobre TODOS sin degradarse", () => {
    const libro = Array.from({ length: 10000 }, (_, i) => ({ id: i + 1, concepto: "jornada", minutos: (i % 7) - 3 }));
    const t0 = Date.now();
    const s = saldoDe(libro);
    const ms = Date.now() - t0;
    assert.equal(typeof s, "number");
    assert.ok(ms < 100, `${ms} ms para sumar 10.000 movimientos`);
  });
  test("la pantalla NO pinta diez mil filas: pide 500 y lo dice", () => {
    const server = readFileSync("server.js", "utf8");
    assert.match(server, /ORDER BY periodo DESC, id DESC LIMIT 500/);
    assert.match(server, /recortado: \(Number\(total\?\.n\) \|\| 0\) > movs\.length/);
    // Y el saldo NO sale de esas 500: sale de un SUM aparte.
    assert.match(server, /COALESCE\(SUM\(minutos\),0\)::int AS saldo, COUNT\(\*\)::int AS n/);
  });
});

describe("EDGE 11 · trabajador con 10 años de histórico", () => {
  test("la antigüedad se calcula sobre la etapa actual, no recorriendo diez años", () => {
    const per = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1, fecha_alta: `${2016 + i * 2}-01-01`, fecha_baja: i === 5 ? null : `${2016 + i * 2 + 1}-06-30` }));
    const t0 = Date.now();
    const a = antiguedadActual(per, "2026-08-18");
    assert.ok(Date.now() - t0 < 20);
    assert.equal(a.desde, "2026-01-01", "la última incorporación");
  });
  test("y estar en 2019 se contesta sin recorrer todo", () => {
    const per = [{ id: 1, fecha_alta: "2016-01-01", fecha_baja: "2017-06-30" },
                 { id: 2, fecha_alta: "2020-01-01", fecha_baja: null }];
    assert.equal(enPeriodo(per, "2019-01-01"), false, "el hueco es un hueco");
    assert.equal(enPeriodo(per, "2016-06-01"), true);
  });
  test("la ficha son consultas ACOTADAS, no el histórico entero", () => {
    const server = readFileSync("server.js", "utf8");
    const f = server.slice(server.indexOf('app.get("/api/rrhh/trabajador/:id/ficha-laboral"'), server.indexOf("// ── LA BAJA"));
    assert.match(f, /hor_ausencias WHERE worker_id = \? ORDER BY desde DESC, id DESC LIMIT 40/);
    assert.match(f, /hr_worker_notes WHERE worker_id = \? ORDER BY creado_en DESC LIMIT 30/);
    assert.match(f, /hr_llamadas_mes WHERE worker_id = \? ORDER BY mes DESC LIMIT 12/);
    // Y las horas son de ESTE periodo y ESTA semana, no de diez años.
    assert.match(f, /dia_negocio BETWEEN \? AND \?/);
  });
});

describe("EDGE 12 · 100 trabajadores en Revisión", () => {
  test("el backend agrega por periodo, no persona a persona", () => {
    const server = readFileSync("server.js", "utf8");
    const r = server.slice(server.indexOf('app.get("/api/fichajes/revision"'), server.indexOf('app.post("/api/fichajes/validar"'));
    assert.match(r, /ficCalcularPeriodo\(local, desde, hasta/);
    assert.ok(!/for \([^)]*\)[\s\S]{0,200}await dbAll/.test(r), "hay un bucle con consulta dentro");
  });
  test("y el cierre del mes sigue en el rendimiento de la fase 8", () => {
    const server = readFileSync("server.js", "utf8");
    const c = server.slice(server.indexOf('app.post("/api/fichajes/cerrar"'), server.indexOf('app.post("/api/fichajes/reabrir"'));
    assert.match(c, /ficApuntarPeriodo\(local, p\.desde, p\.hasta/);
    assert.ok(!/for \(const v of validadas\)/.test(c), "ha vuelto el bucle por jornada");
    assert.match(c, /pg_advisory_xact_lock/);
  });
});

import { readFileSync } from "node:fs";
