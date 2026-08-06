import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";

// Serializa el procesamiento de un MISMO archivo (por hash) para evitar duplicados por carrera:
// dos peticiones casi simultáneas del mismo documento pasaban ambas la comprobación de duplicado
// antes de que ninguna insertara. Con el cerrojo, la 2ª espera y entonces SÍ ve la fila de la 1ª.
// Servidor de un solo proceso (Replit) → Map en memoria es suficiente.
const _hashLocks = new Map();
async function withHashLock(hash, fn) {
  if (!hash) return fn();
  while (_hashLocks.get(hash)) { try { await _hashLocks.get(hash); } catch { /* noop */ } }
  let done; const gate = new Promise((r) => { done = r; });
  _hashLocks.set(hash, gate);
  try { return await fn(); } finally { _hashLocks.delete(hash); done(); }
}

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const CABECERAS = [
  "Fecha", "N° Documento", "Tipo", "Proveedor", "NIF / CIF Proveedor",
  "Concepto", "Base Imponible (€)", "Tipo IVA (%)", "Cuota IVA (€)", "Total (€)",
  "Canal", "Archivo Drive", "Registrado"
];

const PROMPT_EXTRACCION = `Analiza este documento (factura, albarán o ticket) y extrae los datos.
Devuelve ÚNICAMENTE un JSON válido, sin texto adicional, con esta estructura exacta
(usa null para los campos que no aparezcan):
{
  "tipo": "factura" | "albaran" | "ticket" | "otro",
  "fecha": "YYYY-MM-DD",
  "numero_factura": "string",
  "proveedor": "string",
  "nif_proveedor": "string",
  "nombre_receptor": "string",
  "nif_receptor": "string",
  "concepto": "string",
  "base_imponible": number,
  "porcentaje_iva": number,
  "cuota_iva": number,
  "total": number
}
En "nombre_receptor" y "nif_receptor" pon los datos de la empresa que RECIBE la factura (el cliente), no el proveedor.`;

// ── Utilidades de nombre y hash ────────────────────────────────────────────

function sanitizarNombre(str) {
  return (str || "").replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

function fechaCorta(fechaISO) {
  if (!fechaISO) return null;
  const p = fechaISO.split("-");
  if (p.length !== 3) return fechaISO;
  return `${p[2]}-${p[1]}-${p[0].slice(2)}`; // dd-mm-aa
}

function buildDriveFilename(datos, ext) {
  const proveedor = sanitizarNombre(datos.proveedor || "Desconocido");
  const fecha = fechaCorta(datos.fecha) || "sin-fecha";
  const num = sanitizarNombre(datos.numero_factura || "");
  return [proveedor, fecha, num].filter(Boolean).join(", ") + ext;
}

export class FacturaDuplicadaError extends Error {
  constructor(original, reason) {
    const desc = reason === "hash"
      ? "mismo archivo (hash idéntico)"
      : `${sanitizarNombre(original.proveedor)} · nº ${original.numero_factura}`;
    super(`Factura duplicada: ya existe ${desc}`);
    this.isDuplicate = true;
    this.original = original;
    this.reason = reason;
  }
}

// ── Claude: extracción de datos ────────────────────────────────────────────

export async function extraerDatosDocumento(buffer, mimeType) {
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = buffer.toString("base64");

  const isPdf = mimeType === "application/pdf";
  const adjunto = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image",    source: { type: "base64", media_type: mimeType, data: base64 } };

  const response = await ai.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: [adjunto, { type: "text", text: PROMPT_EXTRACCION }] }]
  });

  const text = response.content.find(b => b.type === "text")?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude no devolvió JSON válido: " + text.slice(0, 200));
  return JSON.parse(match[0]);
}

// ── Google Drive API (via fetch) ────────────────────────────────────────────

async function driveHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function driveBuscar(token, query) {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (data.error) throw new Error("Drive buscar: " + JSON.stringify(data.error));
  return data.files || [];
}

async function driveCrearCarpeta(token, nombre, parentId) {
  const body = {
    name: nombre,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {})
  };
  const r = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: await driveHeaders(token),
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (data.error) throw new Error("Drive crear carpeta: " + JSON.stringify(data.error));
  return data.id;
}

// Cache de promesas por clave "parentId|nombre" — evita race conditions y llamadas duplicadas
const _folderCache = new Map();

