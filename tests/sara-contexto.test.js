// SARA TIENE QUE VER LO QUE LE MANDAMOS AYER.
//
// ── EL CASO REAL, Y POR QUÉ NO LLEVA NINGUNA CAMPAÑA ESCRITA ────────────────────────────────
//
// Un cliente recibió el código de una promoción y al día siguiente contestó «el dia 1 treballo al
// matí». Sara preguntó de qué mes hablaba y ofreció horarios de comida y cena: no entendió nada
// porque no se le dio nada. El historial se reconstruía con una ventana de cuatro horas.
//
// Los tests reproducen ESA FORMA —un saliente de ayer, una respuesta de hoy— con textos
// inventados. Si aquí apareciera «esmorzar-girona» o «1 de octubre», estaríamos probando una
// campaña concreta en vez de la regla, y la regla es la que tiene que valer el año que viene.
//
// Nada de este fichero abre un socket, arranca el servidor ni manda un mensaje.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { construirContexto, anteponerCitado, turnosDelCitado, etiquetaSaliente, recortar,
         pesoDe, tipoPorToken, esSaliente, LIMITES, ORIGEN }
  from "../src/modules/messaging/contexto.js";

const SERVER = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const WA = readFileSync(new URL("../whatsapp.js", import.meta.url), "utf8");

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

const CARGADOR = bloque(SERVER, "setHistorialLoader(");
const LEER_CITADO = bloque(WA, "function leerCitado(msg)");
const ENVIAR = bloque(WA, "export async function sendMensajeLibre(");

// El texto del saliente de ayer. Inventado a propósito: la regla no depende de la campaña.
const AYER = "Aquí tens el teu codi per a la promoció:\nhttps://ejemplo.test/x.html?t=ABC123";
const HOY = "Aquest dia treballo al matí";

/** Filas tal como llegan de la base: de la MÁS RECIENTE a la más antigua. */
const filas = (...f) => f;
const entrante = (mensaje, respuesta, creado_en) => ({ tipo: "intercambio", mensaje, respuesta, creado_en });
const saliente = (respuesta, extra = {}) => ({ tipo: "saliente", mensaje: "[Sistema]", respuesta, ...extra });

// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("EL CASO DE ACEPTACIÓN: el saliente de ayer está en el contexto de hoy", () => {
  const ayer = saliente(AYER, { origen: ORIGEN.CAMPANA, clave_campana: "una-clave",
                                tipo_mensaje: "entrega", idioma: "ca", creado_en: "2026-09-20T10:00:00+02:00" });
  const hoy = entrante(HOY, "(sin respuesta)", "2026-09-21T09:00:00+02:00");

  test("el texto que le mandamos ayer llega entero al contexto", () => {
    const turnos = construirContexto(filas(hoy, ayer));
    const todo = turnos.map((t) => t.content).join("\n");
    assert.ok(todo.includes(AYER),
      "el mensaje de ayer no está en el contexto: Sara vería la respuesta de hoy sin nada delante");
    assert.ok(todo.includes(HOY), "falta el mensaje de hoy");
  });

  test("y va ANTES que la respuesta del cliente, que es como se lee una conversación", () => {
    const turnos = construirContexto(filas(hoy, ayer));
    const todo = turnos.map((t) => t.content);
    assert.ok(todo.findIndex((c) => c.includes(AYER)) < todo.findIndex((c) => c.includes(HOY)),
      "el orden está invertido: el modelo leería la respuesta antes que la pregunta");
  });

  test("el saliente se marca como NUESTRO, no como algo que dijo el cliente", () => {
    const turnos = construirContexto(filas(hoy, ayer));
    const i = turnos.findIndex((t) => t.content.includes(AYER));
    assert.equal(turnos[i].role, "assistant", "el mensaje que mandamos aparece como dicho por el cliente");
    assert.equal(turnos[i - 1].role, "user");
    assert.match(turnos[i - 1].content, /CONTEXTO INTERNO/,
      "sin la marca, el modelo no sabe que ese texto no lo escribió el cliente");
  });

  test("y la etiqueta dice POR QUÉ se mandó, con el dato de la fila", () => {
    const e = etiquetaSaliente(ayer);
    assert.match(e, /campaña «una-clave»/, "la etiqueta no lleva la clave de la campaña");
    assert.match(e, /entrega/, "la etiqueta no dice de qué tipo era");
    assert.match(e, /enviado el 2026-09-20/, "la etiqueta no dice cuándo");
    assert.match(e, /campaña automática/, "la etiqueta no dice quién lo mandó");
  });

  test("una fila SIN metadatos sigue funcionando, como las que ya están guardadas", () => {
    const vieja = saliente("Un mensaje de antes de todo esto");
    const e = etiquetaSaliente(vieja);
    assert.match(e, /El cliente recibió un mensaje de Familia del Amor/);
    assert.ok(!/campaña «/.test(e), "se inventa una campaña que la fila no tiene");
    assert.ok(!/undefined|null/.test(e), "la etiqueta enseña huecos vacíos");
  });
});

