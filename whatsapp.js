import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, downloadMediaMessage } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Guardar credenciales en ruta persistente en Replit
function resolveAuthDir() {
  if (process.env.REPL_ID || process.env.REPL_SLUG) {
    const persistentDir = "/home/runner/latapeta-data/baileys_auth";
    try {
      fs.mkdirSync(persistentDir, { recursive: true });
      return persistentDir;
    } catch { /* usar workspace local */ }
  }
  return path.join(__dirname, "baileys_auth");
}
const AUTH_DIR = resolveAuthDir();

let anthropic = null;
function getAnthropic() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("[WhatsApp] ANTHROPIC_API_KEY no configurada — respuestas IA desactivadas");
      return null;
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

const SYSTEM_PROMPT = `Eres *Sara*, la asistente virtual de Familia del Amor, un grupo de restauración con varios locales en la Costa Brava y el Maresme (Cataluña, España). Tratas siempre de tú a los clientes — eres cercana, directa y simpática, como una buena camarera. Respondes siempre en el idioma en que te escriban (español, catalán o inglés).

**Norma de conversación:** nunca hagas más de dos preguntas en un mismo mensaje.

## Nuestros locales, ubicaciones y horarios
Todos los locales abren de 08:00 a 00:00 sin interrupción.

- **La Tapeta - Blanes** · Carrer de la Muralla, 21, Blanes · 📞 972 916 341
- **Cooperativa - Blanes** · Carrer de la Muralla, 28, Blanes · 📞 972 916 341
- **La Tapeta - Lloret** · Carrer Sant Pere, 84, Lloret de Mar · 📞 872 266 645
- **La Tapeta - Girona** · Avinguda Sant Francesc, 7, Girona · 📞 872 071 246
- **Can Mateu - Tordera** · Plaça de la Concòrdia, 5, Tordera · 📞 930 317 169
- **La Tapa Ibérica - Tordera** · Camí Ral, 6, Tordera · 📞 937 643 371
- **Botiga d'en Mateu - Tordera** · Camí Ral, 6, Tordera · 📞 930 317 169

## Reservas
Puedes gestionar reservas por WhatsApp. Para una reserva necesitas: local, día, hora, número de personas, nombre y teléfono.

Pide los datos que te falten de dos en dos. Si solo quedan 3 pendientes, pídelos todos a la vez. Nunca pidas más de dos cosas por mensaje. La hora debe caer en mediodía (12:30–15:30) o cena (19:30–22:30).

Cuando tengas todos los datos, usa la herramienta \`registrar_reserva\` y, según el resultado, confírmale la reserva al cliente (o avísale si hubo un problema).

**Reservas de más de 8 personas:** regístralas con \`pendiente: true\` y dile al cliente que su reserva queda registrada pero *no confirmada* hasta que un encargado le contacte para confirmar los detalles.

## Carta, platos y precios
Si alguien pregunta por la carta, platos concretos o precios, dile que de momento no tienes esa información disponible en el chat, y que puede escribir directamente al 622149946 y le atienden encantados.

## Celebraciones y eventos privados
Si alguien pregunta por celebraciones, cumpleaños, comuniones, eventos de empresa o similares, recoge:
1. Nombre completo
2. Tipo de celebración
3. Fecha aproximada
4. Número de personas
5. Local preferido (o si no tiene preferencia)
6. Teléfono de contacto

Pide los datos de dos en dos. Cuando tengas todo, usa la herramienta \`notificar_nerea\` (resumen empezando por "Celebración:") y dile al cliente que el equipo le contactará pronto.

## Empleo y trabajo con nosotros
Si alguien muestra interés en trabajar, recoge:
1. Nombre completo
2. Puesto o área de interés (cocina, sala, barra, gestión...)
3. Experiencia previa
4. Disponibilidad (jornada, horario)
5. Local preferido o zona
6. Teléfono de contacto

Pide los datos de dos en dos. Si adjuntan CV o archivo, diles que lo envíen directamente a este chat y quedará registrado. Cuando tengas todo, usa la herramienta \`notificar_nerea\` (resumen empezando por "Empleo:").

## Facturación y contabilidad
Si alguien pregunta por facturas, contabilidad o temas fiscales, dale el teléfono de Silvia: 645 619 572 y usa la herramienta \`notificar_silvia\` con un resumen breve de lo que necesita y su número de contacto si lo tienes.

## Disponibilidad y horario del chatbot
Estás disponible 24 horas. Aunque los locales abran de 08:00 a 00:00, siempre respondes.
Si alguien escribe fuera de horario, nunca digas que estamos cerrados — siempre busca una solución:
- Puedes tomar la reserva para la próxima franja disponible
- Puedes responder dudas informativas
- Puedes recoger datos de empleo o celebraciones aunque sea de madrugada
- Si necesitan hablar con alguien urgentemente, diles que dejen su número y les llamaremos al abrir

La actitud es siempre: "Estoy aquí para ayudarte, dime qué necesitas."

## Normas generales
- Tratas siempre de tú, con simpatía y naturalidad.
- Nunca hagas más de dos preguntas en un mensaje.
- No inventes información que no tengas.
- Las herramientas son internas: nunca le menciones al cliente que usas herramientas o sistemas.
- Si no sabes algo, dilo con naturalidad y ofrece alternativas.
- Nunca dejes a un cliente sin respuesta.`;

