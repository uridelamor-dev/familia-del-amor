import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fusionarCompras, fusionarGrupos, fusionarCategorias } from "../../src/modules/facturas/compras-fusion.js";
import { agrupaComoLaBase } from "../helpers/agrupa-como-la-base.js";

const LLORET = "La Tapeta - Lloret", GIRONA = "La Tapeta - Girona";

// Las líneas tal como salen de la base, para poder comprobar lo importante: que fusionar dos
// locales da EXACTAMENTE lo mismo que si se hubieran agrupado juntos desde el principio.
const linea = (o) => ({ descripcion: o.d, cantidad: o.c ?? null, unidad: "ud", precio_unitario: o.p ?? null,
  importe: o.i ?? null, dudosa: !!o.dudosa, fecha: o.f, proveedor: o.prov || "Grau", factura_id: o.id || 1 });

describe("juntar dos locales da lo mismo que contarlos juntos", () => {
  const deLloret = [
    linea({ d: "COCA COLA 33CL", c: 24, p: 0.6, i: 14.4, f: "2026-06-01" }),
    linea({ d: "COCA COLA 33CL", c: 24, p: 0.7, i: 16.8, f: "2026-07-01" }),
    linea({ d: "ACEITE OLIVA 5L", c: 2, p: 30, i: 60, f: "2026-06-15" }),
  ];
  const deGirona = [
    linea({ d: "COCA COLA 33CL", c: 12, p: 0.5, i: 6, f: "2026-05-01", prov: "Bo de Debò" }),
    linea({ d: "COCA COLA 33CL", c: 12, p: 0.8, i: 9.6, f: "2026-07-20" }),
  ];

  const juntas = agrupaComoLaBase([...deLloret, ...deGirona]);
  const fusionadas = fusionarGrupos([agrupaComoLaBase(deLloret), agrupaComoLaBase(deGirona)]);

  const coca = (lista) => lista.find((g) => /coca/i.test(g.descripcion));

  test("las cantidades y el gasto salen igual", () => {
    assert.equal(coca(fusionadas).cantidad, coca(juntas).cantidad);
    assert.equal(coca(fusionadas).importe, coca(juntas).importe);
  });

  test("las veces también, que es lo que se lee como «cuántas veces lo compramos»", () => {
    assert.equal(coca(fusionadas).veces, coca(juntas).veces);
    assert.equal(coca(fusionadas).veces, 4);
  });

  test("la subida de precio se REHACE con el mínimo y el máximo de los dos", () => {
    // De 0,50 € (Girona) a 0,80 € (Girona) hay un 60 %. La media de los porcentajes de cada
    // local daría otra cosa, y ninguna de las dos sería el precio que se ha pagado.
    assert.equal(coca(fusionadas).variacionPct, coca(juntas).variacionPct);
    assert.equal(coca(fusionadas).variacionPct, 60);
  });

  test("la última compra y su precio son los del local que compró más tarde", () => {
    assert.equal(coca(fusionadas).ultima, "2026-07-20");
    assert.equal(coca(fusionadas).ultimoPrecio, 0.8);
    assert.equal(coca(fusionadas).primera, "2026-05-01");
  });

  test("los proveedores se juntan sin repetirse", () => {
    assert.deepEqual([...coca(fusionadas).proveedores].sort(), ["Bo de Debò", "Grau"]);
  });

  test("un producto que solo compra un local sigue estando", () => {
    assert.ok(fusionadas.find((g) => /ACEITE/.test(g.descripcion)));
  });

  test("y se ordena por gasto, como en un solo local", () => {
    assert.deepEqual(fusionadas.map((g) => g.importe), [...fusionadas.map((g) => g.importe)].sort((a, b) => b - a));
  });

  test("dos proveedores que escriben distinto el mismo producto siguen separados", () => {
    // Es la fase A a propósito (docs/lineas-de-factura.md): dos filas honestas valen más que
    // una fusión inventada. La fusión de locales no puede cambiar eso por su cuenta.
    const a = agrupaComoLaBase([linea({ d: "COCA COLA 33CL", i: 10, f: "2026-06-01" })]);
    const b = agrupaComoLaBase([linea({ d: "Coca-Cola 33 cl", i: 10, f: "2026-06-01" })]);
    assert.equal(fusionarGrupos([a, b]).length, 2);
  });
});

