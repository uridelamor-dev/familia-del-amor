// EL PÍXEL DE META Y EL CONSENTIMIENTO.
//
// ── QUÉ SE BLINDA AQUÍ, Y POR QUÉ NO BASTA CON LEER EL CÓDIGO ────────────────────────────────
//
// Lo que hay que demostrar es UN NEGATIVO: que sin permiso NO SE CARGA NADA de Meta. Eso leyendo
// el fichero no se sabe — se sabe ejecutándolo y mirando qué `<script>` intentó añadir y qué
// llamadas hizo a `fbq`.
//
// Por eso este fichero monta un navegador de mentira —`document`, `window`, `localStorage`,
// `fetch`— y EJECUTA `consentimiento.js` y `meta.js` tal y como están en disco. No hay copias de
// la lógica: si alguien cambia esos ficheros, estos tests los ejecutan cambiados.
//
// Los dos consentimientos son distintos y se comprueba que siguen distintos: el de los formularios
// permite escribirle a alguien por WhatsApp; este permite guardar cosas en su navegador y ceder su
// navegación a un tercero. Un «sí» a uno no es un «sí» al otro.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PIXEL_POR_DEFECTO, VERSION_CONSENTIMIENTO, CLAVE_CONSENTIMIENTO,
  pixelValido, pixelEfectivo, leerDecision, debeCargarMeta,
  PAGINAS_CON_META, PAGINAS_SIN_META, PAGINAS_SOLO_CONSENTIMIENTO,
} from "../src/modules/marketing/meta.js";

const raiz = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const consentJs = raiz("public/js/consentimiento.js");
const metaJs = raiz("public/js/meta.js");
const promoJs = raiz("public/promo.js");
const server = raiz("server.js");
const panel = raiz("public/panel/app.js");

/** El texto de un HTML con los saltos de línea colapsados. Las frases de la política vienen
 *  partidas en varias líneas, así que buscarlas tal cual falla por un salto de línea y no por
 *  lo que dicen. Es el mismo apaño que usa `politica.test.js`. */
const plano = (f) => raiz(f).replace(/\s+/g, " ");

/** Sin comentarios. Las comprobaciones de «esto NO aparece» tienen que mirar el código: estos
 *  ficheros explican en sus comentarios justo lo que se está prohibiendo. */
const soloCodigo = (f) => f
  .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL NAVEGADOR DE MENTIRA
