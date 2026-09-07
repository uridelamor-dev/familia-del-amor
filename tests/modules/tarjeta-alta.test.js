// El alta de la tarjeta que se hace el propio cliente.
//
// El test que de verdad importa aquí es el de la REGLA DE REVELACIÓN. El formulario es público
// y la única prueba de identidad es escribir un teléfono: si la respuesta enseñara la tarjeta
// de un móvil que ya tenía una, cualquiera podría ir probando números ajenos y quedarse con las
// visitas y los descuentos de otra persona. Es una regla de una línea que se rompe sin querer
// el día que alguien quiera «mejorar la experiencia» devolviendo siempre el token.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanearAlta, respuestaAlta, textoWhatsApp, tel9 } from "../../src/modules/tarjeta/alta.js";

const LOCALES = ["La Tapeta - Blanes", "La Tapeta - Lloret", "Oficina"];

describe("saneado del formulario de alta", () => {
  test("un alta normal pasa entera", () => {
    const { alta, descartados } = sanearAlta(
      { nombre: " Marta ", telefono: "+34 600 11 22 33", correo: "marta@ejemplo.com", consent: true },
      { locales: LOCALES });
    assert.equal(alta.nombre, "Marta");
    assert.equal(alta.telefono, "34600112233");
    assert.equal(alta.correo, "marta@ejemplo.com");
    assert.equal(alta.opt_in, true);
    assert.equal(alta.origen, "web");
    assert.equal(alta.local_alta, null);
    assert.deepEqual(descartados, []);
  });

  test("sin nombre o sin teléfono se dice cuál falta, no se traga", () => {
    const a = sanearAlta({ telefono: "600112233" }, { locales: LOCALES });
    assert.equal(a.alta.nombre, "");
    assert.ok(a.descartados.some((d) => d.campo === "nombre"));

    const b = sanearAlta({ nombre: "Marta", telefono: "600" }, { locales: LOCALES });
    assert.equal(b.alta.telefono, "");
    assert.ok(b.descartados.some((d) => d.campo === "telefono"));
  });

  test("el consentimiento NO se marca por defecto", () => {
    // Marcarlo por omisión sería meter a alguien en una lista de difusión porque se hizo una
    // tarjeta de fidelidad, que no es lo mismo y además no es lo que ha aceptado.
    const { alta } = sanearAlta({ nombre: "Marta", telefono: "600112233" }, { locales: LOCALES });
    assert.equal(alta.opt_in, false);
  });

  test("un correo mal escrito se descarta pero el alta sigue", () => {
    const { alta, descartados } = sanearAlta(
      { nombre: "Marta", telefono: "600112233", correo: "esto no es un correo" }, { locales: LOCALES });
    assert.equal(alta.correo, "");
    assert.equal(alta.nombre, "Marta");   // el alta NO se cae por el correo, que es opcional
    assert.ok(descartados.some((d) => d.campo === "correo"));
  });

  test("el local del cartel se comprueba contra la lista real", () => {
    const ok = sanearAlta({ nombre: "M", telefono: "600112233", local: "la tapeta - blanes" }, { locales: LOCALES });
    assert.equal(ok.alta.local_alta, "La Tapeta - Blanes", "debe devolver el nombre canónico, no lo que llegó");
    assert.equal(ok.alta.origen, "local");

    // Un cartel se fotografía y el enlace se edita; `local_alta` acaba en estadísticas.
    const mal = sanearAlta({ nombre: "M", telefono: "600112233", local: "Bar de la esquina" }, { locales: LOCALES });
    assert.equal(mal.alta.local_alta, null);
    assert.equal(mal.alta.origen, "web");
    assert.ok(mal.descartados.some((d) => d.campo === "local"));
  });

  test("el origen NO se acepta del cliente", () => {
    // Si viniera en el cuerpo, cualquiera podría escribir «local» desde su casa y las cuentas
    // del cartel dejarían de significar nada.
    const { alta } = sanearAlta({ nombre: "M", telefono: "600112233", origen: "local" }, { locales: LOCALES });
    assert.equal(alta.origen, "web");
  });

  test("tel9 se queda con los últimos nueve dígitos", () => {
    assert.equal(tel9("+34 600 11 22 33"), "600112233");
    assert.equal(tel9("600112233"), "600112233");
  });
});

describe("qué se le enseña al que envía el formulario", () => {
  test("teléfono NUEVO: se le enseña su tarjeta", () => {
    const r = respuestaAlta({ yaTenia: false, token: "TOK", enviado: true });
    assert.equal(r.revelar, true);
    assert.equal(r.token, "TOK");
  });

  test("teléfono que YA TENÍA tarjeta: NO se revela nada", () => {
    // Ésta es la regla. Si alguien la relaja, aquí salta.
    const r = respuestaAlta({ yaTenia: true, token: "TOK-DE-OTRO", enviado: true });
    assert.equal(r.revelar, false);
    assert.equal(r.token, "", "el token de una tarjeta que ya existía no puede salir de aquí");
  });

  test("el token de otro no aparece en ningún texto de la respuesta", () => {
    const r = respuestaAlta({ yaTenia: true, token: "SECRETO123", enviado: true });
    const todo = JSON.stringify(r);
    assert.ok(!todo.includes("SECRETO123"), "el token se ha colado en algún campo de la respuesta");
  });

  test("las dos ramas dicen lo mismo sobre el WhatsApp", () => {
    // Si una dijera «te lo hemos mandado» y la otra no, la diferencia entre las dos frases
    // sería exactamente el oráculo que la regla intenta no ser.
    const nueva = respuestaAlta({ yaTenia: false, token: "T", enviado: true });
    const vieja = respuestaAlta({ yaTenia: true, token: "T", enviado: true });
    assert.ok(/WhatsApp/i.test(nueva.texto));
    assert.ok(/WhatsApp/i.test(vieja.texto));
  });
});

describe("el mensaje de WhatsApp", () => {
  test("lleva el enlace y saluda por el nombre de pila", () => {
    const t = textoWhatsApp({ nombre: "Marta García", url: "https://x/tarjeta.html?t=A", yaTenia: false });
    assert.ok(t.includes("Marta"));
    assert.ok(!t.includes("García"), "por el nombre de pila, no el nombre completo");
    assert.ok(t.includes("https://x/tarjeta.html?t=A"));
  });

  test("sin nombre no escribe «Hola undefined»", () => {
    const t = textoWhatsApp({ nombre: "", url: "https://x/t" });
    assert.ok(!/undefined|null/.test(t));
    assert.ok(t.startsWith("Hola"));
  });
});
