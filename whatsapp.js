import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Eres el asistente virtual de Familia del Amor, un grupo de restauración con varios locales en la Costa Brava y el Maresme (Cataluña, España).

Nuestros locales son:
- La Tapeta - Blanes
- La Tapeta - Lloret de Mar
- La Tapeta - Girona
- Cooperativa - Blanes
- Can Mateu - Tordera
- La Tapa Ibérica - Tordera
- Botiga d'en Mateu - Tordera

Tu misión es atender a los clientes con calidez, en el idioma en que te escriban (español, catalán o inglés). Puedes ayudar con:
- Información sobre los locales y su cocina
- Cómo hacer una reserva (a través de nuestra web)
- Dudas sobre eventos, menús o disponibilidad
- Cualquier pregunta general sobre el grupo

Cuando alguien quiera hacer una reserva, indícale que puede hacerla directamente en nuestra web. Sé siempre amable, breve y cercano. No inventes información que no tengas — si no sabes algo concreto (horarios exactos, precio de un plato), dilo con naturalidad y ofrece que llamen al local.`;

const conversaciones = new Map();
const MAX_HISTORIAL = 10;

let sock = null;
let clientReady = false;
let lastQR = null;

async function responderConIA(jid, mensajeUsuario) {
  if (!conversaciones.has(jid)) conversaciones.set(jid, []);
  const historial = conversaciones.get(jid);

  historial.push({ role: "user", content: mensajeUsuario });
  if (historial.length > MAX_HISTORIAL * 2) historial.splice(0, 2);

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: historial
    });

    const respuesta = response.content[0].text;
    historial.push({ role: "assistant", content: respuesta });
    return respuesta;
  } catch (err) {
    console.error("Error IA:", err.message);
    return "Disculpa, en este momento no puedo responderte. Por favor llámanos directamente al local.";
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" })
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
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("Conexión cerrada, código:", code, "— reconectando:", shouldReconnect);
      if (shouldReconnect) {
        await connectToWhatsApp();
      } else {
        console.log("❌ Sesión cerrada. Borra auth_info_baileys/ y reinicia para volver a vincular.");
      }
    } else if (connection === "open") {
      clientReady = true;
      lastQR = null;
      console.log("✅ WhatsApp conectado y listo");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid.endsWith("@g.us")) continue; // ignorar grupos

      const texto =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        "";

      if (!texto.trim()) continue;

      const jid = msg.key.remoteJid;
      console.log(`💬 Mensaje de ${jid}: ${texto}`);

      try {
        await sock.sendPresenceUpdate("composing", jid);
        const respuesta = await responderConIA(jid, texto);
        await sock.sendMessage(jid, { text: respuesta });
        console.log(`📤 Respuesta enviada a ${jid}`);
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

export async function sendConfirmacionCliente(telefono, reserva) {
  if (!clientReady || !sock) return;
  try {
    const jid = formatPhone(telefono);
    const msg =
      `✅ *Reserva confirmada*\n\n` +
      `🏠 ${reserva.local}\n` +
      `📅 ${reserva.dia} a las ${reserva.hora}\n` +
      `👥 ${reserva.personas} persona${reserva.personas > 1 ? "s" : ""}\n` +
      `📛 A nombre de: ${reserva.nombre_reserva}\n\n` +
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
      `👤 ${reserva.nombre_reserva}\n` +
      `📅 ${reserva.dia} · ${reserva.hora}\n` +
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
