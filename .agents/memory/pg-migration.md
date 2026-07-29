---
name: PostgreSQL migration
description: The app was migrated from SQLite to Neon PostgreSQL. Key patterns and gotchas.
---

# PostgreSQL Migration

## Rule
The data layer is Neon PostgreSQL via `pg` Pool. SQLite (`sqlite3`) is fully removed.

**Why:** SQLite files were ephemeral on Replit deployments (lost on every Republish). PostgreSQL persists forever.

## How to apply
- DB connection: `const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })`
- `?` placeholders auto-translated to `$1,$2,...` by `toPositional()` helper in `server.js`
- `dbRun()` returns `result.rows[0]` — use `RETURNING id` to get inserted IDs
- Schema lives in `initDB()` (async, called at server startup)
- `facturas.js` receives `dbGet/dbAll/dbRun` as arguments — compatible with the same wrappers

## Key SQL dialect changes applied
- `AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `datetime('now')` → `CURRENT_TIMESTAMP`
- `strftime('%Y-%m', fecha)` → `TO_CHAR(fecha::date, 'YYYY-MM')`
- `strftime('%m', col)` → `TO_CHAR(col::date, 'MM')`
- `strftime('%s','now')` → `EXTRACT(EPOCH FROM NOW())::BIGINT`
- `date(?) BETWEEN date(col1) AND date(col2)` → `?::date BETWEEN col1::date AND col2::date`
- `date('now','-1 day')` → `CURRENT_DATE - INTERVAL '1 day'`
- `datetime('now', '-4 hours')` → `NOW() - INTERVAL '4 hours'`
- `INSERT OR IGNORE` → `ON CONFLICT(...) DO NOTHING`
- `INSERT OR REPLACE` → `ON CONFLICT(...) DO UPDATE SET ...`
- `this.lastID` → `RETURNING id` + `result.id`

## KV backup
Old KV backup/restore functions removed. `restoreFromKV()` runs once at startup (idempotent) to import any surviving SQLite-era KV data into Postgres.
