#!/usr/bin/env node
// Junta el histórico de la Cooperativa con el de La Tapeta de Blanes.
//
//   node tools/juntar-blanes.mjs --contar     ← SOLO LEE. No escribe ni una fila.
//   node tools/juntar-blanes.mjs --aplicar    ← migra, dentro de una transacción
//
// EMPIEZA SIEMPRE POR `--contar` y lee lo que dice. Sin ese recuento no se sabe qué hay ahí
// dentro, y una migración a ciegas es como se pierden datos.
//
// QUÉ HACE Y QUÉ NO
//
// El cableado del servidor (src/modules/locales/centros.js) ya hace que lo NUEVO nazca junto:
// una factura que entra por el grupo de la Cooperativa se guarda como gasto de Blanes, y el
// cuadrante y el inventario se escriben bajo el centro. Lo que este script arregla es el
// PASADO: las filas que ya están guardadas con «Cooperativa - Blanes» y que, si no se mueven,
// dejarían de verse.
//
// Las tablas NO se listan a mano: se descubren preguntándole a Postgres cuáles tienen una
// columna `local`. Una lista escrita a mano se queda corta el día que alguien añade una tabla,
// y el fallo sería silencioso — datos que desaparecen sin que nadie lo note.

import pg from "pg";

const CENTRO = "La Tapeta - Blanes";
const BARRA = "Cooperativa - Blanes";

// ── Lo que NO se toca, y por qué ────────────────────────────────────────────
// Cada línea es una decisión, no un olvido. Si mañana aparece una tabla nueva con columna
// `local`, el script la sacará en «sin clasificar» y habrá que decidir aquí qué es.
const NO_TOCAR = {
  reservas: "las mesas son de cada barra: juntarlas sentaría a dos grupos en el mismo sitio",
  bloqueos_reservas: "un cierre por obras es de la barra que cierra",
  ventas_diarias: "lo escribe el TPV de cada barra; se suman al leer y así se conserva el desglose",
  fic_eventos: "el registro de jornada es INMUTABLE por ley (RD-ley 8/2019). No se reescribe jamás",
  fic_cierres: "un periodo cerrado es un documento firmado de lo que se cerró y cuándo",
  wa_links: "la Cooperativa conserva su grupo de WhatsApp",
  facturas_grupos: "íd.: el canal de entrada sigue siendo suyo, aunque lo que entre sea del centro",
  facturas_locales: "la ficha fiscal de cada barra; deja de usarse sola al migrar las facturas",
  facturas_email_reglas: "el email de entrada sigue siendo suyo",
  facturas_drive_carpetas: "su carpeta de Drive sigue donde está",
  agora_locales: "cada barra tiene su terminal de TPV y sus credenciales",
  reviews: "ficha de Google propia",
  review_places: "íd.",
  place_ids: "íd.",
};

// Tablas con clave única sobre `local`: migrar a lo bruto reventaría o duplicaría. Cada una
// dice qué hacer cuando la fila de la Cooperativa choca con una que ya existe en el centro.
const CON_FUSION = {
  hor_config: { clave: ["local"], choque: "descartar", nota: "la configuración del centro es la que manda" },
  hor_areas: { clave: ["local", "nombre"], choque: "renombrar", nota: "«Barra» pasa a «Barra (Cooperativa)»: siguen siendo dos sitios físicos" },
  hor_tramos: { clave: ["local", "nombre"], choque: "renombrar", nota: "íd." },
  hor_plantillas: { clave: ["local", "nombre"], choque: "renombrar", nota: "íd." },
  inv_proveedores: { clave: ["local", "nombre"], choque: "dejar", nota: "un proveedor en las dos barras se fusiona a mano: hay productos colgando" },
  hor_semanas: { clave: ["local", "lunes"], choque: "dejar", nota: "dos cuadrantes de la misma semana no se mezclan solos" },
};

const arg = process.argv.slice(2);
const APLICAR = arg.includes("--aplicar");
const CONTAR = arg.includes("--contar") || !APLICAR;

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. En Replit ya está puesta; en local, exportarla antes.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const q = (sql, params = []) => pool.query(sql, params);
const n = (x) => Number(x || 0);

/** Todas las tablas con columna `local`. Se pregunta, no se recuerda. */
async function tablasConLocal() {
  const r = await q(`
    SELECT c.table_name FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'local' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name`);
  return r.rows.map((x) => x.table_name);
}

async function cuantas(tabla, local) {
  const r = await q(`SELECT COUNT(*)::int AS n FROM "${tabla}" WHERE local = $1`, [local]);
  return n(r.rows[0]?.n);
}

/** Filas de la Cooperativa cuya clave única YA existe en el centro. Son las que hay que decidir. */
async function choques(tabla, clave) {
  const otras = clave.filter((c) => c !== "local");
  if (!otras.length) {
    const r = await q(`SELECT COUNT(*)::int AS n FROM "${tabla}" WHERE local = $1`, [CENTRO]);
    return n(r.rows[0]?.n) ? ["(la fila del centro ya existe)"] : [];
  }
  const on = otras.map((c) => `a."${c}" = b."${c}"`).join(" AND ");
  const r = await q(
    `SELECT ${otras.map((c) => `a."${c}"`).join(", ")} FROM "${tabla}" a
      JOIN "${tabla}" b ON ${on} AND b.local = $1
     WHERE a.local = $2`, [CENTRO, BARRA]);
  return r.rows.map((x) => otras.map((c) => x[c]).join(" · "));
}

