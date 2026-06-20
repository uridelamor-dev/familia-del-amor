import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { execSync } from "child_process";
import { initWhatsApp, sendConfirmacionCliente, sendConfirmacionPendienteCliente, sendCancelacionCliente, sendMensajeLibre, sendDocumentoLibre, sendNotificacionGrupo, sendNotificacionGrupoPendiente, sendCancelacionGrupo, getGroups, isReady, getQRImage, setOnReserva, setOnReady, setOnMessage, setHistorialLoader, markAwaitingFollowup, setPerfilLoader, setOnMensajeSaliente, setOnActualizarPerfil, addSaraToHistorial, setOnGroupAttachment, sendMensajeAGrupo } from "./whatsapp.js";
import { procesarFactura, procesarFacturaSinLocal, asignarFacturaPendiente, FacturaDuplicadaError, migrarEstructuraDrive } from "./facturas.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Backup / Restore en Replit DB (persiste entre redeploys) ──────────────
const REPLIT_BACKUP_KEY = "latapeta_db_v3";

function tryRestoreFromReplitDB(targetPath) {
  const dbUrl = process.env.REPLIT_DB_URL;
  if (!dbUrl) return false;
  try {
    console.log("[DB] BD no encontrada, restaurando desde Replit KV...");
    const raw = execSync(`curl -sf "${dbUrl}/${REPLIT_BACKUP_KEY}"`, {
      encoding: "utf8", timeout: 20000,
    }).trim();
    if (!raw || raw === "null" || raw.length < 200) {
      console.log("[DB] Sin copia en Replit KV");
      return false;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, Buffer.from(raw, "base64"));
    console.log(`[DB] BD restaurada (${Math.round(raw.length * 0.75 / 1024)} KB)`);
    return true;
  } catch (e) {
    console.warn("[DB] No se pudo restaurar:", e.message);
    return false;
  }
}

function backupToReplitDBSync() {
  const dbUrl = process.env.REPLIT_DB_URL;
  if (!dbUrl) return;
  try {
    const tmpFile = "/tmp/latapeta_db_bk.b64";
    fs.writeFileSync(tmpFile, fs.readFileSync(dbPath).toString("base64"));
    execSync(`curl -sf -X POST "${dbUrl}" --data-urlencode "${REPLIT_BACKUP_KEY}@${tmpFile}"`, {
      timeout: 20000, stdio: "pipe",
    });
    try { fs.unlinkSync(tmpFile); } catch {}
    console.log("[DB] BD guardada en Replit KV (sync)");
  } catch (e) {
    console.error("[DB] Error guardando sync:", e.message);
  }
}

async function backupToReplitDB() {
  const dbUrl = process.env.REPLIT_DB_URL;
  if (!dbUrl) return;
  try {
    if (!fs.existsSync(dbPath)) return;
    const b64 = fs.readFileSync(dbPath).toString("base64");
    const body = new URLSearchParams();
    body.set(REPLIT_BACKUP_KEY, b64);
    const resp = await fetch(dbUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (resp.ok) console.log(`[DB] BD guardada en Replit KV (${Math.round(b64.length * 0.75 / 1024)} KB)`);
    else console.warn("[DB] Error Replit KV:", resp.status);
  } catch (e) {
    console.error("[DB] Error guardando async:", e.message);
  }
}
// ── Backup crítico de configuración (tablas pequeñas, clave KV separada) ─────
// El backup completo de la BD puede superar el límite de Replit KV (~512 KB)
// cuando la BD crece con mensajes WA. Este backup guarda solo las tablas de
// configuración crítica (<5 KB siempre) y se restaura con prioridad sobre el
// backup completo.
const KV_CRITICAL_KEY = "latapeta_critical_config_v2";

async function backupCriticalConfig() {
  const dbUrl = process.env.REPLIT_DB_URL;
  if (!dbUrl) return;
  try {
    const [waLinks, facturasGrupos, facturasLocales, emailReglas] = await Promise.all([
      new Promise((res, rej) => db.all("SELECT local, group_jid FROM wa_links", [], (e, r) => e ? rej(e) : res(r || []))),
      new Promise((res, rej) => db.all("SELECT local, group_jid, sheet_id, sheet_url FROM facturas_grupos", [], (e, r) => e ? rej(e) : res(r || []))),
      new Promise((res, rej) => db.all("SELECT * FROM facturas_locales", [], (e, r) => e ? rej(e) : res(r || []))),
      new Promise((res, rej) => db.all("SELECT * FROM facturas_email_reglas", [], (e, r) => e ? rej(e) : res(r || []))),
    ]);
    const payload = JSON.stringify({ waLinks, facturasGrupos, facturasLocales, emailReglas, ts: Date.now() });
    const body = new URLSearchParams();
    body.set(KV_CRITICAL_KEY, payload);
    const r = await fetch(dbUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (r.ok) console.log(`[Config] Backup crítico OK (wa:${waLinks.length} fg:${facturasGrupos.length} fl:${facturasLocales.length})`);
    else console.warn("[Config] Error backup crítico:", r.status);
  } catch (e) { console.error("[Config] Error backup crítico:", e.message); }
}

async function restoreCriticalConfig() {
  const dbUrl = process.env.REPLIT_DB_URL;
  if (!dbUrl) return;
  try {
    const raw = execSync(`curl -sf "${dbUrl}/${KV_CRITICAL_KEY}"`, { encoding: "utf8", timeout: 10000 }).trim();
    if (!raw || raw === "null" || raw.length < 5) return;
    const cfg = JSON.parse(raw);
    const ahora = new Date().toISOString();
    let restored = 0;
    for (const { local, group_jid } of (cfg.waLinks || [])) {
      await new Promise(res => db.run(
        "INSERT OR REPLACE INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?)",
        [local, group_jid, ahora], res
      ));
      // Sincronizar también con la tabla contents (sistema legacy de backup)
      await new Promise(res => db.run(
        "INSERT OR REPLACE INTO contents (key, value, updated_at) VALUES (?, ?, ?)",
        [`whatsapp_group_${local}`, group_jid, ahora], res
      ));
      restored++;
    }
    for (const { local, group_jid, sheet_id, sheet_url } of (cfg.facturasGrupos || [])) {
      await new Promise(res => db.run(
        // COALESCE: si el backup tiene sheet_id, úsalo; si es null, conserva el valor actual del DB
        `INSERT INTO facturas_grupos (local, group_jid, sheet_id, sheet_url) VALUES (?, ?, ?, ?)
         ON CONFLICT(group_jid) DO UPDATE SET
           local = excluded.local,
           sheet_id = COALESCE(excluded.sheet_id, facturas_grupos.sheet_id),
           sheet_url = COALESCE(excluded.sheet_url, facturas_grupos.sheet_url)`,
        [local, group_jid, sheet_id || null, sheet_url || null], res
      ));
      restored++;
    }
    for (const r of (cfg.facturasLocales || [])) {
      await new Promise(res => db.run(
        `INSERT INTO facturas_locales (local, empresa, cif, local_contable) VALUES (?, ?, ?, ?)
         ON CONFLICT(local) DO UPDATE SET
           empresa = excluded.empresa,
           cif = excluded.cif,
           local_contable = excluded.local_contable`,
        [r.local, r.empresa, r.cif, r.local_contable], res
      ));
    }
    for (const r of (cfg.emailReglas || [])) {
      await new Promise(res => db.run(
        `INSERT OR IGNORE INTO facturas_email_reglas (email, local) VALUES (?, ?)`,
        [r.email, r.local], res
      ));
    }
    const ts = cfg.ts ? new Date(cfg.ts).toLocaleString("es-ES") : "?";
    console.log(`[Config] Config crítica restaurada (${restored} entradas, guardada: ${ts})`);
  } catch (e) { console.error("[Config] Error restaurando config crítica:", e.message); }
}
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "tapeta-secret-dev";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function resolveDbPath() {
  const configured = process.env.DB_PATH;
  if (configured) {
    // Validar que parece una ruta de archivo SQLite, no un directorio genérico
    const looksWrong = configured === "/home/user" || configured === "/home/runner" || !configured.endsWith(".sqlite") && !configured.includes(".");
    if (looksWrong) {
      console.warn(`[DB] DB_PATH="${configured}" parece incorrecta — ignorando. Elimina esta variable de Secrets en Replit.`);
    } else {
      const dir = path.dirname(configured);
      try {
        fs.mkdirSync(dir, { recursive: true });
        return configured;
      } catch {
        console.warn(`[DB] DB_PATH directory inaccesible (${dir}), usando ruta por defecto.`);
      }
    }
  }
  // En Replit Reserved VM, el directorio del proyecto persiste entre redeploys
  const localPath = path.join(__dirname, "database.sqlite");
  // Intentar también un directorio fuera del proyecto como respaldo
  if (process.env.REPL_ID || process.env.REPL_SLUG) {
    const persistentDir = "/home/runner/latapeta-data";
    const persistentPath = path.join(persistentDir, "database.sqlite");
    try {
      fs.mkdirSync(persistentDir, { recursive: true });
      const oldPath = localPath;
      if (!fs.existsSync(persistentPath) && fs.existsSync(oldPath)) {
        fs.copyFileSync(oldPath, persistentPath);
        console.log(`[DB] BD migrada a ${persistentPath}`);
      }
      return persistentPath;
    } catch (e) {
      console.warn(`[DB] No se pudo usar ruta persistente (${e.message}), usando directorio local.`);
    }
  }
  return localPath;
}
const dbPath = resolveDbPath();
console.log(`[DB] Ruta de base de datos: ${dbPath}`);
// Restaurar desde Replit KV si el archivo local no existe
if (!fs.existsSync(dbPath)) {
  tryRestoreFromReplitDB(dbPath);
}
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) console.error("Error abriendo base de datos:", err.message);
});
db.on("error", (err) => {
  console.error("DB error (no fatal):", err.message);
});

