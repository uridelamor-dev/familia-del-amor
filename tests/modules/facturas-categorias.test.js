import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { claveProveedor, normalizarCategoria, indiceCategorias, categoriasDe, gastoPorCategoria, seLeenLineas, CATEGORIAS, SIN_LINEAS } from "../../src/modules/facturas/categorias.js";

describe("claveProveedor: el mismo proveedor escrito de cinco maneras", () => {
  test("la forma jurídica no distingue a nadie", () => {
    const k = claveProveedor("GRAU DISTRIBUCIONS, S.L.");
    for (const v of ["Grau Distribucions SL", "grau distribucions s.l.", "GRAU DISTRIBUCIONS SLU", "  Grau  Distribucions  "]) {
      assert.equal(claveProveedor(v), k, v);
    }
  });
  test("los acentos tampoco", () => {
    assert.equal(claveProveedor("Cárnicas Cerezo"), claveProveedor("CARNICAS CEREZO"));
  });
  test("pero dos proveedores distintos siguen siendo distintos", () => {
    assert.notEqual(claveProveedor("Grau"), claveProveedor("Grausa"));
    assert.notEqual(claveProveedor("Cerezo"), claveProveedor("Cerezos"));
  });
  test("vacío es vacío, no una cadena rara", () => {
    for (const v of ["", null, undefined, "   ", ", S.L."]) assert.equal(claveProveedor(v), "", String(v));
  });
});

describe("normalizarCategoria: lista cerrada", () => {
  test("acepta el nombre bueno con cualquier caja o acento", () => {
    assert.equal(normalizarCategoria("bebidas"), "Bebidas");
    assert.equal(normalizarCategoria("  CAFE E INFUSIONES "), "Café e infusiones");
  });
  test("lo que no está en el catálogo se rechaza: si no, se agrupa mal", () => {
    for (const v of ["Bebida", "bebidas frías", "", null, "Alcoholicas"]) {
      assert.equal(normalizarCategoria(v), null, String(v));
    }
  });
  test("el catálogo no tiene repetidos", () => {
    assert.equal(new Set(CATEGORIAS).size, CATEGORIAS.length);
  });
});

describe("índice de categorías", () => {
  const filas = [
    { proveedor: "GRAU DISTRIBUCIONS, S.L.", categoria: "Alcohol" },
    { proveedor: "Grau Distribucions SL", categoria: "Bebidas" },   // el mismo, escrito distinto
    { proveedor: "Cárnicas Cerezo", categoria: "Embutidos y quesos" },
  ];
  const idx = indiceCategorias(filas);

  test("las dos formas de escribir Grau son un solo proveedor con dos categorías", () => {
    assert.equal(idx.size, 2);
    assert.deepEqual(categoriasDe("grau distribucions", idx), ["Bebidas", "Alcohol"]);
  });
  test("y se devuelven en el orden del catálogo, no en el de entrada", () => {
    assert.deepEqual(categoriasDe("GRAU DISTRIBUCIONS SLU", idx), ["Bebidas", "Alcohol"]);
  });
  test("un proveedor sin etiquetar devuelve lista vacía, no null", () => {
    assert.deepEqual(categoriasDe("Makro", idx), []);
  });
  test("etiquetar dos veces lo mismo no lo duplica", () => {
    const i2 = indiceCategorias([{ proveedor: "X", categoria: "Bebidas" }, { proveedor: "X SL", categoria: "Bebidas" }]);
    assert.deepEqual(categoriasDe("X", i2), ["Bebidas"]);
  });
});

describe("gasto por categoría", () => {
  const idx = indiceCategorias([
    { proveedor: "Grau", categoria: "Bebidas" }, { proveedor: "Grau", categoria: "Alcohol" },
    { proveedor: "Cerezo", categoria: "Embutidos y quesos" },
  ]);
  const filas = [
    { proveedor: "Grau", importe: 1000 },
    { proveedor: "Cerezo", importe: 400 },
    { proveedor: "Makro", importe: 250 },     // sin etiquetar
  ];
  const r = gastoPorCategoria(filas, idx);

  test("un proveedor de dos categorías reparte, no cuenta doble", () => {
    const beb = r.categorias.find((c) => c.categoria === "Bebidas");
    const alc = r.categorias.find((c) => c.categoria === "Alcohol");
    assert.equal(beb.importe, 500);
    assert.equal(alc.importe, 500);
    assert.equal(beb.importe + alc.importe, 1000, "la suma tiene que cuadrar con la factura");
  });
  test("y se dice cuánto gasto ha habido que repartir, para no fiarse de más", () => {
    assert.equal(r.repartido, 1000);
  });
  test("lo no etiquetado va aparte, NO a «Varios»", () => {
    assert.equal(r.sinCategoria, 250);
    assert.deepEqual(r.sinCatProveedores, ["Makro"]);
    assert.ok(!r.categorias.some((c) => c.categoria === "Varios"));
  });
  test("todo suma el total: no se pierde ni se inventa un euro", () => {
    const suma = r.categorias.reduce((s, c) => s + c.importe, 0) + r.sinCategoria;
    assert.equal(Math.round(suma * 100) / 100, r.total);
    assert.equal(r.total, 1650);
  });
  test("ordena por gasto, que es como se mira", () => {
    assert.deepEqual(r.categorias.map((c) => c.categoria), ["Bebidas", "Alcohol", "Embutidos y quesos"]);
  });
  test("dice qué proveedores hay detrás de cada categoría", () => {
    assert.deepEqual(r.categorias.find((c) => c.categoria === "Alcohol").proveedores, ["Grau"]);
  });
  test("sin nada etiquetado no revienta: todo cae en sin categoría", () => {
    const v = gastoPorCategoria(filas, new Map());
    assert.equal(v.categorias.length, 0);
    assert.equal(v.sinCategoria, 1650);
  });
  test("importes que no son números no rompen el total", () => {
    const v = gastoPorCategoria([{ proveedor: "Grau", importe: null }, { proveedor: "Grau", importe: "abc" }], idx);
    assert.equal(v.total, 0);
  });
});

describe("de qué facturas NO se lee el detalle", () => {
  test("del alquiler, la luz o el gestor no: su línea no es un producto", () => {
    for (const c of ["Alquileres", "Suministros", "Servicios y profesionales", "Impuestos y seguros", "Mantenimiento y obras", "Marketing"]) {
      assert.equal(seLeenLineas([c]), false, c);
    }
  });
  test("de la mercancía sí, que es de lo que se quiere saber cuánto se compra", () => {
    for (const c of ["Bebidas", "Alcohol", "Carne", "Pescado y marisco", "Limpieza e higiene", "Desechables y envases", "Varios"]) {
      assert.equal(seLeenLineas([c]), true, c);
    }
  });
  test("un proveedor sin etiquetar SÍ se lee: no saber de qué es no es razón para dejar un hueco", () => {
    assert.equal(seLeenLineas([]), true);
    assert.equal(seLeenLineas(), true);
  });
  test("si vende de las dos cosas, se lee: parte de lo que vende sí interesa", () => {
    assert.equal(seLeenLineas(["Suministros", "Bebidas"]), true);
    assert.equal(seLeenLineas(["Alquileres", "Impuestos y seguros"]), false);
  });
  test("todas las de SIN_LINEAS están en el catálogo (si no, no se podrían elegir)", () => {
    for (const c of SIN_LINEAS) assert.ok(CATEGORIAS.includes(c), c);
  });
  test("«Varios» NO está entre las que no se leen: es el cajón de los generalistas, que sí venden producto", () => {
    assert.ok(!SIN_LINEAS.has("Varios"));
  });
});
