// SARA CALLA CUANDO HAY UNA PERSONA DELANTE, Y HABLA EN EL IDIOMA DEL CLIENTE.
//
// ── QUÉ SE BLINDA AQUÍ ──────────────────────────────────────────────────────────────────────
//
// Tres cosas que NO pueden depender de que el modelo acierte:
//
//   1. Si una conversación está en manos de una persona, Sara no contesta. Ni tras un reinicio,
//      ni tras un redespliegue, ni porque se le haya olvidado el `Map` de memoria.
//   2. Si el cliente pide hablar con alguien, se deriva aunque el modelo no llame a la
//      herramienta. Es la red, y se tiende ANTES de preguntarle.
//   3. Si el mensaje de ahora es «Hola», el idioma sale de lo anterior y no del último idioma en
//      que le escribimos nosotros.
//
// Y una cuarta que es puro daño evitado: una fila sin respuesta —un mensaje recibido durante la
// pausa, o una importación antigua— no puede meter un turno VACÍO en el contexto. La API rechaza
// el contenido en blanco y se cae la conversación entera, no ese mensaje.
//
// ── LO QUE NO HAY AQUÍ ──────────────────────────────────────────────────────────────────────
//
// Ninguna campaña concreta, ninguna fecha concreta, ningún texto de marketing. Se prueba la
// REGLA con datos inventados: si aquí apareciera el nombre de una promoción de este otoño,
// estaríamos probando esa promoción en vez de lo que tiene que valer el año que viene.
//
// Nada de este fichero abre un socket, toca la base ni manda un mensaje.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ESTADO_IA, MOTIVO_PAUSA, ETIQUETA_MOTIVO, estaPausada, marcarPausa, marcarActiva,
         esAmbiguo, pistaIdioma, idiomaSugerido, lineaIdioma, pidePersona,
         IDIOMA_POR_DEFECTO }
  from "../src/modules/messaging/sara.js";
import { construirContexto, SIN_RESPUESTA } from "../src/modules/messaging/contexto.js";

const SERVER = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const WA = readFileSync(new URL("../whatsapp.js", import.meta.url), "utf8");
const PANEL = readFileSync(new URL("../public/direccion.js", import.meta.url), "utf8");

