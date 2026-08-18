// Fase 4 — quién sabe hacer qué, y un generador que lo respeta.
//
// La decisión que sujetan estos tests: mientras alguien no tenga áreas configuradas, TODO se
// comporta como antes. Es lo que permite desplegar esto sin que el cuadrante del día
// siguiente salga vacío.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/horarios/schema.js", import.meta.url), "utf8");
const solver = readFileSync(new URL("../src/modules/horarios/solver.js", import.meta.url), "utf8");
const caps = readFileSync(new URL("../src/modules/horarios/capacidades.js", import.meta.url), "utf8");

function bloque(desde, hasta) {
  const i = server.indexOf(desde);
  assert.ok(i > 0, `no se encuentra: ${desde}`);
  const f = server.indexOf(hasta, i + desde.length);
  assert.ok(f > i, `no se encuentra el final: ${hasta}`);
  return server.slice(i, f);
}

describe("el modelo", () => {
  test("una fila por persona y área, sin duplicados", () => {
    assert.match(esquema, /CREATE TABLE IF NOT EXISTS hor_worker_areas/);
    assert.match(esquema, /UNIQUE \(worker_id, area_id\)/);
    assert.match(esquema, /REFERENCES hor_areas\(id\) ON DELETE CASCADE/);
  });
  test("como mucho UNA área principal por persona, y lo garantiza la base", () => {
    assert.match(esquema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_hor_wa_principal[\s\S]{0,120}WHERE principal/);
  });
  test("la marca de «configurado» es una columna, no un COUNT", () => {
    // Contar filas no distingue «nunca se tocó» de «se decidió que cero». El primero mantiene
    // el comportamiento de antes; el segundo saca a esa persona del generador.
    assert.match(esquema, /ALTER TABLE users ADD COLUMN IF NOT EXISTS areas_configuradas_en TEXT/);
    assert.match(caps, /export const estaConfigurado = \(persona\) => !!\(persona && persona\.areas_configuradas_en\)/);
  });
  test("y no hay ni niveles ni puntuaciones: es un sí o un no", () => {
    for (const t of ["nivel", "puntuacion", "experiencia", "certificad", "ranking", "score"]) {
      assert.ok(!new RegExp(t, "i").test(esquema.slice(esquema.indexOf("hor_worker_areas"), esquema.indexOf("hor_semanas"))),
        `ha aparecido «${t}» en el modelo de capacidades`);
    }
  });
});

describe("la compatibilidad con lo que hay hoy", () => {
  test("sin configurar = como antes", () => {
    assert.match(caps, /if \(!estaConfigurado\(persona\)\) return true;/);
  });
  test("sin índice tampoco se restringe nada", () => {
    // Quien llame al generador o a los conflictos sin pasar capacidades se comporta como antes.
    assert.match(caps, /if \(!\(indice instanceof Map\)\) return true;/);
  });
  test("pero el servidor SÍ las pasa siempre", () => {
    // Si no, la restricción se perdería en silencio y nadie lo notaría.
    assert.match(bloque('app.post("/api/horarios/generar"', "// Aceptar la propuesta"), /capacidades: caps\.indice/);
    assert.match(bloque('app.get("/api/horarios/semana/:id/conflictos"', "// Copiar una semana"), /capacidades: caps\.indice/);
    assert.match(bloque('app.post("/api/horarios/semana/:id/publicar"', "// Crear una versión nueva"), /capacidades: indiceCapacidades\(capsPub\)/);
  });
  test("y avisa de cuánta gente sigue sin configurar", () => {
    assert.match(bloque('app.post("/api/horarios/generar"', "// Aceptar la propuesta"), /resumenConfiguracion\(trabajadores\)/);
    assert.match(app, /sin áreas configuradas/);
    assert.match(app, /el generador las acepta para cualquier área/);
  });
});

