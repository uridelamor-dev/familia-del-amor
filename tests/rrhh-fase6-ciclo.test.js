// FASE 6 — el ciclo de vida en el servidor y en la pantalla.
// Se lee el código como TEXTO: es lo que blinda que no vuelvan a existir tres altas
// distintas, que la baja no borre nada publicado y que la ficha no copie datos de nadie.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync("server.js", "utf8");
const app = readFileSync("public/panel/app.js", "utf8");
const css = readFileSync("public/panel/index.html", "utf8");
const ciclo = readFileSync("src/modules/rrhh/ciclo.js", "utf8");

const sinComentarios = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
const bloque = (desde, hasta) => {
  const a = server.indexOf(desde);
  assert.ok(a >= 0, `no se encuentra «${desde}»`);
  const b = server.indexOf(hasta, a + 1);
  return server.slice(a, b > a ? b : a + 9000);
};
const servicio = bloque("async function rrhhCrearTrabajador", "async function rrhhAltaTransaccion");
const fichaLab = bloque('app.get("/api/rrhh/trabajador/:id/ficha-laboral"', "// ── LA BAJA");
const baja = bloque('app.post("/api/rrhh/trabajador/:id/baja"', 'app.put("/api/rrhh/trabajador/:id"');
const planEndpoint = bloque('app.get("/api/rrhh/trabajador/:id/baja/plan"', 'app.post("/api/rrhh/trabajador/:id/baja"');