describe("no hay ventana de TIEMPO: la hay de tamaño", () => {
  test("el cargador ya no filtra por horas", () => {
    assert.ok(!/INTERVAL '\d+ hours?'/.test(CARGADOR),
      "ha vuelto una ventana de tiempo: el problema reaparece en cuanto alguien responda más " +
      "tarde que esa ventana");
    assert.match(CARGADOR, /ORDER BY id DESC LIMIT \?/,
      "el cargador tiene que traer los últimos N, no los de las últimas N horas");
  });

  test("un mensaje de hace CUATRO DÍAS entra igual", () => {
    const viejo = saliente(AYER, { creado_en: "2026-09-17T10:00:00+02:00" });
    const turnos = construirContexto(filas(entrante(HOY, "(sin respuesta)", "2026-09-21"), viejo));
    assert.ok(turnos.map((t) => t.content).join("\n").includes(AYER),
      "cuatro días de antigüedad dejan fuera el contexto: es el mismo fallo movido de sitio");
  });

  test("pero no crece sin límite: se corta por número de filas", () => {
    const muchas = Array.from({ length: 60 }, (_, i) => entrante(`pregunta ${i}`, `respuesta ${i}`));
    const turnos = construirContexto(muchas);
    assert.equal(turnos.length, LIMITES.FILAS * 2,
      `se han metido ${turnos.length / 2} intercambios; el tope es ${LIMITES.FILAS}`);
  });

  test("ni por tamaño: un texto enorme no se lleva el presupuesto entero", () => {
    const enorme = "x".repeat(5000);
    const muchas = Array.from({ length: 20 }, () => entrante(enorme, enorme));
    const turnos = construirContexto(muchas);
    assert.ok(pesoDe(turnos) <= LIMITES.CARACTERES_TOTAL + LIMITES.CARACTERES_MENSAJE * 2,
      `el contexto pesa ${pesoDe(turnos)} caracteres, por encima del tope`);
    for (const t of turnos) {
      assert.ok(t.content.length <= LIMITES.CARACTERES_MENSAJE + 1,
        "un mensaje suelto se ha saltado su propio recorte");
    }
  });

  test("lo que se tira al recortar es lo MÁS ANTIGUO, nunca lo último", () => {
    // Lo último dicho es lo que explica el mensaje de ahora: tirarlo sería tirar justo lo útil.
    const muchas = Array.from({ length: 40 }, (_, i) => entrante(`msg ${i}`, `resp ${i}`));
    // `filas` llega de la más reciente a la más antigua: la 0 es la última.
    const turnos = construirContexto(muchas);
    const todo = turnos.map((t) => t.content).join("\n");
    assert.ok(todo.includes("msg 0"), "se ha tirado el mensaje más reciente");
    assert.ok(!todo.includes("msg 39"), "se ha conservado el más antiguo en vez de recortarlo");
  });

  test("recortar no parte a media palabra si puede evitarlo", () => {
    const t = recortar("palabras ".repeat(200), 100);
    assert.ok(t.length <= 100);
    assert.match(t, /…$/);
    assert.ok(!/palabr…$/.test(t), "ha cortado a mitad de palabra teniendo un espacio cerca");
  });
});