async function findOrCreateFolder(token, nombre, parentId = null) {
  const cacheKey = `${parentId || "root"}|${nombre}`;
  if (_folderCache.has(cacheKey)) return _folderCache.get(cacheKey);

  const promise = (async () => {
    const q = `name = '${nombre.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      + (parentId ? ` and '${parentId}' in parents` : "");
    const files = await driveBuscar(token, q);
    if (files.length) return files[0].id;
    return driveCrearCarpeta(token, nombre, parentId);
  })();

  _folderCache.set(cacheKey, promise);
  setTimeout(() => _folderCache.delete(cacheKey), 60000); // TTL 60s
  return promise;
}

async function driveSubirArchivo(token, folderId, filename, buffer, mimeType) {
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const boundary = "----FacturasBoundary";
  const crlf = "\r\n";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}${crlf}Content-Type: application/json; charset=UTF-8${crlf}${crlf}`),
    Buffer.from(metadata),
    Buffer.from(`${crlf}--${boundary}${crlf}Content-Type: ${mimeType}${crlf}${crlf}`),
    buffer,
    Buffer.from(`${crlf}--${boundary}--`)
  ]);

  const r = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    }
  );
  const data = await r.json();
  if (data.error) throw new Error("Drive subir archivo: " + JSON.stringify(data.error));
  return { id: data.id, url: data.webViewLink };
}

// ── Google Sheets API (via fetch) ───────────────────────────────────────────

async function sheetsCrear(token, titulo) {
  const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: await driveHeaders(token),
    body: JSON.stringify({
      properties: { title: titulo },
      sheets: [{ properties: { title: "RESUMEN" } }]
    })
  });
  const data = await r.json();
  if (data.error) throw new Error("Sheets crear: " + JSON.stringify(data.error));
  return { spreadsheetId: data.spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}` };
}

async function sheetsObtenerHojas(token, spreadsheetId) {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await r.json();
  if (data.error) throw new Error("Sheets obtener hojas: " + JSON.stringify(data.error));
  return (data.sheets || []).map(s => ({
    id: s.properties.sheetId,
    title: s.properties.title,
    index: s.properties.index
  }));
}

async function sheetsCrearHojaMes(token, spreadsheetId, mesLabel) {
  const addR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: await driveHeaders(token),
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: mesLabel } } }] })
  });
  const addData = await addR.json();
  if (addData.error) throw new Error("Sheets crear hoja mes: " + JSON.stringify(addData.error));
  const sheetId = addData.replies[0].addSheet.properties.sheetId;

  // Cabeceras en negrita con fondo gris
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: await driveHeaders(token),
    body: JSON.stringify({
      requests: [{
        updateCells: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: CABECERAS.length },
          rows: [{
            values: CABECERAS.map(h => ({
              userEnteredValue: { stringValue: h },
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.851, green: 0.851, blue: 0.851 }
              }
            }))
          }],
          fields: "userEnteredValue,userEnteredFormat"
        }
      }]
    })
  });

  return sheetId;
}

function parseMesLabelFecha(label) {
  const [mes, año] = label.split(" ");
  return new Date(parseInt(año), MESES_ES.indexOf(mes), 1);
}

async function sheetsActualizarResumen(token, spreadsheetId, mesesLabels) {
  const hojas = await sheetsObtenerHojas(token, spreadsheetId);
  const resumenHoja = hojas.find(h => h.title === "RESUMEN");
  let resumenSheetId;

  if (!resumenHoja) {
    const addR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: await driveHeaders(token),
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: "RESUMEN" } } }] })
    });
    const addData = await addR.json();
    if (addData.error) throw new Error("Sheets crear RESUMEN: " + JSON.stringify(addData.error));
    resumenSheetId = addData.replies[0].addSheet.properties.sheetId;
  } else {
    resumenSheetId = resumenHoja.id;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("RESUMEN!A1:Z1000")}:clear`,
      { method: "POST", headers: await driveHeaders(token), body: "{}" }
    );
  }

  // Col G=Base Imponible, I=Cuota IVA, J=Total, L=Archivo Drive (para contar documentos)
  // Filas: 1=título, 2=vacía, 3=cabeceras, 4..N=un mes, N+1=vacía, N+2=TOTAL
  const dataStartRow = 4;
  const dataEndRow = 3 + mesesLabels.length;
  const totalRowIdx0 = 4 + mesesLabels.length; // 0-indexed para batchUpdate
  const año = mesesLabels.length > 0 ? mesesLabels[mesesLabels.length - 1].split(" ")[1] : new Date().getFullYear();

  const values = [
    [`RESUMEN ANUAL ${año}`],
    [],
    ["Mes", "N° Documentos", "Base Imponible (€)", "Cuota IVA (€)", "Total (€)"],
    ...mesesLabels.map(mes => [
      mes,
      `=COUNTA('${mes}'!L2:L)`,
      `=SUMA('${mes}'!G2:G)`,
      `=SUMA('${mes}'!I2:I)`,
      `=SUMA('${mes}'!J2:J)`
    ]),
    [],
    [
      "TOTAL",
      `=SUMA(B${dataStartRow}:B${dataEndRow})`,
      `=SUMA(C${dataStartRow}:C${dataEndRow})`,
      `=SUMA(D${dataStartRow}:D${dataEndRow})`,
      `=SUMA(E${dataStartRow}:E${dataEndRow})`
    ]
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("RESUMEN!A1")}?valueInputOption=USER_ENTERED`,
    { method: "PUT", headers: await driveHeaders(token), body: JSON.stringify({ values }) }
  );

  // Formato: título grande, cabeceras en gris, fila TOTAL en negrita
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: await driveHeaders(token),
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId: resumenSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } },
            fields: "userEnteredFormat.textFormat"
          }
        },
        {
          repeatCell: {
            range: { sheetId: resumenSheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.851, green: 0.851, blue: 0.851 } } },
            fields: "userEnteredFormat"
          }
        },
        {
          repeatCell: {
            range: { sheetId: resumenSheetId, startRowIndex: totalRowIdx0, endRowIndex: totalRowIdx0 + 1, startColumnIndex: 0, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat"
          }
        }
      ]
    })
  });
}

async function sheetsAñadirFilaMes(token, spreadsheetId, fila, mesLabel) {
  const hojas = await sheetsObtenerHojas(token, spreadsheetId);
  const mesesExistentes = hojas.filter(h => h.title !== "RESUMEN");
  const mesExiste = mesesExistentes.find(h => h.title === mesLabel);

  if (!mesExiste) {
    await sheetsCrearHojaMes(token, spreadsheetId, mesLabel);
    const nuevosMeses = [...mesesExistentes.map(h => h.title), mesLabel]
      .sort((a, b) => parseMesLabelFecha(a) - parseMesLabelFecha(b));
    await sheetsActualizarResumen(token, spreadsheetId, nuevosMeses);
  }

  const range = encodeURIComponent(`'${mesLabel}'!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r = await fetch(url, {
    method: "POST",
    headers: await driveHeaders(token),
    body: JSON.stringify({ values: [fila] })
  });
  const data = await r.json();
  if (data.error) throw new Error("Sheets append mes: " + JSON.stringify(data.error));
  return data;
}

