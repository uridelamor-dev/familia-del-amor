import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esqueleto, medidas, parecido, proponer, colaDeTrabajo, nombreLimpio, cobertura, MINIMO_PROPUESTA }
  from "../../src/modules/facturas/diccionario.js";
import { agrupaComoLaBase } from "../helpers/agrupa-como-la-base.js";

describe("quitar el envase para ver el producto", () => {
  test("el esqueleto deja el nombre comercial y tira el embalaje", () => {
    assert.equal(esqueleto("COCA COLA ZERO 33CL LATA CAJA 24U"), "coca cola zero");
    assert.equal(esqueleto("ACEITE OLIVA VIRGEN EXTRA 5 L GARRAFA"), "aceite oliva virgen extra garrafa");
    assert.equal(esqueleto("Gamba langostinera 1,5 kg bandeja"), "gamba langostinera");
  });

  test("las medidas se guardan aparte, porque distinguen productos", () => {
    assert.deepEqual(medidas("COCA COLA 33CL"), ["33cl"]);
    assert.deepEqual(medidas("ACEITE 1,5 L"), ["1.5l"]);
    assert.deepEqual(medidas("JAMON 5 KGS"), ["5kg"]);
    assert.deepEqual(medidas("SIN MEDIDA"), []);
  });
});

describe("cuánto se parecen dos descripciones", () => {
  test("el mismo producto escrito de dos maneras se reconoce", () => {
    assert.equal(parecido("COCA COLA 33CL", "Coca-Cola 33 cl"), 100);
    assert.equal(parecido("VIRUTA IBERICA", "Virutas ibericas"), 100, "un plural no es otro producto");
  });

  test("MISMO nombre y DISTINTO formato no llega a unión automática", () => {
    // «Aceite 5 L» y «Aceite 1 L» son dos productos: confundirlos estropea el precio por
    // unidad de los dos a la vez, y encima no se nota.
    const p = parecido("ACEITE OLIVA 5L", "ACEITE OLIVA 1L");
    assert.ok(p >= MINIMO_PROPUESTA && p < 100, `salió ${p}: se propone, pero no se afirma`);
  });

  test("productos distintos no se parecen", () => {
    assert.ok(parecido("COCA COLA 33CL", "GAMBA LANGOSTINERA") < MINIMO_PROPUESTA);
    assert.equal(parecido("", "ALGO"), 0);
  });

  test("compartir una palabra genérica no basta", () => {
    // «Queso manchego» y «Queso de cabra» comparten «queso» y no son lo mismo.
    assert.ok(parecido("QUESO MANCHEGO CURADO", "QUESO DE CABRA ROULE") < MINIMO_PROPUESTA);
  });
});

describe("la propuesta", () => {
  const productos = [
    { id: 1, nombre: "Coca-Cola Zero 33cl" },
    { id: 2, nombre: "Aceite de oliva virgen extra 5l" },
    { id: 3, nombre: "Gamba langostinera" },
  ];

  test("propone el más parecido de los que ya existen", () => {
    const p = proponer("COCA COLA ZERO 33CL LATA CAJA 24U", productos);
    assert.equal(p.producto.id, 1);
    assert.ok(p.score >= MINIMO_PROPUESTA);
  });

  test("si no hay nada decente, dice que no sabe en vez de proponer cualquier cosa", () => {
    // Una propuesta mala se acepta a ciegas cuando se llevan veinte seguidas.
    assert.equal(proponer("PAPEL HIGIENICO INDUSTRIAL", productos), null);
    assert.equal(proponer("LO QUE SEA", []), null);
  });
});

describe("la cola de trabajo empieza por el dinero", () => {
  const pendientes = [
    { clave: "sal fina", descripcion: "SAL FINA 1KG", gasto: 12, veces: 3 },
    { clave: "aceite oliva 5l", descripcion: "ACEITE OLIVA V.E. 5L", gasto: 4200, veces: 40 },
    { clave: "coca cola 33cl", descripcion: "COCA COLA 33CL", gasto: 900, veces: 20 },
  ];
  const productos = [{ id: 2, nombre: "Aceite de oliva virgen extra 5l" }];

  test("lo que más mueve, primero: las veinte primeras cubren casi todo el histórico", () => {
    // Por orden alfabético o por fecha, nadie termina nunca.
    const c = colaDeTrabajo(pendientes, productos);
    assert.deepEqual(c.map((x) => x.clave), ["aceite oliva 5l", "coca cola 33cl", "sal fina"]);
  });

  test("cada una lleva su propuesta, o nada", () => {
    const c = colaDeTrabajo(pendientes, productos);
    assert.equal(c[0].sugerido.id, 2);
    assert.equal(c[1].sugerido, null, "no hay ningún producto parecido a la Coca-Cola todavía");
  });

  test("y un nombre limpio para crearlo si no existe", () => {
    assert.equal(nombreLimpio("COCA COLA ZERO 33CL LATA CAJA 24U"), "Coca Cola Zero 33cl");
    assert.equal(nombreLimpio("ACEITE OLIVA 5 L"), "Aceite Oliva 5l");
    assert.equal(nombreLimpio(""), "");
  });

  test("la cola se recorta: una lista de 400 no se empieza", () => {
    const muchas = Array.from({ length: 80 }, (_, i) => ({ clave: `p${i}`, descripcion: `PRODUCTO ${i}`, gasto: i }));
    assert.equal(colaDeTrabajo(muchas, [], { tope: 50 }).length, 50);
  });
});

