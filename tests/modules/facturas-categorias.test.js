import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { claveProveedor, normalizarCategoria, normalizarPar, indiceCategorias, categoriasDe, soloCategorias,
  gastoPorCategoria, seLeenLineas, subcategoriasDe, etiquetaPar, CATALOGO, CATEGORIAS, SIN_LINEAS } from "../../src/modules/facturas/categorias.js";

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
    assert.equal(normalizarCategoria("  EMBUTIDOS Y QUESOS "), "Embutidos y quesos");
    assert.equal(normalizarCategoria("carne y aves"), "Carne y aves");
  });
  test("lo que no está en el catálogo se rechaza: si no, se agrupa mal", () => {
    // «Cafés e infusiones» ya no es categoría: ahora cuelga de Bebidas.
    for (const v of ["Bebida", "bebidas frías", "", null, "Alcoholicas", "Café e infusiones"]) {
      assert.equal(normalizarCategoria(v), null, String(v));
    }
  });
  test("el catálogo no tiene repetidos", () => {
    assert.equal(new Set(CATEGORIAS).size, CATEGORIAS.length);
  });
});

describe("índice de categorías", () => {
  const filas = [
    { proveedor: "GRAU DISTRIBUCIONS, S.L.", categoria: "Bebidas", subcategoria: "Vinos y cavas" },
    { proveedor: "Grau Distribucions SL", categoria: "Bebidas", subcategoria: "Cervezas" },  // el mismo, escrito distinto
    { proveedor: "Cárnicas Cerezo", categoria: "Embutidos y quesos", subcategoria: "Embutido" },
  ];
  const idx = indiceCategorias(filas);

  test("las dos formas de escribir Grau son un solo proveedor", () => {
    assert.equal(idx.size, 2);
    assert.equal(categoriasDe("grau distribucions", idx).length, 2);
  });
  test("se guarda categoría Y subcategoría", () => {
    assert.deepEqual(categoriasDe("GRAU DISTRIBUCIONS SLU", idx).map(etiquetaPar),
      ["Bebidas · Cervezas", "Bebidas · Vinos y cavas"]);
  });
  test("y las dos son de la MISMA categoría, no de dos", () => {
    assert.deepEqual(soloCategorias(categoriasDe("Grau Distribucions", idx)), ["Bebidas"]);
  });
  test("un proveedor sin etiquetar devuelve lista vacía, no null", () => {
    assert.deepEqual(categoriasDe("Makro", idx), []);
  });
  test("etiquetar dos veces lo mismo no lo duplica", () => {
    const i2 = indiceCategorias([{ proveedor: "X", categoria: "Bebidas", subcategoria: "Refrescos" },
                                 { proveedor: "X SL", categoria: "Bebidas", subcategoria: "Refrescos" }]);
    assert.equal(categoriasDe("X", i2).length, 1);
  });
});

describe("categoría y subcategoría: el par tiene que ser coherente", () => {
  test("un par bueno se acepta tal cual", () => {
    assert.deepEqual(normalizarPar("bebidas", "vinos y cavas"), { categoria: "Bebidas", subcategoria: "Vinos y cavas" });
  });
  test("una subcategoría de OTRA categoría se descarta, no se cuela", () => {
    // «Quesos» cuelga de Embutidos. Guardarla bajo Bebidas rompería que la categoría sume
    // exactamente sus subcategorías.
    assert.deepEqual(normalizarPar("Bebidas", "Quesos"), { categoria: "Bebidas", subcategoria: "" });
  });
  test("una categoría sin subcategorías se queda sin ella", () => {
    assert.deepEqual(normalizarPar("Alquileres", "lo que sea"), { categoria: "Alquileres", subcategoria: "" });
  });
  test("una categoría inventada se rechaza entera", () => {
    assert.equal(normalizarPar("Bebida fría", "Refrescos"), null);
    assert.equal(normalizarPar("", ""), null);
  });
  test("«Alcohol», que era categoría suelta, pasa a Bebidas · Licores", () => {
    assert.deepEqual(normalizarPar("Alcohol", ""), { categoria: "Bebidas", subcategoria: "Licores y destilados" });
  });
  test("Bebidas se subdivide, y el vino tiene su sitio propio", () => {
    const subs = subcategoriasDe("Bebidas");
    for (const x of ["Refrescos", "Cervezas", "Vinos y cavas", "Licores y destilados", "Cafés e infusiones"]) {
      assert.ok(subs.includes(x), x);
    }
  });
  test("ninguna subcategoría se repite en dos categorías (sería ambigua al filtrar)", () => {
    const vistas = new Map();
    for (const c of CATALOGO) for (const sN of c.subs) {
      assert.ok(!vistas.has(sN), `«${sN}» está en ${vistas.get(sN)} y en ${c.nombre}`);
      vistas.set(sN, c.nombre);
    }
  });
});

