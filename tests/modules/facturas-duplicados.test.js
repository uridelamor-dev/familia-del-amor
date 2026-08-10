import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comparar, buscarParecida, distancia, CUENTA_EN_TOTALES, MISMO_PROVEEDOR } from "../../src/modules/facturas/duplicados.js";

const F = (x) => ({ proveedor: "Grau Distribucions", nif: "B12345678", fecha: "2026-07-28",
  numero_factura: "A-991", base_imponible: 100, total: 121, ...x });

describe("lo que es la misma factura sin ninguna duda", () => {
  test("mismo proveedor, mismo número y mismo importe", () => {
    const r = comparar(F(), F());
    assert.equal(r.veredicto, "duplicada");
  });
  test("aunque el número venga escrito de otra forma: A-991 y 991", () => {
    assert.equal(comparar(F(), F({ numero_factura: "991" })).veredicto, "duplicada");
    assert.equal(comparar(F(), F({ numero_factura: "FRA 000991" })).veredicto, "duplicada");
  });
  test("y aunque el nombre del proveedor esté escrito distinto, si el NIF coincide", () => {
    assert.equal(comparar(F(), F({ proveedor: "GRAU DISTRIBUCIONS, S.L." })).veredicto, "duplicada");
  });
});

describe("lo que hay que preguntar", () => {
  test("mismo importe y misma fecha, pero el número se leyó distinto", () => {
    // La foto de la misma factura desde otro ángulo: un 3 leído como un 8.
    const r = comparar(F(), F({ numero_factura: "A-998" }));
    assert.equal(r.veredicto, "duda");
    assert.match(r.motivos.join(" "), /difiere en un carácter/);
  });
  test("mismo importe y mismo número, pero fechas distintas", () => {
    const r = comparar(F(), F({ fecha: "2026-07-30" }));
    assert.equal(r.veredicto, "duda");
  });
  test("mismo importe y misma fecha, sin número en una de las dos", () => {
    const r = comparar(F({ numero_factura: null }), F());
    assert.equal(r.veredicto, "duda");
  });
  test("los motivos se explican en palabras, no en un porcentaje", () => {
    const r = comparar(F(), F({ numero_factura: "A-998" }));
    assert.match(r.motivos.join(" · "), /mismo proveedor/);
    assert.match(r.motivos.join(" · "), /mismo importe/);
    assert.match(r.motivos.join(" · "), /misma fecha/);
  });
});

describe("lo que NO es duplicado, y es importante que no lo parezca", () => {
  test("dos facturas del mismo proveedor el mismo día con importes distintos", () => {
    // Pasa a diario: una entrega por la mañana y otra por la tarde.
    assert.equal(comparar(F(), F({ numero_factura: "A-992", total: 84.5 })).veredicto, "distinta");
  });
  test("otro proveedor, aunque coincida todo lo demás", () => {
    assert.equal(comparar(F(), F({ proveedor: "Cerezo", nif: "B99999999" })).veredicto, "distinta");
  });
  test("mismo importe pero un mes después: es la cuota mensual, no un duplicado", () => {
    assert.equal(comparar(F(), F({ fecha: "2026-08-28", numero_factura: "A-1042" })).veredicto, "distinta");
  });
  test("números parecidos por casualidad pero cortos no cuentan", () => {
    assert.equal(comparar(F({ numero_factura: "1" }), F({ numero_factura: "2" })).veredicto, "duda",
      "con mismo importe y fecha sí se pregunta");
    assert.equal(comparar(F({ numero_factura: "1", total: 50 }), F({ numero_factura: "2" })).veredicto, "distinta",
      "pero sin el importe igual, no");
  });
});

describe("el proveedor: el NIF manda sobre el nombre", () => {
  test("mismo NIF, nombres distintos → el mismo", () => {
    assert.equal(MISMO_PROVEEDOR({ nif: "B-12.345.678", proveedor: "X" }, { nif: "b12345678", proveedor: "Y" }), true);
  });
  test("NIF distinto → distintos, aunque el nombre sea idéntico", () => {
    assert.equal(MISMO_PROVEEDOR({ nif: "A1", proveedor: "Grau" }, { nif: "B2", proveedor: "Grau" }), false);
  });
  test("sin NIF se cae al nombre, tolerando acentos y mayúsculas", () => {
    assert.equal(MISMO_PROVEEDOR({ proveedor: "Cárnicas Cerezo" }, { proveedor: "CARNICAS CEREZO" }), true);
  });
  test("sin NIF ni nombre no se afirma nada", () => {
    assert.equal(MISMO_PROVEEDOR({}, {}), false);
  });
});

