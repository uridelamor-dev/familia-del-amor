import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// La pantalla de Revisión pasa a enseñar TRES magnitudes, a poder moverse por las fechas y a
// dejar validar desde la propia fila. Esto sujeta la forma nueva y, sobre todo, sujeta los
// cuatro fallos que arrastraba, para que no vuelvan.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const bloque = (desde, hasta) => {
  const i = server.indexOf(desde);
  assert.ok(i > 0, `no se encuentra: ${desde}`);
  const f = server.indexOf(hasta, i + desde.length);
  assert.ok(f > i, `no se encuentra el final: ${hasta}`);
  return server.slice(i, f);
};

describe("las pestañas de Fichajes se llaman igual desde dentro que desde fuera", () => {
  test("no hay ningún FIC.tab que apunte a una pestaña que no existe", () => {
    // EL FALLO QUE ESTO CAZA: los botones decían `data-fictab="rev"` y tres sitios de fuera
    // —el aviso de RR.HH., «Ir a validarlas» de la bolsa y «Ver sus fichajes» de la ficha—
    // hacían `FIC.tab = "revision"`. Los tres aterrizaban en «Quién está dentro», sin error
    // y sin que nada se pintara mal: simplemente no llegabas donde decía el botón.
    const existen = new Set([...app.matchAll(/data-fictab="([a-z]+)"/g)].map((m) => m[1]));
    assert.ok(existen.size >= 4, "no se han encontrado las pestañas");
    const usados = [...app.matchAll(/FIC\.tab = "([a-z]+)"/g)].map((m) => m[1]);
    assert.ok(usados.length >= 3, "no se han encontrado los enlaces a pestañas");
    for (const t of usados) assert.ok(existen.has(t), `FIC.tab = "${t}" no existe como pestaña`);
  });

  test("y la tira no se parte en dos filas en el móvil", () => {
    // `.tabstrip` es lo que la vuelve deslizable por debajo de 820 px. Sin él, cuatro botones
    // envuelven y la pantalla empieza con dos filas de pestañas.
    assert.match(app, /<div class="toolbar tabstrip"[^>]*id="ficTabs">/);
  });
});

