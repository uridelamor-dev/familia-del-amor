// Lo que sabemos de cada cliente: el cuaderno del camarero, escrito.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { atribucionDudosa, sanearHecho, agruparHechos, resumenHechos, ETIQUETAS } from "../../src/modules/clientes/hechos.js";

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
