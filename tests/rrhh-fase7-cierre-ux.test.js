// FASE 7 — cierre de deuda y consistencia visual, leyendo el código como texto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync("server.js", "utf8");
const app = readFileSync("public/panel/app.js", "utf8");
const css = readFileSync("public/panel/index.html", "utf8");
const esquema = readFileSync("src/modules/fichajes/schema.js", "utf8");
const sinComentarios = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
const bloque = (a, b) => { const i = server.indexOf(a); assert.ok(i >= 0, `falta «${a}»`); const j = server.indexOf(b, i + 1); return server.slice(i, j > i ? j : i + 9000); };
const recontratar = bloque('app.post("/api/rrhh/trabajador/:id/recontratar"', 'app.put("/api/rrhh/trabajador/:id"');
const config = bloque('app.put("/api/horarios/config-operativa"', "// Contrato. Cambiar de 20 a 30 horas");

describe("periodos laborales", () => {
  test("UNA SOLA incorporación abierta, y lo garantiza la base", () => {
    // Dos peticiones de recontratar a la vez pasan las dos la comprobación previa; con dos
    // etapas abiertas la antigüedad depende de cuál se lea primero.
    assert.match(esquema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_rrhh_per_abierto[\s\S]{0,120}WHERE fecha_baja IS NULL/);
    assert.match(esquema, /CHECK \(fecha_baja IS NULL OR fecha_baja >= fecha_alta\)/);
  });

  test("el periodo NO duplica el contrato", () => {
    const t = esquema.slice(esquema.indexOf("CREATE TABLE IF NOT EXISTS rrhh_periodos"), esquema.indexOf("idx_rrhh_per "));
    for (const c of ["horas_semana", "dias_semana", "area", "salario"]) {
      assert.ok(!t.includes(c), `el periodo guarda ${c}, que es del contrato`);
    }
    assert.match(t, /local TEXT/, "pero sí el establecimiento de cada etapa");
  });

  test("el alta abre la primera y la baja la cierra", () => {
    const servicio = bloque("async function rrhhCrearTrabajador", "async function rrhhAltaTransaccion");
    assert.match(servicio, /INSERT INTO rrhh_periodos/);
    const baja = bloque('app.post("/api/rrhh/trabajador/:id/baja"', "// ── RECONTRATAR");
    assert.match(baja, /UPDATE rrhh_periodos SET fecha_baja = \?, motivo_baja = \?/);
    assert.match(baja, /WHERE worker_id = \? AND fecha_baja IS NULL/);
  });

  test("`users` se mantiene sincronizado: son la misma verdad en dos sitios", () => {
    const baja = bloque('app.post("/api/rrhh/trabajador/:id/baja"', "// ── RECONTRATAR");
    assert.match(baja, /UPDATE users SET fecha_baja = \?/);
    assert.match(recontratar, /UPDATE users SET fecha_alta = \?, fecha_baja = NULL, activo = 1/);
  });

  test("LA MIGRACIÓN NO INVENTA NINGUNA FECHA", () => {
    const mig = bloque("Periodo inicial de quien ya estaba", "Datos laborales que no cuadran");
    assert.match(mig, /u\.fecha_alta IS NOT NULL AND u\.fecha_alta <> ''/);
    // `Date.now()` sí aparece: es la marca de cuándo se migró, que va en `creado_en`. Lo
    // que no puede pasar es que la fecha de ALTA salga de algo que no sea la ficha.
    const select = mig.slice(mig.indexOf("SELECT u.id"), mig.indexOf("RETURNING id"));
    assert.match(select, /SELECT u\.id, u\.local, u\.fecha_alta, u\.fecha_baja/);
    assert.ok(!/CURRENT_DATE|1970|MIN\(dia_negocio\)|COALESCE\(u\.fecha_alta/.test(select), "se está inventando una fecha de alta");
    assert.match(mig, /sin migrar por no tener una fecha de alta fiable/);
    assert.match(mig, /NOT EXISTS \(SELECT 1 FROM rrhh_periodos/, "no duplica al reiniciar");
  });

  test("y el diagnóstico ve los casos raros sin tocarlos", () => {
    const diag = bloque("Los periodos, ahora que existen", "if (partes.length)");
    assert.ok(!/UPDATE|INSERT|DELETE/.test(sinComentarios(diag)));
    for (const c of ["sin_periodo", "activo_sin_abierto", "desincronizado"]) assert.ok(diag.includes(c));
    assert.match(diag, /se pisan/);
  });
});

describe("recontratar", () => {
  test("solo dirección y RR.HH.", () => {
    assert.match(server, /app\.post\("\/api\/rrhh\/trabajador\/:id\/recontratar", requireAuth\(\["direccion", "rrhh"\]\)/);
  });
  test("se comprueba que no tenga ya una etapa abierta", () => {
    assert.match(recontratar, /motivoNoRecontratar\(periodos, desde\)/);
    assert.match(recontratar, /SELECT id FROM users WHERE id = \? FOR UPDATE/);
    assert.match(recontratar, /BEGIN/);
    assert.match(recontratar, /COMMIT/);
    assert.match(recontratar, /ROLLBACK/);
  });
  test("NADA se hereda de la etapa anterior", () => {
    // Las horas de 2024 no son las de 2026: darlas por buenas metería en el generador un
    // contrato que nadie ha vuelto a firmar.
    assert.match(recontratar, /NADA se hereda del periodo anterior/);
    assert.ok(!/SELECT[^`]*FROM hor_contratos[^`]*ORDER BY[\s\S]{0,200}INSERT INTO hor_contratos/.test(recontratar),
      "está copiando el contrato viejo");
  });
  test("LA BOLSA NO SE TOCA: volver no paga lo que se debía", () => {
    assert.ok(!/INSERT INTO fic_bolsa|UPDATE fic_bolsa|DELETE FROM fic_bolsa/.test(recontratar));
    assert.match(recontratar, /conserva \$\{enHoras\(saldo\)\} a favor de antes/);
  });
  test("ni el histórico de nada", () => {
    for (const t of ["fic_eventos", "fic_jornadas", "hr_documentos", "hr_worker_notes", "hor_asignaciones"]) {
      assert.ok(!new RegExp(`(DELETE FROM|UPDATE) ${t}`).test(recontratar), `recontratar toca ${t}`);
    }
  });
  test("las áreas se reemplazan con el MISMO acotado que al editarlas", () => {
    // Sin acotar, se llevaría por delante las de un área desactivada, que es justo lo que
    // la fase 4 protege.
    assert.match(recontratar, /DELETE FROM hor_worker_areas WHERE worker_id = \?\s*\n?\s*AND area_id IN \(SELECT id FROM hor_areas WHERE local = \? AND activo\)/);
  });
  test("y queda auditado", () => {
    assert.match(recontratar, /ficAuditar\("usuario", w\.id, "recontratar"/);
    assert.match(recontratar, /periodos_previos/);
  });
});

describe("configuración operativa", () => {
  test("el encargado la ve; solo dirección y RR.HH. la cambian", () => {
    assert.match(server, /const CONFIG_ROLES = \["direccion", "rrhh", "encargado"\]/);
    assert.match(server, /app\.get\("\/api\/horarios\/config-operativa", requireAuth\(CONFIG_ROLES\)/);
    assert.match(server, /app\.put\("\/api\/horarios\/config-operativa", requireAuth\(\["direccion", "rrhh"\]\)/);
    assert.match(server, /const puedeEditar = rrhhTodoLocal\(req\)/);
  });
  test("se valida TODO antes de escribir NADA", () => {
    // Media configuración aplicada es peor que ninguna: nadie sabe cuál quedó.
    assert.match(config, /for \(const k of claves\) \{\s*\n\s*const no = motivoNoGuardar/);
    assert.ok(config.indexOf("motivoNoGuardar") < config.indexOf("UPDATE hor_config"));
  });
  test("y va acotado al establecimiento", () => {
    assert.match(config, /horLocal\(req, req\.body\?\.local\)/);
    assert.match(config, /WHERE local = \?/);
  });
  test("queda auditado qué valía antes y qué vale ahora", () => {
    assert.match(config, /ficAuditar\("config", null, "cambiar_ajuste"/);
    assert.match(config, /antes: antes\[k\]/);
    assert.match(config, /ahora: Math\.round\(Number\(cambios\[k\]\)\)/);
  });
  test("NO RECALCULA NADA hacia atrás, y se dice", () => {
    assert.ok(!/fic_bolsa_movimientos|fic_jornadas/.test(config), "la configuración está tocando datos ya registrados");
    assert.match(config, /AVISO_NO_RETROACTIVO/);
  });
});

describe("localesAccesibles", () => {
  test("devuelve TODOS los suyos, igual que los autoriza puedeAccederLocal", () => {
    // Devolvía uno solo mientras la API ya le dejaba operar en los dos: no era un agujero,
    // era una pantalla que escondía trabajo suyo.
    const f = bloque("function localesAccesibles(req)", "function puedeAccederLocal");
    assert.match(f, /localesDe\(req && req\.user\)/);
    assert.ok(!/localScope\(req\)/.test(f), "sigue usando «en cuál está mirando ahora»");
    assert.match(f, /rol === "direccion"\) \? \[\.\.\.INV_LOCALES\]/, "dirección sigue viéndolos todos");
    // Lo único que puede quitar de esa lista es el agrupado por centro: en compras o personal
    // no se ofrece la Cooperativa porque sus datos ya son los del centro. Filtrar por
    // cualquier otro motivo volvería a esconderle trabajo suyo a quien lleva dos.
    assert.match(f, /visiblesEn\(ambitoDeRuta/);
  });
  test("y la comprobación de acceso solo AMPLÍA, nunca restringe", () => {
    // Es lo que protege el aislamiento entre establecimientos: sigue empezando por
    // `puedeLocal` y devolviendo true en cuanto el local es suyo. Lo añadido después
    // reconoce la otra barra del mismo centro, que también es suya.
    const f = bloque("function puedeAccederLocal(req, local)", "// Auth endpoints");
    assert.match(f, /if \(puedeLocal\(req && req\.user, local\)\) return true;/);
    assert.match(f, /barrasDelCentro\(local, ambitoDeRuta\(req && req\.path\)\)\.some/);
    assert.ok(!/return false;/.test(f.split("barrasDelCentro")[0]), "no puede cortar antes de mirar el centro");
  });
});

describe("UN SOLO VOCABULARIO DE ESTADO", () => {
  test("`.fic-tag` y `.pill` son lo mismo", () => {
    // Convivían dos: `.pill.ok` era verde y `.fic-tag.ok` azul; `.fic-tag.aviso` pintaba de
    // ROJO cosas que solo piden atención. El mismo estado se veía de dos colores según en
    // qué fase se hubiera escrito la pantalla.
    assert.match(css, /\.fic-tag,\.pill\{/);
    assert.match(css, /\.fic-tag\.ok,\.pill\.ok\{background:var\(--success-soft\)/);
    assert.match(css, /\.fic-tag\.aviso,\.fic-tag\.warn,\.pill\.warn\{background:var\(--warning-soft\)/);
    assert.match(css, /\.fic-tag\.bad,\.pill\.bad\{background:var\(--danger-soft\)/);
  });
  test("y ya no hay una segunda definición contradictoria", () => {
    assert.ok(!/\.fic-tag\{display:inline-block/.test(css), "queda la definición vieja de fic-tag");
    assert.ok(!/\.fic-tag\.ok\{border-color:transparent;background:var\(--brand-soft\)/.test(css), "el ok de fichajes sigue azul");
  });
  test("el color significa una cosa y solo una", () => {
    const b = css.slice(css.indexOf("UN SOLO VOCABULARIO DE ESTADO"), css.indexOf(".fic-tag.bad"));
    assert.match(b, /gris\s+= información/);
    assert.match(b, /verde = confirmado/);
    assert.match(b, /ámbar = necesita atención/);
    assert.match(b, /rojo\s+= problema o bloqueo/);
  });
});

describe("«Necesita atención» y la navegación", () => {
  test("los asuntos salen ARRIBA de la ficha, antes que nada", () => {
    const lab = app.slice(app.indexOf("function renderRRLaboral"), app.indexOf("async function rrRecontratar"));
    // Lo que importa es el orden en que se PINTA. `asuntos` se declara al final porque
    // necesita el resto calculado, pero sale el primero en la plantilla.
    assert.match(lab, /return `\$\{asuntos\}/);
    const salida = lab.slice(lab.indexOf("return `${asuntos}"));
    assert.ok(salida.indexOf("${asuntos}") < salida.indexOf("Situación laboral"), "los asuntos no salen los primeros");
  });
  test("y solo si hay alguno", () => {
    assert.match(app, /\(f\.asuntos \|\| \[\]\)\.length \?/);
  });
  test("cada aviso lleva a donde se arregla", () => {
    assert.match(app, /const IR = \{ contrato: "rr-contrato", areas: "rr-areas", bolsa: "rr-libro"/);
  });
  test("los cinco sitios de esa persona, sin salir a buscarlos por el menú", () => {
    for (const a of ["rr-ir-horario", "rr-ir-revision", "rr-ir-ausencias", "rr-libro", "rr-areas"]) {
      assert.ok(app.includes(`data-act="${a}"`), `falta el enlace ${a}`);
      assert.ok(app.includes(`act === "${a}"`), `${a} no está enganchado`);
    }
  });
  test("y se llevan el establecimiento y la persona: no aterrizan en una pantalla vacía", () => {
    assert.match(app, /rr-ir-revision"\) \{ const f = RRSEG\.lab; if \(f\) \{ FIC\.local = f\.trabajador\.local; FIC\.tab = "revision"; FIC\.q = f\.trabajador\.nombre/);
  });
  test("las incorporaciones solo se enseñan si hay más de una", () => {
    // Para el 95 % de la plantilla es una línea que no dice nada, y ese ruido es lo que
    // hace que no se lea el resto.
    assert.match(app, /const per = f\.periodos\?\.historial \|\| \[\];/);
    assert.match(app, /per\.length > 1 \?/);
  });
  test("y se dice que la antigüedad es la de la etapa actual", () => {
    assert.match(app, /La antigüedad de arriba es la de la incorporación actual/);
  });
});

describe("el listado de Equipo dice algo", () => {
  test("la segunda línea ya no repite el rol", () => {
    assert.match(app, /const sub = \[w\.puesto,/);
    assert.match(app, /se va el|empieza el|hasta el/);
  });
  test("y el estado solo se pinta cuando NO es el normal", () => {
    // Una pastilla verde en las treinta filas de gente activa es ruido: lo que hay que ver
    // de un vistazo es quién NO está en la situación de siempre.
    assert.match(app, /est\.clave && est\.clave !== "activo" \?/);
  });
});

describe("responsive y accesibilidad", () => {
  test("los bloques nuevos se apilan en móvil", () => {
    for (const sel of [".cfg-item", ".lab-ir", ".lab-atencion"]) {
      assert.ok(css.includes(sel), `falta ${sel}`);
    }
    assert.match(css, /@media\(max-width:620px\)\{\s*\n\s*\.cfg-item\{flex-direction:column/);
    assert.match(css, /@media\(max-width:480px\)\{ \.lab-ir \.btn\{flex:1 1 45%/);
  });
  test("y los campos de configuración no hacen zoom en el iPhone", () => {
    assert.match(css, /\.cfg-val \.inp\{width:auto;flex:1;font-size:16px;min-height:44px/);
  });
  test("los avisos NO dependen solo del color: llevan su palabra", () => {
    assert.match(app, /x\.nivel === "problema" \? "problema" : x\.nivel === "atencion" \? "revisar" : "aviso"/);
  });
  test("los botones son botones de verdad, no divs pinchables", () => {
    const lab = app.slice(app.indexOf("function renderRRLaboral"), app.indexOf("async function rrRecontratar"));
    assert.ok(!/<div[^>]*data-act=/.test(lab), "hay un div haciendo de botón");
  });
  test("y los campos de los formularios nuevos llevan etiqueta", () => {
    const rec = app.slice(app.indexOf("async function rrRecontratar"), app.indexOf("// Cambiar contrato"));
    for (const id of ["recFecha", "recLocal", "recHoras", "recPuesto"]) {
      // Entre el texto de la etiqueta y el campo cabe un <span> con la aclaración.
      assert.ok(new RegExp(`<label[^>]*>[^<]{2,}(<span[^>]*>[^<]*</span>)?\\s*<[a-z]+[^>]*id="${id}"`).test(rec.replace(/\n\s*/g, "")), `${id} sin etiqueta`);
    }
  });
});

describe("los invariantes de las seis fases anteriores", () => {
  test("`fic_eventos` inmutable", () => {
    for (const u of server.match(/UPDATE fic_eventos SET ([a-z_]+)/g) || []) assert.match(u, /anulado_por/);
    assert.ok(!/DELETE FROM fic_eventos/.test(server));
  });
  test("bolsa append-only", () => {
    assert.ok(!/UPDATE fic_bolsa_movimientos|DELETE FROM fic_bolsa_movimientos/.test(server));
  });
  test("la franquicia sigue siendo una sola función y nadie la sortea", () => {
    const bolsa = readFileSync("src/modules/fichajes/bolsa.js", "utf8");
    assert.match(bolsa, /if \("minutos" in resto\)/);
    assert.ok(!/minutos:\s*Number\(j\.min_validado\)\s*-\s*Number\(j\.min_planificado/.test(server));
  });
  test("y no se ha metido nada de nómina, euros ni antigüedad legal", () => {
    const zona = sinComentarios(recontratar + config);
    for (const p of ["€", "euro", "salario", "trienio", "indemniz", "finiquito", "convenio"]) {
      assert.ok(!zona.toLowerCase().includes(p), `«${p}» no es de esta fase`);
    }
  });
});
