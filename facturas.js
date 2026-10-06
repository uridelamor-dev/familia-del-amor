import {pagoPorEmpresa} from './src/modules/facturas/pago-empresa.js';
import { carpetaDocumento, nombreArchivo, moverVerificado } from "./src/modules/facturas/archivo-drive.js";
import { sincronizarAnuales as sincronizarAnualesBase, archivarHistoricos } from "./src/modules/facturas/sheets-anuales.js";
import { fetchFactura as fetch } from "./src/modules/facturas/red.js";
import { canalFactura } from "./src/modules/facturas/recepcion.js";
import Anthropic from "@anthropic-ai/sdk";
import { normalizarLineas, validarSuma, mensajeValidacion, claveProducto } from "./src/modules/facturas/lineas.js";
import { canonizarLocal, esLocalCanonico, LOCALES } from "./src/modules/facturas/local-canonico.js";
import { canonico as localCentro } from "./src/modules/locales/centros.js";
import { claveProveedor, seLeenLineas, nombreCanonico } from "./src/modules/facturas/categorias.js";
import { buscarParecida, resumenMotivos } from "./src/modules/facturas/duplicados.js";
import { corregirEmisorReceptor, nombresPropios } from "./src/modules/facturas/emisor.js";
import { revisarCoherencia, textosDe } from "./src/modules/facturas/coherencia.js";
import { extraerTextoPdf, bloqueTextoParaClaude } from "./src/modules/facturas/pdf-texto.js";
import { pistasDeFecha, revisarFecha } from "./src/modules/facturas/fecha-documento.js";
import { VERSION_LINEAS } from "./src/modules/facturas/repaso.js";
import { calcularVencimiento } from "./src/modules/facturas/vencimiento.js";
import { precioReferencia, revisarPrecios, clavePrecio } from "./src/modules/facturas/precio-referencia.js";
import { extraerJson } from "./src/modules/facturas/json-cortado.js";
import { createHash } from "crypto";
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

