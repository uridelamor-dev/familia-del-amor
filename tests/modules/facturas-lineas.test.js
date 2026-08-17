import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizarLinea, normalizarLineas, validarSuma, mensajeValidacion,
  claveProducto, grupoDeSQL } from "../../src/modules/facturas/lineas.js";
import { agrupaComoLaBase } from "../helpers/agrupa-como-la-base.js";
// `facturas.js` importa `pdf-lib`, que aquí no está instalado (npm install no funciona en
// local: el lockfile apunta al firewall de Replit). Se carga en tiempo de ejecución y, si
// falta, estos tests se SALTAN con el motivo escrito. Dejarlos en rojo por una dependencia
// que sí existe en producción enseña a ignorar el rojo, que es peor que no tenerlos.
let FACT = null, MOTIVO_SALTO = null;
try { FACT = await import("../../facturas.js"); }
catch (e) { MOTIVO_SALTO = `facturas.js no se puede cargar aquí: ${e.message.split("\n")[0]}`; }


const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("líneas — normalizar lo que devuelve el modelo", () => {
  test("una línea normal", () => {
    const l = normalizarLinea({ descripcion: "COCA COLA 33CL CAJA 24U", cantidad: 2, unidad: "caja", precio_unitario: 14.4, importe: 28.8 });
    assert.equal(l.descripcion, "COCA COLA 33CL CAJA 24U");
    assert.equal(l.cantidad, 2);
    assert.equal(l.importe, 28.8);
    assert.equal(l.dudosa, false);
  });

  test("acepta la coma decimal, que es como vienen las facturas de aquí", () => {
    const l = normalizarLinea({ descripcion: "Aceite", cantidad: "1,5", precio_unitario: "8,90", importe: "13,35" });
    assert.equal(l.cantidad, 1.5);
    assert.equal(l.precio_unitario, 8.9);
    assert.equal(l.importe, 13.35);
  });

  test("si falta el importe pero hay cantidad y precio, se calcula: eso es aritmética", () => {
    assert.equal(normalizarLinea({ descripcion: "X", cantidad: 3, precio_unitario: 2.5 }).importe, 7.5);
  });

  test("PERO NO SE INVENTA LO QUE NO HAY: sin importe ni precio, queda marcada", () => {
    const l = normalizarLinea({ descripcion: "Algo borroso" });
    assert.equal(l.importe, null);
    assert.equal(l.dudosa, true, "una línea ilegible tiene que verse como tal, no colarse");
  });

  test("una línea sin descripción también es dudosa", () => {
    assert.equal(normalizarLinea({ importe: 12 }).dudosa, true);
  });

  test("las líneas vacías del todo se descartan, no llenan la tabla de ruido", () => {
    assert.equal(normalizarLineas([{ descripcion: "A", importe: 1 }, {}, { descripcion: "" }]).length, 1);
  });

  test("sin líneas no revienta", () => {
    assert.deepEqual(normalizarLineas(null), []);
    assert.deepEqual(normalizarLineas("no es un array"), []);
  });
});

describe("líneas — la suma tiene que cuadrar con la base", () => {
  const l = (importe) => ({ descripcion: "X", importe, dudosa: false });

  test("cuadra exacto", () => {
    const v = validarSuma([l(10), l(20), l(5)], 35);
    assert.equal(v.cuadra, true);
    assert.equal(v.motivo, "ok");
  });

  test("aguanta los redondeos por línea: un céntimo por línea no es un error", () => {
    const lineas = Array.from({ length: 30 }, () => l(1.01));
    assert.equal(validarSuma(lineas, 30).cuadra, true);
  });

  test("UN 12 DONDE PONÍA 1,2 SALTA", () => {
    // El error que no se puede detectar de ninguna otra forma.
    const v = validarSuma([l(10), l(12), l(5)], 16.2);
    assert.equal(v.cuadra, false);
    assert.equal(v.motivo, "descuadre");
    assert.match(mensajeValidacion(v), /Revísalo antes de fiarte/);
  });

  test("sin líneas no se da por buena", () => {
    assert.equal(validarSuma([], 100).cuadra, false);
    assert.match(mensajeValidacion(validarSuma([], 100)), /No se pudo leer el detalle/);
  });

  test("sin base imponible se dice, no se finge que cuadra", () => {
    const v = validarSuma([l(10)], null);
    assert.equal(v.cuadra, false);
    assert.equal(v.motivo, "sin_base");
  });

  test("AUNQUE CUADRE, si hay líneas sin leer se avisa", () => {
    // El total puede estar bien y aun así faltar el detalle de dos productos.
    const v = validarSuma([l(30), { descripcion: "borroso", importe: null, dudosa: true }], 30);
    assert.equal(v.cuadra, true);
    assert.equal(v.dudosas, 1);
    assert.match(mensajeValidacion(v), /no se leyeron del todo/);
  });

  test("el mensaje dice las dos cifras y la diferencia, para poder mirarlo", () => {
    const m = mensajeValidacion(validarSuma([l(10), l(12)], 16.2));
    assert.match(m, /22/);
    assert.match(m, /16\.2/);
    assert.match(m, /\+5\.8/);
  });
});

