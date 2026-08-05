import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { execSync, execFileSync } from "child_process";
import zlib from "zlib";
import { initWhatsApp, sendConfirmacionCliente, sendConfirmacionPendienteCliente, sendCancelacionCliente, sendMensajeLibre, sendDocumentoLibre, sendNotificacionGrupo, sendNotificacionGrupoPendiente, sendCancelacionGrupo, getGroups, isReady, getQRImage, setOnReserva, setOnReady, setOnMessage, setHistorialLoader, markAwaitingFollowup, setPerfilLoader, setOnMensajeSaliente, setOnActualizarPerfil, addSaraToHistorial, setOnGroupAttachment, sendMensajeAGrupo, setSaraConfigLoader, setDocumentoResolver, setReservaLoader, setOnCancelarReserva, setOnContactoLead } from "./whatsapp.js";
import Anthropic from "@anthropic-ai/sdk";
import { procesarFactura, procesarFacturaSinLocal, asignarFacturaPendiente, FacturaDuplicadaError, migrarEstructuraDrive } from "./facturas.js";
// Núcleo técnico portado a PostgreSQL (seguridad 1A, modelo de establecimientos, enforcement).
import { isProduction, replitEnvWarning, resolveJwtSecret, errorHandler, isAllowedCvUpload, safeUploadName, finalizeCvUpload, CV_MAX_BYTES } from "./security.js";
import { permisosV2Enabled } from "./src/core/flags.js";
import { ensureSchema as ensureEstablecimientosSchema, seedCatalogo } from "./src/db/establecimientos.migration.js";
import { listMaintenanceIssues, createMaintenanceIssue, updateMaintenanceIssueStatus } from "./src/modules/mantenimiento/maintenance.service.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// ── PostgreSQL pool ───────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("neon") ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[PG] Error en pool (no fatal):", err.message);
});

// Translate ? placeholders → $1, $2, ...
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function dbGet(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  return result.rows[0] || null;
}
async function dbAll(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  return result.rows;
}
// dbRun returns the first row if the query has RETURNING, otherwise undefined.
async function dbRun(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  return result.rows[0] || undefined;
}

// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 5000;
// JWT endurecido (Iteración 1A): en producción exige un secreto FUERTE o el proceso NO arranca
// (refuse-to-boot); en desarrollo usa un secreto fijo estable. Nunca queda un fallback inseguro.
const PROD = isProduction();
const _envWarn = replitEnvWarning();
if (_envWarn) console.warn("[env]", _envWarn);
const { secret: JWT_SECRET, status: jwtStatus, source: jwtSource } = resolveJwtSecret({ prod: PROD });
console.log(`[auth] JWT secret: ${jwtStatus} (fuente: ${jwtSource})`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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

// Subida de CV endurecida (Iteración 1A): se guarda primero en un directorio PRIVADO fuera de
// public/, con límite de tamaño y allowlist de extensión+MIME; solo se publica tras validar los
// magic bytes reales (ver el handler de /api/hr/applications con finalizeCvUpload).
const uploadsTmpDir = path.join(__dirname, "tmp_uploads");
if (!fs.existsSync(uploadsTmpDir)) fs.mkdirSync(uploadsTmpDir, { recursive: true });
const cvStorage = multer.diskStorage({
  destination: (req, file, cb) => { if (!fs.existsSync(uploadsTmpDir)) fs.mkdirSync(uploadsTmpDir, { recursive: true }); cb(null, uploadsTmpDir); },
  filename: (req, file, cb) => cb(null, safeUploadName(file.originalname)),
});
const uploadCv = multer({
  storage: cvStorage,
  limits: { fileSize: CV_MAX_BYTES },
  fileFilter: (req, file, cb) => cb(null, isAllowedCvUpload(file)),
});

// ── Inicializar esquema PostgreSQL ────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL,
        nombre TEXT,
        local TEXT,
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL DEFAULT '',
        apellidos TEXT NOT NULL DEFAULT '',
        nacimiento TEXT NOT NULL DEFAULT '',
        poblacion TEXT NOT NULL DEFAULT '',
        telefono TEXT NOT NULL DEFAULT '',
        correo TEXT NOT NULL DEFAULT '',
        premio TEXT NOT NULL DEFAULT '',
        creado_en TEXT NOT NULL,
        genero TEXT,
        fuente TEXT DEFAULT 'web',
        actualizado_en TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reservas (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        personas INTEGER NOT NULL,
        dia TEXT NOT NULL,
        hora TEXT NOT NULL,
        telefono TEXT NOT NULL,
        nombre_reserva TEXT NOT NULL,
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bloqueos_reservas (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        desde TEXT NOT NULL,
        hasta TEXT NOT NULL,
        motivo TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sara_respuestas (
        id SERIAL PRIMARY KEY,
        tema TEXT NOT NULL,
        disparadores TEXT,
        respuesta TEXT,
        documento_url TEXT,
        local TEXT,
        activo INTEGER DEFAULT 1,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contents (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_links (
        local TEXT PRIMARY KEY,
        group_jid TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_jobs (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        local TEXT NOT NULL,
        tipo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1,
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_applications (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL,
        telefono TEXT NOT NULL,
        puesto TEXT NOT NULL,
        mensaje TEXT,
        cv_url TEXT,
        estado TEXT NOT NULL DEFAULT 'nuevo',
        creado_en TEXT NOT NULL,
        edad INTEGER,
        experiencia TEXT,
        poblacion TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_issues (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        titulo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'abierta',
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        rol TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        creado_en TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS google_reviews (
        id TEXT PRIMARY KEY,
        location_name TEXT,
        author TEXT,
        rating INTEGER,
        text TEXT,
        fecha TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS followup_scheduled (
        id SERIAL PRIMARY KEY,
        jid TEXT NOT NULL,
        nombre TEXT NOT NULL,
        local TEXT NOT NULL,
        dia TEXT NOT NULL,
        send_at TEXT NOT NULL,
        sent INTEGER DEFAULT 0,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id SERIAL PRIMARY KEY,
        jid TEXT NOT NULL,
        telefono TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        respuesta TEXT NOT NULL,
        historico INTEGER DEFAULT 0,
        tipo TEXT DEFAULT 'intercambio',
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_grupos (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        group_jid TEXT NOT NULL UNIQUE,
        sheet_id TEXT,
        sheet_url TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas (
        id SERIAL PRIMARY KEY,
        local TEXT NOT NULL,
        tipo TEXT,
        fecha TEXT,
        numero_factura TEXT,
        proveedor TEXT,
        nif TEXT,
        concepto TEXT,
        base_imponible NUMERIC,
        porcentaje_iva NUMERIC,
        cuota_iva NUMERIC,
        total NUMERIC,
        drive_url TEXT,
        sheet_id TEXT,
        file_hash TEXT,
        empresa TEXT,
        pagado INTEGER DEFAULT 0,
        fecha_pago TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_clientes (
        jid TEXT PRIMARY KEY,
        nombre TEXT,
        telefono TEXT,
        notas TEXT DEFAULT '{}',
        ultima_interaccion BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_email_reglas (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        local TEXT NOT NULL,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_emails_procesados (
        id SERIAL PRIMARY KEY,
        gmail_id TEXT NOT NULL UNIQUE,
        de_email TEXT,
        asunto TEXT,
        local TEXT,
        adjuntos_procesados INTEGER DEFAULT 0,
        procesado TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_locales (
        local TEXT PRIMARY KEY,
        empresa TEXT NOT NULL,
        cif TEXT,
        local_contable TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_pendientes (
        id SERIAL PRIMARY KEY,
        empresa_detectada TEXT,
        nif_receptor TEXT,
        nombre_receptor TEXT,
        tipo TEXT,
        fecha TEXT,
        numero_factura TEXT,
        proveedor TEXT,
        nif TEXT,
        concepto TEXT,
        base_imponible NUMERIC,
        porcentaje_iva NUMERIC,
        cuota_iva NUMERIC,
        total NUMERIC,
        drive_url TEXT,
        drive_file_id TEXT,
        file_hash TEXT,
        origen TEXT DEFAULT 'email',
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS campanas_wa (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        segmento_json TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        total_enviados INTEGER DEFAULT 0,
        total_errores INTEGER DEFAULT 0,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
        finalizado_en TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_whatsapp (
        id SERIAL PRIMARY KEY,
        tipo TEXT NOT NULL,
        destino TEXT NOT NULL,
        reserva_json TEXT NOT NULL,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_worker_notes (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'nota',
        contenido TEXT NOT NULL,
        autor TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_preguntas_mes (
        id SERIAL PRIMARY KEY,
        mes TEXT NOT NULL,
        orden INTEGER DEFAULT 0,
        pregunta TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_llamadas_mes (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL,
        mes TEXT NOT NULL,
        realizada INTEGER DEFAULT 0,
        fecha_llamada TEXT,
        respuestas TEXT,
        comentario_libre TEXT,
        autor TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(worker_id, mes)
      )
    `);

    // Seed usuarios por defecto si la tabla está vacía
    const { rows: usersCount } = await client.query("SELECT COUNT(*) AS total FROM users");
    if (parseInt(usersCount[0].total) === 0) {
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
        await client.query(
          `INSERT INTO users (username, password_hash, rol, nombre, creado_en) VALUES ($1, $2, $3, $4, $5)`,
          [u.username, hash, u.rol, u.nombre, new Date().toISOString()]
        );
      }
      console.log("Usuarios por defecto creados. Contraseña: tapeta2024");
    }

    // Rellenar empresa en facturas que quedaron como null o "Sin empresa asignada"
    await client.query(
      `UPDATE facturas SET empresa = (
         SELECT fl.empresa FROM facturas_locales fl WHERE fl.local = facturas.local
       )
       WHERE (empresa IS NULL OR empresa = 'Sin empresa asignada')
       AND EXISTS (SELECT 1 FROM facturas_locales fl WHERE fl.local = facturas.local)`
    );

    // Modelo de establecimientos (Iteración 2): esquema ADITIVO e idempotente + catálogo canónico.
    // No hace backfill de datos (eso es un paso manual y explícito: scripts/migrate-establecimientos.js).
    const schemaX = { run: (sql, p = []) => client.query(toPositional(sql), p) };
    await ensureEstablecimientosSchema(schemaX);
    await seedCatalogo(schemaX);

    console.log("[DB] Esquema PostgreSQL inicializado");
  } finally {
    client.release();
  }
}

// ── KV → PostgreSQL: restauración de respaldo antiguo (idempotente) ──────────
// Si existen datos en Replit KV de la época SQLite, los importa una sola vez.
async function restoreFromKV() {
  const dbUrl = process.env.REPLIT_DB_URL;
  if (!dbUrl) return;

  // Restaurar leads desde copia comprimida
  try {
    const raw = execSync(`curl -sf "${dbUrl}/latapeta_leads_v1"`, { encoding: "utf8", timeout: 10000 }).trim();
    if (raw && raw !== "null" && raw.length >= 5) {
      let leads;
      try { leads = JSON.parse(zlib.gunzipSync(Buffer.from(raw, "base64")).toString()); } catch { leads = null; }
      if (Array.isArray(leads) && leads.length) {
        let restaurados = 0;
        for (const l of leads) {
          try {
            const existe = await dbGet(
              "SELECT id FROM leads WHERE (telefono != '' AND telefono = ?) OR (correo != '' AND correo = ?)",
              [l.telefono || "", l.correo || ""]
            );
            if (!existe) {
              await dbRun(
                `INSERT INTO leads (nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, fuente, genero, creado_en, actualizado_en)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT DO NOTHING`,
                [l.nombre || "", l.apellidos || "", l.nacimiento || "", l.poblacion || "", l.telefono || "", l.correo || "",
                 l.premio || "", l.fuente || "web", l.genero || null, l.creado_en || new Date().toISOString(), l.actualizado_en || null]
              );
              restaurados++;
            }
          } catch {}
        }
        if (restaurados) console.log(`[KV→PG] ${restaurados} leads restaurados desde KV`);
      }
    }
  } catch (e) { console.error("[KV→PG] Error restaurando leads:", e.message); }

  // Restaurar config crítica (wa_links, facturas_grupos, etc.)
  try {
    const raw = execSync(`curl -sf "${dbUrl}/latapeta_critical_config_v2"`, { encoding: "utf8", timeout: 10000 }).trim();
    if (raw && raw !== "null" && raw.length >= 5) {
      const cfg = JSON.parse(raw);
      const ahora = new Date().toISOString();
      for (const { local, group_jid } of (cfg.waLinks || [])) {
        await dbRun(
          "INSERT INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?) ON CONFLICT(local) DO UPDATE SET group_jid=EXCLUDED.group_jid, updated_at=EXCLUDED.updated_at",
          [local, group_jid, ahora]
        );
        await dbRun(
          "INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at",
          [`whatsapp_group_${local}`, group_jid, ahora]
        );
      }
      for (const { local, group_jid, sheet_id, sheet_url } of (cfg.facturasGrupos || [])) {
        await dbRun(
          `INSERT INTO facturas_grupos (local, group_jid, sheet_id, sheet_url) VALUES (?, ?, ?, ?)
           ON CONFLICT(group_jid) DO UPDATE SET local=EXCLUDED.local,
             sheet_id=COALESCE(EXCLUDED.sheet_id, facturas_grupos.sheet_id),
             sheet_url=COALESCE(EXCLUDED.sheet_url, facturas_grupos.sheet_url)`,
          [local, group_jid, sheet_id || null, sheet_url || null]
        );
      }
      for (const r of (cfg.facturasLocales || [])) {
        await dbRun(
          `INSERT INTO facturas_locales (local, empresa, cif, local_contable) VALUES (?, ?, ?, ?)
           ON CONFLICT(local) DO UPDATE SET empresa=EXCLUDED.empresa, cif=EXCLUDED.cif, local_contable=EXCLUDED.local_contable`,
          [r.local, r.empresa, r.cif, r.local_contable]
        );
      }
      for (const r of (cfg.emailReglas || [])) {
        await dbRun(
          `INSERT INTO facturas_email_reglas (email, local) VALUES (?, ?) ON CONFLICT(email) DO NOTHING`,
          [r.email, r.local]
        );
      }
      console.log(`[KV→PG] Config crítica restaurada desde KV`);
    }
  } catch (e) { console.error("[KV→PG] Error restaurando config:", e.message); }
}

// ── Google Business OAuth ─────────────────────────────────────────────────

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI  = (process.env.BASE_URL || "https://familia-del-amor.replit.app") + "/auth/google/callback";
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

async function getConfig(key) {
  const row = await dbGet("SELECT value FROM config WHERE key = ?", [key]);
  return row ? row.value : null;
}
async function setConfig(key, value) {
  await dbRun(
    `INSERT INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
    [key, String(value)]
  );
}

// Devuelve el bloqueo de reservas que aplica a (local, dia) o null.
async function estaBloqueado(local, dia) {
  if (!local || !dia) return null;
  return await dbGet(
    `SELECT * FROM bloqueos_reservas
     WHERE (local = ? OR local = 'Todos')
       AND ?::date BETWEEN desde::date AND hasta::date
     ORDER BY id LIMIT 1`,
    [local, dia]
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
           ON CONFLICT(id) DO UPDATE SET author=EXCLUDED.author, rating=EXCLUDED.rating,
             text=EXCLUDED.text, fecha=EXCLUDED.fecha`,
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
         ON CONFLICT(id) DO UPDATE SET author=EXCLUDED.author, rating=EXCLUDED.rating,
           text=EXCLUDED.text, fecha=EXCLUDED.fecha`,
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
      const localConocido = regla?.local || null;

      const parts = flattenParts(msg.payload);
      const adjuntos = parts.filter(p =>
        p.filename && p.body?.attachmentId &&
        (p.mimeType === "application/pdf" || p.mimeType?.startsWith("image/"))
      );

      if (adjuntos.length === 0) {
        await markGmailRead(token, msgId);
        await dbRun(
          "INSERT INTO facturas_emails_procesados (gmail_id, de_email, asunto, local, adjuntos_procesados) VALUES (?, ?, ?, ?, 0) ON CONFLICT(gmail_id) DO NOTHING",
          [msgId, senderEmail, subject, localConocido || "auto"]
        );
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
            await procesarFactura({
              buffer, mimeType: parte.mimeType,
              filename: parte.filename || `adjunto_${msgId}`,
              local: localConocido,
              caption: `Email · ${from} · ${subject}`,
              getToken: getDriveAccessToken, dbGet, dbRun,
              backupFn: null
            });
          } else {
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
        "INSERT INTO facturas_emails_procesados (gmail_id, de_email, asunto, local, adjuntos_procesados) VALUES (?, ?, ?, ?, ?) ON CONFLICT(gmail_id) DO NOTHING",
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
      "INSERT INTO facturas_grupos (local, group_jid) VALUES (?, ?) ON CONFLICT(group_jid) DO UPDATE SET local = EXCLUDED.local",
      [local, group_jid]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/facturas/grupos/:id", requireAuth(["direccion"]), async (req, res) => {
  await dbRun("DELETE FROM facturas_grupos WHERE id = ?", [req.params.id]);
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
      "INSERT INTO facturas_email_reglas (email, local) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET local = EXCLUDED.local",
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
       ON CONFLICT(local) DO UPDATE SET empresa = EXCLUDED.empresa, cif = EXCLUDED.cif, local_contable = EXCLUDED.local_contable`,
      [local, empresa.trim(), (cif || "").trim() || null, (local_contable || "").trim() || null]
    );
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
    const result = await asignarFacturaPendiente({ pendiente, local, getToken: getDriveAccessToken, dbGet, dbAll, dbRun, backupFn: null });
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
        `SELECT local, TO_CHAR(fecha::date, 'MM') AS mes,
           COUNT(*) AS num,
           ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total,
           ROUND(SUM(COALESCE(base_imponible,0))::NUMERIC, 2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0))::NUMERIC, 2) AS iva
         FROM facturas
         WHERE TO_CHAR(fecha::date, 'YYYY') = ? AND fecha IS NOT NULL
         GROUP BY local, mes ORDER BY local, mes`,
        [String(año)]
      ),
      dbAll(
        `SELECT MIN(proveedor) AS proveedor, COUNT(*) AS num, ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas
         WHERE TO_CHAR(fecha::date, 'YYYY') = ? AND proveedor IS NOT NULL AND TRIM(proveedor) != ''
         GROUP BY LOWER(TRIM(proveedor))
         ORDER BY total DESC LIMIT 10`,
        [String(año)]
      ),
      dbAll(
        `SELECT local, COUNT(*) AS num, ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas
         WHERE TO_CHAR(fecha::date, 'YYYY') = ?
         GROUP BY local ORDER BY total DESC`,
        [String(año)]
      ),
      dbGet(
        `SELECT COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible,0))::NUMERIC, 2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0))::NUMERIC, 2) AS iva,
           ROUND(SUM(COALESCE(total,0))::NUMERIC, 2) AS total
         FROM facturas WHERE TO_CHAR(fecha::date, 'YYYY') = ?`,
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

    const [porTipoIva, totales, otrosDocs, locales] = await Promise.all([
      dbAll(
        `SELECT
           CAST(ROUND(COALESCE(porcentaje_iva, 0)) AS INTEGER) AS tipo_iva,
           COUNT(*) AS num_docs,
           ROUND(SUM(COALESCE(base_imponible, 0))::NUMERIC, 2) AS base_total,
           ROUND(SUM(COALESCE(cuota_iva, 0))::NUMERIC, 2) AS cuota_total
         FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? AND LOWER(tipo) = 'factura'
         GROUP BY CAST(ROUND(COALESCE(porcentaje_iva, 0)) AS INTEGER)
         ORDER BY tipo_iva`,
        [empresa, fechaInicio, fechaFin]
      ),
      dbGet(
        `SELECT
           COUNT(*) AS num_facturas,
           ROUND(SUM(COALESCE(base_imponible, 0))::NUMERIC, 2) AS base_total,
           ROUND(SUM(COALESCE(cuota_iva, 0))::NUMERIC, 2) AS cuota_total,
           ROUND(SUM(COALESCE(total, 0))::NUMERIC, 2) AS importe_total
         FROM facturas
         WHERE empresa = ? AND fecha BETWEEN ? AND ? AND LOWER(tipo) = 'factura'`,
        [empresa, fechaInicio, fechaFin]
      ),
      dbGet(
        `SELECT COUNT(*) AS num_otros, ROUND(SUM(COALESCE(total, 0))::NUMERIC, 2) AS total_otros
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

// OAuth routes
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
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Faltan credenciales" });
  }
  try {
    const user = await dbGet("SELECT * FROM users WHERE username = ?", [username]);
    if (!user) return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre, local: user.local },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ ok: true, token, rol: user.rol, nombre: user.nombre });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error de autenticación" });
  }
});

app.get("/api/auth/me", requireAuth(), (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Gestión de usuarios (solo dirección)
app.get("/api/users", requireAuth(["direccion"]), async (req, res) => {
  try {
    const rows = await dbAll("SELECT id, username, rol, nombre, local, creado_en FROM users ORDER BY rol");
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo usuarios" });
  }
});

app.post("/api/users", requireAuth(["direccion"]), async (req, res) => {
  const { username, password, rol, nombre, local } = req.body;
  if (!username || !password || !rol) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const creado_en = new Date().toISOString();
    const row = await dbRun(
      `INSERT INTO users (username, password_hash, rol, nombre, local, creado_en) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [username, hash, rol, nombre || "", local || "", creado_en]
    );
    res.json({ ok: true, id: row.id });
  } catch (err) {
    res.status(400).json({ ok: false, error: "Usuario ya existe o error al crear" });
  }
});

app.put("/api/users/:id/password", requireAuth(["direccion"]), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ ok: false, error: "Contraseña requerida" });
  try {
    const hash = await bcrypt.hash(password, 10);
    await dbRun("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error actualizando contraseña" });
  }
});

app.delete("/api/users/:id", requireAuth(["direccion"]), async (req, res) => {
  try {
    await dbRun("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error eliminando usuario" });
  }
});

// Leads
app.post("/api/leads", async (req, res) => {
  const { nombre, apellidos, nacimiento, poblacion, telefono, correo, fuente, genero } = req.body;
  if (!nombre || !apellidos || !nacimiento || !poblacion || !telefono || !correo) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const premio = "10% de descuento";
  const ahora = new Date().toISOString();
  const fuenteVal = fuente || "web";
  const generoVal = genero || null;

  try {
    const existing = await dbGet(`SELECT id FROM leads WHERE telefono = ? OR correo = ?`, [telefono, correo]);
    if (existing) {
      await dbRun(
        `UPDATE leads SET nombre=?, apellidos=?, nacimiento=?, poblacion=?, genero=COALESCE(?,genero), fuente=?, actualizado_en=? WHERE id=?`,
        [nombre, apellidos, nacimiento, poblacion, generoVal, fuenteVal, ahora, existing.id]
      );
      return res.json({ ok: true, premio, actualizado: true });
    } else {
      await dbRun(
        `INSERT INTO leads (nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, fuente, genero, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, fuenteVal, generoVal, ahora]
      );
      mirrorLeadToSheet({ nombre, apellidos, telefono, correo, poblacion, nacimiento, genero: generoVal, fuente: fuenteVal, premio });
      return res.json({ ok: true, premio });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando lead" });
  }
});

// Crea/actualiza un lead por teléfono.
async function upsertLead({ nombre = "", apellidos = "", telefono, fuente = "web" }) {
  if (!telefono) return;
  const ahora = new Date().toISOString();
  try {
    const row = await dbGet(`SELECT id, nombre, apellidos FROM leads WHERE telefono = ?`, [telefono]);
    if (row) {
      const nuevoNombre = (!row.nombre || row.nombre === "") && nombre ? nombre : row.nombre;
      const nuevoApellidos = (!row.apellidos || row.apellidos === "") && apellidos ? apellidos : row.apellidos;
      await dbRun(
        `UPDATE leads SET nombre = ?, apellidos = ?, actualizado_en = ? WHERE id = ?`,
        [nuevoNombre || "", nuevoApellidos || "", ahora, row.id]
      );
    } else {
      await dbRun(
        `INSERT INTO leads (nombre, apellidos, telefono, nacimiento, poblacion, correo, premio, fuente, creado_en) VALUES (?, ?, ?, '', '', '', '', ?, ?)`,
        [nombre, apellidos, telefono, fuente, ahora]
      );
      mirrorLeadToSheet({ nombre, apellidos, telefono, correo: "", poblacion: "", nacimiento: "", genero: null, fuente, premio: "" });
    }
  } catch (e) {
    console.error("[upsertLead] Error:", e.message);
  }
}

function upsertLeadFromReserva({ nombre_reserva, telefono }) {
  const nombre = (nombre_reserva || "").split(" ")[0] || nombre_reserva || "";
  const apellidos = (nombre_reserva || "").split(" ").slice(1).join(" ");
  upsertLead({ nombre, apellidos, telefono, fuente: "reserva" });
}

// ── Espejo de leads en Google Sheets ──────────────────────────────────────
async function ensureLeadsSheet(token) {
  let id = await getConfig("leads_sheet_id");
  if (id) return id;
  const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title: "Leads · Familia del Amor" } })
  });
  const data = await r.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  id = data.spreadsheetId;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [["Fecha", "Nombre", "Apellidos", "Teléfono", "Correo", "Población", "Nacimiento", "Género", "Fuente", "Premio"]] })
  });
  await setConfig("leads_sheet_id", id);
  console.log(`[Leads] Hoja de Google Sheets creada: ${id}`);
  return id;
}

async function mirrorLeadToSheet(lead) {
  try {
    const refresh = await getConfig("google_drive_refresh_token");
    if (!refresh) return;
    const token = await getDriveAccessToken();
    const id = await ensureLeadsSheet(token);
    const fecha = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    const fila = [fecha, lead.nombre || "", lead.apellidos || "", lead.telefono || "", lead.correo || "",
      lead.poblacion || "", lead.nacimiento || "", lead.genero || "", lead.fuente || "", lead.premio || ""];
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [fila] })
    });
    console.log(`[Leads] Fila añadida a Google Sheets: ${lead.nombre} ${lead.apellidos}`);
  } catch (e) {
    console.error("[Leads] No se pudo escribir en Sheets:", e.message);
  }
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
      GROUP BY r.telefono, r.nombre_reserva
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
  if (cumple_mes) { sql += ` AND TO_CHAR(c.nacimiento::date, 'MM') = ?`; params.push(cumple_mes.padStart(2, "0")); }
  if (filtros.from) { sql += ` AND c.ultima_actividad >= ?`; params.push(filtros.from); }
  if (filtros.to) { sql += ` AND c.ultima_actividad <= ?`; params.push(filtros.to + " 23:59:59"); }

  sql += ` ORDER BY c.ultima_actividad DESC`;
  return sql;
}

