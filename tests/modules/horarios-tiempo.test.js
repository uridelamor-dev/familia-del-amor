import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  instanteMadrid, offsetMinutos, isoConOffset, epochDeLocal,
  aDias, deDias, sumaDias, diasEntre, diaSemana, lunesDe, diasSemana,
  aMinutos, deMinutos, franjaCorta, duracionMin, solapan, descansoHoras,
  diaDeNegocio, instanteANegocio,
} from "../../src/modules/horarios/tiempo.js";
import { diasEntre as diasEntreFicha } from "../../src/modules/rrhh/ficha.js";

describe("tiempo — reloj de Madrid", () => {
  test("en invierno va una hora por delante de UTC", () => {
    const inv = Date.UTC(2026, 0, 15, 12, 0, 0); // 15 enero, 12:00 UTC
    assert.equal(offsetMinutos(inv), 60);
    assert.equal(instanteMadrid(inv).hora.slice(0, 5), "13:00");
  });
  test("en verano va dos horas por delante", () => {
    const ver = Date.UTC(2026, 6, 15, 12, 0, 0); // 15 julio
    assert.equal(offsetMinutos(ver), 120);
    assert.equal(instanteMadrid(ver).hora.slice(0, 5), "14:00");
  });

  test("EL BUG QUE EVITAMOS: a las 00:30 de Madrid, en UTC todavía es ayer", () => {
    // 8 de agosto a las 00:30 en Madrid = 7 de agosto a las 22:30 UTC.
    const epoch = Date.UTC(2026, 7, 7, 22, 30, 0);
    assert.equal(new Date(epoch).toISOString().slice(0, 10), "2026-08-07", "así lo ve el resto del proyecto");
    assert.equal(instanteMadrid(epoch).fecha, "2026-08-08", "así es en realidad aquí");
  });

  test("el instante se guarda con su offset real", () => {
    assert.equal(isoConOffset(Date.UTC(2026, 7, 9, 0, 10, 0)), "2026-08-09T02:10:00+02:00");
    assert.equal(isoConOffset(Date.UTC(2026, 0, 9, 1, 10, 0)), "2026-01-09T02:10:00+01:00");
  });

  test("ida y vuelta: hora local → epoch → hora local", () => {
    const { epochMs, ajustado } = epochDeLocal("2026-08-09", 20 * 60 + 30);
    assert.equal(ajustado, false);
    const i = instanteMadrid(epochMs);
    assert.equal(i.fecha, "2026-08-09");
    assert.equal(i.minutoDia, 20 * 60 + 30);
  });
});

describe("tiempo — las dos noches del cambio de hora", () => {
  // 2026-03-29: a las 02:00 el reloj salta a las 03:00. Esa hora NO EXISTE.
  test("marzo: las 02:30 no existen, se desplazan hacia delante", () => {
    const r = epochDeLocal("2026-03-29", 2 * 60 + 30);
    assert.equal(r.ajustado, true, "debe avisar de que la hora pedida no existía");
    assert.equal(r.real, "2026-03-29 03:30");
  });

  test("marzo: un turno 20:00→03:00 dura 6 horas REALES, no 7", () => {
    const ini = epochDeLocal("2026-03-28", 20 * 60).epochMs;
    const fin = epochDeLocal("2026-03-29", 3 * 60).epochMs;
    assert.equal((fin - ini) / 3600000, 6, "el reloj de pared dice 7, el tiempo real son 6");
    // Y lo PLANIFICADO sigue midiendo 7, porque el plan es intención de reloj de pared:
    assert.equal(duracionMin(1200, 1620) / 60, 7);
  });

  test("octubre: las 02:00-03:00 pasan dos veces; un 20:00→03:00 dura 8 horas", () => {
    const ini = epochDeLocal("2026-10-24", 20 * 60).epochMs;
    const fin = epochDeLocal("2026-10-25", 3 * 60).epochMs;
    assert.equal((fin - ini) / 3600000, 8);
  });

  test("octubre: en el solape se toma la primera ocurrencia", () => {
    const r = epochDeLocal("2026-10-25", 2 * 60 + 30);
    assert.equal(offsetMinutos(r.epochMs), 120, "la primera vez que son las 02:30 aún es horario de verano");
  });
});

describe("tiempo — calendario", () => {
  test("coincide con la aritmética de RR.HH. en 3000 fechas seguidas", () => {
    // Las dos implementan Hinnant por separado; si divergen, algo se ha roto.
    let f = "2024-01-01";
    for (let i = 0; i < 3000; i++) {
      const sig = sumaDias(f, 1);
      assert.equal(diasEntre(f, sig), diasEntreFicha(f, sig), `en ${f}`);
      f = sig;
    }
  });
  test("los años bisiestos salen bien", () => {
    assert.equal(sumaDias("2024-02-28", 1), "2024-02-29");
    assert.equal(sumaDias("2026-02-28", 1), "2026-03-01");
    assert.equal(diasEntre("2024-02-28", "2024-03-01"), 2);
  });
  test("0 = lunes, 6 = domingo", () => {
    assert.equal(diaSemana("2026-08-10"), 0, "10/08/2026 es lunes");
    assert.equal(diaSemana("2026-08-16"), 6, "16/08/2026 es domingo");
  });
  test("la semana de cualquier día empieza en su lunes", () => {
    assert.equal(lunesDe("2026-08-13"), "2026-08-10");
    assert.equal(lunesDe("2026-08-10"), "2026-08-10");
    assert.equal(lunesDe("2026-08-16"), "2026-08-10");
    assert.deepEqual(diasSemana("2026-08-10").at(-1), "2026-08-16");
    assert.equal(diasSemana("2026-08-10").length, 7);
  });
  test("fechas basura devuelven null en vez de una fecha inventada", () => {
    assert.equal(aDias("mañana"), null);
    assert.equal(diaSemana(""), null);
    assert.equal(sumaDias("2026-8-1", 1), null, "exige el formato con ceros");
  });
});

