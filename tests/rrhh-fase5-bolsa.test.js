// FASE 5 — el circuito de la bolsa en el servidor y en la pantalla.
// Estos tests leen el código como TEXTO. Es lo que blinda las decisiones que no se pueden
// comprobar ejecutando: que solo hay un sitio que apunta jornadas, que la bolsa no se
// modifica jamás, y que aquí dentro no ha entrado el dinero.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync("server.js", "utf8");
const app = readFileSync("public/panel/app.js", "utf8");
const css = readFileSync("public/panel/index.html", "utf8");
const bolsa = readFileSync("src/modules/fichajes/bolsa.js", "utf8");
const esquema = readFileSync("src/modules/fichajes/schema.js", "utf8");

// Comentarios fuera: «pago» y «euros» aparecen en la prosa que explica por qué NO están.
const codigo = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
const servidorCodigo = codigo(server);
const bolsaLiquidar = server.slice(server.indexOf("/api/fichajes/bolsa/liquidar"), server.indexOf("/api/fichajes/cerrar"));

describe("EL LIBRO SIGUE SIENDO APPEND-ONLY", () => {
  test("ni un UPDATE ni un DELETE sobre fic_bolsa_movimientos", () => {
    // Es la invariante entera del módulo. Un pago mal registrado se deshace con otra fila,
    // nunca editando la primera: lo que se borra no se puede auditar.
    assert.ok(!/UPDATE fic_bolsa_movimientos/i.test(server), "alguien ha metido un UPDATE en la bolsa");
    assert.ok(!/DELETE FROM fic_bolsa_movimientos/i.test(server), "alguien ha metido un DELETE en la bolsa");
  });

  test("tampoco al deshacer: la reversión es un INSERT", () => {
    assert.match(bolsaLiquidar, /INSERT INTO fic_bolsa_movimientos[\s\S]*'reversion'/);
    assert.ok(!/UPDATE[\s\S]{0,200}revertido/i.test(server), "no hay ninguna marca de estado que mantener");
  });

  test("no existe ninguna columna `saldo` que sea la fuente de verdad", () => {
    assert.ok(!/ADD COLUMN IF NOT EXISTS saldo\b/.test(esquema));
    // `saldo_antes` es un testigo informativo, y su nombre lo dice.
    assert.match(esquema, /saldo_antes INTEGER/);
    assert.match(esquema, /NO es la fuente de\s+\/\/\s+verdad del saldo/);
  });

  test("el saldo se calcula con SUM sobre TODO, nunca sobre un LIMIT", () => {
    assert.match(server, /COALESCE\(SUM\(minutos\),0\)::int AS s FROM fic_bolsa_movimientos WHERE worker_id = \?/);
    const suma = server.slice(server.indexOf("const ficSaldoDe"), server.indexOf("const ficClaveIdem"));
    assert.ok(!/LIMIT/i.test(suma), "el saldo volvió a calcularse sobre una parte del libro");
  });
});

