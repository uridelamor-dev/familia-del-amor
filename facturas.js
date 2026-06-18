import Anthropic from "@anthropic-ai/sdk";

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const CABECERAS = [
  "Fecha", "N° Doc.", "Tipo", "Proveedor", "NIF / CIF",
  "Concepto", "Base Imponible", "% IVA", "Cuota IVA", "Total (€)",
  "Archivo Drive", "Procesado"
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
  "concepto": "string",
  "base_imponible": number,
  "porcentaje_iva": number,
  "cuota_iva": number,
  "total": number
}`;

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

async function findOrCreateFolder(token, nombre, parentId = null) {
  const q = `name = '${nombre.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    + (parentId ? ` and '${parentId}' in parents` : "");
  const files = await driveBuscar(token, q);
  if (files.length) return files[0].id;
  return driveCrearCarpeta(token, nombre, parentId);
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
  const body = {
    properties: { title: titulo },
    sheets: [{
      properties: { title: "Facturas" },
      data: [{
        rowData: [{
          values: CABECERAS.map(h => ({
            userEnteredValue: { stringValue: h },
            userEnteredFormat: { textFormat: { bold: true } }
          }))
        }]
      }]
    }]
  };
  const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: await driveHeaders(token),
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (data.error) throw new Error("Sheets crear: " + JSON.stringify(data.error));
  return { spreadsheetId: data.spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}` };
}

async function sheetsAñadirFila(token, spreadsheetId, fila) {
  const range = encodeURIComponent("Facturas!A1");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r = await fetch(url, {
    method: "POST",
    headers: await driveHeaders(token),
    body: JSON.stringify({ values: [fila] })
  });
  const data = await r.json();
  if (data.error) throw new Error("Sheets append: " + JSON.stringify(data.error));
  return data;
}

// ── Pipeline principal ──────────────────────────────────────────────────────

export async function procesarFactura({ buffer, mimeType, filename, local, caption, getToken, dbGet, dbRun }) {
  // 1. Extraer datos con Claude
  const datos = await extraerDatosDocumento(buffer, mimeType);
  console.log(`[Facturas] Datos extraídos para ${local}:`, JSON.stringify(datos));

  // 2. Obtener token de Drive
  const token = await getToken();

  // 3. Estructura de carpetas: Raíz → Mes → Local
  const cfgRaiz = await dbGet("SELECT value FROM config WHERE key = 'drive_facturas_root_id'");
  let rootId = cfgRaiz?.value;
  if (!rootId) {
    rootId = await findOrCreateFolder(token, "Familia del Amor · Facturas (TEST)");
    await dbRun("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('drive_facturas_root_id', ?, datetime('now'))", [rootId]);
    console.log(`[Facturas] Carpeta raíz creada en Drive: ${rootId}`);
  }

  const fechaDoc = datos.fecha ? new Date(datos.fecha + "T12:00:00") : new Date();
  const mesLabel = `${MESES_ES[fechaDoc.getMonth()]} ${fechaDoc.getFullYear()}`;
  const mesId = await findOrCreateFolder(token, mesLabel, rootId);
  const localId = await findOrCreateFolder(token, local, mesId);

  // 4. Subir archivo a Drive
  const ext = mimeType === "application/pdf" ? ".pdf"
    : mimeType.startsWith("image/png") ? ".png" : ".jpg";
  const proveedorSlug = (datos.proveedor || "doc").replace(/[^a-z0-9áéíóúüñ]/gi, "_").slice(0, 30);
  const driveFilename = `${datos.fecha || fechaDoc.toISOString().slice(0, 10)}_${proveedorSlug}_${datos.total ?? ""}€${ext}`;
  const driveFile = await driveSubirArchivo(token, localId, driveFilename, buffer, mimeType);
  console.log(`[Facturas] Archivo subido: ${driveFile.url}`);

  // 5. Buscar o crear Sheet del local
  const grupoRow = await dbGet("SELECT sheet_id, sheet_url FROM facturas_grupos WHERE local = ?", [local]);
  let sheetId = grupoRow?.sheet_id;
  let sheetUrl = grupoRow?.sheet_url;

  if (!sheetId) {
    const year = fechaDoc.getFullYear();
    const sheet = await sheetsCrear(token, `Facturas · ${local} · ${year}`);
    sheetId = sheet.spreadsheetId;
    sheetUrl = sheet.url;
    await dbRun(
      "UPDATE facturas_grupos SET sheet_id = ?, sheet_url = ? WHERE local = ?",
      [sheetId, sheetUrl, local]
    );
    console.log(`[Facturas] Sheet creado para ${local}: ${sheetUrl}`);
  }

  // 6. Añadir fila al Sheet
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
    driveFile.url,
    ahora
  ];
  await sheetsAñadirFila(token, sheetId, fila);

  // 7. Guardar en BD local
  await dbRun(
    `INSERT INTO facturas (local, tipo, fecha, numero_factura, proveedor, nif, concepto,
      base_imponible, porcentaje_iva, cuota_iva, total, drive_url, sheet_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [local, datos.tipo, datos.fecha, datos.numero_factura, datos.proveedor,
     datos.nif_proveedor, datos.concepto, datos.base_imponible, datos.porcentaje_iva,
     datos.cuota_iva, datos.total, driveFile.url, sheetId]
  );

  return { datos, driveUrl: driveFile.url, sheetUrl, sheetId };
}