describe("cuánto queda por hacer, medido en dinero", () => {
  test("el número que dice si merece la pena seguir NO es cuántas faltan", () => {
    // Siempre faltarán descripciones nuevas. Lo que importa es cuánto gasto cubre lo confirmado.
    const c = cobertura(
      [{ gasto: 4200 }, { gasto: 900 }],
      [{ gasto: 100 }, { gasto: 12 }],
    );
    assert.equal(c.resueltas, 2);
    assert.equal(c.pendientes, 2);
    assert.equal(c.gastoResuelto, 5100);
    assert.equal(c.pct, 97.9);
  });

  test("sin nada, no se inventa un 100 %", () => {
    assert.equal(cobertura([], []).pct, 0);
  });
});

describe("agrupar CON el diccionario", () => {
  test("dos formas de escribirlo pasan a ser un producto, con su nombre bueno", async () => {
    const linea = (d, i, prov) => ({ descripcion: d, cantidad: 1, precio_unitario: i, importe: i,
      fecha: "2026-07-01", proveedor: prov || "Grau" });
    const lineas = [
      linea("COCA COLA 33CL", 14.4),
      linea("Coca-Cola 33 cl", 16.8, "Bo de Debò"),
      linea("ACEITE OLIVA 5L", 60),
    ];
    const alias = new Map([
      ["coca cola 33cl", { id: 7, nombre: "Coca-Cola 33cl" }],
      ["coca cola 33 cl", { id: 7, nombre: "Coca-Cola 33cl" }],
    ]);

    const sin = agrupaComoLaBase(lineas);
    assert.equal(sin.length, 3, "sin diccionario son tres productos, que es lo honesto");

    const con = agrupaComoLaBase(lineas, { alias });
    assert.equal(con.length, 2);
    const coca = con.find((g) => g.clave === "p:7");
    assert.equal(coca.descripcion, "Coca-Cola 33cl", "manda el nombre del diccionario");
    assert.equal(coca.importe, 31.2, "y el gasto se suma");
    assert.equal(coca.veces, 2);
    assert.equal(coca.unificado, true);
    assert.deepEqual([...coca.proveedores].sort(), ["Bo de Debò", "Grau"]);
  });

  test("lo que no está en el diccionario se queda como estaba", async () => {
    const g = agrupaComoLaBase(
      [{ descripcion: "PAPEL COCINA", importe: 10, fecha: "2026-07-01", proveedor: "X" }],
      { alias: new Map() });
    assert.equal(g[0].clave, "papel cocina");
    assert.equal(g[0].unificado, false);
  });
});

