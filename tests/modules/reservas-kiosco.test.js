import test from "node:test";
import assert from "node:assert/strict";
import { resumenDelDia, cabeceraDelDia, acortarBarras, MAX_LISTA } from "../../src/modules/reservas/kiosco.js";

const r = (hora, personas, nombre = "X") => ({ hora, personas, nombre });

test("resumenDelDia — cuenta el día entero aunque solo se pinte lo que queda", () => {
  const out = resumenDelDia([r("13:30", 4), r("14:00", 2), r("21:00", 6)], { ahora: "18:00" });
  assert.equal(out.totalReservas, 3);
  assert.equal(out.totalPersonas, 12);
  assert.equal(out.porLlegar, 1);
  assert.equal(out.personasPorLlegar, 6);
});

test("resumenDelDia — la lista es SOLO lo que queda por llegar", () => {
  // A las seis de la tarde, las mesas de la comida son doce líneas que hay que saltarse.
  const out = resumenDelDia([r("13:30", 4, "Puig"), r("21:00", 6, "Joan")], { ahora: "18:00" });
  assert.equal(out.lista.length, 1);
  assert.equal(out.lista[0].nombre, "Joan");
});

test("resumenDelDia — la mesa de hace veinte minutos SIGUE en la lista: se llega tarde", () => {
  // El margen existe por esto: quitar de la lista la mesa que está entrando por la puerta
  // sería peor que dejarla de más.
  const out = resumenDelDia([r("21:00", 6)], { ahora: "21:20" });
  assert.equal(out.lista.length, 1);
  assert.equal(out.porLlegar, 1);
});

test("resumenDelDia — pasada la media hora larga, sale de la lista", () => {
  const out = resumenDelDia([r("21:00", 6)], { ahora: "21:45" });
  assert.equal(out.lista.length, 0);
  assert.equal(out.porLlegar, 0);
  assert.equal(out.cabecera.principal, "No queda ninguna mesa");
  // Pero el día no desaparece: al cerrar interesa saber cómo ha ido.
  assert.equal(out.cabecera.secundario, "1 reserva hoy · 6 pax");
});

test("resumenDelDia — sin hora salen todas, no se inventa un corte", () => {
  const out = resumenDelDia([r("13:30", 4), r("21:00", 6)]);
  assert.equal(out.lista.length, 2);
  assert.equal(out.cabecera.principal, "2 reservas hoy · 10 pax");
  assert.equal(out.cabecera.secundario, "");
});

test("resumenDelDia — el turno se dice solo si quedan mesas de más de uno", () => {
  const mixto = resumenDelDia([r("13:30", 4), r("21:00", 6)], { ahora: "12:00" });
  assert.deepEqual(mixto.lista.map((x) => x.turno), ["Comida", "Cena"]);
  // Ya de noche solo queda cena: poner «CENA» encima no añade nada, las horas ya lo dicen.
  const soloCena = resumenDelDia([r("13:30", 4), r("21:00", 6)], { ahora: "20:00" });
  assert.deepEqual(soloCena.lista.map((x) => x.turno), [null]);
});

test("resumenDelDia — hay tope, y lo que no cabe se CUENTA, no se esconde", () => {
  const muchas = Array.from({ length: 20 }, (_, i) => r("20:0" + (i % 10), 2, "Mesa " + i));
  const out = resumenDelDia(muchas, { ahora: "19:00" });
  assert.equal(out.lista.length, MAX_LISTA);
  assert.equal(out.mas, 20 - MAX_LISTA);
  // El total sigue diciendo la verdad aunque no se pinten todas.
  assert.equal(out.porLlegar, 20);
});

test("resumenDelDia — con pocas mesas no aparece el «+N más»", () => {
  const out = resumenDelDia([r("21:00", 4), r("21:30", 2)], { ahora: "20:00" });
  assert.equal(out.mas, 0);
});

test("resumenDelDia — la próxima es la primera que no ha pasado", () => {
  const out = resumenDelDia([r("13:30", 4, "Marta"), r("21:00", 6, "Joan"), r("22:00", 2, "Pau")],
    { ahora: "18:00" });
  assert.equal(out.proxima.nombre, "Joan");
  assert.equal(out.proxima.hora, "21:00");
});

test("resumenDelDia — las horas raras no se pierden", () => {
  // Un desayuno de empresa a las 11:00 no cae en comida ni en cena, y tiene que salir igual.
  const out = resumenDelDia([r("11:00", 8, "Empresa")], { ahora: "09:00" });
  assert.equal(out.lista.length, 1);
  assert.equal(out.totalPersonas, 8);
  assert.equal(out.personasPorLlegar, 8);
});

test("resumenDelDia — un día sin reservas no pinta nada", () => {
  const out = resumenDelDia([], { ahora: "13:00" });
  assert.equal(out.totalReservas, 0);
  assert.equal(out.lista.length, 0);
  assert.equal(out.proxima, null);
  assert.equal(out.cabecera, null);   // sin cabecera, el bloque entero se oculta
});

