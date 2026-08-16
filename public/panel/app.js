"use strict";
/* Panel interno (cockpit) — datos REALES. Reutiliza login/sesión (auth.js): requireRole(),
   authFetch y el JWT de localStorage. Router simple con vistas in-app (Dashboard, Reservas)
   y enlaces de respaldo al panel clásico para lo aún no migrado. */

// `useGrouping: "always"`: en español, por defecto, Intl NO separa los millares de cuatro
// cifras — «7809» junto a «12.481» en la misma pantalla, como si fueran de dos sitios.
const nf = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
const num = (n) => nf.format(Number(n) || 0);
const dec1 = (n) => (Number(n) || 0).toFixed(1).replace(".", ",");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const todayStr = () => new Date().toISOString().slice(0, 10);
function addDaysStr(s, n) { const d = new Date(s + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// Si no llega una fecha se devuelve cadena vacía, NO el valor tal cual: con `return iso`
// una fecha ausente acababa pintando literalmente «undefined» en la cabecera del panel.
const esFechaISO = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ""));
function fechaLarga(iso) { if (!esFechaISO(iso)) return ""; try { return cap(new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(String(iso).slice(0, 10) + "T12:00:00"))); } catch { return ""; } }
function fechaCorta(iso) { if (!esFechaISO(iso)) return ""; try { return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(String(iso).slice(0, 10) + "T12:00:00")); } catch { return ""; } }
// Sin el día de la semana. En el móvil, «dom,» son 34 px que le hacen falta al importe.
function fechaMini(iso) { if (!esFechaISO(iso)) return ""; try { return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(String(iso).slice(0, 10) + "T12:00:00")); } catch { return ""; } }
const token = () => localStorage.getItem("token");
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }
const LOCALES = (typeof window !== "undefined" && window.LOCALES) ? window.LOCALES : [];
// Centros sin atención al público (la oficina): ni reservas ni ventas de TPV.
const LOCALES_SIN_PUBLICO = (typeof window !== "undefined" && window.LOCALES_SIN_PUBLICO) ? window.LOCALES_SIN_PUBLICO : [];
const sinPublico = (l) => LOCALES_SIN_PUBLICO.includes(String(l || ""));
// Módulos que no aplican a esos centros: no se ofrecen en el selector ni se consultan.
const MODULOS_SOLO_PUBLICO = new Set(["reservas", "analitica"]);

// ── Capa de datos ────────────────────────────────────────────────────────────
async function api(path) {
  const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } });
  if (await fueraDeSesion(r)) throw new Error("noauth");
  const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error del servidor"); return j.data;
}
async function apiOptional(path) {
  try { const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } }); if (!r.ok) return null; const j = await r.json(); return j.ok ? j.data : null; } catch { return null; }
}
async function apiSend(method, path, body) {
  const opt = { method, headers: { Authorization: "Bearer " + token() } };
  if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  if (await fueraDeSesion(r)) throw new Error("noauth");
  const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error del servidor"); return j;
}

// El menú va por departamentos, que es como está repartido el trabajo de verdad: quien lleva
// las facturas no entra nunca en Reseñas, y quien lleva el equipo no entra en Ágora. Antes
// «Gestión» mezclaba nóminas, facturas y la web, así que había que leerse la lista entera.
//
// Arriba queda lo que se abre a diario sin ser de nadie en concreto (Operación) y abajo lo que
// solo toca dirección (Sistema). Los grupos que quedan vacíos para un rol no se pintan, así que
// un encargado ve tres bloques cortos en vez de cuatro largos con casi todo en gris.
/**
 * Qué hacer con un 401/403: se decide en un solo sitio y no en cinco copias, porque el día que
 * cambie la regla habría que acordarse de las cinco.
 */
async function fueraDeSesion(r) {
  if (r.status !== 401 && r.status !== 403) return false;
  localStorage.removeItem("token");
  location.href = "/login.html";
  return true;
}

const NAV = [
  { g: "Operación", items: [
    ["dashboard", "Dashboard", "dash", ["direccion", "encargado", "contabilidad"]],
    ["reservas", "Reservas", "cal", ["direccion", "encargado"]],
    ["comunicados", "Comunicados", "mega", ["direccion", "encargado"]],
  ] },
  { g: "RR. HH.", items: [
    ["rrhh", "Equipo", "idcard", ["direccion", "rrhh", "encargado"]],
    ["horarios", "Horarios", "cal", ["direccion", "rrhh", "encargado"]],
    ["fichajes", "Fichajes", "clock", ["direccion", "rrhh", "encargado", "contabilidad"]],
  ] },
  { g: "Contabilidad", items: [
    // «Subir factura» es SOLO del encargado: entra, hace la foto y se va. Quien lleva la
    // contabilidad sube desde Compras → Facturas, con el mismo botón; tenerlo además suelto
    // en el menú repetía una entrada que no usaba y parecía otra bandeja distinta.
    ["subirfactura", "Subir factura", "receipt", ["encargado"]],
    ["facturas", "Compras", "receipt", ["direccion", "contabilidad"]],
    // Productos va justo debajo de Compras y no dentro: sale de los mismos papeles, pero
    // contesta otra pregunta —qué entra y a cómo nos lo cobran— y se mira en otro momento.
    ["productos", "Productos", "box", ["direccion", "contabilidad"]],
    ["analitica", "Analítica de ventas", "chart", ["direccion", "contabilidad"]],
  ] },
  { g: "Marketing", items: [
    ["clientes", "Clientes", "users", ["direccion", "marketing"]],
    ["campanas", "Campañas", "mkt", ["direccion", "marketing"]],
    ["reviews", "Reseñas", "star", ["direccion", "encargado", "contabilidad", "marketing"]],
    ["web", "Web", "globe", ["direccion", "marketing"]],
    ["sara", "Sara (IA)", "bot", ["direccion", "marketing"]],
  ] },
  // Inventarios va aquí y no en Contabilidad porque lo llevan los mismos que las averías —
  // el encargado del local— y no quien cuadra las cuentas. Es lo que hace falta para que el
  // local funcione: que no falte producto y que no haya nada roto.
  { g: "Mantenimiento", items: [
    ["mantenimiento", "Incidencias", "wrench", ["direccion", "encargado"]],
    ["inventarios", "Inventarios", "box", ["direccion", "encargado"]],
  ] },
  { g: "Sistema", items: [
    ["whatsapp", "WhatsApp", "chat", ["direccion", "encargado"]],
    ["agora", "Ágora (TPV)", "plug", ["direccion"]],
    ["usuarios", "Usuarios", "cog", ["direccion"]],
  ] },
];
const TITLES = { subirfactura: "Subir factura", dashboard: "Dashboard", reservas: "Reservas", comunicados: "Comunicados", mantenimiento: "Incidencias", inventarios: "Inventarios", clientes: "Clientes", reviews: "Reseñas", campanas: "Campañas", rrhh: "Equipo", horarios: "Horarios", fichajes: "Fichajes", facturas: "Compras", productos: "Productos", analitica: "Analítica de ventas", sara: "Sara", agora: "Ágora (TPV)", whatsapp: "WhatsApp", usuarios: "Usuarios", web: "Web" };
const VIEW_ROLES = { subirfactura: ["encargado"], dashboard: ["direccion", "encargado", "contabilidad"], reservas: ["direccion", "encargado"], comunicados: ["direccion", "encargado"], mantenimiento: ["direccion", "encargado"], inventarios: ["direccion", "encargado"], clientes: ["direccion", "marketing"], reviews: ["direccion", "encargado", "contabilidad", "marketing"], campanas: ["direccion", "marketing"], rrhh: ["direccion", "rrhh", "encargado"], horarios: ["direccion", "rrhh", "encargado"], fichajes: ["direccion", "rrhh", "encargado", "contabilidad"], facturas: ["direccion", "contabilidad"], productos: ["direccion", "contabilidad"], analitica: ["direccion", "contabilidad"], sara: ["direccion", "marketing"], agora: ["direccion"], whatsapp: ["direccion", "encargado"], usuarios: ["direccion"], web: ["direccion", "marketing"] };
// Módulos cuyos datos varían por local (espejo de CATALOGO_MODULOS.porLocal del backend).
const MODULOS_POR_LOCAL = new Set(["subirfactura", "dashboard", "reservas", "mantenimiento", "inventarios", "facturas", "productos", "reviews", "analitica", "rrhh", "horarios", "fichajes"]);
// Módulos que un rol puede ver (su máximo teórico), para el editor de usuarios.
function modulosDeRolFE(rol) { return Object.keys(VIEW_ROLES).filter((v) => VIEW_ROLES[v].includes(rol)); }
// ¿El usuario actual puede entrar a `view`? Respeta rol + allowlist efectiva (USER.modulos del token).
function puedeVer(view) {
  if (!VIEW_ROLES[view]) return true;
  if (!VIEW_ROLES[view].includes(USER.rol)) return false;
  if (USER.rol === "direccion") return true;
  if (Array.isArray(USER.modulos) && USER.modulos.length) return USER.modulos.includes(view);
  return true;
}
// Local al que queda fijado el usuario en la interfaz (encargado con local). null = sin restricción.
// Los establecimientos a los que llega este usuario. Dirección: [] = todos.
function misLocales() {
  if (!USER || USER.rol === "direccion") return [];
  return Array.isArray(USER.locales) && USER.locales.length ? USER.locales : (USER.local ? [USER.local] : []);
}
// Local FIJADO = no hay nada que elegir. Con varios ya no está fijado: se elige entre los suyos.
function localFijadoFE() { const m = misLocales(); return m.length === 1 ? m[0] : null; }
/**
 * EL ÁMBITO: qué establecimientos se están mirando.
 *
 * Tres estados, y `DASH_LOCAL` los distingue: el nombre de UN local, "" = todos, o la marca
 * `VARIOS` = los que haya en `SELECCION` (dos, tres, los que sean).
 *
 * Antes solo había «uno» o «todos». «Todos» es cómodo para mirar y traicionero para tocar: se
 * edita el producto de Blanes creyendo que es el de Lloret, porque en la lista salen los dos y
 * se parecen. Poder elegir «Blanes y Lloret» es lo que hace que se pueda comparar sin dejar de
 * saber en cuál se está.
 */
const VARIOS = "*varios*";
// La lista completa entre la que se puede elegir: los suyos si tiene asignados, todos si no.
function localesBase() { const m = misLocales(); return m.length ? m : LOCALES; }
// Los establecimientos en juego cuando se ven varios a la vez. Se filtra siempre contra la
// base: una selección guardada de hace meses puede nombrar un local que ya no le toca.
function localesDelAmbito() {
  const base = localesBase();
  const sel = SELECCION.filter((l) => base.includes(l));
  return sel.length ? sel : misLocales();
}
const viendoVarios = () => DASH_LOCAL === VARIOS && localesDelAmbito().length > 1;
// Cómo se llama lo que se está mirando: «Blanes y Lloret», no «3 establecimientos». El nombre
// de los sitios es lo que se reconoce de un vistazo; un número hay que ir a comprobarlo.
function etiquetaAmbito() {
  const n = localesDelAmbito().map(nombreCortoLocal);
  if (n.length <= 1) return n[0] || "";
  if (n.length <= 3) return n.slice(0, -1).join(", ") + " y " + n[n.length - 1];
  return `${n.length} establecimientos`;
}

// El que se está mirando ahora. Con varios devuelve "" (sin filtro) SOLO para pintar rótulos;
// las consultas no lo usan: van una por local (ver `pidePorLocales`).
function localActualFE() {
  const m = misLocales();
  if (viendoVarios()) return "";
  if (!m.length) return DASH_LOCAL === VARIOS ? "" : (DASH_LOCAL || "");
  return m.includes(DASH_LOCAL) ? DASH_LOCAL : m[0];
}

/**
 * El ámbito se RECUERDA. Sin esto, cada recarga te devolvía a «todos los establecimientos»
 * —justo el ámbito que no conviene tener puesto sin darte cuenta— y había que volver a elegir.
 */
function guardarAmbito() {
  try { localStorage.setItem("panelAmbito", JSON.stringify({ local: DASH_LOCAL, locales: SELECCION })); } catch { /* sin sitio: se pierde, no se rompe */ }
}
function ambitoInicial() {
  const base = localesBase();
  try {
    const g = JSON.parse(localStorage.getItem("panelAmbito") || "null");
    if (g && g.local === VARIOS && Array.isArray(g.locales)) {
      const buenos = g.locales.filter((l) => base.includes(l));
      if (buenos.length > 1) return { local: VARIOS, locales: buenos };
    }
    if (g && base.includes(g.local)) return { local: g.local, locales: [] };
    // «Todos» solo se recuerda a quien puede tenerlo: el que tiene locales asignados no lo tiene.
    if (g && g.local === "" && !misLocales().length) return { local: "", locales: [] };
  } catch { /* si está corrupto se empieza por el de siempre */ }
  // Por defecto UNO, y el primero de la lista: La Tapeta - Blanes. Entrar en «todos» invita a
  // tocar el local equivocado; entrar en uno obliga a cambiar a propósito, que es lo que se
  // quiere.
  return { local: base[0] || "", locales: [] };
}

/**
 * Ver varios locales juntos SIN tocar el filtrado del servidor.
 *
 * Cada consulta sigue pidiendo UN local —exactamente la misma que ya estaba probada— y aquí se
 * juntan las respuestas. Es una petición más por local (dos o tres, no cien) a cambio de no
 * reescribir las ~126 consultas que filtran con `local = ?`, que es lo que el ADR 0001 aparta
 * hasta después de producción. Un fallo ahí no se vería: saldrían menos reservas, o las de otro.
 *
 * `montaUrl(local)` devuelve la URL de UN local. Devuelve el array ya concatenado.
 */
async function pidePorLocales(montaUrl, { raw = false } = {}) {
  const locales = localesDelAmbito();
  if (!viendoVarios() || locales.length < 2) {
    const j = raw ? await apiRaw(montaUrl(localActualFE())) : await api(montaUrl(localActualFE()));
    return raw ? j : j;
  }
  const partes = await Promise.all(locales.map((l) => (raw ? apiRaw(montaUrl(l)) : api(montaUrl(l))).catch(() => null)));
  const buenas = partes.filter(Boolean);
  const arrays = buenas.map((p) => (raw ? (p.data || []) : (p || [])));
  if (!raw) return arrays.flat();
  return { ok: true, data: arrays.flat(), variosLocales: true,
    // El agregado de CADA local, para poder sumarlos: sumar las filas visibles daría corto,
    // porque la lista viene topada.
    partes: buenas.map((p) => p.totales).filter(Boolean),
    hayMas: buenas.some((p) => p.hayMas) };
}

let USER = null, CURRENT = "dashboard";

function setTheme(v) { const r = document.documentElement; if (v === "auto") { r.removeAttribute("data-theme"); localStorage.removeItem("panelTheme"); } else { r.setAttribute("data-theme", v); localStorage.setItem("panelTheme", v); } }
function isDark() { const r = document.documentElement; return r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches); }
function toggleTheme() { setTheme(isDark() ? "light" : "dark"); const b = document.getElementById("themeBtn"); if (b) b.innerHTML = ic(isDark() ? "moon" : "sun"); }
(function initTheme() { const t = localStorage.getItem("panelTheme"); if (t) document.documentElement.setAttribute("data-theme", t); })();

// ── Menú lateral plegable ───────────────────────────────────────────────────
// Dirección ve los 18 módulos y los seis bloques: la lista entera no cabe de un vistazo y
// obliga a leerla para encontrar nada. Plegada, se ve la estructura —qué departamentos hay— y
// se abre el que toca. Los demás roles ven tres o cuatro entradas en total, así que plegarles
// nada les ahorraría y sí les añadiría un clic: a ellos se les abre todo.
//
// El grupo de la pantalla en la que estás se abre SIEMPRE, esté como esté guardado: un menú
// que no enseña dónde estás no es un menú.
let NAV_ABIERTOS = null;

function navEstado() {
  if (NAV_ABIERTOS) return NAV_ABIERTOS;
  try {
    const g = JSON.parse(localStorage.getItem("navGrupos") || "null");
    if (Array.isArray(g)) return (NAV_ABIERTOS = new Set(g));
  } catch { /* si está corrupto se empieza de cero */ }
  // Por defecto: dirección con todo plegado, el resto con todo abierto.
  NAV_ABIERTOS = new Set(USER && USER.rol === "direccion" ? [] : NAV.map((x) => x.g));
  return NAV_ABIERTOS;
}

function navGrupoAbierto(nombre, items, active) {
  if (COLLAPSED) return true;                       // en modo icono no hay rótulos que plegar
  if (items.some(([id]) => id === active)) return true;
  return navEstado().has(nombre);
}

function navToggleGrupo(nombre) {
  const st = navEstado();
  if (st.has(nombre)) st.delete(nombre); else st.add(nombre);
  try { localStorage.setItem("navGrupos", JSON.stringify([...st])); } catch { /* sin persistencia, pero funciona */ }
  // Se repinta solo la barra: repintar la vista entera perdería lo que haya en pantalla.
  const el = document.querySelector(`.ngrp .ngt[data-g="${CSS.escape(nombre)}"]`)?.closest(".ngrp");
  const grp = NAV.find((g) => g.g === nombre);
  if (!el || !grp) return;
  const items = grp.items.filter(([id]) => puedeVer(id));
  const abierto = navGrupoAbierto(nombre, items, CURRENT);
  el.classList.toggle("on", abierto);
  el.querySelector(".ngt").setAttribute("aria-expanded", String(abierto));
  const n = el.querySelector(".gn");
  if (abierto) { if (n) n.remove(); el.querySelector(".gdot")?.remove(); }
  else if (!n) {
    const avisos = items.some(([id]) => id === "dashboard") && DASH_CONCERNS > 0;
    el.querySelector(".ngt").insertAdjacentHTML("beforeend",
      `<span class="gn">${items.length}${avisos ? " ·" : ""}</span>${avisos ? '<span class="gdot"></span>' : ""}`);
  }
}

/**
 * Repinta la barra lateral y la campana sin tocar la vista. Volver a escribir el shell entero
 * dejaría el contenido en su sitio pero SIN los manejadores que cada pantalla engancha después
 * de dibujarse (Productos, Pagos, Conciliaciones…), y la pantalla se quedaría muerta al tacto.
 */
function repintarBarra() {
  const nuevo = document.createElement("div");
  nuevo.innerHTML = shell(CURRENT, "");
  const barra = document.querySelector(".sidebar"), nueva = nuevo.querySelector(".sidebar");
  if (barra && nueva) barra.replaceWith(nueva);
  const campana = document.querySelector(".bell"), campanaNueva = nuevo.querySelector(".bell");
  if (campana && campanaNueva) campana.replaceWith(campanaNueva);
}

function shell(active, bodyHtml) {
  const uname = USER.nombre || USER.username || "Usuario";
  const initials = uname.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const nav = NAV.map((grp) => {
    const items = grp.items.filter(([id]) => puedeVer(id));
    if (!items.length) return "";
    const abierto = navGrupoAbierto(grp.g, items, active);
    const avisos = items.reduce((n, [id]) => n + (PENDIENTES[id] || 0), 0);
    const botones = items.map(([id, label, icon]) => {
      const n = PENDIENTES[id] || 0;
      const badge = n > 0 ? `<span class="badge" title="${esc(PENDIENTES_TXT[id] || "")}">${num(n)}</span>` : "";
      return `<button class="navi ${id === active ? "active" : ""}" data-view="${id}"><span class="ico">${ic(icon)}</span><span>${label}</span>${badge}</button>`;
    }).join("");
    return `<div class="ngrp ${abierto ? "on" : ""}">
      <button class="ngt" data-act="nav-grupo" data-g="${esc(grp.g)}" aria-expanded="${abierto}">
        <span class="gcar">${ic("chev", 13)}</span><span class="gtxt">${esc(grp.g)}</span>
        ${!abierto ? `<span class="gn">${items.length}${avisos ? " ·" : ""}</span>` : ""}
        ${!abierto && avisos ? `<span class="gdot"></span>` : ""}
      </button>
      <div class="nitems">${botones}</div></div>`;
  }).join("");
  // Quien tiene local asignado no ve «Todos los establecimientos» ni de rótulo: no es cierto,
  // porque el servidor le devuelve solo los suyos. Un rótulo que promete más de lo que hay es
  // peor que no tenerlo — el encargado leía sus reservas creyendo que eran las del grupo.
  const fijado = localFijadoFE();
  const actual = localActualFE();
  const estabLbl = fijado ? nombreCortoLocal(fijado)
    : viendoVarios() ? etiquetaAmbito()
    : actual ? nombreCortoLocal(actual) : "Todos los establecimientos";
  // El selector de periodo solo se pinta donde manda algo. En Reservas o en Usuarios era un
  // control vivo que no hacía nada.
  const grupo = grupoPeriodo(active);
  const per = periodoVista(active);
  const customLbl = (per.p === "custom" && per.from) ? `${esc(fechaCorta(per.from))} – ${esc(fechaCorta(per.to))}` : "Personalizado";
  const presets = grupo === "compras"
    ? [["todo", "Todo"], ["semana", "Semana"], ["mes", "Mes"]]
    : [["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Semana"], ["mes", "Mes"]];
  const seg = !grupo ? "" : presets.map(([p, l]) => `<button class="${per.p === p ? "on" : ""}" data-act="period" data-p="${p}">${l}</button>`).join("")
    + `<button class="${per.p === "custom" ? "on" : ""}" data-act="period-custom" title="Elegir fechas">${customLbl}</button>`;
  return `<div class="app${COLLAPSED ? " collapsed" : ""}" id="appEl">
    <aside class="sidebar">
      <div class="brand"><div class="logo">FA</div><div class="bt"><b>Familia del Amor</b><span>Sistema operativo interno</span></div></div>
      <nav class="nav">${nav}</nav>
      <div class="sbf"><div class="u"><span class="avatar">${esc(initials)}</span><div class="txt"><b>${esc(uname)}</b><span>${esc(cap(USER.rol || ""))} · acceso ${USER.rol === "direccion" ? "global" : "de módulo"}</span></div></div></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="iconbtn" data-act="mtoggle" aria-label="Menú">${ic("menu")}</button>
        ${fijado
          ? `<span class="pick fijo" title="Tu usuario está asignado a este establecimiento"><span class="dot"></span><span class="lbl">${esc(estabLbl)}</span></span>`
          : `<button class="pick" data-act="estabmenu" title="Cambiar establecimiento"><span class="dot"></span><span class="lbl">${esc(estabLbl)}</span><span class="car">▾</span></button>`}
        ${seg ? `<div class="seg hidesm">${seg}</div>` : ""}
        <button class="sbtn hidesm" data-act="cmdk">${ic("search", 16)}<span>Buscar o ir a…</span><span class="kbd">⌘K</span></button>
        <div class="spacer"></div>
        <span id="waPill" class="gstat"><span class="sdot st-off"></span>WhatsApp…</span>
        <button class="iconbtn bell hidesm" data-view="dashboard" aria-label="Alertas">${ic("bell")}${DASH_CONCERNS ? `<span class="n">${DASH_CONCERNS}</span>` : ""}</button>
        <button class="iconbtn" id="themeBtn" data-act="theme" aria-label="Cambiar tema">${ic(isDark() ? "moon" : "sun")}</button>
        <span class="avatar" title="${esc(uname)}">${esc(initials)}</span>
        <button class="iconbtn" data-act="logout" title="Cerrar sesión" aria-label="Cerrar sesión">${ic("exit")}</button>
      </header>
      <main class="content"><div class="wrap enter" id="view">${bodyHtml}</div></main>
    </div>
    <div class="mscrim" data-act="mclose"></div></div>`;
}
function skeleton() {
  return `<div class="ph"><div class="sk" style="width:120px;height:12px;margin-bottom:10px"></div><div class="sk" style="width:280px;height:26px"></div></div>
    <div class="grid g4">${Array(4).fill('<div class="card"><div class="sk" style="width:60%;height:12px"></div><div class="sk" style="width:50%;height:26px;margin-top:12px"></div></div>').join("")}</div>
    <div class="grid g2" style="margin-top:16px">${Array(2).fill('<div class="card"><div class="sk" style="width:40%;height:14px"></div><div class="sk" style="height:120px;margin-top:14px"></div></div>').join("")}</div>`;
}
function errorCard(msg) { return `<div class="card"><div class="ch"><h3>No se pudo cargar</h3></div><p class="mut">${esc(msg)}</p><button class="btn primary" data-act="reload">Reintentar</button></div>`; }
/**
 * La tarjeta de cifra. `sub` es texto libre debajo; `delta` es la comparación con el periodo
 * anterior ({ pct, contra }), que se pinta con flecha y color.
 *
 * Antes había DOS funciones para esto —`stat()` y `kpi()`, con firmas distintas: una recibía el
 * icono ya en HTML y la otra su nombre—, y solo la segunda sabía comparar. Resultado: el panel
 * entero usaba la que no compara y el componente de comparación se quedó en un único KPI de
 * todo el sistema. Ahora hay una sola, y `kpi()` es una envoltura suya.
 */
function stat(lab, icon, val, unit, sub, delta) {
  const d = delta && delta.pct != null ? deltaEl(delta.pct, delta.contra) : "";
  return `<div class="card stat"><div class="lab"><span class="ci">${icon}</span>${lab}</div>
    <div class="val tnum">${val}${unit ? ` <small>${unit}</small>` : ""}</div>${d}${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}
function kpi({ lab, icon, val, unit, delta, contra, sub }) {
  return stat(lab, ic(icon, 15), val, unit, sub, delta != null ? { pct: delta, contra } : null);
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const diaDeLaSemana = (iso) => new Date(String(iso).slice(0, 10) + "T12:00:00Z").getUTCDay();

/**
 * Lo de hoy contra «un día normal de la misma semana»: la media de los mismos días de las
 * semanas anteriores. Es la comparación que hace cualquiera —un martes se compara con otros
 * martes, no con el lunes— y la única honesta en hostelería, donde el día de la semana manda.
 *
 * `serie` son los últimos 30 días, y los días SIN reservas no vienen en la lista: cuentan como
 * cero, que es lo que fueron. Pero solo se cuentan los que caen dentro de lo que la serie
 * cubre: si el local lleva diez días abierto, las semanas anteriores no son «cero reservas»,
 * son «no existíamos», y compararse contra eso daría un +300 % de mentira.
 */
function deltaMismoDiaSemana(serie, hoyISO, campo) {
  if (!Array.isArray(serie) || !serie.length || !hoyISO) return null;
  const mapa = new Map(serie.map((x) => [String(x.dia).slice(0, 10), Number(x[campo]) || 0]));
  const primero = serie.map((x) => String(x.dia).slice(0, 10)).sort()[0];
  const previos = [7, 14, 21, 28].map((n) => addDaysStr(hoyISO, -n)).filter((f) => f >= primero);
  if (previos.length < 2) return null;                       // con uno solo no hay «normal»
  const media = previos.reduce((s, f) => s + (mapa.get(f) || 0), 0) / previos.length;
  const pct = media > 0 ? Math.round(((Number(mapa.get(hoyISO) || 0) - media) / media) * 1000) / 10 : null;
  if (pct == null) return null;
  return { pct, contra: `vs un ${DIAS_SEMANA[diaDeLaSemana(hoyISO)]} normal` };
}
// Se llama en CADA cambio de vista. Que Sara esté conectada no cambia entre dos clics, así que
// la respuesta vale 30 s: si no, cada navegación arrastraba una petición extra compitiendo por
// la conexión con la que sí trae los datos de la pantalla.
let WA_PILL = { hasta: 0, ok: null };
function pintarWaPill(ok) {
  const p = document.getElementById("waPill"); if (!p) return;
  p.innerHTML = `<span class="sdot ${ok ? "st-ok" : "st-crit"}"></span>${ok ? "Sara conectada" : "Sara caída"}`;
}
async function refreshWaPill(forzar = false) {
  if (!forzar && WA_PILL.ok !== null && Date.now() < WA_PILL.hasta) return pintarWaPill(WA_PILL.ok);
  try {
    const r = await fetch("/api/whatsapp/status", { headers: { Authorization: "Bearer " + token() } });
    const j = await r.json();
    WA_PILL = { ok: !!(j && j.connected), hasta: Date.now() + 30000 };
    pintarWaPill(WA_PILL.ok);
  } catch { /* opcional: si falla, la píldora se queda como estaba */ }
}

// ── Modal ligero ─────────────────────────────────────────────────────────────
function modal(title, bodyHtml) {
  const ov = document.createElement("div"); ov.className = "modal-ov";
  ov.innerHTML = `<div class="modal"><div class="modal-h"><b>${esc(title)}</b><button class="iconbtn" data-close aria-label="Cerrar">✕</button></div><div class="modal-b">${bodyHtml}</div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) ov.remove(); });
  return ov;
}
// Panel lateral. Entra desde la derecha y deja ver la lista de fondo: es lo que permite
// entender qué se está filtrando mientras se toca, cosa que un modal centrado impide.
// Devuelve el nodo; quien lo abre decide qué hacer con «Aplicar» y «Quitar filtros».
function drawer(titulo, cuerpoHtml, { aplicar = "Aplicar", limpiar = "Quitar filtros", onAplicar, onLimpiar } = {}) {
  const ov = document.createElement("div");
  ov.className = "drw-ov";
  ov.innerHTML = `<aside class="drw" role="dialog" aria-label="${esc(titulo)}">
    <div class="drw-h"><h3>${esc(titulo)}</h3><button class="iconbtn" data-close aria-label="Cerrar">✕</button></div>
    <div class="drw-b">${cuerpoHtml}</div>
    <div class="drw-f"><button class="btn" data-limpiar>${esc(limpiar)}</button><button class="btn primary" data-aplicar>${esc(aplicar)}</button></div>
  </aside>`;
  document.body.appendChild(ov);
  // Un fotograma antes de la clase, para que la transición de entrada se vea.
  requestAnimationFrame(() => ov.classList.add("on"));
  const cerrar = () => { ov.classList.remove("on"); setTimeout(() => ov.remove(), 200); };
  ov.cerrar = cerrar;
  ov.addEventListener("click", (e) => {
    if (e.target === ov || e.target.closest("[data-close]")) return cerrar();
    if (e.target.closest("[data-limpiar]")) return onLimpiar && onLimpiar(ov);
    if (e.target.closest("[data-aplicar]")) return onAplicar && onAplicar(ov);
  });
  // Las píldoras de selección múltiple se encienden y apagan solas.
  ov.addEventListener("click", (e) => {
    const p = e.target.closest(".drw-pill");
    if (p) p.classList.toggle("on");
  });
  const esc0 = (e) => { if (e.key === "Escape") { cerrar(); document.removeEventListener("keydown", esc0); } };
  document.addEventListener("keydown", esc0);
  return ov;
}

// Confirmación in-app (sustituye confirm() nativo). Devuelve Promise<boolean>.
function confirmModal(message, { ok = "Confirmar", danger = false } = {}) {
  return new Promise((resolve) => {
    const ov = modal("Confirmar", `<p style="margin:0 0 18px;line-height:1.55">${esc(message)}</p><div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(ok)}</button></div>`);
    ov.addEventListener("click", (e) => {
      if (e.target.closest("[data-ok]")) { ov.remove(); resolve(true); }
      else if (e.target === ov || e.target.closest("[data-close]")) resolve(false);
    });
  });
}
// Entrada de texto in-app (sustituye prompt() nativo). Devuelve Promise<string|null>.
function promptModal(title, { placeholder = "", type = "text", ok = "Guardar" } = {}) {
  return new Promise((resolve) => {
    const ov = modal(title, `<input id="__pm" type="${type}" placeholder="${esc(placeholder)}" style="width:100%;margin-bottom:16px" autocomplete="off"><div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>${esc(ok)}</button></div>`);
    const input = ov.querySelector("#__pm"); if (input) setTimeout(() => input.focus(), 30);
    const submit = () => { const v = input ? input.value.trim() : ""; ov.remove(); resolve(v || null); };
    ov.addEventListener("click", (e) => { if (e.target.closest("[data-ok]")) submit(); else if (e.target === ov || e.target.closest("[data-close]")) resolve(null); });
    if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  });
}

// ── Selector de fecha propio (dpField) ───────────────────────────────────────
// Sustituye a <input type="date">: botón con el mismo look que los <select> + calendario
// emergente nuestro (el del sistema es feo y distinto en cada navegador). El valor sigue
// viviendo en un input oculto con el id de siempre, así que `document.getElementById(id).value`
// y los `querySelectorAll("[data-fic]")` de las fichas siguen funcionando igual.
const DP_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DP_MESC = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DP_DOW = ["L", "M", "X", "J", "V", "S", "D"];
const dp2 = (n) => String(n).padStart(2, "0");
function dpDim(y, m) { return m === 2 ? (((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
function dpFmt(iso) { const p = String(iso || "").split("-"); return p.length === 3 ? `${Number(p[2])} ${DP_MESC[Number(p[1]) - 1]} ${p[0]}` : ""; }
// dpField("facFrom", "2026-08-01", "Cualquiera", { min, max, attr: 'data-fic="fecha"' })
function dpField(id, value, ph = "Cualquiera", opts = {}) {
  const v = String(value || "").slice(0, 10);
  const lim = `${opts.min ? ` data-min="${esc(opts.min)}"` : ""}${opts.max ? ` data-max="${esc(opts.max)}"` : ""}`;
  return `<div class="dp"><input type="hidden" id="${esc(id)}" value="${esc(v)}"${lim} ${opts.attr || ""}>
    <button type="button" class="dpt${v ? "" : " ph"}" data-act="dp-open" data-for="${esc(id)}" data-ph="${esc(ph)}" aria-haspopup="dialog">
      <span class="dpi">${ic("cal", 15)}</span><span class="dpl">${v ? esc(dpFmt(v)) : esc(ph)}</span>
      ${v ? `<span class="dpx" data-act="dp-clear" data-for="${esc(id)}" role="button" aria-label="Quitar fecha" title="Quitar fecha">✕</span>` : ""}
    </button></div>`;
}
let DP_POP = null;
function dpClose() { if (DP_POP) { DP_POP.remove(); DP_POP = null; } document.querySelectorAll(".dpt.on").forEach((b) => b.classList.remove("on")); }
// Escribe el valor, repinta el disparador y avisa con un `change` (así el filtrado en vivo se entera).
function dpSet(id, iso) {
  const inp = document.getElementById(id); if (!inp) return;
  inp.value = iso || "";
  const btn = document.querySelector(`.dpt[data-for="${id}"]`);
  if (btn) {
    btn.classList.toggle("ph", !iso);
    btn.querySelector(".dpl").textContent = iso ? dpFmt(iso) : (btn.getAttribute("data-ph") || "Cualquiera");
    const x = btn.querySelector(".dpx");
    if (iso && !x) btn.insertAdjacentHTML("beforeend", `<span class="dpx" data-act="dp-clear" data-for="${esc(id)}" role="button" aria-label="Quitar fecha" title="Quitar fecha">✕</span>`);
    if (!iso && x) x.remove();
  }
  inp.dispatchEvent(new Event("change", { bubbles: true }));
}
function dpOpen(btn) {
  const id = btn.getAttribute("data-for");
  const inp = document.getElementById(id); if (!inp) return;
  const yaAbierto = DP_POP && DP_POP.getAttribute("data-for") === id;
  dpClose(); if (yaAbierto) return; // segundo clic = cerrar
  const pop = document.createElement("div");
  pop.className = "dpop"; pop.setAttribute("role", "dialog");
  pop.setAttribute("data-for", id);
  pop.setAttribute("data-cur", (inp.value || todayStr()).slice(0, 7));
  document.body.appendChild(pop);
  DP_POP = pop; btn.classList.add("on");
  pop.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-dpnav]");
    if (nav) {
      const [y, m] = pop.getAttribute("data-cur").split("-").map(Number);
      const t = m + Number(nav.getAttribute("data-dpnav")) - 1;
      pop.setAttribute("data-cur", `${y + Math.floor(t / 12)}-${dp2(((t % 12) + 12) % 12 + 1)}`);
      dpDraw(); return;
    }
    const q = e.target.closest("[data-dpq]");
    if (q) { dpSet(id, q.getAttribute("data-dpq") === "hoy" ? todayStr() : ""); dpClose(); return; }
    const d = e.target.closest("[data-iso]");
    if (d && !d.disabled) { dpSet(id, d.getAttribute("data-iso")); dpClose(); }
  });
  dpDraw();
  dpPos(btn);
}
function dpPos(btn) {
  if (!DP_POP) return;
  const r = btn.getBoundingClientRect(), w = DP_POP.offsetWidth || 286, h = DP_POP.offsetHeight || 330;
  const left = Math.max(10, Math.min(r.left, window.innerWidth - w - 10));
  const top = (r.bottom + 6 + h > window.innerHeight - 10 && r.top - h - 6 > 10) ? r.top - h - 6 : r.bottom + 6;
  DP_POP.style.left = left + "px"; DP_POP.style.top = top + "px";
}
function dpDraw() {
  const pop = DP_POP; if (!pop) return;
  const id = pop.getAttribute("data-for"), inp = document.getElementById(id);
  const sel = inp ? inp.value : "";
  const min = (inp && inp.getAttribute("data-min")) || "", max = (inp && inp.getAttribute("data-max")) || "";
  const [y, m] = pop.getAttribute("data-cur").split("-").map(Number);
  const hoy = todayStr();
  const off = periodoDiaSemanaLunes(`${y}-${dp2(m)}-01`); // 0 = lunes
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y, pdim = dpDim(py, pm);
  const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
  const celdas = [];
  for (let i = off; i > 0; i--) celdas.push({ y: py, m: pm, d: pdim - i + 1, out: true });
  for (let d = 1; d <= dpDim(y, m); d++) celdas.push({ y, m, d, out: false });
  for (let d = 1; celdas.length < 42; d++) celdas.push({ y: ny, m: nm, d, out: true });
  const dias = celdas.map((c) => {
    const iso = `${c.y}-${dp2(c.m)}-${dp2(c.d)}`;
    const off2 = (min && iso < min) || (max && iso > max);
    const cls = [c.out ? "out" : "", iso === hoy ? "today" : "", iso === sel ? "sel" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${cls}" data-iso="${iso}"${off2 ? " disabled" : ""}>${c.d}</button>`;
  }).join("");
  pop.innerHTML = `<div class="dph"><b class="dpm">${cap(DP_MES[m - 1])} ${y}</b><div class="dpnav"><button type="button" data-dpnav="-1" aria-label="Mes anterior">‹</button><button type="button" data-dpnav="1" aria-label="Mes siguiente">›</button></div></div>
    <div class="dpg">${DP_DOW.map((d) => `<span class="dpw">${d}</span>`).join("")}${dias}</div>
    <div class="dpf"><button type="button" data-dpq="hoy">Hoy</button><button type="button" data-dpq="clear">Quitar</button></div>`;
}
document.addEventListener("mousedown", (e) => { if (DP_POP && !e.target.closest(".dpop") && !e.target.closest(".dpt")) dpClose(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") dpClose(); });
window.addEventListener("resize", dpClose);
window.addEventListener("scroll", dpClose, true);

// ════════════════════════ ESTADO GLOBAL + COMPONENTES (lenguaje del prototipo) ════════════════════════
let DASH_LOCAL = "", SELECCION = [], COLLAPSED = false, PERIOD = "semana", DASH_CONCERNS = 0;

/**
 * EL PERIODO ES DE CADA PANTALLA, y solo lo tienen las que miran fechas.
 *
 * Antes era uno solo y únicamente lo obedecía el Dashboard: en Productos podías poner
 * «6 may – 15 may» en la barra y seguir viendo las compras de julio. El control estaba ahí,
 * se movía, y no hacía nada — que es peor que no tenerlo, porque te crees el número.
 *
 * Y no puede ser el MISMO periodo para todas: en el Dashboard la pregunta es «cómo va esta
 * semana» y en Productos es «qué compramos», que de entrada es TODO y se acota si hace falta.
 * Compartirlo obligaba a que una de las dos mintiera.
 */
const GRUPO_PERIODO = { dashboard: "dashboard", facturas: "compras", productos: "compras" };
const grupoPeriodo = (v) => GRUPO_PERIODO[v || CURRENT] || null;
// «todo» = sin filtro de fechas. Es lo que se quiere al entrar en Compras y en Productos.
let PERIODO_VISTA = { facturas: "todo", productos: "todo" };

// Dónde vive el rango de cada pantalla: Compras filtra con FACF y Productos con COMP, que son
// los mismos campos que usan sus filtros. Así la barra y el panel de filtros no se contradicen.
function periodoVista(v) {
  const vista = v || CURRENT;
  if (grupoPeriodo(vista) !== "compras") return { p: PERIOD, from: DASH_RANGE.from || "", to: DASH_RANGE.to || "" };
  const f = vista === "productos" ? COMP : FACF;
  // El botón encendido se deduce del rango DE VERDAD, no de lo último que se pulsó: las fechas
  // también se pueden poner desde el panel de «Filtros», y la barra tiene que decir lo mismo.
  const guardado = PERIODO_VISTA[vista] || "todo";
  const p = (!f.from && !f.to) ? "todo" : (guardado === "todo" ? "custom" : guardado);
  return { p, from: f.from || "", to: f.to || "" };
}
function fijarPeriodoVista(p, from, to, label) {
  if (grupoPeriodo() !== "compras") { PERIOD = p; DASH_RANGE = { from, to, label }; return; }
  PERIODO_VISTA[CURRENT] = p;
  const f = CURRENT === "productos" ? COMP : FACF;
  f.from = from || ""; f.to = to || "";
}
// El selector de la barra, repintado solo. Cambiar las fechas desde el panel de «Filtros»
// dejaba la barra diciendo «Todo» con un rango puesto.
function repintarSeg() {
  const cont = document.querySelector(".topbar .seg");
  if (!cont) return;
  const per = periodoVista();
  const presets = grupoPeriodo() === "compras"
    ? [["todo", "Todo"], ["semana", "Semana"], ["mes", "Mes"]]
    : [["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Semana"], ["mes", "Mes"]];
  const customLbl = (per.p === "custom" && per.from) ? `${esc(fechaCorta(per.from))} – ${esc(fechaCorta(per.to))}` : "Personalizado";
  cont.innerHTML = presets.map(([p, l]) => `<button class="${per.p === p ? "on" : ""}" data-act="period" data-p="${p}">${l}</button>`).join("")
    + `<button class="${per.p === "custom" ? "on" : ""}" data-act="period-custom" title="Elegir fechas">${customLbl}</button>`;
}

// Volver a pedir los datos con el periodo nuevo. Sin esto el rótulo cambiaba y la lista no.
function recargarPorPeriodo() {
  if (CURRENT === "dashboard") return loadDashboard();
  if (CURRENT === "productos") return loadProductos();
  if (CURRENT === "facturas") return loadFacturas();
}

/**
 * El trabajo pendiente de cada módulo, para que se vea en el menú SIN entrar. Hasta ahora solo
 * el Dashboard llevaba número, y encima solo se sabía después de abrirlo.
 *
 * Sale del propio dashboard, que ya calcula todo esto: no hay ni una consulta nueva. Y si no se
 * ha cargado todavía no se pinta nada — un cero que en realidad es «no lo sé» es peor que no
 * poner nada, porque se lee como «no hay trabajo».
 */
let PENDIENTES = {}, PENDIENTES_TXT = {};
function fijarPendientes(d) {
  if (!d) return;
  const n = (x) => (Number(x) > 0 ? Number(x) : 0);
  PENDIENTES = {
    dashboard: n((d.preocupaciones || []).length),
    mantenimiento: n(d.mantenimiento && d.mantenimiento.abiertas),
    reviews: n(d.resenas && d.resenas.sinResponder),
  };
  PENDIENTES_TXT = {
    dashboard: "Cosas que mirar hoy",
    mantenimiento: "Incidencias abiertas",
    reviews: "Reseñas sin responder",
  };
  DASH_CONCERNS = PENDIENTES.dashboard;
}
let DASH_RANGE = { from: null, to: null, label: "Esta semana" };
let DASH_PERIODO = null;
// Reflejo puro de src/modules/dashboard/periodos.js
function periodoDiaSemanaLunes(iso) { const [y, m, d] = String(iso).split("-").map(Number); const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]; const yy = m < 3 ? y - 1 : y; return (((yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1] + d) % 7) + 6) % 7; }
function rangoPreset(preset, hoy) {
  switch (String(preset)) {
    case "hoy": return { preset: "hoy", from: hoy, to: hoy, label: "Hoy" };
    case "ayer": { const a = addDaysStr(hoy, -1); return { preset: "ayer", from: a, to: a, label: "Ayer" }; }
    case "semana": { const l = addDaysStr(hoy, -periodoDiaSemanaLunes(hoy)); return { preset: "semana", from: l, to: hoy, label: "Esta semana" }; }
    case "mes": { const m1 = hoy.slice(0, 8) + "01"; return { preset: "mes", from: m1, to: hoy, label: "Este mes" }; }
    default: { const l = addDaysStr(hoy, -periodoDiaSemanaLunes(hoy)); return { preset: "semana", from: l, to: hoy, label: "Esta semana" }; }
  }
}
const nombreCorto = (s) => String(s || "").split(" ")[0];
const nombreCortoLocal = (l) => String(l || "").replace(/^La Tapeta\s*[-·]\s*/i, "").trim() || l;
const GO_VIEW = { whatsapp: "whatsapp", mantenimiento: "mantenimiento", clientes: "clientes", facturas: "facturas", rrhh: "rrhh", marketing: "reviews", reservas: "reservas", reviews: "reviews", campanas: "campanas" };
const ICN_TIPO = { whatsapp: "chat", mantenimiento: "wrench", facturas: "receipt", resenas: "star", clientes: "users", proveedores: "receipt", rrhh: "idcard" };
function saludoHora() { const h = new Date().getHours(); return h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches"; }
const signed2 = (v) => (v >= 0 ? "+" : "−") + Math.abs(Number(v) || 0).toFixed(1) + "%";

// ── Iconos SVG (sustituyen a los emojis) ──
const ICONS = {
  dash: '<path d="M4 13h7V4H4zM13 20h7v-9h-7zM13 4v5h7V4zM4 20h7v-5H4z"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
  chart: '<path d="M4 20h16M7 20v-6M12 20V8M17 20v-9"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/>',
  wrench: '<path d="M15 6.5a3.8 3.8 0 0 0-5 5L4 17.5V20h2.5l6-6a3.8 3.8 0 0 0 5-5l-2.4 2.4-2-2z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 6M15.5 20a5 5 0 0 1 5-3.4"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M13.5 9.5h4M13.5 13h4M5 15.5a3.5 3.5 0 0 1 7 0"/>',
  receipt: '<path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.6zM9.5 8h5M9.5 12h5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  mkt: '<path d="M4 10v4h3l6 4V6l-6 4zM17 9.5a3 3 0 0 1 0 5"/>',
  chat: '<path d="M4 5h16v11H9l-4 3z"/><path d="M8 9.5h8M8 12.5h5"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M4.5 6.5l2.1 2.1M17.4 17.4l2.1 2.1M3 12h3M18 12h3M4.5 17.5l2.1-2.1M17.4 6.6l2.1-2.1"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M9.5 20a2.5 2.5 0 0 0 5 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  moon: '<path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z"/>',
  euro: '<path d="M17 6.5a6 6 0 1 0 0 11M5 10h8M5 14h8"/>',
  alert: '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"/>',
  exit: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 12h11M16.5 8.5L20 12l-3.5 3.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M12 8V4.5M8.5 13h.01M15.5 13h.01M9.5 16h5M2.5 12.5v2M21.5 12.5v2"/><circle cx="12" cy="4" r="1.3"/>',
  clip: '<path d="M20 11l-8.5 8.5a4 4 0 0 1-5.7-5.7L14 5.6a2.6 2.6 0 0 1 3.7 3.7l-8.3 8.3a1.2 1.2 0 0 1-1.7-1.7l7.6-7.6"/>',
  mega: '<path d="M3 11l12-5v12L3 13zM3 11v3M15 8.5a3 3 0 0 1 0 7M6.5 13.5V17a1.5 1.5 0 0 0 3 0v-2.6"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v2a6 6 0 0 1-12 0zM12 16v6"/>',
};
function ic(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.dash}</svg>`; }

// ── Componentes ──
/**
 * La comparación de una cifra con la de antes. Flechas ↗/↘ y no ↑/↓: una diagonal se lee como
 * tendencia y una vertical como orden (subir/bajar en una lista).
 *
 * `contra` es contra QUÉ se compara, y no es decorativo: un «−12 %» sin decir respecto a cuándo
 * no se puede interpretar ni discutir. Si no hay con qué comparar no se pinta nada — que es
 * distinto de pintar un cero.
 */
function deltaEl(v, contra) {
  if (v == null || isNaN(v)) return "";
  const up = v >= 0, plano = Math.abs(v) < 0.5;
  return `<span class="delta ${plano ? "flat" : up ? "up" : "down"}">${plano ? "=" : up ? "↗" : "↘"} ${signed2(v)}${contra ? ` <span class="mut" style="font-weight:500">${esc(contra)}</span>` : ""}</span>`;
}
function estadoState(e) {
  if (e.incidenciasAbiertas >= 3) return { k: "crit", t: "Requiere atención" };
  if (e.incidenciasAbiertas > 0) return { k: "warn", t: "Con incidencias" };
  if (e.hoyPersonas > 0) return { k: "ok", t: "Activo hoy" };
  return { k: "off", t: "Sin actividad" };
}
function attRow(c) {
  const sevMap = { crit: ["bad", "Crítico"], imp: ["warn", "Importante"], info: ["info", "A vigilar"] };
  const [k, lab] = sevMap[c.sev] || ["info", "A vigilar"]; const view = GO_VIEW[c.go];
  return `<div class="att"><div class="ic ${k}">${ic(ICN_TIPO[c.tipo] || "alert", 18)}</div><div class="grow"><b>${c.titulo}</b><p>${c.decision || c.narrativa}</p><div class="meta"><span>${lab}</span></div></div>${view ? `<button class="btn sm" data-view="${view}">Abrir</button>` : ""}</div>`;
}
// Gráfico de área SVG (línea + relleno), con el dato al pasar el ratón.
//
// `data` puede ser un array de números (como siempre) o un objeto
// { valores, etiquetas, extra } donde `extra` es una segunda cifra por punto —lo que se
// facturó ese día, típicamente— que se enseña debajo en el globo.
//
// El globo hace falta porque un gráfico sin números concretos solo sirve para ver la forma,
// y la pregunta que se hace de verdad al mirarlo es «¿y el sábado cuánto fue?».
function area(data, { h = 120, fmt = (v) => num(v), fmtExtra = (v) => eur(v), sufijo = "" } = {}) {
  const cfg = Array.isArray(data) ? { valores: data } : (data || {});
  const vals = (cfg.valores || []).map((v) => Number(v) || 0);
  const etiquetas = cfg.etiquetas || [];
  const extra = cfg.extra || null;
  const w = 640;
  if (vals.length < 2) return `<div class="mut" style="height:${h}px;display:grid;place-items:center;font-size:13px">Sin datos suficientes para el gráfico</div>`;
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0), rng = (max - min) || 1;
  const X = (i) => (i / (vals.length - 1)) * w, Y = (v) => h - 8 - ((v - min) / rng) * (h - 16);
  let d = ""; vals.forEach((v, i) => { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) + " "; });
  const gid = "g" + Math.abs(vals.reduce((s, v, i) => s + v * (i + 1), 7) | 0) % 100000;

  // Los puntos ya formateados viajan en el propio nodo: así el globo no depende de que
  // el estado del panel siga igual cuando alguien pasa el ratón medio minuto después.
  const puntos = vals.map((v, i) => ({
    x: +((i / (vals.length - 1)) * 100).toFixed(3),           // % del ancho, no píxeles
    et: etiquetas[i] || "",
    v: fmt(v) + (sufijo ? " " + sufijo : ""),
    ex: extra && extra[i] != null ? fmtExtra(extra[i]) : null,
  }));

  return `<div class="chart" data-puntos='${esc(JSON.stringify(puntos))}'>
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" style="display:block">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".22"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
      <path d="${d}L ${w} ${h} L 0 ${h} Z" fill="url(#${gid})"/>
      <path d="${d}" fill="none" stroke="var(--brand)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle class="ep" cx="${X(vals.length - 1).toFixed(1)}" cy="${Y(vals[vals.length - 1]).toFixed(1)}" r="3.5"/>
    </svg>
    <div class="chart-guia"></div><div class="chart-tip"></div></div>`;
}

// Un solo escuchador para todos los gráficos del panel, puesto una vez. El HTML de las
// vistas se repinta entero a cada rato, así que enganchar por gráfico acabaría dejando
// escuchadores muertos por todas partes.
(function graficoInteractivo() {
  let activo = null;
  const cerrar = () => { if (activo) { activo.classList.remove("on"); activo = null; } };

  document.addEventListener("mousemove", (e) => {
    const chart = e.target.closest?.(".chart");
    if (!chart) return cerrar();
    let puntos;
    try { puntos = JSON.parse(chart.getAttribute("data-puntos") || "[]"); } catch { return; }
    if (!puntos.length) return;

    const r = chart.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    // El punto más cercano, no el de la izquierda: pasando el ratón por el medio entre dos
    // días, el que se enseña tiene que ser el que se tiene debajo.
    let mejor = 0, dist = Infinity;
    puntos.forEach((p, i) => { const d = Math.abs(p.x - pct); if (d < dist) { dist = d; mejor = i; } });
    const p = puntos[mejor];

    const guia = chart.querySelector(".chart-guia");
    const tip = chart.querySelector(".chart-tip");
    guia.style.left = p.x + "%";
    tip.innerHTML = `${p.et ? `<b>${p.et}</b>` : ""}<span>${p.v}</span>${p.ex ? `<span class="ex">${p.ex}</span>` : ""}`;
    // El globo se pega al lado que tenga sitio, para que no se salga por los bordes.
    tip.style.left = p.x + "%";
    tip.classList.toggle("izq", p.x > 70);
    tip.classList.toggle("der", p.x < 30);
    chart.classList.add("on");
    activo = chart;
  });
  document.addEventListener("mouseleave", cerrar, true);
})();
// Barras de ventas por día (Ágora). Usa el mismo globo que el gráfico de área: antes
// llevaba un `title` del navegador, que tarda un segundo en salir y no se puede leer de
// un vistazo mientras se recorre la semana con el ratón.
function barrasDia(dias, { hoy = null } = {}) {
  const list = (dias || []).filter(Boolean);
  if (!list.length) return `<div class="mut" style="font-size:12px">Sin días previos</div>`;
  const maxV = Math.max(1, ...list.map((d) => Number(d.ventas) || 0));
  const puntos = list.map((d, i) => ({
    x: +(((i + 0.5) / list.length) * 100).toFixed(3),
    et: fechaCorta(d.dia) + (d.dia === hoy ? " · en curso" : ""),
    v: eur(d.ventas || 0),
    ex: d.tickets ? `${num(d.tickets)} tickets · ${eur(d.ticket_medio || 0)}/tk` : null,
  }));
  const barras = list.map((d) => {
    const alto = Math.round(((Number(d.ventas) || 0) / maxV) * 46) + 2;
    const esHoy = d.dia === hoy;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1">
      <div style="width:100%;max-width:26px;height:${alto}px;border-radius:4px 4px 0 0;background:${esHoy ? "var(--brand)" : "var(--brand2)"};opacity:${esHoy ? 1 : 0.75}"></div>
      <div class="mut" style="font-size:10px">${esc(String(d.dia).slice(8, 10))}</div></div>`;
  }).join("");
  return `<div class="chart" data-puntos='${esc(JSON.stringify(puntos))}'>
    <div style="display:flex;align-items:flex-end;gap:5px;height:64px">${barras}</div>
    <div class="chart-guia"></div><div class="chart-tip"></div></div>`;
}

// Barras verticales. items = [{label, value}].
function bars(items, { fmt = (v) => num(v) } = {}) {
  const list = items || []; if (!list.length) return `<div class="mut" style="padding:10px 0">Sin datos</div>`;
  const max = Math.max(...list.map((i) => i.value), 1);
  return `<div style="display:flex;align-items:flex-end;gap:10px;height:150px">${list.map((it) => `<div class="barcol"><span class="tnum" style="font-size:11px;font-weight:600">${fmt(it.value)}</span><span style="width:100%;flex:1;display:flex;align-items:flex-end"><i style="display:block;width:100%;height:${Math.round((it.value / max) * 100)}%;min-height:3px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,var(--brand),var(--brand2))"></i></span><span class="mut" style="font-size:11px;text-align:center;line-height:1.2">${esc(it.label)}</span></div>`).join("")}</div>`;
}

// ── Paleta de comandos (⌘K) ──
let CMD_ITEMS = [], CMD_SEL = 0;
function allCmd() {
  const items = [];
  // `k` son palabras extra por las que también se encuentra: el departamento y el nombre viejo.
  // Sin esto, buscar «mantenimiento» o «rrhh» no encontraría «Incidencias» ni «Equipo».
  const ALIAS = { rrhh: "rr hh recursos humanos personal", mantenimiento: "mantenimiento averias", facturas: "gastos proveedores", analitica: "ventas", reviews: "google opiniones", inventarios: "stock pedidos" };
  NAV.forEach((grp) => grp.items.forEach(([id, label, icon]) => {
    if (puedeVer(id)) items.push({ t: label, g: "Ir a", k: `${grp.g} ${ALIAS[id] || ""}`, icon, view: id });
  }));
  const actions = [
    ["Nueva reserva", "cal", ["direccion", "encargado"], () => { go("reservas"); setTimeout(openNuevaReserva, 80); }],
    ["Nueva incidencia", "wrench", ["direccion", "encargado"], () => { go("mantenimiento"); setTimeout(openNuevaIncidencia, 80); }],
    ["Actualizar reseñas", "star", ["direccion"], () => { go("reviews"); setTimeout(refreshReviews, 80); }],
    ["Cambiar tema", "sun", null, () => toggleTheme()],
  ];
  actions.forEach(([t, icon, roles, fn]) => { if (!roles || roles.includes(USER.rol)) items.push({ t, g: "Acciones", icon, fn }); });
  return items;
}
function openCmd() { const w = document.getElementById("cmdk"), o = document.getElementById("ovl"); if (!w) return; o.classList.add("open"); w.classList.add("open"); const inp = document.getElementById("cmdin"); inp.value = ""; fillCmd(""); setTimeout(() => inp.focus(), 30); }
function closeCmd() { const w = document.getElementById("cmdk"), o = document.getElementById("ovl"); if (w) w.classList.remove("open"); if (o) o.classList.remove("open"); }
function fillCmd(q) {
  q = (q || "").toLowerCase().trim();
  CMD_ITEMS = allCmd().filter((c) => !q || `${c.t} ${c.g} ${c.k || ""}`.toLowerCase().includes(q)); CMD_SEL = 0;
  const groups = {}; CMD_ITEMS.forEach((c, i) => { (groups[c.g] = groups[c.g] || []).push({ ...c, i }); });
  const html = Object.entries(groups).map(([g, arr]) => `<div class="cg">${g}</div>` + arr.map((c) => `<button class="cr ${c.i === CMD_SEL ? "sel" : ""}" data-cmd="${c.i}"><span class="ci2">${ic(c.icon, 16)}</span><span>${esc(c.t)}</span></button>`).join("")).join("");
  document.getElementById("cmdl").innerHTML = html || `<div class="cg">Sin resultados</div>`;
}
function cmdMove(dir) { if (!CMD_ITEMS.length) return; CMD_SEL = (CMD_SEL + dir + CMD_ITEMS.length) % CMD_ITEMS.length; document.querySelectorAll("#cmdl .cr").forEach((el) => el.classList.toggle("sel", +el.getAttribute("data-cmd") === CMD_SEL)); const sel = document.querySelector("#cmdl .cr.sel"); if (sel) sel.scrollIntoView({ block: "nearest" }); }
function runCmd(i) { const c = CMD_ITEMS[i]; if (!c) return; closeCmd(); if (c.view) go(c.view); else if (c.fn) c.fn(); }

// ── Drawer lateral (selector de establecimiento) ──
function openDrawer(title, bodyHtml) { document.getElementById("drawerTitle").textContent = title; document.getElementById("drawerBody").innerHTML = bodyHtml; document.getElementById("ovl").classList.add("open"); document.getElementById("drawer").classList.add("open"); }
function closeDrawer() { const d = document.getElementById("drawer"), o = document.getElementById("ovl"); if (d) d.classList.remove("open"); if (o) o.classList.remove("open"); }
function openEstabMenu() {
  // En Reservas y Analítica no ofrecemos los centros sin público: no tendrían datos.
  const fijado = localFijadoFE();
  if (fijado) return;   // un solo local: no hay nada que elegir
  const mios = misLocales();
  const elegibles = MODULOS_SOLO_PUBLICO.has(CURRENT) ? localesBase().filter((l) => !sinPublico(l)) : localesBase();
  const marcados = new Set(viendoVarios() ? localesDelAmbito() : (localActualFE() ? [localActualFE()] : []));

  // Dos gestos en cada fila, y esa es toda la idea:
  //   · pulsar el NOMBRE  → ir solo a ese (el caso de siempre, un clic)
  //   · marcar la CASILLA → juntarlo con otros y pulsar «Ver los elegidos»
  // Con un solo control habría que elegir entre un clic extra para lo habitual o no poder
  // combinar; con dos, cada cosa cuesta lo que tiene que costar.
  const fila = (l) => {
    const activo = marcados.has(l);
    return `<div class="row">
      <button class="grow" data-act="estab-pick" data-local="${esc(l)}" style="display:flex;align-items:center;gap:13px;background:none;border:0;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer;min-width:0">
        <span class="sdot ${activo ? "st-ok" : "st-off"}"></span>
        <span class="t1">${esc(nombreCortoLocal(l))}</span>
      </button>
      ${DASH_LOCAL === l && !viendoVarios() ? '<span class="pill brand">Actual</span>' : ""}
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink3);cursor:pointer" title="Juntar con otros establecimientos">
        <input type="checkbox" data-act="estab-marca" data-local="${esc(l)}" ${activo ? "checked" : ""}> juntar
      </label>
    </div>`;
  };

  // «Todos» solo para dirección: al que tiene locales asignados no se le ofrece un ámbito que
  // el servidor no le va a dar.
  const todos = mios.length ? "" : `<div class="row">
    <button class="grow" data-act="estab-pick" data-local="" style="display:flex;align-items:center;gap:13px;background:none;border:0;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer">
      <span class="sdot ${DASH_LOCAL === "" ? "st-ok" : "st-off"}"></span>
      <span class="t1">Todos los establecimientos</span>
    </button>${DASH_LOCAL === "" ? '<span class="pill brand">Actual</span>' : ""}</div>`;

  const n = marcados.size;
  const pie = `<div style="padding:14px 16px;border-top:1px solid var(--border)">
    <button class="btn primary" data-act="estab-varios" style="width:100%" ${n > 1 ? "" : "disabled"}>${n > 1 ? `Ver los ${n} juntos` : "Marca dos o más para juntarlos"}</button>
    <div class="mut" style="font-size:11.5px;margin-top:8px">Pulsa el nombre para ir a uno solo. Marca «juntar» en varios para verlos sumados.</div>
  </div>`;

  openDrawer("Establecimiento", `<div class="rows">${todos}${elegibles.map(fila).join("")}</div>${pie}`);
}

// ════════════════════════ VISTA: DASHBOARD (ejecutivo) ════════════════════════
function renderDashboard(d) {
  const localName = d.scope && d.scope.local;
  fijarPendientes(d);
  // ── Cabecera ejecutiva ──
  // Con varios establecimientos, «todo el grupo» sería mentira: se dice cuáles son. El
  // servidor manda la etiqueta ya hecha («Lloret y Girona») junto a los datos sumados.
  const etiqueta = d.scope && d.scope.etiqueta;
  const ambito = localName ? "Estado de <b>" + esc(localName) + "</b>"
    : etiqueta ? "Estado de <b>" + esc(etiqueta) + "</b>, sumado"
    : "El estado de todo el grupo, de un vistazo.";
  const header = `<div class="ph"><div><div class="eyebrow">${saludoHora()}${USER.nombre ? ", " + esc(nombreCorto(USER.nombre)) : ""}</div><h1>Dashboard ejecutivo</h1><div class="sub">${ambito}${fechaLarga(d.fecha) ? " · " + fechaLarga(d.fecha) : ""}</div></div><div class="acts"><button class="btn" data-act="cmdk">${ic("search", 15)} Acción rápida</button></div></div>`;
  // ── Sara: veredicto del día ──
  const contexto = [d.ayer && d.ayer.disponible ? d.ayer.texto : "", d.hoy && d.hoy.disponible ? d.hoy.texto : ""].filter(Boolean).join(" ");
  const sara = `<div class="card hero" style="margin-bottom:16px"><div style="display:flex;gap:13px;align-items:flex-start"><span class="avatar" style="width:40px;height:40px;border-radius:12px">S</span><div style="flex:1;min-width:0"><b style="font-size:14px">Sara · dirección de operaciones</b><p style="font-size:18px;line-height:1.5;margin:8px 0 0;font-weight:500;letter-spacing:-.01em">${d.titular || contexto || "Sin datos suficientes para hoy."}</p>${contexto ? `<p class="mut" style="font-size:13px;margin:10px 0 0;line-height:1.6">${contexto}</p>` : ""}</div></div></div>`;
  // ── 4 KPIs reales ──
  const hoyN = (d.hoy && d.hoy.hoy) || {};
  const nCrit = (d.preocupaciones || []).filter((c) => c.tipo === "mantenimiento" && c.sev === "crit").length;
  // OJO con lo que se compara: esta tarjeta dice «Reservas HOY» y antes le pintaba el delta de
  // AYER (`d.ayer.delta`, que es ayer contra un día normal de esa semana). El número y su
  // comparación hablaban de días distintos y nadie lo notaba, porque no ponía contra qué.
  // Ahora se compara hoy con un día normal de la misma semana, y se dice con todas las letras.
  const cmpHoy = deltaMismoDiaSemana(d.serieReservas, d.fecha, "n");
  const cmpCom = deltaMismoDiaSemana(d.serieReservas, d.fecha, "personas");
  const kpis = `<div class="grid g4">${kpi({ lab: "Reservas hoy", icon: "cal", val: num(hoyN.n || 0), delta: cmpHoy && cmpHoy.pct, contra: cmpHoy && cmpHoy.contra })}${kpi({ lab: "Comensales hoy", icon: "users", val: num(hoyN.personas || 0), delta: cmpCom && cmpCom.pct, contra: cmpCom && cmpCom.contra })}${kpi({ lab: "Mantenim. abierto", icon: "wrench", val: num((d.mantenimiento && d.mantenimiento.abiertas) || 0), unit: nCrit ? `· ${nCrit} crítica${nCrit === 1 ? "" : "s"}` : "" })}${kpi({ lab: "Por pagar", icon: "euro", val: eur((d.dinero && d.dinero.porPagar && d.dinero.porPagar.total) || 0) })}</div>`;

  // ── Actividad (reservas + ventas del PERIODO seleccionado) ──
  const per = DASH_PERIODO || null;
  const winLbl = DASH_RANGE.label || "Esta semana";
  const rSerie = (per && per.reservas && per.reservas.serie) || [];
  const serieVals = rSerie.map((x) => x.personas || x.n || 0);
  const totalPeriodo = (per && per.reservas && per.reservas.total) || 0;
  const vOk = per && per.ventas && per.ventas.disponible;
  const gOk = per && per.gastos && per.gastos.disponible;
  const res = per ? per.resultado : null;
  const resCol = res == null ? "var(--ink)" : (res >= 0 ? "var(--brand)" : "var(--danger)");
  // La comparación con el periodo anterior la calcula el servidor (sabe que un mes se compara
  // con el mes anterior, no con «los 31 días de antes»). Si no la manda, no se pinta nada.
  const cmp = (per && per.comparacion) || null;
  const contra = cmp ? `vs ${cmp.etiqueta}` : "";
  // El rótulo va corto para que quepa dentro de la tarjeta; las fechas exactas de la
  // comparación se ven al pasar el ratón, que es donde se miran cuando se dudan.
  const cuando = cmp ? `Comparado con ${fechaCorta(cmp.desde)} – ${fechaCorta(cmp.hasta)}` : "";
  const stat3 = (lab, val, col, pct) => `<div style="min-width:0"><div class="mut" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em">${lab}</div><div class="big tnum" style="font-size:22px${col ? ";color:" + col : ""}">${val}</div>${pct != null ? `<div style="margin-top:2px" title="${esc(cuando)}">${deltaEl(pct, contra)}</div>` : ""}</div>`;
  const ventasBox = (vOk || gOk)
    ? `<div style="display:flex;gap:18px;flex-wrap:wrap;justify-content:flex-end;text-align:right">${stat3("Ventas", vOk ? eur(per.ventas.total) : "—", null, vOk && cmp ? cmp.ventas : null)}${stat3("Gastos", gOk ? eur(per.gastos.total) : "—", null, gOk && cmp ? cmp.gastos : null)}${stat3("Resultado", res != null ? eur(res) : "—", resCol, res != null && cmp ? cmp.resultado : null)}</div>`
    : `<div class="mut" style="font-size:12px;text-align:right;line-height:1.5">Ventas y resultado<br><span class="hl">${DASH_RANGE.to === todayStr() && DASH_RANGE.from === todayStr() ? "aún sin cierre de hoy" : "al conectar Ágora"}</span></div>`;
  // Al pasar el ratón se ve el día, cuántas reservas y —si Ágora está conectado— lo que
  // se facturó ESE día. Es la pregunta que uno se hace mirando el pico del sábado.
  const ventasPorDia = new Map(((per && per.ventas && per.ventas.serie) || []).map((v) => [String(v.dia), Number(v.ventas) || 0]));
  const grafico = serieVals.length >= 2
    ? area({
        valores: serieVals,
        etiquetas: rSerie.map((x) => fechaCorta(x.dia)),
        extra: vOk ? rSerie.map((x) => ventasPorDia.get(String(x.dia)) ?? null) : null,
      }, { h: 120, fmt: (v) => num(v) + (v === 1 ? " comensal" : " comensales"), fmtExtra: (v) => eur(v) + " facturado" })
    : `<div class="mut" style="font-size:12.5px;padding:14px 0">${totalPeriodo ? "Rango de un día — sin serie para graficar." : "Sin reservas en este periodo."}</div>`;
  const notaRes = (vOk || gOk) ? `<div class="mut" style="font-size:11px;margin-top:8px">Resultado = ventas${per.hoyEnVivo ? " (incluye hoy)" : ""} − gastos en facturas del periodo (no incluye personal).</div>` : "";
  const actividad = `<div class="card c8"><div class="ch"><h3>Actividad · reservas y resultado</h3><span class="pill" style="text-transform:capitalize">${esc(winLbl)}</span></div><div class="between" style="align-items:flex-end;margin-bottom:8px"><div><div class="big tnum">${num(totalPeriodo)}</div><div class="mut" style="font-size:12.5px">reservas${per && per.reservas && per.reservas.personas ? " · " + num(per.reservas.personas) + " comensales" : ""}</div>${cmp && cmp.reservas != null ? `<div style="margin-top:4px" title="${esc(cuando)}">${deltaEl(cmp.reservas, contra)}</div>` : ""}</div>${ventasBox}</div>${grafico}${notaRes}</div>`;

  // ── Gasto del mes (barra apilada real) ──
  const gl = (d.dinero && d.dinero.gastoLocal) || []; const gtot = gl.reduce((s, g) => s + (g.actual || 0), 0);
  const PAL = ["var(--info)", "var(--warning)", "#8A5A9B", "var(--brand)", "var(--success)", "#B5713A", "#5B8A72"];
  const gasto = `<div class="card c4"><div class="ch"><h3>Gasto del mes</h3></div><div class="big tnum">${eur(gtot)}</div><div class="mut" style="font-size:12px;margin:2px 0 12px">${gl.length} establecimiento${gl.length === 1 ? "" : "s"}</div>${gl.length ? `<div class="mbar">${gl.map((g, i) => `<span style="width:${gtot ? Math.round(g.actual / gtot * 100) : 0}%;background:${PAL[i % PAL.length]}"></span>`).join("")}</div><div class="rows" style="margin-top:10px">${gl.slice(0, 4).map((g, i) => `<div class="row" style="padding:8px 0;border-top:0"><span class="sdot" style="background:${PAL[i % PAL.length]}"></span><div class="grow"><div class="t1" style="font-size:12.5px">${esc(nombreCortoLocal(g.local))}</div></div><b class="tnum" style="font-size:12.5px">${eur(g.actual)}</b></div>`).join("")}</div>` : `<div class="mut">Sin gasto registrado este mes.</div>`}<div class="pendingblock" style="margin-top:14px;padding:12px 14px">Margen y coste de personal: <b>al conectar Ágora/Skello</b>.</div></div>`;

  // ── Necesita tu atención (preocupaciones reales) ──
  const concerns = d.preocupaciones || [];
  const atencion = `<div class="card c7 p0"><div class="ch" style="padding:18px 18px 0"><h3>Necesita tu atención</h3>${concerns.length ? `<span class="pill ${nCrit || concerns.some((c) => c.sev === "crit") ? "bad" : "warn"}">${concerns.filter((c) => c.sev === "crit").length} crítica${concerns.filter((c) => c.sev === "crit").length === 1 ? "" : "s"}</span>` : '<span class="pill ok">Todo en orden</span>'}</div>${concerns.length ? `<div class="rows">${concerns.slice(0, 5).map(attRow).join("")}</div>` : `<div style="padding:18px"><p class="mut" style="margin:0">Hoy no hay nada urgente${localName ? " en " + esc(localName) : ""}. Buen momento para cuidar el servicio y al equipo.</p></div>`}</div>`;

  // ── Estado por establecimiento (radar real) ──
  const radar = d.radarLocales || [];
  const estado = `<div class="card c5 p0"><div class="ch" style="padding:18px 18px 0"><h3>Estado por establecimiento</h3></div>${radar.length ? `<div class="rows">${radar.map((e) => { const st = estadoState(e); return `<button class="row" data-act="estab-pick" data-local="${esc(e.local)}" style="width:100%;text-align:left"><span class="sdot st-${st.k}"></span><div class="grow"><div class="t1">${esc(nombreCortoLocal(e.local))}</div><div class="t2">${num(e.hoyPersonas)} comensales · ${e.incidenciasAbiertas} incid. · ${eur(e.gastoMes)}</div></div><span class="pill ${st.k === "crit" ? "bad" : st.k === "warn" ? "warn" : st.k === "off" ? "" : "ok"}">${st.t}</span></button>`; }).join("")}</div>` : `<div style="padding:18px" class="mut">${localName ? "Estás viendo un solo establecimiento. Vuelve a «Todos» para comparar." : "Sin datos por establecimiento."}</div>`}</div>`;

  // ── Reseñas + Sara/WhatsApp ──
  const rs = d.resenas || {};
  const resenasCard = `<div class="card c4"><div class="ch"><h3>Reseñas</h3><button class="link" data-view="reviews">Gestionar →</button></div><div style="display:flex;gap:12px;align-items:baseline"><div class="big tnum" style="font-size:34px">${rs.total ? dec1(rs.media) : "—"}</div><div class="stars">${"★".repeat(Math.round(rs.media || 0))}</div></div><div class="mut" style="font-size:12px;margin-top:6px">${num(rs.total || 0)} reseñas (90 días)</div>${rs.sinResponder ? `<div style="margin-top:12px"><span class="pill warn">${rs.sinResponder} sin responder</span></div>` : ""}</div>`;
  const waok = d.whatsapp && d.whatsapp.connected;
  const saraCard = `<div class="card c8"><div class="ch"><h3>Sara · WhatsApp</h3><span class="pill ${waok ? "ok" : "bad"}">${waok ? "Conectada" : "Desconectada"}</span></div><p class="mut" style="margin:0">${waok ? "Sara atiende reservas y clientes por WhatsApp automáticamente." : "WhatsApp está caído: Sara no responde a los clientes. Reconéctala cuanto antes."}</p><div style="margin-top:12px"><button class="btn ${waok ? "" : "primary"}" data-view="whatsapp">${waok ? "Abrir WhatsApp" : "Reconectar ahora"}</button></div></div>`;

  // ── Clientes a llamar + Equipo (preserva la inteligencia real) ──
  const cl = d.clientes || {}; const enfr = (cl.enfriando || []).slice(0, 4);
  const clientesCard = enfr.length ? `<div class="card c6 p0"><div class="ch" style="padding:18px 18px 0"><h3>Clientes a los que llamar</h3><button class="link" data-view="clientes">Ver →</button></div><div class="rows">${enfr.map((c) => `<div class="row"><div class="ava">${esc((c.nombre || "?").slice(0, 1).toUpperCase())}</div><div class="grow"><div class="t1">${esc(c.nombre || "—")}</div><div class="t2">${c.visitas} reservas · última ${esc(c.ultima)}</div></div>${c.telefono ? `<a class="btn sm" href="tel:${esc(c.telefono)}">Llamar</a>` : ""}</div>`).join("")}</div></div>` : "";
  const eq = d.equipo || {}; const einc = (eq.incidencias || []).slice(0, 3); const eck = eq.checkins;
  const equipoCard = (einc.length || (eck && eck.plantilla)) ? `<div class="card c6"><div class="ch"><h3>Equipo</h3><button class="link" data-view="rrhh">RR. HH. →</button></div>${eck && eck.plantilla ? `<div class="between" style="margin-bottom:8px"><span class="mut" style="font-size:12.5px">Conversaciones del mes</span><b class="tnum">${eck.hechos}/${eck.plantilla}</b></div><div class="prog ${eck.hechos / eck.plantilla < 0.5 ? "warn" : ""}"><i style="width:${Math.round((eck.hechos / Math.max(1, eck.plantilla)) * 100)}%"></i></div>` : ""}${einc.length ? `<div class="rows" style="margin-top:10px">${einc.map((w) => `<div class="row" style="padding:8px 0;border-top:0"><div class="grow"><div class="t1" style="font-size:12.5px">${esc(w.nombre || "—")}</div><div class="t2">${esc(w.local || "")}</div></div><span class="badge ${w.c >= 2 ? "bad" : "warn"}">${w.c} incid.</span></div>`).join("")}</div>` : ""}<div class="pendingblock" style="margin-top:12px;padding:11px 13px">Coste de personal y horas: <b>al conectar Skello</b>.</div></div>` : "";

  const row1 = `<div class="grid g12" style="margin-top:16px">${actividad}${gasto}</div>`;
  const row2 = `<div class="grid g12" style="margin-top:16px">${atencion}${estado}</div>`;
  const row3 = `<div class="grid g12" style="margin-top:16px">${resenasCard}${saraCard}</div>`;
  const row4 = (clientesCard || equipoCard) ? `<div class="grid g12" style="margin-top:16px">${clientesCard}${equipoCard}</div>` : "";
  return header + sara + kpis + row1 + row2 + row3 + row4;
}
async function loadDashboard() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  if (!DASH_RANGE.from) { const r = rangoPreset(PERIOD || "semana", todayStr()); DASH_RANGE = { from: r.from, to: r.to, label: r.label }; }
  // El dashboard es un AGREGADO, así que no vale con juntar filas como en reservas: se le
  // dice al servidor qué establecimientos son y él pide el de cada uno y los suma campo a
  // campo (src/modules/dashboard/fusion.js). `DASH_LOCAL` vale «*mios*» cuando se están
  // mirando todos los suyos, y eso no es el nombre de ningún local: mandarlo tal cual hacía
  // que el servidor cayera al principal y se viera UN local creyendo que se veían los dos.
  const q = viendoVarios() ? "locales=" + encodeURIComponent(localesDelAmbito().join(","))
    : localActualFE() ? "local=" + encodeURIComponent(localActualFE()) : "";
  try {
    // `comparar=1`: el servidor trae también el periodo anterior y la variación ya calculada.
    // El «contra qué» lo decide él (`rangoAnterior`), que sabe que un mes se compara con el mes
    // anterior y no con «los 31 días de antes».
    const [d, per] = await Promise.all([
      api("/api/dashboard" + (q ? "?" + q : "")),
      apiOptional(`/api/dashboard/periodo?from=${DASH_RANGE.from}&to=${DASH_RANGE.to}&comparar=1&preset=${encodeURIComponent(PERIOD || "")}${q ? "&" + q : ""}`),
    ]);
    DASH_PERIODO = per || null;
    view.innerHTML = renderDashboard(d);
    // El menú se pinta ANTES de que lleguen estos datos, así que los números de pendientes hay
    // que repintarlos cuando se saben. Sin esto solo aparecían al cambiar de pantalla: es decir,
    // nunca en la primera, que es donde se mira.
    repintarBarra();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
// Rango personalizado (días o meses, incluso del año pasado).
/**
 * ELEGIR FECHAS. Un calendario de rango, no dos casillas de fecha.
 *
 * Antes eran dos `<input type="date">`: para ver «del 6 al 15 de mayo» había que abrir dos
 * calendarios distintos, uno para cada extremo, y en ninguno de los dos se veía el rango. Aquí
 * se pulsa el primer día, se pulsa el último y se ve pintado lo que hay en medio, que es lo
 * que se está eligiendo de verdad.
 *
 * Dos meses a la vez porque casi todos los rangos que se miran cruzan de mes.
 */
function openPeriodoCustom() {
  const hoy = todayStr();
  const grupo = grupoPeriodo();
  const per = periodoVista();
  let a = per.from || "", b = per.to || "", hov = "";
  let cur = "";   // el mes de la izquierda; se fija abajo, cuando `mesSig` ya existe

  // «Todo» solo donde significa algo: el Dashboard SIEMPRE compara un periodo con el anterior,
  // así que «sin fechas» no es una respuesta que pueda dar.
  const rapidos = [
    ...(grupo === "compras" ? [["todo", "Todo"]] : []),
    ["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"], ["mes-pasado", "Mes pasado"],
    ["este-ano", "Este año"], ["ano-pasado", "Año pasado"], ["12m", "Últimos 12 meses"],
  ];

  const ov = modal("Periodo", `<div class="rng">
    <div class="rngq">${rapidos.map(([k, l]) => `<button type="button" data-rq="${k}">${esc(l)}</button>`).join("")}</div>
    <div class="rngc">
      <div class="rngh">
        <button type="button" class="rngnav" data-rnav="-1" aria-label="Meses anteriores">‹</button>
        <div class="rngms" id="rngMs"></div>
        <button type="button" class="rngnav" data-rnav="1" aria-label="Meses siguientes">›</button>
      </div>
      <div class="rngcals" id="rngCals"></div>
    </div>
  </div>
  <div class="rngf"><span class="rngsum" id="rngSum"></span>
    <span style="flex:1"></span>
    <button class="btn" data-close>Cancelar</button>
    <button class="btn primary" id="rngOk">Aplicar</button></div>`);

  const mesSig = (ym, n) => { let [y, m] = ym.split("-").map(Number); m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${dp2(m)}`; };
  // Sin rango puesto se abre en el mes ANTERIOR y el actual. Abrir en el actual y el siguiente
  // dejaba media pantalla con días del futuro, que están apagados: no hay facturas de mañana.
  cur = a ? a.slice(0, 7) : mesSig(hoy.slice(0, 7), -1);
  const dentro = (iso, x, y2) => x && y2 && iso >= x && iso <= y2;

  function mesHtml(ym) {
    const [y, m] = ym.split("-").map(Number);
    const off = periodoDiaSemanaLunes(`${ym}-01`);
    // El extremo provisional: mientras se elige el segundo día, se pinta por dónde iría.
    const fin = b || (a && hov > a ? hov : "");
    const celdas = [];
    for (let i = 0; i < off; i++) celdas.push('<span class="rngd out"></span>');
    for (let d = 1; d <= dpDim(y, m); d++) {
      const iso = `${ym}-${dp2(d)}`;
      // La columna, para redondear la franja donde la semana se corta: sin esto el rango
      // termina en pico a la derecha del domingo y empieza en pico el lunes siguiente.
      const col = (off + d - 1) % 7;
      const cls = [
        iso === a ? "ini" : "", iso === b ? "fin" : "",
        (iso === a && !fin) ? "solo" : "",
        dentro(iso, a, fin) ? "in" : "",
        iso === hoy ? "hoy" : "",
        // Nombres largos a propósito: `c1`/`c7` chocaban con la rejilla de tarjetas del panel
        // (`.c7 { grid-column: span 7 }`) y el domingo se comía la fila entera.
        col === 0 ? "rnglft" : "", col === 6 ? "rngrgt" : "", d === 1 ? "rnglft" : "", d === dpDim(y, m) ? "rngrgt" : "",
      ].filter(Boolean).join(" ");
      celdas.push(`<button type="button" class="rngd ${cls}" data-iso="${iso}"${iso > hoy ? " disabled" : ""}>${d}</button>`);
    }
    while (celdas.length % 7) celdas.push('<span class="rngd out"></span>');
    return `<div class="rngmes"><div class="rngmt">${cap(DP_MES[m - 1])} ${y}</div>
      <div class="rngg">${DP_DOW.map((x) => `<span class="rngw">${x}</span>`).join("")}${celdas.join("")}</div></div>`;
  }

  function pintar() {
    ov.querySelector("#rngCals").innerHTML = mesHtml(cur) + mesHtml(mesSig(cur, 1));
    ov.querySelector("#rngMs").textContent = "";
    const dias = a && b ? Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000) + 1 : 0;
    ov.querySelector("#rngSum").innerHTML = !a
      ? '<span class="mut">Sin fechas: desde siempre</span>'
      : !b ? `<b>${esc(fechaCorta(a))}</b> <span class="mut">— elige el último día</span>`
      : `<b>${esc(fechaCorta(a))} – ${esc(fechaCorta(b))}</b> <span class="mut">· ${dias} día${dias === 1 ? "" : "s"}</span>`;
  }

  ov.addEventListener("mouseover", (e) => {
    const d = e.target.closest("[data-iso]"); if (!d || !a || b) return;
    const iso = d.getAttribute("data-iso");
    if (iso === hov) return;
    hov = iso; pintar();
  });

  ov.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-rnav]");
    if (nav) { cur = mesSig(cur, Number(nav.getAttribute("data-rnav"))); return pintar(); }

    const q = e.target.closest("[data-rq]");
    if (q) {
      const k = q.getAttribute("data-rq");
      const y = Number(hoy.slice(0, 4));
      if (k === "todo") { a = ""; b = ""; }
      else if (k === "mes-pasado") { const d = new Date(hoy + "T12:00:00"); d.setDate(1); d.setMonth(d.getMonth() - 1); const f = new Date(d.getFullYear(), d.getMonth() + 1, 0); a = `${d.getFullYear()}-${dp2(d.getMonth() + 1)}-01`; b = `${f.getFullYear()}-${dp2(f.getMonth() + 1)}-${dp2(f.getDate())}`; }
      else if (k === "este-ano") { a = y + "-01-01"; b = hoy; }
      else if (k === "ano-pasado") { a = (y - 1) + "-01-01"; b = (y - 1) + "-12-31"; }
      else if (k === "12m") { a = addDaysStr(hoy, -364); b = hoy; }
      else { const r = rangoPreset(k, hoy); a = r.from; b = r.to; }
      hov = ""; if (a) cur = a.slice(0, 7);
      return pintar();
    }

    const d = e.target.closest("[data-iso]");
    if (d && !d.disabled) {
      const iso = d.getAttribute("data-iso");
      // Primer clic = principio. Segundo = final. Y si el segundo es anterior, se entiende
      // que se ha cambiado de idea sobre el principio, no que quiera un rango al revés.
      if (!a || b || iso < a) { a = iso; b = ""; }
      else b = iso;
      hov = ""; return pintar();
    }
  });

  ov.querySelector("#rngOk").addEventListener("click", () => {
    if (a && !b) b = a;                       // un solo día es un rango de un día
    const label = !a ? "Desde siempre" : a === b ? fechaCorta(a) : `${fechaCorta(a)} – ${fechaCorta(b)}`;
    fijarPeriodoVista(a ? "custom" : "todo", a, b, label);
    ov.remove();
    repintarSeg();
    recargarPorPeriodo();
  });

  pintar();
}

// ════════════════════════ VISTA: RESERVAS ════════════════════════
let RESF = { local: "", from: "", to: "", vista: "dia", foco: "" };
// Historial: lo que YA PASÓ, de más reciente a más antigua. Es la pregunta que se hace de
// verdad —«¿cuándo vino esta gente?», «¿cuánto llenamos el sábado pasado?»— y hasta ahora la
// lista solo miraba hacia delante, así que no había forma de contestarla.
let RESH = { periodo: "30", q: "", hayMas: false, datos: [] };
let _reshT = null;
const RESH_PERIODOS = [["7", "7 días"], ["30", "30 días"], ["90", "3 meses"], ["365", "12 meses"]];
// ── Lógica de agenda (reflejo de src/modules/reservas/agenda.js; el panel no importa ESM) ──
const RES_TURNOS = [{ key: "comida", label: "Comida", desde: "12:00", hasta: "17:00" }, { key: "cena", label: "Cena", desde: "19:00", hasta: "23:59" }];
const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CARGA_COL = { baja: "#3f9b52", media: "#c8912a", alta: "#c0392b" };
function horaAMin(h) { const m = String(h || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function turnoDeHora(h) { const min = horaAMin(h); if (min == null) return "otros"; for (const t of RES_TURNOS) if (min >= horaAMin(t.desde) && min <= horaAMin(t.hasta)) return t.key; return "otros"; }
function nivelCarga(p) { p = Number(p) || 0; return p > 40 ? "alta" : p > 20 ? "media" : "baja"; }
function resOrdenar(rs) { return (rs || []).slice().sort((a, b) => (horaAMin(a.hora) ?? 9999) - (horaAMin(b.hora) ?? 9999)); }
function resAgendaDia(list, dia) {
  const del = dia ? (list || []).filter((r) => r.dia === dia) : (list || []);
  const porTurno = { comida: [], cena: [], otros: [] };
  del.forEach((r) => porTurno[turnoDeHora(r.hora)].push(r));
  const turnos = [...RES_TURNOS, { key: "otros", label: "Otras horas" }].map((t) => {
    const rs = resOrdenar(porTurno[t.key]); const personas = rs.reduce((s, r) => s + (Number(r.personas) || 0), 0);
    return { key: t.key, label: t.label, reservas: rs, personas, total: rs.length, carga: nivelCarga(personas) };
  }).filter((t) => t.key !== "otros" || t.total > 0);
  return { dia, turnos, totalReservas: del.length, totalPersonas: del.reduce((s, r) => s + (Number(r.personas) || 0), 0) };
}
function resDiaSemana(iso) { const [y, m, d] = iso.split("-").map(Number); const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]; const yy = m < 3 ? y - 1 : y; return ((yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1] + d) % 7 + 6) % 7; }
function resLunes(iso) { return addDaysStr(iso, -resDiaSemana(iso)); }
function resDiasSemana(lunes) { return Array.from({ length: 7 }, (_, i) => addDaysStr(lunes, i)); }

function renderReservas(list) {
  if (!RESF.foco) RESF.foco = todayStr();
  const amb = resScope();
  const seg = ["dia:Día", "semana:Semana", "lista:Próximas", "historial:Ya pasadas"].map((p) => { const [v, t] = p.split(":"); return `<button class="btn ${RESF.vista === v ? "primary" : ""}" data-act="res-vista" data-vista="${v}">${t}</button>`; }).join("");
  // Sin filtro de local: el ámbito lo marca el selector de establecimiento de la barra superior.
  const toolbar = `<div class="toolbar"><div class="toolbar" style="margin:0;gap:6px">${seg}</div><div style="display:flex;gap:10px;margin-left:auto"><button class="btn" data-act="csv">Exportar CSV</button><button class="btn primary" data-act="nueva">+ Nueva reserva</button></div></div>`;
  const cuerpo = RESF.vista === "historial" ? renderResHistorial(list)
    : RESF.vista === "lista" ? renderResLista(list)
    : RESF.vista === "semana" ? renderResSemana(list) : renderResDia(list);
  return `<div class="ph"><div class="eyebrow">Operación</div><h1>Reservas</h1><div class="sub">Agenda por turnos, ocupación y gestión rápida${amb ? ` · <b>${esc(nombreCortoLocal(amb))}</b>` : ""}</div></div>${toolbar}${cuerpo}`;
}
function resNav(label) {
  return `<div class="agnav"><button class="btn sm" data-act="res-prev">‹</button><button class="btn sm" data-act="res-hoy">Hoy</button><button class="btn sm" data-act="res-next">›</button><b style="margin-left:6px;text-transform:capitalize">${esc(label)}</b></div>`;
}
function resCargaDot(carga) { return `<span class="dot" style="background:${CARGA_COL[carga]}" title="Carga ${carga}"></span>`; }
function resResRow(r) {
  const tel = String(r.telefono || "").replace(/[^0-9+]/g, "");
  return `<div class="agres"><span class="hh">${esc(r.hora || "")}</span><div class="who"><div class="t1">${esc(r.nombre_reserva || "(sin nombre)")}</div><div class="t2">${esc(r.local || "")} · ${esc(r.telefono || "")}</div></div><span class="pill">${esc(r.personas)} pax</span>${tel ? `<a class="btn sm" href="tel:${esc(tel)}" title="Llamar">Llamar</a>` : ""}<button class="linkbtn" data-act="cancel" data-id="${r.id}" data-nombre="${esc(r.nombre_reserva)}">Cancelar</button></div>`;
}
function renderResDia(list) {
  const a = resAgendaDia(list, RESF.foco);
  const label = `${WD[resDiaSemana(RESF.foco)]} · ${fechaCorta(RESF.foco)}`;
  const resumen = `<div class="sub" style="margin:-4px 0 12px">${a.totalReservas} reserva${a.totalReservas === 1 ? "" : "s"} · ${a.totalPersonas} personas${RESF.foco === todayStr() ? " · hoy" : ""}</div>`;
  const cols = a.turnos.map((t) => `<div class="agturno"><div class="th"><span>${esc(t.label)} ${resCargaDot(t.carga)}</span><span class="mut" style="font-weight:500">${t.total} · ${t.personas} pax</span></div>${t.reservas.length ? t.reservas.map(resResRow).join("") : '<div class="mut" style="padding:14px">Sin reservas.</div>'}</div>`).join("");
  return `${resNav(label)}${resumen}<div class="agturnos">${cols || '<div class="card"><div class="mut" style="padding:8px">Sin reservas este día.</div></div>'}</div>`;
}
function renderResSemana(list) {
  const lunes = resLunes(RESF.foco);
  const dias = resDiasSemana(lunes);
  const label = `Semana del ${fechaCorta(lunes)}`;
  const cells = dias.map((dia, i) => {
    const a = resAgendaDia(list, dia);
    const tl = a.turnos.filter((t) => t.key !== "otros").map((t) => `<span class="tl">${resCargaDot(t.carga)} ${esc(t.label[0])}: ${t.total}/${t.personas}p</span>`).join("");
    return `<div class="agday ${dia === todayStr() ? "hoy" : ""}" data-act="res-dia" data-dia="${dia}"><div class="dwd">${WD[i]}</div><div class="dnum">${Number(dia.slice(-2))}</div>${a.totalReservas ? tl : '<div class="mut" style="font-size:12px;margin-top:8px">—</div>'}</div>`;
  }).join("");
  return `${resNav(label)}<div class="agweek">${cells}</div><div class="mut" style="font-size:12px;margin-top:10px">Toca un día para ver el detalle por turnos. C = comida, C = cena (nº reservas / personas). El punto indica la carga.</div>`;
}
function renderResLista(list) {
  const rows = (list || []).slice().sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  return rows.length
    ? `<div class="card p0"><div class="tw"><table class="tbl"><thead><tr><th>Día</th><th>Hora</th><th>Local</th><th class="r">Pers.</th><th>Nombre</th><th>Teléfono</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(fechaCorta(r.dia))}</td><td class="tnum">${esc(r.hora)}</td><td>${esc(r.local)}</td><td class="r tnum">${esc(r.personas)}</td><td>${esc(r.nombre_reserva)}</td><td class="mut">${esc(r.telefono)}</td><td class="r"><button class="linkbtn" data-act="cancel" data-id="${r.id}" data-nombre="${esc(r.nombre_reserva)}">Cancelar</button></td></tr>`).join("")}</tbody></table></div></div>`
    : `<div class="card"><div class="mut" style="padding:8px">No hay reservas en ese rango. Prueba a ampliar las fechas o crea una nueva.</div></div>`;
}
// El historial: de más reciente a más antigua, con buscador y total. NO lleva el botón de
// cancelar: una reserva de hace dos meses no se cancela, y ofrecerlo es una trampa.
function renderResHistorial(list) {
  const q = RESH.q.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tel9 = (t) => String(t || "").replace(/\D/g, "").slice(-9);
  const todas = (list || []).filter((r) => q === ""
    || String(r.nombre_reserva || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    || tel9(r.telefono).includes(q.replace(/\D/g, "")) && /\d/.test(q));
  // Ya vienen ordenadas del servidor (más reciente primero); se reordena por si acaso.
  const rows = todas.slice().sort((a, b) => (b.dia + b.hora).localeCompare(a.dia + a.hora));
  const personas = rows.reduce((s2, r) => s2 + (Number(r.personas) || 0), 0);

  const pills = RESH_PERIODOS.map(([v, t]) =>
    `<button class="btn sm ${RESH.periodo === v ? "primary" : ""}" data-act="resh-periodo" data-p="${v}">${t}</button>`).join("");
  const barra = `<div class="toolbar" style="margin-bottom:10px">
      <div class="toolbar" style="margin:0;gap:6px">${pills}</div>
      <div class="field" style="flex:1;min-width:180px;margin-left:auto"><label>Buscar</label>
        <input class="inp" id="reshQ" value="${esc(RESH.q)}" placeholder="nombre o teléfono"></div>
    </div>`;

  const resumen = `<div class="sub" style="margin:-2px 0 12px">${num(rows.length)} ${rows.length === 1 ? "reserva" : "reservas"}
    · ${num(personas)} personas${q ? ` con «${esc(RESH.q)}»` : ""}${RESH.hayMas ? " · se enseñan las más recientes; acota el periodo para verlas todas" : ""}</div>`;

  // El día se repite mucho: se agrupa por fecha para poder leerlo de un vistazo.
  let ultimoDia = null;
  const fila = (r) => {
    const cambia = r.dia !== ultimoDia; ultimoDia = r.dia;
    const tel = String(r.telefono || "").replace(/[^0-9+]/g, "");
    return `<tr>
      ${/* `fechaCorta` ya trae el día de la semana («dom, 9 ago»): anteponer WD lo duplicaba. */""}
      <td class="mut" style="white-space:nowrap">${cambia ? esc(fechaCorta(r.dia) || r.dia) : ""}</td>
      <td class="tnum">${esc(r.hora || "")}</td>
      <td>${esc(r.nombre_reserva || "(sin nombre)")}</td>
      <td class="r tnum">${esc(r.personas)}</td>
      <td>${esc(nombreCortoLocal(r.local) || "")}</td>
      <td class="mut" style="white-space:nowrap">${tel ? `<a class="link" href="tel:${esc(tel)}">${esc(r.telefono)}</a>` : ""}</td>
      ${/* La ficha del cliente es del módulo Clientes: a quien no lo tenga, el 403 le sacaría
            del panel. Solo se ofrece a quien puede abrirla. */""}
      <td class="r">${tel && puedeVer("clientes") ? `<button class="btn sm" data-act="cli-ficha" data-tel="${esc(tel)}">Ficha</button>` : ""}</td></tr>`;
  };

  const tabla = rows.length
    ? `<div class="tw"><table class="tbl"><thead><tr><th>Día</th><th>Hora</th><th>Nombre</th><th class="r">Pers.</th><th>Local</th><th>Teléfono</th><th></th></tr></thead>
        <tbody>${rows.map(fila).join("")}</tbody></table></div>`
    : `<div class="card"><div class="mut" style="padding:8px">${q ? `Nada con «${esc(RESH.q)}» en este periodo.` : "No hay reservas pasadas en este periodo."}</div></div>`;
  return `${barra}<div id="reshBody">${resumen}${tabla}</div>`;
}

// Buscar NO vuelve a preguntar al servidor: el periodo ya está en memoria. Y se repinta solo
// la tabla, no la pantalla entera: repintar el buscador mientras se escribe pierde el foco y
// se queda a medias la palabra.
function resHistBuscar(q) {
  RESH.q = q;
  const caja = document.getElementById("reshBody");
  if (!caja) return;
  const html = renderResHistorial(RESH.datos);
  caja.outerHTML = html.slice(html.indexOf('<div id="reshBody">'));
}

// Rango [from,to] según la vista activa.
function resRango() {
  if (RESF.vista === "historial") {
    // Hasta AYER: lo de hoy no ha pasado todavía y se ve en la agenda del día.
    return [addDaysStr(todayStr(), -Number(RESH.periodo)), addDaysStr(todayStr(), -1)];
  }
  if (RESF.vista === "dia") return [RESF.foco, RESF.foco];
  if (RESF.vista === "semana") { const l = resLunes(RESF.foco); return [l, addDaysStr(l, 6)]; }
  if (!RESF.from) { RESF.from = todayStr(); RESF.to = addDaysStr(todayStr(), 30); }
  return [RESF.from, RESF.to];
}
// El ámbito de local lo manda el selector de establecimiento de la barra superior; el local
// fijado del usuario (encargado) gana siempre.
function resScope() { RESF.local = localActualFE(); return RESF.local; }
// Aviso para cuando el ámbito es un centro sin atención al público (la oficina).
function avisoSinPublico(titulo, eyebrow, que) {
  return `<div class="ph"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(titulo)}</h1><div class="sub">${esc(nombreCortoLocal(DASH_LOCAL))}</div></div>
    <div class="card"><div class="ch"><h3>Aquí no hay ${esc(que)}</h3></div><p class="mut" style="margin:0;line-height:1.6"><b>${esc(nombreCortoLocal(DASH_LOCAL))}</b> es un centro sin atención al público: recibe facturas, incidencias y personal, pero no ${esc(que)}.<br>Elige otro establecimiento en la barra de arriba.</p></div>`;
}
async function loadReservas() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  if (!RESF.foco) RESF.foco = todayStr();
  resScope();
  if (sinPublico(RESF.local)) { view.innerHTML = avisoSinPublico("Reservas", "Operación", "reservas"); return; }
  try {
    const [from, to] = resRango();
    // Juntar reservas de varios locales es exacto: son filas, se concatenan. Cada petición
    // sigue pidiendo UN local, igual que siempre.
    const montaUrl = (loc) => {
      const qs = new URLSearchParams(); qs.set("from", from); qs.set("to", to);
      if (loc) qs.set("local", loc);
      if (RESF.vista === "historial") { qs.set("orden", "desc"); qs.set("limit", "1500"); }
      return "/api/reservas?" + qs.toString();
    };
    const j = await pidePorLocales(montaUrl, { raw: true });
    RESH.hayMas = !!j.hayMas;
    const datos = j.data || [];
    if (RESF.vista === "historial") RESH.datos = datos;
    view.innerHTML = renderReservas(datos);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function resVista(v) { RESF.vista = v; loadReservas(); }
function resDiaFoco(dia) { RESF.foco = dia; RESF.vista = "dia"; loadReservas(); }
function resNavega(dir) {
  const paso = RESF.vista === "semana" ? 7 : 1;
  if (dir === "hoy") RESF.foco = todayStr(); else RESF.foco = addDaysStr(RESF.foco, dir === "next" ? paso : -paso);
  loadReservas();
}
function openNuevaReserva() {
  const fijo = localFijadoFE();
  const localOpts = fijo ? `<option value="${esc(fijo)}" selected>${esc(fijo)}</option>` : LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const body = `<form id="fReserva"><div class="form-grid">
    <div class="field full"><label>Local</label><select name="local" required>${localOpts}</select></div>
    <div class="field"><label>Día</label><input type="date" name="dia" value="${todayStr()}" required></div>
    <div class="field"><label>Hora</label><input type="time" name="hora" value="21:00" required></div>
    <div class="field"><label>Personas</label><input type="number" name="personas" min="1" max="50" value="2" required></div>
    <div class="field"><label>Teléfono</label><input type="tel" name="telefono" placeholder="6XXXXXXXX" required></div>
    <div class="field full"><label>Nombre de la reserva</label><input type="text" name="nombre_reserva" required></div>
  </div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Crear reserva</button></div></form>`;
  const ov = modal("Nueva reserva", body);
  ov.querySelector("#fReserva").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = "Creando…";
    try { const j = await apiSend("POST", "/api/reservas", data); ov.remove(); toast(j.pendiente ? "Reserva creada · pendiente de confirmar (grupo grande)" : "Reserva creada ✅"); loadReservas(); }
    catch (err) { btn.disabled = false; btn.textContent = "Crear reserva"; toast("Error: " + err.message); }
  });
}
async function cancelReserva(id, nombre) {
  if (!(await confirmModal(`¿Cancelar la reserva de ${nombre}? Se avisará al grupo de WhatsApp del local.`, { ok: "Cancelar reserva", danger: true }))) return;
  try { await apiSend("DELETE", "/api/reservas/" + encodeURIComponent(id)); toast("Reserva cancelada"); loadReservas(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function downloadCsv() {
  try {
    const r = await fetch("/api/reservas/export.csv", { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) { toast("No se pudo exportar"); return; }
    const blob = await r.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "reservas.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch { toast("No se pudo exportar"); }
}

// ════════════════════════ VISTA: MANTENIMIENTO ════════════════════════
let MANF = { local: "", estado: "" };
let MAN_LIST = [];
const EST_PILL = { "abierta": "bad", "en proceso": "imp", "resuelta": "ok", "cerrada": "ok" };
// Ámbito de local: selector de establecimiento de la barra superior (el local fijado manda).
function mantScope() { MANF.local = localActualFE(); return MANF.local; }
function renderMant(list) {
  let rows = (list || []).slice();
  if (MANF.estado) rows = rows.filter((r) => (r.estado || "") === MANF.estado);
  rows.sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
  const amb = mantScope();
  const estOpts = ['<option value="">Todos los estados</option>'].concat(["abierta", "en proceso", "resuelta"].map((e) => `<option value="${e}" ${MANF.estado === e ? "selected" : ""}>${cap(e)}</option>`)).join("");
  // Sin filtro de local ni botón «Buscar»: el estado se aplica solo (el filtrado es en cliente).
  const toolbar = `<div class="toolbar"><div class="field"><label>Estado</label><select id="mEstado">${estOpts}</select></div><div style="display:flex;gap:10px;margin-left:auto"><button class="btn primary" data-act="mant-nueva">+ Nueva incidencia</button></div></div>`;
  const body = rows.length ? `<div class="card p0"><div class="rows">${rows.map((r) => {
    const est = r.estado || "abierta"; const next = est === "abierta" ? ["en proceso", "Tomar"] : est === "en proceso" ? ["resuelta", "Resolver"] : null;
    const foto = r.foto_url ? `<a href="${esc(r.foto_url)}" target="_blank" rel="noopener" title="Ver foto" style="margin-right:10px;flex-shrink:0"><img src="${esc(r.foto_url)}" alt="Foto de la incidencia" style="width:44px;height:44px;object-fit:cover;border-radius:8px;display:block"></a>` : "";
    return `<div class="row">${foto}<div class="grow"><div class="t1">${esc(r.titulo)}</div><div class="t2">${esc(r.local)} · ${esc(fechaCorta((r.creado_en || "").slice(0, 10)))}${r.descripcion ? " · " + esc((r.descripcion || "").slice(0, 80)) : ""}</div></div><span class="pill ${EST_PILL[est] || ""}">${esc(cap(est))}</span>${next ? `<button class="btn" data-act="mant-estado" data-id="${r.id}" data-estado="${next[0]}">${next[1]}</button>` : ""}</div>`;
  }).join("")}</div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin incidencias con esos filtros.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Operación</div><h1>Mantenimiento</h1><div class="sub">${rows.length} incidencia${rows.length === 1 ? "" : "s"}${amb ? ` · <b>${esc(nombreCortoLocal(amb))}</b>` : ""}</div></div>${toolbar}${body}`;
}
async function loadMant() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  mantScope();
  try { const qs = MANF.local ? "?local=" + encodeURIComponent(MANF.local) : ""; MAN_LIST = await api("/api/maintenance" + qs); view.innerHTML = renderMant(MAN_LIST); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
// El estado se filtra en cliente: repintamos con lo que ya tenemos, sin volver a pedirlo.
function applyMantFilter() {
  const es = document.getElementById("mEstado"); if (es) MANF.estado = es.value;
  const view = document.getElementById("view"); if (view) view.innerHTML = renderMant(MAN_LIST);
}
async function mantEstado(id, estado) { try { await apiSend("PUT", "/api/maintenance/" + encodeURIComponent(id), { estado }); toast("Incidencia actualizada ✅"); loadMant(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
function openNuevaIncidencia() {
  const fijo = localFijadoFE();
  const localOpts = fijo ? `<option value="${esc(fijo)}" selected>${esc(fijo)}</option>` : LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const body = `<form id="fInc"><div class="form-grid"><div class="field full"><label>Local</label><select name="local" required>${localOpts}</select></div><div class="field full"><label>Título</label><input type="text" name="titulo" required></div><div class="field full"><label>Descripción</label><input type="text" name="descripcion" required></div><div class="field full"><label>Foto (opcional)</label><input type="file" id="incFoto" accept="image/*" capture="environment"><div class="mut" style="font-size:12px;margin-top:4px">Adjunta una imagen o haz una foto con la cámara.</div><div id="incFotoPrev"></div></div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Crear incidencia</button></div></form>`;
  const ov = modal("Nueva incidencia", body);
  // Vista previa de la foto elegida (mejor feedback antes de subir).
  const fileEl = ov.querySelector("#incFoto"), prev = ov.querySelector("#incFotoPrev");
  if (fileEl) fileEl.addEventListener("change", () => {
    const f = fileEl.files && fileEl.files[0];
    if (f && prev) prev.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="Vista previa" style="max-width:160px;max-height:160px;border-radius:10px;margin-top:10px;display:block">`;
    else if (prev) prev.innerHTML = "";
  });
  ov.querySelector("#fInc").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button[type="submit"]');
    const data = { local: f.local.value, titulo: f.titulo.value.trim(), descripcion: f.descripcion.value.trim() };
    try {
      if (fileEl && fileEl.files && fileEl.files[0]) {
        if (btn) { btn.disabled = true; btn.textContent = "Subiendo foto…"; }
        const fd = new FormData(); fd.append("files", fileEl.files[0]);
        const r = await fetch("/api/upload", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
        if (await fueraDeSesion(r)) return;
        const j = await r.json();
        if (!j.ok || !(j.urls && j.urls[0])) throw new Error(j.error || "No se pudo subir la foto");
        data.foto_url = j.urls[0];
      }
      await apiSend("POST", "/api/maintenance", data);
      ov.remove(); toast("Incidencia creada ✅"); loadMant();
    } catch (err) { if (btn) { btn.disabled = false; btn.textContent = "Crear incidencia"; } if (err.message !== "noauth") toast("Error: " + err.message); }
  });
}

// ════════════════════════ VISTA: INVENTARIOS ════════════════════════
// Flujo móvil: Local → Proveedor → Contar → Revisar → Pedido. Guardado automático.
let INV = { local: "", proveedorId: null, proveedorNombre: "", sesionId: null, productos: [], filtro: "", pedidoId: null };
const _invTimers = {};
function invHeader(titulo, sub, back) {
  const b = back ? `<button class="btn" data-act="${back.act}" ${back.data || ""} style="margin-bottom:12px">‹ ${esc(back.label)}</button>` : "";
  return `${b}<div class="ph"><div class="eyebrow">Inventarios</div><h1>${esc(titulo)}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}
// El local sale del selector de la barra de arriba, como en el resto del panel. Antes
// Inventarios tenía su propia pantalla de «elige local», que era un paso de más y encima
// se desincronizaba de lo que ponía la barra.
function invScope() { INV.local = localActualFE(); return INV.local; }

async function loadInventario() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  invScope();
  if (sinPublico(INV.local)) { view.innerHTML = avisoSinPublico("Inventarios", "Operación", "inventarios"); return; }
  if (!INV.local) {
    view.innerHTML = invHeader("Inventarios", "Elige un establecimiento") +
      `<div class="card"><div class="ch"><h3>Elige un establecimiento</h3></div><p class="mut" style="margin:0">El inventario es de un local concreto. Selecciónalo arriba, en la barra.</p></div>`;
    return;
  }
  return loadInvProveedores();
}

async function loadInvProveedores() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const data = await api("/api/inventario/proveedores?local=" + encodeURIComponent(INV.local));
    view.innerHTML = renderInvProveedores(data || []);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function renderInvProveedores(list) {
  // Sin botón de «Locales»: el establecimiento se cambia arriba, en la barra.
  const back = null;
  const toolbar = `<div class="toolbar"><div style="flex:1"></div><button class="btn" data-act="inv-historial">Historial</button><button class="btn" data-act="inv-pedidos">Pedidos</button><button class="btn primary" data-act="inv-nuevo-prov">+ Proveedor</button></div>`;
  const cards = list.length ? `<div class="grid g2">${list.map((p) => {
    const ultimo = p.ultimo_inventario ? fechaCorta(String(p.ultimo_inventario).slice(0, 10)) : "—";
    const estado = Number(p.en_curso) > 0 ? '<span class="pill warn">Inventario en curso</span>' : '<span class="pill ok">Al día</span>';
    return `<div class="card" style="padding:16px"><div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><div><div style="font-weight:600;font-size:16px">${esc(p.nombre)}</div><div class="mut" style="font-size:13px;margin-top:3px">${num(p.n_productos)} producto(s) · último: ${esc(ultimo)}</div><div style="margin-top:8px">${estado}</div></div></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn primary" data-act="inv-contar" data-id="${p.id}" data-nombre="${esc(p.nombre)}" style="flex:1">Contar</button><button class="btn" data-act="inv-config" data-id="${p.id}" data-nombre="${esc(p.nombre)}">Configurar</button></div></div>`;
  }).join("")}</div>` : `<div class="card"><div class="mut" style="padding:8px">No hay proveedores en este local. Crea el primero con «+ Proveedor».</div></div>`;
  return `${invHeader("Proveedores", `Elige un proveedor para inventariar · <b>${esc(nombreCortoLocal(INV.local))}</b>`, back)}${toolbar}${cards}`;
}
/**
 * Los inventarios ya cerrados. El endpoint existía desde el principio y el panel no lo llamaba
 * NUNCA, así que no había forma de ver qué se contó la semana pasada ni de volver a un pedido
 * que salió de un recuento — la única manera era acordarse.
 */
async function loadInvHistorial() {
  const view = document.getElementById("view");
  const back = { act: "inv-volver-prov", label: "Proveedores" };
  view.innerHTML = invHeader("Historial de inventarios", esc(nombreCortoLocal(INV.local)), back) + `<p class="mut">Cargando…</p>`;
  let j;
  try { j = await apiRaw("/api/inventario/historial?local=" + encodeURIComponent(INV.local)); }
  catch (e) { view.innerHTML = invHeader("Historial de inventarios", "", back) + errorCard(e.message); return; }

  const filas = (j.data || []).map((s) => `<div class="row">
      <div class="grow" style="min-width:0">
        <div class="t1">${esc(s.proveedor_nombre || "—")}</div>
        <div class="t2">${esc(fechaCorta((s.finalizado_en || "").slice(0, 10)) || "")} · ${num(s.n_contados)} producto(s) contados${s.usuario ? ` · ${esc(s.usuario)}` : ""}</div>
      </div>
      ${s.pedido_id
        ? `<button class="btn sm" data-act="inv-ver-pedido" data-id="${s.pedido_id}">Ver el pedido</button>`
        : `<span class="mut" style="font-size:12px">sin pedido</span>`}
    </div>`).join("");

  view.innerHTML = invHeader("Historial de inventarios", esc(nombreCortoLocal(INV.local)), back) +
    (filas ? `<div class="card p0"><div class="rows">${filas}</div></div>`
           : `<div class="card"><p class="mut" style="margin:0">Todavía no hay ningún inventario cerrado en este establecimiento.</p></div>`);
}

async function invNuevoProveedor() {
  let sugerencias = [];
  try { sugerencias = (await apiRaw("/api/inventario/facturas-proveedores?local=" + encodeURIComponent(INV.local))).data || []; } catch { /* opcional */ }
  const dl = sugerencias.length ? `<datalist id="invProvSug">${sugerencias.map((s) => `<option value="${esc(s)}"></option>`).join("")}</datalist>` : "";
  const body = `<form id="fInvProv">${dl}<div class="field"><label>Nombre del proveedor</label><input name="nombre" required list="invProvSug" placeholder="Ej. Estrella Damm" autocomplete="off"></div><div class="mut" style="font-size:12px;margin-top:2px">${sugerencias.length ? "Puedes elegir uno de los proveedores ya vistos en tus facturas." : ""}</div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Crear</button></div></form>`;
  const ov = modal("Nuevo proveedor", body);
  ov.querySelector("#fInvProv").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = e.target.nombre.value.trim(); if (!nombre) return;
    try { await apiSend("POST", "/api/inventario/proveedores", { local: INV.local, nombre, factura_proveedor: nombre }); ov.remove(); toast("Proveedor creado ✅"); loadInvProveedores(); }
    catch (err) { toast("Error: " + err.message); }
  });
}
function invPickProveedor(id, nombre) { INV.proveedorId = id; INV.proveedorNombre = nombre; INV.filtro = ""; loadInvConteo(); }

// ── Conteo ──
async function loadInvConteo() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const j = await apiRaw("/api/inventario/sesion?proveedor_id=" + encodeURIComponent(INV.proveedorId));
    INV.sesionId = j.sesion.id; INV.proveedorNombre = j.proveedor.nombre; INV.local = j.proveedor.local;
    INV.productos = (j.productos || []).map((p) => ({ ...p, cantidad: p.cantidad == null ? "" : p.cantidad }));
    view.innerHTML = renderInvConteo();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function invProductosFiltrados() {
  const f = INV.filtro.trim().toLowerCase();
  return f ? INV.productos.filter((p) => (p.nombre || "").toLowerCase().includes(f)) : INV.productos;
}
function renderInvConteo() {
  const back = { act: "inv-volver-prov", label: "Proveedores" };
  const head = invHeader(esc(INV.proveedorNombre), `${esc(INV.local)} · ${INV.productos.length} producto(s)`, back);
  const toolbar = `<div class="toolbar"><div class="field" style="flex:1"><input id="invSearch" placeholder="Buscar producto…" value="${esc(INV.filtro)}" autocomplete="off"></div><button class="btn primary" data-act="inv-revisar">Revisar inventario ›</button></div>`;
  return `${head}${toolbar}<div id="invList">${renderInvList()}</div>`;
}
function invRowCant(p) { return (p.cantidad === "" || p.cantidad == null) ? "" : p.cantidad; }
function renderInvList() {
  const rows = invProductosFiltrados();
  if (!INV.productos.length) return `<div class="card"><div class="mut" style="padding:8px">Este proveedor no tiene productos. Añádelos en «Configurar».</div></div>`;
  if (!rows.length) return `<div class="card"><div class="mut" style="padding:8px">Ningún producto coincide con la búsqueda.</div></div>`;
  const bt = "width:54px;height:54px;font-size:26px;line-height:1;border-radius:14px;flex:0 0 auto";
  return rows.map((p) => `<div class="card" style="padding:14px;margin-bottom:10px">
    <div style="font-weight:600;font-size:15px">${esc(p.nombre)}</div>
    <div class="mut" style="font-size:13px;margin:2px 0 12px">${esc(p.unidad || "unidades")}${p.observacion ? ' · <span style="color:var(--brand)">nota</span>' : ""}</div>
    <div style="display:flex;align-items:center;gap:12px;justify-content:center">
      <button class="btn" data-act="inv-minus" data-id="${p.id}" style="${bt}">−</button>
      <input class="invqty" id="invq-${p.id}" data-id="${p.id}" type="number" inputmode="decimal" min="0" step="any" value="${esc(invRowCant(p))}" placeholder="0" style="width:96px;height:50px;text-align:center;font-size:22px;font-weight:600">
      <button class="btn" data-act="inv-plus" data-id="${p.id}" style="${bt}">+</button>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:13px">
      <span class="mut">Stock necesario: <b>${num(p.necesario)} ${esc(p.unidad || "")}</b></span>
      <button class="linkbtn" style="color:var(--brand)" data-act="inv-obs" data-id="${p.id}">${p.observacion ? "Ver nota" : "+ Observación"}</button>
    </div>
  </div>`).join("");
}
function invProd(id) { return INV.productos.find((p) => String(p.id) === String(id)); }
function invRefreshList() { const el = document.getElementById("invList"); if (el) el.innerHTML = renderInvList(); }
async function invSaveLinea(id) {
  const p = invProd(id); if (!p) return;
  const cantidad = (p.cantidad === "" || p.cantidad == null) ? 0 : Math.max(0, Number(p.cantidad) || 0);
  try { await apiSend("POST", `/api/inventario/sesion/${encodeURIComponent(INV.sesionId)}/linea`, { producto_id: id, cantidad, observacion: p.observacion || "" }); }
  catch (e) { if (e.message !== "noauth") toast("No se pudo guardar: " + e.message); }
}
function invStep(id, delta) {
  const p = invProd(id); if (!p) return;
  const val = Math.max(0, (Number(p.cantidad) || 0) + delta);
  p.cantidad = val;
  const inp = document.getElementById("invq-" + id); if (inp) inp.value = val;
  invSaveLinea(id);
}
function invInput(id, raw) {
  const p = invProd(id); if (!p) return;
  p.cantidad = raw === "" ? "" : Math.max(0, Number(raw) || 0);
  if (_invTimers[id]) clearTimeout(_invTimers[id]);
  _invTimers[id] = setTimeout(() => invSaveLinea(id), 400);
}
async function invObs(id) {
  const p = invProd(id); if (!p) return;
  const txt = await promptModal(`Observación · ${p.nombre}`, { placeholder: p.observacion || "Ej. caja abierta, caduca pronto…", ok: "Guardar" });
  if (txt === null) return;
  p.observacion = txt;
  await invSaveLinea(id);
  invRefreshList();
}

// ── Revisión ──
async function loadInvRevision() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const j = await apiRaw("/api/inventario/sesion/" + encodeURIComponent(INV.sesionId) + "/revision"); view.innerHTML = renderInvRevision(j); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function renderInvRevision(j) {
  const rev = j.revision || [];
  const aPedir = rev.filter((r) => r.sugerido > 0);
  const back = { act: "inv-volver-conteo", label: "Seguir contando" };
  const head = invHeader("Revisar inventario", `${esc(INV.proveedorNombre)} · ${esc(INV.local)}`, back);
  const filas = rev.map((r) => {
    const col = r.sugerido > 0 ? "color:var(--brand);font-weight:700" : "color:var(--ink3)";
    // El mínimo no cambia cuánto se pide: avisa de que se está a punto de quedar sin, que es
    // otra cosa y hasta ahora no se decía en ningún sitio.
    const aviso = r.bajoMinimo ? ` <span class="pill bad" style="font-size:10px" title="Por debajo del mínimo (${num(r.minimo)} ${esc(r.unidad || "")})">bajo mínimo</span>` : "";
    return `<tr${r.bajoMinimo ? ' class="sincat"' : ""}><td>${esc(r.nombre)}${aviso}</td><td class="r tnum">${num(r.contado)}</td><td class="r tnum">${num(r.necesario)}</td><td class="r tnum">${num(r.diferencia)}</td><td class="r tnum" style="${col}">${r.sugerido > 0 ? num(r.sugerido) + " " + esc(r.unidad || "") : "—"}</td></tr>`;
  }).join("");
  const tabla = rev.length ? `<div class="card p0"><div class="tw"><table class="tbl"><thead><tr><th>Producto</th><th class="r">Contado</th><th class="r">Necesario</th><th class="r">Dif.</th><th class="r">A pedir</th></tr></thead><tbody>${filas}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin productos.</div></div>`;
  let accion;
  if (j.pedido_existente) accion = `<div class="toolbar"><div class="mut" style="flex:1">Ya existe un pedido para este inventario.</div><button class="btn primary" data-act="inv-ver-pedido" data-id="${j.pedido_existente.id}">Ver pedido ›</button></div>`;
  else if (aPedir.length) accion = `<div class="toolbar"><div class="mut" style="flex:1"><b>${aPedir.length}</b> producto(s) por debajo del stock necesario.</div><button class="btn primary" data-act="inv-generar-pedido">Generar pedido ›</button></div>`;
  else accion = `<div class="card"><div class="mut" style="padding:8px">Todo cubierto: no hace falta pedir nada. El inventario queda guardado.</div></div>`;
  return `${head}${accion}${tabla}`;
}
async function invGenerarPedido() {
  try { const j = await apiSend("POST", "/api/inventario/pedido", { sesion_id: INV.sesionId }); toast(j.existente ? "Pedido ya existente" : "Pedido generado ✅"); loadInvPedido(j.id); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// ── Pedido ──
async function loadInvPedido(id) {
  INV.pedidoId = id;
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const j = await apiRaw("/api/inventario/pedido/" + encodeURIComponent(id)); view.innerHTML = renderInvPedido(j); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function renderInvPedido(j) {
  const ped = j.pedido; const lineas = j.lineas || [];
  const editable = ped.estado === "DRAFT";
  const estadoPill = ped.estado === "APPROVED" ? '<span class="pill ok">Aprobado</span>' : ped.estado === "CANCELLED" ? '<span class="pill bad">Cancelado</span>' : '<span class="pill warn">Borrador</span>';
  const back = { act: "inv-pedidos", label: "Pedidos" };
  const head = invHeader("Pedido a " + esc(j.proveedor ? j.proveedor.nombre : ""), `${esc(ped.local)} · ${esc((ped.creado_en || "").slice(0, 10))} ${estadoPill}`, back);
  const bt = "width:44px;height:44px;font-size:22px;line-height:1;border-radius:12px;flex:0 0 auto";
  const filas = lineas.length ? lineas.map((l) => `<div class="card" style="padding:12px;margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;gap:8px"><div style="font-weight:600">${esc(l.nombre)}</div>${editable ? `<button class="linkbtn" data-act="inv-linea-del" data-id="${l.id}" title="Quitar">✕</button>` : ""}</div>
    <div class="mut" style="font-size:12.5px;margin:2px 0 10px">Contado ${num(l.stock_contado)} · Necesario ${num(l.stock_necesario)} · Sugerido ${num(l.cantidad_sugerida)} ${esc(l.unidad || "")}</div>
    <div style="display:flex;align-items:center;gap:10px">
      ${editable ? `<button class="btn" data-act="inv-linea-minus" data-id="${l.id}" style="${bt}">−</button>` : ""}
      <input class="invpq" id="invpq-${l.id}" data-id="${l.id}" type="number" inputmode="decimal" min="0" step="any" value="${esc(num(l.cantidad_final))}" ${editable ? "" : "disabled"} style="width:90px;height:46px;text-align:center;font-size:20px;font-weight:600">
      ${editable ? `<button class="btn" data-act="inv-linea-plus" data-id="${l.id}" style="${bt}">+</button>` : ""}
      <span class="mut" style="flex:1;text-align:right">${esc(l.unidad || "")}</span>
    </div>
  </div>`).join("") : `<div class="card"><div class="mut" style="padding:8px">Pedido sin líneas.</div></div>`;
  const obs = `<div class="card" style="padding:12px;margin-bottom:10px"><label class="mut" style="font-size:12px;display:block;margin-bottom:6px">Observaciones del pedido</label><textarea id="invPedObs" rows="2" ${editable ? "" : "disabled"} style="width:100%">${esc(ped.observaciones || "")}</textarea></div>`;
  let acciones = "";
  if (editable) acciones = `<div class="toolbar"><button class="btn" data-act="inv-guardar-pedido">Guardar borrador</button><div style="flex:1"></div><button class="btn" data-act="inv-cancelar-pedido">Cancelar pedido</button><button class="btn primary" data-act="inv-aprobar-pedido">Aprobar pedido</button></div>`;
  else if (ped.estado === "APPROVED") acciones = `<div class="toolbar"><div class="mut" style="flex:1">Pedido aprobado (no editable).</div><button class="btn" data-act="inv-cancelar-pedido">Cancelar</button></div>`;
  return `${head}${acciones}${obs}${filas}`;
}
function invPedLineaVal(id, v) { const inp = document.getElementById("invpq-" + id); if (inp) inp.value = v; }
function invPedStep(id, delta) { const inp = document.getElementById("invpq-" + id); if (!inp) return; inp.value = Math.max(0, (Number(inp.value) || 0) + delta); }
async function invGuardarPedido(silencioso) {
  const lineas = Array.from(document.querySelectorAll(".invpq")).map((inp) => ({ id: inp.getAttribute("data-id"), cantidad_final: Math.max(0, Number(inp.value) || 0) }));
  const obs = (document.getElementById("invPedObs") || {}).value || "";
  try { await apiSend("PUT", "/api/inventario/pedido/" + encodeURIComponent(INV.pedidoId), { lineas, observaciones: obs }); if (!silencioso) toast("Borrador guardado ✅"); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function invDelLinea(id) {
  try { await apiSend("PUT", "/api/inventario/pedido/" + encodeURIComponent(INV.pedidoId), { eliminar: [id] }); loadInvPedido(INV.pedidoId); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function invCambiarEstadoPedido(estado, msg) {
  if (!(await confirmModal(estado === "APPROVED" ? "¿Aprobar este pedido? Después no se podrá editar." : "¿Cancelar este pedido?", { ok: msg, danger: estado === "CANCELLED" }))) return;
  await invGuardarPedido(true); // conserva cantidades editadas antes de cambiar estado
  try { await apiSend("PUT", "/api/inventario/pedido/" + encodeURIComponent(INV.pedidoId), { estado }); toast(msg + " ✅"); loadInvPedido(INV.pedidoId); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// ── Pedidos (historial) ──
async function loadInvPedidos() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const data = await api("/api/inventario/pedidos?local=" + encodeURIComponent(INV.local)); view.innerHTML = renderInvPedidos(data || []); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function renderInvPedidos(list) {
  const back = { act: "inv-volver-prov", label: "Proveedores" };
  const pill = (e) => e === "APPROVED" ? '<span class="pill ok">Aprobado</span>' : e === "CANCELLED" ? '<span class="pill bad">Cancelado</span>' : '<span class="pill warn">Borrador</span>';
  const rows = list.length ? `<div class="card p0"><div class="rows">${list.map((p) => `<div class="row" data-act="inv-ver-pedido" data-id="${p.id}" style="cursor:pointer"><div class="grow"><div class="t1">${esc(p.proveedor_nombre || "—")}</div><div class="t2">${esc((p.creado_en || "").slice(0, 10))} · ${num(p.n_lineas)} línea(s) · ${num(p.total_unidades)} uds</div></div>${pill(p.estado)}</div>`).join("")}</div></div>` : `<div class="card"><div class="mut" style="padding:8px">Aún no hay pedidos en este local.</div></div>`;
  return `${invHeader("Pedidos", esc(INV.local), back)}${rows}`;
}

// ── Configuración de productos del proveedor ──
async function loadInvConfig(proveedorId, nombre) {
  if (proveedorId) { INV.proveedorId = proveedorId; INV.proveedorNombre = nombre; }
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const j = await apiRaw("/api/inventario/productos?proveedor_id=" + encodeURIComponent(INV.proveedorId)); INV.local = j.proveedor.local; INV.proveedorNombre = j.proveedor.nombre; view.innerHTML = renderInvConfig(j.data || []); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function renderInvConfig(list) {
  const back = { act: "inv-volver-prov", label: "Proveedores" };
  const toolbar = `<div class="toolbar"><div class="mut" style="flex:1;font-size:13px">Configura productos, unidad y stock necesario (por local).</div><button class="btn primary" data-act="inv-nuevo-prod">+ Producto</button></div>`;
  const rows = list.length ? `<div class="card p0"><div class="rows">${list.map((p) => {
    const temp = (p.temporada_stock != null && p.temporada_stock !== "" && p.temporada_inicio) ? ` · temporada ${num(p.temporada_stock)} (${esc(p.temporada_inicio)}→${esc(p.temporada_fin || "")})` : "";
    return `<div class="row"><div class="grow"><div class="t1">${esc(p.nombre)} ${p.activo ? "" : '<span class="pill bad" style="font-size:10px">inactivo</span>'}</div><div class="t2">${esc(p.unidad)} · necesario ${num(p.stock_objetivo)}${temp}${p.observaciones ? " · " + esc(p.observaciones) : ""}</div></div><button class="linkbtn" style="color:var(--brand)" data-act="inv-edit-prod" data-id="${p.id}">Editar</button> · <button class="linkbtn" data-act="inv-del-prod" data-id="${p.id}" data-nombre="${esc(p.nombre)}">Borrar</button></div>`;
  }).join("")}</div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin productos. Añade el primero con «+ Producto».</div></div>`;
  return `${invHeader("Configurar · " + esc(INV.proveedorNombre), esc(INV.local), back)}${toolbar}${rows}`;
}
const INV_UNIDADES = ["unidades", "cajas", "botellas", "kilos", "bolsas", "barriles", "litros", "packs"];
function invProductoForm(p) {
  const uniOpts = INV_UNIDADES.map((u) => `<option value="${u}" ${(p && p.unidad === u) ? "selected" : ""}>${u}</option>`).join("");
  return `<form id="fInvProd"><div class="form-grid">
    <div class="field full"><label>Nombre</label><input name="nombre" required value="${p ? esc(p.nombre) : ""}"></div>
    <div class="field"><label>Unidad de inventario</label><select name="unidad">${uniOpts}</select></div>
    <div class="field"><label>Stock necesario (normal)</label><input name="stock_objetivo" type="number" min="0" step="any" value="${p ? esc(p.stock_objetivo) : "0"}"></div>
    <div class="field"><label>Stock mínimo (opcional)</label><input name="stock_minimo" type="number" min="0" step="any" value="${p ? esc(p.stock_minimo) : "0"}"></div>
    <div class="field"><label>Orden</label><input name="orden" type="number" min="0" step="1" value="${p ? esc(p.orden) : "0"}"></div>
    <div class="field full"><div class="mut" style="font-size:12px;margin-bottom:4px">Temporada alta (opcional): otro stock necesario entre dos fechas.</div></div>
    <div class="field"><label>Stock en temporada</label><input name="temporada_stock" type="number" min="0" step="any" value="${(p && p.temporada_stock != null) ? esc(p.temporada_stock) : ""}" placeholder="—"></div>
    <div class="field"><label>Desde (MM-DD)</label><input name="temporada_inicio" placeholder="06-01" value="${p ? esc(p.temporada_inicio || "") : ""}"></div>
    <div class="field"><label>Hasta (MM-DD)</label><input name="temporada_fin" placeholder="09-15" value="${p ? esc(p.temporada_fin || "") : ""}"></div>
    <div class="field full"><label>Observaciones</label><input name="observaciones" value="${p ? esc(p.observaciones || "") : ""}"></div>
    <label class="field full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="activo" ${(!p || p.activo) ? "checked" : ""} style="width:auto"> Producto activo</label>
  </div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>`;
}
function invProductoData(form) {
  return {
    nombre: form.nombre.value.trim(), unidad: form.unidad.value, stock_objetivo: form.stock_objetivo.value,
    stock_minimo: form.stock_minimo.value, orden: form.orden.value, temporada_stock: form.temporada_stock.value,
    temporada_inicio: form.temporada_inicio.value.trim(), temporada_fin: form.temporada_fin.value.trim(),
    observaciones: form.observaciones.value.trim(), activo: form.activo.checked,
  };
}
function invNuevoProducto() {
  const ov = modal("Nuevo producto", invProductoForm(null));
  ov.querySelector("#fInvProd").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await apiSend("POST", "/api/inventario/productos", { proveedor_id: INV.proveedorId, ...invProductoData(e.target) }); ov.remove(); toast("Producto creado ✅"); loadInvConfig(); }
    catch (err) { toast("Error: " + err.message); }
  });
}
async function invEditProducto(id) {
  let p; try { p = (await apiRaw("/api/inventario/productos?proveedor_id=" + encodeURIComponent(INV.proveedorId))).data.find((x) => String(x.id) === String(id)); } catch { return; }
  if (!p) return;
  const ov = modal("Editar producto", invProductoForm(p));
  ov.querySelector("#fInvProd").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await apiSend("PUT", "/api/inventario/productos/" + encodeURIComponent(id), invProductoData(e.target)); ov.remove(); toast("Producto actualizado ✅"); loadInvConfig(); }
    catch (err) { toast("Error: " + err.message); }
  });
}
async function invDelProducto(id, nombre) {
  if (!(await confirmModal(`¿Borrar el producto "${nombre}"?`, { ok: "Borrar", danger: true }))) return;
  try { await apiSend("DELETE", "/api/inventario/productos/" + encodeURIComponent(id)); toast("Producto borrado ✅"); loadInvConfig(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// ════════════════════════ VISTA: CLIENTES ════════════════════════
let CLIF = { q: "", poblacion: "", local: "", cumple: false, con_email: false, con_telefono: false, excluir_baja: false };
let CLI_TOTAL = 0;
let CLI_POBLACIONES = [];
let _cliTimer = null;
async function apiRaw(path) { const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } }); if (await fueraDeSesion(r)) throw new Error("noauth"); const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error"); return j; }
// El mes de HOY como «MM». El filtro «cumpleaños este mes» mandaba un `1` literal —la marca
// de «casilla activada»— y el servidor lo leía como el mes 01: en agosto no salía nadie y en
// enero salía media lista. El mes tiene que viajar, no un booleano.
const mesActualMM = () => String(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })).slice(5, 7);
function cliQS() { const qs = new URLSearchParams(); if (CLIF.q) qs.set("q", CLIF.q); if (CLIF.poblacion) qs.set("poblacion", CLIF.poblacion); if (CLIF.local) qs.set("local", CLIF.local); if (CLIF.cumple) qs.set("cumple_mes", mesActualMM()); if (CLIF.con_email) qs.set("con_email", "1"); if (CLIF.con_telefono) qs.set("con_telefono", "1"); if (CLIF.excluir_baja) qs.set("excluir_baja", "1"); return qs.toString(); }
function cliChk(id, campo, label) { return `<label style="display:inline-flex;align-items:center;gap:7px;font-size:13px;cursor:pointer;white-space:nowrap"><input type="checkbox" id="${id}" ${CLIF[campo] ? "checked" : ""} style="width:auto;height:auto;margin:0"> ${esc(label)}</label>`; }
function cliActionsBar(total) {
  return `<div class="toolbar" style="margin-top:2px"><button class="btn primary" data-act="cli-masivo" ${total ? "" : "disabled"}>${ic("chat", 15)} Escribir a los ${num(total)} filtrados (WhatsApp)</button><button class="btn" data-act="cli-masivo-email" disabled title="Se activa al configurar el email">Enviar email a los filtrados</button><div style="flex:1"></div>${USER.rol === "direccion" ? `<button class="btn" data-act="cli-dup" title="Buscar fichas repetidas de la misma persona">Fichas repetidas</button>` : ""}<button class="btn" data-act="cli-csv">Exportar CSV</button></div>`;
}
// Cumpleaños: "12 abr 1988 (38)". Sin fecha → "—". La edad solo si el año es plausible.
function fechaNac(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  if (p.length !== 3 || !Number(p[0])) return "—";
  const hoy = todayStr().split("-").map(Number);
  const [y, m, d] = p.map(Number);
  let edad = hoy[0] - y; if (hoy[1] < m || (hoy[1] === m && hoy[2] < d)) edad--;
  const base = `${d} ${DP_MESC[m - 1] || ""} ${y}`;
  return (edad >= 0 && edad < 120) ? `${base} (${edad})` : base;
}
function cliTable(rows) {
  if (!rows.length) return `<div class="card"><div class="mut" style="padding:8px">Sin clientes con esos filtros.</div></div>`;
  return `<div class="card p0"><div class="tw"><table class="tbl"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Población</th><th>Cumpleaños</th><th>Origen</th><th>Última visita</th><th></th></tr></thead><tbody>${rows.map((c) => {
    const tel = c.telefono || ""; const nom = ((c.nombre || "") + " " + (c.apellidos || "")).trim() || "—";
    const baja = c.baja === 1 || c.baja === true;
    const wa = c.es_contacto_wa ? '<span class="sdot" title="Tiene WhatsApp" style="display:inline-block;width:7px;height:7px;border-radius:999px;background:var(--success);margin-left:6px"></span>' : "";
    const acc = `<div style="display:flex;gap:4px;justify-content:flex-end">${tel ? `<button class="btn sm" data-act="cli-wa" data-tel="${esc(tel)}" data-nombre="${esc(nom)}" title="Escribir por WhatsApp">${ic("chat", 14)}</button><a class="btn sm" href="tel:${esc(tel)}" title="Llamar">${ic("bell", 14)}</a>` : ""}${c.correo ? `<a class="btn sm" href="mailto:${esc(c.correo)}" title="Enviar email">@</a>` : ""}<button class="btn sm" data-act="cli-ficha" data-tel="${esc(tel)}" title="Ver ficha">Ficha</button></div>`;
    return `<tr><td>${esc(nom)}${wa}${baja ? ' <span class="pill bad" style="font-size:10px">Baja</span>' : ""}</td><td class="mut">${esc(tel)}</td><td class="mut">${esc(c.correo || "")}</td><td>${esc(c.poblacion || "")}</td><td class="mut tnum">${esc(fechaNac(c.nacimiento))}</td><td>${esc(c.origen || "")}</td><td class="mut">${esc((c.ultima_actividad || "").slice(0, 10))}</td><td>${acc}</td></tr>`;
  }).join("")}</tbody></table></div></div>`;
}
function cliSubTxt(rows, total) { return `${num(total)} contacto${total === 1 ? "" : "s"}${rows.length < total ? ` · mostrando ${rows.length}` : ""}`; }
function renderClientes(j) {
  const rows = j.data || []; const total = j.total != null ? j.total : rows.length; CLI_TOTAL = total;
  const localOpts = ['<option value="">Cualquier local</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${CLIF.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const pobOpts = ['<option value="">Todas las poblaciones</option>'].concat((CLI_POBLACIONES || []).map((p) => `<option value="${esc(p)}" ${CLIF.poblacion === p ? "selected" : ""}>${esc(p)}</option>`)).join("");
  // Barra 1: búsqueda + selectores. Barra 2: casillas de filtro agrupadas. Sin botón «Buscar»:
  // el listado se auto-actualiza al escribir, seleccionar o marcar (ver listeners globales).
  const toolbar = `<div class="toolbar">
    <div class="field" style="flex:2;min-width:220px"><label>Buscar</label><input id="cQ" placeholder="Nombre, teléfono, email…" value="${esc(CLIF.q)}" autocomplete="off"></div>
    <div class="field"><label>Población</label><select id="cPob">${pobOpts}</select></div>
    <div class="field"><label>Local</label><select id="cLocal">${localOpts}</select></div>
  </div>
  <div class="toolbar" style="margin-top:-4px;align-items:center;gap:18px;flex-wrap:wrap"><span class="mut" style="font-size:12px;font-weight:600;letter-spacing:.02em">FILTROS</span>${cliChk("cCumple", "cumple", "Cumple este mes")}${cliChk("cEmail", "con_email", "Con email")}${cliChk("cTel", "con_telefono", "Con teléfono")}${cliChk("cBaja", "excluir_baja", "Excluir bajas")}</div>`;
  const head = `<div class="ph"><div class="eyebrow">Base de clientes</div><h1>Clientes</h1><div class="sub" id="cliSub">${cliSubTxt(rows, total)}</div></div>`;
  return `${head}${toolbar}<div id="cliBody">${cliActionsBar(total)}${cliTable(rows)}</div>`;
}
async function loadClientes() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    // Las dos peticiones salen a la vez: encadenadas, la pantalla tardaba dos viajes de red
    // en aparecer, y la lista de poblaciones (que solo llena un desplegable) no depende de nada.
    const [pob, j] = await Promise.all([
      CLI_POBLACIONES.length ? null : apiRaw("/api/contactos/poblaciones").catch(() => null),
      apiRaw("/api/contactos" + (cliQS() ? "?" + cliQS() : "")),
    ]);
    if (pob) CLI_POBLACIONES = pob.data || [];
    view.innerHTML = renderClientes(j);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
// Refresca SOLO los resultados (no la barra) para no perder el foco/cursor mientras se escribe.
async function refreshCliResults() {
  try {
    const j = await apiRaw("/api/contactos" + (cliQS() ? "?" + cliQS() : ""));
    const rows = j.data || []; const total = j.total != null ? j.total : rows.length; CLI_TOTAL = total;
    const body = document.getElementById("cliBody"); if (body) body.innerHTML = cliActionsBar(total) + cliTable(rows);
    const sub = document.getElementById("cliSub"); if (sub) sub.innerHTML = cliSubTxt(rows, total);
  } catch (e) { if (e.message !== "noauth") { const body = document.getElementById("cliBody"); if (body) body.innerHTML = errorCard(e.message); } }
}
function cliRefreshDebounced() { if (_cliTimer) clearTimeout(_cliTimer); _cliTimer = setTimeout(refreshCliResults, 250); }
async function downloadClientesCsv() { try { const r = await fetch("/api/leads/export.csv" + (cliQS() ? "?" + cliQS() : ""), { headers: { Authorization: "Bearer " + token() } }); if (!r.ok) { toast("No se pudo exportar"); return; } const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "clientes.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); } catch { toast("No se pudo exportar"); } }
// ── Fichas repetidas ────────────────────────────────────────────────────────
// Esto BORRA filas, así que la pantalla enseña primero exactamente qué va a pasar y solo
// después deja aplicar. Y al aplicar se manda de vuelta el número de fichas del informe:
// si entre medias ha entrado un lead nuevo, el servidor se niega y hay que volver a mirar.
async function cliDuplicados() {
  const ov = modal("Fichas repetidas", '<p class="mut">Revisando…</p>');
  ov.querySelector(".modal").style.maxWidth = "760px";
  let j;
  try { j = await apiRaw("/api/clientes/duplicados"); }
  catch (e) { ov.querySelector(".modal-b").innerHTML = `<p class="mut">${esc(e.message)}</p>`; return; }

  if (!j.fichasABorrar) {
    ov.querySelector(".modal-b").innerHTML = `
      <p style="margin:0 0 14px;line-height:1.55">No hay ninguna ficha repetida. De ${num(j.total)} contactos,
        ${num(j.sinMovil)} no tienen un móvil de 9 dígitos y por eso no se comparan.</p>
      ${j.avisoCorreo.length ? cliDupAvisoCorreo(j) : ""}
      <div style="display:flex;justify-content:flex-end"><button class="btn" data-close>Cerrar</button></div>`;
    return;
  }

  ov.querySelector(".modal-b").innerHTML = `
    <p style="margin:0 0 14px;line-height:1.55">
      <b>${num(j.personasDuplicadas)} personas</b> tienen más de una ficha, casi siempre porque el mismo móvil se
      guardó escrito de formas distintas. Se conservaría la más antigua de cada una, rellenándole los datos que le
      falten con los más recientes, y se borrarían <b>${num(j.fichasABorrar)} fichas</b>.
      Las reservas <b>no se tocan</b>.</p>

    <details class="card fold" style="margin-bottom:12px"><summary><h3>Qué se unificaría</h3>
      <span class="foldr"><span>${num(j.personasDuplicadas)} personas</span><span class="car">${ic("chev", 16)}</span></span></summary>
      <div class="tw" style="max-height:220px;overflow:auto"><table class="tbl">
        <thead><tr><th>Móvil</th><th>Se queda</th><th style="text-align:right">Fichas</th></tr></thead>
        <tbody>${j.grupos.slice(0, 60).map((g) => `<tr>
          <td class="mut">···${esc(String(g.tel9).slice(-6))}</td>
          <td><b>${esc([g.nombre, g.apellidos].filter(Boolean).join(" ") || "sin nombre")}</b>
            ${g.correo ? `<span class="mut"> · ${esc(g.correo)}</span>` : ""}</td>
          <td style="text-align:right">${g.fichas}</td></tr>`).join("")}</tbody></table></div>
      ${j.grupos.length > 60 ? `<div class="mut" style="padding:8px 18px">…y ${num(j.grupos.length - 60)} más</div>` : ""}
    </details>

    ${j.avisoCorreo.length ? cliDupAvisoCorreo(j) : ""}

    <p class="fic-nota">Antes de tocar nada se guarda una <b>copia de seguridad</b> de las dos tablas dentro de la
      misma base. Si algo sale mal se puede volver atrás; te digo el nombre de la copia al terminar.</p>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn" data-close>Ahora no</button>
      <button class="btn primary" id="cliDupOk">Unificar las ${num(j.fichasABorrar)} fichas</button>
    </div>`;

  ov.querySelector("#cliDupOk").addEventListener("click", async () => {
    if (!await confirmModal(`Se borrarán ${j.fichasABorrar} fichas repetidas, quedándose con una por persona. Se guarda copia antes.`, { ok: "Unificar", danger: true })) return;
    const btn = ov.querySelector("#cliDupOk");
    btn.disabled = true; btn.textContent = "Unificando…";
    try {
      const r = await apiSend("POST", "/api/clientes/duplicados/unificar", { fichas_a_borrar: j.fichasABorrar });
      ov.remove(); toast(r.mensaje || "Unificado ✅"); refreshCliResults();
    } catch (e) { btn.disabled = false; btn.textContent = "Reintentar"; toast(e.message); }
  });
}

// Mismo correo con móviles distintos: no se unifican solas porque pueden ser dos personas
// de la misma casa. Se enseñan para mirarlas a mano.
function cliDupAvisoCorreo(j) {
  return `<details class="card fold" style="margin-bottom:12px"><summary><h3>Mismo correo, móviles distintos</h3>
    <span class="foldr"><span>${num(j.avisoCorreo.length)} · no se tocan</span><span class="car">${ic("chev", 16)}</span></span></summary>
    <div style="padding:0 18px 14px">
      <p class="mut" style="margin:6px 0 10px;line-height:1.5">Puede ser una pareja o una familia compartiendo correo,
        así que no se unifican solas. Míralas cuando puedas.</p>
      <div class="rows">${j.avisoCorreo.slice(0, 20).map((a) => `<div class="row"><div class="grow">
        <div class="t1">${esc(a.correo)}</div><div class="t2">${esc(a.telefonos)}</div></div></div>`).join("")}</div>
    </div></details>`;
}

// Escribir por WhatsApp a un contacto (individual).
function cliWa(tel, nombre) {
  const ov = modal("Escribir por WhatsApp", `<div class="mut" style="margin-bottom:8px">Para <b>${esc(nombre)}</b> · ${esc(tel)}</div><textarea id="cwMsg" rows="4" style="width:100%" placeholder="Escribe tu mensaje… (puedes usar {nombre})"></textarea><div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="cwSend">Enviar</button></div>`);
  ov.querySelector("#cwSend").addEventListener("click", async () => {
    const mensaje = (ov.querySelector("#cwMsg").value || "").trim(); if (!mensaje) { toast("Escribe el mensaje"); return; }
    try { await apiSend("POST", "/api/contactos/mensaje", { telefono: tel, mensaje }); ov.remove(); toast("Mensaje enviado ✅"); }
    catch (e) { toast("Error: " + e.message); }
  });
}
// Envío masivo al conjunto filtrado.
function cliMasivo() {
  const ov = modal("Escribir a los contactos filtrados", `<div class="mut" style="margin-bottom:8px">Se enviará por WhatsApp a los <b>${num(CLI_TOTAL)}</b> contactos del filtro actual. Se <b>excluyen bajas</b> y sin teléfono; el ritmo es lento (anti-bloqueo).</div><textarea id="cmMsg" rows="4" style="width:100%" placeholder="Mensaje… Usa {nombre}, {apellidos} para personalizar"></textarea><label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:10px"><input type="checkbox" id="cmOptin" style="width:auto;height:auto"> Solo a quienes dieron consentimiento (opt-in)</label><div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="cmSend">Enviar a todos</button></div>`);
  ov.querySelector("#cmSend").addEventListener("click", async () => {
    const mensaje = (ov.querySelector("#cmMsg").value || "").trim(); if (!mensaje) { toast("Escribe el mensaje"); return; }
    const soloOptIn = ov.querySelector("#cmOptin").checked;
    const ok = await confirmModal(`¿Enviar este mensaje al segmento filtrado (${num(CLI_TOTAL)} contactos) por WhatsApp?`, { ok: "Enviar", danger: false }); if (!ok) return;
    try {
      const body = Object.assign({ mensaje, soloOptIn }, filtrosClienteBody());
      const j = await apiSend("POST", "/api/contactos/mensaje-masivo", body);
      ov.remove();
      const om = j.omitidos || {}; const omTxt = [om.baja ? `${om.baja} baja(s)` : "", om.sin_telefono ? `${om.sin_telefono} sin teléfono` : "", om.sin_optin ? `${om.sin_optin} sin opt-in` : ""].filter(Boolean).join(", ");
      toast(j.enviables ? `Enviando a ${j.enviables} contacto(s)${omTxt ? " · omitidos: " + omTxt : ""} ✅` : (j.aviso || "No hay destinatarios enviables"));
    } catch (e) { toast("Error: " + e.message); }
  });
}
function filtrosClienteBody() { const b = {}; if (CLIF.q) b.q = CLIF.q; if (CLIF.poblacion) b.poblacion = CLIF.poblacion; if (CLIF.local) b.local = CLIF.local; if (CLIF.cumple) b.cumple_mes = mesActualMM(); if (CLIF.con_email) b.con_email = 1; if (CLIF.con_telefono) b.con_telefono = 1; return b; }
// Ficha de contacto: datos, visitas, reservas, WhatsApp y consentimiento.
async function cliFicha(tel) {
  let d; try { d = (await apiRaw("/api/contactos/" + encodeURIComponent(tel))).data; } catch (e) { toast("Error: " + e.message); return; }
  const p = d.prefs || {};
  const resv = (d.reservas || []).slice(0, 8).map((r) => `<div class="row"><div class="grow"><div class="t1">${esc(r.local || "—")}</div><div class="t2">${esc(r.dia || "")} ${esc(r.hora || "")} · ${esc(String(r.personas || ""))} pax</div></div></div>`).join("") || `<div class="mut" style="padding:10px 14px">Sin reservas registradas.</div>`;
  const chk = (campo, label) => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-ficha-pref="${campo}" ${p[campo] ? "checked" : ""} style="margin-right:6px">${esc(label)}</label>`;
  const ov = modal(d.nombre || tel, `<div class="grid" style="gap:12px">
    <div class="card" style="padding:12px 14px"><div class="t2">${esc(tel)}${d.es_contacto_wa ? " · tiene WhatsApp" : ""}</div><div style="margin-top:4px">${esc(d.correo || "Sin email")} · ${esc(d.poblacion || "Sin población")} · ${d.visitas} visita(s)${d.ultimo_local ? " · último: " + esc(d.ultimo_local) : ""}</div><div class="t2" style="margin-top:4px">Cumpleaños: ${esc(fechaNac(d.nacimiento))}</div></div>
    <div class="card" style="padding:12px 14px"><div class="ch"><h3>Consentimiento</h3></div><div style="display:flex;gap:8px;flex-wrap:wrap" data-tel="${esc(tel)}">${chk("opt_in_wa", "Opt-in WhatsApp")}${chk("opt_in_email", "Opt-in Email")}${chk("baja", "Baja (no contactar)")}</div></div>
    <div class="card p0"><div class="ch" style="padding:14px 14px 0"><h3>Reservas</h3></div><div class="rows">${resv}</div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">${d.telefono || tel ? `<button class="btn primary" id="fichaWa">Escribir por WhatsApp</button>` : ""}<button class="btn" data-close>Cerrar</button></div>
  </div>`);
  ov.addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-ficha-pref]"); if (!cb) return;
    const campo = cb.getAttribute("data-ficha-pref");
    try { await apiSend("PATCH", "/api/contactos/prefs", { telefono: tel, [campo]: cb.checked ? 1 : 0 }); toast("Preferencia guardada ✅"); }
    catch (err) { toast("Error: " + err.message); cb.checked = !cb.checked; }
  });
  const waBtn = ov.querySelector("#fichaWa"); if (waBtn) waBtn.addEventListener("click", () => { ov.remove(); cliWa(tel, d.nombre || tel); });
}

// ════════════════════════ VISTA: RESEÑAS (responder · IA · masivas) ════════════════════════
//
// EL ESTABLECIMIENTO LO FIJA LA BARRA DE ARRIBA, como en el resto del panel. Aquí había dos
// filas de píldoras de local: una filtraba pero no informaba y otra informaba pero no se podía
// pulsar. Dos formas de elegir local en la misma pantalla —la de la barra y la de aquí— y
// ninguna de las dos completa. Ahora manda la de la barra y punto.
//
// El nombre del establecimiento NO viaja como filtro de texto: el servidor lo traduce a los
// nombres de ficha de Google que le correspondan (la ficha se llama «Blanes» y nosotros
// «La Tapeta - Blanes»). Si no hay ficha vinculada, se dice; no se renombra nada.
let REVF = { rating: "", estado: "", q: "", autor: "", from: "", to: "", sort: "recientes" };
let REV_DATA = [], REV_SEL = new Set(), REV_STATUS = null;
let REV_CONT = { total: 0, pendientes: 0, respondidas: 0 }, REV_HASMORE = false;
let REV_PAGINA = 0, REV_SIN_FICHA = false;
const REV_TAM = 50;

function renderReviews() {
  const rows = REV_DATA;
  const puedeActualizar = USER.rol === "direccion" || USER.rol === "marketing";
  const st = REV_STATUS;
  const fuenteTxt = (s) => s === "places" ? "Places" : s === "business_profile" ? "Business Profile" : (!s || s === "none") ? "Ninguna" : esc(s);
  const estadoBanner = st ? `<div class="card" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="pill ${st.reviews_count > 0 ? "ok" : st.connected ? "warn" : "bad"}">${st.connected ? "OAuth conectado" : "Sin conectar"}</span><div class="grow" style="min-width:0"><div class="t1">${esc(st.mensaje || "")}</div><div class="t2">Fuente: ${fuenteTxt(st.source)} · ${num(st.reviews_count || 0)} reseñas${st.last_fetch ? ` · última sync ${esc(String(st.last_fetch).slice(0, 16).replace("T", " "))}` : ""}${st.last_attempt ? ` · último intento ${esc(String(st.last_attempt).slice(0, 16).replace("T", " "))}` : ""}${st.last_error ? ` · último error: ${esc(String(st.last_error).slice(0, 80))}` : ""}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">${USER.rol === "direccion" ? '<button class="btn" data-act="rev-vincular">Vincular fichas de Google</button>' : ""}${puedeActualizar ? '<button class="btn primary" data-act="rev-refresh">Actualizar desde Google</button>' : ""}</div></div>` : "";
  const cont = `<div class="grid g3" style="margin-bottom:14px">${stat("Total reseñas", "star", num(REV_CONT.total))}${stat("Pendientes", "bell", num(REV_CONT.pendientes))}${stat("Respondidas", "chat", num(REV_CONT.respondidas))}</div>`;
  // Cero reseñas por falta de ficha vinculada NO es lo mismo que cero reseñas. Sin este aviso,
  // la pantalla vacía parece un local sin opiniones y nadie va a mirar el vínculo con Google.
  const avisoFicha = REV_SIN_FICHA ? `<div class="pendingblock" style="margin-bottom:14px"><b>Este establecimiento no tiene ninguna ficha de Google vinculada</b>, así que no hay reseñas que enseñar. ${USER.rol === "direccion" ? "Se vincula en «Vincular fichas de Google», aquí arriba." : "Díselo a dirección: se arregla desde «Vincular fichas de Google»."}</div>` : "";
  const estadoOpts = [["", "Todas"], ["pendientes", "Sin responder"], ["respondidas", "Respondidas"]].map(([v, t]) => `<option value="${v}" ${REVF.estado === v ? "selected" : ""}>${t}</option>`).join("");
  const ratingOpts = ['<option value="">Todas</option>'].concat([5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${REVF.rating === String(n) ? "selected" : ""}>${n}★</option>`)).join("");
  const sortOpts = [["recientes", "Más recientes"], ["antiguas", "Más antiguas"], ["mejor", "Mejor valoración"], ["peor", "Peor valoración"]].map(([v, t]) => `<option value="${v}" ${REVF.sort === v ? "selected" : ""}>${t}</option>`).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Estado</label><select id="rEstado">${estadoOpts}</select></div><div class="field"><label>Estrellas</label><select id="rRating">${ratingOpts}</select></div><div class="field"><label>Ordenar</label><select id="rSort">${sortOpts}</select></div><div class="field"><label>Buscar</label><input id="rQ" value="${esc(REVF.q)}" placeholder="Texto o autor…"></div><div class="field"><label>Autor</label><input id="rAutor" value="${esc(REVF.autor)}"></div><div class="field"><label>Desde</label><input type="date" id="rFrom" value="${esc(REVF.from)}"></div><div class="field"><label>Hasta</label><input type="date" id="rTo" value="${esc(REVF.to)}"></div><button class="btn" data-act="rev-filtrar">Filtrar</button></div>`;
  const nota = `<div class="pendingblock" style="margin-bottom:16px"><b>Responder en Google, muy pronto.</b> La publicación directa está pendiente de que Google apruebe la cuota de su API. Mientras tanto: redacta la respuesta (con IA si quieres), <b>guárdala</b> aquí y usa <b>Copiar</b> para pegarla en Google.</div>`;
  const bulk = REV_SEL.size ? `<div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><b>${REV_SEL.size} seleccionada${REV_SEL.size === 1 ? "" : "s"}</b><div style="flex:1"></div><button class="btn" data-act="rev-sel-none">Quitar selección</button><button class="btn primary" data-act="rev-bulk">✨ Generar borradores IA</button></div>` : "";
  const vacio = REV_SIN_FICHA ? "No hay reseñas de este establecimiento porque su ficha de Google no está vinculada."
    : REV_CONT.total ? "Sin reseñas con este filtro." : "Aún no hay reseñas importadas. Pulsa «Actualizar desde Google».";
  const body = rows.length ? rows.map(reviewCard).join("") : `<div class="card"><div class="mut" style="padding:8px">${vacio}</div></div>`;
  const masBtn = REV_HASMORE ? `<div style="text-align:center;margin-top:6px"><button class="btn" data-act="rev-more">Cargar más (${num(REV_DATA.length)}/${num(REV_CONT.total)})</button></div>` : "";
  // Qué establecimiento se está mirando: lo dice el rótulo, que es lo que antes hacían las
  // píldoras. El que manda es el selector de la barra de arriba.
  const amb = viendoVarios() ? etiquetaAmbito()
    : localActualFE() ? nombreCortoLocal(localActualFE()) : "";
  return `<div class="ph"><div class="eyebrow">Reputación</div><h1>Reseñas de Google</h1><div class="sub">Bandeja de gestión · filtra, ordena y responde${amb ? ` · <b>${esc(amb)}</b>` : ""}</div></div>${estadoBanner}${cont}${avisoFicha}${nota}${toolbar}${bulk}${body}${masBtn}`;
}

function reviewCard(r) {
  const badge = r.respondida ? '<span class="badge">Respondida</span>' : '<span class="badge warn">Pendiente</span>';
  const origen = r.origen ? `<span class="pill" style="font-size:10px" title="Origen">${r.origen === "places" ? "Places" : "Business"}</span>` : "";
  const check = r.respondida ? "" : `<input type="checkbox" class="revsel" data-act="rev-sel" data-id="${esc(r.id)}" ${REV_SEL.has(String(r.id)) ? "checked" : ""} aria-label="Seleccionar reseña">`;
  const stars = `<span class="stars">${"★".repeat(r.rating)}<span class="mut">${"★".repeat(5 - r.rating)}</span></span>`;
  return `<div class="card revcard ${r.negativa ? "neg" : ""}" style="margin-bottom:12px"><div style="display:flex;gap:12px;align-items:flex-start">${check}<div class="grow" style="min-width:0;flex:1">
    <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">${stars}<b>${esc(r.author)}</b><span class="mut" style="font-size:12px">· ${esc(r.local)} · ${esc(r.fecha)}</span>${origen}<span style="flex:1"></span>${badge}</div>
    ${r.text ? `<p style="margin:8px 0 0;font-size:13.5px;line-height:1.5">${esc(r.text)}</p>` : '<p class="mut" style="margin:8px 0 0;font-size:13px">(sin texto, solo puntuación)</p>'}
    ${r.reply ? `<div class="revreply"><span class="k">Tu respuesta</span><span>${esc(r.reply)}</span></div>` : ""}
    <div style="margin-top:10px;display:flex;gap:8px"><button class="btn sm" data-act="rev-responder" data-id="${esc(r.id)}">${r.respondida ? "Editar respuesta" : "Responder"}</button></div>
  </div></div></div>`;
}

/** El orden que pide la barra de filtros, para rehacerlo cuando se juntan varios locales. */
function revOrdenar(filas, sort) {
  const f = (r) => String(r.fecha || "");
  const cmp = {
    recientes: (a, b) => f(b).localeCompare(f(a)),
    antiguas: (a, b) => f(a).localeCompare(f(b)),
    mejor: (a, b) => (b.rating - a.rating) || f(b).localeCompare(f(a)),
    peor: (a, b) => (a.rating - b.rating) || f(b).localeCompare(f(a)),
  };
  return [...filas].sort(cmp[sort] || cmp.recientes);
}

/**
 * Una petición por local y se juntan, igual que reservas y facturas (`pidePorLocales`). Aquí
 * además hay que SUMAR los contadores y volver a ordenar: cada local viene ordenado por su
 * cuenta, y pegar dos listas ordenadas no da una lista ordenada.
 */
async function revPedir(montaUrl) {
  const locales = localesDelAmbito();
  if (!viendoVarios() || locales.length < 2) return apiSend("GET", montaUrl(localActualFE()));
  const partes = (await Promise.all(locales.map((l) => apiSend("GET", montaUrl(l)).catch(() => null)))).filter(Boolean);
  const suma = (k) => partes.reduce((s, p) => s + ((p.contadores && p.contadores[k]) || 0), 0);
  return {
    ok: true,
    data: revOrdenar(partes.flatMap((p) => p.data || []), REVF.sort),
    contadores: { total: suma("total"), pendientes: suma("pendientes"), respondidas: suma("respondidas") },
    hasMore: partes.some((p) => p.hasMore),
    // Solo se avisa de la ficha sin vincular si le pasa a TODOS: con dos locales y uno bien
    // vinculado, el aviso sería falso —sí hay reseñas, las del otro—.
    sinFicha: partes.length > 0 && partes.every((p) => p.sinFicha),
  };
}

async function loadReviews(append = false) {
  const view = document.getElementById("view"); if (!append) view.innerHTML = skeleton();
  try {
    REV_PAGINA = append ? REV_PAGINA + 1 : 0;
    // El establecimiento sale del selector de la barra, no de un filtro propio de esta pantalla.
    const montaUrl = (local) => {
      const qs = new URLSearchParams();
      ["rating", "estado", "q", "autor", "from", "to", "sort"].forEach((k) => { if (REVF[k]) qs.set(k, REVF[k]); });
      if (local) qs.set("local", local);
      qs.set("limit", String(REV_TAM));
      // El desplazamiento es POR LOCAL: con varios se pide la misma página a cada uno.
      qs.set("offset", String(REV_PAGINA * REV_TAM));
      return "/api/reviews/manage?" + qs.toString();
    };
    const promStatus = append ? Promise.resolve(REV_STATUS) : fetch("/api/google/status").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [j, status] = await Promise.all([revPedir(montaUrl), promStatus]);
    const data = j.data || [];
    if (append) REV_DATA = REV_DATA.concat(data);
    else { REV_DATA = data; REV_SEL.clear(); }
    REV_CONT = j.contadores || REV_CONT; REV_HASMORE = !!j.hasMore; REV_SIN_FICHA = !!j.sinFicha; REV_STATUS = status || REV_STATUS;
    view.innerHTML = renderReviews();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function loadMoreReviews() { loadReviews(true); }
let RVX = [];
async function rvxVincular(local, c) { if (!c || !c.place_id) return; await apiSend("POST", "/api/reviews/vincular-ficha", { local, place_id: c.place_id, google_location_id: c.google_location_id, name: c.name, address: c.address }); }
async function revVincular() {
  let d; try { d = await apiRaw("/api/reviews/descubrir-fichas"); } catch (e) { toast("Error: " + e.message); return; }
  RVX = d.data || [];
  const fuente = d.fuente === "business_profile" ? "Google Business Profile" : d.fuente === "places" ? "Places (búsqueda por nombre + ciudad)" : "—";
  const filas = RVX.map((it, i) => {
    const cands = it.candidatos || [];
    const vinc = it.vinculado && it.vinculado.placeId ? `<div class="t2">✓ Vinculado: ${esc(it.vinculado.official_name || it.vinculado.placeId)}${it.vinculado.address ? " · " + esc(it.vinculado.address) : ""}</div>` : "";
    if (!cands.length) return `<div class="row"><div class="grow"><div class="t1">${esc(it.local)}</div>${vinc || '<div class="t2 mut">Sin coincidencias en Google</div>'}</div></div>`;
    const opts = cands.map((c, ci) => `<option value="${ci}" ${ci === (it.sugerido || 0) ? "selected" : ""}>${esc(c.name)}${c.address ? " — " + esc(c.address) : ""}</option>`).join("");
    return `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(it.local)}</div>${vinc}<select class="rvxSel" data-i="${i}" style="max-width:100%;margin-top:4px">${opts}</select></div><button class="btn sm primary" data-act="rvx-link" data-i="${i}">${it.vinculado ? "Recambiar" : "Vincular"}</button></div>`;
  }).join("");
  const ov = modal("Vincular fichas de Google", `<div class="mut" style="margin-bottom:8px">Fuente: <b>${esc(fuente)}</b>.${d.fuente === "places" ? " Confirma que la ficha es la correcta de cada local." : d.bpError ? " (Business Profile: " + esc(d.bpError) + ")" : ""} No hace falta copiar ningún Place ID de Google Maps.</div><div class="rows" style="max-height:52vh;overflow:auto">${filas || '<div class="mut" style="padding:10px">Sin resultados. ¿Está la clave de Places configurada?</div>'}</div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" data-act="rvx-auto">Auto-vincular sugeridas</button><div style="display:flex;gap:8px"><button class="btn" data-close>Cerrar</button><button class="btn primary" data-act="rvx-refrescar">Vincular y actualizar reseñas</button></div></div>`);
  ov.addEventListener("click", async (e) => {
    const link = e.target.closest('[data-act="rvx-link"]');
    if (link) { const i = +link.getAttribute("data-i"); const sel = ov.querySelector(`.rvxSel[data-i="${i}"]`); const it = RVX[i]; const c = it.candidatos[sel ? +sel.value : (it.sugerido || 0)]; try { await rvxVincular(it.local, c); toast("Vinculado ✅"); ov.remove(); revVincular(); } catch (er) { toast("Error: " + er.message); } return; }
    const auto = e.target.closest('[data-act="rvx-auto"]');
    if (auto) { let n = 0; for (const it of RVX) { if ((!it.vinculado || !it.vinculado.placeId) && it.candidatos && it.candidatos.length) { try { await rvxVincular(it.local, it.candidatos[it.sugerido || 0]); n++; } catch { /* sigue */ } } } toast(`Vinculadas ${n} ficha(s) ✅`); ov.remove(); revVincular(); return; }
    const refr = e.target.closest('[data-act="rvx-refrescar"]');
    if (refr) { ov.remove(); toast("Actualizando reseñas…"); try { await apiSend("POST", "/api/reviews/refresh", { force: USER.rol === "direccion" }); toast("Listo ✅"); loadReviews(); } catch (er) { toast("Error: " + er.message); } return; }
  });
}
function applyRevFilter() {
  const g = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
  REVF.estado = g("rEstado"); REVF.rating = g("rRating"); REVF.sort = g("rSort") || "recientes";
  REVF.q = g("rQ"); REVF.autor = g("rAutor"); REVF.from = g("rFrom"); REVF.to = g("rTo");
  loadReviews(false);
}
async function refreshReviews() {
  toast("Actualizando reseñas…");
  try {
    const j = await apiSend("POST", "/api/reviews/refresh", { force: USER.rol === "direccion" });
    const total = (j.imported || 0) + (j.updated || 0);
    const fuente = j.source === "places" ? "Places" : j.source === "business_profile" ? "Business Profile" : j.source;
    toast(total > 0 ? `✅ ${total} reseña(s) vía ${fuente}` : `Sin reseñas${j.businessProfileError ? " (Business Profile: " + j.businessProfileError + ")" : j.reason ? " (" + j.reason + ")" : ""}`);
    loadReviews();
  } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
function revToggleSel(id) { id = String(id); if (REV_SEL.has(id)) REV_SEL.delete(id); else REV_SEL.add(id); const v = document.getElementById("view"); if (v) v.innerHTML = renderReviews(); }
function revSelNone() { REV_SEL.clear(); const v = document.getElementById("view"); if (v) v.innerHTML = renderReviews(); }

function openResponder(id) {
  const r = REV_DATA.find((x) => String(x.id) === String(id)); if (!r) return;
  const body = `<div class="mut" style="font-size:12.5px;margin-bottom:6px">${"★".repeat(r.rating)} · ${esc(r.author)} · ${esc(r.local)} · ${esc(r.fecha)}</div>
    <p style="margin:0 0 12px;font-size:13.5px;line-height:1.5">${esc(r.text || "(sin texto)")}</p>
    <textarea id="revReply" rows="5" style="width:100%;resize:vertical" placeholder="Escribe la respuesta, o genérala con IA…">${esc(r.reply || "")}</textarea>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center">
      <button class="btn" id="revIa">✨ Generar borrador IA</button>
      <button class="btn" id="revCopy">Copiar</button>
      <div style="flex:1"></div>
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="revSave">Guardar</button>
    </div>
    <div class="mut" style="font-size:11.5px;margin-top:10px">La publicación directa en Google se activará al aprobarse la cuota. Por ahora guarda aquí y usa "Copiar".</div>`;
  const ov = modal("Responder reseña", body);
  const ta = ov.querySelector("#revReply");
  ov.querySelector("#revIa").addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true; const t = b.textContent; b.textContent = "Generando…";
    try { const j = await apiSend("POST", "/api/reviews/draft", { id: r.id }); if (j.reply) ta.value = j.reply; }
    catch (err) { toast("Error IA: " + err.message); }
    finally { b.disabled = false; b.textContent = t; }
  });
  ov.querySelector("#revCopy").addEventListener("click", () => { navigator.clipboard ? navigator.clipboard.writeText(ta.value).then(() => toast("Respuesta copiada ✅"), () => toast("No se pudo copiar")) : toast("Copia manual"); });
  ov.querySelector("#revSave").addEventListener("click", async () => {
    const reply = ta.value.trim(); if (!reply) { toast("Escribe una respuesta"); return; }
    try { await apiSend("POST", "/api/reviews/" + encodeURIComponent(r.id) + "/reply", { reply }); ov.remove(); toast("Respuesta guardada ✅"); loadReviews(); }
    catch (err) { toast("Error: " + err.message); }
  });
}

async function revBulk() {
  const ids = [...REV_SEL]; if (!ids.length) return;
  if (!(await confirmModal(`¿Generar un borrador de respuesta con IA para ${ids.length} reseña(s)?`, { ok: "Generar" }))) return;
  toast("Generando borradores…");
  try {
    const j = await apiSend("POST", "/api/reviews/draft-bulk", { ids });
    const drafts = (j.data || []).filter((d) => d.ok && d.reply);
    if (!drafts.length) { toast("No se generó ningún borrador"); return; }
    openBulkReview(drafts);
  } catch (e) { toast("Error: " + e.message); }
}

function openBulkReview(drafts) {
  const rows = drafts.map((d) => { const r = REV_DATA.find((x) => String(x.id) === String(d.id)) || {}; return { id: d.id, author: r.author, local: r.local, rating: r.rating || 0, text: r.text || "", reply: d.reply }; });
  const body = `<div class="mut" style="font-size:12.5px;margin-bottom:10px">Revisa y edita cada borrador. Se guardarán todos al pulsar "Guardar todo".</div>
    ${rows.map((r) => `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px"><div class="mut" style="font-size:12px;margin-bottom:6px">${"★".repeat(r.rating)} · ${esc(r.author || "")} · ${esc(r.local || "")}</div><div class="mut" style="font-size:12.5px;margin-bottom:6px">${esc((r.text || "").slice(0, 140))}</div><textarea data-bulk-id="${esc(r.id)}" rows="3" style="width:100%;resize:vertical">${esc(r.reply)}</textarea></div>`).join("")}
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="revBulkSave">Guardar todo (${rows.length})</button></div>`;
  const ov = modal("Borradores de respuesta", body);
  ov.querySelector("#revBulkSave").addEventListener("click", async () => {
    const tas = [...ov.querySelectorAll("[data-bulk-id]")]; let okc = 0;
    for (const ta of tas) { const reply = ta.value.trim(); if (!reply) continue; try { await apiSend("POST", "/api/reviews/" + encodeURIComponent(ta.getAttribute("data-bulk-id")) + "/reply", { reply }); okc++; } catch { /* sigue */ } }
    ov.remove(); toast(`${okc} respuesta(s) guardada(s) ✅`); loadReviews();
  });
}

// ════════════════════════ VISTA: RR. HH. ════════════════════════
let RRTAB = "seguimiento", RRF = { estado: "", q: "" };
// Dentro de «Contratación» conviven candidaturas y vacantes: son la misma tarea vista por
// los dos lados (quién quiere entrar / qué puesto hay abierto), y separarlas obligaba a
// saltar de pestaña para cerrar una vacante justo después de contratar a alguien.
let RRCONTR = "candidaturas";
const CAND_EST = { nuevo: "info", revisando: "imp", contratada: "ok", descartada: "bad" };
const RR_TIPOS = { nota: { ic: "📝", lab: "Nota" }, llamada: { ic: "📞", lab: "Llamada" }, incidencia: { ic: "⚠️", lab: "Incidencia" }, consulta: { ic: "💬", lab: "Consulta" } };
const RR_TIPO_COL = { nota: "var(--border2)", llamada: "var(--brand)", incidencia: "var(--danger)", consulta: "var(--info)" };
const RR_VAC_TIPOS = ["Jornada completa", "Jornada parcial", "Fines de semana", "Temporal"];
function rrMesActual() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function rrAutor() { return (USER && (USER.nombre || USER.username || USER.rol)) || "panel"; }
let RRSEG = { workers: [], llamadas: [], preguntas: [], sel: null, notas: [], ficha: null, resumen: [], mes: rrMesActual() };
let RRPREG = { mes: rrMesActual(), preguntas: [] };
function rrParseResp(v) { if (!v) return []; if (Array.isArray(v)) return v; try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
// Pestañas visibles por rol: el encargado solo ve a su Equipo (contratación y preguntas son
// centrales de RRHH/dirección).
function rrTabsPermitidas() {
  // «Equipo» va primero: es lo que se abre a diario. Contratar es puntual.
  // «Pulso» no está para el encargado: la pregunta 2 va sobre él, y en un local pequeño
  // ver la media de su equipo es leer las respuestas de su gente. El filtro de abajo ya
  // lo deja solo con «Equipo», así que basta con no añadírsela.
  const T = [["seguimiento", "Equipo"], ["contratacion", "Contratación"], ["pulso", "Pulso del equipo"], ["preguntas", "Preguntas del mes"]];
  return USER.rol === "encargado" ? T.filter(([id]) => id === "seguimiento") : T;
}
function rrTabs() {
  const T = rrTabsPermitidas();
  if (T.length <= 1) return "";
  return `<div class="toolbar" style="margin-bottom:12px">${T.map(([id, lab]) => `<button class="btn ${RRTAB === id ? "primary" : ""}" data-act="rr-tab" data-tab="${id}">${lab}</button>`).join("")}</div>`;
}
function rrPh(sub) { return `<div class="ph"><div class="eyebrow">Personas</div><h1>RR. HH.</h1><div class="sub">${esc(sub)}</div></div>`; }

// ── Pulso anónimo del equipo ──
let PULSO = { mes: "", resumen: null, participacion: null, contactos: null };
const pulsoNota = "Sabemos quién ha contestado, nunca qué ha contestado. Los desgloses por local solo aparecen con 4 o más respuestas.";
function pulsoMedia(v) { return v == null ? "—" : String(v).replace(".", ","); }
function renderRRPulso() {
  const R = PULSO.resumen, P = PULSO.participacion;
  const mesTxt = PULSO.mes ? fechaMesLargo(PULSO.mes) : "";
  const cab = rrPh(`Pulso anónimo · ${mesTxt}`) + rrTabs()
    + `<div class="pendingblock" style="margin:-4px 0 14px">${esc(pulsoNota)}</div>`;
  if (!R) return cab + errorCard("No se pudo cargar el pulso.");

  const part = P || { invitados: 0, respondidos: 0, pendientes: [] };
  const serie = (R.serie || []).filter((s) => s.media != null);
  const previo = serie.length > 1 ? serie[serie.length - 2].media : null;
  const actual = serie.length ? serie[serie.length - 1].media : null;
  const delta = (actual != null && previo != null) ? Math.round((actual - previo) * 10) / 10 : null;

  const nPend = (PULSO.contactos && PULSO.contactos.pendientes) || 0;
  const kpis = `<div class="grid g4" style="margin-bottom:16px">
    ${stat("Participación", ic("users", 15), `${num(part.respondidos)}/${num(part.invitados)}`)}
    ${stat("Media general", ic("chart", 15), pulsoMedia(actual), actual != null ? "/ 5" : "")}
    ${stat("Respecto al mes anterior", ic("chart", 15), delta == null ? "—" : (delta >= 0 ? "+" : "−") + pulsoMedia(Math.abs(delta)))}
    ${stat("Quieren hablar contigo", ic("chat", 15), num(nPend), "", nPend ? "pendientes" : "")}
  </div>` + renderPulsoContactos();

  if (!R.suficiente) {
    return cab + kpis + `<div class="card"><div class="ch"><h3>Todavía no hay suficientes respuestas</h3></div><p class="mut" style="margin:0;line-height:1.6">Hacen falta al menos 5 respuestas en el mes para poder enseñar nada sin señalar a nadie. Ahora mismo hay ${num(R.total || 0)}.</p></div>` + renderPulsoParticipacion(part);
  }

  const filas = (R.locales || []).map((l) => `<div class="row"><div class="grow"><div class="t1">${esc(nombreCortoLocal(l.local))}</div><div class="t2">${num(l.n)} respuesta${l.n === 1 ? "" : "s"}</div></div><b class="tnum">${pulsoMedia(l.p1)}</b></div>`).join("");
  const sup = R.suprimidos
    ? `<div class="row"><div class="grow"><div class="t1 mut">Otros ${num(R.suprimidos.nLocales)} locales</div><div class="t2">${num(R.suprimidos.n)} respuestas · juntos, para no señalar a nadie</div></div><b class="tnum mut">${pulsoMedia(R.suprimidos.p1)}</b></div>`
    : "";
  const resultados = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Cómo han estado (pregunta 1)</h3></div><div class="rows">${filas}${sup}</div></div>`;

  const evol = serie.length > 1
    ? `<div class="card"><div class="ch"><h3>Evolución</h3><span class="mut" style="font-size:12px">${num(serie.length)} meses con datos</span></div>${area(serie.map((s) => s.media))}</div>`
    : "";

  const coment = (R.comentarios || []).length
    ? `<details class="card fold" style="margin-top:16px"><summary><h3>Lo que han escrito</h3><span class="foldr"><span>${num(R.comentarios.length)} · sin orden ni local</span><span class="car">${ic("chev", 16)}</span></span></summary><div class="rows">${R.comentarios.map((c) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1" style="font-weight:400;line-height:1.6;white-space:pre-wrap">${esc(c)}</div></div></div>`).join("")}</div></details>`
    : "";

  return cab + kpis + `<div class="grid g2" style="margin-bottom:16px">${resultados}${evol}</div>` + coment + renderPulsoParticipacion(part);
}
// La ÚNICA tarjeta del pulso con nombres, y es legítima: la persona los dio a propósito
// marcando «quiero que hablemos». No lleva ni una de sus respuestas.
function renderPulsoContactos() {
  const filas = (PULSO.contactos && PULSO.contactos.data) || [];
  const pend = filas.filter((c) => !c.atendido);
  if (!filas.length) return "";
  const CON = { direccion: "contigo", rrhh: "con RR. HH.", encargado: "con su encargado" };
  const fila = (c) => `<div class="row"${c.atendido ? ' style="opacity:.55"' : ""}>
    <div class="grow" style="min-width:0">
      <div class="t1">${esc(c.nombre || "—")} <span class="mut" style="font-weight:400">quiere hablar ${esc(CON[c.con_quien] || "contigo")}</span></div>
      <div class="t2">${esc(nombreCortoLocal(c.local || ""))} · ${esc(String(c.creado_en || "").slice(0, 10))}${c.atendido ? ` · atendido por ${esc(c.atendido_por || "")}` : ""}</div>
      ${c.mensaje ? `<div class="t2" style="margin-top:6px;color:var(--ink);line-height:1.55;white-space:pre-wrap">${esc(c.mensaje)}</div>` : ""}
    </div>
    ${c.atendido ? '<span class="pill ok">Atendido</span>' : `<button class="btn sm primary" data-act="pulso-atendido" data-id="${c.id}">Marcar atendido</button>`}
  </div>`;
  return `<div class="card p0" style="margin-bottom:16px;border-left:3px solid var(--brand)">
    <div class="ch" style="padding:18px 18px 0"><h3>Han pedido hablar contigo</h3>${pend.length ? `<span class="pill bad">${num(pend.length)} pendiente${pend.length === 1 ? "" : "s"}</span>` : ""}</div>
    <div class="mut" style="padding:6px 18px 0;font-size:12px">Lo único con nombre de todo el pulso, porque lo dieron ellos. No incluye ninguna de sus respuestas.</div>
    <div class="rows">${filas.map(fila).join("")}</div>
  </div>`;
}
async function pulsoAtendido(id) {
  try { await apiSend("PUT", "/api/rrhh/pulso/contacto/" + encodeURIComponent(id)); toast("Marcado como atendido ✅"); loadRRHH(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
// Tarjeta separada a propósito: esta sabe QUIÉN, la de arriba sabe QUÉ. Es la expresión
// en pantalla del modelo de datos, y lo que hace que el equipo se crea el anonimato.
function renderPulsoParticipacion(part) {
  const pend = part.pendientes || [];
  const lista = pend.length
    ? pend.map((p) => `<div class="row"><div class="grow"><div class="t1">${esc(p.nombre || "—")}</div><div class="t2">${esc(nombreCortoLocal(p.local || ""))}${p.enviado ? "" : " · sin enviar"}</div></div></div>`).join("")
    : `<div class="row"><div class="mut" style="padding:4px">Han contestado todos. 🎉</div></div>`;
  return `<details class="card fold" style="margin-top:16px"><summary><h3>Quién falta por contestar</h3><span class="foldr"><span>${num(pend.length)} de ${num(part.invitados || 0)}</span><span class="car">${ic("chev", 16)}</span></span></summary>
    <div class="rows">${lista}</div>
    <div class="mut" style="padding:12px 18px;font-size:12px;border-top:1px solid var(--border)">Esta tarjeta sabe <b>quién</b>. La de arriba sabe <b>qué</b>. Nunca se cruzan.</div>
    <div class="toolbar" style="padding:12px 18px;margin:0"><button class="btn primary" data-act="pulso-enviar">Enviar el pulso de ${esc(PULSO.mes ? fechaMesLargo(PULSO.mes) : "este mes")}</button><div style="flex:1"></div><button class="btn" data-act="pulso-config">Configurar</button></div>
  </details>`;
}
// Config: solo dirección. Lo importante aquí no es el automático, es el tope diario:
// es lo único que protege el número de la empresa de un baneo.
async function pulsoConfig() {
  let c; try { c = (await apiRaw("/api/rrhh/pulso/config")).data; } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); return; }
  const ov = modal("Configurar el pulso", `<div class="form-grid">
    <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="pcAuto" ${c.pulso_auto === "1" ? "checked" : ""} style="width:auto"> Enviarlo solo cada mes</label>
    <div class="field"><label>Día del mes</label><input id="pcDia" type="number" min="1" max="28" value="${esc(c.pulso_dia || "1")}"></div>
    <div class="field full"><label>Dirección de la web (para el enlace)</label><input id="pcBase" value="${esc(c.pulso_base_url || "")}" placeholder="https://familiadelamor.org"></div>
    <div class="field full"><label>Teléfono para avisos de «quiero que hablemos»</label><input id="pcAviso" value="${esc(c.pulso_aviso_telefono || "")}" placeholder="600112233"></div>
    <div class="field"><label>Tope de WhatsApp al día</label><input id="pcTope" type="number" min="5" max="200" value="${esc(c.wa_max_diario || "40")}"></div>
  </div>
  <div class="pendingblock" style="margin-top:12px">Hoy se han enviado <b>${num(c.enviados_hoy || 0)}</b> mensajes en total (pulso y campañas). El tope los cuenta juntos: es lo que evita que el número acabe baneado.</div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="pcSave">Guardar</button></div>`);
  ov.querySelector("#pcSave").addEventListener("click", async () => {
    try {
      await apiSend("PUT", "/api/rrhh/pulso/config", {
        pulso_auto: ov.querySelector("#pcAuto").checked ? "1" : "0",
        pulso_dia: ov.querySelector("#pcDia").value,
        pulso_base_url: ov.querySelector("#pcBase").value,
        pulso_aviso_telefono: ov.querySelector("#pcAviso").value,
        wa_max_diario: ov.querySelector("#pcTope").value,
      });
      ov.remove(); toast("Configuración guardada ✅");
    } catch (e) { toast("Error: " + e.message); }
  });
}
function fechaMesLargo(mes) {
  const [y, m] = String(mes || "").split("-");
  if (!y || !m) return mes || "";
  try { return cap(new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(+y, +m - 1, 15))); } catch { return mes; }
}
async function pulsoEnviar() {
  if (!(await confirmModal(`¿Enviar el pulso de ${fechaMesLargo(PULSO.mes)} por WhatsApp a todo el equipo?`, { ok: "Enviar" }))) return;
  try {
    const j = await apiSend("POST", "/api/rrhh/pulso/enviar", { mes: PULSO.mes });
    const sin = (j.sinTelefono || []).length;
    toast(`${num(j.generadas)} invitación(es) enviándose${j.yaTenian ? ` · ${num(j.yaTenian)} ya la tenían` : ""}${sin ? ` · ⚠ ${num(sin)} sin teléfono` : ""}`);
    setTimeout(loadRRHH, 1200);
  } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
// ── Candidaturas ──
function renderRRCand(rows) {
  rows = rows || [];
  const estOpts = ['<option value="">Todos los estados</option>'].concat(["nuevo", "revisando", "contratada", "descartada"].map((e) => `<option value="${e}" ${RRF.estado === e ? "selected" : ""}>${cap(e)}</option>`)).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Estado</label><select id="rEstado">${estOpts}</select></div><div class="field"><label>Buscar</label><input id="rQ" value="${esc(RRF.q)}" placeholder="Nombre, puesto…"></div><button class="btn" data-act="rr-filtrar">Buscar</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tw"><table class="tbl"><thead><tr><th>Candidato</th><th>Puesto</th><th>Población</th><th>Estado</th><th>Fecha</th><th>CV</th><th>Mover a</th></tr></thead><tbody>${rows.map((c) => `<tr><td>${esc(c.nombre)}<div class="t2">${esc(c.telefono || "")}</div></td><td>${esc(c.puesto || "")}</td><td>${esc(c.poblacion || "")}</td><td><span class="pill ${CAND_EST[c.estado] || ""}">${esc(cap(c.estado || "nuevo"))}</span></td><td class="mut">${esc((c.creado_en || "").slice(0, 10))}</td><td>${c.cv_url ? `<a class="btn" href="${esc(c.cv_url)}" target="_blank" rel="noopener">Ver ↗</a>` : '<span class="mut">—</span>'}</td><td class="r" style="white-space:nowrap">${["revisando", "contratada", "descartada"].filter((e) => e !== c.estado).map((e) => e === "contratada" ? `<button class="linkbtn" style="color:var(--brand)" data-act="cand-contratar" data-id="${c.id}" data-nombre="${esc(c.nombre)}">Contratar</button>` : `<button class="linkbtn" style="color:var(--brand)" data-act="cand-estado" data-id="${c.id}" data-estado="${e}">${cap(e)}</button>`).join(" · ")}</td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin candidaturas con esos filtros.</div></div>`;
  return toolbar + table;
}
// ── Seguimiento (maestro-detalle) ──
function rrWorkerLlamada(id) { return RRSEG.llamadas.find((l) => String(l.worker_id) === String(id) && l.realizada); }
function renderRRSegSidebar() {
  const byLocal = {};
  RRSEG.workers.forEach((w) => { const k = w.local || "Sin local"; (byLocal[k] = byLocal[k] || []).push(w); });
  const groups = Object.keys(byLocal).sort().map((loc) => {
    const ws = byLocal[loc];
    const hechos = ws.filter((w) => rrWorkerLlamada(w.id)).length;
    const items = ws.map((w) => {
      const done = !!rrWorkerLlamada(w.id);
      const on = RRSEG.sel && String(RRSEG.sel.id) === String(w.id);
      return `<button class="row" data-act="rr-worker" data-id="${w.id}" style="width:100%;text-align:left;background:${on ? "var(--surface2)" : "transparent"}"><span class="sdot" style="background:${done ? "var(--success)" : "var(--border2)"};width:8px;height:8px;border-radius:999px;flex:none"></span><span class="grow" style="min-width:0"><span class="t1">${esc(w.nombre || w.username || "—")}</span><span class="t2">${esc(w.rol || "")}</span></span></button>`;
    }).join("");
    return `<div><div class="ch" style="padding:10px 14px 4px;margin:0"><h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3)">${esc(loc)}</h3><span class="pill ${hechos === ws.length ? "ok" : ""}">${hechos}/${ws.length}</span></div><div class="rows">${items}</div></div>`;
  }).join("");
  const addBtn = '<button class="btn sm" data-act="rr-worker-add">+ Añadir</button>';
  const agoraBtn = '<button class="btn sm" data-act="rr-agora-import" title="Enlazar operadores de Ágora">Ágora</button>';
  return `<div class="card p0"><div class="ch" style="padding:16px 16px 0"><h3>Equipo</h3><span style="display:flex;gap:6px">${agoraBtn}${addBtn}</span></div>${groups || '<div class="mut" style="padding:14px">Sin trabajadores.</div>'}</div>`;
}
function renderRRCheckin() {
  const w = RRSEG.sel; if (!w) return "";
  const ll = RRSEG.llamadas.find((l) => String(l.worker_id) === String(w.id));
  const done = ll && ll.realizada;
  const preguntas = RRSEG.preguntas || [];
  if (done) {
    const resp = rrParseResp(ll.respuestas);
    const filas = preguntas.length ? preguntas.map((p, i) => { const r = resp[i]; const ans = r && (r.respuesta != null ? r.respuesta : r); return `<div class="row"><div class="grow"><div class="t2">${esc(p.pregunta || p)}</div><div class="t1" style="font-weight:500;white-space:pre-wrap">${esc((ans && String(ans).trim()) || "—")}</div></div></div>`; }).join("") : resp.map((r) => `<div class="row"><div class="grow"><div class="t2">${esc((r && r.pregunta) || "")}</div><div class="t1" style="font-weight:500;white-space:pre-wrap">${esc((r && (r.respuesta != null ? r.respuesta : r)) || "—")}</div></div></div>`).join("");
    return `<div class="card p0"><div class="ch" style="padding:16px 16px 0"><h3>📞 Check-in de ${esc(RRSEG.mes)}</h3><span class="pill ok">Realizada${ll.fecha_llamada ? " · " + esc(String(ll.fecha_llamada).slice(0, 10)) : ""}</span></div><div class="rows">${filas || '<div class="mut" style="padding:12px 16px">Sin respuestas registradas.</div>'}</div>${ll.comentario_libre ? `<div style="padding:12px 16px;border-top:1px solid var(--border)"><div class="t2">Comentario libre</div><div style="white-space:pre-wrap">${esc(ll.comentario_libre)}</div></div>` : ""}<div style="padding:12px 16px;border-top:1px solid var(--border)"><button class="btn sm" data-act="rr-checkin-edit">Editar</button></div></div>`;
  }
  const campos = preguntas.length ? preguntas.map((p, i) => `<div class="field" style="width:100%"><label>${esc(p.pregunta || p)}</label><textarea id="rrq_${i}" rows="2"></textarea></div>`).join("") : `<div class="mut" style="padding:0 0 10px">No hay preguntas definidas para ${esc(RRSEG.mes)}. Configúralas en la pestaña «Preguntas del mes» (opcional).</div>`;
  return `<div class="card"><div class="ch"><h3>📞 Registrar check-in de ${esc(RRSEG.mes)}</h3></div>${campos}<div class="field" style="width:100%"><label>Comentario libre (lo que el trabajador quiera expresar)</label><textarea id="rrComentario" rows="2"></textarea></div><button class="btn primary" data-act="rr-checkin-save">Registrar llamada</button></div>`;
}
function renderRRNotas() {
  const w = RRSEG.sel; if (!w) return "";
  const tipoOpts = Object.keys(RR_TIPOS).map((k) => `<option value="${k}">${RR_TIPOS[k].ic} ${RR_TIPOS[k].lab}</option>`).join("");
  const form = `<div class="card"><div class="ch"><h3>Añadir nota</h3></div><div class="toolbar"><div class="field"><label>Tipo</label><select id="rrNotaTipo">${tipoOpts}</select></div><div class="field grow"><label>Contenido</label><input id="rrNotaCont" placeholder="Escribe la nota…"></div><button class="btn primary" data-act="rr-nota-add">Guardar</button></div></div>`;
  const notas = RRSEG.notas || [];
  const list = notas.length ? notas.map((n) => { const t = RR_TIPOS[n.tipo] || RR_TIPOS.nota; return `<div class="card" style="border-left:3px solid ${RR_TIPO_COL[n.tipo] || "var(--border2)"};padding:12px 14px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div style="min-width:0"><div class="t2">${t.ic} ${t.lab}${n.autor ? " · " + esc(n.autor) : ""} · ${esc(String(n.creado_en || "").slice(0, 16).replace("T", " "))}</div><div style="white-space:pre-wrap;margin-top:3px">${esc(n.contenido || "")}</div></div><button class="btn sm danger" data-act="rr-nota-del" data-id="${n.id}">✕</button></div></div>`; }).join("") : `<div class="card"><div class="mut" style="padding:6px">Sin notas todavía.</div></div>`;
  return `${form}<div class="grid" style="gap:10px">${list}</div>`;
}
const RR_DOC_TIPOS = { contrato: "Contrato", dni: "DNI/NIE", manipulador: "Carnet manipulador", nomina: "Nómina", otro: "Otro" };
function renderRRDocs() {
  const f = RRSEG.ficha; if (!f) return "";
  const docs = f.documentos || [];
  const alertaKey = {}; (f.alertasDoc || []).forEach((a) => { alertaKey[a.id] = a; });
  const list = docs.length ? docs.map((d) => {
    const al = alertaKey[d.id];
    const cad = d.fecha_caducidad ? (al ? `<span class="pill ${al.estado === "vencido" ? "bad" : "warn"}">${al.estado === "vencido" ? "Vencido" : "Caduca en " + al.diasRestantes + "d"}</span>` : `<span class="mut">caduca ${esc(d.fecha_caducidad)}</span>`) : "";
    return `<div class="row"><div class="grow"><div class="t1"><a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:var(--brand)">${esc(d.nombre || d.tipo)}</a> ${d.sensible ? '<span class="pill" title="Sensible">🔒</span>' : ""}</div><div class="t2">${esc(RR_DOC_TIPOS[d.tipo] || d.tipo)} ${cad}</div></div><button class="btn sm danger" data-act="rr-doc-del" data-id="${d.id}">✕</button></div>`;
  }).join("") : `<div class="mut" style="padding:8px 14px">Sin documentos.</div>`;
  return `<div class="card p0"><div class="ch" style="padding:16px 16px 0"><h3>Documentos</h3><button class="btn sm" data-act="rr-doc-subir" data-id="${RRSEG.sel.id}">+ Subir</button></div><div class="rows">${list}</div></div>`;
}
function renderRRFicha() {
  const w = RRSEG.sel;
  if (!w) return `<div class="card" style="min-height:200px;display:grid;place-items:center"><div class="mut">Selecciona un trabajador para ver su ficha, datos, documentos y check-in.</div></div>`;
  const f = RRSEG.ficha; const t = (f && f.trabajador) || w;
  const esDir = USER.rol === "direccion" || USER.rol === "rrhh";
  const baja = t.activo === 0 || t.activo === false || t.fecha_baja;
  const estado = baja ? '<span class="pill bad">Baja</span>' : '<span class="pill ok">Activo</span>';
  const antig = f && f.antiguedad ? ` · ${esc(f.antiguedad.texto)} en la empresa` : "";
  const ini = (t.nombre || t.username || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const foto = t.foto_url ? `<img src="${esc(t.foto_url)}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;flex:none">` : `<span class="avatar" style="width:56px;height:56px;font-size:20px;flex:none">${esc(ini)}</span>`;
  const dato = (lab, val) => val ? `<div><div class="t2">${lab}</div><div class="t1">${esc(val)}</div></div>` : "";
  const datos = `<div class="card"><div class="ch"><h3>Datos</h3><button class="btn sm" data-act="rr-editar-datos" data-id="${w.id}">Editar</button></div><div class="grid g3" style="gap:12px">${dato("Teléfono", t.telefono)}${dato("Email", t.email)}${dato("Puesto", t.puesto)}${dato("Alta", (t.fecha_alta || "").slice(0, 10))}${dato("Nacimiento", (t.fecha_nac || "").slice(0, 10))}${esDir ? dato("DNI/NIE", t.dni) : ""}${baja && t.fecha_baja ? dato("Baja", (t.fecha_baja || "").slice(0, 10)) : ""}</div></div>`;
  const hero = `<div class="card hero"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div style="display:flex;gap:14px;align-items:center;min-width:0">${foto}<div style="min-width:0"><div class="eyebrow">Ficha</div><h2 style="margin:0;font-size:19px">${esc(t.nombre || t.username || "—")} ${estado}</h2><div class="t2">${esc(t.rol || "")}${t.local ? " · " + esc(t.local) : ""}${t.username ? " · @" + esc(t.username) : ""}${antig}</div></div></div>${esDir ? `<button class="btn sm danger" data-act="rr-worker-del" data-id="${w.id}" data-nombre="${esc(t.nombre || t.username || "")}">Eliminar</button>` : ""}</div></div>`;
  return `<div class="grid" style="gap:16px">${hero}${datos}${renderRRPin()}${renderRRRendimiento()}${renderRRDocs()}${renderRRCheckin()}${renderRRNotas()}</div>`;
}

// PIN del kiosco. Se asigna desde aquí porque es donde se está cuando alguien entra a
// trabajar; el trabajador lo cambia después desde su perfil.
function renderRRPin() {
  const f = RRSEG.ficha; if (!f || !RRSEG.sel) return "";
  const p = f.pin || {};
  const bloqueado = p.pin_bloqueado_hasta && Date.parse(p.pin_bloqueado_hasta) > Date.now();
  const estado = !p.tiene
    ? `<span class="mut">Todavía no puede fichar: no tiene PIN.</span>`
    : p.pin_temporal
      ? `<span class="pill">PIN provisional</span> <span class="mut">Aún no lo ha cambiado.</span>`
      : `<span class="pill ok">PIN activo</span>${p.pin_actualizado_en ? ` <span class="mut">desde el ${esc(String(p.pin_actualizado_en).slice(0, 10))}</span>` : ""}`;
  const t = (f && f.trabajador) || {};
  return `<div class="card"><div class="ch"><h3>Acceso</h3>
      <div style="display:flex;gap:8px">
        <button class="btn sm" data-act="rr-reset-pass" data-id="${RRSEG.sel.id}" data-nombre="${esc(t.nombre || "")}">Restablecer contraseña</button>
        <button class="btn sm" data-act="rr-pin" data-id="${RRSEG.sel.id}">${p.tiene ? "Cambiar PIN" : "Asignar PIN"}</button>
      </div></div>
    <div class="grid g3" style="gap:12px">
      <div><div class="t2">Contraseña del panel</div><div class="t1">${t.pass_temporal
        ? '<span class="pill warn">sin estrenar</span> <span class="mut">entra con su usuario</span>'
        : t.pass_cambiada_en ? `<span class="pill ok">propia</span> <span class="mut">desde el ${esc(String(t.pass_cambiada_en).slice(0, 10))}</span>`
        : '<span class="pill ok">propia</span>'}</div></div>
      <div><div class="t2">PIN de fichaje</div><div class="t1">${estado}
        ${bloqueado ? '<span class="pill bad">bloqueado</span>' : ""}</div></div>
    </div></div>`;
}

// Restablecer: vuelve a dejar la contraseña igual al usuario y marcada como sin estrenar,
// así que la ventana en que la sabe cualquiera vuelve a durar lo que tarde en entrar.
async function rrResetPassword(id, nombre) {
  if (!await confirmModal(
    `La contraseña de ${nombre || "esta persona"} vuelve a ser su nombre de usuario, y el sistema le pedirá cambiarla al entrar. Hasta que entre, cualquiera que sepa su usuario puede acceder.`,
    { ok: "Restablecer", danger: true })) return;
  try { const r = await apiSend("POST", `/api/rrhh/trabajador/${id}/reset-password`, {}); toast(r.mensaje || "Restablecida ✅"); rrSelWorker(id); }
  catch (e) { toast(e.message); }
}

async function rrAsignarPin(id) {
  const ov = modal("PIN de fichaje", `
    <p style="margin:0 0 14px;line-height:1.55">Entre 4 y 6 números. Díselo en persona y pídele que lo cambie desde su perfil: mientras siga siendo el que le has dado tú, cualquiera que te haya oído puede fichar en su nombre.</p>
    <input class="inp" id="rrPinVal" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="4917" style="width:100%;font-size:20px;letter-spacing:.3em;text-align:center">
    <p id="rrPinMsg" style="margin:10px 0 0;min-height:18px;color:var(--danger);font-weight:550"></p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn" data-close>Cancelar</button><button class="btn primary" id="rrPinOk">Guardar</button></div>`);
  const inp = ov.querySelector("#rrPinVal"), msg = ov.querySelector("#rrPinMsg");
  inp.focus();
  inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(0, 6); msg.textContent = ""; });
  ov.querySelector("#rrPinOk").addEventListener("click", async () => {
    try {
      const r = await apiSend("PUT", "/api/fichajes/pin/" + encodeURIComponent(id), { pin: inp.value });
      ov.remove(); toast(r.mensaje || "PIN asignado ✅"); rrSelWorker(id);
    } catch (e) { msg.textContent = e.message; }
  });
}
function renderRRRendimiento() {
  const f = RRSEG.ficha; if (!f) return "";
  if (!f.enlazadoAgora) return `<div class="card"><div class="ch"><h3>Rendimiento (Ágora)</h3><button class="btn sm" data-act="rr-agora-import">Enlazar con Ágora</button></div><div class="mut" style="padding:2px 2px 4px">No está enlazado a su operador de Ágora. Enlázalo para ver sus ventas.</div></div>`;
  return `<div class="card"><div class="ch"><h3>Rendimiento (Ágora)</h3><button class="btn sm" data-act="rr-rend-cargar" data-id="${RRSEG.sel.id}">Cargar ventas (30 días)</button></div><div id="rrRend"><div class="mut" style="padding:2px">Pulsa «Cargar» para consultar en vivo (requiere el TPV abierto).</div></div></div>`;
}
async function rrCargarRendimiento(id) {
  const box = document.getElementById("rrRend"); if (box) box.innerHTML = '<div class="mut" style="padding:2px">Consultando Ágora…</div>';
  try {
    const j = await apiRaw("/api/rrhh/trabajador/" + encodeURIComponent(id) + "/rendimiento");
    if (!box) return;
    if (j.sinCredenciales) { box.innerHTML = '<div class="mut" style="padding:2px">Ágora no está configurado para este local.</div>'; return; }
    if (!j.fila) { box.innerHTML = '<div class="mut" style="padding:2px">Sin ventas en el periodo (o el TPV está cerrado).</div>'; return; }
    const f = j.fila;
    box.innerHTML = `<div class="grid g3" style="gap:12px"><div><div class="t2">Ventas</div><div class="t1">${eur(f.ventas || 0)}</div></div><div><div class="t2">Cancelado</div><div class="t1">${eur(f.cancelado || 0)}</div></div><div><div class="t2">Periodo</div><div class="t1">${esc(j.from)} → ${esc(j.to)}</div></div></div>`;
  } catch (e) { if (box) box.innerHTML = `<div class="mut" style="padding:2px">Error: ${esc(e.message)}</div>`; }
}
async function rrImportarOperadores() {
  const ov = modal("Enlazar operadores de Ágora", '<div id="rrOpBody" class="mut">Consultando Ágora (últimos 90 días)…</div>');
  const body = ov.querySelector("#rrOpBody");
  try {
    const j = await apiRaw("/api/rrhh/agora/operadores");
    if (j.sinCredenciales) { body.innerHTML = "Ágora no está configurado. Configúralo en «Ágora (TPV)»."; return; }
    const ops = j.operadores || [];
    if (!ops.length) { body.innerHTML = "No se han detectado operadores con ventas en el periodo (o el TPV está cerrado)."; return; }
    const workers = RRSEG.workers || [];
    const wopts = (sel) => workers.map((w) => `<option value="${w.id}" ${String(w.id) === String(sel) ? "selected" : ""}>${esc(w.nombre)} · ${esc(w.local || "")}</option>`).join("");
    body.innerHTML = `<div class="mut" style="margin-bottom:10px;font-size:12.5px">${ops.length} operador(es) detectados. Enlaza cada uno a su ficha.</div>` + ops.map((o, i) => {
      if (o.match === "exacto") return `<div class="row"><div class="grow"><b>${esc(o.userName)}</b> <span class="pill ok">enlazado</span></div></div>`;
      const sel = o.worker_id || (o.candidatos[0] && o.candidatos[0].id) || "";
      const badge = o.match === "probable" ? '<span class="pill warn">probable</span>' : '<span class="pill">sin match</span>';
      return `<div class="row" id="rrop-row-${i}"><div class="grow"><b>${esc(o.userName)}</b> ${badge}</div><select id="rrop-${i}" style="max-width:220px">${wopts(sel)}</select> <button class="btn sm primary" data-rr-enlazar="${i}" data-agora="${esc(o.userName)}">Enlazar</button></div>`;
    }).join("");
  } catch (e) { body.innerHTML = "Error: " + esc(e.message); return; }
  ov.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rr-enlazar]"); if (!b) return;
    const i = b.getAttribute("data-rr-enlazar"); const agora = b.getAttribute("data-agora");
    const sel = document.getElementById("rrop-" + i); const wid = sel ? sel.value : null; if (!wid) return;
    try { await apiSend("POST", "/api/rrhh/agora/enlazar", { agora_username: agora, worker_id: wid }); toast("Enlazado ✅"); const row = document.getElementById("rrop-row-" + i); if (row) row.innerHTML = `<div class="grow"><b>${esc(agora)}</b> <span class="pill ok">enlazado</span></div>`; }
    catch (err) { if (err.message !== "noauth") toast("Error: " + err.message); }
  });
}
function rrEditarDatos(id) {
  const t = (RRSEG.ficha && RRSEG.ficha.trabajador) || RRSEG.sel; if (!t) return;
  const esDir = USER.rol === "direccion" || USER.rol === "rrhh";
  const F = (name, lab, val, type) => `<div class="field"><label>${lab}</label><input name="${name}" ${type ? `type="${type}"` : ""} value="${esc(val || "")}"></div>`;
  const sensibles = esDir ? `${F("dni", "DNI/NIE", t.dni)}${F("fecha_alta", "Fecha de alta", (t.fecha_alta || "").slice(0, 10), "date")}${F("fecha_baja", "Fecha de baja", (t.fecha_baja || "").slice(0, 10), "date")}<label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="activo" ${(t.activo === 0 || t.fecha_baja) ? "" : "checked"} style="width:auto"> Activo</label>` : "";
  const body = `<form id="fRRD"><div class="form-grid">${F("nombre", "Nombre", t.nombre)}${F("puesto", "Puesto", t.puesto)}${F("telefono", "Teléfono", t.telefono)}${F("email", "Email", t.email)}${F("fecha_nac", "Nacimiento", (t.fecha_nac || "").slice(0, 10), "date")}${sensibles}</div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>`;
  const ov = modal("Editar datos", body);
  ov.querySelector("#fRRD").addEventListener("submit", async (e) => {
    e.preventDefault(); const fm = e.target;
    const data = { nombre: fm.nombre.value.trim(), puesto: fm.puesto.value.trim(), telefono: fm.telefono.value.trim(), email: fm.email.value.trim(), fecha_nac: fm.fecha_nac.value };
    if (esDir) { data.dni = fm.dni.value.trim(); data.fecha_alta = fm.fecha_alta.value; data.fecha_baja = fm.fecha_baja.value; data.activo = fm.activo.checked ? 1 : 0; }
    try { await apiSend("PUT", "/api/rrhh/trabajador/" + encodeURIComponent(id), data); ov.remove(); toast("Datos guardados ✅"); rrSelWorker(id); }
    catch (err) { toast("Error: " + err.message); }
  });
}
function rrDocSubir(id) {
  const esDir = USER.rol === "direccion" || USER.rol === "rrhh";
  const tipoOpts = Object.keys(RR_DOC_TIPOS).map((k) => `<option value="${k}">${RR_DOC_TIPOS[k]}</option>`).join("");
  const body = `<form id="fRRDoc"><div class="form-grid"><div class="field"><label>Tipo</label><select name="tipo">${tipoOpts}</select></div><div class="field"><label>Nombre</label><input name="nombre" placeholder="Contrato 2026…"></div><div class="field"><label>Caduca (opcional)</label><input name="fecha_caducidad" type="date"></div>${esDir ? `<label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="sensible" style="width:auto"> Documento sensible (solo dirección/RRHH)</label>` : ""}<div class="field full"><label>Archivo (PDF o imagen)</label><input type="file" id="rrDocFile" accept=".pdf,.jpg,.jpeg,.png" required></div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Subir</button></div></form>`;
  const ov = modal("Subir documento", body);
  ov.querySelector("#fRRDoc").addEventListener("submit", async (e) => {
    e.preventDefault(); const fm = e.target; const btn = fm.querySelector('button[type="submit"]');
    const file = ov.querySelector("#rrDocFile").files[0]; if (!file) { toast("Elige un archivo"); return; }
    const fd = new FormData(); fd.append("archivo", file); fd.append("tipo", fm.tipo.value); fd.append("nombre", fm.nombre.value.trim() || file.name);
    if (fm.fecha_caducidad.value) fd.append("fecha_caducidad", fm.fecha_caducidad.value);
    if (esDir && fm.sensible.checked) fd.append("sensible", "1");
    if (btn) { btn.disabled = true; btn.textContent = "Subiendo…"; }
    try {
      const r = await fetch("/api/rrhh/trabajador/" + encodeURIComponent(id) + "/documento", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
      if (await fueraDeSesion(r)) return;
      const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error");
      ov.remove(); toast("Documento subido ✅"); rrSelWorker(id);
    } catch (err) { if (btn) { btn.disabled = false; btn.textContent = "Subir"; } toast("Error: " + err.message); }
  });
}
async function rrDocDel(id) {
  if (!(await confirmModal("¿Borrar este documento?", { ok: "Borrar", danger: true }))) return;
  try { await apiSend("DELETE", "/api/rrhh/documento/" + encodeURIComponent(id)); toast("Documento borrado ✅"); if (RRSEG.sel) rrSelWorker(RRSEG.sel.id); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
function renderRRResumen() {
  const r = RRSEG.resumen || [];
  if (!r.length) return "";
  const cards = r.map((e) => {
    const alert = e.docsAlerta ? `<span class="pill warn">${e.docsAlerta} doc. por caducar</span>` : "";
    const cumple = (e.cumples && e.cumples.length) ? `<span class="pill">🎂 ${e.cumples.length}</span>` : "";
    const antig = e.antiguedadMediaDias != null ? (Math.round(e.antiguedadMediaDias / 365 * 10) / 10) + " años" : "—";
    return `<div class="card" style="padding:12px 14px"><div class="t1" style="font-weight:600">${esc(e.local)}</div><div class="t2" style="margin:4px 0 8px">${e.activos} activo(s)${e.bajas ? ` · ${e.bajas} baja(s)` : ""} · antig. media ${antig}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill ${e.checkinsHechos >= e.total ? "ok" : ""}">Check-ins ${e.checkinsHechos}/${e.total}</span>${alert}${cumple}</div></div>`;
  }).join("");
  return `${renderRRSinTelefono()}<div class="grid g3" style="gap:12px;margin-bottom:14px">${cards}</div>`;
}
// Sin teléfono no se les puede escribir. Lo rellenan ellos desde su perfil, pero
// aquí se ve de un vistazo a quién le falta, para poder recordárselo.
function renderRRSinTelefono() {
  const c = RRSEG.contacto;
  if (!c || !c.sinTelefono) return "";
  const nombres = (c.quienes || []).map((w) => esc(w.nombre || "—")).join(", ");
  return `<details class="card fold" style="margin-bottom:12px">
    <summary><h3>${num(c.sinTelefono)} de ${num(c.activos)} sin teléfono</h3><span class="foldr"><span>no podemos escribirles</span><span class="car">${ic("chev", 16)}</span></span></summary>
    <div style="padding:14px 18px">
      <p class="mut" style="margin:0 0 8px;line-height:1.6">Cada uno lo rellena desde <b>su espacio</b> (entra con su usuario → «Mis datos»). Mientras falte, no recibirá el pulso mensual ni los avisos, y Sara le contestaría como si fuera un cliente.</p>
      <div class="t2">${nombres}</div>
    </div>
  </details>`;
}
function renderRRSeg() {
  return rrPh("El equipo, uno a uno · seguimiento de " + RRSEG.mes) + rrTabs() + renderRRResumen() + `<div class="rrgrid">${renderRRSegSidebar()}<div id="rrFicha">${renderRRFicha()}</div></div>`;
}
// ── Vacantes ──
function renderRRVac(rows) {
  rows = rows || [];
  const locOpts = LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const tipoOpts = RR_VAC_TIPOS.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  const form = `<div class="card"><div class="ch"><h3>Nueva vacante</h3></div><div class="toolbar"><div class="field"><label>Título</label><input id="vacTitulo" placeholder="Camarero/a…"></div><div class="field"><label>Local</label><select id="vacLocal">${locOpts}</select></div><div class="field"><label>Tipo</label><select id="vacTipo">${tipoOpts}</select></div></div><div class="field" style="width:100%"><label>Descripción</label><textarea id="vacDesc" rows="2" placeholder="Requisitos, horario…"></textarea></div><button class="btn primary" data-act="rr-vac-add">Publicar vacante</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tw"><table class="tbl"><thead><tr><th>Título</th><th>Local</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map((v) => `<tr><td>${esc(v.titulo || "")}</td><td>${esc(v.local || "")}</td><td class="mut">${esc(v.tipo || "")}</td><td><span class="pill ${v.activo ? "ok" : "bad"}">${v.activo ? "Abierta" : "Cerrada"}</span></td><td class="r"><button class="linkbtn" style="color:var(--brand)" data-act="rr-vac-toggle" data-id="${v.id}" data-activo="${v.activo ? 1 : 0}">${v.activo ? "Cerrar" : "Reabrir"}</button></td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin vacantes creadas.</div></div>`;
  return form + table;
}
// Las dos caras de contratar, en la misma pantalla.
function renderRRContratacion(cands, vacs) {
  const abiertas = (vacs || []).filter((v) => v.activo).length;
  const nuevas = (cands || []).filter((c) => (c.estado || "nuevo") === "nuevo").length;
  const sub = [["candidaturas", `Candidaturas${nuevas ? ` · ${nuevas} sin revisar` : ""}`],
               ["vacantes", `Vacantes${abiertas ? ` · ${abiertas} abierta${abiertas === 1 ? "" : "s"}` : ""}`]];
  const barra = `<div class="toolbar" style="margin-bottom:12px">${sub.map(([id, lab]) =>
    `<button class="btn ${RRCONTR === id ? "primary" : ""}" data-act="rr-contr-tab" data-tab="${id}">${lab}</button>`).join("")}</div>`;
  const cuerpo = RRCONTR === "vacantes" ? renderRRVac(vacs) : renderRRCand(cands);
  return rrPh(RRCONTR === "vacantes" ? "Puestos abiertos del grupo" : "Quién quiere entrar en el equipo")
    + rrTabs() + barra + cuerpo;
}
// ── Preguntas del mes ──
function renderRRPreg() {
  const list = RRPREG.preguntas.length ? RRPREG.preguntas.map((p, i) => `<div class="row"><span class="mut" style="width:24px;flex:none">${i + 1}</span><input class="grow" data-rrpreg="${i}" value="${esc(p)}" placeholder="Escribe la pregunta…"><button class="btn sm" data-act="rr-preg-move" data-idx="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""}>↑</button><button class="btn sm" data-act="rr-preg-move" data-idx="${i}" data-dir="1" ${i === RRPREG.preguntas.length - 1 ? "disabled" : ""}>↓</button><button class="btn sm danger" data-act="rr-preg-del" data-idx="${i}">✕</button></div>`).join("") : `<div class="mut" style="padding:12px 16px">Sin preguntas para este mes. Añade las que Sara/RR.HH. preguntará en cada check-in.</div>`;
  const toolbar = `<div class="toolbar"><div class="field"><label>Mes</label><input type="month" id="rrPregMes" value="${esc(RRPREG.mes)}"></div><button class="btn" data-act="rr-preg-mesload">Cargar</button><span class="grow"></span><button class="btn" data-act="rr-preg-add">+ Pregunta</button><button class="btn primary" data-act="rr-preg-save">Guardar</button></div>`;
  return rrPh("Preguntas del check-in mensual") + rrTabs() + toolbar + `<div class="card p0"><div class="rows">${list}</div></div>`;
}
// ── Carga / router de pestañas ──
async function loadRRHH() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  const permitidas = rrTabsPermitidas().map((t) => t[0]);
  if (!permitidas.includes(RRTAB)) RRTAB = permitidas[0];
  try {
    if (RRTAB === "contratacion") {
      const qs = new URLSearchParams(); if (RRF.estado) qs.set("estado", RRF.estado); if (RRF.q) qs.set("q", RRF.q);
      // Las dos a la vez aunque solo se vea una: es lo que permite poner el contador en la
      // otra sub-pestaña, y son dos peticiones en un solo viaje de red.
      const [cands, vacs] = await Promise.all([
        api("/api/hr/applications" + (qs.toString() ? "?" + qs : "")),
        apiOptional("/api/hr/jobs/admin"),
      ]);
      view.innerHTML = renderRRContratacion(cands || [], vacs || []);
    } else if (RRTAB === "seguimiento") {
      RRSEG.mes = rrMesActual();
      // El resumen se pide en crudo: además de `data` trae `contacto` (quién no tiene teléfono).
      const [workers, llamadas, preguntas, resumen] = await Promise.all([api("/api/rrhh/trabajadores"), apiOptional("/api/rrhh/llamadas/" + RRSEG.mes), apiOptional("/api/rrhh/preguntas/" + RRSEG.mes), apiRaw("/api/rrhh/resumen?mes=" + RRSEG.mes).catch(() => null)]);
      RRSEG.workers = workers || []; RRSEG.llamadas = llamadas || []; RRSEG.preguntas = preguntas || [];
      RRSEG.resumen = (resumen && resumen.data) || []; RRSEG.contacto = (resumen && resumen.contacto) || null;
      if (RRSEG.sel) { const still = RRSEG.workers.find((w) => String(w.id) === String(RRSEG.sel.id)); RRSEG.sel = still || null; }
      view.innerHTML = renderRRSeg();
    } else if (RRTAB === "pulso") {
      // Dos peticiones separadas a propósito: una sabe QUIÉN contestó, la otra QUÉ se
      // contestó. Nunca se cruzan, ni siquiera aquí.
      const [resumen, participacion, contactos] = await Promise.all([
        apiRaw("/api/rrhh/pulso/resumen" + (PULSO.mes ? "?mes=" + PULSO.mes : "")).catch(() => null),
        apiRaw("/api/rrhh/pulso/participacion" + (PULSO.mes ? "?mes=" + PULSO.mes : "")).catch(() => null),
        apiRaw("/api/rrhh/pulso/contactos").catch(() => null),
      ]);
      PULSO.resumen = resumen; PULSO.participacion = participacion; PULSO.contactos = contactos;
      if (resumen && resumen.mes) PULSO.mes = resumen.mes;
      view.innerHTML = renderRRPulso();
    } else if (RRTAB === "preguntas") {
      RRPREG.preguntas = ((await apiOptional("/api/rrhh/preguntas/" + RRPREG.mes)) || []).map((p) => p.pregunta || p);
      view.innerHTML = renderRRPreg();
    }
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function rrTab(tab) { RRTAB = tab; loadRRHH(); }
function applyRRFilter() { const es = document.getElementById("rEstado"), q = document.getElementById("rQ"); if (es) RRF.estado = es.value; if (q) RRF.q = q.value.trim(); loadRRHH(); }
async function candEstado(id, estado) { try { await apiSend("PUT", "/api/hr/applications/" + encodeURIComponent(id), { estado }); toast("Candidatura actualizada ✅"); loadRRHH(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
// Seguimiento: selección de trabajador (carga notas y repinta solo la ficha)
async function rrSelWorker(id) {
  const w = RRSEG.workers.find((x) => String(x.id) === String(id)); if (!w) return;
  RRSEG.sel = w; RRSEG.ficha = null;
  try { RRSEG.notas = (await apiOptional("/api/rrhh/trabajador/" + id + "/notas")) || []; } catch { RRSEG.notas = []; }
  try { RRSEG.ficha = await apiRaw("/api/rrhh/trabajador/" + id + "/ficha"); } catch { RRSEG.ficha = null; }
  const v = document.getElementById("view"); if (v && CURRENT === "rrhh" && RRTAB === "seguimiento") v.innerHTML = renderRRSeg();
}
function rrRepaintFicha() { const f = document.getElementById("rrFicha"); if (f) f.innerHTML = renderRRFicha(); else if (CURRENT === "rrhh") loadRRHH(); }
async function rrCheckinSave() {
  const w = RRSEG.sel; if (!w) return;
  const respuestas = (RRSEG.preguntas || []).map((p, i) => { const el = document.getElementById("rrq_" + i); return { pregunta: p.pregunta || p, respuesta: el ? el.value.trim() : "" }; });
  const cEl = document.getElementById("rrComentario"); const comentario_libre = cEl ? cEl.value.trim() : "";
  try {
    await apiSend("POST", "/api/rrhh/llamada", { worker_id: w.id, mes: RRSEG.mes, respuestas, comentario_libre, autor: rrAutor() });
    RRSEG.llamadas = (await apiOptional("/api/rrhh/llamadas/" + RRSEG.mes)) || RRSEG.llamadas;
    toast("Check-in registrado ✅"); if (document.getElementById("view")) document.getElementById("view").innerHTML = renderRRSeg();
  } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
function rrCheckinEdit() { const w = RRSEG.sel; if (!w) return; RRSEG.llamadas = RRSEG.llamadas.map((l) => (String(l.worker_id) === String(w.id) ? { ...l, realizada: 0 } : l)); rrRepaintFicha(); }
async function rrNotaAdd() {
  const w = RRSEG.sel; if (!w) return;
  const tEl = document.getElementById("rrNotaTipo"), cEl = document.getElementById("rrNotaCont");
  const tipo = tEl ? tEl.value : "nota"; const contenido = cEl ? cEl.value.trim() : "";
  if (!contenido) { toast("Escribe el contenido de la nota"); return; }
  try {
    await apiSend("POST", "/api/rrhh/trabajador/" + w.id + "/nota", { tipo, contenido, autor: rrAutor() });
    RRSEG.notas = (await apiOptional("/api/rrhh/trabajador/" + w.id + "/notas")) || RRSEG.notas;
    toast("Nota guardada ✅"); rrRepaintFicha();
  } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function rrNotaDel(id) {
  const w = RRSEG.sel;
  try { await apiSend("DELETE", "/api/rrhh/nota/" + id); if (w) RRSEG.notas = (await apiOptional("/api/rrhh/trabajador/" + w.id + "/notas")) || RRSEG.notas; toast("Nota eliminada ✅"); rrRepaintFicha(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
function rrWorkerAdd() {
  // Alta vía endpoint propio de RRHH: el encargado puede crear en SU local (rol fijo trabajador).
  const enc = USER.rol === "encargado";
  const localField = enc
    ? `<input type="hidden" name="local" value="${esc(USER.local || "")}"><div class="field"><label>Local</label><input value="${esc(USER.local || "")}" disabled></div>`
    : `<div class="field"><label>Local</label><select name="local">${LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}</select></div>`;
  const rolField = enc ? `<input type="hidden" name="rol" value="trabajador">` : `<div class="field"><label>Rol</label><select name="rol"><option value="trabajador">Trabajador</option><option value="encargado">Encargado</option></select></div>`;
  // Ya no se pide contraseña: la inicial es el propio usuario y el sistema obliga a
  // cambiarla al entrar. Antes venía «tapeta2024» rellenada y nadie la cambiaba nunca,
  // porque además el trabajador no podía.
  const ov = modal("Añadir trabajador", `<form id="fWorker" class="grid" style="gap:12px">
    <div class="field"><label>Nombre</label><input name="nombre" required></div>
    <div class="field"><label>Usuario</label><input name="username" required placeholder="nombre.local"></div>
    ${localField}${rolField}
    <p class="mut" style="margin:0;line-height:1.55">Entrará con <b>su usuario como contraseña</b> y lo primero que
      le pedirá el sistema es cambiarla. Hasta que lo haga no puede ver nada del panel.</p>
    <button class="btn primary" type="submit">Crear</button></form>`);
  ov.querySelector("#fWorker").addEventListener("submit", async (e) => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const r = await apiSend("POST", "/api/rrhh/trabajador", data);
      ov.remove();
      modal("Trabajador creado", `
        <p style="margin:0 0 14px;line-height:1.6">${esc(r.mensaje || "Creado.")}</p>
        <p class="mut" style="margin:0 0 16px;line-height:1.55">Díselo en persona. Si se le olvida, desde su ficha
          puedes volver a dejarlo como al principio.</p>
        <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-close>Entendido</button></div>`);
      loadRRHH();
    } catch (err) { toast("Error: " + err.message); }
  });
}
function rrContratar(id, nombre) {
  const localOpts = LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const base = String(nombre || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  const body = `<form id="fContratar"><div class="mut" style="margin-bottom:10px">Se creará la ficha de <b>${esc(nombre)}</b> (con su CV como primer documento) y la candidatura pasará a «contratada».</div><div class="form-grid"><div class="field"><label>Usuario</label><input name="username" required value="${esc(base)}"></div><div class="field"><label>Contraseña</label><input name="password" type="text" required value="tapeta2024"></div><div class="field"><label>Local</label><select name="local">${localOpts}</select></div><div class="field"><label>Rol</label><select name="rol"><option value="trabajador">trabajador</option><option value="encargado">encargado</option></select></div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Contratar</button></div></form>`;
  const ov = modal("Contratar candidato", body);
  ov.querySelector("#fContratar").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    try { await apiSend("POST", "/api/hr/applications/" + encodeURIComponent(id) + "/contratar", { username: f.username.value.trim(), password: f.password.value, local: f.local.value, rol: f.rol.value }); ov.remove(); toast("Contratado ✅ Ficha creada"); loadRRHH(); }
    catch (err) { toast("Error: " + err.message); }
  });
}
async function rrWorkerDel(id, nombre) {
  const ok = await confirmModal(`¿Eliminar a ${nombre || "este trabajador"}? Se borrará su acceso.`, { ok: "Eliminar", danger: true }); if (!ok) return;
  try { await apiSend("DELETE", "/api/users/" + id); RRSEG.sel = null; toast("Trabajador eliminado ✅"); loadRRHH(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function rrVacAdd() {
  const titulo = (document.getElementById("vacTitulo") || {}).value || "";
  const local = (document.getElementById("vacLocal") || {}).value || "";
  const tipo = (document.getElementById("vacTipo") || {}).value || "";
  const descripcion = (document.getElementById("vacDesc") || {}).value || "";
  if (!titulo.trim()) { toast("Pon un título a la vacante"); return; }
  try { await apiSend("POST", "/api/hr/jobs", { titulo: titulo.trim(), local, tipo, descripcion: descripcion.trim(), activo: 1 }); toast("Vacante publicada ✅"); loadRRHH(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function rrVacToggle(id, activo) {
  try { await apiSend("PUT", "/api/hr/jobs/" + id, { activo: activo ? 0 : 1 }); toast("Vacante actualizada ✅"); loadRRHH(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
function rrPregSync() { document.querySelectorAll("[data-rrpreg]").forEach((el) => { const i = +el.getAttribute("data-rrpreg"); if (!isNaN(i)) RRPREG.preguntas[i] = el.value; }); }
function rrPregAdd() { rrPregSync(); RRPREG.preguntas.push(""); const v = document.getElementById("view"); if (v) v.innerHTML = renderRRPreg(); }
function rrPregDel(i) { rrPregSync(); RRPREG.preguntas.splice(i, 1); const v = document.getElementById("view"); if (v) v.innerHTML = renderRRPreg(); }
function rrPregMove(i, dir) { rrPregSync(); const j = i + dir; if (j < 0 || j >= RRPREG.preguntas.length) return; const [m] = RRPREG.preguntas.splice(i, 1); RRPREG.preguntas.splice(j, 0, m); const v = document.getElementById("view"); if (v) v.innerHTML = renderRRPreg(); }
function rrPregMesLoad() { const el = document.getElementById("rrPregMes"); if (el && el.value) RRPREG.mes = el.value; loadRRHH(); }
async function rrPregSave() {
  rrPregSync(); const preguntas = RRPREG.preguntas.map((p) => String(p || "").trim()).filter(Boolean);
  try { await apiSend("PUT", "/api/rrhh/preguntas/" + RRPREG.mes, { preguntas }); toast("Preguntas guardadas ✅"); RRPREG.preguntas = preguntas; const v = document.getElementById("view"); if (v) v.innerHTML = renderRRPreg(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// ════════════════════════ VISTA: USUARIOS ════════════════════════
let USERS = [];
const ROLES_USUARIO = ["direccion", "encargado", "trabajador", "rrhh", "marketing", "contabilidad"];

// Chips con los módulos efectivos de un usuario (los que realmente puede abrir).
function chipsModulos(u) {
  const mods = Array.isArray(u.modulos) ? u.modulos : [];
  if (u.rol === "direccion") return `<span class="pill ok">acceso total</span>`;
  if (!mods.length) return `<span class="mut">sin módulos</span>`;
  const chips = mods.map((id) => `<span class="pill" style="margin:1px 2px">${esc(TITLES[id] || id)}</span>`).join("");
  return chips + (u.restringido ? ` <span class="pill warn" title="Se le han restringido módulos de su rol">restringido</span>` : "");
}
function renderUsuarios(list) {
  const rows = list || [];
  const toolbar = `<div class="toolbar"><div class="mut" style="flex:1;font-size:13px">Los usuarios con <b>local</b> asignado (y rol distinto de Dirección) solo ven los datos de su local en los módulos marcados «por local».</div><button class="btn primary" data-act="user-nuevo">+ Nuevo usuario</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tw"><table class="tbl"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Local</th><th>Módulos con acceso</th><th></th></tr></thead><tbody>${rows.map((u) => {
    const localCell = u.local ? `${esc(u.local)}${u.rol !== "direccion" ? ` <span class="mut" title="Solo ve datos de este local">🔒</span>` : ""}` : `<span class="mut">— todos —</span>`;
    return `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.nombre || "")}</td><td>${esc(u.rol)}</td><td>${localCell}</td><td style="max-width:340px;line-height:1.9">${chipsModulos(u)}</td><td class="r" style="white-space:nowrap"><button class="linkbtn" style="color:var(--brand)" data-act="user-edit" data-id="${u.id}">Editar</button> · <button class="linkbtn" style="color:var(--brand)" data-act="user-pass" data-id="${u.id}" data-nombre="${esc(u.username)}">Contraseña</button> · <button class="linkbtn" data-act="user-del" data-id="${u.id}" data-nombre="${esc(u.username)}">Eliminar</button></td></tr>`;
  }).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">No hay usuarios todavía. Crea el primero con «+ Nuevo usuario».</div></div>`;
  return `<div class="ph"><div class="eyebrow">Sistema</div><h1>Usuarios</h1><div class="sub">${rows.length} cuenta${rows.length === 1 ? "" : "s"}</div></div>${toolbar}${table}`;
}
async function loadUsuarios() { const view = document.getElementById("view"); view.innerHTML = skeleton(); try { USERS = await api("/api/users"); view.innerHTML = renderUsuarios(USERS); } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); } }

// Checkboxes de módulos para un rol. `sel` = Set de ids marcados. Dirección → todos, fijos.
function modsCheckboxesHtml(rol, sel) {
  const ids = modulosDeRolFE(rol);
  if (!ids.length) return `<div class="mut">Este rol no tiene módulos asignados.</div>`;
  const dir = rol === "direccion";
  const items = ids.map((id) => {
    const checked = (dir || sel.has(id)) ? "checked" : "";
    const loc = MODULOS_POR_LOCAL.has(id) ? ` <span class="mut" style="font-size:11px">· por local</span>` : "";
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 2px"><input type="checkbox" name="mod" value="${id}" ${checked} ${dir ? "disabled" : ""} style="width:auto;margin:0"><span>${esc(TITLES[id] || id)}${loc}</span></label>`;
  }).join("");
  // Esta lista es la del ROL, no el catálogo entero. Desmarcar QUITA; no hay forma de dar
  // aquí un módulo que el rol no tenga. Se dice, porque si no se busca «Facturas» en la lista
  // de un encargado, no aparece, y parece que los permisos no funcionan.
  const fuera = Object.keys(VIEW_ROLES).filter((id) => !ids.includes(id));
  const nota = dir
    ? "Dirección tiene acceso total; no se puede restringir."
    : `Desmarca los módulos a los que NO quieres que entre. Aquí solo salen los del rol
       <b>${esc(rol)}</b>: desde aquí se quita acceso, nunca se da. Para que llegue a
       ${fuera.length ? `<b>${esc(fuera.slice(0, 3).map((id) => TITLES[id] || id).join(", "))}</b>${fuera.length > 3 ? " u otros" : ""}` : "otros módulos"},
       hay que cambiarle el rol.`;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px">${items}</div><div class="mut" style="margin-top:8px;line-height:1.5">${nota}</div>`;
}
// Locales EXTRA. El encargado de la Cooperativa lleva también La Tapeta de Blanes porque
// están pegadas: con uno solo había que darle dos cuentas. Aquí se marcan los de más; el
// principal es el de arriba y no sale, porque ya lo tiene.
function localesExtraHtml(principal, sel) {
  const otros = LOCALES.filter((l) => l !== principal);
  const items = otros.map((l) => `<label style="display:flex;align-items:center;gap:8px;padding:5px 2px">
      <input type="checkbox" name="locextra" value="${esc(l)}" ${sel.has(l) ? "checked" : ""} style="width:auto;margin:0">
      <span>${esc(l)}</span></label>`).join("");
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px">${items}</div>
    <div class="mut" style="margin-top:8px;line-height:1.5">Podrá cambiar de establecimiento desde la barra de arriba y ver
      cada uno por separado. <b>No se suman en la misma pantalla</b>: cada vista sigue enseñando un local.</div>`;
}
function localesExtraSeleccionados(ov) {
  return Array.from(ov.querySelectorAll('input[name=locextra]:checked')).map((c) => c.value);
}

function localOptionsHtml(sel) {
  return ['<option value="">— sin local (todos) —</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${l === sel ? "selected" : ""}>${esc(l)}</option>`)).join("");
}
// Cablea el rerender de módulos al cambiar el rol dentro de un modal de usuario.
function wireUserModal(ov) {
  const rolSel = ov.querySelector("select[name=rol]");
  const box = ov.querySelector("#modsBox");
  if (rolSel && box) rolSel.addEventListener("change", () => { box.innerHTML = modsCheckboxesHtml(rolSel.value, new Set(modulosDeRolFE(rolSel.value))); });
  // El local principal no puede salir también como extra: al cambiarlo se repinta la lista
  // conservando lo que ya estaba marcado.
  const locSel = ov.querySelector("select[name=local]"), locBox = ov.querySelector("#locExtraBox");
  if (locSel && locBox) locSel.addEventListener("change", () => {
    const marcados = new Set(localesExtraSeleccionados(ov));
    locBox.innerHTML = localesExtraHtml(locSel.value, marcados);
  });
}
function modsSeleccionados(ov) { return Array.from(ov.querySelectorAll("input[name=mod]:checked")).map((c) => c.value); }

function openNuevoUsuario() {
  const rol0 = "encargado";
  const body = `<form id="fUser"><div class="form-grid"><div class="field"><label>Usuario</label><input name="username" required></div><div class="field"><label>Nombre</label><input name="nombre"></div><div class="field"><label>Contraseña</label><input name="password" type="text" required></div><div class="field"><label>Rol</label><select name="rol">${ROLES_USUARIO.map((r) => `<option value="${r}" ${r === rol0 ? "selected" : ""}>${r}</option>`).join("")}</select></div><div class="field full"><label>Local</label><select name="local">${localOptionsHtml("")}</select></div></div><div class="field full" style="margin-top:6px"><label>Otros establecimientos <span class="mut">(opcional)</span></label><div id="locExtraBox">${localesExtraHtml("", new Set())}</div></div><div class="field full" style="margin-top:6px"><label>Módulos con acceso</label><div id="modsBox">${modsCheckboxesHtml(rol0, new Set(modulosDeRolFE(rol0)))}</div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Crear usuario</button></div></form>`;
  const ov = modal("Nuevo usuario", body);
  wireUserModal(ov);
  ov.querySelector("#fUser").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const data = { username: f.username.value.trim(), nombre: f.nombre.value.trim(), password: f.password.value, rol: f.rol.value, local: f.local.value, modulos: modsSeleccionados(ov), locales_extra: localesExtraSeleccionados(ov) };
    try { await apiSend("POST", "/api/users", data); ov.remove(); toast("Usuario creado ✅"); loadUsuarios(); } catch (err) { toast("Error: " + err.message); }
  });
}
function openEditarUsuario(id) {
  const u = USERS.find((x) => String(x.id) === String(id)); if (!u) return;
  const sel = new Set(Array.isArray(u.modulos) ? u.modulos : []);
  const body = `<form id="fUserE"><div class="form-grid"><div class="field"><label>Usuario</label><input value="${esc(u.username)}" disabled></div><div class="field"><label>Nombre</label><input name="nombre" value="${esc(u.nombre || "")}"></div><div class="field"><label>Rol</label><select name="rol">${ROLES_USUARIO.map((r) => `<option value="${r}" ${r === u.rol ? "selected" : ""}>${r}</option>`).join("")}</select></div><div class="field"><label>Local</label><select name="local">${localOptionsHtml(u.local || "")}</select></div></div><div class="field full" style="margin-top:6px"><label>Otros establecimientos <span class="mut">(opcional)</span></label><div id="locExtraBox">${localesExtraHtml(u.local || "", new Set(Array.isArray(u.locales_extra) ? u.locales_extra : (() => { try { return JSON.parse(u.locales_extra || "[]"); } catch { return []; } })()))}</div></div><div class="field full" style="margin-top:6px"><label>Módulos con acceso</label><div id="modsBox">${modsCheckboxesHtml(u.rol, sel)}</div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Guardar cambios</button></div></form>`;
  const ov = modal(`Editar ${u.username}`, body);
  wireUserModal(ov);
  ov.querySelector("#fUserE").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const data = { nombre: f.nombre.value.trim(), rol: f.rol.value, local: f.local.value, modulos: modsSeleccionados(ov), locales_extra: localesExtraSeleccionados(ov) };
    try { await apiSend("PUT", "/api/users/" + encodeURIComponent(id), data); ov.remove(); toast("Usuario actualizado ✅"); loadUsuarios(); } catch (err) { toast("Error: " + err.message); }
  });
}
// Ver la contraseña actual (si hay copia recuperable) y/o cambiarla, en un solo modal.
async function userPass(id, nombre) {
  const ov = modal(`Contraseña de ${nombre}`, `<div id="pwCur" class="mut" style="margin-bottom:16px">Cargando…</div><div class="field"><label>Nueva contraseña</label><input id="pwNew" type="text" placeholder="Escribe para cambiarla" autocomplete="off"></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button class="btn" data-close>Cerrar</button><button class="btn primary" data-ok>Actualizar</button></div>`);
  const cur = ov.querySelector("#pwCur");
  try {
    const r = await apiSend("GET", "/api/users/" + encodeURIComponent(id) + "/password");
    if (r && r.disponible) cur.innerHTML = `Contraseña actual: <b style="font-family:ui-monospace,monospace;user-select:all;background:var(--bg2,#0000000d);padding:2px 8px;border-radius:6px">${esc(r.password)}</b>`;
    else cur.textContent = "La contraseña actual no se puede mostrar (cuenta anterior a esta función). Escribe una nueva y a partir de ahí podrás verla.";
  } catch (e) { if (e.message !== "noauth") cur.textContent = "No se pudo leer la contraseña."; }
  ov.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-ok]")) return;
    const p = (ov.querySelector("#pwNew").value || "").trim();
    if (!p) { toast("Escribe una contraseña nueva"); return; }
    try { await apiSend("PUT", "/api/users/" + encodeURIComponent(id) + "/password", { password: p }); ov.remove(); toast("Contraseña actualizada ✅"); loadUsuarios(); } catch (er) { if (er.message !== "noauth") toast("Error: " + er.message); }
  });
}
async function userDel(id, nombre) { if (!(await confirmModal(`¿Eliminar la cuenta ${nombre}? No se puede deshacer.`, { ok: "Eliminar", danger: true }))) return; try { await apiSend("DELETE", "/api/users/" + encodeURIComponent(id)); toast("Usuario eliminado ✅"); loadUsuarios(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }

// ════════════════════════ VISTA: HORARIOS ════════════════════════
// Cuadrante semanal. La rejilla es tramo × área × 7 días, igual que el papel: así el PDF
// y la pantalla no pueden decir cosas distintas.
//
// El estado vive aquí y se repinta entero, como el resto del panel. La agrupación NO se
// hace en el navegador a ojo: se replica la misma lógica que el módulo puro del servidor
// (src/modules/horarios/cuadrante.js), porque el panel no puede importar ESM.
let HOR = { local: "", lunes: "", dias: [], areas: [], tramos: [], equipo: [], asignaciones: [], semana: null, vista: "areas", drag: null, conflictos: null };
function horScope() { HOR.local = localActualFE(); return HOR.local; }
const horEditable = () => HOR.semana && HOR.semana.estado === "borrador";

async function loadHorarios() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  horLimpiaDrag();                     // el HTML se repinta al soltar: dragend puede no llegar
  horScope();
  if (sinPublico(HOR.local)) { view.innerHTML = avisoSinPublico("Horarios", "Personas", "turnos"); return; }
  if (!HOR.local) { view.innerHTML = horPh() + `<div class="card"><div class="ch"><h3>Elige un establecimiento</h3></div><p class="mut" style="margin:0">El cuadrante es de un local concreto. Selecciónalo arriba, en la barra.</p></div>`; return; }
  try {
    if (!HOR.lunes) HOR.lunes = resLunes(todayStr());
    const j = await apiRaw(`/api/horarios/semana?local=${encodeURIComponent(HOR.local)}&lunes=${HOR.lunes}`);
    HOR = { ...HOR, ...j };
    view.innerHTML = renderHorarios();
    if (HOR.semana) horConflictos(true);   // los avisos llegan después: la rejilla no espera
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function horPh() {
  const amb = HOR.local ? ` · <b>${esc(nombreCortoLocal(HOR.local))}</b>` : "";
  return `<div class="ph"><div class="eyebrow">Personas</div><h1>Horarios</h1><div class="sub">Cuadrante semanal del equipo${amb}</div></div>`;
}
// Espejo de franjaCorta() de tiempo.js. Medianoche como FINAL se escribe 24, no 0: un
// turno de 16:00 a 00:00 salía «16-0», que parece una errata.
function horFranja(ini, fin, abierto) {
  const h = (m, esFin) => {
    const n = Math.round(m);
    if (esFin && n > 0 && n % 1440 === 0) return "24";
    const b = ((n % 1440) + 1440) % 1440, hh = Math.floor(b / 60), mm = b % 60;
    return mm ? `${hh}:${String(mm).padStart(2, "0")}` : String(hh);
  };
  return `${h(ini)}-${abierto ? "cierre" : h(fin, true)}`;
}
// Espejo de franjaSiDifiere() del servidor: la hora solo se escribe si difiere del tramo.
function horFranjaSiDifiere(a, tramo) {
  if (a.fin_abierto) return horFranja(a.inicio_min, a.fin_min, true);
  if (!tramo) return horFranja(a.inicio_min, a.fin_min);
  return (+a.inicio_min === +tramo.inicio_min && +a.fin_min === +tramo.fin_min) ? null : horFranja(a.inicio_min, a.fin_min);
}
const horNombre = (id) => { const w = (HOR.equipo || []).find((x) => String(x.id) === String(id)); return w ? (w.nombre || w.username) : "—"; };

function renderHorarios() {
  const d = HOR.dias || [];
  const etiqueta = d.length ? `${fechaCorta(d[0])} – ${fechaCorta(d[6])}` : "";
  const est = HOR.semana
    ? (HOR.semana.estado === "borrador"
        ? `<span class="pill warn">Borrador · v${HOR.semana.version}</span>`
        : `<span class="pill ok">Publicado · v${HOR.semana.version}</span>`)
    : `<span class="pill">Sin empezar</span>`;
  const nav = `<div class="agnav">
    <button class="btn sm" data-act="hor-prev">‹</button>
    <button class="btn sm" data-act="hor-hoy">Esta semana</button>
    <button class="btn sm" data-act="hor-next">›</button>
    <b style="margin-left:6px">${esc(etiqueta)}</b> ${est}
    <div style="flex:1"></div>
    <div class="seg">
      <button class="${HOR.vista === "areas" ? "on" : ""}" data-act="hor-vista" data-v="areas">Por área</button>
      <button class="${HOR.vista === "personas" ? "on" : ""}" data-act="hor-vista" data-v="personas">Por persona</button>
    </div>
    <button class="btn" data-act="hor-config" title="Cuánta gente hace falta, contratos, ausencias y disponibilidad">Configuración</button>
    ${horAcciones()}
  </div>`;

  if (!HOR.semana) {
    return horPh() + nav + `<div class="card"><div class="ch"><h3>Esta semana está sin planificar</h3></div>
      <p class="mut" style="margin:0;line-height:1.6">Dale a «Empezar esta semana» y podrás ir poniendo turnos. Nada se publica hasta que tú lo digas.</p></div>`;
  }
  const aviso = horEditable() ? "" :
    `<div class="pendingblock" style="margin-bottom:12px">Estás viendo el horario <b>publicado</b>. Para cambiarlo hay que crear una versión nueva — así queda constancia de lo que vio el equipo.</div>`;
  return horPh() + nav + aviso + `<div id="horAvisos">${horAvisosHtml(HOR.conflictos)}</div>` + (HOR.vista === "personas" ? horPorPersona() : horRejilla()) + horResumen();
}

// ── La fila de fiesta: no se rellena, se calcula ──
// El servidor manda `descansos` ya resuelto (src/modules/horarios/descansos.js). Aquí solo se
// pinta. Que el cálculo no esté duplicado en el navegador es lo que garantiza que la pantalla
// diga exactamente lo mismo que el PDF que se manda al grupo.
const horEsDescanso = (tramo) => String((tramo || {}).tipo || "turno") === "descanso";

function horDescChip(x) {
  const et = x.etiqueta ? `<span class="hf">${esc(x.etiqueta)}</span>` : "";
  return `<div class="horchip desc ${x.motivo !== "fiesta" ? "aus" : ""}" title="${esc(x.motivo === "fiesta" ? "Libra" : cap(x.etiqueta || x.motivo))}">${et}${esc(x.nombre)}</div>`;
}

function horBloqueDescanso(tramo, cab) {
  const d = HOR.descansos;
  const dias = HOR.dias || [];
  if (!d) return "";
  const filas = (HOR.areas || []).map((area, i) => {
    const celdas = dias.map((_, di) => `<div class="horcell horslot nodrop">${((d.areas[i] || {}).dias?.[di] || []).map(horDescChip).join("")}</div>`).join("");
    return `<div class="horcell horarea">${esc(area.nombre)}</div>${celdas}`;
  }).join("");
  // Fila sin rótulo para quien esta semana no trabaja ningún día: no se le inventa un área.
  const hayS = (d.sinArea || []).some((c) => c.length);
  const sinArea = hayS
    ? `<div class="horcell horarea mut" title="Esta semana no trabajan ningún día, así que no tienen área">—</div>`
      + dias.map((_, di) => `<div class="horcell horslot nodrop">${(d.sinArea[di] || []).map(horDescChip).join("")}</div>`).join("")
    : "";
  return `<div class="hortramo desc"><div class="hortramo-t">${esc(tramo.nombre)}
      <span class="mut">se calcula solo · quien no tiene turno ese día</span></div>
    <div class="horgrid">${cab}${filas}${sinArea}</div></div>`;
}

// ── Rejilla por área (la del papel) ──
function horRejilla() {
  const dias = HOR.dias, hoy = todayStr();
  const cab = `<div class="horcell horhead"></div>` + dias.map((dia, i) =>
    `<div class="horcell horhead ${dia === hoy ? "hoy" : ""}"><div class="dwd">${WD[i]}</div><div class="dnum">${Number(dia.slice(-2))}</div></div>`
  ).join("");

  const bloques = (HOR.tramos || []).map((tramo) => {
    if (horEsDescanso(tramo)) return horBloqueDescanso(tramo, cab);
    const filas = (HOR.areas || []).map((area) => {
      const celdas = dias.map((dia) => {
        const gente = (HOR.asignaciones || [])
          .filter((a) => String(a.dia) === dia && String(a.tramo_id) === String(tramo.id) && String(a.area_id) === String(area.id) && (a.tipo || "turno") === "turno")
          .map((a) => ({ ...a, franja: horFranjaSiDifiere(a, tramo) }))
          .sort((a, b) => (!a.franja && b.franja ? -1 : a.franja && !b.franja ? 1 : a.inicio_min - b.inicio_min));
        const items = gente.map((a) => `<div class="horchip" draggable="${horEditable()}" data-horasig="${a.id}" data-act="hor-editar" data-id="${a.id}" title="${esc(horFranja(a.inicio_min, a.fin_min, a.fin_abierto))}">${a.franja ? `<span class="hf">${esc(a.franja)}</span>` : ""}${esc(horNombre(a.worker_id))}</div>`).join("");
        const mas = horEditable() ? `<button class="hormas" data-act="hor-nuevo" data-dia="${dia}" data-tramo="${tramo.id}" data-area="${area.id}" title="Añadir">+</button>` : "";
        return `<div class="horcell horslot" data-horcell data-dia="${dia}" data-tramo="${tramo.id}" data-area="${area.id}">${items}${mas}</div>`;
      }).join("");
      return `<div class="horcell horarea">${esc(area.nombre)}</div>${celdas}`;
    }).join("");
    return `<div class="hortramo"><div class="hortramo-t">${esc(tramo.nombre)} <span class="mut">${esc(horFranja(tramo.inicio_min, tramo.fin_min))}</span></div>
      <div class="horgrid">${cab}${filas}</div></div>`;
  }).join("");

  const sueltos = (HOR.asignaciones || []).filter((a) => (a.tipo || "turno") !== "turno" || !a.tramo_id || !a.area_id);
  const fuera = sueltos.length
    ? `<details class="card fold" style="margin-top:14px"><summary><h3>Fuera de la rejilla</h3><span class="foldr"><span>${num(sueltos.length)}</span><span class="car">${ic("chev", 16)}</span></span></summary>
       <div class="rows">${sueltos.map((a) => `<div class="row"><div class="grow"><div class="t1">${esc(horNombre(a.worker_id))}</div><div class="t2">${esc(a.dia)} · ${esc(cap(a.tipo || "turno"))}</div></div><button class="btn sm" data-act="hor-editar" data-id="${a.id}">Ver</button></div>`).join("")}</div></details>`
    : "";
  // En móvil la rejilla se cambia por una lista de días. Siete columnas en 390 px obligan
  // a desplazarse a ciegas: se ven dos días y medio, y el cuadrante existe justamente para
  // ver la semana entera de un vistazo. La rejilla se sigue enviando (la usa el escritorio)
  // y el CSS enseña una u otra: así no hay dos verdades ni hace falta repintar al girar.
  return bloques + horListaDias() + fuera;
}

// La misma información que la rejilla, en vertical. Se toca un turno para editarlo, igual.
function horListaDias() {
  const hoy = todayStr();
  const dias = (HOR.dias || []).map((dia, i) => {
    const bloques = (HOR.tramos || []).map((tramo) => {
      if (horEsDescanso(tramo)) {
        const d = HOR.descansos; if (!d) return "";
        const filas = (HOR.areas || []).map((area, ai) => {
          const g = (d.areas[ai] || {}).dias?.[i] || [];
          return g.length ? `<div class="hord-area"><span class="hord-et">${esc(area.nombre)}</span>
            <span class="hord-gente">${g.map(horDescChip).join("")}</span></div>` : "";
        }).join("");
        const sa = (d.sinArea || [])[i] || [];
        const extra = sa.length ? `<div class="hord-area"><span class="hord-et">—</span><span class="hord-gente">${sa.map(horDescChip).join("")}</span></div>` : "";
        if (!filas && !extra) return "";
        return `<div class="hord-tramo desc"><div class="hord-th">${esc(tramo.nombre)} <span class="mut">se calcula solo</span></div>${filas}${extra}</div>`;
      }
      const areas = (HOR.areas || []).map((area) => {
        const gente = (HOR.asignaciones || [])
          .filter((a) => String(a.dia) === dia && String(a.tramo_id) === String(tramo.id) && String(a.area_id) === String(area.id) && (a.tipo || "turno") === "turno")
          .map((a) => ({ ...a, franja: horFranjaSiDifiere(a, tramo) }))
          .sort((a, b) => a.inicio_min - b.inicio_min);
        if (!gente.length) return "";
        return `<div class="hord-area"><span class="hord-et">${esc(area.nombre)}</span>
          <span class="hord-gente">${gente.map((a) => `<button class="horchip" data-act="hor-editar" data-id="${a.id}">${a.franja ? `<span class="hf">${esc(a.franja)}</span>` : ""}${esc(horNombre(a.worker_id))}</button>`).join("")}</span></div>`;
      }).join("");
      if (!areas) return "";
      return `<div class="hord-tramo"><div class="hord-th">${esc(tramo.nombre)} <span class="mut">${esc(horFranja(tramo.inicio_min, tramo.fin_min))}</span></div>${areas}</div>`;
    }).join("");
    return `<li class="${dia === hoy ? "es-hoy" : ""}">
      <div class="hord-dia">${WD[i]} <b>${Number(dia.slice(-2))}</b></div>
      ${bloques || '<div class="mut" style="font-size:12.5px">Nadie asignado</div>'}
      ${horEditable() ? `<button class="btn sm" data-act="hor-nuevo" data-dia="${dia}" style="margin-top:8px">Añadir turno</button>` : ""}
    </li>`;
  }).join("");
  return `<ul class="hordias">${dias}</ul>`;
}

// ── Vista por persona (la que evita las horas extra) ──
function horPorPersona() {
  const dias = HOR.dias, hoy = todayStr();
  const tramoPorId = new Map((HOR.tramos || []).map((t) => [String(t.id), t]));
  const cab = `<div class="horcell horhead">Persona</div>` + dias.map((dia, i) =>
    `<div class="horcell horhead ${dia === hoy ? "hoy" : ""}"><div class="dwd">${WD[i]}</div><div class="dnum">${Number(dia.slice(-2))}</div></div>`
  ).join("") + `<div class="horcell horhead">Horas</div>`;

  const filas = (HOR.equipo || []).map((w) => {
    let min = 0;
    const celdas = dias.map((dia) => {
      const suyos = (HOR.asignaciones || []).filter((a) => String(a.worker_id) === String(w.id) && String(a.dia) === dia)
        .sort((a, b) => a.inicio_min - b.inicio_min);
      const chips = suyos.map((a) => {
        if ((a.tipo || "turno") !== "turno") return `<div class="horchip lib">${esc(cap(a.tipo))}</div>`;
        min += (a.fin_min - a.inicio_min);
        return `<div class="horchip" draggable="${horEditable()}" data-horasig="${a.id}" data-act="hor-editar" data-id="${a.id}">${esc(horFranja(a.inicio_min, a.fin_min, a.fin_abierto))}</div>`;
      }).join("");
      return `<div class="horcell horslot" data-horcell data-dia="${dia}" data-worker="${w.id}">${chips}</div>`;
    }).join("");
    const h = Math.round((min / 60) * 10) / 10;
    return `<div class="horcell horarea" title="${esc(w.puesto || "")}">${esc(w.nombre || w.username)}</div>${celdas}<div class="horcell hortot ${h > 40 ? "alto" : ""}"><b class="tnum">${dec1(h)}</b></div>`;
  }).join("");
  return `<div class="hortramo"><div class="horgrid porpersona">${cab}${filas}</div></div>`;
}

function horResumen() {
  const turnos = (HOR.asignaciones || []).filter((a) => (a.tipo || "turno") === "turno");
  const min = turnos.reduce((s, a) => s + (a.fin_min - a.inicio_min), 0);
  const gente = new Set(turnos.map((a) => String(a.worker_id))).size;
  const solapes = horSolapes().length;
  return `<div class="grid g4" style="margin-top:16px">
    ${stat("Turnos", ic("cal", 15), num(turnos.length))}
    ${stat("Horas planificadas", ic("clock", 15), dec1(min / 60))}
    ${stat("Personas con turno", ic("users", 15), `${num(gente)}/${num((HOR.equipo || []).length)}`)}
    ${stat("Solapes", ic("alert", 15), num(solapes), "", solapes ? "hay que revisarlos" : "ninguno")}
  </div>`;
}
// Espejo de solapesDe() del servidor.
function horSolapes() {
  const porClave = {};
  for (const a of (HOR.asignaciones || [])) {
    if ((a.tipo || "turno") !== "turno") continue;
    (porClave[`${a.worker_id}|${a.dia}`] ||= []).push(a);
  }
  const out = [];
  for (const k of Object.keys(porClave)) {
    const l = porClave[k].sort((a, b) => a.inicio_min - b.inicio_min);
    for (let i = 0; i < l.length - 1; i++) for (let j = i + 1; j < l.length; j++)
      if (l[i].inicio_min < l[j].fin_min && l[j].inicio_min < l[i].fin_min) out.push([l[i], l[j]]);
  }
  return out;
}

// Botonera según el estado. Publicar solo aparece cuando hay algo que publicar.
function horAcciones() {
  if (!HOR.semana) return `<button class="btn primary" data-act="hor-crear">Empezar esta semana</button>`;
  const n = (HOR.asignaciones || []).length;
  const pdf = `<button class="btn" data-act="hor-pdf" ${n ? "" : "disabled"} title="Descargar el cuadrante en PDF">${ic("receipt", 15)} PDF</button>`;
  if (horEditable()) {
    return `<button class="btn" data-act="hor-generar" title="Proponer un cuadrante a partir de las necesidades, los contratos y las ausencias">Proponer horario</button>
      <button class="btn" data-act="hor-copiar">Copiar semana</button>
      <button class="btn" data-act="hor-plantillas">Plantillas</button>
      ${pdf}
      <button class="btn primary" data-act="hor-publicar" ${n ? "" : "disabled"}>Publicar</button>`;
  }
  // Mandar al grupo es un botón APARTE de publicar, no un efecto de publicar: se publica
  // varias veces mientras se cuadra la semana, y un mensaje al grupo por cada una sería
  // ruido que la gente acabaría silenciando.
  return `<button class="btn" data-act="hor-historico">Versiones</button>
    ${pdf}
    <button class="btn" data-act="hor-wa" title="Mandar el PDF al grupo de WhatsApp del local">Mandar al grupo</button>
    <button class="btn primary" data-act="hor-nueva-version">Cambiar horario</button>`;
}

// Los conflictos se piden aparte: la rejilla se ve al instante y los avisos llegan después.
async function horConflictos(silencioso) {
  if (!HOR.semana) return null;
  try {
    const j = await apiRaw(`/api/horarios/semana/${HOR.semana.id}/conflictos`);
    HOR.conflictos = j;
    const caja = document.getElementById("horAvisos");
    if (caja) caja.innerHTML = horAvisosHtml(j);
    return j;
  } catch (e) { if (!silencioso && e.message !== "noauth") toast("Error: " + e.message); return null; }
}
function horAvisosHtml(j) {
  if (!j || !j.total) return "";
  const fila = (c) => `<div class="row"><span class="sdot ${c.severidad === "bloquea" ? "st-crit" : "st-warn"}"></span><div class="grow"><div class="t1" style="font-weight:400;line-height:1.5">${esc(c.mensaje)}</div></div></div>`;
  return `<details class="card fold" style="margin-bottom:14px">
    <summary><h3>${j.bloquean.length ? "Hay que arreglar esto" : "Cosas a tener en cuenta"}</h3>
      <span class="foldr"><span>${j.bloquean.length ? `${num(j.bloquean.length)} bloquean · ` : ""}${num(j.avisan.length)} avisos</span><span class="car">${ic("chev", 16)}</span></span></summary>
    <div class="rows">${[...j.bloquean, ...j.avisan].map(fila).join("")}</div>
  </details>`;
}

async function horCopiar() {
  const anterior = addDaysStr(HOR.lunes, -7);
  const ov = modal("Copiar semana", `<div class="form-grid">
      <div class="field full"><label>¿De qué semana?</label>${dpField("horCopiaDe", anterior, "Elegir semana")}</div>
      <label class="field full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="horReemplazar" checked style="width:auto"> Sustituir lo que ya haya en esta semana</label>
    </div>
    <div class="pendingblock" style="margin-top:10px">Al copiar se comprueba quién sigue en el equipo y quién tiene vacaciones o baja. A esos no se les copia el turno, y te digo a quién.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="horCopiaOk">Copiar</button></div>`);
  ov.querySelector("#horCopiaOk").addEventListener("click", async () => {
    const lunes = document.getElementById("horCopiaDe").value;
    if (!lunes) { toast("Elige la semana de origen"); return; }
    try {
      const j = await apiSend("POST", `/api/horarios/semana/${HOR.semana.id}/copiar`, { lunes, reemplazar: ov.querySelector("#horReemplazar").checked });
      ov.remove();
      toast(`${num(j.copiadas)} turno(s) copiados${j.omitidos.length ? ` · ${num(j.omitidos.length)} omitidos` : ""}`);
      if (j.omitidos.length) horOmitidos(j.omitidos);
      loadHorarios();
    } catch (e) { toast("Error: " + e.message); }
  });
}
// Lo que NO se copió y por qué. Callarlo sería el fallo peligroso: creerías tener cubierto
// un turno que en realidad está vacío.
function horOmitidos(oms) {
  modal("No se copiaron estos turnos", `<div class="rows">${oms.map((o) => `<div class="row"><div class="grow"><div class="t1">${esc(horNombre(o.worker_id))}</div><div class="t2">${esc(o.dia)} · ${esc(o.motivo)}</div></div></div>`).join("")}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn primary" data-close>Entendido</button></div>`);
}

async function horPlantillas() {
  let j; try { j = await apiRaw(`/api/horarios/plantillas?local=${encodeURIComponent(HOR.local)}`); } catch { toast("No se pudieron cargar"); return; }
  const lista = (j.data || []).length
    ? (j.data || []).map((p) => `<div class="row"><div class="grow"><div class="t1">${esc(p.nombre)}</div><div class="t2">${num(p.lineas)} turnos${p.descripcion ? " · " + esc(p.descripcion) : ""}</div></div><button class="btn sm primary" data-horpl="${p.id}">Aplicar</button></div>`).join("")
    : `<div class="mut" style="padding:12px">Todavía no has guardado ninguna.</div>`;
  const ov = modal("Plantillas", `<div class="card p0"><div class="rows">${lista}</div></div>
    <div class="toolbar" style="margin-top:14px"><div class="field" style="flex:1"><label>Guardar esta semana como plantilla</label><input id="horPlNombre" placeholder="Semana de verano, Festivo…"></div><button class="btn" id="horPlGuardar">Guardar</button></div>`);
  ov.addEventListener("click", async (e) => {
    const ap = e.target.closest("[data-horpl]");
    if (!ap) return;
    try {
      const r = await apiSend("POST", `/api/horarios/semana/${HOR.semana.id}/copiar`, { plantilla_id: ap.getAttribute("data-horpl"), reemplazar: true });
      ov.remove(); toast(`${num(r.copiadas)} turno(s) aplicados`);
      if (r.omitidos.length) horOmitidos(r.omitidos);
      loadHorarios();
    } catch (err) { toast("Error: " + err.message); }
  });
  ov.querySelector("#horPlGuardar").addEventListener("click", async () => {
    const nombre = ov.querySelector("#horPlNombre").value.trim();
    if (!nombre) { toast("Ponle un nombre"); return; }
    try { await apiSend("POST", "/api/horarios/plantillas", { semana_id: HOR.semana.id, nombre }); ov.remove(); toast("Plantilla guardada ✅"); }
    catch (e) { toast("Error: " + e.message); }
  });
}

async function horPublicar() {
  const j = await horConflictos(true);
  if (j && j.bloquean.length) {
    modal("Todavía no se puede publicar", `<p class="mut" style="margin:0 0 10px;line-height:1.6">Esto no puede ser cierto y hay que arreglarlo antes:</p>
      <div class="card p0"><div class="rows">${j.bloquean.map((c) => `<div class="row"><span class="sdot st-crit"></span><div class="grow"><div class="t1" style="font-weight:400">${esc(c.mensaje)}</div></div></div>`).join("")}</div></div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn primary" data-close>Entendido</button></div>`);
    return;
  }
  const avisos = (j && j.avisan) || [];
  const cuerpo = avisos.length
    ? `<p style="margin:0 0 10px;line-height:1.6">Se puede publicar, pero hay <b>${num(avisos.length)}</b> cosa(s) que conviene mirar. Si sigues, queda escrito que las asumiste tú.</p>
       <div class="card p0" style="max-height:38vh;overflow:auto"><div class="rows">${avisos.map((c) => `<div class="row"><span class="sdot st-warn"></span><div class="grow"><div class="t1" style="font-weight:400">${esc(c.mensaje)}</div></div></div>`).join("")}</div></div>`
    : `<p style="margin:0;line-height:1.6">Todo cuadra. Al publicar, el equipo verá este horario y quedará guardado tal cual.</p>`;
  const ov = modal("Publicar el horario", cuerpo + `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="horPubOk">Publicar</button></div>`);
  ov.querySelector("#horPubOk").addEventListener("click", async () => {
    try {
      const r = await apiSend("POST", `/api/horarios/semana/${HOR.semana.id}/publicar`, { aceptar_avisos: true });
      ov.remove(); toast(`Horario publicado (v${r.version}) ✅`); loadHorarios();
    } catch (e) { toast("Error: " + e.message); }
  });
}

async function horNuevaVersion() {
  if (!(await confirmModal("Se creará una copia editable del horario publicado. El que ve el equipo no cambia hasta que publiques la nueva.", { ok: "Crear versión" }))) return;
  try { const j = await apiSend("POST", `/api/horarios/semana/${HOR.semana.id}/nueva-version`, {}); toast(`Versión ${j.semana.version} creada`); loadHorarios(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// Descarga del PDF. Mismo patrón que el resto de exportaciones del panel.
async function horPdf() {
  if (!HOR.semana) return;
  toast("Preparando el PDF…");
  try {
    const r = await fetch(`/api/horarios/semana/${HOR.semana.id}/pdf`, { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) { toast("No se pudo generar el PDF"); return; }
    const nombre = (r.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "horario.pdf";
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a"); a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    const pgs = r.headers.get("x-horario-paginas");
    toast(Number(pgs) > 1 ? `PDF descargado · ${pgs} hojas` : "PDF descargado ✅");
  } catch { toast("No se pudo generar el PDF"); }
}

// ── Configuración del local ─────────────────────────────────────────────────
// Cuatro cosas que ya vivían en la base desde hace fases pero solo se podían rellenar
// entrando por SQL, que es tanto como no tenerlas. Sin esto el generador no tiene con qué
// trabajar y los avisos de conflicto se quedan a medias.
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HOR_TIPO_AUS = { vacaciones: "Vacaciones", baja: "Baja", permiso: "Permiso", asuntos_propios: "Asuntos propios" };
// Los tres estados de disponibilidad, en el orden en que se van pulsando.
const HOR_PREF = {
  disponible: { txt: "·", sig: "prefiere" },
  prefiere: { txt: "♥", sig: "no_disponible" },
  no_disponible: { txt: "✕", sig: "disponible" },
};
let HORCFG = { tab: "turnos", data: null };
const horHM = (m) => `${String(Math.floor((Number(m) || 0) / 60) % 24).padStart(2, "0")}:${String((Number(m) || 0) % 60).padStart(2, "0")}`;
// "00:00" al final de un turno significa medianoche del día siguiente, no las 00:00 de hoy.
const horAMin = (hhmm, finDeTurno = false) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return finDeTurno && v === 0 ? 1440 : v;
};

async function horConfig() {
  const ov = modal("Configuración de " + nombreCortoLocal(HOR.local), '<p class="mut">Cargando…</p>');
  // Ancho: la rejilla son 7 días × 2 números y los refuerzos llevan dos horas dentro. Con
  // los 520 px del diálogo normal se corta el domingo, que es justo la columna que más se
  // mira. Se toca `width` y no `max-width` porque .modal fija el ancho, no el máximo.
  ov.querySelector(".modal").style.width = "min(940px, 96vw)";
  const pintar = async () => {
    try { HORCFG.data = await apiRaw(`/api/horarios/plantilla?local=${encodeURIComponent(HOR.local)}`); }
    catch (e) { ov.querySelector(".modal-b").innerHTML = `<p class="mut">${esc(e.message)}</p>`; return; }
    const d = HORCFG.data;
    ov.querySelector(".modal-b").innerHTML = `
      <div class="toolbar" style="margin-bottom:14px">
        ${[["turnos", "Turnos"], ["necesidades", "Cuánta gente hace falta"], ["contratos", "Contratos"], ["ausencias", "Vacaciones y bajas"], ["disp", "Disponibilidad"]]
          .map(([k, t]) => `<button class="btn ${HORCFG.tab === k ? "primary" : ""}" data-horcfgtab="${k}">${t}</button>`).join("")}
      </div>
      <div id="horCfgCuerpo">${
        HORCFG.tab === "turnos" ? horCfgTurnos(d)
        : HORCFG.tab === "necesidades" ? horCfgNecesidades(d)
        : HORCFG.tab === "contratos" ? horCfgContratos(d)
        : HORCFG.tab === "ausencias" ? horCfgAusencias(d)
        : horCfgDisponibilidad(d)}</div>`;
  };

  // UN escuchador, puesto una sola vez sobre `.modal-b`, que es el nodo que sobrevive a los
  // repintados (solo se le cambia el innerHTML). Volver a engancharlo en cada repintado
  // acababa duplicando diálogos.
  ov.querySelector(".modal-b").addEventListener("click", async (e) => {
    const tab = e.target.closest("[data-horcfgtab]");
    if (tab) { HORCFG.tab = tab.getAttribute("data-horcfgtab"); return pintar(); }
    await horCfgAccion(e, ov, pintar);
  });
  await pintar();
}

// Pedir un día con el MISMO selector que el resto de la web, no con el del navegador.
function horCfgPedirFecha(titulo, nota) {
  return new Promise((resolve) => {
    const ov = modal(titulo, `
      ${nota ? `<p class="mut" style="margin:0 0 14px;line-height:1.5">${esc(nota)}</p>` : ""}
      ${dpField("__cfgFecha", todayStr(), "Elegir día")}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
        <button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>Guardar</button></div>`);
    ov.addEventListener("click", (e) => {
      if (e.target.closest("[data-ok]")) { const v = ov.querySelector("#__cfgFecha").value; ov.remove(); dpClose(); resolve(v || null); }
      else if (e.target === ov || e.target.closest("[data-close]")) { dpClose(); resolve(null); }
    });
  });
}

// Los turnos de la casa. Se editan aquí porque suponerlos sale caro: de ellos cuelgan las
// necesidades, el generador y lo que el PDF decide escribir o callar.
function horCfgTurnos(d) {
  const areaFila = (a) => `<tr data-area="${a.id || ""}">
      <td><input class="inp horcfg-a" data-k="nombre" value="${esc(a.nombre || "")}" style="width:180px" placeholder="BARRA"></td>
      <td style="text-align:right"><button class="btn sm danger" data-horcfg="area-quitar">Quitar</button></td>
    </tr>`;
  const fila = (t) => `<tr data-tramo="${t.id || ""}">
      <td><input class="inp horcfg-t" data-k="nombre" value="${esc(t.nombre || "")}" style="width:130px" placeholder="MAÑANA"></td>
      <td><input class="inp horcfg-t" data-k="inicio" type="time" value="${horHM(t.inicio_min)}" style="width:110px"></td>
      <td><input class="inp horcfg-t" data-k="fin" type="time" value="${horHM(t.fin_min)}" style="width:110px"></td>
      <td class="mut" style="white-space:nowrap">${t.fin_min > 1440 || t.fin_min === 1440 ? "acaba de madrugada" : ""}</td>
      <td style="text-align:right"><button class="btn sm danger" data-horcfg="turno-quitar">Quitar</button></td>
    </tr>`;
  return `
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Los turnos completos de la casa. Un turno que acabe a
      medianoche se escribe <b>00:00</b> y se entiende como el final del día. Los <b>refuerzos no van aquí</b>:
      como no tienen hora fija, se configuran en «Cuánta gente hace falta».</p>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Nombre</th><th>Entra</th><th>Sale</th><th></th><th></th></tr></thead>
      <tbody id="horCfgTurnos">${d.tramos.map(fila).join("")}</tbody></table></div>
    <p id="horCfgTMsg" style="margin:10px 0 0;min-height:16px;color:var(--danger);font-weight:550"></p>
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:8px">
      <button class="btn" data-horcfg="turno-add">Añadir turno</button>
      <button class="btn primary" data-horcfg="guardar-turnos">Guardar</button></div>
    <p class="mut" style="margin:14px 0 0;line-height:1.5">Quitar un turno no borra los cuadrantes ya hechos:
      se desactiva, y las semanas antiguas siguen contando lo que fue.</p>

    <div class="ch" style="margin-top:24px"><h3 style="margin:0;font-size:13px">Áreas</h3></div>
    <p class="mut" style="margin:0 0 10px;line-height:1.55">Las filas del cuadrante. Vienen SALA y COCINA porque
      es lo más común, pero cada casa tiene las suyas: BARRA, TERRAZA, OFFICE…</p>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Nombre</th><th></th></tr></thead>
      <tbody id="horCfgAreas">${d.areas.map(areaFila).join("")}</tbody></table></div>
    <p id="horCfgAMsg" style="margin:10px 0 0;min-height:16px;color:var(--danger);font-weight:550"></p>
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:8px">
      <button class="btn" data-horcfg="area-add">Añadir área</button>
      <button class="btn primary" data-horcfg="guardar-areas">Guardar áreas</button></div>`;
}

// Rejilla área × tramo × día. Se rellena una vez y no se vuelve a tocar en meses, así que
// lo que importa es que se entienda de un vistazo, no que sea rápida de teclear.
function horCfgNecesidades(d) {
  if (!d.areas.length || !d.tramos.length) return `<p class="mut">Este local no tiene áreas ni tramos configurados.</p>`;
  const val = (a, t, dow) => d.necesidades.find((n) => +n.area_id === +a && +n.tramo_id === +t && +n.dow === dow) || {};
  const celda = (a, t, dow, nombre) => {
    const n = val(a, t, dow);
    const campo = (k, cls, tit) => `<input class="inp horcfg-n ${cls}" data-a="${a}" data-t="${t}" data-d="${dow}" data-k="${k}"
      value="${n[k] ?? ""}" inputmode="numeric" placeholder="—" title="${esc(tit)} · ${esc(nombre)} · ${DOW[dow]}">`;
    return `<td class="horcfg-celda">${campo("minimo", "es-min", "Mínimo")}${campo("objetivo", "es-obj", "Objetivo")}</td>`;
  };
  return `
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Cuántas personas hacen falta en cada sitio.
      <b>Arriba el mínimo</b> (sin eso no se puede abrir) y <b>abajo el objetivo</b>, más claro (lo ideal si hay
      gente). El objetivo se puede dejar vacío. Se lee por filas: la de arriba son los mínimos de toda la semana.</p>
    <div class="tw"><table class="tbl horcfg-nec">
      <thead><tr><th>Área · Tramo</th>${DOW.map((x) => `<th style="text-align:center">${x}</th>`).join("")}</tr></thead>
      <tbody>${d.areas.flatMap((a) => d.tramos.map((t) => `<tr>
        <td style="white-space:nowrap"><b>${esc(a.nombre)}</b> <span class="mut">${esc(t.nombre)}</span></td>
        ${DOW.map((_, dow) => celda(a.id, t.id, dow, `${a.nombre} ${t.nombre}`)).join("")}
      </tr>`)).join("")}</tbody></table></div>

    ${horCfgRefuerzos(d)}

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button class="btn primary" data-horcfg="guardar-nec">Guardar</button></div>`;
}

// Refuerzos: 4 h que caen donde quepan dentro de una horquilla. Van aparte de la rejilla
// de arriba porque NO tienen hora fija — uno puede ser de 10 a 14 y otro de 11 a 15 — y
// meterlos en una columna de «tramo» sería volver al problema que esto viene a arreglar.
function horCfgRefuerzos(d) {
  // Cada refuerzo es una etiqueta + duración + ventana. Los días llevan solo el número.
  const porGrupo = new Map();
  for (const n of d.necesidades.filter((x) => Number(x.duracion_min) > 0)) {
    const k = `${n.area_id}|${n.duracion_min}|${n.ventana_inicio_min}|${n.ventana_fin_min}|${n.etiqueta || ""}`;
    if (!porGrupo.has(k)) porGrupo.set(k, { area_id: n.area_id, duracion_min: n.duracion_min,
      ventana_inicio_min: n.ventana_inicio_min, ventana_fin_min: n.ventana_fin_min, etiqueta: n.etiqueta || "", dias: {} });
    porGrupo.get(k).dias[n.dow] = n.minimo;
  }
  const grupos = [...porGrupo.values()];

  // Una ficha por refuerzo, no una fila de tabla: entre la etiqueta, la duración, dos horas
  // y siete días no cabe todo a lo ancho del diálogo, y en tabla se salían los domingos.
  return `
    <div class="ch" style="margin-top:22px"><h3 style="margin:0;font-size:13px">Refuerzos</h3></div>
    <p class="mut" style="margin:0 0 10px;line-height:1.55">Gente extra que no hace turno completo. Se dice
      <b>cuánto dura</b> y <b>entre qué horas puede caer</b>, y al generar se colocan donde quepan: pueden salir
      de 10 a 14 un día y de 11 a 15 otro. Si quieres que sea siempre a la misma hora, aprieta la horquilla.</p>
    <div id="horCfgRefs">${grupos.length ? grupos.map(horCfgRefuerzoFicha).join("")
      // Dentro del contenedor, no fuera: así al añadir el primero desaparece solo.
      : '<p class="mut horcfg-ref-vacio" style="margin:0 0 10px">Ningún refuerzo configurado.</p>'}</div>
    <div><button class="btn sm" data-horcfg="ref-add">Añadir refuerzo</button></div>`;
}

function horCfgRefuerzoFicha(g = {}) {
  const dias = g.dias || {};
  return `<div class="horcfg-ref" data-area="${g.area_id || ""}">
    <div class="horcfg-ref-h">
      <input class="inp horcfg-r" data-k="etiqueta" value="${esc(g.etiqueta || "Refuerzo")}" placeholder="Refuerzo mañana">
      <span class="mut">de</span>
      <input class="inp horcfg-r horcfg-r-num" data-k="duracion" value="${(Number(g.duracion_min) / 60) || 4}" inputmode="decimal">
      <span class="mut">h, entre las</span>
      <input class="inp horcfg-r horcfg-r-hora" data-k="vini" type="time" value="${horHM(g.ventana_inicio_min ?? 540)}">
      <span class="mut">y las</span>
      <input class="inp horcfg-r horcfg-r-hora" data-k="vfin" type="time" value="${horHM(g.ventana_fin_min ?? 960)}">
      <div style="flex:1"></div>
      <button class="btn sm danger" data-horcfg="ref-quitar">Quitar</button>
    </div>
    <div class="horcfg-ref-d">
      <span class="mut">Cuántos:</span>
      ${DOW.map((x, dow) => `<label><span>${x}</span>
        <input class="inp horcfg-r horcfg-rd" data-k="dia" data-d="${dow}" value="${dias[dow] ?? ""}"
               inputmode="numeric" placeholder="—"></label>`).join("")}
    </div>
  </div>`;
}

function horCfgContratos(d) {
  const vigente = (id) => d.contratos.find((c) => +c.worker_id === +id && !c.hasta);
  return `
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Las horas por semana de cada uno. Es lo que usa el
      generador para repartir y lo que compara la revisión de fichajes. Cambiar las horas <b>no borra</b> las
      anteriores: se cierra el contrato viejo y se abre uno nuevo, para que los meses ya pagados sigan cuadrando.</p>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Persona</th><th style="text-align:right">Horas/semana</th><th>Desde</th><th></th></tr></thead>
      <tbody>${d.equipo.map((w) => { const c = vigente(w.id); return `<tr>
        <td><b>${esc(w.nombre || w.username)}</b></td>
        <td style="text-align:right">${c ? esc(String(c.horas_semana)) + " h" : '<span class="mut">sin contrato</span>'}</td>
        <td class="mut">${c ? esc(String(c.desde)) : "—"}</td>
        <td style="text-align:right"><button class="btn sm" data-horcfg="contrato" data-id="${w.id}" data-nombre="${esc(w.nombre || w.username)}">${c ? "Cambiar" : "Poner"}</button></td>
      </tr>`; }).join("")}</tbody></table></div>`;
}

function horCfgAusencias(d) {
  const nombre = (id) => (d.equipo.find((w) => +w.id === +id) || {}).nombre || "—";
  return `
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Vacaciones, bajas y permisos. El generador no pone a
      trabajar a quien esté de baja, y en la revisión de fichajes explican un día sin fichar sin que salte una incidencia.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:14px">
      <label style="flex:1;min-width:150px"><span class="t2">Persona</span>
        <select class="inp" id="ausW" style="width:100%">${d.equipo.map((w) => `<option value="${w.id}">${esc(w.nombre || w.username)}</option>`).join("")}</select></label>
      <label><span class="t2">Motivo</span>
        <select class="inp" id="ausTipo">${Object.entries(HOR_TIPO_AUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      <label><span class="t2">Desde</span>${dpField("ausDesde", "", "Elegir día")}</label>
      <label><span class="t2">Hasta</span>${dpField("ausHasta", "", "Elegir día")}</label>
      <button class="btn" data-horcfg="ausencia-add">Añadir</button>
    </div>
    <p id="ausMsg" style="margin:0 0 10px;min-height:16px;color:var(--danger);font-weight:550"></p>
    ${d.ausencias.length ? `<div class="tw"><table class="tbl">
      <thead><tr><th>Persona</th><th>Motivo</th><th>Desde</th><th>Hasta</th><th></th></tr></thead>
      <tbody>${d.ausencias.map((a) => `<tr>
        <td><b>${esc(nombre(a.worker_id))}</b></td>
        <td>${esc(HOR_TIPO_AUS[a.tipo] || a.tipo)}${a.estado !== "aprobada" ? ' <span class="fic-tag">pendiente</span>' : ""}</td>
        <td class="mut">${esc(a.desde)}</td><td class="mut">${esc(a.hasta)}</td>
        <td style="text-align:right"><button class="btn sm danger" data-horcfg="ausencia-del" data-id="${a.id}">Quitar</button></td>
      </tr>`).join("")}</tbody></table></div>`
    : `<p class="mut" style="margin:0">Nada apuntado. Se ven las de los últimos 30 días en adelante.</p>`}`;
}

// Disponibilidad: solo se guarda lo que NO es "disponible". Es lo normal poder trabajar, y
// una tabla con 7 casillas por persona en verde no dice nada.
function horCfgDisponibilidad(d) {
  const suyas = (id) => d.disponibilidad.filter((x) => +x.worker_id === +id);
  return `
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Pulsa una casilla para cambiarla:
      <b class="horcfg-ley pref-disponible">·</b> puede · <b class="horcfg-ley pref-prefiere">♥</b> lo prefiere ·
      <b class="horcfg-ley pref-no_disponible">✕</b> no puede.
      El generador respeta los «no puede» como una vacación y usa los «lo prefiere» para desempatar.</p>
    <div class="tw"><table class="tbl horcfg-nec">
      <thead><tr><th>Persona</th>${DOW.map((x) => `<th style="text-align:center">${x}</th>`).join("")}</tr></thead>
      <tbody>${d.equipo.map((w) => `<tr>
        <td style="white-space:nowrap"><b>${esc(w.nombre || w.username)}</b></td>
        ${DOW.map((_, dow) => {
          const f = suyas(w.id).find((x) => +x.dow === dow);
          const v = f ? f.preferencia : "disponible";
          // Un botón de tres estados en vez de un <select>: el desplegable nativo se come
          // 60 px por celda y con siete días la tabla no cabe en el diálogo.
          return `<td class="horcfg-celda">
            <button type="button" class="horcfg-d pref-${v}" data-w="${w.id}" data-d="${dow}" data-v="${v}"
                    title="${esc(w.nombre || w.username)} · ${DOW[dow]} — pulsa para cambiar">${HOR_PREF[v].txt}</button></td>`;
        }).join("")}
      </tr>`).join("")}</tbody></table></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button class="btn primary" data-horcfg="guardar-disp">Guardar</button></div>`;
}

async function horCfgAccion(e, ov, pintar) {
  // Las casillas de disponibilidad van rotando en el sitio; no se guarda nada hasta pulsar
  // «Guardar», para poder repasar la tabla entera antes de mandarla.
  const pref = e.target.closest(".horcfg-d");
  if (pref) {
    const sig = HOR_PREF[pref.dataset.v].sig;
    pref.dataset.v = sig;
    pref.textContent = HOR_PREF[sig].txt;
    pref.className = "horcfg-d pref-" + sig;
    return;
  }
  const b = e.target.closest("[data-horcfg]");
  if (!b) return;
  const act = b.getAttribute("data-horcfg");

  if (act === "turno-add") {
    const tbody = ov.querySelector("#horCfgTurnos");
    const tr = document.createElement("tr");
    tr.setAttribute("data-tramo", "");
    tr.innerHTML = `<td><input class="inp horcfg-t" data-k="nombre" value="" style="width:130px" placeholder="REFUERZO"></td>
      <td><input class="inp horcfg-t" data-k="inicio" type="time" value="08:00" style="width:110px"></td>
      <td><input class="inp horcfg-t" data-k="fin" type="time" value="16:00" style="width:110px"></td>
      <td></td><td style="text-align:right"><button class="btn sm danger" data-horcfg="turno-quitar">Quitar</button></td>`;
    tbody.appendChild(tr);
    return;
  }
  if (act === "turno-quitar") { b.closest("tr").remove(); return; }

  if (act === "area-add") {
    ov.querySelector("#horCfgAreas").insertAdjacentHTML("beforeend",
      `<tr data-area=""><td><input class="inp horcfg-a" data-k="nombre" value="" style="width:180px" placeholder="BARRA"></td>
       <td style="text-align:right"><button class="btn sm danger" data-horcfg="area-quitar">Quitar</button></td></tr>`);
    return;
  }
  if (act === "area-quitar") { b.closest("tr").remove(); return; }

  if (act === "guardar-areas") {
    const msg = ov.querySelector("#horCfgAMsg");
    const areas = [...ov.querySelectorAll("#horCfgAreas tr")].map((tr) => ({
      id: tr.getAttribute("data-area") || null,
      nombre: tr.querySelector('[data-k="nombre"]').value.trim(),
    }));
    if (!areas.length) { msg.textContent = "Tiene que quedar al menos un área."; return; }
    if (areas.some((a) => !a.nombre)) { msg.textContent = "Todas las áreas necesitan un nombre."; return; }
    try { await apiSend("PUT", "/api/horarios/areas", { local: HOR.local, areas }); toast("Áreas guardadas ✅"); }
    catch (err) { msg.textContent = err.message; return; }
    await loadHorarios();
    return pintar();
  }

  if (act === "guardar-turnos") {
    const msg = ov.querySelector("#horCfgTMsg");
    const tramos = [...ov.querySelectorAll("#horCfgTurnos tr")].map((tr) => {
      const g = (k) => tr.querySelector(`[data-k="${k}"]`).value;
      return { id: tr.getAttribute("data-tramo") || null, nombre: g("nombre").trim(),
        inicio_min: horAMin(g("inicio")), fin_min: horAMin(g("fin"), true) };
    });
    if (!tramos.length) { msg.textContent = "Tiene que quedar al menos un turno."; return; }
    const malo = tramos.find((t) => !t.nombre || t.inicio_min == null || t.fin_min == null || t.fin_min <= t.inicio_min);
    if (malo) { msg.textContent = `«${malo.nombre || "sin nombre"}»: revisa el nombre y que la salida sea posterior a la entrada.`; return; }
    try { await apiSend("PUT", "/api/horarios/tramos", { local: HOR.local, tramos }); toast("Turnos guardados ✅"); }
    catch (err) { msg.textContent = err.message; return; }
    await loadHorarios();     // la rejilla del cuadrante depende de los tramos
    return pintar();
  }

  if (act === "ref-add") {
    const caja = ov.querySelector("#horCfgRefs");
    caja.querySelector(".horcfg-ref-vacio")?.remove();
    caja.insertAdjacentHTML("beforeend", horCfgRefuerzoFicha({ area_id: (HORCFG.data.areas[0] || {}).id }));
    return;
  }
  if (act === "ref-quitar") {
    const caja = ov.querySelector("#horCfgRefs");
    b.closest(".horcfg-ref").remove();
    if (!caja.querySelector(".horcfg-ref")) {
      caja.innerHTML = '<p class="mut horcfg-ref-vacio" style="margin:0 0 10px">Ningún refuerzo configurado.</p>';
    }
    return;
  }

  if (act === "guardar-nec") {
    const necesidades = [];
    // 1. La rejilla de turnos completos.
    const mapa = new Map();
    ov.querySelectorAll(".horcfg-n").forEach((i) => {
      const k = `${i.dataset.a}|${i.dataset.t}|${i.dataset.d}`;
      if (!mapa.has(k)) mapa.set(k, { area_id: +i.dataset.a, tramo_id: +i.dataset.t, dow: +i.dataset.d });
      const v = i.value.trim();
      mapa.get(k)[i.dataset.k] = v === "" ? null : Number(v);
    });
    necesidades.push(...mapa.values());

    // 2. Los refuerzos: una fila por día con número, todas compartiendo duración y ventana.
    const areaPorDefecto = (HORCFG.data.areas[0] || {}).id;
    for (const tr of ov.querySelectorAll("#horCfgRefs .horcfg-ref")) {
      const g = (k) => tr.querySelector(`[data-k="${k}"]`).value.trim();
      const horas = Number(String(g("duracion")).replace(",", "."));
      const vIni = horAMin(g("vini")), vFin = horAMin(g("vfin"), true);
      if (!(horas > 0) || vIni == null || vFin == null) continue;
      if (vFin - vIni < horas * 60) {
        toast(`«${g("etiqueta") || "Refuerzo"}»: la horquilla es más corta que la duración`);
        return;
      }
      for (const inp of tr.querySelectorAll(".horcfg-rd")) {
        const n = Number(inp.value.trim());
        if (!(n > 0)) continue;
        necesidades.push({
          area_id: Number(tr.dataset.area || areaPorDefecto), tramo_id: null, dow: +inp.dataset.d,
          minimo: n, objetivo: null, duracion_min: Math.round(horas * 60),
          ventana_inicio_min: vIni, ventana_fin_min: vFin, etiqueta: g("etiqueta") || "Refuerzo",
        });
      }
    }

    try { const r = await apiSend("PUT", "/api/horarios/necesidades", { local: HOR.local, necesidades });
      toast(`Guardado · ${r.guardadas} ${r.guardadas === 1 ? "línea" : "líneas"}`); } catch (err) { toast(err.message); }
    return pintar();
  }

  if (act === "guardar-disp") {
    const porW = new Map();
    ov.querySelectorAll(".horcfg-d").forEach((s) => {
      const w = s.dataset.w;
      if (!porW.has(w)) porW.set(w, []);
      porW.get(w).push({ dow: +s.dataset.d, preferencia: s.dataset.v, inicio_min: 0, fin_min: 1560 });
    });
    try {
      for (const [w, franjas] of porW) await apiSend("PUT", `/api/horarios/disponibilidad/${w}`, { franjas });
      toast("Disponibilidad guardada ✅");
    } catch (err) { toast(err.message); }
    return pintar();
  }

  if (act === "contrato") {
    const horas = await promptModal(`Horas por semana de ${b.getAttribute("data-nombre")}`, { placeholder: "30", type: "number", ok: "Siguiente" });
    if (!horas) return;
    const desde = await horCfgPedirFecha("¿Desde qué día valen esas horas?",
      "Lo anterior a esa fecha se queda como estaba: los meses ya pagados no se recalculan.");
    if (!desde) return;
    try { const r = await apiSend("POST", "/api/horarios/contrato", { worker_id: b.getAttribute("data-id"), horas_semana: Number(horas), desde });
      toast(r.mensaje || "Contrato guardado ✅"); } catch (err) { toast(err.message); }
    return pintar();
  }

  if (act === "ausencia-add") {
    const msg = ov.querySelector("#ausMsg");
    try {
      const r = await apiSend("POST", "/api/horarios/ausencia", {
        worker_id: ov.querySelector("#ausW").value, tipo: ov.querySelector("#ausTipo").value,
        desde: ov.querySelector("#ausDesde").value, hasta: ov.querySelector("#ausHasta").value,
      });
      toast(r.mensaje || "Apuntado ✅");
      return pintar();
    } catch (err) { if (msg) msg.textContent = err.message; return; }
  }

  if (act === "ausencia-del") {
    if (!await confirmModal("Se quita esta ausencia. El generador volverá a contar con esa persona esos días.", { ok: "Quitar", danger: true })) return;
    try { await apiSend("DELETE", "/api/horarios/ausencia/" + b.getAttribute("data-id")); toast("Quitada"); } catch (err) { toast(err.message); }
    return pintar();
  }
}

// ── Proponer horario ────────────────────────────────────────────────────────
// La propuesta se ENSEÑA antes de guardar nada. El encargado sabe cosas que no están en
// ninguna tabla, así que lo que sale del generador es un punto de partida, no una orden:
// aquí se ve el reparto de horas, lo que no ha cabido y por qué, y se decide.
const HOR_MOTIVO = {
  ausencia: "de vacaciones o de baja", no_disponible: "han dicho que ese día no pueden",
  solape: "ya trabajan a esa hora", descanso: "no llegan a las horas de descanso",
  jornada_larga: "se les haría una jornada demasiado larga", dias_seguidos: "llevarían demasiados días seguidos",
  excede_contrato: "se pasarían de su contrato",
};

async function horGenerar() {
  toast("Calculando…");
  let j;
  try { j = await apiSend("POST", "/api/horarios/generar", { local: HOR.local, lunes: HOR.lunes }); }
  catch (e) { return toast(e.message); }

  const cap = j.resumen.capacidad;
  const faltan = j.sinCubrir.filter((s) => s.obligatorio);
  const filaPersona = (p) => `<tr>
      <td>${esc(p.nombre)}</td>
      <td style="text-align:right">${esc(horHoras(p.minutos))}</td>
      <td style="text-align:right" class="mut">${p.contratoMin != null ? esc(horHoras(p.contratoMin)) : "—"}</td>
      <td style="text-align:right;white-space:nowrap"><b class="${p.desviacion != null && p.desviacion < -60 ? "fg-danger" : ""}">${p.desviacion == null ? "—" : esc(ficSigno(p.desviacion))}</b></td>
      <td style="text-align:right" class="mut">${p.dias}</td>
    </tr>`;

  const ov = modal("Propuesta de horario", `
    ${cap.mensaje ? `<p class="fic-nota" style="margin-top:0"><b>${esc(cap.mensaje)}</b></p>` : ""}
    <p style="margin:0 0 14px;line-height:1.55">
      <b>${j.asignaciones.length} turnos</b> para cubrir ${j.resumen.cubiertos} de ${j.resumen.huecos} huecos.
      ${faltan.length ? `Quedan <b>${faltan.length}</b> por debajo del mínimo.` : "Todos los mínimos quedan cubiertos."}
      Esto es un <b>borrador</b>: se guarda sin publicar y lo puedes cambiar entero.</p>

    ${faltan.length ? `<details class="card fold" style="margin-bottom:14px">
      <summary><h3>Lo que no ha cabido</h3><span class="foldr"><span>${faltan.length} por debajo del mínimo</span><span class="car">${ic("chev", 16)}</span></span></summary>
      <div class="rows" style="padding:0 18px 14px;max-height:230px;overflow:auto">${faltan.slice(0, 12).map((s) => `<div class="row"><div class="grow">
        <div class="t1">${esc(s.dia)} · ${esc(s.tramo || "—")} · ${esc(s.area || "—")}</div>
        <div class="t2">${esc(s.porque.map((p) => `${p.n} ${HOR_MOTIVO[p.motivo] || p.motivo}`).join(" · "))}</div>
      </div></div>`).join("")}${faltan.length > 12 ? `<div class="mut" style="padding-top:8px">…y ${faltan.length - 12} más</div>` : ""}</div></details>` : ""}

    <div class="tw" style="max-height:300px;overflow:auto"><table class="tbl">
      <thead><tr><th>Persona</th><th style="text-align:right">Propuesto</th><th style="text-align:right">Contrato</th>
      <th style="text-align:right">Dif.</th><th style="text-align:right">Días</th></tr></thead>
      <tbody>${j.resumen.personas.map(filaPersona).join("")}</tbody></table></div>

    <label style="display:flex;gap:8px;align-items:center;margin-top:14px;font-size:13px">
      <input type="checkbox" id="horGenReemplazar" checked> Sustituir lo que haya ahora en el borrador
    </label>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn" data-close>Descartar</button>
      <button class="btn primary" id="horGenOk" ${j.asignaciones.length ? "" : "disabled"}>Guardar como borrador</button>
    </div>`);

  ov.querySelector("#horGenOk")?.addEventListener("click", async () => {
    try {
      const r = await apiSend("POST", "/api/horarios/generar/aceptar", {
        local: HOR.local, lunes: HOR.lunes, asignaciones: j.asignaciones,
        reemplazar: ov.querySelector("#horGenReemplazar").checked,
      });
      ov.remove(); toast(r.mensaje || "Borrador guardado ✅"); loadHorarios();
    } catch (e) { toast(e.message); }
  });
}

const horHoras = (min) => `${Math.floor((min || 0) / 60)} h${(min || 0) % 60 ? " " + ((min || 0) % 60) + " min" : ""}`;

// Mandar el cuadrante al grupo. Manda de verdad un mensaje a mucha gente, así que la
// primera vez se pregunta a qué grupo y SIEMPRE se confirma antes de enviar.
async function horMandarAlGrupo() {
  if (!HOR.semana) return;
  let j;
  try { j = await apiRaw(`/api/horarios/grupos?local=${encodeURIComponent(HOR.local)}`); }
  catch (e) { return toast(e.message); }
  if (!j.conectado) return toast("WhatsApp no está conectado ahora mismo");

  let grupo = j.elegido;
  if (!grupo) {
    if (!j.grupos.length) return toast("No hay ningún grupo de WhatsApp disponible");
    grupo = await new Promise((resolve) => {
      const ov = modal("¿A qué grupo?", `
        <p style="margin:0 0 14px;line-height:1.55">Elige el grupo de <b>${esc(nombreCortoLocal(HOR.local))}</b>.
          Se recordará para las próximas semanas.</p>
        <select class="inp" id="horGrupoSel" style="width:100%">${j.grupos.map((g) =>
          `<option value="${esc(g.id)}">${esc(g.name || g.id)}</option>`).join("")}</select>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
          <button class="btn" data-close>Cancelar</button><button class="btn primary" id="horGrupoOk">Continuar</button></div>`);
      ov.addEventListener("click", (e) => {
        if (e.target.closest("#horGrupoOk")) { const v = ov.querySelector("#horGrupoSel").value; ov.remove(); resolve(v); }
        else if (e.target === ov || e.target.closest("[data-close]")) resolve(null);
      });
    });
    if (!grupo) return;
  }
  const nombreGrupo = (j.grupos.find((g) => g.id === grupo) || {}).name || "el grupo";
  if (!await confirmModal(`Se manda el horario de esta semana a «${nombreGrupo}», con el PDF adjunto. Lo verá todo el grupo.`, { ok: "Mandarlo" })) return;

  toast("Mandando…");
  try { const r = await apiSend("POST", `/api/horarios/semana/${HOR.semana.id}/whatsapp`, { grupo_jid: grupo }); toast(r.mensaje || "Mandado ✅"); }
  catch (e) { toast(e.message); }
}

async function horHistorico() {
  let j; try { j = await apiRaw(`/api/horarios/historico?local=${encodeURIComponent(HOR.local)}&lunes=${HOR.lunes}`); } catch { toast("No se pudo cargar"); return; }
  const pill = (e) => e === "publicado" ? '<span class="pill ok">Publicado</span>' : e === "borrador" ? '<span class="pill warn">Borrador</span>' : e === "cerrado" ? '<span class="pill">Cerrado</span>' : '<span class="pill">Sustituido</span>';
  modal("Versiones de esta semana", `<div class="card p0"><div class="rows">${(j.data || []).map((v) => `<div class="row"><div class="grow"><div class="t1">Versión ${v.version} ${v.origen ? `<span class="mut" style="font-weight:400">· ${esc(v.origen)}</span>` : ""}</div><div class="t2">${v.publicado_en ? `Publicada ${esc(String(v.publicado_en).slice(0, 16).replace("T", " "))} por ${esc(v.publicado_por || "—")}` : `Creada ${esc(String(v.creado_en).slice(0, 10))}`}${v.sustituido_en ? ` · sustituida ${esc(String(v.sustituido_en).slice(0, 16).replace("T", " "))}` : ""}</div></div>${pill(v.estado)}</div>`).join("")}</div></div>
    <div class="mut" style="font-size:12px;margin-top:10px">De cada versión publicada se guarda una copia congelada. Dentro de dos años se podrá saber exactamente qué horario estaba puesto un día concreto.</div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn primary" data-close>Cerrar</button></div>`);
}

// ── Acciones ──
function horNavega(dir) {
  HOR.lunes = dir === "hoy" ? resLunes(todayStr()) : addDaysStr(HOR.lunes, dir === "next" ? 7 : -7);
  loadHorarios();
}
async function horCrear() {
  try { await apiSend("POST", "/api/horarios/semana", { local: HOR.local, lunes: HOR.lunes }); loadHorarios(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
function horVista(v) { HOR.vista = v; document.getElementById("view").innerHTML = renderHorarios(); }

// Alta y edición de turno. El horario se rellena solo con el del tramo: lo normal es que
// coincida, y así solo se toca cuando de verdad hay que cambiarlo.
function horModal(asig, ctx) {
  const editando = !!asig;
  const tramo = (HOR.tramos || []).find((t) => String(t.id) === String(asig?.tramo_id ?? ctx?.tramo));
  const ini = asig ? asig.inicio_min : (tramo ? tramo.inicio_min : 660);
  const fin = asig ? asig.fin_min : (tramo ? tramo.fin_min : 960);
  const opt = (arr, sel, vacio) => [vacio ? `<option value="">${vacio}</option>` : ""].concat(
    arr.map((x) => `<option value="${x.id}" ${String(sel) === String(x.id) ? "selected" : ""}>${esc(x.nombre || x.username)}</option>`)).join("");
  const body = `<div class="form-grid">
    <div class="field"><label>Persona</label><select id="hmW">${opt(HOR.equipo, asig?.worker_id ?? ctx?.worker, "Elegir…")}</select></div>
    <div class="field"><label>Día</label><select id="hmD">${HOR.dias.map((d, i) => `<option value="${d}" ${String(asig?.dia ?? ctx?.dia) === d ? "selected" : ""}>${WD[i]} ${Number(d.slice(-2))}</option>`).join("")}</select></div>
    <div class="field"><label>Tramo</label><select id="hmT">${opt((HOR.tramos || []).filter((t) => !horEsDescanso(t)), asig?.tramo_id ?? ctx?.tramo, "Sin tramo")}</select></div>
    <div class="field"><label>Área</label><select id="hmA">${opt(HOR.areas, asig?.area_id ?? ctx?.area, "Sin área")}</select></div>
    <div class="field"><label>Entra</label><input id="hmI" type="time" value="${horHHMM(ini)}"></div>
    <div class="field"><label>Sale</label><input id="hmF" type="time" value="${horHHMM(fin)}" ${asig?.fin_abierto ? "disabled" : ""}></div>
    <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="hmC" ${asig?.fin_abierto ? "checked" : ""} style="width:auto"> Hasta cierre</label>
    <div class="field"><label>Tipo</label><select id="hmTipo">${["turno", "libranza", "vacaciones", "baja", "formacion"].map((t) => `<option value="${t}" ${(asig?.tipo || "turno") === t ? "selected" : ""}>${cap(t)}</option>`).join("")}</select></div>
    <div class="field full"><label>Nota (opcional)</label><input id="hmN" value="${esc(asig?.nota || "")}"></div>
  </div>
  <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px">
    <div>${editando ? `<button class="btn danger" id="hmDel">Quitar turno</button>` : ""}</div>
    <div style="display:flex;gap:8px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="hmOk">${editando ? "Guardar" : "Añadir"}</button></div>
  </div>`;
  const ov = modal(editando ? "Turno de " + horNombre(asig.worker_id) : "Nuevo turno", body);
  const cierre = ov.querySelector("#hmC");
  cierre.addEventListener("change", () => { ov.querySelector("#hmF").disabled = cierre.checked; });
  // Al cambiar de tramo, se reajustan las horas: es el caso normal.
  ov.querySelector("#hmT").addEventListener("change", (e) => {
    const t = (HOR.tramos || []).find((x) => String(x.id) === e.target.value);
    if (!t) return;
    ov.querySelector("#hmI").value = horHHMM(t.inicio_min);
    ov.querySelector("#hmF").value = horHHMM(t.fin_min);
  });
  ov.querySelector("#hmOk").addEventListener("click", async () => {
    const abierto = cierre.checked;
    const cuerpo = {
      semana_id: HOR.semana.id,
      worker_id: ov.querySelector("#hmW").value,
      dia: ov.querySelector("#hmD").value,
      tramo_id: ov.querySelector("#hmT").value || null,
      area_id: ov.querySelector("#hmA").value || null,
      inicio_min: horMin(ov.querySelector("#hmI").value),
      fin_min: abierto ? (horMin(ov.querySelector("#hmI").value) + 360) : horMin(ov.querySelector("#hmF").value),
      fin_abierto: abierto,
      tipo: ov.querySelector("#hmTipo").value,
      nota: ov.querySelector("#hmN").value.trim() || null,
    };
    if (!cuerpo.worker_id) { toast("Elige a la persona"); return; }
    try {
      if (editando) await apiSend("PATCH", "/api/horarios/asignacion/" + asig.id, cuerpo);
      else await apiSend("POST", "/api/horarios/asignacion", cuerpo);
      ov.remove(); loadHorarios();
    } catch (e) { toast("Error: " + e.message); }
  });
  const del = ov.querySelector("#hmDel");
  if (del) del.addEventListener("click", async () => {
    if (!(await confirmModal("¿Quitar este turno del cuadrante?", { ok: "Quitar", danger: true }))) return;
    try { await apiSend("DELETE", "/api/horarios/asignacion/" + asig.id); ov.remove(); loadHorarios(); }
    catch (e) { toast("Error: " + e.message); }
  });
}
const horHHMM = (m) => { const b = ((Math.round(Number(m) || 0) % 1440) + 1440) % 1440; return `${String(Math.floor(b / 60)).padStart(2, "0")}:${String(b % 60).padStart(2, "0")}`; };
const horMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? (+m[1]) * 60 + (+m[2]) : 0; };

function horEditar(id) {
  const a = (HOR.asignaciones || []).find((x) => String(x.id) === String(id));
  if (!a) return;
  if (!horEditable()) { toast("Este horario está publicado: crea una versión nueva para cambiarlo"); return; }
  horModal(a, null);
}
// Arrastrar y soltar. El HTML se repinta al soltar, así que dragend puede no llegar nunca:
// por eso se limpia también al principio de loadHorarios().
function horLimpiaDrag() {
  HOR.drag = null;
  document.querySelectorAll(".horchip.dragging").forEach((e) => e.classList.remove("dragging"));
  document.querySelectorAll(".horslot.dropok").forEach((e) => e.classList.remove("dropok"));
}
async function horSoltar(celda) {
  const id = HOR.drag; horLimpiaDrag();
  if (!id) return;
  const a = (HOR.asignaciones || []).find((x) => String(x.id) === String(id));
  if (!a) return;
  const cuerpo = { dia: celda.getAttribute("data-dia") };
  if (celda.hasAttribute("data-tramo")) { cuerpo.tramo_id = celda.getAttribute("data-tramo"); cuerpo.area_id = celda.getAttribute("data-area"); }
  if (celda.hasAttribute("data-worker")) cuerpo.worker_id = celda.getAttribute("data-worker");
  // Si no cambia nada, no molestamos al servidor.
  if (String(cuerpo.dia) === String(a.dia) && String(cuerpo.tramo_id ?? a.tramo_id) === String(a.tramo_id)
      && String(cuerpo.area_id ?? a.area_id) === String(a.area_id) && String(cuerpo.worker_id ?? a.worker_id) === String(a.worker_id)) return;
  try { await apiSend("PATCH", "/api/horarios/asignacion/" + id, cuerpo); loadHorarios(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// ════════════════════════ VISTA: FICHAJES ════════════════════════
// Fase 0: solo el esqueleto. El kiosco y el registro llegan en la fase 4.
// ════════════════════════ VISTA: FICHAJES ════════════════════════
// Dos pestañas: quién está dentro AHORA (que es la pregunta que se hace de verdad desde
// la oficina) y las tablets. El PIN se asigna desde la ficha de RR. HH. de cada persona.
let FIC = { tab: "hoy", local: "", dia: "", desde: "", hasta: "" };
// El refresco automático se guarda a nivel de módulo y se limpia SIEMPRE al entrar: si no,
// cambiar de vista dejaría el temporizador vivo pegándole a la API para siempre.
let FIC_TIMER = null;

async function loadFichajes() {
  clearInterval(FIC_TIMER); FIC_TIMER = null;
  const view = document.getElementById("view");
  const amb = localActualFE();
  if (sinPublico(amb)) { view.innerHTML = avisoSinPublico("Fichajes", "Personas", "fichajes"); return; }
  FIC.local = amb;

  view.innerHTML = `<div class="ph"><div class="eyebrow">Personas</div><h1>Fichajes</h1><div class="sub">Registro de jornada${amb ? ` · <b>${esc(nombreCortoLocal(amb))}</b>` : ""}</div></div>
    <div class="toolbar" style="margin-bottom:12px" id="ficTabs">
      <button class="btn ${FIC.tab === "hoy" ? "primary" : ""}" data-fictab="hoy">Quién está dentro</button>
      <button class="btn ${FIC.tab === "rev" ? "primary" : ""}" data-fictab="rev">Revisión</button>
      <button class="btn ${FIC.tab === "bolsa" ? "primary" : ""}" data-fictab="bolsa">Bolsa de horas</button>
      <button class="btn ${FIC.tab === "disp" ? "primary" : ""}" data-fictab="disp">Tablets</button>
    </div>
    <div id="ficCuerpo"><p class="mut">Cargando…</p></div>`;

  view.querySelector("#ficTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fictab]"); if (!b) return;
    FIC.tab = b.getAttribute("data-fictab");
    loadFichajes();
  });

  if (FIC.tab === "disp") return ficPintarDispositivos();
  if (FIC.tab === "rev") return ficPintarRevision();
  if (FIC.tab === "bolsa") return ficPintarBolsa();
  await ficPintarHoy();
  // Un minuto: lo bastante para que sirva de tablero y lo bastante poco para no molestar.
  FIC_TIMER = setInterval(() => {
    // Guarda: si el usuario ya se ha ido a otra vista, el temporizador no debe repintar nada.
    if (CURRENT !== "fichajes" || FIC.tab !== "hoy") { clearInterval(FIC_TIMER); FIC_TIMER = null; return; }
    ficPintarHoy();
  }, 60000);
}

const FIC_ESTADO_TXT = { dentro: "Dentro", pausa: "En pausa", fuera: "Fuera" };
const FIC_EV_TXT = { entrada: "Entrada", salida: "Salida", pausa_inicio: "Pausa", pausa_fin: "Vuelta" };
function ficHoras(min) {
  const h = Math.floor((min || 0) / 60), m = (min || 0) % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

async function ficPintarHoy() {
  const cont = document.getElementById("ficCuerpo");
  if (!cont) return;
  let j;
  try {
    const qs = new URLSearchParams({ local: FIC.local });
    if (FIC.dia) qs.set("dia", FIC.dia);
    j = await apiRaw("/api/fichajes/hoy?" + qs.toString());
  } catch { cont.innerHTML = `<div class="card"><p class="mut" style="margin:0">No se pudo cargar el registro.</p></div>`; return; }

  // Si la respuesta llega sin `personas` —un despliegue a medias, un error del TPV— antes
  // reventaba aquí y la pantalla se quedaba EN BLANCO, sin decir nada. Una pantalla vacía sin
  // explicación es peor que un error: nadie sabe si es que no hay nadie fichando o que falla.
  const personas = Array.isArray(j.personas) ? j.personas : [];
  if (!Array.isArray(j.personas)) {
    cont.innerHTML = `<div class="card"><p class="mut" style="margin:0">El registro ha llegado incompleto. Vuelve a cargar la página; si sigue igual, avisa.</p></div>`;
    return;
  }
  const dentro = personas.filter((p) => p.estado !== "fuera");
  const resto = personas.filter((p) => p.estado === "fuera");

  const fila = (p) => `<tr>
      <td><span class="fic-dot ${esc(p.estado)}"></span> <b>${esc(p.nombre)}</b></td>
      <td>${esc(FIC_ESTADO_TXT[p.estado] || p.estado)}</td>
      <td class="mut">${p.eventos.filter((e) => !e.anulado).map((e) => `${esc(FIC_EV_TXT[e.tipo] || e.tipo)} ${esc(e.hora)}`).join(" · ") || "—"}</td>
      <td style="text-align:right">${p.jornada.minPresencia ? esc(ficHoras(p.jornada.minEfectivo)) + (p.jornada.enCurso ? ' <span class="mut" style="font-size:11px">en curso</span>' : "") : "—"}</td>
      <td>${p.faltaSalida ? '<span class="fic-tag aviso">sin fichar la salida</span>' : ""}${p.jornada.sinEntrada ? '<span class="fic-tag aviso">sin fichar la entrada</span>' : ""}</td>
    </tr>`;

  cont.innerHTML = `
    <div class="card">
      <div class="ch"><h3>${j.dia === new Date().toISOString().slice(0, 10) ? "Hoy" : esc(j.dia)} · ${dentro.length} ${dentro.length === 1 ? "persona dentro" : "personas dentro"}</h3>
        <span class="mut">Actualizado a las ${esc(j.hora)}</span></div>
      ${j.personas.length ? `<div class="tw"><table class="tbl">
        <thead><tr><th>Persona</th><th>Estado</th><th>Fichajes del día</th><th style="text-align:right">Trabajado</th><th></th></tr></thead>
        <tbody>${dentro.map(fila).join("")}${resto.map(fila).join("")}</tbody></table></div>`
      : `<p class="mut" style="margin:0;line-height:1.6">Nadie ha fichado todavía en este día de trabajo. Si el kiosco aún no está montado, ve a <b>Tablets</b> y da de alta el dispositivo.</p>`}
    </div>`;
}

// ── Revisión: lo que no cuadra entre el cuadrante y el reloj ─────────────────
// Es la pantalla de trabajo de verdad del módulo. Deliberadamente NO ofrece "aplicar el
// horario planificado": copiar el plan sobre el fichaje destruye la prueba que la ley
// obliga a conservar. Lo que se ofrece es escribir la hora real, con motivo y con nombre.
// Con signo SIEMPRE: sin el menos, «6 h 00 min» de desviación se lee como que trabajó seis
// horas de más cuando es justo al revés — no las trabajó.
function ficSigno(min) {
  const n = Math.round(Number(min) || 0);
  if (n === 0) return "0";
  return (n > 0 ? "+" : "−") + ficHoras(Math.abs(n));
}

async function ficPintarRevision() {
  const cont = document.getElementById("ficCuerpo");
  if (!cont) return;
  cont.innerHTML = `<p class="mut">Recalculando las jornadas…</p>`;
  let j;
  try {
    const qs = new URLSearchParams({ local: FIC.local });
    if (FIC.desde) qs.set("desde", FIC.desde);
    if (FIC.hasta) qs.set("hasta", FIC.hasta);
    j = await apiRaw("/api/fichajes/revision?" + qs.toString());
  } catch { cont.innerHTML = `<div class="card"><p class="mut" style="margin:0">No se pudo cargar la revisión.</p></div>`; return; }

  const urge = j.data.filter((f) => f.requiereRevision || f.validacionCaducada);
  const resto = j.data.filter((f) => !f.requiereRevision && !f.validacionCaducada);
  const fila = (f) => `<tr data-ficjor="${f.worker_id}|${esc(f.dia)}" style="cursor:pointer">
      <td class="mut">${esc(f.dia)}</td>
      <td><b>${esc(f.nombre)}</b></td>
      <td>${f.incidencias.map((i) => `<span class="fic-tag ${i.nivel === "revisar" ? "aviso" : ""}">${esc(i.texto)}${i.minutos ? " · " + esc(ficHoras(i.minutos)) : ""}</span>`).join("")}
        ${f.validacionCaducada ? '<span class="fic-tag aviso">validación caducada</span>' : ""}</td>
      <td style="text-align:right" class="mut">${esc(ficHoras(f.minPlanificado))}</td>
      <td style="text-align:right">${esc(ficHoras(f.minEfectivo))}</td>
      <td style="text-align:right"><b>${esc(ficSigno(f.minDesviacion))}</b></td>
      <td style="text-align:right">${f.validado != null ? `<span class="fic-tag ok">${esc(ficHoras(f.validado))}</span>` : '<span class="mut">—</span>'}</td>
    </tr>`;
  const tabla = (filas) => `<div class="tw"><table class="tbl">
      <thead><tr><th>Día</th><th>Persona</th><th>Qué pasa</th><th style="text-align:right">Cuadrante</th>
      <th style="text-align:right">Fichado</th><th style="text-align:right">Dif.</th><th style="text-align:right">Validado</th></tr></thead>
      <tbody>${filas.map(fila).join("")}</tbody></table></div>`;

  cont.innerHTML = `
    <div class="card">
      <div class="ch"><h3>Del ${esc(j.desde)} al ${esc(j.hasta)}</h3>
        <span class="mut">${urge.length ? `${urge.length} ${urge.length === 1 ? "jornada pide" : "jornadas piden"} una decisión` : "Nada pendiente de decidir"}</span></div>
      ${j.data.length ? `${urge.length ? tabla(urge) : ""}${resto.length ? `<div class="mut" style="margin:14px 0 6px;font-size:12px">Desviaciones dentro de lo normal</div>${tabla(resto)}` : ""}`
      : `<p class="mut" style="margin:0;line-height:1.6">Todo cuadra en estos días: lo fichado coincide con el cuadrante publicado dentro de la tolerancia.</p>`}
    </div>`;

  cont.firstElementChild.addEventListener("click", (e) => {
    const tr = e.target.closest("[data-ficjor]"); if (!tr) return;
    const [w, dia] = tr.getAttribute("data-ficjor").split("|");
    ficAbrirJornada(Number(w), dia);
  });
}

const FIC_EV_ORIGEN = { kiosco: "tablet", kiosco_offline: "tablet (sin conexión)", manual: "a mano", importado: "importado" };

async function ficAbrirJornada(workerId, dia) {
  const ov = modal("Jornada", '<p class="mut" id="ficJorBody">Cargando…</p>');
  const pintar = async () => {
    let j;
    try { j = await apiRaw(`/api/fichajes/jornada?local=${encodeURIComponent(FIC.local)}&worker=${workerId}&dia=${dia}`); }
    catch (e) { ov.querySelector("#ficJorBody").textContent = e.message; return; }

    const planTxt = j.plan.length
      ? j.plan.map((p) => `${esc(ficReloj(p.inicio))}–${esc(ficReloj(p.fin))}${p.abierto ? " (cierre)" : ""}`).join(" · ")
      : "<span class='mut'>Sin turno en el cuadrante publicado</span>";
    const evs = j.eventos.length ? `<ul class="fic-evs">${j.eventos.map((e) => `<li class="${e.anulado ? "anulado" : ""}">
        <span><b>${esc(FIC_EV_TXT[e.tipo] || e.tipo)}</b> ${esc(e.hora)}
          <span class="mut">· ${esc(FIC_EV_ORIGEN[e.origen] || e.origen)}${e.autor ? " por " + esc(e.autor) : ""}</span>
          ${e.motivo ? `<div class="mut" style="font-size:11.5px">${esc(e.motivo)}</div>` : ""}</span>
        ${e.anulado ? '<span class="fic-tag">anulado</span>' : `<button class="btn sm" data-ficanul="${e.id}">Anular</button>`}
      </li>`).join("")}</ul>` : `<p class="mut" style="margin:0">Ningún fichaje registrado este día.</p>`;

    ov.querySelector(".modal-b").innerHTML = `
      <div id="ficJorBody">
        <div class="ch" style="margin-top:0"><h3 style="margin:0">${esc(j.trabajador.nombre)} · ${esc(dia)}</h3></div>
        <div class="grid g3" style="gap:12px;margin-bottom:14px">
          <div><div class="t2">Cuadrante</div><div class="t1">${planTxt}</div></div>
          <div><div class="t2">Fichado (sin pausas)</div><div class="t1">${esc(ficHoras(j.minEfectivo))}</div></div>
          <div><div class="t2">Diferencia</div><div class="t1">${esc(ficSigno(j.minDesviacion))}</div></div>
        </div>
        ${j.incidencias.length ? `<div style="margin-bottom:14px">${j.incidencias.map((i) => `<span class="fic-tag ${i.nivel === "revisar" ? "aviso" : ""}">${esc(i.texto)}${i.minutos ? " · " + esc(ficHoras(i.minutos)) : ""}</span>`).join("")}</div>` : ""}
        ${j.validacion ? `<p class="mut" style="margin:0 0 14px">Validado ${esc(ficHoras(j.validacion.minutos))} por ${esc(j.validacion.por)} el ${esc(String(j.validacion.en).slice(0, 10))}${j.validacion.caducada ? " — <b>pero el registro ha cambiado desde entonces</b>" : ""}${j.validacion.nota ? `<br>«${esc(j.validacion.nota)}»` : ""}</p>` : ""}
        ${evs}
        <div class="ch" style="margin-top:18px"><h3 style="margin:0;font-size:13px">Añadir un fichaje que falta</h3></div>
        <p class="mut" style="margin:0 0 10px;line-height:1.5">Escribe la hora <b>real</b>, no la del cuadrante. Para la madrugada usa 26:10 en lugar de 02:10.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select class="inp" id="ficNvTipo" style="width:auto">
            <option value="entrada">Entrada</option><option value="salida">Salida</option>
            <option value="pausa_inicio">Pausa</option><option value="pausa_fin">Vuelta</option>
          </select>
          <input class="inp" id="ficNvHora" placeholder="20:00" style="width:90px">
          <input class="inp" id="ficNvMotivo" placeholder="Motivo (obligatorio)" style="flex:1;min-width:180px">
          <button class="btn" id="ficNvOk">Añadir</button>
        </div>
        <p id="ficNvMsg" style="margin:8px 0 0;min-height:16px;color:var(--danger);font-weight:550"></p>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
          <button class="btn" data-close>Cerrar</button>
          <button class="btn primary" id="ficValidar">Validar ${esc(ficHoras(j.minEfectivo))}</button>
        </div>
      </div>`;

    ov.querySelector("#ficNvOk").addEventListener("click", async () => {
      const msg = ov.querySelector("#ficNvMsg");
      try {
        await apiSend("POST", "/api/fichajes/evento", {
          worker_id: workerId, dia, tipo: ov.querySelector("#ficNvTipo").value,
          hora: ov.querySelector("#ficNvHora").value.trim(), motivo: ov.querySelector("#ficNvMotivo").value.trim(),
        });
        toast("Fichaje añadido ✅"); pintar();
      } catch (e) { msg.textContent = e.message; }
    });
    ov.querySelector("#ficValidar").addEventListener("click", async () => {
      try {
        const r = await apiSend("POST", "/api/fichajes/validar", { worker_id: workerId, dia, aceptar_incidencias: !!j.requiereRevision });
        ov.remove(); toast(r.mensaje || "Jornada validada ✅"); ficPintarRevision();
      } catch (e) { ov.querySelector("#ficNvMsg").textContent = e.message; }
    });
    ov.querySelector("#ficJorBody").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-ficanul]"); if (!b) return;
      const motivo = await promptModal("¿Por qué se anula este fichaje?", { placeholder: "Se fichó por error en la tablet equivocada", ok: "Anular" });
      if (!motivo) return;
      try { await apiSend("POST", `/api/fichajes/evento/${b.getAttribute("data-ficanul")}/anular`, { motivo }); toast("Fichaje anulado"); pintar(); }
      catch (err) { toast(err.message); }
    });
  };
  await pintar();
}
// El minuto local pasa de 1440 en la madrugada; en pantalla se enseña el reloj de pared.
function ficReloj(min) {
  const b = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(b / 60)).padStart(2, "0")}:${String(b % 60).padStart(2, "0")}`;
}

// ── Bolsa de horas ──────────────────────────────────────────────────────────
// Un libro, no un contador: cada minuto del saldo se puede señalar. Por eso la fila de
// cada persona se abre y enseña de dónde sale, incluidos los contra-asientos.
const FIC_CONCEPTO = { jornada: "Jornada", ajuste: "Ajuste manual", contra: "Anulación del anterior", liquidacion: "Pagado o disfrutado", arrastre: "Viene del periodo anterior" };

async function ficPintarBolsa() {
  const cont = document.getElementById("ficCuerpo");
  if (!cont) return;
  let j;
  try { j = await apiRaw(`/api/fichajes/bolsa?local=${encodeURIComponent(FIC.local)}${FIC.dia ? "&dia=" + FIC.dia : ""}`); }
  catch { cont.innerHTML = `<div class="card"><p class="mut" style="margin:0">No se pudo cargar la bolsa.</p></div>`; return; }

  const conSaldo = j.personas.filter((p) => p.saldo !== 0 || p.movimientos);
  const puedeCerrar = USER.rol === "direccion" || USER.rol === "rrhh";
  cont.innerHTML = `
    <div class="card">
      <div class="ch"><h3>Periodo ${esc(j.periodo.etiqueta)} · del ${esc(j.periodo.desde)} al ${esc(j.periodo.hasta)}</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn sm" id="ficExport" data-dia="${esc(j.periodo.hasta)}">Descargar registro</button>
          ${j.cerrado ? '<span class="fic-tag">periodo cerrado</span>'
            : puedeCerrar ? `<button class="btn sm primary" id="ficCerrar">Cerrar periodo</button>` : ""}
        </div></div>
      ${j.sinValidar ? `<p class="fic-nota">Quedan <b>${j.sinValidar}</b> ${j.sinValidar === 1 ? "jornada" : "jornadas"} sin validar en este periodo. Sus horas todavía <b>no están</b> en ningún saldo: valídalas en «Revisión».</p>` : ""}
      ${j.cerrado && j.cierre ? `<p class="fic-nota">Cerrado el ${esc(String(j.cierre.cerrado_en).slice(0, 10))} por ${esc(j.cierre.cerrado_por)}. Para corregir algo de estas fechas hay que reabrirlo, y queda constancia.</p>` : ""}
      ${conSaldo.length ? `<div class="tw"><table class="tbl">
        <thead><tr><th>Persona</th><th style="text-align:right">Venía de antes</th><th style="text-align:right">Este periodo</th>
        <th style="text-align:right">Saldo</th><th></th></tr></thead>
        <tbody>${conSaldo.map((p) => `<tr>
          <td><b>${esc(p.nombre)}</b></td>
          <td style="text-align:right" class="mut">${esc(ficSigno(p.arrastre))}</td>
          <td style="text-align:right">${esc(ficSigno(p.periodo))}</td>
          <td style="text-align:right"><b>${esc(ficSigno(p.saldo))}</b></td>
          <td style="text-align:right"><button class="btn sm" data-ficlibro="${p.id}">Ver el libro</button></td>
        </tr>`).join("")}</tbody></table></div>`
      : `<p class="mut" style="margin:0;line-height:1.6">Nadie tiene horas a favor ni en contra en este periodo. Aparecerán aquí a medida que se validen jornadas que se desvíen del cuadrante.</p>`}
    </div>`;

  const card = cont.firstElementChild;
  card.addEventListener("click", async (e) => {
    const libro = e.target.closest("[data-ficlibro]");
    if (libro) return ficAbrirLibro(Number(libro.getAttribute("data-ficlibro")));
    if (e.target.closest("#ficCerrar")) return ficCerrarPeriodo(j.periodo);
    const exp = e.target.closest("#ficExport");
    if (exp) return ficDescargarRegistro(exp.getAttribute("data-dia"));
  });
}

// El export va por fetch con el token, no por un <a href>: un enlace directo no lleva la
// cabecera de sesión y devolvería un 401 en forma de fichero.
async function ficDescargarRegistro(dia) {
  try {
    const r = await fetch(`/api/fichajes/export?local=${encodeURIComponent(FIC.local)}&dia=${encodeURIComponent(dia)}`,
      { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) { toast("No se pudo generar el registro"); return; }
    const nombre = (r.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "registro-jornada.csv";
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a"); a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Registro descargado ✅");
  } catch { toast("No se pudo generar el registro"); }
}

async function ficAbrirLibro(workerId) {
  let j;
  try { j = await apiRaw("/api/fichajes/bolsa/" + workerId); } catch (e) { toast(e.message); return; }
  const puedeAjustar = USER.rol === "direccion" || USER.rol === "rrhh";
  const ov = modal(`Libro de horas · ${j.trabajador.nombre}`, `
    <p style="margin:0 0 14px"><b style="font-size:20px">${esc(ficSigno(j.saldo))}</b>
      <span class="mut">de saldo, que es la suma exacta de lo de abajo</span></p>
    ${j.data.length ? `<div class="tw" style="max-height:340px;overflow:auto"><table class="tbl">
      <thead><tr><th>Día</th><th>Concepto</th><th style="text-align:right">Minutos</th><th>Quién</th></tr></thead>
      <tbody>${j.data.map((m) => `<tr>
        <td class="mut" style="white-space:nowrap">${esc(m.dia || m.periodo)}</td>
        <td>${esc(FIC_CONCEPTO[m.concepto] || m.concepto)}${m.nota ? `<div class="mut" style="font-size:11.5px">${esc(m.nota)}</div>` : ""}</td>
        <td style="text-align:right;white-space:nowrap"><b>${esc(ficSigno(m.minutos))}</b></td>
        <td class="mut">${esc(m.autor)}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="mut" style="margin:0">Todavía no hay ningún movimiento.</p>'}
    ${puedeAjustar ? `
      <div class="ch" style="margin-top:18px"><h3 style="margin:0;font-size:13px">Ajuste manual</h3></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input class="inp" id="ficAjMin" placeholder="minutos (−60 para restar)" style="width:190px">
        <input class="inp" id="ficAjNota" placeholder="Motivo (obligatorio)" style="flex:1;min-width:180px">
        <button class="btn" id="ficAjOk">Anotar</button>
      </div>
      <p id="ficAjMsg" style="margin:8px 0 0;min-height:16px;color:var(--danger);font-weight:550"></p>` : ""}
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button class="btn" data-close>Cerrar</button></div>`);

  if (!puedeAjustar) return;
  ov.querySelector("#ficAjOk").addEventListener("click", async () => {
    try {
      const r = await apiSend("POST", "/api/fichajes/bolsa/ajuste", {
        worker_id: workerId, minutos: Number(ov.querySelector("#ficAjMin").value),
        nota: ov.querySelector("#ficAjNota").value.trim(),
      });
      ov.remove(); toast(r.mensaje || "Ajuste anotado ✅"); ficPintarBolsa();
    } catch (e) { ov.querySelector("#ficAjMsg").textContent = e.message; }
  });
}

async function ficCerrarPeriodo(periodo) {
  const ok = await confirmModal(
    `Se cierra ${periodo.etiqueta} (del ${periodo.desde} al ${periodo.hasta}). A partir de ahí no se podrán corregir fichajes de esas fechas sin reabrirlo, y reabrirlo deja constancia.`,
    { ok: "Cerrar el periodo" });
  if (!ok) return;
  try {
    const r = await apiSend("POST", "/api/fichajes/cerrar", { local: FIC.local, dia: periodo.hasta });
    toast(r.mensaje || "Periodo cerrado ✅"); ficPintarBolsa();
  } catch (e) {
    // El 409 con jornadas sin validar no es un error: es la pregunta de si se fuerza.
    if (!/sin validar/i.test(e.message)) return toast(e.message);
    const forzar = await confirmModal(
      `${e.message}. Cerrar ahora deja esas horas fuera del saldo hasta que se reabra el periodo. ¿Cerrar igualmente?`,
      { ok: "Cerrar igualmente", danger: true });
    if (!forzar) return;
    try { const r = await apiSend("POST", "/api/fichajes/cerrar", { local: FIC.local, dia: periodo.hasta, forzar: true }); toast(r.mensaje); ficPintarBolsa(); }
    catch (err) { toast(err.message); }
  }
}

async function ficPintarDispositivos() {
  const cont = document.getElementById("ficCuerpo");
  if (!cont) return;
  let j;
  try { j = await apiRaw("/api/fichajes/dispositivos?local=" + encodeURIComponent(FIC.local)); }
  catch { cont.innerHTML = `<div class="card"><p class="mut" style="margin:0">No se pudieron cargar los dispositivos.</p></div>`; return; }

  cont.innerHTML = `
    <div class="card">
      <div class="ch"><h3>Tablets de ${esc(nombreCortoLocal(FIC.local))}</h3>
        <button class="btn primary" id="ficNueva">Dar de alta una tablet</button></div>
      ${j.data.length ? `<div class="tw"><table class="tbl">
        <thead><tr><th>Nombre</th><th>Último uso</th><th>Estado</th><th></th></tr></thead>
        <tbody>${j.data.map((d) => `<tr>
          <td><b>${esc(d.nombre)}</b></td>
          <td class="mut">${d.ultimo_visto ? esc(String(d.ultimo_visto).slice(0, 16).replace("T", " ")) : "nunca"}</td>
          <td>${d.revocado_en ? '<span class="fic-tag">revocada</span>' : '<span class="fic-tag ok">activa</span>'}</td>
          <td style="text-align:right">
            <button class="btn sm" data-ficreg="${d.id}">${d.revocado_en ? "Reactivar" : "Nuevo enlace"}</button>
            ${d.revocado_en ? "" : `<button class="btn sm danger" data-ficrev="${d.id}">Revocar</button>`}
          </td></tr>`).join("")}</tbody></table></div>`
      : `<p class="mut" style="margin:0;line-height:1.6">Ninguna tablet dada de alta. Al crearla saldrá un enlace y un QR: se abre una vez en la tablet, se guarda en favoritos y ya se queda.</p>`}
    </div>`;

  cont.querySelector("#ficNueva").addEventListener("click", async () => {
    const nombre = await promptModal("¿Cómo se llama esta tablet?", { placeholder: "Tablet de la barra", ok: "Dar de alta" });
    if (!nombre) return;
    try { const r = await apiSend("POST", "/api/fichajes/dispositivos", { local: FIC.local, nombre }); ficMostrarEnlace(r); }
    catch (e) { toast(e.message || "No se pudo dar de alta"); }
  });
  // Se engancha a la tarjeta, que se crea de cero en cada repintado, y NO a #ficCuerpo, que
  // es el mismo nodo siempre: si no, cada repintado añadiría otro escuchador y acabaría
  // saliendo el mismo diálogo dos y tres veces.
  cont.firstElementChild.addEventListener("click", async (e) => {
    const reg = e.target.closest("[data-ficreg]"), rev = e.target.closest("[data-ficrev]");
    if (reg) {
      if (!await confirmModal("Se generará un enlace nuevo y el anterior dejará de funcionar al momento. La tablet tendrá que abrir el nuevo.", { ok: "Generar" })) return;
      try { ficMostrarEnlace(await apiSend("POST", `/api/fichajes/dispositivos/${reg.getAttribute("data-ficreg")}/regenerar`, {})); }
      catch { toast("No se pudo regenerar"); }
    } else if (rev) {
      if (!await confirmModal("La tablet dejará de poder fichar. Los fichajes que ya se hicieron en ella no se tocan.", { ok: "Revocar", danger: true })) return;
      try { await apiSend("POST", `/api/fichajes/dispositivos/${rev.getAttribute("data-ficrev")}/revocar`, {}); toast("Tablet revocada"); ficPintarDispositivos(); }
      catch { toast("No se pudo revocar"); }
    }
  });
}

// El enlace se enseña UNA vez: en la base solo queda su hash. Se dice con todas las letras.
function ficMostrarEnlace(r) {
  modal("Enlace de la tablet", `
    <p style="margin:0 0 14px;line-height:1.55">Abre este enlace <b>en la tablet</b> y guárdalo en favoritos o como acceso directo en el escritorio.</p>
    ${r.qr ? `<div style="text-align:center;margin-bottom:14px"><img src="${esc(r.qr)}" alt="Código QR del enlace" style="width:220px;height:220px;border-radius:8px"></div>` : ""}
    <input class="inp" id="ficUrl" readonly value="${esc(r.url)}" style="width:100%;font-family:ui-monospace,monospace;font-size:12px">
    <p class="mut" style="margin:12px 0 0;line-height:1.5"><b>Guárdalo ahora:</b> por seguridad no se vuelve a mostrar. Si se pierde, se genera otro desde esta misma pantalla.</p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn" data-close>Cerrar</button>
      <button class="btn primary" id="ficCopiar">Copiar enlace</button>
    </div>`);
  document.getElementById("ficCopiar").addEventListener("click", () => {
    const i = document.getElementById("ficUrl");
    i.select(); navigator.clipboard?.writeText(i.value).then(() => toast("Enlace copiado"), () => toast("Cópialo a mano"));
  });
  ficPintarDispositivos();
}

// ════════════════════════ VISTA: FACTURAS ════════════════════════
let FACF = { local: "", empresa: "", estado: "", tipo: "", q: "", from: "", to: "" };
let FAC_LIST = [];
let FAC_PEND = [];
let FACTAB = "facturas";
let FCFG = { locales: [], reglas: [], grupos: [], empresas: [], groups: [], integ: null };
let FAC303 = { empresa: "", trimestre: "", data: null, error: "" };
// OJO al tocar esto: aquí va TODO lo que el panel de filtros deja elegir. Si una clave se
// queda fuera, el chip aparece en pantalla y la lista vuelve sin filtrar — o sea, el filtro
// miente. Le pasó a `proveedor`. Hay un test que compara esta lista con FAC_FILTROS.
const FAC_FILTROS = ["local", "empresa", "proveedor", "estado", "tipo", "q", "from", "to"];
function facQS(localForzado) {
  const qs = new URLSearchParams();
  FAC_FILTROS.forEach((k) => { if (FACF[k]) qs.set(k, FACF[k]); });
  // Al ver varios locales juntos, cada petición lleva el suyo (ver pidePorLocales).
  if (localForzado !== undefined) { if (localForzado) qs.set("local", localForzado); else qs.delete("local"); }
  return qs.toString();
}
// El ámbito de local lo manda el selector de establecimiento de la barra superior (no hay filtro
// «Local» duplicado dentro de la vista). Para el encargado, su local fijado gana siempre.
function facScope() { FACF.local = localActualFE(); return FACF.local; }
function facHeader() {
  const amb = facScope();
  // Con varios establecimientos, `facScope()` devuelve "" (las consultas van una por local),
  // así que el rótulo lo dice aparte: una pantalla que suma dos locales sin decirlo se lee
  // como si fuera la de uno.
  const donde = amb ? nombreCortoLocal(amb) : viendoVarios() ? etiquetaAmbito() : "";
  const pestanas = [["facturas", "Facturas"], ["pagos", "Pagos"], ["conciliar", "Conciliaciones"], ["config", "Configuración"]]
    .map(([v, t]) => `<button class="btn ${FACTAB === v ? "primary" : ""}" data-act="fac-tab" data-tab="${v}">${t}</button>`).join("");
  // En la pestaña de Facturas, la misma fila lleva las pestañas, el buscador y las acciones.
  const acciones = FACTAB !== "facturas" ? "" : `
    <div class="field" style="flex:1 1 200px;min-width:150px"><input id="facQ" placeholder="Buscar proveedor, concepto, nº…" value="${esc(FACF.q)}"></div>
    <button class="btn" data-act="fac-filtros">${ic("filtro", 15)} Filtrar${facFiltrosActivos().length ? '<span class="fdot"></span>' : ""}</button>
    <button class="btn primary" data-act="fac-subir">+ Subir</button>
    <button class="btn" data-act="fac-export">CSV</button>`;
  return `<div class="ph"><div class="eyebrow">Contabilidad</div><h1>Compras</h1><div class="sub">Facturas y albaranes${donde ? ` · <b>${esc(donde)}</b>` : ""}</div></div><div class="toolbar tabstrip" style="margin-bottom:12px">${pestanas}${acciones}</div>`;
}

// La cabecera de Productos. Es su propia pantalla, no una pestaña de Compras: sale de los
// mismos papeles pero contesta otra pregunta —qué entra y a cómo nos lo cobran—.
function productosHeader() {
  const amb = facScope();
  const donde = amb ? nombreCortoLocal(amb) : viendoVarios() ? etiquetaAmbito() : "";
  // El periodo, ESCRITO. Con el filtro puesto en julio y la lista igual que antes, no se puede
  // saber si es que el filtro no ha entrado o es que en julio se compró eso mismo. Dicho aquí,
  // se distingue de un vistazo — y si pone «desde siempre», el filtro no está puesto.
  const cuando = (COMP.from || COMP.to)
    ? `${COMP.from ? fechaCorta(COMP.from) : "el principio"} → ${COMP.to ? fechaCorta(COMP.to) : "hoy"}`
    : "desde siempre";
  return `<div class="ph"><div class="eyebrow">Contabilidad</div><h1>Productos</h1><div class="sub">Qué compramos y a cómo nos lo cobran${donde ? ` · <b>${esc(donde)}</b>` : ""} · <b>${esc(cuando)}</b></div></div>`;
}
const eur = (n) => num(Math.round(Number(n) || 0)) + " €";
// Con céntimos. Para precios unitarios, donde redondear a euros enteros se carga justo el
// dato: un aceite que pasa de 9,50 a 9,90 se vería como «10 €» las dos veces.
const eur2 = (n) => (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }) + " €";
function renderFacturas(list, pend, stats, empresas) {
  facScope();
  const empOpts =['<option value="">Todas las empresas</option>'].concat((empresas || []).map((e) => `<option value="${esc(e)}" ${FACF.empresa === e ? "selected" : ""}>${esc(e)}</option>`)).join("");
  const tipoOpts = ['<option value="">Todos los tipos</option>'].concat(["factura", "albaran", "ticket", "otro"].map((t) => `<option value="${t}" ${FACF.tipo === t ? "selected" : ""}>${cap(t)}</option>`)).join("");
  const estOpts = [["", "Todos los estados"], ["pagada", "Pagadas"], ["pendiente", "Pendientes"]].map(([v, l]) => `<option value="${v}" ${FACF.estado === v ? "selected" : ""}>${l}</option>`).join("");
  // Las cifras salen de `totales`, que el servidor calcula con el MISMO filtro: así cambian
  // al filtrar, que es lo que se espera al poner un filtro.
  const resumen = facKpisHtml();
  // Barra simple: buscar (en vivo, como estaba) y un botón que abre el panel con todo lo
  // demás. Antes había seis campos siempre a la vista para algo que se toca de vez en
  // cuando, y se comían la pantalla por encima de la tabla, que es lo que se viene a ver.
  // Buscar y los botones van EN LA MISMA FILA que las pestañas. Antes era una fila entera para
  // un campo de texto: sesenta píxeles que empujaban las facturas fuera de la pantalla en un
  // portátil, y lo que se viene a ver aquí es la tabla.
  const toolbar = facChipsHtml();
  const maxLocal = Math.max(1, ...(((stats && stats.porLocal) || []).map((x) => Number(x.total) || 0)));
  // Con un establecimiento elegido el desglose por local sobra: sería una sola barra al 100%.
  const porLocal = (!FACF.local && stats && stats.porLocal && stats.porLocal.length) ? `<div class="card"><div class="ch"><h3>Gasto por local (año)</h3></div><div class="rows" style="gap:9px;padding:2px 0">${stats.porLocal.map((x) => `<div><div style="display:flex;justify-content:space-between;font-size:12.5px"><span>${esc(x.local || "—")}</span><b class="tnum">${eur(x.total)}</b></div><div style="height:7px;background:var(--surface2);border-radius:4px;overflow:hidden;margin-top:3px"><div style="height:100%;width:${Math.round((Number(x.total) || 0) / maxLocal * 100)}%;background:var(--brand)"></div></div></div>`).join("")}</div></div>` : "";
  // Plegable y cerrada por defecto: es una lista larga que casi nunca se consulta,
  // y estorbaba entre los filtros y la tabla de facturas.
  const nProv = (stats && stats.topProveedores && stats.topProveedores.length) || 0;
  const totalProv = nProv ? stats.topProveedores.reduce((s, p) => s + (Number(p.total) || 0), 0) : 0;
  const topProv = nProv ? `<details class="card fold"><summary><h3>Top proveedores (año)</h3><span class="foldr"><span>${num(nProv)} · ${eur(totalProv)}</span><span class="car">${ic("chev", 16)}</span></span></summary><div class="rows">${stats.topProveedores.map((p) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(p.proveedor || "—")}</div><div class="t2">${num(p.num)} factura(s)</div></div><b class="tnum">${eur(p.total)}</b></div>`).join("")}</div></details>` : "";
  const vizGrid = (porLocal && topProv) ? `<div class="grid g2" style="margin-bottom:16px">${porLocal}${topProv}</div>`
    : (porLocal || topProv) ? `<div style="margin-bottom:16px">${porLocal}${topProv}</div>` : "";
  const pendRow = (p) => {
    const sug = p.sugerido || {};
    const badge = sug.local ? `<span class="pill ${sug.confianza === "alta" ? "ok" : ""}" title="${esc(sug.motivo)}" style="font-size:10.5px">Sugerido: ${esc(nombreCortoLocal(sug.local))}</span>` : "";
    // La fusión solo la puede ejecutar dirección (igual que asignar): a los demás no se les enseña.
    const puedeFusionar = USER.rol === "direccion";
    return `<div class="row">${puedeFusionar ? `<input type="checkbox" class="pendFusChk" data-id="${p.id}" style="width:auto;flex:none" title="Marcar para fusionar">` : ""}<div class="grow" style="min-width:0"><div class="t1">${esc(p.proveedor || "(sin proveedor)")} ${badge}</div><div class="t2">${esc((p.fecha || "").slice(0, 10))} · ${eur(p.total)}</div></div><button class="btn primary" data-act="fac-revisar" data-id="${p.id}">Revisar</button></div>`;
  };
  // Plegado, como el resto de bloques de aviso: son documentos que llegaron sin local y hay
  // que asignárselo, pero se despachan de vez en cuando y ocupaban media pantalla por encima
  // de la tabla, que es lo que se viene a ver. El contador va en el resumen, así que sigue
  // viéndose cuántos hay sin abrirlo — y por eso arranca CERRADO: si arrancara abierto, plegarlo
  // sería un clic más cada vez que se entra.
  const pendCard = (pend && pend.length) ? `<details class="card fold" style="margin-bottom:16px">
      <summary><h3>Facturas pendientes de asignar</h3>
        <span class="foldr"><span class="pill bad">${pend.length}</span><span class="car">${ic("chev", 16)}</span></span></summary>
      <div class="rows" style="margin-top:2px">${pend.map(pendRow).join("")}</div>
      ${pend.length > 1 && USER.rol === "direccion" ? `<div class="toolbar" style="padding:10px 16px 14px;margin:0"><button class="btn sm" data-act="fac-fusionar">Fusionar marcadas (misma factura)</button><span class="mut" style="font-size:12px">Marca 2+ documentos que sean páginas de la misma factura: se unirán en un solo PDF y se volverán a leer.</span></div>` : ""}
    </details>` : "";
  // La tabla va aparte y dentro de #facRes: es lo único que se repinta al filtrar en vivo.
  return `${facHeader()}${resumen}${toolbar}<div id="facDups"></div><div id="facLocalesRaros"></div><div id="facSinCats"></div>${vizGrid}${pendCard}<div id="facRes">${facTablaHtml(list)}</div>`;
}
// ── Fusionar pendientes que son páginas de la misma factura ─────────────────
async function facFusionarPendientes() {
  const ids = Array.from(document.querySelectorAll(".pendFusChk:checked")).map((c) => Number(c.getAttribute("data-id")));
  if (ids.length < 2) { toast("Marca al menos 2 documentos para fusionar"); return; }
  if (!(await confirmModal(`¿Unir ${ids.length} documentos en una sola factura? Se combinarán en un PDF y se volverán a leer los datos.`, { ok: "Fusionar" }))) return;
  toast("Fusionando y releyendo la factura…");
  try {
    const j = await apiSend("POST", "/api/facturas/pendientes/fusionar", { ids });
    toast(`✅ Fusionadas ${j.paginas} páginas${j.proveedor ? " · " + j.proveedor : ""}${j.pendiente ? " · falta asignarle local" : ""}`);
    if (CURRENT === "facturas") loadFacturas();
  } catch (e) { toast("⚠ No se pudo fusionar: " + e.message); }
}

// ── Posibles duplicados ─────────────────────────────────────────────────────
// Las que entraron con dudas. Están guardadas pero NO cuentan en ningún total hasta que
// alguien decida, así que lo primero que se dice es cuánto dinero hay ahí parado: si son
// 40 €, se mira mañana; si son 4.000, se mira ahora.
async function facDuplicados() {
  const caja = document.getElementById("facDups");
  if (!caja) return;
  let j;
  try { j = await apiRaw("/api/facturas/duplicados"); } catch { return; }
  if (!j.total) { caja.innerHTML = ""; return; }

  const ficha = (f, cual) => `<div class="dupcol ${cual}">
      <div class="t2">${cual === "nueva" ? "La que acaba de entrar" : "La que ya estaba"}${f.canal ? " · " + esc(f.canal) : ""}</div>
      <div class="t1">${esc(f.proveedor || "—")}</div>
      <div class="dupdatos">
        <span>${esc(fechaCorta(f.fecha) || f.fecha || "sin fecha")}</span>
        <span>nº ${esc(f.numero_factura || "s/n")}</span>
        <b>${esc(eur2(f.total))}</b>
      </div>
      ${f.local ? `<div class="t2">${esc(nombreCortoLocal(f.local))}</div>` : ""}
      ${f.drive_url ? `<a class="btn sm" href="${esc(f.drive_url)}" target="_blank" rel="noopener">Ver el papel ↗</a>`
        : '<span class="mut" style="font-size:12px">sin archivo</span>'}
    </div>`;

  const par = (f) => `<div class="dupcard">
      <p class="dupmot">${esc(f.motivos.length ? f.motivos.join(", ").replace(/^./, (c) => c.toUpperCase()) + "." : "Se parecen.")}</p>
      <div class="dupgrid">
        ${f.original ? ficha(f.original, "vieja") : '<div class="dupcol vieja"><div class="t2">La original ya no está</div></div>'}
        <div class="dupvs">¿la misma?</div>
        ${ficha(f, "nueva")}
      </div>
      <div class="dupacts">
        <button class="btn danger sm" data-act="fac-dup" data-id="${f.id}" data-accion="duplicada">Es la misma: descartar</button>
        <button class="btn sm" data-act="fac-dup" data-id="${f.id}" data-accion="distinta">Son distintas: que cuente</button>
      </div>
    </div>`;

  caja.innerHTML = `<div class="card" style="margin-bottom:16px">
    <div class="ch"><h3>Posibles facturas repetidas</h3>
      <span class="mut" style="font-size:12px">${num(j.total)} por decidir · ${esc(eur(j.importe))}</span></div>
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Estas <b>no cuentan</b> en ningún total mientras estén aquí:
      un total con una factura repetida dentro es un total falso, y uno al que le falta una buena también.
      Mira las dos y dime. <b>Descartar</b> borra la copia del registro; el archivo sigue en Drive.</p>
    ${j.data.map(par).join("")}</div>`;
}

async function facDupResolver(id, accion) {
  const dup = accion === "duplicada";
  const ok = await confirmModal(
    dup ? "¿Es la misma factura? Se borra esta copia del registro. El archivo se queda en Drive por si hay que mirarlo."
        : "¿Son dos facturas distintas? Esta pasará a contar en los totales.",
    { ok: dup ? "Sí, descartar" : "Sí, que cuente", danger: dup });
  if (!ok) return;
  try { const r = await apiSend("POST", `/api/facturas/duplicados/${id}/resolver`, { accion }); toast(r.mensaje || "Hecho ✅"); loadFacturas(); }
  catch (e) { toast(e.message); }
}

// ── Dónde están las facturas en Drive ───────────────────────────────────────
// «Conectado» no contesta «no veo las carpetas». Esto enseña con qué cuenta de Google se
// escribe, el enlace directo a la carpeta raíz y la ruta REAL de las últimas facturas. Si la
// ruta sale como «Contabilidad / Empresa / Local / Julio 2026», están ordenadas; si sale a
// secas, no lo están y hay un botón que las coloca.
async function facDiagnosticoDrive() {
  const caja = document.getElementById("facDrive");
  if (!caja) return;
  // Si TÚ lo tenías abierto, se queda abierto al repintar. No es abrirse solo: es no cerrarse
  // en las narices de quien lo está mirando —al pulsar «Reordenar Drive» el bloque se repinta,
  // y es justo el momento en el que hay que ver que ha funcionado.
  const estaba = caja.querySelector("details")?.open;
  let j;
  try { j = await apiRaw("/api/facturas/drive-diagnostico"); } catch { return; }

  const avisos = (j.avisos || []).map((a) => `<p class="fic-nota" style="margin:0 0 8px">${esc(a)}</p>`).join("");
  const desordenadas = (j.ultimas || []).some((f) => f.ruta && !f.ordenada);

  const rutaHtml = (f) => {
    if (f.rutaError) return `<span class="mut">no se pudo leer (${esc(f.rutaError)})</span>`;
    if (!f.ruta) return `<span class="mut">sin enlace reconocible</span>`;
    return `<span class="${f.ordenada ? "" : "fg-danger"}">${esc(f.ruta.replace(/ \/ /g, " › "))}</span>
      ${f.ordenada ? "" : ' <span class="pill warn">suelta</span>'}`;
  };

  caja.innerHTML = `<details class="card fold" style="margin-bottom:16px" ${estaba ? "open" : ""}>
    <summary><h3>Dónde están las facturas en Drive</h3>
      <span class="foldr"><span>${j.conectado ? (desordenadas ? "hay que reordenar" : "ordenadas") : "sin conectar"}</span><span class="car">${ic("chev", 16)}</span></span></summary>
    ${avisos}
    <div class="rows">
      <div class="row"><span class="grow"><div class="t1">Cuenta de Google</div>
        <div class="t2">Las carpetas se crean en el Drive de ESTA cuenta. Si navegas con otra, no las verás aunque todo funcione.</div></span>
        <b style="flex:none">${j.cuenta ? esc(j.cuenta.email) : '<span class="mut">—</span>'}</b></div>
      <div class="row"><span class="grow"><div class="t1">Carpeta raíz</div>
        <div class="t2">${j.raiz ? esc(j.raiz.nombre) + (j.raiz.dueño ? " · de " + esc(j.raiz.dueño) : "") : "todavía no creada"}</div></span>
        ${j.raiz ? `<a class="btn sm" href="${esc(j.raiz.url)}" target="_blank" rel="noopener">Abrirla ↗</a>` : ""}</div>
      ${j.raiz ? `<div class="row"><span class="grow"><div class="t1">Dónde está esa carpeta</div>
        <div class="t2">Si no cuelga de «Mi unidad», las facturas se ven en la página principal de Drive pero no se llega a ellas navegando.</div></span>
        <b style="flex:none" class="${j.raiz.enMiUnidad ? "" : "fg-danger"}">${j.raiz.enMiUnidad ? "Mi unidad ✓" : esc(j.raiz.ubicacion || "fuera de Mi unidad")}</b></div>` : ""}
      <div class="row"><span class="grow"><div class="t1">Facturas con archivo</div>
        <div class="t2">de ${num(j.facturas)} guardadas en total</div></span>
        <b style="flex:none">${num(j.conArchivo)}</b></div>
    </div>

    ${j.raiz?.contenido?.length ? `<div style="margin-top:12px"><div class="t1" style="margin-bottom:6px">Dentro de la raíz</div>
      <div class="fchips">${j.raiz.contenido.slice(0, 12).map((x) =>
        `<a class="fchip" href="${esc(x.url)}" target="_blank" rel="noopener">${x.esCarpeta ? "📁" : "📄"} ${esc(x.nombre)}</a>`).join("")}</div></div>` : ""}

    ${(j.ultimas || []).length ? `<div style="margin-top:12px"><div class="t1" style="margin-bottom:6px">Dónde ha ido a parar cada una de las últimas</div>
      <div class="tw"><table class="tbl"><thead><tr><th>Factura</th><th>Carpeta en Drive</th><th></th></tr></thead>
      <tbody>${j.ultimas.map((f) => `<tr>
        <td>${esc(f.proveedor || "—")}<div class="t2">${esc((f.fecha || "").slice(0, 10))} · ${esc(nombreCortoLocal(f.local) || "")}</div></td>
        <td style="font-size:12.5px">${rutaHtml(f)}</td>
        <td class="r"><a class="btn sm" href="${esc(f.drive_url)}" target="_blank" rel="noopener">Ver ↗</a></td></tr>`).join("")}</tbody></table></div></div>` : ""}

    ${j.raiz && !j.raiz.enMiUnidad ? `<p class="fic-nota" style="margin:12px 0 0">La carpeta raíz <b>no está en Mi unidad</b>, y eso explica que veas las facturas
      en la página principal de Drive pero no las carpetas. <b>Colocarla en Mi unidad</b> no mueve ni copia ningún archivo: en Drive, mover una carpeta
      es cambiarle el sitio y todo lo de dentro va con ella conservando sus enlaces.
      <button class="btn sm" data-act="fac-colocar-raiz" style="margin-top:8px">Colocarla en Mi unidad</button></p>` : ""}

    ${desordenadas ? `<p class="fic-nota" style="margin:12px 0 0">Las que salen como <b>sueltas</b> están en Drive pero fuera de su carpeta.
      <b>Reordenar Drive</b> las mueve a Empresa/Local/Mes sin volver a subirlas ni tocar la base de datos.
      <button class="btn sm" data-act="fac-migrar" style="margin-top:8px">Reordenar Drive</button></p>` : ""}

    ${(j.sheets || []).length ? `<div style="margin-top:12px"><div class="t1" style="margin-bottom:6px">Hojas de cálculo por local</div>
      <div class="fchips">${j.sheets.map((x) => `<a class="fchip" href="${esc(x.sheet_url)}" target="_blank" rel="noopener">${esc(nombreCortoLocal(x.local))}</a>`).join("")}</div></div>` : ""}
  </details>`;
}

// ── De qué es cada proveedor ────────────────────────────────────────────────
// Etiquetar 30 proveedores se hace en una tarde; etiquetar 4.000 líneas de producto no se hace
// nunca. Por eso la categoría va en el proveedor. Ver src/modules/facturas/categorias.js.
let FCATS = null;

const CATS_SIN_LINEAS = new Set(["Suministros", "Mantenimiento y obras", "Servicios y profesionales",
  "Impuestos y seguros", "Alquileres", "Marketing"]);
// Espejo de COLOR_CATEGORIA (src/modules/facturas/categorias.js). El panel no puede importar
// módulos, así que se copia — y hay un test que falla si las dos listas dejan de coincidir.
const COLOR_CAT_FE = {
  "Bebidas": "uva", "Carne y aves": "carne", "Embutidos y quesos": "curado",
  "Pescado y marisco": "mar", "Fruta y verdura": "huerta", "Pan y bollería": "pan",
  "Congelados": "hielo", "Ultramarinos y conservas": "despensa", "Limpieza e higiene": "limpieza",
  "Desechables y envases": "envase", "Menaje y utillaje": "menaje", "Suministros": "gris",
  "Mantenimiento y obras": "gris", "Servicios y profesionales": "gris",
  "Impuestos y seguros": "gris", "Alquileres": "gris", "Marketing": "marketing", "Varios": "gris",
};
const colorCategoriaFE = (c) => COLOR_CAT_FE[String(c || "").trim()] || "gris";
// «Bebidas · Vinos y cavas». Un proveedor es de una categoría CON su subcategoría, no de dos
// categorías sueltas: así el gasto va entero a un sitio y no hay que repartir nada.
const parTxt = (p) => (p.subcategoria ? `${p.categoria} · ${p.subcategoria}` : p.categoria);

async function facCargarCategorias() {
  const caja = document.getElementById("facCats");
  if (!caja) return;
  try { FCATS = await apiRaw("/api/facturas/categorias"); } catch { return; }
  caja.innerHTML = facCategoriasHtml();
}

// ── Proveedores repetidos ───────────────────────────────────────────────────
// «GRAU» y «Vins i Licors Grau, S.A.» son la misma empresa: salen como dos proveedores, hay
// que etiquetarlos dos veces y el gasto sale partido. Se propone; unir lo decide una persona,
// porque unir reescribe todas sus facturas.
let PROVDUP = null;

async function facProvDuplicados() {
  const caja = document.getElementById("facProvDup");
  if (!caja) return;
  try { PROVDUP = await apiRaw("/api/facturas/proveedores-duplicados"); } catch { return; }
  const g = PROVDUP.grupos || [];
  if (!g.length) { caja.innerHTML = ""; return; }

  caja.innerHTML = `<details class="card fold" style="margin-bottom:16px">
    <summary><h3>Proveedores repetidos</h3><span class="foldr">
      <span>${num(g.length)} ${g.length === 1 ? "caso" : "casos"}</span><span class="car">${ic("chev", 16)}</span></span></summary>
    <p class="mut" style="margin:0 0 12px;line-height:1.55">El mismo proveedor metido con dos nombres. Cuando comparten
      NIF <b>no es que se parezcan: son la misma empresa</b>. Al unirlos, todas las facturas pasan al nombre que elijas
      y las próximas entran ya correctas — es lo mismo que corregir el nombre a mano, pero de una vez.</p>
    <div class="rows">${g.map((x, i) => `<div class="row" data-provdup-fila="${i}">
        <div class="grow" style="min-width:0">
          <div class="t1">${esc(x.sugerido.proveedor)}</div>
          <div class="t2">y ${x.otros.map((o) => `<b>${esc(o.proveedor)}</b>`).join(", ")}
            · ${esc(x.motivo)} · ${num(x.facturas)} facturas · ${esc(eur(x.gasto))}</div>
        </div>
        <button class="btn sm primary" data-act="fac-provdup" data-provdup="unir" data-i="${i}">Unir en «${esc(nombreCorto(x.sugerido.proveedor))}»</button>
        <button class="btn sm" data-act="fac-provdup" data-provdup="otro" data-i="${i}">Al revés</button>
      </div>`).join("")}</div>
  </details>`;
}

/** Unir de verdad: se reutiliza el renombrado, que ya reescribe todas las facturas y aprende. */
async function facProvUnir(grupo, destino) {
  const otros = [grupo.sugerido, ...grupo.otros].filter((x) => x.proveedor !== destino);
  if (!await confirmModal(
    `Se unen ${otros.length + 1} nombres en «${destino}». ${num(grupo.facturas)} factura(s) pasan a ese nombre y las próximas entrarán ya así.`,
    { ok: "Unir" })) return;
  try {
    for (const o of otros) {
      await apiSend("PUT", "/api/facturas/proveedor", { antiguo: o.proveedor, nuevo: destino });
    }
    toast(`Unidos en «${destino}» ✅`);
    facProvDuplicados(); facCargarCategorias();
  } catch (e) { toast("Error: " + e.message); }
}

function facCategoriasHtml() {
  const j = FCATS; if (!j) return "";
  // Los SIN CATEGORÍA primero, y dentro de cada bloque los que más gastan. Antes iban mezclados
  // por gasto y el trabajo pendiente quedaba repartido por toda la tabla: la lista tiene que
  // empezar por lo que hay que arreglar, que además se arregla desde ahí mismo.
  const provs = [...(j.proveedores || [])].sort((a, b) =>
    (a.categorias.length ? 1 : 0) - (b.categorias.length ? 1 : 0) || (b.gasto || 0) - (a.gasto || 0));
  const fila = (p) => `<tr class="${p.categorias.length ? "" : "sincat"}">
    <td><button class="linkbtn" data-act="fac-prov-ficha" data-prov="${esc(p.proveedor)}" style="font-weight:600" title="Abrir su ficha">${esc(p.proveedor)}</button>${p.nombres.length > 1 ? `<div class="t2" title="${esc(p.nombres.join(" · "))}">y ${p.nombres.length - 1} forma${p.nombres.length > 2 ? "s" : ""} más de escribirlo</div>` : ""}</td>
    <td class="mut r tnum">${num(p.facturas)}</td>
    <td class="r tnum">${eur(p.gasto)}</td>
    <td>${p.categorias.length
      ? p.categorias.map((c) => `<span class="pill cat" style="--cat:var(--cat-${esc(colorCategoriaFE(c.categoria))})">${esc(parTxt(c))}</span>`).join(" ")
      : '<span class="pill bad">sin categoría</span>'}
      ${p.categorias.length && !p.categorias.some((c) => !CATS_SIN_LINEAS.has(c.categoria))
        ? '<div class="t2">gasto estructural · no se lee el detalle</div>' : ""}</td>
    <td class="r"><button class="btn sm" data-act="fac-cat-editar" data-prov="${esc(p.proveedor)}">Cambiar</button></td></tr>`;

  const sin = j.sinEtiquetar || 0;
  return `<details class="card fold" style="margin-bottom:16px">
    <summary><h3>De qué es cada proveedor</h3><span class="foldr"><span>${sin ? `${num(sin)} sin etiquetar` : "todos etiquetados"}</span><span class="car">${ic("chev", 16)}</span></span></summary>
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Sirve para saber cuánto se va en bebida, en carne o en limpieza,
      que hoy solo se puede ver proveedor a proveedor. Empieza por los de arriba: son los que más gastan.
      <b>De las categorías de gasto estructural</b> —alquiler, suministros, gestoría, seguros, marketing— <b>no se lee
      el detalle de la factura</b>: esa línea no es un producto y ensucia «Qué compramos». El gasto sí cuenta.</p>
    <div class="tw"><table class="tbl"><thead><tr><th>Proveedor</th><th class="r">Facturas</th><th class="r">Gasto</th><th>Categorías</th><th></th></tr></thead>
      <tbody>${provs.map(fila).join("") || '<tr><td colspan="5" class="mut">Todavía no hay proveedores.</td></tr>'}</tbody></table></div>
  </details>`;
}

/**
 * Ficha del proveedor. Sirve sobre todo para una cosa: corregir el nombre cuando la lectura se
 * equivoca —«Viruta Bronco» en vez de «Virutas Branco»— y que lo APRENDA, en lugar de tener
 * que corregir lo mismo cada mes.
 */
// Espejo de nifValido() del servidor: solo para avisar mientras se escribe.
function facNifPareceValido(v) {
  const n = String(v || "").replace(/[\s.\-/]/g, "").toUpperCase();
  const L = "TRWAGMYFPDXBNJZSQVHLCKE";
  const dni = /^(\d{8})([A-Z])$/.exec(n); if (dni) return L[Number(dni[1]) % 23] === dni[2];
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(n); if (nie) return L[Number("XYZ".indexOf(nie[1]) + nie[2]) % 23] === nie[3];
  return /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(n);
}

/** Las reglas de pago que ya tiene: la general y las excepciones por empresa. */
function fpReglasHtml(j) {
  const rs = j.reglasPago || [];
  if (!rs.length) return "";
  return `<label>Cómo se le paga hoy</label>
    <div class="rows" style="border:1px solid var(--border);border-radius:10px;padding:2px 10px">
      ${rs.map((r) => `<div class="row" style="padding:8px 0">
        <div class="grow" style="min-width:0">
          <div class="t1">${r.empresa ? esc(r.empresa) : "Todas las empresas"}${r.empresa ? "" : ' <span class="mut" style="font-weight:400">· regla general</span>'}</div>
          <div class="t2">${esc(r.texto || "")}</div>
        </div>
        <button class="btn sm" data-fpregla="quitar" data-empresa="${esc(r.empresa)}">Quitar</button>
      </div>`).join("")}
    </div>`;
}

async function facProveedorFicha(nombre) {
  let j;
  try { j = await apiRaw("/api/facturas/proveedor?nombre=" + encodeURIComponent(nombre)); } catch (e) { return toast(e.message); }
  const nifPrincipal = (j.nifs || [])[0];
  const ov = modal("Proveedor", `
    <div class="kpis4" style="margin:0 0 16px">
      <div class="kpi"><span>Facturas</span><b>${num(j.facturas || 0)}</b></div>
      <div class="kpi"><span>Gasto</span><b>${esc(eur(j.gasto || 0))}</b></div>
      <div class="kpi"><span>Desde</span><b style="font-size:14px">${esc(fechaCorta(j.primera) || "—")}</b></div>
      <div class="kpi"><span>Última</span><b style="font-size:14px">${esc(fechaCorta(j.ultima) || "—")}</b></div>
    </div>
    <div class="form-grid">
      <div class="field full"><label>Nombre del proveedor</label>
        <input class="inp" id="fpNombre" value="${esc(nombre)}"></div>
      <div class="field full"><label>NIF ${nifPrincipal ? "" : "<span class=\"mut\">(no se ha leído ninguno)</span>"}</label>
        <input class="inp" id="fpNif" value="${esc(nifPrincipal ? nifPrincipal.nif : "")}" placeholder="B12345678"></div>
      <div class="field full">${fpReglasHtml(j)}</div>
      <div class="field full"><label>${(j.reglasPago || []).length ? "Añadir o cambiar una regla" : "¿Cómo se le paga?"}</label>
        <select class="inp" id="fpEmpresa">
          <option value="">Para todas las empresas (regla general)</option>
          ${(j.empresas || FCFG.empresas || []).map((e) => `<option value="${esc(e)}">Solo para ${esc(e)}</option>`).join("")}
        </select></div>
      <div class="field full"><label>Y se le paga</label>
        <select class="inp" id="fpModo">
          <option value="mensual" ${j.pago?.modo === "mensual" ? "selected" : ""}>Recibo mensual: todo lo del mes, un solo cargo</option>
          <option value="dias" ${j.pago && j.pago.modo !== "mensual" ? "selected" : ""}>A X días desde cada factura</option>
          <option value="" ${!j.pago ? "selected" : ""}>No lo sé todavía</option>
        </select></div>

      <!-- Recibo mensual: es como paga la mayoría, así que va primero. -->
      <div class="field" data-modo="mensual"><label>Pasa el recibo el día</label>
        <input class="inp" id="fpDiaPago" type="number" min="1" max="31" placeholder="15"
          value="${esc(j.pago?.dia_pago ?? "")}"></div>
      <div class="field" data-modo="mensual"><label>De lo facturado</label>
        <select class="inp" id="fpMeses">
          ${[["1", "el mes anterior"], ["0", "ese mismo mes"], ["2", "dos meses antes"]]
            .map(([v, t]) => `<option value="${v}" ${String(j.pago?.meses_despues ?? 1) === v ? "selected" : ""}>${t}</option>`).join("")}
        </select></div>

      <div class="field" data-modo="dias"><label>Se le paga a</label>
        <select class="inp" id="fpDias">
          ${[["0", "Al contado"], ["7", "7 días"], ["15", "15 días"], ["30", "30 días"], ["45", "45 días"], ["60", "60 días"], ["90", "90 días"]]
            .map(([v, t]) => `<option value="${v}" ${String(j.pago?.dias ?? "30") === v ? "selected" : ""}>${t}</option>`).join("")}
        </select></div>
      <div class="field" data-modo="dias"><label>Pagando los días <span class="mut">(opcional)</span></label>
        <input class="inp" id="fpDiaDias" type="number" min="1" max="31" placeholder="p. ej. 10"
          value="${esc(j.pago?.modo !== "mensual" ? (j.pago?.dia_pago ?? "") : "")}"></div>

      <div class="field full" data-modo="mensual dias">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="fpDomi" ${j.pago?.domiciliado ? "checked" : ""} style="width:auto;margin:0">
          <span>Se cobra solo por el banco (domiciliado)</span></label></div>
    </div>
    <p class="mut" style="margin:8px 0 0;line-height:1.55">Con esto, cada factura suya sabe <b>cuándo hay que
      pagarla</b> y aparece en <b>Pagos</b>. En el recibo mensual, <b>todas las del mes salen juntas en un
      solo cargo</b>, que es como llega al banco. Si la factura trae su vencimiento escrito, manda el papel.
      <b>Si el mismo proveedor cobra distinto a cada empresa</b> —a una el recibo del 15 y a otra al contado—,
      se le pone una regla a esa empresa y manda sobre la general.
      ${(j.reglasPago || []).length ? "" : "Sin esto, sus facturas se quedan <b>sin fecha de pago</b>."}</p>
    <p class="mut" style="margin:8px 0 0;line-height:1.55">Si la lectura se equivoca siempre igual —«Viruta Bronco» por
      «Virutas Branco»—, corrígelo aquí: se arreglan <b>todas sus facturas</b> y las que entren a partir de ahora
      llegarán ya con el nombre bueno.${nifPrincipal ? ` Se recuerda por su NIF <b>${esc(nifPrincipal.nif)}</b>, que no cambia
      aunque el nombre se lea de otra forma.` : " <b>Sin NIF no se puede anclar</b>, así que solo se reconocerá si el nombre se lee igual que ahora."}</p>
    ${j.nombres.length > 1 ? `<p class="mut" style="margin:8px 0 0;font-size:12.5px">Ahora mismo aparece escrito de ${j.nombres.length} formas: ${j.nombres.map(esc).join(" · ")}. Se unifican todas.</p>` : ""}
    ${(j.nifs || []).length > 1 ? `<p class="fic-nota">Tiene <b>${j.nifs.length} NIF distintos</b> (${j.nifs.map((x) => esc(x.nif)).join(", ")}). O son dos empresas parecidas, o alguno se leyó mal.</p>` : ""}
    ${j.alias ? `<p class="mut" style="margin:8px 0 0;font-size:12.5px">Ya se corrigió antes: ${esc(j.alias.autor || "alguien")} lo dejó como «${esc(j.alias.proveedor)}».</p>` : ""}
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
      <button class="btn" data-close>Cerrar</button><button class="btn primary" id="fpOk">Guardar y aprender</button></div>`);
  ov.querySelector(".modal").style.width = "min(560px, 96vw)";
  // Aviso en vivo si lo escrito no puede ser un NIF. No bloquea: hay proveedores extranjeros
  // con VAT que no sigue el formato español, y bloquearlos sería peor que avisar.
  const nifIn = ov.querySelector("#fpNif");
  const pistaNif = document.createElement("div");
  pistaNif.className = "mut";
  pistaNif.style.cssText = "font-size:12px;margin-top:4px";
  nifIn.parentElement.appendChild(pistaNif);
  const revisaNif = () => {
    const v = nifIn.value.trim();
    pistaNif.textContent = !v || facNifPareceValido(v) ? "" : "Eso no tiene forma de NIF ni de CIF español. Si es un proveedor extranjero puede estar bien; si no, revísalo.";
  };
  nifIn.addEventListener("input", revisaNif); revisaNif();

  // Solo se ven los campos del modo elegido: enseñar los dos a la vez invita a rellenar los
  // que no van y a que luego no cuadre nada.
  const modoSel = ov.querySelector("#fpModo");
  const pintarModo = () => {
    const m = modoSel.value;
    ov.querySelectorAll("[data-modo]").forEach((el) => {
      el.style.display = m && el.getAttribute("data-modo").split(" ").includes(m) ? "" : "none";
    });
  };
  modoSel.addEventListener("change", pintarModo);
  pintarModo();

  // Quitar una regla concreta (la general o la de una empresa).
  ov.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fpregla]");
    if (!b) return;
    const emp = b.getAttribute("data-empresa") || "";
    if (!await confirmModal(emp
      ? `Se quita la regla de ${emp}. Sus facturas pasarán a usar la regla general, o se quedarán sin fecha si no la hay.`
      : "Se quita la regla general. Las empresas sin regla propia se quedarán sin fecha de pago.", { ok: "Quitar" })) return;
    try {
      const r = await apiSend("PUT", "/api/facturas/proveedor-pago",
        { proveedor: nombre, empresa: emp, modo: "dias", dias: null, dia_pago: null });
      ov.remove(); toast(r.mensaje || "Quitada"); facProveedorFicha(nombre);
    } catch (err) { toast("Error: " + err.message); }
  });

  ov.querySelector("#fpOk").addEventListener("click", async () => {
    const nuevo = ov.querySelector("#fpNombre").value.trim();
    const nif = ov.querySelector("#fpNif").value.trim();
    const nifViejo = nifPrincipal ? nifPrincipal.nif : "";
    const cambiaNif = nif && nif !== nifViejo;
    // Las condiciones de pago son independientes del nombre: se pueden poner sin tocar nada más.
    const modo = modoSel.value;
    const empresaRegla = ov.querySelector("#fpEmpresa").value;
    const pago = modo === "mensual"
      ? { modo: "mensual", dia_pago: ov.querySelector("#fpDiaPago").value.trim(),
          meses_despues: Number(ov.querySelector("#fpMeses").value) }
      : modo === "dias"
        ? { modo: "dias", dias: ov.querySelector("#fpDias").value,
            dia_pago: ov.querySelector("#fpDiaDias").value.trim() }
        : { modo: "dias", dias: "" };                       // «no lo sé» = quitar las condiciones
    pago.domiciliado = ov.querySelector("#fpDomi").checked;

    // Se compara contra la regla de ESA empresa, no contra la general: si no, poner una
    // excepción idéntica a la general no se guardaría nunca.
    const reglaAntes = (j.reglasPago || []).find((r) => (r.empresa || "") === empresaRegla) || null;
    const antes = reglaAntes
      ? { modo: reglaAntes.modo || "dias", dias: String(reglaAntes.dias ?? ""), dia_pago: String(reglaAntes.dia_pago ?? ""),
          meses_despues: Number(reglaAntes.meses_despues ?? 1), domiciliado: !!reglaAntes.domiciliado }
      : null;
    const ahora = { modo: pago.modo, dias: String(pago.dias ?? ""), dia_pago: String(pago.dia_pago ?? ""),
      meses_despues: Number(pago.meses_despues ?? 1), domiciliado: !!pago.domiciliado };
    const cambiaPago = JSON.stringify(antes) !== JSON.stringify(modo ? ahora : null);

    if ((!nuevo || nuevo === nombre) && !cambiaNif && !cambiaPago) { ov.remove(); return; }
    if (!nuevo) return toast("El nombre no puede quedar vacío");

    if (nuevo !== nombre || cambiaNif) {
      const qué = [nuevo !== nombre ? "el nombre" : null, cambiaNif ? "el NIF" : null].filter(Boolean).join(" y ");
      if (!await confirmModal(`Se cambiará ${qué} en sus ${num(j.facturas || 0)} facturas y las próximas entrarán ya corregidas.`, { ok: "Guardar" })) return;
    }
    try {
      let msg = "";
      if (cambiaPago) {
        const r = await apiSend("PUT", "/api/facturas/proveedor-pago", {
          proveedor: nuevo || nombre,
          empresa: empresaRegla,
          modo: pago.modo,
          dias: pago.dias === "" || pago.dias == null ? null : Number(pago.dias),
          dia_pago: pago.dia_pago === "" || pago.dia_pago == null ? null : Number(pago.dia_pago),
          meses_despues: pago.meses_despues,
          domiciliado: pago.domiciliado,
        });
        msg = r.mensaje || "";
      }
      if (nuevo !== nombre || cambiaNif) {
        const r = await apiSend("PUT", "/api/facturas/proveedor", { antiguo: nombre, nuevo, nif: nif || undefined });
        msg = r.mensaje || msg;
      }
      ov.remove(); toast(msg || "Hecho ✅"); facCargarCategorias();
      if (FACTAB === "pagos") loadPagos();
    }
    catch (e) { toast(e.message); }
  });
}

function facCatEditar(proveedor) {
  const j = FCATS; if (!j) return;
  const p = (j.proveedores || []).find((x) => x.proveedor === proveedor); if (!p) return;
  const cat0 = p.categorias[0]?.categoria || "";
  const sub0 = p.categorias[0]?.subcategoria || "";

  const opcCat = `<option value="">— sin decidir —</option>` + (j.catalogo || []).map((c) =>
    `<option value="${esc(c.nombre)}" ${c.nombre === cat0 ? "selected" : ""}>${esc(c.nombre)}${CATS_SIN_LINEAS.has(c.nombre) ? " · no se lee el detalle" : ""}</option>`).join("");

  const ov = modal(`De qué es ${proveedor}`, `
    <p class="mut" style="margin:0 0 14px;line-height:1.55">Una categoría y, si aplica, la subcategoría dentro de ella:
      Grau es <b>Bebidas · Vinos y cavas</b>. Así el gasto va entero a un sitio, «Bebidas» sigue siendo la suma exacta
      de sus subcategorías, y se puede preguntar «cuánto vino» sin dejar de poder preguntar «cuánto en bebida».</p>
    <div class="form-grid">
      <div class="field full"><label>Categoría</label><select class="inp" id="fcCat">${opcCat}</select></div>
      <div class="field full" id="fcSubBox"></div>
    </div>
    <div id="fcExtra"></div>
    <div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:18px">
      <button class="linkbtn" id="fcMas">+ Otra categoría</button>
      <span><button class="btn" data-close>Cancelar</button> <button class="btn primary" id="fcOk">Guardar</button></span></div>`);
  ov.querySelector(".modal").style.width = "min(560px, 96vw)";

  // Las subcategorías dependen de la categoría: se repintan al cambiarla, y se limpian, porque
  // una subcategoría colgando de la categoría equivocada rompe que la suma cuadre.
  const pintarSub = (sel = "") => {
    const cat = ov.querySelector("#fcCat").value;
    const subs = ((j.catalogo || []).find((c) => c.nombre === cat) || {}).subs || [];
    ov.querySelector("#fcSubBox").innerHTML = subs.length
      ? `<label>Subcategoría <span class="mut">(opcional)</span></label><select class="inp" id="fcSub">
          <option value="">— toda la categoría —</option>
          ${subs.map((x) => `<option value="${esc(x)}" ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`
      : `<p class="mut" style="margin:0;font-size:12.5px">${cat ? "Esta categoría no se subdivide." : ""}</p>`;
  };
  ov.querySelector("#fcCat").addEventListener("change", () => pintarSub());
  pintarSub(sub0);

  // Un proveedor que de verdad venda de dos cosas (Makro) puede tener más de un par. Es la
  // excepción, así que va detrás de un enlace y no delante estorbando.
  const extras = [];
  const pintarExtras = () => {
    ov.querySelector("#fcExtra").innerHTML = extras.map((e, i) => `<div class="row" style="align-items:center;gap:8px;margin-top:8px">
      <span class="grow">${esc(parTxt(e))}</span>
      <button class="linkbtn" data-quita="${i}">Quitar</button></div>`).join("");
  };
  p.categorias.slice(1).forEach((x) => extras.push(x));
  pintarExtras();
  ov.querySelector("#fcExtra").addEventListener("click", (e) => {
    const b = e.target.closest("[data-quita]"); if (!b) return;
    extras.splice(Number(b.dataset.quita), 1); pintarExtras();
  });
  ov.querySelector("#fcMas").addEventListener("click", () => {
    const cat = ov.querySelector("#fcCat").value;
    if (!cat) return toast("Elige antes la primera categoría");
    const sub = ov.querySelector("#fcSub")?.value || "";
    if (!extras.some((x) => x.categoria === cat && x.subcategoria === sub)) extras.push({ categoria: cat, subcategoria: sub });
    pintarExtras();
    toast("Añadida. Elige ahora la otra arriba.");
  });

  ov.querySelector("#fcOk").addEventListener("click", async () => {
    const cat = ov.querySelector("#fcCat").value;
    const sub = ov.querySelector("#fcSub")?.value || "";
    const pares = cat ? [{ categoria: cat, subcategoria: sub }, ...extras] : [...extras];
    try {
      await apiSend("PUT", "/api/facturas/categorias", { proveedor, categorias: pares });
      ov.remove(); toast("Guardado ✅");
      await facCargarCategorias();
    } catch (e) { toast(e.message); }
  });
}

// ── Locales mal guardados ───────────────────────────────────────────────────
// El campo `local` era texto libre y quedaron «Lloret» y «BLANES» sueltos junto a «La
// Tapeta - Lloret». Filtrando por el nombre bueno faltaban facturas y el gasto por local
// salía repartido entre nombres que son el mismo sitio. Las puertas ya están cerradas;
// esto avisa de lo que quedó y lo arregla.
// Proveedores sin categoría. Va en la pantalla principal y no escondido en Configuración,
// porque mientras haya gasto sin etiquetar el reparto por categorías está incompleto y eso no
// se ve mirando el reparto: un «Bebidas 4.200 €» parece un dato cerrado aunque falte la mitad.
async function facAvisoCategorias() {
  const caja = document.getElementById("facSinCats");
  if (!caja) return;
  let j;
  try { j = await apiRaw("/api/facturas/categorias"); } catch { return; }
  if (!j.sinEtiquetar) return;
  const n = j.sinEtiquetar;
  const quienes = (j.proveedores || []).filter((p) => !p.categorias.length).slice(0, 4).map((p) => p.proveedor);
  caja.innerHTML = `<p class="fic-nota"><b>${num(n)}</b> ${n === 1 ? "proveedor no tiene categoría" : "proveedores no tienen categoría"}
    ${j.gastoSinEtiquetar ? `y entre ${n === 1 ? "él" : "ellos"} suman <b>${esc(eur(j.gastoSinEtiquetar))}</b>` : ""}:
    ${quienes.map((x) => esc(x)).join(", ")}${n > 4 ? "…" : ""}.
    Hasta que ${n === 1 ? "la tenga" : "la tengan"}, ese gasto no entra en el reparto por categorías.
    ${USER.rol === "direccion" || USER.rol === "contabilidad"
      ? `<button class="btn sm" data-act="fac-ir-cats" style="margin-top:8px">Ponerles categoría</button>` : ""}</p>`;
}

async function facAvisoLocales() {
  const caja = document.getElementById("facLocalesRaros");
  if (!caja) return;
  let j;
  try { j = await apiRaw("/api/facturas/locales-raros"); } catch { return; } // contabilidad y dirección; al resto le da 403 y no ve nada
  const canales = j.canales || [];
  if (!j.data.length && !canales.length) return;
  const total = j.data.reduce((s, x) => s + x.n, 0);
  caja.innerHTML = `<p class="fic-nota">${total ? `<b>${num(total)}</b> ${total === 1 ? "factura no está vinculada" : "facturas no están vinculadas"} a ningún establecimiento:
    ${j.data.slice(0, 4).map((x) => `«${esc(x.valor || "sin local")}»`).join(", ")}${j.data.length > 4 ? "…" : ""}.
    Mientras sea así, al filtrar por establecimiento no salen y el gasto por local queda repartido.` : ""}
    ${canales.length ? `<br>Y ${canales.length === 1 ? "hay un canal de entrada apuntando" : `hay ${num(canales.length)} canales de entrada apuntando`} a un sitio que no existe
      (${canales.slice(0, 3).map((c) => `${esc(c.tipo)} → «${esc(c.valor || "vacío")}»`).join("; ")}${canales.length > 3 ? "…" : ""}):
      <b>lo que entre por ahí seguirá llegando mal</b>.` : ""}
    ${USER.rol === "direccion"
      ? `<button class="btn sm" data-act="fac-normalizar-locales" style="margin-top:8px">Vincularlas</button>`
      : `<br><span class="mut">Lo puede arreglar dirección.</span>`}</p>`;
}

async function facNormalizarLocales() {
  let j;
  try { j = await apiRaw("/api/facturas/locales-raros"); } catch (e) { return toast(e.message); }
  if (!j.data.length) return toast(j.canales?.length ? "Solo quedan canales por corregir: hazlo en Configuración" : "Todas están vinculadas");

  const sel = (x, i) => `<select class="inp" data-raro="${i}" style="width:100%">
      <option value="">— dejar como está —</option>
      ${j.locales.map((l) => `<option value="${esc(l)}" ${x.sugerido === l ? "selected" : ""}>${esc(l)}</option>`).join("")}
    </select>`;
  const ov = modal("Vincular a un establecimiento", `
    <p class="mut" style="margin:0 0 14px;line-height:1.55">Cada valor suelto y a qué establecimiento pasaría.
      Donde el sistema lo tiene claro viene ya propuesto; donde no —«Tordera», por ejemplo, que puede ser tres
      locales— lo dejo en blanco a propósito: <b>equivocarse aquí descuadra dos locales a la vez</b>.</p>
    <div class="rows">${j.data.map((x, i) => `<div class="row" style="align-items:center">
      <div class="grow" style="min-width:0"><div class="t1">${esc(x.valor || "(sin local)")}</div>
        <div class="t2">${num(x.n)} ${x.n === 1 ? "factura" : "facturas"}</div></div>
      <div style="flex:0 0 230px">${sel(x, i)}</div></div>`).join("")}</div>
    ${j.canales?.length ? `<p class="fic-nota" style="margin-bottom:0">El mismo cambio se aplica al canal de entrada que tuviera ese valor
      (${esc(j.canales.map((c) => c.tipo).filter((v, i2, a) => a.indexOf(v) === i2).join(", "))}), para que lo de mañana entre ya bien.</p>` : ""}
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn" data-close>Cancelar</button><button class="btn primary" id="facRaroOk">Aplicar</button></div>`);
  ov.querySelector(".modal").style.width = "min(680px, 96vw)";

  ov.querySelector("#facRaroOk").addEventListener("click", async () => {
    const cambios = [];
    ov.querySelectorAll("[data-raro]").forEach((s) => {
      const i = Number(s.getAttribute("data-raro"));
      if (s.value) cambios.push({ de: j.data[i].valor, a: s.value });
    });
    if (!cambios.length) { toast("No has elegido ningún establecimiento"); return; }
    if (!await confirmModal(`Se vincularán ${cambios.reduce((s, c) => s + (j.data.find((x) => x.valor === c.de)?.n || 0), 0)} facturas. Esto cambia a qué local pertenece ese gasto.`, { ok: "Aplicar" })) return;
    try { const r = await apiSend("POST", "/api/facturas/locales-raros/arreglar", { cambios }); ov.remove(); toast(r.mensaje || "Hecho ✅"); loadFacturas(); }
    catch (e) { toast(e.message); }
  });
}

// ── Filtros de facturas ─────────────────────────────────────────────────────
// Los filtros viven en un panel lateral y su resumen se queda a la vista en forma de
// chips: se puede saber qué se está mirando —y quitarlo— sin abrir nada.
const FAC_TIPOS = [["factura", "Facturas"], ["albaran", "Albaranes"], ["ticket", "Tickets"], ["otro", "Otros"]];

function facFiltrosActivos() {
  const fuera = [];
  const et = (k, txt) => fuera.push({ k, txt });
  if (FACF.from || FACF.to) {
    et("fecha", FACF.from && FACF.to ? `${dpFmt(FACF.from)} → ${dpFmt(FACF.to)}`
      : FACF.from ? `Desde ${dpFmt(FACF.from)}` : `Hasta ${dpFmt(FACF.to)}`);
  }
  if (FACF.proveedor) et("proveedor", FACF.proveedor);
  if (FACF.empresa) et("empresa", FACF.empresa);
  if (FACF.tipo) et("tipo", FACF.tipo.split(",").map((t) => (FAC_TIPOS.find((x) => x[0] === t) || [, t])[1]).join(", "));
  if (FACF.estado) et("estado", FACF.estado === "pagada" ? "Pagadas" : "Pendientes");
  return fuera;
}

function facChipsHtml() {
  const act = facFiltrosActivos();
  if (!act.length) return "";
  return `<div class="fchips">${act.map((f) => `<span class="fchip"><b>${esc(f.txt)}</b>
    <button data-act="fac-quitar-filtro" data-k="${f.k}" title="Quitar" aria-label="Quitar filtro">✕</button></span>`).join("")}
    <button class="linkbtn" data-act="fac-limpiar-filtros" style="align-self:center">Quitar todos</button></div>`;
}

function facQuitarFiltro(k) {
  if (k === "fecha") { FACF.from = ""; FACF.to = ""; PERIODO_VISTA.facturas = "todo"; }
  else FACF[k] = "";
  loadFacturas();
}
function facLimpiarFiltros() {
  FACF = { ...FACF, empresa: "", estado: "", tipo: "", proveedor: "", from: "", to: "" };
  loadFacturas();
}

async function facAbrirFiltros() {
  // Los proveedores se piden al abrir, no al cargar la pantalla: es una lista que solo
  // hace falta aquí y así no se paga en cada visita a Facturas.
  let provs = [];
  try { provs = (await apiRaw("/api/facturas/proveedores" + (FACF.local ? "?local=" + encodeURIComponent(FACF.local) : ""))).data || []; } catch { /* el filtro se queda sin lista */ }
  let empresas = [];
  try { empresas = (await apiOptional("/api/facturas/empresas")) || []; } catch { /* idem */ }

  const tipos = String(FACF.tipo || "").split(",").filter(Boolean);
  const cuerpo = `
    <div class="drw-g"><span class="drw-gt">${ic("cal", 15)} Fecha del documento</span>
      <div class="drw-row">${dpField("fFrom", FACF.from, "Desde")}${dpField("fTo", FACF.to, "Hasta")}</div>
      <div class="drw-pills" style="margin-top:9px">
        <button class="drw-pill" data-rango="mes">Este mes</button>
        <button class="drw-pill" data-rango="mespasado">Mes pasado</button>
        <button class="drw-pill" data-rango="ano">Este año</button>
      </div>
    </div>

    <div class="drw-g"><span class="drw-gt">${ic("box", 15)} Proveedor</span>
      <select class="inp" id="fProv">
        <option value="">Todos los proveedores</option>
        ${provs.map((p) => `<option value="${esc(p.proveedor)}" ${FACF.proveedor === p.proveedor ? "selected" : ""}>${esc(p.proveedor)} (${p.n})</option>`).join("")}
      </select>
    </div>

    ${empresas.length > 1 ? `<div class="drw-g"><span class="drw-gt">${ic("idcard", 15)} Empresa</span>
      <select class="inp" id="fEmp"><option value="">Todas las empresas</option>
        ${empresas.map((e) => `<option value="${esc(e)}" ${FACF.empresa === e ? "selected" : ""}>${esc(e)}</option>`).join("")}
      </select></div>` : ""}

    <div class="drw-g"><span class="drw-gt">${ic("receipt", 15)} Tipo de documento</span>
      <div class="drw-pills" id="fTipos">${FAC_TIPOS.map(([v, l]) =>
        `<button class="drw-pill ${tipos.includes(v) ? "on" : ""}" data-tipo="${v}">${l}</button>`).join("")}</div>
    </div>

    <div class="drw-g"><span class="drw-gt">${ic("chart", 15)} Estado del pago</span>
      <div class="drw-pills" id="fEstados">
        <button class="drw-pill ${FACF.estado === "pagada" ? "on" : ""}" data-estado="pagada">Pagadas</button>
        <button class="drw-pill ${FACF.estado === "pendiente" ? "on" : ""}" data-estado="pendiente">Pendientes</button>
      </div>
    </div>`;

  const ov = drawer("Filtrar por", cuerpo, {
    onLimpiar: (d) => { d.cerrar(); facLimpiarFiltros(); },
    onAplicar: (d) => {
      PERIODO_VISTA.facturas = (d.querySelector("#fFrom").value || d.querySelector("#fTo").value) ? "custom" : "todo";
      FACF.from = d.querySelector("#fFrom").value || "";
      FACF.to = d.querySelector("#fTo").value || "";
      FACF.proveedor = d.querySelector("#fProv").value || "";
      FACF.empresa = d.querySelector("#fEmp")?.value || "";
      FACF.tipo = [...d.querySelectorAll("#fTipos .drw-pill.on")].map((b) => b.dataset.tipo).join(",");
      const est = d.querySelector("#fEstados .drw-pill.on");
      FACF.estado = est ? est.dataset.estado : "";
      d.cerrar();
      loadFacturas();
    },
  });

  // Pagada y pendiente se excluyen: encender una apaga la otra.
  ov.querySelector("#fEstados").addEventListener("click", (e) => {
    const b = e.target.closest(".drw-pill"); if (!b) return;
    ov.querySelectorAll("#fEstados .drw-pill").forEach((x) => { if (x !== b) x.classList.remove("on"); });
  });
  // Atajos de rango. Rellenan los dos campos de fecha de una vez.
  ov.addEventListener("click", (e) => {
    const r = e.target.closest("[data-rango]"); if (!r) return;
    r.classList.remove("on");   // es un atajo, no un estado que se quede encendido
    const hoy = new Date(), y = hoy.getFullYear(), m = hoy.getMonth();
    const iso = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
    let desde, hasta;
    if (r.dataset.rango === "mes") { desde = new Date(y, m, 1); hasta = new Date(y, m + 1, 0); }
    else if (r.dataset.rango === "mespasado") { desde = new Date(y, m - 1, 1); hasta = new Date(y, m, 0); }
    else { desde = new Date(y, 0, 1); hasta = new Date(y, 11, 31); }
    dpSet("fFrom", iso(desde)); dpSet("fTo", iso(hasta));
  });
}

// ── Selección de documentos ─────────────────────────────────────────────────
// Se marcan los que interesan y se actúa sobre ellos: exportarlos o ver el total de esa
// selección concreta. La selección se guarda por id, así que sobrevive a repintar la tabla
// al filtrar — que es justo el flujo real: filtras, marcas, filtras otra vez, marcas más.
let FAC_SEL = new Set();
let FAC_TOT = null, FAC_HAY_MAS = false;

/** Suma los agregados que devuelve el servidor (uno por local si se ven varios). */
function facSumaTotales(resp) {
  const ts = resp && resp.totales ? [resp.totales] : (resp && resp.partes) || [];
  if (!ts.length) return null;
  const suma = (k) => ts.reduce((s2, t) => s2 + (Number(t[k]) || 0), 0);
  return { docs: suma("docs"), base: suma("base"), iva: suma("iva"), total: suma("total"),
    pendientes: suma("pendientes"), porPagar: suma("por_pagar"),
    vencidas: suma("vencidas"), vencidoImporte: suma("vencido_importe"),
    semana: suma("semana"), semanaImporte: suma("semana_importe"),
    albaranes: suma("albaranes"), albaranesImporte: suma("albaranes_importe") };
}

/**
 * Las cuatro cifras de arriba. Salen SIEMPRE de lo que está filtrado, no del año entero: si
 * filtras un proveedor y las cifras siguen siendo las de todo el año, se leen como si fueran
 * de ese proveedor. El rótulo dice de qué son.
 */
function facKpisHtml() {
  const t = FAC_TOT;
  if (!t) return `<div id="facKpis"></div>`;
  const f = facFiltrosActivos();
  // Los albaranes NO suman: son la entrega, no el pago —la factura que los agrupa ya lleva ese
  // importe—. Pero se dice cuántos son y cuánto valen: esconderlos sin más sería otra forma de
  // que el número no cuadre con la tabla que hay debajo.
  // Los avisos, en chips y no en un párrafo: eran tres frases largas encima de la tabla que
  // empujaban las facturas fuera de la pantalla. Lo que explicaban se lee al pasar por encima,
  // que es cuando de verdad se quiere leer.
  const avisos = [];
  if (FAC_HAY_MAS) avisos.push([`<b>${num(t.docs)}</b> en total`, "", "Las cifras son de todas las que cumplen el filtro; abajo se enseñan las 500 más recientes."]);
  const nRev = (FAC_LIST || []).filter((f) => f.revisar).length;
  if (nRev) avisos.push([`<b>${num(nRev)}</b> por revisar`, "warn", "Algo no cuadra en lo leído (van marcadas como «revisar» en la tabla): base + IVA que no da el total, un NIF distinto del de siempre o un importe fuera de escala."]);
  if (t.albaranes) avisos.push([`<b>${num(t.albaranes)}</b> ${t.albaranes === 1 ? "albarán" : "albaranes"} · ${esc(eur(t.albaranesImporte))}`, "",
    "No suman: son la entrega, no el pago — su importe ya va en la factura que los agrupa. Se cruzan en Conciliaciones."]);
  const aviso = avisos.length
    ? `<div class="fchips" style="margin:0 0 12px">${avisos.map(([txt, cls, tit]) => `<span class="fchip ${cls}" title="${esc(tit)}">${txt}</span>`).join("")}</div>` : "";
  // LO QUE SE MIRA AL ABRIR ESTA PANTALLA no es cuánto se ha gastado —eso ya pasó— sino qué
  // hay que pagar y cuándo. Antes había cuatro tarjetas (facturas, base, IVA, total) que son
  // cuatro vistas del mismo número y ninguna contestaba eso: para saber si algo estaba
  // vencido había que irse a la pestaña de Pagos.
  //
  // La base y el IVA no desaparecen: se miran una vez al trimestre y ese sitio es el 303 y la
  // ficha, no la portada. Van en la línea de debajo.
  const kpi3 = `<div class="grid g3 statsm" style="margin-bottom:10px">
      ${stat("Por pagar", ic("receipt", 15), eur(t.porPagar), "", `${num(t.pendientes)} ${t.pendientes === 1 ? "documento" : "documentos"}`)}
      ${stat("Vence en 7 días", ic("cal", 15), eur(t.semanaImporte), "", `${num(t.semana)} ${t.semana === 1 ? "documento" : "documentos"}`)}
      <div class="card stat${t.vencidas ? " alerta" : ""}"><div class="lab"><span class="ci">${ic("alert", 15)}</span>Vencido</div>
        <div class="val tnum">${esc(eur(t.vencidoImporte))}</div>
        <div class="sub">${t.vencidas ? `${num(t.vencidas)} sin pagar` : "nada vencido"}</div></div>
    </div>`;
  const linea = `<p class="mut" style="margin:0 0 14px;font-size:12.5px">
    <b>${num(t.docs)}</b> ${t.docs === 1 ? "factura" : "facturas"}${f.length ? " con estos filtros" : ""} · total <b class="tnum">${esc(eur(t.total))}</b>
    <span style="opacity:.75">(base ${esc(eur(t.base))} · IVA ${esc(eur(t.iva))})</span></p>`;
  return `<div id="facKpis">${kpi3}${linea}${aviso}</div>`;
}

/** Los avisos de coherencia guardados con la factura (base+IVA≠total, NIF raro, importe fuera de escala). */
function facRevisarTxt(f) {
  if (!f || !f.revisar) return [];
  try { const a = JSON.parse(f.revisar); return Array.isArray(a) ? a : []; } catch { return []; }
}

/**
 * Las miniaturas del papel, cargadas de verdad.
 *
 * NO se puede poner `<img src="/api/facturas/1/miniatura">`: el panel se autentica con una
 * cabecera `Authorization`, y una imagen que pide el navegador por su cuenta no la lleva. Cada
 * miniatura recibía un 401 y el `onerror` la borraba sin decir nada, así que la columna salía
 * vacía y parecía que Drive no respondía. Se piden con fetch y se pintan como blob, igual que
 * la vista previa de los pendientes.
 *
 * Y solo las que se ven: con 500 filas, pedirlas todas de golpe son 500 peticiones a Drive por
 * abrir la pantalla. Con el observador, se piden al asomarse.
 */
let THUMB_OBS = null;
function facCargarMiniaturas(raiz) {
  const cajas = [...(raiz || document).querySelectorAll("[data-thumb]")];
  if (!cajas.length) return;
  if (!("IntersectionObserver" in window)) { cajas.forEach(facPintarMiniatura); return; }
  THUMB_OBS?.disconnect();
  THUMB_OBS = new IntersectionObserver((entradas, obs) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      obs.unobserve(e.target);
      facPintarMiniatura(e.target);
    }
  }, { rootMargin: "300px" });
  cajas.forEach((c) => THUMB_OBS.observe(c));
}

async function facPintarMiniatura(caja) {
  const id = caja.getAttribute("data-thumb");
  if (!id || caja.dataset.cargada) return;
  caja.dataset.cargada = "1";
  try {
    const r = await fetch(`/api/facturas/${encodeURIComponent(id)}/miniatura`, { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) { caja.remove(); return; }          // sin papel o sin Drive: la fila sigue igual
    const url = URL.createObjectURL(await r.blob());
    const img = new Image();
    img.className = "thumb";
    img.alt = "";
    img.src = url;
    img.onload = () => URL.revokeObjectURL(url);
    caja.replaceWith(img);
  } catch { caja.remove(); }
}

/**
 * El estado de pago de una factura. «Pendiente» a secas no dice nada: lo que se necesita saber
 * es si YA venció y cuánto hace. La lógica —y los umbrales— viven en el módulo puro; aquí solo
 * se elige el color.
 */
const PILL_PAGO = { vencida: "bad", hoy: "warn", semana: "warn", proxima: "", sin_fecha: "", pagada: "ok" };
function facPillPago(f) {
  // El estado lo calcula el servidor (`estado_pago`), que es quien tiene el módulo con los
  // umbrales y sus tests. Aquí solo se elige el color.
  const e = f.estado_pago || { estado: f.pagado ? "pagada" : "sin_fecha", texto: f.pagado ? "Pagada" : "Pendiente" };
  const clase = PILL_PAGO[e.estado] ?? "";
  const titulo = e.pista || (f.vencimiento ? `Vence el ${f.vencimiento}` : "");
  return `<span class="pill ${clase}"${titulo ? ` title="${esc(titulo)}"` : ""}>${esc(e.texto)}</span>`;
}

/**
 * Bandas de mes en las listas largas. Recorrer trescientas facturas leyendo fechas una a una no
 * es recorrer, es buscar. Con la banda, el ojo salta al mes y ya está.
 *
 * Solo a partir de treinta: en una lista corta, la banda sería más ruido que ayuda.
 */
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function bandasDeMes(list, fila, columnas, minimo = 30) {
  if (list.length < minimo) return list.map(fila).join("");
  let mes = "";
  return list.map((f) => {
    const ym = String(f.fecha || "").slice(0, 7);
    if (!ym || ym === mes) return fila(f);
    mes = ym;
    const [y, m] = ym.split("-").map(Number);
    return `<tr class="sepmes"><td colspan="${columnas}">${esc(cap(MES_LARGO[m - 1] || ""))} ${y}</td></tr>` + fila(f);
  }).join("");
}

function facTablaHtml(list) {
  if (!list.length) return `<div class="card"><div class="mut" style="padding:8px">Sin facturas con esos filtros.</div></div>`;
  const visibles = list.map((f) => f.id);
  const todasMarcadas = visibles.length > 0 && visibles.every((id) => FAC_SEL.has(id));
  // Dos cosas que no se veían y estaban guardadas: que el detalle no cuadra con la base
  // (`lineas_estado`) y que la factura ya está conciliada con sus albaranes (`conciliado_con`).
  // Guardar un estado y no enseñarlo es tenerlo para nadie.
  const marcas = (f) => [
    f.tipo && f.tipo !== "factura" ? `<span class="pill" style="font-size:10px">${esc(f.tipo)}</span>` : "",
    f.revisar ? `<span class="pill warn" style="font-size:10px" title="${esc(facRevisarTxt(f).join(" · "))}">revisar</span>` : "",
    f.lineas_estado === "descuadre" ? `<span class="pill warn" style="font-size:10px" title="El detalle leído no suma la base imponible">descuadre</span>` : "",
    f.conciliado_con ? `<span class="pill ok" style="font-size:10px" title="Conciliada con sus albaranes">conciliada</span>` : "",
  ].filter(Boolean).join(" ");
  // El establecimiento solo se enseña cuando hay más de uno a la vista: con el ámbito puesto
  // en Blanes, repetir «La Tapeta - Blanes» en cada fila es ancho gastado en decir lo que ya
  // pone la barra de arriba. Y la base imponible no se mira de un barrido —se mira en la ficha
  // y en el 303—: la columna que importa es el total.
  const conLocal = !localActualFE();
  const fila = (f) => `<tr class="${FAC_SEL.has(f.id) ? "sel" : ""} facrow" data-act="fac-ficha" data-id="${f.id}">
    <td class="facsel"><input type="checkbox" data-facsel="${f.id}" ${FAC_SEL.has(f.id) ? "checked" : ""} aria-label="Seleccionar"></td>
    <td class="facthumb">${f.drive_url ? `<span class="thumb ph" data-thumb="${f.id}"></span>` : ""}</td>
    <td class="mut" style="white-space:nowrap"><span class="hidesm">${esc(fechaCorta(f.fecha) || (f.fecha || "").slice(0, 10))}</span><span class="solosm">${esc(fechaMini(f.fecha) || (f.fecha || "").slice(0, 10))}</span></td>
    ${/* Manda el PROVEEDOR, no el número. Un número de factura no se reconoce —«250048061012013»
          no dice nada— y el proveedor sí: es como se busca una factura de memoria. */""}
    <td><div class="t1">${esc(f.proveedor || "Sin proveedor")}</div>
      <div class="t2" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${esc(f.numero_factura || "sin número")}${marcas(f)}</div></td>
    ${conLocal ? `<td class="mut">${esc(nombreCortoLocal(f.local) || "")}</td>` : ""}
    <td class="r tnum" style="white-space:nowrap"><b>${eur(f.total)}</b></td>
    <td>${facPillPago(f)}</td>
    <td class="r mut" aria-hidden="true">${ic("chev", 15)}</td></tr>`;
  return `<div class="card p0"><div class="tw${list.length > 25 ? " alta" : ""}"><table class="tbl">
    <thead><tr><th class="facsel"><input type="checkbox" id="facSelAll" ${todasMarcadas ? "checked" : ""} aria-label="Seleccionar todas"></th>
    <th class="facthumb"></th>
    <th>Fecha</th><th>Documento</th>${conLocal ? "<th>Local</th>" : ""}<th class="r">Total</th><th>Estado</th><th></th></tr></thead>
    <tbody>${bandasDeMes(list, fila, conLocal ? 8 : 7)}</tbody></table></div></div>${facBarraSeleccion()}`;
}

// Barra flotante que aparece al marcar algo. Va abajo, encima de la tabla, para no
// desplazar la lista al aparecer: si empujara el contenido, marcar la primera casilla
// movería todas las demás justo cuando se van a marcar.
function facBarraSeleccion() {
  const n = FAC_SEL.size;
  if (!n) return "";
  return `<div class="selbar">
    <b>${num(n)}</b> ${n === 1 ? "seleccionada" : "seleccionadas"}
    <div style="flex:1"></div>
    ${/* Marcar el pago es LA acción de esta pantalla: llega el recibo del banco con diez
          facturas de un proveedor y hasta ahora había que abrir las diez fichas una a una. */""}
    <button class="btn sm" data-act="fac-sel-pagar" data-pagado="1">Marcar pagadas</button>
    <button class="btn sm" data-act="fac-sel-pagar" data-pagado="0">Marcar sin pagar</button>
    <button class="btn sm" data-act="fac-sel-resumen">Ver totales</button>
    ${/* «Exportar» daba una hoja de cálculo. Lo que se manda al gestor —o lo que se guarda—
          son los papeles, así que eso es lo que hace ahora; los datos siguen a un botón. */""}
    <button class="btn sm" data-act="fac-sel-docs">Descargar documentos</button>
    <button class="btn sm" data-act="fac-sel-export" title="Solo los datos, en hoja de cálculo">CSV</button>
    <button class="btn sm" data-act="fac-sel-limpiar">Quitar selección</button>
  </div>`;
}

function facSelToggle(id, marcada) {
  const n = Number(id);
  if (marcada) FAC_SEL.add(n); else FAC_SEL.delete(n);
  facPintarSeleccion();
}
function facSelTodas(marcar) {
  for (const f of FAC_LIST) { if (marcar) FAC_SEL.add(f.id); else FAC_SEL.delete(f.id); }
  facRefresh();
}
function facSelLimpiar() { FAC_SEL = new Set(); facRefresh(); }

/**
 * Marcar como pagadas (o como sin pagar) las que estén seleccionadas.
 *
 * Se pregunta antes y se dice cuánto suma: marcar veinte facturas por error es fácil de hacer
 * y molesto de deshacer —hay que acordarse de cuáles eran—, y el importe es lo que hace parar
 * a tiempo si la selección no era la que se creía.
 */
async function facSelPagar(pagado) {
  const sel = FAC_LIST.filter((f) => FAC_SEL.has(f.id));
  if (!sel.length) return;
  const suma = sel.reduce((s2, f) => s2 + (Number(f.total) || 0), 0);
  const ok = await confirmModal(
    `Se marcan ${sel.length} ${sel.length === 1 ? "documento" : "documentos"} como ${pagado ? "PAGADOS" : "SIN PAGAR"} (${eur(suma)}).`,
    { ok: pagado ? "Marcar pagadas" : "Marcar sin pagar" });
  if (!ok) return;
  try {
    const r = await apiSend("POST", "/api/facturas/pago-lote", { ids: sel.map((f) => f.id), pagado: !!pagado });
    toast(`${r.tocadas} ${r.tocadas === 1 ? "documento" : "documentos"} ${pagado ? "marcados como pagados" : "marcados como pendientes"} ✅`);
    FAC_SEL = new Set();
    loadFacturas();
  } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// Solo repinta la barra y el resaltado de filas: repintar la tabla entera al marcar una
// casilla perdería el desplazamiento y se sentiría lento.
function facPintarSeleccion() {
  document.querySelectorAll("[data-facsel]").forEach((c) => {
    c.closest("tr")?.classList.toggle("sel", FAC_SEL.has(Number(c.dataset.facsel)));
  });
  const vis = FAC_LIST.map((f) => f.id);
  const all = document.getElementById("facSelAll");
  if (all) all.checked = vis.length > 0 && vis.every((id) => FAC_SEL.has(id));
  const vieja = document.querySelector(".selbar");
  const nueva = facBarraSeleccion();
  if (vieja) vieja.outerHTML = nueva || "";
  else if (nueva) document.getElementById("facRes")?.insertAdjacentHTML("beforeend", nueva);
}

// Totales de LO SELECCIONADO. Se calcula en el navegador sobre lo que ya está cargado: no
// hace falta ir al servidor para sumar lo que se está viendo.
function facSelResumen() {
  const sel = FAC_LIST.filter((f) => FAC_SEL.has(f.id));
  if (!sel.length) return;
  const suma = (k) => sel.reduce((s, f) => s + (Number(f[k]) || 0), 0);
  const porProveedor = {};
  for (const f of sel) { const k = f.proveedor || "—"; porProveedor[k] = (porProveedor[k] || 0) + (Number(f.total) || 0); }
  const porLocal = {};
  for (const f of sel) { const k = f.local || "—"; porLocal[k] = (porLocal[k] || 0) + (Number(f.total) || 0); }
  const pagadas = sel.filter((f) => f.pagado).length;
  const fechas = sel.map((f) => (f.fecha || "").slice(0, 10)).filter(Boolean).sort();
  const lista = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(k)}</div></div><b class="tnum">${esc(eur(v))}</b></div>`).join("");

  modal(`Totales de ${sel.length} ${sel.length === 1 ? "documento" : "documentos"}`, `
    <div class="grid g3" style="gap:12px;margin-bottom:16px">
      <div><div class="t2">Base imponible</div><div class="t1">${esc(eur(suma("base_imponible")))}</div></div>
      <div><div class="t2">IVA</div><div class="t1">${esc(eur(suma("cuota_iva")))}</div></div>
      <div><div class="t2">Total</div><div class="t1" style="font-size:19px">${esc(eur(suma("total")))}</div></div>
    </div>
    <p class="mut" style="margin:0 0 14px;line-height:1.55">
      ${fechas.length ? `Del <b>${esc(fechas[0])}</b> al <b>${esc(fechas[fechas.length - 1])}</b>. ` : ""}
      ${pagadas} ${pagadas === 1 ? "pagada" : "pagadas"} y ${sel.length - pagadas} ${sel.length - pagadas === 1 ? "pendiente" : "pendientes"}
      (<b>${esc(eur(sel.filter((f) => !f.pagado).reduce((s, f) => s + (Number(f.total) || 0), 0)))}</b> por pagar).</p>
    <details class="card fold" style="margin-bottom:10px"><summary><h3>Por proveedor</h3><span class="foldr"><span>${Object.keys(porProveedor).length}</span><span class="car">${ic("chev", 16)}</span></span></summary><div class="rows">${lista(porProveedor)}</div></details>
    <details class="card fold"><summary><h3>Por establecimiento</h3><span class="foldr"><span>${Object.keys(porLocal).length}</span><span class="car">${ic("chev", 16)}</span></span></summary><div class="rows">${lista(porLocal)}</div></details>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn" data-close>Cerrar</button>
      <button class="btn primary" data-act="fac-sel-export">Exportar estas ${sel.length}</button></div>`);
}

// Exportar SOLO lo seleccionado. Se manda la lista de ids y no los filtros: lo marcado
// puede venir de varias búsquedas distintas, y reconstruirlo con filtros no siempre se puede.
/**
 * DESCARGAR LOS DOCUMENTOS de lo seleccionado: la imagen o el PDF, que es lo que se pide
 * cuando alguien dice «expórtame estas facturas».
 *
 * Uno solo se descarga directamente; varios van en un ZIP que arma el servidor. Encadenar
 * descargas desde el navegador no vale: Safari se queda con la primera y Chrome pregunta.
 */
async function facSelDocumentos() {
  const ids = [...FAC_SEL];
  if (!ids.length) return;
  const sel = FAC_LIST.filter((f) => FAC_SEL.has(f.id));
  const sinArchivo = sel.filter((f) => !f.drive_url).length;
  if (sinArchivo === sel.length) return toast("Ninguna de las elegidas tiene archivo guardado");

  if (ids.length === 1) {
    // Con una sola no hay nada que empaquetar: se baja el papel tal cual.
    try {
      const r = await fetch(`/api/facturas/${ids[0]}/archivo?descargar=1`, { headers: { Authorization: "Bearer " + token() } });
      if (!r.ok) return toast("No se pudo descargar el documento");
      bajarBlob(await r.blob(), (sel[0]?.numero_factura || "factura") + guessExt(r.headers.get("content-type")));
      toast("Documento descargado ✅");
    } catch { toast("No se pudo descargar"); }
    return;
  }

  toast(`Preparando ${ids.length} documentos…`);
  try {
    const r = await fetch("/api/facturas/export.zip", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ ids }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); return toast(j.error || "No se pudo preparar la descarga"); }
    bajarBlob(await r.blob(), `facturas-${ids.length}.zip`);
    // Si alguna se ha quedado fuera se dice: un ZIP con menos facturas de las pedidas y en
    // silencio es una trampa.
    const faltan = Number(r.headers.get("X-Faltan")) || 0;
    toast(faltan ? `Descargado. ${faltan} sin archivo, así que no van dentro.`
      : `${ids.length} documentos descargados ✅`);
  } catch { toast("No se pudo preparar la descarga"); }
}

const guessExt = (mime) => (String(mime || "").includes("pdf") ? ".pdf"
  : String(mime || "").includes("png") ? ".png" : ".jpg");

function bajarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function facSelExport() {
  const ids = [...FAC_SEL];
  if (!ids.length) return;
  try {
    const r = await fetch("/api/facturas/export.csv", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ ids }),
    });
    if (!r.ok) return toast("No se pudo exportar");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a"); a.href = url;
    a.download = `facturas-seleccion-${ids.length}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast(`${ids.length} ${ids.length === 1 ? "documento exportado" : "documentos exportados"} ✅`);
  } catch { toast("No se pudo exportar"); }
}
/** El documento de una factura, en grande, dentro de su ficha. */
async function facPintarPapel(caja, id) {
  if (!caja) return;
  try {
    const r = await fetch(`/api/facturas/${encodeURIComponent(id)}/miniatura`, { headers: { Authorization: "Bearer " + token() } });
    // Que conteste no basta: si lo que vuelve no es una imagen —un error en JSON, por ejemplo—
    // pintarlo daría el icono de foto rota, que parece un fallo del panel y no una factura sin
    // vista previa. Se dice con palabras.
    const esImagen = r.ok && (r.headers.get("content-type") || "").startsWith("image/");
    if (!esImagen) {
      caja.classList.add("nofoto");
      caja.innerHTML = '<span class="mut" style="font-size:12px;text-align:center;padding:10px">Sin vista previa. El original sigue en Drive.</span>';
      return;
    }
    const url = URL.createObjectURL(await r.blob());
    const img = new Image();
    img.className = "fic-img"; img.alt = "Documento de la factura"; img.src = url;
    img.onload = () => URL.revokeObjectURL(url);
    caja.replaceWith(img);
  } catch { caja.classList.add("nofoto"); }
}

/**
 * LA FICHA DE UNA FACTURA.
 *
 * Era una rejilla de doce casillas iguales: el NIF pesaba lo mismo que el total, no se veía el
 * estado de pago, no se veía el detalle leído y —lo peor— no se veía EL PAPEL. Una ficha
 * existe para comparar lo leído con la factura de verdad, y para eso había que salir a Drive
 * en otra pestaña y volver.
 *
 * Ahora: el papel a la izquierda, los datos agrupados a la derecha —quién, documento, dinero—,
 * el estado arriba en píldoras y el detalle leído abajo, plegado. En móvil se apila, con el
 * papel primero: es lo que se mira antes de tocar nada.
 */
function facFicha(id) {
  const f = (FAC_LIST || []).find((x) => String(x.id) === String(id)); if (!f) { toast("Factura no encontrada"); return; }
  const fld = (lab, key, type = "text", extra = "") => `<div class="field"><label>${lab}</label><input data-fic="${key}" type="${type}" value="${esc(f[key] == null ? "" : f[key])}" ${extra}></div>`;
  const fechaFld = `<div class="field"><label>Fecha</label>${dpField("ficFecha", f.fecha, "Sin fecha", { attr: 'data-fic="fecha"' })}</div>`;
  const tipoSel = `<div class="field"><label>Tipo</label><select data-fic="tipo">${["factura", "albaran", "ticket", "otro"].map((t) => `<option value="${t}" ${f.tipo === t ? "selected" : ""}>${cap(t)}</option>`).join("")}</select></div>`;
  const localSel = `<div class="field"><label>Local</label><select data-fic="local"><option value="">—</option>${LOCALES.map((l) => `<option value="${esc(l)}" ${f.local === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  const revisar = facRevisarTxt(f);

  // Lo que ya se sabía de esta factura y no se enseñaba: si está pagada o cuándo vence, si su
  // detalle no cuadra, si ya está conciliada con sus albaranes.
  const pills = [
    facPillPago(f),
    f.tipo && f.tipo !== "factura" ? `<span class="pill">${esc(f.tipo)}</span>` : "",
    f.lineas_estado === "descuadre" ? '<span class="pill warn" title="El detalle leído no suma la base imponible">descuadre</span>' : "",
    f.conciliado_con ? '<span class="pill ok" title="Conciliada con sus albaranes">conciliada</span>' : "",
  ].filter(Boolean).join(" ");

  const ov = modal("Factura", `
    <div class="ficha">
      <div class="fic-doc">
        ${f.drive_url
          ? `<a href="${esc(f.drive_url)}" target="_blank" rel="noopener" title="Abrir el original en Drive"><span class="fic-ph" data-ficthumb="${esc(String(f.id))}"></span></a>
             <div style="display:flex;gap:6px">
               <a class="btn sm" href="${esc(f.drive_url)}" target="_blank" rel="noopener" style="flex:1;justify-content:center">Ver ↗</a>
               <button class="btn sm" id="ficBajar" style="flex:1">Descargar</button>
             </div>`
          : '<div class="fic-ph nofoto"><span class="mut" style="font-size:12px;text-align:center;padding:10px">Sin archivo guardado</span></div>'}
      </div>
      <div class="fic-datos">
        <div class="fic-cab">
          <div><h3 style="margin:0">${esc(f.proveedor || "Sin proveedor")}</h3>
            <div class="t2">${esc(f.numero_factura || "sin número")} · ${esc(fechaCorta(f.fecha) || "sin fecha")}</div></div>
          <div class="fic-pills">${pills}</div>
        </div>
        ${revisar.length ? `<p class="fic-nota" style="margin:0 0 12px"><b>Revisa lo leído.</b> ${revisar.map(esc).join(" ")}</p>` : ""}

        <div class="fic-g"><span class="fic-gt">Quién</span>
          <div class="form-grid">${fld("Proveedor", "proveedor")}${fld("NIF", "nif")}</div>
          ${fld("Concepto", "concepto")}
        </div>

        <div class="fic-g"><span class="fic-gt">Documento</span>
          <div class="form-grid">${fld("Nº documento", "numero_factura")}${fechaFld}${tipoSel}${localSel}</div>
          ${fld("Empresa", "empresa")}
        </div>

        <div class="fic-g"><span class="fic-gt">Dinero</span>
          <div class="form-grid">${fld("Base (€)", "base_imponible", "number")}${fld("IVA %", "porcentaje_iva", "number")}${fld("Cuota (€)", "cuota_iva", "number")}${fld("Total (€)", "total", "number")}</div>
          ${/* La comprobación que hace el resto del sistema, aquí y en vivo: base + cuota = total.
                Si no cuadra se dice mientras se escribe, que es cuando sirve de algo. */""}
          <div class="fic-suma" id="ficSuma"></div>
        </div>
      </div>
    </div>
    <details class="card fold" style="margin:14px 0 0" id="ficLineas">
      <summary><h3>Detalle leído</h3><span class="foldr"><span class="mut" id="ficNLin">ver</span><span class="car">${ic("chev", 16)}</span></span></summary>
      <div id="ficLinCuerpo"><p class="mut" style="margin:0">Cargando…</p></div>
    </details>
    <div class="fic-pie">
      <button class="linkbtn danger" id="ficDel">Eliminar factura</button>
      <div style="flex:1"></div>
      <button class="btn" data-close>Cerrar</button>
      <button class="btn" id="ficPago">${f.pagado ? "Marcar impagada" : "Marcar pagada"}</button>
      <button class="btn primary" id="ficSave">Guardar cambios</button>
    </div>`);
  ov.querySelector(".modal").classList.add("wide");

  // El papel. Mismo camino que las miniaturas de la lista —por el proxy y con nuestro token,
  // porque el navegador no puede mandarle el de Google a Drive— pero en grande.
  facPintarPapel(ov.querySelector("[data-ficthumb]"), f.id);

  // ── La suma, comprobada en vivo ───────────────────────────────────────────
  const val = (k) => Number(String(ov.querySelector(`[data-fic="${k}"]`)?.value || "").replace(",", ".")) || 0;
  function pintarSuma() {
    const base = val("base_imponible"), cuota = val("cuota_iva"), total = val("total");
    const caja = ov.querySelector("#ficSuma");
    if (!total) { caja.innerHTML = ""; return; }
    const dif = Math.round((base + cuota - total) * 100) / 100;
    caja.innerHTML = Math.abs(dif) <= 0.02
      ? `<span class="ok">✓ Base + IVA da el total (${esc(eur2(total))})</span>`
      : `<span class="mal">Base + IVA da ${esc(eur2(base + cuota))}, y el total dice ${esc(eur2(total))} — se lleva ${esc(eur2(Math.abs(dif)))}.</span>
         <button class="linkbtn" id="ficCuadrar">Recalcular la cuota</button>`;
  }
  ov.querySelectorAll('[data-fic="base_imponible"],[data-fic="cuota_iva"],[data-fic="total"],[data-fic="porcentaje_iva"]')
    .forEach((el) => el.addEventListener("input", pintarSuma));
  ov.addEventListener("click", (e) => {
    if (!e.target.closest("#ficCuadrar")) return;
    // La cuota es la única de las cuatro que se puede deducir sin dudar: base × IVA %.
    const base = val("base_imponible"), iva = val("porcentaje_iva");
    ov.querySelector('[data-fic="cuota_iva"]').value = Math.round(base * iva) / 100;
    ov.querySelector('[data-fic="total"]').value = Math.round((base + base * iva / 100) * 100) / 100;
    pintarSuma();
  });
  pintarSuma();

  // ── El detalle leído, solo al abrirlo: son otra consulta y casi nunca se mira ──
  const det = ov.querySelector("#ficLineas");
  det.addEventListener("toggle", async () => {
    if (!det.open || det.dataset.cargado) return;
    det.dataset.cargado = "1";
    const cuerpo = ov.querySelector("#ficLinCuerpo");
    try {
      const j = await apiRaw(`/api/facturas/${encodeURIComponent(id)}/lineas`);
      const ls = j.lineas || [];
      ov.querySelector("#ficNLin").textContent = ls.length ? `${num(ls.length)} línea${ls.length === 1 ? "" : "s"}` : "sin detalle";
      cuerpo.innerHTML = ls.length
        ? `<div class="tw"><table class="tbl"><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead>
           <tbody>${ls.map((l) => `<tr class="${l.dudosa ? "dudosa" : ""}">
             <td>${esc(l.descripcion || "—")}${l.dudosa ? ' <span class="pill warn" style="font-size:9.5px" title="No se leyó del todo: sus cantidades pueden no ser exactas">dudosa</span>' : ""}</td>
             <td class="r tnum">${l.cantidad != null ? esc(num(l.cantidad)) + (l.unidad ? " " + esc(l.unidad) : "") : "—"}</td>
             <td class="r tnum">${l.precio_unitario != null ? esc(eur2(l.precio_unitario)) : "—"}</td>
             <td class="r tnum"><b>${l.importe != null ? esc(eur2(l.importe)) : "—"}</b></td></tr>`).join("")}</tbody></table></div>`
        : `<p class="mut" style="margin:0">De esta factura no se ha leído el detalle por líneas.</p>`;
    } catch { cuerpo.innerHTML = '<p class="mut" style="margin:0">No se pudo cargar el detalle.</p>'; }
  });

  ov.querySelector("#ficBajar")?.addEventListener("click", async () => {
    try {
      const r = await fetch(`/api/facturas/${encodeURIComponent(id)}/archivo?descargar=1`, { headers: { Authorization: "Bearer " + token() } });
      if (!r.ok) return toast("No se pudo descargar el documento");
      bajarBlob(await r.blob(), (f.numero_factura || "factura") + guessExt(r.headers.get("content-type")));
    } catch { toast("No se pudo descargar"); }
  });
  ov.querySelector("#ficDel").addEventListener("click", async () => {
    if (!(await confirmModal("¿Eliminar esta factura? Se quitará de la BD y de los Sheets.", { ok: "Eliminar", danger: true }))) return;
    try { await apiSend("DELETE", "/api/facturas/" + id); ov.remove(); toast("Factura eliminada ✅"); loadFacturas(); } catch (e) { toast("Error: " + e.message); }
  });
  ov.querySelector("#ficSave").addEventListener("click", async () => {
    const body = {}; ov.querySelectorAll("[data-fic]").forEach((el) => { body[el.getAttribute("data-fic")] = el.value; });
    try { await apiSend("PATCH", "/api/facturas/" + id, body); ov.remove(); toast("Factura actualizada ✅"); loadFacturas(); } catch (e) { toast("Error: " + e.message); }
  });
  ov.querySelector("#ficPago").addEventListener("click", async () => {
    try { await apiSend("PATCH", "/api/facturas/" + id + "/pago"); ov.remove(); toast("Estado de pago actualizado"); loadFacturas(); } catch (e) { toast("Error: " + e.message); }
  });
}
async function facExport() { try { const r = await fetch("/api/facturas/export.csv" + (facQS() ? "?" + facQS() : ""), { headers: { Authorization: "Bearer " + token() } }); if (!r.ok) { toast("No se pudo exportar"); return; } const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "facturas.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); } catch { toast("No se pudo exportar"); } }
// ── Subir factura (pantalla del encargado) ──────────────────────────────────
// Se hace desde el móvil, de pie en la barra y con el albarán en la mano, así que es una sola
// pantalla: un botón grande de cámara, otro de archivo y la lista de lo que llevas subido hoy.
// NO se consulta ninguna otra ruta de facturas: el encargado no tiene permiso sobre ellas y
// pedirlas solo serviría para llenarle la pantalla de errores.
let SUBF = { enviando: 0, hechas: [] };

async function loadSubirFactura() {
  const view = document.getElementById("view");
  const local = localActualFE();
  const esEncargado = USER.rol === "encargado";

  const avisoLocal = esEncargado && !localFijadoFE()
    ? `<p class="fic-nota">Tu usuario no tiene establecimiento asignado, así que no se sabría a qué local pertenece la factura. Pídeselo a dirección antes de subir nada.</p>`
    : "";

  // A dirección y contabilidad sí se les deja elegir: pueden subir la de cualquier local.
  const selector = esEncargado ? "" : `<div class="field" style="width:100%;max-width:420px;margin:0 auto 14px">
      <label>Local</label>
      <select class="inp" id="sfLocal">
        <option value="">Detectarlo de la factura</option>
        ${LOCALES.map((l) => `<option value="${esc(l)}" ${l === local ? "selected" : ""}>${esc(l)}</option>`).join("")}
      </select></div>`;

  view.innerHTML = `<div class="ph"><div class="eyebrow">Contabilidad</div><h1>Subir factura</h1>
      <div class="sub">${esEncargado && local ? `Se guardará en <b>${esc(nombreCortoLocal(local))}</b>` : "Haz la foto o elige el archivo"}</div></div>
    ${avisoLocal}
    ${selector}
    <div class="subcard">
      <input type="file" id="sfCam" accept="image/*" capture="environment" multiple hidden>
      <input type="file" id="sfFile" accept="application/pdf,image/*" multiple hidden>
      <button class="subbig" data-act="sf-camara">
        <span class="subico">${ic("receipt", 30)}</span>
        <b>Hacer foto de la factura</b>
        <span>Se abre la cámara del móvil</span>
      </button>
      <button class="subalt" data-act="sf-archivo">o elegir un archivo (PDF o imagen)</button>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;cursor:pointer;justify-content:center">
        <input type="checkbox" id="sfCombinar" style="width:auto"> Son páginas de la <b>misma factura</b> (se unirán en un solo documento)
      </label>
      <p class="mut" style="margin:14px 0 0;font-size:12.5px;line-height:1.55">
        Se lee sola: proveedor, fecha, número, base, IVA y total. Se guarda en Drive en la carpeta de tu local
        y se avisa si esa factura ya estaba subida. Puedes mandar varias de una vez.</p>
    </div>
    <div id="sfLista"></div>`;
  sfPintarLista();
}

function sfPintarLista() {
  const caja = document.getElementById("sfLista"); if (!caja) return;
  if (!SUBF.hechas.length && !SUBF.enviando) { caja.innerHTML = ""; return; }
  const fila = (r) => `<div class="row">
      <span class="grow" style="min-width:0">
        <div class="t1">${r.ok ? esc(r.proveedor || r.filename) : esc(r.filename)}</div>
        <div class="t2">${r.ok
          ? (r.total != null ? esc(eur2(r.total)) : "sin total") + (r.pendiente ? " · falta asignarle local" : "")
          : `<span class="${r.duplicate ? "" : "fg-danger"}">${esc(r.error || "no se pudo")}</span>`}</div>
      </span>
      <span class="pill ${r.ok ? "ok" : r.duplicate ? "warn" : "bad"}" style="flex:none">${r.ok ? "Guardada" : r.duplicate ? "Ya estaba" : "Error"}</span>
    </div>`;
  caja.innerHTML = `<div class="card p0" style="margin-top:16px">
    <div class="ch" style="padding:16px 16px 0"><h3>Subidas en esta sesión</h3>
      <span class="mut" style="font-size:12px">${SUBF.enviando ? `enviando ${num(SUBF.enviando)}…` : `${num(SUBF.hechas.filter((x) => x.ok).length)} guardadas`}</span></div>
    <div class="rows">${SUBF.enviando ? `<div class="row"><span class="grow"><div class="t1">Leyendo la factura…</div><div class="t2">tarda unos segundos</div></span></div>` : ""}
      ${SUBF.hechas.map(fila).join("")}</div></div>`;
}

async function sfEnviar(files) {
  if (!files.length) return;
  SUBF.enviando = files.length; sfPintarLista();
  try {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    // Se manda el local que la pantalla PROMETE («Se guardará en X»). Al encargado no se le
    // pinta el selector —elige arriba, en la barra—, pero si lleva dos establecimientos hay
    // que decir en cuál está: antes se guardaba siempre en el principal aunque estuviera
    // mirando el otro. El servidor no se fía igualmente: solo acepta uno que sea suyo.
    const sel = document.getElementById("sfLocal");
    if (sel && sel.value) fd.append("local", sel.value);
    else { const suyo = localActualFE(); if (suyo) fd.append("local", suyo); }
    const comb = document.getElementById("sfCombinar");
    if (comb && comb.checked && files.length > 1) fd.append("combinar", "1");
    const r = await fetch("/api/facturas/subir", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
    const j = await r.json();
    if (!j.ok) { toast("No se pudo subir: " + (j.error || "error desconocido")); return; }
    // Las últimas arriba: es donde mira quien acaba de pulsar.
    SUBF.hechas = [...(j.resultados || []), ...SUBF.hechas].slice(0, 40);
    const okc = (j.resultados || []).filter((x) => x.ok).length;
    toast(okc === (j.resultados || []).length ? (okc === 1 ? "Factura guardada ✅" : `${okc} facturas guardadas ✅`)
      : `${okc} de ${(j.resultados || []).length} guardadas`);
  } catch (e) { toast("No se pudo subir: " + e.message); }
  finally { SUBF.enviando = 0; sfPintarLista(); }
}

function facSubir() {
  const localOpts = ['<option value="">Detectar automáticamente (por NIF, empresa o proveedor)</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`)).join("");
  const ov = modal("Subir facturas", `<div class="field" style="width:100%"><label>Archivos (PDF o imágenes, puedes elegir varios)</label><input type="file" id="fsFile" accept="application/pdf,image/*" multiple></div><div class="field" style="width:100%"><label>Local</label><select id="fsLocal">${localOpts}</select></div><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:10px"><input type="checkbox" id="fsCombinar" style="width:auto"> Son páginas de la <b>misma factura</b> (se unirán en un solo documento)</label><div class="mut" style="font-size:12px">Se procesan en segundo plano con la misma IA, orden en Drive y control de duplicados que WhatsApp/correo. Requiere Google conectado. Puedes cerrar y seguir trabajando; te aviso al terminar.</div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="fsSend">Subir y procesar</button></div>`);
  ov.querySelector("#fsSend").addEventListener("click", () => {
    const inp = ov.querySelector("#fsFile"); const files = inp && inp.files ? Array.from(inp.files) : [];
    if (!files.length) { toast("Elige al menos un archivo"); return; }
    const loc = ov.querySelector("#fsLocal").value;
    const combinar = !!(ov.querySelector("#fsCombinar") && ov.querySelector("#fsCombinar").checked);
    ov.remove(); // fuera la pantallita: sigue trabajando
    toast(combinar && files.length > 1 ? `Uniendo ${files.length} páginas en una sola factura…`
      : files.length === 1 ? `Subiendo «${files[0].name}» en segundo plano…` : `Subiendo ${files.length} facturas en segundo plano…`);
    (async () => {
      try {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        if (loc) fd.append("local", loc);
        if (combinar && files.length > 1) fd.append("combinar", "1");
        const r = await fetch("/api/facturas/subir", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
        const j = await r.json();
        if (!j.ok) { toast("⚠ Error al subir: " + (j.error || "desconocido")); return; }
        const rs = j.resultados || [];
        const okc = rs.filter((x) => x.ok).length;
        const dup = rs.filter((x) => x.duplicate).length;
        const err = rs.filter((x) => !x.ok && !x.duplicate).length;
        const pend = rs.filter((x) => x.ok && x.pendiente).length;
        let msg = `✅ ${okc}/${rs.length} procesadas`;
        if (pend) msg += ` · ${pend} pendiente(s) de asignar`;
        if (dup) msg += ` · ${dup} duplicada(s)`;
        if (err) msg += ` · ${err} con error`;
        toast(msg);
        if (err) rs.filter((x) => !x.ok && !x.duplicate).forEach((x) => toast(`⚠ ${x.filename}: ${x.error}`));
        if (CURRENT === "facturas") loadFacturas();
      } catch (e) { toast(`⚠ Error al subir: ${e.message}`); }
    })();
  });
}

function facLocalSelect(id, sel) { return `<select id="${id}"><option value="">Elegir local…</option>${LOCALES.map((l) => `<option value="${esc(l)}" ${sel === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`; }
// Un canal apuntando a un nombre que no es ningún establecimiento manda mal TODO lo que entre
// por él. Aquí es donde se ve, junto al canal, y no en un informe aparte.
function facLocalCelda(v) {
  return LOCALES.includes(String(v || "")) ? esc(v)
    : `${esc(v || "(vacío)")} <span class="pill warn" title="No es ningún establecimiento: lo que entre por aquí llegará mal vinculado">revisar</span>`;
}
function renderFacturasConfig() {
  // Empresas / CIF por local
  const emp = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Empresa y CIF por local</h3></div><div class="tw"><table class="tbl"><thead><tr><th>Local</th><th>Empresa</th><th>CIF</th><th>Local contable</th><th></th></tr></thead><tbody>${(FCFG.locales || []).map((l) => `<tr><td>${esc(l.local)}</td><td>${esc(l.empresa || "")}</td><td class="mut">${esc(l.cif || "")}</td><td class="mut">${esc(l.local_contable || "")}</td><td class="r"><button class="linkbtn" data-act="fac-loc-del" data-local="${esc(l.local)}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="5" class="mut">Sin empresas configuradas.</td></tr>'}</tbody></table></div><div class="toolbar" style="padding:12px 18px;margin:0">${facLocalSelect("flLocal")}<input id="flEmp" placeholder="Empresa"><input id="flCif" placeholder="CIF" style="max-width:120px"><input id="flCont" placeholder="Local contable" style="max-width:150px"><button class="btn primary" data-act="fac-loc-add">Guardar</button></div></div>`;
  // Reglas de email → local
  const reg = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Reglas de email → local</h3></div><div class="tw"><table class="tbl"><thead><tr><th>Email remitente</th><th>Local</th><th></th></tr></thead><tbody>${(FCFG.reglas || []).map((r) => `<tr><td>${esc(r.email)}</td><td>${facLocalCelda(r.local)}</td><td class="r"><button class="linkbtn" data-act="fac-mail-del" data-id="${r.id}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="3" class="mut">Sin reglas.</td></tr>'}</tbody></table></div><div class="toolbar" style="padding:12px 18px;margin:0"><input id="frEmail" placeholder="proveedor@email.com" type="email">${facLocalSelect("frLocal")}<button class="btn primary" data-act="fac-mail-add">Añadir</button></div></div>`;
  // Grupos de WhatsApp de facturas
  const grpOpt = (cur) => { let o = `<option value="">Grupo de WhatsApp…</option>`; const has = (FCFG.groups || []).some((g) => g.id === cur); if (cur && !has) o += `<option value="${esc(cur)}" selected>Grupo actual</option>`; o += (FCFG.groups || []).map((g) => `<option value="${esc(g.id)}">${esc(g.name || g.id)}</option>`).join(""); return o; };
  const grp = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Grupos de WhatsApp para facturas</h3></div><div class="tw"><table class="tbl"><thead><tr><th>Local</th><th>Grupo</th><th></th></tr></thead><tbody>${(FCFG.grupos || []).map((g) => `<tr><td>${facLocalCelda(g.local)}</td><td>${(FCFG.groups || []).find((x) => x.id === g.group_jid) ? esc((FCFG.groups.find((x) => x.id === g.group_jid)).name) : '<span class="pill ok">Vinculado</span>'}</td><td class="r"><button class="linkbtn" data-act="fac-grp-del" data-id="${g.id}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="3" class="mut">Sin grupos.</td></tr>'}</tbody></table></div><div class="toolbar" style="padding:12px 18px;margin:0">${facLocalSelect("fgLocal")}<select id="fgGroup">${grpOpt("")}</select><button class="btn primary" data-act="fac-grp-add">Vincular</button></div></div>`;
  // Modelo 303
  const trims = ["1", "2", "3", "4"];
  const d = FAC303.data;
  const m303res = FAC303.error ? `<div class="mut" style="padding:8px 18px 14px">${esc(FAC303.error)}</div>` : (d ? `<div class="rows">${(d.porTipoIva && d.porTipoIva.length) ? d.porTipoIva.map((t) => `<div class="row"><div class="grow"><div class="t1">IVA ${num(t.tipo_iva)}%</div><div class="t2">${num(t.num_docs)} doc(s) · base ${eur(t.base_total)}</div></div><b class="tnum">${eur(t.cuota_total)}</b></div>`).join("") : ""}${(d.totales ? `<div class="row" style="border-top:2px solid var(--border)"><div class="grow"><div class="t1">Base imponible</div><div class="t2">${num((d.totales.num_facturas) || 0)} facturas</div></div><b class="tnum">${eur(d.totales.base_total || 0)}</b></div><div class="row"><div class="grow"><div class="t1">Cuota de IVA</div></div><b class="tnum">${eur(d.totales.cuota_total || 0)}</b></div><div class="row"><div class="grow"><div class="t1">Total facturas</div></div><b class="tnum">${eur(d.totales.importe_total || 0)}</b></div>` : "")}${(d.otrosDocs && (d.otrosDocs.num_otros) ? `<div class="row"><div class="grow"><div class="t1">Otros documentos</div><div class="t2">${num(d.otrosDocs.num_otros || 0)} docs</div></div><b class="tnum">${eur(d.otrosDocs.total_otros || 0)}</b></div>` : "")}</div><div style="padding:10px 18px"><button class="btn sm" data-act="fac-303-csv">Exportar 303 (CSV)</button></div>` : `<div class="mut" style="padding:8px 18px 14px">Elige empresa y trimestre y pulsa Calcular.</div>`);
  const empOpts = `<option value="">Empresa…</option>` + (FCFG.empresas || []).map((e) => `<option value="${esc(e)}" ${FAC303.empresa === e ? "selected" : ""}>${esc(e)}</option>`).join("");
  const m303 = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Modelo 303 (IVA trimestral)</h3></div><div class="toolbar" style="padding:12px 18px;margin:0"><select id="m303emp">${empOpts}</select><select id="m303tri"><option value="">Trimestre…</option>${trims.map((t) => `<option value="${t}" ${FAC303.trimestre === t ? "selected" : ""}>${t}º trimestre</option>`).join("")}</select><button class="btn primary" data-act="fac-303">Calcular</button></div>${m303res}</div>`;
  // Integraciones Google (Drive/Sheets/Gmail)
  const ig = FCFG.integ || {};
  // OJO: `apiOptional` devuelve null si la petición falla, y pintar eso como «Sin conectar»
  // es mentir por omisión — que es justo lo que pasaba: Drive funcionaba (las facturas se
  // releían de ahí) y el panel decía que no había conexión. Sin respuesta se dice que no se
  // ha podido comprobar, que es la verdad.
  const drv = ig.drive || null, gm = ig.gmail || null;
  const estadoPill = (o, siOk) => o === null
    ? '<span class="pill warn" title="La comprobación no ha respondido; no quiere decir que esté desconectado">No se ha podido comprobar</span>'
    : `<span class="pill ${o.conectado ? "ok" : "bad"}">${o.conectado ? siOk : "Sin conectar"}</span>`;
  const master = FCFG.master || {};
  const integ = `<div class="card"><div class="ch"><h3>Integraciones (Google)</h3></div><div class="rows" style="padding:0">
    <div class="row" style="padding-left:0;padding-right:0"><div class="grow"><div class="t1">Drive / Sheets</div><div class="t2">Guarda y ordena las facturas por empresa/local/mes</div></div>${estadoPill(drv, "Conectado")}</div>
    <div class="row" style="padding-left:0;padding-right:0"><div class="grow"><div class="t1">Correo (Gmail)</div><div class="t2">${gm && gm.conectado ? `${num((gm.emails && gm.emails.length) || 0)} correos procesados` : "Lee las facturas que llegan por email"}</div></div>${estadoPill(gm, "Activo")}</div>
    <div class="row" style="padding-left:0;padding-right:0"><div class="grow"><div class="t1">Sheet maestro consolidado</div><div class="t2">${master.url ? "Todas las facturas de todos los locales en una hoja" : "Se crea al procesar la primera factura o al reconstruir"}</div></div>${master.url ? `<a class="link" href="${esc(master.url)}" target="_blank" rel="noopener">Abrir ↗</a>` : '<span class="pill">Sin crear</span>'}</div>
    <div class="row" style="padding-left:0;padding-right:0"><div class="grow"><div class="t1">Volcado a Sheets</div><div class="t2">${((drv && drv.pendientes_sheet) || 0) > 0 ? `${num(drv && drv.pendientes_sheet)} factura(s) pendientes de volcar (se reintenta solo cada 10 min)` : "Todo volcado. La BD es la fuente de verdad; los Sheets son su reflejo."}${drv && drv.ultimo_reintento ? ` · último reintento ${esc(String(drv.ultimo_reintento).slice(0, 16).replace("T", " "))}` : ""}</div></div>${drv === null ? '<span class="pill warn">No se ha podido comprobar</span>' : `<span class="pill ${(drv.pendientes_sheet || 0) > 0 ? "warn" : "ok"}">${(drv.pendientes_sheet || 0) > 0 ? "Pendiente" : "Al día"}</span>`}</div>
  </div><div class="toolbar" style="padding:12px 0 0"><a class="btn" href="/auth/google-facturas">${drv && drv.conectado ? "Reconectar Google" : "Conectar Google"}</a><button class="btn" data-act="fac-migrar">Reordenar Drive</button>${((drv && drv.pendientes_sheet) || 0) > 0 ? '<button class="btn primary" data-act="fac-reproyectar">Reintentar volcado</button>' : ""}<button class="btn" data-act="fac-reparar">Verificar y reparar Sheets</button><button class="btn danger" data-act="fac-empezar-cero">Empezar de cero</button></div><div class="mut" style="font-size:12px;margin-top:6px">"Reparar" reescribe todas las hojas y el maestro desde la base de datos (la fuente de verdad). "Empezar de cero" limpia todas las facturas de la base de datos (no borra Drive; eso se hace a mano).</div></div>`;
  // Carpetas de Drive vigiladas (tercer canal de ingesta)
  const carp = FCFG.carpetas || [];
  const drive = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Carpetas de Drive vigiladas</h3></div><div class="mut" style="padding:0 18px;font-size:12.5px">Deja una factura (PDF/imagen) en la carpeta de Drive de un local y entrará sola cada pocos minutos.</div><div class="tw"><table class="tbl"><thead><tr><th>Local</th><th>Carpeta</th><th></th></tr></thead><tbody>${carp.map((c) => `<tr><td>${facLocalCelda(c.local)}</td><td class="mut">${c.folder_url ? `<a class="link" href="${esc(c.folder_url)}" target="_blank" rel="noopener">${esc(c.folder_id)}</a>` : esc(c.folder_id)}</td><td class="r"><button class="linkbtn" data-act="fac-drive-del" data-local="${esc(c.local)}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="3" class="mut">Sin carpetas configuradas.</td></tr>'}</tbody></table></div><div class="toolbar" style="padding:12px 18px;margin:0">${facLocalSelect("fdLocal")}<input id="fdFolder" placeholder="Enlace o ID de la carpeta de Drive" style="flex:1;min-width:0"><button class="btn primary" data-act="fac-drive-add">Vincular</button></div></div>`;
  // Repasar hacia atrás. Va en Configuración y no en la lista de facturas porque es una
  // tarea de mantenimiento que se hace de tarde en tarde, no algo del día a día.
  const repaso = `<div class="card"><div class="ch"><h3>Repasar las facturas ya guardadas</h3></div>
    <p class="mut" style="margin:0;line-height:1.6">Las comprobaciones se han ido añadiendo con el tiempo y todas actúan sobre la factura que <b>entra</b>, así que las de antes se quedaron sin pasar por ellas. Esto las repasa hacia atrás:</p>
    <ul class="mut" style="margin:8px 0 0;padding-left:18px;line-height:1.6">
      <li><b>Coherencia:</b> base + IVA = total, el NIF de siempre, importes fuera de escala.</li>
      <li><b>Repetidas:</b> la misma factura metida dos veces. Se <b>aparta</b> para que alguien decida; no se borra nada.</li>
      <li><b>Descuentos por línea:</b> vuelve a leer el documento para guardar lo que se paga y no la tarifa. Esto sí tarda: es una descarga y una lectura por factura.</li>
    </ul>
    <p class="mut" style="margin:8px 0 0;line-height:1.6">Primero enseña lo que encontraría. No cambia nada hasta que lo confirmes.</p>
    <div class="toolbar" style="padding:12px 0 0"><button class="btn primary" data-act="fac-repaso">Repasar</button></div></div>`;
  return `${facHeader()}<div id="facDrive"></div><div id="facProvDup"></div><div id="facCats"></div><div class="grid g2">${emp}${reg}</div><div class="grid g2" style="margin-top:16px">${grp}${m303}</div><div style="margin-top:16px">${drive}</div><div style="margin-top:16px">${repaso}</div><div style="margin-top:16px">${integ}</div>`;
}

async function loadFacturas() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  facScope(); // el ámbito lo fija el selector de establecimiento de la barra superior
  try {
    if (FACTAB === "config") {
      const [locales, reglas, grupos, empresas, groups, integDrive, integGmail, carpetas, master] = await Promise.all([
        apiOptional("/api/facturas/locales"), apiOptional("/api/facturas/email-reglas"), apiOptional("/api/facturas/grupos"), apiOptional("/api/facturas/empresas"), apiOptional("/api/whatsapp/groups"),
        apiOptional("/api/facturas/status"), apiOptional("/api/facturas/gmail-status"), apiOptional("/api/facturas/drive-carpetas"),
        (async () => { try { return await apiRaw("/api/facturas/master"); } catch { return null; } })(),
      ]);
      FCFG = { locales: locales || [], reglas: reglas || [], grupos: grupos || [], empresas: empresas || [], groups: groups || [], integ: { drive: integDrive, gmail: integGmail }, carpetas: carpetas || [], master: master || null };
      view.innerHTML = renderFacturasConfig();
      facCargarCategorias(); facDiagnosticoDrive(); facProvDuplicados();   // no se esperan: la configuración ya está
      return;
    }
    if (FACTAB === "pagos") return loadPagos();
    if (FACTAB === "conciliar") return loadConciliacion();
    // Igual que en reservas: una petición por local y se juntan las filas.
    const [lst, pend, stats, empresas] = await Promise.all([
      pidePorLocales((loc) => { const q = facQS(loc); return "/api/facturas" + (q ? "?" + q : ""); }, { raw: true }),
      apiOptional("/api/facturas/pendientes"),
      // El resumen viene YA AGREGADO del servidor y es de UN local. Viendo varios juntos
      // enseñaría el de uno solo junto a una tabla con los dos, que es la peor mezcla posible:
      // un número que parece el total y no lo es. Se pide solo cuando hay un local.
      viendoVarios() ? Promise.resolve(null)
        : apiOptional("/api/facturas/stats" + (FACF.local ? "?local=" + encodeURIComponent(FACF.local) : "")),
      apiOptional("/api/facturas/empresas"),
    ]);
    // Los totales vienen del servidor con el MISMO filtro y sin el tope de 500. Con varios
    // locales se suman los de cada uno: es exacto porque una factura es de un solo local.
    FAC_LIST = (lst && lst.data) || [];
    FAC_TOT = facSumaTotales(lst);
    FAC_HAY_MAS = !!(lst && lst.hayMas);
    FAC_PEND = pend || [];
    view.innerHTML = renderFacturas(FAC_LIST, FAC_PEND, stats, empresas || []);
    facCargarMiniaturas(view);
    facAvisoLocales(); facAvisoCategorias(); facDuplicados(); // no se esperan: la tabla ya está
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
// `ir` = true cuando se llama desde OTRA pantalla (Productos): hay que cambiar de vista, no
// solo de pestaña, o se pintaría Compras dejando el menú marcando donde no se está.
function facTab(tab, ir = false) {
  FACTAB = tab;
  if (ir && CURRENT !== "facturas") return go("facturas");
  escribirUrl("facturas", tab);
  loadFacturas();
}

// ── Pagos ───────────────────────────────────────────────────────────────────
// «¿Qué hay que pagar esta semana?». Hasta ahora se sabía CUÁNTO se debe pero no CUÁNDO, y un
// total de deuda no se paga: se pagan facturas con fecha.
//
// Lo primero de la pantalla es lo que ya se debía, y lo último las que no tienen fecha — que no
// es «no urgente», es «no se sabe», y por eso van con su aviso y no escondidas.
async function loadPagos() {
  const view = document.getElementById("view");
  view.innerHTML = facHeader() + `<div id="pagosRes"><p class="mut">Mirando vencimientos…</p></div>`;
  let j;
  try { j = await apiRaw("/api/facturas/pagos"); }
  catch (e) { document.getElementById("pagosRes").innerHTML = errorCard(e.message); return; }

  const r = j.resumen || {};
  const kpis = `<div class="grid g3" style="margin-bottom:16px">
      ${stat("Ya vencidas", "⏰", eur(r.vencidas?.total || 0), null, `${num(r.vencidas?.n || 0)} ${r.vencidas?.n === 1 ? "factura" : "facturas"}`)}
      ${stat("Esta semana", "€", eur(r.semana?.total || 0), null, `${num(r.semana?.n || 0)} ${r.semana?.n === 1 ? "factura" : "facturas"} · incluye hoy`)}
      ${stat("Sin fecha de pago", "❔", eur(r.sinFecha?.total || 0), null, `${num(r.sinFecha?.n || 0)} ${r.sinFecha?.n === 1 ? "factura" : "facturas"}`)}
    </div>`;

  // Lo que hay que arreglar para que el grupo «sin fecha» deje de existir, y con quién.
  const aviso = (j.provsSinCondiciones || []).length
    ? `<p class="fic-nota">Hay facturas sin fecha de pago porque no sabemos a cuántos días paga
       ${j.provsSinCondiciones.length === 1 ? "este proveedor" : "estos proveedores"}:
       <b>${j.provsSinCondiciones.map(esc).join("</b>, <b>")}</b>. Se pone una vez en su ficha —desde
       <b>Configuración → De qué es cada proveedor</b> o pulsando su nombre aquí— y vale para todas las suyas.</p>`
    : "";

  // Un recibo mensual es UNA línea con su total: en el banco sale un cargo, no doce. Se puede
  // desplegar para ver de qué facturas sale, que es lo que se mira cuando no cuadra.
  const filaRecibo = (g) => `<details class="row" style="display:block"><summary style="display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none">
      <div class="grow" style="min-width:0">
        <div class="t1"><button class="linkbtn" data-pago="prov" data-prov="${esc(g.proveedor || "")}">${esc(g.proveedor || "—")}</button>
          <span class="pill" style="margin-left:6px">${g.domiciliado ? "recibo · por banco" : "recibo mensual"}</span></div>
        <div class="t2">${num(g.facturas.length)} ${g.facturas.length === 1 ? "factura" : "facturas"} de ${esc(mesDeFacturas(g.facturas))} · ${esc(g._estado?.texto || "")}</div>
      </div>
      <b class="tnum">${esc(eur(g.total))}</b>
      <span class="mut" style="font-size:12px">ver</span></summary>
    <div class="rows" style="margin:6px 0 0 12px;border-left:2px solid var(--border);padding-left:12px">
      ${g.facturas.map((f) => `<div class="row" style="padding:6px 0">
        <div class="grow"><span class="t2">${esc(fechaCorta(f.fecha) || "")} · nº ${esc(f.numero_factura || "s/n")} · ${esc(nombreCortoLocal(f.local))}</span></div>
        <span class="tnum">${esc(eur(f.total))}</span>
        <button class="btn sm" data-act="fac-ficha" data-id="${f.id}">Ficha</button></div>`).join("")}
      <div class="row" style="padding:8px 0 2px"><div class="grow mut" style="font-size:12px">Se cargan juntas el ${esc(fechaCorta(g.vencimiento) || "")}.</div>
        <button class="btn sm" data-pago="recibo" data-ids="${g.facturas.map((f) => f.id).join(",")}">Marcar el recibo como pagado</button></div>
    </div></details>`;

  // De qué mes son las facturas de un recibo: es lo que le da sentido al cargo.
  const mesDeFacturas = (fs) => {
    const f = fs.find((x) => x.fecha)?.fecha || "";
    const [y, m] = String(f).split("-");
    if (!y || !m) return "—";
    return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(Number(y), Number(m) - 1, 15));
  };

  const fila = (f) => f.esRecibo ? filaRecibo(f) : `<div class="row"><div class="grow" style="min-width:0">
      <div class="t1"><button class="linkbtn" data-pago="prov" data-prov="${esc(f.proveedor || "")}">${esc(f.proveedor || "—")}</button>
        <span class="mut" style="font-weight:400">· nº ${esc(f.numero_factura || "s/n")}</span></div>
      <div class="t2">${esc(fechaCorta(f.fecha) || "")} · ${esc(nombreCortoLocal(f.local))}${f._estado?.dias != null && f._estado.dias < 0 ? ` · <b>${esc(f._estado.texto)}</b>` : f._estado ? ` · ${esc(f._estado.texto)}` : ""}${f.vencimiento_origen === "factura" ? ` <span class="mut" title="La fecha viene escrita en la propia factura">· del papel</span>` : ""}</div>
    </div>
    <b class="tnum">${esc(eur(f.total))}</b>
    <button class="btn sm" data-pago="pagada" data-id="${f.id}" title="Marcar como pagada">Pagada</button>
    <button class="btn sm" data-act="fac-ficha" data-id="${f.id}">Ficha</button></div>`;

  const grupos = (j.grupos || []).map((g) => {
    if (!g.n) return "";
    return `<div class="card p0" style="margin-bottom:14px">
      <div class="ch" style="padding:16px 18px 6px"><h3>${esc(g.titulo)} <span class="mut" style="font-weight:400">· ${num(g.n)}</span></h3>
        <b class="tnum">${esc(eur(g.total))}</b></div>
      ${g.nota ? `<p class="mut" style="margin:0 18px 6px;font-size:12.5px">${esc(g.nota)}</p>` : ""}
      <div class="rows">${g.facturas.map(fila).join("")}</div></div>`;
  }).join("");

  const nada = !(j.grupos || []).some((g) => g.n);
  document.getElementById("pagosRes").innerHTML = kpis + aviso +
    (nada ? `<div class="card"><p class="mut" style="margin:0">No queda nada por pagar. Todas las facturas del ámbito están marcadas como pagadas.</p></div>` : grupos);

  document.getElementById("pagosRes")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pago]");
    if (!b) return;
    if (b.getAttribute("data-pago") === "prov") return facProveedorFicha(b.getAttribute("data-prov"));
    if (b.getAttribute("data-pago") === "recibo") {
      const ids = (b.getAttribute("data-ids") || "").split(",").filter(Boolean);
      if (!await confirmModal(`Se marcarán como pagadas las ${ids.length} facturas de este recibo.`, { ok: "Marcar" })) return;
      b.disabled = true;
      try {
        for (const id of ids) await apiSend("PATCH", "/api/facturas/" + id + "/pago");
        toast(`Recibo marcado: ${ids.length} facturas ✅`); loadPagos();
      } catch (err) { toast("Error: " + err.message); b.disabled = false; }
      return;
    }
    const id = b.getAttribute("data-id");
    b.disabled = true;
    try { await apiSend("PATCH", "/api/facturas/" + id + "/pago"); toast("Marcada como pagada ✅"); loadPagos(); }
    catch (err) { toast("Error: " + err.message); b.disabled = false; }
  });
}

// ── Conciliaciones ──────────────────────────────────────────────────────────
// El proveedor deja un albarán por entrega y a fin de mes manda UNA factura que las agrupa.
// Aquí se ve si esa factura recoge todos sus albaranes —y si cobra algo que no se entregó—.
// Se PROPONE; confirmar es de una persona: dar por buena una conciliación equivocada es peor
// que no tener ninguna, porque se paga creyendo que está comprobada.
let CONC = { from: "", to: "", filtro: "parcial" };
const CONC_FILTROS = [["parcial", "Por revisar"], ["conciliada-parcial", "A medias"], ["cuadra", "Cuadran"], ["sin-albaranes", "Sin albarán"], ["conciliada", "Ya conciliadas"], ["", "Todas"]];

async function loadConciliacion() {
  const view = document.getElementById("view");
  if (!CONC.from) { const d = new Date(); d.setMonth(d.getMonth() - 2); CONC.from = d.toISOString().slice(0, 10); }
  view.innerHTML = facHeader() + `<div id="concRes"><p class="mut">Cruzando albaranes y facturas…</p></div>`;
  await refrescarConciliacion();
  const cont = document.getElementById("concRes");
  cont?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-conc]");
    if (!b) return;
    const w = b.getAttribute("data-conc");
    if (w === "filtro") { CONC.filtro = b.getAttribute("data-v"); return refrescarConciliacion(); }
    if (w === "marcados") return concMarcados(b.getAttribute("data-id"));
    if (w === "deshacer") return concConfirmar(b.getAttribute("data-id"), "");
  });
  cont?.addEventListener("change", (e) => {
    if (e.target.id === "concFrom") { CONC.from = e.target.value; refrescarConciliacion(); }
    if (e.target.id === "concTo") { CONC.to = e.target.value; refrescarConciliacion(); }
    if (e.target.classList?.contains("concChk")) concPintarSuma(e.target.getAttribute("data-f"));
  });
}

async function refrescarConciliacion() {
  const cont = document.getElementById("concRes"); if (!cont) return;
  const qs = new URLSearchParams();
  if (CONC.from) qs.set("from", CONC.from);
  if (CONC.to) qs.set("to", CONC.to);
  let j;
  try { j = await apiRaw("/api/facturas/conciliacion?" + qs); } catch (e) { cont.innerHTML = errorCard(e.message); return; }
  const r = j.resumen;
  const lista = (j.propuestas || []).filter((p) => !CONC.filtro || p.estado === CONC.filtro);

  const pills = CONC_FILTROS.map(([v, t]) => {
    const n = v ? (j.propuestas || []).filter((p) => p.estado === v).length : (j.propuestas || []).length;
    return `<button class="btn sm ${CONC.filtro === v ? "primary" : ""}" data-conc="filtro" data-v="${v}">${t} · ${num(n)}</button>`;
  }).join("");

  const barra = `<div class="toolbar" style="margin-bottom:10px">
      <div class="field"><label>Desde</label>${dpField("concFrom", CONC.from, "Cualquiera")}</div>
      <div class="field"><label>Hasta</label>${dpField("concTo", CONC.to, "Hoy")}</div>
    </div><div class="toolbar" style="margin-bottom:12px">${pills}</div>`;

  const kpis = `<div class="grid g4" style="margin-bottom:16px">
      ${stat("Cuadran", "✅", num(r.cuadran))}
      ${stat("Por revisar", "⚠️", num(r.parciales))}
      ${stat("En juego", "€", eur(r.importeParcial))}
      ${r.aMedias ? stat("A medias · falta", "⏳", esc(eur(r.importeAMedias))) : stat("Albaranes sueltos", "📦", num(j.albaranesSueltos))}
    </div>`;

  // Cada albarán con su casilla: se pueden aceptar unos y descartar otros. Y no hace falta que
  // sumen el total — si de una factura de 100 € solo ha llegado un albarán de 40, esos 40 ya
  // están comprobados y los 60 quedan esperando. Obligar a tenerlo todo para poder marcar algo
  // hace que no se marque nunca, y el trabajo hecho se pierde.
  const albRow = (a, fid, marcado) => `<label class="row" style="padding:7px 0;cursor:pointer">
      <input type="checkbox" class="concChk" data-f="${fid}" data-id="${a.id}" data-total="${a.total}" ${marcado ? "checked" : ""} style="width:auto;margin:0 8px 0 0">
      <span class="grow"><div class="t1" style="font-weight:500">${esc(fechaCorta(a.fecha) || a.fecha || "—")} · ${esc(a.numero_factura || "s/n")}</div></span>
      <b class="tnum">${esc(eur2(a.total))}</b>
      ${a.drive_url ? `<a class="btn sm" href="${esc(a.drive_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Ver ↗</a>` : ""}</label>`;

  const ficha = (p) => {
    const f = p.factura;
    const est = p.estado === "cuadra" ? ["ok", "Cuadra"] : p.estado === "conciliada" ? ["brand", "Conciliada"]
      : p.estado === "conciliada-parcial" ? ["warn", `A medias · faltan ${eur2(p.falta || 0)}`]
      : p.estado === "parcial" ? ["warn", "Por revisar"] : ["", "Sin albarán"];
    const ligados = (p.albaranes || []).map((a) => a.id);
    const todos = [...(p.albaranes || []), ...(p.candidatos || [])];
    return `<div class="dupcard" data-fcard="${f.id}">
      <div class="row" style="padding:0 0 10px;border:0">
        <span class="grow" style="min-width:0">
          <div class="t1">${esc(f.proveedor || "—")} · ${esc(f.numero_factura || "s/n")}</div>
          <div class="t2">${esc(fechaCorta(f.fecha) || f.fecha || "")} · ${esc(nombreCortoLocal(f.local) || "")}</div>
        </span>
        <b class="tnum" style="font-size:16px">${esc(eur2(f.total))}</b>
        <span class="pill ${est[0]}" style="flex:none">${est[1]}</span>
      </div>
      <p class="dupmot">${esc(p.motivos.join(". "))}.</p>
      ${todos.length ? `<div class="rows" style="background:var(--surface2);border-radius:10px;padding:4px 12px">${todos.map((a) => albRow(a, f.id, ligados.includes(a.id) || p.estado === "cuadra" || p.estado === "parcial")).join("")}</div>
        <div class="mut" data-concsuma="${f.id}" style="font-size:12.5px;margin-top:6px"></div>` : ""}
      <div class="dupacts">
        ${f.drive_url ? `<a class="btn sm" href="${esc(f.drive_url)}" target="_blank" rel="noopener">Ver factura ↗</a>` : ""}
        ${p.estado === "conciliada" || p.estado === "conciliada-parcial"
          ? `<button class="btn sm" data-conc="deshacer" data-id="${f.id}">Deshacer</button>` : ""}
        ${todos.length ? `<button class="btn sm ${p.estado === "cuadra" ? "primary" : ""}" data-conc="marcados" data-id="${f.id}" data-total="${f.total}">Conciliar los marcados</button>` : ""}
      </div></div>`;
  };

  cont.innerHTML = `${kpis}${barra}
    ${r.parciales ? `<p class="fic-nota">Las de <b>por revisar</b> son las que importan: o falta un albarán por subir, o la factura cobra algo que no se entregó. <b>${esc(eur(r.importeParcial))}</b> en juego.</p>` : ""}
    ${lista.length ? lista.map(ficha).join("") : `<div class="card"><div class="mut" style="padding:8px">No hay facturas en este estado dentro del periodo.</div></div>`}`;
  lista.forEach((p) => concPintarSuma(p.factura.id));
}

/** Lo que suman las casillas marcadas de una factura, y cuánto falta para su total. */
function concPintarSuma(fid) {
  const card = document.querySelector(`[data-fcard="${CSS.escape(String(fid))}"]`);
  const caja = document.querySelector(`[data-concsuma="${CSS.escape(String(fid))}"]`);
  if (!card || !caja) return;
  const total = Number(card.querySelector('[data-conc="marcados"]')?.getAttribute("data-total")) || 0;
  const marcados = [...card.querySelectorAll(".concChk:checked")];
  const suma = marcados.reduce((s2, c) => s2 + (Number(c.getAttribute("data-total")) || 0), 0);
  const falta = Math.round((total - suma) * 100) / 100;
  if (!marcados.length) { caja.innerHTML = "Sin marcar nada, se deshace la conciliación."; return; }
  caja.innerHTML = Math.abs(falta) < 0.02
    ? `<b>${marcados.length}</b> marcados · ${esc(eur2(suma))} — cuadra con la factura.`
    : falta > 0
      ? `<b>${marcados.length}</b> marcados · ${esc(eur2(suma))} de ${esc(eur2(total))} — quedarían <b>${esc(eur2(falta))}</b> esperando albarán.`
      : `<b>${marcados.length}</b> marcados · ${esc(eur2(suma))}, que es <b>${esc(eur2(Math.abs(falta)))}</b> MÁS que la factura. Revísalo.`;
}

async function concMarcados(fid) {
  const card = document.querySelector(`[data-fcard="${CSS.escape(String(fid))}"]`);
  if (!card) return;
  const marcados = [...card.querySelectorAll(".concChk:checked")];
  const ids = marcados.map((c) => Number(c.getAttribute("data-id")));
  if (!ids.length) return concConfirmar(fid, "");
  const total = Number(card.querySelector('[data-conc="marcados"]')?.getAttribute("data-total")) || 0;
  const suma = marcados.reduce((s2, c) => s2 + (Number(c.getAttribute("data-total")) || 0), 0);
  const falta = Math.round((total - suma) * 100) / 100;
  const aviso = Math.abs(falta) < 0.02
    ? `¿Dar por buena esta factura con ${ids.length} albarán(es)?`
    : falta > 0
      ? `Se conciliará con ${ids.length} albarán(es) por ${eur2(suma)}. Quedan ${eur2(falta)} esperando albarán: seguirá saliendo como «a medias» hasta que llegue.`
      : `Los albaranes marcados suman ${eur2(Math.abs(falta))} MÁS que la factura. ¿Seguro?`;
  if (!(await confirmModal(`${aviso} Quedará registrado quién y cuándo, y esos albaranes no podrán usarse en otra factura.`, { ok: "Conciliar" }))) return;
  try { const r = await apiSend("POST", `/api/facturas/${fid}/conciliar`, { albaranes: ids }); toast(r.mensaje || "Hecho ✅"); refrescarConciliacion(); }
  catch (e) { toast(e.message); }
}

async function concConfirmar(id, albs) {
  const ids = String(albs || "").split(",").filter(Boolean).map(Number);
  const deshacer = !ids.length;
  if (!(await confirmModal(deshacer
    ? "¿Deshacer la conciliación? Los albaranes vuelven a quedar sueltos."
    : `¿Dar por buena esta factura con ${ids.length} albarán(es)? Quedará registrado quién y cuándo, y esos albaranes no podrán usarse en otra factura.`,
    { ok: deshacer ? "Deshacer" : "Confirmar", danger: deshacer }))) return;
  try { const r = await apiSend("POST", `/api/facturas/${id}/conciliar`, { albaranes: ids }); toast(r.mensaje || "Hecho ✅"); refrescarConciliacion(); }
  catch (e) { toast(e.message); }
}

// ── Productos (antes «Qué compramos», dentro de Compras) ─────────────────────
// El detalle línea a línea de las facturas, agrupado por producto. Contesta «cuántas
// Coca-Colas desde marzo» y, sobre todo, cuánto ha subido el precio — que es lo que hoy
// no ve nadie. Todavía NO está enlazado con inventario ni con Ágora: se agrupa por la
// descripción del proveedor tal cual, así que dos proveedores que llamen distinto al mismo
// producto salen en dos filas. Es a propósito: dos filas honestas antes que una fusión
// inventada (ver docs/lineas-de-factura.md).
let COMP = { q: "", from: "", to: "", proveedor: "", categoria: "", subcategoria: "" };
/**
 * Productos marcados para unificar, por su clave. Se decide DONDE SE VE: los dos calamares
 * salen uno debajo del otro, con el mismo importe, y hasta ahora había que irse al diccionario
 * a buscarlos por su nombre para juntarlos.
 *
 * Se guarda también la descripción porque es lo que se propone como nombre del producto y lo
 * que se manda al servidor como «forma de escribirlo»: la fila ya no estará al confirmar.
 */
let COMP_SEL = new Map();
const COMP_FILTROS = ["q", "from", "to", "proveedor", "categoria", "subcategoria"];

// ── El diccionario: unificar productos ──────────────────────────────────────
// «COCA COLA 33CL» y «Coca-Cola 33 cl» son el mismo producto y hoy cuentan como dos. Aquí se
// va diciendo cuál es cuál, EMPEZANDO POR LO QUE MÁS DINERO MUEVE: con cientos de textos, las
// veinte primeras confirmaciones cubren casi todo el histórico.
//
// Nada se une solo. Lo que sale es una propuesta y hay que decir que sí.
let DICC = null;

async function dicPedir() {
  // La cola se pide del establecimiento que se esté mirando: revisar «lo que compro en Blanes»
  // de una sentada es abordable; las descripciones de los siete sitios mezcladas, no. El
  // diccionario que sale de ahí sigue siendo único —un producto es el mismo en todas partes—.
  const loc = localActualFE();
  try { DICC = await apiRaw("/api/facturas/diccionario" + (loc ? "?local=" + encodeURIComponent(loc) : "")); }
  catch { DICC = null; }
  dicPintar();
}

function dicPintar() {
  const caja = document.getElementById("dicRes");
  if (!caja) return;
  if (!DICC) { caja.innerHTML = ""; return; }
  const cola = DICC.cola || [];
  const c = DICC.cobertura || {};

  if (!cola.length) {
    // Sin cola pendiente no se enseña la caja de revisar: una tarjeta que solo dice «no hay
    // nada que hacer» ocupa el sitio de la primera fila de la tabla, que es lo que se viene a
    // ver. Reaparece sola cuando entren descripciones nuevas.
    //
    // Pero la LISTA del diccionario sí se pinta. Antes se iba con ella, y con ella el botón de
    // quitar una forma mal unida: al terminar la cola desaparecía la única manera de deshacer.
    caja.innerHTML = dicProductosHtml();
    return;
  }

  const fila = (p) => `<div class="row" data-dic-fila="${esc(p.clave)}">
      <div class="grow" style="min-width:0">
        <div class="t1">${esc(p.descripcion)}</div>
        <div class="t2">${esc(eur(p.gasto))} · ${num(p.veces)} ${p.veces === 1 ? "vez" : "veces"}${p.proveedores ? ` · ${esc(p.proveedores)}` : ""}</div>
      </div>
      ${p.sugerido ? `<button class="btn sm primary" data-dic="unir" data-clave="${esc(p.clave)}" data-id="${p.sugerido.id}" data-desc="${esc(p.descripcion)}"
          title="Se parece un ${p.sugerido.score} %">Es «${esc(p.sugerido.nombre)}»</button>` : ""}
      <button class="btn sm" data-dic="nuevo" data-clave="${esc(p.clave)}" data-nombre="${esc(p.nombrePropuesto)}"
        data-desc="${esc(p.descripcion)}">Es nuevo</button>
      <button class="btn sm" data-dic="otro" data-clave="${esc(p.clave)}" data-desc="${esc(p.descripcion)}">Otro…</button>
      <button class="btn sm" data-dic="aparte" data-clave="${esc(p.clave)}" data-desc="${esc(p.descripcion)}"
        title="Revisado, pero no se une a ningún producto">Dejar aparte</button>
    </div>`;

  caja.innerHTML = `<details class="card fold" style="margin-bottom:14px">
    <summary><h3>Unificar productos</h3><span class="foldr">
      <span>${num(cola.length)} sin revisar${DICC.hayMas ? "+" : ""}${DICC.local ? ` en ${esc(nombreCortoLocal(DICC.local))}` : ""}${c.pct ? ` · ${c.pct} % del gasto ya revisado` : ""}</span>
      <span class="car">${ic("chev", 16)}</span></span></summary>
    <p class="mut" style="margin:0 0 12px;line-height:1.55">El mismo producto se llama de dos maneras según quién
      escriba la factura, y así cuenta como dos. Diciendo cuál es cuál se puede contestar <b>cuánto compramos de
      algo</b> y comparar establecimientos. <b>Empieza por arriba</b>: son los que más dinero mueven.
      ${c.pct ? `Llevas <b>${c.pct} %</b> del gasto revisado.` : ""}
      ${DICC.local ? `Esta cola es la de <b>${esc(nombreCortoLocal(DICC.local))}</b> —cambia de establecimiento arriba para ver otra—, pero
        lo que decidas vale para todos: el producto es el mismo en todas partes.` : ""}</p>
    <div class="rows">${cola.slice(0, 25).map(fila).join("")}</div>
    ${cola.length > 25 ? `<p class="mut" style="margin:10px 0 0;font-size:12px">Y ${num(cola.length - 25)} más, que irán apareciendo según decidas estas.</p>` : ""}
  </details>${dicProductosHtml()}`;
}

/**
 * Los productos que ya se han creado, para poder CORREGIRLOS. Sin esto, una errata al crear
 * uno se queda para siempre — y las erratas se cometen justo en los primeros veinte, cuando
 * aún no se ha cogido el gusto a nombrarlos.
 */
function dicProductosHtml() {
  const ps = DICC?.productos || [];
  if (!ps.length) return "";
  return `<details class="card fold" style="margin-bottom:14px">
    <summary><h3>Productos del diccionario</h3><span class="foldr">
      <span>${num(ps.length)}</span><span class="car">${ic("chev", 16)}</span></span></summary>
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Los que se han ido creando. Si uno tiene una errata se
      cambia el nombre y sus formas de escribirlo lo siguen; si el mismo producto se creó dos veces, se fusionan.
      Al borrar uno, sus formas <b>vuelven a la cola</b>: no se pierde el trabajo, se deshace.</p>
    <div class="rows">${ps.map((p) => `<details class="row" style="display:block" data-dicp-fila="${p.id}">
        <summary style="display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none">
          <div class="grow" style="min-width:0"><div class="t1">${esc(p.nombre)}</div>
            <div class="t2">${num(p.alias)} forma${p.alias === 1 ? "" : "s"} de escribirlo${p.alias ? " · pulsa para verlas" : ""}</div></div>
          <button class="btn sm" data-dicp="nombre" data-id="${p.id}" data-nombre="${esc(p.nombre)}">Cambiar nombre</button>
          <button class="btn sm" data-dicp="fusionar" data-id="${p.id}" data-nombre="${esc(p.nombre)}">Fusionar…</button>
          <button class="btn sm" data-dicp="borrar" data-id="${p.id}" data-nombre="${esc(p.nombre)}" data-alias="${p.alias}">Borrar</button>
        </summary>
        ${(p.formas || []).length ? `<div class="rows" style="margin:6px 0 0 12px;border-left:2px solid var(--border);padding-left:12px">
          ${p.formas.map((f) => `<div class="row" style="padding:6px 0">
            <div class="grow"><span class="t2">${esc(f.descripcion || f.clave)}</span></div>
            <button class="btn sm" data-dicp="quitar-forma" data-clave="${esc(f.clave)}"
              title="Esta forma vuelve a la cola, sin tocar las demás">Quitar</button></div>`).join("")}
        </div>` : ""}
      </details>`).join("")}</div>
  </details>`;
}

/** Fusionar: elegir con cuál se junta. El que se elige es el que SE QUEDA. */
function dicFusionar(id, nombre) {
  const otros = (DICC?.productos || []).filter((p) => p.id !== Number(id));
  if (!otros.length) return toast("No hay otro producto con el que fusionarlo");
  const ov = modal(`Fusionar «${nombre}»`, `
    <p class="mut" style="margin:0 0 10px">Elige con cuál se junta. <b>El que elijas es el que se queda</b>, y
      «${esc(nombre)}» desaparece dejándole todas sus formas de escribirlo.</p>
    <div class="rows" style="max-height:320px;overflow:auto">${otros.map((p) => `<div class="row">
        <div class="grow"><b>${esc(p.nombre)}</b> <span class="mut">· ${num(p.alias)} forma${p.alias === 1 ? "" : "s"}</span></div>
        <button class="btn sm primary" data-fus="${p.id}">Quedarse con este</button></div>`).join("")}</div>`);
  ov.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fus]");
    if (!b) return;
    ov.remove();
    try {
      const r = await apiSend("POST", `/api/facturas/productos/${b.getAttribute("data-fus")}/fusionar`, { origen: Number(id) });
      toast(r.mensaje || "Fusionados ✅");
      dicPedir(); comprasDebounced();
    } catch (err) { toast("Error: " + err.message); }
  });
}

async function dicGuardar(cuerpo, fila) {
  try {
    await apiSend("POST", "/api/facturas/diccionario", cuerpo);
    // La fila desaparece al momento: la cola tiene que bajar a ojos vista o no se termina.
    fila?.remove();
    if (DICC) DICC.cola = (DICC.cola || []).filter((x) => x.clave !== cuerpo.clave);
    toast("Hecho ✅");
    comprasDebounced();               // el agrupado cambia: se repinta el gasto por producto
  } catch (e) { toast("Error: " + e.message); }
}

/** Elegir a mano entre los productos que ya existen, con buscador. */
function dicElegir(clave, descripcion, fila) {
  const productos = (DICC?.productos || []);
  const ov = modal("¿Qué producto es?", `
    <p class="mut" style="margin:0 0 10px">Se está clasificando <b>${esc(descripcion)}</b>.</p>
    <input class="inp" id="dicQ" placeholder="Buscar producto…" autocomplete="off">
    <div id="dicLista" class="rows" style="max-height:320px;overflow:auto;margin-top:10px"></div>
    ${productos.length ? "" : '<p class="mut">Todavía no hay ningún producto creado. Usa «Es nuevo».</p>'}`);

  const pintar = (q) => {
    const t = (q || "").toLowerCase();
    const l = productos.filter((p) => !t || p.nombre.toLowerCase().includes(t)).slice(0, 60);
    ov.querySelector("#dicLista").innerHTML = l.map((p) => `<div class="row">
        <div class="grow"><b>${esc(p.nombre)}</b>${p.alias ? ` <span class="mut">· ${num(p.alias)} forma${p.alias === 1 ? "" : "s"} de escribirlo</span>` : ""}</div>
        <button class="btn sm primary" data-elegir="${p.id}">Es este</button></div>`).join("")
      || '<p class="mut">Ninguno con ese nombre.</p>';
  };
  pintar("");
  ov.querySelector("#dicQ").addEventListener("input", (e) => pintar(e.target.value));
  ov.querySelector("#dicLista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-elegir]");
    if (!b) return;
    ov.remove();
    dicGuardar({ clave, descripcion, producto_id: Number(b.getAttribute("data-elegir")) }, fila);
  });
}

async function loadProductos() {
  const view = document.getElementById("view");
  facScope();   // el establecimiento lo fija el selector de la barra, como en el resto
  // Sin filtro de fechas por defecto: se ve TODO lo comprado, y el que quiera acotar lo acota.
  // Antes se metían seis meses por su cuenta y la pantalla abría con un filtro puesto que nadie
  // había pedido — y con unas cifras que parecían el total y no lo eran.
  view.innerHTML = productosHeader() + `<div id="dicRes"></div><div id="compRes"><p class="mut">Cargando…</p></div>`;
  await refrescarCompras();
  comprasPaquetes();                 // tampoco se espera: es un aviso, no un dato de la tabla
  dicPedir();                        // no se espera: la cola llega cuando llegue

  document.getElementById("dicRes")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dic]");
    if (!b) return;
    const clave = b.getAttribute("data-clave");
    const desc = b.getAttribute("data-desc") || "";
    const fila = b.closest("[data-dic-fila]");
    const q = b.getAttribute("data-dic");
    if (q === "unir") return dicGuardar({ clave, descripcion: desc, producto_id: Number(b.getAttribute("data-id")) }, fila);
    if (q === "aparte") return dicGuardar({ clave, descripcion: desc, aparte: true }, fila);
    if (q === "otro") return dicElegir(clave, desc, fila);
    if (q === "nuevo") {
      const nombre = prompt("¿Cómo se llama este producto?", b.getAttribute("data-nombre") || desc);
      if (nombre && nombre.trim()) dicGuardar({ clave, descripcion: desc, nombre_nuevo: nombre.trim() }, fila);
    }
  });

  // Corregir los productos ya creados.
  document.getElementById("dicRes")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-dicp]");
    if (!b) return;
    e.preventDefault();      // están dentro de un <summary>: sin esto, pulsarlos lo despliega
    const id = b.getAttribute("data-id");
    const nombre = b.getAttribute("data-nombre") || "";
    const q = b.getAttribute("data-dicp");

    if (q === "fusionar") return dicFusionar(id, nombre);

    // Quitar UNA forma: vuelve a la cola y las demás se quedan como estaban. Es lo que hace
    // falta cuando se acepta una unión por error — deshacerla no puede costar deshacer todo.
    if (q === "quitar-forma") {
      const clave = b.getAttribute("data-clave");
      try {
        await apiSend("DELETE", "/api/facturas/diccionario/" + encodeURIComponent(clave));
        toast("Vuelve a la cola ✅"); dicPedir(); comprasDebounced();
      } catch (err) { toast("Error: " + err.message); }
      return;
    }

    if (q === "nombre") {
      const nuevo = prompt("¿Cómo se llama de verdad?", nombre);
      if (!nuevo || !nuevo.trim() || nuevo.trim() === nombre) return;
      try {
        const r = await apiSend("PUT", `/api/facturas/productos/${id}`, { nombre: nuevo.trim() });
        toast(r.mensaje || "Hecho ✅"); dicPedir(); comprasDebounced();
      } catch (err) { toast("Error: " + err.message); }
      return;
    }

    if (q === "borrar") {
      const n = Number(b.getAttribute("data-alias")) || 0;
      // Se dice cuánto trabajo se deshace ANTES de deshacerlo.
      if (!await confirmModal(`Se borra «${nombre}». ${n ? `Sus ${n} forma(s) de escribirlo vuelven a la cola.` : "No tiene ninguna forma asignada."}`,
        { ok: "Borrar", danger: true })) return;
      try {
        const r = await apiSend("DELETE", `/api/facturas/productos/${id}`);
        toast(r.mensaje || "Borrado"); dicPedir(); comprasDebounced();
      } catch (err) { toast("Error: " + err.message); }
    }
  });
  const cont = document.getElementById("compRes");
  cont?.addEventListener("input", (e) => {
    if (e.target.id === "compQ") { COMP.q = e.target.value.trim(); comprasDebounced(); }
  });

  cont?.addEventListener("click", (e) => {
    const c = e.target.closest("[data-comp]");
    if (c) {
      const w = c.getAttribute("data-comp");
      if (w === "filtros") return compAbrirFiltros();
      if (w === "quitar") return compQuitarFiltro(c.getAttribute("data-k"));
      if (w === "limpiar") return compLimpiarFiltros();
      // Pulsar una categoría filtra por ella: es el gesto natural al ver «Bebidas 4.200 €».
      if (w === "cat") { COMP.categoria = c.getAttribute("data-cat"); COMP.subcategoria = ""; return refrescarCompras(); }
      if (w === "sub") { COMP.subcategoria = c.getAttribute("data-sub"); COMP.categoria = ""; return refrescarCompras(); }
    }
    const f = e.target.closest("[data-compfac]");
    if (f) return comprasVerFactura(f.getAttribute("data-compfac"));
    const p = e.target.closest("[data-compprod]");
    if (p) { COMP.q = p.getAttribute("data-compprod"); const i = document.getElementById("compQ"); if (i) i.value = COMP.q; return refrescarCompras(); }
    if (e.target.closest('[data-comp="releer"]')) comprasReleer();
    // Las descuadradas van por otro camino: no hay que releerlo todo, solo esas.
    if (e.target.closest('[data-comp="recuadrar"]')) return comprasRecuadrar();
    const rd = e.target.closest('[data-comp="releer-descuadre"]');
    if (rd) return facRepasoLineas(Number(rd.getAttribute("data-n")) || 0, "descuadre");
  });
}
// Los filtros de «Qué compramos», en el mismo panel lateral que los de Facturas: es la misma
// pregunta («qué documentos miro») hecha desde el otro lado.
function compFiltrosActivos() {
  const out = [];
  if (COMP.from || COMP.to) out.push({ k: "fechas", txt: `${COMP.from ? fechaCorta(COMP.from) : "…"} → ${COMP.to ? fechaCorta(COMP.to) : "hoy"}` });
  if (COMP.proveedor) out.push({ k: "proveedor", txt: COMP.proveedor });
  if (COMP.categoria) String(COMP.categoria).split(",").filter(Boolean).forEach((c) => out.push({ k: "categoria:" + c, txt: c }));
  if (COMP.subcategoria) String(COMP.subcategoria).split(",").filter(Boolean).forEach((c) => out.push({ k: "subcategoria:" + c, txt: c }));
  if (COMP.q) out.push({ k: "q", txt: `«${COMP.q}»` });
  return out;
}
function compChipsHtml() {
  const f = compFiltrosActivos();
  if (!f.length) return "";
  return `<div class="fchips">${f.map((x) => `<button class="fchip" data-comp="quitar" data-k="${esc(x.k)}">${esc(x.txt)}<span>✕</span></button>`).join("")}
    <button class="linkbtn" data-comp="limpiar">Quitar todos</button></div>`;
}
function compQuitarFiltro(k) {
  if (k === "fechas") { COMP.from = ""; COMP.to = ""; PERIODO_VISTA.productos = "todo"; }
  else if (k.startsWith("subcategoria:")) {
    const fuera = k.slice(13);
    COMP.subcategoria = String(COMP.subcategoria).split(",").filter((c) => c && c !== fuera).join(",");
  } else if (k.startsWith("categoria:")) {
    const fuera = k.slice(10);
    COMP.categoria = String(COMP.categoria).split(",").filter((c) => c && c !== fuera).join(",");
  } else COMP[k] = "";
  refrescarCompras();
}
function compLimpiarFiltros() { COMP_FILTROS.forEach((k) => { COMP[k] = ""; }); PERIODO_VISTA.productos = "todo"; const i = document.getElementById("compQ"); if (i) i.value = ""; refrescarCompras(); }

async function compAbrirFiltros() {
  let provs = [];
  try { provs = (await apiRaw("/api/facturas/proveedores" + (FACF.local ? "?local=" + encodeURIComponent(FACF.local) : ""))).data || []; } catch { /* sin lista */ }
  const cats = String(COMP.categoria || "").split(",").filter(Boolean);
  const subsSel = String(COMP.subcategoria || "").split(",").filter(Boolean);
  const cuerpo = `
    <div class="drw-g"><span class="drw-gt">${ic("cal", 15)} Fecha de la factura</span>
      <div class="drw-row">${dpField("cFrom", COMP.from, "Desde")}${dpField("cTo", COMP.to, "Hasta")}</div>
      <div class="drw-pills" style="margin-top:9px">
        <button class="drw-pill" data-rango="mes">Este mes</button>
        <button class="drw-pill" data-rango="ano">Este año</button>
        <button class="drw-pill" data-rango="anopasado">Año pasado</button>
      </div>
    </div>
    <div class="drw-g"><span class="drw-gt">${ic("box", 15)} Proveedor</span>
      <select class="inp" id="cProv"><option value="">Todos los proveedores</option>
        ${provs.map((p) => `<option value="${esc(p.proveedor)}" ${COMP.proveedor === p.proveedor ? "selected" : ""}>${esc(p.proveedor)} (${p.n})</option>`).join("")}
      </select>
      <p class="mut" style="margin:8px 0 0;font-size:12px">Para ver todo lo que te vende uno concreto.</p>
    </div>
    <div class="drw-g"><span class="drw-gt">${ic("receipt", 15)} Categoría</span>
      <div class="drw-pills" id="cCats">${(COMP.catalogo || []).map((c) =>
        `<button class="drw-pill ${cats.includes(c.nombre) ? "on" : ""}" data-cat="${esc(c.nombre)}">${esc(c.nombre)}</button>`).join("")}</div>
      <p class="mut" style="margin:8px 0 0;font-size:12px">Sale de la categoría del proveedor, que se pone en Configuración.</p>
    </div>

    <div class="drw-g"><span class="drw-gt">${ic("box", 15)} Subcategoría</span>
      <div class="drw-pills" id="cSubs">${(COMP.catalogo || []).flatMap((c) => c.subs.map((x) =>
        `<button class="drw-pill ${subsSel.includes(x) ? "on" : ""}" data-sub="${esc(x)}" title="${esc(c.nombre)}">${esc(x)}</button>`)).join("")}</div>
      <p class="mut" style="margin:8px 0 0;font-size:12px">Para afinar: «Vinos y cavas» en vez de «Bebidas» entera.</p>
    </div>`;

  const ov = drawer("Filtrar compras", cuerpo, {
    onLimpiar: (d) => { d.cerrar(); compLimpiarFiltros(); },
    onAplicar: (d) => {
      COMP.from = d.querySelector("#cFrom").value || "";
      COMP.to = d.querySelector("#cTo").value || "";
      PERIODO_VISTA.productos = (COMP.from || COMP.to) ? "custom" : "todo";
      COMP.proveedor = d.querySelector("#cProv").value || "";
      COMP.categoria = [...d.querySelectorAll("#cCats .drw-pill.on")].map((b) => b.dataset.cat).join(",");
      COMP.subcategoria = [...d.querySelectorAll("#cSubs .drw-pill.on")].map((b) => b.dataset.sub).join(",");
      d.cerrar();
      refrescarCompras();
    },
  });
  ov.addEventListener("click", (e) => {
    const r = e.target.closest("[data-rango]"); if (!r) return;
    r.classList.remove("on");
    const y = new Date().getFullYear(), m = new Date().getMonth();
    const iso = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
    let desde, hasta;
    if (r.dataset.rango === "mes") { desde = new Date(y, m, 1); hasta = new Date(y, m + 1, 0); }
    else if (r.dataset.rango === "ano") { desde = new Date(y, 0, 1); hasta = new Date(y, 11, 31); }
    else { desde = new Date(y - 1, 0, 1); hasta = new Date(y - 1, 11, 31); }
    dpSet("cFrom", iso(desde)); dpSet("cTo", iso(hasta));
  });
}

// Reparto del gasto por categoría. Va sobre el total de las facturas, no sobre las líneas:
// así el alquiler y la luz —de las que no se lee el detalle— también cuentan.
/**
 * Cuál de los nombres proponer al unificar.
 *
 * NO el más largo. Lo probé y en el caso real —«Calamar Andalusa Xipiron» contra «Albarà
 * 2026-AL-43429 - 23/07/2026 - 245.52 (PEDIDO TABLET) CALAMAR ANDALUSA…»— el más largo es
 * justo la línea basura que se quiere enterrar, y el nombre bueno es el corto.
 *
 * Lo que distingue a un nombre de producto de una línea de albarán es que el producto casi no
 * lleva cifras. Así que se puntúa por la proporción de letras, y a igualdad gana el más corto,
 * que suele ser el limpio. Es una propuesta: el campo se puede cambiar antes de aceptar.
 */
function nombreParaUnificar(descripciones) {
  const cand = (descripciones || []).map((d) => String(d || "").trim()).filter(Boolean);
  if (!cand.length) return "";
  const puntua = (d) => {
    const letras = (d.match(/[a-zA-ZáéíóúàèìòùçñÁÉÍÓÚÑÀÈÌÒÙÇ]/g) || []).length;
    const cifras = (d.match(/[0-9]/g) || []).length;
    return (letras - cifras * 2) / Math.max(1, d.length);
  };
  return [...cand].sort((a, b) => puntua(b) - puntua(a) || a.length - b.length)[0];
}

/** La barra flotante de Productos: aparece al marcar dos o más. */
function compBarraSeleccion() {
  const n = COMP_SEL.size;
  if (!n) return "";
  return `<div class="selbar">
    <b>${num(n)}</b> ${n === 1 ? "producto elegido" : "productos elegidos"}
    <div style="flex:1"></div>
    ${n > 1 ? '<button class="btn sm" data-act="comp-unificar">Unificar en uno</button>' : '<span style="font-size:12.5px;opacity:.85">Marca otro para unirlos</span>'}
    <button class="btn sm" data-act="comp-sel-limpiar">Quitar selección</button>
  </div>`;
}

function compSelToggle(clave, desc, marcado) {
  if (marcado) COMP_SEL.set(clave, desc || clave); else COMP_SEL.delete(clave);
  // Se repinta solo la barra y el resaltado: repintar la tabla entera al marcar una casilla
  // perdería el desplazamiento, y marcar dos productos que están lejos es justo el caso.
  document.querySelectorAll("[data-compsel]").forEach((c) => {
    c.closest("tr")?.classList.toggle("sel", COMP_SEL.has(c.getAttribute("data-compsel")));
  });
  const vieja = document.querySelector("#compRes .selbar");
  const nueva = compBarraSeleccion();
  if (vieja) vieja.outerHTML = nueva || "";
  else if (nueva) document.querySelector("#compRes .tw")?.insertAdjacentHTML("afterend", nueva);
}

/**
 * Unificar lo marcado. El nombre se propone —el más largo, que suele ser el completo y no la
 * abreviatura— y se puede cambiar: es lo que se va a ver a partir de ahora en todas partes.
 */
function compUnificar() {
  const elegidos = [...COMP_SEL.entries()].map(([clave, descripcion]) => ({ clave, descripcion }));
  if (elegidos.length < 2) return toast("Marca al menos dos productos");
  const propuesto = nombreParaUnificar(elegidos.map((e) => e.descripcion));
  const ov = modal(`Unificar ${elegidos.length} productos`, `
    <p class="mut" style="margin:0 0 10px;line-height:1.55">Pasan a ser <b>uno solo</b>: su gasto se suma y su precio se
      puede comparar entre establecimientos. Las formas de escribirlo se guardan, así que las facturas que entren
      escritas de cualquiera de estas maneras irán ya a este producto.</p>
    <div class="rows" style="margin-bottom:12px">${elegidos.map((e) =>
      `<div class="row" style="padding:6px 0"><span class="t2">${esc(e.descripcion)}</span></div>`).join("")}</div>
    <div class="field"><label>Cómo se llamará</label><input id="unifNombre" value="${esc(propuesto)}" maxlength="120"></div>
    <p class="mut" style="margin:8px 0 0;font-size:12px">Se puede deshacer: en <b>Configuración → Productos del diccionario</b>,
      cada forma tiene su botón de quitar.</p>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="unifOk">Unificar</button></div>`);
  ov.querySelector("#unifOk").addEventListener("click", async () => {
    const nombre = ov.querySelector("#unifNombre").value.trim();
    if (!nombre) return toast("Ponle un nombre");
    try {
      const r = await apiSend("POST", "/api/facturas/diccionario/unificar", { productos: elegidos, nombre });
      ov.remove();
      COMP_SEL = new Map();
      toast(r.mensaje || "Unificados ✅");
      loadProductos();
    } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
  });
}

/**
 * Cuánto se sale el último precio de lo normal. Es la diferencia entre informar y avisar: 45 €
 * no dice nada hasta ponerlo al lado de los 30 € que se pagan siempre.
 *
 * Solo se pinta cuando hay con qué comparar y cuando la diferencia es de verdad (±5 %): un
 * chip en cada fila se convierte en decoración y deja de leerse.
 */
/**
 * LA LÍNEA DEL PRECIO. De cada producto guardamos hasta cuarenta precios con su fecha y hasta
 * ahora se enseñaban dos números: el normal y el último. Dos números no distinguen «lleva tres
 * meses subiendo» de «un mes le cobraron de más». La línea sí, y sin leer nada.
 *
 * Se dibuja a mano en SVG —doce puntos, un `path`— porque aquí no se pueden añadir librerías,
 * y porque una librería de gráficos para esto sería mover una montaña para poner un clavo.
 */
function sparkPrecio(g) {
  const ps = (g.precios || []).filter((x) => x && Number.isFinite(Number(x.precio)));
  if (ps.length < 3) return "";                       // con dos puntos no hay tendencia que ver
  // Vienen de más nuevo a más viejo: se dibuja al revés, que es como se lee el tiempo.
  const v = ps.map((x) => Number(x.precio)).reverse();
  const min = Math.min(...v), max = Math.max(...v);
  const W = 62, H = 18, P = 2;
  const x = (i) => (v.length === 1 ? W / 2 : P + (i * (W - P * 2)) / (v.length - 1));
  // Si todos los precios son iguales, la línea va por el medio: aplastarla contra el borde
  // haría parecer que el precio está por los suelos.
  const y = (n) => (max === min ? H / 2 : H - P - ((n - min) / (max - min)) * (H - P * 2));
  const d = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const sube = v[v.length - 1] > v[0];
  const color = max === min ? "var(--ink3)" : sube ? "var(--danger)" : "var(--success)";
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"
    ><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(v.length - 1).toFixed(1)}" cy="${y(v[v.length - 1]).toFixed(1)}" r="2" fill="${color}"/></svg>`;
}

function compChipPrecio(g) {
  if (g.precioNormal == null || g.ultimoPrecio == null || g.precioNormal <= 0) return "";
  const pct = Math.round(((g.ultimoPrecio - g.precioNormal) / g.precioNormal) * 1000) / 10;
  if (Math.abs(pct) < 5) return "";
  const sube = pct > 0;
  return ` <span class="pill ${sube ? "bad" : "ok"}" style="font-size:10px" title="Respecto a lo que se paga normalmente (${esc(eur2(g.precioNormal))})">${sube ? "↗" : "↘"} ${signed2(pct)}</span>`;
}

function compCategoriasHtml(g) {
  if (!g || (!g.categorias.length && !g.sinCategoria)) return "";
  const max = Math.max(...g.categorias.map((c) => c.importe), 1);
  const subs = (c) => {
    const reales = (c.subs || []).filter((x) => x.subcategoria);
    if (!reales.length) return "";
    return `<div class="subcats">${reales.map((x) =>
      `<button class="subcat" data-comp="sub" data-sub="${esc(x.subcategoria)}">${esc(x.subcategoria)} <b>${esc(eur(x.importe))}</b></button>`).join("")}</div>`;
  };
  // Cada categoría con SU color, el mismo en toda la aplicación. Antes todas las barras eran
  // del mismo verde y solo cambiaba la longitud: había que ir etiqueta por etiqueta.
  const fila = (c) => `<div class="row" style="padding:7px 2px;align-items:flex-start;--cat:var(--cat-${esc(colorCategoriaFE(c.categoria))})">
      <div class="grow" style="min-width:0">
        <button class="linkbtn" data-comp="cat" data-cat="${esc(c.categoria)}" style="font-weight:600;display:inline-flex;align-items:center"><span class="catdot"></span>${esc(c.categoria)}</button>
        <div class="barmini"><span style="width:${Math.round((c.importe / max) * 100)}%"></span></div>
        ${subs(c)}
      </div>
      <b class="tnum" style="flex:none;margin-left:10px">${esc(eur(c.importe))}</b></div>`;
  return `<details class="card fold" style="margin-bottom:14px">
    ${/* El desplegable sigue CERRADO —nada se abre solo—, pero cerrado decía «6 categorías»,
          que no es información: son seis palabras que no dicen dónde va el dinero. Ahora
          cerrado ya enseña las tres que más pesan, y se abre para ver el resto. */""}
    <summary><h3>En qué se va el dinero</h3><span class="foldr">
      <span class="hidesm" style="font-weight:500">${g.categorias.slice(0, 3).map((c) =>
        `<span style="--cat:var(--cat-${esc(colorCategoriaFE(c.categoria))});white-space:nowrap"><span class="catdot"></span>${esc(c.categoria)} <b class="tnum">${esc(eur(c.importe))}</b></span>`).join('<span class="mut" style="margin:0 8px">·</span>')}</span>
      <span class="mut">${num(g.categorias.length)}</span><span class="car">${ic("chev", 16)}</span></span></summary>
    <div class="rows">${g.categorias.map(fila).join("")}</div>
    ${g.repartido ? `<p class="mut" style="margin:10px 0 0;font-size:12px">De ${eur(g.repartido)} hay proveedores que están en más de una categoría; su gasto se reparte a partes iguales, así que esas cifras son aproximadas. El total sí cuadra.</p>` : ""}
    ${g.sinCategoria ? `<p class="fic-nota" style="margin:10px 0 0"><b>${eur(g.sinCategoria)}</b> de ${g.sinCatProveedores.length} ${g.sinCatProveedores.length === 1 ? "proveedor" : "proveedores"} sin categoría, así que no está repartido: ${esc(g.sinCatProveedores.slice(0, 4).join(", "))}${g.sinCatProveedores.length > 4 ? "…" : ""}. Se ponen en <b>Configuración</b>.</p>` : ""}
  </details>`;
}

/**
 * Todas las veces que hemos comprado algo, con el enlace a cada factura. Es lo que se quiere
 * saber cuando algo falta o ha subido: cuándo, a quién, cuánto y a qué precio — y luego ver
 * el papel. El enlace va a Drive, que es donde está el original.
 */
async function comprasHistorial(clave, nombre) {
  const qs = new URLSearchParams({ clave });
  if (FACF.local) qs.set("local", FACF.local);
  if (COMP.from) qs.set("from", COMP.from);
  if (COMP.to) qs.set("to", COMP.to);
  let j;
  try { j = await apiRaw("/api/facturas/compras/producto?" + qs); } catch (e) { return toast(e.message); }
  const r = j.resumen;

  const subio = r.precioMin != null && r.precioMax != null && r.precioMin > 0
    ? Math.round(((r.precioMax - r.precioMin) / r.precioMin) * 100) : null;

  const fila = (c) => `<tr>
    <td class="mut" style="white-space:nowrap">${esc(fechaCorta(c.fecha) || c.fecha || "—")}</td>
    <td>${esc(c.proveedor || "—")}<div class="t2">${esc(nombreCortoLocal(c.local) || "")}</div></td>
    <td class="r tnum">${c.cantidad != null ? esc(num(c.cantidad)) + (c.unidad ? " " + esc(c.unidad) : "") : "—"}
      ${c.factor_unidad ? `<div class="t2" title="La factura daba la cantidad en paquetes y el precio por unidad: se deshizo el paquete para poder comparar precios">× ${esc(num(c.factor_unidad))} por paquete</div>` : ""}</td>
    ${/* El precio que se enseña es el que se PAGA. Si hay descuento se dice, con el de tarifa
          al lado: así se ve de un vistazo si un mes deja de aplicarse. */""}
    <td class="r tnum">${c.precio_unitario != null ? esc(eur2(c.precio_unitario)) : "—"}
      ${c.descuento_pct ? `<div class="t2" style="white-space:nowrap">${esc(eur2(c.precio_bruto))} −${esc(String(c.descuento_pct))} %</div>` : ""}</td>
    <td class="r tnum"><b>${c.importe != null ? esc(eur2(c.importe)) : "—"}</b></td>
    <td class="r" style="white-space:nowrap">
      <button class="btn sm" data-corregir="${c.linea_id}" data-cant="${esc(String(c.cantidad ?? ""))}" data-unidad="${esc(c.unidad || "")}"
        data-importe="${esc(String(c.importe ?? ""))}" data-desc="${esc(c.descripcion || "")}" title="La cantidad no es la que compraste">Corregir</button>
      ${c.drive_url ? `<a class="btn sm" href="${esc(c.drive_url)}" target="_blank" rel="noopener" title="Abrir la factura en Drive">Ver factura ↗</a>`
        : `<button class="btn sm" data-vfac="${c.factura_id}">Detalle</button>`}</td></tr>`;

  const ov = modal(esc(j.nombre || nombre), `
    <div class="kpis4" style="margin:0 0 14px">
      <div class="kpi"><span>Veces</span><b>${num(r.veces)}</b></div>
      <div class="kpi"><span>Cantidad</span><b>${num(Math.round(r.cantidad * 100) / 100)}</b></div>
      <div class="kpi"><span>Gastado</span><b>${esc(eur(r.importe))}</b></div>
      <div class="kpi"><span>Último precio</span><b>${r.precioUltimo != null ? esc(eur2(r.precioUltimo)) : "—"}</b></div>
    </div>
    ${subio != null && subio > 0 ? `<p class="fic-nota" style="margin-top:0">Entre el precio más bajo y el más alto de este periodo hay un
      <b>${subio} %</b> (de ${esc(eur2(r.precioMin))} a ${esc(eur2(r.precioMax))}).${r.proveedores.length > 1 ? " Ojo: son varios proveedores, así que puede ser diferencia de proveedor y no subida." : ""}</p>` : ""}
    ${j.nombres.length > 1 ? `<p class="mut" style="margin:0 0 10px;font-size:12.5px">Los proveedores lo escriben de ${j.nombres.length} formas
      (${esc(j.nombres.slice(0, 3).join(" · "))}${j.nombres.length > 3 ? "…" : ""}); se agrupan como el mismo producto.</p>` : ""}
    ${r.dudosas ? `<p class="mut" style="margin:0 0 10px;font-size:12.5px">${num(r.dudosas)} ${r.dudosas === 1 ? "línea no se leyó" : "líneas no se leyeron"} del todo: sus cantidades pueden no ser exactas.</p>` : ""}
    ${j.compras.length ? `<div class="tw" style="max-height:46vh;overflow:auto"><table class="tbl">
      <thead><tr><th>Fecha</th><th>Proveedor</th><th class="r">Cantidad</th><th class="r">Precio</th><th class="r">Importe</th><th></th></tr></thead>
      <tbody>${j.compras.map(fila).join("")}</tbody></table></div>`
      : '<p class="mut">No hay compras de esto en el periodo elegido.</p>'}
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button class="btn" data-close>Cerrar</button></div>`);
  ov.querySelector(".modal").style.width = "min(880px, 96vw)";
  ov.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vfac]");
    if (b) { ov.remove(); return comprasVerFactura(b.getAttribute("data-vfac")); }
    const c = e.target.closest("[data-corregir]");
    if (c) corregirLinea(c, () => { ov.remove(); comprasHistorial(clave, nombre); });
  });
}

/**
 * CORREGIR LA CANTIDAD DE UNA COMPRA.
 *
 * La factura de Tupinamba pone «3 PACK» y el precio por cápsula: cuando el papel lo dice dos
 * veces, la cantidad se recuadra sola. Pero hay facturas que solo ponen «3 PACK · 121,49 €» y
 * no dicen cuántas cápsulas trae el pack — eso no está escrito en ninguna parte y solo lo sabe
 * quien abre la caja. Para esas, esto.
 *
 * El importe NO se puede tocar: es lo que se pagó y está en el papel. Lo que se corrige es en
 * cuántas unidades se reparte. Se enseña el precio resultante MIENTRAS se escribe, porque es
 * el número que dice si la corrección es la buena: «0,27 €» se reconoce, «40,50 €» no.
 */
function corregirLinea(btn, alGuardar) {
  const id = btn.getAttribute("data-corregir");
  const cant0 = Number(btn.getAttribute("data-cant")) || 0;
  const importe = Number(btn.getAttribute("data-importe")) || 0;
  const ov = modal("Corregir la cantidad", `
    <p class="mut" style="margin:0 0 12px;line-height:1.55"><b>${esc(btn.getAttribute("data-desc") || "")}</b><br>
      Se pagaron <b>${esc(eur2(importe))}</b> — eso no se toca. Lo que se corrige es entre cuántas unidades se reparten:
      si la factura contaba paquetes, pon las unidades que hay dentro de todos ellos.</p>
    <div class="form-grid">
      <div class="field"><label>Cantidad</label><input id="corCant" type="number" step="any" min="0" value="${esc(String(cant0))}"></div>
      <div class="field"><label>Unidad</label><input id="corUni" value="${esc(btn.getAttribute("data-unidad") || "")}" placeholder="ud, kg, l…" maxlength="20"></div>
    </div>
    <div class="drw-pills" style="margin-top:10px">
      <span class="mut" style="font-size:12px;align-self:center;margin-right:4px">Si cada paquete trae:</span>
      ${[6, 12, 24, 100, 150].map((n2) => `<button class="drw-pill" data-mult="${n2}">× ${n2}</button>`).join("")}
    </div>
    <p style="margin:12px 0 0;font-size:13.5px">Quedaría a <b id="corPrecio" class="tnum">—</b> cada una.</p>
    <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:13px;cursor:pointer">
      <input type="checkbox" id="corTodas" checked style="width:auto;margin-top:2px">
      <span>Aplicar la misma corrección a las demás compras de este producto a este proveedor.
        <span class="mut">El mismo proveedor lo factura igual todos los meses: arreglar una y dejar treinta mal sería trabajo tirado.</span></span>
    </label>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="corOk">Guardar</button></div>`);

  const inp = ov.querySelector("#corCant");
  const pinta = () => {
    const c = Number(inp.value);
    ov.querySelector("#corPrecio").textContent = (c > 0 && importe) ? eur2(importe / c) : "—";
  };
  inp.addEventListener("input", pinta); pinta();
  ov.addEventListener("click", (e) => {
    const m = e.target.closest("[data-mult]");
    if (m) {
      inp.value = String(Math.round(cant0 * Number(m.getAttribute("data-mult")) * 1000) / 1000);
      // Al deshacer el paquete, la unidad de la factura («PACK») deja de valer: ya no son 3
      // packs sino 450 unidades, y dejar «450 PACK» sería peor que no poner nada.
      const u = ov.querySelector("#corUni");
      if (!u.value || /pack|caja|bulto|palet|fardo/i.test(u.value)) u.value = "ud";
      pinta();
    }
  });
  ov.querySelector("#corOk").addEventListener("click", async () => {
    const cantidad = Number(inp.value);
    if (!(cantidad > 0)) return toast("La cantidad tiene que ser mayor que cero");
    try {
      const r = await apiSend("PATCH", "/api/facturas/lineas/" + id, {
        cantidad, unidad: ov.querySelector("#corUni").value.trim(),
        aplicar_a_todas: ov.querySelector("#corTodas").checked,
      });
      ov.remove();
      toast(`Corregido a ${eur2(r.precio_unitario)} por unidad${r.tambien ? ` · y ${r.tambien} compra(s) más` : ""} ✅`);
      alGuardar?.();
    } catch (e2) { if (e2.message !== "noauth") toast("Error: " + e2.message); }
  });
}

let _compTimer = null;
function comprasDebounced() { clearTimeout(_compTimer); _compTimer = setTimeout(refrescarCompras, 280); }

/**
 * Cuántas líneas tienen la cantidad en paquetes. Se pide aparte y sin bloquear: es una cuenta
 * sobre todas las líneas y no vale la pena hacer esperar a la tabla por ella.
 */
let COMP_PAQUETES = 0;
async function comprasPaquetes() {
  try { COMP_PAQUETES = (await apiRaw("/api/facturas/lineas/paquetes")).n || 0; } catch { COMP_PAQUETES = 0; }
  if (COMP_PAQUETES && CURRENT === "productos") refrescarCompras();
}

async function comprasRecuadrar() {
  const ok = await confirmModal(
    `Se van a recuadrar ${COMP_PAQUETES} línea(s): la cantidad pasa a estar en unidades sueltas y el precio, a ser el de cada unidad. ` +
    `El importe pagado NO se toca, así que las facturas siguen cuadrando igual. No se vuelve a leer ningún documento.`,
    { ok: "Recuadrar" });
  if (!ok) return;
  try {
    const r = await apiSend("POST", "/api/facturas/lineas/recuadrar");
    COMP_PAQUETES = 0;
    toast(`${r.arregladas} línea(s) recuadradas ✅`);
    loadProductos();
  } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

async function refrescarCompras() {
  const cont = document.getElementById("compRes");
  if (!cont) return;
  repintarSeg();   // las fechas se pueden cambiar desde «Filtros»: la barra tiene que decir lo mismo
  const qs = new URLSearchParams();
  // «Qué compramos» también es un agregado: con varios establecimientos se le pasan todos y el
  // servidor suma producto a producto (src/modules/facturas/compras-fusion.js). Juntar aquí
  // las respuestas contaría dos veces el mismo producto comprado en los dos locales.
  if (viendoVarios()) qs.set("locales", localesDelAmbito().join(","));
  else if (FACF.local) qs.set("local", FACF.local);
  COMP_FILTROS.forEach((k) => { if (COMP[k]) qs.set(k, COMP[k]); });
  let j;
  try { j = await apiRaw("/api/facturas/compras?" + qs.toString()); }
  catch (e) { cont.innerHTML = errorCard(e.message); return; }

  // Una respuesta a medias tumbaba la pantalla entera con un error de JavaScript, y lo que se
  // veía era «Cargando…» para siempre: ni el dato ni el motivo. Pasa cuando se piden varios
  // establecimientos y fallan todos —la fusión devuelve nada—, y pasaría con cualquier versión
  // del servidor que no traiga todavía algún campo.
  if (!j || !Array.isArray(j.grupos)) {
    cont.innerHTML = errorCard("No se han podido cargar los productos de este periodo. Vuelve a intentarlo.");
    return;
  }
  j.lineas = j.lineas || [];
  j.categorias = j.categorias || { categorias: [] };
  j.totales = j.totales || {};

  const c = j.cobertura || {};
  const sinDetalle = c.facturas - c.conDetalle;
  // Etiqueta ARRIBA y campo debajo (el patrón `.field` del resto del panel). Con el texto
  // en línea, al envolverse en móvil el «Hasta» quedaba cortado a media palabra.
  COMP.catalogo = j.catalogoCategorias || [];
  COMP.proveedores = (j.categorias?.categorias || []).flatMap((c) => c.proveedores);
  const barra = `<div class="toolbar" style="margin-bottom:10px">
      <div class="field" style="flex:1;min-width:180px">
        <input class="inp" id="compQ" value="${esc(COMP.q)}" placeholder="Buscar producto: coca, aceite, gamba…"></div>
      <button class="btn" data-comp="filtros">${ic("cog", 15)} Filtros${compFiltrosActivos().length ? '<span class="fdot"></span>' : ""}</button>
    </div>${compChipsHtml()}`;

  // La cobertura va arriba y siempre: un total calculado sobre la mitad de las facturas
  // parece el total de verdad si no se dice lo contrario.
  // El aviso distingue lo que se arregla con un botón de lo que no. Meterlo todo en «no
  // tienen detalle» haría prometer algo que en unas no va a pasar nunca.
  // UNA TIRA DE CHIPS, NO UN PÁRRAFO. Esto era un bloque de cuatro líneas de texto seguido
  // —«De las 29 facturas de este periodo, 29 tienen el detalle leído. Además, 15 tienen un
  // detalle que no cuadra…»— encima de la tabla. Nadie lee cuatro líneas para empezar a
  // trabajar, y lo que se podía arreglar estaba enterrado dentro de la frase.
  //
  // Cada chip dice un número y, si hay algo que hacer con él, ES un botón. La explicación
  // larga no se pierde: se lee al pasar por encima.
  const chip = (txt, cls = "", titulo = "", act = "") => act
    ? `<button class="fchip ${cls}" ${act} title="${esc(titulo)}">${txt}</button>`
    : `<span class="fchip ${cls}" title="${esc(titulo)}">${txt}</span>`;
  const chips = [];
  if (c.facturas) {
    chips.push(chip(`<b>${num(c.conDetalle)}</b>/${num(c.facturas)} con detalle`, c.conDetalle === c.facturas ? "ok" : "",
      "Los totales de abajo salen SOLO de las facturas cuyo detalle se ha podido leer."));
  }
  if (c.descuadradas) {
    chips.push(chip(`<b>${num(c.descuadradas)}</b> ${c.descuadradas === 1 ? "descuadre" : "descuadres"}`, "warn",
      "Su detalle leído no suma la base imponible: míralas antes de fiarte de sus cantidades. Pulsa para volver a leerlas.",
      `data-comp="releer-descuadre" data-n="${c.descuadradas}"`));
  }
  if (c.sinLeer) {
    chips.push(chip(`<b>${num(c.sinLeer)}</b> sin leer`, "warn",
      "Son de antes de que se leyeran las líneas, así que no cuentan en estos totales. Pulsa para leerlas.",
      'data-comp="releer"'));
  }
  // Las líneas cuya cantidad venía en paquetes: se arreglan con aritmética, sin releer nada.
  if (COMP_PAQUETES) {
    chips.push(chip(`<b>${num(COMP_PAQUETES)}</b> con la cantidad en paquetes`, "warn",
      "La factura contaba paquetes y cobraba por unidad, así que el precio por unidad que sale no es el que se paga. Se arregla con la propia factura, sin volver a leerla. Pulsa para recuadrarlas.",
      'data-comp="recuadrar"'));
  }
  if (c.noLeibles) chips.push(chip(`<b>${num(c.noLeibles)}</b> ilegibles`, "", "No se pudieron leer, normalmente porque ya no está el archivo. No cuentan en estos totales."));
  if (c.noAplica) chips.push(chip(`<b>${num(c.noAplica)}</b> de gasto estructural`, "", "Alquiler, luz, gestor…: su detalle no se lee a propósito, porque esas líneas no son productos. El gasto sí cuenta."));
  const dobles = j.albaranesYaFacturados || 0;
  if (dobles) chips.push(chip(`<b>${num(dobles)}</b> ${dobles === 1 ? "albarán ya facturado" : "albaranes ya facturados"}`, "",
    "Ya vienen dentro de su factura, así que su detalle no se cuenta aparte: se compró una vez y se cuenta una vez."));

  const tope = j.topeProductos || 0;
  const avisoTope = tope
    ? `<p class="fic-nota" style="margin:0 0 12px"><b>Hay más productos distintos de los que caben de una vez.</b>
       Se enseñan los <b>${num(tope)} que más gasto tienen</b>, así que el total no es el de todos.
       Busca un producto o acota en <b>Filtros</b>.</p>`
    : "";

  const aviso = chips.length ? `<div class="fchips" style="margin:0 0 12px">${chips.join("")}</div>` : "";

  // La proporción del gasto, detrás del número. 891 € y 164 € se leen igual en una columna de
  // cifras; con la barra se ve dónde se va el dinero sin llegar a leerlas. Se mide contra el
  // producto que más gasta, no contra el total: si no, con 167 productos todas las barras
  // serían un pelo y no dirían nada.
  const topeGasto = Math.max(1, ...j.grupos.map((g) => Number(g.importe) || 0));
  // De qué categoría es cada producto: se sabe por su proveedor, que es como se etiqueta el
  // gasto. Un punto de color por fila convierte una lista gris en algo que se recorre por
  // bloques —«esto es pescado, esto es bebida»— sin leer una palabra.
  const catDeProv = new Map();
  for (const c of (j.categorias?.categorias || [])) {
    for (const pr of (c.proveedores || [])) if (!catDeProv.has(pr)) catDeProv.set(pr, c.categoria || c.nombre);
  }
  const catDe = (g) => catDeProv.get((g.proveedores || [])[0]) || "";
  const fila = (g) => `<tr class="${COMP_SEL.has(g.clave) ? "sel" : ""}">
      <td class="facsel"><input type="checkbox" data-compsel="${esc(g.clave)}" data-desc="${esc(g.descripcion || "")}" ${COMP_SEL.has(g.clave) ? "checked" : ""} aria-label="Elegir para unificar"></td>
      <td style="--cat:var(--cat-${esc(colorCategoriaFE(catDe(g)))})"><div style="display:flex;align-items:center;gap:6px;min-width:0"><span class="catdot" title="${esc(catDe(g) || "Sin categoría")}"></span>${g.unificado ? `<span class="pill ok" style="font-size:9.5px;flex:none" title="Producto del diccionario: junta varias formas de escribirlo">✓</span>` : ""}<button class="linkbtn prod" data-act="comp-producto" data-clave="${esc(g.clave || g.descripcion)}" data-nombre="${esc(g.descripcion)}" title="${esc(g.descripcion)} — todas las veces que lo hemos comprado">${esc(g.descripcion)}</button></div>
        <div class="mut provcel" style="font-size:11px" title="${esc(g.proveedores.join(" · "))}">${esc(g.proveedores.join(" · ") || "—")}</div></td>
      <td class="cantcel" style="text-align:right;white-space:nowrap">${g.cantidad != null ? esc(num(g.cantidad)) + (g.unidad ? ` <span class="mut" style="font-size:11px">${esc(g.unidad)}</span>` : "") : "—"}</td>
      <td style="text-align:right;white-space:nowrap"><div class="gastocel"><b>${g.importe != null ? esc(eur(g.importe)) : "—"}</b>
        <i class="gastobar" style="width:${Math.round(((Number(g.importe) || 0) / topeGasto) * 100)}%"></i></div></td>
      ${/* UNA SOLA COLUMNA DE PRECIO. «Precio normal» y «Último precio» traían casi siempre el
            mismo número, y cuando no, ya lo decía la píldora. Se queda el que se paga ahora, con
            su variación al lado y el normal en el rótulo al pasar por encima. */""}
      <td style="text-align:right;white-space:nowrap"${g.precioNormal != null ? ` title="Lo normal es ${esc(eur2(g.precioNormal))}"` : ""}>${g.ultimoPrecio != null ? `${esc(eur2(g.ultimoPrecio))}${compChipPrecio(g)}` : "—"}</td>
      <td class="sparkcel">${sparkPrecio(g)}</td>
      <td class="ultcel mut" style="white-space:nowrap;font-size:11.5px">${esc(g.veces)} ${g.veces === 1 ? "vez" : "veces"}<br>${esc(fechaCorta(g.ultima) || "")}</td>
    </tr>`;

  const tabla = j.grupos.length ? `<div class="tw${j.grupos.length > 25 ? " alta" : ""}"><table class="tbl">
      <thead><tr><th class="facsel"></th><th>Producto</th><th class="cantcel" style="text-align:right">Cantidad</th><th style="text-align:right">Gastado</th>
      <th style="text-align:right" title="Lo que se paga ahora. Al lado, cuánto se sale de lo normal">Precio</th>
      <th class="sparkcel" title="Cómo ha ido el precio en las últimas compras">Evolución</th><th class="ultcel">Última compra</th></tr></thead>
      <tbody>${j.grupos.map(fila).join("")}</tbody></table></div>${compBarraSeleccion()}`
    : `<p class="mut" style="margin:0;line-height:1.6">${COMP.q
        ? `No se ha comprado nada que se llame «${esc(COMP.q)}» en estas fechas.`
        : "Todavía no hay facturas con el detalle leído. A partir de ahora, cada factura que entre traerá su desglose."}</p>`;

  const detalle = j.lineas.length ? `<details class="card fold" style="margin-top:14px">
      <summary><h3>Compra a compra</h3><span class="foldr"><span>${num(j.lineas.length)} líneas</span><span class="car">${ic("chev", 16)}</span></span></summary>
      <div class="tw" style="max-height:320px;overflow:auto"><table class="tbl">
        <thead><tr><th>Fecha</th><th>Producto</th><th>Proveedor</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Importe</th><th></th></tr></thead>
        <tbody>${j.lineas.map((l) => `<tr${l.dudosa ? ' class="mut"' : ""}>
          <td class="mut" style="white-space:nowrap">${esc(l.fecha || "")}</td>
          <td>${esc(l.descripcion)}${l.dudosa ? ' <span class="fic-tag aviso">sin leer del todo</span>' : ""}</td>
          <td class="mut">${esc(l.proveedor || "")}</td>
          <td style="text-align:right">${l.cantidad != null ? esc(num(l.cantidad)) + (l.unidad ? " " + esc(l.unidad) : "") : "—"}</td>
          <td style="text-align:right">${l.precio_unitario != null ? esc(eur2(l.precio_unitario)) : "—"}</td>
          <td style="text-align:right">${l.importe != null ? esc(eur2(l.importe)) : "—"}</td>
          <td style="text-align:right"><button class="btn sm" data-compfac="${l.factura_id}">Ver factura</button></td>
        </tr>`).join("")}</tbody></table></div></details>` : "";

  cont.innerHTML = `${barra}${avisoTope}${compCategoriasHtml(j.categorias)}<div class="card">
      <div class="ch"><h3>${COMP.q ? `«${esc(COMP.q)}»` : COMP.proveedor ? `Lo que nos vende ${esc(COMP.proveedor)}` : "Todo lo comprado"}</h3>
        <span class="mut">${num(j.totales.productos)} ${j.totales.productos === 1 ? "producto" : "productos"} · <b>${esc(eur(j.totales.importe))}</b></span></div>
      ${aviso}${tabla}</div>${detalle}`;
}

// Releer el detalle de las facturas antiguas. Va por tandas y se enseña el avance: son
// cientos de descargas de Drive más una lectura cada una, y un botón que se queda pensando
// cinco minutos sin decir nada acaba con alguien recargando la página a la mitad.
async function comprasReleer() {
  let est;
  try { est = await apiRaw("/api/facturas/lineas/pendientes"); } catch (e) { return toast(e.message); }
  if (!est.releibles) {
    return modal("Nada que releer", `<p style="margin:0 0 16px;line-height:1.6">Todas las facturas que tienen su archivo en Drive ya tienen el detalle leído.
      ${est.sinArchivo ? `Hay <b>${num(est.sinArchivo)}</b> sin archivo guardado: de esas no se puede sacar el detalle.` : ""}</p>
      <div style="display:flex;justify-content:flex-end"><button class="btn" data-close>Cerrar</button></div>`);
  }

  const ok = await confirmModal(
    `Se van a releer ${est.releibles} facturas antiguas para sacarles el detalle. Se descarga cada archivo de Drive y se lee: tarda un rato y se puede parar cuando quieras. No se toca nada de la cabecera — proveedor, fechas e importes se quedan como están.`,
    { ok: "Empezar" });
  if (!ok) return;

  const ov = modal("Leyendo facturas antiguas", `
    <p id="relEstado" style="margin:0 0 12px;line-height:1.6">Empezando…</p>
    <div class="rows" id="relLista" style="max-height:260px;overflow:auto"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn" id="relParar">Parar</button></div>`);
  let parar = false;
  ov.querySelector("#relParar").addEventListener("click", () => { parar = true; ov.querySelector("#relParar").textContent = "Parando…"; });
  ov.addEventListener("click", (e) => { if (e.target === ov) parar = true; });

  let leidas = 0, avisos = 0, fallidas = 0;
  const estado = ov.querySelector("#relEstado"), lista = ov.querySelector("#relLista");
  while (!parar) {
    let r;
    try { r = await apiSend("POST", "/api/facturas/lineas/releer", { tanda: 15 }); }
    catch (e) { estado.innerHTML = `<b>Se ha parado:</b> ${esc(e.message)}`; break; }
    leidas += r.leidas; avisos += r.conAviso; fallidas += r.fallidas;
    for (const d of r.detalles) {
      lista.insertAdjacentHTML("afterbegin", `<div class="row"><div class="grow">
        <div class="t1">${esc(d.proveedor || "—")} <span class="mut">${esc(d.fecha || "")}</span></div>
        <div class="t2">${d.error ? `⚠️ ${esc(d.error)}` : `${d.lineas} ${d.lineas === 1 ? "línea" : "líneas"}${d.aviso ? " · " + esc(d.aviso) : ""}`}</div>
      </div></div>`);
    }
    estado.innerHTML = `<b>${num(leidas)}</b> leídas · quedan <b>${num(r.quedan)}</b>${avisos ? ` · ${num(avisos)} con avisos` : ""}${fallidas ? ` · ${num(fallidas)} sin poder leer` : ""}`;
    if (!r.quedan || (!r.leidas && !r.fallidas)) break;   // sin avance: no dar vueltas en balde
  }
  ov.querySelector("#relParar").textContent = "Cerrar";
  ov.querySelector("#relParar").setAttribute("data-close", "");
  estado.innerHTML += `<br><span class="mut">Terminado.</span>`;
  refrescarCompras();
}

async function comprasVerFactura(id) {
  let j;
  try { j = await apiRaw("/api/facturas/" + id + "/lineas"); } catch (e) { return toast(e.message); }
  const f = j.factura;
  modal(`${f.proveedor || "Factura"} · ${f.numero_factura || "s/n"}`, `
    <p class="mut" style="margin:0 0 12px">${esc(f.fecha || "")} · ${esc(nombreCortoLocal(f.local))} · base ${esc(eur(f.base_imponible || 0))}</p>
    ${(() => { const av = facRevisarTxt(f); return av.length
      ? `<p class="fic-nota"><b>Revisa lo leído.</b> ${av.map(esc).join(" ")}</p>` : ""; })()}
    ${f.lineas_aviso ? `<p class="fic-nota">${esc(f.lineas_aviso)}</p>` : ""}
    ${j.lineas.length ? `<div class="tw" style="max-height:340px;overflow:auto"><table class="tbl">
      <thead><tr><th>Producto</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Importe</th></tr></thead>
      <tbody>${j.lineas.map((l) => `<tr${l.dudosa ? ' class="mut"' : ""}>
        <td>${esc(l.descripcion)}</td>
        <td style="text-align:right">${l.cantidad != null ? esc(num(l.cantidad)) + (l.unidad ? " " + esc(l.unidad) : "") : "—"}</td>
        <td style="text-align:right">${l.precio_unitario != null ? esc(eur2(l.precio_unitario)) : "—"}</td>
        <td style="text-align:right">${l.importe != null ? esc(eur2(l.importe)) : "—"}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="mut" style="margin:0">Esta factura no tiene el detalle leído.</p>'}
    ${f.drive_url ? `<p style="margin:14px 0 0"><a class="btn sm" href="${esc(f.drive_url)}" target="_blank" rel="noopener">Ver el original</a></p>` : ""}
    <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn" data-close>Cerrar</button></div>`);
}
// ── Filtrado en vivo (sin botón «Buscar») ───────────────────────────────────
// Solo repinta #facRes, así el foco del buscador y el estado de los selects no se pierden.
// `_facSeq` descarta respuestas que llegan tarde (si escribes rápido, gana la última).
let _facSeq = 0, _facTimer = null;
// Solo el buscador filtra en vivo. Lo demás vive en el panel lateral y se aplica al
// pulsar «Aplicar»: mientras el panel tapa la lista, filtrar a cada toque no se ve, y
// además obligaría a repintar debajo de un panel abierto.
function applyFacFilter() {
  const el = document.getElementById("facQ");
  if (el) FACF.q = (el.value || "").trim();
  facRefresh();
}
function facFilterDebounced() { clearTimeout(_facTimer); _facTimer = setTimeout(applyFacFilter, 260); }
async function facRefresh() {
  const box = document.getElementById("facRes");
  if (!box) { loadFacturas(); return; } // fuera de la pestaña de facturas: recarga entera
  facScope();
  const seq = ++_facSeq;
  box.classList.add("livebusy");
  try {
    const lst = await pidePorLocales((loc) => { const q = facQS(loc); return "/api/facturas" + (q ? "?" + q : ""); }, { raw: true });
    if (seq !== _facSeq) return; // llegó tarde: ya hay una búsqueda más nueva
    FAC_LIST = (lst && lst.data) || [];
    FAC_TOT = facSumaTotales(lst);
    FAC_HAY_MAS = !!(lst && lst.hayMas);
    box.innerHTML = facTablaHtml(FAC_LIST);
    facCargarMiniaturas(box);
    // Y las cifras de arriba, que son de lo filtrado: si no se repintan, dicen otra cosa que
    // la tabla que tienen debajo, que es la forma más fácil de leer un número equivocado.
    const kpis = document.getElementById("facKpis");
    if (kpis) kpis.outerHTML = facKpisHtml();
  } catch (e) {
    if (seq === _facSeq && e.message !== "noauth") box.innerHTML = errorCard(e.message);
  } finally {
    if (seq === _facSeq) box.classList.remove("livebusy");
  }
}
function fac303Csv() {
  const d = FAC303.data; if (!d) { toast("Calcula primero el 303"); return; }
  const rows = [["Concepto", "Base", "Cuota", "Docs"]];
  (d.porTipoIva || []).forEach((t) => rows.push([`IVA ${t.tipo_iva}%`, t.base_total, t.cuota_total, t.num_docs]));
  if (d.totales) rows.push(["Total facturas", d.totales.base_total, d.totales.cuota_total, d.totales.num_facturas]);
  if (d.otrosDocs) rows.push(["Otros documentos", "", d.otrosDocs.total_otros, d.otrosDocs.num_otros]);
  const csv = rows.map((r) => r.map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `modelo303_${FAC303.empresa || ""}_T${FAC303.trimestre || ""}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function facColocarRaiz() {
  if (!(await confirmModal("¿Colocar la carpeta de facturas en «Mi unidad»? No se mueve ni se copia ningún archivo: la carpeta cambia de sitio con todo lo que tiene dentro, y los enlaces guardados siguen funcionando.", { ok: "Colocarla" }))) return;
  try { const j = await apiSend("POST", "/api/facturas/drive-colocar-raiz"); toast(j.mensaje || "Hecho ✅"); facDiagnosticoDrive(); }
  catch (e) { toast("Error: " + e.message); }
}
async function facMigrar() { if (!(await confirmModal("¿Reordenar en Drive todas las facturas a su carpeta Empresa/Local/Mes?", { ok: "Reordenar" }))) return; try { const j = await apiSend("POST", "/api/facturas/migrar-estructura"); toast(`Reordenadas: ${j.resultado ? j.resultado.movidos : "OK"} ✅`); facDiagnosticoDrive(); } catch (e) { toast("Error: " + e.message); } }
async function facDriveAdd() { const local = facVal("fdLocal"), folder = facVal("fdFolder"); if (!local || !folder) { toast("Local y carpeta obligatorios"); return; } try { await apiSend("POST", "/api/facturas/drive-carpetas", { local, folder }); toast("Carpeta vinculada ✅"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facDriveDel(local) { if (!(await confirmModal(`¿Dejar de vigilar la carpeta de ${local}?`, { ok: "Eliminar", danger: true }))) return; try { await apiSend("DELETE", "/api/facturas/drive-carpetas/" + encodeURIComponent(local)); toast("Eliminada"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facReconstruir() { if (!(await confirmModal("¿Reconstruir el Sheet maestro con todas las facturas registradas?", { ok: "Reconstruir" }))) return; try { const j = await apiSend("POST", "/api/facturas/reconstruir-maestro"); toast(`Maestro actualizado: ${num(j.total || 0)} facturas ✅`); loadFacturas(); } catch (e) { toast("Error: " + e.message); } }
// ── Repasar hacia atrás las facturas ya guardadas ───────────────────────────
// MIRAR y APLICAR van separados a propósito: apartar una factura como dudosa la saca de todos
// los totales, y eso no se hace a ciegas por darle a un botón. Primero se enseña qué saldría.
async function facRepaso() {
  const ov = modal("Repaso de las facturas guardadas", `<p class="mut" id="repCuerpo" style="margin:0;line-height:1.6">Mirando las facturas… (no se está cambiando nada)</p>`);
  let j;
  try { j = await apiRaw("/api/facturas/repaso"); }
  catch (e) { const c = ov.querySelector("#repCuerpo"); if (c) c.textContent = e.message; return; }
  facRepasoPintar(ov, j);
}

function facRepasoPintar(ov, j) {
  const cuerpo = ov.querySelector(".modal-b");
  if (!cuerpo) return;
  const nadaBarato = !j.avisosNuevos && !j.avisosQuitados && !j.avisosCambiados && !j.sospechas;

  const fila = (t1, t2) => `<div class="row"><div class="grow"><div class="t1">${t1}</div><div class="t2">${t2}</div></div></div>`;
  const listaDudas = j.dudas && j.dudas.length ? `<details class="fold" style="margin-top:10px"><summary><b>Las que se apartarían</b> <span class="mut">(${num(j.sospechas)})</span></summary>
      <div class="rows" style="max-height:220px;overflow:auto">${j.dudas.map((d) => `<div class="row"><div class="grow">
        <div class="t1">${esc(d.proveedor || "—")} · nº ${esc(d.numero_factura || "s/n")} <span class="mut">${esc(d.fecha || "")}</span></div>
        <div class="t2">Se parece a la #${esc(String(d.contraId))}. ${esc(d.resumen)}</div></div></div>`).join("")}</div></details>` : "";
  const listaAvisos = j.revisiones && j.revisiones.length ? `<details class="fold" style="margin-top:10px"><summary><b>Avisos que cambian</b> <span class="mut">(muestra)</span></summary>
      <div class="rows" style="max-height:220px;overflow:auto">${j.revisiones.map((r) => `<div class="row"><div class="grow">
        <div class="t1">${esc(r.proveedor || "—")} · nº ${esc(r.numero_factura || "s/n")} <span class="mut">${esc(r.fecha || "")}</span></div>
        <div class="t2">${r.textos.length ? esc(r.textos.join(" · ")) : "Ya no hace falta revisarla"}</div></div></div>`).join("")}</div></details>` : "";

  cuerpo.innerHTML = `
    <p style="margin:0 0 12px;line-height:1.6">Repasadas <b>${num(j.facturas)}</b> facturas${j.tope ? " (el tope de una pasada)" : ""}.</p>
    <div class="rows">
      ${fila(`<b>${num(j.avisosNuevos)}</b> con avisos nuevos${j.graves ? ` · ${num(j.graves)} de los serios` : ""}`, "Base + IVA que no cuadra, NIF distinto del de siempre o importe fuera de escala.")}
      ${j.avisosQuitados || j.avisosCambiados ? fila(`<b>${num(j.avisosQuitados + j.avisosCambiados)}</b> con avisos que ya no tocan`, "Se corrigieron a mano y el aviso sobra.") : ""}
      ${fila(`<b>${num(j.sospechas)}</b> posibles repetidas${j.certezas ? ` · ${num(j.certezas)} casi seguras` : ""}`, "Se apartan de los totales y las decide una persona en «Posibles duplicados». No se borra ninguna.")}
      ${fila(`<b>${num(j.porReleer)}</b> por releer para los descuentos`, "Se guardó el precio de tarifa en vez de lo que se paga. Hay que volver a leer el documento: tarda.")}
    </div>
    ${listaDudas}${listaAvisos}
    <p class="mut" style="margin:12px 0 0;line-height:1.5">El repaso deja las facturas viejas igual que si hubieran entrado hoy. Nunca borra: lo dudoso se aparta y lo decide una persona.</p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
      <button class="btn" data-close>Cerrar</button>
      ${(j.alcances || []).some((a) => a.n) ? `<button class="btn" id="repLineas">Volver a leer documentos…</button>` : ""}
      ${nadaBarato ? "" : `<button class="btn primary" id="repAplicar">Aplicar avisos y apartar repetidas</button>`}
    </div>`;

  const bAplicar = cuerpo.querySelector("#repAplicar");
  if (bAplicar) bAplicar.addEventListener("click", async () => {
    bAplicar.disabled = true; bAplicar.textContent = "Aplicando…";
    try {
      const r = await apiSend("POST", "/api/facturas/repaso", {});
      toast(`Repaso aplicado: ${num(r.avisos)} avisos · ${num(r.apartadas)} apartadas ✅`);
      ov.remove(); loadFacturas();
    } catch (e) { toast("Error: " + e.message); bAplicar.disabled = false; bAplicar.textContent = "Aplicar avisos y apartar repetidas"; }
  });
  const bLineas = cuerpo.querySelector("#repLineas");
  if (bLineas) bLineas.addEventListener("click", () => { ov.remove(); facElegirAlcance(j.alcances || []); });
}

/**
 * Qué facturas volver a leer. Hace falta elegir porque «al día» no quiere decir «bien»: si la
 * lectura de una factura larga se cortó, se guardaron las líneas que llegaron y quedó marcada
 * con la versión de hoy igual que las buenas.
 */
function facElegirAlcance(alcances) {
  const hay = alcances.filter((a) => a.n > 0);
  if (!hay.length) return toast("No hay ninguna que releer");
  const ov = modal("¿Cuáles vuelvo a leer?", `
    <p class="mut" style="margin:0 0 12px;line-height:1.55">Estar «al día» no quiere decir estar bien: si la lectura
      de una factura larga se cortó, se guardó lo que llegó y quedó marcada igual que las buenas. Por eso se puede
      pedir de tres maneras.</p>
    <div class="rows">${hay.map((a) => `<div class="row">
        <div class="grow" style="min-width:0"><div class="t1">${esc(a.label)} · <b>${num(a.n)}</b></div>
          <div class="t2">${esc(a.ayuda)}</div></div>
        <button class="btn sm ${a.clave === "descuadre" ? "primary" : ""}" data-alcance="${esc(a.clave)}" data-n="${a.n}">Leer estas</button>
      </div>`).join("")}</div>`);
  ov.addEventListener("click", (e) => {
    const b = e.target.closest("[data-alcance]");
    if (!b) return;
    ov.remove();
    facRepasoLineas(Number(b.getAttribute("data-n")), b.getAttribute("data-alcance"));
  });
}

// Lo caro: releer el documento de las que se leyeron antes de los descuentos. Va por tandas y
// enseña el avance —son cientos de descargas más una lectura cada una— y se puede parar.
async function facRepasoLineas(total, alcance = "faltan") {
  const ok = await confirmModal(
    `Se van a releer ${total} facturas. Se descarga cada archivo de Drive y se vuelve a leer: tarda un rato y se puede parar cuando quieras. No se toca la cabecera —proveedor, fechas e importes se quedan como están—, solo el detalle.`,
    { ok: "Empezar" });
  if (!ok) return;

  const ov = modal("Releyendo para los descuentos", `
    <p id="repEstado" style="margin:0 0 12px;line-height:1.6">Empezando…</p>
    <div class="rows" id="repLista" style="max-height:260px;overflow:auto"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button class="btn" id="repParar">Parar</button></div>`);
  let parar = false;
  const bParar = ov.querySelector("#repParar");
  bParar.addEventListener("click", () => { parar = true; bParar.textContent = "Parando…"; });
  ov.addEventListener("click", (e) => { if (e.target === ov) parar = true; });

  const estado = ov.querySelector("#repEstado"), lista = ov.querySelector("#repLista");
  // Las que fallan se van apuntando y se le dicen al servidor para que no vuelva a sacarlas:
  // si no, cada tanda tropezaría con las mismas y el contador no bajaría nunca.
  const saltar = [];
  // Las que NO se han podido leer se cuentan aparte: la lista de saltar lleva también las
  // buenas cuando el alcance no es «las que faltan», y contarlas como fallos diría que no se
  // ha podido leer justo lo que sí se ha leído.
  let leidas = 0, conDto = 0, fallidas = 0;
  while (!parar) {
    let r;
    try { r = await apiSend("POST", "/api/facturas/repaso/lineas", { tanda: 10, saltar, alcance }); }
    catch (e) { estado.innerHTML = `<b>Se ha parado:</b> ${esc(e.message)}`; break; }
    leidas += r.leidas; conDto += r.conDescuento;
    for (const d of r.detalles) {
      // Con «todas» o «las que no cuadran», releer no cambia el filtro: si no se apuntaran
      // también las que SALEN BIEN, la tanda siguiente volvería a coger las mismas y esto no
      // terminaría nunca. Con «las que faltan» basta con las fallidas, porque las buenas suben
      // de versión y salen solas del filtro.
      if (d.error) fallidas++;
      if (d.error || alcance !== "faltan") saltar.push(d.id);
      lista.insertAdjacentHTML("afterbegin", `<div class="row"><div class="grow">
        <div class="t1">${esc(d.proveedor || "—")} <span class="mut">${esc(d.fecha || "")}</span></div>
        <div class="t2">${d.error ? `⚠️ ${esc(d.error)}` : `${d.lineas} ${d.lineas === 1 ? "línea" : "líneas"}${d.descuentos ? ` · ${d.descuentos} con descuento` : " · sin descuentos"}`}</div>
      </div></div>`);
    }
    estado.innerHTML = `<b>${num(leidas)}</b> releídas · quedan <b>${num(r.quedan)}</b>${conDto ? ` · ${num(conDto)} traían descuento` : ""}${fallidas ? ` · ${num(fallidas)} sin poder leer` : ""}`;
    if (!r.quedan || (!r.leidas && !r.fallidas)) break;   // sin avance: no dar vueltas en balde
  }
  bParar.textContent = "Cerrar"; bParar.setAttribute("data-close", "");
  estado.innerHTML += `<br><span class="mut">Terminado. ${alcance === "faltan"
    ? "Las que traían descuento ya guardan lo que se paga, no la tarifa."
    : "Se ha vuelto a leer el documento de cada una; el detalle está como si entraran hoy."}</span>`;
  loadFacturas();
}

async function facReparar() { if (!(await confirmModal("¿Verificar y reparar todos los Sheets desde la base de datos? Reescribe las hojas por local y el maestro.", { ok: "Reparar" }))) return; toast("Reparando Sheets… (puede tardar)"); try { const j = await apiSend("POST", "/api/facturas/reparar"); toast(`Sheets reparados: ${num(j.tabs || 0)} hojas · maestro ${num(j.maestro || 0)} facturas ✅`); loadFacturas(); } catch (e) { toast("Error: " + e.message); } }
async function facReproyectar() { toast("Reintentando volcado a Sheets…"); try { const j = await apiSend("POST", "/api/facturas/reproyectar"); toast(`Volcado: ${num(j.sincronizados || 0)} factura(s) sincronizadas${j.fallidos ? ` · ${num(j.fallidos)} grupo(s) con error` : ""} ✅`); loadFacturas(); } catch (e) { toast("Error: " + e.message); } }
async function facEmpezarCero() {
  if (!(await confirmModal("¿EMPEZAR DE CERO? Se borrarán TODAS las facturas de la base de datos (no los archivos de Drive). Úsalo solo para reiniciar el sistema.", { ok: "Sí, borrar todo", danger: true }))) return;
  if (!(await confirmModal("Confirmación final: esto no se puede deshacer. ¿Seguro?", { ok: "Empezar de cero", danger: true }))) return;
  try { const j = await apiSend("POST", "/api/facturas/reset-test"); toast("Base de datos de facturas limpiada ✅"); loadFacturas(); }
  catch (e) { toast("Error: " + e.message); }
}
const facVal = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
async function facLocAdd() { const local = facVal("flLocal"), empresa = facVal("flEmp"); if (!local || !empresa) { toast("Local y empresa obligatorios"); return; } try { await apiSend("POST", "/api/facturas/locales", { local, empresa, cif: facVal("flCif"), local_contable: facVal("flCont") }); toast("Guardado ✅"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facLocDel(local) { if (!(await confirmModal(`¿Quitar la empresa de ${local}?`, { ok: "Eliminar", danger: true }))) return; try { await apiSend("DELETE", "/api/facturas/locales/" + encodeURIComponent(local)); toast("Eliminado"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facMailAdd() { const email = facVal("frEmail"), local = facVal("frLocal"); if (!email || !local) { toast("Email y local obligatorios"); return; } try { await apiSend("POST", "/api/facturas/email-reglas", { email, local }); toast("Regla añadida ✅"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facMailDel(id) { try { await apiSend("DELETE", "/api/facturas/email-reglas/" + encodeURIComponent(id)); toast("Eliminada"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facGrpAdd() { const local = facVal("fgLocal"), group_jid = facVal("fgGroup"); if (!local || !group_jid) { toast("Local y grupo obligatorios"); return; } try { await apiSend("POST", "/api/facturas/grupos", { local, group_jid }); toast("Grupo vinculado ✅"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facGrpDel(id) { try { await apiSend("DELETE", "/api/facturas/grupos/" + encodeURIComponent(id)); toast("Eliminado"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function fac303() {
  const empresa = facVal("m303emp"), trimestre = facVal("m303tri");
  if (!empresa || !trimestre) { toast("Elige empresa y trimestre"); return; }
  FAC303.empresa = empresa; FAC303.trimestre = trimestre; FAC303.error = ""; FAC303.data = null;
  try { const qs = new URLSearchParams({ empresa, trimestre, "año": String(new Date().getFullYear()) }); const j = await apiSend("GET", "/api/facturas/modelo303?" + qs.toString()); FAC303.data = j.data || j; }
  catch (e) { FAC303.error = e.message; }
  const v = document.getElementById("view"); if (v) v.innerHTML = renderFacturasConfig();
}
async function facPago(id) { try { await apiSend("PATCH", "/api/facturas/" + encodeURIComponent(id) + "/pago"); toast("Estado de pago actualizado"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }

// Revisar una factura pendiente: vista previa del documento a la izquierda y formulario
// editable a la derecha, sin salir de la pestaña. Al asignar, se guardan las correcciones.
function facRevisar(id) {
  const p = (FAC_PEND || []).find((x) => String(x.id) === String(id));
  if (!p) { toast("Pendiente no encontrada"); return; }
  const sug = p.sugerido || {};
  const fld = (label, key, type = "text", extra = "") => `<div class="field"><label>${label}</label><input data-pf="${key}" type="${type}" ${extra} value="${esc(p[key] != null ? p[key] : "")}"></div>`;
  const localSel = `<div class="field"><label>Local${sug.local ? ` · <span class="mut">sugerido: ${esc(nombreCortoLocal(sug.local))}</span>` : ""}</label><select id="prLocal"><option value="">Elegir local…</option>${LOCALES.map((l) => `<option value="${esc(l)}" ${sug.local === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  const tipoSel = `<div class="field"><label>Tipo</label><select data-pf="tipo">${["factura", "albaran", "ticket", "otro"].map((t) => `<option value="${t}" ${p.tipo === t ? "selected" : ""}>${cap(t)}</option>`).join("")}</select></div>`;
  const body = `<div class="revrev">
    <div class="prev"><div class="ld" id="prPrev">Cargando vista previa…</div></div>
    <div>
      <div class="form-grid">
        ${fld("Proveedor", "proveedor")}${fld("NIF proveedor", "nif")}
        ${fld("Nº documento", "numero_factura")}${fld("Fecha", "fecha", "date")}
        ${tipoSel}${localSel}
        ${fld("Concepto", "concepto")}${fld("Base (€)", "base_imponible", "number", 'step="0.01"')}
        ${fld("IVA %", "porcentaje_iva", "number", 'step="0.01"')}${fld("Cuota (€)", "cuota_iva", "number", 'step="0.01"')}
        ${fld("Total (€)", "total", "number", 'step="0.01"')}
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px;align-items:center">
        ${p.drive_url ? `<a class="btn sm" href="${esc(p.drive_url)}" target="_blank" rel="noopener">Abrir en Drive ↗</a>` : "<span></span>"}
        <div style="display:flex;gap:8px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="prAsignar">Asignar</button></div>
      </div>
    </div>
  </div>`;
  const ov = modal("Revisar factura · " + (p.proveedor || p.id), body);
  ov.querySelector(".modal").classList.add("wide");
  // Vista previa: descargamos el archivo con el token y lo mostramos como blob (iframe/img).
  let blobUrl = null;
  (async () => {
    try {
      const r = await fetch("/api/facturas/pendientes/" + encodeURIComponent(id) + "/archivo", { headers: { Authorization: "Bearer " + token() } });
      if (!r.ok) throw new Error("no disponible");
      const blob = await r.blob(); blobUrl = URL.createObjectURL(blob);
      const cont = ov.querySelector(".prev");
      cont.innerHTML = blob.type.startsWith("image/")
        ? `<img src="${blobUrl}" alt="Vista previa">`
        : `<iframe src="${blobUrl}" title="Vista previa"></iframe>`;
    } catch {
      const el = ov.querySelector("#prPrev");
      if (el) el.innerHTML = `<div style="text-align:center;padding:12px">No se pudo cargar la vista previa.${p.drive_url ? `<br><a class="link" href="${esc(p.drive_url)}" target="_blank" rel="noopener">Abrir en Drive ↗</a>` : ""}</div>`;
    }
  })();
  ov.addEventListener("click", (e) => { if ((e.target === ov || e.target.closest("[data-close]")) && blobUrl) URL.revokeObjectURL(blobUrl); });
  ov.querySelector("#prAsignar").addEventListener("click", async () => {
    const local = ov.querySelector("#prLocal").value;
    if (!local) { toast("Elige un local"); return; }
    const payload = { local };
    ov.querySelectorAll("[data-pf]").forEach((el) => { payload[el.getAttribute("data-pf")] = el.value; });
    try {
      await apiSend("POST", "/api/facturas/pendientes/" + encodeURIComponent(id) + "/asignar", payload);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      ov.remove(); toast("Factura asignada a " + local + " ✅"); loadFacturas();
    } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
  });
}

// ════════════════════════ VISTA: WHATSAPP ════════════════════════
let WA_POLL = null;
function waGroupOpts(cur, groups) {
  let opts = `<option value="">— sin vincular —</option>`;
  const has = (groups || []).some((g) => g.id === cur);
  if (cur && !has) opts += `<option value="${esc(cur)}" selected>Grupo actual (vinculado)</option>`;
  opts += (groups || []).map((g) => `<option value="${esc(g.id)}" ${cur === g.id ? "selected" : ""}>${esc(g.name || g.id)}</option>`).join("");
  return opts;
}
function renderWhatsApp(status, qr, links, groups) {
  const connected = status && status.connected;
  const linkMap = {}; (links || []).forEach((l) => { linkMap[l.local] = l.group_jid; });
  const conn = `<div class="card"><div class="ch"><h3>Conexión de Sara</h3><span class="pill ${connected ? "ok" : "bad"}">${connected ? "Conectado" : "Desconectado"}</span></div>${connected ? `<p class="mut">Sara está conectada y atiende reservas por WhatsApp automáticamente.</p>` : `<p class="mut">Escanea este código desde WhatsApp → Dispositivos vinculados para reconectar a Sara:</p>${qr && qr.qr ? `<div style="text-align:center;padding:10px"><img src="${esc(qr.qr)}" alt="Código QR" style="width:240px;height:240px;border-radius:12px;background:#fff;padding:8px"></div><div class="mut" style="text-align:center;font-size:12px">El código se actualiza solo; en cuanto vincules, esta pantalla lo detectará.</div>` : '<p class="mut">Generando código QR…</p>'}`}</div>`;
  const linksCard = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Grupos por local</h3>${connected ? "" : '<span class="pill">Conecta Sara para elegir grupos</span>'}</div><div class="rows">${LOCALES.map((local) => { const cur = linkMap[local] || ""; return `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(local)}</div>${cur ? `<div class="t2">Vinculado</div>` : `<div class="t2">Sin vincular</div>`}</div><select class="waSel" style="max-width:210px" ${connected ? "" : "disabled"}>${waGroupOpts(cur, groups)}</select><button class="btn sm" data-act="wa-link" data-local="${esc(local)}" ${connected ? "" : "disabled"}>Guardar</button></div>`; }).join("")}</div><div class="mut" style="padding:12px 18px;font-size:12px">El grupo de cada local recibe los avisos de reservas y cancelaciones.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Comunicación</div><h1>WhatsApp / Sara</h1><div class="sub">Estado de la conexión y vinculación de grupos por local</div></div><div class="grid g2">${conn}${linksCard}</div>`;
}
async function waLink(local, btn) {
  const row = btn && btn.closest(".row"); const sel = row && row.querySelector(".waSel"); const groupId = sel ? sel.value : "";
  if (!groupId) { toast("Elige un grupo primero"); return; }
  try { await apiSend("POST", "/api/whatsapp/link", { local, groupId }); toast("Grupo vinculado ✅"); loadWhatsApp(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function loadWhatsApp() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const status = await apiRaw("/api/whatsapp/status");
    let qr = null; if (!status.connected) { try { qr = await apiRaw("/api/whatsapp/qr"); } catch { /* opcional */ } }
    const links = await apiOptional("/api/whatsapp/links");
    const groups = status.connected ? (await apiOptional("/api/whatsapp/groups")) : [];
    view.innerHTML = renderWhatsApp(status, qr, links, groups);
    clearInterval(WA_POLL); WA_POLL = null;
    if (!status.connected) WA_POLL = setInterval(pollWa, 6000);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
async function pollWa() {
  if (CURRENT !== "whatsapp") { clearInterval(WA_POLL); WA_POLL = null; return; }
  try { const s = await apiRaw("/api/whatsapp/status"); if (s && s.connected) { clearInterval(WA_POLL); WA_POLL = null; loadWhatsApp(); } } catch { /* reintenta */ }
}

// ── Sara (IA): configurar el chatbot por conversación ─────────────────────────
let SARA = { msgs: [], adjuntos: [], proposal: null, estado: null, sending: false };
const SARA_HINTS = [
  "Bloquea las reservas de La Tapeta Blanes del 24 al 26 de diciembre",
  "Cuando pregunten por el menú de Navidad, que Sara envíe este PDF",
  "Añade a las instrucciones: recuérdales que tenemos terraza",
];
function saraPropText(p) {
  if (!p) return "";
  const d = p.datos || {};
  switch (p.tipo) {
    case "proponer_instrucciones": return "Actualizar las <b>instrucciones generales</b> de Sara.";
    case "proponer_bloqueo": return `<b>Bloquear reservas</b> en ${esc(d.local || "—")}${d.desde ? ` del ${esc(d.desde)}` : ""}${d.hasta ? ` al ${esc(d.hasta)}` : ""}${d.motivo ? ` · ${esc(d.motivo)}` : ""}.`;
    case "proponer_regla_documento": return `Cuando pregunten por «${esc(d.tema || "…")}», <b>enviar el documento</b> adjunto${d.local ? ` (${esc(d.local)})` : ""}.`;
    case "proponer_respuesta_texto": return `Cuando pregunten por «${esc(d.tema || "…")}», <b>responder</b>: ${esc((d.respuesta || "").slice(0, 120))}${(d.respuesta || "").length > 120 ? "…" : ""}`;
    case "proponer_eliminar": return "<b>Eliminar</b> una regla o bloqueo existente.";
    case "proponer_set_contenido":
    case "proponer_set_texto":
    case "proponer_anadir_galeria": return "Actualizar <b>contenido de la web</b> pública.";
    default: return "Aplicar el cambio propuesto.";
  }
}
function renderSaraBubbles() {
  const items = SARA.msgs.map((m) => {
    const mine = m.role === "user";
    return `<div class="sbub ${mine ? "me" : "sara"}"><div class="sbub-in">${esc(m.content)}</div></div>`;
  }).join("");
  const typing = SARA.sending ? `<div class="sbub sara"><div class="sbub-in mut">Sara está escribiendo…</div></div>` : "";
  const empty = (!SARA.msgs.length && !SARA.sending) ? `<div class="mut" style="padding:14px 4px">Escríbele a Sara en lenguaje natural para configurarla. Por ejemplo:<ul style="margin:8px 0 0;padding-left:18px;line-height:1.8">${SARA_HINTS.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>` : "";
  return `<div id="saraChat" class="schat">${empty}${items}${typing}</div>`;
}
function renderSaraProposal() {
  if (!SARA.proposal) return "";
  return `<div class="sprop"><div class="sprop-t">Sara propone:</div><div class="sprop-b">${saraPropText(SARA.proposal)}</div><div class="sprop-a"><button class="btn primary sm" data-act="sara-aplicar">Sí, aplicar</button><button class="btn sm" data-act="sara-cancelar">No</button></div></div>`;
}
function renderSaraInput() {
  const chips = SARA.adjuntos.map((u, i) => `<span class="chip">${esc(u.split("/").pop())}<button class="chip-x" data-act="sara-adj-del" data-idx="${i}" title="Quitar">×</button></span>`).join("");
  return `<div class="sbar">${chips ? `<div class="sadj">${chips}</div>` : ""}<div class="sbar-row"><label class="sattach" title="Adjuntar PDF o imagen">${ic("clip", 18)}<input type="file" accept="application/pdf,image/*" data-saraupload multiple hidden></label><textarea id="saraInput" rows="1" placeholder="Escribe a Sara…" ${SARA.sending ? "disabled" : ""}></textarea><button class="btn primary" data-act="sara-send" ${SARA.sending ? "disabled" : ""}>Enviar</button></div></div>`;
}
function renderSaraEstado() {
  const e = SARA.estado || {};
  const instr = (e.instrucciones || "").trim();
  const instrCard = `<div class="card"><div class="ch"><h3>Instrucciones generales</h3></div>${instr ? `<p style="white-space:pre-wrap;margin:0;line-height:1.6">${esc(instr)}</p>` : `<p class="mut">Sin instrucciones personalizadas. Sara usa su comportamiento por defecto.</p>`}</div>`;
  const bloqueos = (e.bloqueos || []);
  const bloCard = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Bloqueos de reservas</h3><span class="pill">${bloqueos.length}</span></div>${bloqueos.length ? `<div class="rows">${bloqueos.map((b) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(b.local)}</div><div class="t2">${esc(b.desde)} → ${esc(b.hasta)}${b.motivo ? ` · ${esc(b.motivo)}` : ""}</div></div><button class="btn sm danger" data-act="sara-blo-del" data-id="${esc(String(b.id))}">Eliminar</button></div>`).join("")}</div>` : `<p class="mut" style="padding:0 18px 16px">No hay fechas bloqueadas. Sara acepta reservas en todos los locales.</p>`}</div>`;
  const reglas = (e.reglas || []);
  const regCard = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Respuestas y documentos</h3><span class="pill">${reglas.length}</span></div>${reglas.length ? `<div class="rows">${reglas.map((r) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(r.tema || "—")}${r.local ? ` <span class="mut">· ${esc(r.local)}</span>` : ""}</div><div class="t2">${r.documento_url ? "📎 Envía un documento" : esc((r.respuesta || "").slice(0, 90))}</div></div><button class="btn sm danger" data-act="sara-reg-del" data-id="${esc(String(r.id))}">Eliminar</button></div>`).join("")}</div>` : `<p class="mut" style="padding:0 18px 16px">Sin respuestas configuradas. Sara responde con su conocimiento general.</p>`}</div>`;
  return `${instrCard}${bloCard}${regCard}`;
}
function renderSara() {
  const chatCard = `<div class="card p0 schat-card"><div class="ch" style="padding:18px 18px 0"><h3>Configura a Sara hablando</h3></div>${renderSaraBubbles()}${renderSaraProposal()}${renderSaraInput()}</div>`;
  return `<div class="ph"><div class="eyebrow">Inteligencia</div><h1>Sara (IA)</h1><div class="sub">Instruye al chatbot de WhatsApp sin tocar código: propone → confirmas → se aplica</div></div><div class="grid g2 sara-grid">${chatCard}<div class="scol">${renderSaraEstado()}</div></div>`;
}
function saraRepaint(focus) {
  const v = document.getElementById("view"); if (!v || CURRENT !== "sara") return;
  v.innerHTML = renderSara();
  const ch = document.getElementById("saraChat"); if (ch) ch.scrollTop = ch.scrollHeight;
  if (focus) { const inp = document.getElementById("saraInput"); if (inp) inp.focus(); }
}
async function loadSara() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    SARA.estado = await apiRaw("/api/sara/estado");
    view.innerHTML = renderSara();
    const ch = document.getElementById("saraChat"); if (ch) ch.scrollTop = ch.scrollHeight;
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
async function saraRefreshEstado() { try { SARA.estado = await apiRaw("/api/sara/estado"); } catch { /* mantiene el anterior */ } }
async function saraSend() {
  if (SARA.sending) return;
  const inp = document.getElementById("saraInput"); const text = inp ? inp.value.trim() : "";
  if (!text && !SARA.adjuntos.length) return;
  SARA.msgs.push({ role: "user", content: text || "(archivo adjunto)" });
  const adjuntos = SARA.adjuntos.slice();
  SARA.adjuntos = []; SARA.sending = true; SARA.proposal = null;
  saraRepaint(false);
  try {
    const j = await apiSend("POST", "/api/sara/chat", { mensajes: SARA.msgs.slice(-20), adjuntos });
    SARA.sending = false;
    const reply = j.reply || (j.data && j.data.reply) || "";
    if (reply) SARA.msgs.push({ role: "assistant", content: reply });
    SARA.proposal = j.proposal || (j.data && j.data.proposal) || null;
    saraRepaint(true);
  } catch (e) {
    SARA.sending = false;
    if (e.message !== "noauth") { SARA.msgs.push({ role: "assistant", content: "⚠ No pude procesar eso: " + e.message }); saraRepaint(true); }
  }
}
async function saraAplicar() {
  if (!SARA.proposal) return;
  try {
    const j = await apiSend("POST", "/api/sara/aplicar", { proposal: SARA.proposal });
    SARA.estado = j.data || j; SARA.proposal = null;
    SARA.msgs.push({ role: "assistant", content: "✅ Hecho. Lo tienes en la configuración activa." });
    toast("Cambio aplicado ✅"); saraRepaint(true);
  } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
function saraCancelar() { SARA.proposal = null; SARA.msgs.push({ role: "assistant", content: "De acuerdo, no aplico nada." }); saraRepaint(true); }
async function saraUpload(input) {
  const files = input.files; if (!files || !files.length) return;
  toast("Subiendo…");
  try {
    const fd = new FormData(); for (const f of files) fd.append("files", f);
    const r = await fetch("/api/upload", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
    const j = await r.json(); if (!j.ok || !j.urls || !j.urls.length) throw new Error("subida");
    SARA.adjuntos = SARA.adjuntos.concat(j.urls).slice(0, 5);
    toast("Archivo adjunto ✅"); saraRepaint(true);
  } catch { toast("Error al subir el archivo"); }
}
function saraAdjDel(i) { SARA.adjuntos.splice(i, 1); saraRepaint(true); }
async function saraBloDel(id) {
  const ok = await confirmModal("¿Eliminar este bloqueo de reservas?", { ok: "Eliminar", danger: true }); if (!ok) return;
  try { await apiSend("DELETE", "/api/sara/bloqueo/" + id); await saraRefreshEstado(); toast("Bloqueo eliminado ✅"); saraRepaint(false); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function saraRegDel(id) {
  const ok = await confirmModal("¿Eliminar esta respuesta configurada?", { ok: "Eliminar", danger: true }); if (!ok) return;
  try { await apiSend("DELETE", "/api/sara/regla/" + id); await saraRefreshEstado(); toast("Respuesta eliminada ✅"); saraRepaint(false); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// ── Comunicados (avisos al equipo) ────────────────────────────────────────────
function renderComunicados(list) {
  list = list || [];
  const locOpts = LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const form = `<div class="card"><div class="ch"><h3>Publicar comunicado</h3></div><div class="toolbar"><div class="field"><label>Local</label><select id="comLocal">${locOpts}</select></div></div><div class="field" style="width:100%"><label>Mensaje para el equipo</label><textarea id="comMsg" rows="3" placeholder="Escribe el aviso que verán los trabajadores…"></textarea></div><button class="btn primary" data-act="com-add">Publicar comunicado</button></div>`;
  const items = list.length ? list.map((a) => `<div class="card" style="padding:14px 16px"><div class="t2">${esc(a.local || "")} · ${esc(String(a.creado_en || "").slice(0, 10))}</div><div style="white-space:pre-wrap;margin-top:4px">${esc(a.mensaje || "")}</div></div>`).join("") : `<div class="card"><div class="mut" style="padding:6px">Sin comunicados publicados.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Operación</div><h1>Comunicados</h1><div class="sub">Avisos que verán los trabajadores en su panel</div></div>${form}<div class="grid" style="gap:10px;margin-top:16px">${items}</div>`;
}
async function loadComunicados() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { view.innerHTML = renderComunicados(await api("/api/announcements?rol=trabajadores")); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
async function comAdd() {
  const local = (document.getElementById("comLocal") || {}).value || "";
  const mensaje = (document.getElementById("comMsg") || {}).value || "";
  if (!mensaje.trim()) { toast("Escribe el mensaje del comunicado"); return; }
  if (!local) { toast("Elige un local"); return; }
  try { await apiSend("POST", "/api/announcements", { local, rol: "trabajadores", mensaje: mensaje.trim() }); toast("Comunicado publicado ✅"); loadComunicados(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// ── Ágora (TPV): configurar la integración de ventas por local, desde el panel ────────────────
let AGORA = { locales: [], lastSync: null, ventas: [] };
function agoraCfgFor(local) { return AGORA.locales.find((x) => x.local === local) || null; }
// Reflejo de src/modules/agora/ventas.js (el panel no importa ESM).
function resumenVentasPorLocal(rows, desde) {
  const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const porLocal = {};
  for (const r of (rows || [])) {
    if (!r || !r.local) continue;
    const e = porLocal[r.local] || (porLocal[r.local] = { local: r.local, dias: 0, ultimoDia: null, ventasRecientes: 0, ticketsRecientes: 0 });
    e.dias += 1;
    if (!e.ultimoDia || String(r.dia) > e.ultimoDia) e.ultimoDia = String(r.dia);
    if (!desde || String(r.dia) >= desde) { e.ventasRecientes += num(r.ventas); e.ticketsRecientes += num(r.tickets); }
  }
  return Object.values(porLocal).sort((a, b) => (b.ultimoDia || "").localeCompare(a.ultimoDia || ""));
}
function agoraResumenFor(local) { return (AGORA._resumen || []).find((x) => x.local === local) || null; }
function renderAgoraRow(local, i) {
  const c = agoraCfgFor(local);
  const est = c && c.estado;
  const alive = est ? est.alive : null;
  const pill = !c ? '<span class="pill">Sin configurar</span>' : (!c.activo ? '<span class="pill">Desactivado</span>' : (alive === true ? '<span class="pill ok">TPV vivo</span>' : alive === false ? '<span class="pill bad">Sin respuesta</span>' : '<span class="pill brand">Activo</span>'));
  const passPh = c && c.passSet ? "•••••• · guardada — escribe para cambiar" : "Contraseña de Ágora";
  return `<div class="card" data-agrow="${i}"><div class="ch"><h3>${esc(local)}</h3>${pill}</div>
    <div class="toolbar">
      <div class="field grow"><label>Host (DynDNS + puerto)</label><input id="agHost_${i}" value="${esc(c ? c.host : "")}" placeholder="local.chickenkiller.com:8984"></div>
      <div class="field"><label>Local ID (opcional)</label><input id="agLid_${i}" value="${esc(c && c.local_id ? c.local_id : "")}" placeholder="—" style="max-width:120px"></div>
    </div>
    <div class="toolbar">
      <div class="field grow"><label>Usuario de Ágora</label><input id="agUser_${i}" autocomplete="off" value="${esc(c && c.usuario ? c.usuario : "")}" placeholder="Ej. integracion / Admin web"></div>
      <div class="field grow"><label>Contraseña de Ágora</label><input id="agPass_${i}" type="password" autocomplete="off" placeholder="${esc(passPh)}"></div>
    </div>
    <div class="field" style="width:100%"><label>apiToken (opcional · solo para diagnóstico/Haddock)</label><input id="agTok_${i}" type="password" autocomplete="off" placeholder="${esc(c && c.tokenSet ? c.tokenHint + " · guardado" : "—")}"></div>
    <div class="toolbar" style="align-items:center">
      <label class="chip" style="cursor:pointer"><input type="checkbox" id="agAct_${i}" ${(!c || c.activo) ? "checked" : ""} style="margin-right:6px">Activo</label>
      <span class="grow"></span>
      <button class="btn" data-act="ag-probe" data-local="${esc(local)}" ${c ? "" : "disabled"}>Probar conexión</button>
      <button class="btn" data-act="ag-metodos" data-local="${esc(local)}" ${c ? "" : "disabled"} title="Pregunta al TPV qué informes entiende su versión de Ágora">Informes disponibles</button>
      <button class="btn" data-act="ag-descubrir" data-local="${esc(local)}" ${c ? "" : "disabled"}
        title="Lee la web de administración de este TPV y saca la lista REAL de informes que tiene, sin adivinar nombres">Buscar informes en su web</button>
      <button class="btn" data-act="ag-diag" data-local="${esc(local)}" ${c && c.tokenSet ? "" : "disabled"}>Diagnóstico API</button>
      <button class="btn primary" data-act="ag-save" data-local="${esc(local)}" data-i="${i}">Guardar</button>
      ${c ? `<button class="btn sm danger" data-act="ag-del" data-local="${esc(local)}">Eliminar</button>` : ""}
    </div>
    <div class="mut" style="font-size:11.5px;margin-top:4px">Las ventas se leen con el <b>usuario+contraseña</b> (login web de Ágora). Recomendado: crea un usuario dedicado con permisos mínimos.</div>${est && est.ts ? `<div class="mut" style="font-size:12px;margin-top:4px">Última comprobación: ${esc(String(est.ts).slice(0, 16).replace("T", " "))}</div>` : ""}</div>`;
}
function renderAgora() {
  const head = `<div class="ph"><div class="eyebrow">Sistema · Integraciones</div><h1>Ágora (TPV)</h1><div class="sub">Conecta el TPV de cada local para traer las ventas. El apiToken se guarda cifrado y nunca se muestra.</div><div class="acts"><button class="btn primary" data-act="ag-sync">Sincronizar ventas ahora</button></div></div>`;
  const info = `<div class="card"><div class="mut" style="font-size:13px">El servidor del TPV solo responde con el <b>local abierto</b> (programa Ágora encendido). Requisitos: licencia de integración, v6.0.6, DynDNS y el puerto 8984 abierto.${AGORA.lastSync ? ` · Última sincronización: <b>${esc(String(AGORA.lastSync).slice(0, 16).replace("T", " "))}</b>` : " · Aún no se ha sincronizado."}</div></div>`;
  const vivo = `<div id="agVivo" style="margin-top:6px"><div class="card"><div class="mut" style="font-size:13px">Cargando ventas en vivo…</div></div></div>`;
  const rows = LOCALES.map((l, i) => renderAgoraRow(l, i)).join("");
  return head + info + vivo + `<div class="grid" style="gap:14px;margin-top:6px">${rows}</div>`;
}
// Reflejo puro (src/modules/agora/ventas.js) del resumen en vivo por local.
function resumenVivoLocal(dias, hoy) {
  const arr = Array.isArray(dias) ? dias : [];
  const hoyRow = arr.find((d) => d.dia === hoy) || null;
  const cerrados = arr.filter((d) => d.dia < hoy).sort((a, b) => a.dia.localeCompare(b.dia));
  const total7 = cerrados.reduce((s, d) => s + (Number(d.ventas) || 0), 0);
  const tickets7 = cerrados.reduce((s, d) => s + (Number(d.tickets) || 0), 0);
  return { hoy: hoyRow, ayer: cerrados.length ? cerrados[cerrados.length - 1] : null, cerrados, total7: Math.round(total7 * 100) / 100, tickets7 };
}
function renderAgoraVivo(vivo) {
  if (!vivo || !vivo.locales || !vivo.locales.length) return `<div class="card"><div class="mut" style="font-size:13px">Aún no hay ventas. Configura usuario+contraseña de un local abierto y pulsa "Actualizar ventas".</div></div>`;
  const hoy = vivo.hoy;
  const card = (L) => {
    if (L.error) return `<div class="card"><div class="ch"><h3>${esc(nombreCortoLocal(L.local))}</h3><span class="pill bad">Sin datos</span></div><div class="mut" style="font-size:12px">${esc(L.error)}</div></div>`;
    const r = resumenVivoLocal(L.dias, hoy);
    const bars = barrasDia([...r.cerrados, ...(r.hoy ? [r.hoy] : [])], { hoy });
    return `<div class="card"><div class="ch"><h3>${esc(nombreCortoLocal(L.local))}</h3>${r.hoy ? '<span class="pill ok">En vivo</span>' : ""}</div>
      <div class="grid g2" style="gap:10px">
        <div><div class="mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Hoy (en curso)</div><div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums">${r.hoy ? eur(r.hoy.ventas) : "—"}</div><div class="mut" style="font-size:11px">${r.hoy ? num(r.hoy.tickets) + " tickets · " + eur(r.hoy.ticket_medio) + "/tk" : ""}</div></div>
        <div><div class="mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Ayer</div><div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums">${r.ayer ? eur(r.ayer.ventas) : "—"}</div><div class="mut" style="font-size:11px">${r.ayer ? num(r.ayer.tickets) + " tickets · " + eur(r.ayer.ticket_medio) + "/tk" : ""}</div></div>
      </div>
      <div style="margin-top:12px">${bars}</div>
      <div class="mut" style="font-size:11px;margin-top:4px">Últimos días cerrados: <b>${eur(r.total7)}</b> · ${num(r.tickets7)} tickets</div></div>`;
  };
  return `<div class="ch" style="padding:0 2px 6px"><h3>Ventas por local · hoy en vivo</h3><button class="btn sm" data-act="ag-vivo-refresh">Actualizar</button></div><div class="grid g2" style="gap:14px">${vivo.locales.map(card).join("")}</div>${vivo.generado ? `<div class="mut" style="font-size:11px;margin-top:6px">Actualizado ${esc(String(vivo.generado).slice(11, 16))}${vivo.cache ? " (caché)" : ""}</div>` : ""}`;
}
async function loadAgoraVivo(force) {
  const cont = document.getElementById("agVivo"); if (!cont) return;
  try {
    const vv = await apiRaw("/api/agora/ventas-vivo" + (force ? "?force=1" : ""));
    AGORA.vivo = vv;
    if (document.getElementById("agVivo")) document.getElementById("agVivo").innerHTML = renderAgoraVivo(vv);
  } catch (e) { if (document.getElementById("agVivo")) document.getElementById("agVivo").innerHTML = `<div class="card"><div class="mut" style="font-size:13px">No se pudieron cargar las ventas en vivo${e.message && e.message !== "noauth" ? ": " + esc(e.message) : ""}.</div></div>`; }
}
async function loadAgora() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const j = await apiRaw("/api/agora/locales");
    AGORA.locales = j.data || []; AGORA.lastSync = j.lastSync || null;
    view.innerHTML = renderAgora();
    loadAgoraVivo(); // en segundo plano: consulta el TPV en vivo y rellena la tarjeta
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
async function agoraSave(local, i) {
  const host = (document.getElementById("agHost_" + i) || {}).value || "";
  const token = (document.getElementById("agTok_" + i) || {}).value || "";
  const usuario = (document.getElementById("agUser_" + i) || {}).value || "";
  const password = (document.getElementById("agPass_" + i) || {}).value || "";
  const local_id = (document.getElementById("agLid_" + i) || {}).value || "";
  const activo = (document.getElementById("agAct_" + i) || {}).checked ? 1 : 0;
  if (!host.trim()) { toast("Pon el host del TPV"); return; }
  try { await apiSend("POST", "/api/agora/locales", { local, host: host.trim(), token: token.trim(), usuario: usuario.trim(), password: password.trim(), local_id: local_id.trim(), activo }); toast("Configuración guardada ✅"); loadAgora(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function agoraProbe(local) {
  toast("Probando conexión…");
  try { const j = await apiSend("POST", "/api/agora/probe", { local }); toast(j.alive ? "✅ " + (j.mensaje || "El TPV respondió") : "⚠ " + (j.mensaje || "Sin respuesta")); loadAgora(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
// Sondea la API del TPV (rutas candidatas) y muestra el resultado para pegármelo y cablear la ruta real.
async function agoraDiagnostico(local) {
  toast("Sondeando la API del TPV… (el local debe estar abierto)");
  let j; try { j = await apiSend("POST", "/api/agora/diagnostico", { local }); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); return; }
  const rs = j.resultados || [];
  const fila = (r) => {
    const est = r.error ? `❌ ${r.error}` : `${r.ok ? "✅" : "•"} ${r.status}${r.esJson ? " · JSON" : r.esXml ? " · XML" : r.contentType ? " · " + r.contentType.split(";")[0] : ""}`;
    const keys = r.jsonKeys ? ` · claves: ${Array.isArray(r.jsonKeys) ? r.jsonKeys.join(", ") : r.jsonKeys}` : "";
    return `<div class="agres"><div class="who" style="min-width:0"><div class="t1">${esc(r.label)} <span class="mut">${esc(r.method)}</span></div><div class="t2" style="word-break:break-all">${esc(r.url)}</div>${r.bodySample ? `<div class="t2" style="word-break:break-all;opacity:.85">${esc(String(r.bodySample).slice(0, 200))}</div>` : ""}${keys ? `<div class="t2">${esc(keys)}</div>` : ""}</div><span class="pill ${r.ok ? "ok" : r.error ? "bad" : ""}" style="white-space:nowrap">${esc(est)}</span></div>`;
  };
  const jsonTxt = JSON.stringify(j, null, 2);
  const body = `<div class="mut" style="font-size:12.5px;margin-bottom:8px">Base: <b>${esc(j.base || "")}</b> · rango ${esc(j.desde || "")} → ${esc(j.hasta || "")}. Lo prometedor va arriba. <b>Cópialo y pégamelo</b> y cablearé la ruta real de ventas.</div>
    <div class="card p0" style="max-height:46vh;overflow:auto">${rs.length ? rs.map(fila).join("") : '<div class="mut" style="padding:12px">Sin resultados (¿local cerrado?).</div>'}</div>
    <textarea id="agDiagJson" style="width:100%;height:120px;margin-top:10px;font-family:monospace;font-size:11px" readonly>${esc(jsonTxt)}</textarea>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="agDiagCopy">Copiar resultado</button><button class="btn primary" data-close>Cerrar</button></div>`;
  const ov = modal("Diagnóstico API · " + local, body);
  ov.querySelector(".modal").classList.add("wide");
  wireCopiar(ov);
  return;
}
// Pregunta al TPV qué informes entiende su versión. Pensado para locales con Ágora antiguo:
// dice con cuál se puede sacar la venta diaria sin actualizar el TPV.
async function agoraMetodos(local) {
  toast("Preguntando al TPV qué informes tiene… (puede tardar)");
  let j; try { j = await apiSend("POST", "/api/agora/metodos", { local }); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); return; }
  const ms = j.metodos || [];
  const pill = (m) => m.estado === "disponible" ? '<span class="pill ok">Disponible</span>'
    : m.estado === "no_disponible" ? '<span class="pill bad">No está</span>'
    : '<span class="pill warn">No se pudo saber</span>';
  const fila = (m) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(m.corto)}</div><div class="t2">${esc(m.nota || "")}${m.detalle ? " · " + esc(m.detalle) : ""}</div></div>${pill(m)}</div>`;
  const jsonTxt = JSON.stringify(j, null, 2);
  const hay = ms.filter((m) => m.estado === "disponible");
  const body = `<div class="mut" style="font-size:12.5px;margin-bottom:10px">${esc(j.mensaje || "")}${j.version ? ` · <b>Ágora ${esc(j.version)}</b>` : ""}<br>Lo marcado <b>Disponible</b> es lo que esta versión sí entiende. <b>Cópialo y pégamelo</b> y cablearé la venta diaria con uno de esos.</div>
    <div class="card p0" style="max-height:46vh;overflow:auto"><div class="rows">${ms.length ? ms.map(fila).join("") : '<div class="mut" style="padding:12px">Sin resultados (¿local cerrado?).</div>'}</div></div>
    ${hay.length ? "" : '<div class="pendingblock" style="margin-top:10px">Ningún informe respondió. Si el local está abierto, avisa: puede que el usuario de Ágora no tenga permiso de informes.</div>'}
    <textarea id="agDiagJson" style="width:100%;height:120px;margin-top:10px;font-family:monospace;font-size:11px" readonly>${esc(jsonTxt)}</textarea>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="agDiagCopy">Copiar resultado</button><button class="btn primary" data-close>Cerrar</button></div>`;
  const ov = modal("Informes disponibles · " + local, body);
  ov.querySelector(".modal").classList.add("wide");
  wireCopiar(ov);
}
// Botón "Copiar resultado" compartido por los dos diálogos de diagnóstico.
function wireCopiar(ov) {
  const jsonTxt = ov.querySelector("#agDiagJson") ? ov.querySelector("#agDiagJson").value : "";
  ov.querySelector("#agDiagCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(jsonTxt); toast("Copiado ✅"); }
    catch { const ta = ov.querySelector("#agDiagJson"); ta.focus(); ta.select(); toast("Selecciona y copia (⌘C)"); }
  });
}
// Lee la web de administración del TPV y extrae las rutas de API que usa su JavaScript.
async function agoraDescubrir(local) {
  toast("Leyendo la web del TPV y sus scripts… (local abierto)");
  let j; try { j = await apiSend("POST", "/api/agora/descubrir", { local }); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); return; }
  const api = j.api || [], otras = j.otras || [], scripts = j.scripts || [];
  const lista = (arr) => arr.length ? arr.map((p) => `<div class="t2" style="word-break:break-all;font-family:monospace">${esc(p)}</div>`).join("") : '<div class="mut" style="padding:6px">—</div>';
  const jsonTxt = JSON.stringify(j, null, 2);
  // El veredicto va ARRIBA: la pregunta concreta es si este Ágora da los comensales, y leer
  // una lista de cincuenta nombres a ojo para averiguarlo no lo hace nadie.
  const inf = j.informes || { usados: [], comensales: [], otros: [] };
  const veredicto = j.hayComensales
    ? `<p class="fic-nota" style="margin:0 0 10px"><b>Este Ágora SÍ tiene un informe de comensales:</b>
       ${inf.comensales.map((x) => `<code>${esc(x.corto)}</code>`).join(", ")}. Con eso se puede pasar de
       «ticket medio» a <b>gasto por persona</b>.</p>`
    : `<p class="fic-nota" style="margin:0 0 10px"><b>No aparece ningún informe de comensales.</b>
       Su web de administración no llama a ninguno, así que el gasto por persona no se puede sacar de aquí:
       el «ticket medio» seguirá siendo por ticket. ${inf.usados.length + inf.otros.length
         ? `Se han leído ${num(inf.usados.length + inf.otros.length)} informes.`
         : "No se ha podido leer ningún nombre de informe: mándame el resultado igualmente."}</p>`;

  const listaInf = (arr) => arr.length
    ? arr.map((x) => `<div class="t2" style="font-family:monospace">${esc(x.corto)}</div>`).join("")
    : '<div class="mut" style="padding:6px">—</div>';

  const body = `${veredicto}
    <details style="margin-bottom:8px"><summary class="mut" style="cursor:pointer;font-size:12.5px">Informes que conoce este Ágora (${num(inf.usados.length + inf.comensales.length + inf.otros.length)})</summary>
      <div class="card p0" style="max-height:26vh;overflow:auto;margin-top:6px"><div style="padding:8px 12px">
        ${inf.usados.length ? `<div class="t1" style="margin-bottom:4px">Los que ya usamos</div>${listaInf(inf.usados)}` : ""}
        ${inf.otros.length ? `<div class="t1" style="margin:10px 0 4px">Los demás</div>${listaInf(inf.otros)}` : ""}
      </div></div></details>
    <div class="mut" style="font-size:12.5px;margin-bottom:8px">Base: <b>${esc(j.base || "")}</b> · scripts leídos: ${scripts.length}. <b>Cópialo y pégamelo</b>: con las rutas de API cablearé la de ventas/cierres.</div>
    <div class="card p0" style="max-height:34vh;overflow:auto"><div class="ch" style="padding:12px 12px 0"><h3>Rutas prometedoras (venta/cierre/api…)</h3></div><div style="padding:8px 12px">${lista(api)}</div></div>
    <details style="margin-top:8px"><summary class="mut" style="cursor:pointer;font-size:12.5px">Otras rutas (${otras.length})</summary><div class="card p0" style="max-height:24vh;overflow:auto;margin-top:6px"><div style="padding:8px 12px">${lista(otras)}</div></div></details>
    <textarea id="agDescJson" style="width:100%;height:120px;margin-top:10px;font-family:monospace;font-size:11px" readonly>${esc(jsonTxt)}</textarea>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="agDescCopy">Copiar resultado</button><button class="btn primary" data-close>Cerrar</button></div>`;
  const ov = modal("Qué sabe hacer este Ágora · " + local, body);
  ov.querySelector(".modal").classList.add("wide");
  ov.querySelector("#agDescCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(jsonTxt); toast("Copiado ✅"); }
    catch { const ta = ov.querySelector("#agDescJson"); ta.focus(); ta.select(); toast("Selecciona y copia (⌘C)"); }
  });
}
async function agoraDel(local) {
  const ok = await confirmModal(`¿Eliminar la configuración de Ágora de ${local}?`, { ok: "Eliminar", danger: true }); if (!ok) return;
  try { await apiSend("DELETE", "/api/agora/locales/" + encodeURIComponent(local)); toast("Configuración eliminada ✅"); loadAgora(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function agoraSyncNow() {
  toast("Sincronizando ventas…");
  try { const j = await apiSend("POST", "/api/agora/sync-now"); toast(j.configurados ? "Sincronización lanzada ✅" : "No hay locales de Ágora activos"); loadAgora(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}

// ════════════════════════ VISTA: ANALÍTICA DE VENTAS (informes Ágora en vivo) ════════════════════════
// `area` parte la pantalla en dos: VENTAS (lo que entra) y CONTROL (lo que no llega a
// cobrarse: cancelaciones, descuentos, invitaciones). Se miran por motivos distintos y en
// momentos distintos; juntos en la misma fila de pestañas, control no se miraba nunca.
// `q` busca dentro de la tabla ya cargada: el informe viene entero del TPV, así que filtrar
// aquí es instantáneo y no cuesta otra consulta.
let ANAL = { area: "ventas", tipo: "producto", local: "", range: null, tipos: [], data: null, sort: null, cargando: false, q: "" };
const ANAL_AREAS = [
  { key: "ventas", label: "Ventas", sub: "Lo que entra" },
  { key: "control", label: "Control", sub: "Lo que no llega a cobrarse" },
];
const analDeArea = (a) => (ANAL.tipos || []).filter((t) => (t.area || "ventas") === a);
function fmtCelda(v, tipo) {
  if (tipo === "eur") return eur(v);
  if (tipo === "num") return num(v);
  if (tipo === "pct") return (Math.round((Number(v) || 0) * 10) / 10) + "%";
  return esc(v == null ? "" : String(v));
}
function renderAnaliticaTabla(data) {
  if (!data) return "";
  if (data.sinCredenciales) return `<div class="card"><div class="mut" style="font-size:13px">Configura <b>usuario y contraseña</b> del local en <b>Ágora (TPV)</b> para poder consultar informes.</div></div>`;
  const cols = data.columnas || [], filasTodas = data.filas || [];
  if (!cols.length || !filasTodas.length) return `<div class="card"><div class="mut" style="font-size:13px">Sin movimientos en este rango${data.local ? "" : " (prueba a elegir un local abierto)"}.</div></div>`;
  // El buscador mira TODAS las columnas de texto: buscando «croquetas» sale el producto, y
  // buscando «Marta» salen sus cancelaciones. Sin acentos ni mayúsculas, como se escribe.
  const nq = String(ANAL.q || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filas = nq
    ? filasTodas.filter((f) => cols.some((c) => c.tipo === "texto"
        && String(f[c.key] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(nq)))
    : filasTodas;
  if (!filas.length) return `<div class="card"><div class="mut" style="font-size:13px">Nada con «${esc(ANAL.q)}» en este informe.</div></div>`;
  // Orden (cliente): por defecto data.ordenPor desc; clic en cabecera cambia.
  const sort = ANAL.sort || (data.ordenPor ? { key: data.ordenPor, dir: "desc" } : null);
  let rows = filas.slice();
  if (sort) { const c = cols.find((x) => x.key === sort.key); const numeric = c && (c.tipo === "num" || c.tipo === "eur" || c.tipo === "pct"); rows.sort((a, b) => { const va = a[sort.key], vb = b[sort.key]; const cmp = numeric ? (Number(va) || 0) - (Number(vb) || 0) : String(va || "").localeCompare(String(vb || "")); return sort.dir === "desc" ? -cmp : cmp; }); }
  // Top-N para el mini-gráfico (columna de orden por defecto).
  const chartKey = data.ordenPor && cols.find((c) => c.key === data.ordenPor) ? data.ordenPor : (cols.find((c) => c.tipo === "eur") || {}).key;
  const chartTipo = (cols.find((c) => c.key === chartKey) || {}).tipo;
  const labelKey = (cols.find((c) => c.tipo === "texto") || cols[0]).key;
  const topItems = chartKey ? filas.slice().sort((a, b) => (Number(b[chartKey]) || 0) - (Number(a[chartKey]) || 0)).slice(0, 8).map((f) => ({ label: nombreCortoLocal(String(f[labelKey] || "—")).slice(0, 14), value: Number(f[chartKey]) || 0 })) : [];
  const chart = topItems.length >= 2 ? `<div class="card"><div class="ch"><h3>Top ${topItems.length} · ${esc((cols.find((c) => c.key === chartKey) || {}).label || "")}</h3></div>${bars(topItems, { fmt: (v) => chartTipo === "eur" ? eur(v) : num(v) })}</div>` : "";
  const th = cols.map((c) => { const on = sort && sort.key === c.key; const arrow = on ? (sort.dir === "desc" ? " ↓" : " ↑") : ""; return `<th class="${c.tipo === "num" || c.tipo === "eur" || c.tipo === "pct" ? "r" : ""}" data-act="anal-sort" data-key="${esc(c.key)}" style="cursor:pointer;white-space:nowrap">${esc(c.label)}${arrow}</th>`; }).join("");
  const body = rows.map((f) => `<tr>${cols.map((c) => `<td class="${c.tipo === "num" || c.tipo === "eur" || c.tipo === "pct" ? "r tnum" : ""}">${fmtCelda(f[c.key], c.tipo)}</td>`).join("")}</tr>`).join("");
  // Al buscar, el total se recalcula sobre lo que se ve. Dejar el total del informe entero
  // debajo de tres filas filtradas es la forma más fácil de leer un número que no es.
  const totCells = cols.map((c, i) => {
    if (i === 0) return `<td><b>Total${nq ? " de lo buscado" : ""}</b></td>`;
    const numerica = c.tipo === "num" || c.tipo === "eur";
    const t = nq ? (numerica ? filas.reduce((s2, f) => s2 + (Number(f[c.key]) || 0), 0) : null)
                 : (data.totales && data.totales[c.key]);
    return `<td class="${numerica || c.tipo === "pct" ? "r tnum" : ""}">${t != null ? "<b>" + fmtCelda(t, c.tipo) + "</b>" : ""}</td>`;
  }).join("");
  // En Control, la cifra que importa está arriba y en grande: cuánto se ha ido y en cuántos
  // apuntes. La tabla contesta «quién y por qué»; esto contesta «cuánto», que es lo primero
  // que se pregunta y lo que hace que separar Control de Ventas sirva para algo.
  const resumenControl = ANAL.area === "control" ? (() => {
    const colEur = cols.find((c) => c.tipo === "eur");
    if (!colEur) return "";
    const total = filas.reduce((s2, f) => s2 + (Number(f[colEur.key]) || 0), 0);
    const colPersona = cols.find((c) => c.tipo === "texto");
    const personas = colPersona ? new Set(filas.map((f) => String(f[colPersona.key] || "")).filter(Boolean)).size : 0;
    // Quién acumula más. No es una acusación: casi siempre es quien más turnos hace.
    const porPersona = new Map();
    if (colPersona) for (const f of filas) {
      const k = String(f[colPersona.key] || "—");
      porPersona.set(k, (porPersona.get(k) || 0) + (Number(f[colEur.key]) || 0));
    }
    const top = [...porPersona.entries()].sort((a, b) => b[1] - a[1])[0];
    return `<div class="kpis4" style="margin-bottom:14px">
      <div class="kpi"><span>${esc(data.label)}</span><b>${esc(eur(total))}</b></div>
      <div class="kpi"><span>Apuntes</span><b>${num(filas.length)}</b></div>
      <div class="kpi"><span>${esc(colPersona ? colPersona.label : "Distintos")}</span><b>${num(personas)}</b></div>
      ${top ? `<div class="kpi"><span>Más acumula</span><b style="font-size:15px">${esc(top[0])}</b><span style="text-transform:none;font-size:12px;color:var(--ink2)">${esc(eur(top[1]))}</span></div>` : ""}
    </div>`;
  })() : "";

  const errores = (data.__errores && data.__errores.length) ? `<div class="mut" style="font-size:12px;margin:6px 2px">${data.__errores.map((e) => `⚠ ${esc(e.local)}: ${esc(e.error)}`).join(" · ")}</div>` : "";
  const tabla = `<div class="card p0"><div class="ch" style="padding:14px 16px 0"><h3>${esc(data.label)}${data.local ? " · " + esc(nombreCortoLocal(data.local)) : ""}</h3><span class="mut" style="font-size:12px">${num(filas.length)}${nq ? ` de ${num(filasTodas.length)}` : ""} filas${data.generado ? " · " + esc(String(data.generado).slice(11, 16)) : ""}</span></div><div class="tw"><table class="tbl"><thead><tr>${th}</tr></thead><tbody>${body}</tbody><tfoot><tr>${totCells}</tr></tfoot></table></div></div>`;
  return resumenControl + chart + tabla + errores;
}
function renderAnalitica() {
  const amb = analScope();
  const presets =[["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Semana"], ["mes", "Mes"]];
  const cur = ANAL.range || rangoPreset("mes", todayStr());
  const seg = presets.map(([p, l]) => `<button class="${cur.preset === p ? "on" : ""}" data-act="anal-period" data-p="${p}">${l}</button>`).join("") + `<button class="${cur.preset === "custom" ? "on" : ""}" data-act="anal-period-custom">${cur.preset === "custom" ? esc(fechaCorta(cur.from)) + "–" + esc(fechaCorta(cur.to)) : "Personalizado"}</button>`;
  const tabs = analDeArea(ANAL.area).map((t) => `<button class="btn ${ANAL.tipo === t.key ? "primary" : ""}" data-act="anal-tab" data-tipo="${esc(t.key)}">${esc(t.label)}</button>`).join("");
  const areas = ANAL_AREAS.filter((a) => analDeArea(a.key).length).map((a) =>
    `<button class="anarea ${ANAL.area === a.key ? "on" : ""}" data-act="anal-area" data-area="${a.key}">
       <b>${esc(a.label)}</b><span>${esc(a.sub)}</span></button>`).join("");
  const head = `<div class="ph"><div class="eyebrow">Inteligencia</div><h1>Analítica de ventas</h1><div class="sub">Informes en vivo del TPV · ${esc(cur.label)}${amb ? ` · <b>${esc(nombreCortoLocal(amb))}</b>` : ""}</div><div class="acts"><button class="btn" data-act="anal-refresh">Actualizar</button><button class="btn" data-act="anal-csv">Exportar CSV</button></div></div>`;
  // Sin selector de local: el ámbito lo marca el selector de establecimiento de la barra superior.
  const toolbar = `<div class="toolbar"><div class="field"><label>Periodo</label><div class="seg">${seg}</div></div><div style="flex:1"></div>
      <div class="field" style="min-width:200px"><label>Buscar en el informe</label>
        <input class="inp" id="analQ" value="${esc(ANAL.q)}" placeholder="${ANAL.tipo === "producto" ? "croquetas, vermut…" : "nombre, motivo…"}"></div></div>`;
  const areasBar = areas ? `<div class="anareas">${areas}</div>` : "";
  const tabsBar = tabs ? `<div class="toolbar" style="margin-top:-6px">${tabs}</div>` : "";
  const cuerpo = ANAL.cargando ? `<div class="card"><div class="mut" style="font-size:13px">Consultando el TPV…</div></div>` : renderAnaliticaTabla(ANAL.data);
  return head + areasBar + toolbar + tabsBar + `<div id="analBody">${cuerpo}</div>`;
}
// Ámbito de local: selector de establecimiento de la barra superior (el fijado manda).
function analScope() { ANAL.local = localActualFE(); return ANAL.local; }
async function loadAnalitica() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  if (!ANAL.range) ANAL.range = rangoPreset("mes", todayStr());
  analScope();
  if (sinPublico(ANAL.local)) { view.innerHTML = avisoSinPublico("Analítica de ventas", "Inteligencia", "ventas"); return; }
  try {
    if (!ANAL.tipos.length) { const j = await apiOptional("/api/agora/informes"); ANAL.tipos = j || []; if (ANAL.tipos.length && !analDeArea(ANAL.area).some((t) => t.key === ANAL.tipo)) ANAL.tipo = (analDeArea(ANAL.area)[0] || ANAL.tipos[0]).key; }
    view.innerHTML = renderAnalitica();
    loadAnalInforme();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
async function loadAnalInforme(force) {
  ANAL.cargando = true; ANAL.sort = null;
  const b = document.getElementById("analBody"); if (b) b.innerHTML = `<div class="card"><div class="mut" style="font-size:13px">Consultando el TPV…</div></div>`;
  try {
    const r = ANAL.range;
    const qs = `from=${r.from}&to=${r.to}` + (ANAL.local ? "&local=" + encodeURIComponent(ANAL.local) : "") + (force ? "&force=1" : "");
    const j = await apiRaw("/api/agora/informe/" + ANAL.tipo + "?" + qs);
    const data = j.data || null; if (data && j.errores) data.__errores = j.errores;
    ANAL.data = data; ANAL.cargando = false;
    const bb = document.getElementById("analBody"); if (bb) bb.innerHTML = renderAnaliticaTabla(ANAL.data);
    const sub = document.querySelector("#view .ph .sub"); if (sub) sub.textContent = "Informes en vivo del TPV · " + (ANAL.range.label || "");
  } catch (e) {
    ANAL.cargando = false;
    const bb = document.getElementById("analBody"); if (bb) bb.innerHTML = `<div class="card"><div class="mut" style="font-size:13px">No se pudo cargar el informe${e.message && e.message !== "noauth" ? ": " + esc(e.message) : ""}.</div></div>`;
  }
}
function analSort(key) { if (ANAL.sort && ANAL.sort.key === key) ANAL.sort.dir = ANAL.sort.dir === "desc" ? "asc" : "desc"; else ANAL.sort = { key, dir: "desc" }; const b = document.getElementById("analBody"); if (b) b.innerHTML = renderAnaliticaTabla(ANAL.data); }
function analArea(area) {
  if (ANAL.area === area) return;
  ANAL.area = area;
  ANAL.q = "";   // buscar «croquetas» no tiene sentido en cancelaciones
  const primero = analDeArea(area)[0];
  if (primero) ANAL.tipo = primero.key;
  const v = document.getElementById("view"); if (v) v.innerHTML = renderAnalitica();
  loadAnalInforme();
}
function analBuscar(q) {
  ANAL.q = q;
  const b = document.getElementById("analBody"); if (b) b.innerHTML = renderAnaliticaTabla(ANAL.data);
}
function analTab(tipo) { ANAL.tipo = tipo; ANAL.q = ""; const i = document.getElementById("analQ"); if (i) i.value = ""; document.querySelectorAll('[data-act="anal-tab"]').forEach((x) => x.classList.toggle("primary", x.getAttribute("data-tipo") === tipo)); loadAnalInforme(); }
function analPeriod(p) { ANAL.range = rangoPreset(p, todayStr()); document.querySelectorAll('.seg [data-act="anal-period"]').forEach((x) => x.classList.toggle("on", x.getAttribute("data-p") === p)); const cs = document.querySelector('[data-act="anal-period-custom"]'); if (cs) cs.classList.remove("on"); loadAnalInforme(); }
function analPeriodCustom() {
  const hoy = todayStr(); const cur = ANAL.range || {};
  const ov = modal("Rango personalizado", `<div class="form-grid"><div class="field"><label>Desde</label><input type="date" id="anFrom" value="${esc(cur.from || addDaysStr(hoy, -30))}" max="${esc(hoy)}"></div><div class="field"><label>Hasta</label><input type="date" id="anTo" value="${esc(cur.to || hoy)}" max="${esc(hoy)}"></div></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" data-anq="mes-pasado">Mes pasado</button><button class="btn sm" data-anq="este-ano">Este año</button><button class="btn sm" data-anq="ano-pasado">Año pasado</button></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="anAplicar">Aplicar</button></div>`);
  const setR = (f, t) => { ov.querySelector("#anFrom").value = f; ov.querySelector("#anTo").value = t; };
  ov.addEventListener("click", (e) => { const q = e.target.getAttribute && e.target.getAttribute("data-anq"); if (!q) return; const y = Number(hoy.slice(0, 4)); if (q === "mes-pasado") { const d = new Date(hoy + "T12:00:00"); d.setDate(1); d.setMonth(d.getMonth() - 1); const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0); setR(d.toISOString().slice(0, 10), fin.toISOString().slice(0, 10)); } else if (q === "este-ano") setR(y + "-01-01", hoy); else if (q === "ano-pasado") setR((y - 1) + "-01-01", (y - 1) + "-12-31"); });
  ov.querySelector("#anAplicar").addEventListener("click", () => { const f = ov.querySelector("#anFrom").value, t = ov.querySelector("#anTo").value; if (!f || !t) { toast("Elige las dos fechas"); return; } if (f > t) { toast("El 'desde' debe ser anterior al 'hasta'"); return; } ANAL.range = { preset: "custom", from: f, to: t, label: f === t ? fechaCorta(f) : `${fechaCorta(f)} – ${fechaCorta(t)}` }; ov.remove(); const v = document.getElementById("view"); if (v) v.innerHTML = renderAnalitica(); loadAnalInforme(); });
}
function analCsv() {
  const d = ANAL.data; if (!d || !d.filas || !d.filas.length) { toast("No hay datos que exportar"); return; }
  const cols = d.columnas; const esc2 = (s) => { const v = String(s == null ? "" : s); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = cols.map((c) => esc2(c.label)).join(";");
  const lines = d.filas.map((f) => cols.map((c) => esc2(f[c.key])).join(";"));
  const csv = "﻿" + [head, ...lines].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `analitica_${d.tipo}_${d.from}_${d.to}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}

// ════════════════════════ VISTA: CAMPAÑAS ════════════════════════
let CAMP = { list: [], plantillas: [], audiencias: [], cfg: { cumple_auto: false, cumple_plantilla: "" } };
const CAMP_EST = { borrador: "", programada: "info", enviando: "warn", enviada: "ok" };
// Plantillas de arranque por objetivo (insertables; no se guardan hasta que el usuario quiera).
const CAMP_OBJETIVOS = [
  { obj: "Promo", txt: "¡Hola {nombre}! Este finde en {local} tenemos una promo especial 🍤 Te esperamos." },
  { obj: "Evento", txt: "{nombre}, te invitamos a un evento en {local} 🎉 ¿Te apuntas? Responde a este mensaje." },
  { obj: "Reactivación", txt: "¡Te echamos de menos, {nombre}! Vuelve a {local} y te invitamos al postre 🍮" },
  { obj: "Encuesta", txt: "Hola {nombre}, ¿qué te pareció tu última visita a {local}? Tu opinión nos ayuda muchísimo 🙏" },
  { obj: "Aviso", txt: "{nombre}, un aviso importante de {local}: " },
];

// Plantillas de partida. Espejo de src/modules/campaigns/plantillas.js (el panel no importa
// ESM). Cada una trae el texto Y cuándo tiene sentido usarla, que es lo que de verdad
// ahorra tiempo: el texto se cambia en diez segundos, saber cuándo mandarlo no.
const CAMP_PLANTILLAS = [
  { id:"cumple-mes", nombre:"Cumpleaños del mes", grupo:"Fechas señaladas",
    cuando:"Una vez al mes, a principios. Es la que mejor funciona: la excusa es suya, no tuya.",
    mensaje:"¡Felicidades, {nombre}! 🎂 Desde {local} queremos celebrarlo contigo: este mes, si vienes a comer o cenar, la tarta la ponemos nosotros. Solo tienes que decirlo al reservar.",
    nota:"Hay un envío automático de cumpleaños en la configuración. Esto es para hacerlo a mano." },
  { id:"reactivacion", nombre:"Hace tiempo que no viene", grupo:"Recuperar clientes",
    cuando:"Cada tres o cuatro meses, a quien lleve medio año sin aparecer. Si insistes más, dejas de ser un sitio al que volver y pasas a ser un mensaje que se ignora.",
    mensaje:"{nombre}, hace tiempo que no te vemos por {local} y se nota 😊 Si te apetece volver, dilo al reservar y te invitamos al café. Aquí seguimos.",
    nota:"Filtra por última visita antes de mandarla, o se la mandas también a quien vino ayer." },
  { id:"carta-nueva", nombre:"Carta nueva", grupo:"Novedades",
    cuando:"Cuando cambia la carta de verdad, dos o tres veces al año. Anunciar cada plato nuevo quema la lista.",
    mensaje:"{nombre}, hemos cambiado la carta en {local} 🍽️ Hay cosas nuevas que creemos que te van a gustar. ¿Te guardamos mesa esta semana?",
    nota:"Si puedes, nombra un plato concreto: da mucha más curiosidad que «una carta nueva»." },
  { id:"llenar-dia", nombre:"Llenar un día flojo", grupo:"Ocupación",
    cuando:"Con dos o tres días de antelación, no el mismo día. Y solo a la gente de ese local.",
    mensaje:"{nombre}, esta semana tenemos mesa libre en {local} y nos encantaría verte. Si vienes entre semana, te invitamos al postre 🍮 ¿Te reservamos?",
    nota:"No la repitas cada semana: el día flojo deja de serlo, pero la promo deja de valer." },
  { id:"evento", nombre:"Evento o cena especial", grupo:"Eventos",
    cuando:"Con dos semanas de margen, y un recordatorio a los que respondieron.",
    mensaje:"{nombre}, en {local} preparamos algo especial y queremos que lo sepas antes que nadie 🎉 Plazas limitadas. Responde a este mensaje y te contamos.",
    nota:"Deja el mensaje abierto a que respondan: una campaña que genera conversación vale el doble." },
  { id:"grupos-navidad", nombre:"Reservas de grupo (Navidad, comuniones)", grupo:"Eventos",
    cuando:"Muy pronto. Las comidas de empresa se cierran en octubre y las comuniones en enero.",
    mensaje:"{nombre}, ya estamos cogiendo reservas de grupo en {local} para estas fechas. Si tienes que organizar una comida de empresa o una celebración, escríbenos y lo cuadramos sin prisas 🗓️",
    nota:"Es la que más dinero mueve. Mándala antes de que la mande la competencia." },
  { id:"terraza", nombre:"Abrimos terraza", grupo:"Novedades",
    cuando:"El primer día bueno de la temporada, no por calendario. Si hace frío no funciona por muy abril que sea.",
    mensaje:"{nombre}, ya tenemos la terraza abierta en {local} ☀️ Si te apetece comer fuera, avísanos y te guardamos una mesa buena.",
    nota:"Va bien a mediodía de un día soleado, cuando la gente decide dónde comer." },
  { id:"resena", nombre:"Pedir una reseña", grupo:"Reputación",
    cuando:"Uno o dos días después de la visita, nunca el mismo día. Y solo a quien se fue contento.",
    mensaje:"{nombre}, gracias por venir a {local} 🙏 Si te ha gustado, contarlo en Google nos ayuda muchísimo — es lo que hace que otros se atrevan a probarnos. Y si algo no estuvo bien, dínoslo a nosotros primero.",
    nota:"La última frase no es de adorno: da salida a quien no quedó contento y evita esa reseña." },
  { id:"no-vino", nombre:"Reservó y no vino", grupo:"Recuperar clientes",
    cuando:"Al día siguiente, y con tono de preocuparse, no de reproche.",
    mensaje:"{nombre}, te esperábamos ayer en {local} y al final no pudiste venir. ¿Todo bien? Si quieres cambiar la reserva a otro día, dínoslo y lo movemos sin problema.",
    nota:"Ni una palabra sobre la mesa vacía. Esto es para recuperar a la persona." },
  { id:"aniversario", nombre:"Aniversario del local", grupo:"Fechas señaladas",
    cuando:"Una vez al año, con unos días de antelación.",
    mensaje:"{nombre}, {local} cumple años y lo queremos celebrar con quien lo ha hecho posible 🥂 Pásate esta semana y te invitamos a brindar con nosotros.",
    nota:"Funciona porque no pide nada. Si le metes un descuento encima, pierde lo que la hace especial." },
];
// Reflejo de src/modules/campaigns/campaigns.service.js (el panel no importa ESM).
const CLAVES_SEGMENTO = ["q", "genero", "poblacion", "local", "idioma", "origen", "from", "to"];
function construirSegmento(input = {}, mesActual) {
  const seg = {};
  for (const k of CLAVES_SEGMENTO) { const v = input[k]; if (v != null && String(v).trim() !== "") seg[k] = typeof v === "string" ? v.trim() : v; }
  if (input.con_email) seg.con_email = 1;
  if (input.con_telefono) seg.con_telefono = 1;
  if (input.cumple_mes) seg.cumple_mes = String(mesActual != null ? mesActual : new Date().getMonth() + 1).padStart(2, "0");
  const excl = Array.isArray(input.excluir_telefonos) ? input.excluir_telefonos.filter(Boolean) : [];
  if (excl.length) seg.excluir_telefonos = excl;
  if (input.soloOptIn) seg.soloOptIn = true;
  return seg;
}
function describirAudiencia(f = {}) {
  const p = [];
  if (f.local) p.push(`Local: ${f.local}`);
  if (f.poblacion) p.push(`Pobl.: ${f.poblacion}`);
  if (f.genero) p.push(f.genero === "M" ? "Hombres" : f.genero === "F" ? "Mujeres" : `Género ${f.genero}`);
  if (f.idioma) p.push(`Idioma: ${f.idioma}`);
  if (f.origen) p.push(`Origen: ${f.origen}`);
  if (f.con_email) p.push("Con email");
  if (f.con_telefono) p.push("Con teléfono");
  if (f.cumple_mes) p.push(`Cumple mes ${f.cumple_mes}`);
  if (f.from || f.to) p.push(`Actividad ${f.from || "…"}→${f.to || "…"}`);
  if (f.soloOptIn) p.push("Solo opt-in");
  const n = Array.isArray(f.excluir_telefonos) ? f.excluir_telefonos.length : 0;
  if (n) p.push(`Excluye ${n}`);
  return p.length ? p.join(" · ") : "Todos los contactos";
}
function renderCampanas() {
  const rows = CAMP.list || []; const cfg = CAMP.cfg || {};
  const head = `<div class="ph"><div class="eyebrow">Marketing</div><h1>Campañas</h1><div class="sub">Segmentar y enviar por WhatsApp · plantillas · programación · cumpleaños · traducción</div><div class="acts"><button class="btn" data-act="camp-detectar-idiomas">🌐 Detectar idiomas</button><button class="btn primary" data-act="camp-nueva">+ Nueva campaña</button></div></div>`;
  const cumple = `<div class="card"><div class="ch"><h3>🎂 Cumpleaños automático</h3><label class="chip" style="cursor:pointer"><input type="checkbox" id="cumpleAuto" ${cfg.cumple_auto ? "checked" : ""} style="margin-right:6px">Activado</label></div><div class="field" style="width:100%"><label>Mensaje (usa {nombre})</label><textarea id="cumpleMsg" rows="2" placeholder="¡Feliz cumpleaños, {nombre}! 🎉">${esc(cfg.cumple_plantilla || "")}</textarea></div><div class="toolbar" style="padding:0"><button class="btn" data-act="camp-cumple-save">Guardar</button><span class="mut" style="font-size:12px;align-self:center">Cada mañana felicita a quien cumple ese día (excluye bajas).</span></div></div>`;
  const plist = (CAMP.plantillas || []).map((p) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(p.nombre)}</div><div class="t2">${esc((p.cuerpo || "").slice(0, 80))}</div></div><button class="btn sm danger" data-act="camp-plant-del" data-id="${p.id}">✕</button></div>`).join("") || `<div class="mut" style="padding:10px 14px">Sin plantillas guardadas.</div>`;
  const plantillas = `<div class="card p0"><div class="ch" style="padding:16px 16px 0"><h3>Plantillas</h3><button class="btn sm" data-act="camp-plant-add">+ Nueva</button></div><div class="rows">${plist}</div></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tw"><table class="tbl"><thead><tr><th>Campaña</th><th>Segmento</th><th>Estado</th><th class="r">Env.</th><th class="r">Err.</th><th>Fecha</th><th></th></tr></thead><tbody>${rows.map((c) => {
    let seg = ""; try { seg = describirAudiencia(JSON.parse(c.segmento_json || "{}")); } catch { /* */ }
    const est = c.estado || "enviada";
    const editable = est === "borrador" || est === "programada";
    const acc = `<button class="linkbtn" style="color:var(--brand)" data-act="camp-detalle" data-id="${c.id}">Detalle</button>${editable ? ` · <button class="linkbtn" style="color:var(--brand)" data-act="camp-editar" data-id="${c.id}">Editar</button> · <button class="linkbtn" style="color:var(--brand)" data-act="camp-enviar" data-id="${c.id}">Enviar</button>` : ""} · <button class="linkbtn" style="color:var(--brand)" data-act="camp-dup" data-id="${c.id}">Duplicar</button> · <button class="linkbtn" style="color:var(--danger)" data-act="camp-del" data-id="${c.id}">Eliminar</button>`;
    return `<tr><td>${esc(c.nombre)}${c.canal === "email" ? " 📧" : ""}${c.adjunto_url ? " 📎" : ""}</td><td class="mut">${esc(seg || "—")}</td><td><span class="pill ${CAMP_EST[est] || ""}">${cap(est)}</span>${(est === "programada" && c.programada_para) ? `<div class="t2">${esc(String(c.programada_para).slice(0, 16).replace("T", " "))}</div>` : ""}</td><td class="r tnum">${num(c.total_enviados)}</td><td class="r tnum">${num(c.total_errores || 0)}</td><td class="mut">${esc((c.creado_en || "").slice(0, 10))}</td><td class="r" style="white-space:nowrap">${acc}</td></tr>`;
  }).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Aún no hay campañas.</div></div>`;
  return `${head}<div class="grid g2">${cumple}${plantillas}</div><div style="margin-top:16px">${table}</div>`;
}
async function loadCampanas() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    // Las cuatro en el mismo viaje: la config no depende de las otras tres y esperaba a que
    // terminaran, así que la pantalla tardaba el doble en aparecer.
    const [list, plantillas, audiencias, cfg] = await Promise.all([
      api("/api/campanas"), apiOptional("/api/plantillas"), apiOptional("/api/audiencias"),
      apiRaw("/api/campanas-config").catch(() => null),
    ]);
    CAMP.list = list || []; CAMP.plantillas = plantillas || []; CAMP.audiencias = audiencias || [];
    CAMP.cfg = cfg ? { cumple_auto: cfg.cumple_auto, cumple_plantilla: cfg.cumple_plantilla } : { cumple_auto: false, cumple_plantilla: "" };
    view.innerHTML = renderCampanas();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function openNuevaCampana() { openCampana("nueva"); }

// Elegir plantilla. Se enseña CUÁNDO usarla junto al texto: el texto lo cambia cualquiera
// en diez segundos, saber cuándo tiene sentido mandarlo es lo que de verdad ahorra tiempo.
function campElegirPlantilla(alElegir) {
  const grupos = [...new Set(CAMP_PLANTILLAS.map((p) => p.grupo))];
  const ov = modal("Plantillas de campaña", `
    <p class="mut" style="margin:0 0 14px;line-height:1.55">Una base hecha para lo que se lanza más a menudo.
      Al elegir una se rellena el mensaje; lo que envíes lo decides tú.</p>
    ${grupos.map((g) => `
      <div class="mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:16px 0 8px">${esc(g)}</div>
      <div class="rows">${CAMP_PLANTILLAS.filter((p) => p.grupo === g).map((p) => `
        <div class="row campplant" data-plant="${esc(p.id)}" style="cursor:pointer;align-items:flex-start">
          <div class="grow" style="min-width:0">
            <div class="t1">${esc(p.nombre)}</div>
            <div class="t2" style="line-height:1.5;white-space:normal">${esc(p.cuando)}</div>
            <div class="campplant-msg">${esc(p.mensaje)}</div>
            ${p.nota ? `<div class="t2" style="line-height:1.5;white-space:normal;margin-top:6px">💡 ${esc(p.nota)}</div>` : ""}
          </div>
          <button class="btn sm primary" data-plant-usar="${esc(p.id)}">Usar</button>
        </div>`).join("")}</div>`).join("")}
    <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn" data-close>Cerrar</button></div>`);
  ov.querySelector(".modal").style.width = "min(760px, 96vw)";
  ov.addEventListener("click", (e) => {
    const fila = e.target.closest("[data-plant]");
    if (!fila) return;
    const p = CAMP_PLANTILLAS.find((x) => x.id === fila.getAttribute("data-plant"));
    if (!p) return;
    ov.remove();
    alElegir(p);
  });
}
// Modal de campaña. mode: "nueva" | "editar" | "duplicar". pre: { id, nombre, mensaje, adjunto_url, seg }.
function openCampana(mode = "nueva", pre = {}) {
  const s = pre.seg || {};
  const editar = mode === "editar";
  const val = (k, d = "") => esc(s[k] != null ? s[k] : d);
  const localOpts = ['<option value="">Todos los locales</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${s.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const plantOpts = ['<option value="">— Insertar plantilla (opcional) —</option>'].concat((CAMP.plantillas || []).map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`)).join("");
  const audOpts = ['<option value="">— Cargar audiencia guardada —</option>'].concat((CAMP.audiencias || []).map((a) => `<option value="${a.id}">${esc(a.nombre)}</option>`)).join("");
  const objBtns = CAMP_OBJETIVOS.map((o) => `<button type="button" class="btn sm" data-obj="${esc(o.txt)}">${esc(o.obj)}</button>`).join("");
  const idiomaOpts = ["", "es", "ca", "en", "fr", "de", "it", "nl", "pt", "ru", "ar", "zh"].map((v) => `<option value="${v}" ${s.idioma === v ? "selected" : ""}>${v ? v.toUpperCase() : "Cualquiera"}</option>`).join("");
  const origenOpts = [["", "Cualquiera"], ["lead", "Ficha/lead"], ["reserva", "Solo reserva"]].map(([v, t]) => `<option value="${v}" ${s.origen === v ? "selected" : ""}>${t}</option>`).join("");
  const body = `<form id="fCamp"><div class="form-grid">
    <div class="field full"><label>Nombre de la campaña</label><input name="nombre" value="${esc(pre.nombre || "")}" required></div>
    <div class="field"><label>Plantilla</label><select id="campPlant">${plantOpts}</select></div>
    <div class="field"><label>Objetivo (rellena el mensaje)</label><div style="display:flex;gap:6px;flex-wrap:wrap">${objBtns}<button type="button" class="btn sm primary" data-act="camp-plantillas">Ver plantillas…</button></div></div>
    <div class="field full"><label>Mensaje</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"><button type="button" class="btn sm" data-var="{nombre}">+ nombre</button><button type="button" class="btn sm" data-var="{apellidos}">+ apellidos</button><button type="button" class="btn sm" data-var="{local}">+ local</button><label class="btn sm" style="cursor:pointer">📎 Adjuntar<input type="file" id="campFile" accept="image/*,application/pdf" hidden></label><span id="campAdjName" class="mut" style="font-size:12px;align-self:center">${pre.adjunto_url ? "📎 adjunto actual" : ""}</span></div>
      <textarea name="mensaje" id="campMsg" rows="3" required placeholder="Hola {nombre}! Este finde…">${esc(pre.mensaje || "")}</textarea></div>
    <div class="field full"><label>Vista previa (así lo recibe el cliente)</label><div style="background:var(--surface2);border-radius:12px;padding:12px;display:flex;justify-content:flex-end"><div id="campBubble" style="background:var(--brand);color:var(--brand-ink);border-radius:12px;border-bottom-right-radius:5px;padding:9px 12px;max-width:85%;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word"></div></div></div>
    <div class="field full"><label>Audiencia</label><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="campAud" style="flex:1;min-width:180px">${audOpts}</select><button type="button" class="btn sm" id="campAudSave">💾 Guardar audiencia</button></div></div>
    <div class="field"><label>Género</label><select name="genero"><option value="">Todos</option><option value="M" ${s.genero === "M" ? "selected" : ""}>Hombre</option><option value="F" ${s.genero === "F" ? "selected" : ""}>Mujer</option></select></div>
    <div class="field"><label>Población</label><input name="poblacion" value="${val("poblacion")}"></div>
    <div class="field"><label>Local</label><select name="local">${localOpts}</select></div>
    <div class="field"><label>Idioma del cliente</label><select name="idioma">${idiomaOpts}</select></div>
    <div class="field"><label>Origen</label><select name="origen">${origenOpts}</select></div>
    <div class="field"><label>Actividad desde</label><input type="date" name="from" value="${val("from")}"></div>
    <div class="field"><label>Actividad hasta</label><input type="date" name="to" value="${val("to")}"></div>
    <label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" name="con_email" ${s.con_email ? "checked" : ""} style="width:auto;height:auto"> Con email</label>
    <label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" name="con_telefono" ${s.con_telefono ? "checked" : ""} style="width:auto;height:auto"> Con teléfono</label>
    <label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" name="cumple_mes" ${s.cumple_mes ? "checked" : ""} style="width:auto;height:auto"> Cumpleaños este mes</label>
    <label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" id="campOptin" ${s.soloOptIn ? "checked" : ""} style="width:auto;height:auto"> Solo opt-in</label>
    <label class="field full" style="flex-direction:row;align-items:center;gap:7px"><input type="checkbox" id="campTraducir" ${s.traducir ? "checked" : ""} style="width:auto;height:auto"> 🌐 Traducir al idioma de cada cliente (detectado de sus mensajes; castellano por defecto)</label>
    <div class="field full"><label>Destinatarios</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn sm" id="campVerDests">Ver / editar destinatarios</button><span id="campPrev" class="mut" style="font-size:12.5px"></span></div><div id="campDests" style="display:none;max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:10px;margin-top:8px"></div></div>
    ${editar ? "" : '<div class="field"><label>Programar para (opcional)</label><input type="datetime-local" id="campWhen"></div>'}
  </div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap"><button type="button" class="btn" data-close>Cerrar</button>${editar ? '<button type="button" class="btn primary" id="campGuardar">Guardar cambios</button><button type="button" class="btn" id="campEnviarYa">Enviar ya</button>' : '<button type="button" class="btn" id="campBorrador">Guardar borrador</button><button type="button" class="btn" id="campProg">Programar</button><button type="button" class="btn primary" id="campEnviarYa">Enviar ya</button>'}</div></form>`;
  const ov = modal(editar ? "Editar campaña" : mode === "duplicar" ? "Duplicar campaña" : "Nueva campaña", body);
  ov.querySelector(".modal").classList.add("wide");
  let campAdjunto = pre.adjunto_url || "";
  const excluir = new Set(Array.isArray(s.excluir_telefonos) ? s.excluir_telefonos : []);
  // Construye el objeto de filtros desde el formulario (reflejo de construirSegmento del servicio).
  const filtros = () => {
    const f = Object.fromEntries(new FormData(ov.querySelector("#fCamp")).entries());
    const base = { q: f.q, genero: f.genero, poblacion: f.poblacion, local: f.local, idioma: f.idioma, origen: f.origen, from: f.from, to: f.to, con_email: !!f.con_email, con_telefono: !!f.con_telefono, cumple_mes: !!f.cumple_mes, soloOptIn: ov.querySelector("#campOptin").checked, excluir_telefonos: [...excluir] };
    return construirSegmento(base);
  };
  const updateBubble = () => {
    const raw = ov.querySelector("#campMsg").value || "";
    const txt = raw.replace(/\{nombre_completo\}/gi, "Ana Pérez").replace(/\{nombre\}/gi, "Ana").replace(/\{apellidos\}/gi, "Pérez").replace(/\{local\}/gi, "La Tapeta - Blanes");
    ov.querySelector("#campBubble").innerHTML = (campAdjunto ? `<div style="opacity:.9;margin-bottom:6px">📎 adjunto</div>` : "") + (txt ? esc(txt) : '<span style="opacity:.6">(escribe el mensaje…)</span>');
  };
  ov.querySelector("#campMsg").addEventListener("input", updateBubble);
  ov.addEventListener("click", (e) => {
    const vb = e.target.closest("[data-var]");
    if (vb) { const ta = ov.querySelector("#campMsg"); const v = vb.getAttribute("data-var"); const p = ta.selectionStart != null ? ta.selectionStart : ta.value.length; ta.value = ta.value.slice(0, p) + v + ta.value.slice(ta.selectionEnd != null ? ta.selectionEnd : p); ta.focus(); updateBubble(); return; }
    const ob = e.target.closest("[data-obj]");
    if (ob) { ov.querySelector("#campMsg").value = ob.getAttribute("data-obj"); updateBubble(); }
    if (e.target.closest('[data-act="camp-plantillas"]')) {
      campElegirPlantilla((p) => {
        const msg = ov.querySelector("#campMsg");
        msg.value = p.mensaje;
        const nom = ov.querySelector('[name="nombre"]');
        if (nom && !nom.value.trim()) nom.value = p.nombre;
        updateBubble();
      });
    }
  });
  ov.querySelector("#campFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return; toast("Subiendo adjunto…");
    try { const fd = new FormData(); fd.append("files", f); const r = await fetch("/api/upload", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd }); const j = await r.json(); if (!j.ok || !j.urls || !j.urls.length) throw new Error("subida"); campAdjunto = j.urls[0]; ov.querySelector("#campAdjName").textContent = "📎 " + f.name; updateBubble(); }
    catch { toast("No se pudo subir el adjunto"); }
  });
  ov.querySelector("#campPlant").addEventListener("change", (e) => { const p = (CAMP.plantillas || []).find((x) => String(x.id) === e.target.value); if (p) { ov.querySelector("#campMsg").value = p.cuerpo; updateBubble(); } });
  // Cargar audiencia guardada → rellena los campos de filtro.
  ov.querySelector("#campAud").addEventListener("change", (e) => {
    const a = (CAMP.audiencias || []).find((x) => String(x.id) === e.target.value); if (!a) return;
    let flt = {}; try { flt = JSON.parse(a.filtros_json || "{}"); } catch { /* */ }
    const setV = (name, v) => { const el = ov.querySelector(`[name="${name}"]`); if (el) el.value = v || ""; };
    ["genero", "poblacion", "local", "idioma", "origen", "from", "to"].forEach((k) => setV(k, flt[k]));
    ["con_email", "con_telefono", "cumple_mes"].forEach((k) => { const el = ov.querySelector(`[name="${k}"]`); if (el) el.checked = !!flt[k]; });
    ov.querySelector("#campOptin").checked = !!flt.soloOptIn;
    excluir.clear(); (Array.isArray(flt.excluir_telefonos) ? flt.excluir_telefonos : []).forEach((t) => excluir.add(t));
    toast(`Audiencia «${a.nombre}» cargada`);
  });
  ov.querySelector("#campAudSave").addEventListener("click", async () => {
    const nombre = await promptModal("Nombre de la audiencia", { placeholder: "Ej. Clientes Blanes con email" }); if (!nombre) return;
    try { await apiSend("POST", "/api/audiencias", { nombre, filtros: filtros() }); toast("Audiencia guardada ✅"); const a = await apiOptional("/api/audiencias"); CAMP.audiencias = a || []; }
    catch (e) { toast("Error: " + e.message); }
  });
  // Ver / editar destinatarios: lista con casillas; desmarcar excluye ese teléfono.
  const pintarDests = (lista) => {
    const cont = ov.querySelector("#campDests"); cont.style.display = "block";
    cont.innerHTML = lista.length ? lista.map((c) => {
      const marcado = !excluir.has(c.telefono);
      const nom = `${c.nombre || ""} ${c.apellidos || ""}`.trim() || c.telefono;
      return `<label class="agres" style="cursor:pointer"><input type="checkbox" class="cdest" data-tel="${esc(c.telefono)}" ${marcado ? "checked" : ""} style="width:auto"><div class="who"><div class="t1">${esc(nom)} ${c.enviable ? "" : '<span class="pill bad" style="font-size:10px">no enviable</span>'}</div><div class="t2">${esc(c.telefono || "")}</div></div></label>`;
    }).join("") : '<div class="mut" style="padding:12px">Sin destinatarios con esos filtros.</div>';
  };
  ov.querySelector("#campVerDests").addEventListener("click", async () => {
    try { const j = await apiSend("POST", "/api/campanas/preview", { ...filtros(), soloOptIn: ov.querySelector("#campOptin").checked }); ov.querySelector("#campPrev").textContent = `${j.enviables} enviables de ${j.total} (excluidos ${excluir.size}).`; pintarDests(j.lista || []); }
    catch (e) { toast("Error: " + e.message); }
  });
  ov.querySelector("#campDests").addEventListener("change", (e) => {
    const cb = e.target.closest(".cdest"); if (!cb) return; const tel = cb.getAttribute("data-tel");
    if (cb.checked) excluir.delete(tel); else excluir.add(tel);
    ov.querySelector("#campPrev").textContent = `Excluidos ${excluir.size}. Pulsa "Ver/editar" para recalcular enviables.`;
  });
  updateBubble();
  const payload = (extra = {}) => {
    const d = { nombre: (ov.querySelector('[name="nombre"]').value || "").trim(), mensaje: ov.querySelector("#campMsg").value || "", ...filtros(), soloOptIn: ov.querySelector("#campOptin").checked, traducir: ov.querySelector("#campTraducir").checked, ...extra };
    if (campAdjunto) d.adjunto_url = campAdjunto;
    return d;
  };
  const lanzarNueva = async (accion) => {
    const d = payload({ accion });
    if (!d.nombre || !d.mensaje) { toast("Pon nombre y mensaje"); return; }
    if (accion === "programar") { const w = ov.querySelector("#campWhen").value; if (!w) { toast("Elige fecha y hora"); return; } d.programada_para = w; }
    if (accion === "enviar") { if (!(await confirmModal("¿Enviar esta campaña ahora por WhatsApp?", { ok: "Enviar" }))) return; }
    try { const j = await apiSend("POST", "/api/campanas", d); ov.remove(); toast(accion === "enviar" ? `Enviando a ${j.enviables} contacto(s) ✅` : accion === "programar" ? "Campaña programada ✅" : "Borrador guardado ✅"); loadCampanas(); }
    catch (e) { toast("Error: " + e.message); }
  };
  const guardarEdit = async (enviar) => {
    const d = payload();
    if (!d.nombre || !d.mensaje) { toast("Pon nombre y mensaje"); return; }
    if (enviar && !(await confirmModal("¿Guardar y enviar ahora por WhatsApp?", { ok: "Enviar" }))) return;
    try {
      await apiSend("PATCH", "/api/campanas/" + pre.id, d);
      if (enviar) { const j = await apiSend("POST", "/api/campanas/" + pre.id + "/enviar"); toast(`Enviando a ${j.enviables} contacto(s) ✅`); }
      else toast("Cambios guardados ✅");
      ov.remove(); loadCampanas();
    } catch (e) { toast("Error: " + e.message); }
  };
  if (editar) {
    ov.querySelector("#campGuardar").addEventListener("click", () => guardarEdit(false));
    ov.querySelector("#campEnviarYa").addEventListener("click", () => guardarEdit(true));
  } else {
    ov.querySelector("#campBorrador").addEventListener("click", () => lanzarNueva("borrador"));
    ov.querySelector("#campProg").addEventListener("click", () => lanzarNueva("programar"));
    ov.querySelector("#campEnviarYa").addEventListener("click", () => lanzarNueva("enviar"));
  }
}
async function campEditar(id) {
  let c; try { c = (await apiRaw("/api/campanas/" + id)).data.campana; } catch (e) { toast("Error: " + e.message); return; }
  let seg = {}; try { seg = JSON.parse(c.segmento_json || "{}"); } catch { /* */ }
  openCampana("editar", { id: c.id, nombre: c.nombre, mensaje: c.mensaje, adjunto_url: c.adjunto_url, seg });
}
async function campDuplicar(id) {
  let c; try { c = (await apiRaw("/api/campanas/" + id)).data.campana; } catch (e) { toast("Error: " + e.message); return; }
  let seg = {}; try { seg = JSON.parse(c.segmento_json || "{}"); } catch { /* */ }
  openCampana("duplicar", { nombre: (c.nombre || "") + " (copia)", mensaje: c.mensaje, adjunto_url: c.adjunto_url, seg });
}
async function campDetectarIdiomas() {
  if (!(await confirmModal("¿Detectar el idioma de los clientes a partir de sus mensajes de WhatsApp? Solo rellena los que no tienen idioma; podrás corregirlo en cada ficha.", { ok: "Detectar" }))) return;
  toast("Detectando idiomas…");
  try { const j = await apiSend("POST", "/api/contactos/detectar-idiomas"); toast(`Idiomas detectados: ${num(j.actualizados || 0)} de ${num(j.revisados || 0)} contactos ✅`); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function campDetalle(id) {
  let d; try { d = (await apiRaw("/api/campanas/" + id)).data; } catch (e) { toast("Error: " + e.message); return; }
  const c = d.campana, r = d.resumen || {};
  const envios = (d.envios || []).slice(0, 200).map((e) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(e.nombre || e.telefono || "—")}</div><div class="t2">${esc(e.telefono || "")}${e.error ? " · " + esc(e.error) : ""}</div></div><span class="pill ${e.estado === "error" ? "bad" : "ok"}">${esc(e.estado || "")}</span></div>`).join("") || `<div class="mut" style="padding:10px 14px">Sin envíos registrados aún.</div>`;
  modal(c.nombre, `<div class="grid" style="gap:12px"><div class="card" style="padding:12px 14px"><div class="t2">Estado: ${esc(c.estado || "—")} · ${num(r.enviados || 0)} enviados · ${num(r.errores || 0)} errores</div><div style="margin-top:6px;white-space:pre-wrap">${esc(c.mensaje || "")}</div></div><div class="card p0"><div class="ch" style="padding:14px 14px 0"><h3>Destinatarios</h3></div><div class="rows">${envios}</div></div><div style="display:flex;justify-content:flex-end"><button class="btn" data-close>Cerrar</button></div></div>`);
}
async function campEnviar(id) {
  if (!(await confirmModal("¿Enviar esta campaña ahora por WhatsApp?", { ok: "Enviar" }))) return;
  try { const j = await apiSend("POST", "/api/campanas/" + id + "/enviar"); toast(`Enviando a ${j.enviables} contacto(s) ✅`); loadCampanas(); }
  catch (e) { toast("Error: " + e.message); }
}
async function campDel(id) {
  if (!(await confirmModal("¿Eliminar esta campaña?", { ok: "Eliminar", danger: true }))) return;
  try { await apiSend("DELETE", "/api/campanas/" + id); toast("Campaña eliminada ✅"); loadCampanas(); }
  catch (e) { toast("Error: " + e.message); }
}
function campPlantAdd() {
  const ov = modal("Nueva plantilla", `<div class="field" style="width:100%"><label>Nombre</label><input id="plNombre" placeholder="Promo fin de semana"></div><div class="field" style="width:100%"><label>Mensaje (usa {nombre}, {apellidos})</label><textarea id="plCuerpo" rows="4" placeholder="Hola {nombre}! …"></textarea></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="plSave">Guardar</button></div>`);
  ov.querySelector("#plSave").addEventListener("click", async () => {
    const nombre = (ov.querySelector("#plNombre").value || "").trim(); const cuerpo = (ov.querySelector("#plCuerpo").value || "").trim();
    if (!nombre || !cuerpo) { toast("Pon nombre y mensaje"); return; }
    try { await apiSend("POST", "/api/plantillas", { nombre, cuerpo }); ov.remove(); toast("Plantilla guardada ✅"); loadCampanas(); } catch (e) { toast("Error: " + e.message); }
  });
}
async function campPlantDel(id) {
  if (!(await confirmModal("¿Eliminar esta plantilla?", { ok: "Eliminar", danger: true }))) return;
  try { await apiSend("DELETE", "/api/plantillas/" + id); toast("Plantilla eliminada ✅"); loadCampanas(); } catch (e) { toast("Error: " + e.message); }
}
async function campCumpleSave() {
  const auto = !!(document.getElementById("cumpleAuto") || {}).checked;
  const plantilla = (document.getElementById("cumpleMsg") || {}).value || "";
  try { await apiSend("POST", "/api/campanas-config", { cumple_auto: auto, cumple_plantilla: plantilla }); toast("Guardado ✅"); }
  catch (e) { toast("Error: " + e.message); }
}

// ════════════════════════ VISTA: WEB (editor de la web pública + preview en vivo) ════════════════════════
let WEB = { reg: null, content: {}, lang: "es", scope: "global", q: "", blocks: {} };
const WEB_LANGS = ["es", "ca", "en"], WEB_LANG_LABEL = { es: "ES", ca: "CA", en: "EN" };
const WEB_PAGES = [["home_extra", "Portada · extra"], ["nosotros", "Nosotros"], ["eventos", "Eventos"], ["trabaja", "Trabaja"]];
const WEB_BLK_TYPES = [["heading", "Título"], ["paragraph", "Párrafo"], ["image", "Imagen"], ["gallery", "Galería"], ["cta", "Botón"], ["pdf", "PDF"]];
let WEB_TIMERS = {}, WEB_DRAG = null, WEB_BID = 0;
const webIsPage = () => typeof WEB.scope === "string" && WEB.scope.startsWith("page:");
const webPageScope = () => WEB.scope.slice(5);
function webPreviewSrc() {
  if (WEB.scope === "global") return "/index.html";
  if (webIsPage()) { const p = webPageScope(); return p === "home_extra" ? "/index.html" : "/" + p + ".html"; }
  return "/local.html?slug=" + encodeURIComponent(WEB.scope);
}
function webBlkText(b, field) { const v = b && b[field]; if (v && typeof v === "object") return v[WEB.lang] || v.es || ""; return v == null ? "" : String(v); }
function webParseBlocks(raw) { if (!raw) return []; try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; } }
function webBlocks(scope) { if (!WEB.blocks[scope]) WEB.blocks[scope] = webParseBlocks(WEB.content["blocks_" + scope]); return WEB.blocks[scope]; }
function webNewBlock(type) {
  const b = { id: "b" + (++WEB_BID), type };
  if (type === "heading" || type === "paragraph" || type === "cta") b.text = { es: "", ca: "", en: "" };
  if (type === "image") { b.url = ""; b.alt = { es: "", ca: "", en: "" }; }
  if (type === "gallery") b.urls = [];
  if (type === "cta") b.href = "";
  if (type === "pdf") { b.url = ""; b.label = { es: "", ca: "", en: "" }; }
  return b;
}
const webI18nKey = (base, lang) => base + "_" + lang;
function webFieldValue(campo, lang) { const c = WEB.content; if (campo.type === "text_i18n") { const k = webI18nKey(campo.key, lang); return c[k] != null ? c[k] : (c[campo.key] != null ? c[campo.key] : ""); } return c[campo.key] != null ? c[campo.key] : ""; }
const webSaveKey = (campo, lang) => campo.type === "text_i18n" ? webI18nKey(campo.key, lang) : campo.key;
function webMissing(baseKey) { const c = WEB.content; return WEB_LANGS.filter((l) => !(c[webI18nKey(baseKey, l)] || c[baseKey])); }
const webParseGal = (v) => String(v == null ? "" : v).split("\n").map((s) => s.trim()).filter(Boolean);
const webSerGal = (a) => (a || []).map((u) => String(u).trim()).filter(Boolean).join("\n");
function webGroup() {
  const campos = (WEB.reg && WEB.reg.campos) || {}, locs = (WEB.reg && WEB.reg.locales) || [];
  const g = new Map(), lm = new Map();
  for (const key of Object.keys(campos)) { const def = campos[key], e = { key, ...def }; if (def.scope === "local") { const s = def.local || ""; if (!lm.has(s)) lm.set(s, { slug: s, name: def.section, campos: [] }); lm.get(s).campos.push(e); } else { const sec = def.section || "General"; if (!g.has(sec)) g.set(sec, []); g.get(sec).push(e); } }
  return { global: [...g.entries()].map(([section, list]) => ({ section, campos: list })), locales: locs.map((l) => lm.get(l.slug) || { slug: l.slug, name: l.name, campos: [] }) };
}

async function loadWeb() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const [reg, cont] = await Promise.all([apiSend("GET", "/api/content/registry"), apiSend("GET", "/api/content")]);
    WEB.reg = { locales: reg.locales || [], campos: reg.campos || {} };
    WEB.content = cont.data || {};
    view.innerHTML = renderWeb();
    webMountPreview();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}

function webFieldHtml(campo) {
  const q = WEB.q.toLowerCase();
  if (q && !(String(campo.label || "").toLowerCase().includes(q) || String(campo.key || "").toLowerCase().includes(q))) return "";
  const val = webFieldValue(campo, WEB.lang);
  const skey = webSaveKey(campo, WEB.lang), base = campo.key;
  let control;
  if (campo.type === "image") {
    control = `<div class="webmedia">${val ? `<img src="${esc(val)}" class="webthumb" alt="">` : `<div class="webthumb empty">sin imagen</div>`}<label class="btn sm">${ic("search", 14)} Cambiar<input type="file" accept="image/*" data-webupload="${esc(skey)}" data-webbase="${esc(base)}" hidden></label></div>`;
  } else if (campo.type === "pdf") {
    control = `<div class="webmedia">${val ? `<a class="btn sm" href="${esc(val)}" target="_blank" rel="noopener">Ver PDF</a>` : `<span class="mut" style="font-size:12px">sin PDF</span>`}<label class="btn sm">Subir PDF<input type="file" accept="application/pdf" data-webupload="${esc(skey)}" data-webbase="${esc(base)}" hidden></label></div>`;
  } else if (campo.type === "gallery") {
    const urls = webParseGal(val);
    control = `<div class="webgal" data-galkey="${esc(skey)}" data-webbase="${esc(base)}">${urls.map((u, i) => `<div class="webgi" draggable="true" data-galitem data-galkey="${esc(skey)}" data-idx="${i}"><img src="${esc(u)}" alt=""><button class="webgx" data-act="web-gal-del" data-galkey="${esc(skey)}" data-idx="${i}" title="Quitar">✕</button></div>`).join("")}<label class="webgadd">+<input type="file" accept="image/*" multiple data-webgalup="${esc(skey)}" data-webbase="${esc(base)}" hidden></label></div>`;
  } else {
    const multiline = /_sub$|_text$|history|hours/.test(base);
    const badges = campo.type === "text_i18n" ? webMissing(base).filter((l) => l !== WEB.lang).map((l) => `<span class="webmiss">falta ${WEB_LANG_LABEL[l]}</span>`).join("") : "";
    control = multiline
      ? `<textarea data-webkey="${esc(skey)}" data-webbase="${esc(base)}" rows="2">${esc(val)}</textarea>${badges}`
      : `<input type="text" data-webkey="${esc(skey)}" data-webbase="${esc(base)}" value="${esc(val)}">${badges}`;
  }
  return `<div class="webfield"><label>${esc(campo.label)}${campo.type === "text_i18n" ? ` <span class="mut" style="font-weight:400">· ${WEB_LANG_LABEL[WEB.lang]}</span>` : ""}</label>${control}</div>`;
}

function renderWebBlockField(scope, i, b) {
  const li = `data-blkscope="${esc(scope)}" data-blkidx="${i}"`;
  const langLabel = ` <span class="mut" style="font-weight:400">· ${WEB_LANG_LABEL[WEB.lang]}</span>`;
  let body = "";
  if (b.type === "heading" || b.type === "paragraph" || b.type === "cta") {
    const tag = b.type === "paragraph" ? `<textarea rows="2" data-blkedit ${li} data-blkfield="text" data-blklang="${WEB.lang}">${esc(webBlkText(b, "text"))}</textarea>` : `<input type="text" data-blkedit ${li} data-blkfield="text" data-blklang="${WEB.lang}" value="${esc(webBlkText(b, "text"))}">`;
    body = `<label>Texto${langLabel}</label>${tag}` + (b.type === "cta" ? `<label style="margin-top:8px">Enlace</label><input type="text" data-blkedit ${li} data-blkfield="href" value="${esc(b.href || "")}" placeholder="https://…">` : "");
  } else if (b.type === "image") {
    body = `<div class="webmedia">${b.url ? `<img src="${esc(b.url)}" class="webthumb" alt="">` : `<div class="webthumb empty">sin imagen</div>`}<label class="btn sm">Cambiar<input type="file" accept="image/*" data-blkupload ${li} data-blkfield="url" hidden></label></div><label style="margin-top:8px">Texto alternativo${langLabel}</label><input type="text" data-blkedit ${li} data-blkfield="alt" data-blklang="${WEB.lang}" value="${esc(webBlkText(b, "alt"))}">`;
  } else if (b.type === "pdf") {
    body = `<div class="webmedia">${b.url ? `<a class="btn sm" href="${esc(b.url)}" target="_blank" rel="noopener">Ver PDF</a>` : `<span class="mut" style="font-size:12px">sin PDF</span>`}<label class="btn sm">Subir<input type="file" accept="application/pdf" data-blkupload ${li} data-blkfield="url" hidden></label></div><label style="margin-top:8px">Etiqueta${langLabel}</label><input type="text" data-blkedit ${li} data-blkfield="label" data-blklang="${WEB.lang}" value="${esc(webBlkText(b, "label"))}">`;
  } else if (b.type === "gallery") {
    const urls = b.urls || [];
    body = `<div class="webgal">${urls.map((u, gi) => `<div class="webgi"><img src="${esc(u)}" alt=""><button class="webgx" data-act="blk-gal-del" ${li} data-gidx="${gi}">✕</button></div>`).join("")}<label class="webgadd">+<input type="file" accept="image/*" multiple data-blkgalup ${li} hidden></label></div>`;
  }
  const typeLabel = (WEB_BLK_TYPES.find((t) => t[0] === b.type) || [b.type, b.type])[1];
  return `<div class="blkcard"><div class="blkcard-h"><span class="pill">${esc(typeLabel)}</span><div style="flex:1"></div><button class="iconbtn sm" data-act="blk-move" ${li} data-dir="-1" title="Subir">↑</button><button class="iconbtn sm" data-act="blk-move" ${li} data-dir="1" title="Bajar">↓</button><button class="iconbtn sm" data-act="blk-del" ${li} title="Eliminar">✕</button></div>${body}</div>`;
}
function renderWebBlockEditor() {
  const scope = webPageScope(); const blocks = webBlocks(scope);
  const add = `<div class="blkadd">${WEB_BLK_TYPES.map(([t, lbl]) => `<button class="btn sm" data-act="blk-add" data-blkscope="${esc(scope)}" data-type="${t}">+ ${esc(lbl)}</button>`).join("")}</div>`;
  const list = blocks.length ? blocks.map((b, i) => renderWebBlockField(scope, i, b)).join("") : `<div class="mut" style="padding:10px 2px">Aún no hay bloques en esta sección. Añade uno abajo.</div>`;
  return `<div class="websec"><div class="websec-h">Bloques</div>${list}</div>${add}`;
}
function renderWebFields() {
  if (webIsPage()) return renderWebBlockEditor();
  const grp = webGroup();
  let secciones;
  if (WEB.scope === "global") {
    secciones = grp.global.map((s) => { const f = s.campos.map(webFieldHtml).join(""); return f.trim() ? `<div class="websec"><div class="websec-h">${esc(s.section)}</div>${f}</div>` : ""; }).join("");
  } else {
    const loc = grp.locales.find((l) => l.slug === WEB.scope); const f = (loc ? loc.campos : []).map(webFieldHtml).join("");
    secciones = f.trim() ? `<div class="websec"><div class="websec-h">${esc(loc.name)}</div>${f}</div>` : `<div class="mut" style="padding:10px">Sin campos para este local.</div>`;
  }
  return secciones.trim() ? secciones : `<div class="mut" style="padding:10px">Sin resultados para «${esc(WEB.q)}».</div>`;
}
function renderWeb() {
  const grp = webGroup();
  const scopeChips = `<div class="chips">${['<button class="chip ' + (WEB.scope === "global" ? "on" : "") + '" data-act="web-scope" data-scope="global">Portada</button>'].concat(grp.locales.map((l) => `<button class="chip ${WEB.scope === l.slug ? "on" : ""}" data-act="web-scope" data-scope="${esc(l.slug)}">${esc(l.name)}</button>`)).join("")}</div>`;
  const pageChips = `<div class="chips" style="margin-top:-8px"><span class="mut" style="font-size:11px;align-self:center;margin-right:2px">Secciones:</span>${WEB_PAGES.map(([s, lbl]) => `<button class="chip ${WEB.scope === "page:" + s ? "on" : ""}" data-act="web-scope" data-scope="page:${s}">${esc(lbl)}</button>`).join("")}</div>`;
  const langSeg = `<div class="seg">${WEB_LANGS.map((l) => `<button class="${WEB.lang === l ? "on" : ""}" data-act="web-lang" data-lang="${l}">${WEB_LANG_LABEL[l]}</button>`).join("")}</div>`;
  const search = `<input id="webQ" placeholder="Buscar campo…" value="${esc(WEB.q)}" data-websearch style="height:36px;max-width:200px">`;
  const editor = `<div class="webedit"><div class="webbar">${langSeg}${search}<span id="webInd" class="mut" style="font-size:12px;margin-left:auto"></span></div><div class="webfields">${renderWebFields()}</div></div>`;
  const src = webPreviewSrc();
  const preview = `<div class="webprev"><div class="webprev-bar"><span class="mut" style="font-size:12px">Vista previa</span><a class="btn sm" href="${src}" target="_blank" rel="noopener">Abrir ↗</a></div><iframe id="webframe" src="${src}" title="Vista previa"></iframe></div>`;
  return `<div class="ph"><div><div class="eyebrow">Web pública</div><h1>Editor de la web</h1><div class="sub">Cambia textos, imágenes, cartas y galerías de la web del cliente. Se guarda solo.</div></div></div>${scopeChips}${pageChips}<div class="webwrap">${editor}${preview}</div>`;
}

function webPost(msg) { const f = document.getElementById("webframe"); if (f && f.contentWindow) try { f.contentWindow.postMessage(msg, "*"); } catch { /* */ } }
function webMountPreview() { const f = document.getElementById("webframe"); if (!f) return; f.addEventListener("load", () => { webPost({ type: "edit-mode", enabled: true }); webPost({ type: "set-lang", lang: WEB.lang }); }); }
function webReload() { const f = document.getElementById("webframe"); if (f) f.src = f.src; }
function webInd(t) { const el = document.getElementById("webInd"); if (el) { el.textContent = t; if (/Guardado/.test(t)) setTimeout(() => { if (el.textContent === t) el.textContent = ""; }, 1500); } }
function webQueueSave(key, value, immediate) {
  WEB.content[key] = value;
  clearTimeout(WEB_TIMERS[key]); webInd("Guardando…");
  const doSave = async () => { try { await apiSend("PUT", "/api/content", { key, value }); webInd("✓ Guardado"); } catch (e) { webInd("⚠ Error"); } };
  if (immediate) doSave(); else WEB_TIMERS[key] = setTimeout(doSave, 600);
}
function webFieldInput(t) { const key = t.getAttribute("data-webkey"), base = t.getAttribute("data-webbase"); webQueueSave(key, t.value); if (base) webPost({ type: "canvas-update", key: base, value: t.value }); }
async function webUpload(input, { gallery = false } = {}) {
  const files = input.files; if (!files || !files.length) return;
  const key = input.getAttribute(gallery ? "data-webgalup" : "data-webupload");
  webInd("Subiendo…");
  try {
    const fd = new FormData(); for (const f of files) fd.append("files", f);
    const r = await fetch("/api/upload", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
    const j = await r.json(); if (!j.ok || !j.urls || !j.urls.length) throw new Error("subida");
    if (gallery) { const cur = webParseGal(WEB.content[key]); webQueueSave(key, webSerGal(cur.concat(j.urls)), true); }
    else { webQueueSave(key, j.urls[0], true); }
    webInd("✓ Guardado"); const v = document.getElementById("view"); if (v) { v.innerHTML = renderWeb(); webMountPreview(); } webReload();
  } catch (e) { webInd("⚠ Error al subir"); }
}
function webGalDel(key, idx) { const cur = webParseGal(WEB.content[key]); cur.splice(idx, 1); webQueueSave(key, webSerGal(cur), true); const v = document.getElementById("view"); if (v) { v.innerHTML = renderWeb(); webMountPreview(); } webReload(); }
function webGalReorder(key, from, to) { const cur = webParseGal(WEB.content[key]); if (from === to || from < 0 || to < 0 || from >= cur.length) return; const [m] = cur.splice(from, 1); cur.splice(to, 0, m); webQueueSave(key, webSerGal(cur), true); const v = document.getElementById("view"); if (v) { v.innerHTML = renderWeb(); webMountPreview(); } webReload(); }

// Bloques (secciones/páginas nuevas)
function webBlkPersist(scope, reRender) {
  webQueueSave("blocks_" + scope, JSON.stringify(WEB.blocks[scope] || []));
  if (reRender) { const c = document.querySelector(".webfields"); if (c) c.innerHTML = renderWebFields(); }
  clearTimeout(WEB_TIMERS._blkprev); WEB_TIMERS._blkprev = setTimeout(webReload, 800);
}
function webBlkEditInput(el) {
  const scope = el.getAttribute("data-blkscope"), idx = +el.getAttribute("data-blkidx"), field = el.getAttribute("data-blkfield"), lang = el.getAttribute("data-blklang");
  const b = (WEB.blocks[scope] || [])[idx]; if (!b) return;
  if (lang) { if (!b[field] || typeof b[field] !== "object") b[field] = { es: "", ca: "", en: "" }; b[field][lang] = el.value; } else b[field] = el.value;
  webBlkPersist(scope, false);
}
function webBlkAdd(scope, type) { webBlocks(scope).push(webNewBlock(type)); webBlkPersist(scope, true); }
function webBlkMove(scope, idx, dir) { const a = WEB.blocks[scope]; const j = idx + dir; if (!a || j < 0 || j >= a.length) return; const [m] = a.splice(idx, 1); a.splice(j, 0, m); webBlkPersist(scope, true); }
function webBlkDel(scope, idx) { const a = WEB.blocks[scope]; if (!a) return; a.splice(idx, 1); webBlkPersist(scope, true); }
function webBlkGalDel(scope, idx, gidx) { const b = (WEB.blocks[scope] || [])[idx]; if (!b || !b.urls) return; b.urls.splice(gidx, 1); webBlkPersist(scope, true); }
async function webBlkUpload(input, gallery) {
  const files = input.files; if (!files || !files.length) return;
  const scope = input.getAttribute("data-blkscope"), idx = +input.getAttribute("data-blkidx"), field = input.getAttribute("data-blkfield");
  const b = (WEB.blocks[scope] || [])[idx]; if (!b) return; webInd("Subiendo…");
  try {
    const fd = new FormData(); for (const f of files) fd.append("files", f);
    const r = await fetch("/api/upload", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
    const j = await r.json(); if (!j.ok || !j.urls || !j.urls.length) throw new Error("subida");
    if (gallery) b.urls = (b.urls || []).concat(j.urls); else b[field] = j.urls[0];
    webInd("✓ Guardado"); webBlkPersist(scope, true);
  } catch { webInd("⚠ Error al subir"); }
}

// ── Router ───────────────────────────────────────────────────────────────────
const VIEWS = { subirfactura: loadSubirFactura, dashboard: loadDashboard, reservas: loadReservas, comunicados: loadComunicados, mantenimiento: loadMant, inventarios: loadInventario, clientes: loadClientes, reviews: loadReviews, campanas: loadCampanas, rrhh: loadRRHH, horarios: loadHorarios, fichajes: loadFichajes, facturas: loadFacturas, productos: loadProductos, analitica: loadAnalitica, sara: loadSara, agora: loadAgora, whatsapp: loadWhatsApp, usuarios: loadUsuarios, web: loadWeb };
/**
 * LA PANTALLA VA EN LA URL. Sin esto, recargar en cualquier sitio te devolvía al Dashboard —y
 * también hacía inútiles el botón de atrás y guardar un enlace a una pantalla concreta.
 *
 * Se usa el «#» y no rutas de verdad porque el panel es un solo archivo servido en /panel/: con
 * rutas de servidor habría que enseñar el mismo HTML en veinte direcciones distintas. El «#» no
 * viaja al servidor y hace exactamente lo que hace falta.
 *
 * Compras lleva además su pestaña («#facturas/pagos»): recargar en Pagos y aparecer en Facturas
 * es el mismo problema en pequeño.
 */
function vistaDeUrl() {
  const [vista, sub] = String(location.hash || "").replace(/^#\/?/, "").split("/");
  return { vista: VIEWS[vista] ? vista : null, sub: sub || null };
}

function escribirUrl(view, sub) {
  const nueva = "#" + view + (sub ? "/" + sub : "");
  if (location.hash === nueva) return;
  // `replaceState` y no `pushState`: cada pantalla del panel no es un paso atrás que la gente
  // quiera deshacer una por una. Con esto, «atrás» sale del panel como se espera, y la URL
  // sigue diciendo dónde estás al recargar.
  history.replaceState(null, "", nueva);
}

function go(view, { desdeUrl = false } = {}) {
  if (!VIEWS[view]) view = "dashboard";
  // El calendario cuelga de <body>, así que sobrevive al repintado de la vista:
  // si no lo cerramos aquí, se queda flotando encima de la pantalla nueva.
  dpClose();
  CURRENT = view;
  if (!desdeUrl) escribirUrl(view, view === "facturas" ? FACTAB : null);
  if (!puedeVer(view)) {
    document.getElementById("root").innerHTML = shell(view, `<div class="card"><div class="ch"><h3>Sin acceso</h3></div><p class="mut">No tienes acceso a este módulo.</p></div>`);
    refreshWaPill(); return;
  }
  document.getElementById("root").innerHTML = shell(view, skeleton());
  refreshWaPill(view === "whatsapp"); // en la pantalla de Sara sí interesa el estado del momento
  VIEWS[view]();
}

document.addEventListener("change", (e) => {
  if (!e.target) return;
  const id = e.target.id;
  if (id === "sfCam" || id === "sfFile") {
    const files = Array.from(e.target.files || []);
    e.target.value = "";   // para poder volver a elegir el mismo archivo si algo falló
    sfEnviar(files);
    return;
  }
  if (id === "cPob") { CLIF.poblacion = e.target.value; refreshCliResults(); }
  else if (id === "cLocal") { CLIF.local = e.target.value; refreshCliResults(); }
  else if (id === "cCumple") { CLIF.cumple = e.target.checked; refreshCliResults(); }
  else if (id === "cEmail") { CLIF.con_email = e.target.checked; refreshCliResults(); }
  else if (id === "cTel") { CLIF.con_telefono = e.target.checked; refreshCliResults(); }
  else if (id === "cBaja") { CLIF.excluir_baja = e.target.checked; refreshCliResults(); }
  // Facturas: filtros en vivo (selects y fechas aplican al instante; el texto va con antirrebote).
  else if (id === "facEmp" || id === "facEstado" || id === "facTipo" || id === "facFrom" || id === "facTo") applyFacFilter();
  else if (id === "mEstado") applyMantFilter();
});
// Filtrado en vivo del buscador de Clientes: al escribir/borrar, refresca (con antirrebote).
let _analTimer = null;
document.addEventListener("input", (e) => {
  // El informe ya está entero en memoria, así que buscar es filtrar: instantáneo y sin
  // volver a preguntarle al TPV. El antirrebote es solo para no repintar en cada tecla.
  if (e.target && e.target.id === "analQ") { clearTimeout(_analTimer); const v = e.target.value; _analTimer = setTimeout(() => analBuscar(v), 180); return; }
  if (e.target && e.target.id === "reshQ") { const v = e.target.value; clearTimeout(_reshT); _reshT = setTimeout(() => resHistBuscar(v), 200); return; }
  if (e.target && e.target.id === "cQ") { CLIF.q = e.target.value.trim(); cliRefreshDebounced(); }
  else if (e.target && e.target.id === "facQ") { facFilterDebounced(); }
  else if (e.target && e.target.id === "invSearch") { INV.filtro = e.target.value; invRefreshList(); }
  else if (e.target && e.target.classList && e.target.classList.contains("invqty")) { invInput(e.target.getAttribute("data-id"), e.target.value); }
});
// Selección de facturas. Va aquí y no en la tabla porque la tabla se repinta al filtrar.
document.addEventListener("change", (e) => {
  const c = e.target;
  if (!c || c.type !== "checkbox") return;
  if (c.hasAttribute("data-facsel")) facSelToggle(c.getAttribute("data-facsel"), c.checked);
  else if (c.id === "facSelAll") facSelTodas(c.checked);
  else if (c.hasAttribute("data-compsel")) compSelToggle(c.getAttribute("data-compsel"), c.getAttribute("data-desc"), c.checked);
});
document.addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]"); if (v) { e.preventDefault(); const a = document.getElementById("appEl"); if (a) a.classList.remove("mopen"); go(v.getAttribute("data-view")); return; }
  const t = e.target.closest("[data-act]"); if (!t) return;
  // La fila entera de una factura abre su ficha, pero la casilla de seleccionar y los botones
  // que lleva dentro son suyos: sin esto, marcar una factura te abría su ficha.
  if (t.classList.contains("facrow") && e.target.closest("input,button,a,label")) return;
  const act = t.getAttribute("data-act");
  if (act === "nav-grupo") { navToggleGrupo(t.getAttribute("data-g")); return; }
  // Modo icono: los grupos se ven todos, pero eso lo hace el CSS. Aquí no se repinta nada,
  // porque repintar la barra tira también la vista y con ella sus listeners.
  if (act === "mtoggle") { const a = document.getElementById("appEl"); if (!a) return; if (window.innerWidth <= 820) a.classList.toggle("mopen"); else { COLLAPSED = !COLLAPSED; a.classList.toggle("collapsed"); } }
  else if (act === "mclose") { const a = document.getElementById("appEl"); if (a) a.classList.remove("mopen"); }
  else if (act === "cmdk") openCmd();
  else if (act === "estabmenu") openEstabMenu();
  // Cambiar de establecimiento reaplica el ámbito sin sacarte de donde estabas.
  else if (act === "estab-pick") { DASH_LOCAL = t.getAttribute("data-local") || ""; SELECCION = []; guardarAmbito(); closeDrawer(); go(MODULOS_POR_LOCAL.has(CURRENT) ? CURRENT : "dashboard"); }
  // Marcar y desmarcar no cambia de pantalla: se van eligiendo y se aplica al final. Cambiar de
  // ámbito en cada clic haría tres recargas para juntar tres locales.
  else if (act === "estab-marca") {
    const l = t.getAttribute("data-local") || "";
    const actuales = new Set(viendoVarios() ? localesDelAmbito() : (localActualFE() ? [localActualFE()] : []));
    if (t.checked) actuales.add(l); else actuales.delete(l);
    SELECCION = localesBase().filter((x) => actuales.has(x));   // en el orden de la lista, no en el de los clics
    openEstabMenu();
  }
  else if (act === "estab-varios") {
    if (SELECCION.length < 2) return;
    DASH_LOCAL = VARIOS; guardarAmbito(); closeDrawer();
    go(MODULOS_POR_LOCAL.has(CURRENT) ? CURRENT : "dashboard");
  }
  else if (act === "ag-metodos") agoraMetodos(t.getAttribute("data-local"));
  else if (act === "pulso-enviar") pulsoEnviar();
  else if (act === "pulso-atendido") pulsoAtendido(t.getAttribute("data-id"));
  else if (act === "pulso-config") pulsoConfig();
  else if (act === "hor-prev") horNavega("prev");
  else if (act === "hor-next") horNavega("next");
  else if (act === "hor-hoy") horNavega("hoy");
  else if (act === "hor-vista") horVista(t.getAttribute("data-v"));
  else if (act === "hor-crear") horCrear();
  else if (act === "hor-editar") horEditar(t.getAttribute("data-id"));
  else if (act === "hor-nuevo") horModal(null, { dia: t.getAttribute("data-dia"), tramo: t.getAttribute("data-tramo"), area: t.getAttribute("data-area") });
  else if (act === "hor-copiar") horCopiar();
  else if (act === "hor-plantillas") horPlantillas();
  else if (act === "hor-publicar") horPublicar();
  else if (act === "hor-nueva-version") horNuevaVersion();
  else if (act === "hor-historico") horHistorico();
  else if (act === "hor-pdf") horPdf();
  else if (act === "hor-wa") horMandarAlGrupo();
  else if (act === "hor-generar") horGenerar();
  else if (act === "hor-config") horConfig();
  else if (act === "dp-open") dpOpen(t);
  else if (act === "dp-clear") { dpSet(t.getAttribute("data-for"), ""); dpClose(); }
  else if (act === "period") {
    const p = t.getAttribute("data-p");
    const r = p === "todo" ? { from: "", to: "", label: "Desde siempre" } : rangoPreset(p, todayStr());
    fijarPeriodoVista(p, r.from, r.to, r.label);
    document.querySelectorAll(".topbar .seg button").forEach((b) => b.classList.toggle("on", b === t));
    recargarPorPeriodo();
  }
  else if (act === "period-custom") openPeriodoCustom();
  else if (act === "theme") toggleTheme();
  else if (act === "logout") { localStorage.removeItem("token"); location.href = "/login.html"; }
  else if (act === "reload") go(CURRENT);
  else if (act === "res-vista") resVista(t.getAttribute("data-vista"));
  else if (act === "resh-periodo") { RESH.periodo = t.getAttribute("data-p"); loadReservas(); }   // la búsqueda se conserva: se suele buscar lo mismo en otro periodo
  else if (act === "res-prev") resNavega("prev");
  else if (act === "res-next") resNavega("next");
  else if (act === "res-hoy") resNavega("hoy");
  else if (act === "res-dia") resDiaFoco(t.getAttribute("data-dia"));
  else if (act === "nueva") openNuevaReserva();
  else if (act === "csv") downloadCsv();
  else if (act === "cancel") cancelReserva(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "mant-nueva") openNuevaIncidencia();
  else if (act === "mant-estado") mantEstado(t.getAttribute("data-id"), t.getAttribute("data-estado"));
  else if (act === "inv-volver-prov") loadInvProveedores();
  else if (act === "inv-volver-conteo") loadInvConteo();
  else if (act === "inv-nuevo-prov") invNuevoProveedor();
  else if (act === "inv-pedidos") loadInvPedidos();
  else if (act === "inv-historial") loadInvHistorial();
  else if (act === "inv-contar") invPickProveedor(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "inv-config") loadInvConfig(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "inv-revisar") loadInvRevision();
  else if (act === "inv-minus") invStep(t.getAttribute("data-id"), -1);
  else if (act === "inv-plus") invStep(t.getAttribute("data-id"), 1);
  else if (act === "inv-obs") invObs(t.getAttribute("data-id"));
  else if (act === "inv-generar-pedido") invGenerarPedido();
  else if (act === "inv-ver-pedido") loadInvPedido(t.getAttribute("data-id"));
  else if (act === "inv-linea-minus") invPedStep(t.getAttribute("data-id"), -1);
  else if (act === "inv-linea-plus") invPedStep(t.getAttribute("data-id"), 1);
  else if (act === "inv-linea-del") invDelLinea(t.getAttribute("data-id"));
  else if (act === "inv-guardar-pedido") invGuardarPedido();
  else if (act === "inv-aprobar-pedido") invCambiarEstadoPedido("APPROVED", "Aprobar pedido");
  else if (act === "inv-cancelar-pedido") invCambiarEstadoPedido("CANCELLED", "Cancelar pedido");
  else if (act === "inv-nuevo-prod") invNuevoProducto();
  else if (act === "inv-edit-prod") invEditProducto(t.getAttribute("data-id"));
  else if (act === "inv-del-prod") invDelProducto(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "cli-csv") downloadClientesCsv();
  else if (act === "cli-dup") cliDuplicados();
  else if (act === "cli-wa") cliWa(t.getAttribute("data-tel"), t.getAttribute("data-nombre"));
  else if (act === "cli-ficha") cliFicha(t.getAttribute("data-tel"));
  else if (act === "cli-masivo") cliMasivo();
  else if (act === "rev-filtrar") applyRevFilter();
  else if (act === "rev-more") loadMoreReviews();
  else if (act === "rev-vincular") revVincular();
  else if (act === "rev-refresh") refreshReviews();
  else if (act === "rev-responder") openResponder(t.getAttribute("data-id"));
  else if (act === "rev-sel") revToggleSel(t.getAttribute("data-id"));
  else if (act === "rev-sel-none") revSelNone();
  else if (act === "rev-bulk") revBulk();
  else if (act === "rr-tab") rrTab(t.getAttribute("data-tab"));
  else if (act === "rr-contr-tab") { RRCONTR = t.getAttribute("data-tab"); loadRRHH(); }
  else if (act === "rr-filtrar") applyRRFilter();
  else if (act === "cand-estado") candEstado(t.getAttribute("data-id"), t.getAttribute("data-estado"));
  else if (act === "rr-worker") rrSelWorker(t.getAttribute("data-id"));
  else if (act === "rr-editar-datos") rrEditarDatos(t.getAttribute("data-id"));
  else if (act === "rr-pin") rrAsignarPin(t.getAttribute("data-id"));
  else if (act === "rr-reset-pass") rrResetPassword(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "rr-doc-subir") rrDocSubir(t.getAttribute("data-id"));
  else if (act === "rr-doc-del") rrDocDel(t.getAttribute("data-id"));
  else if (act === "cand-contratar") rrContratar(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "rr-agora-import") rrImportarOperadores();
  else if (act === "rr-rend-cargar") rrCargarRendimiento(t.getAttribute("data-id"));
  else if (act === "rr-worker-add") rrWorkerAdd();
  else if (act === "rr-worker-del") rrWorkerDel(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "rr-checkin-save") rrCheckinSave();
  else if (act === "rr-checkin-edit") rrCheckinEdit();
  else if (act === "rr-nota-add") rrNotaAdd();
  else if (act === "rr-nota-del") rrNotaDel(t.getAttribute("data-id"));
  else if (act === "rr-vac-add") rrVacAdd();
  else if (act === "rr-vac-toggle") rrVacToggle(t.getAttribute("data-id"), +t.getAttribute("data-activo"));
  else if (act === "rr-preg-add") rrPregAdd();
  else if (act === "rr-preg-del") rrPregDel(+t.getAttribute("data-idx"));
  else if (act === "rr-preg-move") rrPregMove(+t.getAttribute("data-idx"), +t.getAttribute("data-dir"));
  else if (act === "rr-preg-mesload") rrPregMesLoad();
  else if (act === "rr-preg-save") rrPregSave();
  else if (act === "user-nuevo") openNuevoUsuario();
  else if (act === "user-edit") openEditarUsuario(t.getAttribute("data-id"));
  else if (act === "user-pass") userPass(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "user-del") userDel(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "fac-pago") facPago(t.getAttribute("data-id"));
  else if (act === "fac-revisar") facRevisar(t.getAttribute("data-id"));
  else if (act === "fac-fusionar") facFusionarPendientes();
  else if (act === "fac-tab") facTab(t.getAttribute("data-tab"));
  else if (act === "fac-loc-add") facLocAdd();
  else if (act === "fac-loc-del") facLocDel(t.getAttribute("data-local"));
  else if (act === "fac-mail-add") facMailAdd();
  else if (act === "fac-mail-del") facMailDel(t.getAttribute("data-id"));
  else if (act === "fac-grp-add") facGrpAdd();
  else if (act === "fac-grp-del") facGrpDel(t.getAttribute("data-id"));
  else if (act === "fac-303") fac303();
  else if (act === "fac-ficha") facFicha(t.getAttribute("data-id"));
  else if (act === "fac-export") facExport();
  else if (act === "fac-filtros") facAbrirFiltros();
  else if (act === "fac-quitar-filtro") facQuitarFiltro(t.getAttribute("data-k"));
  else if (act === "fac-limpiar-filtros") facLimpiarFiltros();
  else if (act === "fac-normalizar-locales") facNormalizarLocales();
  else if (act === "fac-cat-editar") facCatEditar(t.getAttribute("data-prov"));
  else if (act === "fac-provdup") {
    const g = (PROVDUP?.grupos || [])[Number(t.getAttribute("data-i"))];
    if (!g) return;
    if (t.getAttribute("data-provdup") === "unir") return facProvUnir(g, g.sugerido.proveedor);
    // «Al revés»: elegir a mano con cuál de los nombres se queda.
    const todos = [g.sugerido, ...g.otros];
    const ov = modal("¿Con qué nombre se queda?", `
      <p class="mut" style="margin:0 0 10px">Todas las facturas pasarán al que elijas, y las próximas entrarán ya así.</p>
      <div class="rows">${todos.map((x) => `<div class="row">
          <div class="grow"><b>${esc(x.proveedor)}</b> <span class="mut">· ${num(x.facturas)} facturas · ${esc(eur(x.gasto))}</span></div>
          <button class="btn sm primary" data-quedarse="${esc(x.proveedor)}">Este</button></div>`).join("")}</div>`);
    ov.addEventListener("click", (e) => {
      const b = e.target.closest("[data-quedarse]");
      if (!b) return;
      ov.remove();
      facProvUnir(g, b.getAttribute("data-quedarse"));
    });
  }
  else if (act === "fac-prov-ficha") facProveedorFicha(t.getAttribute("data-prov"));
  else if (act === "fac-dup") facDupResolver(t.getAttribute("data-id"), t.getAttribute("data-accion"));
  else if (act === "fac-ir-cats") facTab("config", true);
  else if (act === "comp-producto") comprasHistorial(t.getAttribute("data-clave"), t.getAttribute("data-nombre"));
  else if (act === "fac-sel-resumen") facSelResumen();
  else if (act === "fac-sel-export") facSelExport();
  else if (act === "fac-sel-docs") facSelDocumentos();
  else if (act === "fac-sel-limpiar") facSelLimpiar();
  else if (act === "fac-sel-pagar") facSelPagar(t.getAttribute("data-pagado") === "1");
  else if (act === "comp-unificar") compUnificar();
  else if (act === "comp-sel-limpiar") { COMP_SEL = new Map(); refrescarCompras(); }
  else if (act === "fac-subir") facSubir();
  else if (act === "sf-camara") document.getElementById("sfCam")?.click();
  else if (act === "sf-archivo") document.getElementById("sfFile")?.click();
  else if (act === "fac-303-csv") fac303Csv();
  else if (act === "fac-migrar") facMigrar();
  else if (act === "fac-colocar-raiz") facColocarRaiz();
  else if (act === "fac-drive-add") facDriveAdd();
  else if (act === "fac-drive-del") facDriveDel(t.getAttribute("data-local"));
  else if (act === "fac-reconstruir") facReconstruir();
  else if (act === "fac-reparar") facReparar();
  else if (act === "fac-repaso") facRepaso();
  else if (act === "fac-reproyectar") facReproyectar();
  else if (act === "fac-empezar-cero") facEmpezarCero();
  else if (act === "com-add") comAdd();
  else if (act === "ag-save") agoraSave(t.getAttribute("data-local"), t.getAttribute("data-i"));
  else if (act === "ag-probe") agoraProbe(t.getAttribute("data-local"));
  else if (act === "ag-diag") agoraDiagnostico(t.getAttribute("data-local"));
  else if (act === "ag-vivo-refresh") { const c = document.getElementById("agVivo"); if (c) c.innerHTML = '<div class="card"><div class="mut" style="font-size:13px">Actualizando ventas…</div></div>'; loadAgoraVivo(true); }
  else if (act === "ag-descubrir") agoraDescubrir(t.getAttribute("data-local"));
  else if (act === "ag-del") agoraDel(t.getAttribute("data-local"));
  else if (act === "ag-sync") agoraSyncNow();
  else if (act === "anal-tab") analTab(t.getAttribute("data-tipo"));
  else if (act === "anal-area") analArea(t.getAttribute("data-area"));
  else if (act === "anal-period") analPeriod(t.getAttribute("data-p"));
  else if (act === "anal-period-custom") analPeriodCustom();
  else if (act === "anal-sort") analSort(t.getAttribute("data-key"));
  else if (act === "anal-refresh") loadAnalInforme(true);
  else if (act === "anal-csv") analCsv();
  else if (act === "camp-nueva") openNuevaCampana();
  else if (act === "camp-detectar-idiomas") campDetectarIdiomas();
  else if (act === "camp-detalle") campDetalle(t.getAttribute("data-id"));
  else if (act === "camp-editar") campEditar(t.getAttribute("data-id"));
  else if (act === "camp-dup") campDuplicar(t.getAttribute("data-id"));
  else if (act === "camp-enviar") campEnviar(t.getAttribute("data-id"));
  else if (act === "camp-del") campDel(t.getAttribute("data-id"));
  else if (act === "camp-plant-add") campPlantAdd();
  else if (act === "camp-plant-del") campPlantDel(t.getAttribute("data-id"));
  else if (act === "camp-cumple-save") campCumpleSave();
  else if (act === "wa-link") waLink(t.getAttribute("data-local"), t);
  else if (act === "sara-send") saraSend();
  else if (act === "sara-aplicar") saraAplicar();
  else if (act === "sara-cancelar") saraCancelar();
  else if (act === "sara-adj-del") saraAdjDel(+t.getAttribute("data-idx"));
  else if (act === "sara-blo-del") saraBloDel(t.getAttribute("data-id"));
  else if (act === "sara-reg-del") saraRegDel(t.getAttribute("data-id"));
  else if (act === "web-scope") { WEB.scope = t.getAttribute("data-scope"); WEB.q = ""; const v = document.getElementById("view"); if (v) { v.innerHTML = renderWeb(); webMountPreview(); } }
  else if (act === "web-lang") { WEB.lang = t.getAttribute("data-lang"); const v = document.getElementById("view"); if (v) { v.innerHTML = renderWeb(); webMountPreview(); } webPost({ type: "set-lang", lang: WEB.lang }); }
  else if (act === "web-gal-del") { webGalDel(t.getAttribute("data-galkey"), +t.getAttribute("data-idx")); }
  else if (act === "blk-add") { webBlkAdd(t.getAttribute("data-blkscope"), t.getAttribute("data-type")); }
  else if (act === "blk-move") { webBlkMove(t.getAttribute("data-blkscope"), +t.getAttribute("data-blkidx"), +t.getAttribute("data-dir")); }
  else if (act === "blk-del") { webBlkDel(t.getAttribute("data-blkscope"), +t.getAttribute("data-blkidx")); }
  else if (act === "blk-gal-del") { webBlkGalDel(t.getAttribute("data-blkscope"), +t.getAttribute("data-blkidx"), +t.getAttribute("data-gidx")); }
});

// Editor web: input (autoguardado + preview en vivo), subida de archivos y búsqueda.
document.addEventListener("input", (e) => {
  const be = e.target.closest("[data-blkedit]"); if (be) { webBlkEditInput(be); return; }
  const f = e.target.closest("[data-webkey]"); if (f) { webFieldInput(f); return; }
  const s = e.target.closest("[data-websearch]"); if (s) { WEB.q = s.value; const cont = document.querySelector(".webfields"); if (cont) cont.innerHTML = renderWebFields(); }
});
document.addEventListener("change", (e) => {
  const su = e.target.closest("[data-saraupload]"); if (su) { saraUpload(su); return; }
  const bu = e.target.closest("[data-blkupload]"); if (bu) { webBlkUpload(bu, false); return; }
  const bg = e.target.closest("[data-blkgalup]"); if (bg) { webBlkUpload(bg, true); return; }
  const u = e.target.closest("[data-webupload]"); if (u) { webUpload(u); return; }
  const g = e.target.closest("[data-webgalup]"); if (g) { webUpload(g, { gallery: true }); }
});
// Sara: enviar con Enter (Shift+Enter = salto de línea).
document.addEventListener("keydown", (e) => { const el = e.target; if (el && el.id === "saraInput" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saraSend(); } });
// Reordenar galería con arrastrar-soltar.
document.addEventListener("dragstart", (e) => { const it = e.target.closest("[data-galitem]"); if (it) { WEB_DRAG = { key: it.getAttribute("data-galkey"), idx: +it.getAttribute("data-idx") }; it.classList.add("dragging"); } });
document.addEventListener("dragend", (e) => { const it = e.target.closest("[data-galitem]"); if (it) it.classList.remove("dragging"); });
document.addEventListener("dragover", (e) => { if (e.target.closest("[data-galitem]") && WEB_DRAG) e.preventDefault(); });
// Arrastrar turnos en el cuadrante. Mismo patrón que la galería, con una diferencia: aquí
// hay zonas de destino vacías (celdas día × área), así que se marcan al pasar por encima.
document.addEventListener("dragstart", (e) => { const c = e.target.closest("[data-horasig]"); if (c) { HOR.drag = c.getAttribute("data-horasig"); c.classList.add("dragging"); } });
document.addEventListener("dragend", horLimpiaDrag);
document.addEventListener("dragover", (e) => { const z = e.target.closest("[data-horcell]"); if (z && HOR.drag) { e.preventDefault(); z.classList.add("dropok"); } });
document.addEventListener("dragleave", (e) => { const z = e.target.closest("[data-horcell]"); if (z) z.classList.remove("dropok"); });
document.addEventListener("drop", (e) => { const z = e.target.closest("[data-horcell]"); if (z && HOR.drag) { e.preventDefault(); horSoltar(z); } });
document.addEventListener("drop", (e) => { const it = e.target.closest("[data-galitem]"); if (it && WEB_DRAG && it.getAttribute("data-galkey") === WEB_DRAG.key) { e.preventDefault(); webGalReorder(WEB_DRAG.key, WEB_DRAG.idx, +it.getAttribute("data-idx")); WEB_DRAG = null; } });

// ── Overlays: ⌘K, drawer, teclado ─────────────────────────────────────────────
(function wireOverlays() {
  const ovl = document.getElementById("ovl"); if (ovl) ovl.addEventListener("click", () => { closeCmd(); closeDrawer(); });
  const dc = document.getElementById("drawerClose"); if (dc) dc.addEventListener("click", closeDrawer);
  const cl = document.getElementById("cmdl"); if (cl) cl.addEventListener("click", (e) => { const r = e.target.closest("[data-cmd]"); if (r) runCmd(+r.getAttribute("data-cmd")); });
  const inp = document.getElementById("cmdin"); if (inp) inp.addEventListener("input", (e) => fillCmd(e.target.value));
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); const open = document.getElementById("cmdk").classList.contains("open"); open ? closeCmd() : openCmd(); return; }
    const open = document.getElementById("cmdk") && document.getElementById("cmdk").classList.contains("open");
    if (!open) return;
    if (e.key === "Escape") closeCmd();
    else if (e.key === "ArrowDown") { e.preventDefault(); cmdMove(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cmdMove(-1); }
    else if (e.key === "Enter") { e.preventDefault(); runCmd(CMD_SEL); }
  });
})();

// ── Arranque ─────────────────────────────────────────────────────────────────
// Entran todos los roles que tienen algún módulo. `trabajador` no tiene ninguno —no gestiona
// nada— y por eso no está: su sitio es /trabajadores.html, con su cuadrante y sus fichajes.
requireRole(["direccion", "encargado", "contabilidad", "marketing", "rrhh"]).then((user) => {
  if (!user) return;
  USER = user;
  // El establecimiento con el que se entra: el que se dejó puesto, o Blanes. Va antes de
  // pintar nada porque media pantalla depende de él.
  const amb = ambitoInicial();
  DASH_LOCAL = amb.local; SELECCION = amb.locales;
  // Si la URL trae pantalla, manda ella: es lo que permite recargar sin perder el sitio y
  // guardar un enlace directo. Si no, se abre por la primera a la que se tenga acceso —a
  // marketing el Dashboard le daría «Sin acceso» nada más entrar, y a RR.HH. también.
  const deUrl = vistaDeUrl();
  const inicio = (deUrl.vista && puedeVer(deUrl.vista) && deUrl.vista)
    || ["dashboard", "reservas", "rrhh", "facturas", "web", "clientes"].find((v) => puedeVer(v))
    || Object.keys(VIEWS).find((v) => puedeVer(v)) || "dashboard";
  if (inicio === "facturas" && deUrl.sub) FACTAB = deUrl.sub;
  go(inicio, { desdeUrl: !!deUrl.vista });

  // Cambiar el «#» a mano o con el botón de atrás también navega.
  window.addEventListener("hashchange", () => {
    const d = vistaDeUrl();
    if (!d.vista || !puedeVer(d.vista)) return;
    if (d.vista === "facturas" && d.sub) FACTAB = d.sub;
    if (d.vista !== CURRENT || d.vista === "facturas") go(d.vista, { desdeUrl: true });
  });
}).catch(() => { /* requireRole ya redirige a /login.html */ });