const PROMPT_BASE = `Analiza este documento (factura, albarán o ticket) y extrae los datos.
Devuelve ÚNICAMENTE un JSON válido, sin texto adicional y SIN envolverlo en un bloque de código
markdown, con esta estructura exacta
(usa null para los campos que no aparezcan):
{
  "tipo": "factura" | "albaran" | "ticket" | "otro",
  "fecha": "YYYY-MM-DD",
  "periodo_facturado": "YYYY-MM o null",
  "vencimiento": "YYYY-MM-DD",
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
    { "descripcion": "string", "cantidad": number, "unidad": "string", "precio_unitario": number, "importe": number, "descuento_pct": number, "importe_neto": number }
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
LA FECHA DE LA FACTURA. De ella cuelga todo lo demás: en qué mes se archiva, en qué trimestre
se declara el IVA y cuándo hay que pagarla. Un año mal leído no se nota hasta que ya está
declarado.
- "fecha" es la FECHA DE EMISIÓN: la que va en la cabecera junto al número de factura, como
  "Fecha", "Fecha factura", "Fecha de expedición", "Data". Ninguna otra.
- NO SON la fecha de emisión, aunque estén más a la vista: la de vencimiento o pago, la del
  albarán o el pedido que la factura agrupa, la de entrega o salida de almacén, la de impresión
  o descarga del PDF, el periodo facturado ("del 01/11 al 30/11"), la fecha de registro contable
  y el sello de recepción. Si solo encuentras una de esas, pon null.
- FORMATO ESPAÑOL: dd/mm/aaaa. "03/12/2026" es el 3 de diciembre de 2026, NO el 12 de marzo.
  Solo se lee mm/dd si el propio documento lo escribe así en inglés ("December 3, 2026").
- EL AÑO SE COPIA, NO SE DEDUCE. Cópialo dígito a dígito de donde está escrito. No lo ajustes a
  lo que te parezca el año en curso, ni al de otras facturas, ni a lo que te resulte familiar:
  si el papel pone 2026, la fecha es de 2026 aunque te suene lejano. Poner un año que no está
  escrito en el documento es el error más caro que puedes cometer aquí.
- Si el año viene con dos cifras ("03/12/26", "3-dic-26"), es 20xx: 26 → 2026.
- SI HAY VARIAS FECHAS y dudas de cuál es la de emisión, contrástalas antes de elegir: el número
  de factura suele llevar su año dentro ("FRA-2026-0123", "2026/00145"), y el vencimiento es
  siempre igual o posterior a la emisión, nunca anterior. Elige la que encaje con las dos.
- Si el documento trae capa de texto (el bloque de más abajo), el año que manda es el de la capa
  de texto: ahí están los dígitos exactos, sin error de lectura.
- Si no hay ninguna fecha de emisión legible, pon null. Sin fecha se ve que falta; con una fecha
  inventada, no se ve nada.
Hoy es {HOY}. Úsalo SOLO para descartar imposibles —ninguna factura está fechada dentro de un
año—, nunca para rellenar ni para acercar una fecha dudosa. Si el documento no lleva fecha, la
respuesta es null, no la de hoy.

En "vencimiento" pon la fecha en que hay que pagar, SOLO si aparece escrita: suele venir como
"Vencimiento", "Fecha de vencimiento", "Vto." o "Fecha de pago". Si lo que pone son condiciones
("a 30 días", "pago a 60 días fecha factura") y no una fecha concreta, pon null: la fecha la
calculamos nosotros. Nunca la deduzcas.

En "local_receptor" pon el LOCAL o establecimiento CONCRETO del cliente si aparece: normalmente entre paréntesis tras el nombre del cliente (p. ej. "(TAPETA LLORET)"), o en la dirección de entrega, la referencia o el pie. Copia el texto tal cual (p. ej. "TAPETA LLORET", "Can Mateu Tordera"). Si no aparece ningún local concreto, pon null.
En "periodo_facturado" recoge el mes del periodo facturado SOLO cuando aparece expresamente en el documento. No uses la fecha de llegada ni supongas el mes anterior. Si abarca varios meses o es ambiguo, devuelve null.
IMPORTANTE: distingue el NOMBRE COMERCIAL DEL ESTABLECIMIENTO de la RAZÓN SOCIAL y de la DIRECCIÓN FISCAL. Busca también las etiquetas "Nombre Cliente", "Cliente", "Centro", "Punto de venta" y "Dirección entrega" en todas las páginas. "Nombre Fiscal: DEL AMOR URIEL S.L.U.; Nombre Cliente: LA TAPETA (BLANES); Dir. Facturación: PERE QUART 13, TORDERA" significa nombre_receptor="DEL AMOR URIEL S.L.U." y local_receptor="LA TAPETA (BLANES)". Tordera es aquí el domicilio fiscal: NO lo añadas a local_receptor ni lo conviertas en el local. Aunque esa dirección fiscal se repita bajo Dirección entrega, conserva el nombre explícito LA TAPETA (BLANES). Copia el establecimiento literalmente; no deduzcas un local a partir del domicilio fiscal, del proveedor, ni de un CIF compartido. Si aparecen DOS establecimientos concretos diferentes como destinatarios de esta factura, recoge ambos en local_receptor para revisión; no elijas uno.

En "lineas" pon UNA ENTRADA POR CADA LÍNEA DE PRODUCTO del detalle, en el orden en que aparecen.
- "descripcion": el texto del producto tal cual está escrito en la factura, sin traducir ni abreviar.
- "cantidad" y "unidad": lo que diga la línea (2 / "cajas", 1.5 / "kg", 12 / "ud"). Si la línea no indica unidad, pon null en "unidad".
- CANTIDAD Y PRECIO TIENEN QUE HABLAR DE LO MISMO: cantidad × precio_unitario debe dar el
  importe. Hay facturas con DOS columnas de cantidad ("UDS. PACK" y "UDS. TOTALES", o
  "BULTOS" y "UNIDADES"): si el precio es por unidad suelta, la cantidad que va aquí es la de
  UNIDADES TOTALES, no la de paquetes. Comprueba la multiplicación antes de responder.
- "precio_unitario" e "importe": los de esa línea, TAL CUAL aparecen (antes de descuento).
- DESCUENTOS. Muchas facturas traen columnas «DTO. %» y «TOTAL» además de «IMPORTE»: el
  importe es el bruto y el total es lo que se paga de verdad. Si las ves, pon el porcentaje en
  "descuento_pct" y ese total de la línea en "importe_neto". Si no hay descuento, pon null en
  las dos. Es importante: sin esto se guarda un precio que nadie paga.
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

/**
 * Los precios a los que este proveedor nos ha cobrado antes cada producto de la factura, para
 * poder decir si el de hoy se sale de lo normal.
 *
 * Se pregunta por las claves de ESTA factura y contra el MISMO proveedor: que el aceite esté
 * más caro en Makro que en el mayorista no es una subida, es otro proveedor, y un aviso que no
 * se puede accionar se aprende a ignorar.
 *
 * Solo mira facturas ya guardadas (no la que está entrando) y descarta las apartadas por
 * dudosas: una copia repetida contaría dos veces en la mediana.
 */
export async function referenciasDeProveedor(dbAll, proveedor, claves) {
  const lista = [...new Set((claves || []).filter(Boolean))];
  if (!dbAll || !proveedor || !lista.length) return new Map();
  try {
    const filas = await dbAll(
      `SELECT l.clave, l.unidad, l.precio_unitario::float AS precio, f.fecha
         FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id
        WHERE LOWER(f.proveedor) = LOWER(?) AND COALESCE(f.dup_estado,'') <> 'duda'
          AND l.clave = ANY(?) AND l.precio_unitario IS NOT NULL AND l.dudosa = FALSE
          AND COALESCE(f.lineas_version,1) >= ${VERSION_LINEAS}
        ORDER BY f.fecha DESC LIMIT 2000`, [proveedor, lista]);
    const porClave = new Map();
    for (const f of filas) {
      const clave = clavePrecio(f.clave, f.unidad);
      if (!clave) continue;
      if (!porClave.has(clave)) porClave.set(clave, []);
      porClave.get(clave).push(f.precio);
    }
    const out = new Map();
    for (const [clave, precios] of porClave) {
      const ref = precioReferencia(precios);
      if (ref != null) out.set(clave, { precio: ref, compras: precios.length });
    }
    return out;
  } catch (e) {
    console.error("[Facturas] referencias de precio:", e.message);
    return new Map();
  }
}

/**
 * Las condiciones de pago pactadas con este proveedor, si las hay. Se buscan por la clave
 * normalizada —igual que las categorías— para que valgan aunque el nombre se lea de tres
 * formas distintas. Si no hay condiciones, la factura se queda SIN fecha de vencimiento y se
 * dice: inventar un «30 días» por defecto se paga tarde o se paga dos veces, y encima con la
 * tranquilidad de que la fecha estaba puesta.
 */
export async function condicionesDePago(dbGet, proveedor, empresa = "") {
  const clave = claveProveedor(proveedor);
  if (!clave || !dbGet) return null;
  try {
    // Primero la regla de ESA empresa; si no la hay, la general. El mismo proveedor puede
    // pasarle el recibo del 15 a una empresa del grupo y cobrarle al contado a otra.
    const r = await dbGet(
      `SELECT dias, dia_pago, modo, meses_despues, domiciliado, empresa
         FROM facturas_pago_reglas
        WHERE prov_clave = ? AND empresa IN (?, '')
        ORDER BY (empresa <> '') DESC LIMIT 1`, [clave, String(empresa || "")]);
    return r ? { dias: r.dias, dia_pago: r.dia_pago, modo: r.modo || "dias",
      meses_despues: r.meses_despues, domiciliado: !!Number(r.domiciliado),
      empresa: r.empresa || "", general: !r.empresa } : pagoPorEmpresa(empresa);
  } catch { return null; }
}

// Guarda el detalle de una factura y deja escrito si cuadra. NO es fatal: si algo falla
// aquí, la factura ya está guardada y lo que se pierde es el detalle, no el gasto.
export async function guardarLineas(dbRun, facturaId, datos, ahora, extra = {}) {
  const lineas = normalizarLineas(datos.lineas);
  const v = validarSuma(lineas, datos.base_imponible);
  const aviso = mensajeValidacion(v);

  // ¿Nos están cobrando algo más caro de lo normal? Se mira ANTES de guardar las líneas, que
  // es cuando las de esta factura todavía no ensucian su propia referencia.
  const avisosPrecio = extra.referencias && extra.referencias.size
    ? revisarPrecios(lineas.map((l) => ({ ...l, clave: claveProducto(l.descripcion) })), extra.referencias,
      { proveedor: extra.proveedor || "" })
    : { avisos: [], total: 0, ocultos: 0 };

  for (const l of lineas) {
    await dbRun(
      `INSERT INTO factura_lineas (factura_id, orden, descripcion, cantidad, unidad, precio_unitario, importe,
         precio_bruto, importe_bruto, descuento_pct, factor_unidad, dudosa, clave, creado_en)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [facturaId, l.orden, l.descripcion || "(sin descripción)", l.cantidad, l.unidad,
       l.precio_unitario, l.importe, l.precio_bruto, l.importe_bruto, l.descuento_pct,
       l.factor_unidad ?? null, l.dudosa, claveProducto(l.descripcion), ahora]);
  }
  // Queda escrito CON QUÉ VERSIÓN se leyó. Es lo que permite releer hacia atrás solo lo que
  // se leyó con la de antes, en vez de volver a pasar por el modelo facturas que ya están al
  // día. Ver src/modules/facturas/repaso.js.
  await dbRun(`UPDATE facturas SET lineas_estado = ?, lineas_aviso = ?, lineas_leidas_en = ?, lineas_version = ? WHERE id = ?`,
    [v.cuadra ? (v.dudosas ? "dudas" : "ok") : "descuadre", aviso, ahora, VERSION_LINEAS, facturaId]);

  // Los avisos de precio van a `revisar`, con los de coherencia: es la misma pregunta —«esto
  // no cuadra, míralo antes de pagar»— y tenerlos en dos sitios sería tener dos bandejas.
  if (avisosPrecio.avisos.length) {
    const textos = avisosPrecio.avisos.map((a) => a.texto);
    if (avisosPrecio.ocultos) textos.push(`Y ${avisosPrecio.ocultos} producto(s) más por encima de lo normal.`);
    await dbRun(
      `UPDATE facturas SET revisar = CASE
          WHEN revisar IS NULL OR revisar = '' THEN ?
          ELSE ?::jsonb || revisar::jsonb END::text
        WHERE id = ?`,
      [JSON.stringify(textos), JSON.stringify(textos), facturaId]).catch(async () => {
      // Si la columna trae algo que no es JSON (de antes), no se pierde el aviso: se reemplaza.
      await dbRun(`UPDATE facturas SET revisar = ? WHERE id = ?`, [JSON.stringify(textos), facturaId]).catch(() => {});
    });
  }
  return { n: lineas.length, validacion: v, aviso, precios: avisosPrecio };
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