const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({ storage });

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL,
      nombre TEXT,
      local TEXT,
      creado_en TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellidos TEXT NOT NULL,
      nacimiento TEXT NOT NULL,
      poblacion TEXT NOT NULL,
      telefono TEXT NOT NULL,
      correo TEXT NOT NULL,
      premio TEXT NOT NULL,
      creado_en TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local TEXT NOT NULL,
      personas INTEGER NOT NULL,
      dia TEXT NOT NULL,
      hora TEXT NOT NULL,
      telefono TEXT NOT NULL,
      nombre_reserva TEXT NOT NULL,
      creado_en TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wa_links (
      local TEXT PRIMARY KEY,
      group_jid TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `, () => {
    const ahora = new Date().toISOString();
    // contents → wa_links (restaurar links guardados en el sistema antiguo)
    db.all(`SELECT key, value FROM contents WHERE key LIKE 'whatsapp_group_%'`, (err, rows) => {
      if (!err && rows?.length) {
        rows.forEach(({ key, value }) => {
          const local = key.replace("whatsapp_group_", "");
          db.run(
            `INSERT OR IGNORE INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?)`,
            [local, value, ahora]
          );
        });
      }
    });
    // wa_links → contents (asegurar que todos los links estén también en contents como backup)
    db.all(`SELECT local, group_jid FROM wa_links`, (err, rows) => {
      if (!err && rows?.length) {
        rows.forEach(({ local, group_jid }) => {
          db.run(
            `INSERT OR IGNORE INTO contents (key, value, updated_at) VALUES (?, ?, ?)`,
            [`whatsapp_group_${local}`, group_jid, ahora]
          );
        });
      }
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS hr_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      local TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hr_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL,
      puesto TEXT NOT NULL,
      mensaje TEXT,
      cv_url TEXT,
      estado TEXT NOT NULL DEFAULT 'nuevo',
      creado_en TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenance_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'abierta',
      creado_en TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local TEXT NOT NULL,
      rol TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      creado_en TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS google_reviews (
      id TEXT PRIMARY KEY,
      location_name TEXT,
      author TEXT,
      rating INTEGER,
      text TEXT,
      fecha TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS followup_scheduled (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL,
      nombre TEXT NOT NULL,
      local TEXT NOT NULL,
      dia TEXT NOT NULL,
      send_at TEXT NOT NULL,
      sent INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL,
      telefono TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      respuesta TEXT NOT NULL,
      historico INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`ALTER TABLE whatsapp_messages ADD COLUMN historico INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE whatsapp_messages ADD COLUMN tipo TEXT DEFAULT 'intercambio'`, () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS facturas_grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local TEXT NOT NULL,
      group_jid TEXT NOT NULL UNIQUE,
      sheet_id TEXT,
      sheet_url TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local TEXT NOT NULL,
      tipo TEXT,
      fecha TEXT,
      numero_factura TEXT,
      proveedor TEXT,
      nif TEXT,
      concepto TEXT,
      base_imponible REAL,
      porcentaje_iva REAL,
      cuota_iva REAL,
      total REAL,
      drive_url TEXT,
      sheet_id TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wa_clientes (
      jid TEXT PRIMARY KEY,
      nombre TEXT,
      telefono TEXT,
      notas TEXT DEFAULT '{}',
      ultima_interaccion INTEGER DEFAULT (strftime('%s', 'now')),
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS facturas_email_reglas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      local TEXT NOT NULL,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS facturas_emails_procesados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gmail_id TEXT NOT NULL UNIQUE,
      de_email TEXT,
      asunto TEXT,
      local TEXT,
      adjuntos_procesados INTEGER DEFAULT 0,
      procesado TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS facturas_locales (
      local TEXT PRIMARY KEY,
      empresa TEXT NOT NULL,
      cif TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS facturas_pendientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_detectada TEXT,
      nif_receptor TEXT,
      nombre_receptor TEXT,
      tipo TEXT,
      fecha TEXT,
      numero_factura TEXT,
      proveedor TEXT,
      nif TEXT,
      concepto TEXT,
      base_imponible REAL,
      porcentaje_iva REAL,
      cuota_iva REAL,
      total REAL,
      drive_url TEXT,
      drive_file_id TEXT,
      file_hash TEXT,
      origen TEXT DEFAULT 'email',
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`ALTER TABLE facturas ADD COLUMN file_hash TEXT`, () => {});
  db.run(`ALTER TABLE facturas ADD COLUMN empresa TEXT`, () => {});
  db.run(`ALTER TABLE facturas ADD COLUMN pagado INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE facturas ADD COLUMN fecha_pago TEXT`, () => {});
  db.run(`ALTER TABLE facturas_locales ADD COLUMN local_contable TEXT`, () => {});
  // Migración: rellena empresa en facturas que quedaron como null o "Sin empresa asignada"
  db.run(
    `UPDATE facturas SET empresa = (
       SELECT fl.empresa FROM facturas_locales fl WHERE fl.local = facturas.local
     )
     WHERE (empresa IS NULL OR empresa = 'Sin empresa asignada')
     AND EXISTS (SELECT 1 FROM facturas_locales fl WHERE fl.local = facturas.local)`,
    (err) => { if (err) console.error("[Migration] empresa fix:", err.message); }
  );
  db.run(`ALTER TABLE leads ADD COLUMN genero TEXT`, () => {});
  db.run(`ALTER TABLE leads ADD COLUMN fuente TEXT DEFAULT 'web'`, () => {});
  db.run(`ALTER TABLE leads ADD COLUMN actualizado_en TEXT`, () => {});
  db.run(`ALTER TABLE hr_applications ADD COLUMN edad INTEGER`, () => {});
  db.run(`ALTER TABLE hr_applications ADD COLUMN experiencia TEXT`, () => {});
  db.run(`ALTER TABLE hr_applications ADD COLUMN poblacion TEXT`, () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS campanas_wa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      segmento_json TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      total_enviados INTEGER DEFAULT 0,
      total_errores INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now')),
      finalizado_en TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pending_whatsapp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      destino TEXT NOT NULL,
      reserva_json TEXT NOT NULL,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hr_worker_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'nota',
      contenido TEXT NOT NULL,
      autor TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hr_preguntas_mes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mes TEXT NOT NULL,
      orden INTEGER DEFAULT 0,
      pregunta TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hr_llamadas_mes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      mes TEXT NOT NULL,
      realizada INTEGER DEFAULT 0,
      fecha_llamada TEXT,
      respuestas TEXT,
      comentario_libre TEXT,
      autor TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      UNIQUE(worker_id, mes)
    )
  `);

  // Seed de usuarios por defecto si la tabla está vacía
  db.get("SELECT COUNT(*) as total FROM users", async (err, row) => {
    if (err || row.total > 0) return;
    const roles = [
      { username: "direccion", nombre: "Dirección", rol: "direccion" },
      { username: "encargado", nombre: "Encargado", rol: "encargado" },
      { username: "trabajador", nombre: "Trabajador", rol: "trabajador" },
      { username: "rrhh", nombre: "RR.HH.", rol: "rrhh" },
      { username: "marketing", nombre: "Marketing", rol: "marketing" },
      { username: "contabilidad", nombre: "Contabilidad", rol: "contabilidad" }
    ];
    for (const u of roles) {
      const hash = await bcrypt.hash("tapeta2024", 10);
      db.run(
        `INSERT INTO users (username, password_hash, rol, nombre, creado_en) VALUES (?, ?, ?, ?, ?)`,
        [u.username, hash, u.rol, u.nombre, new Date().toISOString()]
      );
    }
    console.log("Usuarios por defecto creados. Contraseña: tapeta2024");
  });
});

// ── Google Business OAuth ─────────────────────────────────────────────────

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI  = (process.env.BASE_URL || "https://familia-del-amor.replit.app") + "/auth/google/callback";
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

function dbGet(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function dbAll(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function dbRun(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, (e) => e ? rej(e) : res()));
}

async function getConfig(key) {
  const row = await dbGet("SELECT value FROM config WHERE key = ?", [key]);
  return row ? row.value : null;
}
async function setConfig(key, value) {
  await dbRun(
    `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    [key, String(value)]
  );
}

async function getGoogleAccessToken() {
  const refresh = await getConfig("google_refresh_token");
  if (!refresh) throw new Error("No hay refresh token de Google guardado");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token"
    })
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Token inválido: " + JSON.stringify(d));
  return d.access_token;
}

const STAR = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

async function fetchAndStoreReviews() {
  const token = await getGoogleAccessToken();
  const h = { Authorization: `Bearer ${token}` };

  const accRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: h });
  const accData = await accRes.json();
  console.log("Google accounts response:", JSON.stringify(accData).slice(0, 500));
  if (!accData.accounts?.length) throw new Error("Sin cuentas Google Business: " + JSON.stringify(accData).slice(0, 200));

  let total = 0;
  for (const account of accData.accounts) {
    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
      { headers: h }
    );
    const locData = await locRes.json();
    console.log("Google locations response:", JSON.stringify(locData).slice(0, 500));
    if (!locData.locations?.length) continue;

    for (const loc of locData.locations) {
      // API v1 de reseñas (v4 está obsoleta)
      const revRes = await fetch(
        `https://mybusinessreviews.googleapis.com/v1/${loc.name}/reviews?pageSize=50`,
        { headers: h }
      );
      const revData = await revRes.json();
      console.log(`Reviews for ${loc.name}:`, JSON.stringify(revData).slice(0, 300));
      if (!revData.reviews?.length) continue;

      for (const rev of revData.reviews) {
        await dbRun(
          `INSERT INTO google_reviews (id, location_name, author, rating, text, fecha)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET author=excluded.author, rating=excluded.rating,
             text=excluded.text, fecha=excluded.fecha`,
          [
            rev.reviewId || rev.name,
            loc.title || loc.name,
            rev.reviewer?.displayName || "Cliente",
            STAR[rev.starRating] || 5,
            rev.comment || "",
            rev.createTime || new Date().toISOString()
          ]
        );
        total++;
      }
    }
  }
  await setConfig("reviews_last_fetch", new Date().toISOString());
  console.log(`Google reviews: ${total} reseñas guardadas`);
}

