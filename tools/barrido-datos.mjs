// BARRIDO CON DATOS HOSTILES. Lo que el barrido normal no puede ver: qué pasa cuando las tablas
// llevan dentro contenido de verdad.
//
// ── POR QUÉ ESTO Y NO LA BASE REAL ───────────────────────────────────────────────────────────
//
// La base de producción vive en el Neon de Replit, detrás de un Secret que no está en esta
// máquina —y que no hay que sacar de ahí—. Así que no hay forma de abrir el panel contra los
// datos de verdad desde local.
//
// Lo que sí se puede hacer, y para este fin es MEJOR, es servir contenido ADVERSARIO: el nombre
// más largo que puede tener un cliente de verdad, el correo más largo, un importe de siete
// cifras, doscientas filas. Los datos reales de hoy son una muestra; esto es el peor caso
// plausible, que es lo que rompe una tabla.
//
// NO ES UN SUSTITUTO de mirar el panel con la base real. Es lo que se puede comprobar sin ella.
//
//   node tools/barrido-datos.mjs               solo comprueba
//   node tools/barrido-datos.mjs --capturas    además guarda PNG

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..", "public");
const CAPTURAS = process.argv.includes("--capturas");
const DESTINO = process.argv.includes("--destino")
  ? process.argv[process.argv.indexOf("--destino") + 1] : "/tmp/barrido-datos";

let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); }
catch { console.log("Sin puppeteer: se salta."); process.exit(0); }

// ── EL CONTENIDO HOSTIL ──────────────────────────────────────────────────────────────────────
//
// Nada de «Lorem ipsum»: todo esto es contenido que este negocio puede tener de verdad. Un
// apellido compuesto catalán, un correo corporativo largo, un proveedor con su forma jurídica
// entera, un importe de cierre de mes.
const NOMBRES = ["María del Carmen", "Joan", "Ana", "Òscar", "Maria Antònia", "Jean-Christophe"];
const APELLIDOS = ["Fernández-Echevarría de la Concepción", "Puig i Cadafalch", "Sánchez",
                   "Vilalta Roca-Sastre", "O'Donnell", "Müller-Hernández"];
const CORREOS = ["maria.del.carmen.fernandez.echevarria@correo-corporativo-muy-largo.example.com",
                 "j@e.co", "administracion.facturacion@grupfamiliadelamor.example.org"];
const POBLACIONES = ["Sant Feliu de Codines", "Blanes", "Santa Coloma de Farners", "Girona"];
const PROVEEDORES = ["Distribucions Alimentàries del Maresme i la Selva, S.L.U.", "Makro", "Bon Preu"];
const ESTADOS = ["pendiente", "pagada", "vencida", "revisar", "conciliada"];

const fila = (i) => ({
  id: i + 1,
  nombre: NOMBRES[i % NOMBRES.length],
  apellidos: APELLIDOS[i % APELLIDOS.length],
  correo: CORREOS[i % CORREOS.length],
  email: CORREOS[i % CORREOS.length],
  telefono: "+34 6" + String(10000000 + i * 137).slice(0, 8),
  poblacion: POBLACIONES[i % POBLACIONES.length],
  local: POBLACIONES[i % POBLACIONES.length],
  nacimiento: `19${60 + (i % 40)}-0${1 + (i % 9)}-1${i % 9}`,
  fecha: `2026-0${1 + (i % 9)}-1${i % 9}`,
  ultima_actividad: `2026-0${1 + (i % 9)}-1${i % 9}T12:00:00+02:00`,
  baja: i % 17 === 0,
  es_contacto_wa: i % 3 === 0,
  // Importes grandes: un KPI que no cuenta con siete cifras se parte.
  importe: 1234567.89 - i * 913.45,
  total: 1234567.89 - i * 913.45,
  base: 1020304.05 - i * 754.9,
  iva: 214263.84 - i * 158.5,
  proveedor: PROVEEDORES[i % PROVEEDORES.length],
  nombre_proveedor: PROVEEDORES[i % PROVEEDORES.length],
  concepto: "Pedido semanal de bebidas, cafés y suministros de sala para el servicio de fin de semana",
  estado: ESTADOS[i % ESTADOS.length],
  categoria: ["uva", "carne", "curado", "mar", "huerta"][i % 5],
  cantidad: 100 + i, precio: 12.5 + i, unidad: "kg",
  producto: "Jamón ibérico de bellota D.O.P. Guijuelo · pieza entera deshuesada",
  descripcion: "Texto largo de verdad: una nota de compra con contexto, incertidumbre y matices "
    + "que alguien escribió deprisa un viernes y que nadie ha vuelto a leer desde entonces.",
});

