import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { initWhatsApp, sendConfirmacionCliente, sendCancelacionCliente, sendMensajeLibre, sendNotificacionGrupo, sendCancelacionGrupo, getGroups, isReady, getQRImage, setOnReserva, setOnReady, setOnMessage } from "./whatsapp.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "tapeta-secret-dev";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function resolveDbPath() {
  const configured = process.env.DB_PATH;
  if (configured) {
    const dir = path.dirname(configured);
    try {
      fs.mkdirSync(dir, { recursive: true });
      return configured;
    } catch {
      console.warn(`DB_PATH directory inaccesible (${dir}), usando ruta local.`);
    }
  }
  return path.join(__dirname, "database.sqlite");
}
const dbPath = resolveDbPath();
console.log(`Base de datos: ${dbPath}`);
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
  destination: (req, file, cb) => cb(null, uploadsDir),
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
    // Migrar links existentes de la tabla contents a wa_links
    db.all(`SELECT key, value FROM contents WHERE key LIKE 'whatsapp_group_%'`, (err, rows) => {
      if (err || !rows?.length) return;
      const ahora = new Date().toISOString();
      rows.forEach(({ key, value }) => {
        const local = key.replace("whatsapp_group_", "");
        db.run(
          `INSERT OR IGNORE INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?)`,
          [local, value, ahora]
        );
      });
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
  db.run(`ALTER TABLE leads ADD COLUMN genero TEXT`, () => {});
  db.run(`ALTER TABLE leads ADD COLUMN fuente TEXT DEFAULT 'web'`, () => {});
  db.run(`ALTER TABLE leads ADD COLUMN actualizado_en TEXT`, () => {});

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

// Refresco diario de reseñas (cada 24h)
setInterval(async () => {
  try {
    const refresh = await getConfig("google_refresh_token");
    if (refresh) await fetchAndStoreReviews();
  } catch (e) {
    console.error("Auto-refresh reviews:", e.message);
  }
}, 24 * 60 * 60 * 1000);

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
  res.json({ connected: !!token, reviews_count: count?.n || 0, last_fetch: lastFetch });
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
    await fetchAndStoreReviews();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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
      const reserva = { local, personas, dia, hora, telefono, nombre_reserva };
      upsertLeadFromReserva({ nombre_reserva, telefono });
      console.log(`[Reserva] WhatsApp listo: ${isReady()} | Confirmación a ${telefono}`);
      if (isReady()) sendConfirmacionCliente(telefono, reserva);
      else guardarPendienteWA("confirmacion", telefono, reserva);
      db.get(`SELECT group_jid FROM wa_links WHERE local = ?`, [local], (_, row) => {
        console.log(`[Reserva] Grupo para "${local}": ${row?.group_jid || "NO CONFIGURADO"}`);
        if (row?.group_jid) {
          if (isReady()) sendNotificacionGrupo(row.group_jid, reserva);
          else guardarPendienteWA("grupo", row.group_jid, reserva);
        }
      });
      return res.json({ ok: true, reserva_id: this.lastID });
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

app.post("/api/hr/applications", upload.single("cv"), (req, res) => {
  const { nombre, email, telefono, puesto, mensaje } = req.body;
  if (!nombre || !email || !telefono || !puesto) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const cv_url = req.file ? `/uploads/${req.file.filename}` : "";
  const creado_en = new Date().toISOString();
  db.run(
    `INSERT INTO hr_applications (nombre, email, telefono, puesto, mensaje, cv_url, estado, creado_en) VALUES (?, ?, ?, ?, ?, ?, 'nuevo', ?)`,
    [nombre, email, telefono, puesto, mensaje || "", cv_url, creado_en],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Error guardando candidatura" });
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
  console.log(`${signal} recibido, cerrando servidor...`);
  setTimeout(() => { process.exit(0); }, 3000).unref();
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
        else if (row.tipo === "grupo") await sendNotificacionGrupo(row.destino, reserva);
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

  setOnReserva((reserva) => {
    const { local, personas, dia, hora, telefono, nombre_reserva } = reserva;
    if (!local || !personas || !dia || !hora || !telefono || !nombre_reserva) return;
    const creado_en = new Date().toISOString();
    db.run(
      `INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [local, personas, dia, hora, telefono, nombre_reserva, creado_en],
      function (err) {
        if (err) { console.error("Error guardando reserva WhatsApp:", err.message); return; }
        console.log(`📅 Reserva WhatsApp guardada (id ${this.lastID}): ${nombre_reserva} en ${local}`);
        upsertLeadFromReserva({ nombre_reserva, telefono });
        db.get(`SELECT group_jid FROM wa_links WHERE local = ?`, [local], (_, row) => {
          if (row?.group_jid) {
            if (isReady()) sendNotificacionGrupo(row.group_jid, reserva);
            else guardarPendienteWA("grupo", row.group_jid, reserva);
          }
        });
      }
    );
  });

  setOnReady(procesarPendientesWA);

  setOnMessage(({ jid, texto, respuesta, historico = false }) => {
    const telefono = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    db.run(
      `INSERT OR IGNORE INTO whatsapp_messages (jid, telefono, mensaje, respuesta, historico) VALUES (?, ?, ?, ?, ?)`,
      [jid, telefono, texto, respuesta, historico ? 1 : 0],
      (err) => { if (err) console.error("Error guardando mensaje WA:", err.message); }
    );
  });

  initWhatsApp();
});