async function fetchReviewsViaPlaces() {
  if (!GOOGLE_PLACES_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY no configurado en Replit Secrets");
  const idsRaw = await getConfig("places_ids");
  if (!idsRaw) throw new Error("No hay Place IDs configurados. Ve a Marketing → Google Places.");
  const locations = JSON.parse(idsRaw).filter(l => l.placeId);
  if (!locations.length) throw new Error("Ningún Place ID configurado");
  let total = 0;
  for (const loc of locations) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(loc.placeId)}&fields=name,reviews&key=${GOOGLE_PLACES_API_KEY}&language=es&reviews_sort=newest`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK") {
      console.warn(`Places API error para ${loc.name}: ${data.status} - ${data.error_message || ""}`);
      continue;
    }
    for (const rev of (data.result?.reviews || [])) {
      const id = `places_${loc.placeId}_${rev.time}`;
      await dbRun(
        `INSERT INTO google_reviews (id, location_name, author, rating, text, fecha)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET author=excluded.author, rating=excluded.rating,
           text=excluded.text, fecha=excluded.fecha`,
        [id, loc.name, rev.author_name || "Cliente", rev.rating || 5, rev.text || "",
         new Date(rev.time * 1000).toISOString()]
      );
      total++;
    }
  }
  await setConfig("reviews_last_fetch", new Date().toISOString());
  console.log(`Places API reviews: ${total} reseñas de ${locations.length} locales`);
  return total;
}

// Refresco diario de reseñas (cada 24h)
setInterval(async () => {
  try {
    const refresh = await getConfig("google_refresh_token");
    if (refresh) {
      await fetchAndStoreReviews();
    } else if (GOOGLE_PLACES_API_KEY) {
      await fetchReviewsViaPlaces().catch(e => console.error("Auto-refresh Places:", e.message));
    }
  } catch (e) {
    console.error("Auto-refresh reviews:", e.message);
  }
}, 24 * 60 * 60 * 1000);

// ── Google Drive / Sheets OAuth (cuenta separada para facturas) ────────────
const GOOGLE_DRIVE_CLIENT_ID     = process.env.GOOGLE_DRIVE_CLIENT_ID     || "";
const GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI_FACTURAS = (process.env.BASE_URL || "https://familia-del-amor.replit.app") + "/auth/google-facturas/callback";

async function getDriveAccessToken() {
  const refresh = await getConfig("google_drive_refresh_token");
  if (!refresh) throw new Error("Google Drive no conectado. Ve a Dirección → Facturas y conecta la cuenta.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token"
    })
  });
  const data = await r.json();
  if (!data.access_token) throw new Error("No se pudo renovar token de Drive: " + JSON.stringify(data));
  return data.access_token;
}

// ── Gmail: funciones de polling ────────────────────────────────────────────

function flattenParts(payload, result = []) {
  if (!payload) return result;
  if (payload.parts) {
    for (const part of payload.parts) flattenParts(part, result);
  } else {
    result.push(payload);
  }
  return result;
}

async function markGmailRead(token, msgId) {
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] })
  });
}

async function pollGmail() {
  try {
    const token = await getDriveAccessToken();

    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent("is:unread has:attachment")}&maxResults=20`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const listData = await listRes.json();
    if (listData.error) { console.error("[Gmail] Error listando:", JSON.stringify(listData.error)); return; }
    if (!listData.messages || listData.messages.length === 0) return;

    for (const { id: msgId } of listData.messages) {
      const yaProcesado = await dbGet("SELECT id FROM facturas_emails_procesados WHERE gmail_id = ?", [msgId]);
      if (yaProcesado) continue;

      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const msg = await msgRes.json();

      const headers = msg.payload?.headers || [];
      const from = headers.find(h => h.name.toLowerCase() === "from")?.value || "";
      const subject = headers.find(h => h.name.toLowerCase() === "subject")?.value || "Sin asunto";
      const emailMatch = from.match(/<(.+?)>/);
      const senderEmail = (emailMatch ? emailMatch[1] : from).trim().toLowerCase();

      const regla = await dbGet("SELECT local FROM facturas_email_reglas WHERE LOWER(email) = ?", [senderEmail]);
      const localConocido = regla?.local || null; // null = proveedor directo, sin regla

      const parts = flattenParts(msg.payload);
      const adjuntos = parts.filter(p =>
        p.filename && p.body?.attachmentId &&
        (p.mimeType === "application/pdf" || p.mimeType?.startsWith("image/"))
      );

      if (adjuntos.length === 0) {
        await markGmailRead(token, msgId);
        await dbRun("INSERT OR IGNORE INTO facturas_emails_procesados (gmail_id, de_email, asunto, local, adjuntos_procesados) VALUES (?, ?, ?, ?, 0)", [msgId, senderEmail, subject, localConocido || "auto", 0]);
        continue;
      }

      let procesados = 0;
      for (const parte of adjuntos) {
        try {
          const attRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${parte.body.attachmentId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const attData = await attRes.json();
          const buffer = Buffer.from(attData.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

          if (localConocido) {
            // Regla configurada: procesar normalmente
            await procesarFactura({
              buffer, mimeType: parte.mimeType,
              filename: parte.filename || `adjunto_${msgId}`,
              local: localConocido,
              caption: `Email · ${from} · ${subject}`,
              getToken: getDriveAccessToken, dbGet, dbRun,
              backupFn: backupCriticalConfig
            });
          } else {
            // Proveedor directo sin regla: auto-detectar por nif_receptor
            await procesarFacturaSinLocal({
              buffer, mimeType: parte.mimeType,
              filename: parte.filename || `adjunto_${msgId}`,
              origen: "email",
              getToken: getDriveAccessToken, dbGet, dbAll, dbRun
            });
          }
          procesados++;
        } catch (err) {
          if (err instanceof FacturaDuplicadaError) {
            console.warn(`[Gmail] Duplicado de ${senderEmail}: ${err.message}`);
          } else {
            console.error(`[Gmail] Error procesando adjunto de ${msgId}:`, err.message);
          }
        }
      }

      await markGmailRead(token, msgId);
      await dbRun(
        "INSERT OR IGNORE INTO facturas_emails_procesados (gmail_id, de_email, asunto, local, adjuntos_procesados) VALUES (?, ?, ?, ?, ?)",
        [msgId, senderEmail, subject, localConocido || "auto", procesados]
      );
      console.log(`[Gmail] ${senderEmail} → ${localConocido || "auto-detect"} (${procesados} adjunto/s)`);
    }
  } catch (err) {
    if (err.message.includes("no conectado")) return;
    console.error("[Gmail] Error en poll:", err.message);
  }
}

app.get("/auth/google-facturas", (req, res) => {
  if (!GOOGLE_DRIVE_CLIENT_ID) return res.status(500).send("GOOGLE_DRIVE_CLIENT_ID no configurado en Replit Secrets");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_DRIVE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI_FACTURAS);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify"
  ].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  res.redirect(url.toString());
});

app.get("/auth/google-facturas/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`Error Google OAuth Facturas: ${error}`);
  if (!code) return res.send("Sin código de autorización");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI_FACTURAS,
      grant_type: "authorization_code"
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.refresh_token) {
    return res.send("Error: Google no devolvió refresh_token. Ve a <a href='https://myaccount.google.com/permissions'>myaccount.google.com/permissions</a>, revoca el acceso y vuelve a intentarlo.");
  }
  await setConfig("google_drive_refresh_token", tokenData.refresh_token);
  res.redirect("/direccion.html?facturas=connected");
});

// ── API: estado y grupos de facturas ───────────────────────────────────────
app.get("/api/facturas/status", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const token = await getConfig("google_drive_refresh_token");
  const grupos = await dbAll("SELECT * FROM facturas_grupos ORDER BY local", []);
  res.json({ ok: true, conectado: !!token, grupos });
});

app.get("/api/facturas/grupos", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_grupos ORDER BY local", []);
  res.json({ ok: true, data: rows });
});

app.post("/api/facturas/grupos", requireAuth(["direccion"]), async (req, res) => {
  const { local, group_jid } = req.body;
  if (!local || !group_jid) return res.status(400).json({ ok: false, error: "Faltan local o group_jid" });
  try {
    await dbRun(
      "INSERT INTO facturas_grupos (local, group_jid) VALUES (?, ?) ON CONFLICT(group_jid) DO UPDATE SET local = excluded.local",
      [local, group_jid]
    );
    backupToReplitDBSync();    // Backup completo (faltaba)
    backupCriticalConfig();    // Backup compacto de config crítica
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/facturas/grupos/:id", requireAuth(["direccion"]), async (req, res) => {
  await dbRun("DELETE FROM facturas_grupos WHERE id = ?", [req.params.id]);
  backupCriticalConfig();
  res.json({ ok: true });
});

app.get("/api/facturas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const { local } = req.query;
  const rows = await dbAll(
    `SELECT * FROM facturas ${local ? "WHERE local = ?" : ""} ORDER BY creado_en DESC LIMIT 100`,
    local ? [local] : []
  );
  res.json({ ok: true, data: rows });
});

app.patch("/api/facturas/:id/pago", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const { id } = req.params;
    const row = await dbGet("SELECT id, pagado FROM facturas WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    const nuevoPagado = row.pagado ? 0 : 1;
    const fechaPago   = nuevoPagado ? new Date().toISOString().slice(0, 10) : null;
    await dbRun("UPDATE facturas SET pagado = ?, fecha_pago = ? WHERE id = ?", [nuevoPagado, fechaPago, id]);
    res.json({ ok: true, pagado: nuevoPagado, fecha_pago: fechaPago });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/facturas/email-reglas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_email_reglas ORDER BY email", []);
  res.json({ ok: true, data: rows });
});