describe("líneas — agrupar por producto", () => {
  const lin = (descripcion, o = {}) => ({ descripcion, cantidad: 1, importe: 10, ...o });

  test("la clave ignora mayúsculas, acentos y ruido de puntuación", () => {
    assert.equal(claveProducto("COCA-COLA 33CL"), claveProducto("coca cola 33cl"));
    assert.equal(claveProducto("Melocotón  en  almíbar"), "melocoton en almibar");
  });

  test("suma cantidades e importes del mismo producto", () => {
    const g = agrupaComoLaBase([
      lin("COCA COLA 33CL", { cantidad: 2, importe: 28.8, fecha: "2026-03-04", precio_unitario: 14.4, proveedor: "Damm" }),
      lin("Coca-Cola 33cl", { cantidad: 3, importe: 44.7, fecha: "2026-05-02", precio_unitario: 14.9, proveedor: "Damm" }),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].cantidad, 5);
    assert.equal(g[0].importe, 73.5);
    assert.equal(g[0].veces, 2);
  });

  test("DICE CUÁNTO HA SUBIDO EL PRECIO: es lo que hace que esto valga sin enlazar nada", () => {
    const g = agrupaComoLaBase([
      lin("Aceite girasol 5L", { precio_unitario: 10, fecha: "2026-01-10" }),
      lin("Aceite girasol 5L", { precio_unitario: 10.8, fecha: "2026-06-10" }),
    ]);
    assert.equal(g[0].variacionPct, 8, "subió un 8 % y nadie se enteró");
    assert.equal(g[0].ultimoPrecio, 10.8);
    assert.equal(g[0].primera, "2026-01-10");
    assert.equal(g[0].ultima, "2026-06-10");
  });

  test("DOS PROVEEDORES QUE LO LLAMAN DISTINTO SIGUEN SEPARADOS, a propósito", () => {
    // En esta fase no hay diccionario. Dos filas honestas son mejores que una fusión
    // inventada: si se juntara «REFRESCO COLA» con «COCA COLA» y no fuera lo mismo, el
    // número saldría mal y nadie volvería a mirarlo.
    const g = agrupaComoLaBase([lin("COCA COLA 33CL"), lin("REFRESCO COLA LATA")]);
    assert.equal(g.length, 2);
  });

  test("ordena por lo que más dinero se lleva", () => {
    const g = agrupaComoLaBase([lin("Barato", { importe: 5 }), lin("Caro", { importe: 500 })]);
    assert.equal(g[0].descripcion, "Caro");
  });

  test("SI NADA SE PUDO LEER, el importe es null y NO cero", () => {
    // Un «0 €» se lee como «no gastamos nada»; lo que pasa es que no se pudo leer. Que la
    // pantalla pinte «—» y no un cero depende enteramente de esto.
    const g = agrupaComoLaBase([{ descripcion: "Gambas rojas", cantidad: null, importe: null, dudosa: true }]);
    assert.equal(g[0].importe, null);
    assert.equal(g[0].cantidad, null);
    assert.equal(g[0].dudosas, 1);
  });

  test("pero si alguna línea sí se leyó, se suma lo que hay", () => {
    const g = agrupaComoLaBase([
      { descripcion: "Gambas", importe: 40, cantidad: 2 },
      { descripcion: "Gambas", importe: null, cantidad: null, dudosa: true },
    ]);
    assert.equal(g[0].importe, 40);
    assert.equal(g[0].cantidad, 2);
    assert.equal(g[0].dudosas, 1, "y se dice que una no se leyó");
  });

  test("los que no se pudieron leer no se cuelan arriba del todo al ordenar", () => {
    const g = agrupaComoLaBase([
      { descripcion: "Ilegible", importe: null },
      { descripcion: "Caro", importe: 500 },
    ]);
    assert.equal(g[0].descripcion, "Caro");
  });

  test("una línea sin descripción no crea un grupo fantasma", () => {
    assert.equal(agrupaComoLaBase([{ descripcion: "", importe: 10 }]).length, 0);
  });

  test("guarda de qué proveedores viene, para poder comparar", () => {
    const g = agrupaComoLaBase([
      lin("Gambas", { proveedor: "Salma" }), lin("Gambas", { proveedor: "Amat" }), lin("Gambas", { proveedor: "Salma" }),
    ]);
    assert.deepEqual(g[0].proveedores.sort(), ["Amat", "Salma"]);
  });
});

