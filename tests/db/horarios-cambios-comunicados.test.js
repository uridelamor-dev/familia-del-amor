// El circuito completo de un cambio de horario, contra un Postgres de verdad.
//
// El caso que tiene que funcionar: el encargado mueve el turno de Juan del jueves, publica la
// V2, y Juan entra y lo ve. Marta no se entera de nada porque a ella no le cambia nada.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { conEsquema, disponible, motivoSalto } from "../helpers/pgtmp.js";
import { ensureSchemaHorarios } from "../../src/modules/horarios/schema.js";
import { construirSnapshot, cambiosPorTrabajador } from "../../src/modules/horarios/versiones.js";
import { serializarCanonico, hashCanonico } from "../../src/core/canonico.js";
import { createHash } from "node:crypto";

// `hashCanonico` recibe la función de hash: el módulo es puro y no importa node:crypto.
const sha = (t) => createHash("sha256").update(t).digest("hex");
const hash = (v) => hashCanonico(v, sha);

const HAY_BD = await disponible();
const LOCAL = "La Tapeta - Blanes", OTRO = "La Tapeta - Lloret";
const LUNES = "2026-08-17", JUE = "2026-08-20", SAB = "2026-08-22";
const t = (o) => ({ tipo: "turno", area_id: 10, tramo_id: 20, fin_abierto: false, ...o });

