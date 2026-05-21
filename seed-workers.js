import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
console.log(`Usando BD: ${dbPath}`);

const workers = [
  // La Tapeta - Blanes
  { nombre: "Kevin",   username: "kevin_blanes",    local: "La Tapeta - Blanes" },
  { nombre: "Lely",    username: "lely_blanes",     local: "La Tapeta - Blanes" },
  { nombre: "Javi",    username: "javi_blanes",     local: "La Tapeta - Blanes" },
  { nombre: "Sarah",   username: "sarah_blanes",    local: "La Tapeta - Blanes" },
  { nombre: "Sara",    username: "sara_blanes",     local: "La Tapeta - Blanes" },
  { nombre: "Judit",   username: "judit_blanes",    local: "La Tapeta - Blanes" },
  { nombre: "Arnau",   username: "arnau_blanes",    local: "La Tapeta - Blanes" },
  { nombre: "Rufi",    username: "rufi_blanes",     local: "La Tapeta - Blanes" },
  { nombre: "Ruth",    username: "ruth_blanes",     local: "La Tapeta - Blanes" },
  { nombre: "Rebeca",  username: "rebeca_blanes",   local: "La Tapeta - Blanes" },
  { nombre: "Enric",   username: "enric_blanes",    local: "La Tapeta - Blanes" },
  { nombre: "Isi",     username: "isi_blanes",      local: "La Tapeta - Blanes" },
  { nombre: "Ron",     username: "ron_blanes",      local: "La Tapeta - Blanes" },
  { nombre: "Aitana",  username: "aitana_blanes",   local: "La Tapeta - Blanes" },
  { nombre: "Ahinara", username: "ahinara_blanes",  local: "La Tapeta - Blanes" },

  // La Tapeta - Lloret
  { nombre: "Loli",    username: "loli_lloret",     local: "La Tapeta - Lloret" },
  { nombre: "Lolilla", username: "lolilla_lloret",  local: "La Tapeta - Lloret" },
  { nombre: "Carlos",  username: "carlos_lloret",   local: "La Tapeta - Lloret" },
  { nombre: "Ernesto", username: "ernesto_lloret",  local: "La Tapeta - Lloret" },
  { nombre: "Edimar",  username: "edimar_lloret",   local: "La Tapeta - Lloret" },
  { nombre: "Oana",    username: "oana_lloret",     local: "La Tapeta - Lloret" },
  { nombre: "Ana",     username: "ana_lloret",      local: "La Tapeta - Lloret" },
  { nombre: "Lucas",   username: "lucas_lloret",    local: "La Tapeta - Lloret" },
  { nombre: "Andrés",  username: "andres_lloret",   local: "La Tapeta - Lloret" },
  { nombre: "Javi",    username: "javi_lloret",     local: "La Tapeta - Lloret" },
  { nombre: "Lindsey", username: "lindsey_lloret",  local: "La Tapeta - Lloret" },

  // La Tapeta - Girona
  { nombre: "Alejandro", username: "alejandro_girona", local: "La Tapeta - Girona" },
  { nombre: "Erika",     username: "erika_girona",     local: "La Tapeta - Girona" },
  { nombre: "Cali",      username: "cali_girona",      local: "La Tapeta - Girona" },
  { nombre: "Gabi",      username: "gabi_girona",      local: "La Tapeta - Girona" },
  { nombre: "Montse",    username: "montse_girona",    local: "La Tapeta - Girona" },

  // Can Mateu - Tordera
  { nombre: "Marita", username: "marita_canmateu", local: "Can Mateu - Tordera" },
  { nombre: "Manoli", username: "manoli_canmateu", local: "Can Mateu - Tordera" },
  { nombre: "Isa",    username: "isa_canmateu",    local: "Can Mateu - Tordera" },
  { nombre: "Diego",  username: "diego_canmateu",  local: "Can Mateu - Tordera" },
  { nombre: "Nico",   username: "nico_canmateu",   local: "Can Mateu - Tordera" },

  // La Tapa Ibérica - Tordera
  { nombre: "Antonio", username: "antonio_iberica", local: "La Tapa Ibérica - Tordera" },
  { nombre: "Sara",    username: "sara_iberica",    local: "La Tapa Ibérica - Tordera" },
  { nombre: "Manoli",  username: "manoli_iberica",  local: "La Tapa Ibérica - Tordera" },
  { nombre: "Edu",     username: "edu_iberica",     local: "La Tapa Ibérica - Tordera" },
  { nombre: "Josué",   username: "josue_iberica",   local: "La Tapa Ibérica - Tordera" },
  { nombre: "Alex",    username: "alex_iberica",    local: "La Tapa Ibérica - Tordera" },
];

const db = new sqlite3.Database(dbPath);
const PASSWORD = "tapeta2024";
const ahora = new Date().toISOString();

async function run() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  let ok = 0, skip = 0;

  for (const w of workers) {
    await new Promise((resolve) => {
      db.run(
        `INSERT OR IGNORE INTO users (username, password_hash, rol, nombre, local, creado_en)
         VALUES (?, ?, 'trabajador', ?, ?, ?)`,
        [w.username, hash, w.nombre, w.local, ahora],
        function (err) {
          if (err) { console.error(`ERROR ${w.username}:`, err.message); skip++; }
          else if (this.changes === 0) { console.log(`SKIP (ya existe): ${w.username}`); skip++; }
          else { console.log(`✓ ${w.nombre} (${w.local})`); ok++; }
          resolve();
        }
      );
    });
  }

  console.log(`\n✅ ${ok} trabajadores creados, ${skip} omitidos.`);
  db.close();
}

run();
