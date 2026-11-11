// Baseline de reservas — invariantes a nivel de datos que NO se deben romper.
// Replica la lógica de los handlers (server.js) contra una BD temporal en memoria.
// No arranca el servidor, WhatsApp ni cron. Debe pasar en verde HOY.
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { openTempDb, crearEsquemaReservas, seedWaLinks } from "./helpers/db.js";

let x;
before(async () => { x = openTempDb(); await crearEsquemaReservas(x); await seedWaLinks(x); });
after(async () => { await x.close(); });
beforeEach(async () => { await x.run("DELETE FROM reservas"); });

async function insertarReserva({ local = "La Tapeta - Blanes", personas = 2, dia = "2026-08-10",
  hora = "21:30", telefono = "600123456", nombre = "Cliente Prueba", zona = "terraza" } = {}) {
  const r = await x.run(
    `INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en, zona)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [local, personas, dia, hora, telefono, nombre, "2026-08-04T10:00:00Z", zona]);
  return r.lastID;
}

describe("Reservas · persistencia", () => {
  test("crear reserva normal guarda todos los campos, incl. zona", async () => {
    const id = await insertarReserva({ personas: 4, zona: "interior" });
    const row = await x.get("SELECT * FROM reservas WHERE id = ?", [id]);
    assert.equal(row.local, "La Tapeta - Blanes");
    assert.equal(row.personas, 4);
    assert.equal(row.zona, "interior");
    assert.equal(row.telefono, "600123456");
  });

  test("reserva de más de 8 personas persiste el número (queda pendiente en runtime)", async () => {
    const id = await insertarReserva({ personas: 12 });
    const row = await x.get("SELECT personas FROM reservas WHERE id = ?", [id]);
    assert.equal(row.personas, 12); // el flag 'pendiente' es de runtime; el dato debe conservarse
  });
});

describe("Reservas · modificación NO es cancelación (regresión clave)", () => {
  test("modificar personas hace UPDATE sobre la MISMA fila y no borra", async () => {
    const id = await insertarReserva({ personas: 2 });
    const antes = await x.all("SELECT id FROM reservas");
    // Réplica del UPDATE de setOnModificarReserva (solo el campo cambiado)
    await x.run("UPDATE reservas SET personas = ? WHERE id = ?", [4, id]);
    const despues = await x.all("SELECT id, personas FROM reservas");
    assert.equal(despues.length, antes.length, "no debe cambiar el número de filas");
    assert.equal(despues[0].id, id, "debe seguir siendo la misma reserva");
    assert.equal(despues[0].personas, 4, "personas actualizado");
  });

  test("modificar hora/día/zona actualiza sin duplicar", async () => {
    const id = await insertarReserva({ hora: "13:00", dia: "2026-08-10", zona: "terraza" });
    await x.run("UPDATE reservas SET hora = ?, dia = ?, zona = ? WHERE id = ?",
      ["21:30", "2026-08-11", "interior", id]);
    const rows = await x.all("SELECT * FROM reservas");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hora, "21:30");
    assert.equal(rows[0].dia, "2026-08-11");
    assert.equal(rows[0].zona, "interior");
  });
});

describe("Reservas · cancelación es DELETE físico", () => {
  test("cancelar elimina la fila", async () => {
    const id = await insertarReserva();
    await x.run("DELETE FROM reservas WHERE id = ?", [id]);
    const row = await x.get("SELECT * FROM reservas WHERE id = ?", [id]);
    assert.equal(row, undefined);
  });
});

describe("Reservas · notifica SOLO al grupo correcto (wa_links)", () => {
  test("cada local resuelve su grupo; Blanes y Cooperativa comparten a propósito", async () => {
    const blanes = await x.get("SELECT group_jid FROM wa_links WHERE local = ?", ["La Tapeta - Blanes"]);
    const coope = await x.get("SELECT group_jid FROM wa_links WHERE local = ?", ["Cooperativa - Blanes"]);
    const lloret = await x.get("SELECT group_jid FROM wa_links WHERE local = ?", ["La Tapeta - Lloret"]);
    assert.equal(blanes.group_jid, "grupo-blanes@g.us");
    assert.equal(coope.group_jid, "grupo-blanes@g.us", "Blanes y Cooperativa comparten grupo");
    assert.equal(lloret.group_jid, "grupo-lloret@g.us");
    assert.notEqual(lloret.group_jid, blanes.group_jid, "Lloret nunca al grupo de Blanes");
  });

  test("un local sin enlace no resuelve grupo (no se notifica a nadie ajeno)", async () => {
    const row = await x.get("SELECT group_jid FROM wa_links WHERE local = ?", ["La Tapa Ibérica - Tordera"]);
    assert.equal(row, undefined);
  });
});

describe("Reservas · bloqueos de fecha", () => {
  test("una fecha dentro del rango bloqueado se detecta; fuera, no", async () => {
    await x.run("INSERT INTO bloqueos_reservas (local, desde, hasta, motivo) VALUES (?, ?, ?, ?)",
      ["La Tapeta - Blanes", "2026-08-09", "2026-08-11", "Fiesta Mayor"]);
    const dentro = await x.get(
      `SELECT 1 AS hit FROM bloqueos_reservas WHERE local = ? AND date(?) BETWEEN date(desde) AND date(hasta)`,
      ["La Tapeta - Blanes", "2026-08-10"]);
    const fuera = await x.get(
      `SELECT 1 AS hit FROM bloqueos_reservas WHERE local = ? AND date(?) BETWEEN date(desde) AND date(hasta)`,
      ["La Tapeta - Blanes", "2026-08-15"]);
    assert.ok(dentro && dentro.hit === 1, "10-ago debe estar bloqueado");
    assert.equal(fuera, undefined, "15-ago no debe estar bloqueado");
  });
});
