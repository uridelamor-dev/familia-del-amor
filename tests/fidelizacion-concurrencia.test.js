// Dos peticiones a la vez sobre la MISMA integración.
//
// EL PATRÓN QUE SE CAZA AQUÍ es `leer → comprobar en JavaScript → UPDATE WHERE id = ?`. Entre la
// lectura y la escritura cabe otra petición, y entonces el `if` de arriba decidió sobre una fila
// que ya no existe tal como se leyó. No falla, no da error: escribe encima.
//
// LO QUE SE ROMPERÍA EN CADA CASO:
//
//   activar sobre revocada   → `activo = true` en una fila revocada. El panel enseña «revocada»
//                              igual, así que nadie lo ve; pero la fila queda mintiendo y la ruta
//                              externa mira `activo`.
//   activar sobre caducada   → lo mismo, con un token que ya no debería resolver.
//   dos confirmaciones       → la segunda pisa el Workplace de la primera. Un vínculo puesto solo
//                              se deshace revocando, así que pisarlo es grave.
//   dos revocaciones         → dos líneas de auditoría para una sola revocación. Una es mentira.
//
// LA REGLA: la condición viaja DENTRO del `WHERE`, y se comprueba si el UPDATE tocó algo. Como
// `dbRun` devuelve `rows[0]`, la forma de saberlo es `RETURNING id`: la fila o `undefined`, que es
// exactamente un `rowCount = 0`.
//
// Estos tests se hacen sobre el SQL real —leyendo `server.js`— y sobre una base de mentira que
// simula el cruce: no hay PostgreSQL en este entorno, pero la condición que lo protege sí se puede
// comprobar entera.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const trozo = (a, b) => server.slice(server.indexOf(a), server.indexOf(b));

const activo = trozo('app.post("/api/fidelizacion/integracion/:id/activo"',
                     'app.post("/api/fidelizacion/integracion/:id/revocar"');
const revocar = trozo('app.post("/api/fidelizacion/integracion/:id/revocar"',
                      'app.get("/api/fidelizacion/integracion/:id/workplace-observado"');
const wpOk = trozo('app.post("/api/fidelizacion/integracion/:id/workplace"',
                   'app.get("/api/fidelizacion/facturas", requireAuth');

const AHORA = "2026-09-14T12:00:00Z";

/**
 * Una `fid_integraciones` de mentira que aplica el WHERE de verdad.
 *
 * No reproduce PostgreSQL: reproduce las CUATRO condiciones que protegen estas rutas, que es lo
 * que hay que poder probar. `onAntes` es el hueco por donde se cuela la otra petición, justo entre
 * el SELECT y el UPDATE.
 */
function baseFalsa(fila) {
  const f = { ...fila };
  return {
    fila: f,
    select: () => ({ ...f }),
    /** Activar: `id = ? AND revocado_en IS NULL AND (caduca_en IS NULL OR caduca_en > ?)`. */
    activar(ahora) {
      if (f.revocado_en) return undefined;
      if (f.caduca_en !== null && !(String(f.caduca_en) > String(ahora))) return undefined;
      f.activo = true;
      f.activada_en = f.activada_en ?? ahora;
      return { id: f.id };
    },
    /** Desactivar: `id = ? AND revocado_en IS NULL`, sellando solo si estaba activa. */
    desactivar(ahora) {
      if (f.revocado_en) return undefined;
      const estaba = f.activo;
      f.activo = false;
      f.activada_en = f.activada_en ?? (estaba ? ahora : null);
      return { id: f.id };
    },
    /** Revocar: `id = ? AND revocado_en IS NULL`. */
    revocar(ahora, quien) {
      if (f.revocado_en) return undefined;
      f.revocado_en = ahora; f.revocado_por = quien;
      return { id: f.id };
    },
    /** Confirmar: `id = ? AND revocado_en IS NULL AND workplace_confirmado_en IS NULL`. */
    confirmar(wid, wnombre, ahora, quien) {
      if (f.revocado_en) return undefined;
      if (f.workplace_confirmado_en) return undefined;
      f.workplace_id = wid; f.workplace_nombre = wnombre;
      f.workplace_confirmado_en = ahora; f.workplace_confirmado_por = quien;
      return { id: f.id };
    },
  };
}

const viva = () => baseFalsa({ id: 1, local: "La Tapeta - Lloret", token_hash: "no-se-toca",
  token_pista: "••••SgMs", activo: false, activada_en: null, revocado_en: null, revocado_por: null,
  caduca_en: "2099-01-01T00:00:00Z", workplace_id: null, workplace_nombre: null,
  workplace_confirmado_en: null, workplace_confirmado_por: null });

