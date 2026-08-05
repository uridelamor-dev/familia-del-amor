// Seed idempotente del roster inicial de trabajadores — PostgreSQL nativo.
// NO se auto-ejecuta al importar (solo si se invoca directamente: `node seed-workers.js`).
// No duplica trabajadores (ON CONFLICT (username) DO NOTHING). Usa DATABASE_URL + pg Pool y
// consultas parametrizadas. Sin sqlite3 ni database.sqlite. La lógica es engine-agnóstica por
// inyección de `x` (en producción el wrapper pg de este runner) para poder probarse sin BD real.
import { fileURLToPath } from "url";

export const SEED_PASSWORD = "tapeta2024";

export const WORKERS = [
  // La Tapeta - Blanes
  { nombre: "Kevin", username: "kevin_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Lely", username: "lely_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Javi", username: "javi_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Sarah", username: "sarah_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Sara", username: "sara_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Judit", username: "judit_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Arnau", username: "arnau_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Rufi", username: "rufi_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Ruth", username: "ruth_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Rebeca", username: "rebeca_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Enric", username: "enric_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Isi", username: "isi_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Ron", username: "ron_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Aitana", username: "aitana_blanes", local: "La Tapeta - Blanes" },
  { nombre: "Ahinara", username: "ahinara_blanes", local: "La Tapeta - Blanes" },

  // La Tapeta - Lloret
  { nombre: "Loli", username: "loli_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Lolilla", username: "lolilla_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Carlos", username: "carlos_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Ernesto", username: "ernesto_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Edimar", username: "edimar_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Oana", username: "oana_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Ana", username: "ana_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Lucas", username: "lucas_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Andrés", username: "andres_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Javi", username: "javi_lloret", local: "La Tapeta - Lloret" },
  { nombre: "Lindsey", username: "lindsey_lloret", local: "La Tapeta - Lloret" },

  // La Tapeta - Girona
  { nombre: "Alejandro", username: "alejandro_girona", local: "La Tapeta - Girona" },
  { nombre: "Erika", username: "erika_girona", local: "La Tapeta - Girona" },
  { nombre: "Cali", username: "cali_girona", local: "La Tapeta - Girona" },
  { nombre: "Gabi", username: "gabi_girona", local: "La Tapeta - Girona" },
  { nombre: "Montse", username: "montse_girona", local: "La Tapeta - Girona" },

  // Can Mateu - Tordera
  { nombre: "Marita", username: "marita_canmateu", local: "Can Mateu - Tordera" },
  { nombre: "Manoli", username: "manoli_canmateu", local: "Can Mateu - Tordera" },
  { nombre: "Isa", username: "isa_canmateu", local: "Can Mateu - Tordera" },
  { nombre: "Diego", username: "diego_canmateu", local: "Can Mateu - Tordera" },
  { nombre: "Nico", username: "nico_canmateu", local: "Can Mateu - Tordera" },

  // La Tapa Ibérica - Tordera
  { nombre: "Antonio", username: "antonio_iberica", local: "La Tapa Ibérica - Tordera" },
  { nombre: "Sara", username: "sara_iberica", local: "La Tapa Ibérica - Tordera" },
  { nombre: "Manoli", username: "manoli_iberica", local: "La Tapa Ibérica - Tordera" },
  { nombre: "Edu", username: "edu_iberica", local: "La Tapa Ibérica - Tordera" },
  { nombre: "Josué", username: "josue_iberica", local: "La Tapa Ibérica - Tordera" },
  { nombre: "Alex", username: "alex_iberica", local: "La Tapa Ibérica - Tordera" },
];

// Inserta el roster de forma idempotente. `x` = { run } (run devuelve la fila de RETURNING o
// undefined). Devuelve { creados, existentes }. No duplica: ON CONFLICT (username) DO NOTHING.
export async function seedWorkers(x, { hash, now, workers = WORKERS } = {}) {
  let creados = 0, existentes = 0;
  for (const w of workers) {
    const r = await x.run(
      `INSERT INTO users (username, password_hash, rol, nombre, local, creado_en)
       VALUES (?, ?, 'trabajador', ?, ?, ?)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [w.username, hash, w.nombre, w.local, now]
    );
    if (r) creados++; else existentes++;
  }
  return { creados, existentes };
}

// Runner: solo al ejecutar directamente. Requiere DATABASE_URL. No escribe salvo invocación.
async function main() {
  if (!process.env.DATABASE_URL) { console.error("ERROR: falta DATABASE_URL en el entorno."); process.exit(2); }
  const { default: pg } = await import("pg");
  const { default: bcrypt } = await import("bcrypt");
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon") ? { rejectUnauthorized: false } : false,
  });
  const toPositional = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const x = { run: async (sql, p = []) => (await pool.query(toPositional(sql), p)).rows[0] || undefined };
  try {
    const hash = await bcrypt.hash(SEED_PASSWORD, 10);
    const now = new Date().toISOString();
    const { creados, existentes } = await seedWorkers(x, { hash, now });
    console.log(`✅ ${creados} trabajadores creados, ${existentes} ya existentes.`);
  } catch (e) {
    console.error("✗ Error sembrando trabajadores:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

// Ejecutar solo si se invoca directamente (no al importar en tests).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