const LOCALES = [
  "La Tapeta - Blanes",
  "Cooperativa - Blanes",
  "La Tapeta - Lloret",
  "La Tapeta - Girona",
  "Can Mateu - Tordera",
  "La Tapa Ibérica - Tordera",
  "Botiga d'en Mateu - Tordera"
];

// Herramientas nativas con strict: la API valida el input contra el esquema,
// así que nunca llega una reserva malformada ni se filtran marcadores al cliente
const TOOLS = [
  {
    name: "registrar_reserva",
    description: "Registra una reserva en el sistema. Llámala SOLO cuando tengas los 6 datos: local, día, hora, personas, nombre y teléfono. Tras el resultado, confirma la reserva al cliente.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        local: { type: "string", enum: LOCALES, description: "Nombre exacto del local" },
        dia: { type: "string", format: "date", description: "Fecha de la reserva (YYYY-MM-DD)" },
        hora: { type: "string", description: "Hora en formato HH:MM, dentro de mediodía (12:30–15:30) o cena (19:30–22:30)" },
        personas: { type: "integer", description: "Número de comensales" },
        nombre_reserva: { type: "string", description: "Nombre de quien hace la reserva" },
        telefono: { type: "string", description: "Teléfono de contacto del cliente" },
        pendiente: { type: "boolean", description: "true solo si personas > 8 (queda pendiente de confirmación por un encargado)" }
      },
      required: ["local", "dia", "hora", "personas", "nombre_reserva", "telefono", "pendiente"],
      additionalProperties: false
    }
  },
  {
    name: "notificar_nerea",
    description: "Avisa a Nerea (responsable de equipo) por WhatsApp. Úsala cuando hayas recogido todos los datos de una celebración o evento privado (resumen empezando por 'Celebración:') o de un candidato de empleo (resumen empezando por 'Empleo:').",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        resumen: { type: "string", description: "Resumen con todos los datos recogidos, empezando por 'Celebración:' o 'Empleo:'" }
      },
      required: ["resumen"],
      additionalProperties: false
    }
  },
  {
    name: "notificar_silvia",
    description: "Avisa a Silvia (contabilidad) por WhatsApp. Úsala cuando un cliente pregunte por facturas, contabilidad o temas fiscales.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        resumen: { type: "string", description: "Resumen breve de lo que necesita el cliente, con su número de contacto si lo tienes" }
      },
      required: ["resumen"],
      additionalProperties: false
    }
  },
  {
    name: "guardar_dato_cliente",
    description: "Guarda un dato del cliente en su perfil permanente. Úsala cuando el cliente te diga su nombre durante la conversación, o cuando conozcas otro dato relevante (preferencia de local, alergia, etc.). Solo guarda datos que el cliente te haya comunicado explícitamente.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        campo: {
          type: "string",
          enum: ["nombre", "nota"],
          description: "'nombre' para guardar el nombre del cliente; 'nota' para cualquier otro dato relevante"
        },
        valor: { type: "string", description: "Valor a guardar" }
      },
      required: ["campo", "valor"],
      additionalProperties: false
    }
  },
  {
    name: "enviar_documento",
    description: "Envía al cliente un documento (carta/menú en PDF u otro) por WhatsApp. Úsala SOLO cuando en la sección 'DOCUMENTOS DISPONIBLES' del contexto haya un documento que encaje con lo que pide el cliente. Pasa el 'id' exacto indicado ahí. Si no hay un documento adecuado, no la uses.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        documento_id: { type: "integer", description: "El id del documento a enviar, tal cual aparece en 'DOCUMENTOS DISPONIBLES'" }
      },
      required: ["documento_id"],
      additionalProperties: false
    }
  }
];

const conversaciones = new Map();
const MAX_HISTORIAL = 10;
const DEBOUNCE_MS = 2500;
const SESION_TTL_SEG = 4 * 60 * 60; // nueva sesión tras 4h sin actividad
const batchPorJid = new Map(); // jid → { timer, items[] }

// Set para deduplicar mensajes automáticos de Sara frente a su evento fromMe en messages.upsert
// Clave: `${jid}:${texto.slice(0,100)}` — expira a los 15s
const _mensajesSistema = new Set();
function _marcarMensajeSistema(jid, texto) {
  const key = `${jid}:${texto.slice(0, 100)}`;
  _mensajesSistema.add(key);
  setTimeout(() => _mensajesSistema.delete(key), 15000);
}

export function addSaraToHistorial(jid, texto) {
  _marcarMensajeSistema(jid, texto); // evitar reentrada desde fromMe
  if (!conversaciones.has(jid)) conversaciones.set(jid, []);
  const historial = conversaciones.get(jid);
  historial.push({ role: "assistant", content: texto });
  if (historial.length > MAX_HISTORIAL * 2) historial.splice(0, 2);
}

