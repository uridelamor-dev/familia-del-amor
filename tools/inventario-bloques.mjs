// Inventario de los bloques de cada pantalla del panel.
//
// PARA QUÉ: «esa pestaña de ahí ocupa mucho y no aporta» es difícil de decir por escrito y muy
// fácil de señalar con un número. Esto abre las 19 pantallas, lista cada tarjeta con su título
// y su altura, y saca una lista numerada. Se elige por número: «Compras 3 → plegar, 5 → fuera».
//
// Las alturas son con el servidor de pruebas (datos mínimos), así que son un SUELO: con datos
// de verdad casi todos crecen. Sirven para comparar entre sí, no como medida absoluta.
//
// Necesita puppeteer, que no es dependencia del proyecto: si falta, se salta.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PUERTO = 5093;
const RAIZ = new URL("../public/", import.meta.url).pathname;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

let puppeteer;
try { puppeteer = (await import("puppeteer")).default; }
catch { console.log("· puppeteer no está instalado: me salto el inventario.\n"); process.exit(0); }

// Un servidor falso que contesta a todo con la forma mínima que espera el panel.
const VACIO = {
  ok: true, data: [], grupos: [], lineas: [], totales: {}, resumen: {}, cobertura: {},
  categorias: { categorias: [] }, catalogoCategorias: [], productos: [], cola: [], etiquetas: {},
};
const servidor = createServer(async (req, res) => {
  const ruta = (req.url || "/").split("?")[0];
  if (ruta.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (ruta === "/api/auth/me") {
      return res.end(JSON.stringify({ ok: true, user: { username: "direccion", nombre: "Dirección", rol: "direccion", locales: [], modulos: null } }));
    }
    return res.end(JSON.stringify(VACIO));
  }
  const rel = (ruta === "/" || ruta === "/panel" || ruta === "/panel/") ? "/panel/index.html" : ruta;
  try {
    const buf = await readFile(path.join(RAIZ, rel.replace(/^\//, "")));
    res.writeHead(200, { "Content-Type": MIME[path.extname(rel)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("no está"); }
});
await new Promise((r) => servidor.listen(PUERTO, r));

const navegador = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1440, height: 900 });
await pagina.evaluateOnNewDocument(() => localStorage.setItem("token", "x"));
await pagina.goto(`http://localhost:${PUERTO}/panel/`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 900));

const rutas = await pagina.evaluate(() => [...document.querySelectorAll(".nav .navi")].map((b) => b.getAttribute("data-view")));
console.log("\nINVENTARIO DE BLOQUES DEL PANEL");
console.log("Alturas con datos de prueba: son un suelo, con datos reales crecen.\n");

let n = 0;
for (const r of rutas) {
  await pagina.evaluate((v) => document.querySelector(`[data-view="${v}"]`).click(), r);
  await new Promise((x) => setTimeout(x, 700));
  const bloques = await pagina.evaluate(() => {
    // Solo los de primer nivel: una tarjeta dentro de otra es parte de la de fuera.
    const raiz = document.getElementById("view");
    if (!raiz) return [];
    return [...raiz.querySelectorAll(".card, details.card")]
      .filter((c) => !c.parentElement.closest(".card"))
      .map((c) => {
        const t = c.querySelector("h3, .ch h3, summary h3");
        const alto = Math.round(c.getBoundingClientRect().height);
        const plegable = c.tagName === "DETAILS";
        const texto = (c.innerText || "").replace(/\s+/g, " ").trim();
        return {
          titulo: (t?.textContent || texto.slice(0, 40) || "(sin título)").trim().slice(0, 46),
          alto, plegable, abierto: plegable && c.open, vacio: texto.length < 40,
        };
      });
  });
  if (!bloques.length) continue;
  console.log(`── ${r.toUpperCase()}`);
  for (const b of bloques) {
    n++;
    const marcas = [
      b.plegable ? (b.abierto ? "plegable · ABIERTO" : "plegable") : "fijo",
      b.vacio ? "sin datos de prueba" : "",
    ].filter(Boolean).join(" · ");
    console.log(`  ${String(n).padStart(3)}. ${b.titulo.padEnd(46)} ${String(b.alto).padStart(4)} px  (${marcas})`);
  }
  console.log("");
}

await navegador.close();
servidor.close();
console.log(`${n} bloques en ${rutas.length} pantallas.`);
console.log("Para pedir un cambio: «12 plegar», «19 fuera», «7 plegar y que empiece cerrado».\n");
