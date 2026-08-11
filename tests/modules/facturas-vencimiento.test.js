import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcularVencimiento, estadoPago, diasHasta, agruparPagos, resumenPagos, textoCondiciones, GRUPOS_PAGO }
  from "../../src/modules/facturas/vencimiento.js";

const HOY = "2026-08-11";

// ── De dónde sale la fecha ─────────────────────────────────────────────────

describe("cuándo vence una factura", () => {
  test("si el papel trae la fecha, manda el papel", () => {
    // Es lo que el proveedor va a reclamar. Da igual lo que tengamos pactado en la ficha.
    const r = calcularVencimiento({ fecha: "2026-08-01", vencimientoLeido: "2026-09-15", condiciones: { dias: 30 } });
    assert.equal(r.vencimiento, "2026-09-15");
    assert.equal(r.origen, "factura");
  });

  test("si no, se calcula con lo pactado con ese proveedor", () => {
    const r = calcularVencimiento({ fecha: "2026-08-01", condiciones: { dias: 30 } });
    assert.equal(r.vencimiento, "2026-08-31");
    assert.equal(r.origen, "proveedor");
  });

  test("«al contado» es el mismo día, no es lo mismo que no tener condiciones", () => {
    const r = calcularVencimiento({ fecha: "2026-08-01", condiciones: { dias: 0 } });
    assert.equal(r.vencimiento, "2026-08-01");
    assert.equal(r.origen, "proveedor");
  });

  test("sin condiciones NO se inventa un vencimiento", () => {
    // Un «30 días» por defecto se paga tarde o se paga dos veces, y encima con la
    // tranquilidad de que la fecha estaba puesta. Mejor decir que no se sabe.
    assert.deepEqual(calcularVencimiento({ fecha: "2026-08-01" }), { vencimiento: null, origen: null });
    assert.deepEqual(calcularVencimiento({ fecha: "2026-08-01", condiciones: {} }), { vencimiento: null, origen: null });
    assert.deepEqual(calcularVencimiento({ fecha: "2026-08-01", condiciones: { dias: "treinta" } }), { vencimiento: null, origen: null });
  });

  test("sin fecha de factura tampoco hay de dónde contar", () => {
    assert.equal(calcularVencimiento({ condiciones: { dias: 30 } }).vencimiento, null);
    assert.equal(calcularVencimiento({ fecha: "hace un mes", condiciones: { dias: 30 } }).vencimiento, null);
  });

  test("un vencimiento leído con basura no cuela: se calcula como si no viniera", () => {
    const r = calcularVencimiento({ fecha: "2026-08-01", vencimientoLeido: "a 30 días", condiciones: { dias: 30 } });
    assert.equal(r.vencimiento, "2026-08-31");
    assert.equal(r.origen, "proveedor");
  });
});

describe("los que cobran «a 30 días pero pagando los días 10»", () => {
  test("se redondea al día de pago del proveedor", () => {
    // Sin esto el vencimiento saldría el 31 de agosto y el dinero saldría el 10 de septiembre:
    // la previsión de la semana estaría mal por sistema.
    const r = calcularVencimiento({ fecha: "2026-08-01", condiciones: { dias: 30, dia_pago: 10 } });
    assert.equal(r.vencimiento, "2026-09-10");
  });

  test("si el día aún no ha pasado, es el de este mismo mes", () => {
    const r = calcularVencimiento({ fecha: "2026-08-01", condiciones: { dias: 5, dia_pago: 10 } });
    assert.equal(r.vencimiento, "2026-08-10");
  });

  test("y si el mes no tiene ese día, se paga el último — no se salta al mes siguiente", () => {
    // Pagar «el 31» en noviembre no es el 1 de diciembre: eso movería el gasto de mes.
    const r = calcularVencimiento({ fecha: "2026-11-15", condiciones: { dias: 5, dia_pago: 31 } });
    assert.equal(r.vencimiento, "2026-11-30");
  });

  test("un día de pago imposible se ignora en vez de romper la fecha", () => {
    assert.equal(calcularVencimiento({ fecha: "2026-08-01", condiciones: { dias: 30, dia_pago: 45 } }).vencimiento, "2026-08-31");
    assert.equal(calcularVencimiento({ fecha: "2026-08-01", condiciones: { dias: 30, dia_pago: 0 } }).vencimiento, "2026-08-31");
  });

  test("nunca cae ANTES de vencer: se va al siguiente día de pago", () => {
    // 20 dic + 30 días = 19 de enero. El día 10 de enero ya pasó, así que no se puede pagar
    // entonces algo que aún no ha vencido: toca el 10 de febrero. Y cruza el año sin liarse.
    assert.equal(calcularVencimiento({ fecha: "2026-12-20", condiciones: { dias: 30, dia_pago: 10 } }).vencimiento, "2027-02-10");
    assert.equal(calcularVencimiento({ fecha: "2026-12-01", condiciones: { dias: 30, dia_pago: 10 } }).vencimiento, "2027-01-10");
  });
});

