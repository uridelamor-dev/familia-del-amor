// Fase 3 — comunicar un cambio de horario y dejar constancia de que se vio.
//
// LA DECISIÓN QUE SUJETAN ESTOS TESTS: «Entendido» no decide nada. El horario es oficial desde
// que se publica, lo pulse o no lo pulse nadie. Lo único que hace es dejar escrito que lo vio.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const trab = readFileSync(new URL("../public/trabajadores.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/trabajadores.html", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/horarios/schema.js", import.meta.url), "utf8");
const versiones = readFileSync(new URL("../src/modules/horarios/versiones.js", import.meta.url), "utf8");

function bloque(desde, hasta) {
  const i = server.indexOf(desde);
  assert.ok(i > 0, `no se encuentra: ${desde}`);
  const f = server.indexOf(hasta, i + desde.length);
  assert.ok(f > i, `no se encuentra el final: ${hasta}`);
  return server.slice(i, f);
}
const sinComentarios = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("se reutiliza el comparador que ya existía", () => {
  test("hay UNO solo, y los cambios por persona salen de él", () => {
    // Escribir un segundo comparador con otra clave habría acabado en dos verdades sobre qué
    // es un cambio, y la que llega al trabajador es la que menos se mira.
    assert.equal((versiones.match(/export function compararSnapshots/g) || []).length, 1);
    const f = versiones.slice(versiones.indexOf("export function cambiosPorTrabajador"));
    assert.match(f, /const d = compararSnapshots\(antes, despues\)/);
  });
  test("la clave incluye `fin_abierto` y `tipo`, que cambian lo que hay que hacer", () => {
    assert.match(versiones, /a\.fin_abierto \? 1 : 0/);
    assert.match(versiones, /a\.tipo \|\| "turno"/);
  });
  test("y NO incluye el nombre ni la nota", () => {
    const clave = versiones.slice(versiones.indexOf("const clave = (a) =>"), versiones.indexOf("const mapa = (s) =>"));
    assert.ok(!/nombre|nota/.test(clave), "un cambio de nombre generaría «tu horario ha cambiado»");
  });
});

describe("la comunicación se genera al publicar, y dentro de la misma transacción", () => {
  const pub = () => bloque('app.post("/api/horarios/semana/:id/publicar"', "// Crear una versión nueva");

  test("se compara contra el snapshot CONGELADO, no contra los datos de hoy", () => {
    // Es lo que permite reconstruir dentro de dos años qué se comunicó exactamente.
    assert.match(pub(), /SELECT p\.id, p\.version, p\.snapshot FROM hor_publicaciones p/);
    assert.match(pub(), /cambiosPorTrabajador\(JSON\.parse\(anteriorPub\.snapshot\), snapshot\)/);
  });

  test("el snapshot anterior se lee ANTES de marcarlo como sustituido", () => {
    const b = pub();
    const iLeer = b.indexOf("const anteriorPub"), iSust = b.indexOf("estado = 'sustituido'");
    assert.ok(iLeer > 0 && iSust > iLeer, "se lee después de tocarlo");
  });

  test("las comunicaciones se escriben antes del COMMIT", () => {
    // Si se hicieran después y fallaran, quedaría un horario publicado del que nadie se ha
    // enterado: el peor de los dos mundos.
    const b = pub();
    const iIns = b.indexOf("INSERT INTO hor_cambios_comunicados"), iCommit = b.indexOf('client.query("COMMIT")');
    assert.ok(iIns > 0 && iCommit > iIns);
  });

  test("la PRIMERA publicación no genera nada", () => {
    assert.match(pub(), /if \(anteriorPub\)/);
    assert.match(versiones, /if \(!antes \|\| !Array\.isArray\(antes\.asignaciones\)\) return \[\]/);
  });

  test("republicar no duplica: la pareja (publicación, persona) es única", () => {
    assert.match(pub(), /ON CONFLICT \(publicacion_nueva_id, worker_id\) DO NOTHING/);
    assert.match(esquema, /UNIQUE \(publicacion_nueva_id, worker_id\)/);
  });

  test("y queda en la auditoría de siempre", () => {
    assert.match(pub(), /"comunicar_cambios"/);
  });
});