describe("cableado del diccionario", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("la cola sale ordenada por GASTO y sin las ya revisadas", () => {
    const fn = server.slice(server.indexOf('app.get("/api/facturas/diccionario"'), server.indexOf('app.post("/api/facturas/diccionario"'));
    assert.match(fn, /ORDER BY gasto DESC/);
    assert.match(fn, /LEFT JOIN producto_alias a ON a\.clave = l\.clave[\s\S]{0,120}a\.clave IS NULL/);
  });

  test("«dejar aparte» se guarda, para que no vuelva a preguntar", () => {
    // Sin esto, un producto que se decidió no unificar reaparece cada vez y la cola no baja.
    const fn = server.slice(server.indexOf('app.post("/api/facturas/diccionario"'), server.indexOf('app.delete("/api/facturas/diccionario'));
    assert.match(fn, /req\.body\?\.aparte/);
    assert.match(fn, /productoId = null/);
  });

  test("crear un producto con un nombre que ya existe REUTILIZA el que hay", () => {
    // Si no, «Coca-Cola 33cl» acabaría existiendo tres veces y el problema volvería por otro lado.
    const fn = server.slice(server.indexOf('app.post("/api/facturas/diccionario"'), server.indexOf('app.delete("/api/facturas/diccionario'));
    assert.match(fn, /LOWER\(nombre\) = LOWER\(\?\)/);
    assert.match(server, /CREATE UNIQUE INDEX IF NOT EXISTS productos_canonicos_nombre/);
  });

  test("se puede deshacer, y la descripción vuelve a la cola", () => {
    assert.match(server, /app\.delete\("\/api\/facturas\/diccionario\/:clave"/);
  });

  test("y Productos AGRUPA con él, que es lo único que lo hace servir para algo", () => {
    // Ahora la agrupación la hace la base, y el diccionario entra en ella: dos escrituras
    // confirmadas como el mismo producto se suman juntas y con el nombre bueno, sin traerse
    // una fila por compra.
    assert.match(server, /COALESCE\('p:' \|\| a\.producto_id::text, l\.clave\) AS clave/);
    assert.match(server, /LEFT JOIN producto_alias a ON a\.clave = l\.clave/);
    assert.match(server, /LEFT JOIN productos_canonicos p ON p\.id = a\.producto_id/);
  });
});

describe("corregir el diccionario", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("se puede cambiar el nombre, y no chocar con otro que ya exista", () => {
    // Una errata al crear un producto se quedaba para siempre, y las erratas se cometen justo
    // en los primeros veinte, que es cuando aún no se ha cogido el gusto a nombrarlos.
    const fn = server.slice(server.indexOf('app.put("/api/facturas/productos/:id"'), server.indexOf('app.post("/api/facturas/productos/:id/fusionar"'));
    assert.match(fn, /LOWER\(nombre\) = LOWER\(\?\) AND id <> \?/);
    assert.match(fn, /409/, "si ya existe se dice, y se ofrece fusionar");
  });

  test("al fusionar se repuntan los alias ANTES de borrar", () => {
    // Al revés, el borrado en cascada se llevaría las formas de escribirlo y volverían todas
    // a la cola: el trabajo de semanas, deshecho por el orden de dos líneas.
    const fn = server.slice(server.indexOf('app.post("/api/facturas/productos/:id/fusionar"'), server.indexOf('app.delete("/api/facturas/productos/:id"'));
    const iUpdate = fn.indexOf("UPDATE producto_alias SET producto_id");
    const iDelete = fn.indexOf("DELETE FROM productos_canonicos");
    assert.ok(iUpdate > -1 && iDelete > iUpdate, "el UPDATE tiene que ir antes que el DELETE");
    assert.match(fn, /destino === origen/, "fusionar algo consigo mismo no hace nada");
  });

  test("borrar dice cuánto trabajo se deshace, antes de deshacerlo", () => {
    const fn = server.slice(server.indexOf('app.delete("/api/facturas/productos/:id"'), server.indexOf('// Deshacer: la descripción vuelve a la cola'));
    assert.match(fn, /count\(\*\)::int AS n FROM producto_alias WHERE producto_id/);
    assert.match(fn, /vuelven a la cola/);
    assert.match(panel, /Sus \$\{n\} forma\(s\) de escribirlo vuelven a la cola/);
  });

  test("y en la fusión se dice CUÁL se queda, que es lo que se pregunta todo el mundo", () => {
    assert.match(panel, /El que elijas es el que se queda/);
  });
});

describe("deshacer UNA forma sin cargarse el producto", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("cada producto trae sus formas de escribirlo", () => {
    // Sin esto no había forma de ver qué se había unido a qué, y deshacer una unión aceptada
    // por error costaba borrar el producto entero: las demás formas volvían también a la cola.
    assert.match(server, /json_agg\(json_build_object\('clave', a\.clave, 'descripcion', a\.descripcion\)/);
    assert.match(panel, /data-dicp="quitar-forma"/);
  });

  test("y quitarla la devuelve a la cola, no la borra", () => {
    assert.match(panel, /apiSend\("DELETE", "\/api\/facturas\/diccionario\/" \+ encodeURIComponent\(clave\)\)/);
    assert.match(panel, /Esta forma vuelve a la cola, sin tocar las demás/);
  });

  test("los botones dentro del desplegable no lo despliegan al pulsarlos", () => {
    // Están en un <summary>: sin frenar el evento, cada clic en «Cambiar nombre» abría o
    // cerraba la ficha entera.
    const fn = panel.slice(panel.indexOf('const b = e.target.closest("[data-dicp]")'), panel.indexOf('const b = e.target.closest("[data-dicp]")') + 300);
    assert.match(fn, /e\.preventDefault\(\)/);
  });
});