describe("buscar entre las que ya están guardadas", () => {
  const guardadas = [
    F({ id: 1, numero_factura: "A-100", total: 50 }),
    F({ id: 2, numero_factura: "A-998" }),          // la parecida
    F({ id: 3, numero_factura: "A-991" }),          // la idéntica
  ];
  test("una certeza gana a una duda, aunque la duda venga antes", () => {
    const r = buscarParecida(F({ id: 9 }), guardadas);
    assert.equal(r.veredicto, "duplicada");
    assert.equal(r.contra.id, 3);
  });
  test("si no hay certeza, se queda con la duda más fuerte", () => {
    const r = buscarParecida(F({ id: 9 }), guardadas.filter((g) => g.id !== 3));
    assert.equal(r.veredicto, "duda");
    assert.equal(r.contra.id, 2);
  });
  test("no se compara consigo misma", () => {
    assert.equal(buscarParecida(F({ id: 3 }), [F({ id: 3 })]), null);
  });
  test("sin candidatas, no hay sospecha", () => {
    assert.equal(buscarParecida(F(), []), null);
  });
});

describe("qué cuenta en los totales", () => {
  test("lo pendiente de decidir NO cuenta: un total con un duplicado dentro es un total falso", () => {
    assert.equal(CUENTA_EN_TOTALES("duda"), false);
  });
  test("lo demás sí", () => {
    for (const e of [null, undefined, "", "distinta"]) assert.equal(CUENTA_EN_TOTALES(e), true, String(e));
  });
});

describe("distancia de edición", () => {
  test("un carácter cambiado, añadido o quitado", () => {
    assert.equal(distancia("991", "998"), 1);
    assert.equal(distancia("991", "9915"), 1);
    assert.equal(distancia("9915", "991"), 1);
  });
  test("se corta pronto: no interesa el número exacto si ya es grande", () => {
    assert.ok(distancia("abcdefgh", "12345678") > 3);
  });
  test("iguales, cero", () => {
    assert.equal(distancia("991", "991"), 0);
  });
});

describe("cableado: lo dudoso no puede colarse en ningún total", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const facturas = readFileSync(new URL("../../facturas.js", import.meta.url), "utf8");

  test("la lista y los totales excluyen lo pendiente de decidir", () => {
    assert.match(server, /const SIN_DUDAS = "COALESCE\(dup_estado,''\) <> 'duda'"/);
    const i = server.indexOf("function facturasWhere(");
    assert.match(server.slice(i, i + 300), /const cond = \[SIN_DUDAS\]/);
  });

  test("«Qué compramos» también", () => {
    // La consulta vive en `comprasDeLocal`, que es la que se llama una vez por local cuando
    // se miran varios establecimientos a la vez. Lo dudoso queda fuera de las dos formas.
    const i = server.indexOf("async function comprasDeLocal(");
    assert.notEqual(i, -1, "¿han renombrado comprasDeLocal?");
    assert.match(server.slice(i, i + 900), /COALESCE\(f\.dup_estado,''\) <> 'duda'/);
  });

  test("la comprobación va acotada por proveedor y fechas, no contra la tabla entera", () => {
    const i = facturas.indexOf("export async function sospecharDuplicado(");
    const bloque = facturas.slice(i, i + 1600);
    assert.match(bloque, /LOWER\(proveedor\) = LOWER\(\?\)/);
    assert.match(bloque, /fecha BETWEEN/);
    assert.match(bloque, /LIMIT 60/);
  });

  test("si la comprobación falla, la factura entra igual", () => {
    // Perder una factura por un fallo al buscar duplicados sería el remedio peor que la
    // enfermedad: se registra el error y se sigue.
    const i = facturas.indexOf("export async function sospecharDuplicado(");
    assert.match(facturas.slice(i, i + 1800), /catch \(e\) \{[\s\S]{0,200}return null;/);
  });

  test("confirmar un duplicado queda en la auditoría antes de borrar nada", () => {
    const i = server.indexOf('app.post("/api/facturas/duplicados/:id/resolver"');
    const bloque = server.slice(i, i + 2200);
    const posAudit = bloque.indexOf("duplicado_confirmado");
    const posDelete = bloque.indexOf("DELETE FROM facturas WHERE id");
    assert.ok(posAudit > 0 && posAudit < posDelete, "se apunta primero, se borra después");
    assert.match(bloque, /drive_url/, "y se guarda dónde está el archivo por si hay que mirarlo");
  });

  test("descartar la sospecha reproyecta su mes al Sheet: vuelve a contar", () => {
    const i = server.indexOf('app.post("/api/facturas/duplicados/:id/resolver"');
    assert.match(server.slice(i, i + 2200), /resincronizarSheetsFactura/);
  });
});