describe("el diff queda congelado", () => {
  test("se guarda serializado y con su hash", () => {
    const b = bloque('app.post("/api/horarios/semana/:id/publicar"', "// Crear una versión nueva");
    assert.match(b, /const canon = serializarCanonico\(cuerpo\)/);
    assert.match(b, /crypto\.createHash\("sha256"\)\.update\(canon\)/);
  });
  test("`entendido_en` es la ÚNICA columna que se actualiza en toda la tabla", () => {
    // Mismo trato que `anulado_por` en los fichajes: lo que prueba algo tiene que ser lo que
    // se escribió, no lo que quedó al final.
    const updates = [...server.matchAll(/UPDATE hor_cambios_comunicados SET ([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(updates)], ["entendido_en"]);
  });
  test("y nunca se borra ninguna", () => {
    assert.ok(!/DELETE FROM hor_cambios_comunicados/.test(server));
  });
});

describe("«Entendido»", () => {
  const b = () => bloque('app.post("/api/mi-horario/cambios/:id/entendido"', "// ════════════════════════ MIS AUSENCIAS");

  test("el worker_id sale del token, NUNCA del cuerpo", () => {
    assert.match(b(), /AND worker_id = \?/);
    assert.match(b(), /req\.user\.id/);
    assert.ok(!/req\.body/.test(sinComentarios(b())), "el cuerpo puede elegir a quién confirma");
  });

  test("solo escribe si estaba sin confirmar: dos pulsaciones, una confirmación", () => {
    assert.match(b(), /AND entendido_en IS NULL\s*\n?\s*RETURNING/);
    assert.match(b(), /repetido: true/);
  });

  test("NO publica, ni valida, ni toca asignaciones, snapshots, fichajes ni bolsa", () => {
    // Es la mitad de la decisión de negocio de esta fase.
    const c = sinComentarios(b());
    for (const t of ["hor_asignaciones", "hor_semanas", "hor_publicaciones", "fic_", "bolsa", "INSERT", "DELETE"]) {
      assert.ok(!c.includes(t), `el endpoint de «Entendido» toca «${t}»`);
    }
  });

  test("confirmar una versión NO confirma la siguiente", () => {
    // Cada publicación es una fila con su propio diff: la V3 sigue pendiente aunque se
    // confirme la V2 estando ya publicada.
    // La garantía es que TODA confirmación va contra UN id concreto. Sin eso, un WHERE por
    // trabajador confirmaría de golpe la V2 y la V3.
    const escrituras = [...server.matchAll(/UPDATE hor_cambios_comunicados SET[\s\S]{0,300}?RETURNING/g)].map((m) => m[0]);
    assert.ok(escrituras.length >= 1);
    for (const e of escrituras) assert.match(e, /WHERE id = \? AND worker_id = \?/, e.slice(0, 160));
  });

  test("un responsable no puede confirmar en nombre de nadie", () => {
    // No existe ninguna ruta que escriba `entendido_en` con un worker_id que venga de fuera.
    const escrituras = [...server.matchAll(/UPDATE hor_cambios_comunicados[\s\S]{0,300}?\]\)/g)].map((m) => m[0]);
    assert.equal(escrituras.length, 1, "hay más de un sitio que confirma");
    assert.match(escrituras[0], /req\.user\.id/);
  });
});

describe("el horario es oficial sin «Entendido»", () => {
  test("publicar no comprueba ninguna confirmación", () => {
    const pub = bloque('app.post("/api/horarios/semana/:id/publicar"', "// Crear una versión nueva");
    assert.ok(!/entendido/.test(sinComentarios(pub).replace(/hor_cambios_comunicados[\s\S]{0,400}/g, "")),
      "publicar mira si alguien ha confirmado");
  });
  test("nada más en el servidor consulta `entendido_en` para decidir", () => {
    // Solo lo leen las dos pantallas que lo enseñan. Si apareciera en un `if` de otro sitio,
    // se habría convertido en un requisito.
    const lecturas = [...server.matchAll(/entendido_en/g)].length;
    assert.ok(lecturas <= 12, `«entendido_en» aparece ${lecturas} veces: revisa que no bloquee nada`);
    assert.ok(!/if \([^)]*entendido/.test(server), "hay una decisión que depende de una confirmación");
  });
});