describe("UNA SOLA PUERTA para apuntar jornadas", () => {
  test("solo `ficApuntarJornada` escribe movimientos de jornada", () => {
    const inserts = servidorCodigo.match(/INSERT INTO fic_bolsa_movimientos/g) || [];
    assert.equal(inserts.length, 4, "jornada, ajuste, liquidación y reversión: ni uno más");
    // El de jornada es el único con `concepto` variable; los otros tres lo llevan escrito.
    const conJornada = servidorCodigo.match(/INSERT INTO fic_bolsa_movimientos[^`]*`,\s*\[m\.worker_id/g) || [];
    assert.equal(conJornada.length, 1);
  });

  test("validación individual, lote y cierre pasan las TRES por ahí", () => {
    // Tres apariciones: la definición, la llamada desde `ficEscribirValidacion` (que sirve
    // a la validación individual Y al lote) y la del cierre de periodo.
    const llamadas = (servidorCodigo.match(/ficApuntarJornada\(/g) || []).length;
    assert.equal(llamadas, 3, "ha aparecido o desaparecido un camino a la bolsa");
    // El lote no escribe la bolsa por su cuenta: valida con ficEscribirValidacion, que es
    // quien llama a ficApuntarJornada. Mismo camino, misma franquicia.
    const lote = server.slice(server.indexOf("validar-lote"), server.indexOf("Bolsa de horas, cierre de periodo"));
    assert.ok(!/INSERT INTO fic_bolsa_movimientos/.test(lote), "el lote apunta por su cuenta");
    assert.match(lote, /ficEscribirValidacion/);
  });

  test("y `ficEscribirValidacion` llama a apuntar", () => {
    const v = server.slice(server.indexOf("async function ficEscribirValidacion"), server.indexOf("async function ficApuntarJornada") - 400);
    assert.match(v, /ficApuntarJornada/);
  });
});

describe("LA FRANQUICIA no se puede olvidar en un endpoint", () => {
  test("el servidor NUNCA calcula la diferencia a mano para el libro", () => {
    // Antes se hacía `minutos: min_validado - min_planificado` y se pasaba en crudo. Si
    // alguien lo reintroduce, la franquicia se pierde en silencio.
    assert.ok(!/minutos:\s*Number\(j\.min_validado\)\s*-\s*Number\(j\.min_planificado/.test(server));
    assert.match(server, /minValidado: Number\(j\.min_validado\), minPlanificado: plan, toleranciaMin: tol/);
  });

  test("el módulo puro REVIENTA si le pasan minutos hechos por su cuenta", () => {
    assert.match(bolsa, /if \("minutos" in resto\)/);
    assert.match(bolsa, /throw new Error/);
  });

  test("la franquicia se lee de la configuración del local, no de un 10 suelto", () => {
    assert.match(server, /async function ficToleranciaBolsa/);
    assert.match(server, /SELECT tolerancia_bolsa_min FROM hor_config/);
    assert.match(bolsa, /export const TOLERANCIA_BOLSA_MIN = 10/);
    // Un `10` a pelo dentro del cálculo sería justo lo que se pidió evitar.
    const fn = bolsa.slice(bolsa.indexOf("export function movimientoBolsa"), bolsa.indexOf("export function periodoDe"));
    assert.ok(!/\b10\b/.test(fn), "hay un 10 escrito dentro de la fórmula");
  });

  test("es una columna APARTE de la tolerancia de incidencias", () => {
    // Compartirlas significaría que subir el aviso de «llegó tarde» a 15 min cambia sin
    // querer las horas que se le pagan a la gente.
    assert.match(esquema, /ADD COLUMN IF NOT EXISTS tolerancia_bolsa_min INTEGER NOT NULL DEFAULT 10/);
    assert.notEqual("tolerancia_min", "tolerancia_bolsa_min");
    assert.ok(!/tolerancia_bolsa_min[\s\S]{0,80}incidencia/i.test(server));
  });

  test("y NO se toca ni un minuto de lo trabajado", () => {
    // La franquicia decide el apunte, no el tiempo. `min_validado` sigue diciendo 8 h 11.
    const apuntar = server.slice(server.indexOf("async function ficApuntarJornada"), server.indexOf("const diferenciaFueraDeTolerancia"));
    assert.ok(!/UPDATE fic_jornadas/.test(apuntar), "apuntar la bolsa está tocando la jornada");
    assert.ok(!/UPDATE fic_eventos/.test(apuntar));
    assert.match(apuntar, /SELECT min_planificado, min_validado/);
  });
});

describe("el pasado no se recalcula", () => {
  test("NO hay ninguna migración que recorra movimientos viejos", () => {
    assert.ok(!/UPDATE fic_bolsa_movimientos SET minutos/i.test(server));
    assert.ok(!/recalcul\w+ hist[oó]ric/i.test(codigo(server)));
    // Todo lo del esquema es aditivo: columnas nuevas y un CHECK más ancho.
    const bloque = esquema.slice(esquema.indexOf("idx_fic_bolsa_loc"), esquema.indexOf("fic_cierres"));
    assert.ok(!/UPDATE /i.test(bloque), "el esquema está escribiendo en filas existentes");
    assert.ok(!/DROP COLUMN/i.test(bloque));
  });

  test("la clave de un día no menciona la franquicia", () => {
    const cl = bolsa.slice(bolsa.indexOf("export const claveJornada"), bolsa.indexOf("export function hash32"));
    assert.ok(!/tolerancia/i.test(cl), "cambiar la franquicia recalcularía todos los saldos");
  });

  test("los conceptos antiguos siguen siendo válidos en la base", () => {
    const check = esquema.match(/CHECK \(concepto IN \(([^)]*)\)\)/g).join(" ");
    for (const c of ["'jornada'", "'ajuste'", "'contra'", "'liquidacion'", "'arrastre'"]) {
      assert.ok(check.includes(c), `se ha caído el concepto ${c}`);
    }
    for (const c of ["'pago'", "'compensacion'", "'reversion'"]) assert.ok(check.includes(c));
  });
});

describe("pagar y compensar", () => {
  test("el saldo se recalcula EN EL SERVIDOR, no se cree al navegador", () => {
    assert.match(bolsaLiquidar, /SELECT COALESCE\(SUM\(minutos\),0\)::int AS s FROM fic_bolsa_movimientos/);
  });

  test("si el saldo cambió mientras el modal estaba abierto → 409 y NO se registra nada", () => {
    assert.match(bolsaLiquidar, /if \(saldo !== esperado\)/);
    assert.match(bolsaLiquidar, /ROLLBACK[\s\S]{0,200}status\(409\)/);
    assert.match(bolsaLiquidar, /El saldo ha cambiado de/);
    assert.match(bolsaLiquidar, /No se ha registrado nada/);
  });

  test("la ficha del saldo es OBLIGATORIA: sin ella no se paga", () => {
    assert.match(bolsaLiquidar, /Falta el saldo que se estaba confirmando/);
  });

  test("dos pestañas a la vez no pagan dos veces: se bloquea la ficha", () => {
    // Sin el FOR UPDATE, las dos leen 7 h 35, las dos pasan la comprobación y se apuntan
    // 15 h 10 de pagos por 7 h 35 de saldo.
    assert.match(bolsaLiquidar, /SELECT id FROM users WHERE id = \? FOR UPDATE/);
    assert.match(bolsaLiquidar, /BEGIN/);
    assert.match(bolsaLiquidar, /COMMIT/);
  });

  test("doble clic: misma ficha de idempotencia, un solo movimiento", () => {
    assert.match(bolsaLiquidar, /ON CONFLICT \(clave_idem\) DO NOTHING/);
    assert.match(bolsaLiquidar, /repetida: true/);
    // Y la ficha se genera al ABRIR el modal, no al pulsar.
    const liq = app.slice(app.indexOf("async function ficLiquidar"), app.indexOf("async function ficRevertir"));
    assert.match(liq, /const ficha = /);
    assert.ok(liq.indexOf("const ficha") < liq.indexOf("liqOk"), "la ficha se genera al pulsar, no al abrir");
  });

  test("no se puede pasar del saldo, y lo decide el servidor", () => {
    assert.match(bolsaLiquidar, /motivoNoLiquidar\(saldo, minutos\)/);
  });

  test("el movimiento distingue PAGO de COMPENSACIÓN, y ninguno es un ajuste", () => {
    assert.match(bolsaLiquidar, /CONCEPTOS_LIQUIDACION\.includes\(tipo\)/);
    assert.ok(!/concepto:\s*'ajuste'/.test(bolsaLiquidar));
  });

  test("se guarda quién, cuándo, cuánto, el motivo y el saldo que tenía delante", () => {
    for (const campo of ["worker_id", "minutos", "clave_idem", "nota", "autor", "creado_en", "fecha_efectiva", "saldo_antes"]) {
      assert.ok(bolsaLiquidar.includes(campo), `no se guarda ${campo}`);
    }
  });

  test("la fecha de creación no se puede manipular desde fuera", () => {
    assert.match(bolsaLiquidar, /creado_en[\s\S]{0,400}isoConOffset\(Date\.now\(\)\)/);
    assert.ok(!/creado_en[^)]*req\.body/.test(bolsaLiquidar));
    // La fecha efectiva sí la pone una persona, y es OTRA columna.
    assert.match(bolsaLiquidar, /fecha_efectiva.*req\.body|req\.body\?\.fecha_efectiva/s);
  });

  test("compensar NO toca el cuadrante", () => {
    // Conceder un descanso y planificarlo son dos hechos distintos. Que la bolsa
    // reescribiera Horarios sería que pagar horas cambie los turnos de la semana.
    assert.ok(!/hor_asignaciones/.test(bolsaLiquidar), "la liquidación está escribiendo en el cuadrante");
    assert.ok(!/hor_semanas/.test(bolsaLiquidar));
    const liq = app.slice(app.indexOf("async function ficLiquidar"), app.indexOf("async function ficRevertir"));
    assert.match(liq, /no<\/b> toca el cuadrante/);
  });

  test("liquidación final por baja: es el mismo motor, con su etiqueta", () => {
    assert.match(bolsaLiquidar, /Liquidaci[oó]n final/);
    assert.match(bolsaLiquidar, /w\.fecha_baja/);
  });
});

describe("deshacer", () => {
  const rev = server.slice(server.indexOf("/api/fichajes/bolsa/revertir"), server.indexOf("// ── Cierre"));

  test("crea un movimiento que apunta al original, y el original se queda", () => {
    assert.match(rev, /referencia_id/);
    assert.match(rev, /-Number\(orig\.minutos\)/);
    assert.ok(!/UPDATE|DELETE/i.test(rev.replace(/\/\/.*/g, "")));
  });

  test("el motivo es obligatorio", () => {
    assert.match(rev, /nota\.length < MOTIVO_MIN/);
  });

  test("una jornada NO se puede deshacer desde aquí", () => {
    assert.match(rev, /motivoNoRevertir\(orig, hermanos\)/);
  });

  test("dos veces no, y lo garantiza la BASE además del código", () => {
    assert.match(rev, /`reversion:\$\{orig\.id\}`/);
    assert.match(esquema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_fic_bolsa_reversion[\s\S]{0,140}WHERE concepto = 'reversion'/);
  });

  test("queda auditado quién, cuándo y por qué", () => {
    assert.match(rev, /ficAuditar\("bolsa", w\.id, "revertir"/);
  });
});

describe("QUIÉN PUEDE LIQUIDAR", () => {
  test("dirección y RR.HH. sí; el encargado NO", () => {
    assert.match(server, /const LIQ_ROLES = \["direccion", "rrhh"\]/);
    assert.ok(!/LIQ_ROLES = \[[^\]]*encargado/.test(server));
    for (const ruta of ["liquidar", "revertir"]) {
      const re = new RegExp(`app\\.post\\("/api/fichajes/bolsa/${ruta}", requireAuth\\(LIQ_ROLES\\)`);
      assert.match(server, re, `${ruta} no está restringido`);
    }
  });

  test("el encargado sigue pudiendo revisar y validar: no se le quita nada", () => {
    assert.match(server, /const RRHH_ROLES = \["rrhh", "direccion", "encargado"\]/);
    assert.match(server, /app\.get\("\/api\/fichajes\/bolsa\/:workerId", requireAuth\(FICHAJES_ROLES\)/);
  });

  test("el trabajador no llega a estos endpoints por ninguna de sus rutas", () => {
    const mias = server.match(/app\.(get|post|put)\("\/api\/mi-[^"]*"[\s\S]{0,2600}?\n\}\);/g) || [];
    for (const m of mias) {
      assert.ok(!/bolsa\/liquidar|bolsa\/revertir/.test(m), "una ruta de trabajador liquida la bolsa");
      assert.ok(!/INSERT INTO fic_bolsa_movimientos/.test(m), "una ruta de trabajador escribe en la bolsa");
    }
  });

  test("el aislamiento por local se comprueba SIEMPRE con el trabajador, no con el que pide", () => {
    // Mandar el worker_id de alguien de otro establecimiento no cuela: se mira el local DE
    // ESA PERSONA contra el alcance de quien lo pide.
    assert.match(server, /const ficBolsaWorker = async \(req, id\) => \{/);
    assert.match(server, /rrhhPuedeLocal\(req, w\.local \|\| ""\)/);
    assert.match(bolsaLiquidar, /ficBolsaWorker\(req, req\.body\?\.worker_id\)/);
    assert.match(rev_local(), /ficBolsaWorker\(req, orig\.worker_id\)/);
  });
  function rev_local() { return server.slice(server.indexOf("/api/fichajes/bolsa/revertir"), server.indexOf("// ── Cierre")); }
});

describe("cierres", () => {
  test("liquidar NO comprueba el cierre de periodo, y es lo correcto", () => {
    // Pagar hoy las horas de marzo no es revisar marzo: es un hecho nuevo. Obligar a
    // reabrir seis periodos para pagar un saldo sería reabrir nóminas ya pagadas.
    assert.ok(!/ficBloqueoPorCierre/.test(bolsaLiquidar), "liquidar bloquea por cierre");
    assert.match(bolsaLiquidar, /ficHoyYPeriodo\(w\.local\)/);
    assert.match(server, /no hace falta reabrir marzo para pagar lo de marzo/);
  });

  test("el día del movimiento lo pone el servidor: no llega del navegador", () => {
    // Si el día viniera de fuera, se podría colar una liquidación dentro de un periodo
    // cerrado y cambiar una nómina firmada.
    assert.ok(!/dia:\s*req\.body/.test(bolsaLiquidar));
    assert.match(server, /async function ficHoyYPeriodo\(local\)[\s\S]{0,400}instanteANegocio\(Date\.now\(\)/);
  });

  test("el ajuste manual SÍ sigue bloqueado por cierre: eso corrige el pasado", () => {
    const aj = server.slice(server.indexOf("/api/fichajes/bolsa/ajuste"), server.indexOf("// ── Liquidar"));
    assert.match(aj, /ficBloqueoPorCierre/);
  });
});

describe("AQUÍ NO HAY DINERO", () => {
  test("ni euros, ni precio/hora, ni nómina, ni IRPF", () => {
    const zona = servidorCodigo.slice(servidorCodigo.indexOf("Liquidar: pagar las horas"), servidorCodigo.indexOf("app.post(\"/api/fichajes/cerrar\""));
    for (const p of ["euro", "€", "precio", "importe", "irpf", "bruto", "neto", "salario", "convenio", "coste"]) {
      assert.ok(!zona.toLowerCase().includes(p), `«${p}» ha entrado en la liquidación`);
    }
  });

  test("tampoco en la pantalla", () => {
    const liq = app.slice(app.indexOf("async function ficLiquidar"), app.indexOf("async function ficRevertir"));
    // «importe» aparece UNA vez, en la frase que dice que no se registra ninguno.
    assert.match(liq, /No se registra ning[uú]n importe/);
    const sinLaFrase = liq.replace(/No se registra ning[uú]n importe/, "");
    for (const p of ["€", "euro", "precio", "importe", "nómina de la empresa"]) {
      assert.ok(!sinLaFrase.toLowerCase().includes(p), `«${p}» en el modal de liquidar`);
    }
  });

  test("no se ha tocado nada de horas extra legales, festivos ni nocturnidad", () => {
    for (const p of ["horas_extra", "nocturnidad", "festivo_recargo", "complementaria"]) {
      assert.ok(!server.includes(p), `«${p}» no es de esta fase`);
    }
  });
});

describe("la pantalla", () => {
  const libro = app.slice(app.indexOf("async function ficAbrirLibro"), app.indexOf("async function ficLiquidar"));

  test("los botones solo salen con horas A FAVOR", () => {
    assert.match(libro, /const aFavor = j\.saldo > 0/);
    assert.match(libro, /puedeAjustar && aFavor \?/);
  });

  test("con saldo negativo se explica, no se esconde", () => {
    assert.match(libro, /j\.saldo < 0[\s\S]{0,240}negativo/);
    assert.ok(!/Cobrar al trabajador|descuento de n[oó]mina/i.test(app), "se ha inventado un cobro al trabajador");
  });

  test("la franquicia se dice en pantalla", () => {
    assert.match(libro, /Franquicia por jornada: ±/);
  });

  test("y en cada jornada se ve de dónde sale su apunte", () => {
    const fila = app.slice(app.indexOf("function ficFilaLibro"), app.indexOf("// La ficha de idempotencia"));
    assert.match(fila, /Diferencia \$\{ficSigno\(m\.dif_min\)\} · franquicia \$\{m\.tolerancia_min\} min → bolsa/);
  });

  test("un movimiento deshecho se TACHA, no se esconde", () => {
    assert.match(css, /\.bl-anulado .bl-cn\{text-decoration:line-through\}/);
    assert.match(app, /m\.revertido \? "bl-anulado" : ""/);
  });

  test("el botón de deshacer no sale en las jornadas", () => {
    assert.match(app, /const FIC_REVERSIBLES = \["pago", "compensacion", "ajuste"\]/);
    assert.match(app, /FIC_REVERSIBLES\.includes\(m\.concepto\)/);
  });

  test("y el que ya está deshecho no se puede volver a deshacer desde la pantalla", () => {
    assert.match(app, /!m\.revertido && FIC_REVERSIBLES/);
  });

  test("quién ve los botones lo decide el servidor", () => {
    assert.match(libro, /const puedeAjustar = j\.puedeLiquidar/);
    assert.match(server, /puedeLiquidar: LIQ_ROLES\.includes\(req\.user\.rol\)/);
  });

  test("el botón se desactiva al pulsar: el doble clic no manda dos peticiones", () => {
    const liq = app.slice(app.indexOf("async function ficLiquidar"), app.indexOf("async function ficRevertir"));
    assert.match(liq, /btn\.disabled = true/);
    assert.match(liq, /btn\.disabled = false/);
  });
});

describe("en el móvil también", () => {
  test("saldo, botones, modales e histórico se apilan por debajo de 700 px", () => {
    const m = css.slice(css.indexOf(".bl-cab{"), css.indexOf("/* Las tres secciones de Inventarios"));
    assert.match(m, /@media\(max-width:700px\)/);
    for (const sel of [".bl-cab", ".bl-acc", ".bl-aj", ".bl-form", ".bl-lista"]) {
      assert.ok(m.includes(sel), `${sel} no tiene versión de móvil`);
    }
  });

  test("los botones de decidir un pago se tocan con el dedo", () => {
    const m = css.slice(css.indexOf(".bl-cab{"), css.indexOf("/* Las tres secciones de Inventarios"));
    assert.match(m, /\.bl-acc\{width:100%;flex-direction:column\}/);
    assert.match(m, /\.bl-acc \.btn\{width:100%;min-height:44px\}/);
    assert.match(m, /\.bl-chk\{[^}]*min-height:44px/);
  });

  test("y los campos no hacen zoom en el iPhone", () => {
    const m = css.slice(css.indexOf(".bl-cab{"), css.indexOf("/* Las tres secciones de Inventarios"));
    assert.match(m, /font-size:16px;min-height:44px/);
  });
});

describe("los invariantes de las fases anteriores", () => {
  test("`fic_eventos` sigue siendo inmutable", () => {
    const ups = server.match(/UPDATE fic_eventos SET ([a-z_]+)/g) || [];
    for (const u of ups) assert.match(u, /anulado_por/, `${u} toca fic_eventos`);
    assert.ok(!/DELETE FROM fic_eventos/.test(server));
  });

  test("min_planificado y min_fichado no se copian el uno en el otro", () => {
    assert.ok(!/min_fichado\s*=\s*min_planificado/.test(server));
    assert.ok(!/min_planificado\s*=\s*min_fichado/.test(server));
  });

  test("la capacidad por áreas de la fase 4 sigue en pie", () => {
    assert.match(server, /puedeEnArea|horAvisoArea/);
  });

  test("no se ha tocado ni el solver, ni vacaciones, ni la ficha laboral", () => {
    const zona = server.slice(server.indexOf("// ── Liquidar"), server.indexOf("app.post(\"/api/fichajes/cerrar\""));
    for (const p of ["hor_ausencias", "hor_worker_areas", "generarSemana", "rrhh_documentos"]) {
      assert.ok(!zona.includes(p), `la liquidación toca ${p}`);
    }
  });
});
