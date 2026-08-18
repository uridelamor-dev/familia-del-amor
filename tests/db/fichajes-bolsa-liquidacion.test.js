// FASE 5 — el circuito de liquidación contra un Postgres de verdad.
//
// Lo que aquí se comprueba no se puede comprobar de memoria: que el CHECK ampliado acepta
// los conceptos nuevos SIN rechazar ninguna fila vieja, que la clave de idempotencia
// convierte el doble clic en un no-op de verdad, y que un movimiento no se puede deshacer
// dos veces ni aunque dos peticiones pasen a la vez la comprobación previa.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { conEsquema, disponible, motivoSalto } from "../helpers/pgtmp.js";
import { ensureSchemaFichajes } from "../../src/modules/fichajes/schema.js";
import { ensureSchemaHorarios } from "../../src/modules/horarios/schema.js";
import { movimientosParaJornada, saldoDe } from "../../src/modules/fichajes/bolsa.js";

const HAY_BD = await disponible();
const LOCAL = "Blanes";

describe("liquidar la bolsa (Postgres real)", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db;
  const mov = (p = {}) => db.run(
    `INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, referencia_id, nota, autor, creado_en, dif_min, tolerancia_min, fecha_efectiva, saldo_antes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (clave_idem) DO NOTHING RETURNING id`,
    [p.worker ?? 1, LOCAL, p.dia ?? "2026-08-10", p.periodo ?? "2026-08", p.concepto ?? "jornada",
     p.minutos ?? 0, p.clave, p.ref ?? null, p.nota ?? null, p.autor ?? "direccion", "2026-08-18T10:00:00+02:00",
     p.dif ?? null, p.tol ?? null, p.efectiva ?? null, p.antes ?? null]);
  const saldo = async (w = 1) =>
    Number((await db.get(`SELECT COALESCE(SUM(minutos),0)::int AS s FROM fic_bolsa_movimientos WHERE worker_id = ?`, [w])).s);

  before(async () => {
    db = await conEsquema();
    await db.run(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT, rol TEXT, nombre TEXT, local TEXT)`);
    await ensureSchemaHorarios(db);
    await ensureSchemaFichajes(db);
  });
  after(async () => { if (db) await db.fin(); });

  test("el esquema se aplica dos veces seguidas sin romperse", async () => {
    // Es lo que hace `initDB` en cada arranque. Rehacer el CHECK tiene que ser idempotente
    // o el segundo despliegue del día se cae.
    await ensureSchemaFichajes(db);
    await ensureSchemaFichajes(db);
    const cols = await db.all(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = ? AND table_name = 'fic_bolsa_movimientos' ORDER BY column_name`, [db.esquema]);
    const nombres = cols.map((c) => c.column_name);
    for (const c of ["dif_min", "tolerancia_min", "fecha_efectiva", "saldo_antes"]) {
      assert.ok(nombres.includes(c), `falta la columna ${c}`);
    }
    assert.ok(!nombres.includes("saldo"), "no existe ninguna columna `saldo`");
  });

  test("y la franquicia queda configurada por local, con 10 por defecto", async () => {
    await db.run(`INSERT INTO hor_config (local) VALUES (?) ON CONFLICT DO NOTHING`, [LOCAL]);
    const c = await db.get(`SELECT tolerancia_bolsa_min, tolerancia_min FROM hor_config WHERE local = ?`, [LOCAL]);
    assert.equal(Number(c.tolerancia_bolsa_min), 10);
    assert.equal(Number(c.tolerancia_min), 10, "y la de incidencias sigue existiendo aparte");
  });

  test("LOS CONCEPTOS VIEJOS SIGUEN ENTRANDO: el CHECK se amplió, no se cambió", async () => {
    // La garantía de la migración. Si el CHECK nuevo rechazara alguno de los antiguos,
    // el ALTER habría fallado al validar las filas que ya hay en producción.
    for (const c of ["jornada", "ajuste", "contra", "liquidacion", "arrastre"]) {
      await mov({ concepto: c, minutos: 0, clave: `viejo-${c}` });
    }
    const n = await db.get(`SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos WHERE clave_idem LIKE 'viejo-%'`);
    assert.equal(Number(n.n), 5);
  });

  test("y los nuevos también", async () => {
    for (const c of ["pago", "compensacion", "reversion"]) {
      await mov({ concepto: c, minutos: 0, clave: `nuevo-${c}` });
    }
    const n = await db.get(`SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos WHERE clave_idem LIKE 'nuevo-%'`);
    assert.equal(Number(n.n), 3);
  });

  test("un concepto inventado se rechaza", async () => {
    await assert.rejects(() => mov({ concepto: "cobro_al_trabajador", clave: "malo" }), /check|constraint/i);
  });

  test("EL DOBLE CLIC NO PAGA DOS VECES", async () => {
    await mov({ worker: 2, concepto: "jornada", minutos: 455, clave: "j-w2" });
    assert.equal(await saldo(2), 455);

    const ficha = "pago:2:abc12345";
    const primera = await mov({ worker: 2, concepto: "pago", minutos: -455, clave: ficha, antes: 455 });
    const segunda = await mov({ worker: 2, concepto: "pago", minutos: -455, clave: ficha, antes: 455 });

    assert.ok(primera?.id, "la primera escribe");
    assert.equal(segunda, undefined, "la segunda no escribe nada");
    assert.equal(await saldo(2), 0, "no se ha pagado dos veces");
    const n = await db.get(`SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos WHERE worker_id = 2 AND concepto = 'pago'`);
    assert.equal(Number(n.n), 1);
  });

  test("dos sesiones distintas SÍ son dos operaciones: por eso hace falta el bloqueo", async () => {
    // Con fichas distintas la clave no las une, y es correcto: son dos pagos que alguien
    // ha pedido a propósito. Lo que impide que las dos vacíen el mismo saldo es el
    // `SELECT ... FOR UPDATE` del endpoint, no la clave.
    await mov({ worker: 3, concepto: "jornada", minutos: 300, clave: "j-w3" });
    await mov({ worker: 3, concepto: "pago", minutos: -300, clave: "pago:3:sesionA" });
    const otra = await mov({ worker: 3, concepto: "pago", minutos: -300, clave: "pago:3:sesionB" });
    assert.ok(otra?.id, "la base no lo impide sola");
    assert.equal(await saldo(3), -300, "y ese es justo el descuadre que evita el bloqueo");
  });

  test("UN MOVIMIENTO NO SE PUEDE DESHACER DOS VECES, y lo garantiza la base", async () => {
    await mov({ worker: 4, concepto: "jornada", minutos: 240, clave: "j-w4" });
    const pago = await mov({ worker: 4, concepto: "pago", minutos: -240, clave: "pago:4:x1" });
    assert.equal(await saldo(4), 0);

    await mov({ worker: 4, concepto: "reversion", minutos: 240, clave: `reversion:${pago.id}`, ref: pago.id, nota: "no se llegó a pagar" });
    assert.equal(await saldo(4), 240, "las horas vuelven");

    // Dos pestañas a la vez: las dos pasan la comprobación en memoria y las dos insertan.
    // La clave `reversion:<id>` corta la segunda, y el índice único corta cualquier otra
    // que llegara con una clave distinta.
    const repe = await mov({ worker: 4, concepto: "reversion", minutos: 240, clave: `reversion:${pago.id}`, ref: pago.id });
    assert.equal(repe, undefined);
    await assert.rejects(
      () => mov({ worker: 4, concepto: "reversion", minutos: 240, clave: "otra-clave-distinta", ref: pago.id }),
      /duplicate|unique/i, "el índice único no está protegiendo la referencia");
    assert.equal(await saldo(4), 240, "no se han devuelto 480");
  });

  test("el pago original SIGUE en el libro después de deshacerlo", async () => {
    const filas = await db.all(
      `SELECT concepto, minutos FROM fic_bolsa_movimientos WHERE worker_id = 4 ORDER BY id`);
    assert.deepEqual(filas.map((f) => f.concepto), ["jornada", "pago", "reversion"]);
    assert.equal(Number(filas[1].minutos), -240, "el pago no se ha tocado");
  });

  test("SE PUEDE LIQUIDAR SALDO QUE VIENE DE UN PERIODO CERRADO", async () => {
    // Pagar hoy las horas de julio no es revisar julio. Si hiciera falta reabrirlo, habría
    // que reabrir nóminas ya firmadas para poder pagar lo que se debe.
    await db.run(
      `INSERT INTO fic_cierres (local, etiqueta, desde, hasta, cerrado_en, cerrado_por)
       VALUES (?,?,?,?,?,?)`, [LOCAL, "2026-07", "2026-07-01", "2026-07-31", "2026-08-01T09:00:00+02:00", "direccion"]);
    await mov({ worker: 5, concepto: "jornada", minutos: 180, dia: "2026-07-15", periodo: "2026-07", clave: "j-w5-julio" });

    // La liquidación se apunta HOY, en el periodo abierto: no toca ni una fila de julio.
    const liq = await mov({ worker: 5, concepto: "pago", minutos: -180, dia: "2026-08-18", periodo: "2026-08", clave: "pago:5:z" });
    assert.ok(liq?.id);
    assert.equal(await saldo(5), 0);

    const julio = await db.all(`SELECT id, minutos FROM fic_bolsa_movimientos WHERE worker_id = 5 AND periodo = '2026-07'`);
    assert.equal(julio.length, 1, "julio sigue igual");
    assert.equal(Number(julio[0].minutos), 180);
  });

  test("dar de baja a alguien NO le pone la bolsa a cero", async () => {
    await db.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fecha_baja TEXT`);
    await db.run(`INSERT INTO users (id, username, rol, nombre, local) VALUES (6,'juan','trabajador','Juan',?)
                  ON CONFLICT (id) DO NOTHING`, [LOCAL]);
    await mov({ worker: 6, concepto: "jornada", minutos: 750, clave: "j-w6" });
    await db.run(`UPDATE users SET fecha_baja = '2026-08-15' WHERE id = 6`);
    assert.equal(await saldo(6), 750, "+12 h 30 min que se le siguen debiendo");

    const suyo = await db.get(
      `SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos WHERE worker_id = 6`);
    assert.equal(Number(suyo.n), 1, "la baja no ha borrado nada");
  });

  test("y se le puede liquidar después de la baja", async () => {
    await mov({ worker: 6, concepto: "pago", minutos: -750, clave: "pago:6:final", nota: "Liquidación final por baja", antes: 750 });
    assert.equal(await saldo(6), 0);
    const m = await db.get(`SELECT nota, saldo_antes FROM fic_bolsa_movimientos WHERE clave_idem = 'pago:6:final'`);
    assert.match(m.nota, /Liquidaci[oó]n final/);
    assert.equal(Number(m.saldo_antes), 750, "queda constancia de lo que tenía delante quien lo autorizó");
  });

  test("con más de 500 movimientos el saldo sigue saliendo bien tras liquidar", async () => {
    await db.run(
      `INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, autor, creado_en)
       SELECT 7, ?, '2026-08-10', '2026-08', 'jornada', 5, 'w7-' || g, 'sistema', 'x' FROM generate_series(1, 520) g`, [LOCAL]);
    assert.equal(await saldo(7), 2600);
    await mov({ worker: 7, concepto: "pago", minutos: -2600, clave: "pago:7:todo", antes: 2600 });
    assert.equal(await saldo(7), 0, "el LIMIT 500 del listado no puede volver a colarse en el saldo");
    const n = await db.get(`SELECT COUNT(*)::int AS n FROM fic_bolsa_movimientos WHERE worker_id = 7`);
    assert.equal(Number(n.n), 521);
  });

  test("la fecha efectiva se guarda aparte de la de creación, y no la sustituye", async () => {
    await mov({ worker: 8, concepto: "jornada", minutos: 120, clave: "j-w8" });
    await mov({ worker: 8, concepto: "pago", minutos: -120, clave: "pago:8:nomina", efectiva: "2026-08-15" });
    const m = await db.get(`SELECT creado_en, fecha_efectiva FROM fic_bolsa_movimientos WHERE clave_idem = 'pago:8:nomina'`);
    assert.equal(m.fecha_efectiva, "2026-08-15");
    assert.match(m.creado_en, /^2026-08-18/, "la de auditoría es la del registro, y es otra");
  });

  test("EL CAMINO ENTERO: de las jornadas al saldo cero", async () => {
    // El criterio de éxito de la fase, contra la base real y con la franquicia puesta.
    const w = 9, plan = 480;
    const dias = [[ "2026-08-10", 505 ], [ "2026-08-11", 487 ], [ "2026-08-12", 480 ], [ "2026-08-13", 505 ]];
    for (const [dia, val] of dias) {
      const existentes = await db.all(
        `SELECT id, dia, concepto, minutos, clave_idem, referencia_id FROM fic_bolsa_movimientos WHERE worker_id = ? AND dia = ?`, [w, dia]);
      const { insertar } = movimientosParaJornada({
        workerId: w, local: LOCAL, dia, periodo: "2026-08", minPlanificado: plan, minValidado: val,
        toleranciaMin: 10, firma: "f" + dia, existentes, autor: "encargado" });
      for (const m of insertar) await mov({ worker: w, dia, concepto: m.concepto, minutos: m.minutos, clave: m.clave_idem, ref: m.referencia_id, dif: m.dif_min, tol: m.tolerancia_min });
    }
    assert.equal(await saldo(w), 30, "dos días de +15; los de +7 y 0 no apuntan nada");
    const filas = await db.all(`SELECT dia FROM fic_bolsa_movimientos WHERE worker_id = ? ORDER BY id`, [w]);
    assert.equal(filas.length, 2, "el libro no se llena de ceros");

    // Se paga la mitad, se compensa el resto.
    await mov({ worker: w, concepto: "pago", minutos: -15, clave: `pago:${w}:a`, antes: 30 });
    assert.equal(await saldo(w), 15);
    await mov({ worker: w, concepto: "compensacion", minutos: -15, clave: `comp:${w}:a`, antes: 15 });
    assert.equal(await saldo(w), 0);

    // Y años después se puede reconstruir cada minuto.
    const libro = await db.all(
      `SELECT concepto, minutos, dif_min, tolerancia_min FROM fic_bolsa_movimientos WHERE worker_id = ? ORDER BY id`, [w]);
    assert.equal(libro.length, 4);
    assert.equal(saldoDe(libro.map((m) => ({ minutos: Number(m.minutos) }))), 0);
    assert.equal(Number(libro[0].dif_min), 25, "aquel lunes se desvió 25");
    assert.equal(Number(libro[0].tolerancia_min), 10, "y se le perdonaron 10");
    assert.deepEqual(libro.map((m) => m.concepto), ["jornada", "jornada", "pago", "compensacion"]);
  });
});
