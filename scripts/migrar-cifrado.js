#!/usr/bin/env node
// Migración R01: pasa los secretos guardados del cifrado legado (roto) al formato v2.
//
// NO se ejecuta sola. Se invoca a mano, y para escribir hace falta decirlo dos veces:
//
//   node scripts/migrar-cifrado.js
//       En seco. Solo cuenta: cuántos valores hay en cada formato y cuántos no se pueden
//       descifrar. No escribe nada, ni siquiera crea la tabla de copia.
//
//   node scripts/migrar-cifrado.js --aplicar --si-estoy-seguro
//       Migra de verdad, en UNA transacción, con candado y con copia previa de los criptogramas
//       antiguos. Verifica cada valor nuevo antes de confirmar. Cualquier fallo → ROLLBACK.
//
//   node scripts/migrar-cifrado.js --verificar
//       ¿Queda algo sin migrar? Es la pregunta que decide cuándo se puede borrar el lector viejo.
//
//   node scripts/migrar-cifrado.js --restaurar --si-estoy-seguro
//       La vuelta atrás: repone los criptogramas de `cifrado_copia_v1`. No necesita conocer
//       ninguna contraseña, que es justo lo que hace que sirva.
//
// NO IMPRIME CONTENIDOS. Ni contraseñas, ni criptogramas, ni la clave, ni trozos de nada. Solo
// conteos, estados y el `kid`, que es un hash truncado.
//
// Necesita DATABASE_URL y DATA_ENC_KEY en el entorno donde se ejecute. Ver el LÉEME de abajo
// (`--ayuda`) para cómo se lanza contra la base del deployment sin mover ningún Secret.

import pg from "pg";
import { cargarLlavero, lineaArranque } from "../src/modules/seguridad/clave-datos.js";
import { contar, migrar, quedaLegado, restaurar, CANDADO } from "../src/modules/seguridad/migracion-cifrado.js";

const { Pool } = pg;

function toPositional(sql) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }
function envoltura(client) {
  return {
    get: async (s, p = []) => (await client.query(toPositional(s), p)).rows[0] || null,
    all: async (s, p = []) => (await client.query(toPositional(s), p)).rows,
    run: async (s, p = []) => (await client.query(toPositional(s), p)).rows[0] || undefined,
  };
}

const AYUDA = `
Migración del cifrado de secretos (R01).

  node scripts/migrar-cifrado.js                            en seco, solo conteos
  node scripts/migrar-cifrado.js --aplicar --si-estoy-seguro  migra de verdad
  node scripts/migrar-cifrado.js --verificar                ¿queda algo legado?
  node scripts/migrar-cifrado.js --restaurar --si-estoy-seguro  deshace desde la copia

Entorno necesario: DATABASE_URL y DATA_ENC_KEY.
`;

function tabla(filas) {
  for (const f of filas) {
    const donde = `${f.tabla}.${f.columna}`.padEnd(26);
    if (f.ausente) { console.log(`  ${donde} (la tabla no existe)`); continue; }
    console.log(`  ${donde} total ${f.total}  ·  nulo ${f.nulo}  claro ${f.claro}  legado ${f.legado}  v2 ${f.v2}  corrupto ${f.corrupto}  ILEGIBLE ${f.no_descifrable}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--ayuda") || args.includes("-h")) { console.log(AYUDA); process.exit(0); }

  // `--dry-run` no hace falta (es lo que pasa si no se pide otra cosa), pero se acepta para que
  // el comando escrito en `.replit` diga por sí solo lo que va a hacer.
  const aplicar = args.includes("--aplicar");
  const verificar = args.includes("--verificar");
  const revertir = args.includes("--restaurar");
  const seguro = args.includes("--si-estoy-seguro");

  if ((aplicar || revertir) && !seguro) {
    console.error("⛔ --aplicar y --restaurar exigen además --si-estoy-seguro. No se ha tocado nada.");
    process.exit(2);
  }
  if (aplicar && revertir) { console.error("⛔ --aplicar y --restaurar a la vez, no."); process.exit(2); }

  if (!process.env.DATABASE_URL) { console.error("⛔ falta DATABASE_URL."); process.exit(2); }

  const llavero = cargarLlavero();
  console.log(lineaArranque(llavero));
  if (aplicar && !llavero.puedeCifrar) {
    console.error("⛔ sin DATA_ENC_KEY válida no se puede migrar. Añádela a los Secrets primero.");
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon") ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();
  let salida = 0;

  try {
    const x = envoltura(client);

    if (verificar) {
      const r = await quedaLegado(x);
      for (const d of r.detalle) console.log(`  ${`${d.tabla}.${d.columna}`.padEnd(26)} sin migrar ${d.sin_migrar}`);
      console.log(r.limpio
        ? "\n✓ No queda ningún valor en formato legado ni en claro."
        : `\n⚠ Quedan ${r.sin_migrar} valores sin migrar.`);
      return void (salida = r.limpio ? 0 : 1);
    }

    if (revertir) {
      // También en transacción: una restauración a medias es peor que no haberla intentado.
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [CANDADO]);
      const r = await restaurar(x, { aplicar: true });
      await client.query("COMMIT");
      console.log(r.sin_copia ? "⛔ No hay tabla de copia: no hay nada que restaurar." : `✓ Restaurados ${r.restaurados} valores desde la copia.`);
      return void (salida = r.sin_copia ? 1 : 0);
    }

    // ── Recuento, que se hace SIEMPRE, también antes de aplicar ──
    const c = await contar(x, llavero);
    console.log("\nEstado actual:");
    tabla(c.por);
    const t = c.total;
    console.log(`  ${"TOTAL".padEnd(26)} total ${t.total}  ·  nulo ${t.nulo}  claro ${t.claro}  legado ${t.legado}  v2 ${t.v2}  corrupto ${t.corrupto}  ILEGIBLE ${t.no_descifrable}`);
    console.log(`  a migrar en esta pasada: ${t.pendientes}`);

    if (!aplicar) {
      console.log(c.listo
        ? "\n✓ En seco. Todo legible. Para aplicar: --aplicar --si-estoy-seguro"
        : "\n⛔ En seco. Hay valores ILEGIBLES o corruptos: averigua por qué ANTES de aplicar.");
      return void (salida = c.listo ? 0 : 1);
    }

    if (!c.listo) {
      console.error("\n⛔ Hay valores que no se pueden descifrar. No se migra nada.");
      return void (salida = 1);
    }

    await client.query("BEGIN");
    // El candado es de transacción: se suelta solo al COMMIT o al ROLLBACK, incluso si el
    // proceso muere. Dos migraciones a la vez se pisarían entre la lectura y la escritura.
    await client.query("SELECT pg_advisory_xact_lock($1)", [CANDADO]);
    const r = await migrar(x, llavero, { aplicar: true });
    await client.query("COMMIT");

    console.log(`\n✓ Migrados ${r.migrados} valores (${r.saltados} ya estaban o estaban vacíos).`);
    for (const p of r.por) if (!p.ausente) console.log(`  ${`${p.tabla}.${p.columna}`.padEnd(26)} migrados ${p.migrados}  saltados ${p.saltados}`);
    console.log("\nComprueba ahora con: node scripts/migrar-cifrado.js --verificar");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* la transacción ya estaba cerrada */ }
    // Solo el mensaje. Un error de pg puede arrastrar la consulta entera y con ella el criptograma.
    console.error(`\n⛔ ROLLBACK — ${e && e.name ? e.name : "Error"}: ${e && e.message ? e.message : e}`);
    salida = 1;
  } finally {
    client.release();
    await pool.end();
  }
  process.exit(salida);
}

main();