describe("gasto por categoría y subcategoría", () => {
  const idx = indiceCategorias([
    { proveedor: "Grau", categoria: "Bebidas", subcategoria: "Vinos y cavas" },
    { proveedor: "Cerezo", categoria: "Embutidos y quesos", subcategoria: "Embutido" },
    { proveedor: "Damm", categoria: "Bebidas", subcategoria: "Cervezas" },
  ]);
  const filas = [
    { proveedor: "Grau", importe: 1000 },
    { proveedor: "Damm", importe: 600 },
    { proveedor: "Cerezo", importe: 400 },
    { proveedor: "Makro", importe: 250 },     // sin etiquetar
  ];
  const r = gastoPorCategoria(filas, idx);

  test("con UN par por proveedor el gasto va entero: nada aproximado", () => {
    assert.equal(r.repartido, 0);
    assert.equal(r.categorias.find((c) => c.categoria === "Bebidas").importe, 1600);
  });
  test("la categoría es la suma EXACTA de sus subcategorías", () => {
    const beb = r.categorias.find((c) => c.categoria === "Bebidas");
    assert.equal(beb.subs.reduce((s2, x) => s2 + x.importe, 0), beb.importe);
    assert.deepEqual(beb.subs, [{ subcategoria: "Vinos y cavas", importe: 1000 }, { subcategoria: "Cervezas", importe: 600 }]);
  });
  test("lo no etiquetado va aparte, NO a «Varios»", () => {
    assert.equal(r.sinCategoria, 250);
    assert.deepEqual(r.sinCatProveedores, ["Makro"]);
    assert.ok(!r.categorias.some((c) => c.categoria === "Varios"));
  });
  test("todo suma el total: no se pierde ni se inventa un euro", () => {
    const suma = r.categorias.reduce((s2, c) => s2 + c.importe, 0) + r.sinCategoria;
    assert.equal(Math.round(suma * 100) / 100, r.total);
    assert.equal(r.total, 2250);
  });
  test("un proveedor con dos pares sí reparte, y se avisa", () => {
    const i2 = indiceCategorias([
      { proveedor: "Makro", categoria: "Bebidas", subcategoria: "Refrescos" },
      { proveedor: "Makro", categoria: "Limpieza e higiene", subcategoria: "" },
    ]);
    const v = gastoPorCategoria([{ proveedor: "Makro", importe: 1000 }], i2);
    assert.equal(v.repartido, 1000);
    assert.equal(v.categorias.find((c) => c.categoria === "Bebidas").importe, 500);
    assert.equal(v.categorias.reduce((s2, c) => s2 + c.importe, 0), 1000, "la suma sigue cuadrando");
  });
  test("ordena por gasto, que es como se mira", () => {
    assert.deepEqual(r.categorias.map((c) => c.categoria), ["Bebidas", "Embutidos y quesos"]);
  });
  test("sin nada etiquetado no revienta: todo cae en sin categoría", () => {
    const v = gastoPorCategoria(filas, new Map());
    assert.equal(v.categorias.length, 0);
    assert.equal(v.sinCategoria, 2250);
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
    for (const c of ["Bebidas", "Carne y aves", "Pescado y marisco", "Limpieza e higiene", "Desechables y envases", "Varios"]) {
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
