import Anthropic from "@anthropic-ai/sdk";
import { normalizarLineas, validarSuma, mensajeValidacion, claveProducto } from "./src/modules/facturas/lineas.js";
import { canonizarLocal, esLocalCanonico } from "./src/modules/facturas/local-canonico.js";
import { claveProveedor, seLeenLineas, nombreCanonico } from "./src/modules/facturas/categorias.js";
import { buscarParecida, resumenMotivos } from "./src/modules/facturas/duplicados.js";
import { corregirEmisorReceptor } from "./src/modules/facturas/emisor.js";
import { revisarCoherencia, textosDe } from "./src/modules/facturas/coherencia.js";
import { createHash } from "crypto";
import { PDFDocument } from "pdf-lib";
import { indexarHistorialProveedor, sugerirLocalPendiente } from "./src/modules/facturas/asignacion.js";

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
  "local_receptor": "string",
  "concepto": "string",
  "base_imponible": number,
  "porcentaje_iva": number,
  "cuota_iva": number,
  "total": number,
  "lineas": [
    { "descripcion": "string", "cantidad": number, "unidad": "string", "precio_unitario": number, "importe": number }
  ]
}
QUIÉN EMITE Y QUIÉN RECIBE. Es el error más fácil de cometer y el más caro:
- "proveedor" y "nif_proveedor" son de QUIEN EMITE la factura y cobra: normalmente arriba del
  todo, con el logotipo y el membrete (dirección, teléfono, web, registro mercantil).
- "nombre_receptor" y "nif_receptor" son de QUIEN LA RECIBE y paga: suele ir más abajo, en un
  recuadro, o precedido de "Cliente:", "Sr./Sra.", "Facturar a:" o una dirección de envío.
- Si ves un número junto a la palabra "Cliente", ESO NO ES UN NIF: es el número de cliente que
  el proveedor le asigna. El NIF español es 8 dígitos + letra, o una letra + 7 dígitos + control.
  Si no encuentras el NIF de alguna de las dos partes, pon null; no pongas otro número.
- En facturas de servicios (gestoría, seguros, suministros) no hay líneas de producto que
  ayuden: fíjate en el membrete para saber quién emite.
En "local_receptor" pon el LOCAL o establecimiento CONCRETO del cliente si aparece: normalmente entre paréntesis tras el nombre del cliente (p. ej. "(TAPETA LLORET)"), o en la dirección de entrega, la referencia o el pie. Copia el texto tal cual (p. ej. "TAPETA LLORET", "Can Mateu Tordera"). Si no aparece ningún local concreto, pon null.

En "lineas" pon UNA ENTRADA POR CADA LÍNEA DE PRODUCTO del detalle, en el orden en que aparecen.
- "descripcion": el texto del producto tal cual está escrito en la factura, sin traducir ni abreviar.
- "cantidad" y "unidad": lo que diga la línea (2 / "cajas", 1.5 / "kg", 12 / "ud"). Si la línea no indica unidad, pon null en "unidad".
- "precio_unitario" e "importe": los de esa línea.
- Usa PUNTO decimal, nunca coma. No pongas separador de miles.
- NO incluyas como líneas los subtotales, descuentos globales, portes, la base imponible, el IVA ni el total.
- Si una línea no se lee con seguridad, ponla igualmente con "descripcion" con lo que se distinga y null en lo que no puedas leer. NO INVENTES cantidades ni importes: es preferible un null a un número que parezca correcto.
- Si el documento no tiene detalle por líneas (por ejemplo un ticket resumido), devuelve "lineas": [].`;

// El id del fichero dentro de una URL de Drive. Se guardó `webViewLink`, que tiene forma
// https://drive.google.com/file/d/<ID>/view — pero también se ven las de ?id=<ID>.
export function idDeDriveUrl(url) {
  const s = String(url || "");
  return (/\/d\/([-\w]{20,})/.exec(s) || /[?&]id=([-\w]{20,})/.exec(s) || [])[1] || null;
}

// Descarga un fichero de Drive. Hace falta para releer las facturas antiguas: el PDF vive
// allí y en la base solo quedó el enlace.
export async function driveDescargar(token, fileId) {
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name,size`,
    { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  if (meta.error) throw new Error("Drive: " + meta.error.message);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Drive: no se pudo descargar (" + res.status + ")");
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: meta.mimeType, nombre: meta.name };
}

