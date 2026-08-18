// Aislamiento por establecimiento en Equipo, Horarios y Fichajes.
//
// POR QUÉ ESTE FICHERO: la auditoría encontró que no había NI UN test que comprobara que un
// encargado de Blanes no puede tocar Lloret. Todo el aislamiento vivía en que cada endpoint se
// acordara de llamar a `rrhhPuedeLocal`, y dos de ellos no se acordaban.
//
// No son cientos de tests: son las FRONTERAS. Si alguien las rompe dentro de un año, esto
// falla y se entera antes de desplegarlo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

/** El cuerpo de un endpoint, delimitado por lo que viene DESPUÉS y no por un nº de caracteres. */
function bloque(desde, hasta) {
  const i = server.indexOf(desde);
  assert.ok(i > 0, `no se encuentra: ${desde}`);
  const f = server.indexOf(hasta, i + desde.length);
  assert.ok(f > i, `no se encuentra el final: ${hasta}`);
  return server.slice(i, f);
}

// ════════════════════════════ HORARIOS ════════════════════════════
describe("Horarios · un turno solo se le puede poner a alguien de ese local", () => {
  test("existe la guarda y mira `users.local`, NO `locales_extra`", () => {
    // `locales_extra` es un permiso de ACCESO al panel. Tomarlo por autorización laboral
    // metería por la puerta de atrás el multi-local que hemos decidido no construir.
    const g = bloque("async function horTrabajadorDelLocal(", "// La fila de fiesta no admite turnos");
    assert.match(g, /String\(w\.local \|\| ""\) !== String\(local\)/);
    assert.ok(!/locales_extra|puedeLocal\(/.test(g), "no puede consultar los locales de permisos");
    assert.match(g, /rol\)/, "y una cuenta que no es de sala ni cocina tampoco lleva turnos");
  });

  test("crear un turno pasa por la guarda", () => {
    const b = bloque('app.post("/api/horarios/asignacion"', 'async function horTrabajadorDelLocal');
    assert.match(b, /await horTrabajadorDelLocal\(worker_id, chk\.semana\.local\)/);
  });

  test("reasignar un turno a otra persona TAMBIÉN pasa por la guarda", () => {
    // Era la mitad del agujero: se validaba al crear y no al mover.
    const b = bloque('app.patch("/api/horarios/asignacion/:id"', 'app.delete("/api/horarios/asignacion/:id"');
    assert.match(b, /if \(req\.body\.worker_id !== undefined\)/);
    assert.match(b, /await horTrabajadorDelLocal\(req\.body\.worker_id, chk\.semana\.local\)/);
  });

  test("aceptar la propuesta del generador comprueba cada worker_id", () => {
    // La propuesta da la vuelta por el navegador, así que el worker_id que vuelve es del
    // cliente y puede ser cualquiera.
    const b = bloque('app.post("/api/horarios/generar/aceptar"', "// Mandar el cuadrante al grupo");
    assert.match(b, /const suyos = new Set/);
    assert.match(b, /no es de este establecimiento/);
  });

  test("editar una semana comprueba el local de la SEMANA, no el que mande el cliente", () => {
    const b = bloque("async function horSemanaEditable(", 'app.post("/api/horarios/asignacion"');
    assert.match(b, /rrhhPuedeLocal\(req, s\.local\)/);
  });
});

