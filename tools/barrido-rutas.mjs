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
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1280, height: 1000 });
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
await pagina.evaluateOnNewDocument(() => localStorage.setItem("token", "x"));
await pagina.goto(`http://localhost:${PUERTO}/panel/`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 900));

const rutas = await pagina.evaluate(() => [...document.querySelectorAll(".nav .navi")].map((b) => b.getAttribute("data-view")));
let fallos = 0;
console.log(`\nBarrido de ${rutas.length} pantallas\n`);

for (const r of rutas) {
  errores.length = 0;
  await pagina.evaluate((v) => document.querySelector(`[data-view="${v}"]`).click(), r);
  await new Promise((x) => setTimeout(x, 700));
  const info = await pagina.evaluate(() => {
    const det = [...document.querySelectorAll("#view details")];
    return { abiertos: det.filter((d) => d.open).length, total: det.length,
      vacia: (document.getElementById("view")?.innerText || "").trim().length < 20 };
  });
  const problemas = [];
  if (errores.length) problemas.push(`error: ${errores[0].slice(0, 70)}`);
  if (info.abiertos) problemas.push(`${info.abiertos} desplegable(s) abiertos de casa`);
  if (info.vacia) problemas.push("la pantalla se queda en blanco");
  if (problemas.length) fallos++;
  console.log(`${problemas.length ? "✖" : "✔"} ${r.padEnd(15)} ${problemas.join(" · ")}`);
}

await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} pantalla(s) con problemas\n` : "\nTodas las pantallas abren limpias\n");
process.exit(fallos ? 1 : 0);
