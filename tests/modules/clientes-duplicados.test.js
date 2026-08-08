import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as DUP from "../../src/modules/clientes/duplicados.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SQL = fs.readFileSync(path.join(RAIZ, "scripts/limpiar-leads-duplicados.sql"), "utf8");
const TODO = [DUP.SQL_GRUPOS, DUP.SQL_A_BORRAR, DUP.SQL_AVISO_CORREO, ...DUP.SQL_APLICAR, ...DUP.SQL_APLICAR_PREFS].join("\n");

describe("duplicados — las reglas que no pueden cambiar sin querer", () => {
  test("se agrupa por los ÚLTIMOS 9 DÍGITOS, igual que el servidor al buscar", () => {
    assert.match(DUP.TEL9("telefono"), /RIGHT\(regexp_replace\(telefono, '\[\^0-9\]', '', 'g'\), 9\)/);
  });

  test("solo entran teléfonos de 9 dígitos o más", () => {
    assert.match(DUP.TIENE_MOVIL("telefono"), />= 9/);
    // Sin esto, todas las fichas con el teléfono vacío se juntarían en una sola persona.
    assert.match(DUP.SQL_GRUPOS, /WHERE LENGTH\(regexp_replace\(COALESCE\(telefono/);
  });

  test("SIEMPRE hay COALESCE en los campos NOT NULL", () => {
    // Si ningún miembro del grupo tiene ese dato, array_agg devuelve NULL y el UPDATE
    // reventaría justo después de haber borrado las otras fichas.
    for (const col of ["nombre", "apellidos", "nacimiento", "poblacion", "correo", "premio"]) {
      assert.match(DUP.SQL_GRUPOS, new RegExp(`COALESCE\\(\\(array_agg\\(${col}`),
        `${col} debe ir envuelto en COALESCE`);
    }
  });

  test("se conserva la ficha MÁS ANTIGUA de cada grupo", () => {
    assert.match(DUP.SQL_GRUPOS, /MIN\(id\)\s+AS conservar/);
    assert.match(DUP.SQL_GRUPOS, /MIN\(creado_en\)/);
  });

  test("y de cada campo, el valor no vacío MÁS RECIENTE", () => {
    assert.match(DUP.SQL_GRUPOS, /ORDER BY COALESCE\(actualizado_en, creado_en\) DESC/);
  });

  test("LA BAJA MANDA: si en alguna fila pidió no recibir, se respeta", () => {
    assert.match(TODO, /MAX\(baja::int\)::boolean/);
  });

  test("un consentimiento real no se pierde por existir otra fila en blanco", () => {
    // Con MIN, alguien que dijo que sí en una ficha y tiene otra recién creada (con el
    // valor por defecto `false`) se quedaría sin el consentimiento que llegó a dar.
    assert.match(TODO, /MAX\(opt_in_wa::int\)::boolean/);
    assert.match(TODO, /MAX\(opt_in_email::int\)::boolean/);
  });

  test("el móvil superviviente queda en formato canónico ('34' + 9 dígitos)", () => {
    // Si no, setMarketingPref no lo encontraría y volvería a insertar una fila: el
    // duplicado reaparecería solo a la primera de cambio.
    assert.match(TODO, /'34' \|\| d/);
    // Y solo para móviles españoles: un +33 francés no se convierte en español.
    assert.match(TODO, /LEFT\(d, 1\) IN \('6', '7', '9'\)/);
  });

  test("NO se borra ni una reserva", () => {
    assert.equal(/DELETE FROM reservas/i.test(TODO), false);
    for (const sql of [...DUP.SQL_APLICAR, ...DUP.SQL_APLICAR_PREFS]) {
      const tablas = [...sql.matchAll(/DELETE FROM (\w+)/gi)].map((m) => m[1]);
      for (const t of tablas) assert.ok(["leads", "marketing_prefs"].includes(t), `no debería borrar de ${t}`);
    }
  });

  test("las fichas que se conservan NUNCA se borran", () => {
    assert.match(DUP.SQL_APLICAR[1], /l\.id <> g\.conservar/);
    assert.match(DUP.SQL_APLICAR_PREFS[1], /mp\.telefono <> p\.conservar/);
  });
});

describe("duplicados — el script de la shell dice lo mismo que el panel", () => {
  // Existen dos caminos para lo mismo (el botón del panel y el .sql para la shell) y ya
  // hubo una divergencia real: el módulo llegó a usar MIN en los opt_in y el script MAX,
  // que es tanto como borrar consentimientos. Estas reglas se comprueban en los dos sitios.
  test("agrupa igual: últimos 9 dígitos y mínimo 9 dígitos", () => {
    assert.match(SQL, /RIGHT\(regexp_replace\(telefono, '\[\^0-9\]', '', 'g'\), 9\)/);
    assert.match(SQL, />= 9/);
  });
  test("conserva igual: la ficha más antigua", () => {
    assert.match(SQL, /MIN\(id\)\s+AS conservar/);
  });
  test("trata el consentimiento igual: MAX en baja y en los opt_in", () => {
    assert.match(SQL, /MAX\(baja\)/);
    assert.match(SQL, /MAX\(opt_in_wa\)/);
    assert.match(SQL, /MAX\(opt_in_email\)/);
  });
  test("hace copia de seguridad antes de tocar nada, en los dos caminos", () => {
    assert.match(SQL, /leads_backup_/);
    assert.match(DUP.SQL_BACKUP("x").join(" "), /CREATE TABLE IF NOT EXISTS leads_backup_x AS SELECT \* FROM leads/);
    assert.match(DUP.SQL_BACKUP("x").join(" "), /marketing_prefs_backup_x/);
  });
});

describe("duplicados — el sufijo de la copia", () => {
  test("es AAAAMMDD_HHMM, para poder ordenarlas de un vistazo", () => {
    assert.equal(DUP.sufijoCopia(new Date(2026, 7, 8, 14, 5)), "20260808_1405");
    assert.equal(DUP.sufijoCopia(new Date(2026, 0, 1, 9, 0)), "20260101_0900");
  });
  test("no genera nunca un nombre de tabla inválido", () => {
    for (const d of [new Date(2026, 11, 31, 23, 59), new Date(2026, 0, 1, 0, 0)]) {
      assert.match("leads_backup_" + DUP.sufijoCopia(d), /^leads_backup_\d{8}_\d{4}$/);
    }
  });
});