// ── En qué situación está ──────────────────────────────────────────────────

describe("el estado de una factura", () => {
  const f = (o) => estadoPago({ fecha: "2026-08-01", ...o }, HOY);

  test("pagada es pagada, aunque hubiera vencido", () => {
    assert.equal(f({ vencimiento: "2026-07-01", pagado: 1 }).estado, "pagada");
  });

  test("vencida dice cuántos días lleva, que es lo que duele", () => {
    const e = f({ vencimiento: "2026-08-04" });
    assert.equal(e.estado, "vencida");
    assert.equal(e.dias, -7);
    assert.match(e.texto, /Vencida hace 7 días/);
  });

  test("hoy es hoy", () => {
    assert.equal(f({ vencimiento: HOY }).estado, "hoy");
  });

  test("los próximos siete días son «esta semana»", () => {
    assert.equal(f({ vencimiento: "2026-08-18" }).estado, "semana");
    assert.match(f({ vencimiento: "2026-08-14" }).texto, /Vence en 3 días/);
    assert.equal(f({ vencimiento: "2026-08-19" }).estado, "proxima");
  });

  test("sin fecha NO es «no urgente»: es «no se sabe», y se dice", () => {
    const e = f({ vencimiento: null });
    assert.equal(e.estado, "sin_fecha");
    assert.match(e.pista, /ponle condiciones al proveedor/);
  });

  test("las vencidas van primero en el orden de la pantalla", () => {
    const orden = ["vencida", "hoy", "semana", "proxima", "sin_fecha"]
      .map((c) => f({ vencimiento: c === "sin_fecha" ? null : HOY }).orden);
    assert.equal(f({ vencimiento: "2026-01-01" }).orden, 0);
    assert.ok(f({ vencimiento: null }).orden > f({ vencimiento: "2026-12-01" }).orden);
  });

  test("diasHasta cuenta bien hacia atrás y hacia delante", () => {
    assert.equal(diasHasta(HOY, "2026-08-18"), 7);
    assert.equal(diasHasta(HOY, "2026-08-04"), -7);
    assert.equal(diasHasta(HOY, HOY), 0);
    assert.equal(diasHasta(HOY, "mañana"), null);
  });
});

// ── La pantalla de pagos ───────────────────────────────────────────────────

describe("agrupar lo que hay que pagar", () => {
  const FILAS = [
    { id: 1, proveedor: "Grau", total: 300, fecha: "2026-07-01", vencimiento: "2026-07-31", pagado: 0 },   // vencida
    { id: 2, proveedor: "Grau", total: 200, fecha: "2026-07-05", vencimiento: "2026-08-04", pagado: 0 },   // vencida
    { id: 3, proveedor: "Bo de Debò", total: 150, fecha: "2026-08-11", vencimiento: HOY, pagado: 0 },      // hoy
    { id: 4, proveedor: "Amat", total: 100, fecha: "2026-08-01", vencimiento: "2026-08-15", pagado: 0 },   // semana
    { id: 5, proveedor: "Amat", total: 500, fecha: "2026-08-01", vencimiento: "2026-09-30", pagado: 0 },   // más adelante
    { id: 6, proveedor: "Sin condiciones SL", total: 80, fecha: "2026-08-02", vencimiento: null, pagado: 0 },
    { id: 7, proveedor: "Grau", total: 999, fecha: "2026-06-01", vencimiento: "2026-06-30", pagado: 1 },   // pagada: fuera
  ];
  const grupos = agruparPagos(FILAS, HOY);
  const g = (c) => grupos.find((x) => x.clave === c);

  test("las pagadas no salen: esto es lo que queda por pagar", () => {
    assert.ok(!grupos.some((x) => x.facturas.some((f) => f.id === 7)));
  });

  test("cada factura cae en su grupo y el grupo suma su dinero", () => {
    assert.equal(g("vencida").n, 2);
    assert.equal(g("vencida").total, 500);
    assert.equal(g("hoy").n, 1);
    assert.equal(g("semana").total, 100);
    assert.equal(g("proxima").total, 500);
    assert.equal(g("sin_fecha").total, 80);
  });

  test("dentro de cada grupo, lo que antes vence va primero", () => {
    assert.deepEqual(g("vencida").facturas.map((f) => f.id), [1, 2]);
  });

  test("los cinco grupos salen siempre, aunque estén vacíos", () => {
    // Un grupo que desaparece se lee como «eso ya está»; y «sin fecha» vacío no es lo mismo
    // que «sin fecha» sin mirar.
    const vacios = agruparPagos([], HOY);
    assert.equal(vacios.length, GRUPOS_PAGO.length);
    assert.ok(vacios.every((x) => x.n === 0 && x.total === 0));
  });

  test("el resumen cuenta hoy dentro de «esta semana»", () => {
    // Quien pregunta «qué pago esta semana» cuenta hoy dentro.
    const r = resumenPagos(grupos);
    assert.deepEqual(r.vencidas, { n: 2, total: 500 });
    assert.deepEqual(r.semana, { n: 2, total: 250 });
    assert.deepEqual(r.sinFecha, { n: 1, total: 80 });
    assert.equal(r.total, 1330);
  });
});

