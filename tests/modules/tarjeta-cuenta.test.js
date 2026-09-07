// La cuenta del cliente: lo que ve al abrir su tarjeta.
//
// Dos cosas que se vigilan aquí y que no son de estilo:
//   · Las visitas salen de `pro_canjes`, no de `pro_qr.usos` ni de `cliente_metricas`. Las tres
//     cifras son distintas y las tres son ciertas para otra pregunta; la única que el cliente
//     puede reconocer como suya es la que hizo un camarero con el escáner.
//   · El gasto estimado NO se le enseña. Es una estimación nuestra para segmentar, y ponerle a
//     alguien delante lo que creemos que se ha gastado es incómodo si acierta y discutible si
//     falla.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { construirCuenta, nombreCorto, codigoLegible, fraseVisitas } from "../../src/modules/tarjeta/cuenta.js";

const QR = { clase: "carnet", token: "TOK", codigo: "12345678", nombre: "Marta", usos: 99 };

const VISITAS = [
  { canjeado_en: "2026-08-28T19:40:00.000Z", local: "La Tapeta - Blanes", promocion: "2x1" },
  { canjeado_en: "2026-07-02T13:10:00.000Z", local: "La Tapeta - Lloret", promocion: null },
];

describe("piezas sueltas", () => {
  test("el nombre del local se acorta para el cliente", () => {
    // «Has venido 7 veces a La Tapeta - Blanes» se lee como un error de programa.
    assert.equal(nombreCorto("La Tapeta - Blanes"), "Blanes");
    assert.equal(nombreCorto("Oficina"), "Oficina");
    assert.equal(nombreCorto(""), "");
  });

  test("el código se parte por la mitad para poder dictarlo", () => {
    assert.equal(codigoLegible("12345678"), "1234 5678");
    assert.equal(codigoLegible("123"), "123");        // lo que no mide ocho se deja como está
    assert.equal(codigoLegible(null), "");
  });

  test("la frase de las visitas contempla el cero y el uno", () => {
    // El caso de cero es el que más gente ve: el día que se hace la tarjeta.
    assert.match(fraseVisitas(0), /Todavía/);
    assert.match(fraseVisitas(1), /1 vez\./);
    assert.match(fraseVisitas(7), /7 veces\./);
  });
});

describe("la cuenta entera", () => {
  test("las visitas se cuentan del libro de canjes, no de pro_qr.usos", () => {
    // `usos` vale 99 en el carné de prueba a propósito: si alguien lo usara para contar, aquí
    // saldría 99 en vez de 2.
    const c = construirCuenta({ qr: QR, visitas: VISITAS, metricas: { visitas: 40 } });
    assert.equal(c.resumen.visitas, 2);
  });

  test("la última visita se cuenta con fecha, hora y local", () => {
    const c = construirCuenta({ qr: QR, visitas: VISITAS });
    assert.match(c.ultima_visita.texto, /28 de agosto/);
    assert.match(c.ultima_visita.texto, /Blanes/);
    assert.ok(!/La Tapeta/.test(c.ultima_visita.texto), "al cliente se le dice el sitio, no la nomenclatura interna");
  });

  test("sin visitas no se inventa una última visita", () => {
    const c = construirCuenta({ qr: QR, visitas: [] });
    assert.equal(c.ultima_visita, null);
    assert.equal(c.resumen.visitas, 0);
  });

  test("los locales salen de los canjes; si no hay, de las métricas", () => {
    const conCanjes = construirCuenta({ qr: QR, visitas: VISITAS, metricas: { locales: "Oficina" } });
    assert.deepEqual(conCanjes.locales, ["Blanes", "Lloret"]);

    const sinCanjes = construirCuenta({ qr: QR, visitas: [], metricas: { locales: "La Tapeta - Girona, Oficina" } });
    assert.deepEqual(sinCanjes.locales, ["Girona", "Oficina"]);
  });

  test("EL GASTO ESTIMADO NO SALE POR NINGÚN LADO", () => {
    const c = construirCuenta({
      qr: QR, visitas: VISITAS,
      metricas: { visitas: 40, gasto_est_min: 350, gasto_est_max: 900, comensales_total: 88 },
    });
    const todo = JSON.stringify(c);
    assert.ok(!todo.includes("350"), "el gasto estimado mínimo se ha colado");
    assert.ok(!todo.includes("900"), "el gasto estimado máximo se ha colado");
    assert.ok(!/gasto/i.test(todo), "aparece la palabra «gasto» en algo que ve el cliente");
  });

  test("los descuentos se separan en disponibles y usados", () => {
    const c = construirCuenta({
      qr: QR, visitas: [],
      cupones: [
        { token: "A", codigo: "11112222", estado: "valido", texto: "",
          promo: { nombre: "10 %", descripcion: "", locales: "", hasta: null } },
        { token: "B", codigo: "33334444", estado: "agotado", texto: "Ya se usó el 3 de septiembre.",
          promo: { nombre: "Postre", descripcion: "", locales: "La Tapeta - Blanes", hasta: null } },
      ],
    });
    assert.equal(c.descuentos.disponibles.length, 1);
    assert.equal(c.descuentos.disponibles[0].nombre, "10 %");
    assert.equal(c.descuentos.usados.length, 1);
    // El motivo viene YA REDACTADO del servidor, con la misma función que la barra: aquí no se
    // vuelve a decidir si vale.
    assert.match(c.descuentos.usados[0].texto, /Ya se usó/);
  });

  test("«dónde vale» se calcula de los locales de la promoción, no se copia de la descripción", () => {
    const c = construirCuenta({
      qr: QR, visitas: [],
      cupones: [{ token: "A", codigo: "1", estado: "valido",
        promo: { nombre: "X", descripcion: "", locales: "La Tapeta - Blanes", hasta: null } }],
    });
    assert.match(c.descuentos.disponibles[0].donde, /Válido en La Tapeta - Blanes/);
  });

  test("sin carné no hay cuenta", () => {
    assert.equal(construirCuenta({ qr: null }), null);
  });
});