// Hook para rehidratar el historial desde la BD tras un reinicio del proceso
let historialLoader = null;
export function setHistorialLoader(fn) { historialLoader = fn; }

// Cola por cliente: si llegan dos mensajes del mismo jid durante un bucle
// agéntico largo, se procesan en serie para no corromper el historial
const colasPorJid = new Map();
function encolarPorJid(jid, fn) {
  const anterior = colasPorJid.get(jid) || Promise.resolve();
  const tarea = anterior.catch(() => {}).then(fn);
  const enCola = tarea.catch(() => {}).finally(() => {
    if (colasPorJid.get(jid) === enCola) colasPorJid.delete(jid);
  });
  colasPorJid.set(jid, enCola);
  return tarea;
}
const NEREA_JID  = "34622065974@s.whatsapp.net";
const SILVIA_JID = "34645619572@s.whatsapp.net";
const LAURA_JID  = "34633018834@s.whatsapp.net";
const NTFY_TOPIC = "familia-del-amor-wa-7k9m2p";

const followupAwaitingReply = new Map();

async function sendNtfyAlert(title, body, priority = "urgent") {
  try {
    // Los headers HTTP solo admiten ASCII — eliminar emojis del título
    const safeTitle = title.replace(/[^\x00-\x7F]/g, "").trim();
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "Title": safeTitle,
        "Priority": priority,
        "Tags": priority === "urgent" ? "warning,robot" : "white_check_mark,robot"
      },
      body
    });
  } catch (e) {
    console.error("ntfy error:", e.message);
  }
}

let onReserva = null;
export function setOnReserva(fn) { onReserva = fn; }

let onReady = null;
export function setOnReady(fn) { onReady = fn; }

let onMessage = null;
export function setOnMessage(fn) { onMessage = fn; }

let perfilLoader = null;
export function setPerfilLoader(fn) { perfilLoader = fn; }

let onMensajeSaliente = null;
export function setOnMensajeSaliente(fn) { onMensajeSaliente = fn; }

let onActualizarPerfil = null;
export function setOnActualizarPerfil(fn) { onActualizarPerfil = fn; }

let onGroupAttachment = null;
export function setOnGroupAttachment(fn) { onGroupAttachment = fn; }

// Configuración editable de Sara (instrucciones de marketing, bloqueos, documentos).
// Devuelve un bloque de texto que se inyecta en el system prompt en cada conversación.
let saraConfigLoader = null;
export function setSaraConfigLoader(fn) { saraConfigLoader = fn; }

// Resuelve un documento configurado por su id → { buffer, filename, mimetype } (o null).
let documentoResolver = null;
export function setDocumentoResolver(fn) { documentoResolver = fn; }

export async function sendMensajeAGrupo(groupJid, texto) {
  if (!clientReady || !sock) throw new Error("WhatsApp no conectado");
  await sock.sendMessage(groupJid, { text: texto });
}

let sock = null;
let clientReady = false;
let lastQR = null;
let reconnectAttempts = 0;
let hasEverConnected = false;

export function markAwaitingFollowup(jid, ctx) {
  followupAwaitingReply.set(jid, ctx);
}

async function notificarLaura(texto) {
  if (!clientReady || !sock) return;
  try {
    await sock.sendMessage(LAURA_JID, { text: texto });
    console.log("📤 Notificación enviada a Laura");
  } catch (err) {
    console.error("Error notificando a Laura:", err.message);
  }
}

async function notificarNerea(resumen, adjuntoUrl) {
  if (!clientReady || !sock) return;
  try {
    const texto = `📋 *Nueva notificación del chatbot*\n\n${resumen}${adjuntoUrl ? `\n\n📎 Adjunto: ${adjuntoUrl}` : ""}`;
    await sock.sendMessage(NEREA_JID, { text: texto });
    console.log("📤 Notificación enviada a Nerea");
  } catch (err) {
    console.error("Error notificando a Nerea:", err.message);
  }
}