// ── Sheet MAESTRO consolidado (todas las facturas de todos los locales) ─────
const MASTER_CABECERAS = [
  "Fecha", "N° Documento", "Tipo", "Proveedor", "NIF / CIF", "Concepto",
  "Base Imponible (€)", "Tipo IVA (%)", "Cuota IVA (€)", "Total (€)",
  "Local", "Empresa", "Canal", "Archivo Drive", "Registrado"
];
async function cfgGet(dbGet, key) { const r = await dbGet("SELECT value FROM config WHERE key = ?", [key]); return r ? r.value : null; }
async function cfgSet(dbRun, key, value) { await dbRun("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value", [key, value]); }

async function ensureSheetMaestro(token, dbGet, dbRun) {
  let id = await cfgGet(dbGet, "drive_facturas_master_sheet_id");
  if (id) return id;
  const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST", headers: await driveHeaders(token),
    body: JSON.stringify({ properties: { title: "Facturas · TODAS (consolidado)" }, sheets: [{ properties: { title: "TODAS" } }] })
  });
  const data = await r.json();
  if (data.error) throw new Error("Master crear: " + JSON.stringify(data.error));
  id = data.spreadsheetId;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("TODAS!A1")}?valueInputOption=USER_ENTERED`,
    { method: "PUT", headers: await driveHeaders(token), body: JSON.stringify({ values: [MASTER_CABECERAS] }) });
  await cfgSet(dbRun, "drive_facturas_master_sheet_id", id);
  console.log(`[Facturas] Sheet maestro creado: https://docs.google.com/spreadsheets/d/${id}`);
  return id;
}

// Añade una fila al maestro (no fatal: si falla, no rompe la ingesta).
async function añadirFilaMaestro(token, dbGet, dbRun, fila) {
  const id = await ensureSheetMaestro(token, dbGet, dbRun);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("TODAS!A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", headers: await driveHeaders(token), body: JSON.stringify({ values: [fila] }) });
  return id;
}

function filaMaestroDeFactura(f) {
  return [f.fecha ?? "", f.numero_factura ?? "", f.tipo ?? "", f.proveedor ?? "", f.nif ?? "", f.concepto ?? "",
    f.base_imponible ?? "", f.porcentaje_iva ?? "", f.cuota_iva ?? "", f.total ?? "", f.local ?? "", f.empresa ?? "", "", f.drive_url ?? "", f.creado_en ?? ""];
}

