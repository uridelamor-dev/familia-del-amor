import test from "node:test";
import assert from "node:assert/strict";
import { porComensalDelDia, valorDeVisita, valorDe, rango, PC_SUELO, PC_TECHO } from "../../src/modules/clientes/valor.js";

test("EL ERROR QUE NO SE PUEDE COMETER: un ticket es una cuenta, no un comensal", () => {
  // 20 mesas, 80 comensales, 4.800 € de venta. El ticket medio es 4800/20 = 240 €… por MESA.
  // La fórmula ingenua `personas × ticket_medio` daría 4×240 = 960 € para una mesa de cuatro,
  // cuando lo que se gastó fueron 240. Aquí el máximo tiene que quedarse en 60 €/comensal.
  const pc = porComensalDelDia({ ventas: 4800, tickets: 20, comensalesReservados: 80, mesasReservadas: 20 });
  assert.equal(pc.min, 60);   // 240 € de ticket medio ÷ 4 de mesa media
  assert.equal(pc.max, 60);   // 4.800 € ÷ 80 comensales
  const v = valorDeVisita({ personas: 4, porComensal: pc });
  assert.equal(v.min, 240);
  assert.equal(v.max, 240);
});

test("cuando hay más gente que la que reserva, el máximo se dispara y por eso es un techo", () => {
  // Mismo día, pero solo la mitad de los comensales venían de reserva: la venta entera
  // repartida entre ellos les atribuye lo que gastaron los que entraron sin avisar.
  const pc = porComensalDelDia({ ventas: 4800, tickets: 20, comensalesReservados: 40, mesasReservadas: 10 });
  assert.equal(pc.min, 60);    // el ticket medio entre la mesa media no cambia
  assert.equal(pc.max, 90);    // 4800/40 = 120, acotado al techo
  assert.ok(pc.min < pc.max, "el intervalo tiene que abrirse, no cerrarse");
});

test("el intervalo nunca sale del revés", () => {
  const pc = porComensalDelDia({ ventas: 100, tickets: 50, comensalesReservados: 60, mesasReservadas: 2 });
  assert.ok(pc.min <= pc.max);
});

test("suelo y techo de cordura", () => {
  // Un día con las ventas mal sincronizadas —900 € y un solo ticket— contaminaría a todo el
  // que estuvo ese día con un gasto absurdo.
  const disparado = porComensalDelDia({ ventas: 900, tickets: 1, comensalesReservados: 2, mesasReservadas: 1 });
  assert.equal(disparado.max, PC_TECHO);
  const ridiculo = porComensalDelDia({ ventas: 4, tickets: 40, comensalesReservados: 100, mesasReservadas: 20 });
  assert.equal(ridiculo.min, PC_SUELO);
});

test("un día sin datos no inventa ninguno", () => {
  assert.equal(porComensalDelDia({ ventas: 0, tickets: 0, comensalesReservados: 4, mesasReservadas: 1 }), null);
  assert.equal(porComensalDelDia({ ventas: 500, tickets: 10, comensalesReservados: 0, mesasReservadas: 0 }), null);
  assert.equal(porComensalDelDia({}), null);
  assert.equal(valorDeVisita({ personas: 4, porComensal: null }), null);
});

test("sin datos de caja NO se dice cero: se dice que no se sabe", () => {
  // Cero y «no lo sabemos» son cosas distintas, y aquí la diferencia es todo: un 0 € se lee
  // como «este cliente no gasta nada». Pasa en los locales sin TPV y en todo lo anterior a Ágora.
  const v = valorDe({ min: null, max: null, visitas: 6, visitasConTpv: 0 });
  assert.equal(v.fiable, false);
  assert.equal(v.min, null);
  assert.match(v.texto, /Sin datos de caja/);
  assert.doesNotMatch(v.texto, /0 €/);
});

test("con poca cobertura se da la cifra, pero diciendo sobre cuántas visitas", () => {
  const v = valorDe({ min: 100, max: 180, visitas: 10, visitasConTpv: 2 });
  assert.equal(v.fiable, false);
  assert.match(v.texto, /solo de 2 de sus 10 visitas/);
});

test("con cobertura suficiente, el rango a secas", () => {
  const v = valorDe({ min: 210, max: 337, visitas: 8, visitasConTpv: 7 });
  assert.equal(v.fiable, true);
  assert.equal(v.texto, "entre 210 y 340 €");
});

test("quien no ha venido nunca no tiene valor, tiene un «todavía»", () => {
  const v = valorDe({ visitas: 0, visitasConTpv: 0 });
  assert.equal(v.fiable, false);
  assert.match(v.texto, /Todavía no ha venido/);
});

test("los euros se redondean a decenas: sin céntimos", () => {
  // Un número con decimales se lee como medido, y esto es un reparto estimado.
  assert.equal(rango(287.45, 341.9), "entre 290 y 340 €");
  // Cuando los dos extremos caen en la misma decena, una sola cifra: «entre 200 y 200» sobra.
  assert.equal(rango(203, 204), "unos 200 €");
  // Y si caen en decenas distintas, el intervalo sale un poco MÁS ancho que el real. Es el
  // lado correcto en el que equivocarse: prometer menos precisión de la que hay.
  assert.equal(rango(204, 206), "entre 200 y 210 €");
  assert.equal(rango(null, 100), "—");
  assert.doesNotMatch(rango(287.45, 341.9), /[,.]\d/);
});

test("el techo no puede pasar del ticket medio: nadie gasta por cabeza más que una cuenta", () => {
  // Salió con datos reales: un día de 20 cuentas del que solo una era reserva repartía los
  // 1.200 € entre los 2 comensales de esa mesa → 600 € por cabeza. Toda cuenta la paga al menos
  // una persona, así que el gasto por comensal nunca supera el ticket medio. Es aritmética.
  const pc = porComensalDelDia({ ventas: 1200, tickets: 20, comensalesReservados: 2, mesasReservadas: 1 });
  assert.equal(pc.max, 60);          // el ticket medio, no los 600
  assert.equal(pc.min, 30);          // 60 de ticket medio ÷ 2 de mesa media
});

test("un rango demasiado ancho NO se enseña: se dice que no se sabe", () => {
  // «Entre 200 y 840 €» es honesto y a la vez inútil: con esa anchura el mismo cliente es el
  // mejor o uno del montón según qué extremo mires.
  const v = valorDe({ min: 200, max: 840, visitas: 3, visitasConTpv: 3 });
  assert.equal(v.fiable, false);
  assert.match(v.texto, /reservó muy poca gente/);
  assert.doesNotMatch(v.texto, /€/);
});

test("un rango razonable sí", () => {
  const v = valorDe({ min: 200, max: 380, visitas: 3, visitasConTpv: 3 });
  assert.equal(v.fiable, true);
  assert.equal(v.texto, "entre 200 y 380 €");
});
