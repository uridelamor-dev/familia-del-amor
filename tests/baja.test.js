// DARSE DE BAJA: el enlace, la página y lo que pasa al confirmar.
//
// ── EL FALLO QUE MÁS SE REPITE EN ESTE TIPO DE ENLACE ────────────────────────────────────────
//
// Un enlace de baja que funciona con GET da de baja a media lista sin que nadie lo haya pulsado:
// WhatsApp, Slack, iMessage y los antivirus de empresa ABREN LOS ENLACES SOLOS para dibujar la
// vista previa. La persona ve la tarjetita, no toca nada, y deja de recibir los descuentos.
//
// Por eso el GET aquí solo PREGUNTA, y la mitad de este fichero existe para que siga siendo así.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nuevoToken, huella, tokenPlausible, huellasIguales, enlaceBaja, conPieDeBaja,
         pieBaja, decidir, textosBaja, BYTES_TOKEN, ESTADOS }
  from "../src/modules/fidelizacion/baja.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|--)/.test(l)).join("\n");
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  return server.slice(i, server.indexOf("\n});", i) + 4);
};
const GET = ruta('app.get("/baixa"');
const POST = ruta('app.post("/baixa"');

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el token", () => {
  test("es largo de verdad: no se acierta probando", () => {
    assert.equal(BYTES_TOKEN, 32);                       // 256 bits
    const t = nuevoToken();
    assert.ok(t.length >= 40, `token de ${t.length} caracteres`);
  });

  test("viaja bien en una URL: nada de +, / ni =", () => {
    // WhatsApp recorta y reescribe enlaces; un `+` o un `=` los parte por la mitad.
    for (let i = 0; i < 200; i++) assert.match(nuevoToken(), /^[A-Za-z0-9_-]+$/);
  });

  test("dos tokens nunca se repiten", () => {
    const vistos = new Set();
    for (let i = 0; i < 2000; i++) vistos.add(nuevoToken());
    assert.equal(vistos.size, 2000);
  });

  test("LA HUELLA NO DEJA RECONSTRUIR EL TOKEN", () => {
    // Es lo que impide que quien lea una fila de la base pueda dar de baja a otra persona.
    const t = nuevoToken();
    const h = huella(t);
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.ok(!h.includes(t));
    assert.ok(!t.includes(h));
    assert.equal(huella(t), h, "la huella no es estable");
    assert.notEqual(huella(nuevoToken()), h);
  });

  test("lo que no tiene forma de token se descarta SIN ir a la base", () => {
    for (const malo of ["", null, undefined, "abc", "1", "../../etc/passwd", "a".repeat(200),
                        "tiene espacios aqui", "tiene+mas/raros=", "<script>"]) {
      assert.equal(tokenPlausible(malo), false, String(malo));
    }
    assert.equal(tokenPlausible(nuevoToken()), true);
  });

  test("las huellas se comparan en tiempo constante", () => {
    const a = huella("uno"), b = huella("dos");
    assert.equal(huellasIguales(a, a), true);
    assert.equal(huellasIguales(a, b), false);
    assert.equal(huellasIguales(a, "corta"), false, "longitudes distintas no revientan");
    assert.equal(huellasIguales(null, undefined), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el enlace que va en el mensaje", () => {
  test("es absoluto y https: dentro de un WhatsApp, un /baixa es texto", () => {
    const t = nuevoToken();
    const u = enlaceBaja("https://familiadelamor.org", t);
    assert.ok(u.startsWith("https://familiadelamor.org/baixa?t="));
    assert.ok(u.includes(encodeURIComponent(t)));
  });

  test("http se convierte en https: los clientes de mensajería bloquean el otro", () => {
    assert.match(enlaceBaja("http://familiadelamor.org", "abc"), /^https:\/\//);
  });

  test("una base rota no produce un enlace a medias, produce NADA", () => {
    // Y que no haya enlace hace que el mensaje no salga, que es lo correcto: una comunicación
    // comercial sin forma de darse de baja no puede salir.
    for (const mala of ["", null, "familiadelamor.org", "/relativo", "javascript:alert(1)"]) {
      assert.equal(enlaceBaja(mala, "abc"), null, String(mala));
    }
  });

  test("la barra sobrante no duplica", () => {
    assert.equal(enlaceBaja("https://x.org///", "a"), "https://x.org/baixa?t=a");
  });

  test("el pie va al final, en su propia línea, y NO se repite", () => {
    const u = "https://x.org/baixa?t=abc";
    const con = conPieDeBaja("Hola!", u);
    assert.ok(con.startsWith("Hola!"));
    assert.ok(con.endsWith(u));
    assert.ok(con.includes("\n\n"), "el enlace va pegado al texto");
    // Si la plantilla ya lo llevaba escrito a mano, no sale dos veces.
    assert.equal(conPieDeBaja(con, u), con);
  });

  test("y está en el idioma de la comunicación", () => {
    assert.match(conPieDeBaja("Hola", "https://x.org/b", { pie: pieBaja("ca") }), /deixar de rebre/);
    assert.match(conPieDeBaja("Hola", "https://x.org/b", { pie: pieBaja("es") }), /dejar de recibir/);
    assert.equal(pieBaja("zz"), pieBaja("es"), "un idioma raro cae en castellano");
  });

  test("sin enlace, el texto se devuelve intacto", () => {
    assert.equal(conPieDeBaja("Hola", null), "Hola");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("qué se decide con lo que hay guardado", () => {
  test("los estados son los tres acordados y están congelados", () => {
    assert.deepEqual([...ESTADOS], ["vale", "ya_estaba", "no_existe"]);
    assert.throws(() => { ESTADOS.push("x"); }, TypeError);
  });

  test("UN TOKEN INVÁLIDO NO SE DISTINGUE DE UNO QUE NO EXISTE", () => {
    // Si se distinguieran, probando enlaces se sabría cuáles son de verdad.
    assert.deepEqual(decidir(null, { confirmar: false }), { estado: "no_existe", aplicar: false, codigo: 404 });
    assert.deepEqual(decidir(null, { confirmar: true }), { estado: "no_existe", aplicar: false, codigo: 404 });
  });

  test("ABRIR EL ENLACE NO APLICA NADA", () => {
    // La prueba del bot: un previsualizador hace GET, y `confirmar` es falso.
    const d = decidir({ id: 1, confirmado_en: null }, { confirmar: false });
    assert.equal(d.estado, "vale");
    assert.equal(d.aplicar, false, "un GET daría de baja");
  });

  test("confirmar SÍ aplica", () => {
    assert.equal(decidir({ id: 1, confirmado_en: null }, { confirmar: true }).aplicar, true);
  });

  test("DOBLE BAJA: la segunda no reaplica ni mueve la fecha", () => {
    // La gente pulsa dos veces y los bots cien. La primera fecha es la que vale si alguien
    // pregunta cuándo dejó de recibir mensajes.
    const fila = { id: 1, confirmado_en: "2026-09-15T10:00:00+02:00" };
    for (const confirmar of [true, false]) {
      const d = decidir(fila, { confirmar });
      assert.equal(d.estado, "ya_estaba");
      assert.equal(d.aplicar, false);
      assert.equal(d.codigo, 200);
      assert.equal(d.confirmado_en, fila.confirmado_en, "se ha movido la fecha de baja");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("EL GET NO ESCRIBE NADA", () => {
  test("ni un UPDATE, ni un INSERT, ni un DELETE en toda la ruta", () => {
    // Es LA garantía de este fichero: el enlace lo abren solos los previsualizadores.
    const cuerpo = sinComentarios(GET);
    for (const escritura of ["UPDATE ", "INSERT ", "DELETE ", "dbRun("]) {
      assert.ok(!cuerpo.includes(escritura), `el GET hace ${escritura.trim()}`);
    }
  });

  test("lo que mira tampoco escribe", () => {
    const mirar = server.slice(server.indexOf("async function fidMirarBaja("),
                               server.indexOf("const fidIdiomaBaja"));
    const cuerpo = sinComentarios(mirar);
    for (const escritura of ["UPDATE ", "INSERT ", "dbRun("]) {
      assert.ok(!cuerpo.includes(escritura), `fidMirarBaja hace ${escritura.trim()}`);
    }
    assert.match(mirar, /SELECT id, telefono, confirmado_en FROM fid_bajas WHERE token_hash = \?/);
    // Y descarta lo que no tiene forma de token ANTES de consultar.
    assert.match(mirar, /if \(!fidTokenBajaOk\(token\)\) return/);
    assert.ok(mirar.indexOf("fidTokenBajaOk") < mirar.indexOf("dbGet"));
  });

  test("y la baja la hace un POST, con un formulario de verdad", () => {
    // Sin JavaScript: se abre casi siempre en el navegador de dentro de WhatsApp.
    assert.match(server, /<form method="POST" action="\/baixa">/);
    assert.match(server, /<button type="submit" class="bx-btn">/);
  });

  test("la página pide que no la indexe nadie", () => {
    for (const r of [GET, POST]) {
      assert.match(r, /X-Robots-Tag", "noindex, nofollow"/);
      assert.match(r, /res\.set\("Cache-Control", "no-store"\)/);
    }
    assert.match(server, /<meta name="robots" content="noindex, nofollow">/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("la baja de verdad", () => {
  test("SOLO GANA UNA: la condición va en el WHERE", () => {
    // Dos pulsaciones a la vez no aplican la baja dos veces ni se pisan la fecha.
    assert.match(POST, /UPDATE fid_bajas SET confirmado_en = \? WHERE id = \? AND confirmado_en IS NULL RETURNING id/);
    assert.match(POST, /if \(!tomada\) \{[\s\S]{0,200}"ya_estaba"/);
  });

  test("marca la baja DONDE MIRA TODA LA CASA, no en una tabla nueva", () => {
    // `marketing_prefs.baja` es lo que consultan los cupones, la tarjeta, las campañas y Sara.
    // Una baja en otro sitio habría dejado dos verdades y la gente habría seguido recibiendo
    // mensajes por el otro camino.
    assert.match(POST, /UPDATE marketing_prefs SET baja = 1/);
    assert.match(POST, /INSERT INTO marketing_prefs \(telefono, baja, updated_at\) VALUES \(\?, 1, \?\)/);
    assert.match(POST, /ON CONFLICT \(telefono\) DO UPDATE SET baja = 1/);
  });

  test("cierra el consentimiento, y solo el que estuviera vivo", () => {
    assert.match(POST, /UPDATE fid_consentimientos SET baja_en = \?, baja_origen = 'enlace'\s*\n\s*WHERE telefono = \? AND baja_en IS NULL/);
  });

  test("DESCARTA LO PENDIENTE Y NO TOCA LO ENVIADO", () => {
    // Un WhatsApp entregado no se puede retirar, y reescribir el registro de lo que salió sería
    // mentir sobre lo ocurrido.
    const ups = [...POST.matchAll(/UPDATE cap_cola SET[^`]*/g)].map((m) => m[0]);
    assert.equal(ups.length, 1);
    assert.match(ups[0], /estado = 'descartado', pausado = FALSE/);
    assert.match(ups[0], /WHERE telefono = \? AND estado = 'pendiente'/);
  });

  test("y el worker vuelve a mirar la baja antes de CADA envío", () => {
    // Es lo que cierra la carrera de verdad: lo que se escape del descarte, se frena ahí.
    const worker = server.slice(server.indexOf("async function capVaciarCola()"),
                                server.indexOf("async function capVaciarCola()") + 7000);
    assert.match(worker, /SELECT baja FROM marketing_prefs WHERE/);
    const iMira = worker.indexOf("SELECT baja FROM marketing_prefs");
    const iManda = worker.indexOf("sendMensajeLibre");
    assert.ok(iMira > 0 && iManda > iMira, "se manda antes de comprobar la baja");
  });

  test("no hay botón de «volver a apuntarse»: eso exige consentimiento nuevo", () => {
    // Un deshacer aquí dejaría que quien tenga el enlace reactive a alguien que pidió que le
    // dejaran en paz.
    for (const t of ["reactivar", "volver a apuntar", "deshacer", "baja = 0", "baja = FALSE"]) {
      assert.ok(!POST.includes(t), `el POST permite ${t}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("no se escapa ni un dato personal", () => {
  test("LA PÁGINA NO ENSEÑA EL TELÉFONO, ni a medias", () => {
    // Quien abre el enlace puede no ser el dueño del móvil: puede ser a quien se lo reenviaron.
    const pagina = server.slice(server.indexOf("function fidPaginaBaja("),
                                server.indexOf("async function fidMirarBaja("));
    for (const dato of ["telefono", "fila.tel", "nombre", "correo"]) {
      assert.ok(!pagina.includes(dato), `la página pinta ${dato}`);
    }
  });

  test("los textos de la página no llevan ningún hueco para datos", () => {
    for (const idioma of ["ca", "es"]) {
      const T = textosBaja(idioma);
      for (const [k, v] of Object.entries(T)) {
        assert.ok(String(v).trim(), `${idioma}.${k} vacío`);
        assert.ok(!/\{|\$\{|%s/.test(v), `${idioma}.${k} tiene un hueco: ${v}`);
      }
    }
  });

  test("NI EL TELÉFONO NI EL TOKEN ACABAN EN EL REGISTRO", () => {
    for (const r of [GET, POST]) {
      for (const m of sinComentarios(r).matchAll(/console\.(log|error|warn)\(([^\n]*)/g)) {
        assert.match(m[2], /^lineaErrorSql\(/, `registro a pelo: ${m[2]}`);
        assert.ok(!/tel\b|telefono|token|huella/.test(m[2]), `dato en el registro: ${m[2]}`);
      }
    }
  });

  test("y la auditoría guarda EL HECHO, no la persona", () => {
    assert.match(POST, /ficAuditar\("fidelizacion", null, "baja_comunicaciones", "publico"/);
    const audit = POST.slice(POST.indexOf('ficAuditar("fidelizacion", null, "baja_comunicaciones"'));
    const detalle = audit.slice(0, audit.indexOf("}"));
    assert.ok(!/tel|token|huella|nombre/.test(detalle), `la auditoría lleva datos: ${detalle}`);
  });

  test("el panel ve el NÚMERO de bajas, nunca los tokens", () => {
    const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
    const bloque = app.slice(app.indexOf("function renderFidgBajas()"),
                             app.indexOf("function renderFidgComunicaciones()"));
    for (const dato of ["token", "huella", "telefono"]) {
      assert.ok(!bloque.includes(dato), `el panel enseña ${dato}`);
    }
    assert.match(bloque, /b\.total/);
    // Y el servidor solo manda recuentos.
    const lista = ruta('app.get("/api/fidelizacion/comunicaciones", requireAuth(PROMOS_ROLES)');
    assert.match(lista, /COUNT\(\*\) FILTER \(WHERE confirmado_en IS NOT NULL\)::int AS total/);
    assert.ok(!/SELECT[^;]*token_hash/.test(lista), "la lista devuelve huellas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el esquema", () => {
  test("guarda la HUELLA, y es única", () => {
    assert.match(esquema, /token_hash TEXT NOT NULL UNIQUE/);
    const tabla = esquema.slice(esquema.indexOf("CREATE TABLE IF NOT EXISTS fid_bajas"),
                                esquema.indexOf("idx_fid_bajas_tel"));
    assert.ok(!/token TEXT|token_claro|token_plano/.test(tabla), "se guarda el token en claro");
  });

  test("la baja nace SIN confirmar", () => {
    assert.match(esquema, /confirmado_en TEXT,/);
    const tabla = esquema.slice(esquema.indexOf("CREATE TABLE IF NOT EXISTS fid_bajas"),
                                esquema.indexOf("idx_fid_bajas_tel"));
    assert.ok(!/confirmado_en[^,]*DEFAULT/.test(tabla), "nace ya confirmada");
  });

  test("y es aditivo: no borra ni vacía nada", () => {
    const sql = sinComentarios(esquema);
    for (const peligro of ["DROP TABLE", "DROP COLUMN", "DELETE FROM", "TRUNCATE"]) {
      assert.ok(!sql.includes(peligro), `el esquema contiene ${peligro}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("TODA comunicación lleva su enlace", () => {
  const encolar = ruta('app.post("/api/fidelizacion/comunicaciones/:id/encolar"');

  test("se emite un token por mensaje y se guarda su huella", () => {
    assert.match(encolar, /const tokenBaja = fidNuevoTokenBaja\(\);/);
    assert.match(encolar, /INSERT INTO fid_bajas \(token_hash, telefono, comunicacion_id, campana, creado_en\)/);
    assert.match(encolar, /fidHuellaBaja\(tokenBaja\)/);
    // El token en claro NO se guarda en ningún sitio: solo viaja dentro del mensaje.
    assert.ok(!/VALUES[^;]*tokenBaja[^H]/.test(encolar.replace(/fidHuellaBaja\(tokenBaja\)/g, "H")),
      "el token se guarda en claro");
  });

  test("SI NO SE PUEDE PREPARAR EL ENLACE, EL MENSAJE NO SALE", () => {
    // Una comunicación comercial sin forma de darse de baja no es una opción. Quedarse un envío
    // sin mandar, sí.
    assert.match(encolar, /if \(!bajaOk\) \{ sinBaja \+= 1; continue; \}/);
    assert.ok(encolar.indexOf("bajaOk") < encolar.indexOf("INSERT INTO cap_cola"),
      "se encola antes de comprobar que hay enlace");
  });

  test("y se dice cuántos se quedaron fuera por eso", () => {
    assert.match(encolar, /sin_baja: sinBaja/);
  });

  test("el enlace se añade al texto, no lo sustituye", () => {
    // El compositor pasa a decidir POR TIPO, y las comunicaciones son COMERCIAL: siguen
    // llevando su enlace de baja exactamente igual. Lo que cambió es el camino de ENTREGA —el
    // WhatsApp inmediato de un formulario—, que es otro sitio y tiene su propio test.
    assert.match(encolar,
      /texto = fidComponerMensaje\(texto, \{ tipo: FID_TIPO_MENSAJE\.COMERCIAL,[\s\S]{0,120}pie: fidPieBaja\(c\.idioma\)/,
      "una comunicación comercial ha dejado de llevar su enlace de baja");
  });
});
