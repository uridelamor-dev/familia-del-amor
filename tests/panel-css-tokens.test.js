import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Una variable CSS que no existe no rompe nada: el navegador se calla y el elemento hereda el
// color de al lado. Por eso llevaban meses ahí sin que nadie las viera —las barras de Ágora
// nunca usaron el verde de marca, tiraban de un fallback gris-verdoso escrito a mano— y por eso
// hace falta que las cace la batería: es un fallo que no se nota mirando.
// El CSS del panel vive en `public/css/base.css` (tokens) y `public/css/panel.css`
// (componentes). Estuvo incrustado en `panel/index.html` hasta que se extrajo: el
// fichero es el mismo CSS, movido. Se leen los dos porque una regla puede estar en
// cualquiera de ellos.
const cssPanel = (f) => readFileSync(new URL("../public/css/" + f, import.meta.url), "utf8");
const CSS_PANEL = cssPanel("base.css") + "\n" + cssPanel("panel.css");
const html = readFileSync(new URL("../public/panel/index.html", import.meta.url), "utf8")
  + "\n" + CSS_PANEL;
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

/**
 * Los tokens del tema CLARO, con su valor.
 *
 * Antes esto era `html.slice(indexOf(":root{"), indexOf(':root[data-theme="dark"]'))`, y ese
 * recorte dejaba fuera el SEGUNDO `:root{` de `base.css` —donde viven la escala de texto, la
 * rejilla de espacio y las alturas de control—: el test creía que había 51 tokens cuando hay 95,
 * y los 44 restantes no los vigilaba nadie. Ahora se recorren TODOS los bloques `:root`, se
 * saltan los temáticos, y se guarda el valor además del nombre porque de él depende si el token
 * necesita versión oscura.
 */
function declaradosClaro() {
  const mapa = new Map();
  for (const b of bloquesDe(CSS_PANEL)) {
    if (!/^:root$/.test(b.selector)) continue;   // ni [data-theme] ni nada dentro de @media
    for (const [, nombre, valor] of b.cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      mapa.set(nombre, valor.trim());
    }
  }
  return mapa;
}

/**
 * Los tokens de un bloque de tema oscuro. `cual` elige cuál de los dos:
 * el que se pide a mano (`[data-theme="dark"]`) o el que sigue al sistema (la media query).
 */