app.get("/api/leads", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const params = [];
    const sql = sqlContactosUnificados(req.query, params);
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo leads" });
  }
});

// Diagnóstico
app.get("/api/debug/estado", requireAuth(["direccion"]), async (req, res) => {
  try {
    const leads = await dbGet("SELECT COUNT(*) c FROM leads");
    const reservas = await dbGet("SELECT COUNT(*) c FROM reservas");
    const waClientes = await dbGet("SELECT COUNT(*) c FROM wa_clientes");
    const porFuente = await dbAll("SELECT fuente, COUNT(*) c FROM leads GROUP BY fuente");
    res.json({
      ok: true,
      leads_total: parseInt(leads?.c ?? 0),
      leads_por_fuente: porFuente,
      reservas_total: parseInt(reservas?.c ?? 0),
      wa_clientes_total: parseInt(waClientes?.c ?? 0),
      db_engine: "postgresql"
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/leads/export.csv", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const params = [];
    const sql = sqlContactosUnificados(req.query, params);
    const rows = await dbAll(sql, params);
    const header = "nombre,apellidos,telefono,correo,nacimiento,poblacion,genero,origen,ultima_actividad";
    const lines = rows.map((r) =>
      [r.nombre, r.apellidos, r.telefono, r.correo, r.nacimiento, r.poblacion, r.genero, r.origen, r.ultima_actividad]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="contactos.csv"`);
    res.send([header, ...lines].join("\n"));
  } catch (e) {
    res.status(500).send("Error exportando");
  }
});

// Contenidos
app.get("/api/content", async (req, res) => {
  try {
    const rows = await dbAll(`SELECT key, value FROM contents`);
    const data = {};
    rows.forEach((r) => { data[r.key] = r.value; });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo contenidos" });
  }
});

app.put("/api/content", requireAuth(["marketing", "direccion"]), async (req, res) => {
  const { key, value } = req.body;
  if (!key || typeof value !== "string") {
    return res.status(400).json({ ok: false, error: "Datos inválidos" });
  }
  const updated_at = new Date().toISOString();
  try {
    await dbRun(
      `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
      [key, value, updated_at]
    );
    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando contenido" });
  }
});

// ── Registro de contenidos editables (fuente única) ─────────────────────────
const WEB_LOCALES = [
  { slug: "la-tapeta-blanes", name: "La Tapeta Blanes" },
  { slug: "la-tapeta-lloret", name: "La Tapeta Lloret" },
  { slug: "la-tapeta-girona", name: "La Tapeta Girona" },
  { slug: "cooperativa", name: "Cooperativa" },
  { slug: "can-mateu", name: "Can Mateu" },
  { slug: "la-tapa-iberica", name: "La Tapa Ibérica" },
  { slug: "botiga-d-en-mateu", name: "Botiga d'en Mateu" },
  { slug: "viva-la-pepa", name: "Viva la Pepa" }
];

const LOCAL_FIELDS = [
  { suffix: "menu_pdf", label: "Carta", type: "pdf" },
  { suffix: "menu_almuerzo_pdf", label: "Menú mediodía", type: "pdf" },
  { suffix: "instagram", label: "Instagram", type: "url" },
  { suffix: "hours", label: "Horario", type: "text" },
  { suffix: "map", label: "Mapa", type: "url" },
  { suffix: "history", label: "Historia", type: "text" },
  { suffix: "gallery", label: "Galería de fotos", type: "gallery" }
];

const GLOBAL_FIELDS = {
  hero_eyebrow:       { label: "Etiqueta superior",     section: "Hero",      type: "text_i18n" },
  hero_title:         { label: "Título principal",      section: "Hero",      type: "text_i18n" },
  hero_sub:           { label: "Subtítulo",             section: "Hero",      type: "text_i18n" },
  hero_cta:           { label: "Botón 'Reservar'",      section: "Hero",      type: "text_i18n" },
  hero_cta_2:         { label: "Botón 'Ver locales'",   section: "Hero",      type: "text_i18n" },
  hero_image_url:     { label: "Imagen de fondo",       section: "Hero",      type: "image" },
  site_logo_url:      { label: "Logo del sitio",        section: "General",   type: "image" },
  companies_title:    { label: "Título sección locales",section: "Locales",   type: "text_i18n" },
  companies_sub:      { label: "Subtítulo locales",     section: "Locales",   type: "text_i18n" },
  gallery_title:      { label: "Título galería",        section: "Galería",   type: "text_i18n" },
  gallery_sub:        { label: "Subtítulo galería",     section: "Galería",   type: "text_i18n" },
  gallery_images:     { label: "Fotos de la galería",   section: "Galería",   type: "gallery" },
  reservations_title: { label: "Título reservas",       section: "Reservas",  type: "text_i18n" },
  reservations_sub:   { label: "Subtítulo reservas",    section: "Reservas",  type: "text_i18n" },
  reviews_title:      { label: "Título reseñas",        section: "Reseñas",   type: "text_i18n" },
  reviews_sub:        { label: "Valoración Google",     section: "Reseñas",   type: "text_i18n" },
  strip_title:        { label: "Franja: título",        section: "Descuento", type: "text_i18n" },
  strip_sub:          { label: "Franja: texto",         section: "Descuento", type: "text_i18n" },
  strip_cta:          { label: "Franja: botón",         section: "Descuento", type: "text_i18n" },
  popup_title:        { label: "Popup: título",         section: "Popup",     type: "text_i18n" },
  popup_text:         { label: "Popup: texto",          section: "Popup",     type: "text_i18n" },
  contact_title:      { label: "Título contacto",       section: "Contacto",  type: "text_i18n" },
  contact_text:       { label: "Texto contacto",        section: "Contacto",  type: "text_i18n" }
};

function getContentRegistry() {
  const campos = {};
  for (const [key, def] of Object.entries(GLOBAL_FIELDS)) campos[key] = { ...def, scope: "global" };
  for (const loc of WEB_LOCALES) {
    for (const f of LOCAL_FIELDS) {
      campos[`local_${loc.slug}_${f.suffix}`] = {
        label: `${f.label} de ${loc.name}`, section: loc.name, type: f.type, scope: "local", local: loc.slug
      };
    }
  }
  return { locales: WEB_LOCALES, campos };
}

function keyEnRegistro(key, campos) {
  if (campos[key]) return true;
  const m = key.match(/^(.*)_(es|ca|en)$/);
  return !!(m && campos[m[1]] && campos[m[1]].type === "text_i18n");
}

app.get("/api/content/registry", requireAuth(["marketing", "direccion"]), (req, res) => {
  res.json({ ok: true, ...getContentRegistry() });
});

app.put("/api/content/batch", requireAuth(["marketing", "direccion"]), async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items || !items.length) return res.status(400).json({ ok: false, error: "Sin cambios" });
  const { campos } = getContentRegistry();
  for (const it of items) {
    if (!it || typeof it.key !== "string" || typeof it.value !== "string") {
      return res.status(400).json({ ok: false, error: "Item inválido" });
    }
    if (!keyEnRegistro(it.key, campos)) {
      return res.status(400).json({ ok: false, error: `Campo no permitido: ${it.key}` });
    }
  }
  try {
    for (const it of items) {
      await dbRun(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
        [it.key, it.value]
      );
    }
    res.json({ ok: true, count: items.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Upload
let _sharp;
async function getSharp() {
  if (_sharp === undefined) {
    try { _sharp = (await import("sharp")).default; }
    catch { _sharp = null; console.warn("[Upload] sharp no disponible; imágenes sin optimizar"); }
  }
  return _sharp;
}
const GS_AVAILABLE = (() => {
  try { execFileSync("gs", ["--version"], { stdio: "ignore" }); return true; }
  catch { return false; }
})();
if (!GS_AVAILABLE) console.warn("[Upload] ghostscript (gs) no disponible; PDFs sin comprimir");

async function optimizeUpload(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const orig = fs.statSync(filePath).size;
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      const sharp = await getSharp();
      if (!sharp) return;
      let img = sharp(filePath, { failOn: "none" }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
      if (ext === ".png") img = img.png({ compressionLevel: 9, palette: true });
      else if (ext === ".webp") img = img.webp({ quality: 78 });
      else img = img.jpeg({ quality: 78, mozjpeg: true });
      const out = await img.toBuffer();
      if (out.length > 0 && out.length < orig) fs.writeFileSync(filePath, out);
    } else if (ext === ".pdf" && GS_AVAILABLE) {
      const tmp = filePath + ".opt";
      execFileSync("gs", [
        "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.4", "-dPDFSETTINGS=/ebook",
        "-dNOPAUSE", "-dQUIET", "-dBATCH", `-sOutputFile=${tmp}`, filePath
      ], { stdio: "ignore", timeout: 180000 });
      if (fs.existsSync(tmp)) {
        const newSize = fs.statSync(tmp).size;
        if (newSize > 0 && newSize < orig) fs.renameSync(tmp, filePath);
        else fs.unlinkSync(tmp);
      }
    }
  } catch (e) {
    console.error("[Upload] Optimización falló (se conserva original):", e.message);
  }
}

app.post("/api/upload", requireAuth(["marketing", "rrhh", "direccion"]), upload.array("files", 10), async (req, res) => {
  const files = req.files || [];
  for (const f of files) {
    await optimizeUpload(f.path || path.join(uploadsDir, f.filename));
  }
  const urls = files.map((f) => `/uploads/${f.filename}`);
  res.json({ ok: true, urls });
});

app.post("/api/uploads/optimize-existing", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const entries = fs.readdirSync(uploadsDir).filter(n => /\.(jpe?g|png|webp|pdf)$/i.test(n));
    const detalle = [];
    for (const name of entries) {
      const fp = path.join(uploadsDir, name);
      if (!fs.statSync(fp).isFile()) continue;
      const before = fs.statSync(fp).size;
      await optimizeUpload(fp);
      const after = fs.statSync(fp).size;
      if (after < before) detalle.push({ archivo: name, antes: Math.round(before / 1024) + " KB", despues: Math.round(after / 1024) + " KB" });
    }
    res.json({ ok: true, optimizados: detalle.length, revisados: entries.length, detalle });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Reservas
app.post("/api/reservas", async (req, res) => {
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
  try {
    const bloqueo = await estaBloqueado(local, dia);
    if (bloqueo) {
      return res.status(400).json({
        ok: false,
        code: "reservas_bloqueadas",
        local,
        motivo: bloqueo.motivo || "",
        error: `En esas fechas no se aceptan reservas en ${local}${bloqueo.motivo ? ` (${bloqueo.motivo})` : ""}.`
      });
    }
  } catch (e) { console.error("Error comprobando bloqueo de reservas:", e.message); }

  try {
    const creado_en = new Date().toISOString();
    const rowRes = await dbRun(
      `INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [local, personas, dia, hora, telefono, nombre_reserva, creado_en]
    );
    const reserva_id = rowRes.id;
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
    // Notificar grupo del local
    dbGet(`SELECT group_jid FROM wa_links WHERE local = ?`, [local]).then((row) => {
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
    }).catch(() => {});
    return res.json({ ok: true, reserva_id, pendiente });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando reserva" });
  }
});

app.get("/api/reservas", requireAuth(["direccion", "encargado"]), async (req, res) => {
  try {
    const { local, from, to } = req.query;
    const where = [];
    const params = [];
    if (local) { where.push(`local = ?`); params.push(local); }
    if (from) { where.push(`dia >= ?`); params.push(from); }
    if (to) { where.push(`dia <= ?`); params.push(to); }
    const sql = `SELECT * FROM reservas ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY dia ASC, hora ASC`;
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo reservas" });
  }
});

app.delete("/api/reservas/:id", requireAuth(["encargado", "direccion"]), async (req, res) => {
  try {
    const reserva = await dbGet(`SELECT * FROM reservas WHERE id = ?`, [req.params.id]);
    if (!reserva) return res.status(404).json({ ok: false, error: "Reserva no encontrada" });
    await dbRun("DELETE FROM reservas WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
    if (isReady()) {
      sendCancelacionCliente(reserva.telefono, reserva);
      dbGet(`SELECT group_jid FROM wa_links WHERE local = ?`, [reserva.local]).then((row) => {
        if (row?.group_jid) sendCancelacionGrupo(row.group_jid, reserva);
      }).catch(() => {});
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error eliminando reserva" });
  }
});

app.get("/api/reservas/export.csv", requireAuth(["direccion", "encargado", "contabilidad"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM reservas ORDER BY creado_en DESC`);
    const header = "id,local,personas,dia,hora,telefono,nombre_reserva,creado_en";
    const lines = rows.map((r) =>
      [r.id, r.local, r.personas, r.dia, r.hora, r.telefono, r.nombre_reserva, r.creado_en]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="reservas.csv"`);
    res.send([header, ...lines].join("\n"));
  } catch (e) {
    res.status(500).send("Error exportando");
  }
});

// KPIs
app.get("/api/kpi", requireAuth(["direccion", "contabilidad"]), async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const mes = hoy.slice(0, 7);
    const mesLike = mes + "%";
    const [leads_total, leads_mes, reservas_total, reservas_hoy, reservas_mes, candidaturas,
           personas_hoy, personas_mes, reservas_por_local] = await Promise.all([
      dbGet(`SELECT COUNT(*) as v FROM leads`),
      dbGet(`SELECT COUNT(*) as v FROM leads WHERE (creado_en LIKE ? OR actualizado_en LIKE ?)`, [mesLike, mesLike]),
      dbGet(`SELECT COUNT(*) as v FROM reservas`),
      dbGet(`SELECT COUNT(*) as v FROM reservas WHERE dia = ?`, [hoy]),
      dbGet(`SELECT COUNT(*) as v FROM reservas WHERE dia LIKE ?`, [mesLike]),
      dbGet(`SELECT COUNT(*) as v FROM hr_applications`),
      dbGet(`SELECT COALESCE(SUM(CAST(personas AS INTEGER)),0) as v FROM reservas WHERE dia = ?`, [hoy]),
      dbGet(`SELECT COALESCE(SUM(CAST(personas AS INTEGER)),0) as v FROM reservas WHERE dia LIKE ?`, [mesLike]),
      dbAll(`SELECT local, COUNT(*) as total FROM reservas GROUP BY local ORDER BY total DESC`)
    ]);
    res.json({
      ok: true,
      data: {
        leads_total: parseInt(leads_total.v),
        leads_mes: parseInt(leads_mes.v),
        reservas_total: parseInt(reservas_total.v),
        reservas_hoy: parseInt(reservas_hoy.v),
        reservas_mes: parseInt(reservas_mes.v),
        candidaturas: parseInt(candidaturas.v),
        personas_hoy: parseInt(personas_hoy.v),
        personas_mes: parseInt(personas_mes.v),
        reservas_por_local
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// RR.HH.
app.get("/api/hr/jobs", async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM hr_jobs WHERE activo=1 ORDER BY creado_en DESC`);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error jobs" });
  }
});

app.get("/api/hr/jobs/admin", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM hr_jobs ORDER BY creado_en DESC`);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error jobs" });
  }
});

app.post("/api/hr/jobs", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { titulo, local, tipo, descripcion, activo } = req.body;
  if (!titulo || !local || !tipo || !descripcion) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  try {
    const creado_en = new Date().toISOString();
    const row = await dbRun(
      `INSERT INTO hr_jobs (titulo, local, tipo, descripcion, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [titulo, local, tipo, descripcion, activo ? 1 : 0, creado_en]
    );
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando job" });
  }
});

app.put("/api/hr/jobs/:id", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { titulo, local, tipo, descripcion, activo } = req.body;
  try {
    await dbRun(
      `UPDATE hr_jobs SET titulo=?, local=?, tipo=?, descripcion=?, activo=? WHERE id=?`,
      [titulo, local, tipo, descripcion, activo ? 1 : 0, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error actualizando job" });
  }
});

app.post("/api/hr/applications", (req, res, next) => {
  uploadCv.single("cv")(req, res, (err) => {
    if (err) {
      console.error("[HR] Error subiendo CV:", err.message);
      const msg = err.code === "LIMIT_FILE_SIZE" ? "El CV supera el tamaño máximo (8 MB)." : "Error subiendo el CV.";
      return res.status(400).json({ ok: false, error: msg });
    }
    next();
  });
}, async (req, res) => {
  const { nombre, email, telefono, puesto, mensaje, edad, experiencia, poblacion } = req.body;
  console.log("[HR] Candidatura recibida:", { nombre, email, telefono, puesto, edad, experiencia, poblacion, tieneCV: !!req.file });
  if (!nombre || !email || !telefono || !puesto || !edad || !experiencia || !poblacion) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  // Validar el CONTENIDO del CV (magic bytes) y publicarlo en public/uploads SOLO si es válido.
  if (req.file) {
    const fin = finalizeCvUpload({ tmpPath: req.file.path, filename: req.file.filename, originalname: req.file.originalname, publicDir: uploadsDir });
    if (!fin.ok) return res.status(400).json({ ok: false, error: "El CV no es un archivo válido (PDF, DOCX, JPG o PNG)." });
  }
  const cv_url = req.file ? `/uploads/${req.file.filename}` : "";
  const creado_en = new Date().toISOString();
  try {
    await dbRun(
      `INSERT INTO hr_applications (nombre, email, telefono, puesto, mensaje, cv_url, edad, experiencia, poblacion, estado, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', ?)`,
      [nombre, email, telefono, puesto, mensaje || "", cv_url, edad || null, experiencia || null, poblacion || null, creado_en]
    );
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
            const cvBuffer = fs.readFileSync(path.join(uploadsDir, req.file.filename)); // ya publicado por finalizeCvUpload
            return sendDocumentoLibre("622065974", cvBuffer, req.file.originalname, req.file.mimetype);
          }
        })
        .then(() => sendMensajeLibre("622065974", `Si quieres escribirle directamente a ${nombre}, haz clic aquí 👇\n${linkWA}`))
        .catch((e) => console.error("[HR] Error notificando candidatura a Nerea:", e.message));
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[HR] Error DB:", e.message);
    res.status(500).json({ ok: false, error: "Error guardando candidatura" });
  }
});

app.get("/api/hr/applications", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
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
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error leyendo candidaturas" });
  }
});

