// Lo que sabemos de cada cliente: el cuaderno del camarero, escrito.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { atribucionDudosa, sanearHecho, agruparHechos, resumenHechos, ETIQUETAS,
  mereceLaPena, conversacionesParaLeer, hechosNuevos } from "../../src/modules/clientes/hechos.js";
import { readFileSync } from "node:fs";

describe("«soy celíaca» no es lo mismo que «mi amiga es celíaca»", () => {
  test("hablando de uno mismo, la atribución está clara", () => {
    for (const t of ["soy celíaca", "no puedo tomar gluten", "venimos siempre los martes", "vivo en Girona pero tengo casa aquí"]) {
      assert.equal(atribucionDudosa(t), false, t);
    }
  });

  test("hablando de otra persona, no", () => {
    // El error que esto evita se descubre el día que alguien se fía del dato.
    for (const t of ["mi amiga es celíaca", "mi hijo no come picante", "es para mi mujer", "una compañera es vegana"]) {
      assert.equal(atribucionDudosa(t), true, t);
    }
  });

  test("y sin frase que lo respalde, siempre a mano", () => {
    assert.equal(atribucionDudosa(""), true);
    assert.equal(atribucionDudosa(null), true);
  });
});

describe("qué se guarda y qué no", () => {
  test("solo las etiquetas de la lista: esto es un cuaderno, no un perfil", () => {
    // Guardar cualquier frase que suelte un cliente deja de ser conocerlo y pasa a ser
    // ficharlo.
    assert.equal(sanearHecho({ etiqueta: "religion", valor: "x", texto_original: "soy x" }, { fuente: "whatsapp" }), null);
    assert.ok(sanearHecho({ etiqueta: "dieta", valor: "celíaca", texto_original: "soy celíaca" }, { fuente: "whatsapp" }));
  });

  test("de una conversación no se acepta un hecho sin la frase original", () => {
    // Sin ella no hay forma de comprobarlo, que es justo cuando más falta hace.
    assert.equal(sanearHecho({ etiqueta: "dieta", valor: "celíaca" }, { fuente: "whatsapp" }), null);
    // Escrito a mano en la ficha sí: quien lo escribe ya lo está confirmando.
    assert.ok(sanearHecho({ etiqueta: "dieta", valor: "celíaca" }, { fuente: "panel" }));
  });

  test("lo que saca la IA entra como PROPUESTO, lo que escribe una persona ya va confirmado", () => {
    assert.equal(sanearHecho({ etiqueta: "prefiere_dia", valor: "martes", texto_original: "venimos los martes" }, { fuente: "whatsapp" }).estado, "propuesto");
    assert.equal(sanearHecho({ etiqueta: "prefiere_dia", valor: "martes" }, { fuente: "panel" }).estado, "confirmado");
  });

  test("y si la frase habla de otro, queda marcado aunque la IA lo diera por bueno", () => {
    const h = sanearHecho({ etiqueta: "dieta", valor: "celíaca", texto_original: "mi amiga es celíaca" }, { fuente: "whatsapp" });
    assert.equal(h.atribucion_dudosa, true);
    assert.equal(h.estado, "propuesto");
  });

  test("un valor vacío no crea una etiqueta vacía", () => {
    assert.equal(sanearHecho({ etiqueta: "dieta", valor: "   ", texto_original: "soy celíaca" }, { fuente: "whatsapp" }), null);
  });

  test("la dieta va marcada como sensible, para poder tratarla distinto", () => {
    assert.equal(ETIQUETAS.dieta.sensible, true);
    assert.equal(!!ETIQUETAS.prefiere_dia.sensible, false);
  });
});

describe("cómo se enseña", () => {
  const hechos = [
    { etiqueta: "prefiere_dia", valor: "martes", estado: "confirmado", creado_en: "2026-01-01" },
    { etiqueta: "dieta", valor: "celíaca", estado: "confirmado", creado_en: "2026-03-01" },
    { etiqueta: "dieta", valor: "sin lactosa", estado: "propuesto", creado_en: "2026-08-01" },
    { etiqueta: "otro", valor: "viene en moto", estado: "descartado", creado_en: "2026-02-01" },
  ];

  test("lo descartado no se enseña, pero lo propuesto sí (hay que decidirlo)", () => {
    const g = agruparHechos(hechos);
    assert.deepEqual(g.map((x) => x.etiqueta), ["dieta", "prefiere_dia"]);
    assert.equal(g[0].hechos.length, 2);
  });

  test("dentro de una etiqueta manda lo más reciente", () => {
    // Un dato nuevo no borra el viejo: lo sucede, y el historial explica por qué pone lo que
    // pone.
    assert.equal(agruparHechos(hechos)[0].hechos[0].valor, "sin lactosa");
  });

  test("el resumen de la lista solo lleva lo CONFIRMADO", () => {
    // Una propuesta sin confirmar no puede leerse como un hecho de la ficha.
    assert.equal(resumenHechos(hechos), "celíaca · martes");
  });

  test("y sin nada confirmado, no se inventa una línea", () => {
    assert.equal(resumenHechos([{ etiqueta: "dieta", valor: "x", estado: "propuesto" }]), "");
  });
});