// Reconstruye el maestro desde cero con todas las facturas ya registradas (one-shot).
export async function reconstruirSheetMaestro({ getToken, dbGet, dbAll, dbRun }) {
  const token = await getToken();
  const id = await ensureSheetMaestro(token, dbGet, dbRun);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("TODAS!A2:Z100000")}:clear`,
    { method: "POST", headers: await driveHeaders(token), body: "{}" });
  const rows = await dbAll("SELECT * FROM facturas ORDER BY fecha NULLS LAST, creado_en");
  const values = rows.map(filaMaestroDeFactura);
  if (values.length) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("TODAS!A2")}?valueInputOption=USER_ENTERED`,
      { method: "PUT", headers: await driveHeaders(token), body: JSON.stringify({ values }) });
  }
  return { total: values.length, sheetId: id, url: `https://docs.google.com/spreadsheets/d/${id}` };
}

// ── Sincronización SIN DERIVA: los Sheets son una proyección reconstruible de la BD ──
// (PURO/testeable) Etiqueta de mes de una fecha "YYYY-MM-DD" → "Mes AAAA" (español).
export function mesLabelDeFecha(fecha) {
  const d = fecha ? new Date(String(fecha).slice(0, 10) + "T12:00:00") : new Date();
  if (isNaN(d.getTime())) return null;
  return `${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
}
// (PURO/testeable) Fila de la pestaña del mes a partir de una factura de la BD (orden CABECERAS).
export function filaFacturaSheet(f) {
  return [
    f.fecha ?? "", f.numero_factura ?? "", f.tipo ?? "", f.proveedor ?? "", f.nif ?? "", f.concepto ?? "",
    f.base_imponible ?? "", f.porcentaje_iva ?? "", f.cuota_iva ?? "", f.total ?? "",
    f.canal ?? "", f.drive_url ?? "", f.creado_en ?? "",
  ];
}

// Reescribe COMPLETA la pestaña de un mes desde las filas dadas (idempotente).
async function sincronizarTabMes(token, spreadsheetId, mesLabel, filas) {
  const hojas = await sheetsObtenerHojas(token, spreadsheetId);
  const existe = hojas.find((h) => h.title === mesLabel);
  if (!existe) {
    if (!filas.length) return; // no hay nada para ese mes: no creamos pestaña vacía
    await sheetsCrearHojaMes(token, spreadsheetId, mesLabel);
    const meses = [...hojas.filter((h) => h.title !== "RESUMEN").map((h) => h.title), mesLabel].sort((a, b) => parseMesLabelFecha(a) - parseMesLabelFecha(b));
    await sheetsActualizarResumen(token, spreadsheetId, meses);
  }
  // Limpia las filas de datos (deja la cabecera A1) y reescribe desde A2.
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${mesLabel}'!A2:N100000`)}:clear`,
    { method: "POST", headers: await driveHeaders(token), body: "{}" });
  if (filas.length) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${mesLabel}'!A2`)}?valueInputOption=USER_ENTERED`,
      { method: "PUT", headers: await driveHeaders(token), body: JSON.stringify({ values: filas }) });
  }
}

// Re-proyecta a los Sheets la pestaña (local_contable, mes) afectada por un cambio + el maestro.
export async function resincronizarSheetsFactura({ getToken, dbGet, dbAll, dbRun }, local, fecha) {
  if (!local || !fecha) return;
  const mesLabel = mesLabelDeFecha(fecha);
  if (!mesLabel) return;
  const token = await getToken();
  const localRow = await dbGet("SELECT local_contable FROM facturas_locales WHERE local = ?", [local]);
  const localContable = localRow?.local_contable || local;
  const grupo = await dbGet("SELECT sheet_id FROM facturas_grupos WHERE local = ?", [localContable]);
  if (grupo?.sheet_id) {
    const rows = await dbAll("SELECT f.* FROM facturas f LEFT JOIN facturas_locales fl ON fl.local = f.local WHERE COALESCE(fl.local_contable, f.local) = ?", [localContable]);
    const filas = (rows || []).filter((r) => r.fecha && mesLabelDeFecha(r.fecha) === mesLabel).map(filaFacturaSheet);
    await sincronizarTabMes(token, grupo.sheet_id, mesLabel, filas);
  }
  // El maestro se reconstruye entero desde la BD (barato y a prueba de deriva).
  try { await reconstruirSheetMaestro({ getToken, dbGet, dbAll, dbRun }); } catch (e) { console.error("[Sync] maestro:", e.message); }
}

// "Verificar y reparar": reescribe TODAS las pestañas (local_contable, mes) desde la BD + maestro.
export async function repararTodosLosSheets({ getToken, dbGet, dbAll, dbRun }) {
  const token = await getToken();
  const rows = await dbAll("SELECT f.*, COALESCE(fl.local_contable, f.local) AS lc FROM facturas f LEFT JOIN facturas_locales fl ON fl.local = f.local WHERE f.fecha IS NOT NULL");
  const grupos = {};
  for (const r of rows || []) {
    const mes = mesLabelDeFecha(r.fecha); if (!mes) continue;
    const key = r.lc + "||" + mes;
    (grupos[key] = grupos[key] || { lc: r.lc, mes, filas: [] }).filas.push(filaFacturaSheet(r));
  }
  const sheetCache = {}; let tabs = 0;
  for (const key of Object.keys(grupos)) {
    const g = grupos[key];
    if (sheetCache[g.lc] === undefined) { const gr = await dbGet("SELECT sheet_id FROM facturas_grupos WHERE local = ?", [g.lc]); sheetCache[g.lc] = gr?.sheet_id || null; }
    const sid = sheetCache[g.lc]; if (!sid) continue;
    try { await sincronizarTabMes(token, sid, g.mes, g.filas); tabs++; } catch (e) { console.error("[Reparar]", g.lc, g.mes, e.message); }
  }
  const master = await reconstruirSheetMaestro({ getToken, dbGet, dbAll, dbRun });
  return { tabs, maestro: master.total };
}

// ── Pipeline principal ──────────────────────────────────────────────────────

export async function procesarFactura({ buffer, mimeType, filename, local, caption, canal = "WhatsApp", getToken, dbGet, dbRun, backupFn }) {
  // 1. Hash para detección de duplicados
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  // Serializado por hash: dedup + subida + insert de un mismo archivo son atómicos frente a carreras.
  return withHashLock(fileHash, async () => {

  // 2. Extraer datos con Claude
  const datos = await extraerDatosDocumento(buffer, mimeType);
  console.log(`[Facturas] Datos extraídos para ${local}:`, JSON.stringify(datos));

  // 3. Comprobar duplicados antes de subir nada (facturas procesadas y pendientes)
  const hashDupe = await dbGet("SELECT id, proveedor, numero_factura, fecha, drive_url FROM facturas WHERE file_hash = ?", [fileHash])
                || await dbGet("SELECT id, proveedor, numero_factura, fecha, drive_url FROM facturas_pendientes WHERE file_hash = ?", [fileHash]);
  if (hashDupe) throw new FacturaDuplicadaError(hashDupe, "hash");

  if (datos.proveedor && datos.numero_factura) {
    const dataDupe = await dbGet(
      "SELECT id, proveedor, numero_factura, fecha, drive_url FROM facturas WHERE LOWER(proveedor) = LOWER(?) AND numero_factura = ?",
      [datos.proveedor, datos.numero_factura]
    );
    if (dataDupe) throw new FacturaDuplicadaError(dataDupe, "numero_factura");
  }

  // 4. Obtener token de Drive y empresa del local
  const token = await getToken();
  const localRow = await dbGet("SELECT empresa, cif, local_contable FROM facturas_locales WHERE local = ?", [local]);
  const empresa = localRow?.empresa || "Sin empresa asignada";
  const localContable = localRow?.local_contable || local; // nombre unificado para Drive/Sheets

  // 5. Estructura de carpetas: Raíz → Empresa → Local → Mes
  const cfgRaiz = await dbGet("SELECT value FROM config WHERE key = 'drive_facturas_root_id'");
  let rootId = cfgRaiz?.value;
  if (!rootId) {
    rootId = await findOrCreateFolder(token, "Contabilidad");
    await dbRun("INSERT INTO config (key, value, updated_at) VALUES ('drive_facturas_root_id', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at", [rootId]);
    console.log(`[Facturas] Carpeta raíz creada en Drive: ${rootId}`);
  }

  const fechaDoc = datos.fecha ? new Date(datos.fecha + "T12:00:00") : new Date();
  const mesLabel = `${MESES_ES[fechaDoc.getMonth()]} ${fechaDoc.getFullYear()}`;
  const empresaId = await findOrCreateFolder(token, empresa, rootId);
  const localId   = await findOrCreateFolder(token, localContable, empresaId);
  const mesId     = await findOrCreateFolder(token, mesLabel, localId);

  // 6. Subir archivo a Drive con nuevo formato de nombre
  const ext = mimeType === "application/pdf" ? ".pdf"
    : mimeType.startsWith("image/png") ? ".png" : ".jpg";
  const driveFilename = buildDriveFilename(datos, ext);
  const driveFile = await driveSubirArchivo(token, mesId, driveFilename, buffer, mimeType);
  console.log(`[Facturas] Archivo subido: ${driveFile.url}`);

  // 7. Buscar o crear Sheet del local (INSERT OR IGNORE para emails sin grupo WA)
  const grupoRow = await dbGet("SELECT sheet_id, sheet_url FROM facturas_grupos WHERE local = ?", [localContable]);
  let sheetId = grupoRow?.sheet_id;
  let sheetUrl = grupoRow?.sheet_url;

  if (!sheetId) {
    const year = fechaDoc.getFullYear();
    const sheet = await sheetsCrear(token, `Facturas · ${local} · ${year}`);
    sheetId = sheet.spreadsheetId;
    sheetUrl = sheet.url;
    if (grupoRow) {
      await dbRun("UPDATE facturas_grupos SET sheet_id = ?, sheet_url = ? WHERE local = ?", [sheetId, sheetUrl, localContable]);
    } else {
      await dbRun(
        `INSERT INTO facturas_grupos (local, group_jid, sheet_id, sheet_url) VALUES (?, ?, ?, ?)
         ON CONFLICT(group_jid) DO UPDATE SET sheet_id = excluded.sheet_id, sheet_url = excluded.sheet_url`,
        [localContable, `__email__:${localContable}`, sheetId, sheetUrl]
      );
    }
    console.log(`[Facturas] Sheet creado para ${local}: ${sheetUrl}`);
    if (backupFn) backupFn();
  }

  // 8. Añadir fila al Sheet en la pestaña del mes correspondiente
  const ahora = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  const fila = [
    datos.fecha ?? "",
    datos.numero_factura ?? "",
    datos.tipo ?? "",
    datos.proveedor ?? "",
    datos.nif_proveedor ?? "",
    datos.concepto ?? "",
    datos.base_imponible ?? "",
    datos.porcentaje_iva ?? "",
    datos.cuota_iva ?? "",
    datos.total ?? "",
    canal,
    driveFile.url,
    ahora
  ];
  await sheetsAñadirFilaMes(token, sheetId, fila, mesLabel);

  // 8b. Añadir también al Sheet MAESTRO consolidado (no fatal).
  try {
    await añadirFilaMaestro(token, dbGet, dbRun, [
      datos.fecha ?? "", datos.numero_factura ?? "", datos.tipo ?? "", datos.proveedor ?? "", datos.nif_proveedor ?? "",
      datos.concepto ?? "", datos.base_imponible ?? "", datos.porcentaje_iva ?? "", datos.cuota_iva ?? "", datos.total ?? "",
      local, empresa, canal, driveFile.url, ahora
    ]);
  } catch (e) { console.error("[Facturas] Sheet maestro:", e.message); }

  // 9. Guardar en BD local con hash y empresa
  await dbRun(
    `INSERT INTO facturas (local, empresa, tipo, fecha, numero_factura, proveedor, nif, concepto,
      base_imponible, porcentaje_iva, cuota_iva, total, drive_url, sheet_id, file_hash, canal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [local, empresa, datos.tipo, datos.fecha, datos.numero_factura, datos.proveedor,
     datos.nif_proveedor, datos.concepto, datos.base_imponible, datos.porcentaje_iva,
     datos.cuota_iva, datos.total, driveFile.url, sheetId, fileHash, canal]
  );

  return { datos, empresa, driveUrl: driveFile.url, sheetUrl, sheetId };
  }); // withHashLock
}