describe("releer las antiguas — sacar el id de Drive del enlace guardado", { skip: MOTIVO_SALTO }, () => {
  // Si esto falla, no se relee NADA: es lo único que conecta la factura de la base con su
  // PDF, porque en su día se guardó el enlace y no el identificador.
  test("del formato que guarda Drive (webViewLink)", () => {
    assert.equal(FACT.idDeDriveUrl("https://drive.google.com/file/d/1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuV/view?usp=drivesdk"),
      "1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuV");
  });
  test("y del formato antiguo con ?id=", () => {
    assert.equal(FACT.idDeDriveUrl("https://drive.google.com/open?id=1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuV"),
      "1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuV");
  });
  test("con guiones y guiones bajos, que Drive usa", () => {
    assert.equal(FACT.idDeDriveUrl("https://drive.google.com/file/d/1a2B-3c4D_5e6F7g8H9i0JkLmNoPqRs/view"),
      "1a2B-3c4D_5e6F7g8H9i0JkLmNoPqRs");
  });
  test("sin enlace devuelve null y no una cadena rara", () => {
    for (const v of [null, "", "no es una url", "https://drive.google.com/", undefined]) {
      assert.equal(FACT.idDeDriveUrl(v), null, String(v));
    }
  });
  test("no se traga un id demasiado corto: mejor no releer que descargar cualquier cosa", () => {
    assert.equal(FACT.idDeDriveUrl("https://drive.google.com/file/d/abc/view"), null);
  });
});

describe("releer las antiguas — cableado", () => {
  const server = fs.readFileSync(path.join(RAIZ, "server.js"), "utf8");

  test("va POR TANDAS, no todas de golpe", () => {
    // Cada factura es una descarga más una lectura con el modelo. Cientos en una sola
    // petición acabarían en un tiempo de espera agotado a la mitad y sin saber por dónde.
    assert.match(server, /lineas\/releer/);
    assert.match(server, /LIMIT \?/);
  });

  test("una factura que no se puede leer se MARCA, para no bloquear el avance", () => {
    // Si no, un PDF que ya no está en Drive saldría en cada tanda y la relectura no
    // avanzaría nunca.
    assert.match(server, /lineas_estado = 'no_leible'/);
  });

  test("no se lanzan dos relecturas a la vez", () => {
    assert.match(server, /_releyendo/);
  });

  test("releer NO toca la cabecera de la factura", () => {
    // Proveedor, fecha e importes pueden estar corregidos a mano; volver a escribirlos con
    // lo que diga el modelo desharía ese trabajo.
    const fx = fs.readFileSync(path.join(RAIZ, "facturas.js"), "utf8");
    const fn = /export async function releerLineasFactura[\s\S]{0,1200}?\n}/.exec(fx)[0];
    assert.equal(/UPDATE facturas SET (?!lineas_)/.test(fn), false, "solo debe tocar las líneas");
    assert.match(fn, /DELETE FROM factura_lineas WHERE factura_id/, "y ser idempotente");
  });
});

