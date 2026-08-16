// La libreta de lo que nos piden y no podemos filtrar.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { claveFalta, ordenarFaltas } from "../../src/modules/marketing/faltan.js";

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
