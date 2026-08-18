// Fase 0 — los bugs y riesgos que cerró la auditoría de RR.HH.
//
// Cada test de aquí es la prueba de un fallo concreto que existía. Si alguno vuelve a fallar,
// es que ha vuelto el fallo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

function bloque(desde, hasta) {
  const i = server.indexOf(desde);
  assert.ok(i > 0, `no se encuentra: ${desde}`);
  const f = server.indexOf(hasta, i + desde.length);
  assert.ok(f > i, `no se encuentra el final: ${hasta}`);
  return server.slice(i, f);
}

describe("1 · quien ya no trabaja aquí no entra", () => {
  test("el login comprueba la vigencia, y DESPUÉS de la contraseña", () => {
    // Antes: si acertaba la contraseña, entraba aunque llevara meses de baja.
    // El orden importa: comprobarlo antes de bcrypt convertiría el login en un buscador de
    // quién sigue en plantilla.
    const b = bloque('app.post("/api/auth/login"', "// Cambiar la propia contraseña");
    const iPass = b.indexOf("bcrypt.compare(password"), iVig = b.indexOf("bajaEfectiva(user");
    assert.ok(iPass > 0 && iVig > iPass, "la vigencia se mira después de validar la contraseña");
    assert.match(b, /!marcadoActivo\(user\) \|\| bajaEfectiva\(user, hoyISO\(\)\)/);
    assert.match(b, /status\(403\)/);
  });
  test("una baja con fecha FUTURA no echa a nadie antes de tiempo", () => {
    // Baja el 31 y hoy es 25: sigue trabajando, así que sigue entrando. Lo garantiza
    // `bajaEfectiva`, con sus tests en tests/modules/rrhh-vigencia.test.js.
    const b = bloque('app.post("/api/auth/login"', "// Cambiar la propia contraseña");
    assert.match(b, /hoyISO\(\)/, "se compara con el día de hoy, no con «tiene fecha o no»");
  });
  test("y queda registrado el intento", () => {
    assert.match(server, /login_bloqueado_baja/);
  });
});

