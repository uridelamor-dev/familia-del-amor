#!/usr/bin/env node
// Abre TODAS las pantallas del panel en un Chrome sin ventana y avisa de lo que se rompe.
//
// PARA QUÉ: la batería de `npm test` lee el código, no lo ejecuta en un navegador. Hay fallos
// que solo aparecen al abrir la pantalla — un campo que no llega y tumba el render, un botón
// que no dispara nada, un desplegable que se abre solo. Así salió que Productos se quedaba en
// «Cargando…» para siempre cuando la respuesta venía a medias.
//
// CÓMO: levanta un servidor falso que sirve `public/` de verdad y contesta a la API con
// respuestas vacías pero válidas. No toca la base de datos ni necesita el servidor real.
//
//   node tools/barrido-rutas.mjs
//
// Necesita `puppeteer`, que NO es dependencia del proyecto (aquí no se pueden añadir): si no
// está, esto se salta y lo dice. Es una herramienta de desarrollo, no parte del despliegue.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(process.cwd(), "public");
const PUERTO = 5099;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

let puppeteer;
try { puppeteer = createRequire(import.meta.url)("puppeteer"); }
catch {
  console.log("· Se salta el barrido: falta `puppeteer` (no es dependencia del proyecto).");
  console.log("  Instálalo solo en local si quieres usarlo: npm i -D puppeteer");
  process.exit(0);
}

// Un usuario de dirección, para que se vean todas las pantallas.
const USUARIO = { username: "direccion", nombre: "Dirección", rol: "direccion", local: "", locales: [], modulos: null };
const VACIO = { ok: true, data: [], items: [], rows: [], grupos: [], lineas: [], usuarios: [], reservas: [],
  clientes: [], campanas: [], comunicados: [], incidencias: [], productos: [], pedidos: [], fichajes: [],
  turnos: [], totales: {}, resumen: {}, stats: {}, cobertura: {}, categorias: { categorias: [] }, cuadrante: {} };

const servidor = http.createServer(async (req, res) => {
  const ruta = (req.url || "/").split("?")[0];
  if (ruta.startsWith("/api/")) {
    const cuerpo = ruta === "/api/auth/me" ? { ok: true, user: USUARIO } : VACIO;
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(cuerpo));
  }
  const rel = ruta === "/" || ruta === "/panel" || ruta === "/panel/" ? "/panel/index.html" : ruta;
  try {
    const buf = await readFile(path.join(RAIZ, rel));
    res.writeHead(200, { "Content-Type": MIME[path.extname(rel)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("no está"); }
});

await new Promise((r) => servidor.listen(PUERTO, r));

const navegador = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });

/**
 * Se barre DOS VECES: en ordenador y en móvil.
 *
 * El panel se usa dentro de los locales con el teléfono en la mano, así que una pantalla que
 * solo funciona en el escritorio no está terminada. El caso que lo destapó: en Compras, en un
 * iPhone, la primera factura empezaba a 838 px — una pantalla entera de deslizar sin ver ni
 * una factura, y en el ordenador no se notaba nada.
 */
const PANTALLAS = [
  { mote: "ordenador", ancho: 1440, alto: 900, movil: false },
  // LA TABLETA NO ES UN ESCRITORIO PEQUEÑO. A 834 la barra lateral ya no cabe con comodidad
  // pero la pantalla sigue siendo ancha: es su propio caso, y si no se mira nunca se arregla.
  { mote: "tableta", ancho: 834, alto: 1112, movil: false },
  { mote: "móvil", ancho: 390, alto: 844, movil: true },
];

/** `--capturas` guarda un PNG por pantalla y ancho, para poder mirarlas sin abrir el panel. */
const CAPTURAS = process.argv.includes("--capturas");
const DESTINO = process.argv.includes("--destino")
  ? process.argv[process.argv.indexOf("--destino") + 1] : "/tmp/barrido-panel";
if (CAPTURAS) (await import("node:fs")).mkdirSync(DESTINO, { recursive: true });

