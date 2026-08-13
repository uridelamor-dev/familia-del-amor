// Inventario — lógica pura de cálculo (stock necesario, temporada, propuesta de pedido).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizarCantidad, enTemporada, stockNecesario, cantidadAPedir,
  construirRevision, lineasPropuestaPedido, esEstadoPedidoValido, esMMDDValido, bajoMinimo,
} from "../../src/modules/inventario/calculo.js";

describe("sanitizarCantidad", () => {
  test("números válidos pasan; negativos/basura → 0", () => {
    assert.equal(sanitizarCantidad(3), 3);
    assert.equal(sanitizarCantidad("2.5"), 2.5);
    assert.equal(sanitizarCantidad(-4), 0);
    assert.equal(sanitizarCantidad("abc"), 0);
    assert.equal(sanitizarCantidad(""), 0);
    assert.equal(sanitizarCantidad(null), 0);
  });
});

describe("enTemporada", () => {
  test("rango normal dentro del mismo año", () => {
    assert.equal(enTemporada("07-01", "06-01", "09-15"), true);
    assert.equal(enTemporada("05-31", "06-01", "09-15"), false);
    assert.equal(enTemporada("09-15", "06-01", "09-15"), true);
  });
  test("rango que cruza el fin de año", () => {
    assert.equal(enTemporada("12-20", "11-01", "02-15"), true);
    assert.equal(enTemporada("01-10", "11-01", "02-15"), true);
    assert.equal(enTemporada("03-01", "11-01", "02-15"), false);
  });
  test("faltan datos → false", () => {
    assert.equal(enTemporada("07-01", "", "09-15"), false);
    assert.equal(enTemporada(null, "06-01", "09-15"), false);
  });
});

describe("stockNecesario", () => {
  const prod = { stock_objetivo: 5, temporada_stock: 8, temporada_inicio: "06-01", temporada_fin: "09-15" };
  test("fuera de temporada → stock objetivo", () => {
    assert.equal(stockNecesario(prod, "03-01"), 5);
  });
  test("dentro de temporada → stock de temporada", () => {
    assert.equal(stockNecesario(prod, "07-01"), 8);
  });
  test("sin temporada configurada → siempre objetivo", () => {
    assert.equal(stockNecesario({ stock_objetivo: 5 }, "07-01"), 5);
  });
  test("temporada_stock 0 es válido (no lo trata como vacío)", () => {
    assert.equal(stockNecesario({ stock_objetivo: 5, temporada_stock: 0, temporada_inicio: "06-01", temporada_fin: "09-15" }, "07-01"), 0);
  });
  test("sin fecha 'hoy' → objetivo (no aplica temporada)", () => {
    assert.equal(stockNecesario(prod, null), 5);
  });
});

describe("cantidadAPedir", () => {
  test("necesario > contado → diferencia", () => {
    assert.equal(cantidadAPedir(5, 3), 2);
  });
  test("contado ≥ necesario → 0 (no se pide)", () => {
    assert.equal(cantidadAPedir(5, 5), 0);
    assert.equal(cantidadAPedir(5, 8), 0);
  });
});

describe("construirRevision + lineasPropuestaPedido", () => {
  const productos = [
    { id: 1, nombre: "Estrella Damm 33cl", unidad: "cajas", stock_objetivo: 5 },
    { id: 2, nombre: "Agua 1L", unidad: "botellas", stock_objetivo: 10 },
    { id: 3, nombre: "Vino tinto", unidad: "botellas", stock_objetivo: 4, temporada_stock: 12, temporada_inicio: "06-01", temporada_fin: "09-15" },
  ];
  test("revisión calcula contado/necesario/sugerido por producto", () => {
    const rev = construirRevision(productos, { 1: 3, 2: 10, 3: 2 }, "07-01");
    // La fila lleva además el mínimo y si está por debajo: es un aviso, no entra en el cálculo.
    assert.deepEqual(rev[0], { producto_id: 1, nombre: "Estrella Damm 33cl", unidad: "cajas",
      contado: 3, necesario: 5, diferencia: 2, sugerido: 2, minimo: 0, bajoMinimo: false });
    assert.equal(rev[1].sugerido, 0);            // 10 contado ≥ 10 necesario
    assert.equal(rev[2].necesario, 12);          // temporada activa
    assert.equal(rev[2].sugerido, 10);           // 12 − 2
  });
  test("cantidad ausente cuenta como 0", () => {
    const rev = construirRevision(productos, {}, "03-01");
    assert.equal(rev[0].contado, 0);
    assert.equal(rev[0].sugerido, 5);
  });
  test("la propuesta solo incluye lo que hay que pedir (>0) y cantidad_final = sugerida", () => {
    const rev = construirRevision(productos, { 1: 3, 2: 10, 3: 2 }, "07-01");
    const lineas = lineasPropuestaPedido(rev);
    assert.equal(lineas.length, 2);              // el agua (0) queda fuera
    assert.equal(lineas[0].cantidad_sugerida, 2);
    assert.equal(lineas[0].cantidad_final, 2);
    assert.equal(lineas[1].producto_id, 3);
  });
  test("nada que pedir → propuesta vacía", () => {
    const rev = construirRevision(productos, { 1: 9, 2: 20, 3: 20 }, "07-01");
    assert.deepEqual(lineasPropuestaPedido(rev), []);
  });
});

describe("validaciones", () => {
  test("estados de pedido", () => {
    assert.equal(esEstadoPedidoValido("DRAFT"), true);
    assert.equal(esEstadoPedidoValido("APPROVED"), true);
    assert.equal(esEstadoPedidoValido("ENVIADO"), false);
  });
  test("MM-DD", () => {
    assert.equal(esMMDDValido("06-01"), true);
    assert.equal(esMMDDValido(""), true);
    assert.equal(esMMDDValido("6-1"), false);
    assert.equal(esMMDDValido("13-40"), false);
  });
});

describe("el stock mínimo avisa, no cambia el pedido", () => {
  test("por debajo del mínimo se marca", () => {
    // El campo se rellenaba en la ficha y no lo leía nadie: quien lo ponía trabajaba para nada.
    assert.equal(bajoMinimo({ stock_minimo: 5 }, 3), true);
    assert.equal(bajoMinimo({ stock_minimo: 5 }, 5), false, "estar justo en el mínimo no es estar por debajo");
    assert.equal(bajoMinimo({ stock_minimo: 5 }, 12), false);
  });

  test("sin mínimo puesto no se avisa de nada", () => {
    // Un aviso que sale siempre deja de leerse.
    assert.equal(bajoMinimo({}, 0), false);
    assert.equal(bajoMinimo({ stock_minimo: 0 }, 0), false);
  });

  test("y NO cambia cuánto se pide: eso lo marca el stock objetivo", () => {
    // Mezclarlos sería cambiar la fórmula del pedido por la puerta de atrás.
    const productos = [{ id: 1, nombre: "Coca-Cola", unidad: "cajas", stock_minimo: 5, stock_objetivo: 10 }];
    const r = construirRevision(productos, { 1: 3 })[0];
    assert.equal(r.sugerido, 7, "10 objetivo − 3 contadas");
    assert.equal(r.bajoMinimo, true);
    assert.equal(r.minimo, 5);

    const holgado = construirRevision([{ ...productos[0], stock_minimo: 1 }], { 1: 3 })[0];
    assert.equal(holgado.sugerido, 7, "el mismo pedido, aunque no esté bajo mínimo");
    assert.equal(holgado.bajoMinimo, false);
  });
});
