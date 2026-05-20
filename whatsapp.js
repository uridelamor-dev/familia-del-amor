import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Guardar credenciales junto a la BD (ruta persistente en Replit)
const DB_DIR = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : __dirname;
const AUTH_DIR = path.join(DB_DIR, "baileys_auth");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Eres el asistente virtual de Familia del Amor, un grupo de restauración con varios locales en la Costa Brava y el Maresme (Cataluña, España). Respondes siempre en el idioma en que te escriban (español, catalán o inglés). Eres amable, cercano y breve.

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
Puedes gestionar reservas directamente por WhatsApp. Cuando alguien quiera reservar, recoge estos datos en orden:
1. Local donde quiere reservar
2. Día (convierte siempre al formato YYYY-MM-DD, por ejemplo "mañana" → fecha correcta, "el viernes" → fecha correcta)
3. Hora (formato HH:MM, elige entre mediodía 12:30-15:30 o cena 19:30-22:30)
4. Número de personas
5. Nombre para la reserva
6. Teléfono de contacto (si no lo tienes ya del contexto)

Cuando tengas todos los datos, confírmaselos al cliente y añade al final:
##RESERVA##{"local":"nombre exacto del local","dia":"YYYY-MM-DD","hora":"HH:MM","personas":N,"nombre_reserva":"nombre","telefono":"telefono"}##

Usa siempre el nombre exacto del local tal como aparece en la lista (ej: "La Tapeta - Blanes").

## Celebraciones y eventos privados
Si alguien pregunta por celebraciones, cumpleaños, comuniones, eventos de empresa o similares, recoge amablemente esta información:
1. Nombre completo
2. Tipo de celebración
3. Fecha aproximada
4. Número de personas
5. Local preferido (o si no tiene preferencia)
6. Teléfono de contacto

Cuando tengas todos esos datos, responde normalmente al cliente Y añade al final de tu mensaje, en una línea separada, este bloque oculto exactamente así (no lo muestres bonito, ponlo tal cual):
##NOTIF_NEREA##Celebración: [resumen con todos los datos recogidos]##

## Empleo y trabajo con nosotros
Si alguien muestra interés en trabajar con nosotros, recoge esta información:
1. Nombre completo
2. Puesto o área de interés (cocina, sala, barra, gestión...)
3. Experiencia previa
4. Disponibilidad (jornada, horario)
5. Local preferido o zona
6. Teléfono de contacto

Si adjuntan un CV o archivo, indícales que lo envíen directamente a este chat y quedará registrado.
Cuando tengas todos esos datos, responde al cliente Y añade al final:
##NOTIF_NEREA##Empleo: [resumen con todos los datos recogidos]##

## Facturación y contabilidad
Si alguien pregunta por facturas, contabilidad o temas fiscales, dale el teléfono de Silvia: 645 619 572.
Cuando des ese teléfono, añade al final de tu mensaje:
##NOTIF_SILVIA##Contabilidad: [resumen breve de lo que necesita el cliente y su número de contacto si lo has recogido]##

## Disponibilidad y horario del chatbot
Estás disponible 24 horas. Aunque los locales abran de 08:00 a 00:00, tú siempre respondes.
Si alguien escribe fuera de ese horario, nunca les digas simplemente que estamos cerrados — siempre busca una solución:
- Puedes tomar su reserva para la próxima franja disponible
- Puedes responder cualquier duda informativa
- Puedes recoger datos de empleo o celebraciones aunque sea de madrugada
- Si necesitan hablar con alguien urgentemente, diles que dejen su número y les llamaremos en cuanto abramos

La actitud es siempre: "Estoy aquí para ayudarte, dime qué necesitas."

