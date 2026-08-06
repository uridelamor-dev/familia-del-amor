// Usuarios — permisos por módulo y ámbito por local (lógica pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGO_MODULOS, modulosDeRol, parseModulos, modulosEfectivos,
  puedeAccederModulo, sanearModulos, esModuloPorLocal, localForzado,
} from "../../src/modules/usuarios/permisos.js";

describe("modulosDeRol", () => {
  test("dirección ve todos los módulos", () => {
    assert.equal(modulosDeRol("direccion").length, CATALOGO_MODULOS.length);
  });
  test("contabilidad ve solo su subconjunto", () => {
    const m = modulosDeRol("contabilidad");
    assert.ok(m.includes("facturas") && m.includes("analitica") && m.includes("dashboard"));
    assert.ok(!m.includes("reservas") && !m.includes("usuarios"));
  });
  test("rol desconocido → sin módulos", () => {
    assert.deepEqual(modulosDeRol("nadie"), []);
  });
});

describe("parseModulos", () => {
  test("array pasa filtrando no-strings", () => {
    assert.deepEqual(parseModulos(["a", 1, "b", null]), ["a", "b"]);
  });
  test("JSON string se parsea", () => {
    assert.deepEqual(parseModulos('["facturas","analitica"]'), ["facturas", "analitica"]);
  });
  test("null / vacío / basura → []", () => {
    assert.deepEqual(parseModulos(null), []);
    assert.deepEqual(parseModulos(""), []);
    assert.deepEqual(parseModulos("no-json"), []);
  });
});

describe("modulosEfectivos", () => {
  test("sin allowlist → todos los del rol", () => {
    assert.deepEqual(modulosEfectivos("contabilidad", null), modulosDeRol("contabilidad"));
  });
  test("allowlist restringe por intersección con el rol", () => {
    const eff = modulosEfectivos("contabilidad", ["facturas", "reservas", "usuarios"]);
    // reservas/usuarios no son de contabilidad → se caen; solo queda facturas.
    assert.deepEqual(eff, ["facturas"]);
  });
  test("allowlist nunca amplía por encima del rol", () => {
    const eff = modulosEfectivos("encargado", ["agora", "rrhh"]);
    assert.deepEqual(eff, []); // ninguno es de encargado
  });
});

describe("puedeAccederModulo", () => {
  test("encargado con local entra a reservas, no a rrhh", () => {
    const u = { rol: "encargado", modulos: null };
    assert.equal(puedeAccederModulo("reservas", u), true);
    assert.equal(puedeAccederModulo("rrhh", u), false);
  });
  test("restringido: contabilidad sin analitica en su allowlist", () => {
    const u = { rol: "contabilidad", modulos: ["facturas"] };
    assert.equal(puedeAccederModulo("facturas", u), true);
    assert.equal(puedeAccederModulo("analitica", u), false);
  });
});

describe("sanearModulos", () => {
  test("cubre todos los del rol → null (sin restricción)", () => {
    assert.equal(sanearModulos("contabilidad", modulosDeRol("contabilidad")), null);
  });
  test("vacío → null", () => {
    assert.equal(sanearModulos("contabilidad", []), null);
  });
  test("subconjunto válido se conserva; los ajenos al rol se descartan", () => {
    assert.deepEqual(sanearModulos("contabilidad", ["facturas", "reservas"]), ["facturas"]);
  });
});

describe("esModuloPorLocal", () => {
  test("dashboard/reservas/facturas/analitica varían por local", () => {
    for (const v of ["dashboard", "reservas", "facturas", "analitica"]) assert.equal(esModuloPorLocal(v), true);
  });
  test("usuarios/agora/clientes no varían por local", () => {
    for (const v of ["usuarios", "agora", "clientes"]) assert.equal(esModuloPorLocal(v), false);
  });
});

describe("localForzado", () => {
  test("dirección nunca se fuerza", () => {
    assert.equal(localForzado({ rol: "direccion", local: "La Tapeta - Lloret" }), null);
  });
  test("usuario sin local → null", () => {
    assert.equal(localForzado({ rol: "encargado", local: "" }), null);
  });
  test("encargado con local → su local", () => {
    assert.equal(localForzado({ rol: "encargado", local: "La Tapeta - Lloret" }), "La Tapeta - Lloret");
  });
  test("con view: fuerza en módulo por local, no en uno global", () => {
    const u = { rol: "encargado", local: "La Tapeta - Lloret" };
    assert.equal(localForzado(u, "reservas"), "La Tapeta - Lloret");
    assert.equal(localForzado(u, "comunicados"), null);
  });
});
