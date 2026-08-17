import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agruparRecibos, calcularVencimiento, estadoPago, diasHasta, agruparPagos, resumenPagos, textoCondiciones, GRUPOS_PAGO }
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
    // Con la empresa: el mismo proveedor puede tener condiciones distintas en cada una.
    assert.match(facturas, /calcularVencimiento\(\{[\s\S]{0,300}condicionesDePago\(dbGet, datos\.proveedor, empresa\)/);
  });
});

// ── El recibo mensual ──────────────────────────────────────────────────────
// «Todo lo que me facture en julio me lo pasa en un recibo el 15 de agosto». Es como se paga a
// la mayoría de proveedores, y NO es «a X días» disfrazado.

describe("el recibo mensual: todo el mes en un solo cargo", () => {
  const grau = { modo: "mensual", dia_pago: 15, meses_despues: 1, domiciliado: true };

  test("una factura del día 3 y otra del 31 vencen EL MISMO DÍA", () => {
    // Esto es lo que hace que no se pueda simular con «a 30 días»: con 30 días saldrían el 2 y
    // el 30 de agosto, dos fechas que no existen — el banco cobra una vez, el día 15.
    const a = calcularVencimiento({ fecha: "2026-07-03", condiciones: grau });
    const b = calcularVencimiento({ fecha: "2026-07-31", condiciones: grau });
    assert.equal(a.vencimiento, "2026-08-15");
    assert.equal(b.vencimiento, "2026-08-15");
    assert.equal(a.origen, "proveedor");
  });

  test("cruzando el año, diciembre va a enero", () => {
    assert.equal(calcularVencimiento({ fecha: "2026-12-20", condiciones: grau }).vencimiento, "2027-01-15");
  });

  test("si el mes de destino no tiene ese día, se cobra el último y NO se mueve de mes", () => {
    // Día 31 con destino febrero: el 31 de febrero no existe, y pasarlo al 1 de marzo movería
    // el recibo de mes y descuadraría la previsión.
    const c = { modo: "mensual", dia_pago: 31, meses_despues: 1 };
    assert.equal(calcularVencimiento({ fecha: "2026-01-10", condiciones: c }).vencimiento, "2026-02-28");
    assert.equal(calcularVencimiento({ fecha: "2028-01-10", condiciones: c }).vencimiento, "2028-02-29", "bisiesto");
  });

  test("se puede pactar a dos meses, o dentro del mismo mes", () => {
    assert.equal(calcularVencimiento({ fecha: "2026-07-05", condiciones: { modo: "mensual", dia_pago: 5, meses_despues: 2 } }).vencimiento, "2026-09-05");
    assert.equal(calcularVencimiento({ fecha: "2026-07-05", condiciones: { modo: "mensual", dia_pago: 28, meses_despues: 0 } }).vencimiento, "2026-07-28");
  });

  test("el papel sigue mandando por encima del recibo", () => {
    // Si la factura trae su propio vencimiento escrito, es el que el proveedor va a reclamar.
    const r = calcularVencimiento({ fecha: "2026-07-03", vencimientoLeido: "2026-08-31", condiciones: grau });
    assert.equal(r.vencimiento, "2026-08-31");
    assert.equal(r.origen, "factura");
  });

  test("sin día no hay recibo, y no se inventa uno", () => {
    assert.equal(calcularVencimiento({ fecha: "2026-07-03", condiciones: { modo: "mensual" } }).vencimiento, null);
    assert.equal(calcularVencimiento({ fecha: "2026-07-03", condiciones: { modo: "mensual", dia_pago: 40 } }).vencimiento, null);
  });

  test("se explica en una frase que se entiende", () => {
    assert.equal(textoCondiciones(grau), "Recibo mensual: todo lo del mes, el día 15 del mes siguiente (por banco)");
    assert.equal(textoCondiciones({ modo: "mensual", dia_pago: 5, meses_despues: 2 }), "Recibo mensual: todo lo del mes, el día 5 2 meses después");
    assert.equal(textoCondiciones({ dias: 30, dia_pago: 10, domiciliado: true }), "A 30 días, pagando los días 10 (por banco)");
  });
});

