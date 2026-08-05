#!/usr/bin/env node
// Runner de la migración del modelo de establecimientos (Iteración 2) — PostgreSQL.
// NO se ejecuta automáticamente. Se invoca a mano y de forma deliberada:
//
//   node scripts/migrate-establecimientos.js --dry-run
//       Solo lectura: reconcilia los valores `local` existentes contra el catálogo canónico
//       y muestra el informe. No crea tablas ni escribe nada.
//
//   node scripts/migrate-establecimientos.js --backfill --approve-legacy=<ids|none>
//       Aplica de forma ATÓMICA (una transacción sobre un único cliente): esquema + catálogo +
//       reconciliación (aborta si hay valores desconocidos) + asignación de trabajadores +
//       whitelist grandfather aprobada + migration_state. Requiere DATABASE_URL.
//
// La whitelist grandfather es OBLIGATORIA y explícita (usa `none` para lista vacía).
import pg from "pg";
import { reconcile, formatReport } from "../src/db/reconciliation.js";
import { migrarBackfill } from "../src/db/establecimientos.migration.js";

const { Pool } = pg;

function toPositional(sql) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }
function clientWrapper(client) {
  return {
    get: async (sql, p = []) => (await client.query(toPositional(sql), p)).rows[0] || null,
    all: async (sql, p = []) => (await client.query(toPositional(sql), p)).rows,
    run: async (sql, p = []) => (await client.query(toPositional(sql), p)).rows[0] || undefined,
  };
}

function parseArgs(argv) {
  const args = { dryRun: false, backfill: false, approveLegacy: undefined };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--backfill") args.backfill = true;
    else if (a.startsWith("--approve-legacy=")) {
      const raw = a.slice("--approve-legacy=".length).trim();
      args.approveLegacy = raw === "" || raw.toLowerCase() === "none"
        ? []
        : raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: falta DATABASE_URL en el entorno.");
    process.exit(2);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon") ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();
  try {
    const x = clientWrapper(client);

    if (!args.backfill) {
      // Dry-run (por defecto): solo reconciliación, sin escribir.
      const result = await reconcile(x);
      console.log(formatReport(result));
      console.log(result.ok
        ? "\n✓ Sin bloqueos. Para aplicar: --backfill --approve-legacy=<ids|none>"
        : "\n⛔ Reconciliación bloqueada: revisa los valores no reconocidos antes de aplicar.");
      process.exit(result.ok ? 0 : 1);
    }

    if (!Array.isArray(args.approveLegacy)) {
      console.error("ERROR: --backfill requiere --approve-legacy=<ids|none> (whitelist grandfather explícita).");
      process.exit(2);
    }

    console.log(`Aplicando migración (grandfather aprobado: ${args.approveLegacy.length ? args.approveLegacy.join(",") : "ninguno"})…`);
    const res = await migrarBackfill(x, { approvedLegacyIds: args.approveLegacy });
    console.log(`✓ Migración aplicada. Trabajadores asignados: ${res.workersAssigned}. Grandfather: ${res.grandfather.count}. Usuarios: ${res.usersCount}.`);
    process.exit(0);
  } catch (e) {
    console.error("✗ Migración abortada (rollback):", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

main();
