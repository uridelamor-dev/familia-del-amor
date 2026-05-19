import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Eres el asistente virtual de Familia del Amor, un grupo de restauración con varios locales en la Costa Brava y el Maresme (Cataluña, España). Respondes siempre en el idioma en que te escriban (español, catalán o inglés). Eres amable, cercano y breve.

## Nuestros locales, ubicaciones y horarios
Todos los locales abren de 08:00 a 00:00 sin interrupción.

- **La Tapeta - Blanes** · Carrer de la Muralla, 21, Blanes · 📞 972 916 341
- **Cooperativa - Blanes** · Carrer de la Muralla, 28, Blanes · 📞 972 916 341
- **La Tapeta - Lloret de Mar** · Carrer Sant Pere, 84, Lloret de Mar · 📞 872 266 645
- **La Tapeta - Girona** · Avinguda Sant Francesc, 7, Girona · 📞 872 071 246
- **Can Mateu - Tordera** · Plaça de la Concòrdia, 5, Tordera · 📞 930 317 169
- **La Tapa Ibérica - Tordera** · Camí Ral, 6, Tordera · 📞 937 643 371

## Reservas
Las reservas se hacen directamente en nuestra web. Si alguien quiere reservar, indícale que vaya a la web.

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

## Normas generales
- No inventes información que no tengas.
- Nunca muestres el bloque ##NOTIF_NEREA## al cliente, ponlo solo al final como instrucción interna.
- Si no sabes algo, dilo con naturalidad y ofrece alternativas.`;

const conversaciones = new Map();
const MAX_HISTORIAL = 10;
const NEREA_JID = "34622065974@s.whatsapp.net";

let sock = null;
let clientReady = false;
let lastQR = null;

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

async function responderConIA(jid, mensajeUsuario, adjuntoUrl) {
  if (!conversaciones.has(jid)) conversaciones.set(jid, []);
  const historial = conversaciones.get(jid);

  const contenidoUsuario = adjuntoUrl
    ? `${mensajeUsuario} [Ha adjuntado un archivo: ${adjuntoUrl}]`
    : mensajeUsuario;

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

    // Detectar y procesar notificación para Nerea
    const notifMatch = respuestaCompleta.match(/##NOTIF_NEREA##(.+?)##/s);
    let respuestaCliente = respuestaCompleta;
    if (notifMatch) {
      respuestaCliente = respuestaCompleta.replace(/\n?##NOTIF_NEREA##.+?##/s, "").trim();
      await notificarNerea(notifMatch[1].trim(), adjuntoUrl);
    }

    historial.push({ role: "assistant", content: respuestaCliente });
    return respuestaCliente;
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

      console.log(`💬 Mensaje de ${jid}: ${textoFinal}`);

      try {
        await sock.sendPresenceUpdate("composing", jid);
        const adjuntoInfo = tieneAdjunto ? `[adjunto recibido de ${jid}]` : null;
        const respuesta = await responderConIA(jid, textoFinal, adjuntoInfo);
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