//
// Lo justo para que los dos ficheros corran: elementos que recuerdan qué se les puso, un almacén
// que se puede hacer fallar, y un `fetch` que contesta lo que le digamos.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function navegador({ decision = null, pixel = PIXEL_POR_DEFECTO, activo = true,
                     version = VERSION_CONSENTIMIENTO, almacenRoto = false,
                     lang = "es", conMeta = true, controlEnHtml = false,
                     respuesta = undefined } = {}) {
  const creados = [];
  const almacen = new Map();
  if (decision) {
    almacen.set(CLAVE_CONSENTIMIENTO, JSON.stringify({ v: version, d: decision, t: "2026-09-18" }));
  }

  const nodo = (etiqueta) => {
    const el = {
      tagName: String(etiqueta || "").toUpperCase(),
      hijos: [], atributos: {}, oyentes: {}, clases: new Set(),
      style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
      className: "", type: "", href: "", src: "", async: false,
      // El aviso se repinta al cambiar el idioma, y lo primero que hace es vaciarse con
      // `textContent = ""`. Si aquí fuera una propiedad normal, los hijos se quedarían y el
      // test vería el texto viejo y el nuevo a la vez.
      _texto: "",
      get textContent() { return this._texto; },
      set textContent(v) { this._texto = String(v); this.hijos = []; },
      get offsetHeight() { return 64; },
      get classList() {
        const c = this.clases;
        return { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x) };
      },
      appendChild(h) { this.hijos.push(h); h.parentNode = this; return h; },
      removeChild(h) { this.hijos = this.hijos.filter((x) => x !== h); h.parentNode = null; return h; },
      insertBefore(h) { this.hijos.push(h); h.parentNode = this; return h; },
      setAttribute(k, v) { this.atributos[k] = String(v); },
      getAttribute(k) { return this.atributos[k] ?? null; },
      addEventListener(t, f) { (this.oyentes[t] = this.oyentes[t] || []).push(f); },
      pulsar() { (this.oyentes.click || []).forEach((f) => f({ preventDefault() {} })); },
      todos() { return this.hijos.flatMap((h) => [h, ...h.todos()]); },
    };
    return el;
  };

  const head = nodo("head"), body = nodo("body"), html = nodo("html");
  html.setAttribute("lang", lang);

  // El control que algunas páginas traen en su pie.
  const controlHtml = controlEnHtml ? nodo("button") : null;
  if (controlHtml) { controlHtml.setAttribute("data-cookies", ""); body.appendChild(controlHtml); }

  const documento = {
    readyState: "complete",
    head, body, documentElement: html,
    createElement(t) { const el = nodo(t); creados.push(el); return el; },
    createTextNode(t) { const n = { texto: String(t), todos: () => [] }; return n; },
    querySelectorAll(sel) { return sel === "[data-cookies]" && controlHtml ? [controlHtml] : []; },
    /** Solo se consulta una cosa: si la página carga Meta. */
    querySelector(sel) { return sel.includes("/js/meta.js") && conMeta ? nodo("script") : null; },
    getElementsByTagName() { return []; },
    addEventListener() {},
  };

  class ObservadorFalso {
    constructor(fn) { this.fn = fn; ventana.__observadores.push(this); }
    observe() {}
  }

  const ventana = {
    document: documento,
    location: { reload() { ventana.recargado = true; } },
    recargado: false,
    __observadores: [],
    MutationObserver: ObservadorFalso,
    addEventListener() {},
    localStorage: {
      getItem(k) { if (almacenRoto) throw new Error("bloqueado"); return almacen.get(k) ?? null; },
      setItem(k, v) { if (almacenRoto) throw new Error("bloqueado"); almacen.set(k, String(v)); },
      removeItem(k) { almacen.delete(k); },
    },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(respuesta !== undefined
        ? respuesta
        : { ok: true, pixel, activo, version_consentimiento: VERSION_CONSENTIMIENTO }),
    }),
  };

  /** Lo que de verdad importa: qué se ha ido a pedir a Meta y qué se le ha dicho. */
  const espia = {
    get scripts() { return creados.filter((e) => e.tagName === "SCRIPT").map((e) => e.src); },
    get pidioSdk() { return this.scripts.some((s) => String(s).includes("fbevents.js")); },
    // `meta.js` crea el `fbq` de Meta, que encola todo hasta que llega el SDK real. Aquí el SDK
    // real NUNCA llega, así que la cola ES el registro completo de lo que se le ha dicho.
    get llamadas() {
      return ventana.fbq ? Array.from(ventana.fbq.queue || []).map((a) => Array.from(a)) : [];
    },
    get inits() { return this.llamadas.filter((l) => l[0] === "init"); },
    get eventos() { return this.llamadas.filter((l) => l[0] === "track").map((l) => l[1]); },
    almacen, ventana, documento, html, controlHtml,
    get aviso() { return body.hijos.find((h) => h.className === "ck") || null; },
    /** El control de preferencias, venga del HTML o creado por el propio fichero. */
    get control() {
      return body.hijos.find((h) => h.getAttribute && h.getAttribute("data-cookies") !== null) || null;
    },
    /** El texto del aviso, recompuesto como lo leería una persona. */
    get texto() {
      const a = this.aviso;
      if (!a) return "";
      const pega = (n) => (n.texto !== undefined ? n.texto : "")
        + (n.hijos || []).map(pega).join("") + (n.hijos ? "" : "");
      const parrafo = a.todos().find((x) => x.className === "ck-txt");
      if (!parrafo) return "";
      return parrafo.hijos.map((n) => n.texto !== undefined ? n.texto : n.textContent).join("");
    },
    get enlace() {
      const a = this.aviso;
      return a ? (a.todos().find((x) => x.tagName === "A") || null) : null;
    },
    get botones() {
      const a = this.aviso;
      return a ? a.todos().filter((x) => x.tagName === "BUTTON").map((x) => x.textContent) : [];
    },
    boton(texto) {
      const a = this.aviso;
      return a ? a.todos().find((e) => e.tagName === "BUTTON" && e.textContent === texto) : null;
    },
    /** Cambia el idioma como lo haría `app.js`, `promo.js` o `local.js`. */
    cambiarIdioma(l) {
      html.setAttribute("lang", l);
      ventana.__observadores.forEach((o) => o.fn());
    },
  };
  return espia;
}

/** Ejecuta un fichero de navegador dentro del entorno de mentira. */
function correr(fuente, espia) {
  const v = espia.ventana;
  const fn = new Function("window", "document", "localStorage", "fetch", "self", "globalThis",
    `"use strict";\n${fuente}`);
  fn(v, v.document, v.localStorage, v.fetch, v, v);
}

