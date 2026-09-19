// BARRIDO VISUAL DE LA WEB PÚBLICA. Abre las páginas en Chrome sin ventana, a tres anchos, y
// busca lo que un test de texto no puede ver.
//
// ── QUÉ COMPRUEBA, Y POR QUÉ CADA COSA ───────────────────────────────────────────────────────
//
//   · ERRORES DE JAVASCRIPT. Una excepción al cargar deja media página sin pintar y no rompe
//     ningún test: la página se sirve con un 200 perfectamente.
//   · DESBORDE HORIZONTAL. El fallo más común en móvil, y el más feo: la página se mueve de lado.
//   · PÁGINA EN BLANCO. Si el cuerpo mide cuatro líneas, algo no se ha pintado.
//   · TOQUES PEQUEÑOS. Botones y enlaces por debajo de 44 px en móvil.
//   · CONTRASTE DE TEXTO. Calculado, no estimado, sobre el color que de verdad se hereda.
//
// ── POR QUÉ NO ES UN TEST ────────────────────────────────────────────────────────────────────
//
// Porque necesita `puppeteer`, que NO es una dependencia del proyecto —no se pueden añadir— y en
// el servidor no está. `npm test` lee el código; esto lo ejecuta, y ahí salen otros fallos. Si
// falta puppeteer, se salta sin ruido.
//
//   node tools/barrido-visual.mjs                 solo comprueba
//   node tools/barrido-visual.mjs --capturas      además guarda PNG en /tmp/barrido-visual

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..", "public");
const CAPTURAS = process.argv.includes("--capturas");
const DESTINO = process.argv.includes("--destino")
  ? process.argv[process.argv.indexOf("--destino") + 1]
  : "/tmp/barrido-visual";

let puppeteer;
try {
  ({ default: puppeteer } = await import("puppeteer"));
} catch {
  console.log("Sin puppeteer: se salta el barrido visual.");
  process.exit(0);
}

// ── LAS PÁGINAS ──────────────────────────────────────────────────────────────────────────────
//
// `?` lleva los parámetros que la página necesita para pintar algo: sin clave de campaña,
// `promo.html` se va a la portada, y no se estaría mirando nada.
const PAGINAS = [
  ["portada", "/"],
  ["locales", "/locales.html"],
  ["local", "/local.html?l=girona"],
  ["nosotros", "/nosotros.html"],
  ["eventos", "/eventos.html"],
  ["trabaja", "/trabaja.html"],
  ["alta", "/alta.html"],
  ["promo", "/promo.html?c=demo"],
  ["tarjeta", "/tarjeta.html?t=demo"],
  ["privacidad", "/privacidad.html"],
  ["privacitat", "/privacitat.html"],
  ["login", "/login.html"],
];

const ANCHOS = [["1440", 1440, 900], ["834", 834, 1112], ["390", 390, 844]];

// ── EL SERVIDOR DE MENTIRA ───────────────────────────────────────────────────────────────────
//
// Sirve `public/` y contesta a mano las pocas llamadas que las páginas hacen al arrancar. No se
// levanta el servidor de verdad a propósito: eso necesitaría base de datos, y aquí se está
// mirando CÓMO SE VE una página, no qué datos trae.
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };

const RESPUESTAS = {
  "/api/publico/meta": { ok: true, pixel: "0000000000", activo: true },
  "/api/content": { ok: true, data: {} },
  "/api/tarjeta/activa": { ok: true, activa: true },
  // Un formulario configurado, para que `promo.html` pinte el camino nuevo —el de
  // `fid_formularios`— en vez de irse a la portada. Los datos son de mentira; lo que se está
  // mirando es CÓMO se ven los campos, y el de la fecha en particular.
  "/api/publico/formulario/demo": {
    ok: true, clave: "demo", version: 1, idioma: "es",
    titulo: "Te invitamos a esmorzar", subtitulo: "", destacado: "Completa el formulario y recibirás el código en tu teléfono.",
    introduccion: "", texto_boton: "Quiero mi código", imagen: null,
    campos: [
      { id: "nombre", label: "", etiqueta: "Nombre", visible: true, obligatorio: true },
      { id: "apellidos", etiqueta: "Apellidos", visible: true, obligatorio: true },
      { id: "telefono", etiqueta: "Teléfono", visible: true, obligatorio: true },
      { id: "email", etiqueta: "Correo electrónico", visible: true, obligatorio: false },
      { id: "poblacion", etiqueta: "Población", visible: true, obligatorio: false },
      { id: "nacimiento", etiqueta: "Fecha de nacimiento", visible: true, obligatorio: false },
    ],
    consentimiento_texto: "Al enviar aceptas recibir descuentos del grupo. Consulta la Política de privacidad.",
    privacidad_url: "/privacidad.html", privacidad_texto: "Política de privacidad",
    politica_version: 2, sugerir_poblacion: false,
    mensajes: { cargando: "Cargando…", enviando: "Enviando…", error: "No se ha podido guardar." },
    locales: ["La Tapeta - Girona", "La Tapeta - Salt"],
  },
};