describe("moverse por las fechas", () => {
  const rev = bloque('app.get("/api/fichajes/revision"', "// ── Correcciones");

  test("se abre en el PERIODO DE NÓMINA, no en catorce días que no se podían cambiar", () => {
    assert.match(rev, /rangoPorDefecto\(/);
    assert.ok(!/sumaDias\(hasta, -13\)/.test(rev), "vuelven los catorce días fijos");
  });

  test("la aritmética de calendario la hace el módulo puro, no el endpoint ni el panel", () => {
    // El panel no tiene bundler y no puede importar `bolsa.js`. Un espejo de fechas en el
    // navegador acabaría diciendo un mes distinto en febrero o al cambiar el día de corte.
    assert.match(rev, /navegarRevision\(\{ desde, hasta, hoy: hoy\.diaNegocio, diaInicio \}\)/);
    assert.ok(!/periodoDe\(/.test(rev), "el endpoint no debería recalcular el periodo por su cuenta");
    assert.ok(!/navegarRevision|periodoDe\(/.test(app), "el panel no hace aritmética de periodos");
  });

  test("el panel solo pinta los rangos que le llegan", () => {
    assert.match(app, /data-ficrango="\$\{esc\(rango\.desde\)\}\|\$\{esc\(rango\.hasta\)\}"/);
  });

  test("hacia delante no se ofrece si no hay nada que revisar", () => {
    assert.match(app, /<button class="btn sm" disabled title="Hacia delante/);
  });

  test("un día suelto abre su periodo entero, no el día a solas", () => {
    assert.match(rev, /rangoPorDefecto\(qHasta \|\| qDesde \|\| hoy\.diaNegocio/);
  });
});

describe("validar desde la fila", () => {
  test("lo decide el SERVIDOR, no el navegador", () => {
    // Las reglas de qué se puede validar viven en `revision.js`. Si el panel las dedujera,
    // habría dos sitios donde cambiarlas y uno de los dos se quedaría viejo.
    assert.match(server, /unClic: f\.unClic, motivoUnClic: f\.motivoUnClic/);
    assert.match(app, /f\.unClic \?/);
    assert.ok(!/nivel === "revisar"[\s\S]{0,120}puedeLote/.test(app), "el panel está decidiendo qué es validable");
  });

  test("reusa el endpoint de siempre: ni una ruta nueva", () => {
    const fn = app.slice(app.indexOf("async function ficValidarUna("), app.indexOf("async function ficValidarLote("));
    assert.match(fn, /apiSend\("POST", "\/api\/fichajes\/validar"/);
    assert.match(fn, /aceptar_incidencias: true/);
    assert.ok(!/minutos:/.test(fn), "sin `minutos`: cambiar la cifra exige motivo y eso es del detalle");
  });

  test("el botón dice la cifra, porque no hay «¿estás seguro?»", () => {
    // Con quince incidencias, quince diálogos cuestan lo mismo que abrir quince veces el
    // detalle — justo el trabajo que esto viene a quitar. El texto ES la confirmación.
    assert.match(app, /Validar \$\{esc\(ficHoras\(f\.minCuenta/);
    const fn = app.slice(app.indexOf("async function ficValidarUna("), app.indexOf("async function ficValidarLote("));
    assert.ok(!/confirmModal/.test(fn));
  });

  test("y no abre además el detalle de lo que se acaba de resolver", () => {
    const i = app.indexOf('const ok = e.target.closest("[data-ficok]");');
    const j = app.indexOf('const fila = e.target.closest("[data-ficjor]");', i);
    assert.ok(i > 0 && j > i, "el atajo tiene que mirarse ANTES de abrir la jornada");
    assert.match(app.slice(i, j), /stopPropagation\(\)/);
  });
});

describe("el filtro por persona", () => {
  test("FIC.q se LEE, no solo se escribe", () => {
    // Se escribía desde «Ver sus fichajes» de la ficha y no lo leía nadie: ese botón llevaba
    // a la revisión entera del periodo, con el nombre guardado en una variable muerta.
    assert.match(app, /const q = ficNorm\(FIC\.q\)/);
    assert.match(app, /id="ficQ"/);
  });

  test("filtra en el navegador: volver a pedir por cada tecla haría inusable el buscador", () => {
    assert.match(app, /ficNorm\(f\.nombre\)\.includes\(q\)/);
  });

  test("EL NÚMERO DEL BOTÓN Y LA LISTA QUE SE MANDA SALEN DE LA MISMA VARIABLE", () => {
    // Si divergieran, con el filtro puesto el botón prometería validar doce jornadas y
    // validaría las doscientas del periodo. La lista se calcula una vez y viaja.
    assert.match(app, /const paraLote = visibles\.filter\(\(f\) => f\.estado === "lista_para_validar" && f\.puedeLote\)/);
    assert.match(app, /listas_para_validar: paraLote\.length/);
    assert.match(app, /ficValidarLote\(j, paraLote\)/);
    assert.match(app, /jornadas: lista\.map\(\(f\) => \(\{ worker_id: f\.worker_id, dia: f\.dia \}\)\)/);
  });

  test("y la confirmación avisa de que solo toca lo filtrado", () => {
    assert.match(app, /el resto del periodo no se toca/);
  });
});

describe("lo que se encontró al repasarlo antes de publicar", () => {
  test("el buscador conserva el cursor donde estaba", () => {
    // Filtrar repinta la lista entera, y con ella el propio buscador. Mandando el cursor al
    // final, corregir una letra de en medio dejaba el resto de la palabra detrás y lo
    // siguiente se escribía al revés: «mrta» + Z daba «mrtaZ» en vez de «mZrta».
    // OJO: `cont.onclick` aparece antes en el fichero, en otra pantalla. Se busca el final
    // A PARTIR del principio del trozo, no desde el principio de todo.
    const i = app.indexOf('const caja = cont.querySelector("#ficQ")');
    assert.ok(i > 0, "no se encuentra el buscador");
    const fn = app.slice(i, app.indexOf("cont.onclick = (e) =>", i));
    assert.match(fn, /const pos = caja\.selectionStart/);
    assert.match(fn, /setSelectionRange\(pos, pos\)/);
    assert.ok(!/setSelectionRange\(c2\.value\.length/.test(app), "vuelve a mandar el cursor al final");
  });

  test("el rango que devuelve el servidor NO se guarda", () => {
    // Si se guardara, el periodo quedaría congelado: quien entrara hoy seguiría viendo esta
    // nómina dentro de un mes sin haber pedido nada. Solo escriben en `FIC.desde/hasta` las
    // flechas y los atajos, que sí los pulsa alguien.
    const fn = app.slice(app.indexOf("async function ficPintarRevision()"), app.indexOf("function ficPintarRevisionDatos"));
    assert.ok(!/FIC\.desde = j\.desde/.test(fn), "el rango se está congelando");
    assert.match(app, /FIC\.desde = d; FIC\.hasta = h; return ficPintarRevision\(\)/);
  });

  test("no se guarda nada que luego no lea nadie", () => {
    // Es el mismo fallo que tenía `FIC.q`: una variable que se escribe, no se lee, y hace
    // creer que la pantalla hace algo que no hace.
    for (const v of ["FIC.rev"]) {
      const usos = (app.match(new RegExp(v.replace(".", "\\."), "g")) || []).length;
      assert.equal(usos, 0, `${v} se escribe y no lo lee nadie`);
    }
    // Y el atajo lleva en su atributo solo lo que `ficValidarUna` lee: persona y día.
    assert.match(app, /data-ficok="\$\{f\.worker_id\}\|\$\{esc\(f\.dia\)\}"/);
    assert.match(app, /const \[w, dia\] = btn\.getAttribute\("data-ficok"\)\.split\("\|"\)/);
  });

  test("una validación caducada dice CUÁNTO se había validado antes", () => {
    // «Se validó y luego cambió» no dice si el cambio fue de dos minutos o de dos horas, que
    // es justo lo que hay que saber para decidir.
    assert.match(server, /cuentaAntes: cuenta\.decididoAntes/);
    assert.match(app, /se validó\$\{f\.cuentaAntes != null/);
  });
});

describe("las ausencias se ven, pero no tapan nada", () => {
  test("el cálculo de la jornada sigue sin saber qué es una ausencia", () => {
    // Un turno publicado durante una baja aprobada es una incoherencia REAL del cuadrante y
    // tiene que seguir saltando: se arregla republicando el horario, no escondiendo el aviso.
    const calc = bloque("async function ficCalcularPeriodo(", "async function ficGuardarProyeccion(");
    assert.ok(!/ausencia|hor_ausencias/.test(calc), "la revisión de fichajes mira las ausencias para callar incidencias");
  });

  test("el contexto se cuelga DESPUÉS de contar, y por eso no cambia ningún número", () => {
    const rev = bloque('app.get("/api/fichajes/revision"', "// ── Correcciones");
    const iResumen = rev.indexOf("resumen: resumirRevision(filas)");
    const iContexto = rev.indexOf("conContextoDeAusencia(");
    assert.ok(iResumen > 0 && iContexto > iResumen, "etiquetar la ausencia no puede influir en los contadores");
    assert.match(rev, /indiceDeAusencias\(/);
  });

  test("solo las aprobadas: una petición pendiente todavía no es una realidad", () => {
    const rev = bloque('app.get("/api/fichajes/revision"', "// ── Correcciones");
    assert.match(rev, /AUS_DEL_LOCAL/);
    assert.match(server, /AUS_DEL_LOCAL = `[\s\S]{0,300}a\.estado = 'aprobada'/);
  });

  test("y la etiqueta cuelga de una sola función, para poder vigilarla", () => {
    assert.match(app, /const ficEtiquetaAusencia = \(f\) =>/);
    assert.match(app, /estaba de \$\{esc\(String\(f\.ausencia\.etiqueta/);
  });
});

describe("las tres magnitudes, en la fila", () => {
  test("cuadrante, reloj y lo que cuenta", () => {
    assert.match(app, /Cuadrante <b>\$\{esc\(ficTramos\(f\.plan\)\)\}<\/b> · Fichado <b>\$\{esc\(ficTramos\(f\.fichado\)\)\}<\/b>/);
    // La tercera va destacada y con su rótulo, no repetida dentro del texto: el mismo
    // número dos veces en la misma fila hace dudar de si son dos cosas distintas.
    const ficha = app.slice(app.indexOf("const ficha = (f) =>"), app.indexOf("const filaCorta = (f) =>"));
    assert.match(ficha, /class="fic-cuenta"[\s\S]{0,200}>Cuenta</);
    assert.match(ficha, /ficHoras\(f\.minCuenta != null \? f\.minCuenta : f\.minEfectivo\)/);
    assert.match(ficha, /f\.cuentaOrigen === "validado" \? "decidido"/);
  });

  test("lo que cuenta lo calcula el servidor con la función pura", () => {
    const rev = bloque('app.get("/api/fichajes/revision"', "// ── Correcciones");
    assert.match(rev, /cuentaDeJornada\(\{ jornada: f\.jornada, validacion: f\.validacion, caducada: f\.estado === CADUCADA \}\)/);
    assert.match(rev, /minCuenta: cuenta\.minutos, cuentaOrigen: cuenta\.origen/);
  });

  test("se VE, no se edita: cambiar las horas exige un motivo y eso es del detalle", () => {
    const ficha = app.slice(app.indexOf("const ficha = (f) =>"), app.indexOf("const filaCorta = (f) =>"));
    assert.ok(!/<input/.test(ficha), "una hora editable en la fila se saltaría el motivo escrito");
  });

  test("en la tabla, la PERSONA va primera", () => {
    // En el móvil la primera columna se queda fija al desplazar. Estaba fija la fecha, y el
    // nombre se iba con el scroll: una tabla de horas de alguien, sin ese alguien.
    assert.match(app, /<thead><tr><th>Persona<\/th><th>Día<\/th>/);
  });
});

describe("los invariantes siguen en pie", () => {
  test("fic_eventos sigue intacto", () => {
    const updates = [...server.matchAll(/UPDATE fic_eventos SET ([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(updates)], ["anulado_por"]);
    assert.ok(!/DELETE FROM fic_eventos/.test(server));
  });

  test("la bolsa sigue siendo append-only y sin puertas nuevas", () => {
    assert.ok(!/UPDATE fic_bolsa_movimientos|DELETE FROM fic_bolsa_movimientos/.test(server));
    const sinComentarios = server.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    assert.equal((sinComentarios.match(/INSERT INTO fic_bolsa_movimientos/g) || []).length, 5,
      "validar desde la fila tiene que reusar el camino de siempre, no abrir uno nuevo");
  });

  test("nunca se copia lo planificado sobre lo fichado", () => {
    assert.ok(!/min_fichado\s*=\s*[^,)\s]*min_planificado/.test(server));
    assert.ok(!/min_planificado\s*=\s*[^,)\s]*min_fichado/.test(server));
  });

  test("y la jornada de la otra barra del centro ya se puede abrir", () => {
    // Con Blanes agrupado, quien está de alta en la Cooperativa salía en la lista de La
    // Tapeta y daba 404 al pulsar la fila: no se abría nada y sin decir por qué.
    const ep = bloque('app.get("/api/fichajes/jornada"', 'app.get("/api/fichajes/revision"');
    assert.match(ep, /mismoCentroPersonal\(w\.local, local\)/);
    assert.ok(!/w\.local !== local/.test(ep));
    assert.ok(ep.indexOf("horLocal(req") < 700, "el local sigue resolviéndose con horLocal");
  });
});