describe("las facturas de un recibo son UN cargo, no doce", () => {
  const f = (id, total, venc, recibo = true) => ({ id, total, vencimiento: venc, recibo, domiciliado: recibo, proveedor: "Grau", prov_clave: "grau" });

  test("se suman en una sola línea con su fecha", () => {
    // En el banco sale una línea de 350 €, no tres de 100, 200 y 50. Enseñarlas sueltas obliga
    // a sumarlas a mano para saber qué va a salir de la cuenta.
    const g = agruparRecibos([f(1, 100, "2026-08-15"), f(2, 200, "2026-08-15"), f(3, 50, "2026-08-15")]);
    assert.equal(g.length, 1);
    assert.equal(g[0].total, 350);
    assert.equal(g[0].facturas.length, 3);
    assert.equal(g[0].esRecibo, true);
  });

  test("dos meses son dos recibos, aunque sea el mismo proveedor", () => {
    const g = agruparRecibos([f(1, 100, "2026-08-15"), f(2, 200, "2026-09-15")]);
    assert.equal(g.length, 2);
    assert.deepEqual(g.map((x) => x.vencimiento), ["2026-08-15", "2026-09-15"]);
  });

  test("dos proveedores no se mezclan aunque cobren el mismo día", () => {
    const otra = { ...f(9, 500, "2026-08-15"), proveedor: "Cerezo", prov_clave: "cerezo" };
    assert.equal(agruparRecibos([f(1, 100, "2026-08-15"), otra]).length, 2);
  });

  test("las que no son recibo se quedan sueltas, sin tocarlas", () => {
    const suelta = f(7, 80, "2026-08-20", false);
    const g = agruparRecibos([f(1, 100, "2026-08-15"), suelta]);
    assert.equal(g.length, 2);
    assert.equal(g.find((x) => !x.esRecibo).id, 7);
  });

  test("y todo sale ordenado por fecha, que es como se paga", () => {
    const g = agruparRecibos([f(1, 100, "2026-09-15"), f(2, 200, "2026-08-15"), f(3, 50, "2026-07-15")]);
    assert.deepEqual(g.map((x) => x.vencimiento), ["2026-07-15", "2026-08-15", "2026-09-15"]);
  });
});

describe("el recibo, cableado", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("se juntan los recibos ANTES de repartir por urgencia", () => {
    // Al revés, un mismo recibo saldría partido entre «esta semana» y «más adelante» según la
    // fecha de cada factura — y es un solo cargo.
    assert.match(server, /agruparPagos\(agruparRecibos\(filas\), hoy\)/);
  });

  test("en modo recibo, `dias` deja de ser obligatorio en la base", () => {
    assert.match(server, /ALTER TABLE facturas_proveedor_pago ALTER COLUMN dias DROP NOT NULL/);
    assert.match(server, /modo TEXT NOT NULL DEFAULT 'dias'/, "y lo ya guardado no cambia de modo");
  });

  test("el contador sigue contando FACTURAS, no cargos", () => {
    const mod = readFileSync(new URL("../../src/modules/facturas/vencimiento.js", import.meta.url), "utf8");
    assert.match(mod, /g\.n \+= f\.facturas\?\.length \|\| 1/);
  });

  test("el recibo se puede marcar pagado entero, que es como se paga", () => {
    assert.match(panel, /data-pago="recibo"/);
    assert.match(panel, /Se marcarán como pagadas las \$\{ids\.length\} facturas/);
  });

  test("y en la ficha el recibo mensual va primero, por ser lo más común", () => {
    const i = panel.indexOf('id="fpModo"');
    const bloque = panel.slice(i, i + 400);
    assert.ok(bloque.indexOf('value="mensual"') < bloque.indexOf('value="dias"'));
  });
});