app.post("/api/facturas/email-reglas", requireAuth(["direccion"]), async (req, res) => {
  const { email, local } = req.body;
  if (!email || !local) return res.status(400).json({ ok: false, error: "Faltan email o local" });
  try {
    await dbRun(
      "INSERT INTO facturas_email_reglas (email, local) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET local = excluded.local",
      [email.trim().toLowerCase(), local]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/facturas/email-reglas/:id", requireAuth(["direccion"]), async (req, res) => {
  await dbRun("DELETE FROM facturas_email_reglas WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

app.get("/api/facturas/locales", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_locales ORDER BY empresa, local", []);
  res.json({ ok: true, data: rows });
});

app.post("/api/facturas/locales", requireAuth(["direccion"]), async (req, res) => {
  const { local, empresa, cif, local_contable } = req.body;
  if (!local || !empresa) return res.status(400).json({ ok: false, error: "Faltan local o empresa" });
  try {
    await dbRun(
      `INSERT INTO facturas_locales (local, empresa, cif, local_contable) VALUES (?, ?, ?, ?)
       ON CONFLICT(local) DO UPDATE SET empresa = excluded.empresa, cif = excluded.cif, local_contable = excluded.local_contable`,
      [local, empresa.trim(), (cif || "").trim() || null, (local_contable || "").trim() || null]
    );
    backupCriticalConfig();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/facturas/locales/:local", requireAuth(["direccion"]), async (req, res) => {
  await dbRun("DELETE FROM facturas_locales WHERE local = ?", [decodeURIComponent(req.params.local)]);
  res.json({ ok: true });
});

app.get("/api/facturas/pendientes", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const rows = await dbAll("SELECT * FROM facturas_pendientes ORDER BY creado_en DESC", []);
  res.json({ ok: true, data: rows });
});

app.post("/api/facturas/pendientes/:id/asignar", requireAuth(["direccion"]), async (req, res) => {
  const { local } = req.body;
  if (!local) return res.status(400).json({ ok: false, error: "Falta local" });
  const pendiente = await dbGet("SELECT * FROM facturas_pendientes WHERE id = ?", [req.params.id]);
  if (!pendiente) return res.status(404).json({ ok: false, error: "No encontrado" });
  try {
    const result = await asignarFacturaPendiente({ pendiente, local, getToken: getDriveAccessToken, dbGet, dbAll, dbRun, backupFn: backupCriticalConfig });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/facturas/reset-test", requireAuth(["direccion"]), async (req, res) => {
  try {
    await dbRun("DELETE FROM facturas");
    await dbRun("DELETE FROM facturas_pendientes");
    await dbRun("DELETE FROM facturas_emails_procesados");
    await dbRun("UPDATE facturas_grupos SET sheet_id = NULL, sheet_url = NULL");
    await dbRun("DELETE FROM config WHERE key = 'drive_facturas_root_id'");
    backupCriticalConfig();
    res.json({ ok: true, mensaje: "Reset de pruebas completado. Ahora borra el contenido de Drive y envía facturas de nuevo." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/facturas/migrar-estructura", requireAuth(["direccion"]), async (req, res) => {
  try {
    const resultado = await migrarEstructuraDrive({ getToken: getDriveAccessToken, dbAll, dbGet });
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/facturas/gmail-status", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  const token = await getConfig("google_drive_refresh_token");
  const ultimosEmails = await dbAll("SELECT * FROM facturas_emails_procesados ORDER BY procesado DESC LIMIT 20", []);
  res.json({ ok: true, conectado: !!token, emails: ultimosEmails });
});

// ── Estadísticas y Modelo 303 ─────────────────────────────────────────────

app.get("/api/facturas/empresas", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT DISTINCT empresa FROM facturas_locales WHERE empresa IS NOT NULL AND empresa != '' ORDER BY empresa`, []
    );
    res.json({ ok: true, data: rows.map(r => r.empresa) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/facturas/stats", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const año = req.query.año || new Date().getFullYear();
    const [mensual, topProveedores, porLocal, resumenAnual] = await Promise.all([
      dbAll(
        `SELECT local, strftime('%m', fecha) AS mes,
           COUNT(*) AS num,
           ROUND(SUM(COALESCE(total,0)), 2) AS total,
           ROUND(SUM(COALESCE(base_imponible,0)), 2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0)), 2) AS iva
         FROM facturas
         WHERE strftime('%Y', fecha) = ? AND fecha IS NOT NULL
         GROUP BY local, mes ORDER BY local, mes`,
        [String(año)]
      ),
      dbAll(
        `SELECT proveedor, COUNT(*) AS num, ROUND(SUM(COALESCE(total,0)), 2) AS total
         FROM facturas
         WHERE strftime('%Y', fecha) = ? AND proveedor IS NOT NULL AND TRIM(proveedor) != ''
         GROUP BY LOWER(TRIM(proveedor))
         ORDER BY total DESC LIMIT 10`,
        [String(año)]
      ),
      dbAll(
        `SELECT local, COUNT(*) AS num, ROUND(SUM(COALESCE(total,0)), 2) AS total
         FROM facturas
         WHERE strftime('%Y', fecha) = ?
         GROUP BY local ORDER BY total DESC`,
        [String(año)]
      ),
      dbGet(
        `SELECT COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible,0)), 2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0)), 2) AS iva,
           ROUND(SUM(COALESCE(total,0)), 2) AS total
         FROM facturas WHERE strftime('%Y', fecha) = ?`,
        [String(año)]
      )
    ]);
    res.json({ ok: true, data: { mensual, topProveedores, porLocal, resumenAnual, año } });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/facturas/modelo303", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const { empresa, año = new Date().getFullYear(), trimestre } = req.query;
    if (!empresa || !trimestre) return res.json({ ok: false, error: "Faltan parámetros: empresa y trimestre" });
    const q = parseInt(trimestre);
    if (q < 1 || q > 4) return res.json({ ok: false, error: "Trimestre debe ser 1, 2, 3 o 4" });

    const mesInicio = (q - 1) * 3 + 1;
    const mesFin    = q * 3;
    const fechaInicio = `${año}-${String(mesInicio).padStart(2, "0")}-01`;
    const fechaFin    = `${año}-${String(mesFin).padStart(2, "0")}-31`;

    // Solo facturas (documentos fiscales válidos para deducción de IVA)
    // Agrupamos por tipo de IVA redondeado para evitar imprecisiones de float
    const [porTipoIva, totales, otrosDocs, locales] = await Promise.all([
      dbAll(
        `SELECT
           CAST(ROUND(COALESCE(porcentaje_iva, 0)) AS INTEGER) AS tipo_iva,
           COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible, 0)), 2) AS base_total,
           ROUND(SUM(COALESCE(cuota_iva, 0)), 2) AS cuota_total
         FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? AND LOWER(tipo) = 'factura'
         GROUP BY CAST(ROUND(COALESCE(porcentaje_iva, 0)) AS INTEGER)
         ORDER BY tipo_iva`,
        [empresa, fechaInicio, fechaFin]
      ),
      dbGet(
        `SELECT
           COUNT(*) AS num_facturas,
           ROUND(SUM(COALESCE(base_imponible, 0)), 2) AS base_total,
           ROUND(SUM(COALESCE(cuota_iva, 0)), 2) AS cuota_total,
           ROUND(SUM(COALESCE(total, 0)), 2) AS importe_total
         FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? AND LOWER(tipo) = 'factura'`,
        [empresa, fechaInicio, fechaFin]
      ),
      dbGet(
        `SELECT COUNT(*) AS num_otros, ROUND(SUM(COALESCE(total, 0)), 2) AS total_otros
         FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? AND LOWER(tipo) != 'factura'`,
        [empresa, fechaInicio, fechaFin]
      ),
      dbAll(
        `SELECT DISTINCT local FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? ORDER BY local`,
        [empresa, fechaInicio, fechaFin]
      )
    ]);

    res.json({
      ok: true,
      data: {
        porTipoIva, totales, otrosDocs,
        locales: locales.map(l => l.local),
        empresa, año: parseInt(año), trimestre: q, fechaInicio, fechaFin
      }
    });
  } catch (e) {
    console.error("[Modelo 303]", e);
    res.json({ ok: false, error: e.message });
  }
});

// OAuth routes (sin requireAuth en callback para que Google pueda redirigir)
app.get("/auth/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(500).send("GOOGLE_CLIENT_ID no configurado");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/business.manage");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  res.redirect(url.toString());
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`Error Google OAuth: ${error}`);
  if (!code) return res.send("Sin código de autorización");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.refresh_token) {
    return res.send("Error: Google no devolvió refresh_token. Ve a <a href='https://myaccount.google.com/permissions'>https://myaccount.google.com/permissions</a>, revoca el acceso a esta app y vuelve a intentarlo.");
  }

  await setConfig("google_refresh_token", tokenData.refresh_token);

  try {
    await fetchAndStoreReviews();
    res.redirect("/marketing.html?google=connected");
  } catch (e) {
    console.error("fetchAndStoreReviews:", e.message);
    const msg = encodeURIComponent(e.message.slice(0, 200));
    res.redirect(`/marketing.html?google=token_ok&err=${msg}`);
  }
});

app.get("/api/google/status", async (req, res) => {
  const token = await getConfig("google_refresh_token");
  const lastFetch = await getConfig("reviews_last_fetch");
  const count = await dbGet("SELECT COUNT(*) as n FROM google_reviews");
  const placesRaw = await getConfig("places_ids");
  const placesCount = placesRaw ? JSON.parse(placesRaw).filter(l => l.placeId).length : 0;
  res.json({
    connected: !!token,
    reviews_count: count?.n || 0,
    last_fetch: lastFetch,
    places_configured: placesCount,
    places_key_set: !!GOOGLE_PLACES_API_KEY
  });
});

app.get("/api/reviews", async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
  const rating = parseInt(req.query.rating) || 4;
  try {
    const rows = await dbAll(
      `SELECT * FROM google_reviews WHERE rating >= ? AND text != '' ORDER BY fecha DESC LIMIT ?`,
      [rating, limit]
    );
    res.json({ ok: true, data: rows });
  } catch {
    res.status(500).json({ ok: false, data: [] });
  }
});

app.post("/api/reviews/refresh", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const lastFetch = await getConfig("reviews_last_fetch");
  if (lastFetch) {
    const minsAgo = (Date.now() - new Date(lastFetch).getTime()) / 60000;
    if (minsAgo < 30) {
      return res.status(429).json({ ok: false, error: `Espera ${Math.ceil(30 - minsAgo)} min antes de volver a actualizar.` });
    }
  }
  try {
    const refresh = await getConfig("google_refresh_token");
    if (refresh) {
      await fetchAndStoreReviews();
    } else {
      await fetchReviewsViaPlaces();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/places/config", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const raw = await getConfig("places_ids");
  res.json({ ok: true, data: raw ? JSON.parse(raw) : [] });
});

app.post("/api/places/config", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { locations } = req.body;
  if (!Array.isArray(locations)) return res.status(400).json({ ok: false, error: "locations debe ser array" });
  await setConfig("places_ids", JSON.stringify(locations));
  res.json({ ok: true });
});

// ── Middleware de autenticación
function requireAuth(roles = []) {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(payload.rol)) {
        return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ ok: false, error: "Token inválido o expirado" });
    }
  };
}

// Auth endpoints
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Faltan credenciales" });
  }
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre, local: user.local },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ ok: true, token, rol: user.rol, nombre: user.nombre });
  });
});

app.get("/api/auth/me", requireAuth(), (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Gestión de usuarios (solo dirección)
app.get("/api/users", requireAuth(["direccion"]), (req, res) => {
  db.all("SELECT id, username, rol, nombre, local, creado_en FROM users ORDER BY rol", (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error leyendo usuarios" });
    res.json({ ok: true, data: rows });
  });
});

app.post("/api/users", requireAuth(["direccion"]), async (req, res) => {
  const { username, password, rol, nombre, local } = req.body;
  if (!username || !password || !rol) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const hash = await bcrypt.hash(password, 10);
  const creado_en = new Date().toISOString();
  db.run(
    `INSERT INTO users (username, password_hash, rol, nombre, local, creado_en) VALUES (?, ?, ?, ?, ?, ?)`,
    [username, hash, rol, nombre || "", local || "", creado_en],
    function (err) {
      if (err) {
        return res.status(400).json({ ok: false, error: "Usuario ya existe o error al crear" });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put("/api/users/:id/password", requireAuth(["direccion"]), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ ok: false, error: "Contraseña requerida" });
  const hash = await bcrypt.hash(password, 10);
  db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id], (err) => {
    if (err) return res.status(500).json({ ok: false, error: "Error actualizando contraseña" });
    res.json({ ok: true });
  });
});

app.delete("/api/users/:id", requireAuth(["direccion"]), (req, res) => {
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ ok: false, error: "Error eliminando usuario" });
    res.json({ ok: true });
  });
});

// Migración segura: añadir columnas fuente y actualizado_en si no existen
db.run(`ALTER TABLE leads ADD COLUMN fuente TEXT DEFAULT 'web'`, () => {});
db.run(`ALTER TABLE leads ADD COLUMN actualizado_en TEXT`, () => {});

// Leads
app.post("/api/leads", (req, res) => {
  const { nombre, apellidos, nacimiento, poblacion, telefono, correo, fuente, genero } = req.body;
  if (!nombre || !apellidos || !nacimiento || !poblacion || !telefono || !correo) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const premio = "10% de descuento";
  const ahora = new Date().toISOString();
  const fuenteVal = fuente || "web";
  const generoVal = genero || null;

  db.get(
    `SELECT id FROM leads WHERE telefono = ? OR correo = ?`,
    [telefono, correo],
    (err, existing) => {
      if (existing) {
        db.run(
          `UPDATE leads SET nombre=?, apellidos=?, nacimiento=?, poblacion=?, genero=COALESCE(?,genero), fuente=?, actualizado_en=? WHERE id=?`,
          [nombre, apellidos, nacimiento, poblacion, generoVal, fuenteVal, ahora, existing.id],
          (err2) => {
            if (err2) return res.status(500).json({ ok: false, error: "Error actualizando lead" });
            return res.json({ ok: true, premio, actualizado: true });
          }
        );
      } else {
        db.run(
          `INSERT INTO leads (nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, fuente, genero, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, fuenteVal, generoVal, ahora],
          function (err2) {
            if (err2) return res.status(500).json({ ok: false, error: "Error guardando lead" });
            backupToReplitDB(); // Guardar BD al recibir nuevo lead
            return res.json({ ok: true, premio });
          }
        );
      }
    }
  );
});

// Captura mínima de lead cuando llega una reserva
function upsertLeadFromReserva({ nombre_reserva, telefono }) {
  if (!telefono) return;
  const nombre = (nombre_reserva || "").split(" ")[0] || nombre_reserva || "";
  const apellidos = (nombre_reserva || "").split(" ").slice(1).join(" ");
  const ahora = new Date().toISOString();
  db.get(`SELECT id FROM leads WHERE telefono = ?`, [telefono], (err, row) => {
    if (err) return;
    if (row) {
      // Lead ya existe — solo actualizamos la fecha de actividad
      db.run(`UPDATE leads SET actualizado_en = ? WHERE id = ?`, [ahora, row.id]);
    } else {
      // Cliente nuevo — creamos lead básico
      db.run(
        `INSERT INTO leads (nombre, apellidos, telefono, nacimiento, poblacion, correo, premio, fuente, creado_en) VALUES (?, ?, ?, '', '', '', '', 'reserva', ?)`,
        [nombre, apellidos, telefono, ahora]
      );
    }
  });
}

