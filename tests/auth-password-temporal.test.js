import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarPassword, passwordInicial } from "../src/modules/usuarios/acceso.js";

// La primera contraseña de cualquiera SIEMPRE la elige otra persona: quien da el alta. O sea,
// la sabe más de uno. Por eso toda cuenta nace obligada a cambiarla.
//
// Fallaba porque de los CUATRO sitios donde se crean usuarios, solo uno marcaba
// `pass_temporal`, y justo no era el principal (Usuarios → dirección). El resultado no era un
// error visible: era que a nadie le pedía nada nunca.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("toda cuenta nueva nace obligada a cambiar la contraseña", () => {
  /** Cada `INSERT INTO users (...)` del servidor, con su lista de columnas. */
  const inserts = [...server.matchAll(/INSERT INTO users\s*\(([^)]*)\)/g)]
    .map((m) => ({ columnas: m[1].split(",").map((c) => c.trim()), pos: m.index }));

  test("hay varias vías de alta que revisar", () => {
    assert.ok(inserts.length >= 4, `solo se han encontrado ${inserts.length}`);
  });

  test("TODAS marcan pass_temporal: si una se olvida, esas cuentas se quedan sin pedirlo", () => {
    const sinMarca = inserts
      .filter((i) => !i.columnas.includes("pass_temporal"))
      .map((i) => server.slice(0, i.pos).split("\n").length);   // nº de línea
    assert.deepEqual(sinMarca, [], `INSERT INTO users sin pass_temporal en las líneas: ${sinMarca.join(", ")}`);
  });

  test("y lo ponen a TRUE, no a cualquier cosa", () => {
    for (const i of inserts) {
      const idx = i.columnas.indexOf("pass_temporal");
      const values = server.slice(i.pos, i.pos + 700).match(/VALUES\s*\(([^)]*)\)/);
      assert.ok(values, "no se encuentra el VALUES");
      const v = values[1].split(",").map((x) => x.trim())[idx];
      assert.equal(v, "TRUE", `el valor de pass_temporal es «${v}»`);
    }
  });
});

describe("avisa, pero deja trabajar", () => {
  // Bloquear el panel hasta cambiarla dejaba fuera a quien abre el local a las siete de la
  // mañana. Y encima el formulario mandaba el NOMBRE DE USUARIO como contraseña actual —cierto
  // solo en un tipo de alta—, así que a casi todos les decía «la actual no es correcta»: el
  // peor error posible, el que acusa a la persona de equivocarse cuando no lo ha hecho.
  const auth = readFileSync(new URL("../public/auth.js", import.meta.url), "utf8");
  const login = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");

  test("el servidor no corta el paso", () => {
    const i2 = server.indexOf("function requireAuth(");
    const codigo = server.slice(i2, i2 + 1400).replace(/\/\/[^\n]*/g, "");
    assert.ok(!/payload\.pass_temporal/.test(codigo));
  });

  test("el login entra al panel, no desvía a ningún formulario", () => {
    assert.ok(!/pedirCambio/.test(login), "el desvío obligatorio ya no existe");
    assert.ok(!/debeCambiarPassword\)/.test(login) || /ROLE_REDIRECT/.test(login));
  });

  test("el aviso PIDE la contraseña actual en vez de adivinarla", () => {
    const i2 = auth.indexOf("function avisoPassword(");
    assert.notEqual(i2, -1, "falta el aviso");
    const bloque = auth.slice(i2, i2 + 3000);
    assert.match(bloque, /name="actual"/, "hay que preguntarla: no siempre es el nombre de usuario");
    assert.match(bloque, /JSON\.stringify\(\{ actual, nueva \}\)/);
    assert.ok(!/actual: *user\.username|actual: *USUARIO/.test(bloque), "no se puede volver a dar por hecho");
  });

  test("se puede posponer, y no vuelve a salir en cada pantalla", () => {
    const i2 = auth.indexOf("function avisoPassword(");
    const bloque = auth.slice(i2, i2 + 3000);
    assert.match(bloque, /Ahora no/, "tiene que haber forma de seguir trabajando");
    assert.match(bloque, /24 \* 60 \* 60 \* 1000/, "pospuesto un día: ni acoso ni olvido");
  });

  test("sale en todas las páginas, no solo en el panel", () => {
    // auth.js lo cargan el panel y las páginas de cada rol.
    assert.match(auth, /if \(user\.pass_temporal\) setTimeout\(\(\) => avisoPassword\(user\)/);
  });

  test("y se trae su propio estilo: el panel no carga styles.css", () => {
    assert.match(auth, /function estiloAviso\(\)/);
    assert.match(auth, /passAvisoCSS/);
  });

  test("al cambiarla se devuelve un token SIN la marca", () => {
    const i2 = server.indexOf('app.put("/api/mi-password"');
    const bloque = server.slice(i2, i2 + 1800);
    assert.match(bloque, /pass_temporal = FALSE/);
    assert.match(bloque, /pass_temporal: false/);
  });

  test("reiniciar la contraseña de alguien vuelve a marcarla", () => {
    // Antes este test exigía `password_enc = ?`: se guardaba también una copia REVERSIBLE de
    // la contraseña para poder enseñarla desde el panel. Se ha retirado a propósito —una
    // contraseña se restablece, no se consulta— y ahora la copia se BORRA en el mismo UPDATE.
    // Lo que el test protege sigue siendo lo mismo: que restablecer vuelva a obligar a
    // cambiarla.
    assert.match(server, /UPDATE users SET password_hash = \?, password_enc = NULL, pass_temporal = TRUE/);
  });

  test("y ya no queda ni un solo sitio que guarde la contraseña de forma recuperable", () => {
    assert.ok(!/password_enc\s*=\s*\?/.test(server), "algún UPDATE vuelve a escribir password_enc");
    assert.ok(!/encUserPass|decUserPass/.test(server), "ha vuelto el cifrado reversible de contraseñas");
    // Y el endpoint que las devolvía en claro contesta que ya no se puede.
    assert.match(server, /Las contraseñas ya no se pueden consultar/);
  });
});

describe("qué contraseña se acepta", () => {
  test("la inicial es el propio usuario", () => {
    assert.equal(passwordInicial("marta"), "marta");
  });
  test("y justo esa no vale como nueva", () => {
    assert.equal(validarPassword("marta", { username: "marta" }).ok, false);
    assert.equal(validarPassword("MARTA", { username: "marta" }).ok, false, "ni cambiando mayúsculas");
  });
  test("una demasiado corta se rechaza con un mensaje que dice cuánto falta", () => {
    const r = validarPassword("abc", { username: "marta" });
    assert.equal(r.ok, false);
    assert.match(r.error, /\d+ caracteres/);
  });
  test("una normal vale", () => {
    assert.equal(validarPassword("tapeta2027", { username: "marta" }).ok, true);
  });
});
