// FASE 8B — repetir un turno, y el bug del turno que acaba a medianoche.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planRepetir, resumenPlan, diaSemanaDe } from "../../src/modules/horarios/repetir.js";

// ── El helper del panel, EXTRAÍDO DEL FICHERO REAL ───────────────────────────
// No es una copia: se lee `app.js` y se evalúa la función tal cual está escrita. Una copia
// se queda vieja el día que alguien toque el original, y entonces el test pasa mintiendo.
const app = readFileSync("public/panel/app.js", "utf8");
function trozo(desde) {
  const i = app.indexOf(desde);
  assert.ok(i >= 0, `no se encuentra «${desde}» en app.js`);
  // Se corta en el `};` que cierra la función, contando llaves: buscar el primer `;` parte
  // por la mitad las que llevan un `return a ? b : c;` dentro.
  let n = 0, visto = false;
  for (let k = i; k < app.length; k++) {
    if (app[k] === "{") { n++; visto = true; }
    else if (app[k] === "}") { n--; if (visto && n === 0) return app.slice(i, k + 2); }
  }
  throw new Error(`no se cierra «${desde}»`);
}
const horFinMin = new Function(
  `${trozo("const horMin = ")}\n${trozo("const horFinMin = ")}\nreturn horFinMin;`)();

