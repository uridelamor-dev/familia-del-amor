// Fase 2 — el circuito de ausencias y la disponibilidad del trabajador.
//
// Lo que sujetan estos tests es que pedir unas vacaciones no sea concedérselas, que un
// encargado no pueda tocar el otro local cambiando un id, y que una baja médica no cuente más
// de lo que hace falta para cuadrar una semana.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const trab = readFileSync(new URL("../public/trabajadores.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/trabajadores.html", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/horarios/schema.js", import.meta.url), "utf8");

function bloque(desde, hasta) {
  const i = server.indexOf(desde);
  assert.ok(i > 0, `no se encuentra: ${desde}`);
  const f = server.indexOf(hasta, i + desde.length);
  assert.ok(f > i, `no se encuentra el final: ${hasta}`);
  return server.slice(i, f);
}

describe("el trabajador solo se toca a sí mismo", () => {
  test("el worker_id de una solicitud sale del TOKEN, nunca del cuerpo", () => {
    // Si viniera de fuera, cualquiera pediría vacaciones en nombre de otro.
    const b = bloque('app.post("/api/mis-ausencias"', 'app.post("/api/mis-ausencias/:id/cancelar"');
    assert.match(b, /FROM users WHERE id = \?`, \[req\.user\.id\]/);
    assert.ok(!/req\.body\?\.worker_id|req\.body\.worker_id/.test(b), "el cuerpo puede elegir a quién");
  });

  test("solo ve las suyas", () => {
    const b = bloque('app.get("/api/mis-ausencias"', 'app.post("/api/mis-ausencias"');
    assert.match(b, /WHERE worker_id = \?[\s\S]{0,60}?\[req\.user\.id\]/);
    assert.match(b, /paraTrabajador/, "y filtradas: sin notas internas");
  });

  test("cancelar exige que sea suya, esté pendiente y la hubiera pedido él", () => {
    const b = bloque('app.post("/api/mis-ausencias/:id/cancelar"', 'app.get("/api/mi-disponibilidad"');
    assert.match(b, /WHERE id = \? AND worker_id = \? AND estado = 'pendiente' AND origen = 'solicitada'/);
    assert.ok(!/DELETE FROM hor_ausencias/.test(b), "cancelar no es borrar");
  });

  test("una ya aprobada no la deshace él solo", () => {
    assert.match(bloque('app.post("/api/mis-ausencias/:id/cancelar"', 'app.get("/api/mi-disponibilidad"'),
      /Ya te la han aprobado/);
  });

  test("su disponibilidad también va por el token", () => {
    for (const [a, b2] of [['app.get("/api/mi-disponibilidad"', 'app.put("/api/mi-disponibilidad"'],
                           ['app.put("/api/mi-disponibilidad"', "// ════════════════════════ PULSO"]]) {
      assert.match(bloque(a, b2), /req\.user\.id/);
    }
  });

  test("y queda marcada como escrita por él", () => {
    assert.match(bloque('app.put("/api/mi-disponibilidad"', "// ════════════════════════ PULSO"), /'trabajador'/);
  });
});

describe("nadie resuelve lo suyo", () => {
  test("ni siquiera dirección", () => {
    // Es la única regla de este circuito que no depende del rol.
    const b = bloque('app.post("/api/horarios/ausencia/:id/resolver"', "// Disponibilidad de una persona");
    assert.match(b, /Number\(a\.worker_id\) === Number\(req\.user\.id\)/);
    assert.match(b, /No puedes resolver tu propia solicitud/);
  });
});

describe("aislamiento por establecimiento", () => {
  const RUTAS = [
    ['app.get("/api/horarios/ausencias"', /horLocal\(req, req\.query\.local\)/],
    ['app.post("/api/horarios/ausencia/:id/resolver"', /rrhhPuedeLocal\(req, a\.local_worker/],
    ['app.delete("/api/horarios/ausencia/:id"', /rrhhPuedeLocal\(req, a\.local/],
    ['app.post("/api/horarios/ausencia"', /rrhhPuedeLocal\(req, w\.local/],
  ];
  for (const [ruta, re] of RUTAS) {
    test(`${ruta.split('"')[1]} comprueba el local en el servidor`, () => {
      const i = server.indexOf(ruta);
      assert.ok(i > 0, ruta);
      assert.match(server.slice(i, i + 1200), re);
    });
  }
  test("la bandeja lee el local del TRABAJADOR, no el guardado en la ausencia", () => {
    // `hor_ausencias.local` se copió al crearla y no se mueve si la persona cambia de
    // establecimiento. El JOIN con `users` es el criterio de verdad, igual que en la Fase 0.
    assert.match(bloque('app.get("/api/horarios/ausencias"', "/**\n * Aprobar o rechazar"),
      /JOIN users u ON u\.id = a\.worker_id\s*\n?\s*WHERE u\.local = \?/);
  });
});

describe("una baja médica no cuenta más de lo necesario", () => {
  test("el encargado ve las fechas; la nota interna, no", () => {
    const b = bloque('app.get("/api/horarios/ausencias"', "/**\n * Aprobar o rechazar");
    assert.match(b, /const verSensible = rrhhTodoLocal\(req\)/);
    assert.match(b, /paraResponsable\(a, \{ verSensible \}\)/);
  });
  test("y el trabajador no ve NINGUNA nota interna, ni de lo suyo", () => {
    const m = readFileSync(new URL("../src/modules/rrhh/ausencias.js", import.meta.url), "utf8");
    const i = m.indexOf("export function paraTrabajador(");
    const f = m.indexOf("export function paraResponsable(");
    assert.ok(!/motivo/.test(m.slice(i, f).replace(/\/\/[^\n]*/g, "")), "`motivo` sale hacia el trabajador");
  });
  test("un trabajador no puede autodeclararse una baja", () => {
    assert.match(server, /TIPOS_SOLICITABLES/);
    const m = readFileSync(new URL("../src/modules/rrhh/ausencias.js", import.meta.url), "utf8");
    assert.match(m, /export const TIPOS_SOLICITABLES = \["vacaciones", "permiso", "asuntos_propios"\]/);
  });
});

describe("solo lo aprobado toca el horario", () => {
  test("la rejilla y el PDF filtran por estado", () => {
    // Sin esto, en cuanto alguien PIDE unas vacaciones su nombre saldría en la fila de fiesta
    // marcado como «vacaciones», antes de que nadie se las conceda.
    assert.match(server, /const AUS_DEL_LOCAL = `SELECT[\s\S]{0,220}?a\.estado = 'aprobada'/);
    const pdf = bloque("async function horPdfDeSemana(", "// ── Plantilla del local");
    assert.match(pdf, /FROM hor_ausencias a[\s\S]{0,180}?a\.estado = 'aprobada'/);
  });
  test("el contexto de conflictos, también", () => {
    assert.match(bloque("async function horContexto(", "// Conflictos de una semana"), /a\.estado = 'aprobada'/);
  });
  test("y el generador", () => {
    assert.match(bloque('app.post("/api/horarios/generar"', "// Aceptar la propuesta"),
      /FROM hor_ausencias a JOIN users u ON u\.id = a\.worker_id\s*\n?\s*WHERE u\.local = \? AND a\.estado = 'aprobada'/);
  });
});