// Releer el detalle de UNA factura que ya estaba guardada. Idempotente: borra las líneas
// que hubiera y las vuelve a escribir, así que se puede repetir sin duplicar nada.
export async function releerLineasFactura({ factura, getToken, dbRun }) {
  const fileId = idDeDriveUrl(factura.drive_url);
  if (!fileId) throw new Error("La factura no tiene un enlace de Drive reconocible");
  const token = await getToken();
  const { buffer, mimeType } = await driveDescargar(token, fileId);
  const datos = await extraerDatosDocumento(buffer, mimeType);

  // Para releer el detalle NO se toca la cabecera: proveedor, fecha, importes y local ya
  // están revisados y puede que corregidos a mano. Solo interesan las líneas, y se
  // contrastan contra la base imponible que ya está guardada, no contra la releída.
  await dbRun("DELETE FROM factura_lineas WHERE factura_id = ?", [factura.id]);
  return guardarLineas(dbRun, factura.id, { lineas: datos.lineas, base_imponible: factura.base_imponible }, new Date().toISOString());
}

/**
 * ¿Se lee el detalle de este proveedor? Del alquiler, la luz o el gestor no: la línea de esas
 * facturas no es un producto, no se va a analizar nunca, y metidas en «Qué compramos» dejan el
 * ranking de gasto por producto lleno de «Alquiler local julio» entre las gambas y el aceite.
 * El gasto sí cuenta igual: lo que no se guarda es el desglose.
 * Ver src/modules/facturas/categorias.js (SIN_LINEAS).
 */
export async function proveedorConLineas(dbGet, proveedor) {
  const clave = claveProveedor(proveedor);
  if (!clave || !dbGet) return true;   // sin saber de qué es, se lee: un hueco silencioso es peor
  try {
    const filas = await dbGet(`SELECT string_agg(categoria, '|') AS cats FROM facturas_proveedor_cats WHERE prov_clave = ?`, [clave]);
    const cats = filas && filas.cats ? String(filas.cats).split("|") : [];
    return seLeenLineas(cats);
  } catch { return true; }
}