describe("las miniaturas se piden con la cabecera", () => {
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("NO se pintan como <img src> a pelo", () => {
    // El panel se autentica con una cabecera `Authorization`, y una imagen que pide el
    // navegador por su cuenta no la lleva: cada miniatura recibía un 401 y el `onerror` la
    // borraba sin decir nada. La columna salía vacía y parecía cosa de Drive.
    assert.doesNotMatch(panel, /<img[^>]*src="\/api\/facturas\/\$\{[^}]*\}\/miniatura"/);
    assert.match(panel, /fetch\(`\/api\/facturas\/\$\{encodeURIComponent\(id\)\}\/miniatura`, \{ headers: \{ Authorization/);
  });

  test("y solo las que se ven, que si no son 500 peticiones a Drive de golpe", () => {
    assert.match(panel, /new IntersectionObserver/);
    assert.match(panel, /rootMargin/);
  });
});

describe("las condiciones de pago son por proveedor Y EMPRESA", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const facturas = readFileSync(new URL("../../facturas.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("las reglas van en una TABLA NUEVA, no cambiando la clave de la que había", () => {
    // El mismo proveedor puede pasarle el recibo del 15 a una empresa del grupo y cobrarle al
    // contado a otra. Con una sola regla por proveedor, la fecha de una de las dos sale mal
    // SIEMPRE — y encima parece correcta.
    //
    // Y va en una tabla nueva por una razón muy concreta: cambiar una clave primaria son tres
    // pasos en un orden obligatorio, y el generador de migraciones del despliegue los emite en
    // otro —crea la clave con una columna que aún no existe—, falla, y el despliegue se queda
    // bloqueado. Pasó de verdad. Una tabla nueva es aditiva y no hay orden que equivocar.
    assert.match(server, /CREATE TABLE IF NOT EXISTS facturas_pago_reglas/);
    assert.match(server, /PRIMARY KEY \(prov_clave, empresa\)/);
    assert.doesNotMatch(server, /ALTER TABLE facturas_proveedor_pago (DROP CONSTRAINT|ADD PRIMARY KEY)/,
      "tocar la clave de la tabla vieja es lo que bloqueó el despliegue");
  });

  test("y lo que ya estaba guardado pasa a ser la regla general, sin pisarse al reiniciar", () => {
    assert.match(server, /INSERT INTO facturas_pago_reglas[\s\S]{0,400}FROM facturas_proveedor_pago/);
    assert.match(server, /ON CONFLICT \(prov_clave, empresa\) DO NOTHING/);
  });

  test("y manda la de la empresa sobre la general", () => {
    // `empresa = ''` es la regla general: lo que ya estaba guardado pasa a serlo, que es lo
    // que significaba hasta ahora.
    const fn = facturas.slice(facturas.indexOf("export async function condicionesDePago"), facturas.indexOf("export async function condicionesDePago") + 900);
    assert.match(fn, /empresa IN \(\?, ''\)/);
    assert.match(fn, /ORDER BY \(empresa <> ''\) DESC/);
  });

  test("cada factura se recalcula con la regla de SU empresa", () => {
    const fn = server.slice(server.indexOf('app.put("/api/facturas/proveedor-pago"'), server.indexOf("// Ficha de un proveedor"));
    assert.match(fn, /condicionesDePago\(dbGet, nombre, k\)/);
    assert.match(fn, /condDe\(f\.empresa\)/);
    assert.match(fn, /porEmpresa/, "las condiciones se resuelven una vez por empresa, no una por factura");
  });

  test("dos empresas del mismo proveedor son DOS recibos, no uno", () => {
    // Son dos cargos contra dos cuentas distintas. Juntarlos daría un total que no coincide
    // con ninguno de los dos apuntes del banco.
    const mod = readFileSync(new URL("../../src/modules/facturas/vencimiento.js", import.meta.url), "utf8");
    assert.match(mod, /\$\{String\(f\.empresa \|\| ""\)\}/);
  });

  test("la ficha enseña TODAS sus reglas, no solo una", () => {
    assert.match(server, /reglasPago: reglas/);
    assert.match(panel, /function fpReglasHtml/);
    assert.match(panel, /Todas las empresas/);
  });

  test("y se puede quitar la de una empresa sin tocar la general", () => {
    assert.match(server, /DELETE FROM facturas_pago_reglas WHERE prov_clave = \? AND empresa = \?/);
    assert.match(panel, /Sus facturas pasarán a usar la regla general/);
  });
});

describe("las facturas del mismo proveedor no se leen como proveedores repetidos", () => {
  // El caso real: cuatro facturas de Licefred de 2, 1, 13 y 9 € salían en cuatro filas
  // seguidas con el mismo nombre. Se lee como «este proveedor está duplicado», y no lo está.
  const f = (id, total, prov, venc = null) =>
    ({ id, total, proveedor: prov, prov_clave: prov.toLowerCase(), empresa: "X", vencimiento: venc, pagado: 0 });

  test("se juntan aunque no tengan fecha de pago", () => {
    const g = agruparRecibos([f(1, 2, "LICEFRED"), f(2, 1, "LICEFRED"), f(3, 13, "LICEFRED"), f(4, 9, "LICEFRED")]);
    assert.equal(g.length, 1);
    assert.equal(g[0].total, 25);
    assert.equal(g[0].facturas.length, 4);
  });

  test("pero juntarlas NO las convierte en un recibo", () => {
    // Un recibo es un cargo que el banco hace de una vez. Esto solo es una lista legible: si
    // se llamara igual, la pantalla estaría diciendo algo que no sabemos.
    assert.equal(agruparRecibos([f(1, 2, "LICEFRED"), f(2, 1, "LICEFRED")])[0].esRecibo, false);
    const conRecibo = [{ ...f(1, 2, "GRAU", "2026-09-15"), recibo: true }, { ...f(2, 3, "GRAU", "2026-09-15"), recibo: true }];
    assert.equal(agruparRecibos(conRecibo)[0].esRecibo, true);
  });

  test("una sola factura se queda como factura, sin envoltura de grupo", () => {
    const g = agruparRecibos([f(1, 202, "MARISCOS GILMAR")]);
    assert.equal(g.length, 1);
    assert.equal(g[0].facturas, undefined, "no debería envolver una sola en un grupo");
    assert.equal(g[0].id, 1);
  });

  test("y dos proveedores distintos siguen siendo dos filas", () => {
    const g = agruparRecibos([f(1, 2, "LICEFRED"), f(2, 1, "LICEFRED"), f(3, 66, "TRANSGOURMET"), f(4, 605, "TRANSGOURMET")]);
    assert.equal(g.length, 2);
    assert.deepEqual(g.map((x) => x.total).sort((a, b) => a - b), [3, 671]);
  });

  test("dos empresas del grupo comprando al mismo proveedor no se mezclan", () => {
    // Son dos cuentas distintas: juntarlas diría que se paga una vez lo que se paga dos.
    const a = { ...f(1, 10, "GRAU"), empresa: "Del Amor Uriel SLU" };
    const b = { ...f(2, 20, "GRAU"), empresa: "Familia del Amor SL" };
    assert.equal(agruparRecibos([a, b]).length, 2);
  });
});

describe("las fechas de la pantalla de pagos se leen", () => {
  test("«Vence el 15 sep», no «Vence el 2026-09-15»", () => {
    // Una fecha en formato de base de datos, metida en una frase, hay que descifrarla; y esto
    // se lee de pasada, en una lista de veinte.
    assert.equal(estadoPago({ vencimiento: "2026-09-15" }, "2026-08-17").texto, "Vence el 15 sep");
  });

  test("y una fecha rota no rompe la frase", () => {
    assert.match(estadoPago({ vencimiento: "2026-09-15" }, "2026-08-17").texto, /^Vence el /);
  });
});
