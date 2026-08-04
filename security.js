// Utilidades de seguridad reutilizables (Iteración 1A).
// Diseñadas para ser puras y testeables, sin acoplarse a Express en la medida de lo posible,
// y portables (sin dependencias exclusivas de Replit). No contiene rate limiting: eso se
// cablea aparte con express-rate-limit, para no acoplar este módulo a esa dependencia.
import crypto from "crypto";
import fs from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// Entorno
// Detección segura del entorno. NO depende exclusivamente de NODE_ENV: considera
// también señales de la plataforma (Replit) y un override explícito opcional.
// ─────────────────────────────────────────────────────────────────────────────
export function isProduction(env = process.env) {
  if (env.APP_ENV === "production") return true;
  if (env.APP_ENV === "development" || env.APP_ENV === "test") return false;
  if (env.NODE_ENV === "production") return true;
  if (env.REPL_ID || env.REPL_SLUG || env.REPLIT_DEPLOYMENT) return true; // Replit ⇒ producción
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Secreto JWT
// ─────────────────────────────────────────────────────────────────────────────
const MIN_SECRET_LEN = 24;
const WEAK_SECRETS = new Set(["tapeta-secret-dev", "secret", "changeme", "password", "jwt"]);
// Secreto SOLO para entornos no productivos. Estable entre arranques (para no romper
// sesiones locales ni pruebas). NUNCA se usa en producción (ver resolveJwtSecret).
const DEV_JWT_SECRET = "dev-nonprod-jwt-secret-do-not-use-in-production-please";

// Clasifica el secreto SIN revelar su valor: "ausente" | "debil" | "fuerte".
export function classifyJwtSecret(value) {
  if (!value) return "ausente";
  if (WEAK_SECRETS.has(value) || value.length < MIN_SECRET_LEN) return "debil";
  return "fuerte";
}

// Resuelve el secreto a usar.
// - Producción: exige un secreto FUERTE; si falta o es débil, lanza (refuse-to-boot).
// - No producción: usa el env si es fuerte; si no, un secreto de desarrollo fijo y estable.
// Devuelve { secret, status, source } — nunca se debe loguear `secret`.
export function resolveJwtSecret({ prod = isProduction(), env = process.env.JWT_SECRET } = {}) {
  const status = classifyJwtSecret(env);
  if (prod) {
    if (status !== "fuerte") {
      throw new Error(
        `JWT_SECRET ${status} en producción: define un secreto fuerte (>= ${MIN_SECRET_LEN} caracteres) en los Secrets antes de arrancar.`
      );
    }
    return { secret: env, status, source: "env" };
  }
  if (status === "fuerte") return { secret: env, status, source: "env" };
  return { secret: DEV_JWT_SECRET, status, source: "dev-fixed" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manejo de errores (sin exponer internos ni secretos/PII)
// ─────────────────────────────────────────────────────────────────────────────
// Log seguro: solo tipo y mensaje, nunca el objeto completo (que podría llevar
// cuerpos de petición, tokens o PII). A stderr (logs del servidor).
export function safeLogError(context, err) {
  const name = err && err.name ? err.name : "Error";
  const msg = err && err.message ? String(err.message) : String(err);
  console.error(`[error] ${context}: ${name}: ${msg}`);
}

// Middleware de error global de Express: respuesta genérica + log en servidor.
export function errorHandler(err, req, res, next) {
  safeLogError(`${req && req.method} ${req && (req.originalUrl || req.path)}`, err);
  if (res && res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: "Error interno" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Identificación de IP tras proxy (para rate limiting), sin cambiar `trust proxy`.
// Lee el primer valor de X-Forwarded-For si existe; si no, cae a req.ip/socket.
// (Caveat documentado: XFF es falsificable; endurecer con trust proxy verificado
//  es una tarea futura.)
// ─────────────────────────────────────────────────────────────────────────────
export function clientIp(req) {
  const xff = req && req.headers && req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación estricta de subida de CV (candidaturas)
// Formatos permitidos: PDF, DOCX, JPG, PNG. Se valida extensión Y MIME, y además
// los "magic bytes" reales del contenido. Nombres internos seguros y aleatorios.
// ─────────────────────────────────────────────────────────────────────────────
export const CV_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const CV_TYPES = {
  pdf:  { exts: ["pdf"],  mimes: ["application/pdf"], magic: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  docx: {
    exts: ["docx"],
    mimes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
      "application/octet-stream",
    ],
    magic: [[0x50, 0x4b, 0x03, 0x04]], // PK\x03\x04 (zip)
  },
  jpg:  { exts: ["jpg", "jpeg"], mimes: ["image/jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  png:  { exts: ["png"],  mimes: ["image/png"], magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
};

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

// Devuelve la clave de tipo ("pdf"|"docx"|"jpg"|"png") según la extensión, o null.
export function cvTypeByExt(name) {
  const ext = extOf(name);
  for (const [type, def] of Object.entries(CV_TYPES)) if (def.exts.includes(ext)) return type;
  return null;
}

// Filtro para multer: acepta solo si la extensión Y el MIME declarado están permitidos.
export function isAllowedCvUpload({ originalname, mimetype } = {}) {
  const type = cvTypeByExt(originalname);
  if (!type) return false;
  return CV_TYPES[type].mimes.includes(String(mimetype || "").toLowerCase());
}

// Comprueba los magic bytes de un buffer contra el tipo esperado.
export function magicMatches(buffer, type) {
  const def = CV_TYPES[type];
  if (!def || !buffer) return false;
  return def.magic.some((sig) => sig.every((b, i) => buffer[i] === b));
}

// Validación de CONTENIDO real de un archivo ya escrito en disco (post-multer).
export function validateCvContentSync(filePath, originalname) {
  const type = cvTypeByExt(originalname);
  if (!type) return false;
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    return magicMatches(buf, type);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* noop */ } }
  }
}

// Nombre interno seguro: NO usa el nombre original como ruta; extensión saneada.
export function safeUploadName(originalname) {
  const ext = extOf(originalname).replace(/[^a-z0-9]/g, "");
  const rand = crypto.randomBytes(8).toString("hex");
  return `${Date.now()}-${rand}${ext ? "." + ext : ""}`;
}
