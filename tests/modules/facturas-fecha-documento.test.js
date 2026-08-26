import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fechasDelTexto, pistasDeFecha, anioDeNumeroFactura, revisarFecha }
  from "../../src/modules/facturas/fecha-documento.js";

// EL CASO REAL: una factura de 2026 se guardó como 2025. De la fecha cuelga en qué carpeta se
// archiva, en qué pestaña del Sheet, EN QUÉ TRIMESTRE SE DECLARA EL IVA, cuándo se paga y la
// ventana con la que se detectan las repetidas. Un año mal no se nota hasta que ya está
// declarado — y no había ni una comprobación que lo mirara.

describe("leer las fechas de un texto", () => {
  test("el formato de aquí: día primero", () => {
    assert.deepEqual(fechasDelTexto("Fecha: 03/12/2026").map((f) => f.iso), ["2026-12-03"]);
    // 03/12 es el 3 de diciembre, NO el 12 de marzo. Leerlo al revés cambia el trimestre.
    assert.equal(fechasDelTexto("03/12/2026")[0].iso, "2026-12-03");
  });

  test("con guiones, puntos y años de dos cifras", () => {
    for (const t of ["3-12-2026", "03.12.2026", "3/12/26"]) {
      assert.equal(fechasDelTexto(t)[0].iso, "2026-12-03", t);
    }
  });

  test("CON ESPACIOS ALREDEDOR, que es como salen los PDF que se pintan letra a letra", () => {
    // Sin esto, la comprobación más fuerte fallaría justo en los documentos más raros.
    assert.equal(fechasDelTexto("03 / 12 / 2026")[0].iso, "2026-12-03");
    assert.equal(fechasDelTexto("3 - 12 - 26")[0].iso, "2026-12-03");
  });

  test("el mes en letra, en castellano y en catalán", () => {
    assert.equal(fechasDelTexto("3 de diciembre de 2026")[0].iso, "2026-12-03");
    assert.equal(fechasDelTexto("3 de desembre de 2026")[0].iso, "2026-12-03");
    assert.equal(fechasDelTexto("15 ene. 2026")[0].iso, "2026-01-15");
  });

  test("el formato de máquina", () => {
    assert.equal(fechasDelTexto("2026-12-03")[0].iso, "2026-12-03");
  });

  test("LO QUE NO ES UNA FECHA no se cuela", () => {
    // Un número de cuatro cifras suelto puede ser un código, un IBAN o el registro mercantil.
    for (const t of ["B-20261234", "Tel. 972 202 620", "ES21 2026 1234 5678", "Ref. 2026", "45/13/2026"]) {
      assert.deepEqual(fechasDelTexto(t), [], `se ha colado: ${t}`);
    }
  });

  test("y una fecha que no existe tampoco", () => {
    assert.deepEqual(fechasDelTexto("31/02/2026"), []);
    assert.equal(fechasDelTexto("29/02/2028")[0].iso, "2028-02-29", "2028 es bisiesto");
  });

  test("no revienta con basura", () => {
    for (const v of [null, undefined, "", 12345, "···"]) assert.doesNotThrow(() => fechasDelTexto(v));
  });
});

describe("las pistas que se guardan del PDF", () => {
  test("solo años que venían dentro de una fecha", () => {
    const p = pistasDeFecha("Factura 2026/00418 del 03/12/2026, vence el 15/01/2027. IBAN ES21 1999 0000");
    assert.deepEqual(p.anios.sort(), [2026, 2027]);
    assert.ok(p.fechas.includes("2026-12-03"));
    assert.ok(!p.anios.includes(1999), "un tramo de IBAN no es un año de factura");
  });

  test("sin capa de texto se dice, y no se afirma nada", () => {
    // Un PDF con el membrete en imagen no permite concluir nada. Callarse es la respuesta.
    assert.deepEqual(pistasDeFecha(""), { hayTexto: false, fechas: [], anios: [] });
    assert.equal(pistasDeFecha(null).hayTexto, false);
  });
});

describe("el año dentro del número de factura", () => {
  test("cuando está, se lee", () => {
    assert.equal(anioDeNumeroFactura("FRA-2026-0123"), 2026);
    assert.equal(anioDeNumeroFactura("2026/00145"), 2026);
    assert.equal(anioDeNumeroFactura("F 2025 998"), 2025);
  });

  test("con dos cifras NO se adivina", () => {
    // Distinguir el «26» de año del «26» de serie o de cliente no se puede hacer sin conocer el
    // formato de cada proveedor, y un aviso que se equivoca es peor que no tenerlo.
    assert.equal(anioDeNumeroFactura("A26-1234"), null);
    assert.equal(anioDeNumeroFactura("26/00145"), null);
  });

  test("con dos años dentro tampoco se afirma nada", () => {
    assert.equal(anioDeNumeroFactura("2025-2026/44"), null);
  });

  test("y un número largo cualquiera no es un año", () => {
    assert.equal(anioDeNumeroFactura("F20261234"), null);
    assert.equal(anioDeNumeroFactura(""), null);
  });
});