describe("el generador", () => {
  test("la capacidad es LO PRIMERO que se comprueba", () => {
    const m = solver.slice(solver.indexOf("export function motivoDescarte"), solver.indexOf("function diasSeguidosCon"));
    const iArea = m.indexOf("area_no_habilitada"), iAus = m.indexOf('motivo: "ausencia"');
    assert.ok(iArea > 0 && iArea < iAus, "la capacidad se mira después de las vacaciones");
  });
  test("y está en UN solo sitio, no repartida por el solver", () => {
    assert.equal((solver.match(/puedeEnArea\(/g) || []).length, 1);
  });
  test("no entra en la puntuación: es restricción, no preferencia", () => {
    const p = solver.slice(solver.indexOf("export function puntuar"), solver.indexOf("const mejorQue"));
    assert.ok(!/area|capacidad|principal/i.test(p), "la capacidad se ha colado en el reparto");
    // Y el orden de desempate no se ha tocado.
    assert.match(solver, /b\.deficitH - a\.deficitH \|\|\s*\n?\s*b\.prefiere - a\.prefiere/);
  });
  test("explica por qué no hay nadie, con nombres", () => {
    assert.match(app, /area_no_habilitada: "no están habilitados para esa área"/);
  });
  test("y cuando un área no tiene plantilla suficiente, lo dice con números", () => {
    assert.match(solver, /areasCortas: porArea/);
    assert.match(caps, /export function capacidadPorArea/);
  });
});

describe("la asignación manual avisa, NO bloquea", () => {
  test("existe el aviso y dice que se puede hacer igual", () => {
    // Un sistema que impida al encargado resolver una urgencia acaba con el cuadrante en un
    // papel, y entonces no sirve para nada.
    const b = bloque("async function horAvisoArea(", "// La fila de fiesta no admite turnos");
    assert.match(b, /no está habilitado habitualmente para/);
    assert.match(b, /Se puede poner igualmente/);
    assert.ok(!/status\(4\d\d\)/.test(b), "el aviso bloquea la petición");
  });
  test("crear y mover un turno lo devuelven", () => {
    assert.match(bloque('app.post("/api/horarios/asignacion"', "async function horTrabajadorDelLocal"),
      /aviso: await horAvisoArea\(quien\.worker, area_id/);
    assert.match(bloque('app.patch("/api/horarios/asignacion/:id"', 'app.delete("/api/horarios/asignacion/:id"'),
      /aviso: await horAvisoArea\(w, fila\.area_id/);
  });
  test("el conflicto es AVISA y entra en lo que se acepta al publicar", () => {
    const c = readFileSync(new URL("../src/modules/horarios/conflictos.js", import.meta.url), "utf8");
    assert.match(c, /tipo: "area_no_habilitada", severidad: AVISA/);
    // `avisos_aceptados` guarda TODOS los avisos, así que este entra sin tocar nada más.
    assert.match(server, /avisos: conflictos\.filter\(\(c\) => c\.severidad === "avisa"\)/);
  });
  test("pero el generador NUNCA la propone", () => {
    assert.match(solver, /if \(!puedeEnArea\(worker, hueco\.area_id, capacidades\)\) return \{ motivo: "area_no_habilitada" \}/);
  });
});

describe("nada se borra ni se reescribe", () => {
  test("copiar una semana avisa de las incompatibilidades pero copia igual", () => {
    // Borrar la línea en silencio sería quitar trabajo planificado sin decirlo.
    const b = bloque('app.post("/api/horarios/semana/:id/copiar"', "const addDiasISO");
    assert.match(b, /avisosArea\.push\(/);
    assert.ok(!/continue;[\s\S]{0,40}avisosArea/.test(b), "la línea incompatible se descarta");
    assert.match(b, /res\.json\(\{ ok: true, copiadas, omitidos, avisosArea \}\)/);
  });
  test("quitar un área desactiva, no borra, y sus capacidades se conservan", () => {
    assert.match(server, /UPDATE hor_areas SET activo = FALSE/);
    assert.ok(!/DELETE FROM hor_worker_areas WHERE worker_id = \? *`/.test(server), "hay un borrado sin acotar");
    // Al guardar solo se reemplazan las áreas ACTIVAS de su local: las desactivadas se quedan.
    assert.match(bloque('app.put("/api/horarios/capacidades/:workerId"', "// Contrato. Cambiar de 20 a 30 horas"),
      /DELETE FROM hor_worker_areas WHERE worker_id = \? AND area_id IN \(SELECT id FROM hor_areas WHERE local = \? AND activo\)/);
  });
  test("y una publicación antigua sigue diciendo lo que se publicó", () => {
    assert.ok(!/UPDATE hor_publicaciones|DELETE FROM hor_publicaciones/.test(server));
  });
});

describe("permisos y aislamiento", () => {
  const b = () => bloque('app.put("/api/horarios/capacidades/:workerId"', "// Contrato. Cambiar de 20 a 30 horas");
  test("solo se toca a gente del propio establecimiento", () => {
    assert.match(b(), /rrhhPuedeLocal\(req, w\.local \|\| ""\)/);
  });
  test("y solo con áreas de SU establecimiento, activas", () => {
    // Mandar un area_id de Lloret a un trabajador de Blanes se rechaza en el servidor.
    assert.match(b(), /FROM hor_areas WHERE local = \? AND activo AND id = ANY\(\?\)/);
    assert.match(b(), /no es de \$\{w\.local\} o está desactivada/);
  });
  test("el área principal tiene que ser una de las marcadas", () => {
    assert.match(b(), /El área principal tiene que ser una de las marcadas/);
  });
  test("la lectura también va acotada al local", () => {
    assert.match(bloque('app.get("/api/horarios/capacidades"', "/**\n * Guardar las áreas de UNA persona"),
      /const local = horLocal\(req, req\.query\.local\)/);
  });
  test("el trabajador NO puede tocar sus capacidades", () => {
    // No existe ninguna ruta `mi-*` que escriba en hor_worker_areas.
    const misRutas = [...server.matchAll(/app\.(put|post)\("\/api\/mi[^"]*"[\s\S]{0,1800}?\n\}\);/g)].map((m) => m[0]);
    for (const r of misRutas) assert.ok(!/hor_worker_areas/.test(r), "una ruta del trabajador escribe capacidades");
  });
  test("y queda en la auditoría de siempre", () => {
    assert.match(b(), /ficAuditar\("capacidades", w\.id, "guardar"/);
  });
});

describe("rendimiento", () => {
  test("las capacidades se cargan en bloque, dos consultas", () => {
    const b = bloque("async function horCapacidades(", "async function horContexto(");
    assert.equal((b.match(/dbAll\(/g) || []).length, 2);
    assert.match(b, /Promise\.all/);
  });
  test("y el solver no consulta nada: trabaja en memoria", () => {
    assert.ok(!/dbAll|dbGet|await /.test(solver.slice(solver.indexOf("export function motivoDescarte"), solver.indexOf("function diasSeguidosCon"))));
  });
  test("no hay ninguna consulta de capacidades dentro de un bucle", () => {
    const b = bloque('app.post("/api/horarios/semana/:id/copiar"', "const addDiasISO");
    const iBucle = b.indexOf("for (const l of lineas)");
    assert.ok(!b.slice(iBucle).includes("horCapacidades("), "se piden capacidades por cada línea copiada");
  });
});

describe("los invariantes de las fases anteriores", () => {
  test("el generador sigue solo proponiendo", () => {
    assert.ok(!/INSERT INTO hor_asignaciones/.test(bloque('app.post("/api/horarios/generar"', "// Aceptar la propuesta")));
  });
  test("una ausencia aprobada sigue impidiendo asignar", () => {
    assert.match(solver, /if \(aus\) return \{ motivo: "ausencia", detalle: aus\.tipo \}/);
  });
  test("fichajes y bolsa, intactos", () => {
    const updates = [...server.matchAll(/UPDATE fic_eventos SET ([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(updates)], ["anulado_por"]);
    assert.ok(!/UPDATE fic_bolsa_movimientos|DELETE FROM fic_bolsa_movimientos/.test(server));
  });
  test("`users.puesto` sigue existiendo y NO decide nada", () => {
    // Es texto libre para enseñar «Camarero». La fuente de verdad son las áreas.
    assert.match(server, /puesto/);
    assert.ok(!/puesto[\s\S]{0,60}puedeEnArea|puedeEnArea[\s\S]{0,60}puesto/.test(server));
    // Sobre el CÓDIGO: en los comentarios aparece «puestos» como palabra normal.
    const solverCodigo = solver.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.ok(!/\bpuesto\b/.test(solverCodigo), "el solver mira el puesto");
  });
  test("y guardar áreas no reescribe el puesto", () => {
    assert.ok(!/UPDATE users SET[^`]*puesto/.test(bloque('app.put("/api/horarios/capacidades/:workerId"', "// Contrato. Cambiar de 20")));
  });
});
