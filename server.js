import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { initWhatsApp, sendConfirmacionCliente, sendNotificacionGrupo, getGroups, isReady, getQRImage, setOnReserva } from "./whatsapp.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "tapeta-secret-dev";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const dbPath = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

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

// Middleware de autenticación
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

// Leads
app.post("/api/leads", (req, res) => {
  const { nombre, apellidos, nacimiento, poblacion, telefono, correo } = req.body;
  if (!nombre || !apellidos || !nacimiento || !poblacion || !telefono || !correo) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }
  const premio = "10% de descuento";
  const creado_en = new Date().toISOString();
  db.run(
    `INSERT INTO leads (nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [nombre, apellidos, nacimiento, poblacion, telefono, correo, premio, creado_en],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Error guardando lead" });
      return res.json({ ok: true, premio });
    }
  );
});

app.get("/api/leads", requireAuth(["direccion", "marketing"]), (req, res) => {
  const { q, poblacion, from, to } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push(`(nombre LIKE ? OR apellidos LIKE ? OR correo LIKE ? OR telefono LIKE ?)`);
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (poblacion) { where.push(`poblacion LIKE ?`); params.push(`%${poblacion}%`); }
  if (from) { where.push(`creado_en >= ?`); params.push(from); }
  if (to) { where.push(`creado_en <= ?`); params.push(to); }
  const sql = `SELECT * FROM leads ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY creado_en DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "Error leyendo leads" });
    res.json({ ok: true, data: rows });
  });
});

app.get("/api/leads/export.csv", requireAuth(["direccion", "marketing"]), (req, res) => {
  const { q, poblacion, from, to } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push(`(nombre LIKE ? OR apellidos LIKE ? OR correo LIKE ? OR telefono LIKE ?)`);
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (poblacion) { where.push(`poblacion LIKE ?`); params.push(`%${poblacion}%`); }
  if (from) { where.push(`creado_en >= ?`); params.push(from); }
  if (to) { where.push(`creado_en <= ?`); params.push(to); }
  const sql = `SELECT * FROM leads ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY creado_en DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).send("Error exportando");
    const header = "id,nombre,apellidos,nacimiento,poblacion,telefono,correo,premio,creado_en";
    const lines = rows.map((r) =>
      [r.id, r.nombre, r.apellidos, r.nacimiento, r.poblacion, r.telefono, r.correo, r.premio, r.creado_en]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="leads.csv"`);
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
      // Confirmación al cliente
      sendConfirmacionCliente(telefono, reserva);
      // Notificación al grupo del local
      db.get(`SELECT value FROM contents WHERE key = ?`, [`whatsapp_group_${local}`], (_, row) => {
        if (row?.value) sendNotificacionGrupo(row.value, reserva);
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
  db.run("DELETE FROM reservas WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ ok: false, error: "Error eliminando reserva" });
    res.json({ ok: true });
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
  db.get(`SELECT COUNT(*) as total FROM leads`, (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: "Error KPI leads" });
    result.leads = row.total;
    db.get(`SELECT COUNT(*) as total FROM reservas`, (err2, row2) => {
      if (err2) return res.status(500).json({ ok: false, error: "Error KPI reservas" });
      result.reservas = row2.total;
      db.all(
        `SELECT local, COUNT(*) as total FROM reservas GROUP BY local ORDER BY total DESC`,
        (err3, rows3) => {
          if (err3) return res.status(500).json({ ok: false, error: "Error KPI locales" });
          result.reservas_por_local = rows3;
          res.json({ ok: true, data: result });
        }
      );
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
  const key = `whatsapp_group_${local}`;
  const updated_at = new Date().toISOString();
  db.run(
    `INSERT INTO contents (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    [key, groupId, updated_at],
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
  db.all(`SELECT key, value FROM contents WHERE key LIKE 'whatsapp_group_%'`, (err, rows) => {
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

app.get("/", (req, res) => res.redirect("/login.html"));

app.listen(PORT, () => {
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
        db.get(`SELECT value FROM contents WHERE key = ?`, [`whatsapp_group_${local}`], (_, row) => {
          if (row?.value) sendNotificacionGrupo(row.value, reserva);
        });
      }
    );
  });

  initWhatsApp();
});