async function main() {
  console.log(`\n  «${BARRA}»  →  «${CENTRO}»`);
  console.log(`  Modo: ${APLICAR ? "APLICAR (escribe)" : "CONTAR (solo lectura)"}\n`);

  const tablas = await tablasConLocal();
  const migrar = [], fusion = [], intactas = [], vacias = [];

  for (const t of tablas) {
    let filas;
    try { filas = await cuantas(t, BARRA); } catch (e) { console.log(`  ⚠ ${t}: ${e.message.slice(0, 80)}`); continue; }
    if (NO_TOCAR[t]) { if (filas) intactas.push({ t, filas, por: NO_TOCAR[t] }); continue; }
    if (!filas) { vacias.push(t); continue; }
    if (CON_FUSION[t]) {
      const ch = await choques(t, CON_FUSION[t].clave).catch(() => []);
      fusion.push({ t, filas, choques: ch, ...CON_FUSION[t] });
    } else {
      migrar.push({ t, filas });
    }
  }

  const total = (l) => l.reduce((a, x) => a + x.filas, 0);

  console.log(`  ── Se mueven al centro ─────────────────────── ${total(migrar)} filas`);
  for (const m of migrar) console.log(`     ${String(m.filas).padStart(6)}  ${m.t}`);
  if (!migrar.length) console.log("     (nada)");

  console.log(`\n  ── Necesitan decidir ───────────────────────── ${total(fusion)} filas`);
  for (const f of fusion) {
    console.log(`     ${String(f.filas).padStart(6)}  ${f.t}  → ${f.choque}${f.choques.length ? `  (${f.choques.length} chocan)` : ""}`);
    console.log(`             ${f.nota}`);
    for (const c of f.choques.slice(0, 6)) console.log(`             · ${c}`);
    if (f.choques.length > 6) console.log(`             · y ${f.choques.length - 6} más`);
  }
  if (!fusion.length) console.log("     (nada)");

  console.log(`\n  ── No se tocan, a propósito ────────────────── ${total(intactas)} filas`);
  for (const i of intactas) console.log(`     ${String(i.filas).padStart(6)}  ${i.t}\n             ${i.por}`);
  if (!intactas.length) console.log("     (nada)");

  const desconocidas = migrar.filter((m) => !NO_TOCAR[m.t] && !CON_FUSION[m.t]).map((m) => m.t);
  if (desconocidas.length) {
    console.log(`\n  Tablas descubiertas por la consulta y no clasificadas a mano: ${desconocidas.join(", ")}`);
    console.log("  Se migran como el resto. Si alguna NO debería moverse, añádela a NO_TOCAR.");
  }

  if (!APLICAR) {
    console.log("\n  Nada escrito. Cuando el recuento cuadre:  node tools/juntar-blanes.mjs --aplicar\n");
    await pool.end();
    return;
  }

  // ── Aplicar ───────────────────────────────────────────────────────────────
  console.log("\n  Aplicando…");
  const c = await pool.connect();
  const hecho = [];
  try {
    await c.query("BEGIN");
    for (const m of migrar) {
      const r = await c.query(`UPDATE "${m.t}" SET local = $1 WHERE local = $2`, [CENTRO, BARRA]);
      hecho.push(`${m.t}: ${r.rowCount} movidas`);
    }
    for (const f of fusion) {
      if (f.choque === "descartar") {
        const r = await c.query(`DELETE FROM "${f.t}" WHERE local = $1 AND EXISTS (SELECT 1 FROM "${f.t}" x WHERE x.local = $2)`, [BARRA, CENTRO]);
        const r2 = await c.query(`UPDATE "${f.t}" SET local = $1 WHERE local = $2`, [CENTRO, BARRA]);
        hecho.push(`${f.t}: ${r.rowCount} descartadas (ya había del centro), ${r2.rowCount} movidas`);
      } else if (f.choque === "renombrar") {
        // Primero las que chocan: se quedan con el nombre de su barra delante, porque siguen
        // siendo dos sitios físicos dentro del mismo centro.
        const r = await c.query(
          `UPDATE "${f.t}" a SET nombre = a.nombre || ' (Cooperativa)', local = $1
            WHERE a.local = $2 AND EXISTS (SELECT 1 FROM "${f.t}" b WHERE b.local = $1 AND b.nombre = a.nombre)`,
          [CENTRO, BARRA]);
        const r2 = await c.query(`UPDATE "${f.t}" SET local = $1 WHERE local = $2`, [CENTRO, BARRA]);
        hecho.push(`${f.t}: ${r.rowCount} renombradas, ${r2.rowCount} movidas`);
      } else {
        // «dejar»: las que no chocan sí se mueven; las que chocan se quedan y se avisa, porque
        // fusionarlas solas mezclaría un cuadrante o un proveedor con productos colgando.
        const otras = f.clave.filter((x) => x !== "local");
        const cond = otras.map((x) => `b."${x}" = a."${x}"`).join(" AND ");
        const r = await c.query(
          `UPDATE "${f.t}" a SET local = $1
            WHERE a.local = $2 AND NOT EXISTS (SELECT 1 FROM "${f.t}" b WHERE b.local = $1 AND ${cond})`,
          [CENTRO, BARRA]);
        const quedan = await c.query(`SELECT COUNT(*)::int AS n FROM "${f.t}" WHERE local = $1`, [BARRA]);
        hecho.push(`${f.t}: ${r.rowCount} movidas, ${n(quedan.rows[0]?.n)} SIN TOCAR (chocaban)`);
      }
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(`\n  ✖ Nada se ha guardado (vuelta atrás completa): ${e.message}\n`);
    c.release(); await pool.end();
    process.exit(1);
  }
  c.release();

  console.log("");
  for (const h of hecho) console.log(`     ${h}`);
  console.log("\n  Listo. Vuelve a pasar --contar: lo que quede en «necesitan decidir» es lo que\n  hay que mirar a mano.\n");
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