// SQL unificado: leads + clientes de reservas sin lead, mergeando por teléfono
function sqlContactosUnificados(filtros = {}, params = []) {
  const { q, poblacion, genero, cumple_mes, local } = filtros;

  let localFilter = local
    ? `AND c.telefono IN (SELECT telefono FROM reservas WHERE local = ?)`
    : "";
  if (local) params.push(local);

  let sql = `
    SELECT
      c.nombre, c.apellidos, c.telefono, c.correo,
      c.nacimiento, c.poblacion, c.genero, c.origen,
      c.ultima_actividad
    FROM (
      -- Clientes con lead (datos completos)
      SELECT
        l.nombre, l.apellidos, l.telefono, l.correo,
        l.nacimiento, l.poblacion, l.genero,
        'lead' AS origen,
        COALESCE(l.actualizado_en, l.creado_en) AS ultima_actividad
      FROM leads l

      UNION

      -- Clientes solo de reservas (sin lead)
      SELECT
        r.nombre_reserva AS nombre,
        '' AS apellidos,
        r.telefono,
        '' AS correo,
        NULL AS nacimiento,
        NULL AS poblacion,
        NULL AS genero,
        'reserva' AS origen,
        MAX(r.creado_en) AS ultima_actividad
      FROM reservas r
      WHERE r.telefono NOT IN (SELECT telefono FROM leads WHERE telefono IS NOT NULL)
      GROUP BY r.telefono
    ) c
    WHERE 1=1
    ${localFilter}
  `;

  if (q) {
    sql += ` AND (c.nombre LIKE ? OR c.apellidos LIKE ? OR c.telefono LIKE ? OR c.correo LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (poblacion) { sql += ` AND c.poblacion LIKE ?`; params.push(`%${poblacion}%`); }
  if (genero) { sql += ` AND c.genero = ?`; params.push(genero); }
  if (cumple_mes) { sql += ` AND strftime('%m', c.nacimiento) = ?`; params.push(cumple_mes.padStart(2, "0")); }
  if (filtros.from) { sql += ` AND c.ultima_actividad >= ?`; params.push(filtros.from); }
  if (filtros.to) { sql += ` AND c.ultima_actividad <= ?`; params.push(filtros.to + " 23:59:59"); }

  sql += ` ORDER BY c.ultima_actividad DESC`;
  return sql;
}

app.get("/api/leads", requireAuth(["direccion", "marketing"]), (req, res) => {
  const params = [];
  const sql = sqlContactosUnificados(req.query, params);
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error leyendo leads" });
    res.json({ ok: true, data: rows });
  });
});

app.get("/api/leads/export.csv", requireAuth(["direccion", "marketing"]), (req, res) => {
  const params = [];
  const sql = sqlContactosUnificados(req.query, params);
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).send("Error exportando");
    const header = "nombre,apellidos,telefono,correo,nacimiento,poblacion,genero,origen,ultima_actividad";
    const lines = rows.map((r) =>
      [r.nombre, r.apellidos, r.telefono, r.correo, r.nacimiento, r.poblacion, r.genero, r.origen, r.ultima_actividad]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="contactos.csv"`);
    res.send([header, ...lines].join("\n"));
  });
});

// Contenidos
app.get("/api/content", (req, res) => {
  db.all(`SELECT key, value FROM contents`, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error leyendo contenidos" });
    const data = {};
    rows.forEach((r) => { data[r.key] = r.value; });
    res.json({ ok: true, data });
  });
});

app.put("/api/content", requireAuth(["marketing", "direccion"]), (req, res) => {
  const { key, value } = req.body;
  if (!key || typeof value !== "string") {
    return res.status(400).json({ ok: false, error: "Datos inválidos" });
  }
  const updated_at = new Date().toISOString();
  db.run(
    `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    [key, value, updated_at],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Error guardando contenido" });
      return res.json({ ok: true });
    }
  );
});

// Upload
app.post("/api/upload", requireAuth(["marketing", "rrhh", "direccion"]), upload.array("files", 10), (req, res) => {
  const files = req.files || [];
  const urls = files.map((f) => `/uploads/${f.filename}`);
  res.json({ ok: true, urls });
});

// Reservas
app.post("/api/reservas", (req, res) => {
  const { local, personas, dia, hora, telefono, nombre_reserva } = req.body;
  if (!local || !personas || !dia || !hora || !telefono || !nombre_reserva) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const [y, m, d] = dia.split("-").map((n) => Number(n));
  const dayDate = new Date(y, m - 1, d);
  dayDate.setHours(0, 0, 0, 0);
  const nowDate = new Date();
  nowDate.setHours(0, 0, 0, 0);
  if (dayDate < nowDate) {
    return res.status(400).json({ ok: false, error: "Fecha inválida" });
  }
  if (dayDate.getTime() === nowDate.getTime()) {
    const [hh, mm] = hora.split(":").map((n) => Number(n));
    const now = new Date();
    if (hh * 60 + mm < now.getHours() * 60 + now.getMinutes()) {
      return res.status(400).json({ ok: false, error: "Hora inválida" });
    }
  }
  const creado_en = new Date().toISOString();
  db.run(
    `INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [local, personas, dia, hora, telefono, nombre_reserva, creado_en],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Error guardando reserva" });
      const pendiente = parseInt(personas) > 8;
      const reserva = { local, personas, dia, hora, telefono, nombre_reserva };
      upsertLeadFromReserva({ nombre_reserva, telefono });
      console.log(`[Reserva] WhatsApp listo: ${isReady()} | ${pendiente ? "PENDIENTE" : "Confirmación"} a ${telefono}`);
      if (pendiente) {
        if (isReady()) sendConfirmacionPendienteCliente(telefono, reserva);
        else guardarPendienteWA("confirmacion_pendiente", telefono, reserva);
      } else {
        if (isReady()) sendConfirmacionCliente(telefono, reserva);
        else guardarPendienteWA("confirmacion", telefono, reserva);
      }
      db.get(`SELECT group_jid FROM wa_links WHERE local = ?`, [local], (_, row) => {
        console.log(`[Reserva] Grupo para "${local}": ${row?.group_jid || "NO CONFIGURADO"}`);
        if (row?.group_jid) {
          if (pendiente) {
            if (isReady()) sendNotificacionGrupoPendiente(row.group_jid, reserva);
            else guardarPendienteWA("grupo_pendiente", row.group_jid, reserva);
          } else {
            if (isReady()) sendNotificacionGrupo(row.group_jid, reserva);
            else guardarPendienteWA("grupo", row.group_jid, reserva);
          }
        }
      });
      return res.json({ ok: true, reserva_id: this.lastID, pendiente });
    }
  );
});

app.get("/api/reservas", requireAuth(["direccion", "encargado"]), (req, res) => {
  const { local, from, to } = req.query;
  const where = [];
  const params = [];
  if (local) { where.push(`local = ?`); params.push(local); }
  if (from) { where.push(`dia >= ?`); params.push(from); }
  if (to) { where.push(`dia <= ?`); params.push(to); }
  const sql = `SELECT * FROM reservas ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY dia ASC, hora ASC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error leyendo reservas" });
    res.json({ ok: true, data: rows });
  });
});

app.delete("/api/reservas/:id", requireAuth(["encargado", "direccion"]), (req, res) => {
  db.get(`SELECT * FROM reservas WHERE id = ?`, [req.params.id], (err, reserva) => {
    if (err || !reserva) return res.status(404).json({ ok: false, error: "Reserva no encontrada" });
    db.run("DELETE FROM reservas WHERE id = ?", [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ ok: false, error: "Error eliminando reserva" });
      res.json({ ok: true });
      if (isReady()) {
        sendCancelacionCliente(reserva.telefono, reserva);
        db.get(`SELECT group_jid FROM wa_links WHERE local = ?`, [reserva.local], (_, row) => {
          if (row?.group_jid) sendCancelacionGrupo(row.group_jid, reserva);
        });
      }
    });
  });
});

app.get("/api/reservas/export.csv", requireAuth(["direccion", "encargado", "contabilidad"]), (req, res) => {
  db.all(`SELECT * FROM reservas ORDER BY creado_en DESC`, (err, rows) => {
    if (err) return res.status(500).send("Error exportando");
    const header = "id,local,personas,dia,hora,telefono,nombre_reserva,creado_en";
    const lines = rows.map((r) =>
      [r.id, r.local, r.personas, r.dia, r.hora, r.telefono, r.nombre_reserva, r.creado_en]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="reservas.csv"`);
    res.send([header, ...lines].join("\n"));
  });
});

// KPIs
app.get("/api/kpi", requireAuth(["direccion", "contabilidad"]), (req, res) => {
  const result = {};
  const hoy = new Date().toISOString().slice(0, 10);
  const mes = hoy.slice(0, 7);

  const queries = [
    ["leads_total",    `SELECT COUNT(*) as v FROM leads`],
    ["leads_mes",      `SELECT COUNT(*) as v FROM leads WHERE (creado_en LIKE '${mes}%' OR actualizado_en LIKE '${mes}%')`],
    ["reservas_total", `SELECT COUNT(*) as v FROM reservas`],
    ["reservas_hoy",   `SELECT COUNT(*) as v FROM reservas WHERE dia='${hoy}'`],
    ["reservas_mes",   `SELECT COUNT(*) as v FROM reservas WHERE dia LIKE '${mes}%'`],
    ["candidaturas",   `SELECT COUNT(*) as v FROM hr_applications`],
    ["personas_hoy",   `SELECT COALESCE(SUM(CAST(personas AS INTEGER)),0) as v FROM reservas WHERE dia='${hoy}'`],
    ["personas_mes",   `SELECT COALESCE(SUM(CAST(personas AS INTEGER)),0) as v FROM reservas WHERE dia LIKE '${mes}%'`],
  ];

  let pending = queries.length;
  let failed = false;

  queries.forEach(([key, sql]) => {
    db.get(sql, (err, row) => {
      if (failed) return;
      if (err) { failed = true; return res.status(500).json({ ok: false, error: key }); }
      result[key] = row.v;
      if (--pending === 0) {
        db.all(`SELECT local, COUNT(*) as total FROM reservas GROUP BY local ORDER BY total DESC`, (e, rows) => {
          if (e) return res.status(500).json({ ok: false, error: "kpi_local" });
          result.reservas_por_local = rows;
          res.json({ ok: true, data: result });
        });
      }
    });
  });
});

// RR.HH.
app.get("/api/hr/jobs", (req, res) => {
  db.all(`SELECT * FROM hr_jobs WHERE activo=1 ORDER BY creado_en DESC`, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error jobs" });
    res.json({ ok: true, data: rows });
  });
});

app.get("/api/hr/jobs/admin", requireAuth(["rrhh", "direccion"]), (req, res) => {
  db.all(`SELECT * FROM hr_jobs ORDER BY creado_en DESC`, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error jobs" });
    res.json({ ok: true, data: rows });
  });
});