describe("EL CASO REAL: 2026 leído como 2025", () => {
  const doc = { fecha: "2025-12-03", numero_factura: "2026/00418", total: 121 };
  const ctx = { hoy: "2026-12-03", recibida: "2026-12-03",
    pistas: pistasDeFecha("Factura 2026/00418 · Fecha: 03/12/2026 · Total 121,00 €") };

  test("se marca y se PROPONE el año bueno", () => {
    const r = revisarFecha(doc, ctx);
    assert.equal(r.grave, true);
    assert.equal(r.anioProbable, 2026);
    assert.equal(r.propuesta, "2026-12-03", "la propuesta cambia el año y respeta el día");
  });

  test("y se dice de dónde sale, para poder decidir sin abrir el PDF", () => {
    const t = revisarFecha(doc, ctx).avisos[0].texto;
    assert.match(t, /texto del PDF/);
    assert.match(t, /número de factura dice 2026/);
    assert.match(t, /IVA del trimestre/, "hay que decir por qué corre prisa");
  });

  test("UN SOLO AVISO, no cuatro diciendo lo mismo", () => {
    // Cuatro etiquetas que dicen lo mismo se leen igual de mal que ninguna.
    const r = revisarFecha(doc, ctx);
    assert.equal(r.avisos.length, 1);
  });

  test("con una sola pista no se propone nada, solo se sugiere mirar", () => {
    // Dos fuentes independientes de acuerdo es lo que convierte una sospecha en algo que se
    // puede enseñar con una propuesta. Una sola no basta.
    const r = revisarFecha({ fecha: "2025-12-03", numero_factura: "2026/00418" }, { hoy: "2026-01-15" });
    assert.equal(r.anioProbable, null);
    assert.equal(r.grave, false);
    assert.match(r.avisos[0].texto, /Comprueba la fecha/);
  });
});

describe("las facturas legítimas que NO deben avisar", () => {
  const limpio = (doc, ctx) => {
    const r = revisarFecha(doc, ctx);
    assert.equal(r.avisos.length, 0, `no debería avisar: ${JSON.stringify(r.avisos.map((a) => a.clave))}`);
  };

  test("una de diciembre que se sube en enero", () => {
    limpio({ fecha: "2025-12-28", numero_factura: "2025/1180" },
      { hoy: "2026-01-08", recibida: "2026-01-08", pistas: pistasDeFecha("Fecha 28/12/2025") });
  });

  test("LA SERIE QUE NO SE HA RENOVADO: número de 2025 con fecha de enero de 2026", () => {
    // Legítima y frecuente: el proveedor sigue con la serie del año anterior las primeras
    // semanas. Si esto avisara, el aviso sería ruido cada mes de enero.
    limpio({ fecha: "2026-01-03", numero_factura: "2025/09912" }, { hoy: "2026-01-10" });
  });

  test("un abono de una factura vieja", () => {
    // Un abono se emite hoy sobre algo de hace tiempo: su fecha antigua es normal.
    limpio({ fecha: "2025-03-10", numero_factura: "A-2025-4", concepto: "Abono de la factura 2025/112", total: -60 },
      { hoy: "2026-03-10", recibida: "2026-03-10", historial: { fechas: ["2026-01-01", "2026-02-01", "2026-02-15", "2026-03-01"] } });
  });

  test("una rectificativa", () => {
    limpio({ fecha: "2025-06-01", numero_factura: "R-2025-9", concepto: "Factura rectificativa", total: 40 },
      { hoy: "2026-06-01", recibida: "2026-06-01" });
  });

  test("un PDF con el membrete en imagen: sin texto no se afirma nada", () => {
    limpio({ fecha: "2025-12-03", numero_factura: "F-418" },
      { hoy: "2026-01-15", pistas: pistasDeFecha("") });
  });

  test("un lote de atrasos subido de golpe", () => {
    // Cualquier subida de atrasos dispararía un «está lejos de cuando llegó». Por eso esa
    // regla genérica no existe: solo salta el desfase de casi un año EXACTO con el mismo día.
    for (const f of ["2026-02-11", "2026-03-04", "2026-04-19"]) {
      limpio({ fecha: f, numero_factura: "F-1" }, { hoy: "2026-08-26", recibida: "2026-08-26" });
    }
  });

  test("y una factura normal de ayer", () => {
    limpio({ fecha: "2026-08-25", numero_factura: "2026/512", vencimiento: "2026-09-25" },
      { hoy: "2026-08-26", recibida: "2026-08-26", vencimientoDelPapel: true,
        pistas: pistasDeFecha("Fecha 25/08/2026 Vto 25/09/2026") });
  });
});

describe("los imposibles", () => {
  test("una fecha del futuro", () => {
    const r = revisarFecha({ fecha: "2026-12-01" }, { hoy: "2026-08-26" });
    assert.equal(r.grave, true);
    assert.match(r.avisos[0].texto, /posterior a hoy/);
  });

  test("pero unos días de margen no se tocan: hay facturas emitidas con fecha del lunes", () => {
    assert.equal(revisarFecha({ fecha: "2026-08-29" }, { hoy: "2026-08-26" }).avisos.length, 0);
  });

  test("el vencimiento antes que la factura", () => {
    const r = revisarFecha({ fecha: "2026-08-20", vencimiento: "2026-07-20" },
      { hoy: "2026-08-26", vencimientoDelPapel: true });
    assert.equal(r.grave, true);
    assert.match(r.avisos[0].texto, /anterior a la fecha/);
  });

  test("pero NO si el vencimiento lo hemos calculado nosotros", () => {
    // Contrastar una fecha contra algo que se ha calculado a partir de ella es compararla
    // consigo misma: no probaría nada y encima parecería que sí.
    const r = revisarFecha({ fecha: "2026-08-20", vencimiento: "2026-07-20" },
      { hoy: "2026-08-26", vencimientoDelPapel: false });
    assert.equal(r.avisos.length, 0);
  });

  test("sin fecha se dice, porque esa factura no entra en el IVA", () => {
    const r = revisarFecha({ fecha: null }, { hoy: "2026-08-26" });
    assert.equal(r.avisos[0].clave, "sin_fecha");
    assert.match(r.avisos[0].texto, /no cuenta en el IVA/);
  });

  test("y no revienta sin contexto", () => {
    assert.doesNotThrow(() => revisarFecha());
    assert.doesNotThrow(() => revisarFecha({ fecha: "2026-08-20" }));
  });
});