describe("comunicar un cambio de horario (Postgres real)", { skip: HAY_BD ? false : motivoSalto() }, () => {
  let db;
  const EQUIPO = [{ id: 1, nombre: "Juan" }, { id: 2, nombre: "Marta" }];

  before(async () => {
    db = await conEsquema();
    await db.run(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT, rol TEXT, nombre TEXT, local TEXT, activo INTEGER DEFAULT 1, fecha_alta TEXT, fecha_baja TEXT)`);
    await ensureSchemaHorarios(db);
    for (const [id, nombre, local] of [[1, "Juan", LOCAL], [2, "Marta", LOCAL], [3, "Ana", OTRO]]) {
      await db.run(`INSERT INTO users (id, username, rol, nombre, local, fecha_alta) VALUES (?,?,?,?,?,?)`,
        [id, "u" + id, "trabajador", nombre, local, "2020-01-01"]);
    }
  });
  after(async () => { if (db) await db.fin(); });

  /** Publica una versión: crea la semana, guarda su snapshot y escribe las comunicaciones. */
  async function publicar(local, version, asignaciones, equipo = EQUIPO) {
    // El snapshot anterior, leído ANTES de sustituir nada: es contra lo que se compara. Mismo
    // orden que el endpoint real.
    const anterior = await db.get(
      `SELECT p.id, p.version, p.snapshot FROM hor_publicaciones p JOIN hor_semanas s ON s.id = p.semana_id
        WHERE s.local = ? AND s.lunes = ? AND s.estado = 'publicado' ORDER BY p.version DESC LIMIT 1`, [local, LUNES]);
    // Solo puede haber UNA publicada por semana y local (índice único parcial de la Fase 0):
    // la anterior pasa a sustituida antes de insertar la nueva.
    await db.run(`UPDATE hor_semanas SET estado = 'sustituido', sustituido_en = ? WHERE local = ? AND lunes = ? AND estado = 'publicado'`,
      ["x", local, LUNES]);
    const sem = await db.run(
      `INSERT INTO hor_semanas (local, lunes, version, estado, creado_en) VALUES (?,?,?,'publicado',?) RETURNING id`,
      [local, LUNES, version, "x"]);

    const snap = construirSnapshot({ semana: { local, lunes: LUNES, version }, trabajadores: equipo,
      areas: [], tramos: [], asignaciones, ausencias: [], dias: [] });
    const texto = serializarCanonico(snap);
    await db.run(`INSERT INTO hor_publicaciones (semana_id, local, lunes, version, snapshot, hash, publicado_en)
                  VALUES (?,?,?,?,?,?,?)`, [sem.id, local, LUNES, version, texto, hash(snap), `2026-08-1${version}T14:32:00+02:00`]);

    let n = 0;
    if (anterior) {
      for (const c of cambiosPorTrabajador(JSON.parse(anterior.snapshot), snap)) {
        const cuerpo = { worker_id: c.worker_id, lunes: LUNES, local, versionAnterior: anterior.version, versionNueva: version, dias: c.dias };
        const canon = serializarCanonico(cuerpo);
        await db.run(
          `INSERT INTO hor_cambios_comunicados (local, lunes, worker_id, semana_id, publicacion_anterior_id,
             publicacion_nueva_id, version_anterior, version_nueva, diff, hash, publicado_en, creado_en)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (publicacion_nueva_id, worker_id) DO NOTHING`,
          [local, LUNES, c.worker_id, sem.id, anterior.id, sem.id, anterior.version, version, canon,
           hash(cuerpo), `2026-08-1${version}T14:32:00+02:00`, "x"]);
        n++;
      }
    }
    return { semanaId: sem.id, comunicadas: n };
  }

  const V1 = [t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440 }),
              t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 })];

  test("la primera publicación no comunica nada a nadie", async () => {
    const r = await publicar(LOCAL, 1, V1);
    assert.equal(r.comunicadas, 0, "no es un cambio: es el horario");
    assert.equal((await db.all(`SELECT * FROM hor_cambios_comunicados`)).length, 0);
  });

  test("mover el turno de Juan comunica a Juan y solo a Juan", async () => {
    await publicar(LOCAL, 2, [
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 1080, fin_min: 1440 }),   // 16:00 → 18:00
      t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
    ]);
    const filas = await db.all(`SELECT worker_id, version_anterior, version_nueva, diff FROM hor_cambios_comunicados`);
    assert.equal(filas.length, 1);
    assert.equal(Number(filas[0].worker_id), 1);
    assert.equal(Number(filas[0].version_anterior), 1);
    assert.equal(Number(filas[0].version_nueva), 2);
    const d = JSON.parse(filas[0].diff);
    assert.equal(d.dias.length, 1);
    assert.equal(d.dias[0].tipo, "modificado");
    assert.equal(d.dias[0].antes[0].inicio_min, 960);
    assert.equal(d.dias[0].ahora[0].inicio_min, 1080);
  });

  test("varios cambios de la misma persona van en UNA comunicación", async () => {
    await publicar(LOCAL, 3, [
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 1080, fin_min: 1440 }),
      t({ id: 3, worker_id: 1, dia: SAB, inicio_min: 960, fin_min: 1440 }),   // sábado nuevo
      // el de Marta desaparece
    ]);
    const deV3 = await db.all(`SELECT worker_id, diff FROM hor_cambios_comunicados WHERE version_nueva = 3 ORDER BY worker_id`);
    assert.equal(deV3.length, 2, "Juan por el sábado nuevo, Marta porque se queda sin turno");
    const juan = JSON.parse(deV3.find((x) => Number(x.worker_id) === 1).diff);
    assert.equal(juan.dias.length, 1);
    assert.equal(juan.dias[0].tipo, "anadido");
    const marta = JSON.parse(deV3.find((x) => Number(x.worker_id) === 2).diff);
    assert.equal(marta.dias[0].tipo, "quitado");
  });

  test("la comunicación de la V2 sigue existiendo, con su diff intacto", async () => {
    // Es lo que permite contestar dentro de dos años «qué se le comunicó y cuándo».
    const v2 = await db.get(`SELECT diff, hash FROM hor_cambios_comunicados WHERE version_nueva = 2 AND worker_id = 1`);
    const d = JSON.parse(v2.diff);
    assert.equal(d.versionNueva, 2);
    assert.equal(d.dias[0].ahora[0].inicio_min, 1080);
    assert.equal(v2.hash, hash(d), "el hash sigue cuadrando con lo que se guardó");
  });

  test("confirmar la V2 NO confirma la V3", async () => {
    const v2 = await db.get(`SELECT id FROM hor_cambios_comunicados WHERE version_nueva = 2 AND worker_id = 1`);
    const r = await db.run(
      `UPDATE hor_cambios_comunicados SET entendido_en = ?, entendido_por = ?
        WHERE id = ? AND worker_id = ? AND entendido_en IS NULL RETURNING id`,
      ["2026-08-18T15:03:00+02:00", "u1", v2.id, 1]);
    assert.ok(r, "se confirma");
    const pend = await db.all(`SELECT version_nueva FROM hor_cambios_comunicados WHERE worker_id = 1 AND entendido_en IS NULL`);
    assert.deepEqual(pend.map((x) => Number(x.version_nueva)), [3], "la V3 sigue pendiente");
  });

  test("pulsar dos veces no vuelve a escribir", async () => {
    const v2 = await db.get(`SELECT id, entendido_en FROM hor_cambios_comunicados WHERE version_nueva = 2 AND worker_id = 1`);
    const otra = await db.run(
      `UPDATE hor_cambios_comunicados SET entendido_en = ?, entendido_por = ?
        WHERE id = ? AND worker_id = ? AND entendido_en IS NULL RETURNING id`,
      ["2026-09-99T00:00:00+02:00", "u1", v2.id, 1]);
    assert.equal(otra, undefined, "la segunda no toca ninguna fila");
    const ahora = await db.get(`SELECT entendido_en FROM hor_cambios_comunicados WHERE id = ?`, [v2.id]);
    assert.equal(ahora.entendido_en, v2.entendido_en, "y la hora no se mueve");
  });

  test("nadie puede confirmar la de otro", async () => {
    const v3 = await db.get(`SELECT id FROM hor_cambios_comunicados WHERE version_nueva = 3 AND worker_id = 2`);
    const r = await db.run(
      `UPDATE hor_cambios_comunicados SET entendido_en = ?, entendido_por = ?
        WHERE id = ? AND worker_id = ? AND entendido_en IS NULL RETURNING id`,
      ["x", "u1", v3.id, 1]);   // Juan intentando confirmar la de Marta
    assert.equal(r, undefined);
  });

  test("republicar la misma versión no duplica la comunicación", async () => {
    const antes = (await db.all(`SELECT id FROM hor_cambios_comunicados`)).length;
    const sem = await db.get(`SELECT id FROM hor_semanas WHERE version = 3`);
    await db.run(
      `INSERT INTO hor_cambios_comunicados (local, lunes, worker_id, semana_id, publicacion_nueva_id,
         version_nueva, diff, hash, publicado_en, creado_en)
       VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (publicacion_nueva_id, worker_id) DO NOTHING`,
      [LOCAL, LUNES, 1, sem.id, sem.id, 3, "{}", "h", "x", "x"]);
    assert.equal((await db.all(`SELECT id FROM hor_cambios_comunicados`)).length, antes);
  });

  test("una publicación de OTRO local no aparece en la de este", async () => {
    await publicar(OTRO, 1, [t({ id: 9, worker_id: 3, dia: JUE, inicio_min: 480, fin_min: 960 })], [{ id: 3, nombre: "Ana" }]);
    await publicar(OTRO, 2, [t({ id: 9, worker_id: 3, dia: JUE, inicio_min: 600, fin_min: 960 })], [{ id: 3, nombre: "Ana" }]);
    const deBlanes = await db.all(`SELECT worker_id FROM hor_cambios_comunicados WHERE local = ?`, [LOCAL]);
    assert.ok(!deBlanes.some((x) => Number(x.worker_id) === 3), "Ana, de Lloret, se ha colado en Blanes");
    const deLloret = await db.all(`SELECT worker_id FROM hor_cambios_comunicados WHERE local = ?`, [OTRO]);
    assert.deepEqual(deLloret.map((x) => Number(x.worker_id)), [3]);
  });

  test("el resumen del responsable cuadra", async () => {
    const filas = await db.all(
      `SELECT entendido_en FROM hor_cambios_comunicados WHERE local = ? AND lunes = ?`, [LOCAL, LUNES]);
    const entendidos = filas.filter((f) => f.entendido_en).length;
    assert.equal(filas.length, 3, "Juan v2, Juan v3 y Marta v3");
    assert.equal(entendidos, 1);
  });
});