// Guarda el detalle de una factura y deja escrito si cuadra. NO es fatal: si algo falla
// aquí, la factura ya está guardada y lo que se pierde es el detalle, no el gasto.
export async function guardarLineas(dbRun, facturaId, datos, ahora) {
  const lineas = normalizarLineas(datos.lineas);
  const v = validarSuma(lineas, datos.base_imponible);
  const aviso = mensajeValidacion(v);

  for (const l of lineas) {
    await dbRun(
      `INSERT INTO factura_lineas (factura_id, orden, descripcion, cantidad, unidad, precio_unitario, importe, dudosa, clave, creado_en)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [facturaId, l.orden, l.descripcion || "(sin descripción)", l.cantidad, l.unidad,
       l.precio_unitario, l.importe, l.dudosa, claveProducto(l.descripcion), ahora]);
  }
  await dbRun(`UPDATE facturas SET lineas_estado = ?, lineas_aviso = ?, lineas_leidas_en = ? WHERE id = ?`,
    [v.cuadra ? (v.dudosas ? "dudas" : "ok") : "descuadre", aviso, ahora, facturaId]);
  return { n: lineas.length, validacion: v, aviso };
}

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

/**
 * Busca entre las facturas del MISMO proveedor y de fechas cercanas. Acotado en la consulta:
 * comparar contra la tabla entera sería caro y no aportaría nada — una factura de hace ocho
 * meses con el mismo importe es la cuota mensual, no un duplicado.
 */
export async function sospecharDuplicado(dbAll, datos, { ventanaDias = 10 } = {}) {
  if (!dbAll || !datos) return null;
  const prov = (datos.proveedor || "").trim();
  const nif = (datos.nif_proveedor || datos.nif || "").trim();
  if (!prov && !nif) return null;
  const f = datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? datos.fecha : null;
  try {
    const filas = await dbAll(
      `SELECT id, proveedor, nif, fecha, numero_factura, base_imponible::float AS base_imponible,
              total::float AS total, local, drive_url, dup_estado
         FROM facturas
        WHERE (LOWER(proveedor) = LOWER(?) OR (? <> '' AND nif = ?))
          ${f ? "AND fecha BETWEEN (?::date - ?::int)::text AND (?::date + ?::int)::text" : ""}
        ORDER BY id DESC LIMIT 60`,
      f ? [prov, nif, nif, f, ventanaDias, f, ventanaDias] : [prov, nif, nif]);
    return buscarParecida({ ...datos, nif: nif || datos.nif }, filas, { ventanaDias });
  } catch (e) {
    // Que falle la comprobación no puede impedir que entre la factura: se registra y sigue.
    console.error("[Facturas] no se pudo comprobar duplicados:", e.message);
    return null;
  }
}

export class FacturaDuplicadaError extends Error {
  constructor(original, reason, motivos = []) {
    const desc = reason === "hash"
      ? "mismo archivo (hash idéntico)"
      : reason === "parecido"
        ? `${sanitizarNombre(original.proveedor)} · nº ${original.numero_factura || "s/n"} (${resumenMotivos(motivos).toLowerCase()})`
        : `${sanitizarNombre(original.proveedor)} · nº ${original.numero_factura}`;
    super(`Factura duplicada: ya existe ${desc}`);
    this.isDuplicate = true;
    this.motivos = motivos;
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
    // Subido de 512: ahora también viene el detalle línea a línea, y una factura de
    // proveedor de bebidas puede traer treinta. Con 512 se cortaba el JSON a la mitad.
    max_tokens: 4096,
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

/**
 * Busca la carpeta y, si no está, la crea.
 *
 * OJO CON LA RAÍZ. Sin `parentId` la búsqueda era «cualquier carpeta que se llame así», y eso
 * incluye las que están en «Compartido conmigo» y las huérfanas —las que no cuelgan de ninguna
 * parte porque alguien borró su carpeta madre—. Si la raíz resolvía a una de esas, TODA la
 * estructura colgaba de un sitio que no aparece en «Mi unidad»: los archivos se veían en la
 * página principal de Drive y en «Reciente», pero no había forma de llegar a ellos navegando.
 *
 * Por eso la raíz se ancla explícitamente a `root`, que es la primera pantalla de Mi unidad.
 */
async function findOrCreateFolder(token, nombre, parentId = null) {
  const cacheKey = `${parentId || "root"}|${nombre}`;
  if (_folderCache.has(cacheKey)) return _folderCache.get(cacheKey);

  const padre = parentId || "root";
  const promise = (async () => {
    const q = `name = '${nombre.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      + ` and '${padre}' in parents`;
    const files = await driveBuscar(token, q);
    if (files.length) return files[0].id;
    return driveCrearCarpeta(token, nombre, padre);
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

export async function procesarFactura({ buffer, mimeType, filename, local, caption, canal = "WhatsApp", getToken, dbGet, dbAll, dbRun, backupFn }) {
  // El local SIEMPRE se guarda con el nombre del establecimiento, nunca como llegue.
  // De no hacerlo acabaron conviviendo «La Tapeta - Lloret», «Lloret» y «BLANES» en la
  // misma columna, y filtrando por el nombre bueno faltaban facturas.
  {
    const canon = canonizarLocal(local);
    if (!canon) throw new Error(`«${local}» no es ningún establecimiento. Revisa a qué local está vinculado este canal de entrada.`);
    local = canon;
  }
  // 1. Hash para detección de duplicados
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  // Serializado por hash: dedup + subida + insert de un mismo archivo son atómicos frente a carreras.
  return withHashLock(fileHash, async () => {

  // 2. Extraer datos con Claude
  const datos = await extraerDatosDocumento(buffer, mimeType);
  await revisarEmisorReceptor(datos, dbAll);   // ver por qué en revisarEmisorReceptor
  await aplicarNombreProveedor(datos, dbAll);   // lo que ya se corrigió a mano, aprendido
  const coher = await revisarCoherenciaFactura(datos, dbAll);
  console.log(`[Facturas] Datos extraídos para ${local}:`, JSON.stringify(datos));

  // 3. Comprobar duplicados antes de subir nada (facturas procesadas y pendientes)
  const hashDupe = await dbGet("SELECT id, proveedor, numero_factura, fecha, drive_url FROM facturas WHERE file_hash = ?", [fileHash])
                || await dbGet("SELECT id, proveedor, numero_factura, fecha, drive_url FROM facturas_pendientes WHERE file_hash = ?", [fileHash]);
  if (hashDupe) throw new FacturaDuplicadaError(hashDupe, "hash");

  // Sospecha de duplicado. Antes solo se cazaba el archivo idéntico y el mismo número exacto;
  // se colaba la misma factura fotografiada dos veces, porque el archivo cambia y el número se
  // lee mal. Ver src/modules/facturas/duplicados.js.
  const sospecha = await sospecharDuplicado(dbAll, datos);
  if (sospecha && sospecha.veredicto === "duplicada") {
    throw new FacturaDuplicadaError(sospecha.contra, "parecido", sospecha.motivos);
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

  // 7. Sheet del local (puede no existir aún; se crea al proyectar).
  const grupoRow = await dbGet("SELECT sheet_id, sheet_url FROM facturas_grupos WHERE local = ?", [localContable]);
  let sheetId = grupoRow?.sheet_id;
  let sheetUrl = grupoRow?.sheet_url;

  // 8. GUARDAR EN BD PRIMERO — la BD es la única verdad; el Sheet es una proyección reconstruible.
  //    sheet_synced=0: si la proyección a Sheets falla, la cola de reintentos la reproyecta desde la BD.
  // La duda se guarda CON la factura: entra, pero apartada de los totales hasta que alguien
  // decida. No entrar sería decidir que es duplicada, que es justo lo que no se sabe.
  const enDuda = sospecha && sospecha.veredicto === "duda" ? sospecha : null;
  const ins = await dbRun(
    `INSERT INTO facturas (local, empresa, tipo, fecha, numero_factura, proveedor, nif, concepto,
      base_imponible, porcentaje_iva, cuota_iva, total, drive_url, sheet_id, file_hash, canal,
      dup_estado, dup_de, dup_motivos, revisar, sheet_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
    [local, empresa, datos.tipo, datos.fecha, datos.numero_factura, datos.proveedor,
     datos.nif_proveedor, datos.concepto, datos.base_imponible, datos.porcentaje_iva,
     datos.cuota_iva, datos.total, driveFile.url, sheetId, fileHash, canal,
     enDuda ? "duda" : null, enDuda ? enDuda.contra.id : null,
     enDuda ? JSON.stringify(enDuda.motivos) : null,
     coher.avisos.length ? JSON.stringify(textosDe(coher.avisos)) : null]
  );
  if (enDuda) console.warn(`[Facturas] posible duplicado de #${enDuda.contra.id}: ${resumenMotivos(enDuda.motivos)}`);
  const facturaId = ins?.id;

  // 8b. El detalle línea a línea. NO fatal: si falla, la factura ya está guardada y lo que
  // se pierde es el desglose, no el gasto.
  try {
    if (facturaId) {
      if (!(await proveedorConLineas(dbGet, datos.proveedor))) {
        // `no_aplica` y no «sin leer»: así el contador de «Qué compramos» no pide leer para
        // siempre unas facturas que a propósito no se leen.
        await dbRun(`UPDATE facturas SET lineas_estado = 'no_aplica', lineas_leidas_en = ? WHERE id = ?`,
          [new Date().toISOString(), facturaId]);
        console.log(`[Facturas] #${facturaId}: gasto estructural (${datos.proveedor}), no se lee el detalle`);
      } else {
        const r = await guardarLineas(dbRun, facturaId, datos, new Date().toISOString());
        if (r.aviso) console.warn(`[Facturas] #${facturaId} detalle: ${r.aviso}`);
        else console.log(`[Facturas] #${facturaId}: ${r.n} líneas de detalle`);
      }
    }
  } catch (e) { console.error("[Facturas] no se pudo guardar el detalle:", e.message); }

  // 9. Proyectar al Sheet (NO fatal). Si algo falla, queda sheet_synced=0 y lo recoge el reintento.
  try {
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
    const ahora = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    const fila = [
      datos.fecha ?? "", datos.numero_factura ?? "", datos.tipo ?? "", datos.proveedor ?? "", datos.nif_proveedor ?? "",
      datos.concepto ?? "", datos.base_imponible ?? "", datos.porcentaje_iva ?? "", datos.cuota_iva ?? "", datos.total ?? "",
      canal, driveFile.url, ahora
    ];
    await sheetsAñadirFilaMes(token, sheetId, fila, mesLabel);
    // Maestro consolidado (no fatal).
    try {
      await añadirFilaMaestro(token, dbGet, dbRun, [
        datos.fecha ?? "", datos.numero_factura ?? "", datos.tipo ?? "", datos.proveedor ?? "", datos.nif_proveedor ?? "",
        datos.concepto ?? "", datos.base_imponible ?? "", datos.porcentaje_iva ?? "", datos.cuota_iva ?? "", datos.total ?? "",
        local, empresa, canal, driveFile.url, ahora
      ]);
    } catch (e) { console.error("[Facturas] Sheet maestro:", e.message); }
    await dbRun("UPDATE facturas SET sheet_synced = 1, sheet_id = ? WHERE id = ?", [sheetId, facturaId]);
  } catch (e) {
    console.error(`[Facturas] Proyección a Sheet falló (queda pendiente de reintento): ${e.message}`);
  }

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

/**
 * Emisor y receptor cambiados. Envuelve al módulo puro con la lectura de NUESTRAS empresas.
 *
 * ESTO YA EXISTÍA Y NO SALTÓ. Comparaba el nombre por igualdad exacta contra
 * `facturas_locales.empresa`, y la factura de la gestoría decía «DEL AMOR SALINAS, MATEO»
 * mientras que en la ficha pone «Mateu Del Amor Salinas»: las mismas palabras en otro orden y
 * una en catalán. Por CIF tampoco, porque el número que traía era el de cliente. Un filtro que
 * solo acierta cuando el texto coincide letra por letra no filtra casi nada.
 */
/**
 * Comprobaciones deterministas sobre lo leído: que base + IVA dé el total, que la cuota cuadre
 * con su porcentaje, y que el NIF y el importe encajen con lo que ese proveedor traía siempre.
 *
 * No corrige nada. Corregir un importe «porque no cuadra» es inventarse un dato contable, y un
 * dato inventado que parece revisado es peor que uno mal que se nota.
 */
/**
 * Aplica el nombre de proveedor que ya se corrigió a mano. Si alguien arregló «Viruta Bronco»
 * a «Virutas Branco», la siguiente factura entra ya bien: la lectura se equivoca siempre
 * igual, y no tiene sentido corregir lo mismo cada mes.
 */
async function aplicarNombreProveedor(datos, dbAll) {
  try {
    if (!datos || !dbAll || !datos.proveedor) return;
    const alias = await dbAll(`SELECT clave, nif, proveedor FROM facturas_proveedor_alias`).catch(() => []);
    if (!alias.length) return;
    const bueno = nombreCanonico({ proveedor: datos.proveedor, nif: datos.nif_proveedor }, alias);
    if (bueno && bueno !== datos.proveedor) {
      console.log(`[Facturas] proveedor corregido por alias: «${datos.proveedor}» → «${bueno}»`);
      datos.proveedor = bueno;
    }
  } catch (e) { console.error("[Facturas] aplicarNombreProveedor:", e.message); }
}

async function revisarCoherenciaFactura(datos, dbAll) {
  try {
    if (!datos) return { avisos: [], grave: false };
    let historial = {};
    const prov = (datos.proveedor || "").trim();
    if (dbAll && prov) {
      const previas = await dbAll(
        `SELECT nif, total::float AS total FROM facturas
          WHERE LOWER(proveedor) = LOWER(?) AND COALESCE(dup_estado,'') <> 'duda'
          ORDER BY id DESC LIMIT 40`, [prov]).catch(() => []);
      historial = { nifs: previas.map((x) => String(x.nif || "").replace(/[\s.\-/]/g, "").toUpperCase()).filter(Boolean),
        totales: previas.map((x) => x.total) };
    }
    const r = revisarCoherencia(datos, historial);
    if (r.avisos.length) console.warn(`[Facturas] revisar (${prov || "?"}): ${textosDe(r.avisos).join(" | ")}`);
    return r;
  } catch (e) { console.error("[Facturas] revisarCoherencia:", e.message); return { avisos: [], grave: false }; }
}

async function revisarEmisorReceptor(datos, dbAll) {
  try {
    if (!datos || !dbAll) return null;
    const nuestras = await dbAll("SELECT empresa, cif FROM facturas_locales").catch(() => []);
    if (!nuestras.length) return null;
    const r = corregirEmisorReceptor(datos, nuestras);
    if (r.corregido) {
      Object.assign(datos, r.datos);
      console.log("[Facturas] emisor/receptor invertidos → corregido. Proveedor real:", datos.proveedor);
    } else if (r.aviso) {
      console.warn("[Facturas] emisor/receptor:", r.aviso);
    }
    return r;
  } catch (e) { console.error("[Facturas] revisarEmisorReceptor:", e.message); return null; }
}

// ── Combinar varios archivos (fotos/PDFs) en un único PDF ───────────────────
// Para facturas de varias hojas: cada imagen pasa a ser una página y los PDFs
// se fusionan en orden. El resultado se procesa como UN solo documento.
export async function combinarArchivosEnPdf(archivos) {
  const out = await PDFDocument.create();
  for (const { buffer, mimetype, originalname } of archivos) {
    if (mimetype === "application/pdf") {
      const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    } else if (mimetype === "image/jpeg" || mimetype === "image/jpg" || mimetype === "image/png") {
      const img = mimetype === "image/png" ? await out.embedPng(buffer) : await out.embedJpg(buffer);
      // Página a tamaño de la imagen (en puntos) para no recortar ni deformar.
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else {
      throw new Error(`No se puede combinar «${originalname || "archivo"}» (${mimetype}). Usa PDF, JPG o PNG.`);
    }
  }
  if (!out.getPageCount()) throw new Error("No hay páginas que combinar.");
  return Buffer.from(await out.save());
}

export async function procesarFacturaSinLocal({ buffer, mimeType, filename, origen, getToken, dbGet, dbAll, dbRun }) {
  // 1. Hash duplicados (facturas procesadas y pendientes)
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const hashDupe = await dbGet("SELECT id, proveedor, numero_factura, fecha FROM facturas WHERE file_hash = ?", [fileHash])
                || await dbGet("SELECT id, proveedor, numero_factura, fecha FROM facturas_pendientes WHERE file_hash = ?", [fileHash]);
  if (hashDupe) throw new FacturaDuplicadaError(hashDupe, "hash");

  // 2. Extraer datos con Claude (incluye nif_receptor)
  const datos = await extraerDatosDocumento(buffer, mimeType);
  await revisarEmisorReceptor(datos, dbAll);   // ver por qué en revisarEmisorReceptor
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

  // 3-bis. Si el CIF no bastó, intentar por empresa receptora única o proveedor habitual
  // (mismos criterios "muy claros" que hacía el usuario a mano). Solo autoasigna con confianza ALTA.
  if (!localAutodetectado) {
    try {
      const locales = await dbAll("SELECT local, empresa, cif, local_contable FROM facturas_locales", []);
      const hist = indexarHistorialProveedor(await dbAll("SELECT proveedor, local FROM facturas WHERE proveedor IS NOT NULL", []));
      const sug = sugerirLocalPendiente({
        pendiente: { nif_receptor: datos.nif_receptor, nombre_receptor: datos.nombre_receptor, local_receptor: datos.local_receptor, empresa_detectada: empresa !== "Sin empresa asignada" ? empresa : null, proveedor: datos.proveedor },
        locales, historial: hist,
      });
      if (sug.local && sug.confianza === "alta") {
        localAutodetectado = sug.local;
        console.log(`[Facturas] Autoasignado por ${sug.motivo}: ${sug.local}`);
      }
    } catch (e) { console.error("[Facturas] autoasignación proveedor/empresa:", e.message); }
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
      (empresa_detectada, nif_receptor, nombre_receptor, local_receptor, tipo, fecha, numero_factura, proveedor, nif,
       concepto, base_imponible, porcentaje_iva, cuota_iva, total, drive_url, drive_file_id, file_hash, origen, lineas_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [empresa, datos.nif_receptor, datos.nombre_receptor, datos.local_receptor || null, datos.tipo, datos.fecha, datos.numero_factura,
     datos.proveedor, datos.nif_proveedor, datos.concepto, datos.base_imponible, datos.porcentaje_iva,
     datos.cuota_iva, datos.total, driveFile.url, driveFile.id, fileHash, origen || "email",
     // El detalle se guarda aquí mientras la factura espera a que alguien le asigne local:
     // si no, al confirmarla habría que volver a leer el PDF y pagar la lectura dos veces.
     Array.isArray(datos.lineas) && datos.lineas.length ? JSON.stringify(datos.lineas) : null]
  );

  console.log(`[Facturas] Guardada como pendiente: ${datos.proveedor} → ${empresa}/_Por asignar`);
  return { datos, empresa, pendiente: true, driveUrl: driveFile.url };
}

// ── Asignación manual de una factura pendiente ──────────────────────────────

export async function asignarFacturaPendiente({ pendiente, local, getToken, dbGet, dbAll, dbRun, backupFn }) {
  // Igual que en el alta: nunca se guarda un local que no sea un establecimiento.
  const canon = canonizarLocal(local);
  if (!canon) throw new Error(`«${local}» no es ningún establecimiento.`);
  local = canon;

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

  const grupoRow = await dbGet("SELECT sheet_id, sheet_url FROM facturas_grupos WHERE local = ?", [localContable]);
  let sheetId = grupoRow?.sheet_id;
  let sheetUrl = grupoRow?.sheet_url;
  const canal = pendiente.origen === "email" ? "Email" : "WhatsApp";

  // BD PRIMERO (fuente de verdad) y quitar de pendientes: la asignación no se pierde aunque falle el Sheet.
  const ins = await dbRun(
    `INSERT INTO facturas (local, empresa, tipo, fecha, numero_factura, proveedor, nif, concepto,
       base_imponible, porcentaje_iva, cuota_iva, total, drive_url, sheet_id, file_hash, canal, sheet_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
    [localContable, empresa, pendiente.tipo, pendiente.fecha, pendiente.numero_factura,
     pendiente.proveedor, pendiente.nif, pendiente.concepto, pendiente.base_imponible,
     pendiente.porcentaje_iva, pendiente.cuota_iva, pendiente.total, driveUrl, sheetId, pendiente.file_hash, canal]
  );
  const facturaId = ins?.id;

  // El detalle que se leyó cuando llegó la factura, recuperado tal cual. Misma regla que en la
  // vía normal: del gasto estructural no se guarda el desglose (ver proveedorConLineas).
  try {
    if (facturaId && pendiente.lineas_json) {
      if (!(await proveedorConLineas(dbGet, pendiente.proveedor))) {
        await dbRun(`UPDATE facturas SET lineas_estado = 'no_aplica', lineas_leidas_en = ? WHERE id = ?`, [new Date().toISOString(), facturaId]);
      } else {
        const r = await guardarLineas(dbRun, facturaId, { lineas: JSON.parse(pendiente.lineas_json), base_imponible: pendiente.base_imponible }, new Date().toISOString());
        if (r.aviso) console.warn(`[Facturas] #${facturaId} detalle: ${r.aviso}`);
      }
    }
  } catch (e) { console.error("[Facturas] no se pudo guardar el detalle de la pendiente:", e.message); }

  await dbRun("DELETE FROM facturas_pendientes WHERE id = ?", [pendiente.id]);

  // Proyectar al Sheet (NO fatal): si falla, sheet_synced=0 y lo recoge el reintento.
  try {
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
    const ahora = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    const filaAsignada = [
      pendiente.fecha ?? "", pendiente.numero_factura ?? "", pendiente.tipo ?? "",
      pendiente.proveedor ?? "", pendiente.nif ?? "", pendiente.concepto ?? "",
      pendiente.base_imponible ?? "", pendiente.porcentaje_iva ?? "",
      pendiente.cuota_iva ?? "", pendiente.total ?? "", canal, driveUrl, ahora
    ];
    await sheetsAñadirFilaMes(token, sheetId, filaAsignada, mesLabel);
    await dbRun("UPDATE facturas SET sheet_synced = 1, sheet_id = ? WHERE id = ?", [sheetId, facturaId]);
  } catch (e) {
    console.error(`[Facturas] Proyección a Sheet (asignar) falló, queda pendiente de reintento: ${e.message}`);
  }

  return { driveUrl, sheetUrl, sheetId };
}

// ── Cola de reintentos: reproyecta a Sheets las facturas con sheet_synced=0 ──────────────
// La BD es la verdad; esto reconstruye la pestaña (local, mes) desde la BD y marca como sincronizadas.
// Idempotente y seguro: si Google sigue caído, no pasa nada y se reintenta al siguiente ciclo.
export async function reproyectarPendientes({ getToken, dbGet, dbAll, dbRun }) {
  const grupos = await dbAll(
    "SELECT local, MIN(fecha) AS fecha, COUNT(*) AS n FROM facturas WHERE COALESCE(sheet_synced,0)=0 AND fecha IS NOT NULL GROUP BY local, substr(fecha,1,7)",
    []
  );
  let sincronizados = 0, fallidos = 0;
  for (const g of grupos) {
    try {
      await resincronizarSheetsFactura({ getToken, dbGet, dbAll, dbRun }, g.local, g.fecha);
      const r = await dbRun("UPDATE facturas SET sheet_synced = 1 WHERE local = ? AND substr(fecha,1,7) = substr(?,1,7) AND COALESCE(sheet_synced,0)=0", [g.local, g.fecha]);
      sincronizados += Number(g.n) || 0;
    } catch (e) { fallidos++; console.error(`[Facturas] Reproyección ${g.local} ${g.fecha}: ${e.message}`); }
  }
  // Facturas sin fecha (raras): márcalas para no quedar colgadas en el contador.
  try { await dbRun("UPDATE facturas SET sheet_synced = 1 WHERE COALESCE(sheet_synced,0)=0 AND (fecha IS NULL OR fecha='')", []); } catch { /* noop */ }
  return { grupos: grupos.length, sincronizados, fallidos };
}