## Normas generales
- No inventes información que no tengas.
- Nunca muestres los bloques ##NOTIF_NEREA##, ##NOTIF_SILVIA## ni ##RESERVA## al cliente.
- Si no sabes algo, dilo con naturalidad y ofrece alternativas.
- Nunca dejes a un cliente sin respuesta ni solución.`;

const conversaciones = new Map();
const MAX_HISTORIAL = 10;
const NEREA_JID = "34622065974@s.whatsapp.net";
const SILVIA_JID = "34645619572@s.whatsapp.net";
const NTFY_TOPIC = "familia-del-amor-wa-7k9m2p";

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
  const esPrimerMensaje = !conversaciones.has(jid);
  if (!conversaciones.has(jid)) conversaciones.set(jid, []);
  const historial = conversaciones.get(jid);

  const partesFecha = `[CONTEXTO INTERNO: Fecha y hora actual en España: ${getContextoFechaHora()}.]`;
  const partesRetraso = contextoRetraso ? ` ${contextoRetraso}` : "";
  const partesPrimer = esPrimerMensaje ? " Salúdale cordialmente antes de responder a su consulta." : "";
  const parteAdjunto = adjuntoUrl ? ` [Ha adjuntado un archivo: ${adjuntoUrl}]` : "";

  const contenidoUsuario =
    `${partesFecha}${partesRetraso}${partesPrimer} ${mensajeUsuario}${parteAdjunto}`;

  historial.push({ role: "user", content: contenidoUsuario });
  if (historial.length > MAX_HISTORIAL * 2) historial.splice(0, 2);

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: historial
    });

    const respuestaCompleta = response.content[0].text;

    let respuestaCliente = respuestaCompleta;

    const notifNerea = respuestaCompleta.match(/##NOTIF_NEREA##(.+?)##/s);
    if (notifNerea) {
      respuestaCliente = respuestaCliente.replace(/\n?##NOTIF_NEREA##.+?##/s, "").trim();
      await notificarNerea(notifNerea[1].trim(), adjuntoUrl);
    }

    const notifSilvia = respuestaCliente.match(/##NOTIF_SILVIA##(.+?)##/s);
    if (notifSilvia) {
      respuestaCliente = respuestaCliente.replace(/\n?##NOTIF_SILVIA##.+?##/s, "").trim();
      try {
        await sock.sendMessage(SILVIA_JID, {
          text: `📋 *Consulta de contabilidad via chatbot*\n\n${notifSilvia[1].trim()}`
        });
        console.log("📤 Notificación enviada a Silvia");
      } catch (err) {
        console.error("Error notificando a Silvia:", err.message);
      }
    }

    const reservaMatch = respuestaCliente.match(/##RESERVA##(.+?)##/s);
    if (reservaMatch) {
      respuestaCliente = respuestaCliente.replace(/\n?##RESERVA##.+?##/s, "").trim();
      try {
        const reservaData = JSON.parse(reservaMatch[1].trim());
        if (onReserva) await onReserva(reservaData);
      } catch (err) {
        console.error("Error procesando reserva desde WhatsApp:", err.message);
      }
    }

    historial.push({ role: "assistant", content: respuestaCliente });
    return respuestaCliente;
  } catch (err) {
    console.error("Error IA completo:", err.status, err.message, err.error);
    return "¡Hola! 👋 Gracias por escribirnos. En este momento estamos teniendo problemas técnicos. Puedes llamarnos directamente al local más cercano y te atendemos encantados.";
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
    browser: ["Familia del Amor Chatbot", "Chrome", "1.0.0"],
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
    const msg =
      `✅ *Reserva confirmada*\n\n` +
      `🏠 ${reserva.local}\n` +
      `📅 ${formatFecha(reserva.dia)}\n` +
      `⏰ ${reserva.hora}\n` +
      `👥 ${reserva.personas} persona${reserva.personas > 1 ? "s" : ""}\n` +
      `🪪 A nombre de: ${reserva.nombre_reserva}\n\n` +
      `¡Te esperamos! Si necesitas cancelar o modificar, llámanos.`;
    await sock.sendMessage(jid, { text: msg });
    console.log(`📤 Confirmación enviada a ${telefono}`);
  } catch (err) {
    console.error("Error enviando confirmación:", err.message);
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