describe("el descuento: lo que se paga, no lo que pone la tarifa", () => {
  // La factura real de Tupinamba:
  // P.UNIDAD 0,52 · IMPORTE 234,00 · DTO 48,08 % · TOTAL 121,49
  const CAPSULAS = { descripcion: "CAPSULAS TUPISPRESSO SOFT 150 UDS", cantidad: 450, unidad: "ud",
    precio_unitario: 0.52, importe: 234, descuento_pct: 48.08, importe_neto: 121.49 };

  test("el importe que se guarda es el que se paga", () => {
    assert.equal(normalizarLinea(CAPSULAS).importe, 121.49);
  });
  test("y el precio unitario también: 0,27 €, no 0,52 €", () => {
    // Es lo que rompía el seguimiento de subidas: comparaba precios que nadie paga.
    assert.equal(normalizarLinea(CAPSULAS).precio_unitario, 0.27);
  });
  test("el bruto y el descuento se guardan: si un mes deja de aplicarse, se ve", () => {
    const l = normalizarLinea(CAPSULAS);
    assert.equal(l.importe_bruto, 234);
    assert.equal(l.precio_bruto, 0.52);
    assert.equal(l.descuento_pct, 48.08);
  });
  test("si la factura no da el neto, se calcula del porcentaje", () => {
    const l = normalizarLinea({ ...CAPSULAS, importe_neto: null });
    assert.equal(l.importe, 121.49);
  });
  test("sin descuento, todo se queda como estaba", () => {
    const l = normalizarLinea({ descripcion: "X", cantidad: 10, precio_unitario: 2, importe: 20 });
    assert.equal(l.importe, 20);
    assert.equal(l.precio_unitario, 2);
    assert.equal(l.importe_bruto, null, "no se guarda un bruto que es igual al neto");
    assert.equal(l.descuento_pct, null);
  });
  test("un descuento de 0 % o de 100 % no se guarda: o no hay, o el dato está mal", () => {
    assert.equal(normalizarLinea({ descripcion: "X", importe: 10, descuento_pct: 0 }).descuento_pct, null);
    assert.equal(normalizarLinea({ descripcion: "X", importe: 10, descuento_pct: 100 }).descuento_pct, null);
  });
  test("si el neto sale MAYOR que el bruto, la línea es dudosa: no cuadra", () => {
    const l = normalizarLinea({ descripcion: "X", cantidad: 1, importe: 10, importe_neto: 40 });
    assert.equal(l.dudosa, true);
  });
  test("sin cantidad no se reparte el neto: se deja el precio de tarifa antes que inventar uno", () => {
    const l = normalizarLinea({ descripcion: "X", precio_unitario: 5, importe: 100, descuento_pct: 50 });
    assert.equal(l.importe, 50);
    assert.equal(l.precio_unitario, 5);
  });
  test("la suma de las líneas cuadra con la base usando los NETOS", () => {
    // Antes sumaba los brutos y descuadraba con la base imponible en cada factura con dto.
    const ls = normalizarLineas([CAPSULAS, { descripcion: "AZUCAR", cantidad: 1, precio_unitario: 44.72,
      importe: 44.72, descuento_pct: 50.07, importe_neto: 22.33 }]);
    const v = validarSuma(ls, 143.82);
    assert.equal(v.cuadra, true, `suma ${v.suma} vs base ${v.base}`);
  });
});

// ── Lo que devuelve la base ya agrupado ────────────────────────────────────
// La agrupación por producto la hace ahora la consulta: un producto comprado quinientas veces
// es UNA fila. Esto comprueba la traducción de esa fila al idioma del panel.