describe("la condición va DENTRO del WHERE, no en un if de arriba", () => {
  test("activar exige no revocada y no caducada, en el propio SQL", () => {
    assert.match(activo, /WHERE id = \? AND revocado_en IS NULL AND \(caduca_en IS NULL OR caduca_en > \?\)/);
    assert.match(activo, /RETURNING id/);
  });

  test("desactivar exige no revocada, en el propio SQL", () => {
    const desac = activo.slice(activo.indexOf("SET activo = FALSE"));
    assert.match(desac, /WHERE id = \? AND revocado_en IS NULL/);
    assert.match(desac, /RETURNING id/);
  });

  test("confirmar exige no revocada y sin confirmar, en el propio SQL", () => {
    assert.match(wpOk, /WHERE id = \? AND revocado_en IS NULL AND workplace_confirmado_en IS NULL/);
    assert.match(wpOk, /RETURNING id/);
  });

  test("revocar exige que siga sin revocar, en el propio SQL", () => {
    assert.match(revocar, /WHERE id = \? AND revocado_en IS NULL RETURNING id/);
  });

  test("las CUATRO comprueban que el UPDATE tocó algo", () => {
    for (const [nombre, r] of [["activo", activo], ["revocar", revocar], ["confirmar", wpOk]]) {
      assert.match(r, /const tocada = await dbRun\(|let tocada;/, `${nombre} no recoge el resultado`);
      assert.match(r, /if \(!tocada\)/, `${nombre} no comprueba si tocó algo`);
      // Y si no tocó nada, 409 — nunca un `ok: true`.
      const i = r.indexOf("if (!tocada)");
      assert.match(r.slice(i, i + 240), /res\.status\(409\)/, `${nombre} no contesta 409`);
    }
  });

  test("el SELECT previo ya NO decide: solo dice si existe y de qué local es", () => {
    // Si volviera un `if (fila.revocado_en) return 409` antes del UPDATE, no sería un fallo — pero
    // sí lo sería que fuese la ÚNICA comprobación. Esto fija que la del SQL está.
    assert.ok(activo.indexOf("WHERE id = ? AND revocado_en IS NULL") > activo.indexOf("const fila = await dbGet"),
      "la comprobación de revocada no está en el UPDATE");
  });
});

describe("revocada entre el SELECT y el UPDATE", () => {
  test("no se activa, y la fila no queda activa", () => {
    const db = viva();
    const leida = db.select();                 // ── la ruta lee: no revocada, se puede activar
    assert.equal(leida.revocado_en, null);
    db.revocar(AHORA, "otra_peticion");        // ── otra petición revoca AQUÍ
    const r = db.activar(AHORA);               // ── la ruta escribe

    assert.equal(r, undefined, "ha activado una integración revocada");
    assert.equal(db.fila.activo, false, "la fila ha quedado activa estando revocada");
    assert.equal(db.fila.revocado_en, AHORA);
  });

  test("tampoco se desactiva ni se sella una revocada", () => {
    const db = viva();
    db.fila.activo = true;
    db.select();
    db.revocar(AHORA, "otra_peticion");
    assert.equal(db.desactivar(AHORA), undefined);
    assert.equal(db.fila.activo, true, "ha tocado una fila revocada");
    assert.equal(db.fila.activada_en, null, "ha sellado una fila revocada");
  });
});

describe("caducada entre el SELECT y el UPDATE", () => {
  test("no se activa una integración cuya fecha ha pasado", () => {
    const db = viva();
    db.select();
    db.fila.caduca_en = "2020-01-01T00:00:00Z";   // caducó mientras tanto
    assert.equal(db.activar(AHORA), undefined, "ha activado una caducada");
    assert.equal(db.fila.activo, false);
  });

  test("caducar justo en el instante tampoco activa", () => {
    // `caduca_en > ahora`: igual NO vale, como en `estadoIntegracion` (`<=` es caducada).
    const db = viva();
    db.fila.caduca_en = AHORA;
    assert.equal(db.activar(AHORA), undefined);
  });

  test("sin fecha de caducidad sí se activa", () => {
    const db = viva();
    db.fila.caduca_en = null;
    assert.deepEqual(db.activar(AHORA), { id: 1 });
    assert.equal(db.fila.activo, true);
  });
});

describe("dos confirmaciones de Workplace a la vez", () => {
  test("gana una; la segunda no sobrescribe nada", () => {
    const db = viva();
    db.select();                                        // ── petición A lee: sin confirmar
    db.select();                                        // ── petición B lee: sin confirmar también

    const a = db.confirmar("WP-7", "Barra", AHORA, "direccion");
    const b = db.confirmar("WP-9", "Otra", AHORA, "direccion");

    assert.deepEqual(a, { id: 1 }, "la primera no ha confirmado");
    assert.equal(b, undefined, "la segunda ha pasado");
    assert.equal(db.fila.workplace_id, "WP-7", "la segunda ha pisado a la primera");
    assert.equal(db.fila.workplace_nombre, "Barra");
  });

  test("y una confirmación sobre algo revocado por el camino no entra", () => {
    const db = viva();
    db.select();
    db.revocar(AHORA, "otra");
    assert.equal(db.confirmar("WP-7", "Barra", AHORA, "direccion"), undefined);
    assert.equal(db.fila.workplace_id, null);
  });

  test("la segunda contesta 409 con el mensaje de siempre", () => {
    const i = wpOk.indexOf("if (!tocada)");
    assert.match(wpOk.slice(i, i + 300), /Ya tiene un Workplace confirmado/);
  });
});

describe("dos revocaciones a la vez", () => {
  test("solo una cambia la fila", () => {
    const db = viva();
    const a = db.revocar(AHORA, "direccion");
    const b = db.revocar("2026-09-14T12:00:01Z", "direccion");
    assert.deepEqual(a, { id: 1 });
    assert.equal(b, undefined, "la segunda ha vuelto a revocar");
    assert.equal(db.fila.revocado_en, AHORA, "la segunda ha pisado la fecha de la primera");
  });

  test("y solo una audita: la auditoría va DESPUÉS de comprobar", () => {
    const iComprueba = revocar.indexOf("if (!tocada)");
    const iAudita = revocar.indexOf("ficAuditar(");
    assert.ok(iComprueba > 0 && iAudita > iComprueba,
      "se audita antes de saber si se ha revocado: quedarían dos revocaciones y una sería mentira");
  });
});

describe("rowCount = 0 nunca responde éxito", () => {
  test("en las tres rutas, el 409 va ANTES de cualquier ok: true", () => {
    for (const [nombre, r] of [["activo", activo], ["revocar", revocar], ["confirmar", wpOk]]) {
      const i409 = r.indexOf("if (!tocada)");
      const iOk = r.lastIndexOf("res.json({ ok: true");
      assert.ok(i409 > 0, `${nombre}: no comprueba`);
      assert.ok(iOk > i409, `${nombre}: contesta ok antes de comprobar`);
    }
  });

  test("y la auditoría también va después", () => {
    for (const [nombre, r] of [["activo", activo], ["revocar", revocar], ["confirmar", wpOk]]) {
      assert.ok(r.indexOf("ficAuditar(") > r.indexOf("if (!tocada)"),
        `${nombre}: audita una operación que puede no haber ocurrido`);
    }
  });

  test("el mensaje de conflicto no cuenta por dentro qué pasó", () => {
    const i = activo.indexOf("if (!tocada)");
    const msg = activo.slice(i, i + 300);
    assert.match(msg, /La integración ha cambiado de estado/);
    for (const dentro of ["revocad", "caducad", "rowCount", "UPDATE"]) {
      assert.ok(!msg.includes(dentro), `el mensaje cuenta el motivo: ${dentro}`);
    }
  });
});

describe("el token de Lloret sobrevive a todo esto", () => {
  test("ninguna de las cuatro escribe token_hash, token_pista, caduca_en ni local", () => {
    const sets = [...server.matchAll(/UPDATE fid_integraciones SET ([\s\S]*?)\s*WHERE/g)]
      .map((m) => m[1].replace(/\s+/g, " ").trim());
    assert.equal(sets.length, 5, "ha cambiado el número de UPDATE sobre fid_integraciones");
    for (const s of sets) {
      for (const intocable of ["token_hash", "token_pista", "caduca_en", "local ="]) {
        assert.ok(!s.includes(intocable), `un UPDATE escribe ${intocable}: ${s}`);
      }
    }
  });

  test("el cruce de peticiones no toca el token en ningún camino", () => {
    const db = viva();
    db.fila.activo = true;
    db.select();
    db.revocar(AHORA, "otra");
    db.activar(AHORA); db.desactivar(AHORA); db.confirmar("WP-1", "X", AHORA, "d");
    assert.equal(db.fila.token_hash, "no-se-toca");
    assert.equal(db.fila.token_pista, "••••SgMs");
    assert.equal(db.fila.caduca_en, "2099-01-01T00:00:00Z");
  });
});
