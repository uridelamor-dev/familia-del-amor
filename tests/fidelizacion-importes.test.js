// La proyección de importes de una factura de prueba. Fase A: observación, nada más.
//
// PARA QUÉ EXISTE: hoy no sabemos qué campo de Ágora contiene el importe que de verdad se paga.
// La guía separa `Payments[].Tip` pero no dice si está dentro de `Totals[].GrossAmount`, y define
// `Amount` como la diferencia entre `PaidAmount` y `ChangeAmount`. Sin aclararlo no se puede
// calcular ni un punto. Esta herramienta enseña los campos tal como llegan para compararlos contra
// cinco facturas de importe conocido.
//
// LO QUE BLINDAN ESTOS TESTS es la propiedad que hace que mirar una factura sea seguro:
//
//   SE RECORRE LA LISTA DE RUTAS PERMITIDAS, NUNCA EL DOCUMENTO.
//
// Al revés —recorrer el JSON tapando lo sensible— un campo nuevo de Ágora aparecería solo el día
// que lo añadieran, y nadie se enteraría hasta verlo en pantalla.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { proyectarImportes, RUTAS, GLOBAL_ID_PISTA, PROHIBIDOS } from "../src/modules/fidelizacion/importes.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const modulo = readFileSync(new URL("../src/modules/fidelizacion/importes.js", import.meta.url), "utf8");
const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

const importes = server.slice(server.indexOf('app.get("/api/fidelizacion/facturas/:id/importes"'),
                              server.indexOf('app.post("/api/fidelizacion/facturas/purgar-cuerpos"'));
const marcar = server.slice(server.indexOf('app.post("/api/fidelizacion/facturas/:id/prueba"'),
                            server.indexOf('app.get("/api/fidelizacion/facturas/:id/importes"'));

/** Una factura con la forma de la guía Y con todo lo que NO puede salir metido dentro. */
const facturaConVeneno = () => ({
  DocumentType: "StandardInvoice",
  RefundSource: null,
  RelatedInvoice: { Serie: "A", Number: 1042, Fecha: "2026-09-14" },
  Workplace: { Id: "WP-7", Name: "La Tapeta - Lloret", Address: "Calle Falsa 1" },
  Pos: { Id: "POS-2", Name: "Barra" },
  Customer: { Id: 9, Name: "Marta Puig", Phone: "600111222", TaxId: "12345678Z", Email: "m@x.es" },
  User: { Id: 3, Name: "Camarero Pepe" },
  Notes: "sin gluten",
  ExtraInformation: { campana: "verano", loquesea: "x" },
  InvoiceItems: [{
    GlobalId: "GID-REAL-COMPLETO-0001",
    VatIncluded: true,
    Discounts: { DiscountRate: 0.1, CashDiscount: 2, Motivo: "fidelidad" },
    Totals: [{ GrossAmount: 30.0, NetAmount: 27.27, VatAmount: 2.73, Otro: 99 }],
    Lines: [
      { Index: 1, ProductId: "P-100", ProductName: "Café con leche", Quantity: 2, ProductPrice: 1.5,
        UnitPrice: 1.5, DiscountRate: 0, CashDiscount: 0, TotalAmount: 3.0, OfferId: null, OfferCode: null,
        LoyaltyProgram: { MemberId: "TOKEN-SECRETO-DEL-SOCIO", Rewards: [] }, Notes: "poco hecho" },
      { Index: 2, ProductId: "P-200", ProductName: "Bocadillo", Quantity: 1, ProductPrice: 27,
        UnitPrice: 27, DiscountRate: 0, CashDiscount: 0, TotalAmount: 27.0 },
    ],
  }],
  Payments: [{ MethodId: 1, Amount: 30, PaidAmount: 50, ChangeAmount: 20, Tip: 1.5, IsPrepayment: false, Titular: "Marta" }],
  Totals: [{ GrossAmount: 30.0, NetAmount: 27.27, VatAmount: 2.73 }],
});

