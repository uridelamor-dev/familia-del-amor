// La libreta de lo que nos piden y no podemos filtrar.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { claveFalta, ordenarFaltas } from "../../src/modules/marketing/faltan.js";
import { sanearSegmento, describirSegmento } from "../../src/modules/marketing/segmento.js";

describe("agrupar peticiones que son la misma", () => {
  test("da igual cómo se escriba: «con hijos» es una sola línea", () => {
    // Si cada frase creara su línea, la lista sería cien peticiones de una vez cada una, y lo
    // que la hace útil es precisamente el número de veces.
    const claves = ["gente con hijos", "Clientes que tengan hijos", "con hijos", "  HIJOS  "].map(claveFalta);
    assert.equal(new Set(claves).size, 1, claves.join(" | "));
    assert.equal(claves[0], "hijos");
  });

  test("el orden de las palabras no cambia la petición", () => {
    assert.equal(claveFalta("clientes vegetarianos de Blanes"), claveFalta("de Blanes, clientes vegetarianos"));
  });

  test("las tildes y la puntuación tampoco", () => {
    assert.equal(claveFalta("¿nacionalidad española?"), claveFalta("nacionalidad espanola"));
  });

  test("pero dos peticiones distintas siguen siendo dos", () => {
    assert.notEqual(claveFalta("clientes con hijos"), claveFalta("clientes con perro"));
  });

  test("y una frase de puro relleno no crea una línea vacía", () => {
    // Sin esto, «quiero poder filtrar» crearía una entrada con clave "" que se comería todas
    // las demás por el índice único.
    assert.equal(claveFalta("quiero poder filtrar"), "");
    assert.equal(claveFalta("   "), "");
  });
});

describe("qué se enseña primero", () => {
  test("lo más pedido arriba y, a igualdad, lo más reciente", () => {
    // Una petición de hace ocho meses que nadie ha repetido ya no es una prioridad.
    const filas = [
      { que_pidieron: "perro", veces: 2, ultima_vez: "2026-01-05" },
      { que_pidieron: "hijos", veces: 9, ultima_vez: "2026-03-01" },
      { que_pidieron: "coche", veces: 2, ultima_vez: "2026-08-01" },
    ];
    assert.deepEqual(ordenarFaltas(filas).map((f) => f.que_pidieron), ["hijos", "coche", "perro"]);
  });

  test("no toca el array que le dan", () => {
    const filas = [{ veces: 1 }, { veces: 5 }];
    ordenarFaltas(filas);
    assert.equal(filas[0].veces, 1);
  });
});

describe("los filtros nuevos de segmentación", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("la edad NO se calcula convirtiendo a fecha", () => {
    // `to_date('31/02/1970','DD/MM/YYYY')` revienta con «date/time field value out of range» y
    // basta UN contacto con una fecha imposible —se teclean a mano— para que la lista entera
    // deje de cargar. Es el mismo fallo que ya tuvimos con las fechas en blanco.
    // Se miran solo las líneas de CÓDIGO: la única mención que queda es el comentario que
    // explica por qué no se usa, y ese tiene que seguir ahí.
    const codigo = server.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    assert.doesNotMatch(codigo, /to_date\(/, "alguien ha vuelto a convertir la fecha de nacimiento");
    assert.match(server, /substring\(c\.nacimiento,1,4\)::int/);
  });

  test("y quien no tiene fecha de nacimiento no entra en un filtro por edad", () => {
    // Meterla en «mayores de 35» sería inventarse el dato: las dos ramas del CASE no tienen
    // ELSE, así que cualquier otra cosa da NULL y NULL nunca cumple una comparación.
    assert.match(server, /WHEN c\.nacimiento ~ '\^\[0-9\]\{2\}\[\/-\]\[0-9\]\{2\}\[\/-\]\[0-9\]\{4\}\$' THEN substring\(c\.nacimiento,7,4\)::int END/);
  });

  test("«reservó entre» mira la fecha de la reserva, no la última actividad", () => {
    // `ultima_actividad` en un lead es cuándo se tocó su ficha. Dar esa lista por «los que
    // vinieron el mes pasado» es dar otra gente sin decirlo.
    const i = server.indexOf("filtros.reservo_from || filtros.reservo_to");
    assert.ok(i > 0, "falta el filtro por fecha de reserva");
    const fn = server.slice(i, i + 700);
    assert.match(fn, /FROM reservas rr/);
    assert.match(fn, /rr\.dia >= \?/);
  });

  test("el cumpleaños por días contempla el cambio de año", () => {
    // Sin esto, del 28 de diciembre en adelante no felicitaría a nadie.
    assert.match(server, /a <= b\s*\n?\s*\? ` AND \$\{expr\} BETWEEN \$\{a\} AND \$\{b\}`/);
    assert.match(server, /: ` AND \(\$\{expr\} >= \$\{a\} OR \$\{expr\} <= \$\{b\}\)`/);
  });

  test("y los filtros nuevos se guardan en el segmento de la campaña", () => {
    // Si no, una campaña programada saldría a otra gente que la que se vio al crearla, y eso
    // no se nota hasta que ya ha salido.
    assert.match(server, /reservo_from: req\.body\.reservo_from, reservo_to: req\.body\.reservo_to,/);
    assert.match(server, /edad_min: req\.body\.edad_min, edad_max: req\.body\.edad_max, cumple_en_dias: req\.body\.cumple_en_dias,/);
  });
});