/** Bloque por conteo de llaves, con la flecha como marca del cuerpo. LANZA si el ancla no está. */
function bloque(texto, ancla) {
  const i = texto.indexOf(ancla);
  if (i === -1) throw new Error(`ancla no encontrada: «${ancla}»`);
  const flecha = texto.slice(i, i + 400).search(/=>\s*\{/);
  let abre = -1;
  if (flecha >= 0) {
    abre = texto.indexOf("{", i + flecha);
  } else {
    let par = 0;
    for (let k = i; k < texto.length; k++) {
      const c = texto[k];
      if (c === "(") par += 1;
      else if (c === ")") par -= 1;
      else if (c === "{" && par === 0) { abre = k; break; }
    }
  }
  if (abre === -1) throw new Error(`no se encuentra el cuerpo de «${ancla}»`);
  let prof = 0, j = abre;
  for (; j < texto.length; j += 1) {
    if (texto[j] === "{") prof += 1;
    else if (texto[j] === "}") { prof -= 1; if (prof === 0) { j += 1; break; } }
  }
  if (prof !== 0) throw new Error(`bloque sin cerrar en «${ancla}»`);
  return texto.slice(i, j);
}

/** Sin los comentarios: una línea comentada NO cuenta como código que existe. */
const sinComentarios = (t) => t.replace(/^\s*\/\/.*$/gm, "");

const PROCESAR = bloque(WA, "async function procesarBatch(");
const RESPONDER = bloque(WA, "async function responderConIA(");
const PAUSAR = bloque(SERVER, "setOnPausarIA(");
const REACTIVAR = bloque(SERVER, 'app.post("/api/whatsapp/reactivar"');
const ATENCION = bloque(SERVER, 'app.get("/api/whatsapp/atencion"');

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("El idioma del cliente", () => {

  test("un mensaje en catalán se reconoce como catalán", () => {
    const r = idiomaSugerido({ mensajesCliente: ["Aquest dia treballo al matí, puc canviar-ho?"] });
    assert.equal(r.idioma, "ca");
    assert.equal(r.fuente, "mensaje");
  });

  test("un mensaje en inglés se reconoce como inglés", () => {
    const r = idiomaSugerido({ mensajesCliente: ["Can I use it another day please?"] });
    assert.equal(r.idioma, "en");
  });

  test("EL CLIENTE GANA A LA CAMPAÑA: le escribimos en catalán y contesta en inglés", () => {
    const r = idiomaSugerido({
      mensajesCliente: ["Can I use it another day?"],
      idiomaCampana: "ca",
    });
    assert.equal(r.idioma, "en", "el idioma de la campaña no puede imponerse al del cliente");
  });

  test("«Hola» a secas no decide nada: es ambiguo en los tres", () => {
    assert.equal(esAmbiguo("Hola"), true);
    assert.equal(esAmbiguo("Sí"), true);
    assert.equal(esAmbiguo("Ok gràcies"), true);       // dos palabras siguen siendo pocas
    assert.equal(esAmbiguo("Aquest dia treballo"), false);
  });

  test("con un mensaje ambiguo se tira del historial del propio cliente", () => {
    const r = idiomaSugerido({ mensajesCliente: ["Bon dia, vull reservar una taula", "Ok"] });
    assert.equal(r.idioma, "ca");
    assert.equal(r.fuente, "historial");
  });

  test("sin historial se usa lo que sepamos del contacto", () => {
    const r = idiomaSugerido({ mensajesCliente: ["Hola"], idiomaContacto: "ca" });
    assert.equal(r.idioma, "ca");
    assert.equal(r.fuente, "contacto");
  });

  test("y si no hay absolutamente nada, castellano", () => {
    const r = idiomaSugerido({ mensajesCliente: [] });
    assert.equal(r.idioma, IDIOMA_POR_DEFECTO);
    assert.equal(r.fuente, "defecto");
  });

  test("la pista dice «no lo sé» en vez de inventarse un idioma", () => {
    assert.equal(pistaIdioma("12345"), null);
    assert.equal(pistaIdioma(""), null);
    assert.equal(pistaIdioma("👍"), null);
  });

  test("NO ES UNA ORDEN: la línea le dice que mande el mensaje que tiene delante", () => {
    const linea = lineaIdioma({ idioma: "ca", fuente: "contacto" });
    assert.match(linea, /^\[CONTEXTO INTERNO:/);
    assert.match(linea, /parece hablar catalán/);
    assert.match(linea, /otro idioma/i, "tiene que dejar la puerta abierta a que cambie");
    assert.doesNotMatch(linea, /traduce/i, "no se le pide traducir, se le pide conversar");
  });

  test("no se implementa un traductor: la pista solo etiqueta, nunca reescribe el mensaje", () => {
    // La línea se AÑADE al mensaje del cliente; el mensaje viaja tal cual.
    assert.match(RESPONDER, /\$\{parteIdioma\}\s*\$\{mensajeUsuario\}/,
      "el mensaje del cliente tiene que llegarle al modelo sin tocar");
  });

  test("el idioma detectado se recuerda SOLO cuando el mensaje daba para decidirlo", () => {
    assert.match(RESPONDER, /pista\.fuente === "mensaje"/,
      "guardar una suposición la convertiría en un dato");
    assert.match(RESPONDER, /campo: "idioma_ultimo"/);
    assert.match(SERVER, /campo === "idioma_ultimo"/,
      "el servidor tiene que saber guardar ese campo o la escritura se pierde en silencio");
  });

  test("la pista se calcula con los mensajes DEL CLIENTE, no con los nuestros", () => {
    assert.match(RESPONDER, /!t\.content\.startsWith\("\[CONTEXTO INTERNO:"\)/,
      "si entraran nuestras etiquetas, Sara hablaría el idioma de la campaña");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("Pedir hablar con una persona", () => {

  const SÍ = [
    "¿Puedo hablar con una persona?",
    "Puc parlar amb una persona?",
    "Can I talk to someone?",
    "Quiero hablar con el encargado",
    "pásame con alguien por favor",
    "No quiero un bot",
    "I want to speak with a real person",
  ];
  for (const t of SÍ) {
    test(`se deriva: «${t}»`, () => assert.equal(pidePersona(t), true));
  }

  const NO = [
    "Hola",
    "Quiero hablar de la promoción",
    "¿Hay alguien ahí?",
    "Quiero reservar mesa para 4 personas",
    "Somos 6 personas",
  ];
  for (const t of NO) {
    test(`NO se deriva: «${t}»`, () => assert.equal(pidePersona(t), false,
      "derivar a quien no lo ha pedido también molesta"));
  }

  test("LA RED SE TIENDE ANTES DE PREGUNTARLE AL MODELO", () => {
    const iRed = PROCESAR.indexOf("pidePersona(textoCombinado)");
    const iIA = PROCESAR.indexOf("responderConIA(");
    assert.ok(iRed > -1, "la red de la derivación tiene que existir");
    assert.ok(iIA > -1);
    assert.ok(iRed < iIA, "si se mirara después, el modelo podría no llamar a la herramienta y nadie lo arreglaría");
  });

  test("la herramienta existe, es lo primero que ve el modelo y exige decir si lo pidió él", () => {
    assert.match(WA, /name: "pasar_a_persona"/);
    const iPersona = WA.indexOf('name: "pasar_a_persona"');
    const iReserva = WA.indexOf('name: "registrar_reserva"');
    assert.ok(iReserva === -1 || iPersona < iReserva, "va la primera de la lista de herramientas");
    assert.match(WA, /required: \["motivo", ?"pidio_persona"\]/);
  });

  test("derivar NO manda ningún mensaje por su cuenta: solo marca", () => {
    const herramienta = WA.slice(WA.indexOf('if (name === "pasar_a_persona")'));
    const cuerpo = herramienta.slice(0, herramienta.indexOf('if (name === "cancelar_reserva")'));
    assert.doesNotMatch(cuerpo, /sock\.sendMessage/,
      "el texto se lo dice Sara en su idioma dentro de la misma respuesta, no un copy fijo desde aquí");
  });

  test("NO HAY FRASE FIJA: la confirmación es una regla de comportamiento, no un texto", () => {
    // Lo que se le devuelve al modelo es una instrucción, y lleva «SU idioma» dentro.
    assert.match(WA, /Confírmaselo al cliente en SU idioma/);
  });

  test("una pregunta sin respuesta también deriva, pero con otro motivo", () => {
    assert.match(WA, /MOTIVO_PAUSA\.CONSULTA/);
    assert.match(WA, /input\?\.pidio_persona \? MOTIVO_PAUSA\.PIDIO_PERSONA : MOTIVO_PAUSA\.CONSULTA/,
      "lo que el cliente pidió expresamente manda sobre el motivo que se apunte");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("La pausa: Sara calla", () => {

  test("solo «pausada» pausa; nada más la pausa por accidente", () => {
    assert.equal(estaPausada({ estado_ia: "pausada" }), true);
    assert.equal(estaPausada({ estado_ia: "activa" }), false);
    assert.equal(estaPausada({}), false);
    assert.equal(estaPausada(null), false);
    assert.equal(estaPausada({ estado_ia: "PAUSADA" }), false);
  });

  test("una ficha vieja, sin la columna, se comporta como siempre", () => {
    // Las conversaciones de antes de esta fase no tienen `estado_ia`: Sara les contesta igual.
    assert.equal(estaPausada({ jid: "x@s.whatsapp.net", nombre: "Alguien" }), false);
  });

  test("un motivo desconocido no se guarda tal cual", () => {
    assert.equal(marcarPausa({ motivo: "<script>" }).pausa_motivo, MOTIVO_PAUSA.MANUAL);
    assert.equal(marcarPausa({ motivo: MOTIVO_PAUSA.CONSULTA }).pausa_motivo, MOTIVO_PAUSA.CONSULTA);
  });

  test("cada motivo tiene su etiqueta para el panel", () => {
    for (const m of Object.values(MOTIVO_PAUSA)) {
      assert.equal(typeof ETIQUETA_MOTIVO[m], "string");
      assert.ok(ETIQUETA_MOTIVO[m].length > 3);
    }
  });

  test("EL CORTE ESTÁ ARRIBA DEL TODO, antes de cualquier llamada al modelo", () => {
    const iCorte = PROCESAR.indexOf("estaPausada(");
    const iIA = PROCESAR.indexOf("responderConIA(");
    const iSeguimiento = PROCESAR.indexOf("followupAwaitingReply.has(jid)");
    assert.ok(iCorte > -1 && iIA > -1);
    assert.ok(iCorte < iIA, "no puede preguntarse después de haber gastado la llamada");
    // Y tiene que ser incondicional: `if (false && estaPausada(...))` también pasaría lo anterior.
    assert.match(sinComentarios(PROCESAR), /\n\s*if \(estaPausada\(ficha\)\) \{/,
      "el corte no puede ir detrás de ninguna otra condición");
    assert.ok(iSeguimiento === -1 || iCorte < iSeguimiento,
      "la pausa también manda sobre el seguimiento automático");
  });

  test("EL MENSAJE SE GUARDA IGUAL: lo que no ocurre es la respuesta", () => {
    const corte = PROCESAR.slice(PROCESAR.indexOf("estaPausada("));
    const fin = corte.indexOf("adjuntoInfo");
    const cuerpo = corte.slice(0, fin > 0 ? fin : 1500);
    assert.match(cuerpo, /onMessage\(\{[^}]*respuesta: null/,
      "sin esto el trabajador no ve lo que el cliente escribe mientras tanto");
    assert.match(cuerpo, /return;/);
    assert.doesNotMatch(cuerpo, /sock\.sendMessage/, "pausada significa que no sale nada");
  });

  test("si no se puede LEER el estado, se sigue contestando", () => {
    const corte = PROCESAR.slice(PROCESAR.indexOf("if (perfilLoader)"));
    assert.match(corte.slice(0, 1200), /catch \(e\)/,
      "callar por un error de lectura dejaría sin respuesta a quien no ha pedido nada");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("Dónde vive el estado, y qué pasa al reactivar", () => {

  test("NO ES UN MAP EN MEMORIA: se escribe en wa_clientes", () => {
    assert.match(sinComentarios(PAUSAR), /INSERT INTO wa_clientes\s*\(/,
      "en esa tabla exactamente, no en una paralela que se invente el estado");
    assert.match(PAUSAR, /estado_ia/);
    assert.match(SERVER, /ALTER TABLE wa_clientes ADD COLUMN IF NOT EXISTS/,
      "las columnas tienen que nacer solas en una base que ya existe");
    for (const col of ["estado_ia", "pausa_motivo", "pausado_en", "pausado_por", "idioma_ultimo"]) {
      assert.ok(SERVER.includes(`"${col} TEXT"`), `falta la columna ${col}`);
    }
  });

  test("el perfil que lee Sara trae el estado; si no, el corte no vería nada", () => {
    const cargador = bloque(SERVER, "setPerfilLoader(");
    assert.match(cargador, /estado_ia/);
    assert.match(cargador, /pausa_motivo/);
    assert.match(cargador, /idioma_ultimo/);
  });

  test("pausar dos veces no pisa el motivo original", () => {
    assert.match(sinComentarios(PAUSAR), /pausa_motivo = COALESCE\(wa_clientes\.pausa_motivo/,
      "lo que importa es por qué se paró la primera vez");
  });

  test("REACTIVAR OLVIDA LA SESIÓN EN MEMORIA", () => {
    assert.match(sinComentarios(REACTIVAR), /olvidarSesionWA\(/,
      "sin esto Sara retomaría el hilo donde lo dejó y se saltaría la conversación que hubo sin ella");
    assert.match(WA, /export function olvidarSesion\(jid\)/);
  });

  test("reactivar NO borra el historial", () => {
    assert.doesNotMatch(REACTIVAR, /DELETE FROM whatsapp_messages/);
    assert.doesNotMatch(REACTIVAR, /DELETE FROM wa_clientes/);
    const a = marcarActiva();
    assert.equal(a.estado_ia, ESTADO_IA.ACTIVA);
    assert.equal(a.pausa_motivo, null);
  });

  test("reactivar es un acto humano y queda firmado", () => {
    assert.match(sinComentarios(REACTIVAR), /requireAuth\(\["direccion"\]\)/);
    assert.match(sinComentarios(REACTIVAR), /ficAuditar\("whatsapp", null, "sara_reactivada", req\.user\.username/);
  });

  test("NO HAY NINGÚN CAMINO AUTOMÁTICO QUE REACTIVE A SARA", () => {
    // `marcarActiva` solo puede llamarse desde el endpoint del panel. Si apareciera en whatsapp.js
    // o en un temporizador, una conversación en manos de una persona podría soltarse sola.
    assert.doesNotMatch(WA, /marcarActiva/);
    assert.equal((SERVER.match(/saraMarcarActiva\(\)/g) || []).length, 1,
      "solo el endpoint de reactivación puede soltar la pausa");
  });

  test("la lista de las que esperan no expone nada del cliente", () => {
    assert.doesNotMatch(ATENCION, /\bmensaje\b|\brespuesta\b|nombre/,
      "el panel solo necesita el teléfono y el motivo");
    assert.match(sinComentarios(ATENCION), /requireAuth\(\["direccion"\]\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("El panel", () => {

  test("se ve de un vistazo cuál requiere atención humana", () => {
    assert.match(PANEL, /\/api\/whatsapp\/atencion/);
    assert.match(PANEL, /Atención humana/);
    assert.match(PANEL, /wa-espera/);
  });

  test("el botón de reactivar pide confirmación", () => {
    assert.match(PANEL, /\/api\/whatsapp\/reactivar/);
    const i = PANEL.indexOf("waReactivar");
    const trozo = PANEL.slice(i, i + 900);
    assert.match(sinComentarios(trozo), /\n\s*if \(!confirm\(/,
      "volver a activarla sin querer deja sola a una persona que esperaba");
  });

  test("NO se construye un CRM nuevo: se reutiliza la vista de WhatsApp que ya había", () => {
    assert.match(PANEL, /loadWaMensajes/);
    assert.ok(!/viewAtencion|nueva vista|crm/i.test(PANEL.slice(0, 2000)));
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("Lo que no se puede romper", () => {

  test("UN MENSAJE SIN RESPUESTA NO PUEDE METER UN TURNO VACÍO", () => {
    // Es lo que deja una conversación pausada, y también las importaciones antiguas. Un
    // `content: ""` lo rechaza la API y se cae la conversación ENTERA, no ese mensaje.
    const turnos = construirContexto([
      { tipo: "intercambio", mensaje: "¿Puedo hablar con una persona?", respuesta: null },
    ]);
    assert.equal(turnos.length, 2);
    for (const t of turnos) {
      assert.ok(typeof t.content === "string" && t.content.trim().length > 0,
        `turno vacío en ${t.role}`);
    }
    assert.equal(turnos[1].content, SIN_RESPUESTA);
  });

  test("y lo dice, en vez de rellenar: Sara tiene que saber que aquello se quedó sin contestar", () => {
    assert.match(SIN_RESPUESTA, /^\[CONTEXTO INTERNO:/);
    assert.match(SIN_RESPUESTA, /no le respondiste/i);
  });

  test("los mensajes viejos, sin nada de esto, siguen construyendo su contexto", () => {
    const turnos = construirContexto([
      { tipo: "intercambio", mensaje: "Hola", respuesta: "¡Hola! ¿En qué te ayudo?" },
    ]);
    assert.deepEqual(turnos.map((t) => t.role), ["user", "assistant"]);
    assert.equal(turnos[0].content, "Hola");
  });

  test("LOS HORARIOS DE RESERVA SIGUEN AHÍ", () => {
    assert.match(WA, /12:30.15:30/, "la franja de mediodía no se toca");
    assert.match(WA, /19:30.22:30/, "la franja de cena no se toca");
    assert.match(WA, /## Reservas: sus horarios son SOLO suyos/,
      "lo que cambia es CUÁNDO se ofrecen, no que existan");
  });

  test("las herramientas de reserva siguen intactas", () => {
    for (const t of ["registrar_reserva", "cancelar_reserva", "modificar_reserva"]) {
      assert.ok(WA.includes(`name: "${t}"`), `falta la herramienta ${t}`);
    }
  });

  test("el prompt prohíbe inventarse las condiciones de una promoción", () => {
    assert.match(WA, /## Promociones y códigos/);
    assert.match(WA, /NO la supongas/);
  });

  test("NADA DE ESTO LLEVA UNA CAMPAÑA ESCRITA DENTRO", () => {
    const propio = readFileSync(new URL("../src/modules/messaging/sara.js", import.meta.url), "utf8");
    for (const fuente of [propio, PAUSAR, REACTIVAR, ATENCION]) {
      assert.doesNotMatch(fuente, /esmorzar|girona|desayuno gratis|esmorzar-girona/i,
        "la regla tiene que valer para la promoción del año que viene");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  EL CASO COMPLETO, DE PUNTA A PUNTA
//
//  Se recorre el ciclo entero con las funciones REALES y una base de mentira: campaña → respuesta
//  del cliente en otro idioma → pregunta que Sara no puede responder → derivación → silencio →
//  la persona contesta → reactivación → Sara retoma con TODO lo que pasó sin ella.
//
//  Los textos son inventados. Lo que se comprueba es el mecanismo, no una promoción de este año.
// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("El ciclo entero: activa → pausada → reactivada", () => {

  test("de la campaña en catalán a la derivación, y de vuelta", () => {
    // ── La base de mentira: dos tablas, las mismas columnas que las de verdad ────────────────
    const mensajes = [];                       // whatsapp_messages
    let ficha = { jid: "34600000000@s.whatsapp.net" };  // wa_clientes

    // Lo que hace el cargador de historial: lo más nuevo primero, y sin las filas marcadas.
    const historial = () => construirContexto(
      [...mensajes].reverse().filter((m) => (m.respuesta ?? "") !== "(sin respuesta registrada)"));
    const delCliente = () => historial()
      .filter((t) => t.role === "user" && !t.content.startsWith("[CONTEXTO INTERNO:"))
      .map((t) => t.content);

    // ── 1 · Le mandamos el código de una promoción, en catalán ───────────────────────────────
    mensajes.push({ tipo: "saliente", origen: "campana", clave_campana: "promo-prova",
                    tipo_mensaje: "entrega", creado_en: "2026-09-01T10:00:00+02:00",
                    mensaje: "[Campaña]", respuesta: "Aquí tens el teu codi: https://exemple.test/x" });

    // ── 2 · Contesta en INGLÉS. El idioma del cliente gana al de la campaña ───────────────────
    const suyo1 = "Can I use it another day please?";
    let pista = idiomaSugerido({ mensajesCliente: [...delCliente(), suyo1],
                                 idiomaContacto: ficha.idioma_ultimo || null,
                                 idiomaCampana: "ca" });
    assert.equal(pista.idioma, "en", "le escribimos en catalán, pero él contesta en inglés");
    assert.equal(pista.fuente, "mensaje");
    ficha.idioma_ultimo = pistaIdioma(suyo1);   // solo porque el mensaje daba para decidirlo
    assert.equal(ficha.idioma_ultimo, "en");

    // ── 3 · No sabemos esa condición: Sara deriva. NO es una petición de persona ──────────────
    assert.equal(pidePersona(suyo1), false, "preguntar por una condición no es pedir una persona");
    Object.assign(ficha, marcarPausa({ motivo: MOTIVO_PAUSA.CONSULTA, por: "sara",
                                       ahora: "2026-09-01T18:00:00+02:00" }));
    mensajes.push({ tipo: "intercambio", mensaje: suyo1,
                    respuesta: "Let me check that with the team." });
    assert.equal(estaPausada(ficha), true);
    assert.equal(ETIQUETA_MOTIVO[ficha.pausa_motivo], "Sara no sabía la respuesta");

    // ── 4 · Vuelve a escribir. Se GUARDA, pero no se le contesta ─────────────────────────────
    mensajes.push({ tipo: "intercambio", mensaje: "Any news?", respuesta: null });
    assert.equal(estaPausada(ficha), true, "sigue pausada tras un mensaje nuevo");

    // Y aunque pausar se intente otra vez, el motivo original no se pisa (es el COALESCE del SQL).
    const segunda = marcarPausa({ motivo: MOTIVO_PAUSA.MANUAL });
    assert.equal(ficha.pausa_motivo ?? segunda.pausa_motivo, MOTIVO_PAUSA.CONSULTA);

    // ── 5 · Contesta una persona del equipo, desde el panel ──────────────────────────────────
    mensajes.push({ tipo: "manual", origen: "operador", creado_en: "2026-09-02T09:00:00+02:00",
                    mensaje: "[Equipo]", respuesta: "Yes, it works any day until the 30th." });

    // ── 6 · Se reactiva desde el panel ───────────────────────────────────────────────────────
    Object.assign(ficha, marcarActiva());
    assert.equal(estaPausada(ficha), false);
    assert.equal(ficha.pausa_motivo, null);

    // ── 7 · Sara retoma. El historial trae TODO lo que pasó sin ella ─────────────────────────
    const turnos = historial();
    const texto = turnos.map((t) => t.content).join("\n");

    assert.match(texto, /Any news\?/, "lo que escribió durante la pausa no puede perderse");
    assert.match(texto, /no le respondiste/i, "y tiene que saber que aquello se quedó sin contestar");
    assert.match(texto, /una persona del equipo/, "y que le contestó una persona, no ella");
    assert.match(texto, /Yes, it works any day/, "con lo que esa persona le dijo");
    assert.match(texto, /campaña «promo-prova»/, "y el mensaje de la campaña sigue ahí");

    for (const t of turnos) {
      assert.ok(typeof t.content === "string" && t.content.trim().length > 0,
        `turno vacío en ${t.role}: la API lo rechazaría y se caería la conversación entera`);
    }

    // Y el idioma se mantiene en inglés, que es el suyo.
    pista = idiomaSugerido({ mensajesCliente: delCliente(),
                            idiomaContacto: ficha.idioma_ultimo, idiomaCampana: "ca" });
    assert.equal(pista.idioma, "en");
  });

  test("y si lo que pide es una persona, se deriva sin preguntarle al modelo", () => {
    const suyo = "Puc parlar amb una persona?";
    assert.equal(pidePersona(suyo), true);
    const f = marcarPausa({ motivo: MOTIVO_PAUSA.PIDIO_PERSONA, por: "sara" });
    assert.equal(f.pausa_motivo, MOTIVO_PAUSA.PIDIO_PERSONA);
    assert.equal(ETIQUETA_MOTIVO[f.pausa_motivo], "Pidió hablar con una persona");
    // Y se le contesta en catalán, que es en lo que ha escrito.
    assert.equal(idiomaSugerido({ mensajesCliente: [suyo] }).idioma, "ca");
  });

  test("EL FILTRO DEL HISTORIAL NO PUEDE TIRAR LAS FILAS SIN RESPUESTA", () => {
    // `respuesta != '…'` con NULL vale NULL en SQL: la fila se caería en silencio, y con ella
    // todo lo que el cliente escribió mientras Sara estaba parada.
    const cargador = bloque(SERVER, "setHistorialLoader(");
    assert.match(sinComentarios(cargador), /COALESCE\(respuesta, ?''\) != '\(sin respuesta registrada\)'/,
      "sin el COALESCE, reactivar a Sara le borra la conversación que hubo sin ella");
  });
});
