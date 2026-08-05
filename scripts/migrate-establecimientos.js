// Runner DELIBERADO de la migración de establecimientos (Iteración 2).
// NO se auto-ejecuta al arrancar el servidor. Modos: --dry-run (por defecto) | --schema-only
// | --backfill | --rollback. Activa PRAGMA foreign_keys = ON en su conexión. Protege contra
// ejecución accidental sobre la ruta de producción. Exporta run(argv) para poder testearlo
// sin lanzar procesos ni llamar a process.exit dentro de las pruebas.
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { reconcile, formatReport, CATALOGO_CANONICO, catalogChecksum } from "../src/db/reconciliation.js";
import {
  ensureSchema, computeGrandfatherCandidates, migrarBackfill, CREATED_TABLES, CREATED_INDEXES,
} from "../src/db/establecimientos.migration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const flags = new Set();
  const opts = new Map();
  const FLAGS = new Set(["dry-run", "schema-only", "backfill", "rollback", "confirm", "confirm-production-migration"]);
  const OPTS = new Set(["db", "legacy-users", "legacy-users-file"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const name = a.slice(2);
    if (FLAGS.has(name)) flags.add(name);
    else if (OPTS.has(name)) { opts.set(name, argv[i + 1] ?? ""); i++; }
  }
  return { flags, opts, has: (n) => flags.has(n) || opts.has(n) };
}

function openDb(dbPath, { readonly = false } = {}) {
  const mode = readonly ? sqlite3.OPEN_READONLY : (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
  const db = new sqlite3.Database(dbPath, mode);
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
  const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
  const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
  const close = () => new Promise((r) => db.close(() => r()));
  return { db, run, get, all, close };
}

// Rutas que consideramos "producción" (requieren --confirm-production-migration).
function looksLikeProd(dbPath) {
  const p = path.resolve(dbPath);
  const candidates = [
    path.resolve("/home/runner/latapeta-data/database.sqlite"),
    path.resolve(path.join(__dirname, "..", "database.sqlite")),
  ];
  if (process.env.DB_PATH) candidates.push(path.resolve(process.env.DB_PATH));
  return candidates.some((c) => c === p);
}

function parseLegacyIds({ opts }, logger) {
  let raw;
  if (opts.has("legacy-users-file")) {
    const parsed = JSON.parse(fs.readFileSync(opts.get("legacy-users-file"), "utf8"));
    raw = Array.isArray(parsed) ? parsed : parsed.ids;
  } else {
    raw = String(opts.get("legacy-users") || "").split(",");
  }
  const ids = (raw || [])
    .map((v) => String(v).trim())
    .filter((v) => v !== "")
    .map((v) => Number(v));
  for (const n of ids) if (!Number.isInteger(n) || n <= 0) throw new Error(`ID de legacy-user inválido: ${n}`);
  return ids;
}

// Devuelve { code } (0 ok, 1 bloqueos en dry-run, 2 error de uso/seguridad). No llama a process.exit.
export async function run(argv, { log = console.log, err = console.error } = {}) {
  const args = parseArgs(argv);
  const mode = args.flags.has("schema-only") ? "schema-only"
    : args.flags.has("backfill") ? "backfill"
    : args.flags.has("rollback") ? "rollback"
    : "dry-run";

  if (!args.opts.has("db")) { err("Falta --db <ruta>"); return { code: 2 }; }
  const dbPath = args.opts.get("db");

  if (looksLikeProd(dbPath) && !args.flags.has("confirm-production-migration")) {
    err("⛔ La ruta indicada parece de PRODUCCIÓN. Añade --confirm-production-migration para continuar.");
    return { code: 2 };
  }

  const x = openDb(dbPath, { readonly: mode === "dry-run" });
  try {
    if (mode === "dry-run") {
      const recon = await reconcile(x);
      log(formatReport(recon));
      // Candidatos a backfill (sin tocar la BD; usando el catálogo canónico en memoria)
      const users = await x.all("SELECT id, local FROM users WHERE local IS NOT NULL AND TRIM(local) <> ''", []);
      const wouldAssign = users.filter((u) => recon.valueToCanon.has(u.local));
      log(`\nTrabajadores asignables por backfill: ${wouldAssign.length}`);
      const gf = await computeGrandfatherCandidates(x, wouldAssign.map((u) => u.id));
      const needLegacy = gf.filter((c) => !c.autoExcluded);
      log(`Candidatos a grandfather (requieren aprobación EXPLÍCITA por ID): ${needLegacy.length}`);
      for (const c of needLegacy) log(`   - id ${c.id} · ${c.username} · rol ${c.rol}`);
      log(`\nDRY-RUN: no se ha modificado la base de datos.`);
      return { code: recon.ok ? 0 : 1, recon };
    }

    if (mode === "schema-only") {
      await ensureSchema(x);
      log("✅ Esquema e índices creados (idempotente). Sin catálogo, sin backfill, sin grandfather.");
      return { code: 0 };
    }

    if (mode === "backfill") {
      const legacyProvided = args.opts.has("legacy-users") || args.opts.has("legacy-users-file");
      if (!legacyProvided) {
        err("⛔ --backfill exige una whitelist grandfather EXPLÍCITA (usa --legacy-users \"\" para vacía, o --legacy-users-file <ruta>).");
        return { code: 2 };
      }
      const approvedLegacyIds = parseLegacyIds(args, err);
      const res = await migrarBackfill(x, { approvedLegacyIds });
      log(`✅ Backfill OK. Trabajadores asignados: ${res.workersAssigned}. Grandfather: [${res.grandfather.applied.join(", ")}]. Catálogo checksum ${catalogChecksum()}.`);
      return { code: 0, res };
    }

    if (mode === "rollback") {
      if (!args.flags.has("confirm")) { err("⛔ Rollback requiere --confirm (y nunca borra por defecto)."); return { code: 2 }; }
      // Negarse si alguna tabla nueva contiene datos.
      for (const t of CREATED_TABLES) {
        const exists = await x.get("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [t]);
        if (!exists) continue;
        const n = (await x.get(`SELECT COUNT(*) AS n FROM "${t}"`, [])).n;
        if (n > 0) { err(`⛔ Rollback abortado: la tabla ${t} contiene ${n} filas. Prefiere revertir el código y dejar las tablas sin uso.`); return { code: 2 }; }
      }
      for (const idx of CREATED_INDEXES) await x.run(`DROP INDEX IF EXISTS ${idx}`);
      for (const t of CREATED_TABLES) await x.run(`DROP TABLE IF EXISTS "${t}"`);
      log("✅ Rollback: tablas nuevas (vacías) e índices eliminados.");
      return { code: 0 };
    }

    err(`Modo desconocido`); return { code: 2 };
  } finally {
    await x.close();
  }
}

// Ejecución directa (CLI). En pruebas se importa run() y no se llega aquí.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then((r) => process.exit(r.code)).catch((e) => { console.error(e.message); process.exit(1); });
}