/**
 * El prompt, con la fecha de hoy dentro.
 *
 * `hoy` se INYECTA y no se lee de `new Date()`: así los tests pueden fijar el día y comprobar
 * que las reglas de la fecha siguen ahí. Y va acotado a descartar imposibles, nunca a rellenar:
 * dar «hoy» sin más invita a poner esa fecha cuando no encuentra ninguna, y una fecha razonable
 * pero inventada no la caza después ninguna comprobación.
 */
export const promptExtraccion = (hoy) => PROMPT_BASE.replace("{HOY}", String(hoy || "").slice(0, 10) || "desconocido");

export async function extraerDatosDocumento(buffer, mimeType, { hoy = null } = {}) {
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout:120000, maxRetries:1 });
  const base64 = buffer.toString("base64");

  const isPdf = mimeType === "application/pdf";
  const adjunto = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image",    source: { type: "base64", media_type: mimeType, data: base64 } };

  // Si el PDF trae capa de texto (los que salen del programa de gestión del proveedor la traen;
  // los escaneados y las fotos no), se manda TAMBIÉN el texto exacto junto al documento. El
  // documento aporta la disposición —quién firma arriba, qué hay en el recuadro del cliente— y
  // el texto aporta los caracteres sin error de lectura: el nº de factura, el NIF, los importes.
  // Ver src/modules/facturas/pdf-texto.js.
  const contenido = [adjunto];
  // La capa de texto se GUARDA además de mandarse. Antes se tiraba, y con ella la única prueba
  // deterministe que existe de qué año hay escrito en el papel: los dígitos exactos que puso el
  // emisor. Es lo que permite decir «ese año no está en el documento» sin volver a leer nada.
  let pistas = null;
  if (isPdf) {
    const capa = extraerTextoPdf(buffer);
    if (capa.hayTexto) {
      contenido.push({ type: "text", text: bloqueTextoParaClaude(capa.texto) });
      pistas = pistasDeFecha(capa.texto);
      console.log(`[Facturas] PDF con capa de texto: ${capa.texto.length} caracteres extraídos del archivo`);
    } else {
      console.log(`[Facturas] PDF sin capa de texto aprovechable (${capa.motivo}): se lee solo la imagen`);
    }
  }
  contenido.push({ type: "text", text: promptExtraccion(hoy || new Date().toISOString().slice(0, 10)) });

  const response = await ai.messages.create({
    model: "claude-haiku-4-5-20251001",
    // Subido de 512: ahora también viene el detalle línea a línea, y una factura de
    // proveedor de bebidas puede traer treinta. Con 512 se cortaba el JSON a la mitad.
    max_tokens: 16000,
    messages: [{ role: "user", content: contenido }]
  });

  const text = response.content.find(b => b.type === "text")?.text || "";
  const r = extraerJson(text);

  // El modelo avisa por su cuenta de que le hemos cortado. Sin mirar esto, el fallo salía como
  // «Expected ',' or ']' after array element in JSON at position 9099», que no le dice nada a
  // quien lo lee y parece que la factura no tenía descuentos.
  if (response.stop_reason === "max_tokens") {
    if (!r.ok) throw new Error("La lectura se ha cortado: la factura tiene más líneas de las que caben en una respuesta.");
    console.warn(`[Facturas] la lectura se ha cortado; se guardan las ${(r.valor.lineas || []).length} líneas que llegaron enteras`);
  }
  if (!r.ok) throw new Error(`Claude no devolvió JSON válido (${r.motivo}): ` + text.slice(0, 200));
  if (r.recortado) console.warn(`[Facturas] respuesta incompleta: se aprovechan ${(r.valor.lineas || []).length} líneas enteras`);
  // Las pistas van con guión bajo para que se vea de un vistazo que NO vienen del modelo: son
  // lo que había escrito en el papel, y sirven precisamente para contrastarlas con lo que dijo.
  if (pistas) r.valor._pistasFecha = pistas;
  return r.valor;
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

