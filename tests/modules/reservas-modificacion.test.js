import test from "node:test";
import assert from "node:assert/strict";
import { cambiosDe, validarModificacion, quedaPendiente, CAMBIABLES } from "../../src/modules/reservas/modificacion.js";

const R = { id: 7, local: "La Tapeta - Blanes", personas: 2, dia: "2026-09-10", hora: "21:00", nombre_reserva: "Ana" };
// Lo que manda Sara: todos los campos, con null en los que no cambian.
const nada = { nuevas_personas: null, nueva_hora: null, nuevo_dia: null, nueva_zona: null };

test("cambiar el número de personas", () => {
  const { cambios, hayCambios, resumen } = cambiosDe(R, { ...nada, nuevas_personas: 4 });
  assert.deepEqual(cambios, { personas: 4 });
  assert.equal(hayCambios, true);
  assert.match(resumen, /2 → 4 personas/);
});

test("un valor IGUAL al que ya había no es un cambio", () => {
  // Sin esto, «que sean 2» sobre una reserva de 2 avisaría al local de una modificación que no
  // ha existido, y el equipo dejaría de fiarse de los avisos.
  const { hayCambios } = cambiosDe(R, { ...nada, nuevas_personas: 2, nueva_hora: "21:00", nuevo_dia: "2026-09-10" });
  assert.equal(hayCambios, false);
});

test("sin nada que cambiar, no hay cambios", () => {
  assert.equal(cambiosDe(R, nada).hayCambios, false);
  assert.equal(cambiosDe(R, {}).hayCambios, false);
});

test("varios a la vez, con su resumen", () => {
  const { cambios, resumen } = cambiosDe(R, { ...nada, nuevas_personas: 6, nueva_hora: "20:30", nuevo_dia: "2026-09-12" });
  assert.deepEqual(cambios, { personas: 6, hora: "20:30", dia: "2026-09-12" });
  assert.match(resumen, /6 personas/);
  assert.match(resumen, /20:30/);
  assert.match(resumen, /2026-09-12/);
});

test("la hora se compara sin segundos", () => {
  // La base guarda «21:00» pero podría venir «21:00:00»; no es un cambio.
  assert.equal(cambiosDe({ ...R, hora: "21:00:00" }, { ...nada, nueva_hora: "21:00" }).hayCambios, false);
});

test("una zona que no existe se ignora", () => {
  assert.equal(cambiosDe(R, { ...nada, nueva_zona: "azotea" }).hayCambios, false);
  assert.equal(cambiosDe(R, { ...nada, nueva_zona: "terraza" }).cambios.zona, "terraza");
});

test("no se puede tocar nada fuera de la lista", () => {
  // Un cambio de local o de teléfono no es «modificar»: es otra reserva, o suplantar a alguien.
  const { cambios } = cambiosDe(R, { ...nada, nuevo_local: "Can Mateu - Tordera", nuevo_telefono: "600000000", nuevas_personas: 4 });
  assert.deepEqual(Object.keys(cambios), ["personas"]);
  assert.deepEqual(CAMBIABLES, ["personas", "hora", "dia", "zona"]);
});

test("no se puede mover una reserva al pasado", () => {
  const v = validarModificacion({ reserva: R, cambios: { dia: "2026-08-01" }, hoy: "2026-08-30" });
  assert.equal(v.ok, false);
  assert.equal(v.motivo, "fecha_pasada");
});

test("ni a una hora que ya ha pasado hoy", () => {
  // Mover la de las 21:00 a las 13:00 cuando son las 20:00 no es cambiarla: es perderla.
  const v = validarModificacion({ reserva: { ...R, dia: "2026-08-30" }, cambios: { hora: "13:00" },
    hoy: "2026-08-30", ahoraHHMM: "20:00" });
  assert.equal(v.ok, false);
  assert.equal(v.motivo, "hora_pasada");
});

test("pero más tarde el mismo día sí", () => {
  const v = validarModificacion({ reserva: { ...R, dia: "2026-08-30" }, cambios: { hora: "22:00" },
    hoy: "2026-08-30", ahoraHHMM: "20:00" });
  assert.equal(v.ok, true);
});

test("un día bloqueado se rechaza — la misma regla que al crearla", () => {
  // Si no, bastaría con crear una reserva válida y moverla al día cerrado.
  const v = validarModificacion({ reserva: R, cambios: { dia: "2026-12-25" }, hoy: "2026-08-30", bloqueado: true });
  assert.equal(v.ok, false);
  assert.equal(v.motivo, "bloqueado");
});

test("una hora fuera de franja se avisa, NO se rechaza", () => {
  // Hay comidas de empresa a las 12:00 y cenas de grupo a las 23:00, y el local las acepta.
  const v = validarModificacion({ reserva: R, cambios: { hora: "23:00" }, hoy: "2026-08-30" });
  assert.equal(v.ok, true);
  assert.equal(v.fueraDeFranja, true);
});

test("dentro de franja no avisa de nada", () => {
  assert.equal(validarModificacion({ reserva: R, cambios: { hora: "21:30" }, hoy: "2026-08-30" }).fueraDeFranja, false);
  assert.equal(validarModificacion({ reserva: R, cambios: { hora: "13:00" }, hoy: "2026-08-30" }).fueraDeFranja, false);
});

test("valores imposibles", () => {
  assert.equal(validarModificacion({ reserva: R, cambios: { dia: "mañana" } }).motivo, "fecha_invalida");
  assert.equal(validarModificacion({ reserva: R, cambios: { personas: 0 } }).motivo, "personas_invalidas");
  assert.equal(validarModificacion({ reserva: R, cambios: { personas: 500 } }).motivo, "personas_invalidas");
});

test("subir de 2 a 9 deja la reserva pendiente de visto bueno", () => {
  // El mismo umbral que al crearla: un grupo grande lo confirma el local, no Sara.
  assert.equal(quedaPendiente(8), false);
  assert.equal(quedaPendiente(9), true);
});