describe("una fila ya agrupada por la base", () => {
  const SQL = (extra = {}) => ({
    clave: "coca cola 33cl", descripcion: "COCA COLA 33CL", unificado: false,
    proveedores: ["Grau"], veces: 4, dudosas: 0, concantidad: 4, conimporte: 4,
    cantidad: 70, importe: 42.92, preciomin: 0.58, preciomax: 0.7,
    primera: "2026-06-01", ultima: "2026-08-01",
    precios: [0.62, 0.58, 0.7, 0.6],
    precios_fechas: ["2026-08-01", "2026-08-01", "2026-07-01", "2026-06-01"],
    ...extra,
  });

  test("los precios y sus fechas se casan, que es lo que permite la mediana", () => {
    const g = grupoDeSQL(SQL());
    assert.equal(g.precios.length, 4);
    assert.deepEqual(g.precios[0], { precio: 0.62, fecha: "2026-08-01" });
    assert.equal(g.precioNormal, 0.61, "mediana de 0,58 0,60 0,62 0,70");
  });

  test("el último precio es el de la compra más reciente", () => {
    assert.equal(grupoDeSQL(SQL()).ultimoPrecio, 0.62);
  });

  test("con varios proveedores NO se afirma un precio normal", () => {
    // Que esté más caro en Makro que en el mayorista no es una subida, es otro proveedor.
    assert.equal(grupoDeSQL(SQL({ proveedores: ["Grau", "Makro"] })).precioNormal, null);
  });

  test("null sigue significando «no se pudo leer», no cero", () => {
    // Un 0 se lee como «no compramos nada», y lo que pasa es que la factura no traía cantidad.
    const g = grupoDeSQL(SQL({ concantidad: 0, cantidad: null, precios: null, precios_fechas: null }));
    assert.equal(g.cantidad, null);
    assert.equal(g.importe, 42.92, "el importe sí venía");
    assert.equal(g.ultimoPrecio, null);
    assert.equal(g.precioNormal, null);
    assert.deepEqual(g.precios, []);
  });

  test("un producto del diccionario viene marcado y con su nombre bueno", () => {
    const g = grupoDeSQL(SQL({ clave: "p:7", descripcion: "Coca-Cola 33cl", unificado: true }));
    assert.equal(g.clave, "p:7");
    assert.equal(g.descripcion, "Coca-Cola 33cl");
    assert.equal(g.unificado, true);
  });

  test("la subida se calcula del mínimo al máximo del periodo", () => {
    // De 0,58 a 0,70 hay un 20,7 %.
    assert.equal(grupoDeSQL(SQL()).variacionPct, 20.7);
    assert.equal(grupoDeSQL(SQL({ preciomin: null, preciomax: null })).variacionPct, null);
  });

  test("la unidad solo se enseña si TODAS las compras coinciden", () => {
    // «441» sin unidad no dice nada; «441» sumando kilos y unidades diría algo falso.
    assert.equal(grupoDeSQL(SQL({ unidades: ["kg"] })).unidad, "kg");
    assert.equal(grupoDeSQL(SQL({ unidades: ["kg", "ud"] })).unidad, null);
    assert.equal(grupoDeSQL(SQL({ unidades: [] })).unidad, null);
    assert.equal(grupoDeSQL(SQL()).unidad, null);
  });

  test("una fila vacía no revienta ni se inventa nada", () => {
    const g = grupoDeSQL({});
    assert.equal(g.veces, 0);
    assert.equal(g.cantidad, null);
    assert.equal(g.importe, null);
    assert.deepEqual(g.proveedores, []);
    assert.equal(g.precioNormal, null);
  });
});

describe("la consulta descarta lo que el agrupado descartaba", () => {
  test("las líneas sin clave no crean un producto fantasma", () => {
    // Una línea cuya descripción no se pudo leer tiene la clave vacía. Agrupadas todas juntas
    // saldría una fila sin nombre con un gasto que no es de ningún producto. Lo hacía el
    // agrupado del servidor; al mudarlo a la consulta había que llevárselo también.
    const server = fs.readFileSync(new URL("../../server.js", import.meta.url), "utf8");
    const fn = server.slice(server.indexOf("async function comprasDeLocal("), server.indexOf('app.get("/api/facturas/compras"'));
    assert.match(fn, /condLin\.push\(`COALESCE\(l\.clave,''\) <> ''`\)/);
  });
});

describe("el histórico de un producto ya unificado", () => {
  const server = fs.readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const i = server.indexOf('app.get("/api/facturas/compras/producto"');
  const fn = server.slice(i, server.indexOf("\n});\n", i));

  test("«p:12» se busca por sus formas de escribirlo, no como si fuera texto", () => {
    // Era el fallo: `claveProducto("p:12")` da «p 12», que no es la clave de nada. El
    // histórico salía VACÍO justo en los productos ya unificados —los que más interesa
    // mirar— y con él el filtro de fechas, que no tenía nada que filtrar.
    assert.equal(claveProducto("p:12"), "p 12", "si esto cambia, el motivo del arreglo cambia");
    assert.match(fn, /l\.clave IN \(SELECT clave FROM producto_alias WHERE producto_id = \?\)/);
  });

  test("y se enseña el nombre del diccionario, no el que escriba cada proveedor", () => {
    assert.match(fn, /SELECT nombre FROM productos_canonicos WHERE id = \?/);
  });

  test("el filtro de fechas sigue aplicándose igual", () => {
    assert.match(fn, /cond\.push\("f\.fecha >= \?"\)/);
    assert.match(fn, /cond\.push\("f\.fecha <= \?"\)/);
  });
});