describe("2 · a quien tiene histórico no se le borra, se le da de baja", () => {
  const b = () => bloque('app.delete("/api/users/:id"', "// Leads");
  test("se comprueban las tablas donde vive el histórico laboral", () => {
    const lista = bloque("const HISTORICO_LABORAL = [", "];");
    for (const t of ["fic_eventos", "fic_bolsa_movimientos", "fic_jornadas", "fic_correcciones",
                     "hor_asignaciones", "hor_contratos", "hor_ausencias",
                     "hr_documentos", "hr_worker_notes", "hr_llamadas_mes"]) {
      assert.ok(lista.includes(t), `falta ${t} en la comprobación`);
    }
  });
  test("con histórico se contesta 409 y se dice qué hacer", () => {
    assert.match(b(), /status\(409\)/);
    assert.match(b(), /no puede eliminarse/);
    assert.match(b(), /Dale de baja/);
  });
  test("y NO se ha añadido ninguna cascada: el registro de jornada no se borra nunca", () => {
    assert.ok(!/ON DELETE CASCADE[\s\S]{0,80}users/.test(server), "ha aparecido una cascada hacia users");
    assert.ok(!/DELETE FROM fic_eventos/.test(server), "fic_eventos sigue siendo inmutable");
  });
  test("una cuenta administrativa sin nada detrás sí se puede borrar", () => {
    assert.match(b(), /if \(historico\.length\)/);
    assert.match(b(), /await dbRun\("DELETE FROM users WHERE id = \?"/);
  });
});

describe("7 · el saldo de la bolsa es la suma de TODO", () => {
  test("dos consultas: el saldo sin recorte y la lista con él", () => {
    // Antes se calculaba `saldoDe()` sobre las 500 últimas filas, así que el modal podía decir
    // un número y la tabla de al lado otro. Y el bueno era el de la tabla.
    const b = bloque('app.get("/api/fichajes/bolsa/:workerId"', "// Ajuste manual:");
    assert.match(b, /COALESCE\(SUM\(minutos\),0\)::int AS saldo/);
    assert.ok(!/saldoDe\(movs\)/.test(b), "el saldo ya no se calcula sobre la lista recortada");
    assert.match(b, /LIMIT 500/, "la lista sí se recorta: nadie lee dos mil movimientos");
    assert.match(b, /recortado:/, "y se dice que está recortada");
  });
  test("la pantalla lo explica cuando hay más de los que se ven", () => {
    assert.match(app, /suma de los \$\{num\(j\.movimientos\)\} movimientos/);
  });
  test("y sigue sin existir ninguna columna `saldo`", () => {
    assert.ok(!/ALTER TABLE fic_bolsa_movimientos ADD COLUMN[\s\S]{0,40}saldo/.test(server));
    assert.ok(!/UPDATE fic_bolsa_movimientos/.test(server), "la bolsa sigue siendo append-only");
  });
});

describe("8 · ninguna transacción se queda abierta", () => {
  test("necesidades sale por excepción, nunca con un return dentro del BEGIN", () => {
    // Un `return` ahí devolvía al pool una conexión con un DELETE sin confirmar, y la
    // siguiente petición que la cogiera heredaba esa transacción.
    const b = bloque('app.put("/api/horarios/necesidades"', "// Los turnos del local (hor_tramos)");
    const iBegin = b.indexOf('client.query("BEGIN")');
    const despues = b.slice(iBegin);
    assert.ok(!/return res\.status/.test(despues.slice(0, despues.indexOf("catch"))),
      "hay un `return res` después del BEGIN y antes del catch");
    assert.match(b, /err\.publico = 400/);
    assert.match(b, /if \(e\.publico\) return res\.status\(e\.publico\)/);
  });
  test("y todos los endpoints transaccionales validan ANTES de abrir", () => {
    for (const ruta of ['app.put("/api/horarios/tramos"', 'app.put("/api/horarios/areas"',
                        'app.put("/api/horarios/disponibilidad/:workerId"']) {
      const i = server.indexOf(ruta);
      assert.ok(i > 0, ruta);
      const trozo = server.slice(i, i + 3000);
      const iBegin = trozo.indexOf('client.query("BEGIN")');
      const iCatch = trozo.indexOf("} catch (e)");
      assert.ok(iBegin > 0, `${ruta}: no abre transacción`);
      const cuerpo = trozo.slice(iBegin, iCatch > 0 ? iCatch : trozo.length);
      assert.ok(!/return res\.status/.test(cuerpo), `${ruta}: sale con return dentro de la transacción`);
    }
  });
});

describe("9 · un solo contrato vigente por persona y fecha", () => {
  test("el alta cierra también el que empieza el MISMO día", () => {
    const b = bloque('app.post("/api/horarios/contrato"', 'app.post("/api/horarios/ausencia"');
    assert.match(b, /hasta IS NULL AND desde <= \?/, "antes era `<` y dejaba dos vigentes");
  });
  test("si ya había solapes de antes, se DICEN y no se tocan", () => {
    // Con dos contratos pisándose no se puede saber cuál se quiso poner. Elegir por el usuario
    // escribiría en una nómina una cifra que nadie ha decidido.
    const b = bloque('app.post("/api/horarios/contrato"', 'app.post("/api/horarios/ausencia"');
    assert.match(b, /contratosSolapados\(suyos\)/);
    assert.ok(!/DELETE FROM hor_contratos/.test(server), "no se borra ningún contrato");
    assert.match(server, /contratosSolapados: contratosSolapados\(contratos\)/, "y se ven en la configuración");
  });
});

describe("10 · el descanso entre el domingo y el lunes siguiente", () => {
  test("se traen los turnos publicados de los días de al lado", () => {
    const b = bloque("async function horVecinas(", "const AUS_DEL_LOCAL");
    assert.match(b, /s\.estado = 'publicado'/, "del horario publicado, no de un borrador");
    assert.match(b, /sumaDias\(dias\[0\], -1\), sumaDias\(dias\[6\], 1\)/);
  });
  test("entran tanto al abrir la semana como al publicar", () => {
    assert.match(bloque('app.get("/api/horarios/semana/:id/conflictos"', "// Copiar una semana"), /vecinas/);
    assert.match(bloque('app.post("/api/horarios/semana/:id/publicar"', "// Crear una versión nueva"), /vecinas/);
  });
  test("sigue siendo un AVISO, no un bloqueo", () => {
    const c = readFileSync(new URL("../src/modules/horarios/conflictos.js", import.meta.url), "utf8");
    assert.match(c, /tipo: "descanso_insuficiente", severidad: AVISA/);
  });
});

describe("11 · dar de baja avisa de los turnos que quedan, y no borra ninguno", () => {
  test("se separan los de borrador de los ya publicados", () => {
    const b = bloque('app.put("/api/rrhh/trabajador/:id"', 'app.get("/api/rrhh/trabajador/:id/documentos"');
    assert.match(b, /turnosTrasLaBaja\(/);
    assert.match(b, /enBorrador:/);
    assert.match(b, /publicados:/);
    assert.ok(!/DELETE FROM hor_asignaciones/.test(b), "no se borra ni un turno al dar de baja");
  });
  test("y el copiado de semanas no vuelve a meterlo después de su baja", () => {
    const b = bloque('app.post("/api/horarios/semana/:id/copiar"', "const addDiasISO");
    assert.match(b, /activoAhora\(w, l\.dia\)/, "se decide día a día, no de golpe");
    assert.match(b, /causó baja el/);
  });
});

describe("12 · un fichaje que llega a un periodo cerrado", () => {
  const b = () => bloque('app.post("/api/fichar/:token/evento"', "// ── Panel: quién está dentro");
  test("se guarda igual: la persona trabajó y eso es una prueba", () => {
    assert.match(b(), /INSERT INTO fic_eventos/);
    const iIns = b().indexOf("INSERT INTO fic_eventos"), iChk = b().indexOf("ficBloqueoPorCierre");
    assert.ok(iChk > iIns, "el cierre se mira DESPUÉS de guardar, no para rechazarlo");
  });
  test("no muta nada de lo cerrado", () => {
    // La bolsa solo la escriben `validar` y `cerrar`, y las dos comprueban el cierre.
    for (const ruta of ['app.post("/api/fichajes/validar"', 'app.post("/api/fichajes/bolsa/ajuste"',
                        'app.post("/api/fichajes/evento"', 'app.post("/api/fichajes/evento/:id/anular"']) {
      const i = server.indexOf(ruta);
      assert.match(server.slice(i, i + 1600), /ficBloqueoPorCierre\(/, `${ruta} no comprueba el cierre`);
    }
  });
  test("queda en auditoría y se le dice a la persona", () => {
    assert.match(b(), /"en_periodo_cerrado"/);
    assert.match(b(), /periodoCerrado: !!cerrado/);
    assert.match(b(), /lo tiene que revisar tu encargado/);
  });
  test("y se ve desde el panel sin ir a buscarlo", () => {
    assert.match(server, /llegados_tras_cerrar/);
    assert.match(server, /llegadosTrasCerrar/);
    assert.match(app, /llegadosTrasCerrar/);
  });
});

describe("13 · cambiar de local no hace ilegible el histórico", () => {
  test("los nombres de la revisión se buscan por los ids que salen, no por el local de hoy", () => {
    // La garantía es la misma; en la Fase 1 el cálculo se movió del endpoint a
    // `ficCalcularPeriodo`, que es donde se cargan ahora todos los datos de golpe.
    const b = bloque("async function ficCalcularPeriodo(", "async function ficGuardarProyeccion(");
    assert.match(b, /const ids = \[\.\.\.new Set\(\[\.\.\.pares\.values\(\)\]\.map\(\(x\) => x\.worker_id\)\)\]/);
    assert.match(b, /FROM users WHERE id = ANY\(\?\)/);
    assert.ok(!/SELECT id, nombre FROM users WHERE local = \?`, \[local\]/.test(b));
  });
  test("y la bolsa conserva a quien se fue con saldo pendiente", () => {
    const b = bloque('app.get("/api/fichajes/bolsa"', 'app.get("/api/fichajes/bolsa/:workerId"');
    assert.match(b, /OR id IN \(SELECT DISTINCT worker_id FROM fic_bolsa_movimientos WHERE local = \?\)/);
  });
});

describe("los invariantes siguen en pie", () => {
  test("fic_eventos: solo se actualiza `anulado_por`", () => {
    const updates = [...server.matchAll(/UPDATE fic_eventos SET ([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(updates)], ["anulado_por"]);
    assert.ok(!/DELETE FROM fic_eventos/.test(server));
  });
  test("nunca se copia lo planificado sobre lo fichado", () => {
    assert.ok(!/min_fichado\s*=\s*[^,)\s]*min_planificado/.test(server));
    assert.ok(!/min_planificado\s*=\s*[^,)\s]*min_fichado/.test(server));
  });
  test("la validación sigue llevando firma", () => {
    assert.match(server, /firma_eventos = \?/);
    assert.match(server, /firmaDeEventos\(eventos\)/);
  });
  test("una semana publicada sigue sin poderse editar", () => {
    assert.match(server, /Solo se puede editar el borrador/);
  });
  test("el generador sigue solo proponiendo", () => {
    const b = bloque('app.post("/api/horarios/generar"', 'app.post("/api/horarios/generar/aceptar"');
    assert.ok(!/INSERT INTO hor_asignaciones/.test(b), "el generador ha empezado a escribir");
  });
  test("el pulso sigue sin poder cruzarse", () => {
    const crear = server.slice(server.indexOf("CREATE TABLE IF NOT EXISTS pulso_respuestas"));
    const cuerpo = crear.slice(0, crear.indexOf(")"));
    assert.ok(!/worker_id|token|creado_en|fecha/.test(cuerpo),
      `la tabla de respuestas ha ganado una columna identificadora:\n${cuerpo}`);
  });
});