/** Monta la página entera: el consentimiento primero y Meta después, como en los HTML. */
async function pagina(opciones = {}) {
  const e = navegador(opciones);
  correr(consentJs, e);
  correr(metaJs, e);
  await new Promise((r) => setTimeout(r, 0));   // que resuelva el `fetch` del identificador
  await new Promise((r) => setTimeout(r, 0));
  return e;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("SIN PERMISO NO SE CARGA NADA DE META", () => {
  test("sin decisión: ni se pide el archivo de Meta", async () => {
    // Bajar `fbevents.js` YA es una llamada a un servidor de Meta con la IP de quien visita. El
    // permiso tiene que ser PREVIO a eso, no previo a mandar el primer evento.
    const e = await pagina({ decision: null });
    assert.equal(e.pidioSdk, false, "se ha pedido fbevents.js sin consentimiento");
    assert.equal(e.ventana.fbq, undefined, "se ha creado `fbq` sin consentimiento");
  });

  test("con rechazo: tampoco", async () => {
    const e = await pagina({ decision: "rechazado" });
    assert.equal(e.pidioSdk, false, "se ha pedido fbevents.js con el permiso denegado");
    assert.equal(e.ventana.fbq, undefined);
  });

  test("y sin decisión se PREGUNTA, con los dos botones a la vista", async () => {
    const e = await pagina({ decision: null });
    assert.ok(e.aviso, "no sale el aviso");
    assert.ok(e.boton("Aceptar"), "falta «Aceptar»");
    assert.ok(e.boton("Rechazar"), "falta «Rechazar»");
    // RECHAZAR SIN SEGUNDA PANTALLA: el botón está en el primer aviso, no detrás de «Configurar».
    assert.ok(!e.aviso.todos().some((x) => /configur|preferenc|opcion/i.test(x.textContent || "")),
      "rechazar exige entrar en otra pantalla");
  });

  test("con una decisión guardada NO se molesta a nadie", async () => {
    for (const d of ["aceptado", "rechazado"]) {
      const e = await pagina({ decision: d });
      assert.equal(e.aviso, null, `el aviso vuelve a salir con «${d}» guardado`);
    }
  });

  test("si el texto legal cambia, el «sí» antiguo deja de valer", async () => {
    // Un consentimiento es a un texto concreto. Si cambia la finalidad o el tercero, se pregunta
    // otra vez — por eso la versión se guarda junto a la decisión.
    const e = await pagina({ decision: "aceptado", version: VERSION_CONSENTIMIENTO - 1 });
    assert.ok(e.aviso, "no se vuelve a preguntar tras cambiar el texto");
    assert.equal(e.pidioSdk, false, "se carga Meta con un consentimiento de otra versión");
  });

  test("con el almacenamiento bloqueado se cae del lado seguro", async () => {
    // Navegación privada, cookies bloqueadas o dentro de un iframe: `localStorage` LANZA. Sin
    // poder leer la decisión, no hay decisión — y sin decisión no se carga nada.
    const e = await pagina({ decision: "aceptado", almacenRoto: true });
    assert.equal(e.pidioSdk, false, "carga Meta cuando no puede leer el permiso");
    assert.ok(e.aviso, "no pregunta cuando no puede leer el permiso");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("CON PERMISO SÍ, Y UNA SOLA VEZ", () => {
  test("se carga el SDK y se manda PageView", async () => {
    const e = await pagina({ decision: "aceptado" });
    assert.equal(e.pidioSdk, true, "no se ha pedido fbevents.js");
    assert.deepEqual(e.inits.map((l) => l[1]), [PIXEL_POR_DEFECTO]);
    assert.deepEqual(e.eventos, ["PageView"]);
  });

  test("PAGEVIEW UNA SOLA VEZ, y el píxel se inicializa UNA sola vez", async () => {
    // Inicializar dos veces el mismo píxel duplica las visitas de una campaña y no da ningún
    // error. `arrancar()` se llama al responder el servidor Y al cambiar el consentimiento.
    const e = await pagina({ decision: "aceptado" });
    assert.equal(e.inits.length, 1, "el píxel se inicializa más de una vez");
    assert.equal(e.eventos.filter((x) => x === "PageView").length, 1, "PageView se manda más de una vez");
  });

  test("aceptar DESPUÉS arranca Meta sin recargar", async () => {
    const e = await pagina({ decision: null });
    assert.equal(e.pidioSdk, false);
    e.boton("Aceptar").pulsar();
    assert.equal(e.ventana.fdaConsent.estado(), "aceptado");
    assert.equal(e.pidioSdk, true, "aceptar no arranca Meta");
    assert.equal(e.aviso, null, "el aviso no se cierra al decidir");
  });

  test("sin píxel configurado no se carga nada, aunque haya permiso", async () => {
    const e = await pagina({ decision: "aceptado", activo: false });
    assert.equal(e.pidioSdk, false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("LOS EVENTOS DE NEGOCIO", () => {
  test("con permiso, un alta manda Lead", async () => {
    const e = await pagina({ decision: "aceptado" });
    assert.equal(e.ventana.fdaMeta.evento("Lead"), true);
    assert.deepEqual(e.eventos, ["PageView", "Lead"], "el alta no manda Lead");
  });

  test("CON RECHAZO, un alta NO manda nada", async () => {
    const e = await pagina({ decision: "rechazado" });
    assert.equal(e.ventana.fdaMeta.evento("Lead"), false);
    assert.equal(e.pidioSdk, false, "un evento ha cargado Meta con el permiso denegado");
    assert.equal(e.ventana.fbq, undefined);
  });

  test("sin decisión tampoco, y lo pendiente solo sale si llega el permiso", async () => {
    const e = await pagina({ decision: null });
    assert.equal(e.ventana.fdaMeta.evento("Lead"), false);
    assert.equal(e.pidioSdk, false);
    // Si acaba rechazando, ese Lead no sale nunca.
    e.boton("Rechazar").pulsar();
    assert.equal(e.pidioSdk, false, "un evento guardado se ha mandado tras rechazar");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("CAMBIAR DE OPINIÓN", () => {
  test("hay una forma permanente de reabrirlo", async () => {
    const e = await pagina({ decision: "rechazado" });
    assert.equal(e.aviso, null);
    e.ventana.fdaConsent.abrir();
    assert.ok(e.aviso, "no se puede volver a abrir el aviso");
    // Y no hace falta borrar el almacenamiento: los HTML llevan un enlace con `data-cookies`.
    assert.match(consentJs, /\[data-cookies\]/);
    assert.match(raiz("public/index.html"), /data-cookies/);
    assert.match(raiz("public/privacidad.html"), /data-cookies/);
  });

  test("de rechazo a aceptación: arranca", async () => {
    const e = await pagina({ decision: "rechazado" });
    e.ventana.fdaConsent.abrir();
    e.boton("Aceptar").pulsar();
    assert.equal(e.pidioSdk, true);
    assert.equal(JSON.parse(e.almacen.get(CLAVE_CONSENTIMIENTO)).d, "aceptado");
  });

  test("de aceptación a rechazo: se recarga para que no quede nada corriendo", async () => {
    // Quitar el permiso no descarga de la memoria un script ya cargado. Recargar es la única
    // forma honesta de que «he dicho que no» signifique que no sale ni un aviso más.
    const e = await pagina({ decision: "aceptado" });
    assert.equal(e.pidioSdk, true);
    e.ventana.fdaConsent.abrir();
    e.boton("Rechazar").pulsar();
    assert.equal(e.ventana.recargado, true, "no se recarga al revocar con Meta ya cargado");
    assert.equal(JSON.parse(e.almacen.get(CLAVE_CONSENTIMIENTO)).d, "rechazado");
  });

  test("se guarda la decisión, la fecha y la versión del texto. Y nada más", async () => {
    const e = await pagina({ decision: null });
    e.boton("Aceptar").pulsar();
    const g = JSON.parse(e.almacen.get(CLAVE_CONSENTIMIENTO));
    assert.deepEqual(Object.keys(g).sort(), ["d", "t", "v"]);
    assert.equal(g.v, VERSION_CONSENTIMIENTO);
    assert.equal(g.d, "aceptado");
    assert.ok(g.t, "no consta cuándo se decidió");
  });

  test("y NO se manda al servidor: no hay a quién asociarla", async () => {
    // Registrar la preferencia en la base exigiría identificar a quien visita, que es justo lo
    // contrario de lo que pide quien la rechaza. Para respetar una preferencia basta respetarla.
    const codigo = soloCodigo(consentJs);
    assert.ok(!/fetch\s*\(/.test(codigo), "el consentimiento habla con el servidor");
    assert.ok(!/XMLHttpRequest|navigator\.sendBeacon/.test(codigo));
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("UNA SOLA FUENTE, Y UNA SOLA INSTALACIÓN", () => {
  test("`meta.js` es el ÚNICO sitio que carga el SDK y llama a `fbq`", () => {
    for (const [f, fuente] of [["promo.js", promoJs], ["public/app.js", raiz("public/app.js")],
                               ["alta.js", raiz("public/alta.js")]]) {
      const codigo = fuente.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "").replace(/^[ \t]*\/\/.*$/gm, "");
      assert.ok(!codigo.includes("fbevents"), `${f} instala Meta por su cuenta`);
      assert.ok(!/window\.fbq\s*=/.test(codigo), `${f} crea \`fbq\``);
    }
    assert.match(metaJs, /connect\.facebook\.net\/en_US\/fbevents\.js/);
  });

  test("el identificador NO está escrito en ningún HTML ni en el JavaScript público", () => {
    // La regla de «una sola fuente»: el número vive en `config` y, de reserva, en UN módulo.
    for (const f of ["public/index.html", "public/promo.html", "public/alta.html",
                     "public/js/meta.js", "public/js/consentimiento.js", "public/promo.js",
                     "public/app.js"]) {
      assert.ok(!raiz(f).includes(PIXEL_POR_DEFECTO), `${f} lleva el píxel escrito a mano`);
    }
    // Y en el servidor tampoco: sale del módulo.
    assert.ok(!server.includes(PIXEL_POR_DEFECTO), "server.js lleva el píxel escrito a mano");
  });

  test("el píxel sale de `config.meta_pixel_id`", () => {
    assert.match(server, /metaPixelEfectivo\(await getConfig\("meta_pixel_id"\)\)/);
    assert.match(server, /app\.get\("\/api\/publico\/meta"/);
  });

  test("y la ruta antigua sigue escribiendo EN EL MISMO SITIO", () => {
    // No hay dos configuraciones: hay dos puertas a la misma. Una pestaña vieja del panel tiene
    // que seguir funcionando sin crear un segundo valor.
    const vieja = server.slice(server.indexOf('app.post("/api/captacion/pixel"'));
    assert.match(vieja.slice(0, 600), /setConfig\("meta_pixel_id"/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("DÓNDE SE INSTALA Y DÓNDE NO", () => {
  const tiene = (f, s) => raiz("public/" + f).includes(s);

  test("las páginas comerciales llevan Meta y el consentimiento", () => {
    for (const f of PAGINAS_CON_META) {
      assert.ok(tiene(f, "/js/meta.js"), `${f} no lleva Meta`);
      assert.ok(tiene(f, "/js/consentimiento.js"), `${f} no lleva el consentimiento`);
    }
  });

  test("EL CONSENTIMIENTO VA ANTES QUE META, siempre", () => {
    // Meta le pregunta al consentimiento nada más arrancar. Al revés, no encontraría a nadie a
    // quien preguntar y se quedaría esperando un cambio que ya había ocurrido.
    for (const f of PAGINAS_CON_META) {
      const s = raiz("public/" + f);
      assert.ok(s.indexOf("/js/consentimiento.js") < s.indexOf("/js/meta.js"),
        `en ${f} Meta se carga antes que el consentimiento`);
    }
  });

  test("LAS PÁGINAS PRIVADAS Y LAS LEGALES NO LLEVAN META", () => {
    for (const f of Object.keys(PAGINAS_SIN_META)) {
      assert.ok(!tiene(f, "/js/meta.js"), `${f} lleva Meta y no debería: ${PAGINAS_SIN_META[f]}`);
    }
  });

  test("las legales SÍ llevan el gestor, para poder cambiar de opinión ahí mismo", () => {
    for (const f of PAGINAS_SOLO_CONSENTIMIENTO) {
      assert.ok(tiene(f, "/js/consentimiento.js"), `${f} no deja cambiar de opinión`);
      assert.ok(!tiene(f, "/js/meta.js"), `${f} mide a quien viene a leer la política`);
    }
  });

  test("ni el panel ni los kioscos", () => {
    for (const f of ["panel/index.html", "fichar.html", "pulso.html", "login.html"]) {
      assert.ok(!tiene(f, "/js/meta.js"), `${f} lleva Meta`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("LA CAMPAÑA CLÁSICA SIGUE FUNCIONANDO, Y LA CONFIGURABLE YA TAMBIÉN", () => {
  test("LA REGRESIÓN, ARREGLADA: el formulario configurable manda Lead", () => {
    // Al migrar del formulario clásico al configurable se perdió el evento: `cargarPixel` y el
    // `Lead` vivían SOLO en el camino clásico. Estos formularios llevaban meses sin reportar ni
    // una conversión, en silencio.
    const configurable = promoJs.slice(
      promoJs.indexOf('fetch("/api/publico/formulario/" + encodeURIComponent(CLAVE)'),
      promoJs.indexOf('var urlCampana'));
    assert.ok(configurable.length > 200, "no se encuentra el envío del formulario configurable");
    assert.match(configurable, /meta\("Lead"\)/, "el formulario configurable sigue sin mandar Lead");
  });

  test("y el camino clásico lo sigue mandando", () => {
    const clasico = promoJs.slice(promoJs.indexOf('fetch("/api/captacion"'),
                                  promoJs.indexOf("function pintarConsentimiento"));
    assert.match(clasico, /meta\("Lead"\)/, "la campaña clásica ha dejado de mandar Lead");
  });

  test("los dos pasan por el MISMO cargador, no por una instalación propia", () => {
    assert.match(promoJs, /function meta\(nombre\) \{\s*if \(window\.fdaMeta\) window\.fdaMeta\.evento\(nombre\);/);
    assert.ok(!soloCodigo(promoJs).includes("cargarPixel("), "sigue habiendo una instalación paralela");
  });

  test("no se ha tocado nada más de la captación", () => {
    // El alta, el tarro para robots, las UTM y el sondeo del estado siguen igual.
    for (const trozo of ['fetch("/api/captacion"', "pmWeb", "utm()", "sondear"]) {
      assert.ok(promoJs.includes(trozo), `ha desaparecido «${trozo}» de la captación`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("EL PANEL: un solo campo para un solo valor", () => {
  test("se configura en Marketing → Web", () => {
    assert.match(panel, /function renderMetaPixel\(\)/);
    assert.match(panel.slice(panel.indexOf("function renderWeb()"), panel.indexOf("function renderMetaPixel()")), /\$\{renderMetaPixel\(\)\}/);
    assert.match(panel, /apiSend\("POST", "\/api\/marketing\/meta"/);
  });

  test("y en Captación solo queda el aviso de dónde está", () => {
    assert.ok(!panel.includes('data-act="cap-pixel"'), "sigue habiendo un segundo editor");
    assert.ok(!panel.includes("async function capPixel("), "queda el editor viejo");
    assert.match(panel, /Se configura en <b>Marketing → Web<\/b>/);
  });

  test("solo dirección puede cambiarlo", () => {
    const ruta = server.slice(server.indexOf('app.post("/api/marketing/meta"'));
    assert.match(ruta.slice(0, 200), /requireAuth\(\["direccion"\]\)/);
    assert.match(panel, /if \(USER\.rol !== "direccion"\) return "";/);
  });

  test("y queda constancia de quién lo cambió", () => {
    const ruta = server.slice(server.indexOf('app.post("/api/marketing/meta"'));
    assert.match(ruta.slice(0, 900), /ficAuditar\("marketing", null, "meta_pixel"/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("el módulo puro", () => {
  test("un píxel son entre 6 y 20 dígitos", () => {
    assert.equal(pixelValido("2277417329492563"), "2277417329492563");
    assert.equal(pixelValido(" 227 741 7329492563 "), "2277417329492563");
    assert.equal(pixelValido("12345"), null);
    assert.equal(pixelValido("abc"), null);
    assert.equal(pixelValido(""), null);
    assert.equal(pixelValido(null), null);
    assert.equal(pixelValido("1".repeat(21)), null);
  });

  test("sin configurar se usa el de la casa", () => {
    assert.equal(pixelEfectivo(""), PIXEL_POR_DEFECTO);
    assert.equal(pixelEfectivo(null), PIXEL_POR_DEFECTO);
    assert.equal(pixelEfectivo("9998887776665"), "9998887776665");
  });

  test("ante la duda, NO hay decisión", () => {
    assert.equal(leerDecision(null), null);
    assert.equal(leerDecision("{roto"), null);
    assert.equal(leerDecision(JSON.stringify({ v: 999, d: "aceptado" })), null);
    assert.equal(leerDecision(JSON.stringify({ v: VERSION_CONSENTIMIENTO, d: "quizá" })), null);
    assert.equal(leerDecision(JSON.stringify({ v: VERSION_CONSENTIMIENTO, d: "aceptado" })), "aceptado");
  });

  test("hace falta TODO para cargar", () => {
    assert.equal(debeCargarMeta({ decision: "aceptado", pixel: PIXEL_POR_DEFECTO }), true);
    assert.equal(debeCargarMeta({ decision: "rechazado", pixel: PIXEL_POR_DEFECTO }), false);
    assert.equal(debeCargarMeta({ decision: null, pixel: PIXEL_POR_DEFECTO }), false);
    assert.equal(debeCargarMeta({ decision: "aceptado", pixel: "" }), false);
  });

  test("la versión del navegador y la del módulo no pueden separarse", () => {
    assert.match(consentJs, new RegExp(`var VERSION = ${VERSION_CONSENTIMIENTO};`));
    assert.match(consentJs, new RegExp(`var CLAVE = "${CLAVE_CONSENTIMIENTO}";`));
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("LOS DOS CONSENTIMIENTOS SIGUEN SEPARADOS", () => {
  test("el de WhatsApp no toca el de cookies, ni al revés", () => {
    // El del formulario permite ESCRIBIRLE a alguien y viaja con su lead. Este permite guardar
    // cosas en su navegador. Alguien puede aceptar uno y rechazar el otro.
    assert.ok(!consentJs.includes("whatsapp") && !consentJs.includes("consentimiento_texto"));
    assert.ok(!metaJs.includes("consentimiento_texto"));
    // Y el alta sigue exigiendo el suyo, esté como esté el de cookies.
    assert.match(server, /if \(b\.consentimiento !== true\)/);
  });

  test("la política explica los dos, y que son INDEPENDIENTES", () => {
    for (const [f, ancla] of [["public/privacidad.html", "cookies"],
                              ["public/privacitat.html", "galetes"]]) {
      const s = plano(f);
      assert.match(raiz(f), new RegExp(`id="${ancla}"`), `${f} no habla de cookies`);
      assert.ok(/dos consentimientos independientes|dos consentiments independents/.test(s),
        `${f} no aclara que son dos permisos independientes`);
      assert.ok(/por separado|per separat/.test(s), `${f} no dice que se piden por separado`);
      assert.ok(/WhatsApp/.test(s), `${f} no dice de qué otro permiso se distingue`);
    }
  });

  test("y dice QUIÉN es el tercero, con su información oficial a un clic", () => {
    for (const f of ["public/privacidad.html", "public/privacitat.html"]) {
      const s = raiz(f);
      assert.match(s, /Meta Platforms Ireland Limited/, `${f} no nombra al proveedor`);
      assert.match(s, /https:\/\/www\.facebook\.com\/privacy\/policy\//,
        `${f} no enlaza la información de privacidad de Meta`);
      assert.match(s, /rel="noopener noreferrer"/);
    }
  });

  test("y dice EXACTAMENTE qué no se envía sin permiso", () => {
    // Nombrar los eventos —los nuestros, no los de Meta— es lo que convierte «no enviamos nada»
    // en una afirmación comprobable.
    for (const f of ["public/privacidad.html", "public/privacitat.html"]) {
      const s = plano(f);
      assert.match(s, /PageView/, `${f} no dice qué visita no se manda`);
      assert.match(s, /Lead/, `${f} no dice qué alta no se manda`);
      assert.ok(/no es carrega abans|no se carga antes/.test(s),
        `${f} no dice que el píxel no se carga antes del consentimiento`);
    }
  });

  test("y dónde NO se usa: zonas privadas y pantallas internas", () => {
    for (const f of ["public/privacidad.html", "public/privacitat.html"]) {
      const s = plano(f);
      assert.ok(/pantalla interna de gestión|pantalla interna de gestió/.test(s),
        `${f} no dice que las pantallas internas no llevan píxel`);
      assert.ok(/tu tarjeta|la teva targeta/.test(s), `${f} no menciona la zona privada`);
    }
  });

  test("NO se afirma nada que no podamos respaldar", () => {
    // Duración de las cookies, transferencias internacionales, garantías, corresponsabilidad o
    // plazos de conservación en Meta: todo eso necesita documentación y asesoría. Mientras no la
    // haya, el texto se queda corto ANTES que inventado.
    for (const f of ["public/privacidad.html", "public/privacitat.html"]) {
      const s = raiz(f);
      const seccion = s.slice(s.indexOf("Cookies y medición") >= 0
        ? s.indexOf("Cookies y medición") : s.indexOf("Galetes i mesurament"),
        s.indexOf('id="destinataris"'));
      for (const invento of [/_fbp/, /_fbc/, /\bd[ií]as\b/, /\bmeses\b/, /transferencia/i,
                             /cl[àa]usulas contractuales/i, /corresponsab/i, /EE\.?\s?UU/i,
                             /Estados Unidos/i, /Estats Units/i]) {
        assert.ok(!invento.test(seccion), `${f} afirma algo sin respaldo: ${invento}`);
      }
    }
  });

  test("y la frase sobre los botones dice la verdad", () => {
    // Decía «con el mismo tamaño». En móvil sí —176 px cada uno— pero en escritorio no: 108 vs 97,
    // porque «Rechazar» tiene más letras. Lo que sí es cierto, y es lo que exige la norma, es que
    // aparecen juntos y con la misma prominencia.
    assert.match(raiz("public/privacidad.html"), /con la misma prominencia/);
    assert.match(raiz("public/privacitat.html"), /amb\s+la mateixa prominència/);
    assert.ok(!raiz("public/privacidad.html").includes("con el\n        mismo tamaño"));
    assert.ok(!/mismo tamaño/.test(raiz("public/privacidad.html")), "queda la frase inexacta");
    assert.ok(!/mateixa\s+mida/.test(raiz("public/privacitat.html")), "queda la frase inexacta");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("EL IDIOMA: castellano y catalán", () => {
  // EL TEXTO COMPLETO que lee una persona, enlace y punto final incluidos.
  const ES = "Usamos cookies de Meta para medir qué anuncios traen visitas a la web. "
           + "No hacen falta para reservar ni para usar tu tarjeta. Más información.";
  const CA = "Fem servir galetes de Meta per mesurar quins anuncis porten visites al web. "
           + "No són necessàries per reservar ni per utilitzar la teva targeta. Més informació.";

  test("una página en castellano lo enseña en castellano", async () => {
    const e = await pagina({ decision: null, lang: "es" });
    assert.equal(e.texto, ES);
    assert.deepEqual(e.botones, ["Rechazar", "Aceptar"]);
    assert.equal(e.enlace.textContent, "Más información");
    assert.equal(e.enlace.href, "/privacidad.html#cookies");
  });

  test("una página en catalán lo enseña en catalán", async () => {
    const e = await pagina({ decision: null, lang: "ca" });
    assert.equal(e.texto, CA);
    assert.deepEqual(e.botones, ["Rebutjar", "Acceptar"]);
    assert.equal(e.enlace.textContent, "Més informació");
    assert.equal(e.enlace.href, "/privacitat.html#galetes");
  });

  test("UNA CAMPAÑA EN CATALÁN: el idioma llega tarde y el aviso se repinta", async () => {
    // El HTML de `promo.html` dice `lang="es"`; el idioma de verdad lo pone el servidor unas
    // décimas después (`promo.js`: `document.documentElement.lang = d.idioma`). El aviso ya está
    // pintado para entonces, así que TIENE que enterarse.
    const e = await pagina({ decision: null, lang: "es" });
    assert.deepEqual(e.botones, ["Rechazar", "Aceptar"]);
    e.cambiarIdioma("ca");
    assert.equal(e.texto, CA, "el aviso se queda en castellano en una campaña catalana");
    assert.deepEqual(e.botones, ["Rebutjar", "Acceptar"]);
    assert.equal(e.enlace.href, "/privacitat.html#galetes");
  });

  test("el control permanente también cambia de nombre", async () => {
    const e = await pagina({ decision: "aceptado", lang: "es", controlEnHtml: true });
    assert.equal(e.control.textContent, "Cookies");
    e.cambiarIdioma("ca");
    assert.equal(e.control.textContent, "Galetes");
  });

  test("y sale del MISMO sitio del que ya salía el idioma", () => {
    // `document.documentElement.lang` lo escriben el selector de la web, la campaña y la ficha de
    // un local. No se inventa un segundo sistema: se lee ese y se vigila.
    assert.match(consentJs, /document\.documentElement\.getAttribute\("lang"\)/);
    assert.match(consentJs, /attributeFilter: \["lang"\]/);
    assert.match(raiz("public/app.js"), /document\.documentElement\.lang = lang;/);
    assert.match(promoJs, /document\.documentElement\.lang = /);
  });

  test("un idioma que no tenemos cae en castellano, no en blanco", async () => {
    const e = await pagina({ decision: null, lang: "en" });
    assert.equal(e.texto, ES);
    assert.deepEqual(e.botones, ["Rechazar", "Aceptar"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("LOS ENLACES LLEVAN A LA SECCIÓN, no al principio", () => {
  test("las dos anclas existen en su política", () => {
    assert.match(raiz("public/privacidad.html"), /<h2 id="cookies">/);
    assert.match(raiz("public/privacitat.html"), /<h2 id="galetes">/);
  });

  test("y el aviso apunta a ellas, no al documento entero", () => {
    assert.match(consentJs, /politica: "\/privacidad\.html#cookies"/);
    assert.match(consentJs, /politica: "\/privacitat\.html#galetes"/);
    assert.ok(!/href = "\/privacidad\.html"/.test(consentJs), "vuelve a apuntar al principio");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("SI UNA PÁGINA PUEDE CARGAR META, PUEDE CAMBIAR SUS PREFERENCIAS", () => {
  test("la regla se cumple en TODAS las páginas con Meta", () => {
    // Es el candado que pediste: si mañana se añade Meta a una página y se olvida el control,
    // esto falla. Vale tenerlo en el HTML o que el fichero lo cree solo; lo que no vale es que no
    // esté de ninguna de las dos formas.
    const garantiza = /if \(!controles\.length && document\.querySelector\('script\[src\*="\/js\/meta\.js"\]'\)\)/
      .test(consentJs);
    for (const f of PAGINAS_CON_META) {
      const s = raiz("public/" + f);
      const enHtml = s.includes("data-cookies");
      assert.ok(enHtml || garantiza,
        `${f} carga Meta y no ofrece forma de cambiar las preferencias`);
    }
  });

  test("y en una página sin control en el HTML, se crea", async () => {
    // `promo.html`, `alta.html` y `local.html` no tienen pie. Se quedaron sin control, y son
    // justo las de aterrizaje de una campaña.
    const e = await pagina({ decision: "rechazado", controlEnHtml: false, conMeta: true });
    assert.ok(e.control, "no hay forma de volver a abrir las preferencias");
    assert.equal(e.control.textContent, "Cookies");
    assert.equal(e.aviso, null);
    e.control.pulsar();
    assert.ok(e.aviso, "el control no abre el aviso");
  });

  test("si la página YA trae uno, no se duplica", async () => {
    const e = await pagina({ decision: "aceptado", controlEnHtml: true });
    const cuantos = e.documento.body.hijos.filter(
      (h) => h.getAttribute && h.getAttribute("data-cookies") !== null).length;
    assert.equal(cuantos, 1, "hay dos controles de preferencias");
  });

  test("y en una página SIN Meta no se inventa ninguno", async () => {
    // Las legales llevan el gestor para poder cambiar de opinión, pero su enlace ya está en el
    // pie. Y una página que no mide no necesita que le aparezca un botón de la nada.
    const e = await pagina({ decision: "aceptado", controlEnHtml: false, conMeta: false });
    assert.equal(e.control, null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe("EL AVISO NO TAPA EL BOTÓN DE WHATSAPP", () => {
  test("se anuncia el alto real del aviso mientras está abierto", async () => {
    const e = await pagina({ decision: null });
    assert.equal(e.html.style.props["--ck-alto"], "64px");
    assert.equal(e.documento.body.clases.has("ck-abierto"), true);
  });

  test("y al decidir vuelve todo a su sitio", async () => {
    const e = await pagina({ decision: null });
    e.boton("Aceptar").pulsar();
    assert.equal(e.html.style.props["--ck-alto"], "0px");
    assert.equal(e.documento.body.clases.has("ck-abierto"), false);
  });

  test("el CSS sube el botón exactamente ese alto", () => {
    const css = raiz("public/css/consentimiento.css");
    assert.match(css, /body\.ck-abierto \.wa-float \{[^}]*bottom: calc\(var\(--ck-alto, 0px\) \+ 1rem\)/s);
    // Medido, no escrito a mano: el aviso ocupa dos líneas en un móvil y una en un escritorio.
    assert.match(consentJs, /caja\.offsetHeight/);
  });
});
