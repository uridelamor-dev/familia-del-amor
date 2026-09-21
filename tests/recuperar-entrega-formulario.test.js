// RECUPERAR LA ENTREGA DE UN FORMULARIO: PRIMERO CONTAR, DESPUÉS DECIDIR.
//
// Quien se apuntó ANTES de que su formulario tuviera mensaje configurado no recibió nada. No hay
// fila que reintentar —no había nada que mandar— así que no es un reintento: es una entrega con
// semanas de retraso.
//
// ── LO QUE ESTE FICHERO VIGILA ──────────────────────────────────────────────────────────────
//
// 1. Que la CONSULTA no pueda escribir. Es lo que se ejecuta primero, contra producción, y su
//    único trabajo es dar un número para poder decidir.
// 2. Que el envío use el mensaje del FORMULARIO, el carné que esa persona YA tiene, su enlace
//    individual, y el tipo ENTREGA —sin pie de baja—.
// 3. Que no pueda mandar dos veces, ni a quien ya lo recibió, ni a quien pidió que no.
// 4. Que vaya por la cola de siempre: noventa y cinco mensajes de golpe es lo que hace que
//    baneen un número.
//
// No se importa `whatsapp.js`, no se abre ningún socket y no se arranca el servidor.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ESTADOS, censar, aQuienAlcanza, clasificar } from "../src/modules/captacion/recuperacion.js";

const SERVER = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const APP = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

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

const DRY = bloque(SERVER, 'app.get("/api/fidelizacion/formularios/:clave/recuperacion"');
const ENCOLAR = bloque(SERVER, 'app.post("/api/fidelizacion/formularios/:clave/recuperacion"');
const DESTINATARIOS = bloque(SERVER, "async function fidDestinatariosEntrega(");
const PANEL_CUERPO = bloque(APP, "function fidgRecupCuerpo(");
const PANEL_ENCOLAR = bloque(APP, "async function fidgRecupEncolar(");

const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("1 · la consulta SOLO cuenta", () => {
  test("no escribe nada, en ninguna tabla", () => {
    const codigo = sinComentarios(DRY);
    for (const escritura of ["INSERT INTO", "UPDATE ", "DELETE FROM", "dbRun("]) {
      assert.ok(!codigo.includes(escritura),
        `el dry-run puede escribir («${escritura}»): es lo primero que se ejecuta contra producción`);
    }
  });

  test("ni manda, ni emite, ni despierta al worker", () => {
    const codigo = sinComentarios(DRY);
    for (const efecto of ["sendMensajeLibre", "proEnviarWA", "proEmitir", "capVaciarCola",
                          "fidComponerMensaje"]) {
      assert.ok(!codigo.includes(efecto), `el dry-run llama a «${efecto}»`);
    }
  });

  test("y no devuelve ni un dato personal", () => {
    // Estos números se pegan en un chat. Lo que no sale, no se filtra.
    const respuesta = DRY.slice(DRY.indexOf("res.json("));
    for (const dato of ["telefono", "nombre", "correo", "token"]) {
      assert.ok(!new RegExp(`\\b${dato}\\b`).test(respuesta),
        `la respuesta del dry-run lleva «${dato}»`);
    }
  });

  test("cuenta los que se apuntaron ANTES de que hubiera mensaje", () => {
    assert.match(DESTINATARIOS,
      /SELECT MIN\(creado_en\) AS desde FROM fid_formularios\s*\n?\s*WHERE clave = \? AND COALESCE\(NULLIF\(mensaje_wa, ''\), ''\) <> ''/,
      "no se busca cuándo estrenó mensaje este formulario: sin esa fecha no se puede saber " +
      "quién se apuntó cuando no había nada que mandar");
    assert.match(DRY, /antes_del_mensaje: antes/);
  });

  test("da el número que hay que mirar antes de autorizar", () => {
    assert.match(DRY, /se_enviaria_a: alcanzados\.length/,
      "el dry-run ya no dice a cuánta gente se le mandaría");
    assert.match(DRY, /recAQuienAlcanza\("pendientes", destinatarios\)/,
      "el número no sale del mismo filtro que usa el envío: dirían cosas distintas");
  });
});