// ── Migración retroactiva a estructura Raíz→Empresa→Local→Mes ──────────────

function extractDriveFileId(url) {
  const m = (url || "").match(/(?:file\/d\/|id=)([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function migrarEstructuraDrive({ getToken, dbAll, dbGet }) {
  const token = await getToken();

  const cfgRaiz = await dbGet("SELECT value FROM config WHERE key = 'drive_facturas_root_id'");
  if (!cfgRaiz?.value) throw new Error("Sin carpeta raíz configurada en Drive");
  const rootId = cfgRaiz.value;

  const facturas = await dbAll("SELECT * FROM facturas WHERE drive_url IS NOT NULL ORDER BY id", []);
  const res = { movidos: 0, omitidos: 0, errores: [], total: facturas.length };

  for (const f of facturas) {
    const fileId = extractDriveFileId(f.drive_url);
    if (!fileId) { res.omitidos++; continue; }

    try {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const meta = await metaRes.json();
      if (meta.error) { res.errores.push(`#${f.id}: ${meta.error.message}`); continue; }

      const oldParentId = meta.parents?.[0];

      // Nueva ruta: Raíz → Empresa → Local → Mes
      const localRow = await dbGet("SELECT empresa, local_contable FROM facturas_locales WHERE local = ?", [f.local]);
      const empresa = f.empresa || localRow?.empresa || "Sin empresa asignada";
      const localContable = localRow?.local_contable || f.local;
      const fechaDoc = f.fecha ? new Date(f.fecha + "T12:00:00") : new Date(f.creado_en);
      const mesLabel = `${MESES_ES[fechaDoc.getMonth()]} ${fechaDoc.getFullYear()}`;
      const empresaId = await findOrCreateFolder(token, empresa, rootId);
      const localId   = await findOrCreateFolder(token, localContable, empresaId);
      const mesId     = await findOrCreateFolder(token, mesLabel, localId);

      if (oldParentId === mesId) { res.omitidos++; continue; }

      const moveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${mesId}&removeParents=${oldParentId}&fields=id`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}"
        }
      );
      const moveData = await moveRes.json();
      if (moveData.error) {
        res.errores.push(`#${f.id} (${f.proveedor || "?"}): ${moveData.error.message}`);
      } else {
        res.movidos++;
        console.log(`[Migración] Movido: ${meta.name} → ${empresa}/${f.local}/${mesLabel}`);
      }
    } catch (err) {
      res.errores.push(`#${f.id}: ${err.message}`);
    }
  }

  return res;
}

// ── Procesado de facturas sin local conocido (entrada por email sin regla) ──

function normalizarNif(nif) {
  return (nif || "").replace(/[\s\-\.]/g, "").toUpperCase();
}

export async function procesarFacturaSinLocal({ buffer, mimeType, filename, origen, getToken, dbGet, dbAll, dbRun }) {
  // 1. Hash duplicados (facturas procesadas y pendientes)
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const hashDupe = await dbGet("SELECT id, proveedor, numero_factura, fecha FROM facturas WHERE file_hash = ?", [fileHash])
                || await dbGet("SELECT id, proveedor, numero_factura, fecha FROM facturas_pendientes WHERE file_hash = ?", [fileHash]);
  if (hashDupe) throw new FacturaDuplicadaError(hashDupe, "hash");

  // 2. Extraer datos con Claude (incluye nif_receptor)
  const datos = await extraerDatosDocumento(buffer, mimeType);
  console.log(`[Facturas] Email sin local — datos extraídos:`, JSON.stringify(datos));

  // 3. Intentar auto-detectar empresa y local por nif_receptor
  let empresa = "Sin empresa asignada";
  let localAutodetectado = null;

  if (datos.nif_receptor) {
    const nifNorm = normalizarNif(datos.nif_receptor);
    const localesMatch = await dbAll(
      "SELECT local, empresa, local_contable FROM facturas_locales WHERE REPLACE(REPLACE(UPPER(cif),' ',''),'-','') = ?",
      [nifNorm]
    );
    if (localesMatch.length === 1) {
      // NIF coincide con exactamente 1 local → asignación automática
      empresa = localesMatch[0].empresa;
      localAutodetectado = localesMatch[0].local_contable || localesMatch[0].local;
      console.log(`[Facturas] NIF ${datos.nif_receptor} → auto-detectado: ${empresa} / ${localAutodetectado}`);
    } else if (localesMatch.length > 1) {
      // NIF coincide con varios locales (misma empresa) → detectamos empresa, local ambiguo
      empresa = localesMatch[0].empresa;
      console.log(`[Facturas] NIF ${datos.nif_receptor} → empresa detectada: ${empresa} (local ambiguo)`);
    }
  }

  // 4. Si detectamos el local únicamente → procesar normalmente
  if (localAutodetectado) {
    return procesarFactura({ buffer, mimeType, filename, local: localAutodetectado, caption: "Email auto-detectado", canal: "Email", getToken, dbGet, dbAll: dbAll, dbRun });
  }

  // 5. No se pudo determinar el local → subir a _Por asignar y guardar como pendiente
  const token = await getToken();
  const cfgRaiz = await dbGet("SELECT value FROM config WHERE key = 'drive_facturas_root_id'");
  let rootId = cfgRaiz?.value;
  if (!rootId) {
    rootId = await findOrCreateFolder(token, "Contabilidad");
    await dbRun("INSERT INTO config (key, value, updated_at) VALUES ('drive_facturas_root_id', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at", [rootId]);
  }

  const empresaId  = await findOrCreateFolder(token, empresa, rootId);
  const pendId     = await findOrCreateFolder(token, "_Por asignar", empresaId);
  const ext = mimeType === "application/pdf" ? ".pdf" : mimeType.startsWith("image/png") ? ".png" : ".jpg";
  const driveFile  = await driveSubirArchivo(token, pendId, buildDriveFilename(datos, ext), buffer, mimeType);

  await dbRun(
    `INSERT INTO facturas_pendientes
      (empresa_detectada, nif_receptor, nombre_receptor, tipo, fecha, numero_factura, proveedor, nif,
       concepto, base_imponible, porcentaje_iva, cuota_iva, total, drive_url, drive_file_id, file_hash, origen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [empresa, datos.nif_receptor, datos.nombre_receptor, datos.tipo, datos.fecha, datos.numero_factura,
     datos.proveedor, datos.nif_proveedor, datos.concepto, datos.base_imponible, datos.porcentaje_iva,
     datos.cuota_iva, datos.total, driveFile.url, driveFile.id, fileHash, origen || "email"]
  );

  console.log(`[Facturas] Guardada como pendiente: ${datos.proveedor} → ${empresa}/_Por asignar`);
  return { datos, empresa, pendiente: true, driveUrl: driveFile.url };
}

// ── Asignación manual de una factura pendiente ──────────────────────────────

export async function asignarFacturaPendiente({ pendiente, local, getToken, dbGet, dbAll, dbRun, backupFn }) {
  const token = await getToken();

  const localRow = await dbGet("SELECT empresa, local_contable FROM facturas_locales WHERE local = ?", [local]);
  const empresa = localRow?.empresa || "Sin empresa asignada";
  const localContable = localRow?.local_contable || local;

  // Obtener carpeta padre actual del archivo en Drive
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${pendiente.drive_file_id}?fields=parents`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const oldParent = meta.parents?.[0];

  // Crear carpeta destino: Raíz → Empresa → Local → Mes
  const cfgRaiz = await dbGet("SELECT value FROM config WHERE key = 'drive_facturas_root_id'");
  const rootId = cfgRaiz?.value;
  const fechaDoc = pendiente.fecha ? new Date(pendiente.fecha + "T12:00:00") : new Date(pendiente.creado_en);
  const mesLabel = `${MESES_ES[fechaDoc.getMonth()]} ${fechaDoc.getFullYear()}`;
  const empresaId = await findOrCreateFolder(token, empresa, rootId);
  const localId   = await findOrCreateFolder(token, localContable, empresaId);
  const mesId     = await findOrCreateFolder(token, mesLabel, localId);

  // Mover archivo
  const moveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${pendiente.drive_file_id}?addParents=${mesId}&removeParents=${oldParent}&fields=id,webViewLink`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" }
  );
  const moveData = await moveRes.json();
  if (moveData.error) throw new Error("Error moviendo archivo en Drive: " + moveData.error.message);
  const driveUrl = moveData.webViewLink || pendiente.drive_url;

  // Buscar o crear Sheet del local
  const grupoRow = await dbGet("SELECT sheet_id, sheet_url FROM facturas_grupos WHERE local = ?", [localContable]);
  let sheetId = grupoRow?.sheet_id;
  let sheetUrl = grupoRow?.sheet_url;
  if (!sheetId) {
    const sheet = await sheetsCrear(token, `Facturas · ${localContable} · ${fechaDoc.getFullYear()}`);
    sheetId = sheet.spreadsheetId;
    sheetUrl = sheet.url;
    if (grupoRow) {
      await dbRun("UPDATE facturas_grupos SET sheet_id = ?, sheet_url = ? WHERE local = ?", [sheetId, sheetUrl, localContable]);
    } else {
      await dbRun(
        `INSERT INTO facturas_grupos (local, group_jid, sheet_id, sheet_url) VALUES (?, ?, ?, ?)
         ON CONFLICT(group_jid) DO UPDATE SET sheet_id = excluded.sheet_id, sheet_url = excluded.sheet_url`,
        [localContable, `__email__:${localContable}`, sheetId, sheetUrl]
      );
    }
    if (backupFn) backupFn();
  }

  // Añadir fila al Sheet en la pestaña del mes correspondiente
  const ahora = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  const canal = pendiente.origen === "email" ? "Email" : "WhatsApp";
  const filaAsignada = [
    pendiente.fecha ?? "", pendiente.numero_factura ?? "", pendiente.tipo ?? "",
    pendiente.proveedor ?? "", pendiente.nif ?? "", pendiente.concepto ?? "",
    pendiente.base_imponible ?? "", pendiente.porcentaje_iva ?? "",
    pendiente.cuota_iva ?? "", pendiente.total ?? "", canal, driveUrl, ahora
  ];
  await sheetsAñadirFilaMes(token, sheetId, filaAsignada, mesLabel);

  // Pasar de pendientes a facturas
  await dbRun(
    `INSERT INTO facturas (local, empresa, tipo, fecha, numero_factura, proveedor, nif, concepto,
       base_imponible, porcentaje_iva, cuota_iva, total, drive_url, sheet_id, file_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [localContable, empresa, pendiente.tipo, pendiente.fecha, pendiente.numero_factura,
     pendiente.proveedor, pendiente.nif, pendiente.concepto, pendiente.base_imponible,
     pendiente.porcentaje_iva, pendiente.cuota_iva, pendiente.total, driveUrl, sheetId, pendiente.file_hash]
  );
  await dbRun("DELETE FROM facturas_pendientes WHERE id = ?", [pendiente.id]);

  return { driveUrl, sheetUrl, sheetId };
}
