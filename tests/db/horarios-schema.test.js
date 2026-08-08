import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { ensureSchemaHorarios, sembrarLocal } from "../../src/modules/horarios/schema.js";
import { conEsquema, disponible, motivoSalto } from "../helpers/pgtmp.js";

const HAY_BD = await disponible();
const LOCAL = "La Tapeta - Blanes";
const AHORA = "2026-08-10T09:00:00+02:00";

describe("esquema de horarios (Postgres real)", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db;
  before(async () => { db = await conEsquema(); await ensureSchemaHorarios(db); });
  after(async () => { if (db) await db.fin(); });

  test("se puede aplicar dos veces seguidas sin romper nada", async () => {
    await ensureSchemaHorarios(db);   // idempotente: es lo que hace initDB en cada arranque
    const t = await db.all(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ? ORDER BY table_name`, [db.esquema]
    );
    const nombres = t.map((r) => r.table_name);
    for (const esperada of ["hor_areas", "hor_asignaciones", "hor_ausencias", "hor_config",
      "hor_contratos", "hor_disponibilidad", "hor_necesidades", "hor_plantilla_lineas",
      "hor_plantillas", "hor_publicaciones", "hor_semanas", "hor_tramos"]) {
      assert.ok(nombres.includes(esperada), `falta ${esperada}`);
    }
  });

  test("sembrar un local deja SALA/COCINA y los tres tramos, y no duplica al repetir", async () => {
    await sembrarLocal(db, LOCAL, AHORA);
    await sembrarLocal(db, LOCAL, AHORA);
    const areas = await db.all(`SELECT nombre FROM hor_areas WHERE local = ? ORDER BY orden`, [LOCAL]);
    assert.deepEqual(areas.map((a) => a.nombre), ["SALA", "COCINA"]);
    const tramos = await db.all(`SELECT nombre, inicio_min, fin_min FROM hor_tramos WHERE local = ? ORDER BY orden`, [LOCAL]);
    assert.deepEqual(tramos.map((t) => t.nombre), ["MAÑANA", "TARDE", "FIESTA"]);
    assert.equal(tramos[2].fin_min, 1620, "FIESTA acaba a las 03:00 del día siguiente");
  });

  test("un tramo no puede acabar antes de empezar", async () => {
    await assert.rejects(
      () => db.run(`INSERT INTO hor_tramos (local, nombre, inicio_min, fin_min, creado_en)
                    VALUES (?, 'IMPOSIBLE', 1200, 600, ?)`, [LOCAL, AHORA]),
      /check/i
    );
  });

  test("SOLO PUEDE HABER UNA SEMANA PUBLICADA por local y lunes", async () => {
    const crear = (v, estado) => db.run(
      `INSERT INTO hor_semanas (local, lunes, version, estado, creado_en) VALUES (?, '2026-08-10', ?, ?, ?) RETURNING id`,
      [LOCAL, v, estado, AHORA]
    );
    await crear(1, "publicado");
    await assert.rejects(() => crear(2, "publicado"), /duplicate key|unique/i,
      "dos publicadas a la vez harían imposible saber cuál rige");
    await crear(2, "borrador");                       // un borrador sí convive con la publicada
    await assert.rejects(() => crear(3, "borrador"), /duplicate key|unique/i,
      "dos pestañas abiertas no pueden crear dos borradores");
  });

  test("un estado inventado se rechaza", async () => {
    await assert.rejects(
      () => db.run(`INSERT INTO hor_semanas (local, lunes, version, estado, creado_en)
                    VALUES (?, '2026-09-07', 1, 'casi_publicado', ?)`, [LOCAL, AHORA]),
      /check/i
    );
  });

  test("EL TURNO PARTIDO ES LEGAL: dos turnos el mismo día para la misma persona", async () => {
    const sem = await db.run(
      `INSERT INTO hor_semanas (local, lunes, version, estado, creado_en)
       VALUES (?, '2026-08-17', 1, 'borrador', ?) RETURNING id`, [LOCAL, AHORA]
    );
    const meter = (ini, fin) => db.run(
      `INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, inicio_min, fin_min, creado_en)
       VALUES (?, ?, 7, '2026-08-22', ?, ?, ?) RETURNING id`, [sem.id, LOCAL, ini, fin, AHORA]
    );
    await meter(660, 900);    // 11-15
    await meter(1200, 1560);  // 20-02, cruzando medianoche
    const n = await db.get(`SELECT COUNT(*)::int AS n FROM hor_asignaciones WHERE semana_id = ?`, [sem.id]);
    assert.equal(n.n, 2, "en hostelería partir el turno es lo normal, no un error");
  });

  test("un turno que pase de las 36 h se rechaza", async () => {
    const sem = await db.get(`SELECT id FROM hor_semanas WHERE lunes = '2026-08-17' LIMIT 1`);
    await assert.rejects(
      () => db.run(`INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, inicio_min, fin_min, creado_en)
                    VALUES (?, ?, 7, '2026-08-22', 600, 3000, ?)`, [sem.id, LOCAL, AHORA]),
      /check/i
    );
  });

  test("borrar una semana se lleva sus asignaciones", async () => {
    const sem = await db.get(`SELECT id FROM hor_semanas WHERE lunes = '2026-08-17' LIMIT 1`);
    await db.run(`DELETE FROM hor_semanas WHERE id = ?`, [sem.id]);
    const n = await db.get(`SELECT COUNT(*)::int AS n FROM hor_asignaciones WHERE semana_id = ?`, [sem.id]);
    assert.equal(n.n, 0);
  });

  test("una ausencia no puede acabar antes de empezar", async () => {
    await assert.rejects(
      () => db.run(`INSERT INTO hor_ausencias (worker_id, tipo, desde, hasta, creado_en)
                    VALUES (7, 'vacaciones', '2026-08-20', '2026-08-10', ?)`, [AHORA]),
      /check/i
    );
  });
});