describe("2 · a quién alcanza, calculado con el módulo puro", () => {
  // Se ejecuta la clasificación de verdad, que es la que usan los dos endpoints.
  const gente = [
    { telefono: "600000001", qrId: 1, cola: null },                                   // sin cola
    { telefono: "600000002", qrId: 2, cola: { estado: "enviado", enviado_en: "2026-09-01" } },
    { telefono: "600000003", qrId: 3, cola: { estado: "fallido" } },                  // error
    { telefono: "600000004", qrId: 4, cola: { estado: "pendiente" } },
    { telefono: "600000005", qrId: null, cola: null },                                // sin carné
    { telefono: "", qrId: 6, cola: null },                                            // sin teléfono
    { telefono: "600000007", qrId: 7, baja: true, cola: null },                       // de baja
  ];

  test("el censo separa los siete casos", () => {
    const c = censar(gente);
    assert.equal(c.total, 7);
    assert.equal(c.sin_cola, 1);
    assert.equal(c.enviado, 1);
    assert.equal(c.error, 1);
    assert.equal(c.pendiente, 1);
    assert.equal(c.sin_qr, 1);
    assert.equal(c.sin_telefono, 1);
    assert.equal(c.baja, 1);
  });

  test("solo se manda a quien tiene carné, teléfono y NINGUNA fila", () => {
    assert.deepEqual(aQuienAlcanza("pendientes", gente).map((d) => d.telefono), ["600000001"]);
  });

  test("quien ya lo recibió no entra, pase lo que pase", () => {
    assert.equal(clasificar(gente[1]), ESTADOS.ENVIADO);
    assert.ok(!aQuienAlcanza("pendientes", gente).includes(gente[1]));
  });

  test("quien pidió que no le escribieran tampoco, ni aunque no tenga fila", () => {
    assert.equal(clasificar(gente[6]), ESTADOS.BAJA);
    assert.ok(!aQuienAlcanza("pendientes", gente).includes(gente[6]));
  });
});

