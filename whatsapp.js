import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";

let clientReady = false;
let lastQR = null;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  }
});

client.on("qr", (qr) => {
  lastQR = qr;
  console.log("\n📱 QR disponible en /api/whatsapp/qr (panel encargados)\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  clientReady = true;
  lastQR = null;
  console.log("✅ WhatsApp conectado y listo");
});

client.on("disconnected", () => {
  clientReady = false;
  console.log("⚠️  WhatsApp desconectado. Reinicia el servidor para volver a conectar.");
});

client.on("auth_failure", () => {
  clientReady = false;
  console.log("❌ Error de autenticación WhatsApp. Borra .wwebjs_auth y reinicia.");
});

function formatPhone(telefono) {
  let num = telefono.replace(/\D/g, "");
  if (num.startsWith("00")) num = num.slice(2);
  if (num.startsWith("6") || num.startsWith("7") || num.startsWith("9")) {
    num = "34" + num;
  }
  return `${num}@c.us`;
}

export async function sendConfirmacionCliente(telefono, reserva) {
  if (!clientReady) return;
  try {
    const chatId = formatPhone(telefono);
    const msg =
      `✅ *Reserva confirmada*\n\n` +
      `🏠 ${reserva.local}\n` +
      `📅 ${reserva.dia} a las ${reserva.hora}\n` +
      `👥 ${reserva.personas} persona${reserva.personas > 1 ? "s" : ""}\n` +
      `📛 A nombre de: ${reserva.nombre_reserva}\n\n` +
      `¡Te esperamos! Si necesitas cancelar o modificar, llámanos.`;
    await client.sendMessage(chatId, msg);
    console.log(`📤 Confirmación enviada a ${telefono}`);
  } catch (err) {
    console.error("Error enviando confirmación:", err.message);
  }
}

export async function sendNotificacionGrupo(groupId, reserva) {
  if (!clientReady || !groupId) return;
  try {
    const msg =
      `🍽️ *Nueva reserva*\n\n` +
      `👤 ${reserva.nombre_reserva}\n` +
      `📅 ${reserva.dia} · ${reserva.hora}\n` +
      `👥 ${reserva.personas} persona${reserva.personas > 1 ? "s" : ""}\n` +
      `📞 ${reserva.telefono}`;
    await client.sendMessage(groupId, msg);
    console.log(`📤 Notificación enviada al grupo de ${reserva.local}`);
  } catch (err) {
    console.error("Error enviando a grupo:", err.message);
  }
}

export async function getGroups() {
  if (!clientReady) return [];
  const chats = await client.getChats();
  return chats
    .filter((c) => c.isGroup)
    .map((c) => ({ id: c.id._serialized, name: c.name }));
}

export function isReady() {
  return clientReady;
}

export async function getQRImage() {
  if (!lastQR) return null;
  return QRCode.toDataURL(lastQR, { width: 300, margin: 2 });
}

export function initWhatsApp() {
  client.initialize();
}