describe("se recorre la LISTA, nunca el documento", () => {
  test("un campo desconocido de Ágora se OMITE, no se redacta", () => {
    // Redactar diría que ahí hay algo, y eso ya es información. Y sobre todo: un campo nuevo no
    // puede aparecer solo porque Ágora lo añada.
    const p = proyectarImportes({ ...facturaConVeneno(), CampoNuevoDeAgora: 42, OtroMas: { a: 1 } }, { hash });
    const txt = JSON.stringify(p);
    assert.ok(!txt.includes("CampoNuevoDeAgora"), txt.slice(0, 200));
    assert.ok(!txt.includes("OtroMas"));
    assert.ok(!/redactado|omitido|\[oculto\]/i.test(txt), "no debe dejar marcas de lo que había");
  });

  test("campos desconocidos DENTRO de objetos permitidos también se omiten", () => {
    const p = proyectarImportes(facturaConVeneno(), { hash });
    const txt = JSON.stringify(p);
    for (const intruso of ["Motivo", "Otro", "Titular", "Fecha"]) {
      assert.ok(!txt.includes(intruso), `se ha colado «${intruso}»: ${txt.slice(0, 300)}`);
    }
  });

  test("una ruta permitida que apunte a un objeto no saca sus hijos", () => {
    // Si `Workplace.Id` fuera un objeto, devolverlo expondría claves que no están en la lista.
    const p = proyectarImportes({ Workplace: { Id: { interno: "secreto" }, Name: "X" } }, { hash });
    assert.ok(!JSON.stringify(p).includes("secreto"));
    assert.equal(p.documento["Workplace.Name"], "X");
  });

  test("el módulo recorre RUTAS, no Object.keys del documento", () => {
    assert.match(modulo, /for \(const ruta of RUTAS\)/);
    assert.ok(!/Object\.keys\(json\)/.test(modulo), "recorre el documento");
  });
});

describe("nada sensible puede salir", () => {
  test("MemberId, Customer, User, teléfonos, notas, fiscales y ExtraInformation: ausentes", () => {
    const txt = JSON.stringify(proyectarImportes(facturaConVeneno(), { hash }));
    for (const secreto of ["TOKEN-SECRETO-DEL-SOCIO", "Marta", "600111222", "12345678Z", "m@x.es",
                           "Camarero Pepe", "sin gluten", "poco hecho", "Calle Falsa", "verano"]) {
      assert.ok(!txt.includes(secreto), `se ha filtrado «${secreto}»`);
    }
    for (const clave of PROHIBIDOS) assert.ok(!txt.includes(clave), `aparece la clave «${clave}»`);
  });

  test("`Pos` NO se incluye: Workplace es el local, Pos es el terminal", () => {
    const txt = JSON.stringify(proyectarImportes(facturaConVeneno(), { hash }));
    assert.ok(!txt.includes("POS-2"), txt.slice(0, 200));
    assert.ok(!RUTAS.some((r) => r.startsWith("Pos.")), "Pos ha entrado en la lista");
  });

  test("el GlobalId NUNCA sale entero: solo ocho caracteres de hash", () => {
    const p = proyectarImportes(facturaConVeneno(), { hash });
    const pista = p.comprobantes[0].GlobalId_pista;
    assert.equal(pista.length, 8);
    assert.equal(pista, hash("GID-REAL-COMPLETO-0001").slice(0, 8));
    assert.ok(!JSON.stringify(p).includes("GID-REAL"), "el GlobalId sale entero");
  });
});

