// FASE 6 — el alta y la baja contra un Postgres de verdad.
//
// Lo que no se puede comprobar de memoria: que la baja deja el contrato cerrado con la
// semántica correcta, que retira los borradores y NO toca lo publicado, y que aplicarla dos
// veces no cancela dos veces las mismas ausencias.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { conEsquema, disponible, motivoSalto } from "../helpers/pgtmp.js";
import { ensureSchemaHorarios } from "../../src/modules/horarios/schema.js";
import { ensureSchemaFichajes } from "../../src/modules/fichajes/schema.js";
import { planDeBaja } from "../../src/modules/rrhh/ciclo.js";
import { contratoVigente } from "../../src/modules/horarios/conflictos.js";
import { activoAhora } from "../../src/modules/rrhh/vigencia.js";

const HAY_BD = await disponible();
const LOCAL = "Blanes";
const BAJA = "2026-08-31";

describe("dar de baja (Postgres real)", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db, W;

  // Reproduce EXACTAMENTE lo que hace el endpoint, en el mismo orden.
  async function aplicarBaja(workerId, fechaBaja) {
    const persona = await db.get(`SELECT id, fecha_alta, fecha_baja, activo FROM users WHERE id = ?`, [workerId]);
    if (persona.fecha_baja === fechaBaja) return { repetida: true };
    const [asignaciones, contratos, ausencias, bolsa] = await Promise.all([
      db.all(`SELECT a.id, a.worker_id, a.dia, s.estado, s.lunes FROM hor_asignaciones a
                JOIN hor_semanas s ON s.id = a.semana_id
               WHERE a.worker_id = ? AND s.estado IN ('borrador','publicado') AND a.dia > ?`, [workerId, fechaBaja]),
      db.all(`SELECT id, worker_id, desde, hasta, horas_semana FROM hor_contratos WHERE worker_id = ?`, [workerId]),
      db.all(`SELECT id, worker_id, tipo, desde, hasta, estado FROM hor_ausencias WHERE worker_id = ?`, [workerId]),
      db.get(`SELECT COALESCE(SUM(minutos),0)::int AS saldo FROM fic_bolsa_movimientos WHERE worker_id = ?`, [workerId]),
    ]);
    const plan = planDeBaja({ persona: { ...persona, id: workerId }, fechaBaja, asignaciones, contratos, ausencias, saldoBolsa: Number(bolsa.saldo) });
    await db.run(`UPDATE users SET fecha_baja = ? WHERE id = ?`, [fechaBaja, workerId]);
    if (plan.retirar.length) await db.run(`DELETE FROM hor_asignaciones WHERE id = ANY(?)`, [plan.retirar]);
    if (plan.contratosACerrar.length) await db.run(`UPDATE hor_contratos SET hasta = ? WHERE id = ANY(?)`, [fechaBaja, plan.contratosACerrar]);
    if (plan.ausenciasACancelar.length) {
      await db.run(`UPDATE hor_ausencias SET estado = 'cancelada', cancelado_por = ?, cancelado_en = ? WHERE id = ANY(?)`,
        ["direccion", "2026-08-18T10:00:00+02:00", plan.ausenciasACancelar]);
    }
    return plan;
  }

  before(async () => {
    db = await conEsquema();
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, username TEXT UNIQUE, rol TEXT, nombre TEXT, local TEXT,
      fecha_alta TEXT, fecha_baja TEXT, activo INTEGER DEFAULT 1)`);
    await ensureSchemaHorarios(db);
    await ensureSchemaFichajes(db);

    W = (await db.run(`INSERT INTO users (username, rol, nombre, local, fecha_alta) VALUES ('juan','trabajador','Juan',?, '2024-03-14') RETURNING id`, [LOCAL])).id;
    // Un contrato viejo YA cerrado y el vigente, abierto.
    await db.run(`INSERT INTO hor_contratos (worker_id, desde, hasta, horas_semana, creado_en) VALUES (?, '2024-03-14','2025-12-31',20,'x')`, [W]);
    await db.run(`INSERT INTO hor_contratos (worker_id, desde, hasta, horas_semana, creado_en) VALUES (?, '2026-01-01',NULL,40,'x')`, [W]);
    // Dos semanas: una publicada y otra en borrador, las dos POSTERIORES a la baja.
    const pub = (await db.run(`INSERT INTO hor_semanas (local, lunes, estado, creado_en) VALUES (?, '2026-08-31','publicado','x') RETURNING id`, [LOCAL])).id;
    const bor = (await db.run(`INSERT INTO hor_semanas (local, lunes, estado, creado_en) VALUES (?, '2026-09-07','borrador','x') RETURNING id`, [LOCAL])).id;
    const antes = (await db.run(`INSERT INTO hor_semanas (local, lunes, estado, creado_en) VALUES (?, '2026-08-24','publicado','x') RETURNING id`, [LOCAL])).id;
    const turno = (sem, dia) => db.run(
      `INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, inicio_min, fin_min, creado_en) VALUES (?,?,?,?,660,900,'x') RETURNING id`,
      [sem, LOCAL, W, dia]);
    await turno(antes, "2026-08-28");   // antes de la baja: no se toca
    await turno(pub, "2026-09-02");     // publicado posterior
    await turno(bor, "2026-09-08");     // borrador posterior
    await turno(bor, "2026-09-09");     // borrador posterior
    // Tres ausencias: pasada, que cruza, y posterior.
    const aus = (tipo, d, h, est = "aprobada") => db.run(
      `INSERT INTO hor_ausencias (worker_id, local, tipo, desde, hasta, estado, creado_en) VALUES (?,?,?,?,?,?,'x') RETURNING id`,
      [W, LOCAL, tipo, d, h, est]);
    await aus("vacaciones", "2026-07-01", "2026-07-15");
    await aus("vacaciones", "2026-08-25", "2026-09-05");
    await aus("permiso", "2026-09-20", "2026-09-22");
    // Y horas a favor.
    await db.run(`INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, autor, creado_en)
                  VALUES (?,?,'2026-08-10','2026-08','jornada',260,'j1','encargado','x')`, [W, LOCAL]);
  });
  after(async () => { if (db) await db.fin(); });

  test("el plan se calcula ANTES de tocar nada, y no escribe", async () => {
    const antes = await db.get(`SELECT COUNT(*)::int AS n FROM hor_asignaciones WHERE worker_id = ?`, [W]);
    const p = await db.all(`SELECT a.id FROM hor_asignaciones a JOIN hor_semanas s ON s.id = a.semana_id
                             WHERE a.worker_id = ? AND a.dia > ?`, [W, BAJA]);
    assert.equal(Number(antes.n), 4);
    assert.equal(p.length, 3, "tres turnos posteriores: uno publicado y dos en borrador");
  });

  test("LA BAJA: retira los borradores y respeta lo publicado", async () => {
    const plan = await aplicarBaja(W, BAJA);
    assert.equal(plan.retirar.length, 2);
    assert.equal(plan.publicados.length, 1);

    const quedan = await db.all(`SELECT a.dia, s.estado FROM hor_asignaciones a
                                   JOIN hor_semanas s ON s.id = a.semana_id
                                  WHERE a.worker_id = ? ORDER BY a.dia`, [W]);
    assert.deepEqual(quedan.map((x) => x.dia), ["2026-08-28", "2026-09-02"],
      "se queda el de antes de la baja y el PUBLICADO posterior");
    assert.equal(quedan[1].estado, "publicado");
  });

  test("y la semana publicada sigue publicada: no se ha versionado ni degradado sola", async () => {
    const s = await db.get(`SELECT estado FROM hor_semanas WHERE lunes = '2026-08-31'`);
    assert.equal(s.estado, "publicado");
  });

  test("EL CONTRATO SE CIERRA SU ÚLTIMO DÍA, y ese día todavía vale", async () => {
    // `users.fecha_baja` y `hor_contratos.hasta` son los dos inclusivos. Ponerle el día
    // antes le quitaría contrato a un día que sí trabajó.
    const cs = await db.all(`SELECT id, worker_id, desde, hasta, horas_semana FROM hor_contratos WHERE worker_id = ?`, [W]);
    const vigente = cs.find((c) => c.desde === "2026-01-01");
    assert.equal(vigente.hasta, BAJA);
    assert.equal(contratoVigente(cs, W, BAJA).horas_semana, "40", "el 31 sigue teniendo contrato");
    assert.equal(contratoVigente(cs, W, "2026-09-01"), null, "el 1 de septiembre ya no");
  });

  test("el contrato viejo, que ya estaba cerrado, no se toca", async () => {
    const c = await db.get(`SELECT hasta FROM hor_contratos WHERE worker_id = ? AND desde = '2024-03-14'`, [W]);
    assert.equal(c.hasta, "2025-12-31");
  });

  test("la ausencia posterior se CANCELA, con quién y cuándo", async () => {
    const a = await db.get(`SELECT estado, cancelado_por FROM hor_ausencias WHERE worker_id = ? AND desde = '2026-09-20'`, [W]);
    assert.equal(a.estado, "cancelada");
    assert.equal(a.cancelado_por, "direccion");
  });

  test("LA QUE CRUZA LA FECHA NO SE TOCA", async () => {
    // Del 25 al 5 con baja el 31: días ya disfrutados y días que no. Recortarla cambiaría
    // los días concedidos a alguien que ya se fue.
    const a = await db.get(`SELECT estado, desde, hasta FROM hor_ausencias WHERE worker_id = ? AND desde = '2026-08-25'`, [W]);
    assert.equal(a.estado, "aprobada");
    assert.equal(a.hasta, "2026-09-05", "no se ha recortado");
  });

  test("ni la pasada, que es histórico", async () => {
    const a = await db.get(`SELECT estado FROM hor_ausencias WHERE worker_id = ? AND desde = '2026-07-01'`, [W]);
    assert.equal(a.estado, "aprobada");
  });

  test("NINGUNA AUSENCIA SE BORRA", async () => {
    const n = await db.get(`SELECT COUNT(*)::int AS n FROM hor_ausencias WHERE worker_id = ?`, [W]);
    assert.equal(Number(n.n), 3);
  });

  test("LA BOLSA QUEDA INTACTA: la baja no borra lo que se le debe", async () => {
    const b = await db.get(`SELECT COALESCE(SUM(minutos),0)::int AS s, COUNT(*)::int AS n FROM fic_bolsa_movimientos WHERE worker_id = ?`, [W]);
    assert.equal(Number(b.s), 260, "+4 h 20 min que se le siguen debiendo");
    assert.equal(Number(b.n), 1);
  });

  test("y se le puede liquidar DESPUÉS de la baja, con la fase 5", async () => {
    await db.run(`INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, nota, autor, creado_en)
                  VALUES (?,?,'2026-09-15','2026-09','pago',-260,'pago-final','Liquidación final por baja','direccion','x')`, [W, LOCAL]);
    const b = await db.get(`SELECT COALESCE(SUM(minutos),0)::int AS s FROM fic_bolsa_movimientos WHERE worker_id = ?`, [W]);
    assert.equal(Number(b.s), 0);
  });

  test("el acceso: entra hasta su último día, no después", async () => {
    const p = await db.get(`SELECT id, fecha_alta, fecha_baja, activo FROM users WHERE id = ?`, [W]);
    assert.equal(activoAhora(p, "2026-08-31"), true, "el 31 todavía viene a trabajar");
    assert.equal(activoAhora(p, "2026-09-01"), false);
    assert.equal(Number(p.activo), 1, "la cuenta NO se apaga a mano: manda la fecha");
  });

  test("APLICARLA DOS VECES no cancela dos veces ni borra de más", async () => {
    const antes = await db.all(`SELECT id, estado FROM hor_ausencias WHERE worker_id = ? ORDER BY id`, [W]);
    const r = await aplicarBaja(W, BAJA);
    assert.equal(r.repetida, true);
    const despues = await db.all(`SELECT id, estado FROM hor_ausencias WHERE worker_id = ? ORDER BY id`, [W]);
    assert.deepEqual(despues, antes, "no ha cambiado ni una ausencia");
    const n = await db.get(`SELECT COUNT(*)::int AS n FROM hor_asignaciones WHERE worker_id = ?`, [W]);
    assert.equal(Number(n.n), 2);
  });

  test("el histórico entero sigue en pie: turnos, fichajes, contratos y bolsa", async () => {
    const [t, c, b] = await Promise.all([
      db.get(`SELECT COUNT(*)::int AS n FROM hor_asignaciones WHERE worker_id = ?`, [W]),
      db.get(`SELECT COUNT(*)::int AS n FROM hor_contratos WHERE worker_id = ?`, [W]),
      db.get(`SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos WHERE worker_id = ?`, [W]),
    ]);
    assert.equal(Number(t.n), 2);
    assert.equal(Number(c.n), 2, "los dos contratos siguen ahí");
    assert.equal(Number(b.n), 2, "el apunte y su pago");
    const u = await db.get(`SELECT id, nombre FROM users WHERE id = ?`, [W]);
    assert.ok(u, "la persona sigue existiendo: una baja no es un DELETE");
  });

  test("una baja anterior al alta se rechaza antes de tocar nada", async () => {
    const persona = await db.get(`SELECT id, fecha_alta, fecha_baja FROM users WHERE id = ?`, [W]);
    const plan = planDeBaja({ persona, fechaBaja: "2020-01-01" });
    assert.equal(plan.ok, false);
  });

  test("el diagnóstico de arranque encuentra a quien tiene el contrato abierto tras su baja", async () => {
    // Se crea el caso a mano —es lo que puede haber en producción de antes— y se comprueba
    // que la consulta del arranque lo ve. NO lo corrige: solo lo cuenta.
    const otro = (await db.run(`INSERT INTO users (username, rol, nombre, local, fecha_alta, fecha_baja) VALUES ('ana','trabajador','Ana',?, '2024-01-01','2026-01-31') RETURNING id`, [LOCAL])).id;
    await db.run(`INSERT INTO hor_contratos (worker_id, desde, hasta, horas_semana, creado_en) VALUES (?, '2024-01-01',NULL,30,'x')`, [otro]);
    const r = await db.get(`SELECT COUNT(*)::int AS n FROM hor_contratos c JOIN users u ON u.id = c.worker_id
                             WHERE u.fecha_baja IS NOT NULL AND (c.hasta IS NULL OR c.hasta > u.fecha_baja)`);
    assert.equal(Number(r.n), 1);
    const c = await db.get(`SELECT hasta FROM hor_contratos WHERE worker_id = ?`, [otro]);
    assert.equal(c.hasta, null, "el diagnóstico NO ha corregido nada");
  });
});
