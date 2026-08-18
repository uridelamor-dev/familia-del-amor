// El catálogo de un proveedor de inventario: qué se le puede añadir, qué ya está y qué no se duplica.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { claveProducto } from "../../src/modules/facturas/lineas.js";
import {
  claveInvProducto, claveCotejo, claveDeExistente, variantesDeProveedor, sugerenciasDeProveedor,
  marcarYaConfigurados, fusionarFuentes, normalizarLote, TOPE_LOTE,
} from "../../src/modules/inventario/catalogo.js";

describe("la clave con la que se decide si dos productos son el mismo", () => {
  test("es exactamente la misma que usa Compras", () => {
    // Importada, no reescrita: si aquí se copiara una parecida, dentro de un año se habrían
    // separado y el enlace entre inventario y facturas dejaría de casar sin que nadie tocara nada.
    for (const t of ["Coca-Cola 33cl", "  JAMÓN Ibérico  ", "Agua 1,5L", "", "Ñoquis nº 3"]) {
      assert.equal(claveInvProducto(t), claveProducto(t), t);
    }
  });
  test("la de COTEJO sí junta «Coca-Cola 33cl» y «COCA COLA 33 CL»", () => {
    // `claveProducto` las deja distintas («coca cola 33cl» vs «coca cola 33 cl»). En Compras eso
    // está bien —las une el diccionario a mano—, pero aquí significaría ofrecer como novedad algo
    // que ya está montado, y crear el duplicado.
    assert.notEqual(claveInvProducto("Coca-Cola 33cl"), claveInvProducto("COCA COLA 33 CL"));
    assert.equal(claveCotejo("Coca-Cola 33cl"), claveCotejo("COCA COLA 33 CL"));
  });
  test("pero «Coca-Cola 33cl» y «Coca-Cola 1l» siguen siendo dos productos", () => {
    // Juntar los espacios no puede llevarse por delante el tamaño: son dos referencias distintas
    // y se piden por separado.
    assert.notEqual(claveCotejo("Coca-Cola 33cl"), claveCotejo("Coca-Cola 1l"));
  });
  test("un producto guardado se coteja por su clave si la tiene, y si no por el nombre", () => {
    // La clave guardada es lo que hace que el enlace sobreviva a un renombrado.
    assert.equal(claveDeExistente({ nombre: "Lo que sea", clave_producto: "coca cola 33cl" }), claveCotejo("Coca-Cola 33cl"));
    assert.equal(claveDeExistente({ nombre: "Coca-Cola 33cl" }), claveCotejo("Coca-Cola 33cl"));
  });
});

describe("cómo se llama este proveedor en las facturas", () => {
  const CONOCIDOS = ["VINS I LICORS GRAU SA", "Vins i Licors Grau, S.A.", "Distribuciones Gómez SL", "GRAU", "Graupera SL"];
  test("las escrituras del MISMO nombre se juntan, con y sin forma jurídica", () => {
    const v = variantesDeProveedor("Vins i Licors Grau", CONOCIDOS);
    assert.ok(v.includes("VINS I LICORS GRAU SA"));
    assert.ok(v.includes("Vins i Licors Grau, S.A."));
    assert.ok(!v.includes("Graupera SL"));
  });
  test("un apodo corto NO se da por bueno: se propone y lo confirma una persona", () => {
    // «Grau» dentro de «VINS I LICORS GRAU SA» no casa por clave ni por parecido (saca un 25 %).
    // Adivinarlo sería peor: «Grau» también está dentro de «Graupera SL», y una lista de
    // productos del proveedor equivocado no se nota hasta que se pide algo que ese no vende.
    assert.ok(!variantesDeProveedor("Grau", CONOCIDOS).includes("VINS I LICORS GRAU SA"));
    const sug = sugerenciasDeProveedor("Grau", CONOCIDOS);
    assert.ok(sug.includes("VINS I LICORS GRAU SA"), "pero sí se ofrece para confirmarlo");
    assert.ok(!sug.includes("Graupera SL"), "por palabra entera: «grau» no está en «graupera»");
  });
  test("no arrastra a un proveedor distinto que se parece", () => {
    const v = variantesDeProveedor("Distribuciones Martínez", CONOCIDOS);
    assert.ok(!v.includes("Distribuciones Gómez SL"), "Gómez y Martínez no son el mismo");
    assert.ok(!sugerenciasDeProveedor("Distribuciones Martínez", CONOCIDOS).includes("Distribuciones Gómez SL"));
  });
  test("un proveedor nuevo sin facturas devuelve su propio nombre, no una lista vacía", () => {
    // Con la lista vacía, `= ANY(?)` no tendría nada que comparar.
    assert.deepEqual(variantesDeProveedor("Bodega Nueva", []), ["Bodega Nueva"]);
  });
  test("sin nombre no hay nada que buscar", () => {
    assert.deepEqual(variantesDeProveedor("", CONOCIDOS), []);
  });
});

describe("marcar los que ya están montados", () => {
  const EXISTENTES = [
    { id: 1, nombre: "Coca-Cola 33cl", activo: true },
    { id: 2, nombre: "Fanta Naranja", activo: false },
  ];
  test("caza el que ya está aunque esté escrito distinto", () => {
    const r = marcarYaConfigurados([{ nombre: "COCA COLA 33 CL" }], EXISTENTES);
    assert.equal(r[0].ya_esta, true);
    assert.equal(r[0].ya_id, 1);
    assert.equal(r[0].ya_inactivo, false);
  });
  test("distingue el que está pero desactivado", () => {
    // Si no, se crea un duplicado y luego nadie entiende de dónde salió.
    const r = marcarYaConfigurados([{ nombre: "fanta naranja" }], EXISTENTES);
    assert.equal(r[0].ya_esta, true);
    assert.equal(r[0].ya_inactivo, true);
  });
  test("no se filtran: se marcan", () => {
    // Quien ve 40 en el albarán y 12 en la lista piensa que falta información.
    const r = marcarYaConfigurados([{ nombre: "COCA COLA 33 CL" }, { nombre: "Nestea" }], EXISTENTES);
    assert.equal(r.length, 2);
    assert.equal(r[1].ya_esta, false);
  });
});