function declaradosOscuro(cual) {
  const mapa = new Map();
  for (const b of bloquesDe(CSS_PANEL)) {
    const esMedia = /prefers-color-scheme/.test(b.dentro);
    if (cual === "media" ? !esMedia : esMedia) continue;
    if (!/\[data-theme/.test(b.selector)) continue;
    for (const [, nombre, valor] of b.cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      mapa.set(nombre, valor.trim());
    }
  }
  return mapa;
}

/** Bloques `selector { … }` a cualquier profundidad, anotando la regla-at que los envuelve. */
function bloquesDe(css, dentro = "") {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const salida = [];
  let i = 0;
  while (i < limpio.length) {
    const abre = limpio.indexOf("{", i);
    if (abre === -1) break;
    const selector = limpio.slice(i, abre).trim().replace(/\s+/g, " ");
    let prof = 1, j = abre + 1;
    while (j < limpio.length && prof > 0) {
      if (limpio[j] === "{") prof++;
      else if (limpio[j] === "}") prof--;
      j++;
    }
    const cuerpo = limpio.slice(abre + 1, j - 1);
    if (/^@/.test(selector)) salida.push(...bloquesDe(cuerpo, dentro ? `${dentro} ${selector}` : selector));
    else salida.push({ selector, dentro, cuerpo });
    i = j;
  }
  return salida;
}

/** ¿El valor de este token ES un color? Es lo que decide si necesita versión oscura. */
const esColor = (v) => /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|color-mix\(|transparent$|currentcolor$)/i.test(v.trim());

function tokensDeclarados() { return new Set(declaradosClaro().keys()); }

/**
 * Cada `var(--algo)` que aparece. Solo cuenta los que se escriben ENTEROS: los que el JS
 * construye al vuelo —`var(--cat-${nombre})`— no se pueden comprobar mirando el texto, y para
 * esos está el test de la familia de abajo.
 */
function tokensUsados(texto) {
  return [...texto.matchAll(/var\(\s*(--[\w-]+)\s*(?=[,)])/g)].map((m) => ({ nombre: m[1] }));
}

describe("los colores del panel salen de tokens que existen", () => {
  const declarados = tokensDeclarados();

  test("el :root declara los tokens de siempre", () => {
    for (const t of ["--bg", "--surface", "--border", "--ink", "--ink3", "--brand",
      "--success", "--warning", "--danger", "--info"]) {
      assert.ok(declarados.has(t), `falta ${t} en :root`);
    }
  });

  test("no se usa ninguna variable que nadie declara (ni en el CSS ni en el JS)", () => {
    const huerfanas = [];
    for (const [fichero, texto] of [["index.html", html], ["app.js", app]]) {
      for (const { nombre } of tokensUsados(texto)) {
        if (!declarados.has(nombre)) huerfanas.push(`${fichero}: var(${nombre})`);
      }
    }
    assert.deepEqual(huerfanas, [], "variables CSS que no existen (el navegador las ignora en silencio)");
  });

  test("los colores que el JS arma al vuelo tienen su familia declarada", () => {
    // `var(--cat-${categoria})` no se puede comprobar entero, pero sí que exista la familia:
    // si un día se renombran los tokens de categoría, las barras se quedarían sin color y
    // nadie lo vería —que es justo el fallo que este fichero existe para cazar—.
    const familias = [...new Set([...app.matchAll(/var\(\s*(--[\w-]+?)\$\{/g)].map((m) => m[1]))];
    for (const f of familias) {
      const hay = [...declarados].filter((t) => t.startsWith(f));
      assert.ok(hay.length >= 3, `«var(${f}…)» se arma en el JS y apenas hay tokens ${f}* declarados`);
    }
  });

  // ── EL TEMA OSCURO ES DEL PANEL, Y SON DOS BLOQUES ─────────────────────────────────────────
  //
  // Vivía en `base.css`, que cargan también las 16 páginas públicas, y allí redefinía el fondo
  // sin redefinir el texto de `styles.css`: trece páginas a 1,14 : 1 en cualquier móvil con el
  // modo oscuro puesto. Ahora vive en `panel.css`, que solo carga el panel.
  //
  // Son dos porque el conmutador tiene tres posiciones: elegido a mano y «auto». Son copias
  // manuales, así que lo primero que hay que vigilar es que no diverjan — ya lo habían hecho.
  const claro = declaradosClaro();
  const oscuroFijo = declaradosOscuro("atributo");
  const oscuroAuto = declaradosOscuro("media");

  test("los dos bloques oscuros existen y declaran lo mismo, token por token", () => {
    assert.ok(oscuroFijo.size > 20, "no se encuentra el tema oscuro elegido a mano");
    assert.ok(oscuroAuto.size > 20, "no se encuentra el tema oscuro automático (media query)");
    const difieren = [];
    for (const [t, v] of oscuroFijo) {
      if (!oscuroAuto.has(t)) difieren.push(`${t}: falta en el automático`);
      else if (oscuroAuto.get(t) !== v) difieren.push(`${t}: «${v}» a mano vs «${oscuroAuto.get(t)}» en auto`);
    }
    for (const t of oscuroAuto.keys()) if (!oscuroFijo.has(t)) difieren.push(`${t}: falta en el de a mano`);
    assert.deepEqual(difieren, [],
      "los dos bloques del tema oscuro han divergido: el panel se vería distinto según se haya " +
      "elegido oscuro a mano o se esté siguiendo al sistema");
  });

  test("el tema oscuro redefine TODOS los tokens que son un color", () => {
    // El criterio ya no es una lista escrita a mano —que se queda corta en cuanto alguien añade
    // un token— sino el VALOR: si en claro es un color, en oscuro tiene que haber otro. Una
    // medida, un radio o una familia tipográfica no cambian con el tema.
    //
    // Las dos excepciones son de verdad excepciones y llevan su razón:
    //   `--cat` vale `var(--brand)`, que ya está temado: redefinirlo sería temarlo dos veces.
    //   `--h`  no es un color sino el TONO de un área; de él se calcula la luminosidad de cada
    //          tema en la propia regla, y cambiarlo haría que la sala fuese de otro color según
    //          el tema, que es justo lo que no debe pasar.
    const exentos = new Set(["--cat", "--h"]);
    const faltan = [];
    for (const [t, v] of claro) {
      if (exentos.has(t) || !esColor(v)) continue;
      if (!oscuroFijo.has(t)) faltan.push(`${t} (claro: ${v})`);
    }
    assert.deepEqual(faltan, [],
      "tokens de color sin versión oscura: en el panel en oscuro se quedarían con el color del " +
      "tema claro y el contraste se rompe justo en esa pieza");
  });
});

describe("las píldoras de estado tienen su color", () => {
  test("cada variante que genera el JS existe en el CSS", () => {
    // `.pill.imp` se generaba en incidencias y candidaturas y NO estaba en el CSS: esas
    // píldoras salían grises en vez de ámbar, y nadie lo notó.
    const variantes = new Set();
    for (const m of app.matchAll(/["'](ok|warn|bad|info|brand|imp)["']/g)) variantes.add(m[1]);
    for (const v of variantes) {
      assert.match(html, new RegExp(`\\.pill\\.${v}\\s*\\{`), `falta la regla .pill.${v} en el CSS`);
    }
  });
});

describe("la paleta de categorías es la misma en el módulo y en el panel", () => {
  test("mismas categorías y mismo color en los dos sitios", async () => {
    // El panel no puede importar módulos (es un script suelto), así que la lista está escrita
    // dos veces. Es el mismo espejo manual que ya existe con VIEW_ROLES, y como aquel, sin un
    // test que los compare acaban divergiendo: una categoría nueva saldría gris para siempre.
    const { COLOR_CATEGORIA } = await import("../src/modules/facturas/categorias.js");
    const bloque = app.slice(app.indexOf("const COLOR_CAT_FE = {"), app.indexOf("const colorCategoriaFE"));
    const enPanel = Object.fromEntries([...bloque.matchAll(/"([^"]+)":\s*"([a-z]+)"/g)].map((m) => [m[1], m[2]]));
    assert.deepEqual(enPanel, COLOR_CATEGORIA);
  });

  test("y cada color de la paleta existe como token", async () => {
    const { COLOR_CATEGORIA } = await import("../src/modules/facturas/categorias.js");
    const declarados = tokensDeclarados();
    for (const color of new Set(Object.values(COLOR_CATEGORIA))) {
      assert.ok(declarados.has(`--cat-${color}`), `falta el token --cat-${color} en el CSS`);
    }
  });
});

describe("no hay dos clases para lo mismo", () => {
  test("solo queda `.tw` para el scroll horizontal de las tablas", () => {
    // Había `.tw` y `.tblwrap` haciendo exactamente lo mismo en 20 y 13 sitios. Dos clases
    // para una cosa acaban divergiendo: una se arregla en móvil y la otra no.
    assert.doesNotMatch(html, /\.tblwrap/);
    assert.doesNotMatch(app, /tblwrap/);
    assert.match(html, /\.tw\{overflow-x:auto/);
  });
});