/** Páginas que sin datos reales no pintan nada. No es un fallo: es que aquí no hay base. */
const NECESITAN_DATOS = new Set(["tarjeta", "cupon", "local"]);

function servidor() {
  return http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    if (u.startsWith("/api/")) {
      const cuerpo = RESPUESTAS[u] ?? { ok: false, error: "no disponible" };
      res.writeHead(RESPUESTAS[u] ? 200 : 404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(cuerpo));
    }
    const f = path.join(RAIZ, u === "/" ? "index.html" : u);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end("no");
    }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
}

// ── LO QUE SE MIRA DENTRO DE LA PÁGINA ───────────────────────────────────────────────────────
function inspeccionar() {
  const lum = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]);
  };
  /** El fondo REAL: el del elemento, o el del primer antepasado que tenga uno opaco. */
  const fondoDe = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = String(c).match(/[\d.]+/g);
      if (m && (m.length < 4 || +m[3] > 0.7)) return c;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  /**
   * ¿Este texto cae sobre una FOTO? Entonces no se puede calcular su contraste: el fondo es una
   * imagen con mil colores, no un valor. Medirlo contra el color del cuerpo da un número
   * inventado —el héroe daba 1,16 : 1 cuando en pantalla se lee perfectamente— y un número
   * inventado es peor que ninguno, porque esconde los que sí son ciertos.
   */
  const sobreFoto = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") return true;   // foto o degradado
      // UN TEXTO EN CAPA FLOTANTE NO SE PUEDE MEDIR. Si algo está en `position:absolute`, su
      // fondo es lo que haya pintado DEBAJO —una foto, un degradado, otra capa—, y eso no está
      // en su cadena de antepasados: el rótulo de una ficha de local cuelga de un `.ltc-info`
      // absoluto que flota sobre un `.ltc-bg` hermano con la foto.
      //
      // Se deja fuera a propósito y se dice aquí: un número inventado esconde los que sí son
      // ciertos. Estos hay que mirarlos con los ojos.
      if (s.position === "absolute" || s.position === "fixed") return true;
      if (s.position !== "static" && n.querySelector("img, picture, svg")) return true;
    }
    return false;
  };

  const ancho = document.documentElement.scrollWidth;
  const desborde = ancho > window.innerWidth + 1;

  // Quién se sale. Sin esto, «hay desborde» no dice dónde mirar.
  const culpables = [];
  if (desborde) {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= window.innerWidth + 1) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      culpables.push((el.tagName.toLowerCase()
        + (el.id ? "#" + el.id : "")
        + (el.className && typeof el.className === "string"
           ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""))
        + " →" + Math.round(r.right));
      if (culpables.length >= 5) break;
    }
  }

  const pequenos = [];
  if (window.innerWidth <= 640) {
    for (const el of document.querySelectorAll("button, a[href], input, select, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).display === "inline" && el.closest("p, li")) continue;  // enlaces en un párrafo
      // UNA CASILLA SE TOCA POR SU ETIQUETA. El cuadradito mide 22 px y está bien que los mida:
      // lo que hay que acertar es la etiqueta entera, que es lo que registra el toque.
      const etiqueta = el.closest("label");
      const alto = etiqueta ? Math.max(r.height, etiqueta.getBoundingClientRect().height) : r.height;
      if (alto < 40) {
        pequenos.push((el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
          ? "." + el.className.trim().split(/\s+/)[0] : "")) + " " + Math.round(alto) + "px");
        if (pequenos.length >= 6) break;
      }
    }
  }

  const flojos = [];
  for (const el of document.querySelectorAll("p, span, a, li, h1, h2, h3, label, td, th, button")) {
    if (!el.textContent.trim() || el.children.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (sobreFoto(el)) continue;
    const s = getComputedStyle(el);
    const lt = lum(s.color), lf = lum(fondoDe(el));
    if (lt === null || lf === null) continue;
    const c = (Math.max(lt, lf) + 0.05) / (Math.min(lt, lf) + 0.05);
    const grande = parseFloat(s.fontSize) >= 24
      || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700);
    if (c < (grande ? 3 : 4.5)) {
      flojos.push(el.textContent.trim().slice(0, 28) + " " + c.toFixed(2) + ":1");
      if (flojos.length >= 6) break;
    }
  }

  return {
    ancho, desborde, culpables, pequenos, flojos,
    alto: document.body.scrollHeight,
    vacia: document.body.innerText.trim().length < 40,
  };
}

