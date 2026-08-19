import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// EL FALLO: al dar de alta un proveedor de inventario faltaban proveedores en la lista, sin
// que nada dijera que estaba recortada. Tres motivos, los tres callados:
//
//   1. LIMIT 200 con orden alfabético → con años de facturas, de la S en adelante no existía.
//   2. WHERE local = ? → un proveedor al que se compra desde otro establecimiento no salía.
//   3. Orden por nombre → el que trae el camión cada semana caía en mitad de doscientos.
//
// Y un `<datalist>` nativo, que filtra solo por el principio de la palabra y no deja poner
// nada al lado del nombre para distinguir «DAMM» de «Damm Distribución S.A.».
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

const bloque = (txt, desde, hasta) => {
  const i = txt.indexOf(desde);
  assert.notEqual(i, -1, `no está: ${desde}`);
  const j = txt.indexOf(hasta, i + desde.length);
  return txt.slice(i, j === -1 ? i + 2500 : j);
};

describe("la lista de proveedores no se corta en silencio", () => {
  const ep = bloque(server, 'app.get("/api/inventario/facturas-proveedores"', "app.post(\"/api/inventario/proveedores\"");

  test("el tope ya no deja fuera a nadie por orden alfabético", () => {
    assert.ok(!/LIMIT 200\b/.test(ep), "200 se queda corto con años de facturas");
    assert.match(ep, /LIMIT 2000/);
  });

  test("y no se filtra por el establecimiento que estás mirando", () => {
    // El mismo proveedor y el mismo camión sirven a varios locales.
    assert.ok(!/WHERE local = \?/.test(ep), "filtrar por el local de la pantalla escondía proveedores");
    assert.match(ep, /local = ANY\(\?\)/, "pero un encargado sigue viendo solo los suyos");
    assert.match(ep, /localesDe\(req\.user\)/);
  });

  test("ordenados por los que más facturan, no por la letra", () => {
    assert.match(ep, /ORDER BY veces DESC/);
    assert.match(ep, /COUNT\(\*\)::int AS veces/);
    assert.match(ep, /MAX\(fecha\) AS ultima/);
  });
});

describe("el selector es propio, no el del navegador", () => {
  const fn = bloque(panel, "async function invNuevoProveedor()", "function invPickProveedor(");

  test("sin datalist: cada navegador lo pintaba a su manera", () => {
    assert.ok(!/<datalist/.test(fn));
    assert.ok(!/list="invProvSug"/.test(fn));
  });

  test("busca sin acentos y en cualquier parte del nombre", () => {
    assert.match(fn, /normalize\("NFD"\)/, "«perez» tiene que encontrar «Pérez»");
    assert.match(fn, /\.includes\(q\)/, "«damm» tiene que encontrar «Cervezas Damm»");
  });

  test("y dice cuántos hay, para que nadie crea que están todos cuando no", () => {
    assert.match(fn, /coinciden;/);
    assert.match(fn, /Sigue escribiendo para afinar/);
  });

  test("se puede dar de alta uno que no está en ninguna factura", () => {
    assert.match(fn, /se dará de alta/);
  });

  test("acepta la forma vieja de la respuesta, por si el despliegue va a medias", () => {
    assert.match(fn, /typeof p === "string"/);
  });
});
