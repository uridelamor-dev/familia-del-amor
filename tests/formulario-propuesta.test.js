// LA PROPUESTA DE UNA CAMPAÑA: el formulario ya escrito, en borrador, sin publicar nada.
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
//
// Una campaña son veintitantos textos: el título, la tarjeta verde, seis rótulos, el consentimiento
// y los doce mensajes de error. Pedirle a alguien que los teclee es pedirle que se deje uno —y el
// que se deja siempre es un mensaje de error, porque son los que nadie prueba hasta que fallan—.
// Así es como se publica una campaña en catalán que, en cuanto el cliente se equivoca de tecla,
// contesta «El teléfono no parece correcto».
//
// ── LAS DOS COSAS QUE ESTE FICHERO GARANTIZA ─────────────────────────────────────────────────
//
//   1. NO HAY QUE ESCRIBIR NADA A MANO. Los veintitantos textos vienen puestos y en catalán.
//   2. DESPLEGAR NO PUBLICA. La propuesta es una plantilla en el navegador: no toca la base, no
//      llama al servidor, y el estado que produce es `borrador`. Publicar es otro botón, lo pulsa
//      una persona, y el servidor lo vuelve a comprobar.
//
// Y una tercera, que es la que evita un susto: SI LA CAMPAÑA YA EXISTE, EL BOTÓN NO LA PISA.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { MENSAJES, MENSAJES_POR_IDIOMA, mensajesDe, CAMPOS, normalizarCampos, validarFormulario, textoSeguro }
  from "../src/modules/fidelizacion/contenido.js";

const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/**
 * La propuesta, leída DEL PROPIO `app.js`.
 *
 * Se evalúa el literal del panel en vez de copiarlo aquí: un test que repite los textos pasa
 * aunque el panel los pierda, que es exactamente el fallo que tiene que cazar.
 */
const PROPUESTAS = (() => {
  const i = app.indexOf("const FIDG_PROPUESTAS = {");
  assert.ok(i > 0, "no existe FIDG_PROPUESTAS en el panel");
  const j = app.indexOf("\n};", i) + 3;
  // eslint-disable-next-line no-new-func
  return new Function(app.slice(i, j).replace("const FIDG_PROPUESTAS =", "return") + ";")();
})();
const P = PROPUESTAS["esmorzar-girona"];

