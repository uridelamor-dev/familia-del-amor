// Compras y Productos: lo que se ve al abrirlas.
//
// Estas dos pantallas se abren todos los días y son tablas: cada píxel que se gasta arriba es
// una fila menos que se ve sin desplazar. Medido en un portátil de 1440×800, la primera fila
// empezaba a 448 px en Compras y a 539 px en Productos — cinco filas de catorce.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/panel/index.html", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("Compras: las cifras de arriba contestan la pregunta del día", () => {
  test("qué hay que pagar y cuándo, no cuánto se gastó", () => {
    // Antes eran cuatro tarjetas —facturas, base, IVA, total— que son cuatro vistas del mismo
    // número; para saber si algo estaba vencido había que irse a la pestaña de Pagos.
    assert.match(panel, /stat\("Por pagar"/);
    assert.match(panel, /stat\("Vence esta semana"/);
    assert.match(panel, /Vencido<\/div>/);
  });

  test("y la base y el IVA no se pierden: bajan a una línea", () => {
    assert.match(panel, /base \$\{esc\(eur\(t\.base\)\)\} · IVA \$\{esc\(eur\(t\.iva\)\)\}/);
  });

  test("el servidor los calcula con el MISMO filtro que la tabla", () => {
    // Si las cifras fueran del año entero y la tabla del filtro, se leerían como del filtro.
    const i = server.indexOf("AS vencidas");
    assert.ok(i > 0, "faltan los agregados de vencimiento");
    assert.match(server.slice(i - 900, i + 900), /FROM facturas \$\{where\}/);
  });

  test("y los «?» de esos agregados van antes que los del WHERE", () => {
    // `toPositional` numera los «?» por su sitio en el SQL: pasarlos al final los cruzaría con
    // los del filtro y la consulta compararía fechas con nombres de establecimiento.
    assert.match(server, /\[hoyISO\(\), hoyISO\(\), hoyISO\(\), hoyMas\(7\), hoyISO\(\), hoyMas\(7\), \.\.\.params\]/);
  });
});

describe("Compras: la tabla", () => {
  test("no repite el establecimiento en cada fila cuando solo hay uno", () => {
    assert.match(panel, /const conLocal = !localActualFE\(\);/);
  });

  test("la fecha se lee («16 ago»), no se descifra («2026-08-16»)", () => {
    assert.match(panel, /esc\(fechaCorta\(f\.fecha\) \|\| \(f\.fecha \|\| ""\)\.slice\(0, 10\)\)/);
  });

  test("la fila entera abre la ficha, pero la casilla de marcar sigue siendo suya", () => {
    assert.match(panel, /class="\$\{FAC_SEL\.has\(f\.id\) \? "sel" : ""\} facrow"/);
    assert.match(panel, /t\.classList\.contains\("facrow"\) && e\.target\.closest\("input,button,a,label"\)/);
  });
});

describe("Productos: la tabla se lee de un vistazo", () => {
  test("los nombres no van pintados del color de marca", () => {
    // En rojo, una tabla de 167 productos se lee como una lista de errores.
    assert.match(css, /\.linkbtn\.prod\{color:var\(--ink\)/);
    assert.match(css, /\.linkbtn\.prod\{[^}]*text-overflow:ellipsis/);
  });

  test("la cantidad lleva su unidad, y solo si es una", () => {
    assert.match(panel, /g\.unidad \? ` <span class="mut" style="font-size:11px">\$\{esc\(g\.unidad\)\}<\/span>` : ""/);
    assert.match(server, /array_agg\(DISTINCT l\.unidad\) FILTER \(WHERE COALESCE\(l\.unidad,''\) <> ''\)/);
  });

  test("el gasto lleva su proporción, medida contra el que más gasta", () => {
    // Contra el total, con 167 productos todas las barras serían un pelo.
    assert.match(panel, /const topeGasto = Math\.max\(1, \.\.\.j\.grupos\.map\(\(g\) => Number\(g\.importe\) \|\| 0\)\)/);
  });

  test("los avisos son chips y los accionables son botones", () => {
    // Eran cuatro líneas de texto seguido encima de la tabla.
    assert.match(panel, /data-comp="releer-descuadre" data-n=/);
    assert.match(panel, /facRepasoLineas\(Number\(rd\.getAttribute\("data-n"\)\) \|\| 0, "descuadre"\)/);
  });

  test("«En qué se va el dinero» dice algo aun estando cerrado", () => {
    // Cerrado ponía «6 categorías», que no es información. Sigue cerrado: nada se abre solo.
    assert.match(panel, /g\.categorias\.slice\(0, 3\)\.map/);
    assert.match(panel, /<details class="card fold" style="margin-bottom:14px">/);
  });

  test("sin cola pendiente sigue habiendo forma de deshacer una unión", () => {
    // La caja de revisar se va, pero la lista del diccionario NO: ahí está el botón de quitar
    // una forma mal unida. Antes se iban las dos y no quedaba manera de deshacer.
    assert.match(panel, /caja\.innerHTML = dicProductosHtml\(\);/);
  });
});
