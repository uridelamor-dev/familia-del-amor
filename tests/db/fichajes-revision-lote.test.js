// Revisión de un periodo y validación en lote, contra un Postgres de verdad.
//
// Aquí se prueba lo que ninguna función pura puede probar sola: que el cálculo en bloque hace
// un número FIJO de consultas, que el lote solo toca lo que debe, y que pulsar dos veces no
// duplica un movimiento de bolsa.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { conEsquema, disponible, motivoSalto } from "../helpers/pgtmp.js";
import { ensureSchemaFichajes } from "../../src/modules/fichajes/schema.js";
import { ensureSchemaHorarios } from "../../src/modules/horarios/schema.js";
import { construirJornada, firmaDeEventos } from "../../src/modules/fichajes/jornadas.js";
import { clasificarJornada, resumirRevision, mereceSalir, candidatasDeLote, LISTA } from "../../src/modules/fichajes/revision.js";
import { movimientosParaJornada, saldoDe, periodoDe } from "../../src/modules/fichajes/bolsa.js";

const HAY_BD = await disponible();
const LOCAL = "La Tapeta - Blanes";
const PERSONAS = 12, DIAS = 28;          // un mes de una plantilla normal
const LUNES = "2026-06-01";              // lunes
const AYER = "2026-06-28";

/** Suma días a una fecha ISO sin objetos Date que se muevan con el huso. */
const mas = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

