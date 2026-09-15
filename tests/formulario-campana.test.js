// EL FORMULARIO PÚBLICO DE UNA CAMPAÑA, y lo que no puede pasar en él.
//
// La campaña de referencia es `esmorzar-girona`: en catalán, con sugerencia de población y con
// WhatsApp obligatorio. Pero NADA de eso está escrito en el código —está en la versión publicada
// del formulario— y eso es justo lo que aquí se comprueba: que la página es un molde y que cambiar
// una campaña no toca ni una línea de `promo.js`.
//
// ── LO QUE MÁS IMPORTA DE ESTE FICHERO ───────────────────────────────────────────────────────
//
// Un formulario que pide un teléfono y contesta distinto según lo que recibe es un comprobador de
// números: se le pasan mil y se averigua cuáles existen, cuáles tienen WhatsApp y cuáles están ya
// en nuestra base. Media docena de estos tests existen solo para que eso no ocurra.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mensajesDe, MENSAJES, MENSAJES_POR_IDIOMA, mensajesDefecto, IDIOMAS, CAMPOS, normalizarCampos }
  from "../src/modules/fidelizacion/contenido.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const promoJs = readFileSync(new URL("../public/promo.js", import.meta.url), "utf8");
const promoHtml = readFileSync(new URL("../public/promo.html", import.meta.url), "utf8");
const promoCss = readFileSync(new URL("../public/promo.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

/** Un endpoint entero, desde su firma hasta el `});` que lo cierra. */
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  return server.slice(i, server.indexOf("\n});", i) + 4);
};
/** El mismo texto sin las líneas de comentario: los comentarios dicen lo que NO se hace. */
const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

const GET = ruta('app.get("/api/publico/formulario/:clave"');
const POST = ruta('app.post("/api/publico/formulario/:clave"');

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("los textos están en la campaña, no en el código", () => {
  test("`promo.js` no lleva escrito ningún texto de esta campaña", () => {
    // Si estuviera aquí, cambiar la campaña siguiente exigiría un despliegue —y dos campañas a la
    // vez serían imposibles—. Todo sale de la versión publicada.
    for (const texto of ["esmorzar", "convidem", "Vull el meu codi", "Cognoms",
                         "Data de naixement", "Població", "Telèfon"]) {
      assert.ok(!promoJs.includes(texto), `«${texto}» está escrito en promo.js`);
    }
  });

  test("y tampoco lleva la clave de ninguna campaña", () => {
    assert.ok(!/esmorzar-girona|girona/i.test(promoJs), "promo.js conoce una campaña por su nombre");
  });

  test("el idioma de la página lo pone el servidor, no el navegador", () => {
    // El cliente puede tener el móvil en inglés y la campaña estar en catalán: manda la campaña.
    assert.match(promoJs, /documentElement\.lang = /);
    assert.match(GET, /idioma: f\.idioma \|\| "es"/);
  });

  test("el título, el destacado, las etiquetas, el botón y el consentimiento vienen de la versión", () => {
    for (const campo of ["titulo", "subtitulo", "destacado", "texto_boton",
                         "consentimiento_texto", "privacidad_url", "campos", "mensajes"]) {
      assert.ok(GET.includes(campo), `el GET público no devuelve ${campo}`);
    }
  });

  test("un subtítulo vacío NO deja una línea en blanco: se quita el elemento", () => {
    // La campaña de Girona no tiene subtítulo. Un `<p>` vacío deja un hueco que se ve.
    assert.match(promoJs, /hidden = !/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("todos los mensajes, en el idioma de la campaña", () => {
  test("hay un juego completo por cada idioma que se puede publicar", () => {
    for (const id of Object.keys(IDIOMAS)) {
      assert.ok(MENSAJES_POR_IDIOMA[id], `falta el juego de mensajes de ${id}`);
      assert.deepEqual(Object.keys(MENSAJES_POR_IDIOMA[id]).sort(), Object.keys(MENSAJES).sort(),
        `al idioma ${id} le falta algún mensaje`);
      for (const [k, v] of Object.entries(MENSAJES_POR_IDIOMA[id])) {
        assert.ok(String(v).trim(), `${id}.${k} está vacío`);
      }
    }
  });

  test("EN CATALÁN NO SE CUELA NINGÚN MENSAJE EN CASTELLANO", () => {
    // Es el fallo clásico: la pantalla está en catalán y, en cuanto alguien se equivoca de tecla,
    // aparece «El teléfono no parece correcto». Los mensajes de error son los que nadie prueba.
    const ca = MENSAJES_POR_IDIOMA.ca, es = MENSAJES;
    for (const k of Object.keys(es)) {
      assert.notEqual(ca[k], es[k], `el mensaje «${k}» sigue en castellano`);
    }
    // Y los dos de WhatsApp son EXACTAMENTE los acordados.
    assert.equal(ca.sin_whatsapp,
      "Aquest número no està disponible a WhatsApp. Comprova'l i torna-ho a provar.");
    assert.equal(ca.whatsapp_caido,
      "Ara mateix no podem comprovar el número. Torna-ho a provar d'aquí a uns minuts.");
  });

  test("una casilla vacía cae en el idioma de la campaña, no en castellano", () => {
    const m = mensajesDe({ ya_registrado: "Fet!" }, "ca");
    assert.equal(m.ya_registrado, "Fet!", "lo escrito a mano manda");
    assert.equal(m.sin_whatsapp, MENSAJES_POR_IDIOMA.ca.sin_whatsapp);
    assert.equal(m.error, MENSAJES_POR_IDIOMA.ca.error);
  });

  test("un idioma desconocido cae en castellano, que es el de la casa", () => {
    assert.equal(mensajesDefecto("zz"), MENSAJES);
    assert.equal(mensajesDe(null, undefined).error, MENSAJES.error);
  });

  test("el servidor SIEMPRE pasa el idioma al resolver los mensajes", () => {
    // Sin esto, el respaldo por idioma no serviría de nada: es de una línea y de las que se olvidan.
    const usos = [...server.matchAll(/fidMensajes\(([^)]*)\)/g)].map((m) => m[1]);
    assert.ok(usos.length >= 4);
    for (const u of usos) assert.match(u, /,\s*\w/, `fidMensajes sin idioma: fidMensajes(${u})`);
  });

  test("los mensajes son texto plano saneado, no HTML", () => {
    const m = mensajesDe({ error: "<script>alert(1)</script>malo" }, "ca");
    assert.ok(!/[<>]/.test(m.error), m.error);
  });

  test("NINGÚN TEXTO DE LA CAMPAÑA SE PINTA COMO HTML", () => {
    // Los escribe una persona desde el panel y se ven en una página pública: un `<script>` en el
    // título sería un `<script>` en la página que abren los clientes. El esqueleto sí se monta con
    // `innerHTML`, pero es una constante del fichero, sin un solo hueco donde meter nada.
    const conf = sinComentarios(promoJs.slice(promoJs.indexOf("function pintarConfigurable")));
    for (const m of conf.matchAll(/innerHTML\s*=\s*([^\n]*)/g)) {
      const valor = m[1].trim();
      assert.ok(valor.startsWith("'") || valor.startsWith('""') || valor === '"";',
        `se pinta HTML calculado: ${valor}`);
      assert.ok(!valor.includes("${") && !valor.includes(" + "),
        `se interpola algo dentro del HTML: ${valor}`);
    }
    // Y el texto de la campaña va SIEMPRE por textContent.
    assert.ok(conf.includes("textContent"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el teléfono y WhatsApp", () => {
  test("NO EXISTE NINGUNA RUTA QUE DIGA SI UN NÚMERO TIENE WHATSAPP", () => {
    // Un endpoint así es un comprobador de números: se le pasan mil y se sabe cuáles existen.
    const publicas = [...server.matchAll(/app\.(get|post)\("(\/api\/publico[^"]*)"/g)].map((m) => m[2]);
    for (const r of publicas) assert.ok(!/whatsapp|wa|telefono|numero/i.test(r), `ruta pública ${r}`);
    // Y la comprobación vive DENTRO del alta, no en una ruta suya.
    const llamadas = [...server.matchAll(/numeroTieneWhatsApp\(/g)].length;
    assert.ok(llamadas > 0);
    assert.ok(POST.includes("numeroTieneWhatsApp("), "la comprobación no está dentro del alta");
  });

  test("hay freno por IP y por número, con ventana", () => {
    // Sin esto, el propio formulario serviría de comprobador: se rellena en bucle con un script.
    assert.match(server, /const FID_WA_MAX_IP = \d+;/);
    assert.match(server, /const FID_WA_MAX_TEL = \d+;/);
    assert.match(server, /const FID_WA_VENTANA_MS = /);
    assert.match(POST, /if \(!fidLimiteWA\(req, tel\)\)/);
    // Y el acumulador tiene techo: no puede crecer sin límite con números inventados.
    assert.match(server, /if \(FID_WA_INTENTOS\.size > \d+\) FID_WA_INTENTOS\.clear\(\);/);
  });

  test("TRES RESULTADOS Y TRES MENSAJES DISTINTOS", () => {
    // Que WhatsApp esté caído NO es que el número esté mal: decírselo así al cliente le haría
    // corregir un teléfono que era correcto.
    assert.match(POST, /if \(tiene === false\) return res\.status\(400\)[\s\S]{0,80}M\.sin_whatsapp/);
    assert.match(POST, /if \(tiene === null\) \{[\s\S]{0,300}M\.whatsapp_caido/);
    // Una excepción se trata como «no lo sé», nunca como «no lo tiene».
    assert.match(POST, /catch \{ tiene = null; \}/);
  });

  test("SI NO SE PUEDE COMPROBAR, NO SE GUARDA NADA NI SE GENERA EL BENEFICIO", () => {
    // El 503 tiene que salir ANTES de la transacción y antes de emitir el carné. Si saliera
    // después, habría altas a medias con un carné emitido y sin teléfono comprobado.
    const i503 = POST.indexOf("M.whatsapp_caido }");
    const iTx = POST.indexOf("await fidTransaccion(");
    const iCarnet = POST.indexOf("proEmitir(");
    assert.ok(i503 > 0 && iTx > i503, "el alta se guarda antes de comprobar el número");
    assert.ok(iCarnet > i503, "el beneficio se genera antes de comprobar el número");
  });

  test("y solo se comprueba si la campaña lo exige", () => {
    assert.match(POST, /if \(f\.exige_whatsapp\) \{/);
  });

  test("el freno contesta «no podemos comprobarlo», no «has probado demasiadas veces»", () => {
    // Decir «demasiados intentos con este número» confirmaría que el número interesa a alguien.
    assert.match(POST, /status\(429\)[\s\S]{0,60}M\.whatsapp_caido/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("la respuesta no delata a nadie", () => {
  test("EXISTA O NO EL TELÉFONO, LA RESPUESTA ES LA MISMA", () => {
    // Si se distinguieran, la página sería un comprobador de qué teléfonos están en nuestra base.
    const cuerpo = sinComentarios(POST);
    assert.ok(!/previo\s*\?\s*res\./.test(cuerpo), "se contesta distinto si el teléfono ya existía");
    // Solo hay un `res.json({ ok: true` en toda la ruta: una única salida buena.
    assert.equal([...cuerpo.matchAll(/res\.json\(\{ ok: true/g)].length, 1);
  });

  test("la diferencia de nombre se ANOTA, no se contesta", () => {
    assert.match(POST, /avisoNombre = /);
    assert.match(POST, /nombre_distinto: avisoNombre/);
    assert.ok(!/error[\s\S]{0,40}avisoNombre/.test(POST), "la diferencia de nombre sale al cliente");
  });

  test("un formulario que no existe y uno cerrado dan LA MISMA respuesta", () => {
    // Distinguirlos diría qué claves de campaña existen.
    for (const r of [GET, POST]) {
      assert.match(r, /status\(404\)[\s\S]{0,90}Este formulario no está disponible/);
      assert.equal([...r.matchAll(/status\(404\)/g)].length, 1, "hay más de un 404 distinto");
    }
  });

  test("EL TELÉFONO NO SALE NI EN EL REGISTRO NI EN LA AUDITORÍA", () => {
    const cuerpo = sinComentarios(POST);
    // Los errores van por el mecanismo redactado de la casa, que nunca imprime el cuerpo.
    for (const m of cuerpo.matchAll(/console\.(log|error|warn)\(([^\n]*)/g)) {
      assert.match(m[2], /^lineaErrorSql\(/, `un registro imprime algo a pelo: ${m[2]}`);
      assert.ok(!/tel\b|telefono|b\.telefono/.test(m[2]), `el teléfono acaba en el registro: ${m[2]}`);
    }
    // Y lo que se audita es la campaña y la versión, no quién era.
    const audit = cuerpo.slice(cuerpo.indexOf('ficAuditar("fidelizacion", null, "alta_formulario"'));
    const detalle = audit.slice(0, audit.indexOf("}"));
    assert.ok(!/tel|nombre:|email|poblacion|nacimiento/.test(detalle), `la auditoría lleva datos: ${detalle}`);
  });

  test("la respuesta no devuelve el teléfono ni la fecha ni la población", () => {
    const salida = POST.slice(POST.indexOf("res.json({ ok: true"));
    for (const campo of ["telefono", "tel,", "nacimiento", "poblacion", "email"]) {
      assert.ok(!salida.includes(campo), `la respuesta devuelve ${campo}`);
    }
  });

  test("la página pública nunca se guarda en caché", () => {
    for (const r of [GET, POST]) assert.match(r, /res\.set\("Cache-Control", "no-store"\)/);
    // Y antes de la primera rama, para que también lo lleven los errores.
    assert.ok(POST.indexOf("no-store") < POST.indexOf("if ("));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("lo que se guarda", () => {
  test("EL CONSENTIMIENTO SE GUARDA CON SU TEXTO, SU VERSIÓN Y SU CAMPAÑA", () => {
    // Guardar «aceptó» sin guardar QUÉ aceptó no sirve el día que alguien pregunte, que es
    // justo el día que hace falta.
    assert.match(POST, /INSERT INTO fid_consentimientos \(telefono, formulario_clave, formulario_version, texto,\s*\n\s*acepta_comercial, origen, campana, creado_en\)/);
    assert.match(POST, /String\(f\.consentimiento_texto \|\| ""\)/);
    assert.match(POST, /f\.version/);
  });

  test("sin aceptar no se guarda nada", () => {
    assert.match(POST, /if \(b\.consentimiento !== true\) \{/);
    // Estrictamente `true`: `"false"`, `"no"`, `0` y `[]` no son un consentimiento.
    assert.ok(!/if \(!b\.consentimiento\)/.test(POST));
  });

  test("la fecha futura se rechaza EN EL SERVIDOR, no solo en el calendario", () => {
    // El `max` de un `<input type="date">` lo respeta el calendario, pero no impide mandar otra
    // cosa por debajo con dos líneas de consola.
    assert.match(POST, /fidFechaNac\(b\.nacimiento, \{ hoy: hoyISO\(\) \}\)/);
    assert.match(POST, /fn\.motivo === "futura" \? M\.fecha_futura/);
  });

  test("la población se guarda tal como la eligió o la escribió", () => {
    // El catálogo es curado, no el padrón: quien viva en un pueblo que no sale lo escribe a mano
    // y se guarda igual. Un desplegable cerrado dejaría gente fuera por vivir donde vive.
    assert.match(POST, /fidTexto\(b\.poblacion, 120\)/);
  });

  test("el teléfono se normaliza con la MISMA función que el resto de la casa", () => {
    // Dos formas de normalizar es como se acaba con un cliente que tiene dos saldos y dos carnés.
    assert.match(POST, /const tel = proTel9\(b\.telefono\);/);
  });

  test("un envío repetido no crea una segunda cuenta ni un segundo carné", () => {
    assert.match(POST, /SELECT id, nombre FROM leads WHERE telefono = \?/);
    assert.match(POST, /if \(!token\) \{/);
    assert.match(POST, /SELECT id, token FROM pro_qr WHERE clase = 'carnet' AND telefono = \?/);
  });

  test("y el carné se emite con la función de siempre, no con un camino nuevo", () => {
    // Un segundo sitio donde crear carnés es un segundo sitio donde equivocarse con la unicidad.
    assert.match(POST, /await proEmitir\(\{ clase: "carnet"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el formulario aguanta el maltrato de siempre", () => {
  test("no se puede mandar dos veces seguidas: el botón se bloquea y se vuelve a soltar", () => {
    // Bloquearlo y NO soltarlo es peor que no bloquearlo: deja a alguien mirando un botón muerto.
    assert.match(promoJs, /disabled = true/);
    assert.match(promoJs, /function fallo\(/);
    assert.match(promoJs, /disabled = false/);
  });

  test("hay freno de peticiones en las dos rutas públicas", () => {
    assert.match(GET, /pulsoRateLimit\(req, res, \d+\)/);
    assert.match(POST, /pulsoRateLimit\(req, res, \d+\)/);
  });

  test("la clave de campaña que llega se recorta: no se usa cruda en ningún sitio", () => {
    for (const r of [GET, POST]) assert.match(r, /String\(req\.params\.clave \|\| ""\)\.slice\(0, 40\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("las sugerencias de población no salen de la página", () => {
  test("el catálogo se sirve como fichero estático, no como una búsqueda por letra", () => {
    // Una ruta `?q=` recibiría cada pulsación y habría que decidir si se guarda. Un fichero no.
    assert.match(promoJs, /\/data\/municipios\.json/);
    assert.ok(!/\/api\/[a-z-]*(municipio|poblacion)/i.test(promoJs));
    // Y EL SERVIDOR NO TIENE NINGUNA RUTA PÚBLICA DE POBLACIONES. La que existe
    // —`/api/contactos/poblaciones`, que rellena un filtro del panel con las poblaciones ya
    // guardadas— pide sesión de Dirección o Marketing, y de la página pública no se llama.
    const publicas = [...server.matchAll(/app\.(get|post|put)\("([^"]+)",\s*(\w+)/g)]
      .filter((m) => m[3] !== "requireAuth").map((m) => m[2]);
    for (const r of publicas) assert.ok(!/municipio|poblacion/i.test(r), `ruta pública de poblaciones: ${r}`);
    assert.match(server, /app\.get\("\/api\/contactos\/poblaciones", requireAuth\(\["direccion", "marketing"\]\)/);
    assert.ok(!promoJs.includes("/api/contactos"), "la página pública llama a una ruta del panel");
    // Del módulo de municipios el servidor solo importa el validador de fechas, que es puro.
    assert.match(server, /import \{ fechaNacimientoValida as fidFechaNac \} from ".*municipios\.js";/);
  });

  test("y la vista configurable no llama a NINGÚN servicio de fuera", () => {
    // El píxel de Meta que hay en el fichero es del camino histórico y lo enciende Dirección
    // aparte; lo que no puede existir es una llamada saliente en el camino del formulario nuevo.
    const conf = sinComentarios(promoJs.slice(promoJs.indexOf("function pintarConfigurable")));
    assert.ok(!/https?:\/\//.test(conf), "la vista configurable llama a un host externo");
    // Solo se piden dos cosas, y las dos son de casa.
    const pedidos = [...conf.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)].map((m) => m[1]);
    for (const u of pedidos) assert.ok(u.startsWith("/"), `petición a ${u}`);
  });

  test("se puede usar con el teclado, y se anuncia como lo que es", () => {
    for (const a of ["role", "aria-expanded", "aria-activedescendant", "combobox", "listbox"]) {
      assert.ok(promoJs.includes(a), `falta ${a} en el desplegable de población`);
    }
    for (const t of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
      assert.ok(promoJs.includes(t), `falta la tecla ${t}`);
    }
  });

  test("y con el dedo: se elige en `mousedown`, antes de que el campo pierda el foco", () => {
    // Con `click` el campo se desenfoca primero, la lista se cierra y el toque cae en el vacío.
    assert.match(promoJs, /"mousedown"/);
  });

  test("solo se sugiere si la campaña lo pide", () => {
    assert.match(promoJs, /sugerir_poblacion/);
    assert.match(GET, /sugerir_poblacion: !!f\.sugerir_poblacion/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("la fecha de nacimiento en la página", () => {
  test("es el calendario nativo: en un móvil no hay nada mejor que el del sistema", () => {
    assert.match(promoJs, /type="date"/);
  });

  test("no deja elegir el futuro, y tampoco un año imposible", () => {
    assert.match(promoJs, /setAttribute\("max", new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)/);
    assert.match(promoJs, /setAttribute\("min", "19\d\d-01-01"\)/);
  });

  test("se ve en dd/mm/aaaa pase lo que pase con el idioma del navegador", () => {
    // El calendario nativo se pinta en el idioma del NAVEGADOR, no en el de la página: alguien con
    // el móvil en inglés vería `05/12/1990` y entendería el 5 de diciembre.
    assert.match(promoJs, /p\[2\] \+ "\/" \+ p\[1\] \+ "\/" \+ p\[0\]/);
  });

  test("la etiqueta está siempre visible, no es un marcador de posición", () => {
    // Un `placeholder` desaparece al escribir y deja el campo sin nombre para quien vuelve atrás.
    // La coloca `alta.css`, que es la hoja de la casa para los campos; reescribirla aparte habría
    // dejado dos maquetaciones distintas para el mismo formulario —y una de las dos sin mantener.
    const alta = readFileSync(new URL("../public/alta.css", import.meta.url), "utf8");
    assert.match(alta, /\.alta-campo label \{[^}]*display: block/);
    // Y por eso los campos que genera la página llevan ESA clase, no una paralela.
    const conf = promoJs.slice(promoJs.indexOf("function pintarConfigurable"));
    assert.ok(conf.includes('class="alta-campo"'), "los campos usan una clase sin maquetación");
    // El ancla de las sugerencias se añade encima, sin tocar el resto.
    assert.match(promoCss, /\.alta-campo \{ position: relative; \}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("no se toca nada que ya funcionaba", () => {
  test("EL CAMINO HISTÓRICO DE /promo.html SIGUE INTACTO", () => {
    // Las campañas de antes no tienen versión publicada en `fid_formularios`: si este camino se
    // rompiera, se caerían todas a la vez y sin aviso.
    assert.match(promoJs, /function arrancarCampanaClasica\(/);
    assert.match(promoJs, /\/api\/captacion\/campana/);
    // Y el HTML que usa ese camino sigue teniendo sus campos.
    for (const id of ["pmNombre", "pmTelefono", "pmF"]) {
      assert.ok(promoHtml.includes(id), `falta ${id} en promo.html`);
    }
  });

  test("la vista configurable solo se usa si hay versión publicada", () => {
    assert.match(promoJs, /pintarConfigurable\(/);
    assert.match(promoJs, /arrancarCampanaClasica\(\)/);
  });

  test("las rutas de captación de siempre siguen ahí", () => {
    for (const r of ['app.get("/api/captacion/campana', 'app.post("/api/captacion"',
                     'app.get("/api/captacion/estado']) {
      assert.ok(server.includes(r), `ha desaparecido ${r}`);
    }
  });

  test("ninguna migración del formulario borra ni vacía nada", () => {
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    const sql = sinComentarios(esquema);
    for (const peligro of ["DROP TABLE", "DROP COLUMN", "DELETE FROM", "TRUNCATE"]) {
      assert.ok(!sql.includes(peligro), `el esquema contiene ${peligro}`);
    }
    // Las columnas nuevas son aditivas y con valor por defecto.
    assert.match(esquema, /ALTER TABLE fid_formularios ADD COLUMN IF NOT EXISTS \$\{col\}/);
    const bucle = esquema.slice(esquema.indexOf('for (const col of ["idioma'),
                                esquema.indexOf('ALTER TABLE fid_formularios ADD COLUMN'));
    for (const c of ["idioma", "destacado", "mensajes", "exige_whatsapp", "sugerir_poblacion"]) {
      assert.ok(bucle.includes(`"${c} `), `${c} no se añade de forma aditiva`);
    }
    // Y todas nacen con valor por defecto: una fila vieja no se queda a medias.
    for (const d of ["DEFAULT 'es'", "DEFAULT '{}'", "DEFAULT FALSE"]) assert.ok(bucle.includes(d), d);
  });

  test("Y EL PROGRAMA DE PUNTOS SIGUE APAGADO: esto no lo enciende", () => {
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.match(esquema, /VALUES \(1, 'no_preparado', \?\)/);
    // El alta pública no concede, ni ofrece, ni consume un solo punto.
    for (const p of ["fid_movimientos", "aplicarPrograma", "conceder", "puntos"]) {
      assert.ok(!POST.includes(p), `el alta pública toca ${p}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("todo se configura desde el panel", () => {
  test("cada cosa que pidió Dirección tiene su casilla", () => {
    for (const id of ["ffIdioma", "ffTitulo", "ffSub", "ffDestacado", "ffBoton", "ffExito",
                      "ffConsent", "ffPriv", "ffWA", "ffPob", "ffMsgs"]) {
      assert.ok(app.includes(id), `falta la casilla ${id} en el panel`);
    }
  });

  test("los campos visibles y obligatorios se eligen uno a uno", () => {
    assert.match(app, /fcV_\$\{id\}/);
    assert.match(app, /fcO_\$\{id\}/);
    // Y están los que pide la campaña de Girona.
    for (const c of ["nombre", "apellidos", "nacimiento", "poblacion", "telefono", "email"]) {
      assert.ok(app.includes(`"${c}"`), `el panel no ofrece el campo ${c}`);
      assert.ok(CAMPOS[c], `el servidor no conoce el campo ${c}`);
    }
  });

  test("el teléfono NO se puede quitar ni hacer opcional desde el panel", () => {
    // Es la cuenta del cliente: sin él no hay ni alta ni beneficio que mandar.
    assert.match(app, /const forzoso = id === "nombre" \|\| id === "telefono";/);
    assert.match(app, /\$\{forzoso \? " disabled" : ""\}/);
    const campos = normalizarCampos([{ id: "telefono", visible: false, obligatorio: false }]);
    const tel = campos.find((c) => c.id === "telefono");
    assert.equal(tel.visible, true, "se ha podido esconder el teléfono");
    assert.equal(tel.obligatorio, true, "se ha podido hacer opcional el teléfono");
  });

  test("«acepta ofertas» nunca puede nacer marcado ni ser obligatorio", () => {
    const c = normalizarCampos([{ id: "comercial", visible: true, obligatorio: true }])
      .find((x) => x.id === "comercial");
    assert.equal(c.obligatorio, false, "se ha podido obligar a aceptar comunicaciones");
  });

  test("PUBLICAR ES OTRO BOTÓN, y una versión publicada no se edita: se copia", () => {
    assert.match(app, /data-act="fidg-form-guardar" data-pub="0">Guardar borrador/);
    assert.match(app, /data-act="fidg-form-guardar" data-pub="1">Publicar…/);
    assert.match(app, /avisoCopia\(guardada && guardada\.estado === "publicado" \? guardada\.version : null\)/);
    // Y en el servidor cada guardado es una versión nueva, con cerrojo para que no se repita.
    const crear = ruta('app.post("/api/fidelizacion/formularios"');
    assert.match(crear, /pg_advisory_xact_lock/);
    assert.match(crear, /COALESCE\(MAX\(version\), 0\) AS v FROM fid_formularios WHERE clave = \?/);
    assert.match(crear, /Number\(ult\?\.v \|\| 0\) \+ 1/);
    assert.match(crear, /UPDATE fid_formularios SET estado = 'cerrado' WHERE clave = \? AND estado = 'publicado'/);
  });

  test("no se publica sin consentimiento ni política de privacidad", () => {
    const crear = ruta('app.post("/api/fidelizacion/formularios"');
    assert.match(crear, /if \(cfg\.estado === "publicado" && !check\.ok\)/);
  });

  test("hay vista previa a 390 y a escritorio, y NO guarda nada", () => {
    assert.match(app, /data-act="fidg-form-prev" data-v="movil"/);
    assert.match(app, /data-act="fidg-form-prev" data-v="escritorio"/);
    assert.match(app, /const ancho = vista === "movil" \? 390 : 900;/);
    assert.match(app, /no se ha guardado nada/);
  });

  test("cambiar el idioma reescribe los respaldos de los mensajes", () => {
    assert.match(app, /function fidgFormIdioma\(\)/);
    assert.match(app, /getElementById\("ffIdioma"\)\?\.addEventListener\("change", fidgFormIdioma\)/);
  });
});