app.post("/api/hr/jobs", requireAuth(["rrhh", "direccion"]), (req, res) => {
  const { titulo, local, tipo, descripcion, activo } = req.body;
  if (!titulo || !local || !tipo || !descripcion) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const creado_en = new Date().toISOString();
  db.run(
    `INSERT INTO hr_jobs (titulo, local, tipo, descripcion, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?)`,
    [titulo, local, tipo, descripcion, activo ? 1 : 0, creado_en],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Error guardando job" });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put("/api/hr/jobs/:id", requireAuth(["rrhh", "direccion"]), (req, res) => {
  const { titulo, local, tipo, descripcion, activo } = req.body;
  db.run(
    `UPDATE hr_jobs SET titulo=?, local=?, tipo=?, descripcion=?, activo=? WHERE id=?`,
    [titulo, local, tipo, descripcion, activo ? 1 : 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Error actualizando job" });
      res.json({ ok: true });
    }
  );
});

app.post("/api/hr/applications", (req, res, next) => {
  upload.single("cv")(req, res, (err) => {
    if (err) {
      console.error("[HR] Error subiendo CV:", err.message);
      return res.status(400).json({ ok: false, error: "Error subiendo el CV." });
    }
    next();
  });
}, (req, res) => {
  const { nombre, email, telefono, puesto, mensaje, edad, experiencia, poblacion } = req.body;
  console.log("[HR] Candidatura recibida:", { nombre, email, telefono, puesto, edad, experiencia, poblacion, tieneCV: !!req.file });
  if (!nombre || !email || !telefono || !puesto || !edad || !experiencia || !poblacion) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const cv_url = req.file ? `/uploads/${req.file.filename}` : "";
  const creado_en = new Date().toISOString();
  db.run(
    `INSERT INTO hr_applications (nombre, email, telefono, puesto, mensaje, cv_url, edad, experiencia, poblacion, estado, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', ?)`,
    [nombre, email, telefono, puesto, mensaje || "", cv_url, edad || null, experiencia || null, poblacion || null, creado_en],
    function (err) {
      if (err) {
        console.error("[HR] Error DB:", err.message);
        return res.status(500).json({ ok: false, error: "Error guardando candidatura" });
      }
      if (isReady()) {
        const lineas = [
          `🆕 *Nueva candidatura recibida*`,
          ``,
          `👤 *Nombre:* ${nombre}`,
          `📞 *Teléfono:* ${telefono}`,
          `📧 *Email:* ${email}`,
          `💼 *Puesto:* ${puesto}`,
          `🎂 *Edad:* ${edad} años`,
          `🏙️ *Población:* ${poblacion}`,
          `✅ *Experiencia:* ${experiencia === "si" ? "Sí" : "No"}`,
        ];
        if (mensaje) lineas.push(`💬 *Mensaje:* ${mensaje}`);
        if (req.file) lineas.push(`📎 *CV:* adjunto a continuación`);
        const numLimpio = telefono.replace(/\D/g, "").replace(/^00/, "");
        const numWA = numLimpio.startsWith("34") ? numLimpio : `34${numLimpio}`;
        const mensajePrefill = encodeURIComponent(
          `Hola ${nombre}! 👋 Te escribo en relación a tu candidatura como ${puesto} en Familia del Amor. Cuéntame un poco más sobre ti para que podamos conocernos mejor 😊`
        );
        const linkWA = `https://wa.me/${numWA}?text=${mensajePrefill}`;
        sendMensajeLibre("622065974", lineas.join("\n"))
          .then(() => {
            if (req.file) {
              const cvBuffer = fs.readFileSync(req.file.path);
              return sendDocumentoLibre("622065974", cvBuffer, req.file.originalname, req.file.mimetype);
            }
          })
          .then(() => sendMensajeLibre("622065974", `Si quieres escribirle directamente a ${nombre}, haz clic aquí 👇\n${linkWA}`))
          .catch((e) => console.error("[HR] Error notificando candidatura a Nerea:", e.message));
      }
      res.json({ ok: true });
    }
  );
});

app.get("/api/hr/applications", requireAuth(["rrhh", "direccion"]), (req, res) => {
  const { q, estado, from, to } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push(`(nombre LIKE ? OR email LIKE ? OR telefono LIKE ? OR puesto LIKE ?)`);
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (estado) { where.push(`estado = ?`); params.push(estado); }
  if (from) { where.push(`creado_en >= ?`); params.push(from); }
  if (to) { where.push(`creado_en <= ?`); params.push(to); }
  const sql = `SELECT * FROM hr_applications ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY creado_en DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error leyendo candidaturas" });
    res.json({ ok: true, data: rows });
  });
});

app.put("/api/hr/applications/:id", requireAuth(["rrhh", "direccion"]), (req, res) => {
  const { estado } = req.body;
  if (!estado) return res.status(400).json({ ok: false, error: "Estado requerido" });
  db.run(`UPDATE hr_applications SET estado=? WHERE id=?`, [estado, req.params.id], (err) => {
    if (err) return res.status(500).json({ ok: false, error: "Error actualizando estado" });
    res.json({ ok: true });
  });
});

// ── RRHH: Seguimiento de trabajadores ─────────────────────────────────────

app.get("/api/rrhh/trabajadores", requireAuth(["rrhh", "direccion"]), (req, res) => {
  db.all(
    `SELECT id, username, nombre, rol, local FROM users
     WHERE rol IN ('trabajador','encargado')
     ORDER BY local ASC, nombre ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false });
      res.json({ ok: true, data: rows || [] });
    }
  );
});

app.get("/api/rrhh/trabajador/:id/notas", requireAuth(["rrhh", "direccion"]), (req, res) => {
  db.all(
    `SELECT * FROM hr_worker_notes WHERE worker_id = ? ORDER BY creado_en DESC`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false });
      res.json({ ok: true, data: rows || [] });
    }
  );
});

app.post("/api/rrhh/trabajador/:id/nota", requireAuth(["rrhh", "direccion"]), (req, res) => {
  const { tipo = "nota", contenido, autor } = req.body;
  if (!contenido) return res.status(400).json({ ok: false, error: "Falta contenido" });
  db.run(
    `INSERT INTO hr_worker_notes (worker_id, tipo, contenido, autor, creado_en) VALUES (?, ?, ?, ?, ?)`,
    [req.params.id, tipo, contenido, autor || null, new Date().toISOString()],
    function (err) {
      if (err) return res.status(500).json({ ok: false });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.delete("/api/rrhh/nota/:id", requireAuth(["rrhh", "direccion"]), (req, res) => {
  db.run(`DELETE FROM hr_worker_notes WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ ok: false });
    res.json({ ok: true });
  });
});

app.get("/api/rrhh/preguntas/:mes", requireAuth(["rrhh", "direccion"]), (req, res) => {
  db.all(
    `SELECT * FROM hr_preguntas_mes WHERE mes = ? ORDER BY orden ASC`,
    [req.params.mes],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false });
      res.json({ ok: true, data: rows || [] });
    }
  );
});

app.put("/api/rrhh/preguntas/:mes", requireAuth(["rrhh", "direccion"]), (req, res) => {
  const { preguntas } = req.body;
  if (!Array.isArray(preguntas)) return res.status(400).json({ ok: false });
  const mes = req.params.mes;
  db.run(`DELETE FROM hr_preguntas_mes WHERE mes = ?`, [mes], (err) => {
    if (err) return res.status(500).json({ ok: false });
    if (!preguntas.length) return res.json({ ok: true });
    const stmt = db.prepare(`INSERT INTO hr_preguntas_mes (mes, orden, pregunta) VALUES (?, ?, ?)`);
    preguntas.forEach((p, i) => stmt.run(mes, i, p));
    stmt.finalize((err2) => {
      if (err2) return res.status(500).json({ ok: false });
      res.json({ ok: true });
    });
  });
});

app.get("/api/rrhh/llamadas/:mes", requireAuth(["rrhh", "direccion"]), (req, res) => {
  db.all(
    `SELECT * FROM hr_llamadas_mes WHERE mes = ?`,
    [req.params.mes],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false });
      res.json({ ok: true, data: rows || [] });
    }
  );
});

app.post("/api/rrhh/llamada", requireAuth(["rrhh", "direccion"]), (req, res) => {
  const { worker_id, mes, respuestas, comentario_libre, autor } = req.body;
  if (!worker_id || !mes) return res.status(400).json({ ok: false, error: "Faltan datos" });
  const ahora = new Date().toISOString();
  const respJson = respuestas ? JSON.stringify(respuestas) : null;
  db.run(
    `INSERT INTO hr_llamadas_mes (worker_id, mes, realizada, fecha_llamada, respuestas, comentario_libre, autor, creado_en)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?)
     ON CONFLICT(worker_id, mes) DO UPDATE SET
       realizada=1, fecha_llamada=excluded.fecha_llamada,
       respuestas=excluded.respuestas, comentario_libre=excluded.comentario_libre,
       autor=excluded.autor`,
    [worker_id, mes, ahora, respJson, comentario_libre || null, autor || null, ahora],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true });
    }
  );
});

// Mantenimiento
app.get("/api/maintenance", requireAuth(), (req, res) => {
  db.all(`SELECT * FROM maintenance_issues ORDER BY creado_en DESC`, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error incidencias" });
    res.json({ ok: true, data: rows });
  });
});

app.post("/api/maintenance", requireAuth(), (req, res) => {
  const { local, titulo, descripcion } = req.body;
  if (!local || !titulo || !descripcion) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const creado_en = new Date().toISOString();
  db.run(
    `INSERT INTO maintenance_issues (local, titulo, descripcion, estado, creado_en) VALUES (?, ?, ?, 'abierta', ?)`,
    [local, titulo, descripcion, creado_en],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Error guardando incidencia" });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put("/api/maintenance/:id", requireAuth(["encargado", "direccion"]), (req, res) => {
  const { estado } = req.body;
  if (!estado) return res.status(400).json({ ok: false, error: "Estado requerido" });
  db.run(`UPDATE maintenance_issues SET estado=? WHERE id=?`, [estado, req.params.id], (err) => {
    if (err) return res.status(500).json({ ok: false, error: "Error actualizando incidencia" });
    res.json({ ok: true });
  });
});

// Comunicados
app.get("/api/announcements", requireAuth(), (req, res) => {
  const { local, rol } = req.query;
  const where = [];
  const params = [];
  if (local) { where.push(`local = ?`); params.push(local); }
  if (rol) { where.push(`rol = ?`); params.push(rol); }
  const sql = `SELECT * FROM announcements ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY creado_en DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error anuncios" });
    res.json({ ok: true, data: rows });
  });
});

app.post("/api/announcements", requireAuth(["encargado", "direccion"]), (req, res) => {
  const { local, rol, mensaje } = req.body;
  if (!local || !rol || !mensaje) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const creado_en = new Date().toISOString();
  db.run(
    `INSERT INTO announcements (local, rol, mensaje, creado_en) VALUES (?, ?, ?, ?)`,
    [local, rol, mensaje, creado_en],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Error guardando anuncio" });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// WhatsApp
app.get("/api/whatsapp/status", requireAuth(["direccion", "encargado", "marketing"]), (req, res) => {
  res.json({ ok: true, connected: isReady() });
});

app.get("/api/whatsapp/groups", requireAuth(["direccion", "encargado"]), async (req, res) => {
  const groups = await getGroups();
  res.json({ ok: true, data: groups });
});

app.post("/api/whatsapp/link", requireAuth(["direccion", "encargado"]), (req, res) => {
  const { local, groupId } = req.body;
  if (!local || !groupId) return res.status(400).json({ ok: false, error: "Faltan campos" });
  const updated_at = new Date().toISOString();
  db.run(
    `INSERT INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(local) DO UPDATE SET group_jid=excluded.group_jid, updated_at=excluded.updated_at`,
    [local, groupId, updated_at],
    (err) => {
      if (err) return res.status(500).json({ ok: false, error: "Error guardando" });
      // También guardar en contents para que la migración de startup lo restaure
      db.run(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
        [`whatsapp_group_${local}`, groupId, updated_at]
      );
      backupToReplitDBSync(); // Backup completo síncrono
      backupCriticalConfig(); // Backup compacto de config crítica (asíncrono, no bloquea)
      res.json({ ok: true });
    }
  );
});

app.get("/api/whatsapp/qr", requireAuth(["direccion", "encargado", "marketing"]), async (req, res) => {
  if (isReady()) return res.json({ ok: true, connected: true });
  const dataUrl = await getQRImage();
  if (!dataUrl) return res.json({ ok: true, connected: false, qr: null });
  res.json({ ok: true, connected: false, qr: dataUrl });
});

app.get("/api/whatsapp/links", requireAuth(["direccion", "encargado"]), (req, res) => {
  db.all(`SELECT local, group_jid FROM wa_links ORDER BY local`, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error" });
    res.json({ ok: true, data: rows });
  });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/whatsapp/test", requireAuth(["direccion"]), async (req, res) => {
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ ok: false, error: "Falta telefono" });
  await sendConfirmacionCliente(telefono, {
    local: "La Tapeta - Blanes",
    dia: "2026-05-20",
    hora: "14:00",
    personas: 2,
    nombre_reserva: "Prueba WhatsApp"
  });
  res.json({ ok: true, mensaje: `Mensaje de prueba enviado a ${telefono}` });
});

app.get("/api/contactos", requireAuth(["direccion", "marketing"]), (req, res) => {
  const params = [];
  const sql = sqlContactosUnificados(req.query, params);
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true, data: rows, total: rows.length });
  });
});

