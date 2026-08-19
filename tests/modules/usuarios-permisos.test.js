// Usuarios — permisos por módulo y ámbito por local (lógica pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOGO_MODULOS, modulosDeRol, parseModulos, modulosEfectivos,
  puedeAccederModulo, sanearModulos, esModuloPorLocal, localForzado,
} from "../../src/modules/usuarios/permisos.js";

describe("modulosDeRol", () => {
  test("dirección ve todos los módulos menos «Subir factura»", () => {
    // «Subir factura» es del encargado: dirección sube desde Compras → Facturas, con el mismo
    // botón. Es el único módulo del catálogo que dirección no tiene, y es a propósito.
    const suyos = modulosDeRol("direccion");
    const fuera = CATALOGO_MODULOS.filter((m) => !suyos.includes(m.id)).map((m) => m.id);
    assert.deepEqual(fuera, ["subirfactura"]);
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
    const eff = modulosEfectivos("encargado", ["agora", "usuarios"]);
    assert.deepEqual(eff, []); // ninguno es de encargado
  });
});

describe("puedeAccederModulo", () => {
  test("encargado con local entra a reservas y rrhh, no a clientes", () => {
    const u = { rol: "encargado", modulos: null };
    assert.equal(puedeAccederModulo("reservas", u), true);
    assert.equal(puedeAccederModulo("rrhh", u), true); // RRHH abierto a encargado (su local)
    assert.equal(puedeAccederModulo("clientes", u), false);
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
  test("rrhh abierto a direccion/rrhh/encargado y es por-local", () => {
    const r = modulosDeRol("rrhh");
    assert.ok(r.includes("rrhh"));
    assert.ok(modulosDeRol("encargado").includes("rrhh"));
    assert.ok(modulosDeRol("direccion").includes("rrhh"));
    assert.equal(esModuloPorLocal("rrhh"), true);
  });
  test("dashboard/reservas/facturas/analitica varían por local", () => {
    for (const v of ["dashboard", "reservas", "facturas", "analitica"]) assert.equal(esModuloPorLocal(v), true);
  });
  test("ágora y clientes no varían por local", () => {
    for (const v of ["agora", "clientes"]) assert.equal(esModuloPorLocal(v), false);
  });

  test("usuarios SÍ, desde que la lista se filtra por el establecimiento", () => {
    // Con Blanes puesto en la barra salen los de Blanes. Si el catálogo dijera que no varía,
    // el menú no lo marcaría y el panel no lo trataría como tal.
    assert.equal(esModuloPorLocal("usuarios"), true);
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

// ── El espejo manual entre backend y panel ───────────────────────────────────
// CATALOGO_MODULOS (aquí) y VIEW_ROLES + MODULOS_POR_LOCAL (public/panel/app.js) son la
// misma información escrita dos veces. Nadie comprobaba que coincidieran: añadir un módulo
// y olvidar el otro lado deja a un rol viendo un menú que el servidor le va a negar, o al
// revés. Este test lee el panel como texto y los compara.
describe("espejo con el panel (public/panel/app.js)", () => {
  const panel = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/panel/app.js"), "utf8"
  );
  const bloque = (nombre) => {
    const i = panel.indexOf(`const ${nombre} =`);
    assert.ok(i > -1, `no encuentro ${nombre} en el panel`);
    return panel.slice(i, panel.indexOf("\n", i));
  };

  test("todos los módulos del backend existen en VIEW_ROLES", () => {
    const vr = bloque("VIEW_ROLES");
    for (const m of CATALOGO_MODULOS) {
      assert.ok(new RegExp(`\\b${m.id}\\s*:`).test(vr), `el panel no conoce el módulo "${m.id}"`);
    }
  });

  test("los roles de cada módulo coinciden en los dos sitios", () => {
    const vr = bloque("VIEW_ROLES");
    for (const m of CATALOGO_MODULOS) {
      const trozo = new RegExp(`\\b${m.id}\\s*:\\s*\\[([^\\]]*)\\]`).exec(vr);
      assert.ok(trozo, `sin roles para "${m.id}" en el panel`);
      const enPanel = trozo[1].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean).sort();
      assert.deepEqual(enPanel, [...m.roles].sort(),
        `"${m.id}" tiene roles distintos en el panel que en el servidor`);
    }
  });

  test("porLocal coincide con MODULOS_POR_LOCAL", () => {
    const linea = bloque("MODULOS_POR_LOCAL");
    const enPanel = [...linea.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
    const enBackend = CATALOGO_MODULOS.filter((m) => m.porLocal).map((m) => m.id).sort();
    assert.deepEqual(enPanel, enBackend,
      "la lista de módulos que dependen del establecimiento no coincide");
  });

  // Se busca DENTRO del bloque NAV y no en todo el fichero: `["contratacion", …]` también
  // aparece en la lista de pestañas de Equipo, y buscar suelto daba un falso positivo.
  const NAV_TXT = (() => {
    const i = panel.indexOf("const NAV = [");
    const j = panel.indexOf("\n];", i);
    assert.notEqual(i, -1, "no está NAV");
    return panel.slice(i, j);
  })();

  test("cada módulo-PANTALLA tiene su entrada de menú y su vista", () => {
    for (const m of CATALOGO_MODULOS.filter((x) => !x.dentroDe)) {
      assert.ok(new RegExp(`\\["${m.id}",`).test(NAV_TXT), `"${m.id}" no está en el menú (NAV)`);
      assert.ok(new RegExp(`\\b${m.id}\\s*:\\s*load`).test(panel), `"${m.id}" no está enrutado (VIEWS)`);
    }
  });

  test("y los que son PESTAÑA de otro no salen en el menú, que es lo que los distingue", () => {
    // `contratacion`, `pulso` y `preguntas` viven dentro de Equipo: son casillas de permiso,
    // no entradas de menú. Si alguno apareciera en NAV, saldría una entrada suelta que al
    // pulsarla no llevaría a ninguna parte.
    const hijos = CATALOGO_MODULOS.filter((x) => x.dentroDe);
    assert.ok(hijos.length, "el desglose de Equipo tiene que existir");
    for (const m of hijos) {
      assert.ok(!new RegExp(`\\["${m.id}",`).test(NAV_TXT), `"${m.id}" no debería estar en el menú`);
      assert.ok(CATALOGO_MODULOS.some((x) => x.id === m.dentroDe), `"${m.id}" cuelga de un módulo que no existe`);
      // Y sus roles no pueden ser más amplios que los del padre: una pestaña de dentro de
      // Equipo a la que llegue alguien que no puede entrar en Equipo es una puerta trasera.
      const padre = CATALOGO_MODULOS.find((x) => x.id === m.dentroDe);
      for (const r of m.roles) assert.ok(padre.roles.includes(r), `"${m.id}" da acceso a ${r}, que no tiene "${padre.id}"`);
    }
  });
});