describe("3 · el envío usa lo de ESTA persona y de ESTE formulario", () => {
  test("el mensaje sale del formulario publicado, no de una campaña clásica", () => {
    assert.match(ENCOLAR,
      /SELECT \* FROM fid_formularios WHERE clave = \? AND estado = 'publicado'/,
      "el encolado ya no lee el formulario publicado");
    assert.match(ENCOLAR, /fidRender\(f\.mensaje_wa/,
      "el texto no sale de la plantilla del formulario");
    assert.ok(!/capTextoWA|textosDe\(/.test(ENCOLAR),
      "usa la plantilla del camino clásico: mandaría el texto de otra campaña");
  });

  test("sin mensaje configurado no deja encolar nada", () => {
    assert.match(ENCOLAR, /if \(!String\(f\.mensaje_wa \|\| ""\)\.trim\(\)\)/,
      "se puede encolar un formulario sin mensaje: saldrían mensajes vacíos");
  });

  test("reutiliza el CARNÉ que ya tiene, y no emite ninguno nuevo", () => {
    assert.match(DESTINATARIOS, /r\.clase = 'carnet'/,
      "busca cualquier código en vez del carné: podría coger un cupón de otra campaña");
    assert.match(ENCOLAR, /WHERE id = \? AND clase = 'carnet' AND anulado_en IS NULL/,
      "el encolado no comprueba que el código siga siendo un carné vivo");
    assert.ok(!/proEmitir\(/.test(ENCOLAR),
      "emite un carné nuevo: sería una segunda identidad para la misma persona");
    assert.match(ENCOLAR, /if \(!qr\) \{ omitidos \+= 1; continue; \}/,
      "sin carné hay que contar y seguir, no inventar uno");
  });

  test("cada uno recibe SU enlace, compuesto por `proEnlace`", () => {
    assert.match(ENCOLAR, /enlace: proEnlace\(req, qr\)/,
      "el enlace ya no sale del único sitio que lo compone");
    assert.ok(!/tarjeta\.html\?t=|cupon\.html\?t=/.test(ENCOLAR),
      "hay una URL de QR escrita a mano");
  });

  test("y es una ENTREGA: sin pie de baja", () => {
    assert.match(ENCOLAR, /tipo: FID_TIPO_MENSAJE\.ENTREGA/,
      "la recuperación manda con pie de baja: es la entrega que se le prometió, no una campaña");
    assert.ok(!/fidPieBaja|fidEnlaceBaja|INSERT INTO fid_bajas/.test(sinComentarios(ENCOLAR)));
  });
});

describe("4 · no puede mandar dos veces ni saltarse el ritmo", () => {
  test("idempotente por identidad: campaña + carné", () => {
    assert.match(ENCOLAR, /WHERE NOT EXISTS \(SELECT 1 FROM cap_cola WHERE campana = \? AND qr_id = \?\)/,
      "sin la guarda por identidad, ejecutarlo dos veces escribe dos filas");
    assert.match(ENCOLAR, /`rec:\$\{clave\}:\$\{qr\.id\}`/,
      "la clave de la fila ya no identifica a esa persona en esa campaña");
  });

  test("deja la fila y despierta al worker: no manda por su cuenta", () => {
    assert.ok(!/sendMensajeLibre|proEnviarWA/.test(ENCOLAR),
      "manda directamente: se salta el ritmo, el cupo y el tope diario, y noventa y cinco " +
      "mensajes de golpe es lo que hace que baneen un número");
    assert.match(ENCOLAR, /INSERT INTO cap_cola/, "ya no encola");
    assert.match(ENCOLAR, /capVaciarCola\(\)/, "no despierta al worker");
    assert.match(ENCOLAR, /prioridad\)\s*\n?\s*SELECT \?,\?,\?,\?,\?,\?,\?,0/,
      "no encola con prioridad de alta");
  });

  test("solo dirección, con una palabra escrita a mano, y queda auditado", () => {
    assert.match(ENCOLAR, /requireAuth\(\["direccion"\]\)/,
      "encolar manda mensajes a gente real: no puede hacerlo cualquiera");
    assert.match(ENCOLAR, /!== FID_CONFIRMA_ENTREGA/,
      "se puede encolar sin confirmar: un clic de más mandaría noventa y cinco mensajes");
    assert.match(SERVER, /const FID_CONFIRMA_ENTREGA = "ENVIAR"/);
    assert.match(ENCOLAR, /ficAuditar\("fidelizacion"[\s\S]*?req\.user\.username/,
      "no queda escrito quién lo autorizó");
  });

  test("un cuerpo vacío NO encola", () => {
    assert.match(ENCOLAR, /String\(req\.body\?\.confirmacion \|\| ""\)/,
      "la confirmación tiene que leerse del cuerpo y compararse, no darse por buena");
  });
});

describe("5 · la pantalla enseña los números antes de ofrecer el botón", () => {
  test("hay «Ver recuperación» en cada formulario publicado", () => {
    assert.match(APP, /data-act="fidg-recup" data-clave/, "no hay forma de abrir el dry-run");
    assert.match(APP, /x\.estado === "publicado" && x\.clave \?/,
      "el botón sale también en versiones cerradas o borradores, que no se pueden recuperar");
    assert.match(APP, /act === "fidg-recup"\)/, "el botón no está cableado");
  });

  test("el botón de encolar está apagado si no hay nadie o no hay mensaje", () => {
    assert.match(PANEL_CUERPO, /sinMensaje \|\| !Number\(d\.se_enviaria_a\) \? "disabled" : ""/,
      "se puede pulsar «Encolar» sin nadie a quien mandar o sin mensaje configurado");
  });

  test("se enseña el número grande, no solo la tabla", () => {
    assert.match(PANEL_CUERPO, /Se mandaría a \$\{num\(Number\(d\.se_enviaria_a \|\| 0\)\)\} personas/,
      "el número que hay que mirar antes de decidir no está destacado");
  });

  test("y se dice qué reciben y por dónde salen", () => {
    assert.match(PANEL_CUERPO, /SU enlace individual/);
    assert.match(PANEL_CUERPO, /no lleva pie de baja/);
    assert.match(PANEL_CUERPO, /no de golpe/);
  });

  test("encolar pide escribir la palabra y vuelve a pedir el censo después", () => {
    assert.match(PANEL_ENCOLAR, /prompt\(/, "no se pide confirmación");
    assert.match(PANEL_ENCOLAR, /Escribe ENVIAR para confirmar/);
    assert.match(PANEL_ENCOLAR, /if \(!c\) return;/, "cancelar el aviso tiene que no hacer nada");
    assert.match(PANEL_ENCOLAR, /await apiRaw\(`\/api\/fidelizacion\/formularios\/\$\{encodeURIComponent\(clave\)\}\/recuperacion`\)/,
      "tras encolar hay que volver a contar: los números en pantalla serían los de antes");
  });
});

describe("6 · no se ha tocado nada de lo demás", () => {
  test("el recuperador del camino clásico sigue existiendo y separado", () => {
    assert.match(SERVER, /app\.post\("\/api\/captacion\/campanas\/:clave\/recuperar"/,
      "ha desaparecido la recuperación del camino clásico");
    // Y no se han mezclado: cada uno compone su mensaje con lo suyo.
    const clasico = bloque(SERVER, 'app.post("/api/captacion/campanas/:clave/recuperar"');
    assert.ok(!/fid_formularios|mensaje_wa/.test(clasico),
      "el recuperador clásico ha empezado a leer formularios configurables");
    assert.ok(!/capTextoWA|textosDe\(/.test(ENCOLAR),
      "el recuperador de formularios ha empezado a usar plantillas de campaña clásica");
  });

  test("el reconciliador automático sigue sin alcanzar a estos", () => {
    const recon = bloque(SERVER, "async function capReconciliar()");
    assert.match(recon, /r\.origen = 'campana' AND r\.clase = 'cupon'/,
      "el reconciliador ha ampliado su alcance a los carnés de formulario: estos solo se " +
      "recuperan a mano, mirando el número primero");
  });

  test("no se toca Wallet, Meta ni el interruptor de la tarjeta", () => {
    for (const prohibido of ["TARJETA_ACTIVA", "wallet_", "apnsAvisar", "fbq", "PIXEL"]) {
      assert.ok(!DRY.includes(prohibido) && !ENCOLAR.includes(prohibido),
        `la recuperación toca «${prohibido}»`);
    }
  });
});