describe("cómo se dicen las condiciones", () => {
  test("en una línea que se entiende", () => {
    assert.equal(textoCondiciones({ dias: 30 }), "A 30 días");
    assert.equal(textoCondiciones({ dias: 0 }), "Al contado");
    assert.equal(textoCondiciones({ dias: 60, dia_pago: 5 }), "A 60 días, pagando los días 5");
  });
  test("y sin condiciones se dice que no las hay", () => {
    assert.equal(textoCondiciones(null), "Sin condiciones");
    assert.equal(textoCondiciones({}), "Sin condiciones");
  });
});

// ── Cableado ───────────────────────────────────────────────────────────────

describe("el servidor no cobra dos veces ni paga lo que no toca", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const pagos = server.slice(server.indexOf('app.get("/api/facturas/pagos"'), server.indexOf('app.put("/api/facturas/proveedor-pago"'));

  test("los albaranes quedan fuera de los pagos", () => {
    // Son la entrega, no el pago: su importe ya va en la factura que los agrupa. Meterlos
    // aquí sería pagar dos veces lo mismo.
    assert.match(pagos, /SIN_ALBARANES/);
  });

  test("y las dudosas también, mientras no se decida si están repetidas", () => {
    assert.match(pagos, /SIN_DUDAS/);
  });

  test("solo lo que está sin pagar", () => {
    assert.match(pagos, /COALESCE\(pagado,0\) = 0/);
  });

  test("la fecha de hoy es la de MADRID, no la de UTC", () => {
    // `hoyISO()` es UTC: entre medianoche y las dos de la mañana en verano devuelve ayer, y
    // aquí eso significaría enseñar como «vence hoy» algo que venció ayer.
    assert.match(pagos, /instanteMadrid\(new Date\(\)\)\.fecha/);
  });

  test("al cambiar las condiciones NO se pisa la fecha que traía el papel", () => {
    const put = server.slice(server.indexOf('app.put("/api/facturas/proveedor-pago"'), server.indexOf('// Ficha de un proveedor'));
    assert.match(put, /COALESCE\(vencimiento_origen,''\) <> 'factura'/);
    assert.match(put, /COALESCE\(pagado,0\) = 0/, "una factura ya pagada no cambia de vencimiento");
  });

  test("el estado de pago lo calcula el servidor, no se copia al navegador", () => {
    // Copiar los umbrales al panel sería tener dos verdades que un día dejan de coincidir.
    assert.match(server, /r\.estado_pago = estadoPago\(r, hoyMad\)/);
    const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");
    assert.doesNotMatch(panel, /function estadoPagoFE/, "el panel no puede tener su propia copia");
    assert.match(panel, /f\.estado_pago \|\|/);
  });
});

describe("la factura trae su vencimiento cuando lo lleva escrito", () => {
  const facturas = readFileSync(new URL("../../facturas.js", import.meta.url), "utf8");
  test("se le pide al modelo, y solo si es una fecha de verdad", () => {
    assert.match(facturas, /"vencimiento": "YYYY-MM-DD"/);
    assert.match(facturas, /Si lo que pone son condiciones/, "«a 30 días» no es una fecha: eso lo calculamos nosotros");
  });
  test("y al guardar se calcula con lo pactado si el papel no dice nada", () => {
    assert.match(facturas, /calcularVencimiento\(\{[\s\S]{0,200}condicionesDePago\(dbGet, datos\.proveedor\)/);
  });
});