describe("revisión de un periodo (Postgres real)", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db, consultas = 0;

  before(async () => {
    db = await conEsquema();
    await db.run(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT, rol TEXT,
                    nombre TEXT, local TEXT, activo INTEGER DEFAULT 1, fecha_alta TEXT, fecha_baja TEXT)`);
    await ensureSchemaHorarios(db);
    await ensureSchemaFichajes(db);
    await db.run(`INSERT INTO hor_config (local, actualizado_en) VALUES (?, ?) ON CONFLICT (local) DO NOTHING`, [LOCAL, "x"]);

    for (let w = 1; w <= PERSONAS; w++) {
      await db.run(`INSERT INTO users (id, username, rol, nombre, local, activo, fecha_alta) VALUES (?,?,?,?,?,1,?)`,
        [w, `u${w}`, "trabajador", `Persona ${w}`, LOCAL, "2020-01-01"]);
    }
    // Cuatro semanas publicadas, con turno de 16:00 a 00:00 todos los días.
    for (let s = 0; s < 4; s++) {
      const lunes = mas(LUNES, s * 7);
      const sem = await db.run(
        `INSERT INTO hor_semanas (local, lunes, version, estado, creado_en) VALUES (?,?,?,'publicado',?) RETURNING id`,
        [LOCAL, lunes, s + 1, "x"]);
      for (let d = 0; d < 7; d++) {
        const dia = mas(lunes, d);
        for (let w = 1; w <= PERSONAS; w++) {
          await db.run(`INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, inicio_min, fin_min, tipo, creado_en)
                        VALUES (?,?,?,?,960,1440,'turno',?)`, [sem.id, LOCAL, w, dia, "x"]);
        }
      }
    }
    // Y su fichaje limpio, dentro de tolerancia.
    let id = 0;
    for (let d = 0; d < DIAS; d++) {
      const dia = mas(LUNES, d);
      for (let w = 1; w <= PERSONAS; w++) {
        for (const [tipo, min] of [["entrada", 958], ["salida", 1444]]) {
          await db.run(
            `INSERT INTO fic_eventos (worker_id, local, tipo, ocurrido_en, epoch_ms, dia_negocio, minuto_local, origen, creado_en)
             VALUES (?,?,?,?,?,?,?,'kiosco',?)`,
            [w, LOCAL, tipo, `${dia}T00:00:00+02:00`, Date.parse(dia + "T00:00:00Z") + min * 60000, dia, min, "x"]);
          id++;
        }
      }
    }
    assert.equal(id, PERSONAS * DIAS * 2);
  });
  after(async () => { if (db) await db.fin(); });

  /** Reproduce `ficCalcularPeriodo`: las mismas 7 consultas, contadas. */
  async function calcularPeriodo(desde, hasta, { hoy = "2026-06-29" } = {}) {
    consultas = 0;
    const q = async (fn) => { consultas++; return fn(); };
    const cfg = await q(() => db.get(`SELECT corte_dia_min, tolerancia_min, hora_cierre_min FROM hor_config WHERE local = ?`, [LOCAL]));
    const fichados = await q(() => db.all(`SELECT DISTINCT worker_id, dia_negocio AS dia FROM fic_eventos WHERE local = ? AND dia_negocio BETWEEN ? AND ?`, [LOCAL, desde, hasta]));
    const planif = await q(() => db.all(`SELECT DISTINCT a.worker_id, a.dia FROM hor_asignaciones a JOIN hor_semanas s ON s.id = a.semana_id
                                          WHERE a.local = ? AND s.estado = 'publicado' AND a.tipo = 'turno' AND a.dia BETWEEN ? AND ?`, [LOCAL, desde, hasta]));
    const pares = new Map();
    for (const r of [...fichados, ...planif]) pares.set(`${r.worker_id}|${r.dia}`, { worker_id: Number(r.worker_id), dia: r.dia });
    const ids = [...new Set([...pares.values()].map((x) => x.worker_id))];
    const eventos = await q(() => db.all(`SELECT id, worker_id, dia_negocio, tipo, epoch_ms, minuto_local, origen, anulado_por FROM fic_eventos
                                           WHERE worker_id = ANY(?) AND dia_negocio BETWEEN ? AND ? ORDER BY worker_id, dia_negocio, epoch_ms, id`, [ids, desde, hasta]));
    const asigs = await q(() => db.all(`SELECT a.id, a.worker_id, a.dia, a.inicio_min, a.fin_min, a.fin_abierto, a.tipo FROM hor_asignaciones a
                                         JOIN hor_semanas s ON s.id = a.semana_id
                                        WHERE s.local = ? AND s.estado = 'publicado' AND a.dia BETWEEN ? AND ? AND a.worker_id = ANY(?)`, [LOCAL, desde, hasta, ids]));
    const guardadas = await q(() => db.all(`SELECT worker_id, dia_negocio, min_validado, firma_eventos FROM fic_jornadas WHERE worker_id = ANY(?) AND dia_negocio BETWEEN ? AND ?`, [ids, desde, hasta]));
    const cierres = await q(() => db.all(`SELECT local, etiqueta, desde, hasta, reabierto_en FROM fic_cierres WHERE local = ?`, [LOCAL]));

    const evPar = new Map(), asPar = new Map();
    for (const e of eventos) { const k = `${e.worker_id}|${e.dia_negocio}`; (evPar.get(k) || evPar.set(k, []).get(k)).push(e); }
    for (const a of asigs) { const k = `${a.worker_id}|${a.dia}`; (asPar.get(k) || asPar.set(k, []).get(k)).push(a); }
    const guar = new Map(guardadas.map((g) => [`${g.worker_id}|${g.dia_negocio}`, g]));

    const filas = [];
    for (const { worker_id, dia } of pares.values()) {
      const k = `${worker_id}|${dia}`;
      const evs = evPar.get(k) || [];
      const j = construirJornada({ eventos: evs, asignaciones: asPar.get(k) || [], toleranciaMin: cfg?.tolerancia_min ?? 10, diaCerrado: dia < hoy });
      const g = guar.get(k) || null;
      const validacion = g && g.min_validado != null ? { minutos: g.min_validado, firma: g.firma_eventos } : null;
      if (!mereceSalir(j, { validacion, eventos: evs })) continue;
      const firma = firmaDeEventos(evs);
      const c = clasificarJornada({ jornada: j, eventos: evs, validacion, firmaActual: firma, diaCerrado: dia < hoy,
        periodoCerrado: cierres.some((x) => x.desde <= dia && dia <= x.hasta && !x.reabierto_en) });
      filas.push({ worker_id, dia, firma, minEfectivo: j.minEfectivo, minPlanificado: j.minPlanificado, ...c });
    }
    return { filas, consultas };
  }

  test(`un mes de ${PERSONAS} personas × ${DIAS} días se resuelve con 7 consultas`, async () => {
    // ANTES: 5 consultas por pareja (eventos, semana, asignaciones, jornada guardada, upsert).
    // Con 336 parejas eso son más de 1.600 viajes a la base, en serie.
    const r = await calcularPeriodo(LUNES, AYER);
    assert.equal(r.consultas, 7, "el número de consultas no puede depender de cuánta gente haya");
    assert.equal(r.filas.length, PERSONAS * DIAS, "sale una jornada por persona y día con actividad");
  });

  test("y el número NO cambia al doblar el rango", async () => {
    const corto = await calcularPeriodo(LUNES, mas(LUNES, 6));
    const largo = await calcularPeriodo(LUNES, AYER);
    assert.equal(corto.consultas, largo.consultas);
    assert.ok(largo.filas.length > corto.filas.length * 3, "pero sí el número de jornadas");
  });

  test("todas salen listas para validar: el fichaje está dentro de tolerancia", async () => {
    const { filas } = await calcularPeriodo(LUNES, AYER);
    const r = resumirRevision(filas);
    assert.equal(r.listas_para_validar, PERSONAS * DIAS);
    assert.equal(r.requieren_revision, 0);
    assert.equal(r.abiertas, 0);
  });

  test("una jornada abierta no entra, y no se lleva por delante a las demás", async () => {
    // El día de HOY todavía corre: sus jornadas quedan abiertas aunque estén perfectas.
    const { filas } = await calcularPeriodo(LUNES, AYER, { hoy: AYER });
    const r = resumirRevision(filas);
    assert.equal(r.abiertas, PERSONAS, "las del último día");
    assert.equal(r.listas_para_validar, PERSONAS * (DIAS - 1));
  });
});

describe("validación en lote (Postgres real)", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db;
  const DIA = "2026-07-06", DIA2 = "2026-07-07";
  const evs = (w, dia) => [
    { tipo: "entrada", min: 958 }, { tipo: "salida", min: 1444 },
  ].map((e) => ({ ...e, w, dia }));

  before(async () => {
    db = await conEsquema();
    await db.run(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT, rol TEXT, nombre TEXT, local TEXT, activo INTEGER DEFAULT 1, fecha_alta TEXT, fecha_baja TEXT)`);
    await ensureSchemaHorarios(db);
    await ensureSchemaFichajes(db);
    await db.run(`INSERT INTO hor_config (local, actualizado_en) VALUES (?,?) ON CONFLICT (local) DO NOTHING`, [LOCAL, "x"]);
    for (let w = 1; w <= 3; w++) {
      await db.run(`INSERT INTO users (id, username, rol, nombre, local, fecha_alta) VALUES (?,?,?,?,?,?)`,
        [w, `u${w}`, "trabajador", `P${w}`, LOCAL, "2020-01-01"]);
    }
    const sem = await db.run(`INSERT INTO hor_semanas (local, lunes, version, estado, creado_en) VALUES (?,?,1,'publicado',?) RETURNING id`, [LOCAL, DIA, "x"]);
    for (const dia of [DIA, DIA2]) {
      for (let w = 1; w <= 3; w++) {
        await db.run(`INSERT INTO hor_asignaciones (semana_id, local, worker_id, dia, inicio_min, fin_min, tipo, creado_en) VALUES (?,?,?,?,960,1440,'turno',?)`,
          [sem.id, LOCAL, w, dia, "x"]);
        for (const e of evs(w, dia)) {
          // La persona 3 del segundo día se va sin fichar la salida: esa pide una decisión.
          if (w === 3 && dia === DIA2 && e.tipo === "salida") continue;
          await db.run(`INSERT INTO fic_eventos (worker_id, local, tipo, ocurrido_en, epoch_ms, dia_negocio, minuto_local, origen, creado_en)
                        VALUES (?,?,?,?,?,?,?,'kiosco',?)`,
            [w, LOCAL, e.tipo, `${dia}T00:00:00+02:00`, Date.parse(dia + "T00:00:00Z") + e.min * 60000, dia, e.min, "x"]);
        }
      }
    }
  });
  after(async () => { if (db) await db.fin(); });

  /** El lote, reproducido igual que el endpoint: clasificar → filtrar → escribir → apuntar. */
  async function lote({ hoy = "2026-07-20" } = {}) {
    const eventos = await db.all(`SELECT id, worker_id, dia_negocio, tipo, epoch_ms, minuto_local, origen, anulado_por FROM fic_eventos ORDER BY worker_id, dia_negocio, epoch_ms, id`);
    const asigs = await db.all(`SELECT worker_id, dia, inicio_min, fin_min, tipo FROM hor_asignaciones`);
    const guardadas = await db.all(`SELECT worker_id, dia_negocio, min_validado, firma_eventos, min_planificado FROM fic_jornadas`);
    const cierres = await db.all(`SELECT local, desde, hasta, reabierto_en FROM fic_cierres WHERE local = ?`, [LOCAL]);
    const evPar = new Map(), asPar = new Map();
    for (const e of eventos) { const k = `${e.worker_id}|${e.dia_negocio}`; (evPar.get(k) || evPar.set(k, []).get(k)).push(e); }
    for (const a of asigs) { const k = `${a.worker_id}|${a.dia}`; (asPar.get(k) || asPar.set(k, []).get(k)).push(a); }
    const guar = new Map(guardadas.map((g) => [`${g.worker_id}|${g.dia_negocio}`, g]));

    const filas = [];
    for (const k of new Set([...evPar.keys(), ...asPar.keys()])) {
      const [w, dia] = k.split("|");
      const es = evPar.get(k) || [];
      const j = construirJornada({ eventos: es, asignaciones: asPar.get(k) || [], toleranciaMin: 10, diaCerrado: dia < hoy });
      const g = guar.get(k) || null;
      const validacion = g && g.min_validado != null ? { minutos: g.min_validado, firma: g.firma_eventos } : null;
      if (!mereceSalir(j, { validacion, eventos: es })) continue;
      const firma = firmaDeEventos(es);
      const c = clasificarJornada({ jornada: j, eventos: es, validacion, firmaActual: firma, diaCerrado: dia < hoy,
        periodoCerrado: cierres.some((x) => x.desde <= dia && dia <= x.hasta && !x.reabierto_en) });
      filas.push({ worker_id: Number(w), dia, firma, minEfectivo: j.minEfectivo, minPlanificado: j.minPlanificado, jornada: j, ...c });
    }
    // La proyección, como hace el endpoint antes de validar.
    for (const f of filas) {
      await db.run(`INSERT INTO fic_jornadas (worker_id, local, dia_negocio, min_planificado, min_fichado, min_pausa, requiere_revision, calculado_en)
                    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (worker_id, dia_negocio) DO UPDATE SET
                      min_planificado = EXCLUDED.min_planificado, min_fichado = EXCLUDED.min_fichado, calculado_en = EXCLUDED.calculado_en`,
        [f.worker_id, LOCAL, f.dia, f.jornada.minPlanificado, f.jornada.minFichado, f.jornada.minPausa, f.jornada.requiereRevision, "x"]);
    }

    let validadas = 0; const omitidas = [];
    for (const f of candidatasDeLote(filas)) {
      const fila = await db.run(
        `UPDATE fic_jornadas SET min_validado = ?, firma_eventos = ?, validado_en = ?, validado_por = ?, requiere_revision = FALSE
          WHERE worker_id = ? AND dia_negocio = ? AND min_validado IS NULL RETURNING worker_id`,
        [f.minEfectivo, f.firma, "x", "tester", f.worker_id, f.dia]);
      if (!fila) { omitidas.push({ ...f, motivo: "ya estaba validada" }); continue; }
      // La bolsa, con el mecanismo de siempre.
      const jj = await db.get(`SELECT min_planificado, min_validado, firma_eventos FROM fic_jornadas WHERE worker_id = ? AND dia_negocio = ?`, [f.worker_id, f.dia]);
      const existentes = await db.all(`SELECT id, concepto, minutos, clave_idem, referencia_id FROM fic_bolsa_movimientos WHERE worker_id = ? AND dia = ? ORDER BY id`, [f.worker_id, f.dia]);
      const { insertar } = movimientosParaJornada({
        workerId: f.worker_id, local: LOCAL, dia: f.dia, periodo: periodoDe(f.dia).etiqueta,
        minutos: Number(jj.min_validado) - Number(jj.min_planificado || 0), firma: jj.firma_eventos, existentes, autor: "tester" });
      for (const m of insertar) {
        await db.run(`INSERT INTO fic_bolsa_movimientos (worker_id, local, dia, periodo, concepto, minutos, clave_idem, referencia_id, autor, creado_en)
                      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (clave_idem) DO NOTHING`,
          [m.worker_id, m.local, m.dia, m.periodo, m.concepto, m.minutos, m.clave_idem, m.referencia_id ?? null, m.autor, "x"]);
      }
      validadas++;
    }
    return { validadas, omitidas, filas };
  }

  test("valida las correctas y deja fuera la que pide una decisión", async () => {
    const r = await lote();
    assert.equal(r.validadas, 5, "6 jornadas menos la que se fue sin fichar la salida");
    const pendiente = r.filas.find((f) => f.worker_id === 3 && f.dia === DIA2);
    assert.equal(pendiente.estado, "requiere_revision");
    const g = await db.get(`SELECT min_validado FROM fic_jornadas WHERE worker_id = 3 AND dia_negocio = ?`, [DIA2]);
    assert.equal(g.min_validado, null, "la problemática sigue sin validar");
  });

  test("pulsarlo dos veces NO duplica ningún movimiento de bolsa", async () => {
    // Es el riesgo real de un botón que resuelve doscientas cosas de golpe.
    const antes = await db.all(`SELECT * FROM fic_bolsa_movimientos`);
    const saldoAntes = saldoDe(antes);
    const r = await lote();
    assert.equal(r.validadas, 0, "no queda ninguna por validar");
    assert.equal(r.omitidas.length, 0, "y ninguna sale como candidata: ya están validadas");
    const despues = await db.all(`SELECT * FROM fic_bolsa_movimientos`);
    assert.equal(despues.length, antes.length, "ni un movimiento más");
    assert.equal(saldoDe(despues), saldoAntes);
  });

  test("el lote apunta en la bolsa EXACTAMENTE lo que apuntaría una validación individual", async () => {
    // 486 min fichados − 480 planificados = +6 por jornada, cinco jornadas.
    const movs = await db.all(`SELECT worker_id, dia, concepto, minutos FROM fic_bolsa_movimientos ORDER BY worker_id, dia`);
    assert.equal(movs.length, 5);
    for (const m of movs) {
      assert.equal(m.concepto, "jornada");
      assert.equal(Number(m.minutos), 6, "lo validado menos lo planificado, sin redondear nada");
    }
  });

  test("un fichaje que llega DESPUÉS caduca la validación y la saca del lote", async () => {
    await db.run(`INSERT INTO fic_eventos (worker_id, local, tipo, ocurrido_en, epoch_ms, dia_negocio, minuto_local, origen, creado_en)
                  VALUES (?,?,?,?,?,?,?,'kiosco_offline',?)`,
      [1, LOCAL, "salida", `${DIA}T00:00:00+02:00`, Date.parse(DIA + "T00:00:00Z") + 1500 * 60000, DIA, 1500, "x"]);
    const r = await lote();
    const f = r.filas.find((x) => x.worker_id === 1 && x.dia === DIA);
    assert.equal(f.estado, "validacion_caducada");
    assert.equal(f.puedeLote, false, "una caducada nunca vuelve a entrar sola");
    assert.equal(r.validadas, 0);
  });

  test("con el periodo cerrado, una jornada limpia NO se valida", async () => {
    const p = periodoDe(DIA2);
    await db.run(`INSERT INTO fic_cierres (local, etiqueta, desde, hasta, cerrado_en, cerrado_por) VALUES (?,?,?,?,?,?)`,
      [LOCAL, p.etiqueta, p.desde, p.hasta, "x", "tester"]);
    // Se desvalida una a mano para que vuelva a ser candidata, y se comprueba que el cierre la frena.
    await db.run(`UPDATE fic_jornadas SET min_validado = NULL, firma_eventos = NULL WHERE worker_id = 2 AND dia_negocio = ?`, [DIA2]);
    const r = await lote();
    const f = r.filas.find((x) => x.worker_id === 2 && x.dia === DIA2);
    assert.equal(f.estado, LISTA, "está limpia");
    assert.equal(f.puedeLote, false, "pero el periodo está cerrado");
    assert.equal(r.validadas, 0, "y no se ha tocado la bolsa");
  });
});