function getContextoFechaHora() {
  const ahora = new Date();
  return ahora.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function buildPerfilContext(perfil) {
  if (!perfil) return "";
  const partes = [];
  if (perfil.nombre) partes.push(`Nombre: ${perfil.nombre}`);
  if (perfil.telefono) partes.push(`Teléfono: ${perfil.telefono}`);
  if (perfil.notas && perfil.notas !== "{}") {
    try {
      const lista = Object.values(JSON.parse(perfil.notas)).filter(Boolean);
      if (lista.length) partes.push(`Notas: ${lista.join("; ")}`);
    } catch {}
  }
  return partes.length
    ? `[PERFIL DEL CLIENTE: ${partes.join(". ")}. Si conoces su nombre, úsalo con naturalidad sin volver a pedírselo.]`
    : "";
}

async function responderConIA(jid, mensajeUsuario, adjuntoUrl, contextoRetraso) {
  // 1. Cargar perfil permanente del cliente
  let perfil = null;
  if (perfilLoader) {
    try { perfil = await perfilLoader(jid); } catch (e) { console.error("Error cargando perfil WA:", e.message); }
  }

  // 2. TTL: si llevan más de 4h inactivos, nueva sesión (el perfil persiste)
  if (perfil?.ultima_interaccion && conversaciones.has(jid)) {
    const inactividadSeg = Math.floor(Date.now() / 1000) - perfil.ultima_interaccion;
    if (inactividadSeg > SESION_TTL_SEG) {
      conversaciones.delete(jid);
      console.log(`[Sara] Nueva sesión para ${jid} (${Math.round(inactividadSeg / 3600)}h inactivo)`);
    }
  }

  // 3. Rehidratar memoria desde la BD si el proceso se reinició a mitad de conversación
  if (!conversaciones.has(jid) && historialLoader) {
    try {
      const previo = await historialLoader(jid);
      if (previo?.length) conversaciones.set(jid, previo);
    } catch (err) {
      console.error("Error cargando historial WA:", err.message);
    }
  }

  const esPrimerMensaje = !conversaciones.has(jid);
  if (!conversaciones.has(jid)) conversaciones.set(jid, []);
  const historial = conversaciones.get(jid);

  const partesFecha = `[CONTEXTO INTERNO: Fecha y hora actual en España: ${getContextoFechaHora()}.]`;
  const partesRetraso = contextoRetraso ? ` ${contextoRetraso}` : "";
  // Si es primer contacto y no conocemos al cliente, Sara se presenta
  const partesPrimer = (esPrimerMensaje && !perfil?.nombre)
    ? " Es el primer mensaje de este cliente: preséntate como Sara, asistente de IA de Familia del Amor, y responde a su consulta."
    : "";
  const parteAdjunto = adjuntoUrl ? ` [Ha adjuntado un archivo: ${adjuntoUrl}]` : "";

  const contenidoUsuario =
    `${partesFecha}${partesRetraso}${partesPrimer} ${mensajeUsuario}${parteAdjunto}`;

  historial.push({ role: "user", content: contenidoUsuario });
  if (historial.length > MAX_HISTORIAL * 2) historial.splice(0, 2);

  const ai = getAnthropic();
  if (!ai) return "Lo siento, el asistente no está disponible en este momento.";

  // Configuración editable por marketing (instrucciones + bloqueos + documentos).
  // Se inyecta como segundo bloque de system, sin cache_control, para no invalidar
  // el caché del prompt fijo cuando marketing cambie algo.
  let saraConfigTexto = "";
  if (saraConfigLoader) {
    try { saraConfigTexto = (await saraConfigLoader()) || ""; }
    catch (e) { console.error("Error cargando config de Sara:", e.message); }
  }
  const systemBlocks = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];
  if (saraConfigTexto.trim()) systemBlocks.push({ type: "text", text: saraConfigTexto });

  try {
    // Perfil del cliente al inicio del contexto (no se persiste en historial duradero)
    const perfilCtx = buildPerfilContext(perfil);
    const mensajesLoop = perfilCtx
      ? [{ role: "user", content: perfilCtx }, { role: "assistant", content: "Entendido." }, ...historial]
      : [...historial];
    const textos = [];
    let huboErrorHerramienta = false;

    for (let i = 0; i < 5; i++) {
      const response = await ai.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        // Bloque 1 = prompt fijo (cacheable). Bloque 2 (opcional) = config de marketing.
        system: systemBlocks,
        tools: TOOLS,
        messages: mensajesLoop
      });

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) textos.push(block.text.trim());
      }

      if (response.stop_reason !== "tool_use") break;

      mensajesLoop.push({ role: "assistant", content: response.content });

      const resultados = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const { content, is_error } = await ejecutarHerramienta(block, adjuntoUrl, jid);
        if (is_error) huboErrorHerramienta = true;
        resultados.push({ type: "tool_result", tool_use_id: block.id, content, is_error });
      }
      mensajesLoop.push({ role: "user", content: resultados });
    }

    // Si el modelo no emitió texto, no confirmar en falso: depende de si hubo error
    const respuestaCliente = textos.join("\n\n") ||
      (huboErrorHerramienta
        ? "Perdona, ha habido un problema técnico al registrarlo 😔 Llámanos al local y te lo gestionamos al momento."
        : "¡Listo! ¿Puedo ayudarte en algo más? 😊");


    historial.push({ role: "assistant", content: respuestaCliente });
    return respuestaCliente;
  } catch (err) {
    console.error("Error IA completo:", err.status, err.message, err.error);
    // Nota: el SDK 0.97 no exporta OverloadedError como clase; el 529 se detecta por status
    if (err instanceof Anthropic.RateLimitError || err?.status === 529) {
      return "¡Uy! Ahora mismo estoy atendiendo muchas conversaciones a la vez 😅 Dame un minutito y vuelve a escribirme, porfa.";
    }
    return "¡Hola! 👋 Gracias por escribirnos. En este momento estamos teniendo problemas técnicos. Puedes llamarnos directamente al local más cercano y te atendemos encantados.";
  }
}