describe("UNA SOLA ALTA LABORAL", () => {
  test("las tres vías acaban en el mismo servicio", () => {
    // Eran tres altas con tres resultados distintos: una sin fecha de alta, otra sin
    // contrato ni áreas, y la de candidato sin nada laboral. La persona quedaba a medias.
    for (const via of ['app.post("/api/rrhh/trabajador"', 'app.post("/api/hr/applications/:id/contratar"', 'app.post("/api/users"']) {
      const b = bloque(via, "\n});");
      assert.match(b, /rrhhAltaTransaccion\(/, `${via} no pasa por el servicio común`);
    }
  });

  test("y NINGUNA de las tres escribe el INSERT por su cuenta", () => {
    for (const via of ['app.post("/api/rrhh/trabajador"', 'app.post("/api/hr/applications/:id/contratar"']) {
      const b = bloque(via, "\n});");
      assert.ok(!/INSERT INTO users/.test(b), `${via} sigue creando el usuario a mano`);
    }
  });

  test("`POST /api/users` solo pasa por el servicio si es alguien que va a TRABAJAR", () => {
    // Un contable no tiene cuadrante, ni bolsa, ni áreas. Meterle por el alta laboral le
    // inventaría una vida laboral que no tiene.
    const b = bloque('app.post("/api/users"', "// Editar datos de un usuario");
    assert.match(b, /if \(ROLES_PLANTILLA\.includes\(String\(rol\)\)\)/);
    assert.match(b, /rrhhAltaTransaccion/);
  });

  test("el alta va ENTERA o no va: contrato y áreas en la misma transacción", () => {
    // Si falla el contrato, lo que no puede quedar es un usuario sin contrato que alguien
    // tenga que descubrir tres semanas después.
    const tx = bloque("async function rrhhAltaTransaccion", "function rrhhMensajeAlta");
    assert.match(tx, /BEGIN/);
    assert.match(tx, /COMMIT/);
    assert.match(tx, /ROLLBACK/);
    assert.match(servicio, /INSERT INTO hor_contratos/);
    assert.match(servicio, /INSERT INTO hor_worker_areas/);
  });

  test("la cuenta nace obligada a cambiar la contraseña", () => {
    assert.match(servicio, /pass_temporal/);
    assert.match(servicio, /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,1,TRUE,\?\)/);
    assert.ok(!/password_enc/.test(servicio), "no se guarda ninguna copia reversible");
  });

  test("y con su FECHA DE ALTA: sin ella la antigüedad sale vacía", () => {
    assert.match(servicio, /fecha_alta/);
    assert.match(ciclo, /const alta = fecha\(datos\.fecha_alta\) \|\| fecha\(hoy\)/);
  });

  test("las áreas se validan contra las del local, activas", () => {
    assert.match(servicio, /SELECT id FROM hor_areas WHERE local = \? AND activo/);
    assert.match(servicio, /validas\.includes\(String\(x\)\)/);
  });

  test("y la marca de «configurado» va aunque la lista venga vacía", () => {
    // La fase 4 distingue «nunca se tocó» de «se decidió que ninguna», y contar filas no
    // sabe diferenciarlas.
    assert.match(servicio, /UPDATE users SET areas_configuradas_en = \?, areas_configuradas_por = \?/);
  });

  test("el encargado da de alta EN SU LOCAL, como trabajador y sin poner el contrato", () => {
    const b = bloque('app.post("/api/rrhh/trabajador"', "// Volver a poner la contraseña inicial");
    assert.match(b, /if \(esEncargado\(req\)\) \{ datos\.local = localScope\(req\); datos\.rol = "trabajador"; \}/);
    assert.match(b, /delete datos\.horas_semana/);
    assert.match(servicio, /if \(!rrhhPuedeLocal\(req, d\.local\)\)/);
  });

  test("contratar a un candidato NO deduce contrato ni áreas de su CV", () => {
    const b = bloque('app.post("/api/hr/applications/:id/contratar"', "// ── RRHH: Seguimiento");
    assert.ok(!/cand\.(puesto|nombre)[\s\S]{0,120}(area|contrato|horas)/i.test(b),
      "se está deduciendo algo laboral del texto libre del candidato");
    assert.match(b, /puesto: req\.body\.puesto \|\| cand\.puesto/);
  });

  test("se dice lo que FALTA, porque es lo que se olvida", () => {
    const m = bloque("function rrhhMensajeAlta", 'app.post("/api/rrhh/trabajador"');
    assert.match(m, /sin horas no entra en el generador/);
    assert.match(m, /se le puede asignar a cualquiera/);
  });

  test("queda auditado quién dio el alta y por qué puerta", () => {
    const tx = bloque("async function rrhhAltaTransaccion", "function rrhhMensajeAlta");
    assert.match(tx, /ficAuditar\("usuario", r\.id, "alta"/);
    assert.match(tx, /via: extras\.via/);
  });
});

describe("LA FICHA AGREGA, NO COPIA", () => {
  test("cada bloque se lee de su tabla de siempre", () => {
    for (const t of ["hor_contratos", "hor_worker_areas", "hor_disponibilidad", "hor_ausencias",
                     "hor_asignaciones", "fic_jornadas", "fic_bolsa_movimientos", "hr_documentos"]) {
      assert.ok(fichaLab.includes(t), `la ficha no lee ${t}`);
    }
  });

  test("NO existe ninguna copia en `users`", () => {
    // Una copia se desincroniza el primer día que alguien cambie el original, y entonces
    // hay dos números y nadie sabe cuál mirar.
    // Sobre las COLUMNAS, no sobre la prosa: el comentario de la ficha nombra estas copias
    // justo para decir que no existen, y `saldo_bolsa` sí aparece —como campo del apunte de
    // auditoría de la baja, que es un dato del registro y no una columna de nadie.
    const esquemas = ["src/modules/fichajes/schema.js", "src/modules/horarios/schema.js"]
      .map((f) => readFileSync(f, "utf8")).join("\n") + server;
    for (const c of ["horas_contrato", "saldo_bolsa", "ultima_ausencia", "area_principal", "antiguedad_dias"]) {
      assert.ok(!esquemas.includes("ADD COLUMN IF NOT EXISTS " + c), `se ha creado la columna users.${c}`);
      assert.ok(!new RegExp("UPDATE users SET[^;]{0,200}" + c).test(server), `se escribe users.${c}`);
      assert.ok(!new RegExp("SELECT[^;]{0,300}" + c + "[^;]{0,300}FROM users").test(server), `se lee users.${c}`);
    }
  });

  test("la ficha NO ESCRIBE nada", () => {
    assert.ok(!/INSERT|UPDATE|DELETE/.test(sinComentarios(fichaLab)), "la ficha está escribiendo en la base");
  });

  test("todo en paralelo: no hay N+1", () => {
    assert.match(fichaLab, /await Promise\.all\(\[/);
    const consultas = (fichaLab.match(/db(All|Get)\(/g) || []).length;
    assert.ok(consultas <= 14, `${consultas} consultas: se ha colado una por fila`);
    assert.ok(!/for \([^)]*\)[\s\S]{0,120}await db(All|Get)/.test(fichaLab), "hay una consulta dentro de un bucle");
  });

  test("y el listado tampoco calcula bolsa ni horas por persona", () => {
    const b = bloque('app.get("/api/rrhh/trabajadores"', "// Alta de trabajador desde RRHH");
    assert.ok(!/fic_bolsa_movimientos|fic_jornadas/.test(b), "el listado está consultando el saldo de cada uno");
  });

  test("a quien no es plantilla no se le hace ficha laboral", () => {
    assert.match(fichaLab, /if \(!esPlantilla\(w\)\)/);
    assert.match(fichaLab, /no es plantilla operativa/);
  });

  test("el estado sale de las funciones de vigencia, no de un campo", () => {
    assert.match(fichaLab, /estado: estadoLaboral\(w, hoy\)/);
    assert.ok(!/SELECT[^`]*\bestado\b[^`]*FROM users/.test(server), "se ha creado una columna estado en users");
  });
});

describe("la privacidad no se relaja porque la ficha sea agregada", () => {
  test("el encargado no ve el DNI ni los documentos sensibles", () => {
    assert.match(fichaLab, /dni: enc \? null : w\.dni/);
    assert.match(fichaLab, /enc \? docs\.filter\(\(d\) => !\(d\.sensible === 1/);
  });

  test("ni la nota interna de una ausencia, y se reutiliza EL MISMO filtro", () => {
    // En una baja médica el `motivo` puede ser un dato de salud. Se pasa por el mismo
    // sanitizador que ya usa la bandeja: dos filtros distintos acaban divergiendo.
    assert.match(fichaLab, /paraResponsable\(a, \{ verSensible: rrhhTodoLocal\(req\) \}\)/);
  });

  test("un trabajador de otro local no se abre", () => {
    assert.match(fichaLab, /rrhhPuedeLocal\(req, w\.local \|\| ""\)/);
  });

  test("los botones de liquidar los decide el servidor, no la pantalla", () => {
    assert.match(fichaLab, /puedeLiquidar: LIQ_ROLES\.includes\(req\.user\.rol\)/);
  });
});

describe("LA BAJA", () => {
  test("se enseña el plan ENTERO antes de tocar nada", () => {
    assert.match(planEndpoint, /planDeBaja\(/);
    assert.ok(!/INSERT|UPDATE|DELETE/.test(sinComentarios(planEndpoint)), "la vista previa está escribiendo");
  });

  test("y lo que se enseña sale del MISMO cálculo que lo que se ejecuta", () => {
    assert.match(planEndpoint, /rrhhDatosBaja\(/);
    assert.match(baja, /rrhhDatosBaja\(/);
    assert.match(baja, /planDeBaja\(/);
  });

  test("LOS TURNOS DE BORRADOR SE RETIRAN: es el agujero que quedaba", () => {
    assert.match(baja, /DELETE FROM hor_asignaciones WHERE id = ANY\(\?\)/);
    assert.match(baja, /plan\.retirar/);
  });

  test("LOS PUBLICADOS NO SE TOCAN, y se dice en qué semanas están", () => {
    // Se mandaron al grupo y hay gente organizada con ellos.
    assert.match(baja, /Los PUBLICADOS no se tocan/);
    assert.match(ciclo, /semanasAfectadas/);
    const borrados = baja.match(/DELETE FROM hor_asignaciones[^`]*/g) || [];
    assert.equal(borrados.length, 1, "hay más de un borrado de asignaciones");
    assert.ok(!/DELETE FROM hor_semanas|UPDATE hor_semanas/.test(baja), "la baja está tocando semanas publicadas");
  });

  test("el contrato se cierra EL ÚLTIMO DÍA TRABAJADO, no el anterior", () => {
    // `users.fecha_baja` y `hor_contratos.hasta` son los dos inclusivos: `contratoVigente`
    // usa `hasta >= fecha`. Ponerle el día antes le quitaría contrato a un día que trabajó.
    assert.match(baja, /UPDATE hor_contratos SET hasta = \? WHERE id = ANY\(\?\)/);
    assert.match(baja, /\[fechaBaja, plan\.contratosACerrar\]/);
    assert.ok(!/sumaDias\(fechaBaja, -1\)/.test(baja), "se está cerrando el contrato un día antes");
  });

  test("las ausencias posteriores se CANCELAN, no se borran", () => {
    assert.match(baja, /UPDATE hor_ausencias SET estado = 'cancelada'/);
    assert.match(baja, /cancelado_por = \?, cancelado_en = \?/);
    assert.match(baja, /Cancelada por baja laboral/);
    assert.ok(!/DELETE FROM hor_ausencias/.test(server), "alguien borra ausencias");
  });

  test("la que CRUZA la fecha no se toca", () => {
    assert.ok(!/ausenciasQueCruzan[\s\S]{0,200}UPDATE/.test(baja));
    assert.match(ciclo, /Recortarlas autom[aá]ticamente cambiar[ií]a el saldo/);
  });

  test("LA BOLSA NO SE TOCA", () => {
    assert.ok(!/fic_bolsa_movimientos/.test(sinComentarios(baja).replace(/SELECT[^`]*SUM\(minutos\)[^`]*/g, "")),
      "la baja está escribiendo en la bolsa");
    assert.ok(!/INSERT INTO fic_bolsa|UPDATE fic_bolsa|DELETE FROM fic_bolsa/.test(baja));
  });

  test("ni los fichajes, ni los documentos, ni las notas", () => {
    for (const t of ["fic_eventos", "fic_jornadas", "hr_documentos", "hr_worker_notes"]) {
      assert.ok(!new RegExp(`(DELETE FROM|UPDATE) ${t}`).test(baja), `la baja toca ${t}`);
    }
  });

  test("la disponibilidad se queda: es histórico y no molesta", () => {
    assert.ok(!/DELETE FROM hor_disponibilidad/.test(baja));
    assert.match(baja, /La disponibilidad NO se borra/);
  });

  test("TODO EN UNA TRANSACCIÓN: no hay media baja", () => {
    assert.match(baja, /BEGIN/);
    assert.match(baja, /COMMIT/);
    assert.match(baja, /ROLLBACK/);
  });

  test("dos personas a la vez no la aplican dos veces", () => {
    assert.match(baja, /SELECT id FROM users WHERE id = \? FOR UPDATE/);
  });

  test("repetirla con la misma fecha es un no-op, no un error", () => {
    assert.match(baja, /if \(fresco\.fecha_baja === fechaBaja\)/);
    assert.match(baja, /repetida: true/);
  });

  test("si algo cambió desde el resumen, se para", () => {
    assert.match(baja, /req\.body\.firma !== firma/);
    assert.match(baja, /status\(409\)/);
    assert.match(baja, /No se ha hecho nada/);
  });

  test("solo dirección y RR.HH.: el encargado no da de baja a nadie", () => {
    assert.match(server, /app\.post\("\/api\/rrhh\/trabajador\/:id\/baja", requireAuth\(\["direccion", "rrhh"\]\)/);
    assert.match(server, /app\.get\("\/api\/rrhh\/trabajador\/:id\/baja\/plan", requireAuth\(\["direccion", "rrhh"\]\)/);
    assert.match(server, /const HR_CAMPOS_ENC = \["telefono", "email", "puesto", "fecha_nac", "foto_url"\]/);
  });

  test("y queda auditado todo lo que hizo", () => {
    assert.match(baja, /ficAuditar\("usuario", w\.id, "baja"/);
    for (const c of ["turnos_retirados", "turnos_publicados", "contratos_cerrados", "ausencias_canceladas", "saldo_bolsa"]) {
      assert.ok(baja.includes(c), `la auditoría no registra ${c}`);
    }
  });
});

describe("el acceso sigue como lo dejó la fase 0", () => {
  test("hasta el último día entra; desde el siguiente no", () => {
    assert.match(server, /bajaEfectiva/);
    const v = readFileSync("src/modules/rrhh/vigencia.js", "utf8");
    assert.match(v, /return d \? d > baja : true/);
  });
  test("la baja NO apaga la cuenta a mano: la fecha es la que manda", () => {
    // Poner `activo = 0` bloquearía hoy a alguien cuya baja es dentro de una semana.
    assert.ok(!/UPDATE users SET[^`]*activo = 0[^`]*/.test(baja), "la baja está apagando la cuenta");
    assert.match(baja, /UPDATE users SET fecha_baja = \? WHERE id = \?/);
  });
});

describe("el diagnóstico de datos NO corrige nada", () => {
  const diag = bloque("Datos laborales que no cuadran", "El CHECK de `hor_ausencias.estado`");
  test("solo cuenta y lo dice", () => {
    assert.ok(!/UPDATE|INSERT|DELETE/.test(sinComentarios(diag)), "el diagnóstico está corrigiendo datos");
    assert.match(diag, /No se ha corregido nada/);
  });
  test("mira los casos que la auditoría señaló", () => {
    for (const c of ["sin_alta", "baja_pasada_activa", "apagado_sin_fecha", "sin_areas"]) {
      assert.ok(diag.includes(c), `no se diagnostica ${c}`);
    }
    assert.match(diag, /hor_contratos[\s\S]{0,200}u\.fecha_baja/);
    assert.match(diag, /fic_bolsa_movimientos[\s\S]{0,200}fecha_baja/);
  });
});

describe("la pantalla", () => {
  const lab = app.slice(app.indexOf("function renderRRLaboral"), app.indexOf("// ── La ficha laboral") + 1 || undefined);
  test("la cabecera usa el estado del SERVIDOR", () => {
    assert.match(app, /const est = \(RRSEG\.lab && RRSEG\.lab\.estado\) \|\| null/);
    assert.match(app, /PILL = \{ activo: "ok", baja_futura: "warn"/);
  });
  test("las dos fichas se piden a la vez", () => {
    assert.match(app, /apiRaw\("\/api\/rrhh\/trabajador\/" \+ id \+ "\/ficha-laboral"\)/);
    assert.match(app, /const \[fi, lab\] = await Promise\.all/);
  });
  test("«sin configurar» y «ninguna área» se dicen distinto", () => {
    assert.match(app, /!f\.areas\.configurado/);
    assert.match(app, /puede ponerle en cualquier área/);
    assert.match(app, /Ninguna, a propósito/);
  });
  test("las áreas se editan donde siempre, no se reimplementan aquí", () => {
    assert.match(app, /HORCFG\.tab = "areas"; go\("horarios"\)/);
    const ficha = app.slice(app.indexOf("function renderRRLaboral"), app.indexOf("async function rrDarDeBaja"));
    assert.ok(!/api\/horarios\/capacidades/.test(ficha), "hay un segundo editor de áreas");
  });
  test("el libro de horas es el de la fase 5, no una copia", () => {
    assert.match(app, /else if \(act === "rr-libro"\) ficAbrirLibro/);
  });
  test("la baja enseña el plan antes de dejar confirmar", () => {
    const b = app.slice(app.indexOf("async function rrDarDeBaja"), app.indexOf("// Cambiar contrato"));
    assert.match(b, /baja\/plan\?fecha=/);
    assert.match(b, /btn\.disabled = true/);
    assert.match(b, /firma/);
    // Si el plan cambia, se vuelve a enseñar antes que dejar confirmar a ciegas.
    assert.match(b, /if \(\/ha cambiado\/i\.test\(e\.message\)\) verPlan\(\)/);
  });
  test("el filtro del listado dice cuántos esconde", () => {
    assert.match(app, /En plantilla \(\$\{c\.activos\}\)/);
    assert.match(app, /Bajas \(\$\{c\.bajas\}\)/);
    assert.match(app, /estado=" \+ \(RRSEG\.estado \|\| "activos"\)/);
  });
  test("y el alta pide contrato y áreas de una vez", () => {
    const a = app.slice(app.indexOf("function rrWorkerAdd"), app.indexOf("async function rrDarDeBaja"));
    assert.match(a, /name="horas_semana"/);
    assert.match(a, /altaArea/);
    assert.match(a, /name="fecha_alta"/);
    // Al encargado no se le enseña el contrato, igual que el servidor se lo quita.
    assert.match(a, /\$\{enc \? "" : `<div>/);
  });
  test("una lista de áreas vacía NO se manda: marcaría «configurado con cero»", () => {
    const a = app.slice(app.indexOf("function rrWorkerAdd"), app.indexOf("async function rrDarDeBaja"));
    assert.match(a, /if \(ov\.querySelectorAll\("\.altaArea"\)\.length\) data\.areas = marcadas/);
  });
});

describe("en el móvil también", () => {
  test("el resumen laboral baja de cuatro columnas a dos y a una", () => {
    const m = css.slice(css.indexOf(".lab-g{"), css.indexOf("/* Las tres secciones de Inventarios"));
    assert.match(m, /\.lab-g\{display:grid;grid-template-columns:repeat\(4,1fr\)/);
    assert.match(m, /@media\(max-width:900px\)\{ \.lab-g\{grid-template-columns:repeat\(2,1fr\)\} \}/);
    assert.match(m, /@media\(max-width:480px\)\{ \.lab-g\{grid-template-columns:1fr/);
  });
  test("y los modales de baja y contrato reutilizan el formulario ya responsive", () => {
    const b = app.slice(app.indexOf("async function rrDarDeBaja"), app.indexOf("function rrContratar"));
    assert.match(b, /class="bl-lbl"/);
    assert.match(b, /class="bl-form"/);
  });
});

describe("los invariantes de las fases anteriores", () => {
  test("`fic_eventos` sigue siendo inmutable", () => {
    for (const u of server.match(/UPDATE fic_eventos SET ([a-z_]+)/g) || []) assert.match(u, /anulado_por/);
    assert.ok(!/DELETE FROM fic_eventos/.test(server));
  });
  test("la bolsa sigue siendo append-only", () => {
    assert.ok(!/UPDATE fic_bolsa_movimientos|DELETE FROM fic_bolsa_movimientos/.test(server));
  });
  test("un horario publicado no se edita: se versiona", () => {
    assert.ok(!/UPDATE hor_semanas SET estado = 'borrador'/.test(server));
  });
  test("las capacidades por área de la fase 4 siguen mandando en el solver", () => {
    assert.match(server, /puedeEnArea|horAvisoArea/);
  });
  test("y no se ha tocado nada de nómina, euros ni firma", () => {
    // Sobre el CÓDIGO: los comentarios nombran «convenio» justo para decir que la antigüedad
    // reconocida no se calcula aquí, que es la decisión que hay que dejar escrita.
    const zona = sinComentarios(servicio + baja + fichaLab);
    for (const p of ["€", "euro", "nomina_", "salario", "convenio", "irpf", "firma_contrato", "onboarding"]) {
      assert.ok(!zona.toLowerCase().includes(p), `«${p}» no es de esta fase`);
    }
  });
});