app.put("/api/hr/applications/:id", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { estado } = req.body;
  if (!estado) return res.status(400).json({ ok: false, error: "Estado requerido" });
  try {
    await dbRun(`UPDATE hr_applications SET estado=? WHERE id=?`, [estado, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error actualizando estado" });
  }
});

// ── RRHH: Seguimiento de trabajadores ─────────────────────────────────────

app.get("/api/rrhh/trabajadores", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT id, username, nombre, rol, local FROM users
       WHERE rol IN ('trabajador','encargado')
       ORDER BY local ASC, nombre ASC`
    );
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/rrhh/trabajador/:id/notas", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT * FROM hr_worker_notes WHERE worker_id = ? ORDER BY creado_en DESC`,
      [req.params.id]
    );
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/rrhh/trabajador/:id/nota", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { tipo = "nota", contenido, autor } = req.body;
  if (!contenido) return res.status(400).json({ ok: false, error: "Falta contenido" });
  try {
    const row = await dbRun(
      `INSERT INTO hr_worker_notes (worker_id, tipo, contenido, autor, creado_en) VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [req.params.id, tipo, contenido, autor || null, new Date().toISOString()]
    );
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.delete("/api/rrhh/nota/:id", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
    await dbRun(`DELETE FROM hr_worker_notes WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/rrhh/preguntas/:mes", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT * FROM hr_preguntas_mes WHERE mes = ? ORDER BY orden ASC`,
      [req.params.mes]
    );
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.put("/api/rrhh/preguntas/:mes", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { preguntas } = req.body;
  if (!Array.isArray(preguntas)) return res.status(400).json({ ok: false });
  const mes = req.params.mes;
  try {
    await dbRun(`DELETE FROM hr_preguntas_mes WHERE mes = ?`, [mes]);
    if (!preguntas.length) return res.json({ ok: true });
    for (let i = 0; i < preguntas.length; i++) {
      await dbRun(`INSERT INTO hr_preguntas_mes (mes, orden, pregunta) VALUES (?, ?, ?)`, [mes, i, preguntas[i]]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/rrhh/llamadas/:mes", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM hr_llamadas_mes WHERE mes = ?`, [req.params.mes]);
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/rrhh/llamada", requireAuth(["rrhh", "direccion"]), async (req, res) => {
  const { worker_id, mes, respuestas, comentario_libre, autor } = req.body;
  if (!worker_id || !mes) return res.status(400).json({ ok: false, error: "Faltan datos" });
  const ahora = new Date().toISOString();
  const respJson = respuestas ? JSON.stringify(respuestas) : null;
  try {
    await dbRun(
      `INSERT INTO hr_llamadas_mes (worker_id, mes, realizada, fecha_llamada, respuestas, comentario_libre, autor, creado_en)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT(worker_id, mes) DO UPDATE SET
         realizada=1, fecha_llamada=EXCLUDED.fecha_llamada,
         respuestas=EXCLUDED.respuestas, comentario_libre=EXCLUDED.comentario_libre,
         autor=EXCLUDED.autor`,
      [worker_id, mes, ahora, respJson, comentario_libre || null, autor || null, ahora]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Mantenimiento — enforcement por establecimiento gated por PERMISOS_V2 (Iteración 4).
// Con el flag ausente (por defecto) el comportamiento es IDÉNTICO al anterior, incluidos los
// mensajes de error 500. Toda la autorización vive en el servicio (no en la ruta).
const maintDb = { get: dbGet, all: dbAll, run: dbRun };
app.get("/api/maintenance", requireAuth(["encargado", "direccion"]), async (req, res, next) => {
  try {
    const r = await listMaintenanceIssues(maintDb, req.user, { enabled: permisosV2Enabled(), local: req.query.local });
    if (r.code === "OK") return res.json({ ok: true, data: r.data });
    if (r.code === "FORBIDDEN") return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
    return next(new Error("maintenance_list_internal"));
  } catch (e) { if (!permisosV2Enabled()) return res.status(500).json({ ok: false, error: "Error incidencias" }); next(e); }
});

app.post("/api/maintenance", requireAuth(["encargado", "direccion"]), async (req, res, next) => {
  try {
    const { local, titulo, descripcion } = req.body;
    const r = await createMaintenanceIssue(maintDb, req.user, { local, titulo, descripcion }, { enabled: permisosV2Enabled() });
    if (r.code === "OK") return res.json({ ok: true, id: r.id });
    if (r.code === "VALIDATION_ERROR") return res.status(400).json({ ok: false, error: r.reason === "invalid_local" ? "Establecimiento no válido" : "Faltan campos" });
    if (r.code === "FORBIDDEN") return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
    return next(new Error("maintenance_create_internal"));
  } catch (e) { if (!permisosV2Enabled()) return res.status(500).json({ ok: false, error: "Error guardando incidencia" }); next(e); }
});

app.put("/api/maintenance/:id", requireAuth(["encargado", "direccion"]), async (req, res, next) => {
  try {
    const r = await updateMaintenanceIssueStatus(maintDb, req.user, req.params.id, { estado: req.body.estado }, { enabled: permisosV2Enabled() });
    if (r.code === "OK") return res.json({ ok: true });
    if (r.code === "VALIDATION_ERROR") return res.status(400).json({ ok: false, error: r.reason === "invalid_id" ? "ID no válido" : "Estado requerido" });
    if (r.code === "FORBIDDEN") return res.status(403).json({ ok: false, error: "Sin permiso para este recurso" });
    if (r.code === "NOT_FOUND") return res.status(404).json({ ok: false, error: "Incidencia no encontrada" });
    return next(new Error("maintenance_update_internal"));
  } catch (e) { if (!permisosV2Enabled()) return res.status(500).json({ ok: false, error: "Error actualizando incidencia" }); next(e); }
});

// Comunicados
app.get("/api/announcements", requireAuth(), async (req, res) => {
  try {
    const { local, rol } = req.query;
    const where = [];
    const params = [];
    if (local) { where.push(`local = ?`); params.push(local); }
    if (rol) { where.push(`rol = ?`); params.push(rol); }
    const sql = `SELECT * FROM announcements ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY creado_en DESC`;
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error anuncios" });
  }
});

app.post("/api/announcements", requireAuth(["encargado", "direccion"]), async (req, res) => {
  const { local, rol, mensaje } = req.body;
  if (!local || !rol || !mensaje) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  try {
    const creado_en = new Date().toISOString();
    const row = await dbRun(
      `INSERT INTO announcements (local, rol, mensaje, creado_en) VALUES (?, ?, ?, ?) RETURNING id`,
      [local, rol, mensaje, creado_en]
    );
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando anuncio" });
  }
});

// WhatsApp
app.get("/api/whatsapp/status", requireAuth(["direccion", "encargado", "marketing"]), (req, res) => {
  res.json({ ok: true, connected: isReady() });
});

app.get("/api/whatsapp/groups", requireAuth(["direccion", "encargado"]), async (req, res) => {
  const groups = await getGroups();
  res.json({ ok: true, data: groups });
});

app.post("/api/whatsapp/link", requireAuth(["direccion", "encargado"]), async (req, res) => {
  const { local, groupId } = req.body;
  if (!local || !groupId) return res.status(400).json({ ok: false, error: "Faltan campos" });
  const updated_at = new Date().toISOString();
  try {
    await dbRun(
      `INSERT INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(local) DO UPDATE SET group_jid=EXCLUDED.group_jid, updated_at=EXCLUDED.updated_at`,
      [local, groupId, updated_at]
    );
    await dbRun(
      `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
      [`whatsapp_group_${local}`, groupId, updated_at]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error guardando" });
  }
});

app.get("/api/whatsapp/qr", requireAuth(["direccion", "encargado", "marketing"]), async (req, res) => {
  if (isReady()) return res.json({ ok: true, connected: true });
  const dataUrl = await getQRImage();
  if (!dataUrl) return res.json({ ok: true, connected: false, qr: null });
  res.json({ ok: true, connected: false, qr: dataUrl });
});

app.get("/api/whatsapp/links", requireAuth(["direccion", "encargado"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT local, group_jid FROM wa_links ORDER BY local`);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error" });
  }
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

app.get("/api/contactos", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const params = [];
    const sql = sqlContactosUnificados(req.query, params);
    const rows = await dbAll(sql, params);
    res.json({ ok: true, data: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── CAMPAÑAS WHATSAPP ─────────────────────────────────────────────────
app.post("/api/campanas/preview", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const params = [];
    const sql = sqlContactosUnificados(req.body, params);
    const rows = await dbAll(sql, params);
    res.json({ ok: true, total: rows.length, muestra: rows.slice(0, 5) });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/campanas/enviar", requireAuth(["direccion", "marketing"]), async (req, res) => {
  const { nombre_campana, mensaje, genero, poblacion, local, cumple_mes } = req.body;
  if (!mensaje || !nombre_campana) return res.status(400).json({ ok: false, error: "Faltan campos" });
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });

  try {
    const params = [];
    const sql = sqlContactosUnificados(req.body, params);
    const contactos = await dbAll(sql, params);
    if (!contactos.length) return res.json({ ok: false, error: "No hay contactos con ese filtro" });

    const segmento = { genero, poblacion, local, cumple_mes };
    const campanaRow = await dbRun(
      `INSERT INTO campanas_wa (nombre, segmento_json, mensaje, total_enviados) VALUES (?, ?, ?, 0) RETURNING id`,
      [nombre_campana, JSON.stringify(segmento), mensaje]
    );
    const campanaId = campanaRow.id;
    res.json({ ok: true, total: contactos.length, campana_id: campanaId });

    // Enviar en background con delay
    (async () => {
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
      await dbRun(
        `UPDATE campanas_wa SET total_enviados=?, total_errores=?, finalizado_en=CURRENT_TIMESTAMP WHERE id=?`,
        [enviados, errores, campanaId]
      );
      console.log(`📣 Campaña "${nombre_campana}" completada: ${enviados} enviados, ${errores} errores`);
    })();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/campanas", requireAuth(["direccion", "marketing"]), async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM campanas_wa ORDER BY creado_en DESC LIMIT 50`);
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/whatsapp/send", requireAuth(["direccion"]), async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });
  if (!isReady()) return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });
  try {
    await sendMensajeLibre(telefono, mensaje);
    const jid = telefono.replace(/\D/g, "").replace(/^00/, "").replace(/^(?!34)([679])/, "34$1") + "@s.whatsapp.net";
    addSaraToHistorial(jid, mensaje);
    await dbRun(
      `INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, tipo) VALUES (?, ?, '[Equipo]', ?, 'manual')`,
      [jid, telefono.replace(/\D/g, ""), mensaje]
    );
    await dbRun(
      `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
       VALUES (?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
       ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
      [jid, telefono.replace(/\D/g, "")]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/whatsapp/mensajes", requireAuth(["direccion"]), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT w.*, COALESCE(l.nombre || ' ' || COALESCE(l.apellidos,''), w.telefono) AS nombre_contacto
       FROM whatsapp_messages w
       LEFT JOIN leads l ON l.telefono = w.telefono
       ORDER BY w.creado_en ASC`
    );
    res.json({ ok: true, data: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// ── Configurador conversacional de Sara ─────────────────────────────────────
const SARA_LOCALES = [
  "La Tapeta - Blanes", "Cooperativa - Blanes", "La Tapeta - Lloret",
  "La Tapeta - Girona", "Can Mateu - Tordera", "La Tapa Ibérica - Tordera",
  "Botiga d'en Mateu - Tordera"
];

async function getSaraEstado() {
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const instrucciones = (await getConfig("sara_instrucciones")) || "";
  const bloqueos = await dbAll(`SELECT * FROM bloqueos_reservas WHERE hasta::date >= ?::date ORDER BY desde`, [hoy]);
  const reglas = await dbAll(`SELECT * FROM sara_respuestas WHERE activo = 1 ORDER BY id DESC`);
  return { instrucciones, bloqueos, reglas };
}

async function getDocsDisponibles() {
  const rows = await dbAll(
    `SELECT key, value FROM contents WHERE key LIKE 'local_%menu%pdf' AND value IS NOT NULL AND value != ''`
  );
  return rows.map(r => ({ key: r.key, url: r.value }));
}

const SARA_PROPOSAL_TOOLS = [
  {
    name: "proponer_instrucciones",
    description: "Propone fijar/actualizar el texto de instrucciones generales de comportamiento de Sara (reemplaza el texto anterior).",
    input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] }
  },
  {
    name: "proponer_bloqueo",
    description: "Propone bloquear reservas en un local (o 'Todos') entre dos fechas (YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: {
        local: { type: "string" },
        desde: { type: "string", description: "YYYY-MM-DD" },
        hasta: { type: "string", description: "YYYY-MM-DD" },
        motivo: { type: "string" }
      },
      required: ["local", "desde", "hasta"]
    }
  },
  {
    name: "proponer_regla_documento",
    description: "Propone que Sara envíe un documento/carta PDF cuando se cumpla un disparador. documento_url debe ser una URL de las cartas ya subidas.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "Nombre corto de la regla" },
        disparadores: { type: "string", description: "Cuándo enviarlo (ej. 'preguntan por la carta de Blanes')" },
        documento_url: { type: "string" },
        respuesta: { type: "string", description: "Texto opcional que Sara diga además de enviar el PDF" },
        local: { type: "string" }
      },
      required: ["tema", "disparadores", "documento_url"]
    }
  },
  {
    name: "proponer_respuesta_texto",
    description: "Propone una respuesta de texto configurada (sin documento) para un tema/disparador.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string" },
        disparadores: { type: "string" },
        respuesta: { type: "string" }
      },
      required: ["tema", "disparadores", "respuesta"]
    }
  },
  {
    name: "proponer_eliminar",
    description: "Propone eliminar un bloqueo o una regla por su id.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["bloqueo", "regla"] },
        id: { type: "integer" }
      },
      required: ["tipo", "id"]
    }
  },
  {
    name: "proponer_set_contenido",
    description: "Coloca/actualiza un contenido de la web en una 'key' EXACTA del catálogo: una carta/menú PDF, una imagen o un enlace. Ej: poner una carta subida como carta de un local (key local_<slug>_menu_pdf, value = URL subida).",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" }, value: { type: "string" } },
      required: ["key", "value"]
    }
  },
  {
    name: "proponer_set_texto",
    description: "Cambia un texto editable de la web (títulos, subtítulos, textos) para un idioma. Usa una 'key' de tipo texto del catálogo.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        texto: { type: "string" },
        idioma: { type: "string", enum: ["es", "ca", "en"] }
      },
      required: ["key", "texto"]
    }
  },
  {
    name: "proponer_anadir_galeria",
    description: "Añade una o varias fotos (URLs subidas) a una galería del catálogo (galería de un local o galería general).",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        urls: { type: "array", items: { type: "string" } }
      },
      required: ["key", "urls"]
    }
  }
];

