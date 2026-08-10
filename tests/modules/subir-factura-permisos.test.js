import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGO_MODULOS, modulosDeRol, puedeAccederModulo } from "../../src/modules/usuarios/permisos.js";

// El encargado sube la factura de su proveedor. Nada más. Ni el gasto del grupo, ni los
// totales, ni la configuración fiscal, ni qué compran los otros locales. «Subir» y «ver» son
// dos permisos distintos y aquí se comprueba que sigan siéndolo.
const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

describe("qué puede el encargado en facturas", () => {
  test("puede subir", () => {
    assert.ok(modulosDeRol("encargado").includes("subirfactura"));
    assert.ok(puedeAccederModulo("subirfactura", { rol: "encargado", modulos: null }));
  });

  test("y NO puede ver lo demás", () => {
    for (const m of ["facturas", "analitica"]) {
      assert.ok(!modulosDeRol("encargado").includes(m), m);
      assert.ok(!puedeAccederModulo(m, { rol: "encargado", modulos: null }), m);
    }
  });

  test("dirección puede restringírselo, como cualquier otro módulo", () => {
    assert.ok(!puedeAccederModulo("subirfactura", { rol: "encargado", modulos: ["reservas"] }));
  });
});

describe("el servidor no le abre más de una puerta", () => {
  /** Rutas /api/facturas/... y los roles que declaran. */
  const rutas = [...server.matchAll(/app\.(get|post|put|patch|delete)\("(\/api\/facturas[^"]*)",\s*requireAuth\(\[([^\]]*)\]\)/g)]
    .map((m) => ({ metodo: m[1], ruta: m[2], roles: [...m[3].matchAll(/"(\w+)"/g)].map((x) => x[1]) }));

  test("hay rutas de facturas que analizar", () => {
    assert.ok(rutas.length > 10, `solo se han encontrado ${rutas.length}`);
  });

  test("la ÚNICA ruta de facturas abierta al encargado es la de subir", () => {
    const abiertas = rutas.filter((r) => r.roles.includes("encargado")).map((r) => `${r.metodo.toUpperCase()} ${r.ruta}`);
    assert.deepEqual(abiertas, ["POST /api/facturas/subir"], `abiertas: ${abiertas.join(", ")}`);
  });

  test("al encargado se le fuerza SU local: no puede subir a otro", () => {
    // Subir al local equivocado descuadra dos locales a la vez y nadie se entera.
    const i = server.indexOf('app.post("/api/facturas/subir"');
    const bloque = server.slice(i, i + 1200);
    assert.match(bloque, /const fijado = localScope\(req\)/);
    assert.match(bloque, /const local = fijado \|\| /, "el local del cuerpo solo vale si no hay fijado");
  });

  test("y sin local asignado no se le deja subir a ciegas", () => {
    const i = server.indexOf('app.post("/api/facturas/subir"');
    assert.match(server.slice(i, i + 1200), /rol === "encargado" && !fijado/);
  });
});

describe("la pantalla no pide nada que el encargado no pueda", () => {
  const fn = (() => {
    const i = panel.indexOf("async function loadSubirFactura(");
    assert.notEqual(i, -1, "falta loadSubirFactura");
    return panel.slice(i, panel.indexOf("\n}\n", i));
  })();

  test("no consulta ninguna ruta de facturas al cargar", () => {
    assert.ok(!/apiRaw|apiOptional|\bapi\(/.test(fn), "cualquier consulta le daría 403 y llenaría la pantalla de errores");
  });

  test("al encargado no se le pinta el selector de local", () => {
    assert.match(fn, /esEncargado \? "" :/);
  });

  test("el módulo está en los dos catálogos, que son espejo manual", () => {
    assert.ok(CATALOGO_MODULOS.some((m) => m.id === "subirfactura"));
    assert.match(panel, /\["subirfactura", "Subir factura"/);
    // Solo encargado: dirección y contabilidad ya suben desde Compras → Facturas, con el
    // mismo botón y el mismo endpoint. Tenerlo además suelto en su menú repetía una entrada
    // que no usaban y parecía otra bandeja distinta.
    assert.match(panel, /subirfactura: \["encargado"\]/);
    assert.deepEqual(CATALOGO_MODULOS.find((m) => m.id === "subirfactura").roles, ["encargado"]);
    assert.match(panel, /subirfactura: loadSubirFactura/);
  });
});
