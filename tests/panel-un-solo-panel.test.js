import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modulosDeRol, CATALOGO_MODULOS } from "../src/modules/usuarios/permisos.js";

// Todo el mundo entra al MISMO panel. Antes cada rol aterrizaba en una página suelta que era
// una versión vieja y paralela de lo mismo: sin el menú de la izquierda, sin los módulos
// nuevos y —en Encargados— con un selector de «Todos los locales» en la pantalla de alguien
// que lleva un local.
const login = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const raiz = new URL("../public/", import.meta.url);

describe("una sola puerta para todos", () => {
  const roles = ["direccion", "encargado", "contabilidad", "marketing", "rrhh"];

  test("todos los roles con módulos van al panel", () => {
    const m = login.match(/const ROLE_REDIRECT = \{([\s\S]*?)\};/);
    assert.ok(m, "falta ROLE_REDIRECT");
    for (const r of roles) {
      assert.match(m[1], new RegExp(`${r}:\\s*PANEL`), `${r} no va al panel`);
    }
  });

  test("el trabajador es la excepción, y por una razón: no tiene módulos", () => {
    assert.equal(modulosDeRol("trabajador").length, 0);
    assert.match(login, /trabajador: "\/trabajadores\.html"/);
  });

  test("el panel deja entrar a esos mismos roles", () => {
    const m = panel.match(/requireRole\(\[([^\]]*)\]\)/);
    assert.ok(m);
    const permitidos = [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]);
    assert.deepEqual(permitidos.sort(), [...roles].sort());
  });

  test("y arranca por una pantalla que ese rol pueda ver", () => {
    // A marketing el Dashboard le daría «Sin acceso» nada más entrar.
    assert.match(panel, /const inicio = \[[^\]]*\]\.find\(\(v\) => puedeVer\(v\)\)/);
  });

  test("las páginas viejas reenvían al panel en vez de servir la versión antigua", () => {
    for (const p of ["encargados.html", "rrhh.html", "marketing.html", "contabilidad.html", "direccion.html"]) {
      const html = readFileSync(new URL(p, raiz), "utf8");
      assert.match(html, /location\.replace\("\/panel\/"/, p);
      assert.ok(html.length < 1200, `${p} debería ser solo el reenvío`);
    }
  });

  test("ningún sitio del código sigue mandando gente a esas páginas", () => {
    const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
    for (const p of ["encargados.html", "rrhh.html", "marketing.html", "contabilidad.html", "direccion.html"]) {
      assert.ok(!server.includes(p), `server.js todavía redirige a ${p}`);
      assert.ok(!panel.includes(p), `el panel todavía enlaza ${p}`);
    }
  });
});

describe("quien tiene local asignado no ve un ámbito que no tiene", () => {
  test("la barra enseña SU local, no «Todos los establecimientos»", () => {
    // El servidor ya le devolvía solo los suyos; el rótulo prometía más de lo que había.
    assert.match(panel, /const fijado = localFijadoFE\(\);\s*\n\s*const estabLbl = fijado \?/);
  });

  test("y no puede cambiarlo: se lo puso dirección", () => {
    const i = panel.indexOf("function openEstabMenu()");
    assert.notEqual(i, -1);
    assert.match(panel.slice(i, i + 400), /if \(fijado\) return;/);
  });
});

describe("los permisos por usuario recortan, nunca amplían", () => {
  test("la allowlist no puede dar un módulo que el rol no tenga", () => {
    // Es lo que confunde: buscar «Facturas» en la lista de un encargado y no encontrarla.
    const efectivos = CATALOGO_MODULOS
      .filter((m) => m.roles.includes("encargado")).map((m) => m.id);
    assert.ok(!efectivos.includes("facturas"), "el encargado no tiene Facturas...");
    assert.ok(efectivos.includes("subirfactura"), "...tiene Subir factura, que es otra cosa");
  });

  test("y la pantalla lo explica, en vez de dejar buscar un módulo que no está", () => {
    const i = panel.indexOf("function modsCheckboxesHtml(");
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(bloque, /se quita acceso, nunca se da/);
    assert.match(bloque, /hay que cambiarle el rol/);
  });
});
