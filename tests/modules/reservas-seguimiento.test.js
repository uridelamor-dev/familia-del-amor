import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { puedePreguntarse, siguesATiempo, enlaceResena, clasificarRespuesta,
  veredictoFinal, respuestaASeguimiento, CONTENTO, DESCONTENTO, DUDOSO, CADA_DIAS }
  from "../../src/modules/reservas/seguimiento.js";

// El seguimiento existía a medias: solo se programaba desde las reservas hechas hablando con
// Sara —las del panel, que son casi todas, no—, no respetaba la lista de bajas, contestaba
// siempre lo mismo dijera lo que dijera el cliente, y no dejaba rastro en ninguna pantalla.

describe("a quién se le puede preguntar", () => {
  test("a quien vino y dejó teléfono", () => {
    assert.equal(puedePreguntarse({ telefono: "666123456", hoy: "2026-08-27" }).ok, true);
  });

  test("NUNCA a quien está de baja en la lista", () => {
    // El seguimiento de antes escribía directo, saltándose el filtro que sí respetan las
    // campañas. Es el fallo que hay que cerrar sí o sí.
    const r = puedePreguntarse({ telefono: "666123456", baja: true, hoy: "2026-08-27" });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "baja");
  });

  test("ni a quien no dejó un teléfono que sirva", () => {
    for (const t of [null, "", "123", "sin teléfono"]) {
      assert.equal(puedePreguntarse({ telefono: t, hoy: "2026-08-27" }).motivo, "sin_telefono");
    }
  });

  test("Y AL HABITUAL SOLO CADA TRES MESES", () => {
    // Sin esto, al mejor cliente —el que viene cada semana— le llega un WhatsApp cada lunes, y
    // acaba bloqueando el número. El freno protege justo a quien más se quiere cuidar.
    const r = puedePreguntarse({ telefono: "666123456", ultimo: "2026-08-01", hoy: "2026-08-27" });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "preguntado_hace_poco");
    assert.equal(r.faltan, CADA_DIAS - 26);
  });

  test("pero pasados los tres meses, otra vez", () => {
    assert.equal(puedePreguntarse({ telefono: "666123456", ultimo: "2026-01-01", hoy: "2026-08-27" }).ok, true);
  });

  test("y si nunca se le preguntó, se le pregunta", () => {
    assert.equal(puedePreguntarse({ telefono: "666123456", ultimo: null, hoy: "2026-08-27" }).ok, true);
  });
});

describe("«ayer estuviste» tiene caducidad", () => {
  test("a su hora, sí", () => {
    assert.equal(siguesATiempo({ enviarA: "2026-08-27T11:00:00", ahora: "2026-08-27T11:02:00" }), true);
  });

  test("PERO NO TRES DÍAS DESPUÉS", () => {
    // Si WhatsApp estuvo caído —lo normal tras cada redespliegue— el mensaje se quedaba
    // esperando y salía igual cuando volvía. Un mensaje que miente es peor que ninguno.
    assert.equal(siguesATiempo({ enviarA: "2026-08-24T11:00:00", ahora: "2026-08-27T11:00:00" }), false);
  });

  test("ni antes de tiempo", () => {
    assert.equal(siguesATiempo({ enviarA: "2026-08-28T11:00:00", ahora: "2026-08-27T11:00:00" }), false);
  });

  test("unas horas de retraso sí se aguantan", () => {
    // El servidor puede haber estado parado media mañana: mandarlo a las 18:00 del mismo día
    // sigue siendo verdad.
    assert.equal(siguesATiempo({ enviarA: "2026-08-27T11:00:00", ahora: "2026-08-27T18:00:00" }), true);
  });
});

describe("el enlace para dejar la reseña", () => {
  test("sale del place_id que ya se guarda al vincular la ficha", () => {
    assert.equal(enlaceResena("ChIJabc123"), "https://search.google.com/local/writereview?placeid=ChIJabc123");
  });
  test("sin ficha vinculada no hay enlace, y no se inventa", () => {
    for (const v of [null, "", "   "]) assert.equal(enlaceResena(v), null);
  });
});