describe("Horarios · las ausencias de un local son solo las de su gente", () => {
  // Una ausencia de tipo «baja» es un dato de salud. Estaban entrando las de todo el grupo en
  // el contexto de cada local, y de ahí al snapshot que se guarda para siempre.
  test("ninguna consulta de ausencias se hace ya sin saber de qué local es cada persona", () => {
    const consultas = [...server.matchAll(/FROM hor_ausencias[\s\S]{0,260}?(?=`)/g)].map((m) => m[0]);
    assert.ok(consultas.length >= 5, `solo se han encontrado ${consultas.length} consultas de ausencias`);
    for (const q of consultas) {
      const acotada = /JOIN users u ON u\.id = a\.worker_id/.test(q) || /WHERE worker_id = \?/.test(q) || /WHERE id = \?/.test(q);
      // Excepción razonada: una consulta que no selecciona NINGÚN dato de nadie no puede
      // filtrar nada entre locales. Es el caso de la migración que revisa qué valores de
      // `estado` hay en la tabla antes de cerrarla con un CHECK.
      // (El trozo capturado empieza en `FROM hor_ausencias`, así que se reconoce por su WHERE.)
      const sinDatosDeNadie = /^FROM hor_ausencias\s+WHERE estado IS NULL/.test(q.trim())
        && !/worker_id|motivo|comentario|tipo/.test(q);
      assert.ok(acotada || sinDatosDeNadie,
        `consulta de ausencias sin acotar por persona ni por local:\n${q.slice(0, 200)}`);
    }
  });

  test("al publicar, las ausencias que entran en el snapshot son las del local", () => {
    const b = bloque('app.post("/api/horarios/semana/:id/publicar"', "// Crear una versión nueva");
    assert.match(b, /FROM hor_ausencias a JOIN users u ON u\.id = a\.worker_id\s*\n?\s*WHERE u\.local = \?/);
    assert.match(b, /FROM hor_contratos c JOIN users u ON u\.id = c\.worker_id\s*\n?\s*WHERE u\.local = \?/);
  });

  test("el contexto de conflictos tampoco arrastra el grupo entero", () => {
    const b = bloque("async function horContexto(", "// Conflictos de una semana");
    assert.match(b, /JOIN users u ON u\.id = a\.worker_id/);
    assert.match(b, /JOIN users u ON u\.id = c\.worker_id/);
  });
});

// ════════════════════════════ FICHAJES ════════════════════════════
describe("Fichajes · cada endpoint comprueba el local en el servidor", () => {
  // Estos ya estaban bien. El test existe para que sigan estándolo.
  const PORLOCAL = [
    ['app.get("/api/fichajes/hoy"', "horLocal"],
    ['app.get("/api/fichajes/dispositivos"', "horLocal"],
    ['app.get("/api/fichajes/jornada"', "horLocal"],
    ['app.get("/api/fichajes/revision"', "horLocal"],
    ['app.get("/api/fichajes/correcciones"', "horLocal"],
    ['app.get("/api/fichajes/bolsa"', "horLocal"],
    ['app.get("/api/fichajes/cierres"', "horLocal"],
    ['app.get("/api/fichajes/export"', "horLocal"],
  ];
  for (const [ruta, guarda] of PORLOCAL) {
    test(`${ruta.replace('app.get("', "").replace('"', "")} resuelve el local con ${guarda}()`, () => {
      const i = server.indexOf(ruta);
      assert.ok(i > 0, `no se encuentra ${ruta}`);
      // `horLocal` fuerza el local del encargado por encima del que pida el cliente.
      assert.match(server.slice(i, i + 700), new RegExp(`${guarda}\\(req`));
    });
  }

  const PORTRABAJADOR = [
    'app.post("/api/fichajes/evento"',
    'app.post("/api/fichajes/evento/:id/anular"',
    'app.post("/api/fichajes/validar"',
    'app.put("/api/fichajes/pin/:workerId"',
    'app.get("/api/fichajes/bolsa/:workerId"',
    'app.post("/api/fichajes/bolsa/ajuste"',
  ];
  for (const ruta of PORTRABAJADOR) {
    test(`${ruta.split('"')[1]} comprueba el local DEL TRABAJADOR`, () => {
      const i = server.indexOf(ruta);
      assert.ok(i > 0, `no se encuentra ${ruta}`);
      // El id llega del cliente: hay que leer la fila y comprobar SU local, no el de la barra.
      assert.match(server.slice(i, i + 900), /rrhhPuedeLocal\(req, (w|ev)\.local/);
    });
  }

  test("el kiosco solo deja fichar a la gente de la tablet, y solo si está activa hoy", () => {
    const b = bloque('app.get("/api/fichar/:token"', '// PIN. Rate limit MUY corto');
    assert.match(b, /WHERE local = \? AND \$\{SQL_ACTIVO_EL_DIA\}/);
    const pin = bloque('app.post("/api/fichar/:token/pin"', "// El fichaje. La hora sale de");
    assert.match(pin, /worker\.local !== disp\.local/, "un PIN de otro local no vale en esta tablet");
    const ev = bloque('app.post("/api/fichar/:token/evento"', "// ── Panel: quién está dentro");
    assert.match(ev, /worker\.local !== disp\.local/);
  });

  test("el ticket del kiosco está atado a SU tablet", () => {
    const b = bloque("function ficLeerTicket(", "// Traduce un instante real");
    assert.match(b, /Number\(disp\) !== Number\(dispId\)/);
    assert.match(b, /timingSafeEqual/, "y se compara en tiempo constante");
  });
});

// ════════════════════════════ EQUIPO ════════════════════════════
describe("Equipo · un id cambiado a mano no salta el ámbito", () => {
  const PORFICHA = [
    ['app.get("/api/rrhh/trabajador/:id/ficha"', /rrhhPuedeLocal\(req, w\.local\)/],
    ['app.put("/api/rrhh/trabajador/:id"', /rrhhPuedeLocal\(req, w\.local\)/],
    ['app.get("/api/rrhh/trabajador/:id/documentos"', /rrhhPuedeLocal\(req, wl\)/],
    ['app.post("/api/rrhh/trabajador/:id/documento"', /rrhhPuedeLocal\(req, wl\)/],
    ['app.get("/api/rrhh/documento/:id/archivo"', /rrhhPuedeLocal\(req, wl\)/],
    ['app.delete("/api/rrhh/documento/:id"', /rrhhPuedeLocal\(req, wl\)/],
    ['app.post("/api/horarios/contrato"', /rrhhPuedeLocal\(req, w\.local/],
    ['app.post("/api/horarios/ausencia"', /rrhhPuedeLocal\(req, w\.local/],
    ['app.delete("/api/horarios/ausencia/:id"', /rrhhPuedeLocal\(req, a\.local/],
    ['app.put("/api/horarios/disponibilidad/:workerId"', /rrhhPuedeLocal\(req, w\.local/],
  ];
  for (const [ruta, re] of PORFICHA) {
    test(`${ruta.split('"')[1]} lee la fila y comprueba SU local`, () => {
      const i = server.indexOf(ruta);
      assert.ok(i > 0, `no se encuentra ${ruta}`);
      assert.match(server.slice(i, i + 1100), re);
    });
  }

  test("el listado de trabajadores acota al local del encargado en el SERVIDOR", () => {
    const b = bloque('app.get("/api/rrhh/trabajadores"', "// Alta de trabajador desde RRHH");
    assert.match(b, /const scope = rrhhLocalScope\(req\)/);
    assert.match(b, /AND local = \?/);
  });

  test("el encargado no puede crear gente en otro local ni ascender a nadie", () => {
    const b = bloque('app.post("/api/rrhh/trabajador"', "// Volver a poner la contraseña inicial");
    assert.match(b, /if \(esEncargado\(req\)\) \{ local = localScope\(req\); rol = "trabajador"; \}/);
    assert.match(b, /if \(!rrhhPuedeLocal\(req, local\)\)/);
  });
});

describe("Equipo · los documentos sensibles no son del encargado", () => {
  test("no salen en el listado", () => {
    const b = bloque('app.get("/api/rrhh/trabajador/:id/documentos"', "// Subida de documento endurecida");
    assert.match(b, /if \(esEncargado\(req\)\) docs = docs\.filter\(\(d\) => !\(d\.sensible === 1/);
  });
  test("ni en la ficha, donde además se le quita el DNI", () => {
    const b = bloque('app.get("/api/rrhh/trabajador/:id/ficha"', 'app.put("/api/rrhh/trabajador/:id"');
    assert.match(b, /w\.dni = null; documentos = documentos\.filter/);
  });
  test("ni puede borrarlos", () => {
    const b = bloque('app.delete("/api/rrhh/documento/:id"', "// ── RRHH: enlace con operadores");
    assert.match(b, /esEncargado\(req\) && \(doc\.sensible === 1/);
  });
  test("y el FICHERO tampoco: no se puede pedir por su URL", () => {
    // Es lo que de verdad protegía nada. Antes el archivo estaba en `public/uploads` y se
    // abría con el enlace, sin sesión.
    const b = bloque('app.get("/api/rrhh/documento/:id/archivo"', 'app.delete("/api/rrhh/documento/:id"');
    assert.match(b, /requireAuth\(RRHH_ROLES\)/);
    assert.match(b, /esEncargado\(req\) && \(doc\.sensible === 1/);
    assert.match(b, /rrhhDocsDir/, "y se sirve del directorio privado, fuera de public/");
    assert.match(b, /path\.basename\(/, "el nombre del fichero se limpia: nada de rutas del cliente");
  });
  test("los documentos nuevos ya no se escriben dentro de public/", () => {
    const b = bloque('app.post("/api/rrhh/trabajador/:id/documento"', 'app.get("/api/rrhh/documento/:id/archivo"');
    assert.match(b, /fs\.renameSync\(path\.join\(uploadsDir[^)]*\), path\.join\(rrhhDocsDir/);
    assert.match(b, /`rrhh:\$\{req\.file\.filename\}`/);
  });
});
