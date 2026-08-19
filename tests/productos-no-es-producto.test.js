import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// En Productos aparecía «La Cooperativa (Blanes)» como si fuera un artículo —371 €, 4 veces—,
// y en la cola de unificar salían horas de operario y media hoja de la gestoría. Eran gastos
// de verdad, pero no mercancía. Y no había forma de quitarlos: ni renombrar ni apartar.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("apartar no es borrar, y esto es lo que lo garantiza", () => {
  test("apartar no toca la factura: ni borra la línea ni la reescribe", () => {
    // El documento es la prueba de un gasto que se pagó. Lo que se aparta es la
    // interpretación de que eso era un artículo, no el papel. (Borrar una línea a mano sí
    // existe, con auditoría y por otro camino: `DELETE /api/facturas/linea/:id`. Lo que este
    // candado protege es que APARTAR no se convierta nunca en eso.)
    const ep = server.slice(server.indexOf('app.post("/api/facturas/diccionario"'),
                            server.indexOf('app.post("/api/facturas/diccionario/unificar"'));
    assert.ok(!/factura_lineas/i.test(ep), "apartar no puede ni mirar la tabla de líneas");
    const dev = server.slice(server.indexOf('app.post("/api/facturas/productos/devolver"'),
                             server.indexOf('app.post("/api/facturas/productos/devolver"') + 900);
    assert.ok(!/factura_lineas/i.test(dev), "devolver tampoco");
  });

  test("lo apartado vive en producto_alias, que ya es la tabla de decisiones humanas", () => {
    assert.match(server, /ALTER TABLE producto_alias ADD COLUMN IF NOT EXISTS descartado BOOLEAN/);
    assert.match(server, /descarte_motivo TEXT/);
  });
});

describe("lo apartado sale del catálogo, pero se dice cuánto", () => {
  test("la lista de productos lo excluye", () => {
    assert.match(server, /const APARTADO = `EXISTS \(SELECT 1 FROM producto_alias ap WHERE ap\.clave = l\.clave AND ap\.descartado\)`/);
    assert.match(server, /condLin\.push\(`NOT \$\{APARTADO\}`\)/);
  });

  test("y se cuenta aparte para poder enseñarlo", () => {
    // Un total que baja sin explicación es peor que el problema que venía a resolver.
    assert.match(server, /apartadas: apartadas\?\.n \|\| 0/);
    assert.match(server, /apartadasGasto: apartadas\?\.gasto \|\| 0/);
    assert.match(panel, /No son productos/);
  });

  test("se puede volver atrás", () => {
    assert.match(server, /app\.post\("\/api\/facturas\/productos\/devolver"/);
    assert.match(server, /DELETE FROM producto_alias WHERE clave = \? AND descartado/);
    assert.match(panel, /data-apart="devolver"/);
  });
});

describe("el aviso señala, no decide", () => {
  test("la cola lleva el motivo escrito al lado", () => {
    assert.match(server, /const aviso = noEsProducto\(p\.descripcion, casa\)/);
    assert.match(panel, /Esto no parece un producto/);
  });

  test("nada se aparta solo: siempre hay que pulsar y decir por qué", () => {
    const ep = server.slice(server.indexOf('app.post("/api/facturas/diccionario"'), server.indexOf('app.post("/api/facturas/diccionario/unificar"'));
    assert.match(ep, /const noProducto = !!req\.body\?\.no_producto/, "es una decisión que llega del panel");
    assert.ok(!/noEsProducto\(/.test(ep), "el detector NO puede apartar por su cuenta");
  });

  test("los nombres de la casa se derivan, no se copian", () => {
    assert.match(server, /nombresDeLaCasa\(\{ empresas \}\)/);
    assert.match(server, /FROM facturas_locales WHERE COALESCE\(empresa/);
  });
});

describe("se puede arreglar desde donde se ve", () => {
  test("la ficha del producto ya no tiene solo «Cerrar»", () => {
    const i = panel.indexOf("async function comprasHistorial");
    const fn = panel.slice(i, i + 6000);
    assert.match(fn, /id="chRen"/, "falta cambiar el nombre");
    assert.match(fn, /id="chNoProd"/, "falta apartar");
  });

  test("renombrar funciona con las dos clases de fila", () => {
    const i = panel.indexOf('ov.querySelector("#chRen")');
    const fn = panel.slice(i, i + 900);
    assert.match(fn, /startsWith\("p:"\)/, "un producto del diccionario y una clave suelta no se renombran igual");
    assert.match(fn, /PUT", "\/api\/facturas\/productos\//);
    assert.match(fn, /nombre_nuevo/);
  });

  test("y la cola tiene su botón, distinto de «va solo»", () => {
    assert.match(panel, /data-dic="noprod"/);
    assert.match(panel, /data-dic="aparte"/);
    assert.ok(panel.indexOf('data-dic="noprod"') !== panel.indexOf('data-dic="aparte"'));
  });
});