describe("EL BUG: «un turno de 4 horas da error»", () => {
  // No era la duración. Un `<input type="time">` no sabe decir «24:00», así que quien ponía
  // 20:00–00:00 —cuatro horas justas— mandaba `fin_min: 0`; el servidor veía la salida antes
  // que la entrada y contestaba «El horario no es válido», sin decir por qué.
  test("20:00–00:00 son cuatro horas, no menos veinte", () => {
    assert.equal(horFinMin("20:00", "00:00"), 1440);
    assert.equal(horFinMin("20:00", "00:00") - 1200, 240, "cuatro horas");
  });

  test("y las cuatro horas que NO cruzan medianoche seguían funcionando", () => {
    // Esto demuestra que el bug nunca fue «4 horas»: tres de los cuatro casos iban bien.
    assert.equal(horFinMin("08:00", "12:00"), 720);
    assert.equal(horFinMin("12:00", "16:00"), 960);
    assert.equal(horFinMin("16:00", "20:00"), 1200);
  });

  test("23:00–03:00 también cruza, y es el turno de noche de siempre", () => {
    assert.equal(horFinMin("23:00", "03:00"), 1620);
    assert.equal(horFinMin("23:00", "03:00") - 1380, 240);
  });

  test("el modelo ya lo contemplaba: `fin_min` llega a 2160 justamente para esto", () => {
    const esquema = readFileSync("src/modules/horarios/schema.js", "utf8");
    assert.match(esquema, /CHECK \(fin_min >= inicio_min AND fin_min <= 2160\)/);
    assert.ok(horFinMin("23:00", "03:00") <= 2160);
  });

  test("duraciones de 1 a 10 horas, todas válidas", () => {
    const casos = [["11:00", "12:00", 60], ["11:00", "13:00", 120], ["11:00", "14:00", 180],
                   ["16:00", "20:00", 240], ["11:00", "16:00", 300], ["11:00", "17:00", 360],
                   ["09:00", "17:00", 480], ["14:00", "00:00", 600]];
    for (const [ent, sal, dur] of casos) {
      const fin = horFinMin(ent, sal);
      const ini = Number(ent.slice(0, 2)) * 60 + Number(ent.slice(3));
      assert.equal(fin - ini, dur, `${ent}–${sal} debería durar ${dur} min`);
      assert.ok(fin >= ini && fin <= 2160, `${ent}–${sal} sale del rango que acepta la base`);
    }
  });

  test("entrar y salir a la misma hora NO se convierte en 24 horas", () => {
    // Sin el freno, 20:00–20:00 pasaría por «cruza medianoche» y crearía un turno de un día
    // entero. Se queda en cero y la pantalla lo rechaza con un mensaje que se entiende.
    assert.equal(horFinMin("20:00", "20:00"), 1200);
    assert.match(app, /El turno tiene que durar algo/);
  });

  test("y el panel manda la salida por ahí, no en crudo", () => {
    assert.match(app, /fin_min: abierto \? \(horMin\(ov\.querySelector\("#hmI"\)\.value\) \+ 360\)\s*\n?\s*: horFinMin\(/);
  });
});

describe("repetir un turno en otros días", () => {
  const turno = { id: 1, worker_id: 7, dia: "2026-08-24", area_id: 10, inicio_min: 960, fin_min: 1440 };
  const persona = { id: 7, nombre: "Carlos", fecha_alta: "2024-01-01", fecha_baja: null };
  const SEM = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"];

  test("el caso de Uriel: lunes 16–00 repetido de martes a viernes", () => {
    const p = planRepetir({ turno, dias: SEM.slice(1, 5), asignaciones: [turno], persona });
    assert.equal(p.ok, true);
    assert.deepEqual(p.aCrear, SEM.slice(1, 5));
    assert.equal(p.duracion, 480, "ocho horas, y cruza medianoche");
  });

  test("el día que ya tiene NO se repite sobre sí mismo", () => {
    const p = planRepetir({ turno, dias: SEM, asignaciones: [turno], persona });
    assert.ok(!p.aCrear.includes("2026-08-24"));
    assert.equal(p.aCrear.length, 6);
  });

  test("SIN DUPLICADOS SILENCIOSOS: si ya lo tiene, se omite y se dice", () => {
    const ya = { ...turno, id: 2, dia: "2026-08-25" };
    const p = planRepetir({ turno, dias: ["2026-08-25", "2026-08-26"], asignaciones: [turno, ya], persona });
    assert.deepEqual(p.aCrear, ["2026-08-26"]);
    assert.equal(p.omitidos, 1);
    assert.match(p.dias[0].motivo, /tiene exactamente ese turno/);
  });

  test("un turno DISTINTO el mismo día no es un duplicado: se crea y se avisa del solape", () => {
    const otro = { id: 3, worker_id: 7, dia: "2026-08-25", area_id: 10, inicio_min: 1200, fin_min: 1500 };
    const p = planRepetir({ turno, dias: ["2026-08-25"], asignaciones: [turno, otro], persona });
    assert.deepEqual(p.aCrear, ["2026-08-25"]);
    assert.match(p.dias[0].motivo, /se pisa con otro turno/);
  });

  test("UNA AUSENCIA NO BLOQUEA: avisa, como al crear a mano", () => {
    // Repetir es una acción manual, y el encargado puede tener motivos. Lo que no puede es
    // no enterarse.
    const p = planRepetir({ turno, dias: ["2026-08-26"], asignaciones: [turno], persona,
      ausencias: [{ worker_id: 7, tipo: "vacaciones", desde: "2026-08-26", hasta: "2026-08-27", estado: "aprobada" }] });
    assert.deepEqual(p.aCrear, ["2026-08-26"]);
    assert.equal(p.conAviso, 1);
    assert.match(p.dias[0].motivo, /vacaciones aprobadas/);
  });

  test("una ausencia SOLICITADA todavía no cuenta", () => {
    const p = planRepetir({ turno, dias: ["2026-08-26"], asignaciones: [turno], persona,
      ausencias: [{ worker_id: 7, tipo: "vacaciones", desde: "2026-08-26", hasta: "2026-08-27", estado: "pendiente" }] });
    assert.equal(p.conAviso, 0);
  });

  test("la disponibilidad declarada también avisa", () => {
    // Martes = dow 1 (0 es lunes). Con el desplazamiento que había, este aviso salía el día
    // de al lado y nadie se enteraba.
    const p = planRepetir({ turno, dias: ["2026-08-25"], asignaciones: [turno], persona,
      disponibilidad: [{ worker_id: 7, dow: 1, inicio_min: 900, fin_min: 1200, preferencia: "no_disponible" }] });
    assert.match(p.dias[0].motivo, /ha dicho que no puede/);
    assert.deepEqual(p.aCrear, ["2026-08-25"], "pero se crea igual: lo decide una persona");
  });

  test("«prefiere no» se dice distinto de «no puede»", () => {
    const p = planRepetir({ turno, dias: ["2026-08-25"], asignaciones: [turno], persona,
      disponibilidad: [{ worker_id: 7, dow: 1, inicio_min: 900, fin_min: 1200, preferencia: "prefiere" }] });
    assert.match(p.dias[0].motivo, /prefiere no trabajar/);
  });

  test("NO ESTAR EN PLANTILLA sí bloquea: no es una excepción que nadie pueda decidir", () => {
    const p = planRepetir({ turno, dias: ["2026-08-28", "2026-08-29"], asignaciones: [turno],
      persona: { ...persona, fecha_baja: "2026-08-28" } });
    assert.deepEqual(p.aCrear, ["2026-08-28"], "su último día sí; el siguiente no");
    assert.equal(p.bloqueados, 1);
    assert.match(p.dias[1].motivo, /No estaba en plantilla/);
  });

  test("sin días elegidos no se hace nada, y se dice", () => {
    assert.match(planRepetir({ turno, dias: [], persona }).error, /al menos un día/);
    assert.match(planRepetir({ turno, dias: ["2026-08-24"], persona }).error, /al menos un día/);
  });

  test("el resumen se lee como una frase, no como un volcado", () => {
    const p = planRepetir({ turno, dias: SEM.slice(1, 5), asignaciones: [turno], persona,
      ausencias: [{ worker_id: 7, tipo: "vacaciones", desde: "2026-08-26", hasta: "2026-08-26", estado: "aprobada" }] });
    const r = resumenPlan(p, "Carlos");
    assert.match(r, /Se crearán 4 turnos/);
    assert.match(r, /1 con algo que mirar/);
    assert.match(r, /para Carlos/);
  });

  test("los turnos de OTRA persona no estorban", () => {
    const ajeno = { id: 9, worker_id: 99, dia: "2026-08-25", inicio_min: 960, fin_min: 1440, area_id: 10 };
    const p = planRepetir({ turno, dias: ["2026-08-25"], asignaciones: [turno, ajeno], persona });
    assert.deepEqual(p.aCrear, ["2026-08-25"]);
    assert.equal(p.dias[0].motivo, null);
  });

  test("EL DÍA DE LA SEMANA SE CUENTA COMO EN EL RESTO DEL SISTEMA: 0 = LUNES", () => {
    // Este test afirmaba «0 = domingo» y protegía la convención EQUIVOCADA, así que pasaba
    // mientras el código miraba el día de al lado. La convención real es la del solver:
    // `diasSemana(lunes)[0]` es el lunes, y el panel guarda la disponibilidad con el índice
    // de la lista Lunes…Domingo.
    assert.equal(diaSemanaDe("2026-08-24"), 0, "lunes");
    assert.equal(diaSemanaDe("2026-08-25"), 1, "martes");
    assert.equal(diaSemanaDe("2026-08-26"), 2, "miércoles");
    assert.equal(diaSemanaDe("2026-08-30"), 6, "domingo");
    assert.equal(diaSemanaDe("nada"), -1);
  });

  test("y coincide con el índice que usa el solver para las necesidades", async () => {
    const { diasSemana } = await import("../../src/modules/horarios/tiempo.js");
    const dias = diasSemana("2026-08-24");
    for (let dow = 0; dow < 7; dow++) {
      assert.equal(diaSemanaDe(dias[dow]), dow, `desalineado en dow ${dow}`);
    }
  });

  test("un turno partido: se repite EL TRAMO elegido, no el día entero", () => {
    // Prioridad decidida: repetir el turno seleccionado. Copiar el día completo sería otra
    // acción y otra semántica, y mezclarlas hace que nadie sepa qué va a pasar al pulsar.
    const medio = { id: 1, worker_id: 7, dia: "2026-08-24", area_id: 10, inicio_min: 720, fin_min: 960 };
    const noche = { id: 2, worker_id: 7, dia: "2026-08-24", area_id: 10, inicio_min: 1200, fin_min: 1440 };
    const p = planRepetir({ turno: medio, dias: ["2026-08-25"], asignaciones: [medio, noche], persona });
    assert.deepEqual(p.aCrear, ["2026-08-25"]);
    assert.equal(p.duracion, 240, "solo el tramo de mediodía");
  });
});

describe("la semana se abre sola", () => {
  const server = readFileSync("server.js", "utf8");
  test("poner el primer turno crea el borrador si no existe", () => {
    assert.match(server, /async function horSemanaParaEscribir\(req, \{ semana_id, local, lunes \}\)/);
    assert.match(server, /horSemanaParaEscribir\(req, \{ semana_id, local: req\.body\?\.local, lunes: req\.body\?\.lunes \}\)/);
  });
  test("pero NO abre un borrador a escondidas sobre una semana publicada", () => {
    const f = server.slice(server.indexOf("async function horSemanaParaEscribir"), server.indexOf("app.post(\"/api/horarios/asignacion\""));
    assert.match(f, /estado = 'publicado'/);
    assert.match(f, /crea una versión nueva/);
  });
  test("ni sobre una cerrada", () => {
    const f = server.slice(server.indexOf("async function horSemanaParaEscribir"), server.indexOf("app.post(\"/api/horarios/asignacion\""));
    assert.match(f, /estado = 'cerrado'/);
  });
  test("y dos personas a la vez no crean dos semanas", () => {
    const f = server.slice(server.indexOf("async function horSemanaParaEscribir"), server.indexOf("app.post(\"/api/horarios/asignacion\""));
    assert.match(f, /ON CONFLICT DO NOTHING/);
    const esquema = readFileSync("src/modules/horarios/schema.js", "utf8");
    assert.match(esquema, /idx_hor_sem_bor/);
  });
  test("AÑADIR EL PRIMER TURNO NO PUEDE LEER `HOR.semana.id`", () => {
    // El fallo que llegó a producción: `semana_id: HOR.semana.id` estaba DENTRO del literal
    // del cuerpo, y se evaluaba antes del `if (!HOR.semana)` que venía tres líneas después.
    // En una semana vacía eso lanza un TypeError y se lleva por delante el listener entero:
    // pulsar «Añadir» no hacía nada. Ni turno, ni aviso, ni error. Lo peor que puede pasar,
    // porque no hay nada que leer para saber qué ha fallado.
    const i = app.indexOf('ov.querySelector("#hmOk").addEventListener');
    const listener = app.slice(i, app.indexOf("const del = ov.querySelector", i));
    assert.ok(listener.length > 100, "no se encuentra el listener de guardar turno");

    // El acceso va SIEMPRE detrás de la comprobación, en el mismo sitio: un spread condicional.
    assert.match(listener, /\.\.\.\(HOR\.semana \? \{ semana_id: HOR\.semana\.id \} : \{ local: HOR\.local, lunes: HOR\.dias\[0\] \}\)/);
    // Y no queda ningún `HOR.semana.` suelto sin guardar.
    const sinGuarda = listener.replace(/HOR\.semana \? \{ semana_id: HOR\.semana\.id \}/, "");
    assert.ok(!/HOR\.semana\./.test(sinGuarda), "hay otro acceso a HOR.semana sin comprobar que existe");
  });

  test("el cuadrante se pinta aunque no haya semana", () => {
    assert.match(app, /const sinSemana = !HOR\.semana/);
    assert.match(app, /const horEditable = \(\) => !HOR\.semana \|\| HOR\.semana\.estado === "borrador"/);
    assert.ok(!/if \(!HOR\.semana\) return `<button class="btn primary" data-act="hor-crear">/.test(app),
      "sigue el botón «Empezar esta semana» de por medio");
  });
  test("y los tres estados se distinguen", () => {
    assert.match(app, /Sin horario<\/span>/);
    assert.match(app, /Borrador · v\$\{HOR\.semana\.version\}/);
    assert.match(app, /Publicado · v\$\{HOR\.semana\.version\}/);
  });
});

describe("repetir no se salta el aislamiento por local", () => {
  const server = readFileSync("server.js", "utf8");
  const rep = server.slice(server.indexOf('app.post("/api/horarios/asignacion/:id/repetir"'), server.indexOf('app.delete("/api/horarios/asignacion/:id"'));
  test("la semana tiene que ser editable y del local de quien pide", () => {
    assert.match(rep, /horSemanaEditable\(req, t\.semana_id\)/);
  });
  test("y la persona, del local de la semana", () => {
    assert.match(rep, /String\(persona\.local \|\| ""\) !== String\(chk\.semana\.local\)/);
  });
  test("los días tienen que ser de ESA semana", () => {
    assert.match(rep, /diasSemana\(chk\.semana\.lunes\)/);
    assert.match(rep, /Hay días que no son de esta semana/);
  });
  test("y queda auditado", () => {
    assert.match(rep, /ficAuditar\("horario", t\.worker_id, "repetir_turno"/);
  });
});