// Ejecuta una herramienta solicitada por el modelo y devuelve el resultado.
// Si falla, el modelo se entera (is_error) y avisa al cliente — antes las
// reservas con JSON malformado se perdían en silencio.
async function ejecutarHerramienta(toolUse, adjuntoUrl, jid) {
  const { name, input } = toolUse;
  try {
    if (name === "registrar_reserva") {
      if (!onReserva) throw new Error("sistema de reservas no disponible");
      const resultado = await onReserva(input, jid);
      // Si el local está bloqueado esas fechas, onReserva devuelve { ok:false, motivo }.
      // No es un error técnico: Sara debe explicárselo al cliente con amabilidad.
      if (resultado && resultado.ok === false) {
        return {
          content: `No se ha registrado la reserva porque en esas fechas no se aceptan reservas en ${input.local}${resultado.motivo ? ` (${resultado.motivo})` : ""}. Explícaselo al cliente con amabilidad y, si quieres, ofrécele otra fecha.`,
          is_error: false
        };
      }
      return {
        content: input.pendiente
          ? "Reserva registrada como PENDIENTE. Un encargado contactará al cliente para confirmarla."
          : "Reserva registrada correctamente.",
        is_error: false
      };
    }
    if (name === "enviar_documento") {
      if (!documentoResolver) throw new Error("envío de documentos no disponible");
      if (!clientReady || !sock) throw new Error("WhatsApp no conectado");
      const doc = await documentoResolver(input.documento_id);
      if (!doc || !doc.buffer) {
        return { content: "No se encontró ese documento. No inventes que lo has enviado; ofrece ayudar de otro modo.", is_error: false };
      }
      await sock.sendMessage(jid, {
        document: doc.buffer,
        mimetype: doc.mimetype || "application/pdf",
        fileName: doc.filename || "documento.pdf"
      });
      return { content: "Documento enviado al cliente correctamente.", is_error: false };
    }
    if (name === "notificar_nerea") {
      await notificarNerea(input.resumen, adjuntoUrl);
      return { content: "Notificación enviada a Nerea.", is_error: false };
    }
    if (name === "notificar_silvia") {
      if (!clientReady || !sock) throw new Error("WhatsApp no conectado");
      await sock.sendMessage(SILVIA_JID, {
        text: `📋 *Consulta de contabilidad via chatbot*\n\n${input.resumen}`
      });
      console.log("📤 Notificación enviada a Silvia");
      return { content: "Notificación enviada a Silvia.", is_error: false };
    }
    if (name === "guardar_dato_cliente") {
      if (onActualizarPerfil) await onActualizarPerfil(jid, input);
      return { content: "Perfil del cliente actualizado.", is_error: false };
    }
    return { content: `Herramienta desconocida: ${name}`, is_error: true };
  } catch (err) {
    console.error(`Error ejecutando ${name}:`, err.message);
    return {
      content: `Error: ${err.message}. Informa al cliente de que ha habido un problema técnico y ofrécele llamar al local.`,
      is_error: true
    };
  }
}

async function procesarBatch(jid, items) {
  const textoCombinado = items.map(i => i.textoFinal).join("\n");
  const adjuntoInfo = items.find(i => i.tieneAdjunto) ? `[adjunto recibido de ${jid}]` : null;
  const contextoRetraso = items.find(i => i.contextoRetraso)?.contextoRetraso || null;

  if (followupAwaitingReply.has(jid)) {
    const ctx = followupAwaitingReply.get(jid);
    followupAwaitingReply.delete(jid);
    const ack = `¡Gracias por contárnoslo! 🙏 Tu opinión nos ayuda a seguir mejorando. En caso de haber algo que podamos hacer mejor, ya lo hemos reportado al equipo. ¡Hasta pronto!`;
    try {
      await sock.sendPresenceUpdate("composing", jid);
      await sock.sendMessage(jid, { text: ack });
      await notificarLaura(
        `💬 *Feedback de cliente*\n\n` +
        `👤 ${ctx.nombre}\n📍 ${ctx.local}\n📅 Visita: ${ctx.dia}\n\n` +
        `Mensaje: ${textoCombinado}`
      );
      if (onMessage) onMessage({ jid, texto: textoCombinado, respuesta: ack });
    } catch (err) {
      console.error("Error gestionando follow-up reply:", err.message);
    }
    return;
  }

  try {
    await sock.sendPresenceUpdate("composing", jid);
    const respuesta = await encolarPorJid(jid, () => responderConIA(jid, textoCombinado, adjuntoInfo, contextoRetraso));
    await sock.sendMessage(jid, { text: respuesta });
    console.log(`📤 Respuesta enviada a ${jid}`);
    if (onMessage) onMessage({ jid, texto: textoCombinado, respuesta });
  } catch (err) {
    console.error("Error respondiendo:", err.message);
  }
}

function procesarConDebounce(jid, item) {
  if (!batchPorJid.has(jid)) batchPorJid.set(jid, { timer: null, items: [] });
  const batch = batchPorJid.get(jid);
  clearTimeout(batch.timer);
  batch.items.push(item);
  batch.timer = setTimeout(() => {
    batchPorJid.delete(jid);
    procesarBatch(jid, batch.items).catch(err => console.error("Error en procesarBatch:", err.message));
  }, DEBOUNCE_MS);
}