app.get("/api/sara/estado", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try {
    res.json({ ok: true, ...(await getSaraEstado()) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/sara/chat", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try {
    const mensajes = Array.isArray(req.body?.mensajes) ? req.body.mensajes.slice(-20) : [];
    if (!mensajes.length) return res.status(400).json({ ok: false, error: "Sin mensajes" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: "IA no configurada" });
    const adjuntos = Array.isArray(req.body?.adjuntos) ? req.body.adjuntos.filter(u => typeof u === "string" && u).slice(0, 5) : [];

    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    const estado = await getSaraEstado();
    const docs = await getDocsDisponibles();
    const resumenEstado =
      `INSTRUCCIONES ACTUALES: ${estado.instrucciones || "(ninguna)"}\n` +
      `BLOQUEOS ACTIVOS: ${estado.bloqueos.map(b => `#${b.id} ${b.local} ${b.desde}→${b.hasta}${b.motivo ? " ("+b.motivo+")" : ""}`).join("; ") || "(ninguno)"}\n` +
      `REGLAS: ${estado.reglas.map(r => `#${r.id} ${r.tema}${r.documento_url ? " [PDF]" : ""}`).join("; ") || "(ninguna)"}\n` +
      `CARTAS/MENÚS PDF YA SUBIDOS: ${docs.map(d => `${d.key} → ${d.url}`).join("; ") || "(ninguna subida aún)"}`;

    const { locales: regLocales } = getContentRegistry();
    const globalCat = Object.entries(GLOBAL_FIELDS).map(([k, d]) => `  ${k}: ${d.label} (${d.type})`).join("\n");
    const localFieldsCat = LOCAL_FIELDS.map(f => `  local_<slug>_${f.suffix}: ${f.label} (${f.type})`).join("\n");
    const slugsCat = regLocales.map(l => `${l.slug} = ${l.name}`).join(" | ");
    const catalogo = `CATÁLOGO DE CONTENIDOS EDITABLES (usa la 'key' EXACTA):\nGlobales:\n${globalCat}\nPor local (sustituye <slug>):\n${localFieldsCat}\nSlugs de local: ${slugsCat}`;

    const adjuntoTxt = adjuntos.length
      ? `\n\nARCHIVO(S) QUE EL USUARIO ACABA DE SUBIR (usa estas URLs como 'value'): ${adjuntos.join(", ")}`
      : "";

    const system = `Eres el asistente de configuración de "Sara", el chatbot de WhatsApp del grupo de restaurantes Familia del Amor. Ayudas al equipo de marketing a cambiar el comportamiento de Sara y el contenido de la web SIN tocar código.

Hoy es ${hoy} (zona Europe/Madrid). Locales de reserva (nombres EXACTOS): ${SARA_LOCALES.join(" | ")}. Para bloquear todos, usa "Todos".

${resumenEstado}

${catalogo}

REGLAS:
- Cuando el usuario pida un cambio, resume en una frase clara qué vas a hacer Y llama a la herramienta de propuesta correspondiente con datos concretos. NO apliques nada tú: solo propones; el sistema pedirá confirmación.
- Resuelve fechas relativas a fechas concretas YYYY-MM-DD usando la fecha de hoy.
- COLOCAR ARCHIVOS/CONTENIDO: si el usuario sube un archivo y te dice dónde va (ej. "como carta de La Tapeta Blanes"), usa proponer_set_contenido con la key EXACTA del catálogo (ej. local_la-tapeta-blanes_menu_pdf) y value = la URL subida. Para textos usa proponer_set_texto (idioma es/ca/en, por defecto es). Para añadir fotos a una galería usa proponer_anadir_galeria con las URLs subidas.
- Usa SIEMPRE una key EXACTA del catálogo. Si no encuentras el destino o falta info (local, qué campo), pregunta. No inventes keys ni URLs.
- Habla en español, cercano y breve.`;

    const mensajesLLM = mensajes.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }));
    if (adjuntoTxt && mensajesLLM.length) {
      const last = mensajesLLM[mensajesLLM.length - 1];
      if (last.role === "user") last.content += adjuntoTxt;
    }

    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system,
      tools: SARA_PROPOSAL_TOOLS,
      messages: mensajesLLM
    });

    let reply = "";
    let proposal = null;
    for (const block of response.content) {
      if (block.type === "text") reply += block.text;
      if (block.type === "tool_use" && !proposal) proposal = { tipo: block.name, datos: block.input };
    }
    if (!reply.trim()) reply = proposal ? "Te propongo este cambio, ¿lo confirmo?" : "¿En qué quieres que ayude con Sara?";
    res.json({ ok: true, reply: reply.trim(), proposal });
  } catch (e) {
    console.error("Error en /api/sara/chat:", e.message);
    res.status(500).json({ ok: false, error: "Error del asistente" });
  }
});