describe("cuando el cliente usa «Responder»", () => {
  const citado = { texto: AYER, deNosotros: true, id: "ABC" };

  test("el mensaje citado entra como contexto PRIORITARIO, el primero de todos", () => {
    const turnos = construirContexto(filas(entrante(HOY, "(sin respuesta)")), { citado });
    assert.match(turnos[0].content, /RESPONDIENDO expresamente/,
      "la cita no va la primera: no desempata frente al historial");
    assert.ok(turnos[0].content.includes(AYER), "la cita no lleva el texto citado");
    assert.equal(turnos[1].role, "assistant");
  });

  test("aunque el citado quede FUERA de la ventana normal", () => {
    // Es el punto entero: el cliente señala un mensaje de hace semanas que ya no está en las
    // últimas dieciséis filas, y aun así entra.
    const muchas = Array.from({ length: 40 }, (_, i) => entrante(`relleno ${i}`, `r ${i}`));
    const turnos = construirContexto(muchas, { citado });
    assert.ok(turnos.map((t) => t.content).join("\n").includes(AYER),
      "la cita se ha perdido por el recorte: es justo lo que no puede pasar");
    assert.match(turnos[0].content, /RESPONDIENDO expresamente/);
  });

  test("se distingue si citó algo NUESTRO o algo suyo", () => {
    assert.match(turnosDelCitado({ texto: "x", deNosotros: true })[0].content, /que le mandamos nosotros/);
    assert.match(turnosDelCitado({ texto: "x", deNosotros: false })[0].content, /mensaje suyo anterior/);
  });

  test("no se duplica si ese mismo texto ya está en el historial", () => {
    const conAyer = filas(entrante(HOY, "(sin respuesta)"), saliente(AYER));
    const conCita = construirContexto(conAyer, { citado });
    const sinCita = construirContexto(conAyer);
    assert.equal(conCita.length, sinCita.length,
      "la cita se ha añadido encima de un mensaje que ya estaba: el modelo creería que se lo " +
      "mandamos dos veces");
  });

  test("degrada solo: sin cita, o con una cita sin texto, no pasa nada", () => {
    const base = construirContexto(filas(entrante(HOY, "(sin respuesta)")));
    for (const malo of [null, undefined, {}, { texto: "" }, { texto: "   " }]) {
      assert.deepEqual(construirContexto(filas(entrante(HOY, "(sin respuesta)")), { citado: malo }), base,
        `una cita «${JSON.stringify(malo)}» ha cambiado el contexto`);
    }
    assert.deepEqual(turnosDelCitado(null), []);
  });

  test("`anteponerCitado` es el ÚNICO sitio: vale para memoria y para base", () => {
    // El historial le llega a Sara por dos caminos. Si la cita se resolviera solo al leer de la
    // base, un cliente que cita dentro de la misma sesión se quedaría sin ella.
    const turnos = [{ role: "user", content: "hola" }, { role: "assistant", content: "hola" }];
    assert.equal(anteponerCitado(turnos, citado).length, 4);
    assert.equal(anteponerCitado(turnos, null), turnos);
    assert.match(WA, /ctxAnteponerCitado\(\[\.\.\.historial\], citado\)/,
      "whatsapp.js ya no antepone la cita sobre el historial final");
  });
});

describe("leer la cita de Baileys", () => {
  test("se cubren los mismos tipos que ya manejamos en un mensaje normal", () => {
    for (const campo of ["q.conversation", "q.extendedTextMessage?.text",
                         "q.imageMessage?.caption", "q.documentMessage?.caption"]) {
      assert.ok(LEER_CITADO.includes(campo.replace("q.", "q.")),
        `no se lee «${campo}» del mensaje citado`);
    }
  });

  test("se busca el contexto en los tres sitios donde WhatsApp lo pone", () => {
    for (const via of ["extendedTextMessage?.contextInfo", "imageMessage?.contextInfo",
                       "documentMessage?.contextInfo"]) {
      assert.ok(LEER_CITADO.includes(via), `no se mira «${via}»`);
    }
  });

  test("sin texto interpretable devuelve null, y no lanza nunca", () => {
    assert.match(LEER_CITADO, /if \(!String\(texto\)\.trim\(\)\) return null;/,
      "un citado sin texto —un audio, una ubicación— tiene que dar null");
    assert.match(LEER_CITADO, /catch \{ return null; \}/,
      "leer la cita no puede tumbar el mensaje: si falla, se sigue sin ella");
  });

  test("y la cita viaja hasta el modelo", () => {
    assert.match(WA, /const citado = leerCitado\(msg\);/, "no se lee la cita del entrante");
    assert.match(WA, /contextoRetraso, citado \}\);/, "la cita no entra en el debounce");
    assert.match(WA, /\[\.\.\.items\]\.reverse\(\)\.map\(\(x\) => x\.citado\)\.find\(Boolean\)/,
      "de varios mensajes seguidos hay que coger la cita del ÚLTIMO");
    assert.match(WA, /async function responderConIA\(jid, mensajeUsuario, adjuntoUrl, contextoRetraso, citado = null\)/,
      "responderConIA no recibe la cita");
  });
});