describe("sí sale lo que hace falta para calibrar la fórmula", () => {
  const p = proyectarImportes(facturaConVeneno(), { hash });

  test("Workplace.Id y Workplace.Name, para diseñar el multilocal", () => {
    assert.equal(p.documento["Workplace.Id"], "WP-7");
    assert.equal(p.documento["Workplace.Name"], "La Tapeta - Lloret");
  });

  test("el documento y su devolución", () => {
    assert.equal(p.documento.DocumentType, "StandardInvoice");
    assert.equal(p.documento["RelatedInvoice.Serie"], "A");
    assert.equal(p.documento["RelatedInvoice.Number"], 1042);
  });

  test("los SEIS campos de pago, por separado", () => {
    // Van juntos y sin mezclar a propósito: `Amount` es `PaidAmount − ChangeAmount` según la guía,
    // y de `Tip` no sabemos si está dentro de los totales. Eso se decide mirando.
    assert.deepEqual(p.pagos[0], { MethodId: 1, Amount: 30, PaidAmount: 50, ChangeAmount: 20, Tip: 1.5, IsPrepayment: false });
  });

  test("los totales del documento y los del comprobante, separados", () => {
    assert.deepEqual(p.totales[0], { GrossAmount: 30.0, NetAmount: 27.27, VatAmount: 2.73 });
    assert.deepEqual(p.comprobantes[0].Totals[0], { GrossAmount: 30.0, NetAmount: 27.27, VatAmount: 2.73 });
  });

  test("las líneas, con ProductId y ProductName para reconocerlas", () => {
    assert.equal(p.comprobantes[0].Lines.length, 2);
    assert.equal(p.comprobantes[0].Lines[0].ProductId, "P-100");
    assert.equal(p.comprobantes[0].Lines[0].ProductName, "Café con leche");
    assert.equal(p.comprobantes[0].Lines[1].TotalAmount, 27.0);
  });

  test("los descuentos, a nivel de línea y de comprobante", () => {
    assert.deepEqual(p.comprobantes[0].Discounts, { DiscountRate: 0.1, CashDiscount: 2 });
    assert.equal(p.comprobantes[0].Lines[0].DiscountRate, 0);
  });

  test("dice qué rutas trae la factura y cuáles no", () => {
    // Es lo que contesta «¿este Ágora manda de verdad este campo?».
    assert.ok(p.rutas.encontradas.includes("Workplace.Id"));
    assert.ok(p.rutas.encontradas.includes("Payments[].Tip"));
    // Un `null` explícito NO es lo mismo que un campo que no viene: saber que este Ágora manda
    // `RefundSource: null` es justo el tipo de dato que se busca aquí.
    assert.equal(p.documento.RefundSource, null);
    assert.ok(p.rutas.encontradas.includes("RefundSource"), "un null sí viene");
    assert.deepEqual(p.rutas.ausentes, [], "esta factura de prueba las trae todas");

    // Y una a la que le faltan campos los enumera. Es lo que contesta «¿este Ágora manda Tip?».
    const pobre = proyectarImportes({ DocumentType: "X", Payments: [{ Amount: 1 }] }, { hash });
    assert.ok(pobre.rutas.ausentes.includes("Payments[].Tip"));
    assert.ok(pobre.rutas.ausentes.includes("Workplace.Id"));
    assert.deepEqual(pobre.rutas.encontradas, ["DocumentType", "Payments[].Amount"]);
    assert.equal(p.rutas.encontradas.length + p.rutas.ausentes.length, RUTAS.length);
  });

  test("varias líneas, varios comprobantes y varios pagos no se mezclan", () => {
    const f = { InvoiceItems: [
      { GlobalId: "A", Lines: [{ Index: 1, TotalAmount: 1 }, { Index: 2, TotalAmount: 2 }] },
      { GlobalId: "B", Lines: [{ Index: 1, TotalAmount: 3 }] }] ,
      Payments: [{ Amount: 1 }, { Amount: 2 }] };
    const r = proyectarImportes(f, { hash });
    assert.equal(r.comprobantes.length, 2);
    assert.equal(r.comprobantes[0].Lines.length, 2);
    assert.equal(r.comprobantes[1].Lines[0].TotalAmount, 3);
    assert.equal(r.pagos.length, 2);
    assert.notEqual(r.comprobantes[0].GlobalId_pista, r.comprobantes[1].GlobalId_pista);
  });

  test("una factura vacía o rara no revienta", () => {
    for (const raro of [{}, { InvoiceItems: [] }, { InvoiceItems: "no soy un array" }, { Payments: null }]) {
      const r = proyectarImportes(raro, { hash });
      assert.deepEqual(r.comprobantes, []);
      assert.deepEqual(r.pagos, []);
    }
  });
});