describe("tiempo — turnos que cruzan medianoche", () => {
  test("un 20:00→02:00 se guarda como 1200→1560, sin fecha de fin", () => {
    assert.equal(aMinutos("20:00"), 1200);
    assert.equal(aMinutos("26:00"), 1560, "admite pasar de las 24 h");
    assert.equal(duracionMin(1200, 1560) / 60, 6);
  });
  test("al mostrarlo vuelve al reloj de pared", () => {
    assert.equal(deMinutos(1560), "02:00");
    assert.equal(deMinutos(1560, { formato: "absoluto" }), "26:00");
  });
  test("la etiqueta corta es la del PDF de referencia", () => {
    assert.equal(franjaCorta(660, 900), "11-15");
    assert.equal(franjaCorta(720, 960), "12-16");
    assert.equal(franjaCorta(1200, 1560, { finAbierto: true }), "20-cierre");
    assert.equal(franjaCorta(690, 900), "11:30-15", "las medias se ven, las en punto no");
  });
  test("MEDIANOCHE COMO FINAL SE ESCRIBE 24, no 0", () => {
    // El turno de tarde de la casa es 16:00–00:00 y salía «16-0», que parece una errata
    // —y salía así también en el PDF que se manda al grupo.
    assert.equal(franjaCorta(960, 1440), "16-24");
    assert.equal(franjaCorta(480, 960), "8-16", "las horas normales no cambian");
    assert.equal(franjaCorta(1200, 1560), "20-2", "pasada la medianoche se sigue viendo la hora de reloj");
    assert.equal(franjaCorta(0, 1440), "0-24", "un turno que ocupa el día entero");
  });
  test("dos turnos que se tocan no se solapan", () => {
    assert.equal(solapan({ inicio_min: 660, fin_min: 900 }, { inicio_min: 900, fin_min: 1140 }), false);
    assert.equal(solapan({ inicio_min: 660, fin_min: 900 }, { inicio_min: 840, fin_min: 1140 }), true);
  });
  test("el descanso entre días se mide de verdad", () => {
    // Cierra el viernes a las 23:30 (1410) y entra el sábado a las 08:00 (480): 8,5 h.
    assert.equal(descansoHoras(1410, 480, 1), 8.5);
    // Cierra a las 02:00 del sábado (1560, día de negocio viernes) y entra el sábado a las 12:00.
    assert.equal(descansoHoras(1560, 720, 1), 10);
  });
});

describe("tiempo — día de negocio", () => {
  test("las 02:10 del domingo pertenecen al sábado", () => {
    const r = diaDeNegocio("2026-08-09", 2 * 60 + 10, 360);
    assert.equal(r.dia, "2026-08-08");
    assert.equal(r.minuto, 26 * 60 + 10, "y el minuto pasa de 1440");
  });
  test("las 07:00 del domingo son del domingo", () => {
    assert.deepEqual(diaDeNegocio("2026-08-09", 7 * 60, 360), { dia: "2026-08-09", minuto: 420 });
  });
  test("justo en el corte empieza el día nuevo", () => {
    assert.equal(diaDeNegocio("2026-08-09", 360, 360).dia, "2026-08-09");
    assert.equal(diaDeNegocio("2026-08-09", 359, 360).dia, "2026-08-08");
  });
  test("el corte es configurable por local", () => {
    // Las 05:30: con corte a las 5:00 ya es el día nuevo; con corte a las 6:00, todavía no.
    assert.equal(diaDeNegocio("2026-08-09", 330, 300).dia, "2026-08-09", "corte a las 5:00");
    assert.equal(diaDeNegocio("2026-08-09", 330, 360).dia, "2026-08-08", "corte a las 6:00");
  });

  test("la salida de cierre real cae en el día correcto", () => {
    // Sábado 8 de agosto, cierra a las 02:10 del domingo.
    const r = instanteANegocio(Date.UTC(2026, 7, 9, 0, 10, 0));
    assert.equal(r.fecha, "2026-08-09", "en el calendario es domingo");
    assert.equal(r.diaNegocio, "2026-08-08", "pero la jornada es la del sábado");
    assert.equal(r.iso, "2026-08-09T02:10:00+02:00");
    assert.equal(r.minutoNegocio, 1570);
  });
});