describe("cuando la cantidad viene en paquetes y el precio por unidad", () => {
  // El caso real de Tupinamba, con la factura delante:
  //   UDS. PACK 3 · UDS. TOTALES 450 · P. UNIDAD 0,52 · IMPORTE 234,00 · DTO 48,08 · TOTAL 121,49
  const CAPSULAS = { descripcion: "CAPSULAS TUPISPRESSO SOFT 150 UDS", cantidad: 3, unidad: "PACK",
    precio_unitario: 0.52, importe: 234, descuento_pct: 48.08, importe_neto: 121.49 };

  test("se deshace el paquete y el precio pasa a ser el de verdad", () => {
    const l = normalizarLinea(CAPSULAS);
    assert.equal(l.cantidad, 450, "3 packs de 150 son 450 cápsulas");
    assert.equal(l.precio_unitario, 0.27, "121,49 € entre 450 cápsulas");
    assert.equal(l.factor_unidad, 150);
    assert.equal(l.unidad, "ud", "«450 PACK» sería peor que no decir nada");
  });

  test("el importe NO se toca: es lo que se pagó", () => {
    // Lo único que cambia es cómo se reparte, nunca cuánto.
    assert.equal(normalizarLinea(CAPSULAS).importe, 121.49);
  });

  test("y la línea no se marca dudosa: la aritmética es exacta, no una suposición", () => {
    assert.equal(normalizarLinea(CAPSULAS).dudosa, false);
  });

  test("no se toca nada si el factor no es un número entero de unidades", () => {
    // Precio por kilo con la cantidad en piezas, por ejemplo: ahí no sabemos qué pasa, y
    // corregir a ciegas es peor que no corregir.
    const l = normalizarLinea({ descripcion: "Jamón", cantidad: 2, precio_unitario: 10, importe: 47 });
    assert.equal(l.cantidad, 2);
    assert.equal(l.factor_unidad, null);
  });

  test("ni cuando cantidad × precio ya cuadra con el importe", () => {
    const l = normalizarLinea({ descripcion: "Coca-Cola", cantidad: 24, precio_unitario: 0.62, importe: 14.88 });
    assert.equal(l.cantidad, 24);
    assert.equal(l.factor_unidad, null);
    assert.equal(l.precio_unitario, 0.62);
  });

  test("ni con un factor de 1: eso no es un paquete, es un redondeo", () => {
    const l = normalizarLinea({ descripcion: "Café", cantidad: 10, precio_unitario: 3.33, importe: 33.31 });
    assert.equal(l.cantidad, 10);
    assert.equal(l.factor_unidad, null);
  });

  test("y la suma con la base imponible sigue cuadrando igual", () => {
    // Es la salvaguarda de todo el módulo: si tocar la cantidad descuadrara la factura, el
    // arreglo sería peor que el fallo.
    const ls = normalizarLineas([CAPSULAS, { descripcion: "Azúcar", cantidad: 1, precio_unitario: 44.72, importe: 44.72, descuento_pct: 50.07, importe_neto: 22.33 }]);
    assert.equal(validarSuma(ls, 143.82).cuadra, true);
  });
});