describe("juntar las dos fuentes sin que nada salga dos veces", () => {
  test("el que está en las dos sale UNA vez, por la de otro local", () => {
    // Gana el de otro local: trae unidad y stock decididos por una persona.
    const { otrosLocales, facturas } = fusionarFuentes(
      [{ nombre: "COCA COLA 33 CL", veces: 12, ultima: "2026-08-03" }, { nombre: "Nestea", veces: 3 }],
      [{ id: 9, nombre: "Coca-Cola 33cl", unidad: "cajas", stock_objetivo: 6 }],
    );
    assert.equal(otrosLocales.length, 1);
    assert.equal(otrosLocales[0].unidad, "cajas", "manda la configuración de la persona");
    assert.equal(otrosLocales[0].veces, 12, "pero se conserva la prueba de que se le compra");
    assert.deepEqual(facturas.map((f) => f.nombre), ["Nestea"], "y no se repite abajo");
  });
  test("sin otro local, la lista de facturas queda intacta", () => {
    const { otrosLocales, facturas } = fusionarFuentes([{ nombre: "Nestea" }], []);
    assert.equal(otrosLocales.length, 0);
    assert.equal(facturas.length, 1);
  });
});

describe("preparar el lote antes de tocar la base", () => {
  const EXISTENTES = [{ id: 1, nombre: "Coca-Cola 33cl", activo: true }, { id: 2, nombre: "Fanta", activo: false }];

  test("lo normal: se crean los nuevos con la unidad y el stock por defecto", () => {
    const r = normalizarLote([{ nombre: "Nestea", unidad: "cajas" }], { existentes: EXISTENTES, stockDefecto: 4 });
    assert.equal(r.errores.length, 0);
    assert.equal(r.altas.length, 1);
    assert.equal(r.altas[0].unidad, "cajas");
    assert.equal(r.altas[0].stock_objetivo, 4);
    assert.equal(r.altas[0].clave_producto, claveInvProducto("Nestea"));
  });

  test("un nombre vacío rechaza el lote diciendo QUÉ línea", () => {
    // Con la lista delante se arregla; lo que no puede pasar es que entren 37 y falten 3 sin
    // saber cuáles.
    const r = normalizarLote([{ nombre: "Nestea" }, { nombre: "   " }], {});
    assert.equal(r.errores.length, 1);
    assert.equal(r.errores[0].linea, 2);
    assert.match(r.errores[0].motivo, /nombre/i);
  });

  test("una unidad inventada se rechaza; una vacía cae en «unidades»", () => {
    assert.match(normalizarLote([{ nombre: "X", unidad: "cajitas" }], {}).errores[0].motivo, /Unidad desconocida/);
    assert.equal(normalizarLote([{ nombre: "X", unidad: "" }], {}).altas[0].unidad, "unidades");
  });

  test("una temporada mal escrita se rechaza con el nombre del producto", () => {
    const r = normalizarLote([{ nombre: "Helado", temporada_inicio: "6-1" }], {});
    assert.equal(r.errores[0].nombre, "Helado");
    assert.match(r.errores[0].motivo, /temporada/i);
  });

  test("«ya existe» NO es un error: se omite y se cuenta", () => {
    // Es lo normal: dos pestañas abiertas, un doble clic, un panel que lleva un rato abierto.
    const r = normalizarLote([{ nombre: "COCA COLA 33 CL" }, { nombre: "Nestea" }], { existentes: EXISTENTES });
    assert.equal(r.errores.length, 0);
    assert.deepEqual(r.omitidos, [{ nombre: "COCA COLA 33 CL", motivo: "ya_existe" }]);
    assert.equal(r.altas.length, 1);
  });

  test("el que está desactivado se REACTIVA, no se duplica", () => {
    const r = normalizarLote([{ nombre: "fanta" }], { existentes: EXISTENTES });
    assert.deepEqual(r.reactivar, [{ id: 2, nombre: "Fanta" }]);
    assert.equal(r.altas.length, 0);
  });

  test("dos líneas del mismo producto dentro del lote se colapsan en una", () => {
    const r = normalizarLote([{ nombre: "Nestea" }, { nombre: "NESTEA" }], {});
    assert.equal(r.altas.length, 1);
    assert.deepEqual(r.omitidos, [{ nombre: "NESTEA", motivo: "repetido_en_el_lote" }]);
  });

  test("un lote vacío o gigante se rechaza entero", () => {
    assert.equal(normalizarLote([], {}).errores.length, 1);
    const muchos = Array.from({ length: TOPE_LOTE + 1 }, (_, i) => ({ nombre: "P" + i }));
    assert.match(normalizarLote(muchos, {}).errores[0].motivo, /tope/i);
  });

  test("los copiados de otro local traen SU stock, no el de por defecto", () => {
    const r = normalizarLote([{ nombre: "Estrella 33", unidad: "cajas", stock_objetivo: 6, stock_minimo: 2 }],
      { stockDefecto: 0 });
    assert.equal(r.altas[0].stock_objetivo, 6);
    assert.equal(r.altas[0].stock_minimo, 2);
  });
});