// ── CAMPAÑAS WHATSAPP ─────────────────────────────────────────────────
app.post("/api/campanas/preview", requireAuth(["direccion", "marketing"]), (req, res) => {
  const params = [];
  const sql = sqlContactosUnificados(req.body, params);
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false });
    res.json({ ok: true, total: rows.length, muestra: rows.slice(0, 5) });
  });
});

app.post("/api/campanas/enviar", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { nombre_campana, mensaje } = req.body;
  if (!mensaje || !nombre_campana) return res.status(400).json({ ok: false, error: "Faltan campos" });
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });

  const params = [];
  const sql = sqlContactosUnificados(req.body, params);

  db.all(sql, params, async (err, contactos) => {
    if (err) return res.status(500).json({ ok: false });
    if (!contactos.length) return res.json({ ok: false, error: "No hay contactos con ese filtro" });

    const segmento = { genero, poblacion, local, cumple_mes };
    db.run(
      `INSERT INTO campanas_wa (nombre, segmento_json, mensaje, total_enviados) VALUES (?, ?, ?, 0)`,
      [nombre_campana, JSON.stringify(segmento), mensaje],
      async function(e) {
        if (e) return res.status(500).json({ ok: false });
        const campanaId = this.lastID;
        res.json({ ok: true, total: contactos.length, campana_id: campanaId });

        // Enviar en background con delay
        let enviados = 0, errores = 0;
        for (const c of contactos) {
          try {
            const texto = mensaje
              .replace(/\{nombre\}/gi, c.nombre)
              .replace(/\{apellidos\}/gi, c.apellidos)
              .replace(/\{nombre_completo\}/gi, `${c.nombre} ${c.apellidos}`);
            await sendMensajeLibre(c.telefono, texto);
            enviados++;
          } catch (_) { errores++; }
          await new Promise(r => setTimeout(r, 4000));
        }
        db.run(
          `UPDATE campanas_wa SET total_enviados=?, total_errores=?, finalizado_en=datetime('now') WHERE id=?`,
          [enviados, errores, campanaId]
        );
        console.log(`📣 Campaña "${nombre_campana}" completada: ${enviados} enviados, ${errores} errores`);
      }
    );
  });
});

app.get("/api/campanas", requireAuth(["direccion", "marketing"]), (req, res) => {
  db.all(`SELECT * FROM campanas_wa ORDER BY creado_en DESC LIMIT 50`, [], (err, rows) => {
    if (err) return res.status(500).json({ ok: false });
    res.json({ ok: true, data: rows || [] });
  });
});

