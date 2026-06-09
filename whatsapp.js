import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers } from "@whiskeysockets/baileys";
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
  }
];

const conversaciones = new Map();
const MAX_HISTORIAL = 10;

// Hook para rehidratar el historial desde la BD tras un reinicio del proceso
let historialLoader = null;
export function setHistorialLoader(fn) { historialLoader = fn; }
const NEREA_JID  = "34622065974@s.whatsapp.net";
const SILVIA_JID = "34645619572@s.whatsapp.net";
const LAURA_JID  = "34633018834@s.whatsapp.net";
const NTFY_TOPIC = "familia-del-amor-wa-7k9m2p";

const followupAwaitingReply = new Map();

async function sendNtfyAlert(title, body, priority = "urgent") {
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "Title": title,
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

async function responderConIA(jid, mensajeUsuario, adjuntoUrl, contextoRetraso) {
  // Rehidratar memoria desde la BD si el proceso se reinició a mitad de conversación
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
  const partesPrimer = esPrimerMensaje ? " Es el primer mensaje de este cliente: preséntate como Sara, asistente de IA de Familia del Amor, y responde a su consulta." : "";
  const parteAdjunto = adjuntoUrl ? ` [Ha adjuntado un archivo: ${adjuntoUrl}]` : "";

  const contenidoUsuario =
    `${partesFecha}${partesRetraso}${partesPrimer} ${mensajeUsuario}${parteAdjunto}`;

  historial.push({ role: "user", content: contenidoUsuario });
  if (historial.length > MAX_HISTORIAL * 2) historial.splice(0, 2);

  const ai = getAnthropic();
  if (!ai) return "Lo siento, el asistente no está disponible en este momento.";

  try {
    // Bucle agéntico: los tool_use/tool_result intermedios viven solo en esta
    // llamada; al historial duradero solo van textos (evita pares huérfanos al recortar)
    const mensajesLoop = [...historial];
    const textos = [];

    for (let i = 0; i < 5; i++) {
      const response = await ai.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        // El caché se activará cuando el prompt supere el mínimo cacheable de
        // Haiku 4.5 (4096 tokens), p. ej. al añadir la carta al prompt
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
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
        const { content, is_error } = await ejecutarHerramienta(block, adjuntoUrl);
        resultados.push({ type: "tool_result", tool_use_id: block.id, content, is_error });
      }
      mensajesLoop.push({ role: "user", content: resultados });
    }

    const respuestaCliente = textos.join("\n\n") ||
      "¡Listo! ¿Puedo ayudarte en algo más? 😊";


    historial.push({ role: "assistant", content: respuestaCliente });
    return respuestaCliente;
  } catch (err) {
    console.error("Error IA completo:", err.status, err.message, err.error);
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.OverloadedError) {
      return "¡Uy! Ahora mismo estoy atendiendo muchas conversaciones a la vez 😅 Dame un minutito y vuelve a escribirme, porfa.";
    }
    return "¡Hola! 👋 Gracias por escribirnos. En este momento estamos teniendo problemas técnicos. Puedes llamarnos directamente al local más cercano y te atendemos encantados.";
  }
}

// Ejecuta una herramienta solicitada por el modelo y devuelve el resultado.
// Si falla, el modelo se entera (is_error) y avisa al cliente — antes las
// reservas con JSON malformado se perdían en silencio.
async function ejecutarHerramienta(toolUse, adjuntoUrl) {
  const { name, input } = toolUse;
  try {
    if (name === "registrar_reserva") {
      if (!onReserva) throw new Error("sistema de reservas no disponible");
      await onReserva(input);
      return {
        content: input.pendiente
          ? "Reserva registrada como PENDIENTE. Un encargado contactará al cliente para confirmarla."
          : "Reserva registrada correctamente.",
        is_error: false
      };
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
    return { content: `Herramienta desconocida: ${name}`, is_error: true };
  } catch (err) {
    console.error(`Error ejecutando ${name}:`, err.message);
    return {
      content: `Error: ${err.message}. Informa al cliente de que ha habido un problema técnico y ofrécele llamar al local.`,
      is_error: true
    };
  }
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
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid.endsWith("@g.us")) continue; // ignorar grupos

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

      const jid = msg.key.remoteJid;
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

      // Respuesta al mensaje de follow-up post-visita
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
            `Mensaje: ${textoFinal}`
          );
          if (onMessage) onMessage({ jid, texto: textoFinal, respuesta: ack });
        } catch (err) {
          console.error("Error gestionando follow-up reply:", err.message);
        }
        continue;
      }

      try {
        await sock.sendPresenceUpdate("composing", jid);
        const adjuntoInfo = tieneAdjunto ? `[adjunto recibido de ${jid}]` : null;
        const respuesta = await responderConIA(jid, textoFinal, adjuntoInfo, contextoRetraso);
        await sock.sendMessage(jid, { text: respuesta });
        console.log(`📤 Respuesta enviada a ${jid}`);
        if (onMessage) onMessage({ jid, texto: textoFinal, respuesta });
      } catch (err) {
        console.error("Error respondiendo:", err.message);
      }
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
