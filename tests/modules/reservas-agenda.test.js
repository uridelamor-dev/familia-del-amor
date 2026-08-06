// Reservas — agenda/calendario (lógica pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { turnoDeHora, horaAMin, nivelCarga, ordenarPorHora, agendaDia, sumarDias, diaSemana, lunesDeSemana, diasDeSemana, agendaSemana } from "../../src/modules/reservas/agenda.js";

describe("turnoDeHora / horaAMin", () => {
  test("clasifica comida y cena; fuera → otros", () => {
    assert.equal(turnoDeHora("13:30"), "comida");
    assert.equal(turnoDeHora("14:00"), "comida");
    assert.equal(turnoDeHora("21:00"), "cena");
    assert.equal(turnoDeHora("23:30"), "cena");
    assert.equal(turnoDeHora("18:00"), "otros");
    assert.equal(turnoDeHora(""), "otros");
  });
  test("horaAMin tolera formatos y vacío", () => {
    assert.equal(horaAMin("09:05"), 545);
    assert.equal(horaAMin("bad"), null);
  });
});

describe("nivelCarga", () => {
  test("umbrales por defecto (media>20, alta>40)", () => {
    assert.equal(nivelCarga(10), "baja");
    assert.equal(nivelCarga(21), "media");
    assert.equal(nivelCarga(41), "alta");
    assert.equal(nivelCarga(0), "baja");
  });
  test("umbrales configurables", () => {
    assert.equal(nivelCarga(15, { media: 10, alta: 20 }), "media");
    assert.equal(nivelCarga(25, { media: 10, alta: 20 }), "alta");
  });
});

describe("agendaDia", () => {
  const R = [
    { id: 1, dia: "2026-08-06", hora: "21:00", personas: 4, nombre_reserva: "Ana" },
    { id: 2, dia: "2026-08-06", hora: "13:30", personas: 2, nombre_reserva: "Bea" },
    { id: 3, dia: "2026-08-06", hora: "21:30", personas: 30, nombre_reserva: "Grupo" },
    { id: 4, dia: "2026-08-07", hora: "14:00", personas: 5, nombre_reserva: "Otro día" },
  ];
  test("filtra por día, separa por turno y ordena por hora", () => {
    const a = agendaDia(R, "2026-08-06");
    const comida = a.turnos.find((t) => t.key === "comida");
    const cena = a.turnos.find((t) => t.key === "cena");
    assert.equal(comida.total, 1);
    assert.equal(cena.total, 2);
    assert.equal(cena.reservas[0].id, 1); // 21:00 antes que 21:30
    assert.equal(cena.personas, 34);
    assert.equal(a.totalReservas, 3);
    assert.equal(a.totalPersonas, 36);
  });
  test("carga por turno: cena con 34 personas → media", () => {
    const a = agendaDia(R, "2026-08-06");
    assert.equal(a.turnos.find((t) => t.key === "cena").carga, "media");
  });
  test("día sin reservas → turnos vacíos, sin 'otras horas'", () => {
    const a = agendaDia([], "2026-08-06");
    assert.equal(a.totalReservas, 0);
    assert.ok(!a.turnos.some((t) => t.key === "otros"));
    assert.equal(a.turnos.length, 2);
  });
  test("'otras horas' aparece solo si hay reservas fuera de turno", () => {
    const a = agendaDia([{ dia: "2026-08-06", hora: "18:00", personas: 3 }], "2026-08-06");
    assert.ok(a.turnos.some((t) => t.key === "otros" && t.total === 1));
  });
});

describe("navegación de fechas (pura, sin Date)", () => {
  test("sumarDias cruza fin de mes y de año", () => {
    assert.equal(sumarDias("2026-08-06", 1), "2026-08-07");
    assert.equal(sumarDias("2026-01-31", 1), "2026-02-01");
    assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
    assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
    assert.equal(sumarDias("2024-03-01", -1), "2024-02-29"); // bisiesto
  });
  test("diaSemana: lunes=0 … domingo=6", () => {
    assert.equal(diaSemana("2026-08-03"), 0); // lunes
    assert.equal(diaSemana("2026-08-06"), 3); // jueves
    assert.equal(diaSemana("2026-08-09"), 6); // domingo
  });
  test("lunesDeSemana y diasDeSemana", () => {
    assert.equal(lunesDeSemana("2026-08-06"), "2026-08-03");
    const dias = diasDeSemana("2026-08-03");
    assert.equal(dias.length, 7);
    assert.deepEqual(dias, ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]);
  });
});

describe("agendaSemana", () => {
  test("reparte reservas en sus días y devuelve 7 entradas", () => {
    const R = [
      { dia: "2026-08-03", hora: "13:00", personas: 2 },
      { dia: "2026-08-06", hora: "21:00", personas: 4 },
      { dia: "2026-08-06", hora: "21:30", personas: 6 },
    ];
    const semana = agendaSemana(R, "2026-08-03");
    assert.equal(semana.length, 7);
    assert.equal(semana[0].totalReservas, 1);
    assert.equal(semana[3].totalReservas, 2); // jueves 06
    assert.equal(semana[3].totalPersonas, 10);
    assert.equal(semana[1].totalReservas, 0); // martes vacío
  });
});