describe("corregir a mano la lectura de una compra", () => {
  const server = fs.readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const panel = fs.readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");
  const i = server.indexOf('app.patch("/api/facturas/lineas/:id"');
  const fn = server.slice(i, server.indexOf("\n});\n", i));

  test("corregir la CANTIDAD no cambia el importe", () => {
    // Ese es el caso del paquete: se pagaron 121,49 € y lo que se corrige es entre cuántas
    // unidades se reparten. Si el importe se moviera, la factura dejaría de cuadrar.
    assert.ok(i > 0, "falta el endpoint de corregir línea");
    assert.match(fn, /\} else if \(importe != null && cantidad\) \{\s*\n\s*precio = Math\.round\(\(importe \/ cantidad\) \* 100\) \/ 100;/);
  });

  test("pero el IMPORTE sí se puede corregir cuando está mal leído", () => {
    // Es otro caso distinto: «12,49» donde el papel pone «121,49». Ahí el número guardado no
    // es lo que se pagó, es una errata de lectura, y la única salida era releer la factura
    // entera con el modelo.
    assert.match(fn, /if \(importePedido != null\) \{\s*\n\s*importe = importePedido;/);
  });

  test("manda el número que se ha escrito, y el otro se recalcula", () => {
    // Ver cambiar por detrás lo que acabas de teclear es la forma más rápida de dejar de
    // fiarte de una pantalla.
    assert.match(fn, /precio = cantidad \? Math\.round\(\(importe \/ cantidad\) \* 100\) \/ 100 : precio;/);
    assert.match(fn, /importe = cantidad != null \? Math\.round\(precio \* cantidad \* 100\) \/ 100 : importe;/);
  });

  test("y al corregir se vuelve a mirar si la factura cuadra", () => {
    // Es el sentido de poder corregir: que la etiqueta de «descuadre» desaparezca sola. Sin
    // recalcular, la factura seguiría marcada para siempre y nadie volvería a tocarla.
    assert.match(fn, /const v = validarSuma\(lineas, l\.base_imponible\);/);
    assert.match(fn, /v\.cuadra \? "ok" : "descuadre"/);
  });

  test("y solo en los establecimientos que esa persona puede tocar", () => {
    assert.match(fn, /puedeAccederLocal\(req, l\.local\)/);
  });

  test("aplicar a las demás guarda el FACTOR, no la cantidad", () => {
    // Un mes se piden 5 packs y otro 8: la cantidad buena es distinta, el tamaño del paquete
    // es el mismo.
    assert.match(fn, /cantidad = round\(cantidad \* \?, 3\)/);
    assert.match(fn, /l\.clave = \? AND f\.proveedor = \?/);
  });

  test("en pantalla se ve el precio que quedaría mientras se escribe", () => {
    // «0,27 €» se reconoce; «40,50 €» no. Es el número que dice si la corrección es la buena.
    assert.match(panel, /Quedaría a <b id="corPrecio"/);
    assert.match(panel, /inp\.addEventListener\("input", pinta\)/);
  });

  test("y al deshacer el paquete la unidad deja de ser «PACK»", () => {
    assert.match(panel, /\/pack\|caja\|bulto\|palet\|fardo\/i\.test\(u\.value\)/);
  });
});

describe("recuadrar hacia atrás lo ya guardado", () => {
  const server = fs.readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("no vuelve a leer ningún PDF: es aritmética sobre lo que hay", () => {
    const i = server.indexOf('app.post("/api/facturas/lineas/recuadrar"');
    assert.ok(i > 0, "falta el endpoint de recuadrar");
    const fn = server.slice(i, server.indexOf("\n});\n", i));
    assert.doesNotMatch(fn, /leerFactura|anthropic|drive_url/i);
    assert.match(fn, /UPDATE factura_lineas/);
  });

  test("solo toca las líneas donde el factor es un número entero de al menos 2", () => {
    // Un factor con decimales es otra cosa (precio por kilo con cantidad en piezas) y ahí
    // corregir a ciegas es peor que no corregir.
    assert.match(server, /WHERE l\.id = c\.id AND c\.f >= 2 AND abs\(c\.f - round\(c\.f\)\) < 0\.01/);
  });

  test("y el importe se queda como estaba", () => {
    // En el RECUADRE automático sí es intocable: ahí no se está corrigiendo una errata, se está
    // repartiendo un importe correcto entre las unidades que de verdad venían.
    // Solo el endpoint de recuadrar: entre él y el de releer hay ahora otros que sí tocan el
    // importe a propósito, y cogerlos también hacía fallar al test por donde no era.
    const i = server.indexOf('app.post("/api/facturas/lineas/recuadrar"');
    const fn = server.slice(i, server.indexOf("\n});\n", i));
    assert.doesNotMatch(fn, /SET[\s\S]{0,200}importe =/);
  });
});