let fallos = 0;
/** Lo que no es un fallo pero está mal compuesto. */
const disenio = [];
for (const p of PANTALLAS) {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: p.ancho, height: p.alto, isMobile: p.movil, hasTouch: p.movil });
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(e.message));
  await pagina.evaluateOnNewDocument(() => localStorage.setItem("token", "x"));
  await pagina.goto(`http://localhost:${PUERTO}/panel/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));

  const rutas = await pagina.evaluate(() => [...document.querySelectorAll(".nav .navi")].map((b) => b.getAttribute("data-view")));
  console.log(`\n── ${p.mote} (${p.ancho}×${p.alto}) · ${rutas.length} pantallas ──\n`);

  for (const r of rutas) {
    errores.length = 0;
    // En móvil el menú está cerrado: se abre, se pulsa y se cierra solo al navegar.
    await pagina.evaluate((v) => {
      document.getElementById("appEl")?.classList.add("mopen");
      document.querySelector(`[data-view="${v}"]`).click();
    }, r);
    await new Promise((x) => setTimeout(x, 700));
    const info = await pagina.evaluate(() => {
      // ── ANÁLISIS DE DISEÑO ──────────────────────────────────────────────────────────────
      //
      // Lo que se mide aquí no es si la pantalla funciona: es si está bien compuesta. Son las
      // cosas que se ven mirando 63 capturas una a una, pero contadas — y contarlas es lo
      // único que escala a 21 pantallas por tres anchos.
      const vista = document.getElementById("view");
      const lienzo = vista ? vista.getBoundingClientRect() : null;
      const dis = { titulo: "", cards: 0, anidadas: 0, vacios: [], alturas: [], radios: [],
                    tablas: [], toques: [], ancho: 0 };
      if (vista && lienzo) {
        // 1 · EL TÍTULO ANCLA A LA IZQUIERDA. Si no, la cabecera está descompuesta.
        const h1 = vista.querySelector("h1");
        if (h1) {
          const b = h1.getBoundingClientRect();
          if (b.width && Math.abs(b.left - lienzo.left) > 24) {
            dis.titulo = `h1 a ${Math.round(b.left - lienzo.left)}px del borde`;
          }
        }
        // 2 · TARJETAS. Cuántas, y cuántas dentro de otras.
        const cards = [...vista.querySelectorAll(".card")];
        dis.cards = cards.length;
        // Solo cuentan las que SIGUEN PARECIENDO una tarjeta encima de otra. Una anidada
        // aplanada —sin sombra— es un bloque dentro de una sección, y eso está bien.
        dis.anidadas = cards.filter((c) => c.parentElement.closest(".card")
          && getComputedStyle(c).boxShadow !== "none").length;

        // 3 · ESTADOS VACÍOS ENORMES. Una caja de 200 px para decir «no hay nada» es ruido.
        for (const c of cards) {
          const t = (c.innerText || "").trim();
          const b = c.getBoundingClientRect();
          if (t.length >= 60 || b.height <= 150) continue;
          // Una tarjeta alta porque COMPARTE FILA con otra más llena no es un vacío enorme: las
          // rejillas igualan alturas y eso está bien. Solo cuenta si está sola en su fila.
          const padre = c.parentElement;
          const disp = getComputedStyle(padre).display;
          const hermanos = (disp === "grid" || disp === "flex") ? padre.children.length : 1;
          if (hermanos > 1) continue;
          dis.vacios.push(`${Math.round(b.height)}px "${t.slice(0, 26)}"`);
        }

        // 4 · ALTURAS Y RADIOS DE BOTÓN. Tres alturas distintas en una pantalla se notan.
        const alt = new Set(), rad = new Set();
        for (const b of vista.querySelectorAll(".btn")) {
          const r = b.getBoundingClientRect();
          if (r.height) alt.add(Math.round(r.height));
          rad.add(getComputedStyle(b).borderRadius);
        }
        dis.alturas = [...alt].sort((x, y) => x - y);
        dis.radios = [...rad];

        // 5 · TABLAS. Una tabla ancha se desplaza DENTRO de su caja; si su envoltorio no tiene
        // `overflow`, arrastra la pantalla entera — que es el fallo que ya pasó en Compras.
        for (const t of vista.querySelectorAll("table")) {
          const caja = t.parentElement;
          const tb = t.getBoundingClientRect(), cb = caja.getBoundingClientRect();
          if (tb.width > cb.width + 2) {
            const ov = getComputedStyle(caja).overflowX;
            if (ov !== "auto" && ov !== "scroll") {
              dis.tablas.push(`tabla ${Math.round(tb.width)}px en caja ${Math.round(cb.width)}px sin scroll`);
            }
          }
        }

        // 6 · TEXTO QUE SE SALE DE SU CAJA. Un nombre largo puede desbordar su celda SIN mover
        // la página: se monta encima de lo de al lado y no lo ve ningún test de desborde. Y un
        // contenedor flex sin `min-width:0` se colapsa a un píxel llevándose el texto por
        // delante — eso tampoco mueve la página.
        for (const el of vista.querySelectorAll("td, th, .t1, .t2, .pill, .kpi-v, .card h3")) {
          if (el.children.length || !el.textContent.trim()) continue;
          const cs = getComputedStyle(el);
          if (cs.overflow === "hidden" || cs.textOverflow === "ellipsis") continue;
          if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
            dis.cortes = dis.cortes || [];
            dis.cortes.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/)[0] || "-"}`
              + ` ${el.scrollWidth}>${el.clientWidth} "${el.textContent.trim().slice(0, 20)}"`);
            if (dis.cortes.length >= 3) break;
          }
        }

        // 7 · TOQUES EN MÓVIL. Lo mismo que en la web pública: 44 px.
        if (window.innerWidth <= 640) {
          for (const el of vista.querySelectorAll("button, a[href], input, select")) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const lab = el.closest("label");
            const h = lab ? Math.max(r.height, lab.getBoundingClientRect().height) : r.height;
            if (h < 36) {
              dis.toques.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/)[0] || "-"} ${Math.round(h)}px`);
              if (dis.toques.length >= 4) break;
            }
          }
        }
        // 8 · APROVECHAMIENTO DEL ANCHO: hasta dónde llega el contenido de verdad.
        let derecha = lienzo.left;
        for (const el of vista.querySelectorAll(".card, .tbl, .ph, .rows")) {
          const b = el.getBoundingClientRect();
          if (b.width) derecha = Math.max(derecha, b.right);
        }
        dis.ancho = Math.round(derecha - lienzo.left);
      }
      const det = [...document.querySelectorAll("#view details")];
      return {
        dis,
        abiertos: det.filter((d) => d.open).length,
        vacia: (document.getElementById("view")?.innerText || "").trim().length < 20,
        // Que la PÁGINA se desplace en horizontal es siempre un fallo: las tablas anchas se
        // desplazan dentro de su caja, no arrastrando la pantalla entera.
        desborda: document.documentElement.scrollWidth > window.innerWidth + 2,
        // Quién se sale. «Se sale de ancho» sin decir por dónde obliga a buscar a mano.
        culpable: (() => {
          if (document.documentElement.scrollWidth <= window.innerWidth + 2) return "";
          for (const el of document.querySelectorAll("body *")) {
            const b = el.getBoundingClientRect();
            if (b.width && b.right > window.innerWidth + 2
                && getComputedStyle(el).position !== "fixed") {
              return el.tagName.toLowerCase()
                + (typeof el.className === "string" && el.className
                   ? "." + el.className.trim().split(/\s+/)[0] : "")
                + " →" + Math.round(b.right);
            }
          }
          return "";
        })(),
      };
    });
    if (CAPTURAS) {
      await pagina.screenshot({
        path: `${DESTINO}/${r}-${p.ancho}.png`,
        clip: { x: 0, y: 0, width: p.ancho, height: Math.min(p.alto, 1400) },
      });
    }
    const problemas = [];
    if (errores.length) problemas.push(`error: ${errores[0].slice(0, 70)}`);
    if (info.abiertos) problemas.push(`${info.abiertos} desplegable(s) abiertos de casa`);
    if (info.vacia) problemas.push("la pantalla se queda en blanco");
    if (info.desborda) problemas.push(`se sale de ancho${info.culpable ? " · " + info.culpable : ""}`);
    if (problemas.length) fallos++;
    // El análisis de diseño se cuenta aparte: no son fallos, son cosas que mirar.
    const d = info.dis || {};
    const notas = [];
    if (d.titulo) notas.push("título: " + d.titulo);
    if (d.anidadas) notas.push(`${d.anidadas} card(s) dentro de otra`);
    if (d.vacios?.length) notas.push("vacío enorme: " + d.vacios.join(", "));
    if (d.alturas?.length > 2) notas.push("alturas de botón: " + d.alturas.join("/"));
    if (d.radios?.length > 2) notas.push(`${d.radios.length} radios distintos`);
    if (d.tablas?.length) notas.push(d.tablas.join(", "));
    if (d.cortes?.length) notas.push("texto desbordado: " + d.cortes.join(" · "));
    if (d.toques?.length) notas.push("toque: " + d.toques.join(", "));
    if (notas.length) disenio.push(`${r} @${p.ancho}: ${notas.join(" · ")}`);
    console.log(`${problemas.length ? "✖" : "✔"} ${r.padEnd(15)} ${problemas.join(" · ")}`
      + (d.cards ? `  ${String(d.cards).padStart(2)} cards` : "")
      + (d.ancho ? ` · ${d.ancho}px` : ""));
  }
  await pagina.close();
}

await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} pantalla(s) con problemas\n`
  : "\nTodas las pantallas abren limpias en ordenador, tableta y móvil\n");
if (CAPTURAS) console.log(`Capturas en ${DESTINO}\n`);
if (disenio.length) {
  console.log(`── ${disenio.length} cosas de composición que mirar ──`);
  for (const d of disenio) console.log("  · " + d);
  console.log("");
}
process.exit(fallos ? 1 : 0);