describe("¿fue bien o no?", () => {
  test("las respuestas cortas contentas, que son la mayoría", () => {
    for (const t of ["Muy bien", "todo perfecto", "genial!", "De lujo", "👍", "molt bé", "all good"]) {
      assert.equal(clasificarRespuesta(t), CONTENTO, t);
    }
  });

  test("las quejas", () => {
    for (const t of ["Tardaron mucho", "la comida fría", "fatal", "muy caro", "no volveremos", "el camarero fue borde"]) {
      assert.equal(clasificarRespuesta(t), DESCONTENTO, t);
    }
  });

  test("LO NEGATIVO MANDA cuando aparecen los dos", () => {
    // «Estuvo bien PERO tardaron mucho» no es una persona a la que pedirle una reseña pública.
    assert.equal(clasificarRespuesta("La comida genial pero tardaron muchísimo"), DESCONTENTO);
    assert.equal(clasificarRespuesta("Todo perfecto aunque un poco caro"), DESCONTENTO);
  });

  test("y lo que no se entiende queda en duda, no en contento", () => {
    for (const t of ["", "ok", "Estuvimos 4", "¿?", "mañana te digo"]) {
      assert.equal(clasificarRespuesta(t), DUDOSO, t);
    }
  });
});

describe("la IA puede afinar, pero no ablandar", () => {
  test("si el texto trae una queja clara, no hay IA que lo cambie", () => {
    // Es el caso en el que equivocarse cuesta caro: la palabra escrita por el cliente pesa más.
    assert.equal(veredictoFinal({ deLaIA: CONTENTO, delTexto: DESCONTENTO }), DESCONTENTO);
  });

  test("pero sí puede reconocer un contento que las palabras no cazan", () => {
    assert.equal(veredictoFinal({ deLaIA: CONTENTO, delTexto: DUDOSO }), CONTENTO);
  });

  test("y sin IA manda lo que digan las palabras", () => {
    assert.equal(veredictoFinal({ deLaIA: null, delTexto: CONTENTO }), CONTENTO);
    assert.equal(veredictoFinal({}), DUDOSO);
  });
});

describe("qué se le contesta", () => {
  test("al contento, las gracias Y EL ENLACE", () => {
    const r = respuestaASeguimiento({ veredicto: CONTENTO, nombre: "Marta Soler", local: "Can Mateu - Tordera", enlace: "https://x" });
    assert.equal(r.pideResena, true);
    assert.match(r.texto, /Marta/);
    assert.match(r.texto, /https:\/\/x/);
    assert.equal(r.avisar, false, "una respuesta buena no tiene que interrumpir a nadie");
  });

  test("contento pero sin ficha vinculada: gracias y punto", () => {
    // Pedir una reseña sin decir dónde dejarla es hacerle perder el tiempo a quien acaba de
    // hacerte un favor.
    const r = respuestaASeguimiento({ veredicto: CONTENTO, nombre: "Marta", enlace: null });
    assert.equal(r.pideResena, false);
    assert.ok(!/http/.test(r.texto));
  });

  test("AL DESCONTENTO NUNCA SE LE PIDE RESEÑA", () => {
    // Es la regla de fondo: pedirle una reseña pública a quien acaba de contarte que esperó
    // cuarenta minutos es la forma más rápida de convertir una queja privada en una estrella.
    const r = respuestaASeguimiento({ veredicto: DESCONTENTO, nombre: "Juan", local: "Can Mateu - Tordera", enlace: "https://x" });
    assert.equal(r.pideResena, false);
    assert.ok(!/http/.test(r.texto));
    assert.equal(r.avisar, true, "esto sí tiene que llegarle a alguien hoy");
    assert.match(r.texto, /Can Mateu/);
  });

  test("y al dudoso tampoco, pero también se avisa", () => {
    const r = respuestaASeguimiento({ veredicto: DUDOSO, nombre: "Ana" });
    assert.equal(r.pideResena, false);
    assert.equal(r.avisar, true, "que lo lea una persona");
  });

  test("sin nombre no queda un «¡Hola , !»", () => {
    for (const n of [null, "", "  "]) {
      assert.doesNotThrow(() => respuestaASeguimiento({ veredicto: CONTENTO, nombre: n, enlace: "https://x" }));
      assert.ok(!/ ,|¡ /.test(respuestaASeguimiento({ veredicto: CONTENTO, nombre: n, enlace: "https://x" }).texto));
    }
  });
});
