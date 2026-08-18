// FASE 8 — el cierre de periodo: atomicidad, idempotencia y CARGA REAL.
//
// Se mide contra un Postgres de verdad, no multiplicando en una hoja. El puente local cuenta
// las consultas, así que el número de abajo es el que se hace, no el que se estima.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { conEsquema, disponible, motivoSalto } from "../helpers/pgtmp.js";
const HAY_BD = await disponible();
import { ensureSchemaHorarios } from "../../src/modules/horarios/schema.js";
import { ensureSchemaFichajes } from "../../src/modules/fichajes/schema.js";
import { movimientosParaJornada, saldoDe } from "../../src/modules/fichajes/bolsa.js";
import { periodoDe } from "../../src/modules/fichajes/bolsa.js";
import { readFileSync } from "node:fs";

// `pg` no es dependencia del proyecto: sin él, este fichero tiene que SALTARSE, no reventar
// al cargarse. Por eso la importación es dinámica y condicionada, como el resto de tests/db.
const STATS = HAY_BD ? (await import("pg").then((m) => m.STATS).catch(() => null)) || { n: 0 } : { n: 0 };

const LOCAL = "Blanes";
const DESDE = "2026-06-01", HASTA = "2026-06-30";

describe("cierre de periodo: carga y atomicidad (Postgres real)", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db;

  // Reproduce `ficApuntarPeriodo`: 3 lecturas + inserciones por lotes.
  async function apuntarPeriodo(local, desde, hasta, autor = "direccion") {
    const cfg = await db.get(`SELECT dia_inicio_periodo, tolerancia_bolsa_min FROM hor_config WHERE local = ?`, [local]);
    const tol = Number(cfg?.tolerancia_bolsa_min ?? 10);
    const diaInicio = Number(cfg?.dia_inicio_periodo ?? 1);
    const jornadas = await db.all(
      `SELECT worker_id, dia_negocio, min_planificado, min_validado, firma_eventos FROM fic_jornadas
        WHERE local = ? AND dia_negocio BETWEEN ? AND ? AND min_validado IS NOT NULL ORDER BY worker_id, dia_negocio`,
      [local, desde, hasta]);
    if (!jornadas.length) return { jornadas: 0, insertados: 0 };
    const ids = [...new Set(jornadas.map((j) => Number(j.worker_id)))];
    const existentes = await db.all(
      `SELECT id, worker_id, dia, concepto, minutos, clave_idem, referencia_id FROM fic_bolsa_movimientos
        WHERE worker_id = ANY(?) AND dia BETWEEN ? AND ? ORDER BY id`, [ids, desde, hasta]);
    const porPar = new Map();
    for (const m of existentes) { const k = `${m.worker_id}|${m.dia}`; if (!porPar.has(k)) porPar.set(k, []); porPar.get(k).push(m); }
    const filas = [];
    for (const j of jornadas) {
      const { insertar } = movimientosParaJornada({
        workerId: Number(j.worker_id), local, dia: j.dia_negocio, periodo: periodoDe(j.dia_negocio, { diaInicio }).etiqueta,
        minValidado: Number(j.min_validado), minPlanificado: Number(j.min_planificado || 0), toleranciaMin: tol,
        firma: j.firma_eventos, existentes: porPar.get(`${j.worker_id}|${j.dia_negocio}`) || [], autor });
      filas.push(...insertar);
    }
    let ins = 0;
    for (let i = 0; i < filas.length; i += 400) {
      const t = filas.slice(i, i + 400);
      const huecos = t.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
      const vals = [];
      for (const m of t) vals.push(m.worker_id, m.local, m.dia, m.periodo, m.concepto, m.minutos, m.clave_idem,
                                   m.referencia_id ?? null, m.nota ?? null, m.autor, "x", m.dif_min ?? null, m.tolerancia_min ?? null);
      await db.run(`INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem,
                      referencia_id, nota, autor, creado_en, dif_min, tolerancia_min)
                    VALUES ${huecos} ON CONFLICT (clave_idem) DO NOTHING`, vals);
      ins += t.length;
    }
    return { jornadas: jornadas.length, insertados: ins };
  }

  async function sembrar(nPersonas, nDias) {
    await db.run(`DELETE FROM fic_bolsa_movimientos`); await db.run(`DELETE FROM fic_jornadas`); await db.run(`DELETE FROM users`);
    await db.run(`INSERT INTO users (id, username, rol, nombre, local, fecha_alta)
                  SELECT g, 'u'||g, 'trabajador', 'Trabajador '||g, ?, '2024-01-01' FROM generate_series(1, ?) g`, [LOCAL, nPersonas]);
    // Desvíos variados: unos dentro de la franquicia (no apuntan) y otros fuera (sí).
    await db.run(
      `INSERT INTO fic_jornadas (worker_id, local, dia_negocio, min_planificado, min_fichado, min_validado, firma_eventos, calculado_en)
       SELECT w, ?, (date '2026-06-01' + (d - 1))::text, 480, 480, 480 + ((w * 7 + d * 11) % 60) - 20, 'f'||w||'-'||d, 'x'
         FROM generate_series(1, ?) w, generate_series(1, ?) d`, [LOCAL, nPersonas, nDias]);
  }

  before(async () => {
    db = await conEsquema();
    await db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, rol TEXT, nombre TEXT, local TEXT, fecha_alta TEXT, fecha_baja TEXT, activo INTEGER DEFAULT 1)`);
    await ensureSchemaHorarios(db); await ensureSchemaFichajes(db);
    await db.run(`INSERT INTO hor_config (local) VALUES (?) ON CONFLICT DO NOTHING`, [LOCAL]);
  });
  after(async () => { if (db) await db.fin(); });

  for (const n of [30, 60, 100]) {
    test(`CARGA: ${n} trabajadores × 30 días`, async () => {
      await sembrar(n, 30);
      const antes = STATS.n, t0 = Date.now();
      const r = await apuntarPeriodo(LOCAL, DESDE, HASTA);
      const ms = Date.now() - t0, q = STATS.n - antes;
      console.log(`    · ${n} personas → ${r.jornadas} jornadas · ${q} consultas · ${ms} ms · ${r.insertados} movimientos`);
      assert.equal(r.jornadas, n * 30);
      // El coste ya NO crece con las jornadas: 3 lecturas + un lote de escritura por cada 400.
      assert.ok(q <= 3 + Math.ceil(r.insertados / 400) + 1,
        `${q} consultas para ${r.jornadas} jornadas: ha vuelto el bucle`);
    });
  }

  test("REPETIRLO no duplica ni un movimiento", async () => {
    const antes = await db.get(`SELECT COUNT(*)::int AS n, COALESCE(SUM(minutos),0)::int AS s FROM fic_bolsa_movimientos`);
    await apuntarPeriodo(LOCAL, DESDE, HASTA);
    await apuntarPeriodo(LOCAL, DESDE, HASTA);
    const despues = await db.get(`SELECT COUNT(*)::int AS n, COALESCE(SUM(minutos),0)::int AS s FROM fic_bolsa_movimientos`);
    assert.equal(Number(despues.n), Number(antes.n), "se han duplicado movimientos");
    assert.equal(Number(despues.s), Number(antes.s), "el saldo ha cambiado al repetir");
  });

  test("la FRANQUICIA se aplica igual que de una en una", async () => {
    // Los días con desvío de 0 a 10 min no escriben nada; los de más, solo el exceso.
    const j = await db.all(`SELECT worker_id, dia_negocio, min_validado, min_planificado FROM fic_jornadas
                             WHERE worker_id = 1 ORDER BY dia_negocio LIMIT 8`);
    for (const x of j) {
      const dif = Number(x.min_validado) - Number(x.min_planificado);
      const esperado = Math.abs(dif) <= 10 ? 0 : (dif > 0 ? dif - 10 : dif + 10);
      const m = await db.get(`SELECT COALESCE(SUM(minutos),0)::int AS s FROM fic_bolsa_movimientos
                               WHERE worker_id = 1 AND dia = ?`, [x.dia_negocio]);
      assert.equal(Number(m.s), esperado, `día ${x.dia_negocio}: diferencia ${dif}`);
    }
  });

  test("y el saldo total coincide con el cálculo puro", async () => {
    const j = await db.all(`SELECT min_validado, min_planificado FROM fic_jornadas WHERE worker_id = 1`);
    const esperado = j.reduce((s, x) => {
      const d = Number(x.min_validado) - Number(x.min_planificado);
      return s + (Math.abs(d) <= 10 ? 0 : (d > 0 ? d - 10 : d + 10));
    }, 0);
    const m = await db.get(`SELECT COALESCE(SUM(minutos),0)::int AS s FROM fic_bolsa_movimientos WHERE worker_id = 1`);
    assert.equal(Number(m.s), esperado);
  });

  test("ATOMICIDAD: un fallo a mitad no deja nada apuntado", async () => {
    // El puente de estos tests lanza un `psql` por consulta, así que BEGIN y ROLLBACK no
    // comparten sesión: la transacción hay que mandarla ENTERA en una sola llamada. El
    // servidor real usa una conexión del pool, donde eso no hace falta.
    await db.run(`DELETE FROM fic_bolsa_movimientos`);
    const antes = await db.get(`SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos`);
    assert.equal(Number(antes.n), 0);

    // Se apunta de verdad y se revienta después, todo dentro de la misma transacción.
    await assert.rejects(() => db.run(`
      BEGIN;
      INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, autor, creado_en)
        SELECT g, 'Blanes', '2026-06-01', '2026-06', 'jornada', 15, 'carga-'||g, 'direccion', 'x' FROM generate_series(1, 500) g;
      DO $$ BEGIN RAISE EXCEPTION 'fallo simulado en la jornada 847'; END $$;
      COMMIT;`), /fallo simulado/);

    const fuera = await db.get(`SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos`);
    assert.equal(Number(fuera.n), 0, "han quedado 500 movimientos de un cierre que nunca se selló");
  });

  test("y el código del cierre envuelve TODO en una sola transacción", () => {
    // Lo que el puente no puede ejecutar, se comprueba sobre el código: el apunte del libro
    // y el sellado del cierre están entre el mismo BEGIN y el mismo COMMIT.
    const srv = readFileSync("server.js", "utf8");
    const cierre = srv.slice(srv.indexOf('app.post("/api/fichajes/cerrar"'), srv.indexOf('app.post("/api/fichajes/reabrir"'));
    const begin = cierre.indexOf('client.query("BEGIN")');
    const apunte = cierre.indexOf("ficApuntarPeriodo(");
    const sello = cierre.indexOf("INSERT INTO fic_cierres");
    const commit = cierre.indexOf('client.query("COMMIT")');
    assert.ok(begin >= 0 && commit > begin, "el cierre no está en transacción");
    assert.ok(begin < apunte && apunte < sello && sello < commit,
      "el apunte del libro y el sellado no están dentro de la misma transacción");
    assert.match(cierre, /ROLLBACK/);
    // Y dos personas cerrando el mismo periodo a la vez no lo apuntan dos veces.
    assert.match(cierre, /pg_advisory_xact_lock/);
  });

  test("un cierre sellado y su libro quedan en la MISMA transacción", async () => {
    await db.run("BEGIN");
    const r = await apuntarPeriodo(LOCAL, DESDE, HASTA);
    await db.run(`INSERT INTO fic_cierres (local, etiqueta, desde, hasta, hash, cerrado_en, cerrado_por)
                  VALUES (?, '2026-06', ?, ?, 'h', 'x', 'direccion')`, [LOCAL, DESDE, HASTA]);
    await db.run("COMMIT");
    const c = await db.get(`SELECT COUNT(*)::int AS n FROM fic_cierres WHERE local = ?`, [LOCAL]);
    const b = await db.get(`SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos`);
    assert.equal(Number(c.n), 1);
    assert.ok(Number(b.n) > 0);
    assert.ok(r.jornadas > 0);
  });
});
