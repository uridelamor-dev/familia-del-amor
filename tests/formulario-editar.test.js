// EDITAR UN FORMULARIO PUBLICADO SIN ROMPER LO QUE YA ESTÁ FUNCIONANDO.
//
// ── LAS DOS COSAS QUE NO PUEDEN CAMBIAR ─────────────────────────────────────────────────────
//
// 1. LA URL. `/promo.html?c=esmorzar-girona` está pegada en un anuncio de Meta que ya está
//    corriendo. Si publicar una versión nueva cambiara la URL, el anuncio llevaría a ningún sitio
//    y nadie se enteraría hasta ver caer las altas.
// 2. LOS INSCRITOS. Los 95 que ya hay viven en `leads`, indexados por la CLAVE. La versión no
//    entra en esa relación, y no puede entrar.
//
// Y una tercera que es de las que no se ven: publicar una versión nueva NO puede mandarle nada a
// quien ya se apuntó. Editar un formulario es configurar, no escribir a nadie.
//
// Nada de este fichero abre un socket ni arranca el servidor: se lee el código y se ejecuta el
// módulo puro de plantillas.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { renderPlantilla, VARIABLES } from "../src/modules/fidelizacion/contenido.js";

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

const GET_PUBLICO = bloque(SERVER, 'app.get("/api/publico/formulario/:clave"');
const POST_PUBLICO = bloque(SERVER, 'app.post("/api/publico/formulario/:clave"');
const POST_GUARDAR = bloque(SERVER, 'app.post("/api/fidelizacion/formularios"');
const DIALOGO = bloque(APP, "async function fidgFormNuevo(");
const CUERPO = bloque(APP, "function fidgFormCuerpo()");
const PREVIA = bloque(APP, "function fidgFormPrevWa()");

// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("la URL pública no depende de la versión", () => {
  test("el router elige por CLAVE y por estado publicado, nunca por versión", () => {
    // Es la propiedad entera: mientras se resuelva así, publicar una versión nueva solo cambia a
    // qué fila apunta la misma URL. El anuncio de Meta no se entera.
    for (const [nombre, texto] of [["GET", GET_PUBLICO], ["POST", POST_PUBLICO]]) {
      assert.match(texto, /WHERE clave = \? AND estado = 'publicado'/,
        `el ${nombre} público ya no resuelve por clave y estado`);
      assert.match(texto, /ORDER BY version DESC LIMIT 1/,
        `el ${nombre} público no coge la versión publicada más alta`);
      assert.ok(!/req\.params\.version|\?v=|&v=/.test(texto),
        `el ${nombre} público acepta una versión desde fuera: la URL dejaría de ser estable`);
    }
  });

  test("la clave se normaliza SIEMPRE igual, así que editar no la mueve", () => {
    assert.match(POST_GUARDAR,
      /String\(b\.clave \|\| ""\)\.trim\(\)\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9-\]\+\/g, "-"\)/,
      "si la normalización de la clave cambia, una edición puede publicar bajo OTRA clave y " +
      "dejar el enlace del anuncio apuntando a la versión vieja");
  });

  test("y la URL que enseña el panel se compone con la clave, no con la versión", () => {
    assert.match(POST_GUARDAR, /url_publica: `\/promo\.html\?c=\$\{encodeURIComponent\(clave\)\}`/,
      "la URL pública ha dejado de salir de la clave");
    assert.ok(!/url_publica:[^`]*version/.test(POST_GUARDAR),
      "la URL lleva la versión dentro: cambiaría en cada edición");
  });
});

describe("publicar una versión nueva conserva lo anterior", () => {
  test("cierra la publicada y escribe otra: no reescribe ninguna fila", () => {
    assert.match(POST_GUARDAR,
      /UPDATE fid_formularios SET estado = 'cerrado' WHERE clave = \? AND estado = 'publicado'/,
      "la versión anterior tiene que quedar CERRADA, no borrada ni sobrescrita");
    assert.match(POST_GUARDAR, /INSERT INTO fid_formularios/,
      "la versión nueva se escribe, no se actualiza la vieja");
    assert.ok(!/UPDATE fid_formularios SET (?!estado = 'cerrado')/.test(POST_GUARDAR),
      "hay un UPDATE que toca algo más que el estado: una versión publicada no se reescribe");
  });

  test("la versión nueva es la siguiente de ESA clave", () => {
    assert.match(POST_GUARDAR,
      /SELECT COALESCE\(MAX\(version\), 0\) AS v FROM fid_formularios WHERE clave = \?/);
    assert.match(POST_GUARDAR, /Number\(ult\?\.v \|\| 0\) \+ 1/);
  });

  test("y va con cerrojo: dos pestañas publicando a la vez no crean dos veces la misma versión", () => {
    assert.match(POST_GUARDAR, /pg_advisory_xact_lock/,
      "sin cerrojo, dos publicaciones simultáneas pueden leer el mismo MAX(version)");
  });
});

describe("editar NO le escribe a nadie", () => {
  test("guardar un formulario no toca la cola ni manda mensajes", () => {
    // Es la garantía para los 95 que ya están dentro. Configurar es configurar.
    for (const prohibido of ["cap_cola", "sendMensajeLibre", "proEnviarWA", "capVaciarCola",
                             "capEncolarAlta", "capReconciliar", "proEmitir"]) {
      assert.ok(!POST_GUARDAR.includes(prohibido),
        `publicar un formulario llama a «${prohibido}»: editarlo mandaría mensajes a los inscritos`);
    }
  });

  test("tampoco recorre a los inscritos", () => {
    assert.ok(!/FROM leads|UPDATE leads|INSERT INTO leads/.test(POST_GUARDAR),
      "publicar un formulario toca la tabla de inscritos");
  });

  test("el mensaje nuevo solo alcanza a quien se apunte DESPUÉS", () => {
    // El alta lee el formulario publicado EN ESE MOMENTO. No hay ningún camino que reprocese
    // altas anteriores con una plantilla nueva, y eso es lo que hay que mantener.
    assert.match(POST_PUBLICO, /SELECT \* FROM fid_formularios WHERE clave = \? AND estado = 'publicado'/,
      "el alta ya no lee el formulario vigente en el momento de apuntarse");
    assert.match(POST_PUBLICO, /if \(!f\.mensaje_wa\) return/,
      "sin plantilla el alta tiene que seguir sin mandar nada");
  });

  test("y el reconciliador automático sigue sin ver estos códigos", () => {
    // Los códigos del formulario configurable son `clase='carnet'` con `origen='form:<clave>'`.
    // El reconciliador solo mira `origen='campana' AND clase='cupon'`, así que los 95 quedan
    // fuera por definición, además de por su puerta cerrada.
    const recon = bloque(SERVER, "async function capReconciliar()");
    assert.match(recon, /r\.origen = 'campana' AND r\.clase = 'cupon'/,
      "el reconciliador ha ampliado su alcance y ahora puede alcanzar a los inscritos por " +
      "formulario, que es justo lo que no puede pasar al publicar una versión nueva");
  });
});

describe("el botón dice «Editar» y el aviso explica qué pasa", () => {
  test("la lista de formularios usa el verbo «Editar»", () => {
    assert.match(APP,
      /renderFidgListaSimple\(FIDG\.formularios, "formulario", "fidg-form-nuevo", "Nuevo formulario…", true, "Editar"\)/,
      "la lista de formularios ha dejado de decir «Editar»");
  });

  test("las otras listas conservan su verbo: el cambio es solo de formularios", () => {
    const lista = bloque(APP, "function renderFidgListaSimple(");
    assert.match(lista, /verbo = "Copiar a versión nueva"/,
      "el verbo por defecto ha cambiado: las versiones de tarjeta dirían «Editar» sin haberlo pedido");
  });

  test("el aviso de dentro cuenta lo que NO cambia, que es lo que preocupa", () => {
    const aviso = APP.slice(APP.indexOf("const avisoCopia ="), APP.indexOf("// ── PROMOCIONES"));
    assert.ok(aviso.length > 300, "no se encuentra el aviso");
    assert.match(aviso, /La URL no cambia/, "el aviso no dice que la URL se queda igual");
    assert.match(aviso, /siguen donde están/, "el aviso no dice que los inscritos no se mueven");
    assert.match(aviso, /se cierra intacta/, "el aviso no explica qué pasa con la versión anterior");
    assert.match(aviso, /editar = false/, "el aviso ha perdido su redacción alternativa");
  });

  test("el título del diálogo distingue editar de crear", () => {
    assert.match(DIALOGO, /Editar «\$\{guardada\.titulo \|\| guardada\.clave\}»/,
      "el diálogo ya no dice que se está editando ese formulario");
    assert.match(DIALOGO, /const editando = !!guardada && guardada\.estado === "publicado"/);
  });

  test("el diálogo precarga TODO desde la versión guardada", () => {
    // Si algún campo no viniera precargado, editar lo borraría en la versión nueva sin avisar.
    for (const campo of ["clave", "campana", "promo_clave", "idioma", "titulo", "subtitulo",
                         "destacado", "introduccion", "texto_boton", "mensaje_exito",
                         "texto_posterior", "imagen", "abre_en", "cierra_en",
                         "consentimiento_texto", "privacidad_url", "mensaje_wa"]) {
      assert.ok(DIALOGO.includes(`base?.${campo}`),
        `el diálogo no precarga «${campo}»: editar lo perdería`);
    }
    assert.match(DIALOGO, /base\?\.exige_whatsapp/);
    assert.match(DIALOGO, /base\?\.sugerir_poblacion/);
  });
});

describe("el bloque de WhatsApp del editor", () => {
  test("tiene su apartado, su interruptor y su textarea", () => {
    assert.match(DIALOGO, /WhatsApp al completar el formulario/, "falta el apartado");
    assert.match(DIALOGO, /id="ffWaOn"/, "falta el interruptor");
    assert.match(DIALOGO, /Enviar WhatsApp al inscribirse/, "el interruptor no dice qué hace");
    assert.match(DIALOGO, /fgArea\("ffWaMsg", "El mensaje"/, "falta el texto del mensaje");
  });

  test("el interruptor nace encendido solo si ya había mensaje", () => {
    assert.match(DIALOGO, /\(base\?\.mensaje_wa \|\| ""\)\.trim\(\) \? " checked" : ""/,
      "un formulario sin mensaje abriría con el interruptor encendido y parecería que manda");
  });

  test("apagado se guarda VACÍO, que es lo que el servidor entiende", () => {
    assert.match(CUERPO, /mensaje_wa: fgChk\("ffWaOn"\) \? fgVal\("ffWaMsg"\) : ""/,
      "apagar el interruptor tiene que dejar el mensaje vacío: es la única forma que el " +
      "servidor tiene de saber que no hay que mandar nada");
  });

  test("las variables se piden al SERVIDOR, no se escriben a mano", () => {
    assert.match(APP, /const fidgVarsWa = \(\) =>\s*\n?\s*\(FIDG\.variables \|\| \[\]\)\.length \? FIDG\.variables/,
      "la lista de variables del panel tiene que salir de la del servidor: dos listas divergen");
    // El respaldo, para el primer pintado, tiene que ser exactamente la del módulo puro.
    assert.deepEqual([...VARIABLES], ["nombre", "enlace", "fecha", "local", "premio"]);
    for (const v of VARIABLES) {
      assert.ok(APP.includes(`"${v}"`), `el respaldo del panel no incluye «${v}»`);
    }
  });

  test("se dice que {enlace} es el individual, y por qué la lista es cerrada", () => {
    assert.match(DIALOGO, /\{enlace\}<\/b> es el enlace INDIVIDUAL/,
      "no se explica que cada persona recibe el suyo");
    assert.match(DIALOGO, /telefono\}<\/code> no puede mandarle su propio número/,
      "no se explica por qué la lista de variables está cerrada");
  });

  test("y se dice que vacío u apagado no manda nada", () => {
    assert.match(DIALOGO, /no se manda nada/);
  });
});

describe("la vista previa del WhatsApp", () => {
  test("existe, está cableada y no inventa un enlace real", () => {
    assert.match(DIALOGO, /data-act="fidg-form-prev-wa"/, "no hay botón de vista previa");
    assert.match(APP, /act === "fidg-form-prev-wa"/, "el botón no está cableado");
    assert.match(PREVIA, /EJEMPLO/, "el enlace de la vista previa tiene que ser falso y parecerlo");
    assert.ok(!/\?t=\$\{/.test(PREVIA),
      "la vista previa compone un enlace con un token real: eso enseñaría el código de alguien");
  });

  test("sustituye con la MISMA regla que el servidor: lo desconocido se queda a la vista", () => {
    // La propiedad se comprueba ejecutando el módulo puro, que es quien manda; del panel se
    // comprueba que use la misma condición.
    const r = renderPlantilla("Hola {nombre}, {enlace} y {telefono} y {inventada}",
      { nombre: "Marta", enlace: "https://x/?t=1", telefono: "600000000" });
    assert.match(r, /Hola Marta/);
    assert.match(r, /https:\/\/x\/\?t=1/);
    assert.match(r, /\{telefono\}/,
      "el servidor ha empezado a sustituir {telefono}: mandaría el número dentro del mensaje");
    assert.match(r, /\{inventada\}/, "una variable con errata tiene que verse, no desaparecer");

    assert.match(PREVIA, /vars\.includes\(clave\) \? \(ejemplo\[clave\] \?\? ""\) : entera/,
      "la vista previa no imita la regla del servidor: enseñaría algo distinto de lo que sale");
  });

  test("señala las variables que no se van a sustituir", () => {
    assert.match(PREVIA, /raras/, "la vista previa no avisa de las erratas");
    assert.match(PREVIA, /saldrá escrito tal cual/);
  });

  test("apagado, la vista previa lo dice en vez de enseñar un mensaje", () => {
    assert.match(PREVIA, /!encendido \|\| !plantilla/);
    assert.match(PREVIA, /no se manda ningún WhatsApp/);
  });

  test("y recuerda que el servidor añade el enlace de baja", () => {
    assert.match(PREVIA, /darse de baja/,
      "sin decirlo, el mensaje de la vista previa parece más corto de lo que llega");
  });
});

describe("nada del esmorzar está escrito en el código", () => {
  test("ni el mensaje ni la fecha de esa campaña aparecen en ningún sitio nuevo", () => {
    // El texto lo configura Marketing desde el panel. Escribirlo aquí lo convertiría en la regla
    // de todos los formularios, que es justo lo que no se quiere.
    for (const trozo of ["Gràcies per voler formar part", "1 d'octubre", "esmorzar gratis",
                         "T'esperem"]) {
      assert.ok(!APP.includes(trozo), `el panel lleva escrito «${trozo}»`);
      assert.ok(!SERVER.includes(trozo), `el servidor lleva escrito «${trozo}»`);
    }
  });

  test("la plantilla que trae un formulario NUEVO sigue siendo solo un punto de partida", () => {
    // La hay, y está bien que la haya: un formulario nuevo sin mensaje se publica sin que nadie
    // se dé cuenta. Pero es un valor inicial del diálogo, no algo que el servidor imponga.
    assert.ok(!/mensaje_wa\s*=\s*["'`]/.test(SERVER),
      "el servidor impone un mensaje por defecto: cada formulario tiene que traer el suyo");
    assert.match(SERVER, /mensaje_wa: fidTexto\(b\.mensaje_wa, FID_LARGOS\.parrafo\)/,
      "el servidor tiene que guardar el mensaje tal como llega del panel");
  });
});