describe("la lista es CERRADA y coincide con la autorizada", () => {
  test("son exactamente las 33 rutas acordadas, ni una más", () => {
    const esperadas = [
      "DocumentType", "RefundSource", "RelatedInvoice.Serie", "RelatedInvoice.Number",
      "Workplace.Id", "Workplace.Name",
      "InvoiceItems[].VatIncluded", "InvoiceItems[].GlobalId",
      "InvoiceItems[].Discounts.DiscountRate", "InvoiceItems[].Discounts.CashDiscount",
      "InvoiceItems[].Totals[].GrossAmount", "InvoiceItems[].Totals[].NetAmount", "InvoiceItems[].Totals[].VatAmount",
      "InvoiceItems[].Lines[].Index", "InvoiceItems[].Lines[].ProductId", "InvoiceItems[].Lines[].ProductName",
      "InvoiceItems[].Lines[].Quantity", "InvoiceItems[].Lines[].ProductPrice", "InvoiceItems[].Lines[].UnitPrice",
      "InvoiceItems[].Lines[].DiscountRate", "InvoiceItems[].Lines[].CashDiscount", "InvoiceItems[].Lines[].TotalAmount",
      "InvoiceItems[].Lines[].OfferId", "InvoiceItems[].Lines[].OfferCode",
      "Payments[].MethodId", "Payments[].Amount", "Payments[].PaidAmount", "Payments[].ChangeAmount",
      "Payments[].Tip", "Payments[].IsPrepayment",
      "Totals[].GrossAmount", "Totals[].NetAmount", "Totals[].VatAmount",
    ];
    assert.deepEqual([...RUTAS].sort(), esperadas.sort());
    assert.equal(RUTAS.length, 33);
  });

  test("está congelada: no se le pueden añadir rutas en caliente", () => {
    assert.throws(() => { RUTAS.push("Customer.Phone"); }, TypeError);
  });

  test("el GlobalId está en la lista y marcado como pista", () => {
    assert.ok(RUTAS.includes(GLOBAL_ID_PISTA));
    assert.equal(GLOBAL_ID_PISTA, "InvoiceItems[].GlobalId");
  });
});

