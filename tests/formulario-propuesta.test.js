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
import { readFileSync } from "node:fs";
import { MENSAJES, MENSAJES_POR_IDIOMA, CAMPOS, normalizarCampos, validarFormulario, textoSeguro }
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("la propuesta existe y se llega a ella", () => {
  test("hay una propuesta para esmorzar-girona", () => {
    assert.ok(P, "no hay propuesta para esmorzar-girona");
    assert.equal(P.clave, "esmorzar-girona");
    assert.equal(P.nombre_propuesta, "Esmorzar Girona");
  });

  test("el botón está en Campañas → Formularios públicos, y dice lo que hace", () => {
    const camp = app.slice(app.indexOf("function renderCampFidelizacion()"),
                           app.indexOf("function renderCampFidelizacion()") + 2500);
    assert.match(camp, /data-act="fidg-form-propuesta"/);
    assert.match(camp, /Crear propuesta · \$\{esc\(p\.nombre_propuesta\)\}/);
    // Y avisa de las dos cosas que importan antes de pulsarlo.
    assert.match(camp, /relleno y en borrador/);
    assert.match(camp, /No publica nada/);
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
      "Omplint aquest formulari acceptes rebre descomptes del grup de la Família del Amor.");
    assert.match(P.privacidad_url, /^https:\/\//);
  });

  test("EL SUBTÍTULO VA VACÍO A PROPÓSITO, no ausente", () => {
    // Que la clave exista y valga `""` es lo que distingue «se decidió quitarlo» de «se olvidó».
    assert.ok("subtitulo" in P, "falta la clave del subtítulo");
    assert.equal(P.subtitulo, "");
  });

  test("LOS DOCE MENSAJES VIENEN ESCRITOS, ninguno vacío", () => {
    assert.deepEqual(Object.keys(P.mensajes).sort(), Object.keys(MENSAJES).sort());
    for (const [k, v] of Object.entries(P.mensajes)) assert.ok(String(v).trim(), `${k} está vacío`);
  });

  test("y NINGUNO se ha quedado en castellano", () => {
    // Es el fallo que se cuela: doce casillas, once traducidas.
    for (const k of Object.keys(MENSAJES)) {
      assert.notEqual(P.mensajes[k], MENSAJES[k], `el mensaje «${k}» sigue en castellano`);
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

  test("LA PROPUESTA ESTÁ COMPLETA: se podría publicar tal cual, sin que falte nada", () => {
    // Es la prueba de que no hay que rellenar ningún hueco a mano. Se valida con el MISMO
    // validador que usa el servidor al publicar.
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
    // Los que la campaña no personaliza tienen que ser exactamente los de la casa: si divergieran
    // sin motivo, habría dos verdades sobre la misma frase.
    const ca = MENSAJES_POR_IDIOMA.ca;
    const distintos = Object.keys(ca).filter((k) => ca[k] !== P.mensajes[k]);
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
    assert.ok(!/esmorzar|convidem|Vull el meu codi/i.test(server),
      "el servidor lleva escritos textos de una campaña");
  });

  test("la puerta del programa de puntos sigue naciendo cerrada", () => {
    assert.match(esquema, /VALUES \(1, 'no_preparado', \?\)\s*\n?\s*ON CONFLICT \(id\) DO NOTHING/);
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
