// Helper de BD temporal (SQLite en memoria) para pruebas de regresión.
// Usa la dependencia de producción `sqlite3`; NO toca database.sqlite ni la sesión real.
import sqlite3 from "sqlite3";

export function openTempDb() {
  const db = new sqlite3.Database(":memory:");
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
  const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
  const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
  const close = () => new Promise((res) => db.close(() => res()));
  return { db, run, get, all, close };
}

// Réplica FIEL del esquema real (server.js) de las tablas implicadas en reservas.
export async function crearEsquemaReservas(x) {
  await x.run(`CREATE TABLE reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local TEXT NOT NULL, personas INTEGER NOT NULL, dia TEXT NOT NULL, hora TEXT NOT NULL,
    telefono TEXT NOT NULL, nombre_reserva TEXT NOT NULL, creado_en TEXT NOT NULL, zona TEXT)`);
  await x.run(`CREATE TABLE wa_links (local TEXT PRIMARY KEY, group_jid TEXT, updated_at TEXT)`);
  await x.run(`CREATE TABLE bloqueos_reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, local TEXT NOT NULL, desde TEXT, hasta TEXT, motivo TEXT)`);
}

// Semilla de grupos como en DEFAULT_WA_LINKS: Blanes y Cooperativa COMPARTEN grupo a propósito.
export async function seedWaLinks(x) {
  const rows = [
    ["La Tapeta - Blanes", "grupo-blanes@g.us"],
    ["Cooperativa - Blanes", "grupo-blanes@g.us"],
    ["La Tapeta - Lloret", "grupo-lloret@g.us"],
    ["La Tapeta - Girona", "grupo-girona@g.us"],
  ];
  for (const [local, jid] of rows) {
    await x.run(`INSERT INTO wa_links (local, group_jid, updated_at) VALUES (?, ?, ?)`, [local, jid, "2026-01-01"]);
  }
}
