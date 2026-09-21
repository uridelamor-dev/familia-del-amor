// LA HERRAMIENTA DE CENSO NO PUEDE ESCRIBIR NI FILTRAR DATOS PERSONALES.
//
// ── POR QUÉ MERECE TESTS UNA HERRAMIENTA DE `tools/` ─────────────────────────────────────────
//
// Porque se ejecuta A MANO, en producción, contra la base de verdad, y su salida se pega en un
// chat. Las dos cosas que pueden salir mal ahí son irreversibles: escribir algo sin querer, y
// dejar un teléfono de un cliente en una conversación.
//
// Nada de esto necesita base de datos: se lee el fichero y se comprueba su SQL. Es una prueba de
// forma, no de comportamiento, y se dice claramente para que nadie la confunda con una garantía
// de que la herramienta devuelve los números correctos — eso solo lo dice ejecutarla en Replit.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RUTA = new URL("../tools/censo-campana.mjs", import.meta.url);
const CRUDO = readFileSync(RUTA, "utf8");

/**
 * El fichero sin comentarios.
 *
 * Hace falta porque los comentarios de esta casa explican lo que la herramienta NO hace —«No hay
 * UPDATE, ni INSERT, ni DELETE»— y una búsqueda ingenua de esas palabras encontraría justo la
 * frase que promete lo contrario. Sin esto, el test fallaría por el comentario que lo documenta.
 */
function sinComentarios(js) {
  let fuera = "", i = 0;
  while (i < js.length) {
    const c = js[i];
    // Las plantillas llevan el SQL dentro y NO se tocan: es lo que hay que inspeccionar.
    if (c === '"' || c === "'" || c === "`") {
      const fin = c; fuera += c; i++;
      while (i < js.length && js[i] !== fin) {
        if (js[i] === "\\") { fuera += js[i]; i++; }
        if (i < js.length) { fuera += js[i]; i++; }
      }
      if (i < js.length) { fuera += js[i]; i++; }
      continue;
    }
    if (c === "/" && js[i + 1] === "*") {
      const cierre = js.indexOf("*/", i + 2);
      i = cierre === -1 ? js.length : cierre + 2;
      continue;
    }
    if (c === "/" && js[i + 1] === "/") {
      const salto = js.indexOf("\n", i);
      i = salto === -1 ? js.length : salto;
      continue;
    }
    fuera += c; i++;
  }
  return fuera;
}

const CODIGO = sinComentarios(CRUDO);

/** Las consultas SQL del fichero: todo lo que va entre acentos graves y parece SQL. */
const CONSULTAS = [...CODIGO.matchAll(/`([^`]*)`/g)]
  .map((m) => m[1])
  .filter((t) => /\bSELECT\b/i.test(t));

describe("la herramienta de censo solo lee", () => {
  test("no hay ni una sentencia de escritura fuera de los comentarios", () => {
    const escrituras = [...CODIGO.matchAll(/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|DROP|TRUNCATE|ALTER\s+TABLE|CREATE\s+TABLE)\b/gi)]
      .map((m) => m[0]);
    assert.deepEqual(escrituras, [],
      "la herramienta puede escribir en producción: " + escrituras.join(", "));
  });

  test("todas sus consultas empiezan por SELECT", () => {
    assert.ok(CONSULTAS.length >= 8, `solo se han encontrado ${CONSULTAS.length} consultas`);
    for (const sql of CONSULTAS) {
      const primera = sql.trim().split(/\s+/)[0].toUpperCase();
      assert.equal(primera, "SELECT", `una consulta empieza por «${primera}»:\n${sql.slice(0, 120)}`);
    }
  });

  test("no importa WhatsApp por ninguna vía", () => {
    // Se miran las IMPORTACIONES, no la palabra: el informe imprime «WhatsApp conectado …» como
    // texto, y buscar la palabra a secas fallaría por la propia salida que tiene que existir.
    const importa = [...CODIGO.matchAll(/(?:^|\s)import\s[^;]*?from\s*["'`]([^"'`]+)["'`]|await import\(\s*["'`]([^"'`]+)["'`]/g)]
      .map((m) => m[1] || m[2]);
    assert.deepEqual(importa.filter((x) => /whatsapp|baileys/i.test(x)), [],
      "importa whatsapp: ejecutar un censo no puede poder mandar un mensaje");
    assert.deepEqual(importa.sort(), ["../src/modules/captacion/recuperacion.js", "pg"],
      `importa algo inesperado: ${importa.join(", ")}`);
    assert.ok(!/sendMensaje|proEnviarWA|capVaciarCola/.test(CODIGO),
      "llama a algo que envía");
  });

  test("no emite códigos ni toca la identidad del cliente", () => {
    assert.ok(!/proEmitir|pro_qr\s+SET|generarToken/.test(CODIGO),
      "la herramienta crea o modifica códigos");
  });
});

