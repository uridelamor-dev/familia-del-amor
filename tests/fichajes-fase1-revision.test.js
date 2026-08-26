// Fase 1 — revisión por excepciones y validación en lote.
//
// Lo que estos tests sujetan no es el rendimiento: es que el botón que valida doscientas
// jornadas de golpe no pueda validar ni una que necesitara que la mirara alguien.
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

describe("el cálculo del periodo carga en bloque", () => {
  const b = () => bloque("async function ficCalcularPeriodo(", "async function ficGuardarProyeccion(");

  test("ninguna consulta dentro de un bucle", () => {
    // Era el cuello de botella: cinco viajes a la base por cada pareja (persona, día).
    const cuerpo = b();
    const iBucle = cuerpo.indexOf("for (const { worker_id, dia } of pares.values())");
    assert.ok(iBucle > 0, "sigue existiendo el bucle de cálculo");
    const dentro = cuerpo.slice(iBucle);
    for (const q of ["dbAll(", "dbGet(", "dbRun(", "await "]) {
      assert.ok(!dentro.includes(q), `el bucle de jornadas hace «${q}»: ha vuelto el N+1`);
    }
  });

  test("y el bucle no es asíncrono, que es lo que lo delataría", () => {
    assert.ok(!/for \(const \{ worker_id, dia \} of pares\.values\(\)\) \{[\s\S]{0,600}?await /.test(b()));
  });

  test("se reutilizan las funciones puras de siempre, sin reescribir las reglas en SQL", () => {
    const cuerpo = b();
    assert.match(cuerpo, /construirJornada\(\{/);
    assert.match(cuerpo, /firmaDeEventos\(evs\)/);
    assert.match(cuerpo, /clasificarJornada\(\{/);
    // Si alguien reimplementara las incidencias en SQL, aquí aparecerían sus nombres.
    for (const t of ["sin_salida", "sin_entrada", "entrada_tarde", "jornada_larga"]) {
      assert.ok(!cuerpo.includes(`'${t}'`), `la regla «${t}» se ha escrito en SQL`);
    }
  });

  test("los eventos se traen por persona y día, NO por local", () => {
    // Es lo que hacía el cálculo de una jornada. Filtrar por local aquí partiría en dos la
    // jornada de quien fichara en dos sitios el mismo día, sin que nadie lo hubiera pedido.
    assert.match(b(), /FROM fic_eventos WHERE worker_id = ANY\(\?\) AND dia_negocio BETWEEN/);
  });

  test("la proyección se guarda en bloques, no de una en una", () => {
    const g = bloque("async function ficGuardarProyeccion(", 'app.get("/api/fichajes/jornada"');
    assert.match(g, /const TROZO = 200/);
    assert.match(g, /ON CONFLICT \(worker_id, dia_negocio\) DO UPDATE/);
  });

  test("`requiere_revision` se guarda igual que antes", () => {
    // Es lo que lee el índice parcial de pendientes: si cambiara su significado, cambiaría
    // lo que otras pantallas consideran pendiente.
    assert.match(bloque("async function ficGuardarProyeccion(", 'app.get("/api/fichajes/jornada"'),
      /f\.jornada\.requiereRevision \|\| f\.estado === CADUCADA/);
  });
});

describe("el resumen y el lote salen de la misma regla", () => {
  test("el endpoint de revisión usa `resumirRevision`, no cuenta por su cuenta", () => {
    assert.match(bloque('app.get("/api/fichajes/revision"', "// ── Correcciones"), /resumen: resumirRevision\(filas\)/);
  });
  test("y el lote usa `candidatasDeLote`, que filtra por lo mismo", () => {
    assert.match(bloque('app.post("/api/fichajes/validar-lote"', "// ── Bolsa de horas"), /candidatasDeLote\(filas\)/);
  });
  test("el panel NO decide por su cuenta qué es validable", () => {
    // Si el navegador tuviera su propia regla, el botón diría un número y el servidor haría otro.
    assert.ok(!/nivel === "revisar"[\s\S]{0,120}puedeLote/.test(app), "el panel calcula si algo es validable");
    assert.match(app, /r\.listas_para_validar/, "usa el número que le da el servidor");
  });
});

describe("la validación en lote no se fía del navegador", () => {
  const b = () => bloque('app.post("/api/fichajes/validar-lote"', "// ── Bolsa de horas");

  test("recalcula el periodo entero antes de tocar nada", () => {
    const iCalc = b().indexOf("await ficCalcularPeriodo("), iEscribir = b().indexOf("ficEscribirValidacion(");
    assert.ok(iCalc > 0 && iEscribir > iCalc, "se valida sobre una foto vieja");
  });

  test("la lista que manda el cliente solo puede RECORTAR, nunca ampliar", () => {
    assert.match(b(), /candidatas = candidatas\.filter\(\(f\) => quiere\.has/);
    // Lo que se valida sale de `candidatasDeLote`, y la lista del cliente se interseca después.
    const iCand = b().indexOf("candidatasDeLote(filas)"), iFiltro = b().indexOf("quiere.has");
    assert.ok(iCand < iFiltro);
  });

  test("relee los eventos justo antes de escribir y compara la firma", () => {
    assert.match(b(), /const frescos = await dbAll\(/);
    assert.match(b(), /if \(firmaAhora !== f\.firma\)/);
    assert.match(b(), /cambió mientras se validaba/);
  });

  test("una sola consulta para releerlos todos, no una por jornada", () => {
    const cuerpo = b();
    const iBucle = cuerpo.indexOf("for (const f of candidatas)");
    assert.ok(!cuerpo.slice(iBucle).includes("dbAll("), "el bucle del lote consulta la base");
  });

  test("no es todo o nada: una que falle no se lleva a las demás", () => {
    assert.match(b(), /omitidas\.push\(/);
    assert.ok(!/BEGIN/.test(b()), "una transacción única obligaría a deshacerlo todo por una");
    assert.match(b(), /validadas, minutos, omitidas/);
  });

  test("el lote NO redondea los minutos", () => {
    // La tolerancia sirve para clasificar una incidencia, no para cambiar el tiempo trabajado.
    const cuerpo = b();
    assert.match(cuerpo, /minutos: f\.minEfectivo/);
    assert.ok(!/Math\.round\([^)]*60\)|redondeo/.test(cuerpo), "ha aparecido un redondeo");
  });
});

describe("individual y lote hacen exactamente lo mismo", () => {
  test("los dos pasan por `ficEscribirValidacion`", () => {
    assert.match(bloque('app.post("/api/fichajes/validar"', 'app.post("/api/fichajes/validar-lote"'), /await ficEscribirValidacion\(/);
    assert.match(bloque('app.post("/api/fichajes/validar-lote"', "// ── Bolsa de horas"), /await ficEscribirValidacion\(/);
  });
  test("y ese servicio hace UPDATE, auditoría y bolsa, en ese orden", () => {
    const s = bloque("async function ficEscribirValidacion(", 'app.post("/api/fichajes/validar"');
    const iUp = s.indexOf("UPDATE fic_jornadas"), iAud = s.indexOf("ficAuditar("), iBolsa = s.indexOf("ficApuntarJornada(");
    assert.ok(iUp > 0 && iAud > iUp && iBolsa > iAud);
  });
  test("la bolsa se apunta con la función de siempre, no con una copia", () => {
    const s = bloque("async function ficEscribirValidacion(", 'app.post("/api/fichajes/validar"');
    assert.match(s, /ficApuntarJornada\(local, workerId, dia, \{ autor \}\)/);
    assert.ok(!/INSERT INTO fic_bolsa_movimientos/.test(s), "el servicio escribe la bolsa por su cuenta");
  });
});

describe("idempotencia: el botón se puede pulsar dos veces", () => {
  test("el lote solo escribe si la jornada NO estaba validada, y lo comprueba la BASE", () => {
    // La condición va DENTRO del UPDATE: dos peticiones a la vez no pueden validar dos veces.
    const s = bloque("async function ficEscribirValidacion(", 'app.post("/api/fichajes/validar"');
    assert.match(s, /soloSiSinValidar \? " AND min_validado IS NULL" : ""/);
    assert.match(s, /RETURNING worker_id/);
    assert.match(s, /if \(!fila\) return \{ escrita: false, motivo: "ya_validada" \}/);
  });
  test("el lote lo pide y la validación individual NO", () => {
    // La individual sí tiene que poder revalidar: es lo que hace falta cuando una caduca.
    assert.match(bloque('app.post("/api/fichajes/validar-lote"', "// ── Bolsa de horas"), /soloSiSinValidar: true/);
    // Se mira el CÓDIGO, no los comentarios: ahí se explica justamente por qué no lo lleva.
    const ind = bloque('app.post("/api/fichajes/validar"', 'app.post("/api/fichajes/validar-lote"')
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.ok(!/soloSiSinValidar/.test(ind));
  });
  test("y la bolsa sigue teniendo su propia idempotencia por la clave", () => {
    assert.match(server, /clave_idem\) DO NOTHING/);
  });
});

describe("aislamiento y permisos del lote", () => {
  test("resuelve el local con horLocal, así que un encargado no puede pedir otro", () => {
    assert.match(bloque('app.post("/api/fichajes/validar-lote"', "// ── Bolsa de horas"),
      /const local = horLocal\(req, req\.body\?\.local\)/);
  });
  test("exige los roles de VALIDAR, que no son los de fichajes", () => {
    // El encargado entra en Fichajes y ve la revisión —es su equipo y su cuadrante— pero no
    // aprueba horas: de ahí salen el saldo de la bolsa y la nómina, y quien corrige un
    // fichaje no se aprueba a sí mismo.
    assert.match(server, /app\.post\("\/api\/fichajes\/validar-lote", requireAuth\(VALIDAR_ROLES\)/);
    assert.match(server, /const VALIDAR_ROLES = \["direccion", "rrhh"\]/);
  });
  test("y todo lo que calcula va acotado a ese local", () => {
    const b = bloque("async function ficCalcularPeriodo(", "async function ficGuardarProyeccion(");
    // Acotado sigue estando: `ficLocales` devuelve las barras del CENTRO —las dos de Blanes,
    // una sola para el resto— y nunca un establecimiento ajeno. El histórico de fichajes no
    // se puede mover de barra (`fic_eventos` es inmutable), así que se lee sumando.
    assert.match(b, /FROM fic_eventos\s*\n?\s*WHERE local = ANY\(\?\)/);
    assert.match(b, /ficLocales\(local\), desde, hasta/);
    assert.match(server, /const ficLocales = \(local\) => barrasDelCentro\(local, "personal"\)/);
    assert.match(b, /WHERE a\.local = \? AND s\.estado = 'publicado'/);
    assert.match(b, /WHERE s\.local = \? AND s\.estado = 'publicado'/);
  });
  test("un periodo cerrado no se toca ni en lote ni individualmente", () => {
    assert.match(bloque("async function ficCalcularPeriodo(", "async function ficGuardarProyeccion("), /estaCerrado\(cierres, local, dia\)/);
    assert.match(bloque('app.post("/api/fichajes/validar"', 'app.post("/api/fichajes/validar-lote"'), /ficBloqueoPorCierre\(/);
  });
});

describe("nada de automatismos", () => {
  test("no hay ningún cron ni temporizador que valide solo", () => {
    // La decisión sigue siendo humana: esto solo da un botón para resolver de golpe lo que no
    // necesita criterio.
    assert.ok(!/setInterval[\s\S]{0,200}validar/i.test(server), "algo valida por su cuenta");
    assert.ok(!/validar-lote/.test(server.slice(0, server.indexOf('app.post("/api/fichajes/validar-lote"'))),
      "alguien llama al lote desde dentro del servidor");
  });
  test("y no interviene ninguna IA: son reglas deterministas", () => {
    const r = readFileSync(new URL("../src/modules/fichajes/revision.js", import.meta.url), "utf8");
    assert.ok(!/anthropic|openai|messages\.create|modelo/i.test(r));
  });
});

describe("la pantalla", () => {
  test("el botón dice CUÁNTAS y que son las correctas", () => {
    // «Validar todo» daría a entender que también se aprueban las que tienen incidencias.
    assert.match(app, /Validar \$\{num\(r\.listas_para_validar\)\} \$\{r\.listas_para_validar === 1 \? "jornada correcta" : "jornadas correctas"\}/);
  });
  test("la confirmación dice también lo que NO se valida", () => {
    assert.match(app, /seguirán pendientes/);
  });
  test("lo que pide una decisión va abierto; lo informativo, plegado y cerrado", () => {
    assert.match(app, /const seccionFija = \(estados, titulo\)/);
    assert.match(app, /const seccionPlegada = \(estados, titulo\)/);
    // El orden de la pantalla es la prioridad.
    const i1 = app.indexOf('seccionFija(["requiere_revision"');
    const i2 = app.indexOf('seccionPlegada(["abierta"]');
    const i3 = app.indexOf('seccionPlegada(["lista_para_validar"]');
    const i4 = app.indexOf('seccionPlegada(["validada"]');
    assert.ok(i1 > 0 && i1 < i2 && i2 < i3 && i3 < i4, "el orden de la pantalla no es el de la prioridad");
  });
  test("la comparación plan vs realidad se ve sin abrir la jornada", () => {
    assert.match(app, /Cuadrante <b>\$\{esc\(ficTramos\(f\.plan\)\)\}<\/b> · Fichado <b>\$\{esc\(ficTramos\(f\.fichado\)\)\}<\/b>/);
  });
  test("y el detalle enseña plan, fichado, pausas, efectivo y diferencia", () => {
    const i = app.indexOf('<div class="fic-comp">');
    assert.ok(i > 0, "falta el bloque de comparación");
    const b = app.slice(i, i + 1200);
    for (const t of ["Cuadrante", "Fichado", "Pausas", "Efectivo", "Contra el plan"]) {
      assert.ok(b.includes(t), `falta «${t}» en el detalle`);
    }
  });
});

describe("los invariantes siguen en pie", () => {
  test("fic_eventos sigue sin tocarse", () => {
    const updates = [...server.matchAll(/UPDATE fic_eventos SET ([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(updates)], ["anulado_por"]);
    assert.ok(!/DELETE FROM fic_eventos/.test(server));
  });
  test("la bolsa sigue siendo append-only", () => {
    assert.ok(!/UPDATE fic_bolsa_movimientos/.test(server));
    assert.ok(!/DELETE FROM fic_bolsa_movimientos/.test(server));
  });
  test("la validación sigue llevando firma", () => {
    assert.match(bloque("async function ficEscribirValidacion(", 'app.post("/api/fichajes/validar"'), /firma_eventos = \?/);
  });
  test("nunca se copia lo planificado sobre lo fichado", () => {
    assert.ok(!/min_fichado\s*=\s*[^,)\s]*min_planificado/.test(server));
    assert.ok(!/min_planificado\s*=\s*[^,)\s]*min_fichado/.test(server));
  });
  test("el export legal no lo toca nadie", () => {
    const e = bloque('app.get("/api/fichajes/export"', "app.get(\"/api/mi-cuadrante\"");
    assert.match(e, /construirCsv\(/);
    assert.ok(!/min_validado|lista_para_validar/.test(e), "la validación se ha colado en el registro legal");
  });
  test("y el aviso de los fichajes que llegan a un periodo cerrado sigue ahí", () => {
    assert.match(server, /"en_periodo_cerrado"/);
    assert.match(server, /llegados_tras_cerrar/);
  });
});
