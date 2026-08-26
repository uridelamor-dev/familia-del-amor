import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { procesarFactura } from "../facturas.js";

// EL TEST QUE FALTABA, y por eso esto pudo pasar: ningún test ejecutaba `procesarFactura`. Todos
// eran de módulos puros o leían el código como texto. Un `ReferenceError` colado entre el INSERT
// y el detalle estuvo NUEVE DÍAS rompiendo cada factura que entraba —por WhatsApp, por correo,
// por Drive y a mano— sin que nada saltara: el archivo subía a Drive, la fila se guardaba, y
// justo después la función se caía. Quien la mandaba veía «no he podido procesar el documento»
// aunque sí había entrado, y se quedaba sin detalle de líneas y sin volcar al Sheet.
//
// Esto recorre el alta ENTERA con la base, Drive, Sheets y la lectura simulados. No comprueba
// reglas de negocio —para eso están los módulos puros—: comprueba que el camino llega al final.

const LOCAL = "La Tapeta - Blanes";
const DATOS = {
  tipo: "factura", fecha: "2026-08-20", vencimiento: null, numero_factura: "2026/00418",
  proveedor: "Distribucions Prova SL", nif_proveedor: "B12345678",
  nombre_receptor: "Mateu del Amor SL", nif_receptor: "B99999999", local_receptor: null,
  concepto: "Bebidas", base_imponible: 100, porcentaje_iva: 21, cuota_iva: 21, total: 121,
  lineas: [{ descripcion: "Agua 1,5L", cantidad: 10, unidad: "ud", precio_unitario: 6, importe: 60, descuento_pct: null, importe_neto: null },
           { descripcion: "Cerveza 33cl", cantidad: 10, unidad: "ud", precio_unitario: 4, importe: 40, descuento_pct: null, importe_neto: null }],
};

// ── Una base de mentira que solo sabe lo justo ───────────────────────────────
function baseFalsa() {
  const filas = { facturas: [], lineas: [] };
  let sig = 1;
  const dbGet = async (sql) => {
    if (/FROM facturas_locales/.test(sql)) return { empresa: "Mateu del Amor SL", local_contable: LOCAL, cif: "B99999999" };
    if (/FROM facturas_grupos/.test(sql)) return { sheet_id: "sheet-1", sheet_url: "https://sheet" };
    return null;                       // sin duplicados, sin condiciones de pago, sin alias
  };
  const dbAll = async () => [];
  const dbRun = async (sql, params = []) => {
    if (/INSERT INTO facturas /.test(sql)) { const id = sig++; filas.facturas.push({ id, params }); return { id }; }
    if (/INSERT INTO factura_lineas|INSERT INTO facturas_lineas/i.test(sql)) { filas.lineas.push(params); return { id: sig++ }; }
    return {};
  };
  return { filas, dbGet, dbAll, dbRun };
}

// ── Google, simulado: crear carpetas, subir y escribir en la hoja ────────────
let fetchReal;
before(() => {
  fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    const ok = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (/drive\/v3\/files\?/.test(u) && (!opt.method || opt.method === "GET")) return ok({ files: [] });
    if (/upload\/drive\/v3\/files/.test(u)) return ok({ id: "file-1", webViewLink: "https://drive.google.com/file/d/file-1/view" });
    if (/drive\/v3\/files/.test(u)) return ok({ id: "folder-" + Math.abs(u.length), webViewLink: "https://drive/x" });
    if (/spreadsheets/.test(u)) return ok({ spreadsheetId: "sheet-1", spreadsheetUrl: "https://sheet", sheets: [{ properties: { title: "Agosto 2026" } }], values: [] });
    return ok({});
  };
});
after(() => { globalThis.fetch = fetchReal; });

const alta = (extra = {}) => {
  const { filas, dbGet, dbAll, dbRun } = baseFalsa();
  return { filas, correr: () => procesarFactura({
    buffer: Buffer.from("un pdf de mentira"), mimeType: "application/pdf",
    filename: "factura.pdf", local: LOCAL, canal: "Manual",
    getToken: async () => "token-de-mentira", dbGet, dbAll, dbRun, backupFn: null,
    leerDocumento: async () => JSON.parse(JSON.stringify(DATOS)),
    ...extra,
  }) };
};

describe("dar de alta una factura llega hasta el final", () => {
  test("no se cae por el camino", async () => {
    // La comprobación de fondo: que la función RETORNE. Cuando `reparto` no estaba definida,
    // esto lanzaba `ReferenceError` justo después de guardar la fila.
    const { correr } = alta();
    const r = await correr();
    assert.ok(r, "no ha devuelto nada");
    assert.ok(r.driveUrl, "no ha subido el archivo");
    assert.equal(r.datos.numero_factura, "2026/00418");
  });

  test("la factura queda guardada", async () => {
    const { filas, correr } = alta();
    await correr();
    assert.equal(filas.facturas.length, 1);
    assert.ok(filas.facturas[0].params.includes(LOCAL), "no se ha guardado con su local");
  });

  test("Y EL DETALLE DE LÍNEAS TAMBIÉN", async () => {
    // Es lo que se perdía: el bloque roto caía ENTRE el alta y el guardado del detalle, así que
    // la factura entraba sin desglose y «Qué compramos» se quedaba vacío sin que nadie supiera
    // por qué. Que la fila exista no basta para dar el alta por buena.
    const { filas, correr } = alta();
    await correr();
    assert.ok(filas.lineas.length >= 1, "la factura ha entrado sin su detalle");
  });

  test("y si el Sheet falla, la factura entra igual", async () => {
    // La BD es la fuente de verdad y el Sheet una proyección: un fallo de Google no puede
    // costar una factura. Lo recoge el reintento de los diez minutos.
    const previo = globalThis.fetch;
    globalThis.fetch = async (url, opt) => (/spreadsheets/.test(String(url))
      ? { ok: false, status: 500, json: async () => ({ error: { message: "Google caído" } }), text: async () => "500" }
      : previo(url, opt));
    try {
      const { filas, correr } = alta();
      const r = await correr();
      assert.ok(r, "un fallo del Sheet no puede tumbar el alta");
      assert.equal(filas.facturas.length, 1);
    } finally { globalThis.fetch = previo; }
  });

  test("un local que no existe se rechaza ANTES de tocar nada", async () => {
    const { filas, correr } = alta({ local: "Bar Pepe" });
    await assert.rejects(correr, /no es ningún establecimiento/);
    assert.equal(filas.facturas.length, 0, "no puede haber quedado nada guardado");
  });
});

describe("el bloque de «gasto de empresa» está en su función", () => {
  test("`reparto` solo se usa donde se recibe", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../facturas.js", import.meta.url), "utf8");
    const iProc = src.indexOf("export async function procesarFactura(");
    const iAsig = src.indexOf("export async function asignarFacturaPendiente(");
    assert.ok(iProc > 0 && iAsig > iProc);
    // Hasta el final de SU cuerpo: la documentación de `asignarFacturaPendiente` habla de
    // `reparto` con toda la razón, y recortar hasta su firma se la llevaría por delante.
    const fin = src.indexOf("// ── Migración retroactiva", iProc);
    assert.ok(fin > iProc, "no se encuentra el final de procesarFactura");
    const cuerpoProc = src.slice(iProc, fin);
    assert.ok(!/\breparto\b/.test(cuerpoProc),
      "`reparto` no es parámetro de procesarFactura: usarlo ahí es un ReferenceError en cada alta");
    assert.match(src.slice(iAsig), /if \(reparto === "empresa" && facturaId\)/);
  });
});
