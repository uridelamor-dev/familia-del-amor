import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarPassword, puedeConPasswordTemporal, RUTAS_CON_PASSWORD_TEMPORAL, passwordInicial } from "../src/modules/usuarios/acceso.js";

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

describe("el bloqueo se hace en el servidor, no solo en la pantalla", () => {
  test("requireAuth corta el paso con la contraseña sin estrenar", () => {
    const i = server.indexOf("function requireAuth(");
    const bloque = server.slice(i, i + 1200);
    assert.match(bloque, /payload\.pass_temporal && !puedeConPasswordTemporal\(req\.path\)/);
    assert.match(bloque, /passwordTemporal: true/);
  });

  test("solo se puede mirar uno mismo y cambiarla", () => {
    assert.deepEqual(RUTAS_CON_PASSWORD_TEMPORAL, ["/api/auth/me", "/api/mi-password", "/api/auth/login"]);
    for (const r of ["/api/facturas", "/api/reservas", "/api/users", "/api/horarios/semana"]) {
      assert.equal(puedeConPasswordTemporal(r), false, r);
    }
  });

  test("y con parámetros tampoco se cuela", () => {
    assert.equal(puedeConPasswordTemporal("/api/facturas?local=x"), false);
    assert.equal(puedeConPasswordTemporal("/api/mi-password?x=1"), true);
  });

  test("la marca viaja en el token: si no, el servidor no podría cortar", () => {
    const i = server.indexOf('app.post("/api/auth/login"');
    const bloque = server.slice(i, i + 3200);
    assert.match(bloque, /pass_temporal: debeCambiar/);
    assert.match(bloque, /debeCambiarPassword: debeCambiar/, "la pantalla necesita saberlo");
  });

  test("al cambiarla se devuelve un token SIN la marca", () => {
    // Si no, seguiría bloqueado hasta volver a entrar y parecería que no ha funcionado.
    const i = server.indexOf('app.put("/api/mi-password"');
    const bloque = server.slice(i, i + 1800);
    assert.match(bloque, /pass_temporal = FALSE/);
    assert.match(bloque, /pass_temporal: false/);
  });

  test("reiniciar la contraseña de alguien vuelve a obligarle", () => {
    assert.match(server, /UPDATE users SET password_hash = \?, password_enc = \?, pass_temporal = TRUE/);
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

describe("al que le falta cambiarla no se le echa sin explicación", () => {
  const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../public/auth.js", import.meta.url), "utf8");
  const login = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");

  test("el 403 de contraseña temporal NO borra el token", () => {
    // El token es bueno: es justo el que necesita la pantalla de cambio para hacer el PUT.
    // Borrarlo obligaba a entrar otra vez con la contraseña inicial para que se lo pidieran.
    for (const [nombre, src] of [["panel", panel], ["auth.js", auth]]) {
      const i = src.indexOf("passwordTemporal");
      assert.notEqual(i, -1, `${nombre} no distingue el 403 de contraseña temporal`);
      const bloque = src.slice(i, i + 400);
      assert.match(bloque, /login\.html\?cambiar=1/, nombre);
      assert.ok(!/removeItem\("token"\)[\s\S]{0,40}cambiar=1/.test(bloque), `${nombre}: no puede borrar el token en esa rama`);
    }
  });

  test("el panel decide en un solo sitio, no en cinco copias", () => {
    assert.match(panel, /async function fueraDeSesion\(r\)/);
    // Ninguna capa de datos puede decidir por su cuenta qué hacer con un 401/403: si queda
    // una suelta, se olvidará de actualizar y volverá a echar a la gente sin explicación.
    // (El `removeItem` del botón de salir sí es legítimo: ahí sí quiere cerrar la sesión.)
    const sueltas = (panel.match(/r\.status === 401 \|\| r\.status === 403/g) || []).length;
    assert.equal(sueltas, 0, "quedan comprobaciones de 401/403 fuera de fueraDeSesion()");
  });

  test("el login entiende el ?cambiar=1 y enseña el cambio", () => {
    assert.match(login, /cambiar"\) === "1"/);
    assert.match(login, /if \(forzar \|\| data\.user\.pass_temporal\)/);
  });
});