const FILAS = Array.from({ length: 200 }, (_, i) => fila(i));

/**
 * Una respuesta GENEROSA: lleva las filas con varios nombres de clave a la vez.
 *
 * No se reconstruye el contrato de cada endpoint —son decenas—: se sirve un objeto que satisface
 * a la vez a quien lee `data`, a quien lee `rows` y a quien lee `items`. Las pantallas que
 * necesiten otra forma se quedan vacías, igual que ahora, y se dice cuáles.
 */
const RESPUESTA = {
  ok: true, total: FILAS.length, count: FILAS.length,
  data: FILAS, rows: FILAS, items: FILAS, lista: FILAS, facturas: FILAS, contactos: FILAS,
  clientes: FILAS, productos: FILAS, reservas: FILAS,
};

const TIPOS = { ".html":"text/html;charset=utf-8", ".css":"text/css", ".js":"text/javascript",
  ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".json":"application/json",
  ".woff2":"font/woff2", ".ico":"image/x-icon" };

/** El panel no arranca sin saber quién entra: `/api/auth/me` tiene su propia forma. */
const USUARIO = { username: "direccion", nombre: "Dirección", rol: "direccion",
                  local: "", locales: [], modulos: null };

const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split("?")[0]);
  if (u.startsWith("/api/")) {
    rs.writeHead(200, { "Content-Type": "application/json" });
    return rs.end(JSON.stringify(u === "/api/auth/me" ? { ok: true, user: USUARIO } : RESPUESTA));
  }
  const rel = (u === "/" || u === "/panel" || u === "/panel/") ? "/panel/index.html" : u;
  const f = path.join(RAIZ, rel);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    rs.writeHead(404); return rs.end("no");
  }
  rs.writeHead(200, { "Content-Type": TIPOS[path.extname(rel)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => srv.listen(0, r));
const PUERTO = srv.address().port;
if (CAPTURAS) fs.mkdirSync(DESTINO, { recursive: true });

// ── LO QUE SE MIRA ───────────────────────────────────────────────────────────────────────────
function inspeccionar() {
  const vista = document.getElementById("view");
  if (!vista) return { sinVista: true };
  const lienzo = vista.getBoundingClientRect();
  const out = { filas: vista.querySelectorAll("tbody tr").length, fuera: [], cortes: [], kpis: [] };

  // ¿Algo se sale de la pantalla? Con datos dentro, una columna de más lo provoca.
  if (document.documentElement.scrollWidth > window.innerWidth + 2) {
    for (const el of vista.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > window.innerWidth + 2 && getComputedStyle(el).position !== "fixed") {
        out.fuera.push(el.tagName.toLowerCase()
          + (typeof el.className === "string" && el.className
             ? "." + el.className.trim().split(/\s+/)[0] : "") + " →" + Math.round(b.right));
        if (out.fuera.length >= 3) break;
      }
    }
  }

  // ── TEXTO QUE SE SALE DE SU CAJA ──────────────────────────────────────────────────────────
  // Un nombre largo puede desbordar su celda SIN mover la página: se monta encima de la columna
  // de al lado y no lo ve ningún test de desborde.
  for (const el of vista.querySelectorAll("td, th, .t1, .t2, .pill, .btn, .kpi, .kpi-v, .card h3")) {
    if (el.children.length || !el.textContent.trim()) continue;
    const s = getComputedStyle(el);
    if (s.overflow === "hidden" || s.textOverflow === "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      out.cortes.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/)[0] || "-"}`
        + ` ${el.scrollWidth}>${el.clientWidth} "${el.textContent.trim().slice(0, 22)}"`);
      if (out.cortes.length >= 4) break;
    }
  }

  // ── UNA TABLA ANCHA SE DESPLAZA DENTRO DE SU CAJA ─────────────────────────────────────────
  for (const t of vista.querySelectorAll("table")) {
    const caja = t.parentElement;
    if (t.getBoundingClientRect().width > caja.getBoundingClientRect().width + 2) {
      const ov = getComputedStyle(caja).overflowX;
      if (ov !== "auto" && ov !== "scroll") out.fuera.push("tabla sin scroll en su caja");
    }
  }

  // ── KPI CON CIFRAS GRANDES ────────────────────────────────────────────────────────────────
  for (const k of vista.querySelectorAll(".kpi-v, .kpi b, .kpi .big, .metric")) {
    if (k.scrollWidth > k.clientWidth + 2) out.kpis.push(k.textContent.trim().slice(0, 20));
  }
  void lienzo;
  return out;
}

