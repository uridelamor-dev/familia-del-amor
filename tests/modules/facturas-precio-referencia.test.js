import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mediana, precioReferencia, avisoPrecio, revisarPrecios, MINIMO_COMPRAS, MARGEN_PCT }
  from "../../src/modules/facturas/precio-referencia.js";

describe("cuál es el precio normal", () => {
  test("es la MEDIANA, no la media: una oferta suelta no puede mover la referencia", () => {
    // Cinco compras a ~0,60 € y una a 0,20 € de oferta. La media diría 0,53 € y a partir de
    // ahí un precio normal parecería una subida. La mediana sigue diciendo 0,60 €.
    const compras = [0.6, 0.6, 0.2, 0.6, 0.62, 0.58];
    assert.equal(precioReferencia(compras), 0.6);
    const media = compras.reduce((s, x) => s + x, 0) / compras.length;
    assert.ok(Math.abs(media - 0.53) < 0.01, "la media sí se iría, por eso no se usa");
  });

  test("con pocas compras NO hay referencia, y por tanto no hay aviso", () => {
    // Con dos precios no hay «normal» que valga: un aviso basado en dos datos es una
    // casualidad con formato de alerta.
    assert.equal(precioReferencia([1, 1]), null);
    assert.equal(precioReferencia([]), null);
    assert.equal(precioReferencia([1, 1, 1]).toFixed(2), "1.00");
    assert.equal(MINIMO_COMPRAS, 3);
  });

  test("solo mira las últimas compras: lo de hace dos años ya no es «lo normal»", () => {
    // La lista viene de más reciente a más antigua; con ventana 4 se queda con las cuatro
    // primeras (ya a 2 €) y no con el precio viejo de 1 €.
    const compras = [2, 2, 2, 2, 1, 1, 1, 1, 1];
    assert.equal(precioReferencia(compras, { ventana: 4 }), 2);
  });

  test("los ceros y la basura no cuentan como precio", () => {
    assert.equal(precioReferencia([0.5, 0, null, 0.5, "no", 0.5]), 0.5);
    assert.equal(mediana([]), null);
    assert.equal(mediana([3, 1, 2]), 2);
    assert.equal(mediana([4, 1, 2, 3]), 2.5);
  });
});

describe("cuándo se avisa", () => {
  const base = { descripcion: "ACEITE OLIVA 5L", proveedor: "Grau", referencia: 30, compras: 8 };

  test("una subida gorda se canta, y se dice cuánto y sobre qué", () => {
    const a = avisoPrecio({ ...base, precio: 36 });
    assert.ok(a);
    assert.equal(a.pct, 20);
    assert.match(a.texto, /36\.00 € cuando lo normal son 30\.00 €/);
    assert.match(a.texto, /sobre 8 compras anteriores/);
    assert.match(a.texto, /antes de pagarla/);
  });

  test("un movimiento pequeño NO es noticia", () => {
    // Los precios se mueven solos. Avisar del 3 % es enseñar a ignorar los avisos.
    assert.equal(avisoPrecio({ ...base, precio: 31 }), null);
    assert.equal(avisoPrecio({ ...base, precio: 33 }), null);
    assert.equal(MARGEN_PCT, 10);
  });

  test("una BAJADA no se avisa: no lleva a hacer nada", () => {
    // Nadie va a llamar al proveedor porque le haya cobrado menos.
    assert.equal(avisoPrecio({ ...base, precio: 20 }), null);
  });

  test("a partir de un cuarto más, es grave", () => {
    assert.equal(avisoPrecio({ ...base, precio: 36 }).grave, false);
    assert.equal(avisoPrecio({ ...base, precio: 38 }).grave, true);
  });

  test("sin referencia o sin precio no se inventa nada", () => {
    assert.equal(avisoPrecio({ ...base, referencia: null, precio: 99 }), null);
    assert.equal(avisoPrecio({ ...base, precio: null }), null);
    assert.equal(avisoPrecio({ ...base, referencia: 0, precio: 99 }), null);
  });
});

describe("revisar una factura entera", () => {
  const refs = new Map([
    ["aceite oliva 5l", { precio: 30, compras: 8 }],
    ["gamba", { precio: 20, compras: 5 }],
    ["sal", { precio: 1, compras: 9 }],
    ["pan", { precio: 2, compras: 4 }],
  ]);
  const lineas = [
    { clave: "aceite oliva 5l", descripcion: "ACEITE OLIVA 5L", precio_unitario: 45 },   // +50 %
    { clave: "gamba", descripcion: "GAMBA", precio_unitario: 23 },                        // +15 %
    { clave: "sal", descripcion: "SAL", precio_unitario: 1.02 },                          // +2 %: nada
    { clave: "pan", descripcion: "PAN", precio_unitario: 2.6 },                           // +30 %
    { clave: "desconocido", descripcion: "NUEVO", precio_unitario: 100 },                 // sin referencia
  ];

  test("avisa de las que se salen y calla las que no", () => {
    const r = revisarPrecios(lineas, refs, { proveedor: "Grau", tope: 10 });
    assert.equal(r.total, 3);
    assert.ok(!r.avisos.some((a) => /SAL/.test(a.texto)), "el 2 % no es noticia");
    assert.ok(!r.avisos.some((a) => /NUEVO/.test(a.texto)), "sin historial no hay contra qué comparar");
  });

  test("lo más gordo primero", () => {
    const r = revisarPrecios(lineas, refs, { proveedor: "Grau", tope: 10 });
    assert.deepEqual(r.avisos.map((a) => a.pct), [50, 30, 15]);
  });

  test("y se recorta, diciendo cuántos quedan fuera", () => {
    // Una factura de treinta líneas con veinte avisos no se lee: se cierra.
    const r = revisarPrecios(lineas, refs, { proveedor: "Grau", tope: 2 });
    assert.equal(r.avisos.length, 2);
    assert.equal(r.ocultos, 1);
    assert.equal(r.total, 3);
  });

  test("sin líneas ni referencias no pasa nada", () => {
    assert.deepEqual(revisarPrecios([], refs), { avisos: [], total: 0, ocultos: 0 });
    assert.deepEqual(revisarPrecios(lineas, new Map()), { avisos: [], total: 0, ocultos: 0 });
  });
});

describe("cableado", () => {
  const facturas = readFileSync(new URL("../../facturas.js", import.meta.url), "utf8");

  test("se compara contra el MISMO proveedor, no contra el mercado", () => {
    // Que el aceite esté más caro en Makro que en el mayorista no es una subida: es otro
    // proveedor. Mezclarlos daría avisos que no se pueden accionar.
    const fn = facturas.slice(facturas.indexOf("async function referenciasDeProveedor"), facturas.indexOf("async function referenciasDeProveedor") + 1400);
    assert.match(fn, /LOWER\(f\.proveedor\) = LOWER\(\?\)|f\.proveedor/);
    assert.match(fn, /precio_unitario/);
  });

  test("el aviso se guarda con los demás de la factura, no en un sitio nuevo", () => {
    // `revisar` ya es la columna de «esto no cuadra, míralo». Un aviso de precio es eso mismo.
    assert.match(facturas, /avisosPrecio/);
  });
});