test("resumenDelDia — aguanta basura sin reventar", () => {
  assert.equal(resumenDelDia(null).totalReservas, 0);
  assert.equal(resumenDelDia(undefined).totalPersonas, 0);
  const out = resumenDelDia([{ hora: "", personas: "tres", nombre: null }]);
  assert.equal(out.totalReservas, 1);
  assert.equal(out.totalPersonas, 0);
});

test("resumenDelDia — NUNCA sale el teléfono, aunque venga en la fila", () => {
  // El invariante de esta pantalla: se ve sin sesión, con la llave en la URL de la tablet.
  const out = resumenDelDia([{ hora: "21:00", personas: 2, nombre: "Ana", telefono: "600111222" }],
    { ahora: "20:00" });
  assert.equal(JSON.stringify(out).includes("600111222"), false);
});

test("resumenDelDia — tampoco viajan las mesas que ya han pasado", () => {
  // No es por ahorrar bytes: lo que no se pinta no tiene por qué salir a una ruta pública.
  const out = resumenDelDia([r("13:30", 4, "YaComieron"), r("21:00", 6, "Joan")], { ahora: "20:00" });
  assert.equal(JSON.stringify(out).includes("YaComieron"), false);
});

test("cabeceraDelDia — lo grande es lo que queda; el día, detrás", () => {
  const c = cabeceraDelDia({ totalReservas: 5, totalPersonas: 22, porLlegar: 2, personasPorLlegar: 10 });
  assert.equal(c.principal, "Quedan 2 mesas · 10 pax");
  assert.equal(c.secundario, "5 reservas hoy · 22 pax");
});

test("cabeceraDelDia — singulares", () => {
  // Con tres del día y una por llegar: así se ven las dos frases y el singular de cada una.
  const c = cabeceraDelDia({ totalReservas: 3, totalPersonas: 9, porLlegar: 1, personasPorLlegar: 2 });
  assert.equal(c.principal, "Quedan 1 mesa · 2 pax");
  assert.equal(c.secundario, "3 reservas hoy · 9 pax");
  const solaYPendiente = cabeceraDelDia({ totalReservas: 1, totalPersonas: 2, porLlegar: 1, personasPorLlegar: 2 });
  assert.equal(solaYPendiente.principal, "1 reserva hoy · 2 pax");
});

test("cabeceraDelDia — sin reservas no hay cabecera", () => {
  assert.equal(cabeceraDelDia({ totalReservas: 0 }), null);
  assert.equal(cabeceraDelDia(), null);
});

test("acortarBarras — se quita el pueblo que repiten todas", () => {
  const m = acortarBarras(["La Tapeta - Blanes", "Cooperativa - Blanes"]);
  assert.equal(m.get("La Tapeta - Blanes"), "La Tapeta");
  assert.equal(m.get("Cooperativa - Blanes"), "Cooperativa");
});

test("acortarBarras — con una sola barra no se toca nada", () => {
  const m = acortarBarras(["La Tapeta - Blanes"]);
  assert.equal(m.get("La Tapeta - Blanes"), "La Tapeta - Blanes");
});

test("acortarBarras — si no comparten sufijo se dejan enteras", () => {
  // Mejor un nombre largo que uno equivocado.
  const m = acortarBarras(["Can Mateu - Tordera", "La Tapeta - Blanes"]);
  assert.equal(m.get("Can Mateu - Tordera"), "Can Mateu - Tordera");
  assert.equal(m.get("La Tapeta - Blanes"), "La Tapeta - Blanes");
});

test("acortarBarras — nunca deja un nombre vacío", () => {
  const m = acortarBarras(["Blanes", "Blanes"]);
  assert.equal(m.get("Blanes"), "Blanes");
  for (const v of acortarBarras(["A - Blanes", "A - Blanes", "B - Blanes"]).values()) {
    assert.ok(String(v).trim().length > 0);
  }
});

test("resumenDelDia — en la lista, la barra sale ya acortada", () => {
  const out = resumenDelDia([
    { hora: "21:00", personas: 4, nombre: "Puig", barra: "La Tapeta - Blanes" },
    { hora: "21:30", personas: 2, nombre: "Soler", barra: "Cooperativa - Blanes" },
  ], { ahora: "20:00" });
  assert.deepEqual(out.lista.map((x) => x.barra), ["La Tapeta", "Cooperativa"]);
});

test("cabeceraDelDia — antes de abrir no se dice el mismo número dos veces", () => {
  // «Quedan 20 mesas · 86 pax» + «20 reservas hoy · 86 pax» hace dudar de si son dos datos.
  const c = cabeceraDelDia({ totalReservas: 20, totalPersonas: 86, porLlegar: 20, personasPorLlegar: 86 });
  assert.equal(c.principal, "20 reservas hoy · 86 pax");
  assert.equal(c.secundario, "");
});
