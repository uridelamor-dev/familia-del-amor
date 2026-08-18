// FASE 7 — periodos laborales contra un Postgres de verdad.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { conEsquema, disponible, motivoSalto } from "../helpers/pgtmp.js";
import { ensureSchemaHorarios } from "../../src/modules/horarios/schema.js";
import { ensureSchemaFichajes } from "../../src/modules/fichajes/schema.js";
import { enPeriodo, antiguedadActual, motivoNoRecontratar } from "../../src/modules/rrhh/periodos.js";

const HAY_BD = await disponible();
const LOCAL = "Blanes";

describe("periodos laborales (Postgres real)", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db, W;
  const per = (w) => db.all(`SELECT id, worker_id, local, fecha_alta, fecha_baja FROM rrhh_periodos WHERE worker_id = ? ORDER BY fecha_alta`, [w]);
  const migrar = () => db.run(
    `INSERT INTO rrhh_periodos (worker_id, local, fecha_alta, fecha_baja, creado_en, creado_por)
     SELECT u.id, u.local, u.fecha_alta, u.fecha_baja, 'x', 'migracion' FROM users u
      WHERE u.rol IN ('trabajador','encargado') AND u.fecha_alta IS NOT NULL AND u.fecha_alta <> ''
        AND (u.fecha_baja IS NULL OR u.fecha_baja >= u.fecha_alta)
        AND NOT EXISTS (SELECT 1 FROM rrhh_periodos p WHERE p.worker_id = u.id)`);

  before(async () => {
    db = await conEsquema();
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, username TEXT UNIQUE, rol TEXT, nombre TEXT, local TEXT,
      fecha_alta TEXT, fecha_baja TEXT, activo INTEGER DEFAULT 1)`);
    await ensureSchemaHorarios(db);
    await ensureSchemaFichajes(db);
    W = (await db.run(`INSERT INTO users (username, rol, nombre, local, fecha_alta, fecha_baja) VALUES ('juan','trabajador','Juan',?, '2022-02-01','2024-09-30') RETURNING id`, [LOCAL])).id;
  });
  after(async () => { if (db) await db.fin(); });

  test("el esquema se aplica dos veces sin romperse", async () => {
    await ensureSchemaFichajes(db);
    const c = await db.all(`SELECT column_name FROM information_schema.columns
                             WHERE table_schema = ? AND table_name = 'rrhh_periodos'`, [db.esquema]);
    const n = c.map((x) => x.column_name);
    for (const x of ["worker_id", "local", "fecha_alta", "fecha_baja", "motivo_baja"]) assert.ok(n.includes(x));
    for (const x of ["horas_semana", "salario"]) assert.ok(!n.includes(x), `el periodo guarda ${x}, que es del contrato`);
  });

  test("LA MIGRACIÓN crea la etapa a partir de la ficha", async () => {
    await migrar();
    const p = await per(W);
    assert.equal(p.length, 1);
    assert.equal(p[0].fecha_alta, "2022-02-01");
    assert.equal(p[0].fecha_baja, "2024-09-30");
    assert.equal(p[0].local, LOCAL);
  });

  test("y repetirla NO duplica: es lo que corre en cada arranque", async () => {
    await migrar(); await migrar();
    assert.equal((await per(W)).length, 1);
  });

  test("A QUIEN NO TIENE FECHA DE ALTA NO SE LE INVENTA NINGUNA", async () => {
    const sin = (await db.run(`INSERT INTO users (username, rol, nombre, local) VALUES ('ana','trabajador','Ana',?) RETURNING id`, [LOCAL])).id;
    const rara = (await db.run(`INSERT INTO users (username, rol, nombre, local, fecha_alta, fecha_baja) VALUES ('leo','trabajador','Leo',?, '2024-05-01','2023-01-01') RETURNING id`, [LOCAL])).id;
    await migrar();
    assert.equal((await per(sin)).length, 0, "se le ha inventado una fecha");
    assert.equal((await per(rara)).length, 0, "con la baja antes del alta tampoco");
    const u = await db.get(`SELECT fecha_alta FROM users WHERE id = ?`, [sin]);
    assert.equal(u.fecha_alta, null, "y su ficha sigue igual");
  });

  test("RECONTRATAR abre una segunda etapa sin tocar la primera", async () => {
    const antes = await per(W);
    assert.equal(motivoNoRecontratar(antes, "2026-03-15"), null);
    await db.run(`INSERT INTO rrhh_periodos (worker_id, local, fecha_alta, fecha_baja, creado_en, creado_por)
                  VALUES (?, 'Lloret', '2026-03-15', NULL, 'x', 'direccion')`, [W]);
    await db.run(`UPDATE users SET fecha_alta = '2026-03-15', fecha_baja = NULL, activo = 1, local = 'Lloret' WHERE id = ?`, [W]);

    const p = await per(W);
    assert.equal(p.length, 2);
    assert.equal(p[0].fecha_baja, "2024-09-30", "la primera etapa sigue intacta");
    assert.equal(p[0].local, LOCAL, "y con su establecimiento de entonces");
    assert.equal(p[1].local, "Lloret");
  });

  test("EN 2025 NO TRABAJABA AQUÍ, y ahora se puede contestar", async () => {
    const p = await per(W);
    assert.equal(enPeriodo(p, "2023-06-01"), true);
    assert.equal(enPeriodo(p, "2025-06-01"), false);
    assert.equal(enPeriodo(p, "2026-08-18"), true);
  });

  test("y la antigüedad es la de la etapa de ahora", async () => {
    const a = antiguedadActual(await per(W), "2026-08-18");
    assert.equal(a.desde, "2026-03-15");
    assert.equal(a.texto, "5 meses");
  });

  test("DOS ETAPAS ABIERTAS: lo corta la BASE, no solo el código", async () => {
    // Dos peticiones de recontratar a la vez pasan las dos la comprobación previa. Sin el
    // índice único, la antigüedad dependería de cuál se leyera primero.
    await assert.rejects(
      () => db.run(`INSERT INTO rrhh_periodos (worker_id, local, fecha_alta, creado_en) VALUES (?, 'Lloret', '2026-07-01', 'x')`, [W]),
      /duplicate|unique/i);
    assert.equal((await per(W)).length, 2);
  });

  test("una etapa que acaba antes de empezar se rechaza", async () => {
    await assert.rejects(
      () => db.run(`INSERT INTO rrhh_periodos (worker_id, fecha_alta, fecha_baja, creado_en) VALUES (999, '2026-05-01','2026-01-01','x')`),
      /check|constraint/i);
  });

  test("volver ANTES de haberse ido se rechaza en el código", async () => {
    const otro = (await db.run(`INSERT INTO users (username, rol, nombre, local, fecha_alta, fecha_baja) VALUES ('eva','trabajador','Eva',?, '2023-01-01','2025-06-30') RETURNING id`, [LOCAL])).id;
    await migrar();
    const p = await per(otro);
    assert.match(motivoNoRecontratar(p, "2025-06-30"), /tiene que ser posterior/);
    assert.equal(motivoNoRecontratar(p, "2025-07-01"), null);
  });

  test("el diagnóstico ve a quien no tiene ninguna etapa, sin corregirlo", async () => {
    const r = await db.get(`SELECT COUNT(*)::int AS n FROM users u WHERE u.rol IN ('trabajador','encargado')
                             AND NOT EXISTS (SELECT 1 FROM rrhh_periodos p WHERE p.worker_id = u.id)`);
    assert.equal(Number(r.n), 2, "Ana y Leo, los dos no migrables");
  });

  test("y los solapes de un histórico ya existente", async () => {
    await db.run(`INSERT INTO rrhh_periodos (worker_id, fecha_alta, fecha_baja, creado_en) VALUES (555, '2022-01-01','2024-12-31','x')`);
    await db.run(`INSERT INTO rrhh_periodos (worker_id, fecha_alta, fecha_baja, creado_en) VALUES (555, '2024-06-01','2025-01-01','x')`);
    const r = await db.get(`SELECT COUNT(*)::int AS n FROM rrhh_periodos a JOIN rrhh_periodos b
                              ON b.worker_id = a.worker_id AND b.id > a.id
                             WHERE (a.fecha_baja IS NULL OR b.fecha_alta <= a.fecha_baja)
                               AND (b.fecha_baja IS NULL OR a.fecha_alta <= b.fecha_baja)`);
    assert.equal(Number(r.n), 1);
  });

  test("la configuración operativa se guarda por establecimiento", async () => {
    await db.run(`INSERT INTO hor_config (local) VALUES (?) ON CONFLICT DO NOTHING`, [LOCAL]);
    await db.run(`INSERT INTO hor_config (local) VALUES ('Lloret') ON CONFLICT DO NOTHING`);
    await db.run(`UPDATE hor_config SET tolerancia_bolsa_min = 15, dia_inicio_periodo = 21 WHERE local = ?`, [LOCAL]);
    const a = await db.get(`SELECT tolerancia_bolsa_min, dia_inicio_periodo FROM hor_config WHERE local = ?`, [LOCAL]);
    const b = await db.get(`SELECT tolerancia_bolsa_min, dia_inicio_periodo FROM hor_config WHERE local = 'Lloret'`);
    assert.equal(Number(a.tolerancia_bolsa_min), 15);
    assert.equal(Number(b.tolerancia_bolsa_min), 10, "el otro establecimiento no se ha tocado");
    assert.equal(Number(b.dia_inicio_periodo), 1);
  });

  test("y cambiarla NO recalcula ningún saldo ya registrado", async () => {
    await db.run(`INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, dif_min, tolerancia_min, autor, creado_en)
                  VALUES (?,?, '2026-08-10','2026-08','jornada',15,'k1',25,10,'encargado','x')`, [W, LOCAL]);
    await db.run(`UPDATE hor_config SET tolerancia_bolsa_min = 5 WHERE local = ?`, [LOCAL]);
    const m = await db.get(`SELECT minutos, tolerancia_min FROM fic_bolsa_movimientos WHERE clave_idem = 'k1'`);
    assert.equal(Number(m.minutos), 15, "el saldo sigue diciendo lo que decía");
    assert.equal(Number(m.tolerancia_min), 10, "y con la franquicia que se le aplicó entonces");
  });
});