describe("aprobar NO toca el cuadrante", () => {
  test("se avisa de los turnos que quedan dentro, y no se borra ninguno", () => {
    const b = bloque("async function horTurnosEnAusencia(", 'app.get("/api/horarios/ausencias"');
    assert.match(b, /turnosDurante\(/);
    assert.ok(!/DELETE FROM hor_asignaciones/.test(b));
    const r = bloque('app.post("/api/horarios/ausencia/:id/resolver"', "// Disponibilidad de una persona");
    assert.match(r, /avisoTurnos/);
    assert.ok(!/DELETE FROM hor_asignaciones|UPDATE hor_semanas/.test(r), "aprobar una ausencia republica un horario");
  });
  test("y el aviso distingue lo publicado de lo que está en borrador", () => {
    const m = readFileSync(new URL("../src/modules/rrhh/ausencias.js", import.meta.url), "utf8");
    assert.match(m, /YA PUBLICADAS/);
    assert.match(m, /versión nueva de esa semana/);
  });
  test("la pantalla lo enseña sin ofrecer arreglarlo por detrás", () => {
    assert.match(app, /function horAvisoTurnos\(a\)/);
    assert.ok(!/horAvisoTurnos[\s\S]{0,400}apiSend\("DELETE"/.test(app));
  });
});

describe("nada se borra", () => {
  test("quitar una ausencia la CANCELA", () => {
    const b = bloque('app.delete("/api/horarios/ausencia/:id"', "/**\n * Los turnos que una persona");
    assert.match(b, /SET estado = 'cancelada', cancelado_por = \?, cancelado_en = \?/);
    assert.ok(!/DELETE FROM hor_ausencias/.test(server), "queda un DELETE sobre hor_ausencias");
  });
  test("y queda en la auditoría de siempre, no en un sistema nuevo", () => {
    for (const a of ["solicitar", "cancelar_propia", "adjudicar", "cancelar", "guardar_propia", "guardar_administrativa"]) {
      assert.ok(server.includes(`"${a}"`), `falta la auditoría de «${a}»`);
    }
    assert.match(bloque('app.post("/api/horarios/ausencia/:id/resolver"', "// Disponibilidad de una persona"),
      /ficAuditar\("ausencia", a\.id, accion/);
  });
});

describe("concurrencia", () => {
  test("resolver es atómico: la condición va DENTRO del UPDATE", () => {
    // Dos encargados mirando la misma bandeja podrían aprobar y rechazar casi a la vez.
    const b = bloque('app.post("/api/horarios/ausencia/:id/resolver"', "// Disponibilidad de una persona");
    assert.match(b, /WHERE id = \? AND estado = 'pendiente' RETURNING \*/);
    assert.match(b, /Alguien la ha resuelto antes que tú/);
  });
  test("y cancelar también", () => {
    assert.match(bloque('app.post("/api/mis-ausencias/:id/cancelar"', 'app.get("/api/mi-disponibilidad"'),
      /AND estado = 'pendiente' AND origen = 'solicitada'\s*\n?\s*RETURNING \*/);
  });
  test("una aprobada no se puede volver a aprobar", () => {
    const m = readFileSync(new URL("../src/modules/rrhh/ausencias.js", import.meta.url), "utf8");
    assert.match(m, /aprobada: \{ cancelar: "cancelada" \}/, "desde aprobada solo se puede cancelar");
  });
});

describe("el esquema y la migración", () => {
  test("todo es aditivo: ninguna columna cambia de significado", () => {
    assert.match(esquema, /origen TEXT NOT NULL DEFAULT 'adjudicada'/);
    assert.match(esquema, /ALTER TABLE hor_ausencias ADD COLUMN IF NOT EXISTS/);
    assert.match(esquema, /ALTER TABLE hor_disponibilidad ADD COLUMN IF NOT EXISTS/);
  });
  test("el CHECK de estado NO se pone a ciegas", () => {
    // Si hay un valor que no conocemos, no se puede saber qué quiso decir quien lo escribió.
    const b = bloque("// ── El CHECK de `hor_ausencias.estado`", "// Se vacían las copias reversibles");
    assert.match(b, /SELECT DISTINCT estado FROM hor_ausencias/);
    assert.match(b, /if \(raros\.rows\.length\)/);
    assert.match(b, /NO se ha tocado ni una fila/);
    assert.ok(!/UPDATE hor_ausencias SET estado/.test(b), "la migración convierte valores por su cuenta");
  });
});

describe("la pantalla del trabajador", () => {
  test("tiene las dos secciones", () => {
    assert.match(html, /id="ausenciasBloque"/);
    assert.match(html, /id="dispBloque"/);
  });
  test("y dice que la disponibilidad NO son vacaciones", () => {
    // Para que nadie ponga «no disponible toda la semana» creyendo que ha pedido vacaciones.
    assert.match(html, /<b>No son vacaciones<\/b>/);
    assert.match(html, /Solicitar ausencia/);
  });
  test("el tipo de ausencia lo manda el servidor, no lo escribe la pantalla", () => {
    // Así la baja médica no puede colarse en el desplegable por un descuido del frontend.
    assert.match(trab, /\(data\.tipos \|\| \[\]\)\.map/);
    assert.ok(!/value="baja"/.test(html));
  });
  test("se ve el estado y la respuesta de cada solicitud", () => {
    assert.match(trab, /a\.etiquetaEstado/);
    assert.match(trab, /a\.respuesta \? `<div class="aus-resp">Respuesta:/);
  });
  test("y se marca lo que cambió administración", () => {
    assert.match(trab, /f\.origen === "administrativo"/);
  });
});

describe("los invariantes de las fases anteriores", () => {
  test("fic_eventos sigue intacto", () => {
    const updates = [...server.matchAll(/UPDATE fic_eventos SET ([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(updates)], ["anulado_por"]);
  });
  test("la bolsa sigue siendo append-only", () => {
    assert.ok(!/UPDATE fic_bolsa_movimientos|DELETE FROM fic_bolsa_movimientos/.test(server));
  });
  test("una semana publicada sigue sin editarse", () => {
    assert.match(server, /Solo se puede editar el borrador/);
  });
  test("el pulso sigue sin poder cruzarse", () => {
    const crear = server.slice(server.indexOf("CREATE TABLE IF NOT EXISTS pulso_respuestas"));
    assert.ok(!/worker_id|token/.test(crear.slice(0, crear.indexOf(")"))));
  });
  test("y Fichajes no se ha tocado para tapar nada", () => {
    // Un turno publicado durante una ausencia aprobada es una incoherencia REAL y tiene que
    // seguir saltando: se arregla republicando el horario, no escondiendo la incidencia.
    const rev = bloque("async function ficCalcularPeriodo(", "async function ficGuardarProyeccion(");
    assert.ok(!/ausencia|hor_ausencias/.test(rev), "la revisión de fichajes mira las ausencias para callar incidencias");
  });
});