const sincronizarAnuales = (deps,filtro) => sincronizarAnualesBase({...deps,crearCarpeta:findOrCreateFolder},filtro);

// ── Google Sheets API (via fetch) ───────────────────────────────────────────

// Compatibilidad con el antiguo botón: nunca reescribe el consolidado histórico.
export async function reconstruirSheetMaestro(deps) {
  const r = await sincronizarAnuales(deps);
  return {...r,sheetId:r.libros[0]?.id,url:r.libros[0]?.url};
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

// Re-proyecta a los Sheets la pestaña (local_contable, mes) afectada por un cambio + el maestro.
export async function resincronizarSheetsFactura(deps, local, fecha) {
  return sincronizarAnuales(deps, {local,fecha});
}

export async function repararTodosLosSheets(deps) {
  await deps.dbRun('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['facturas_drive_organizacion_pendiente','1']);
  let r;
  try { r = await sincronizarAnuales({...deps,trasVerificar:async()=>{
    const documentos = await migrarEstructuraDrive(deps);
    if(documentos.errores.length)throw new Error('Los libros se han verificado, pero faltan archivos por ordenar: '+documentos.errores.slice(0,5).join('; '));
    const historicos = await archivarHistoricos(deps);
    return {documentos,historicos};
  }});
  } catch(e) {
    await deps.dbRun('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['facturas_drive_organizacion_error',String(e.message).slice(0,2000)]);
    throw e;
  }
  await deps.dbRun('DELETE FROM config WHERE key = ?',['facturas_drive_organizacion_error']);
  await deps.dbRun('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['facturas_drive_organizacion_completada_v1',new Date().toISOString()]);
  await deps.dbRun('DELETE FROM config WHERE key = ?',['facturas_drive_organizacion_pendiente']);
  return {...r, tabs:r.libros.length, maestro:r.total};
}

// ── Pipeline principal ──────────────────────────────────────────────────────

/**
 * El alta de una factura, venga por donde venga.
 *
 * `leerDocumento` se puede sustituir, y es a propósito: la base, Drive y el token ya se inyectan
 * —el módulo entero está escrito así— y la lectura con IA era la única pieza que quedaba fija,
 * lo que hacía imposible ejecutar este camino en un test sin gastar en llamadas al modelo. Sin
 * poder ejecutarlo, un `ReferenceError` colado entre el INSERT y el detalle estuvo nueve días
 * rompiendo cada factura que entraba sin que ningún test dijera nada.
 */
export async function procesarFactura({ buffer, mimeType, filename, local, caption, canal = "WhatsApp", getToken, dbGet, dbAll, dbRun, backupFn, leerDocumento = extraerDatosDocumento }) {
  // El local SIEMPRE se guarda con el nombre del establecimiento, nunca como llegue.
  // De no hacerlo acabaron conviviendo «La Tapeta - Lloret», «Lloret» y «BLANES» en la
  // misma columna, y filtrando por el nombre bueno faltaban facturas.
  {
    const canon = canonizarLocal(local);
    if (!canon) throw new Error(`«${local}» no es ningún establecimiento. Revisa a qué local está vinculado este canal de entrada.`);
    // Y si ese establecimiento es una barra de un centro, la factura es del CENTRO. La
    // Cooperativa tiene su propio grupo de WhatsApp —y lo conserva—, pero lo que entra por
    // él es gasto de Blanes: misma sociedad, mismo CIF, mismo libro de facturas recibidas.
    local = localCentro(canon, "compras");
  }
  // 1. Hash para detección de duplicados
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  // Serializado por hash: dedup + subida + insert de un mismo archivo son atómicos frente a carreras.
  return withHashLock(fileHash, async () => {

  // 2. Extraer datos con Claude
  const datos = await leerDocumento(buffer, mimeType);
  await revisarEmisorReceptor(datos, dbAll);   // ver por qué en revisarEmisorReceptor
  await aplicarNombreProveedor(datos, dbAll);   // lo que ya se corrigió a mano, aprendido
  const coher = await revisarCoherenciaFactura(datos, dbAll, { hoy: hoyISOFactura(), recibida: hoyISOFactura() });
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
  const mesId = await carpetaDocumento(token, rootId, {empresa,local:localContable,fecha:datos.fecha}, findOrCreateFolder);

  // 6. Subir archivo a Drive con nuevo formato de nombre
  const ext = mimeType === "application/pdf" ? ".pdf"
    : mimeType.startsWith("image/png") ? ".png" : ".jpg";
  const driveFilename = nombreArchivo({...datos,local}, ext);
  const driveFile = await driveSubirArchivo(token, mesId, driveFilename, buffer, mimeType);
  console.log(`[Facturas] Archivo subido: ${driveFile.url}`);

  // El ID anual se obtiene después de guardar la factura en la fuente de verdad.
  let sheetId = null, sheetUrl = null;

  // 8. GUARDAR EN BD PRIMERO — la BD es la única verdad; el Sheet es una proyección reconstruible.
  //    sheet_synced=0: si la proyección a Sheets falla, la cola de reintentos la reproyecta desde la BD.
  // La duda se guarda CON la factura: entra, pero apartada de los totales hasta que alguien
  // decida. No entrar sería decidir que es duplicada, que es justo lo que no se sabe.
  const enDuda = sospecha && sospecha.veredicto === "duda" ? sospecha : null;
  // Cuándo hay que pagarla: manda lo que ponga el papel y, si no dice nada, lo pactado con el
  // proveedor. Si no hay ninguna de las dos, se queda sin fecha — y eso se ve en «Pagos».
  const venc = calcularVencimiento({
    fecha: datos.fecha, vencimientoLeido: datos.vencimiento,
    // Con la EMPRESA: el mismo proveedor puede tener condiciones distintas en cada una.
    condiciones: await condicionesDePago(dbGet, datos.proveedor, empresa),
  });
  const ins = await dbRun(
    `INSERT INTO facturas (local, empresa, tipo, fecha, numero_factura, proveedor, nif, concepto,
      base_imponible, porcentaje_iva, cuota_iva, total, drive_url, sheet_id, file_hash, canal,
      dup_estado, dup_de, dup_motivos, revisar, vencimiento, vencimiento_origen, fecha_pistas, periodo_facturado, periodo_origen, sheet_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
    [local, empresa, datos.tipo, datos.fecha, datos.numero_factura, datos.proveedor,
     datos.nif_proveedor, datos.concepto, datos.base_imponible, datos.porcentaje_iva,
     datos.cuota_iva, datos.total, driveFile.url, sheetId, fileHash, canal,
     enDuda ? "duda" : null, enDuda ? enDuda.contra.id : null,
     enDuda ? JSON.stringify(enDuda.motivos) : null,
     coher.avisos.length ? JSON.stringify(textosDe(coher.avisos)) : null,
     venc.vencimiento, venc.origen,
     datos._pistasFecha ? JSON.stringify(datos._pistasFecha) : null,
     /^\d{4}-(0[1-9]|1[0-2])$/.test(datos.periodo_facturado||"") ? datos.periodo_facturado : null, "documento"]
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
        // Los precios a los que este proveedor nos cobraba antes cada cosa, para poder avisar
        // si hoy cobra más. Se piden ANTES de guardar: si no, las líneas de esta factura ya
        // estarían dentro de su propia referencia y una subida se taparía a sí misma.
        const referencias = await referenciasDeProveedor(dbAll, datos.proveedor,
          normalizarLineas(datos.lineas).map((l) => claveProducto(l.descripcion)));
        const r = await guardarLineas(dbRun, facturaId, datos, new Date().toISOString(),
          { referencias, proveedor: datos.proveedor });
        if (r.aviso) console.warn(`[Facturas] #${facturaId} detalle: ${r.aviso}`);
        else console.log(`[Facturas] #${facturaId}: ${r.n} líneas de detalle`);
        if (r.precios?.total) console.warn(`[Facturas] #${facturaId}: ${r.precios.total} producto(s) por encima de lo normal`);
      }
    }
  } catch (e) { console.error("[Facturas] no se pudo guardar el detalle:", e.message); }

  await reubicarEnDrive({factura:{...datos,id:facturaId,empresa,local,drive_url:driveFile.url},getToken,dbGet});

  // 9. Proyectar al Sheet (NO fatal). Si algo falla, queda sheet_synced=0 y lo recoge el reintento.
  try {
    const anual = await sincronizarAnuales({getToken,dbGet,dbAll,dbRun}, {local,fecha:datos.fecha});
    const guardada = await dbGet('SELECT sheet_id FROM facturas WHERE id = ?', [facturaId]);
    const libro = anual.libros.find(l => l.id === guardada?.sheet_id);
    sheetId = libro?.id || null; sheetUrl = libro?.url || null;
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

/**
 * Deja UNA factura en la carpeta que le toca por su empresa, su local y su mes.
 *
 * Extraído de la migración masiva porque hace falta al corregir una fecha a mano: hasta ahora
 * cambiar el año dejaba el PDF archivado en «Diciembre 2025» para siempre. El dato se arreglaba
 * y el papel se quedaba donde estaba, que es la mitad del trabajo y la mitad que no se ve.
 *
 * Devuelve `{ movido, motivo }`. NUNCA lanza: mover un archivo no puede costar la corrección.
 */
export async function reubicarEnDrive({ factura, getToken, dbGet }) {
  try {
    const fileId = extractDriveFileId(factura?.drive_url);
    if (!fileId) return { movido: false, motivo: "sin archivo en Drive" };
    const token = await getToken();
    const cfgRaiz = await dbGet("SELECT value FROM config WHERE key = 'drive_facturas_root_id'");
    if (!cfgRaiz?.value) return { movido: false, motivo: "sin carpeta raíz" };

    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents`,
      { headers: { Authorization: `Bearer ${token}` } });
    const meta = await metaRes.json();
    if (meta.error) return { movido: false, motivo: meta.error.message };
    const oldParentId = meta.parents?.[0];

    const localRow = await dbGet("SELECT empresa, local_contable FROM facturas_locales WHERE local = ?", [factura.local]);
    const empresa = factura.empresa || localRow?.empresa || "Sin empresa asignada";
    const localContable = localRow?.local_contable || factura.local;
    const fechaDoc = factura.fecha ? new Date(factura.fecha + "T12:00:00") : new Date(factura.creado_en);
    const mesLabel = `${MESES_ES[fechaDoc.getMonth()]} ${fechaDoc.getFullYear()}`;
    const mesId = await carpetaDocumento(token,rootIdDe(cfgRaiz),{...factura,empresa,local:localContable},findOrCreateFolder);
    const nombre = nombreArchivo({...factura,local:localContable},meta.name?.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.pdf');
    if (oldParentId === mesId && meta.name === nombre) return { movido: false, motivo: "ya estaba en su sitio" };

    const moveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${mesId}${oldParentId ? "&removeParents=" + oldParentId : ""}&fields=id`,
      { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({name:nombre}) });
    const moveData = await moveRes.json();
    if (moveData.error) return { movido: false, motivo: moveData.error.message };
    console.log(`[Facturas] #${factura.id} movido a ${empresa}/${localContable}/${mesLabel}`);
    return { movido: true, carpeta: `${empresa}/${localContable}/${mesLabel}` };
  } catch (e) {
    return { movido: false, motivo: e.message };
  }
}
const rootIdDe = (cfg) => cfg.value;

export async function migrarEstructuraDrive({getToken,dbAll,dbGet,dbRun}) {
  const token=await getToken();
  const root=await dbGet("SELECT value FROM config WHERE key = 'drive_facturas_root_id'");
  if(!root?.value)throw new Error('Falta la carpeta raíz de contabilidad');
  const rows=await dbAll('SELECT * FROM facturas ORDER BY id');
  const res={movidos:0,omitidos:0,errores:[]};
  for(const f of rows){
    try{
      const id=extractDriveFileId(f.drive_url);if(!id)throw new Error('Sin PDF identificado');
      const localRow=await dbGet('SELECT empresa,local_contable FROM facturas_locales WHERE local = ?',[f.local]);
      const datos={...f,empresa:f.empresa||localRow?.empresa,local:localRow?.local_contable||f.local};
      const parent=await carpetaDocumento(token,root.value,datos,findOrCreateFolder);
      const meta=await (await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name`,{headers:{Authorization:`Bearer ${token}`}})).json();
      const ext=meta.name?.match(/\.[a-zA-Z0-9]+$/)?.[0]||'.pdf';
      if(await moverVerificado(token,{dbRun},id,parent,nombreArchivo(datos,ext)))res.movidos++;else res.omitidos++;
    }catch(e){res.errores.push(`#${f.id}: ${/HTTP 404/.test(e.message)?'No se puede acceder al archivo en Drive: puede faltar o no estar compartido con la cuenta conectada. Hay que recuperar el archivo o revisar su acceso':e.message}`);}
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

/** El día de hoy en Madrid, para contrastar fechas sin depender del huso del servidor. */
const hoyISOFactura = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);

async function revisarCoherenciaFactura(datos, dbAll, ctx = null) {
  try {
    if (!datos) return { avisos: [], grave: false, anioProbable: null };
    let historial = {};
    const prov = (datos.proveedor || "").trim();
    if (dbAll && prov) {
      const previas = await dbAll(
        `SELECT nif, total::float AS total, fecha FROM facturas
          WHERE LOWER(proveedor) = LOWER(?) AND COALESCE(dup_estado,'') <> 'duda'
          ORDER BY id DESC LIMIT 40`, [prov]).catch(() => []);
      historial = { nifs: previas.map((x) => String(x.nif || "").replace(/[\s.\-/]/g, "").toUpperCase()).filter(Boolean),
        totales: previas.map((x) => x.total),
        // Las fechas de sus facturas anteriores: una de hace un año, cuando la última es de la
        // semana pasada, es una pista de que el año se ha leído mal.
        fechas: previas.map((x) => x.fecha).filter(Boolean) };
    }
    const r = revisarCoherencia(datos, historial);

    // ── Y la fecha, que hasta ahora no la miraba nadie ────────────────────────────────────
    // Va aquí y no aparte porque es la misma pregunta: ¿me creo lo que se ha leído? Sus avisos
    // acaban en la misma columna y en la misma etiqueta de «revisar» que los de los importes.
    const f = revisarFecha(datos, {
      hoy: ctx?.hoy || hoyISOFactura(),
      recibida: ctx?.recibida || null,
      pistas: datos._pistasFecha || null,
      // Solo cuenta si el vencimiento se LEYÓ del papel. Si lo calculamos nosotros a partir de
      // la fecha, contrastarlo sería compararla consigo misma.
      vencimientoDelPapel: !!datos.vencimiento,
      historial,
    });
    const avisos = [...r.avisos, ...f.avisos];
    if (avisos.length) console.warn(`[Facturas] revisar (${prov || "?"}): ${textosDe(avisos).join(" | ")}`);
    return { avisos, grave: r.grave || f.grave, anioProbable: f.anioProbable, propuestaFecha: f.propuesta };
  } catch (e) { console.error("[Facturas] revisarCoherencia:", e.message); return { avisos: [], grave: false, anioProbable: null }; }
}

async function revisarEmisorReceptor(datos, dbAll) {
  try {
    if (!datos || !dbAll) return null;
    const nuestras = await dbAll("SELECT empresa, cif FROM facturas_locales").catch(() => []);
    if (!nuestras.length) return null;
    // Además del nombre fiscal, los nombres con los que existimos de cara al mundo: los de los
    // establecimientos —«LA TAPETA», «CAN MATEU»— y los que alguien haya marcado a mano como
    // nuestros. En una factura ponemos esos, no «DEL AMOR URIEL SLU», y sin ellos esas facturas
    // entraban con NOSOTROS MISMOS como proveedor.
    const marcados = await dbAll("SELECT nombre FROM facturas_somos_nosotros").catch(() => []);
    const propios = nombresPropios(LOCALES, marcados.map((x) => x.nombre));
    const r = corregirEmisorReceptor(datos, nuestras, propios);
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
  // `pdf-lib` se carga AQUÍ y no arriba: es la única dependencia npm que usa este fichero y solo
  // hace falta para combinar varios archivos en uno. Cargándola arriba, todo `facturas.js`
  // —el alta entera— dejaba de poder importarse allí donde no estuviera instalada, y por eso
  // sus tests se saltaban en silencio. Una dependencia de un caso concreto no puede decidir si
  // el resto del módulo se puede probar.
  const { PDFDocument } = await import("pdf-lib");
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
    return procesarFactura({ buffer, mimeType, filename, local: localAutodetectado, caption: "Local detectado por receptor", canal: canalFactura(origen), getToken, dbGet, dbAll: dbAll, dbRun });
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
       concepto, base_imponible, porcentaje_iva, cuota_iva, total, drive_url, drive_file_id, file_hash, origen, lineas_json, periodo_facturado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [empresa, datos.nif_receptor, datos.nombre_receptor, datos.local_receptor || null, datos.tipo, datos.fecha, datos.numero_factura,
     datos.proveedor, datos.nif_proveedor, datos.concepto, datos.base_imponible, datos.porcentaje_iva,
     datos.cuota_iva, datos.total, driveFile.url, driveFile.id, fileHash, origen || "email",
     // El detalle se guarda aquí mientras la factura espera a que alguien le asigne local:
     // si no, al confirmarla habría que volver a leer el PDF y pagar la lectura dos veces.
     Array.isArray(datos.lineas) && datos.lineas.length ? JSON.stringify(datos.lineas) : null,
     /^\d{4}-(0[1-9]|1[0-2])$/.test(datos.periodo_facturado||"") ? datos.periodo_facturado : null]
  );

  console.log(`[Facturas] Guardada como pendiente: ${datos.proveedor} → ${empresa}/_Por asignar`);
  return { datos, empresa, pendiente: true, driveUrl: driveFile.url };
}

// ── Asignación manual de una factura pendiente ──────────────────────────────

/**
 * `reparto: "empresa"` — el gasto no es de un local sino de toda la sociedad (la gestoría, el
 * seguro, el alquiler). El documento se archiva igual, bajo uno de sus locales, porque en algún
 * sitio tiene que vivir el papel; lo que cambia es cómo se CUENTA, y eso lo marca la columna.
 */
export async function asignarFacturaPendiente({ pendiente, local, reparto = null, getToken, dbGet, dbAll, dbRun, backupFn }) {
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
  const mesId = await carpetaDocumento(token, rootId, {empresa,local:localContable,fecha:pendiente.fecha}, findOrCreateFolder);

  // Mover archivo
  const moveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${pendiente.drive_file_id}?addParents=${mesId}&removeParents=${oldParent}&fields=id,webViewLink`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" }
  );
  const moveData = await moveRes.json();
  if (moveData.error) throw new Error("Error moviendo archivo en Drive: " + moveData.error.message);
  const driveUrl = moveData.webViewLink || pendiente.drive_url;

  let sheetId = null, sheetUrl = null;
  const canal = pendiente.origen === "email" ? "Email" : "WhatsApp";

  // BD PRIMERO (fuente de verdad) y quitar de pendientes: la asignación no se pierde aunque falle el Sheet.
  const ins = await dbRun(
    `INSERT INTO facturas (local, empresa, tipo, fecha, numero_factura, proveedor, nif, concepto,
       base_imponible, porcentaje_iva, cuota_iva, total, drive_url, sheet_id, file_hash, canal, periodo_facturado, periodo_origen, creado_en, sheet_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
    [localContable, empresa, pendiente.tipo, pendiente.fecha, pendiente.numero_factura,
     pendiente.proveedor, pendiente.nif, pendiente.concepto, pendiente.base_imponible,
     pendiente.porcentaje_iva, pendiente.cuota_iva, pendiente.total, driveUrl, sheetId, pendiente.file_hash, canal, pendiente.periodo_facturado || null, "documento", pendiente.creado_en || new Date().toISOString()]
  );
  const facturaId = ins?.id;

  // La marca de «esto es de toda la empresa» va justo después del alta: el documento queda
  // archivado como cualquier otro y lo único que cambia es cómo se reparte al sumar por local.
  // AQUÍ y no en el alta normal: `reparto` es una decisión que se toma AL ASIGNAR la pendiente
  // —es esta función la que lo recibe—. Estuvo nueve días en `procesarFactura`, donde esa
  // variable no existe, y como el bloque cae después de subir a Drive y después del INSERT y
  // fuera de todo `try`, cada factura que entraba se quedaba sin detalle y sin volcar, y quien
  // la mandaba veía un error aunque sí hubiera entrado.
  if (reparto === "empresa" && facturaId) {
    await dbRun(`UPDATE facturas SET reparto = 'empresa' WHERE id = ?`, [facturaId]).catch(() => {});
  }

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

  await reubicarEnDrive({factura:{...pendiente,id:facturaId,empresa,local:localContable,drive_url:driveUrl},getToken,dbGet});

  // Proyectar al Sheet (NO fatal): si falla, sheet_synced=0 y lo recoge el reintento.
  try {
    const anual = await sincronizarAnuales({getToken,dbGet,dbAll,dbRun}, {local:localContable,fecha:pendiente.fecha});
    const guardada = await dbGet('SELECT sheet_id FROM facturas WHERE id = ?', [facturaId]);
    const libro = anual.libros.find(l => l.id === guardada?.sheet_id);
    sheetId = libro?.id || null; sheetUrl = libro?.url || null;
  } catch (e) {
    console.error(`[Facturas] Proyección a Sheet (asignar) falló, queda pendiente de reintento: ${e.message}`);
  }

  return { driveUrl, sheetUrl, sheetId };
}

// ── Cola de reintentos: reproyecta a Sheets las facturas con sheet_synced=0 ──────────────
// La BD es la verdad; esto reconstruye la pestaña (local, mes) desde la BD y marca como sincronizadas.
// Idempotente y seguro: si Google sigue caído, no pasa nada y se reintenta al siguiente ciclo.
export async function reproyectarPendientes(deps) {
  const organizacion=await deps.dbGet('SELECT value FROM config WHERE key = ?',['facturas_drive_organizacion_pendiente']);
  if(organizacion?.value) {
    const r=await repararTodosLosSheets(deps);
    return {grupos:r.libros.length,sincronizados:r.total,fallidos:0};
  }
  const pendientes = await deps.dbAll('SELECT id FROM facturas WHERE COALESCE(sheet_synced,0)=0');
  const reintento = await deps.dbGet('SELECT value FROM config WHERE key = ?', ['facturas_anuales_reintentar']);
  if (!pendientes.length && !reintento?.value) return {grupos:0,sincronizados:0,fallidos:0};
  const r = await sincronizarAnuales(deps);
  return {grupos:r.libros.length,sincronizados:r.total,fallidos:0};
}