function scheduleReconnect() {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60000);
  reconnectAttempts++;
  console.log(`[WhatsApp] Reconectando en ${delay / 1000}s (intento ${reconnectAttempts})...`);
  setTimeout(() => {
    connectToWhatsApp().catch(e => console.error("Error reconectando:", e.message));
  }, delay);
}

async function connectToWhatsApp() {
  // Limpiar socket viejo antes de crear uno nuevo
  if (sock) {
    try { sock.ws?.close(); } catch (_) {}
    sock = null;
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  console.log(`[WhatsApp] Auth dir: ${AUTH_DIR} | Intento ${reconnectAttempts + 1}`);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    keepAliveIntervalMs: 25000,   // ping cada 25s para mantener viva la conexión TCP
    connectTimeoutMs: 60000,
    browser: Browsers.macOS("Chrome"),
    getMessage: async () => ({ conversation: "" })
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      lastQR = qr;
      clientReady = false;
      console.log("\n📱 QR disponible en el panel de encargados\n");
    }
    if (connection === "close") {
      clientReady = false;
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "desconocido";
      console.log(`[WhatsApp] Conexión cerrada — código: ${code} | razón: ${reason}`);

      if (code === DisconnectReason.loggedOut) {
        console.log("❌ Sesión cerrada (loggedOut). Escanea el QR para reconectar.");
        await sendNtfyAlert(
          "⚠️ WhatsApp desconectado — acción requerida",
          "La sesión se ha cerrado. Entra en Dirección → WhatsApp y escanea el QR para volver a conectar."
        );
        return; // No reconectar automáticamente: se necesita nuevo QR
      }

      // Código 408 = QR expiró sin ser escaneado.
      // Tras 3 intentos sin éxito, pausar para no saturar a WhatsApp.
      if (code === 408 && reconnectAttempts >= 3) {
        console.log(`[WhatsApp] QR ignorado ${reconnectAttempts} veces — pausando reconexión automática. Escanea el QR manualmente.`);
        await sendNtfyAlert(
          "⚠️ WhatsApp esperando QR",
          "El QR lleva varios intentos sin escanearse. Entra en Dirección → WhatsApp y escanéalo para activar el chatbot."
        );
        return; // Parar — esperar acción manual
      }

      if (reconnectAttempts >= 4) {
        await sendNtfyAlert(
          "⚠️ WhatsApp con problemas de conexión",
          `Lleva ${reconnectAttempts} intentos fallidos. Código: ${code}. Revisa Replit.`
        );
      }

      scheduleReconnect();
    } else if (connection === "open") {
      reconnectAttempts = 0;
      clientReady = true;
      lastQR = null;
      console.log("✅ WhatsApp conectado y listo");
      if (hasEverConnected) {
        await sendNtfyAlert(
          "✅ WhatsApp reconectado",
          "El chatbot está de nuevo activo y listo para responder.",
          "default"
        );
      }
      hasEverConnected = true;
      if (onReady) setTimeout(() => onReady(), 2000);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messaging-history.set", ({ messages }) => {
    if (!onMessage) return;
    const cutoff = Math.floor(Date.now() / 1000) - 5 * 24 * 3600;

    const byJid = {};
    for (const msg of messages) {
      const jid = msg.key?.remoteJid;
      if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      const ts = Number(msg.messageTimestamp) || 0;
      if (ts < cutoff) continue;
      if (!byJid[jid]) byJid[jid] = [];
      byJid[jid].push(msg);
    }

    for (const [jid, msgs] of Object.entries(byJid)) {
      msgs.sort((a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp));
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        if (msg.key.fromMe) continue;
        const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (!texto.trim()) continue;

        let respuesta = "(sin respuesta registrada)";
        for (let j = i + 1; j < msgs.length; j++) {
          const next = msgs[j];
          if (!next.key.fromMe) break;
          if (Number(next.messageTimestamp) - Number(msg.messageTimestamp) > 300) break;
          const t = next.message?.conversation || next.message?.extendedTextMessage?.text || "";
          if (t) { respuesta = t; break; }
        }
        onMessage({ jid, texto: texto.trim(), respuesta, historico: true });
      }
    }
    console.log(`📜 Historial WA procesado: ${Object.keys(byJid).length} conversaciones`);
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) {
        // Capturar mensajes manuales del operador para que Sara tenga contexto
        const jidDest = msg.key.remoteJid;
        if (jidDest && !jidDest.endsWith("@g.us") && jidDest !== "status@broadcast") {
          const textoManual =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text || "";
          const t = textoManual.trim();
          const deduKey = `${jidDest}:${t.slice(0, 100)}`;
          if (t && !_mensajesSistema.has(deduKey)) {
            // Mensaje escrito a mano por el operador — añadir al contexto de Sara
            if (!conversaciones.has(jidDest)) conversaciones.set(jidDest, []);
            const h = conversaciones.get(jidDest);
            h.push({ role: "assistant", content: t });
            if (h.length > MAX_HISTORIAL * 2) h.splice(0, 2);
            if (onMensajeSaliente) onMensajeSaliente({ jid: jidDest, mensaje: t, esManual: true });
            console.log(`✍️ Mensaje manual del operador → ${jidDest.split("@")[0]}: ${t.slice(0, 60)}`);
          }
        }
        continue;
      }

      const jid = msg.key.remoteJid;

      // Grupos: solo procesar si hay adjunto y hay handler registrado
      if (jid?.endsWith("@g.us")) {
        if (!onGroupAttachment) continue;
        const docMsg = msg.message?.documentMessage;
        const imgMsg = msg.message?.imageMessage;
        if (!docMsg && !imgMsg) continue;
        try {
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          const mimeType = docMsg?.mimetype || imgMsg?.mimetype || "image/jpeg";
          const filename = docMsg?.fileName || `imagen_${Date.now()}.jpg`;
          const caption = docMsg?.caption || imgMsg?.caption || "";
          const senderJid = msg.key.participant || jid;
          onGroupAttachment({ groupJid: jid, senderJid, buffer, mimeType, filename, caption });
        } catch (err) {
          console.error("[WA] Error descargando adjunto de grupo:", err.message);
        }
        continue;
      }

      const texto =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        "";

      const tieneAdjunto = !!(
        msg.message?.imageMessage ||
        msg.message?.documentMessage ||
        msg.message?.audioMessage ||
        msg.message?.videoMessage
      );

      const textoFinal = texto.trim() || (tieneAdjunto ? "[Archivo adjunto sin texto]" : "");
      if (!textoFinal) continue;

      const msgTimestamp = (msg.messageTimestamp || 0) * 1000;
      const minutosRetraso = Math.round((Date.now() - msgTimestamp) / 60000);
      let contextoRetraso = null;
      if (minutosRetraso > 5) {
        const fechaEnvio = new Date(msgTimestamp).toLocaleString("es-ES", {
          timeZone: "Europe/Madrid",
          weekday: "long", day: "numeric", month: "long",
          hour: "2-digit", minute: "2-digit"
        });
        const horasRetraso = minutosRetraso >= 60 ? `${Math.round(minutosRetraso / 60)} horas` : `${minutosRetraso} minutos`;
        contextoRetraso = `[CONTEXTO INTERNO: Este mensaje fue enviado el ${fechaEnvio} (hace ${horasRetraso}). El chatbot estuvo desconectado. Pide disculpas brevemente por no haber respondido antes. Si el cliente pedía reserva para una fecha que ya ha pasado, ofrécele alternativas amablemente.]`;
        console.log(`⏰ Mensaje con retraso de ${horasRetraso} de ${jid}`);
      }

      console.log(`💬 Mensaje de ${jid}: ${textoFinal}`);
      procesarConDebounce(jid, { textoFinal, tieneAdjunto, msgTimestamp, contextoRetraso });
    }
  });
}