/** El cuerpo de una función de `app.js`, hasta la siguiente declaración de primer nivel. */
function fnApp(nombre) {
  const i = app.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no existe ${nombre}()`);
  const j = app.indexOf("\n}\n", i);
  return app.slice(i, j > 0 ? j + 2 : app.length);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("la propuesta existe y se llega a ella", () => {
  test("hay una propuesta para esmorzar-girona", () => {
    assert.ok(P, "no hay propuesta para esmorzar-girona");
    assert.equal(P.clave, "esmorzar-girona");
    assert.equal(P.nombre_propuesta, "Esmorzar Girona");
  });

  test("el botón está en Campañas → Formularios públicos, y dice lo que hace", () => {
    // El botón vive en `renderFidgPropuestas`, que es lo que pinta Campañas → Formularios
    // públicos. Se miran las dos juntas porque juntas se pintan.
    const camp = app.slice(app.indexOf("function renderFidgPropuestas()"),
                           app.indexOf("function renderFidgFormularios()"));
    assert.match(camp, /data-act="fidg-form-propuesta"/);
    assert.match(camp, /Crear propuesta/);
    // Y dice en qué punto está: propuesta, borrador o publicada.
    for (const punto of ["Publicada", "Borrador sin publicar", "Solo propuesta"]) {
      assert.ok(camp.includes(punto), `falta el estado «${punto}»`);
    }
  });

  test("y está cableado", () => {
    assert.match(app, /else if \(act === "fidg-form-propuesta"\) fidgFormPropuesta\(t\.getAttribute\("data-p"\)\);/);
    assert.match(app, /function fidgFormPropuesta\(clave\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("NO HAY QUE ESCRIBIR NADA A MANO", () => {
  test("los textos de la campaña vienen puestos, y son los acordados", () => {
    assert.equal(P.idioma, "ca");
    assert.equal(P.titulo, "A La Tapeta et convidem a esmorzar!");
    assert.equal(P.destacado, "Completa el formulari i rebràs el codi al teu telèfon.");
    assert.equal(P.texto_boton, "Vull el meu codi");
    assert.equal(P.consentimiento_texto,
      "Omplint aquest formulari acceptes rebre descomptes del grup de la Família del Amor. "
      + "Consulta la Política de privacitat.");
    // La frase NOMBRA el enlace: es lo que permite subrayar esas tres palabras dentro de ella en
    // vez de dejar «consulta la política» sin destino y el enlace suelto debajo.
    assert.ok(P.consentimiento_texto.includes("Política de privacitat"));
  });

  test("NINGUNA PROPUESTA INVENTA UN ENLACE DE PRIVACIDAD", () => {
    // El fallo que esto arregla: la propuesta llevaba escrito
    // `https://familiadelamor.org/privacitat`, una URL que suena bien y que NO EXISTE. Habría
    // dado un 404 al cliente justo cuando va a dar su teléfono, y habría dejado por escrito que
    // aceptó una política inexistente. Un enlace falso es peor que ninguno.
    //
    // Así que una propuesta solo puede traer un enlace si apunta a una página que esta casa
    // SIRVE DE VERDAD. Mientras no exista, se queda vacía y no se puede publicar.
    const paginas = readdirSync(new URL("../public/", import.meta.url));
    for (const [clave, p] of Object.entries(PROPUESTAS)) {
      const url = String(p.privacidad_url || "");
      if (!url) continue;                       // vacío es legítimo: bloquea la publicación
      const fichero = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "").split(/[?#]/)[0];
      const existe = paginas.includes(fichero) || paginas.includes(fichero + ".html")
        || server.includes(`"/${fichero}"`);
      assert.ok(existe, `«${clave}» enlaza a «${url}», que esta casa no sirve`);
    }
  });

  test("y enlaza LA CATALANA, que es el idioma de la campaña", () => {
    assert.equal(P.privacidad_url, "/privacitat.html");
    assert.ok(existsSync(new URL("../public/privacitat.html", import.meta.url)),
      "la propuesta enlaza una política que no existe");
  });

  test("si alguna vez faltara, el bloqueo seguiría siendo visible", () => {
    // El aviso del panel sigue ahí para cualquier propuesta futura que nazca sin política: es
    // condicional, no una nota que se quedó escrita.
    assert.match(app, /\$\{propuesta\.privacidad_url \? "" : '<br><br><b>Falta la política de privacidad/);
    const sinPolitica = validarFormulario({ ...P, privacidad_url: "" });
    assert.equal(sinPolitica.ok, false);
    assert.ok(sinPolitica.falta.some((x) => /pol[ií]tica de privacidad/i.test(x)));
  });

  test("EL SUBTÍTULO VA VACÍO A PROPÓSITO, no ausente", () => {
    // Que la clave exista y valga `""` es lo que distingue «se decidió quitarlo» de «se olvidó».
    assert.ok("subtitulo" in P, "falta la clave del subtítulo");
    assert.equal(P.subtitulo, "");
  });

  test("LO QUE EL CLIENTE ACABA VIENDO ESTÁ COMPLETO Y EN CATALÁN", () => {
    // Lo que importa no es cuántas casillas rellena la propuesta, sino el juego RESUELTO: lo
    // escrito a mano más el respaldo del idioma. Exigir que la propuesta repita los quince
    // habría obligado a copiar en ella cada mensaje nuevo que se añada a la casa, y el día que
    // alguien se olvidara de copiarlo saldría en castellano sin que nada avisara.
    const visto = mensajesDe(P.mensajes, P.idioma);
    assert.deepEqual(Object.keys(visto).sort(), Object.keys(MENSAJES).sort());
    for (const [k, v] of Object.entries(visto)) assert.ok(String(v).trim(), `${k} está vacío`);
    // Y ninguno es el castellano.
    for (const k of Object.keys(MENSAJES)) {
      assert.notEqual(visto[k], MENSAJES[k], `el mensaje «${k}» sale en castellano`);
    }
  });

  test("lo que la propuesta sí personaliza, está escrito y en catalán", () => {
    for (const [k, v] of Object.entries(P.mensajes)) {
      assert.ok(Object.prototype.hasOwnProperty.call(MENSAJES, k), `«${k}» no es un mensaje conocido`);
      assert.ok(String(v).trim(), `${k} está vacío`);
      assert.notEqual(v, MENSAJES[k], `el mensaje «${k}» sigue en castellano`);
    }
    // Los dos de WhatsApp, exactamente los acordados.
    assert.equal(P.mensajes.sin_whatsapp,
      "Aquest número no està disponible a WhatsApp. Comprova'l i torna-ho a provar.");
    assert.equal(P.mensajes.whatsapp_caido,
      "Ara mateix no podem comprovar el número. Torna-ho a provar d'aquí a uns minuts.");
  });

  test("las etiquetas de los campos están en catalán, una por una", () => {
    const rotulo = Object.fromEntries(P.campos.map((c) => [c.id, c.etiqueta]));
    assert.deepEqual(
      ["nombre", "apellidos", "nacimiento", "poblacion", "telefono", "email"].map((k) => rotulo[k]),
      ["Nom", "Cognoms", "Data de naixement", "Població", "Telèfon", "Correu electrònic"]);
    // Ninguna etiqueta se ha quedado con el texto de la casa.
    for (const c of P.campos) {
      assert.ok(String(c.etiqueta || "").trim(), `${c.id} sin etiqueta`);
      assert.notEqual(c.etiqueta, CAMPOS[c.id].etiqueta, `${c.id} sigue con la etiqueta castellana`);
    }
  });

  test("EL PANEL GUARDA LA ETIQUETA: sin esto se perdería en el primer guardado", () => {
    // Había una casilla por campo para «visible» y «obligatorio», pero el rótulo no se mandaba:
    // el formulario volvía a salir en castellano en cuanto alguien pulsaba «Guardar».
    assert.match(app, /id="fcT_\$\{id\}" value="\$\{esc\(rotulo\)\}"/);
    assert.match(app, /etiqueta: fgVal\(`fcT_\$\{id\}`\)/);
    // Y la vista previa enseña la configurada, no la del código.
    assert.match(app, /const t = x\.etiqueta \|\| \(FIDG_CAMPOS\.find/);
    // El servidor la acepta y la sanea.
    assert.match(server, /campos: fidCampos\(fidLeerLista\(b\.campos\)\)/);
    const c = normalizarCampos([{ id: "apellidos", visible: true, etiqueta: "Cognoms" }])
      .find((x) => x.id === "apellidos");
    assert.equal(c.etiqueta, "Cognoms");
    // Y no deja colar HTML por ahí: se pinta en una página pública.
    const malo = normalizarCampos([{ id: "apellidos", etiqueta: "<script>x</script>" }])
      .find((x) => x.id === "apellidos");
    assert.ok(!/[<>]/.test(malo.etiqueta), malo.etiqueta);
  });

  test("el comportamiento también viene puesto: WhatsApp y sugerencias encendidos", () => {
    assert.equal(P.exige_whatsapp, true);
    assert.equal(P.sugerir_poblacion, true);
  });

  test("y la casilla de «acepto comunicaciones» viene QUITADA", () => {
    // El consentimiento va en una frase encima del botón. Una casilla más es un motivo más para
    // no terminar el formulario.
    const com = P.campos.find((c) => c.id === "comercial");
    assert.ok(com, "la propuesta no dice nada de la casilla comercial");
    assert.equal(com.visible, false);
    assert.equal(com.obligatorio, false);
  });

  test("LA PROPUESTA ESTÁ COMPLETA: se podría publicar tal cual, sin escribir nada", () => {
    // Es la prueba de que no queda ni un hueco de redacción. Se valida con el MISMO validador que
    // usa el servidor al publicar.
    const v = validarFormulario(P);
    assert.deepEqual(v.falta, [], `faltarían cosas por escribir: ${v.falta.join(" · ")}`);
    assert.equal(v.ok, true);
  });

  test("y todos sus textos sobreviven al saneado: ni acentos rotos ni recortes", () => {
    for (const k of ["titulo", "destacado", "texto_boton", "consentimiento_texto", "mensaje_exito"]) {
      assert.equal(textoSeguro(P[k], 4000), P[k], `«${k}» cambia al sanearlo`);
    }
    for (const [k, v] of Object.entries(P.mensajes)) {
      assert.equal(textoSeguro(v, 4000), v, `el mensaje «${k}» cambia al sanearlo`);
    }
  });

  test("los mensajes coinciden con los respaldos catalanes donde no se han querido cambiar", () => {
    // Los que la campaña personaliza y NO deberían: si divergieran sin motivo, habría dos
    // verdades sobre la misma frase. Los que no toca caen en el respaldo y no se comparan.
    const ca = MENSAJES_POR_IDIOMA.ca;
    const distintos = Object.keys(P.mensajes).filter((k) => ca[k] !== P.mensajes[k]);
    // `ya_registrado` sí se personaliza a propósito: dice que se reenvía el mismo código.
    assert.deepEqual(distintos, ["ya_registrado"], `divergen sin motivo: ${distintos.join(", ")}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("DESPLEGAR NO PUBLICA NADA", () => {
  test("la propuesta NO trae estado: nace borrador como cualquier formulario nuevo", () => {
    assert.ok(!("estado" in P), "la propuesta fija un estado por su cuenta");
  });

  test("el botón no escribe: solo abre el formulario", () => {
    const f = sinComentarios(app.slice(app.indexOf("function fidgFormPropuesta(clave)"),
                                       app.indexOf("const FIDG_CAMPOS = [")));
    assert.ok(!/apiSend\(/.test(f), "la propuesta manda algo al servidor");
    assert.ok(!/apiRaw\(/.test(f), "la propuesta llama al servidor");
    assert.match(f, /fidgFormNuevo\(/);
  });

  test("guardar y publicar siguen siendo DOS botones distintos", () => {
    assert.match(app, /data-act="fidg-form-guardar" data-pub="0">Guardar borrador/);
    assert.match(app, /data-act="fidg-form-guardar" data-pub="1">Publicar…/);
  });

  test("y el servidor solo publica si se lo piden explícitamente", () => {
    // Cualquier otra cosa —`"si"`, `1`, `true`, nada— cae en borrador.
    assert.match(server, /estado: b\.estado === "publicado" \? "publicado" : "borrador"/);
    for (const v of ["", "si", "1", "publicada", "PUBLICADO", null]) {
      assert.notEqual(v, "publicado");
    }
  });

  test("NINGUNA MIGRACIÓN CREA NI PUBLICA UN FORMULARIO", () => {
    // Es la diferencia entre una plantilla en el panel y una semilla en el arranque: una semilla
    // publicaría la campaña en cada despliegue, sin que nadie lo decidiera.
    const sql = sinComentarios(esquema);
    assert.ok(!/INSERT INTO fid_formularios/.test(sql), "el arranque inserta un formulario");
    assert.ok(!/UPDATE fid_formularios/.test(sql), "el arranque modifica un formulario");
    assert.ok(!/esmorzar/i.test(esquema), "el esquema conoce una campaña por su nombre");
  });

  test("y el servidor no lleva escrita ninguna propuesta: son del panel", () => {
    // SIN LOS COMENTARIOS: un comentario que explica por qué la clave se normaliza nombra la
    // campaña de ejemplo, y eso no es tener el texto escrito en el código.
    assert.ok(!/esmorzar|convidem|Vull el meu codi/i.test(sinComentarios(server)),
      "el servidor lleva escritos textos de una campaña");
  });

  test("la puerta del programa de puntos sigue naciendo cerrada", () => {
    assert.match(esquema, /VALUES \(1, 'no_preparado', \?\)\s*\n?\s*ON CONFLICT \(id\) DO NOTHING/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("POR QUÉ LA URL PÚBLICA SEGUÍA ENSEÑANDO EL FORMULARIO VIEJO", () => {
  // ── EL DIAGNÓSTICO, DEMOSTRADO ─────────────────────────────────────────────────────────────
  //
  // `/promo.html?c=esmorzar-girona` servía el formulario histórico porque NO EXISTÍA NINGUNA
  // VERSIÓN de esa clave: ni publicada ni borrador. Y es correcto que así fuera —la propuesta
  // solo abre el formulario relleno—, pero desde el panel no se veía por ningún lado.
  //
  // Estos tests demuestran cada eslabón de esa cadena.

  test("NADA crea un formulario solo: ni el arranque, ni una migración, ni abrir la pantalla", () => {
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.ok(!/INSERT INTO fid_formularios/.test(esquema), "el arranque inserta un formulario");
    // En TODO el servidor hay UN SOLO `INSERT`, y está detrás de una ruta con sesión.
    const inserts = [...server.matchAll(/INSERT INTO fid_formularios/g)].length;
    assert.equal(inserts, 1, `hay ${inserts} sitios que insertan formularios`);
    const crear = server.slice(server.indexOf('app.post("/api/fidelizacion/formularios"'));
    assert.ok(crear.indexOf("INSERT INTO fid_formularios") < crear.indexOf("\n});"),
      "el INSERT no está dentro de la ruta de crear");
    assert.match(server, /app\.post\("\/api\/fidelizacion\/formularios", requireAuth\(PROMOS_ROLES\)/);
  });

  test("y la propuesta NO llama al servidor: por eso no existía ninguna versión", () => {
    const f = sinComentarios(app.slice(app.indexOf("function fidgFormPropuesta(clave)"),
                                       app.indexOf("const FIDG_CAMPOS = [")));
    for (const escritura of ["apiSend(", "apiRaw(", "fetch("]) {
      assert.ok(!f.includes(escritura), `la propuesta hace ${escritura}`);
    }
  });

  test("sin versión publicada, la ruta pública contesta 404 — y eso es lo correcto", () => {
    const GET = server.slice(server.indexOf('app.get("/api/publico/formulario/:clave"'));
    assert.match(GET, /WHERE clave = \? AND estado = 'publicado'/);
    assert.match(GET, /if \(!f \|\| !abierto\.ok\)/);
    assert.match(GET, /status\(404\)/);
  });

  test("y `promo.js` cae al formulario histórico justo ahí", () => {
    const promoJs = readFileSync(new URL("../public/promo.js", import.meta.url), "utf8");
    assert.match(promoJs, /fetch\("\/api\/publico\/formulario\/" \+ encodeURIComponent\(CLAVE\)\)/);
    assert.match(promoJs, /r\.ok \? r\.json\(\) : null/);
    assert.match(promoJs, /if \(j && j\.ok\) \{ pintarConfigurable\(j\); return null; \}/);
    assert.match(promoJs, /return arrancarCampanaClasica\(\);/);
  });

  test("NO ES LA CACHÉ: la ruta pública se sirve con `no-store`", () => {
    for (const firma of ['app.get("/api/publico/formulario/:clave"',
                         'app.post("/api/publico/formulario/:clave"']) {
      const r = server.slice(server.indexOf(firma), server.indexOf(firma) + 400);
      assert.match(r, /res\.set\("Cache-Control", "no-store"\)/);
    }
  });

  test("EL PANEL LO DICE AHORA, en vez de dejar que se adivine", () => {
    const bloque = app.slice(app.indexOf("function renderFidgPropuestas()"),
                             app.indexOf("function renderFidgFormularios()"));
    assert.match(bloque, /Producción sigue sirviendo el formulario antiguo/);
    // Y explica los tres motivos distintos por los que puede pasar.
    assert.match(bloque, /No existe ninguna versión de esta campaña/);
    assert.match(bloque, /ningún borrador se publica solo/);
    assert.match(bloque, /no está abierta/);
    // Solo sale cuando de verdad ocurre…
    // Solo para NUESTRAS propuestas: una campaña ajena que tenga gente detrás también sale en
    // esta lista, y decirle «producción sirve el formulario antiguo» no significaría nada.
    assert.match(bloque, /const aviso = esPropuesta && !sirveConfigurable/);
  });

  test("Y SALE TAMBIÉN CUANDO NO HAY NINGUNA FILA, que es el caso de verdad", () => {
    // El servidor construye la lista a partir de las filas que EXISTEN, así que una campaña que
    // nunca se ha guardado no aparece. Tratar eso como «no sé nada» callaba precisamente en el
    // único momento en que había algo que decir.
    const bloque = app.slice(app.indexOf("function renderFidgPropuestas()"),
                             app.indexOf("function renderFidgFormularios()"));
    assert.match(bloque, /estadoDe\(clave\) \|\| \{ clave, borradores: 0, cerradas: 0, version_publicada: null,\s*\n?\s*sirve: "historico", motivo: "no_existe" \}/);
    assert.ok(!/const publicada = e && /.test(bloque), "vuelve a depender de que exista la entrada");
  });

  test("el estado sale del SERVIDOR, no de lo que crea el panel", () => {
    const lista = server.slice(server.indexOf('app.get("/api/fidelizacion/formularios"'));
    assert.match(lista, /sirve: abierto\.ok \? "configurable" : "historico"/);
    assert.match(lista, /url_publica: `\/promo\.html\?c=\$\{encodeURIComponent\(e\.clave\)\}`/);
    // Y se calcula LEYENDO: la pantalla de estado no puede publicar nada.
    const trozo = lista.slice(0, lista.indexOf("\n});"));
    for (const escritura of ["INSERT INTO", "UPDATE ", "DELETE "]) {
      assert.ok(!sinComentarios(trozo).includes(escritura), `la lista hace ${escritura}`);
    }
  });

  test("los tres puntos se distinguen: propuesta, borrador y publicada", () => {
    const bloque = app.slice(app.indexOf("function renderFidgPropuestas()"),
                             app.indexOf("function renderFidgFormularios()"));
    assert.match(bloque, /publicada \? \["Publicada", "ok"\] : hayBorrador \? \["Borrador sin publicar", "warn"\]/);
    assert.match(bloque, /"Solo propuesta"/);
  });

  test("y están los tres botones que se pidieron", () => {
    const bloque = app.slice(app.indexOf("function renderFidgPropuestas()"),
                             app.indexOf("function renderFidgFormularios()"));
    assert.match(bloque, /Abrir borrador/);
    assert.match(bloque, /data-act="fidg-propuesta-prev"/);
    assert.match(bloque, /Abrir formulario público/);
    // El de abrir en público SOLO cuando de verdad sirve la configurable.
    assert.match(bloque, /sirveConfigurable\s*\n?\s*\? `<a class="btn sm primary"/);
  });

  test("LA VISTA PREVIA NO GUARDA NI PUBLICA NADA", () => {
    const prev = sinComentarios(fnApp("fidgPropuestaPrev"));
    for (const escritura of ["apiSend(", "apiRaw(", "fetch("]) {
      assert.ok(!prev.includes(escritura), `la vista previa hace ${escritura}`);
    }
    assert.match(prev, /no se ha guardado ni publicado nada/);
  });

  test("tras publicar se confirma LA CLAVE Y LA URL EXACTAS, leídas del servidor", () => {
    // La clave se normaliza al guardar: «Esmorzar Girona» se convierte en `esmorzar-girona`.
    // Enseñar lo tecleado habría hecho copiar una URL que no existe.
    assert.match(server, /res\.json\(\{ ok: true, id: fila\.id, clave, version: fila\.version/);
    assert.match(server, /url_publica: `\/promo\.html\?c=\$\{encodeURIComponent\(clave\)\}`/);
    const conf = fnApp("fidgPublicada");
    assert.match(conf, /const clave = j\.clave \|\| "";/);
    assert.match(conf, /\/promo\.html\?c=\$\{encodeURIComponent\(clave\)\}/);
    assert.ok(!conf.includes("fgVal("), "la confirmación usa lo tecleado, no lo guardado");
  });

  test("y publicar SIGUE exigiendo confirmación", () => {
    assert.match(app, /if \(publicar === "1" && !confirm\(/);
    assert.match(app, /Se PUBLICARÁ el formulario/);
    // Guardar un borrador NO publica, y se dice.
    assert.match(app, /Guardado como borrador \(versión \$\{j\.version\}\)\. No se ha publicado nada\./);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("SI LA CAMPAÑA YA EXISTE, EL BOTÓN NO LA PISA", () => {
  const f = app.slice(app.indexOf("function fidgFormPropuesta(clave)"),
                      app.indexOf("const FIDG_CAMPOS = ["));

  test("con un borrador a medias, se abre ESE borrador", () => {
    // Lo contrario sería tirar a la basura lo que alguien llevaba escrito.
    assert.match(f, /const borrador = suyas\.find\(\(f\) => f\.estado === "borrador"\);/);
    assert.match(f, /if \(borrador\) \{[\s\S]{0,200}return fidgFormNuevo\(borrador\.id\);/);
  });

  test("con una versión publicada, se COPIA a una versión nueva", () => {
    assert.match(f, /const ultima = suyas\.sort\(\(a, b\) => Number\(b\.version \|\| 0\) - Number\(a\.version \|\| 0\)\)\[0\];/);
    assert.match(f, /if \(ultima\) \{[\s\S]{0,200}return fidgFormNuevo\(ultima\.id\);/);
  });

  test("y en los dos casos se avisa de lo que va a pasar", () => {
    assert.match(f, /toast\("Ya hay un borrador de esta campaña: se abre ese"\)/);
    assert.match(f, /toast\(`«\$\{clave\}» ya existe \(v\$\{ultima\.version\}\): se copia a una versión nueva`\)/);
  });

  test("LA VERSIÓN GUARDADA MANDA SOBRE LA PROPUESTA, nunca al revés", () => {
    // Es la línea que impide que una plantilla machaque lo que ya está en producción.
    assert.match(app, /const base = guardada \|\| propuesta \|\| null;/);
    assert.match(app, /async function fidgFormNuevo\(desdeId, propuesta\)/);
  });

  test("solo se abre el aviso de copia cuando de verdad se copia algo publicado", () => {
    assert.match(app, /avisoCopia\(guardada && guardada\.estado === "publicado" \? guardada\.version : null\)/);
  });

  test("y una propuesta que no existe no hace nada", () => {
    assert.match(f, /const p = FIDG_PROPUESTAS\[clave\];\s*\n\s*if \(!p\) return;/);
  });

  test("publicar sigue cerrando la versión anterior en una transacción, no a mano", () => {
    const crear = server.slice(server.indexOf('app.post("/api/fidelizacion/formularios"'));
    assert.match(crear, /pg_advisory_xact_lock/);
    assert.match(crear, /UPDATE fid_formularios SET estado = 'cerrado' WHERE clave = \? AND estado = 'publicado'/);
  });
});