describe("aislamiento por establecimiento", () => {
  test("la vista del responsable resuelve el local con horLocal", () => {
    const b = bloque('app.get("/api/horarios/comunicaciones"', "// Histórico de versiones");
    assert.match(b, /const local = horLocal\(req, req\.query\.local\)/);
  });
  test("y el local manda aunque se pida una publicación por id", () => {
    // Pedir la publicación de otro establecimiento por su número no devuelve nada.
    const b = bloque('app.get("/api/horarios/comunicaciones"', "// Histórico de versiones");
    assert.match(b, /WHERE c\.local = \? \$\{pub \? "AND c\.publicacion_nueva_id = \?" : "AND c\.lunes = \?"\}/);
    assert.match(b, /\[local, pub \|\| lunes\]/);
  });
  test("el trabajador solo ve las suyas", () => {
    assert.match(bloque('app.get("/api/mi-horario/cambios"', 'app.post("/api/mi-horario/cambios/:id/entendido"'),
      /WHERE worker_id = \?[\s\S]{0,80}?\[req\.user\.id\]/);
  });
  test("y el responsable no ve más de lo que necesita", () => {
    // Nombre, qué días le cambiaron y si lo ha visto. Nada más.
    const b = bloque('app.get("/api/horarios/comunicaciones"', "// Histórico de versiones");
    assert.match(b, /dias: \(Array\.isArray\(d\.dias\) \? d\.dias : \[\]\)\.map\(\(x\) => \(\{ dia: x\.dia, tipo: x\.tipo \}\)\)/);
  });
});

describe("la pantalla del trabajador", () => {
  test("los cambios van ANTES que el propio horario", () => {
    // Si le han movido el turno del jueves, es lo primero que tiene que ver.
    assert.ok(html.indexOf('id="cambiosBloque"') < html.indexOf('id="cuadranteBloque"'));
  });
  test("enseña ANTES y AHORA, no un texto suelto", () => {
    assert.match(trab, /<small>Antes<\/small>/);
    assert.match(trab, /<small>Ahora<\/small>/);
  });
  test("medianoche como final se escribe 24:00", () => {
    // «16:00–00:00» se lee como que el turno dura cero.
    assert.match(trab, /if \(esFin && n > 0 && n % 1440 === 0\) return "24:00"/);
  });
  test("un turno hasta el cierre se dice con esa palabra", () => {
    assert.match(trab, /t\.fin_abierto \? "cierre"/);
  });
  test("con varios avisos sin ver, manda el último y los viejos NO se dan por vistos", () => {
    assert.match(trab, /const \[ultimo, \.\.\.anteriores\] = CAMBIOS_PENDIENTES/);
    assert.match(trab, /Cambio anterior que no llegaste a ver/);
    // El botón confirma cada uno por separado: queda escrito qué vio de cada publicación.
    assert.match(trab, /for \(const c of CAMBIOS_PENDIENTES\)/);
  });
  test("y no se apila en dos columnas en un móvil estrecho", () => {
    const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
    assert.match(css, /@media \(max-width: 420px\) \{ \.cmb-comp \{ grid-template-columns: 1fr/);
  });
});

describe("los invariantes de las fases anteriores", () => {
  test("una publicación sigue siendo inmutable", () => {
    assert.ok(!/UPDATE hor_publicaciones/.test(server));
    assert.ok(!/DELETE FROM hor_publicaciones/.test(server));
  });
  test("modificar un horario publicado sigue exigiendo una versión nueva", () => {
    assert.match(server, /Solo se puede editar el borrador/);
  });
  test("fichajes y bolsa no se han tocado", () => {
    const updates = [...server.matchAll(/UPDATE fic_eventos SET ([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(updates)], ["anulado_por"]);
    assert.ok(!/UPDATE fic_bolsa_movimientos|DELETE FROM fic_bolsa_movimientos/.test(server));
  });
  test("el generador sigue solo proponiendo", () => {
    const b = bloque('app.post("/api/horarios/generar"', "// Aceptar la propuesta");
    assert.ok(!/INSERT INTO hor_asignaciones/.test(b));
  });
  test("las ausencias aprobadas siguen bloqueando", () => {
    assert.match(bloque("async function horContexto(", "// Conflictos de una semana"), /a\.estado = 'aprobada'/);
  });
});