describe("qué conversaciones se leen", () => {
  test("un «ok» no se manda a un modelo", () => {
    // Leer «gracias» con IA es pagar por nada, y son la mitad de los mensajes.
    assert.equal(mereceLaPena(["ok", "gracias", "👍"]), null);
    assert.equal(mereceLaPena([]), null);
  });

  test("pero una frase con contenido sí", () => {
    assert.deepEqual(mereceLaPena(["ok", "soy celíaca, ¿tenéis pan sin gluten?"]),
      ["soy celíaca, ¿tenéis pan sin gluten?"]);
  });

  test("se agrupan por teléfono y se recorta la cola", () => {
    // Cien mensajes cuestan cien veces más de leer, y lo que alguien cuenta de sí mismo suele
    // estar en lo último, no en el «hola» de hace un año.
    const filas = Array.from({ length: 30 }, (_, i) => ({ telefono: "600111222", mensaje: `mensaje con contenido número ${i}` }));
    const convs = conversacionesParaLeer(filas, { maxMensajes: 5 });
    assert.equal(convs.length, 1);
    assert.equal(convs[0].mensajes.length, 5);
    assert.match(convs[0].mensajes[4], /29/, "se queda con los últimos, no con los primeros");
  });

  test("y hay tope de conversaciones por tanda", () => {
    const filas = Array.from({ length: 100 }, (_, i) => ({ telefono: `6001112${String(i).padStart(2, "0")}`, mensaje: "una frase con bastante contenido aquí" }));
    assert.equal(conversacionesParaLeer(filas, { maxConversaciones: 10 }).length, 10);
  });
});

describe("no proponer dos veces lo mismo", () => {
  test("da igual cómo se escriba: «Celíaca» y «celiaca» son el mismo dato", () => {
    assert.deepEqual(hechosNuevos([{ etiqueta: "dieta", valor: "Celíaca" }], [{ etiqueta: "dieta", valor: "celiaca" }]), []);
  });

  test("ni lo que ya se descartó una vez", () => {
    // Volver a proponer cada noche lo que alguien ya dijo que no convierte la ficha en un
    // sitio del que huir. Por eso lo descartado también cuenta como «ya visto».
    const yaHay = [{ etiqueta: "dieta", valor: "vegano", estado: "descartado" }];
    assert.deepEqual(hechosNuevos([{ etiqueta: "dieta", valor: "vegano" }], yaHay), []);
  });

  test("pero un dato nuevo sí pasa", () => {
    assert.equal(hechosNuevos([{ etiqueta: "prefiere_dia", valor: "martes" }], [{ etiqueta: "dieta", valor: "celiaca" }]).length, 1);
  });

  test("y dos propuestas iguales en la misma tanda cuentan como una", () => {
    assert.equal(hechosNuevos([{ etiqueta: "dieta", valor: "celiaca" }, { etiqueta: "dieta", valor: "Celíaca " }], []).length, 1);
  });
});

describe("el extractor, por dentro", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const i = server.indexOf("async function extraerHechosDeConversaciones");
  const fn = server.slice(i, server.indexOf("\n// Cada seis horas", i));

  test("a quien se ha dado de baja no se le lee nada", () => {
    assert.match(fn, /if \(pref\?\.baja\) continue;/);
  });

  test("lo que devuelve el modelo pasa por el saneado, no se guarda tal cual", () => {
    assert.match(fn, /sanearHecho\(h, \{ fuente: "whatsapp" \}\)/);
  });

  test("y se recuerda por dónde iba, para no releer ni pagar dos veces", () => {
    assert.match(fn, /getConfig\("hechos_ultimo_id"\)/);
    assert.match(fn, /setConfig\("hechos_ultimo_id", ultimoId\)/);
  });

  test("al modelo se le dice explícitamente lo de «mi amiga»", () => {
    assert.match(server, /«Mi amiga es celíaca» NO se apunta/);
  });

  test("no corre dos veces a la vez", () => {
    // Dos tandas solapadas leerían las mismas conversaciones y pagarían dos veces.
    assert.match(server, /if \(_extrayendo \|\| !process\.env\.ANTHROPIC_API_KEY\) return \{ saltado: true \};/);
  });
});