describe("lo que no se puede leer sigue sin poder leerse", () => {
  test("si ningún local trae la cantidad, no se inventa un cero", () => {
    // Un «0» se lee como «no compramos nada», y lo que pasa es que no se pudo leer.
    const a = agrupaComoLaBase([linea({ d: "GAMBA", i: 20, f: "2026-06-01" })]);
    const b = agrupaComoLaBase([linea({ d: "GAMBA", i: 30, f: "2026-06-02" })]);
    const f = fusionarGrupos([a, b]);
    assert.equal(f[0].cantidad, null);
    assert.equal(f[0].importe, 50);
  });

  test("si uno la trae y el otro no, se suma lo que hay y se dice de cuántas líneas sale", () => {
    const a = agrupaComoLaBase([linea({ d: "GAMBA", c: 5, i: 20, f: "2026-06-01" })]);
    const b = agrupaComoLaBase([linea({ d: "GAMBA", i: 30, f: "2026-06-02" })]);
    const f = fusionarGrupos([a, b]);
    assert.equal(f[0].cantidad, 5);
    assert.equal(f[0].conCantidad, 1);
    assert.equal(f[0].veces, 2);
  });

  test("las líneas dudosas se acumulan: siguen marcadas después de fusionar", () => {
    const a = agrupaComoLaBase([linea({ d: "GAMBA", i: 20, f: "2026-06-01", dudosa: true })]);
    const b = agrupaComoLaBase([linea({ d: "GAMBA", i: 30, f: "2026-06-02" })]);
    assert.equal(fusionarGrupos([a, b])[0].dudosas, 1);
  });
});

describe("el gasto por categoría", () => {
  const p = (cat, imp, provs, subs) => ({ categorias: [{ categoria: cat, importe: imp, proveedores: provs, subs }], sinCategoria: 0, sinCatProveedores: [], repartido: 0, total: imp });

  test("se suma por categoría y por subcategoría", () => {
    const f = fusionarCategorias([
      p("Bebidas", 100, ["Grau"], [{ subcategoria: "Vinos y cavas", importe: 60 }, { subcategoria: "", importe: 40 }]),
      p("Bebidas", 50, ["Bo de Debò"], [{ subcategoria: "Vinos y cavas", importe: 50 }]),
    ]);
    assert.equal(f.categorias[0].importe, 150);
    assert.deepEqual(f.categorias[0].proveedores, ["Bo de Debò", "Grau"]);
    assert.equal(f.categorias[0].subs.find((s) => s.subcategoria === "Vinos y cavas").importe, 110);
    assert.equal(f.total, 150);
  });

  test("lo que no está clasificado se suma y se dice de quién es", () => {
    const f = fusionarCategorias([
      { categorias: [], sinCategoria: 200, sinCatProveedores: ["Uno"], repartido: 0, total: 200 },
      { categorias: [], sinCategoria: 100, sinCatProveedores: ["Uno", "Dos"], repartido: 0, total: 100 },
    ]);
    assert.equal(f.sinCategoria, 300);
    assert.deepEqual(f.sinCatProveedores, ["Dos", "Uno"]);
  });
});

describe("la respuesta entera", () => {
  const parte = (local, o = {}) => ({
    ok: true, local, q: null, catalogoCategorias: [{ categoria: "Bebidas", subs: [] }],
    categorias: { categorias: [{ categoria: "Bebidas", importe: o.cat ?? 100, proveedores: ["Grau"], subs: [] }], sinCategoria: 0, sinCatProveedores: [], repartido: 0, total: o.cat ?? 100 },
    grupos: o.grupos || agrupaComoLaBase([linea({ d: o.prod || "COCA COLA", c: 10, p: 1, i: 10, f: "2026-06-01" })]),
    lineas: o.lineas || [],
    totales: { importe: o.imp ?? 10, productos: 1 },
    cobertura: { facturas: o.fac ?? 10, conDetalle: o.det ?? 8, descuadradas: 1, sinLeer: 1, noLeibles: 0, noAplica: 1 },
  });

  test("la cobertura se suma: son facturas distintas en cada local", () => {
    const f = fusionarCompras([parte(LLORET, { fac: 10, det: 8 }), parte(GIRONA, { fac: 4, det: 3 })], { locales: [LLORET, GIRONA] });
    assert.equal(f.cobertura.facturas, 14);
    assert.equal(f.cobertura.conDetalle, 11);
    assert.equal(f.cobertura.noAplica, 2);
  });

  test("el número de PRODUCTOS no se suma: dos locales con Coca-Cola compran un producto", () => {
    const f = fusionarCompras([parte(LLORET, { prod: "COCA COLA" }), parte(GIRONA, { prod: "COCA COLA" })], { locales: [LLORET, GIRONA] });
    assert.equal(f.totales.productos, 1);
    assert.equal(f.totales.importe, 20, "el dinero sí se suma");
  });

  test("dos productos distintos sí son dos", () => {
    const f = fusionarCompras([parte(LLORET, { prod: "COCA COLA" }), parte(GIRONA, { prod: "AGUA 1L" })], { locales: [LLORET, GIRONA] });
    assert.equal(f.totales.productos, 2);
  });

  test("las líneas sueltas de la búsqueda se ordenan por fecha, no un local detrás del otro", () => {
    const f = fusionarCompras([
      parte(LLORET, { lineas: [{ descripcion: "A", fecha: "2026-06-01" }, { descripcion: "C", fecha: "2026-04-01" }] }),
      parte(GIRONA, { lineas: [{ descripcion: "B", fecha: "2026-05-01" }] }),
    ], { locales: [LLORET, GIRONA] });
    assert.deepEqual(f.lineas.map((l) => l.descripcion), ["A", "B", "C"]);
  });

  test("queda escrito que la respuesta es de varios locales", () => {
    const f = fusionarCompras([parte(LLORET), parte(GIRONA)], { locales: [LLORET, GIRONA] });
    assert.equal(f.local, null);
    assert.deepEqual(f.locales, [LLORET, GIRONA]);
  });

  test("con uno solo se devuelve tal cual, sin tocar nada", () => {
    const p = parte(LLORET);
    assert.equal(fusionarCompras([p], { locales: [LLORET] }), p);
  });

  test("sin partes, null", () => {
    assert.equal(fusionarCompras([], {}), null);
  });
});