describe("el endpoint: solo Dirección y solo facturas de prueba", () => {
  test("solo Dirección, nunca Marketing", () => {
    assert.match(importes, /app\.get\("\/api\/fidelizacion\/facturas\/:id\/importes", requireAuth\(\["direccion"\]\)/);
    assert.ok(!/marketing/.test(importes));
    assert.match(marcar, /app\.post\("\/api\/fidelizacion\/facturas\/:id\/prueba", requireAuth\(\["direccion"\]\)/);
    assert.ok(!/marketing/.test(marcar), "Marketing no puede marcar una factura como prueba");
  });

  test("una factura NO marcada devuelve error controlado", () => {
    // Sin este candado, esto sería una ventana a los importes de cualquier cliente.
    assert.match(importes, /if \(!f\.es_prueba\) \{[\s\S]{0,240}res\.status\(403\)/);
    const i = importes.indexOf("if (!f.es_prueba)");
    assert.ok(importes.indexOf("leerSecreto(") > i, "se descifra antes de comprobar la marca");
  });

  test("cuerpo purgado, clave ausente y criptograma roto dan EXACTAMENTE la misma respuesta", () => {
    // Si el purgado dijera «ya no está guardado» y el fallo de descifrado dijera otra cosa, este
    // endpoint sería un detector del estado de `DATA_ENC_KEY`, preguntable factura a factura.
    const cuatrocientosNueve = [...importes.matchAll(/res\.status\(409\)\.json\(\{[^}]*\}\)/g)].map((m) => m[0]);
    assert.equal(cuatrocientosNueve.length, 1, "hay más de una salida 409, y por tanto se distinguen");
    assert.match(cuatrocientosNueve[0], /No se pudo leer el contenido de esta factura/);
    // Y no hay una rama aparte para el cuerpo ausente: se resuelve en la misma expresión.
    assert.ok(!/if \(!f\.cuerpo_enc\)/.test(importes), "el cuerpo purgado tiene su propia salida");
    assert.match(importes, /const plano = f\.cuerpo_enc \? leerSecreto\(/);
    // El motivo real diría algo del contenido o del estado de la clave.
    const i = importes.indexOf("No se pudo leer");
    assert.ok(!/DATA_ENC_KEY|kid|motivo|purgad|JSON/.test(importes.slice(i, i + 120)));
  });

  test("no-store en TODAS las salidas, también en las de error", () => {
    // Se pone antes de la primera rama, no pegado al `json()` del éxito: un 403 cacheado sigue
    // siendo la respuesta del servidor sobre una factura concreta.
    const cabecera = importes.indexOf('res.set("Cache-Control", "no-store")');
    assert.ok(cabecera > 0, "no se pone la cabecera");
    for (const salida of ["res.status(404)", "res.status(403)", "res.status(409)", "res.status(500)"]) {
      assert.ok(importes.indexOf(salida) > cabecera, `${salida} sale antes de la cabecera`);
    }
    assert.equal(importes.split('res.set("Cache-Control"').length - 1, 1, "se pone más de una vez");
  });

  test("cero escrituras: mirar una factura no cambia nada", () => {
    for (const escritura of ["dbRun(", "INSERT", "UPDATE", "ficAuditar("]) {
      assert.ok(!importes.includes(escritura), `el endpoint de importes escribe: ${escritura}`);
    }
  });

  test("no registra el contenido en ningún log ni en la auditoría", () => {
    assert.match(importes, /console\.error\(lineaErrorSql\("\[fidelizacion\] importes", e\)\)/);
    const logs = [...importes.matchAll(/console\.[a-z]+\(([^;]*)\);/g)].map((m) => m[1]);
    assert.equal(logs.length, 1, "solo puede haber un log, y es el del error");
    for (const l of logs) {
      for (const malo of ["json", "plano", "cuerpo_enc", "proyect", "f.cuerpo"]) {
        assert.ok(!l.includes(malo), `el log lleva el contenido: ${l}`);
      }
    }
  });

  test("el descifrado es en memoria y no se devuelve el cuerpo", () => {
    assert.match(importes, /leerSecreto\(f\.cuerpo_enc, DOMINIOS\.FIDELIZACION, "fid_facturas"\)/);
    assert.ok(!/cuerpo: /.test(importes), "devuelve el cuerpo");
    assert.ok(!/\?cuerpo=1|req\.query\.cuerpo/.test(importes));
  });
});

describe("marcar como prueba se audita, y solo con lo imprescindible", () => {
  test("la auditoría lleva id, antes y después. Nada más", () => {
    assert.match(marcar, /detalle: \{ factura_id: id, antes: !!antes\.es_prueba, despues: quiere \}/);
    for (const malo of ["cuerpo", "member", "global_id", "telefono", "nombre"]) {
      assert.ok(!new RegExp(`detalle:[^}]*${malo}`, "i").test(marcar), `la auditoría lleva ${malo}`);
    }
  });

  test("solo acepta true o false: nada de adivinar lo que parece verdad", () => {
    // `"false"`, `"no"`, `0`, `[]` y `{}` son todos ciertos para JavaScript. Con coerción, un
    // cliente que mandara `"false"` marcaría la factura como prueba creyendo lo contrario.
    assert.match(marcar, /const pedido = req\.body\?\.es_prueba;/);
    assert.match(marcar, /if \(pedido !== true && pedido !== false\) \{[\s\S]{0,160}res\.status\(400\)/);
    assert.ok(!/req\.body\?\.es_prueba \? true : false/.test(marcar), "sigue habiendo coerción");
    assert.ok(!/Boolean\(|!!req\.body/.test(marcar), "sigue habiendo coerción");
  });

  test("no toca ninguna otra columna de la factura", () => {
    const ups = [...marcar.matchAll(/UPDATE fid_facturas SET ([^`]*) WHERE/g)].map((m) => m[1]);
    assert.deepEqual(ups, ["es_prueba = ?"]);
  });

  test("no reescribe ni audita si no cambia nada", () => {
    assert.match(marcar, /if \(!!antes\.es_prueba === quiere\) return res\.json\(\{ ok: true, es_prueba: quiere, sin_cambios: true \}\)/);
  });

  test("el panel pide confirmación antes de marcar", () => {
    const f = panel.slice(panel.indexOf("async function fidPrueba("), panel.indexOf("async function fidImportes("));
    assert.match(f, /confirm\(/);
    assert.match(f, /nunca con una de un cliente real/);
  });
});

describe("el panel", () => {
  test("el botón de importes solo aparece si la factura está marcada", () => {
    const f = panel.slice(panel.indexOf("async function fidFacturas()"), panel.indexOf("async function fidFactura("));
    assert.match(f, /f\.es_prueba \? `<button[^`]*fid-importes/);
    assert.match(f, /f\.es_prueba \? "Quitar marca" : "Marcar como prueba"/);
  });

  test("dice claramente que NO se están calculando puntos", () => {
    assert.match(server, /aviso: "Observación\. No se está calculando ningún punto\."/);
    const f = panel.slice(panel.indexOf("async function fidImportes("), panel.indexOf("async function fidMiembro("));
    assert.match(f, /j\.aviso/);
    assert.match(f, /compararlos con el importe que esperabais/);
  });

  test("no vuelca el JSON completo", () => {
    const f = panel.slice(panel.indexOf("async function fidImportes("), panel.indexOf("async function fidMiembro("));
    assert.ok(!/JSON\.stringify\(j[,)]/.test(f), "vuelca la respuesta entera");
    assert.ok(!/<pre/.test(f), "pinta un volcado crudo");
  });
});

describe("la Fase A no toca NADA del flujo actual", () => {
  test("Rewards sigue siendo []", () => {
    const agora = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    assert.match(agora, /export const REWARDS_FASE_1 = Object\.freeze\(\[\]\)/);
    assert.match(agora, /Rewards: \[\.\.\.REWARDS_FASE_1\]/);
  });

  test("el manejador de facturas de Ágora no cambia", () => {
    const factura = server.slice(server.indexOf('app.post("/api/fidelizacion/agora/:token/factura"'),
                                 server.indexOf('app.post("/api/fidelizacion/integracion"'));
    assert.ok(!/es_prueba|importes|proyectar/i.test(factura), "la recepción de facturas se ha tocado");
    assert.match(factura, /fidRespuestaFactura\(\{\}\)/);
  });

  test("la migración es aditiva y no hay nada destructivo", () => {
    assert.match(esquema, /"es_prueba BOOLEAN NOT NULL DEFAULT FALSE"/);
    assert.match(esquema, /ALTER TABLE fid_facturas ADD COLUMN IF NOT EXISTS/);
    for (const peligro of ["TRUN" + "CATE", "DELETE " + "FROM", "DROP " + "TABLE"]) {
      assert.ok(!esquema.includes(peligro), `el esquema contiene ${peligro}`);
    }
  });

  test("no se ha colado nada de las fases futuras", () => {
    for (const futuro of ["puntos_pendientes", "motivo_pendiente", "workplace_id", "fid_premios",
                          "fid_reglas", "fid_productos", "export-master"]) {
      assert.ok(!server.includes(futuro), `Fase A incluye algo de una fase futura: ${futuro}`);
    }
  });
});
