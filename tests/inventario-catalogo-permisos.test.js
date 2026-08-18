// El catálogo de inventario lo usa un ENCARGADO, y sale de las facturas.
//
// Inventarios es de dirección y encargado; Compras, solo de dirección y contabilidad. Este
// endpoint cruza esa frontera: enseña productos leídos de `factura_lineas` a alguien que hoy no
// puede abrir Compras. El nombre de lo que se compra no es sensible —es lo que descarga del
// camión—, pero a cuánto nos lo cobran, sí.
//
// Que eso se cumpla no puede depender de que el panel no lo pinte: tiene que ser que el dato NO
// SALGA de la base. Esto falla si alguien añade una columna de dinero a esa consulta.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

function bloqueCatalogo() {
  const i = server.indexOf('app.get("/api/inventario/proveedores/:id/catalogo"');
  assert.ok(i > 0, "sigue existiendo el endpoint del catálogo");
  const fin = server.indexOf('app.post("/api/inventario/productos/lote"', i);
  assert.ok(fin > i, "y el del lote justo después");
  return server.slice(i, fin);
}
// Los comentarios explican por qué NO se devuelve el precio, así que nombran la palabra. Se
// quitan antes de buscar; si no, el test se cazaría a sí mismo.
const sinComentarios = (txt) => txt.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("el catálogo no deja escapar dinero", () => {
  test("ninguna columna de importe ni de precio en el endpoint", () => {
    const codigo = sinComentarios(bloqueCatalogo());
    for (const palabra of ["importe", "precio_unitario", "precio_bruto", "importe_bruto", "l.total", "numero_factura"]) {
      assert.ok(!codigo.includes(palabra), `«${palabra}» no puede salir del catálogo de inventario`);
    }
  });

  test("un encargado solo ve sus locales, y la rama es explícita", () => {
    // Un array vacío en `= ANY(?)` significa «ninguno», no «todos»: si alguien sin locales
    // llegara aquí, la consulta sin rama le enseñaría el grupo entero.
    const codigo = bloqueCatalogo();
    assert.match(codigo, /const restringido = req\.user\?\.rol !== "direccion"/);
    assert.match(codigo, /localesDe\(req\.user\)/, "los suyos de verdad, no solo el principal");
    assert.match(codigo, /if \(restringido && !susLocales\.length\) return res\.status\(403\)/,
      "sin locales asignados no se contesta con todo");
    assert.match(codigo, /restringido \? "AND f\.local = ANY\(\?\)" : ""/);
  });

  test("sigue exigiendo el rol de inventarios y el permiso sobre el local", () => {
    const codigo = bloqueCatalogo();
    assert.match(codigo, /requireAuth\(INV_ROLES\)/);
    assert.match(codigo, /puedeAccederLocal\(req, p\.local\)/);
  });

  test("no se cuela un albarán ya facturado: se usa la regla compartida", () => {
    // Copiarla y pegarla habría dado, dentro de un año, dos reglas de conciliación distintas
    // sin que nadie decidiera separarlas.
    assert.match(bloqueCatalogo(), /AND NOT \$\{ALBARAN_YA_CONTADO\}/);
    assert.equal((server.match(/COALESCE\(f\.tipo,'factura'\) = 'albaran' AND f\.conciliado_con IS NOT NULL/g) || []).length, 1,
      "la regla está definida en un solo sitio");
  });
});

describe("el alta en lote no puede dejar el trabajo a medias", () => {
  // Delimitado por lo que viene DESPUÉS, no por un número de caracteres: un corte fijo se queda
  // corto en cuanto el endpoint crece y el test pasa a comprobar media función sin avisar.
  function bloqueLote() {
    const i = server.indexOf('app.post("/api/inventario/productos/lote"');
    assert.ok(i > 0, "sigue existiendo el alta en lote");
    const fin = server.indexOf("// 3-5) Sesión de conteo", i);
    assert.ok(fin > i, "y la sesión de conteo justo después");
    return server.slice(i, fin);
  }
  test("todo en una transacción, con vuelta atrás", () => {
    const c = bloqueLote();
    assert.match(c, /await client\.query\("BEGIN"\)/);
    assert.match(c, /await client\.query\("COMMIT"\)/);
    assert.match(c, /await client\.query\("ROLLBACK"\)/);
    assert.match(c, /client\.release\(\)/);
  });
  test("se valida ANTES de abrir la transacción: un nombre vacío no escribe nada", () => {
    const c = bloqueLote();
    const iVal = c.indexOf("if (prev.errores.length)"), iBegin = c.indexOf('client.query("BEGIN")');
    assert.ok(iVal > 0 && iBegin > iVal, "el 400 sale antes del BEGIN");
  });
  test("los duplicados se releen DENTRO de la transacción", () => {
    // La comprobación de fuera es de comodidad; sin esta, dos pestañas abiertas la saltan.
    const c = bloqueLote();
    const iBegin = c.indexOf('client.query("BEGIN")');
    assert.ok(c.indexOf("const dentro = ") > iBegin, "se relee después del BEGIN");
    assert.match(c, /FOR UPDATE/, "y el proveedor se bloquea para poner las peticiones en fila");
  });
  test("copiar de otro local se resuelve en el servidor, no se fía del navegador", () => {
    const c = bloqueLote();
    assert.match(c, /puedeAccederLocal\(req, o\.local\)/, "se comprueba el permiso sobre el local de ORIGEN");
  });
});