describe("cableado en el servidor", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("se pide una vez por local y se suma; la consulta sigue con su `local = ?`", () => {
    const i = server.indexOf('app.get("/api/facturas/compras"');
    const bloque = server.slice(i, i + 900);
    assert.match(bloque, /for \(const l of locales\) partes\.push\(await comprasDeLocal/);
    assert.match(bloque, /fusionarCompras\(partes/);
    const fn = server.indexOf("async function comprasDeLocal(");
    assert.match(server.slice(fn, fn + 900), /condFac\.push\("f\.local = \?"\)/);
  });

  test("el panel manda los locales elegidos cuando se están mirando varios", () => {
    assert.match(panel, /if \(viendoVarios\(\)\) qs\.set\("locales", localesDelAmbito\(\)\.join\(","\)\)/);
  });

  test("el dashboard no manda «*varios*» como si fuera un local", () => {
    // Era el fallo: `DASH_LOCAL` vale «*varios*» al mirar más de uno, el servidor no lo
    // reconocía y caía al principal. Se veía UN local creyendo que se veían los dos.
    const i = panel.indexOf("async function loadDashboard(");
    const fn = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.doesNotMatch(fn, /encodeURIComponent\(DASH_LOCAL\)/);
    assert.match(fn, /viendoVarios\(\) \? "locales="/);
  });
});

describe("el albarán y su factura cuentan UNA vez", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const fn = server.slice(server.indexOf("async function comprasDeLocal("), server.indexOf('app.get("/api/facturas/compras"'));
  // La regla vive fuera de la función desde que la usan dos consultas («Qué compramos» y el
  // catálogo de un proveedor de inventario). Con una copia en cada sitio, dentro de un año
  // serían dos reglas de conciliación distintas sin que nadie decidiera separarlas.
  const desde = server.indexOf("const ALBARAN_YA_CONTADO");
  const regla = server.slice(desde, server.indexOf("`;", desde));

  test("se descuenta la línea del albarán solo si su factura YA trae detalle", () => {
    // El proveedor deja un albarán por entrega y a fin de mes la factura que las agrupa. Si
    // las dos traen detalle, el mismo kilo de gambas está dos veces y «Todo lo comprado»
    // decía el doble.
    assert.ok(desde > 0, "sigue existiendo la regla");
    assert.match(regla, /COALESCE\(f\.tipo,'factura'\) = 'albaran' AND f\.conciliado_con IS NOT NULL/);
    assert.match(regla, /ff\.lineas_estado IN \('ok','dudas','descuadre'\)/);
    assert.match(fn, /condLin\.push\(`NOT \$\{ALBARAN_YA_CONTADO\}`\)/);
  });

  test("está declarada UNA sola vez, para que no se bifurque", () => {
    assert.equal((server.match(/const ALBARAN_YA_CONTADO/g) || []).length, 1);
  });

  test("si la factura NO trae detalle, el albarán sigue contando", () => {
    // Hay facturas resumen («según albaranes adjuntos») donde el albarán es la única fuente
    // de lo que entró por la puerta. Quitarlo perdería el producto entero.
    // La condición exige que la factura tenga detalle para descontar: sin ese IN, se
    // descontaría siempre y se perderían los productos de las facturas resumen.
    assert.match(regla, /lineas_estado IN \('ok','dudas','descuadre'\)/);
    assert.match(regla, /EXISTS \(/, "hace falta comprobar la factura, no solo que esté conciliado");
  });

  test("y se cuenta cuántos se han dejado fuera, para poder decirlo", () => {
    assert.match(fn, /count\(DISTINCT f\.id\)::int AS n/);
    const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");
    assert.match(panel, /albaranesYaFacturados/);
    assert.match(panel, /se compró una vez y se cuenta una vez/);
  });

  test("con varios locales, el contador se suma", () => {
    const a = { grupos: [], categorias: { categorias: [] }, cobertura: {}, totales: {}, albaranesYaFacturados: 2, local: "A" };
    const b = { grupos: [], categorias: { categorias: [] }, cobertura: {}, totales: {}, albaranesYaFacturados: 3, local: "B" };
    assert.equal(fusionarCompras([a, b], { locales: ["A", "B"] }).albaranesYaFacturados, 5);
  });
});

describe("el precio normal sobrevive a la fusión de locales", () => {
  const linea = (d, p, f, prov) => ({ descripcion: d, cantidad: 1, precio_unitario: p, importe: p, fecha: f, proveedor: prov || "Grau" });

  test("fusionar dos locales da la MISMA mediana que contarlos juntos", () => {
    // De dos medianas no sale una mediana. Por eso cada local manda sus últimas compras y no
    // solo su resultado: es lo que mantiene exacta la fusión.
    const A = [linea("ACEITE", 30, "2026-06-01"), linea("ACEITE", 31, "2026-06-10"), linea("ACEITE", 29, "2026-06-20")];
    const B = [linea("ACEITE", 45, "2026-07-01"), linea("ACEITE", 30, "2026-05-01")];
    const juntas = agrupaComoLaBase([...A, ...B])[0];
    const fus = fusionarGrupos([agrupaComoLaBase(A), agrupaComoLaBase(B)])[0];
    assert.equal(fus.precioNormal, juntas.precioNormal);
    assert.equal(fus.precioNormal, 30);
    assert.equal(fus.ultimoPrecio, juntas.ultimoPrecio);
  });

  test("con menos de tres compras no se afirma cuál es el precio normal", () => {
    const g = agrupaComoLaBase([linea("SAL", 1, "2026-06-01"), linea("SAL", 2, "2026-06-02")])[0];
    assert.equal(g.precioNormal, null);
  });

  test("y con dos proveedores tampoco: sería otro precio, no una subida", () => {
    // Que el aceite esté más caro en Makro que en el mayorista no es una subida.
    const g = agrupaComoLaBase([
      linea("SAL", 1, "2026-06-01"), linea("SAL", 2, "2026-06-02", "Makro"), linea("SAL", 1, "2026-06-03"),
    ])[0];
    assert.equal(g.precioNormal, null);
  });

  test("la lista de precios va recortada: no puede hinchar la respuesta", () => {
    const muchas = Array.from({ length: 90 }, (_, i) => linea("AGUA", 1 + i / 100, `2026-0${1 + (i % 9)}-01`));
    assert.ok(agrupaComoLaBase(muchas)[0].precios.length <= 40);
  });
});

describe("cuando no cabe todo, se dice", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("Productos ya no mete seis meses de filtro por su cuenta", () => {
    // Abría con un filtro que nadie había pedido, y con unas cifras que parecían el total de
    // todo y eran las de medio año.
    assert.doesNotMatch(panel, /COMP\.from = d\.toISOString/);
    assert.match(panel, /Sin filtro de fechas por defecto/);
  });

  test("ya no hay tope de LÍNEAS: la base agrupa, así que da igual cuántas compras haya", () => {
    // Un producto comprado quinientas veces es UNA fila. Traerse las quinientas para juntarlas
    // en el servidor obligaba a un tope, y con tope el total dejaba de ser el total sin que se
    // notara.
    assert.doesNotMatch(server, /TOPE_LINEAS_COMPRAS/);
    assert.match(server, /GROUP BY 1/);
    assert.match(server, /LIMIT \$\{TOPE_PRODUCTOS\}/);
  });

  test("y las líneas sueltas solo se traen al BUSCAR", () => {
    // Sin búsqueda no hacen falta: la pantalla enseña productos. Es lo que quitó el tope.
    assert.match(server, /const sueltas = q \? await dbAll/);
    assert.match(server, /LIMIT 400/);
  });

  test("si hay más PRODUCTOS de los que caben, se dice", () => {
    assert.match(server, /topeProductos: filas\.length >= TOPE_PRODUCTOS \? TOPE_PRODUCTOS : 0/);
    assert.match(panel, /Hay más productos distintos de los que caben/);
    assert.match(panel, /el total no es el de todos/);
  });

  test("con varios establecimientos basta con que muerda en uno", () => {
    // Si falta parte de un local, la SUMA ya es parcial: callarlo en el total sería peor.
    const a = { grupos: [], categorias: { categorias: [] }, cobertura: {}, totales: {}, topeProductos: 0, local: "A" };
    const b = { grupos: [], categorias: { categorias: [] }, cobertura: {}, totales: {}, topeProductos: 300, local: "B" };
    assert.equal(fusionarCompras([a, b], { locales: ["A", "B"] }).topeProductos, 300);
  });
});