describe("los salientes automáticos quedan registrados sin depender del eco", () => {
  test("`sendMensajeLibre` registra él mismo", () => {
    assert.match(ENVIAR, /onMensajeSaliente\(\{/,
      "el envío sigue dependiendo del eco de Baileys: si el socket cae entre el envío y el eco, " +
      "el cliente tiene el mensaje y nosotros no sabemos que se lo mandamos");
    assert.match(ENVIAR, /origen: meta\.origen/);
    assert.match(ENVIAR, /claveCampana: meta\.claveCampana/);
    assert.match(ENVIAR, /tipoMensaje: meta\.tipoMensaje/);
  });

  test("y marca el mensaje para que el eco NO lo duplique", () => {
    assert.match(ENVIAR, /_marcarMensajeSistema\(jid, texto\)/,
      "sin marcarlo, el eco fromMe lo guarda otra vez y el contexto lleva el mensaje dos veces");
    const marca = ENVIAR.indexOf("_marcarMensajeSistema");
    const avisa = ENVIAR.indexOf("onMensajeSaliente");
    assert.ok(marca < avisa, "hay que marcar ANTES de avisar: el eco llega enseguida");
  });

  test("sin metadatos se comporta como antes", () => {
    assert.match(ENVIAR, /meta = \{\}/, "los metadatos tienen que ser opcionales");
    assert.match(ENVIAR, /meta\.origen \|\| CTX_ORIGEN\.SISTEMA/,
      "quien no diga de dónde viene tiene que caer en el origen de siempre");
  });

  test("el worker de la cola pasa la clave de la campaña, sacada de la fila", () => {
    const worker = bloque(SERVER, "async function capVaciarCola()");
    assert.match(worker, /claveCampana: fila\.campana \|\| null/,
      "el worker no dice de qué campaña era el mensaje");
    assert.match(worker, /origen: WA_ORIGEN\.CAMPANA/);
    assert.match(worker, /tipoMensaje: waTipoPorToken\(fila\.token\)/,
      "no se guarda si era una entrega o una comunicación comercial");
  });

  test("el tipo sale del token, que ya distingue los caminos", () => {
    assert.equal(tipoPorToken("com:12:600000000"), "comercial");
    assert.equal(tipoPorToken("alta:clave:v1:x:600000000:7:c0"), "entrega");
    assert.equal(tipoPorToken("rec:clave:7"), "entrega");
    // El alta clásica usa un token aleatorio porque es el identificador PÚBLICO de seguimiento.
    assert.equal(tipoPorToken("9f3aaleatorio"), "entrega");
    assert.equal(tipoPorToken(null), "entrega");
  });

  test("el guardado acepta las cuatro columnas nuevas", () => {
    const guardar = bloque(SERVER, "setOnMensajeSaliente(");
    assert.match(guardar, /origen, clave_campana, tipo_mensaje, idioma/,
      "el INSERT no guarda los metadatos");
    assert.match(guardar, /origen \|\| \(esManual \? WA_ORIGEN\.OPERADOR : WA_ORIGEN\.SISTEMA\)/,
      "quien no pase origen tiene que caer en el de siempre");
  });
});

describe("el esquema es aditivo: nada de lo que ya está cambia", () => {
  test("las cuatro columnas se añaden con IF NOT EXISTS y sin NOT NULL", () => {
    const alter = SERVER.slice(SERVER.indexOf('for (const col of ["origen TEXT"'),
                               SERVER.indexOf("idx_wa_msg_jid_id"));
    assert.ok(alter.length > 100, "no se encuentran los ALTER de whatsapp_messages");
    assert.match(alter, /ADD COLUMN IF NOT EXISTS/);
    for (const col of ["origen TEXT", "clave_campana TEXT", "tipo_mensaje TEXT", "idioma TEXT"]) {
      assert.ok(alter.includes(`"${col}"`), `falta la columna «${col}»`);
      assert.ok(!alter.includes(`${col} NOT NULL`), `«${col}» es obligatoria: rompería lo ya escrito`);
    }
  });

  test("y hay índice por (jid, id): el historial se lee así en cada mensaje", () => {
    assert.match(SERVER, /CREATE INDEX IF NOT EXISTS idx_wa_msg_jid_id ON whatsapp_messages \(jid, id DESC\)/,
      "sin índice, cada mensaje entrante recorre una tabla que solo crece");
  });

  test("una fila antigua, sin ninguna columna nueva, se lee sin romperse", () => {
    const antigua = { tipo: "saliente", mensaje: "[Sistema]", respuesta: "texto viejo" };
    const turnos = construirContexto(filas(antigua));
    assert.equal(turnos.length, 2);
    assert.ok(!/undefined|null|NaN/.test(turnos.map((t) => t.content).join("")));
  });
});

describe("el contexto no cambia lo que Sara SABE HACER", () => {
  test("las herramientas y los horarios de siempre siguen ahí", () => {
    // Este fichero blinda de dónde sale la INFORMACIÓN que recibe Sara. Lo que puede hacer con
    // ella —sus herramientas y las franjas de reserva— es de otro sitio, y tiene que sobrevivir
    // a cualquier cambio de aquí.
    //
    // La lista incluye `pasar_a_persona`, que llegó después: derivar a una persona es ya una
    // capacidad suya, y quitarla sería tan grave como quitar las reservas.
    for (const intacto of ["registrar_reserva", "cancelar_reserva", "modificar_reserva",
                           "notificar_nerea", "notificar_silvia", "enviar_documento",
                           "guardar_dato_cliente", "pasar_a_persona"]) {
      assert.ok(WA.includes(`name: "${intacto}"`), `ha desaparecido la herramienta «${intacto}»`);
    }
    assert.match(WA, /12:30–15:30/, "se han tocado los horarios de reserva, que no tocaban");
  });

  test("la FORMA de los turnos es la de siempre: user con la marca, assistant con el texto", () => {
    const turnos = construirContexto(filas(saliente("un mensaje nuestro")));
    assert.deepEqual(turnos.map((t) => t.role), ["user", "assistant"],
      "ha cambiado la forma de los turnos: eso sí cambiaría cómo razona el modelo");
  });

  test("y no se ha tocado Wallet, Meta, QR ni captación", () => {
    for (const ajeno of ["TARJETA_ACTIVA", "walVaciarCola", "apnsAvisar", "fbq", "proEmitir"]) {
      assert.ok(!bloque(SERVER, "setHistorialLoader(").includes(ajeno),
        `el cargador de historial toca «${ajeno}»`);
    }
  });
});

describe("los tipos de saliente se distinguen", () => {
  test("Sara, operador, sistema y campaña tienen su nombre", () => {
    const vistos = new Set();
    for (const origen of Object.values(ORIGEN)) {
      const e = etiquetaSaliente({ origen });
      assert.match(e, /enviado por /, `el origen «${origen}» no se nombra`);
      vistos.add(e);
    }
    assert.equal(vistos.size, Object.values(ORIGEN).length,
      "dos orígenes distintos producen la misma etiqueta: no se podrían distinguir");
  });

  test("y los tipos de fila salientes son los de siempre", () => {
    assert.equal(esSaliente("saliente"), true);
    assert.equal(esSaliente("manual"), true);
    assert.equal(esSaliente("intercambio"), false);
    assert.equal(esSaliente(null), false);
  });
});