app.post("/api/whatsapp/send", requireAuth(["direccion"]), async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });
  try {
    await sendMensajeLibre(telefono, mensaje);
    const jid = telefono.replace(/\D/g, "").replace(/^00/, "").replace(/^(?!34)([679])/, "34$1") + "@s.whatsapp.net";
    addSaraToHistorial(jid, mensaje);
    db.run(
      `INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, tipo) VALUES (?, ?, '[Equipo]', ?, 'manual')`,
      [jid, telefono.replace(/\D/g, ""), mensaje],
      (err) => { if (err) console.error("Error guardando mensaje manual WA:", err.message); }
    );
    db.run(
      `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
       VALUES (?, ?, strftime('%s','now'))
       ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = strftime('%s','now')`,
      [jid, telefono.replace(/\D/g, "")]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/whatsapp/mensajes", requireAuth(["direccion"]), (req, res) => {
  // Devuelve todos los mensajes con el nombre del lead si existe
  db.all(
    `SELECT w.*, COALESCE(l.nombre || ' ' || COALESCE(l.apellidos,''), w.telefono) AS nombre_contacto
     FROM whatsapp_messages w
     LEFT JOIN leads l ON l.telefono = w.telefono
     ORDER BY w.creado_en ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false });
      res.json({ ok: true, data: rows || [] });
    }
  );
});

app.get("/", (req, res) => res.redirect("/login.html"));

const shutdown = (signal) => {
  console.log(`${signal} recibido, guardando BD y cerrando servidor...`);
  backupToReplitDBSync(); // Guardar BD antes de apagar
  setTimeout(() => { process.exit(0); }, 5000).unref();
  server.closeAllConnections?.();
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

function guardarPendienteWA(tipo, destino, reserva) {
  db.run(
    `INSERT INTO pending_whatsapp (tipo, destino, reserva_json) VALUES (?, ?, ?)`,
    [tipo, destino, JSON.stringify(reserva)],
    (err) => { if (err) console.error("Error guardando pendiente WA:", err.message);
               else console.log(`📥 Mensaje WA guardado como pendiente: ${tipo} → ${destino}`); }
  );
}

async function procesarPendientesWA() {
  db.all(`SELECT * FROM pending_whatsapp ORDER BY creado_en ASC`, [], async (err, rows) => {
    if (err || !rows || !rows.length) return;
    console.log(`📨 Procesando ${rows.length} mensajes WhatsApp pendientes...`);
    for (const row of rows) {
      try {
        const reserva = JSON.parse(row.reserva_json);
        if (row.tipo === "confirmacion") await sendConfirmacionCliente(row.destino, reserva);
        else if (row.tipo === "confirmacion_pendiente") await sendConfirmacionPendienteCliente(row.destino, reserva);
        else if (row.tipo === "grupo") await sendNotificacionGrupo(row.destino, reserva);
        else if (row.tipo === "grupo_pendiente") await sendNotificacionGrupoPendiente(row.destino, reserva);
        db.run(`DELETE FROM pending_whatsapp WHERE id = ?`, [row.id]);
        console.log(`✅ Pendiente WA enviado (id ${row.id})`);
      } catch (e) {
        console.error(`Error enviando pendiente WA ${row.id}:`, e.message);
      }
    }
  });
}

const server = app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);

  // Backup inicial tras arrancar (30 s para dar tiempo a que la BD termine de inicializarse)
  setTimeout(() => backupToReplitDB(), 30 * 1000);
  // Backup periódico cada 5 minutos
  setInterval(() => backupToReplitDB(), 5 * 60 * 1000);

  setOnReserva((reserva, jid) => {
    const { local, personas, dia, hora, telefono, nombre_reserva, pendiente } = reserva;
    if (!local || !personas || !dia || !hora || !telefono || !nombre_reserva) return;
    const creado_en = new Date().toISOString();
    db.run(
      `INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [local, personas, dia, hora, telefono, nombre_reserva, creado_en],
      function (err) {
        if (err) { console.error("Error guardando reserva WhatsApp:", err.message); return; }
        // Auto-actualizar perfil con nombre y teléfono obtenidos de la reserva
        if (jid) {
          db.run(
            `INSERT INTO wa_clientes (jid, nombre, telefono, ultima_interaccion)
             VALUES (?, ?, ?, strftime('%s','now'))
             ON CONFLICT(jid) DO UPDATE SET
               nombre = COALESCE(wa_clientes.nombre, excluded.nombre),
               telefono = COALESCE(wa_clientes.telefono, excluded.telefono),
               ultima_interaccion = excluded.ultima_interaccion`,
            [jid, nombre_reserva, telefono],
            (e) => { if (e) console.error("Error actualizando perfil WA:", e.message); }
          );
        }
        console.log(`📅 Reserva WhatsApp guardada (id ${this.lastID}): ${nombre_reserva} en ${local}${pendiente ? " [PENDIENTE]" : ""}`);
        upsertLeadFromReserva({ nombre_reserva, telefono });

        db.get(`SELECT group_jid FROM wa_links WHERE local = ?`, [local], (_, row) => {
          if (row?.group_jid) {
            if (pendiente) {
              if (isReady()) sendNotificacionGrupoPendiente(row.group_jid, reserva);
              else guardarPendienteWA("grupo", row.group_jid, { ...reserva, _pendiente: true });
            } else {
              if (isReady()) sendNotificacionGrupo(row.group_jid, reserva);
              else guardarPendienteWA("grupo", row.group_jid, reserva);
            }
          }
        });

        // Programar follow-up al día siguiente a las 11h (solo reservas confirmadas)
        if (!pendiente) {
          const jid = telefono.replace(/\D/g, "").replace(/^00/, "").replace(/^(?!34)([679])/, "34$1") + "@s.whatsapp.net";
          const [y, m, d] = dia.split("-").map(Number);
          const nextDay = new Date(y, m - 1, d + 1);
          const sendAt = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,"0")}-${String(nextDay.getDate()).padStart(2,"0")}T11:00:00`;
          db.run(
            `INSERT INTO followup_scheduled (jid, nombre, local, dia, send_at) VALUES (?, ?, ?, ?, ?)`,
            [jid, nombre_reserva, local, dia, sendAt],
            (e) => { if (e) console.error("Error programando follow-up:", e.message); }
          );
        }
      }
    );
  });

  // Restaurar config crítica (wa_links, facturas_grupos, etc.) desde KV compacto.
  // Tiene prioridad sobre el backup completo de BD para estas tablas.
  await restoreCriticalConfig();

  // Post-restore: volver a rellenar empresa en facturas que quedaron vacías
  // (necesario porque restoreCriticalConfig puede traer facturas_locales actualizados)
  db.run(
    `UPDATE facturas SET empresa = (
       SELECT fl.empresa FROM facturas_locales fl WHERE fl.local = facturas.local
     )
     WHERE (empresa IS NULL OR empresa = 'Sin empresa asignada')
     AND EXISTS (SELECT 1 FROM facturas_locales fl WHERE fl.local = facturas.local)`,
    (err) => { if (err) console.error("[Migration] empresa post-restore fix:", err.message); }
  );

  setOnReady(procesarPendientesWA);

  // Enviar mensajes de seguimiento post-visita (cada 5 min)
  setInterval(async () => {
    if (!isReady()) return;
    try {
      const ahora = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).replace(" ", "T");
      const pendientes = await dbAll(
        `SELECT * FROM followup_scheduled WHERE sent = 0 AND send_at <= ?`, [ahora]
      );
      for (const row of pendientes) {
        try {
          const nombre = row.nombre.split(" ")[0];
          const msg =
            `¡Hola ${nombre}! 😊 Soy Sara, del equipo de Familia del Amor.\n\n` +
            `Ayer estuviste en ${row.local} y queríamos saber cómo te fue. ¿Todo bien? ` +
            `Si hay algo en lo que podamos mejorar, o simplemente quieres compartir tu experiencia, ` +
            `aquí estamos 🙏\n\n¡Gracias y hasta pronto!`;
          await sendMensajeLibre(row.jid.split("@")[0], msg);
          await dbRun(`UPDATE followup_scheduled SET sent = 1 WHERE id = ?`, [row.id]);
          markAwaitingFollowup(row.jid, { nombre: row.nombre, local: row.local, dia: row.dia });
          console.log(`📤 Follow-up enviado a ${row.jid}`);
        } catch (e) {
          console.error(`Error enviando follow-up a ${row.jid}:`, e.message);
        }
      }
    } catch (e) {
      console.error("Error procesando follow-ups:", e.message);
    }
  }, 5 * 60 * 1000);

  setOnMessage(({ jid, texto, respuesta, historico = false }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    db.run(
      `INSERT OR IGNORE INTO whatsapp_messages (jid, telefono, mensaje, respuesta, historico, tipo) VALUES (?, ?, ?, ?, ?, 'intercambio')`,
      [jid, telefono, texto, respuesta, historico ? 1 : 0],
      (err) => { if (err) console.error("Error guardando mensaje WA:", err.message); }
    );
    db.run(
      `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
       VALUES (?, ?, strftime('%s','now'))
       ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = strftime('%s','now')`,
      [jid, telefono],
      (err) => { if (err) console.error("Error actualizando ultima_interaccion:", err.message); }
    );
  });

  // Rehidratar la memoria de Sara tras un reinicio: últimos intercambios de las 4h recientes
  setHistorialLoader(async (jid) => {
    const rows = await dbAll(
      `SELECT mensaje, respuesta, COALESCE(tipo, 'intercambio') AS tipo
       FROM whatsapp_messages
       WHERE jid = ?
         AND respuesta != '(sin respuesta registrada)'
         AND creado_en > datetime('now', '-4 hours')
       ORDER BY id DESC LIMIT 20`,
      [jid]
    );
    const historial = [];
    for (const r of rows.reverse()) {
      if (r.tipo === "saliente" || r.tipo === "manual") {
        // Mensaje que Sara inició (confirmación, mensaje del equipo): necesita placeholder de user
        historial.push({ role: "user", content: "[El cliente recibió un mensaje del equipo de Familia del Amor]" });
        historial.push({ role: "assistant", content: r.respuesta });
      } else {
        historial.push({ role: "user", content: r.mensaje });
        historial.push({ role: "assistant", content: r.respuesta });
      }
    }
    return historial;
  });

  setPerfilLoader(async (jid) => {
    const row = await dbGet(`SELECT nombre, telefono, notas, ultima_interaccion FROM wa_clientes WHERE jid = ?`, [jid]);
    return row || null;
  });

  setOnMensajeSaliente(({ jid, mensaje, esManual = false }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    const tipo     = esManual ? "manual" : "saliente";
    const origen   = esManual ? "[Operador]" : "[Sistema]";
    db.run(
      `INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, tipo) VALUES (?, ?, ?, ?, ?)`,
      [jid, telefono, origen, mensaje, tipo],
      (err) => { if (err) console.error("Error guardando mensaje saliente WA:", err.message); }
    );
    db.run(
      `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
       VALUES (?, ?, strftime('%s','now'))
       ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = strftime('%s','now')`,
      [jid, telefono]
    );
  });

  setOnActualizarPerfil(async (jid, { campo, valor }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    if (campo === "nombre") {
      db.run(
        `INSERT INTO wa_clientes (jid, telefono, nombre, ultima_interaccion)
         VALUES (?, ?, ?, strftime('%s','now'))
         ON CONFLICT(jid) DO UPDATE SET nombre = ?, ultima_interaccion = strftime('%s','now')`,
        [jid, telefono, valor, valor],
        (err) => { if (err) console.error("Error guardando nombre cliente WA:", err.message); }
      );
    } else if (campo === "nota") {
      const row = await dbGet(`SELECT notas FROM wa_clientes WHERE jid = ?`, [jid]);
      let notas = {};
      if (row?.notas) { try { notas = JSON.parse(row.notas); } catch {} }
      notas[Date.now()] = valor;
      const notasJson = JSON.stringify(notas);
      db.run(
        `INSERT INTO wa_clientes (jid, telefono, notas, ultima_interaccion)
         VALUES (?, ?, ?, strftime('%s','now'))
         ON CONFLICT(jid) DO UPDATE SET notas = ?, ultima_interaccion = strftime('%s','now')`,
        [jid, telefono, notasJson, notasJson],
        (err) => { if (err) console.error("Error guardando nota cliente WA:", err.message); }
      );
    }
  });

  setOnGroupAttachment(async ({ groupJid, senderJid, buffer, mimeType, filename, caption }) => {
    const grupo = await dbGet("SELECT local FROM facturas_grupos WHERE group_jid = ?", [groupJid]);
    if (!grupo) return; // grupo no registrado como grupo de facturas

    const local = grupo.local;
    console.log(`[Facturas] Documento recibido en grupo ${local} de ${senderJid}`);

    try {
      await sendMensajeAGrupo(groupJid, `⏳ Procesando documento para *${local}*...`);

      const result = await procesarFactura({
        buffer, mimeType, filename, local, caption,
        getToken: getDriveAccessToken,
        dbGet, dbRun,
        backupFn: backupCriticalConfig
      });

      const { datos, driveUrl, sheetUrl } = result;
      const tipoLabel = datos.tipo === "albaran" ? "Albarán" : datos.tipo === "ticket" ? "Ticket" : "Factura";
      const totalStr = datos.total != null ? `${Number(datos.total).toFixed(2)} €` : "importe no detectado";
      const provStr = datos.proveedor || "proveedor no detectado";

      await sendMensajeAGrupo(groupJid,
        `✅ *${tipoLabel} registrado · ${local}*\n\n` +
        `🏢 ${provStr}\n` +
        `💶 ${totalStr}` + (datos.porcentaje_iva ? ` (IVA ${datos.porcentaje_iva}%)` : "") + `\n` +
        `📅 ${datos.fecha || "fecha no detectada"}\n\n` +
        `📁 Drive: ${driveUrl}\n` +
        `📊 Sheet: ${sheetUrl || `https://docs.google.com/spreadsheets/d/${result.sheetId}`}`
      );
    } catch (err) {
      if (err instanceof FacturaDuplicadaError) {
        console.warn("[Facturas] Duplicado detectado:", err.message);
        await sendMensajeAGrupo(groupJid,
          `⚠️ *Documento duplicado · ${local}*\n\n` +
          `${err.message}\n\n` +
          `El documento NO se ha registrado de nuevo.`
        ).catch(() => {});
      } else {
        console.error("[Facturas] Error procesando documento:", err.message);
        await sendMensajeAGrupo(groupJid,
          `❌ No he podido procesar el documento: ${err.message.slice(0, 120)}\n\nRevisa que Google Drive esté conectado en el panel.`
        ).catch(() => {});
      }
    }
  });

  initWhatsApp();

  // Polling de Gmail: primer check a los 30 segundos, luego cada 5 minutos
  setTimeout(pollGmail, 30 * 1000);
  setInterval(pollGmail, 5 * 60 * 1000);

  // ── Resumen mensual por WhatsApp: día 10 de cada mes a las 9:00h (Madrid) ──
  const MESES_CAP = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  async function enviarResumenMensualFacturas() {
    try {
      const prev = new Date();
      prev.setDate(1);
      prev.setMonth(prev.getMonth() - 1);
      const mesIdx = prev.getMonth();
      const año    = prev.getFullYear();
      const mesLabel   = `${MESES_CAP[mesIdx]} ${año}`;
      const yearMonth  = `${año}-${String(mesIdx + 1).padStart(2, "0")}`;

      const rows = await dbAll(
        `SELECT local, COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible,0)),2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0)),2) AS iva,
           ROUND(SUM(COALESCE(total,0)),2) AS total
         FROM facturas
         WHERE strftime('%Y-%m', fecha) = ?
         GROUP BY local ORDER BY total DESC`,
        [yearMonth]
      );

      if (!rows.length) {
        console.log(`[Resumen] Sin facturas para ${mesLabel} — resumen omitido`);
        return;
      }

      const fmt  = n => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sumB = rows.reduce((s, r) => s + (r.base  || 0), 0);
      const sumI = rows.reduce((s, r) => s + (r.iva   || 0), 0);
      const sumT = rows.reduce((s, r) => s + (r.total || 0), 0);
      const sumD = rows.reduce((s, r) => s + (r.num_docs || 0), 0);

      let msg = `*📊 Resumen de facturas — ${mesLabel}*\n\n`;
      for (const r of rows) {
        msg += `*${r.local}*\n`;
        msg += `  ${r.num_docs} doc${r.num_docs !== 1 ? "s" : ""} · Base: ${fmt(r.base)} € · IVA: ${fmt(r.iva)} € · *Total: ${fmt(r.total)} €*\n\n`;
      }
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `*TOTAL · ${sumD} documentos*\n`;
      msg += `  Base imponible: ${fmt(sumB)} €\n`;
      msg += `  IVA soportado:  ${fmt(sumI)} €\n`;
      msg += `  *Total gastos:  ${fmt(sumT)} €*`;

      await sendMensajeLibre("622149946", msg);
      await dbRun(
        "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('resumen_mensual_ultimo', ?, datetime('now'))",
        [yearMonth]
      );
      console.log(`[Resumen] ✅ Resumen ${mesLabel} enviado a 622149946`);
    } catch (err) {
      console.error("[Resumen]", err.message);
    }
  }

  // Chequeo cada hora; dispara solo el día 10 a las 9:00h si aún no se envió este mes
  setInterval(async () => {
    try {
      if (!isReady()) return;
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
      if (now.getDate() !== 10 || now.getHours() !== 9) return;
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYM = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const ultimo = await dbGet("SELECT value FROM config WHERE key = 'resumen_mensual_ultimo'");
      if (ultimo?.value === prevYM) return; // ya enviado
      await enviarResumenMensualFacturas();
    } catch (e) { console.error("[Resumen cron]", e.message); }
  }, 60 * 60 * 1000);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Puerto ${PORT} ocupado. Esperando y reintentando...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 2000);
  } else {
    console.error("Error del servidor:", err.message);
  }
});