describe("el segmento que propone el modelo se sanea antes de usarse", () => {
  const LOC = ["La Tapeta - Blanes", "La Tapeta - Girona", "Oficina"];

  test("lo que no está en la lista de filtros, no entra", () => {
    // Un filtro inventado que se guardara haría una campaña que dice filtrar por algo y no
    // filtra por nada — y eso solo se descubre cuando ya ha salido.
    const { segmento, descartados } = sanearSegmento({ genero: "mujer", tiene_hijos: true, nacionalidad: "española" }, { locales: LOC });
    assert.deepEqual(segmento, { genero: "mujer" });
    assert.equal(descartados.length, 2);
    assert.match(descartados[0].motivo, /no existe/);
  });

  test("ni un valor inventado en un campo que sí existe", () => {
    const { segmento, descartados } = sanearSegmento({ genero: "no binario", origen: "cualquiera" }, { locales: LOC });
    assert.deepEqual(segmento, {});
    assert.equal(descartados.length, 2);
  });

  test("el local tiene que ser uno de verdad, aunque se diga a medias", () => {
    // «Blanes» a secas sí vale —se reconoce—; «Barcelona» no, y no puede colarse como si
    // filtrara por un local.
    assert.equal(sanearSegmento({ local: "blanes" }, { locales: LOC }).segmento.local, "La Tapeta - Blanes");
    assert.equal(sanearSegmento({ local: "Barcelona" }, { locales: LOC }).segmento.local, undefined);
  });

  test("las fechas tienen que ser fechas", () => {
    assert.equal(sanearSegmento({ reservo_from: "el mes pasado" }, { locales: LOC }).segmento.reservo_from, undefined);
    assert.equal(sanearSegmento({ reservo_from: "2026-07-01" }, { locales: LOC }).segmento.reservo_from, "2026-07-01");
  });

  test("una edad al revés se endereza y se dice", () => {
    // «De 50 a 35» devuelve cero personas y se lee como «no hay nadie de esa edad».
    const { segmento, descartados } = sanearSegmento({ edad_min: 50, edad_max: 35 }, { locales: LOC });
    assert.equal(segmento.edad_min, 35);
    assert.equal(segmento.edad_max, 50);
    assert.match(descartados[0].motivo, /se han cambiado/);
  });

  test("y una edad imposible no pasa", () => {
    assert.equal(sanearSegmento({ edad_min: 900 }, { locales: LOC }).segmento.edad_min, undefined);
  });
});

describe("el segmento, en palabras", () => {
  test("dice exactamente lo que filtra", () => {
    assert.equal(
      describirSegmento({ genero: "mujer", origen: "lead", edad_min: 35 }),
      "Mujeres · con ficha completa (leads) · de 35 años o más");
  });

  test("y sin filtros lo dice claro, en vez de callar", () => {
    // Un segmento vacío es «todo el mundo»: eso hay que leerlo antes de enviar, no después.
    assert.equal(describirSegmento({}), "Todos los contactos, sin ningún filtro");
  });

  test("«cumplen hoy» no se confunde con «sin filtro de cumpleaños»", () => {
    // `cumple_en_dias: 0` es falsy: con un `if` a secas desaparecería de la descripción.
    assert.match(describirSegmento({ cumple_en_dias: 0 }), /cumplen años hoy/);
  });

  test("y se ve cuándo la campaña es para PEDIR un dato que falta", () => {
    assert.match(describirSegmento({ sin_nacimiento: 1 }), /NO sabemos la fecha de nacimiento/);
  });
});

describe("el género, que estaba roto", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("se normaliza en la consulta, no solo en el formulario", () => {
    // El formulario mandaba «M»/«F» y la base guarda «hombre»/«mujer»: filtrar por género no
    // devolvía a NADIE, y cero destinatarios se lee como «no hay mujeres», no como «roto».
    // Las campañas YA guardadas llevan «M» dentro de su segmento, así que arreglar solo la
    // pantalla dejaría las programadas saliendo vacías.
    assert.match(server, /\{ m: "hombre", h: "hombre", hombre: "hombre", f: "mujer", mujer: "mujer" \}/);
  });
});
