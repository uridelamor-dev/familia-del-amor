import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizarLinea, normalizarLineas, validarSuma, mensajeValidacion,
  claveProducto, agruparPorProducto,
} from "../../src/modules/facturas/lineas.js";
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
    const g = agruparPorProducto([
      lin("COCA COLA 33CL", { cantidad: 2, importe: 28.8, fecha: "2026-03-04", precio_unitario: 14.4, proveedor: "Damm" }),
      lin("Coca-Cola 33cl", { cantidad: 3, importe: 44.7, fecha: "2026-05-02", precio_unitario: 14.9, proveedor: "Damm" }),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].cantidad, 5);
    assert.equal(g[0].importe, 73.5);
    assert.equal(g[0].veces, 2);
  });

  test("DICE CUÁNTO HA SUBIDO EL PRECIO: es lo que hace que esto valga sin enlazar nada", () => {
    const g = agruparPorProducto([
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
    const g = agruparPorProducto([lin("COCA COLA 33CL"), lin("REFRESCO COLA LATA")]);
    assert.equal(g.length, 2);
  });

  test("ordena por lo que más dinero se lleva", () => {
    const g = agruparPorProducto([lin("Barato", { importe: 5 }), lin("Caro", { importe: 500 })]);
    assert.equal(g[0].descripcion, "Caro");
  });

  test("SI NADA SE PUDO LEER, el importe es null y NO cero", () => {
    // Un «0 €» se lee como «no gastamos nada»; lo que pasa es que no se pudo leer. Que la
    // pantalla pinte «—» y no un cero depende enteramente de esto.
    const g = agruparPorProducto([{ descripcion: "Gambas rojas", cantidad: null, importe: null, dudosa: true }]);
    assert.equal(g[0].importe, null);
    assert.equal(g[0].cantidad, null);
    assert.equal(g[0].dudosas, 1);
  });

  test("pero si alguna línea sí se leyó, se suma lo que hay", () => {
    const g = agruparPorProducto([
      { descripcion: "Gambas", importe: 40, cantidad: 2 },
      { descripcion: "Gambas", importe: null, cantidad: null, dudosa: true },
    ]);
    assert.equal(g[0].importe, 40);
    assert.equal(g[0].cantidad, 2);
    assert.equal(g[0].dudosas, 1, "y se dice que una no se leyó");
  });

  test("los que no se pudieron leer no se cuelan arriba del todo al ordenar", () => {
    const g = agruparPorProducto([
      { descripcion: "Ilegible", importe: null },
      { descripcion: "Caro", importe: 500 },
    ]);
    assert.equal(g[0].descripcion, "Caro");
  });

  test("una línea sin descripción no crea un grupo fantasma", () => {
    assert.equal(agruparPorProducto([{ descripcion: "", importe: 10 }]).length, 0);
  });

  test("guarda de qué proveedores viene, para poder comparar", () => {
    const g = agruparPorProducto([
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