// ── EL BARRIDO ───────────────────────────────────────────────────────────────────────────────
const PANTALLAS = ["dashboard", "reservas", "clientes", "facturas", "productos", "analitica",
                   "fidelizacion", "campanas", "promos", "whatsapp", "inventarios", "horarios",
                   "fichajes", "rrhh", "agora", "comunicados", "reviews", "mantenimiento",
                   "usuarios", "web", "sara"];
const ANCHOS = [["1440", 1440, 900, false], ["834", 834, 1112, false], ["390", 390, 844, true]];

const nav = await puppeteer.launch({ args: ["--no-sandbox"] });
const problemas = [];
const conDatos = new Set();

for (const [etiqueta, w, h, movil] of ANCHOS) {
  const pg = await nav.newPage();
  await pg.setViewport({ width: w, height: h, isMobile: movil, hasTouch: movil });
  const errores = [];
  pg.on("pageerror", (e) => errores.push(e.message));
  await pg.evaluateOnNewDocument(() => localStorage.setItem("token", "x"));
  await pg.goto(`http://localhost:${PUERTO}/panel/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));
  console.log(`\n── ${etiqueta} px ──`);

  for (const v of PANTALLAS) {
    errores.length = 0;
    await pg.evaluate((x) => {
      document.getElementById("appEl")?.classList.add("mopen");
      document.querySelector(`[data-view="${x}"]`)?.click();
    }, v);
    await new Promise((r) => setTimeout(r, 750));
    const d = await pg.evaluate(inspeccionar);
    if (d.filas > 0) conDatos.add(v);

    const malo = [];
    if (errores.length) malo.push("JS: " + errores[0].slice(0, 60));
    if (d.fuera?.length) malo.push("se sale: " + d.fuera.join(", "));
    if (d.cortes?.length) malo.push("texto desbordado: " + d.cortes.join(" · "));
    if (d.kpis?.length) malo.push("KPI cortado: " + d.kpis.join(", "));
    for (const m of malo) problemas.push(`${v} @${etiqueta}: ${m}`);
    console.log(`${malo.length ? "✖" : "✔"} ${v.padEnd(14)} ${String(d.filas).padStart(3)} filas`
      + (malo.length ? "  " + malo[0].slice(0, 80) : ""));

    if (CAPTURAS && d.filas > 0) {
      await pg.screenshot({ path: path.join(DESTINO, `${v}-${etiqueta}.png`),
        clip: { x: 0, y: 0, width: w, height: Math.min(h, 1400) } });
    }
  }
  await pg.close();
}
await nav.close();
srv.close();

console.log(`\nPantallas que SÍ recogieron los datos: ${[...conDatos].sort().join(", ") || "ninguna"}`);
console.log(`Las demás necesitan otra forma de respuesta y se quedaron vacías.`);
if (!problemas.length) console.log("\nCon 200 filas de contenido hostil: sin desbordes ni textos partidos.\n");
else {
  console.log(`\n${problemas.length} cosas que mirar:`);
  for (const p of problemas) console.log("  ✖ " + p);
  console.log("");
}
if (CAPTURAS) console.log(`Capturas en ${DESTINO}\n`);
process.exit(0);
