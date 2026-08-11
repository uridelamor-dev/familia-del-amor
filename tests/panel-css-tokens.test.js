import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Una variable CSS que no existe no rompe nada: el navegador se calla y el elemento hereda el
// color de al lado. Por eso llevaban meses ahí sin que nadie las viera —las barras de Ágora
// nunca usaron el verde de marca, tiraban de un fallback gris-verdoso escrito a mano— y por eso
// hace falta que las cace la batería: es un fallo que no se nota mirando.
const html = readFileSync(new URL("../public/panel/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

/** Los tokens declarados en el `:root` claro. Son los únicos que se pueden usar. */
function tokensDeclarados() {
  const bloque = html.slice(html.indexOf(":root{"), html.indexOf(':root[data-theme="dark"]'));
  return new Set([...bloque.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

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

  test("el tema oscuro redefine TODOS los tokens de color del claro", () => {
    // Si uno se queda sin redefinir, en oscuro se queda el color del tema claro y el contraste
    // se rompe justo en esa pieza. Los que no son de color (radios, sombras, fuentes) se
    // quedan fuera a propósito.
    const oscuro = html.slice(html.indexOf(':root[data-theme="dark"]'), html.indexOf("@media (prefers-color-scheme:dark)"));
    const enOscuro = new Set([...oscuro.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    // `--cat` se fija por elemento y su valor por defecto ya es un token temado (`--brand`),
    // así que no necesita —ni debe tener— una versión oscura propia.
    const noColor = new Set(["--sh-sm", "--sh-md", "--sh-lg", "--r-sm", "--r-md", "--r-lg", "--sb", "--font", "--mono", "--cat"]);
    const faltan = [...declarados].filter((t) => !noColor.has(t) && !enOscuro.has(t));
    assert.deepEqual(faltan, [], "tokens de color sin versión oscura");
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