function formatPhone(telefono) {
  let num = telefono.replace(/\D/g, "");
  if (num.startsWith("00")) num = num.slice(2);
  if (!num.startsWith("34") && (num.startsWith("6") || num.startsWith("7") || num.startsWith("9"))) {
    num = "34" + num;
  }
  return `${num}@s.whatsapp.net`;
}

export async function sendMensajeLibre(telefono, texto) {
  if (!clientReady || !sock) throw new Error("WhatsApp no conectado");
  const jid = formatPhone(telefono);
  await sock.sendMessage(jid, { text: texto });
}

export async function sendDocumentoLibre(telefono, buffer, filename, mimetype) {
  if (!clientReady || !sock) throw new Error("WhatsApp no conectado");
  const jid = formatPhone(telefono);
  await sock.sendMessage(jid, {
    document: buffer,
    mimetype: mimetype || "application/octet-stream",
    fileName: filename,
  });
}

const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function formatFecha(dia) {
  const [y, m, d] = dia.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DIAS_ES[date.getDay()]} ${d} de ${MESES_ES[m - 1]}`;
}

export async function sendConfirmacionCliente(telefono, reserva) {
  if (!clientReady || !sock) return;
  try {
    const jid = formatPhone(telefono);
    const nombre = reserva.nombre_reserva.split(" ")[0];
    const msg =
      `¡Hola ${nombre}! 😊 Soy Sara, la asistente virtual de Familia del Amor. Te escribo para confirmarte la reserva:\n\n` +
      `✅ *Reserva confirmada*\n\n` +
      `🏠 ${reserva.local}\n` +
      `📅 ${formatFecha(reserva.dia)}\n` +
      `⏰ ${reserva.hora}\n` +
      `👥 ${reserva.personas} persona${reserva.personas > 1 ? "s" : ""}\n` +
      `🪪 A nombre de: ${reserva.nombre_reserva}\n\n` +
      `¡Te esperamos! Si necesitas cancelar o modificar, escríbenos aquí o llámanos.`;
    await sock.sendMessage(jid, { text: msg });
    addSaraToHistorial(jid, msg);
    if (onMensajeSaliente) onMensajeSaliente({ jid, mensaje: msg });
    console.log(`📤 Confirmación enviada a ${telefono}`);
  } catch (err) {
    console.error("Error enviando confirmación:", err.message);
  }
}

export async function sendConfirmacionPendienteCliente(telefono, reserva) {
  if (!clientReady || !sock) return;
  try {
    const jid = formatPhone(telefono);
    const nombre = reserva.nombre_reserva.split(" ")[0];
    const msg =
      `¡Hola ${nombre}! 😊 Soy Sara, la asistente virtual de Familia del Amor. Te escribo para confirmarte que hemos recibido tu solicitud de reserva:\n\n` +
      `⏳ *Reserva pendiente de confirmación*\n\n` +
      `🏠 ${reserva.local}\n` +
      `📅 ${formatFecha(reserva.dia)}\n` +
      `⏰ ${reserva.hora}\n` +
      `👥 ${reserva.personas} personas\n` +
      `🪪 A nombre de: ${reserva.nombre_reserva}\n\n` +
      `Por el número de comensales, un encargado se pondrá en contacto contigo en breve para confirmar todos los detalles. ¡Gracias!`;
    await sock.sendMessage(jid, { text: msg });
    addSaraToHistorial(jid, msg);
    if (onMensajeSaliente) onMensajeSaliente({ jid, mensaje: msg });
    console.log(`📤 Confirmación pendiente enviada a ${telefono}`);
  } catch (err) {
    console.error("Error enviando confirmación pendiente:", err.message);
  }
}

export async function sendNotificacionGrupo(groupId, reserva) {
  if (!clientReady || !sock || !groupId) return;
  try {
    const msg =
      `🍽️ *Nueva reserva*\n\n` +
      `🪪 ${reserva.nombre_reserva}\n` +
      `📅 ${formatFecha(reserva.dia)}\n` +
      `⏰ ${reserva.hora}\n` +
      `👥 ${reserva.personas} persona${reserva.personas > 1 ? "s" : ""}\n` +
      `📞 ${reserva.telefono}`;
    await sock.sendMessage(groupId, { text: msg });
    console.log(`📤 Notificación enviada al grupo de ${reserva.local}`);
  } catch (err) {
    console.error("Error enviando a grupo:", err.message);
  }
}

export async function sendNotificacionGrupoPendiente(groupId, reserva) {
  if (!clientReady || !sock || !groupId) return;
  try {
    const msg =
      `⚠️ *RESERVA POR CONFIRMAR*\n\n` +
      `🪪 ${reserva.nombre_reserva}\n` +
      `📅 ${formatFecha(reserva.dia)}\n` +
      `⏰ ${reserva.hora}\n` +
      `👥 ${reserva.personas} personas\n` +
      `📞 ${reserva.telefono}\n` +
      `📍 ${reserva.local}\n\n` +
      `Responde con *OK* cuando hayas hablado con el cliente.`;
    await sock.sendMessage(groupId, { text: msg });
    console.log(`📤 Notificación pendiente enviada al grupo de ${reserva.local}`);
  } catch (err) {
    console.error("Error enviando reserva pendiente al grupo:", err.message);
  }
}

export async function sendCancelacionCliente(telefono, reserva) {
  if (!clientReady || !sock) return;
  try {
    const jid = formatPhone(telefono);
    const msg =
      `❌ *Reserva cancelada*\n\n` +
      `🏠 ${reserva.local}\n` +
      `📅 ${formatFecha(reserva.dia)}\n` +
      `⏰ ${reserva.hora}\n` +
      `👥 ${reserva.personas} persona${reserva.personas > 1 ? "s" : ""}\n` +
      `🪪 A nombre de: ${reserva.nombre_reserva}\n\n` +
      `Tu reserva ha sido cancelada. Si tienes dudas, llámanos.`;
    await sock.sendMessage(jid, { text: msg });
    addSaraToHistorial(jid, msg);
    if (onMensajeSaliente) onMensajeSaliente({ jid, mensaje: msg });
    console.log(`📤 Cancelación enviada a ${telefono}`);
  } catch (err) {
    console.error("Error enviando cancelación al cliente:", err.message);
  }
}

export async function sendCancelacionGrupo(groupId, reserva) {
  if (!clientReady || !sock || !groupId) return;
  try {
    const msg =
      `❌ *Reserva cancelada*\n\n` +
      `🪪 ${reserva.nombre_reserva}\n` +
      `📅 ${formatFecha(reserva.dia)}\n` +
      `⏰ ${reserva.hora}\n` +
      `👥 ${reserva.personas} persona${reserva.personas > 1 ? "s" : ""}\n` +
      `📞 ${reserva.telefono}`;
    await sock.sendMessage(groupId, { text: msg });
    console.log(`📤 Cancelación enviada al grupo de ${reserva.local}`);
  } catch (err) {
    console.error("Error enviando cancelación al grupo:", err.message);
  }
}

export async function getGroups() {
  if (!clientReady || !sock) return [];
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({ id: g.id, name: g.subject }));
  } catch (err) {
    console.error("Error obteniendo grupos:", err.message);
    return [];
  }
}

export function isReady() {
  return clientReady;
}

export async function getQRImage() {
  if (!lastQR) return null;
  return QRCode.toDataURL(lastQR, { width: 300, margin: 2 });
}

export function initWhatsApp() {
  connectToWhatsApp().catch((err) => console.error("Error iniciando WhatsApp:", err));
}