app.post("/api/sara/aplicar", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try {
    const { tipo, datos } = req.body?.proposal || {};
    if (!tipo || !datos) return res.status(400).json({ ok: false, error: "Propuesta inválida" });
    const fechaOk = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

    if (tipo === "proponer_instrucciones") {
      await setConfig("sara_instrucciones", String(datos.texto || "").slice(0, 4000));
    } else if (tipo === "proponer_bloqueo") {
      const local = datos.local === "Todos" ? "Todos" : datos.local;
      if (local !== "Todos" && !SARA_LOCALES.includes(local)) return res.status(400).json({ ok: false, error: "Local no válido" });
      if (!fechaOk(datos.desde) || !fechaOk(datos.hasta)) return res.status(400).json({ ok: false, error: "Fechas no válidas" });
      const [desde, hasta] = datos.desde <= datos.hasta ? [datos.desde, datos.hasta] : [datos.hasta, datos.desde];
      await dbRun(`INSERT INTO bloqueos_reservas (local, desde, hasta, motivo) VALUES (?, ?, ?, ?)`,
        [local, desde, hasta, (datos.motivo || "").slice(0, 200) || null]);
    } else if (tipo === "proponer_regla_documento") {
      if (!datos.tema || !datos.documento_url) return res.status(400).json({ ok: false, error: "Faltan datos de la regla" });
      await dbRun(`INSERT INTO sara_respuestas (tema, disparadores, respuesta, documento_url, local, activo) VALUES (?, ?, ?, ?, ?, 1)`,
        [String(datos.tema).slice(0, 120), (datos.disparadores || "").slice(0, 400) || null, (datos.respuesta || "").slice(0, 1000) || null, String(datos.documento_url).slice(0, 500), datos.local || null]);
    } else if (tipo === "proponer_respuesta_texto") {
      if (!datos.tema || !datos.respuesta) return res.status(400).json({ ok: false, error: "Faltan datos de la respuesta" });
      await dbRun(`INSERT INTO sara_respuestas (tema, disparadores, respuesta, activo) VALUES (?, ?, ?, 1)`,
        [String(datos.tema).slice(0, 120), (datos.disparadores || "").slice(0, 400) || null, String(datos.respuesta).slice(0, 1000)]);
    } else if (tipo === "proponer_eliminar") {
      const id = parseInt(datos.id);
      if (!id) return res.status(400).json({ ok: false, error: "id no válido" });
      if (datos.tipo === "bloqueo") await dbRun(`DELETE FROM bloqueos_reservas WHERE id = ?`, [id]);
      else if (datos.tipo === "regla") await dbRun(`DELETE FROM sara_respuestas WHERE id = ?`, [id]);
      else return res.status(400).json({ ok: false, error: "Tipo a eliminar no válido" });
    } else if (tipo === "proponer_set_contenido") {
      const { campos } = getContentRegistry();
      if (!keyEnRegistro(datos.key, campos)) return res.status(400).json({ ok: false, error: "Campo no permitido: " + datos.key });
      await dbRun(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
        [datos.key, String(datos.value || "").slice(0, 2000)]
      );
    } else if (tipo === "proponer_set_texto") {
      const { campos } = getContentRegistry();
      const base = campos[datos.key];
      if (!base || base.type !== "text_i18n") return res.status(400).json({ ok: false, error: "Campo de texto no válido" });
      const idioma = ["es", "ca", "en"].includes(datos.idioma) ? datos.idioma : "es";
      await dbRun(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
        [`${datos.key}_${idioma}`, String(datos.texto || "").slice(0, 2000)]
      );
    } else if (tipo === "proponer_anadir_galeria") {
      const { campos } = getContentRegistry();
      const base = campos[datos.key];
      if (!base || base.type !== "gallery") return res.status(400).json({ ok: false, error: "Galería no válida" });
      const nuevas = Array.isArray(datos.urls) ? datos.urls.filter(u => typeof u === "string" && u.trim()) : [];
      if (!nuevas.length) return res.status(400).json({ ok: false, error: "Sin URLs" });
      const row = await dbGet("SELECT value FROM contents WHERE key = ?", [datos.key]);
      const actual = (row?.value || "").trim();
      const combinado = (actual ? actual + "\n" : "") + nuevas.join("\n");
      await dbRun(
        `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
        [datos.key, combinado]
      );
    } else {
      return res.status(400).json({ ok: false, error: "Tipo de propuesta desconocido" });
    }
    res.json({ ok: true, ...(await getSaraEstado()) });
  } catch (e) {
    console.error("Error en /api/sara/aplicar:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/sara/bloqueo/:id", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try { await dbRun(`DELETE FROM bloqueos_reservas WHERE id = ?`, [parseInt(req.params.id)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete("/api/sara/regla/:id", requireAuth(["marketing", "direccion"]), async (req, res) => {
  try { await dbRun(`DELETE FROM sara_respuestas WHERE id = ?`, [parseInt(req.params.id)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/", (req, res) => res.redirect("/login.html"));

const shutdown = (signal) => {
  console.log(`${signal} recibido, cerrando servidor...`);
  setTimeout(() => { process.exit(0); }, 5000).unref();
  server.closeAllConnections?.();
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

async function guardarPendienteWA(tipo, destino, reserva) {
  try {
    await dbRun(
      `INSERT INTO pending_whatsapp (tipo, destino, reserva_json) VALUES (?, ?, ?)`,
      [tipo, destino, JSON.stringify(reserva)]
    );
    console.log(`📥 Mensaje WA guardado como pendiente: ${tipo} → ${destino}`);
  } catch (err) {
    console.error("Error guardando pendiente WA:", err.message);
  }
}

async function procesarPendientesWA() {
  try {
    const rows = await dbAll(`SELECT * FROM pending_whatsapp ORDER BY creado_en ASC`);
    if (!rows || !rows.length) return;
    console.log(`📨 Procesando ${rows.length} mensajes WhatsApp pendientes...`);
    for (const row of rows) {
      try {
        const reserva = JSON.parse(row.reserva_json);
        if (row.tipo === "confirmacion") await sendConfirmacionCliente(row.destino, reserva);
        else if (row.tipo === "confirmacion_pendiente") await sendConfirmacionPendienteCliente(row.destino, reserva);
        else if (row.tipo === "grupo") await sendNotificacionGrupo(row.destino, reserva);
        else if (row.tipo === "grupo_pendiente") await sendNotificacionGrupoPendiente(row.destino, reserva);
        await dbRun(`DELETE FROM pending_whatsapp WHERE id = ?`, [row.id]);
        console.log(`✅ Pendiente WA enviado (id ${row.id})`);
      } catch (e) {
        console.error(`Error enviando pendiente WA ${row.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("Error procesando pendientes WA:", e.message);
  }
}

// Manejador de errores global (Iteración 1A): respuesta 500 genérica sin filtrar internos,
// y log seguro en servidor. Debe registrarse DESPUÉS de todas las rutas.
app.use(errorHandler);

const server = app.listen(PORT, async () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);

  // Inicializar esquema PostgreSQL
  try {
    await initDB();
  } catch (e) {
    console.error("[DB] Error inicializando esquema:", e.message);
    process.exit(1);
  }

  // Restaurar datos desde KV (idempotente, solo importa los que falten)
  try { await restoreFromKV(); } catch (e) { console.error("[KV] Error en restore:", e.message); }

  setOnReserva(async (reserva, jid) => {
    const { local, personas, dia, hora, telefono, nombre_reserva, pendiente } = reserva;
    if (!local || !personas || !dia || !hora || !telefono || !nombre_reserva) return;
    try {
      const bloqueo = await estaBloqueado(local, dia);
      if (bloqueo) {
        console.log(`[Reserva WA] Bloqueada por config: ${local} ${dia}`);
        return { ok: false, motivo: bloqueo.motivo || "fechas no disponibles" };
      }
    } catch (e) { console.error("Error comprobando bloqueo (WA):", e.message); }
    const creado_en = new Date().toISOString();
    try {
      const rowRes = await dbRun(
        `INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [local, personas, dia, hora, telefono, nombre_reserva, creado_en]
      );
      const reservaId = rowRes.id;
      if (jid) {
        await dbRun(
          `INSERT INTO wa_clientes (jid, nombre, telefono, ultima_interaccion)
           VALUES (?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
           ON CONFLICT(jid) DO UPDATE SET
             nombre = COALESCE(wa_clientes.nombre, EXCLUDED.nombre),
             telefono = COALESCE(wa_clientes.telefono, EXCLUDED.telefono),
             ultima_interaccion = EXCLUDED.ultima_interaccion`,
          [jid, nombre_reserva, telefono]
        );
      }
      console.log(`📅 Reserva WhatsApp guardada (id ${reservaId}): ${nombre_reserva} en ${local}${pendiente ? " [PENDIENTE]" : ""}`);
      upsertLeadFromReserva({ nombre_reserva, telefono });

      const row = await dbGet(`SELECT group_jid FROM wa_links WHERE local = ?`, [local]);
      if (row?.group_jid) {
        if (pendiente) {
          if (isReady()) sendNotificacionGrupoPendiente(row.group_jid, reserva);
          else guardarPendienteWA("grupo", row.group_jid, { ...reserva, _pendiente: true });
        } else {
          if (isReady()) sendNotificacionGrupo(row.group_jid, reserva);
          else guardarPendienteWA("grupo", row.group_jid, reserva);
        }
      }

      // Programar follow-up al día siguiente a las 11h (solo reservas confirmadas)
      if (!pendiente) {
        const jidFu = telefono.replace(/\D/g, "").replace(/^00/, "").replace(/^(?!34)([679])/, "34$1") + "@s.whatsapp.net";
        const [y, m, d] = dia.split("-").map(Number);
        const nextDay = new Date(y, m - 1, d + 1);
        const sendAt = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,"0")}-${String(nextDay.getDate()).padStart(2,"0")}T11:00:00`;
        await dbRun(
          `INSERT INTO followup_scheduled (jid, nombre, local, dia, send_at) VALUES (?, ?, ?, ?, ?)`,
          [jidFu, nombre_reserva, local, dia, sendAt]
        );
      }
    } catch (e) {
      console.error("Error guardando reserva WhatsApp:", e.message);
    }
  });

  // Grupos de WhatsApp por defecto (autorreparable, no pisa re-enlaces manuales)
  const DEFAULT_WA_LINKS = [
    { local: "La Tapeta - Blanes", group_jid: "120363393125503294@g.us" },
    { local: "La Tapeta - Lloret", group_jid: "34620403964-1593424370@g.us" },
    { local: "La Tapeta - Girona", group_jid: "447341020476-1606230930@g.us" },
    { local: "Cooperativa - Blanes", group_jid: "120363393125503294@g.us" },
    { local: "Can Mateu - Tordera", group_jid: "120363044574117454@g.us" },
    { local: "La Tapa Ibérica - Tordera", group_jid: "34620403964-1589730214@g.us" },
    { local: "Botiga d'en Mateu - Tordera", group_jid: "120363202050821128@g.us" }
  ];
  const DEFAULT_FACTURAS_GRUPOS = [
    { local: "Can Mateu - Tordera", group_jid: "120363409005830308@g.us" },
    { local: "Cooperativa - Blanes", group_jid: "120363427741609402@g.us" },
    { local: "La Tapa Ibérica - Tordera", group_jid: "120363407996132022@g.us" },
    { local: "La Tapeta - Girona", group_jid: "120363426106267540@g.us" },
    { local: "La Tapeta - Lloret", group_jid: "120363409899742012@g.us" }
  ];
  try {
    for (const { local, group_jid } of DEFAULT_WA_LINKS) {
      await dbRun(`INSERT INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(local) DO NOTHING`, [local, group_jid]);
      await dbRun(`INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`, [`whatsapp_group_${local}`, group_jid]);
    }
    for (const { local, group_jid } of DEFAULT_FACTURAS_GRUPOS) {
      const existe = await dbGet(`SELECT 1 FROM facturas_grupos WHERE local = ?`, [local]);
      if (!existe) await dbRun(`INSERT INTO facturas_grupos (local, group_jid) VALUES (?, ?) ON CONFLICT(group_jid) DO NOTHING`, [local, group_jid]);
    }
    console.log("[Defaults] Grupos de WhatsApp por defecto asegurados (reservas + facturas)");
  } catch (e) { console.error("[Defaults] Error asegurando grupos por defecto:", e.message); }

  // Post-restore: rellenar empresa en facturas que quedaron vacías
  try {
    await dbRun(
      `UPDATE facturas SET empresa = (
         SELECT fl.empresa FROM facturas_locales fl WHERE fl.local = facturas.local
       )
       WHERE (empresa IS NULL OR empresa = 'Sin empresa asignada')
       AND EXISTS (SELECT 1 FROM facturas_locales fl WHERE fl.local = facturas.local)`
    );
  } catch (e) { console.error("[Migration] empresa post-restore fix:", e.message); }

  setOnReady(procesarPendientesWA);

  // Semilla única: Fiesta Mayor de Blanes 2026
  try {
    const yaSembrado = await getConfig("seed_fiesta_mayor_2026");
    if (!yaSembrado) {
      for (const local of ["La Tapeta - Blanes", "Cooperativa - Blanes"]) {
        await dbRun(
          `INSERT INTO bloqueos_reservas (local, desde, hasta, motivo) VALUES (?, ?, ?, ?)`,
          [local, "2026-07-23", "2026-07-27", "Fiesta mayor"]
        );
      }
      await setConfig("seed_fiesta_mayor_2026", "done");
      console.log("[Seed] Bloqueo Fiesta Mayor Blanes 2026 creado (Blanes + Cooperativa, 23–27 jul)");
    }
  } catch (e) { console.error("[Seed] Error sembrando Fiesta Mayor:", e.message); }

  // Migración única: separar La Tapeta en 3 ciudades
  try {
    const yaMigrado = await getConfig("seed_split_latapeta_v1");
    if (!yaMigrado) {
      const CAMPOS = ["instagram", "menu_pdf", "menu_almuerzo_pdf", "gallery", "hours", "map", "history"];
      const copiarContenido = async (origenSlug, destinoSlug) => {
        for (const campo of CAMPOS) {
          const origen = await dbGet("SELECT value FROM contents WHERE key = ?", [`local_${origenSlug}_${campo}`]);
          if (!origen || !origen.value) continue;
          const destKey = `local_${destinoSlug}_${campo}`;
          const existe = await dbGet("SELECT value FROM contents WHERE key = ? AND value != ''", [destKey]);
          if (existe) continue;
          await dbRun(
            `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
            [destKey, origen.value]
          );
        }
      };
      for (const ciudad of ["la-tapeta-blanes", "la-tapeta-lloret", "la-tapeta-girona"]) {
        await copiarContenido("la-tapeta", ciudad);
      }
      await copiarContenido("botiga-mateu", "botiga-d-en-mateu");
      await setConfig("seed_split_latapeta_v1", "done");
      console.log("[Seed] La Tapeta separada en 3 ciudades y contenidos migrados");
    }
  } catch (e) { console.error("[Seed] Error migrando split La Tapeta:", e.message); }

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

  setOnMessage(async ({ jid, texto, respuesta, historico = false }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    try {
      await dbRun(
        `INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, historico, tipo) VALUES (?, ?, ?, ?, ?, 'intercambio')`,
        [jid, telefono, texto, respuesta, historico ? 1 : 0]
      );
      await dbRun(
        `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
         VALUES (?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
         ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
        [jid, telefono]
      );
    } catch (e) { console.error("Error guardando mensaje WA:", e.message); }
  });

  setOnContactoLead(({ telefono, nombre }) => {
    upsertLead({ nombre: nombre || "", telefono, fuente: "whatsapp" });
  });

  setHistorialLoader(async (jid) => {
    const rows = await dbAll(
      `SELECT mensaje, respuesta, COALESCE(tipo, 'intercambio') AS tipo
       FROM whatsapp_messages
       WHERE jid = ?
         AND respuesta != '(sin respuesta registrada)'
         AND creado_en > NOW() - INTERVAL '4 hours'
       ORDER BY id DESC LIMIT 20`,
      [jid]
    );
    const historial = [];
    for (const r of rows.reverse()) {
      if (r.tipo === "saliente" || r.tipo === "manual") {
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

  setReservaLoader(async (telefono) => {
    try {
      const clave = (telefono || "").replace(/\D/g, "");
      if (clave.length < 9) return null;
      const cola = clave.slice(-9);
      const rows = await dbAll(
        `SELECT local, dia, hora, personas, nombre_reserva, telefono
         FROM reservas WHERE dia::date >= CURRENT_DATE - INTERVAL '1 day'
         ORDER BY creado_en DESC LIMIT 200`
      );
      for (const r of rows) {
        if ((r.telefono || "").replace(/\D/g, "").endsWith(cola)) return r;
      }
      return null;
    } catch (e) {
      console.error("Error en reservaLoader:", e.message);
      return null;
    }
  });

  setOnCancelarReserva(async ({ telefono, dia, local }, jid) => {
    try {
      const clave = (telefono || "").replace(/\D/g, "");
      if (clave.length < 9 || !dia) return { ok: false, motivo: "faltan datos" };
      const cola = clave.slice(-9);
      const rows = await dbAll(
        `SELECT * FROM reservas WHERE dia = ?${local ? " AND local = ?" : ""} ORDER BY creado_en DESC`,
        local ? [dia, local] : [dia]
      );
      const reserva = rows.find(r => (r.telefono || "").replace(/\D/g, "").endsWith(cola));
      if (!reserva) return { ok: false, motivo: "no encontrada" };

      await dbRun(`DELETE FROM reservas WHERE id = ?`, [reserva.id]);
      console.log(`🗑️ Reserva cancelada por Sara (id ${reserva.id}): ${reserva.nombre_reserva} en ${reserva.local} ${reserva.dia}`);

      const row = await dbGet(`SELECT group_jid FROM wa_links WHERE local = ?`, [reserva.local]);
      if (row?.group_jid && isReady()) sendCancelacionGrupo(row.group_jid, reserva);

      return { ok: true, reserva };
    } catch (e) {
      console.error("Error cancelando reserva (WA):", e.message);
      return { ok: false, motivo: e.message };
    }
  });

  setSaraConfigLoader(async () => {
    try {
      const partes = [];
      const instr = await getConfig("sara_instrucciones");
      if (instr && instr.trim()) {
        partes.push(`INSTRUCCIONES DEL EQUIPO (síguelas siempre que apliquen):\n${instr.trim()}`);
      }
      const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
      const bloqueos = await dbAll(
        `SELECT local, desde, hasta, motivo FROM bloqueos_reservas WHERE hasta::date >= ?::date ORDER BY desde`, [hoy]
      );
      if (bloqueos.length) {
        const lineas = bloqueos.map(b => `- ${b.local}: del ${b.desde} al ${b.hasta}${b.motivo ? ` (${b.motivo})` : ""}`).join("\n");
        partes.push(`RESERVAS NO DISPONIBLES en estos locales y fechas. NUNCA ofrezcas, sugieras ni registres una reserva que caiga en estos rangos. Si el cliente pregunta por reservar en estas fechas o locales, tu PRIMERA frase debe decir directamente que ese día no hay reservas (NO empieces diciendo que sí y luego te corrijas). Recuérdaselo con amabilidad y ofrécele otra fecha u otro local que sí acepte:\n${lineas}`);
      }
      const docs = await dbAll(
        `SELECT id, tema, disparadores, respuesta FROM sara_respuestas WHERE activo = 1 AND documento_url IS NOT NULL AND documento_url != '' ORDER BY id`
      );
      if (docs.length) {
        const lineas = docs.map(d => `- id ${d.id}: ${d.tema}${d.disparadores ? ` — cuándo enviarlo: ${d.disparadores}` : ""}${d.respuesta ? ` — di también: ${d.respuesta}` : ""}`).join("\n");
        partes.push(`DOCUMENTOS DISPONIBLES para enviar con la herramienta enviar_documento (usa el id exacto; envíalo A LA PRIMERA en cuanto el cliente pida algo que encaje, sin derivar al teléfono ni esperar a que insista):\n${lineas}`);
      }
      const respTexto = await dbAll(
        `SELECT tema, disparadores, respuesta FROM sara_respuestas WHERE activo = 1 AND (documento_url IS NULL OR documento_url = '') AND respuesta IS NOT NULL AND respuesta != '' ORDER BY id`
      );
      if (respTexto.length) {
        const lineas = respTexto.map(d => `- ${d.tema}${d.disparadores ? ` (cuándo: ${d.disparadores})` : ""}: ${d.respuesta}`).join("\n");
        partes.push(`RESPUESTAS CONFIGURADAS:\n${lineas}`);
      }
      return partes.length ? `--- CONFIGURACIÓN DEL EQUIPO ---\n${partes.join("\n\n")}` : "";
    } catch (e) {
      console.error("Error construyendo config de Sara:", e.message);
      return "";
    }
  });

  setDocumentoResolver(async (documentoId) => {
    try {
      const row = await dbGet(`SELECT documento_url FROM sara_respuestas WHERE id = ? AND activo = 1`, [documentoId]);
      if (!row || !row.documento_url) return null;
      const url = row.documento_url;
      let buffer;
      if (/^https?:\/\//i.test(url)) {
        const r = await fetch(url);
        if (!r.ok) return null;
        buffer = Buffer.from(await r.arrayBuffer());
      } else {
        const filePath = path.join(__dirname, "public", url.replace(/^\//, ""));
        if (!fs.existsSync(filePath)) return null;
        buffer = fs.readFileSync(filePath);
      }
      const filename = (url.split("/").pop() || "documento.pdf").split("?")[0];
      const mimetype = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
      return { buffer, filename, mimetype };
    } catch (e) {
      console.error("Error resolviendo documento:", e.message);
      return null;
    }
  });

  setOnMensajeSaliente(async ({ jid, mensaje, esManual = false }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    const tipo     = esManual ? "manual" : "saliente";
    const origen   = esManual ? "[Operador]" : "[Sistema]";
    try {
      await dbRun(
        `INSERT INTO whatsapp_messages (jid, telefono, mensaje, respuesta, tipo) VALUES (?, ?, ?, ?, ?)`,
        [jid, telefono, origen, mensaje, tipo]
      );
      await dbRun(
        `INSERT INTO wa_clientes (jid, telefono, ultima_interaccion)
         VALUES (?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
         ON CONFLICT(jid) DO UPDATE SET ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
        [jid, telefono]
      );
    } catch (e) { console.error("Error guardando mensaje saliente WA:", e.message); }
  });

  setOnActualizarPerfil(async (jid, { campo, valor }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    try {
      if (campo === "nombre") {
        await dbRun(
          `INSERT INTO wa_clientes (jid, telefono, nombre, ultima_interaccion)
           VALUES (?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
           ON CONFLICT(jid) DO UPDATE SET nombre = ?, ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
          [jid, telefono, valor, valor]
        );
      } else if (campo === "nota") {
        const row = await dbGet(`SELECT notas FROM wa_clientes WHERE jid = ?`, [jid]);
        let notas = {};
        if (row?.notas) { try { notas = JSON.parse(row.notas); } catch {} }
        notas[Date.now()] = valor;
        const notasJson = JSON.stringify(notas);
        await dbRun(
          `INSERT INTO wa_clientes (jid, telefono, notas, ultima_interaccion)
           VALUES (?, ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
           ON CONFLICT(jid) DO UPDATE SET notas = ?, ultima_interaccion = EXTRACT(EPOCH FROM NOW())::BIGINT`,
          [jid, telefono, notasJson, notasJson]
        );
      }
    } catch (e) { console.error("Error actualizando perfil WA:", e.message); }
  });

  setOnGroupAttachment(async ({ groupJid, senderJid, buffer, mimeType, filename, caption }) => {
    const grupo = await dbGet("SELECT local FROM facturas_grupos WHERE group_jid = ?", [groupJid]);
    if (!grupo) return;

    const local = grupo.local;
    console.log(`[Facturas] Documento recibido en grupo ${local} de ${senderJid}`);

    try {
      await sendMensajeAGrupo(groupJid, `⏳ Procesando documento para *${local}*...`);

      const result = await procesarFactura({
        buffer, mimeType, filename, local, caption,
        getToken: getDriveAccessToken,
        dbGet, dbRun,
        backupFn: null
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
           ROUND(SUM(COALESCE(base_imponible,0))::NUMERIC,2) AS base,
           ROUND(SUM(COALESCE(cuota_iva,0))::NUMERIC,2) AS iva,
           ROUND(SUM(COALESCE(total,0))::NUMERIC,2) AS total
         FROM facturas
         WHERE TO_CHAR(fecha::date, 'YYYY-MM') = ?
         GROUP BY local ORDER BY total DESC`,
        [yearMonth]
      );

      if (!rows.length) {
        console.log(`[Resumen] Sin facturas para ${mesLabel} — resumen omitido`);
        return;
      }

      const fmt  = n => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sumB = rows.reduce((s, r) => s + (Number(r.base)  || 0), 0);
      const sumI = rows.reduce((s, r) => s + (Number(r.iva)   || 0), 0);
      const sumT = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
      const sumD = rows.reduce((s, r) => s + (Number(r.num_docs) || 0), 0);

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
        "INSERT INTO config (key, value, updated_at) VALUES ('resumen_mensual_ultimo', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at",
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
      if (ultimo?.value === prevYM) return;
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