// ── EL BARRIDO ───────────────────────────────────────────────────────────────────────────────
const srv = servidor();
await new Promise((r) => srv.listen(0, r));
const PUERTO = srv.address().port;

if (CAPTURAS) fs.mkdirSync(DESTINO, { recursive: true });

const nav = await puppeteer.launch({ args: ["--no-sandbox"] });
const problemas = [];
let mirados = 0;

for (const [nombre, ruta] of PAGINAS) {
  const linea = [];
  for (const [etiqueta, w, h] of ANCHOS) {
    const pag = await nav.newPage();
    const errores = [];
    pag.on("pageerror", (e) => errores.push(String(e).split("\n")[0]));
    await pag.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    try {
      await pag.goto(`http://localhost:${PUERTO}${ruta}`, { waitUntil: "networkidle0", timeout: 20000 });
    } catch (e) {
      problemas.push(`${nombre} @${etiqueta}: no carga · ${e.message.split("\n")[0]}`);
      await pag.close(); continue;
    }
    await new Promise((r) => setTimeout(r, 350));
    const d = await pag.evaluate(inspeccionar);
    mirados++;

    const malo = [];
    // SE COMPRUEBA A DÓNDE SE HA LLEGADO. Varias páginas se van a la portada si les falta lo
    // suyo —`alta.html` con la tarjeta apagada, `promo.html` sin campaña—, y entonces se estaría
    // midiendo la portada creyendo que es otra cosa. Eso no es un fallo de la página: es que
    // aquí no hay datos. Pero hay que decirlo, no callarlo.
    const llegada = new URL(pag.url()).pathname + new URL(pag.url()).search;
    if (llegada !== ruta && !(ruta === "/" && llegada === "/")) {
      linea.push(`${etiqueta}→${llegada}`);
      await pag.close();
      continue;
    }
    if (errores.length) malo.push("JS: " + errores[0].slice(0, 70));
    if (d.vacia && !NECESITAN_DATOS.has(nombre)) malo.push("página en blanco");
    if (d.desborde) malo.push(`desborde ${d.ancho}>${w} · ${d.culpables.join(", ")}`);
    if (d.pequenos.length) malo.push("toque pequeño: " + d.pequenos.join(", "));
    if (d.flojos.length) malo.push("contraste: " + d.flojos.join(", "));
    for (const m of malo) problemas.push(`${nombre} @${etiqueta}: ${m}`);
    linea.push(`${etiqueta}${malo.length ? "✖" : "✔"}`);

    if (CAPTURAS) {
      await pag.screenshot({ path: path.join(DESTINO, `${nombre}-${etiqueta}.png`), fullPage: false });
    }
    await pag.close();
  }
  console.log(`  ${nombre.padEnd(12)} ${linea.join("  ")}`);
}

await nav.close();
srv.close();

console.log(`\n${mirados} vistas miradas.`);
if (!problemas.length) {
  console.log("Sin desbordes, sin errores de JS, sin contrastes flojos.");
} else {
  console.log(`\n${problemas.length} cosas que mirar:`);
  for (const p of problemas) console.log("  ✖ " + p);
}
if (CAPTURAS) console.log(`\nCapturas en ${DESTINO}`);
process.exit(0);
