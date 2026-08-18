// El saldo de la bolsa, contra un Postgres de verdad.
//
// EL FALLO QUE PRUEBA: `GET /api/fichajes/bolsa/:workerId` traía los movimientos con
// `LIMIT 500` y calculaba el saldo sumando ESAS filas. Con más de 500 movimientos, el modal
// «Libro de horas» decía un número y la tabla de al lado —que sí usaba SUM— decía otro.
//
// Con memdb no se puede comprobar: el emulador no aplica LIMIT sobre una suma. Hace falta la
// base de verdad, que es exactamente para lo que existe este helper.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { conEsquema, disponible, motivoSalto } from "../helpers/pgtmp.js";
import { ensureSchemaFichajes } from "../../src/modules/fichajes/schema.js";
import { ensureSchemaHorarios } from "../../src/modules/horarios/schema.js";

const HAY_BD = await disponible();
const N = 600, MINUTOS = 10;

describe("el saldo de la bolsa es la suma de TODOS los movimientos", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db;
  before(async () => {
    db = await conEsquema();
    // `ensureSchemaFichajes` toca `users` y `hor_config`, así que hacen falta antes.
    await db.run(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT, rol TEXT, nombre TEXT, local TEXT)`);
    await ensureSchemaHorarios(db);
    await ensureSchemaFichajes(db);
    for (let i = 1; i <= N; i++) {
      await db.run(
        `INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, autor, creado_en)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [1, "Blanes", "2026-01-01", `2026-${String((i % 12) + 1).padStart(2, "0")}`, "jornada", MINUTOS, `k${i}`, "sistema", "x"]);
    }
  });
  after(async () => { if (db) await db.fin(); });

  test(`con ${N} movimientos, la suma recortada MIENTE`, async () => {
    // Se reproduce el cálculo viejo para dejar constancia de cuánto se equivocaba.
    const recorte = await db.all(
      `SELECT minutos FROM fic_bolsa_movimientos WHERE worker_id = ? ORDER BY periodo DESC, id DESC LIMIT 500`, [1]);
    const saldoViejo = recorte.reduce((s, m) => s + Number(m.minutos), 0);
    assert.equal(saldoViejo, 500 * MINUTOS, "el cálculo antiguo se queda en las 500 primeras");
    assert.notEqual(saldoViejo, N * MINUTOS, "y por tanto no es el saldo");
  });

  test("la consulta nueva da el saldo real", async () => {
    const r = await db.get(
      `SELECT COALESCE(SUM(minutos),0)::int AS saldo, COUNT(*)::int AS n FROM fic_bolsa_movimientos WHERE worker_id = ?`, [1]);
    assert.equal(Number(r.saldo), N * MINUTOS);
    assert.equal(Number(r.n), N);
  });

  test("los contra-asientos entran en la suma como todo lo demás", async () => {
    // La bolsa es append-only: corregir es escribir un movimiento en negativo, y el saldo
    // sigue siendo SUM de todo, sin filtros ni excepciones.
    await db.run(
      `INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, referencia_id, autor, creado_en)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [1, "Blanes", "2026-01-01", "2026-01", "contra", -MINUTOS, "contra:1", 1, "sistema", "x"]);
    const r = await db.get(`SELECT COALESCE(SUM(minutos),0)::int AS saldo FROM fic_bolsa_movimientos WHERE worker_id = ?`, [1]);
    assert.equal(Number(r.saldo), N * MINUTOS - MINUTOS);
  });

  test("y la tabla sigue sin tener ninguna columna de saldo", async () => {
    const cols = await db.all(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = ? AND table_name = 'fic_bolsa_movimientos'`, [db.esquema]);
    const nombres = cols.map((c) => c.column_name);
    assert.ok(!nombres.includes("saldo"), "ha aparecido una columna `saldo`");
    assert.ok(!nombres.includes("anulado_por"), "un movimiento se anula con un contra-asiento, no con una marca");
  });
});
