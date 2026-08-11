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

/** Cada `var(--algo)` que aparece, con o sin valor de reserva. */
function tokensUsados(texto) {
  return [...texto.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)].map((m) => ({ nombre: m[1], conReserva: !!m[2] }));
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

  test("el tema oscuro redefine TODOS los tokens de color del claro", () => {
    // Si uno se queda sin redefinir, en oscuro se queda el color del tema claro y el contraste
    // se rompe justo en esa pieza. Los que no son de color (radios, sombras, fuentes) se
    // quedan fuera a propósito.
    const oscuro = html.slice(html.indexOf(':root[data-theme="dark"]'), html.indexOf("@media (prefers-color-scheme:dark)"));
    const enOscuro = new Set([...oscuro.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const noColor = new Set(["--sh-sm", "--sh-md", "--sh-lg", "--r-sm", "--r-md", "--r-lg", "--sb", "--font", "--mono"]);
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