describe("la herramienta de censo no filtra datos personales", () => {
  // La salida es lo único que sale de la máquina. Se mira lo que se IMPRIME, no lo que se
  // consulta: el censo necesita leer `telefono` para cruzar cada lead con su código, y eso está
  // bien mientras el teléfono no llegue nunca a la pantalla.
  const IMPRESIONES = [...CODIGO.matchAll(/console\.(log|error)\(([\s\S]*?)\);/g)].map((m) => m[2]);

  test("ninguna impresión menciona un dato personal", () => {
    const PROHIBIDO = /\b(telefono|correo|email|password|token|hash|apellidos|nacimiento)\b/i;
    const malas = IMPRESIONES.filter((t) => PROHIBIDO.test(t));
    assert.deepEqual(malas.map((t) => t.slice(0, 80)), [],
      "una impresión lleva datos personales dentro");
  });

  test("el modo descubrir no selecciona ni una columna personal", () => {
    // En descubrir todo son agregados. Si alguna consulta suya trae un teléfono o un token, es
    // que alguien ha añadido una columna de detalle y hay que pararlo aquí.
    const i = CODIGO.indexOf("async function descubrir");
    const j = CODIGO.indexOf("async function censoDe");
    assert.ok(i > 0 && j > i, "no se encuentran los dos modos en el fichero");
    const sqlDescubrir = [...CODIGO.slice(i, j).matchAll(/`([^`]*)`/g)]
      .map((m) => m[1]).filter((t) => /\bSELECT\b/i.test(t));
    assert.ok(sqlDescubrir.length >= 7, `el modo descubrir solo tiene ${sqlDescubrir.length} consultas`);
    for (const sql of sqlDescubrir) {
      const lista = sql.slice(0, sql.search(/\bFROM\b/i));
      assert.ok(!/\b(telefono|correo|email|token|password_hash|apellidos)\b/i.test(lista),
        `una consulta de «descubrir» trae una columna personal:\n${lista.slice(0, 140)}`);
    }
  });

  test("el censo lee el teléfono para cruzar, pero solo dentro de la consulta", () => {
    // Es la excepción justificada, y conviene que esté escrita: sin `telefono` no se puede unir
    // un lead con su código. Lo que no puede es salir por pantalla, y eso lo cubre el test de
    // arriba. Aquí solo se comprueba que la excepción sigue viviendo donde debe.
    const i = CODIGO.indexOf("async function censoDe");
    assert.ok(i > 0);
    assert.match(CODIGO.slice(i), /l\.telefono/,
      "el censo ya no cruza por teléfono: revisa cómo empareja cada lead con su código");
  });
});

describe("los dos modos siguen existiendo", () => {
  test("`--descubrir` y `<clave>` están cableados a funciones distintas", () => {
    assert.match(CODIGO, /const DESCUBRIR = args\.includes\("--descubrir"\)/);
    assert.match(CODIGO, /if \(DESCUBRIR\) await descubrir\(\);\s*else await censoDe\(clave\);/,
      "el despacho entre los dos modos ha cambiado de forma");
  });

  test("sin argumentos explica los dos modos y no se conecta a nada", () => {
    const i = CODIGO.indexOf("if (!DESCUBRIR && !clave)");
    assert.ok(i > 0, "ya no se comprueba que falten los argumentos");
    assert.ok(i < CODIGO.indexOf("new pg.Pool"),
      "la comprobación de argumentos tiene que ir ANTES de abrir la conexión");
    // El índice es de CODIGO, así que la rodaja también: mezclarlos apunta a otro sitio del
    // fichero y el test pasa o falla por casualidad.
    assert.match(CODIGO.slice(i, i + 600), /--descubrir/,
      "el mensaje de uso ya no nombra el modo descubrir");
  });

  test("un censo vacío avisa de que puede ser el NOMBRE y no la falta de gente", () => {
    // Es la confusión que costó una tarde: «0» no distinguía «no se apuntó nadie» de «esa no es
    // la clave guardada». Si este aviso desaparece, vuelve a no distinguirse.
    const i = CODIGO.indexOf("async function censoDe");
    const bloque = CODIGO.slice(i);
    assert.match(bloque, /censo\.total === 0 && !camp && !form/,
      "ya no se detecta el caso «no hay absolutamente nada con esta clave»");
    assert.match(bloque, /--descubrir/,
      "el aviso de censo vacío ya no remite a --descubrir");
  });

  test("las consultas del censo siguen cubriendo las DOS formas de apuntarse", () => {
    const i = CODIGO.indexOf("async function censoDe");
    const bloque = CODIGO.slice(i);
    assert.match(bloque, /l\.campana, ''\), ''\) = \$1 OR l\.fuente = \$2/,
      "el censo ha dejado de contar una de las dos rutas de alta (clásica o configurable)");
    assert.match(bloque, /form:\$\{clave\}/,
      "ya no se busca el formulario configurable por `form:<clave>`");
  });
});

describe("resiste una base a la que le falten columnas", () => {
  test("cada consulta va envuelta para que un fallo no tumbe el informe entero", () => {
    // Varias columnas llegaron por `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Si falta una, el
    // bloque que la usa tiene que decirlo y los otros siete tienen que salir igual.
    assert.match(CODIGO, /const q = async \([\s\S]*?catch \(e\) \{ return \{ _error:/,
      "las consultas ya no capturan su error: la primera columna que falte deja sin informe");
    assert.match(CODIGO, /if \(filas\?\._error\) return/,
      "la tabla ya no sabe pintar el error de una consulta que falló");
  });
});
