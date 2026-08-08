"use strict";
/* Panel interno (cockpit) — datos REALES. Reutiliza login/sesión (auth.js): requireRole(),
   authFetch y el JWT de localStorage. Router simple con vistas in-app (Dashboard, Reservas)
   y enlaces de respaldo al panel clásico para lo aún no migrado. */

const nf = new Intl.NumberFormat("es-ES");
const num = (n) => nf.format(Number(n) || 0);
const dec1 = (n) => (Number(n) || 0).toFixed(1).replace(".", ",");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const todayStr = () => new Date().toISOString().slice(0, 10);
function addDaysStr(s, n) { const d = new Date(s + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fechaLarga(iso) { try { return cap(new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso + "T12:00:00"))); } catch { return iso; } }
function fechaCorta(iso) { try { return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso + "T12:00:00")); } catch { return iso; } }
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
  if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; throw new Error("noauth"); }
  const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error del servidor"); return j.data;
}
async function apiOptional(path) {
  try { const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } }); if (!r.ok) return null; const j = await r.json(); return j.ok ? j.data : null; } catch { return null; }
}
async function apiSend(method, path, body) {
  const opt = { method, headers: { Authorization: "Bearer " + token() } };
  if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; throw new Error("noauth"); }
  const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error del servidor"); return j;
}

const NAV = [
  { g: "Operación", items: [
    ["dashboard", "Dashboard", "dash", ["direccion", "encargado", "contabilidad"]],
    ["reservas", "Reservas", "cal", ["direccion", "encargado"]],
    ["comunicados", "Comunicados", "mega", ["direccion", "encargado"]],
    ["mantenimiento", "Mantenimiento", "wrench", ["direccion", "encargado"]],
    ["inventarios", "Inventarios", "box", ["direccion", "encargado"]],
    ["clientes", "Clientes", "users", ["direccion", "marketing"]],
  ] },
  { g: "Gestión", items: [
    ["rrhh", "RR. HH.", "idcard", ["direccion", "rrhh", "encargado"]],
    ["horarios", "Horarios", "cal", ["direccion", "rrhh", "encargado"]],
    ["fichajes", "Fichajes", "clock", ["direccion", "rrhh", "encargado", "contabilidad"]],
    ["facturas", "Facturas", "receipt", ["direccion", "contabilidad"]],
    ["web", "Web", "globe", ["direccion", "marketing"]],
    ["reviews", "Reseñas", "star", ["direccion", "encargado", "contabilidad", "marketing"]],
    ["campanas", "Campañas", "mkt", ["direccion", "marketing"]],
  ] },
  { g: "Inteligencia", items: [
    ["analitica", "Analítica de ventas", "chart", ["direccion", "contabilidad"]],
    ["sara", "Sara (IA)", "bot", ["direccion", "marketing"]],
    ["whatsapp", "WhatsApp", "chat", ["direccion", "encargado"]],
  ] },
  { g: "Sistema", items: [
    ["agora", "Ágora (TPV)", "plug", ["direccion"]],
    ["usuarios", "Usuarios", "cog", ["direccion"]],
  ] },
];
const TITLES = { dashboard: "Dashboard", reservas: "Reservas", comunicados: "Comunicados", mantenimiento: "Mantenimiento", inventarios: "Inventarios", clientes: "Clientes", reviews: "Reseñas", campanas: "Campañas", rrhh: "RR. HH.", horarios: "Horarios", fichajes: "Fichajes", facturas: "Facturas", analitica: "Analítica de ventas", sara: "Sara", agora: "Ágora (TPV)", whatsapp: "WhatsApp", usuarios: "Usuarios", web: "Web" };
const VIEW_ROLES = { dashboard: ["direccion", "encargado", "contabilidad"], reservas: ["direccion", "encargado"], comunicados: ["direccion", "encargado"], mantenimiento: ["direccion", "encargado"], inventarios: ["direccion", "encargado"], clientes: ["direccion", "marketing"], reviews: ["direccion", "encargado", "contabilidad", "marketing"], campanas: ["direccion", "marketing"], rrhh: ["direccion", "rrhh", "encargado"], horarios: ["direccion", "rrhh", "encargado"], fichajes: ["direccion", "rrhh", "encargado", "contabilidad"], facturas: ["direccion", "contabilidad"], analitica: ["direccion", "contabilidad"], sara: ["direccion", "marketing"], agora: ["direccion"], whatsapp: ["direccion", "encargado"], usuarios: ["direccion"], web: ["direccion", "marketing"] };
// Módulos cuyos datos varían por local (espejo de CATALOGO_MODULOS.porLocal del backend).
const MODULOS_POR_LOCAL = new Set(["dashboard", "reservas", "mantenimiento", "inventarios", "facturas", "reviews", "analitica", "rrhh", "horarios", "fichajes"]);
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
function localFijadoFE() { return (USER.rol !== "direccion" && USER.local) ? USER.local : null; }

let USER = null, CURRENT = "dashboard";

function setTheme(v) { const r = document.documentElement; if (v === "auto") { r.removeAttribute("data-theme"); localStorage.removeItem("panelTheme"); } else { r.setAttribute("data-theme", v); localStorage.setItem("panelTheme", v); } }
function isDark() { const r = document.documentElement; return r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches); }
function toggleTheme() { setTheme(isDark() ? "light" : "dark"); const b = document.getElementById("themeBtn"); if (b) b.innerHTML = ic(isDark() ? "moon" : "sun"); }
(function initTheme() { const t = localStorage.getItem("panelTheme"); if (t) document.documentElement.setAttribute("data-theme", t); })();

function shell(active, bodyHtml) {
  const uname = USER.nombre || USER.username || "Usuario";
  const initials = uname.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const nav = NAV.map((grp) => {
    const items = grp.items.filter(([id]) => puedeVer(id));
    if (!items.length) return "";
    return `<div class="ngt">${grp.g}</div>` + items.map(([id, label, icon]) => {
      const badge = (id === "dashboard" && DASH_CONCERNS > 0) ? `<span class="badge">${DASH_CONCERNS}</span>` : "";
      return `<button class="navi ${id === active ? "active" : ""}" data-view="${id}"><span class="ico">${ic(icon)}</span><span>${label}</span>${badge}</button>`;
    }).join("");
  }).join("");
  const estabLbl = DASH_LOCAL ? nombreCortoLocal(DASH_LOCAL) : "Todos los establecimientos";
  const customLbl = (PERIOD === "custom" && DASH_RANGE.from) ? `${esc(fechaCorta(DASH_RANGE.from))} – ${esc(fechaCorta(DASH_RANGE.to))}` : "Personalizado";
  const seg = [["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Semana"], ["mes", "Mes"]].map(([p, l]) => `<button class="${PERIOD === p ? "on" : ""}" data-act="period" data-p="${p}">${l}</button>`).join("") + `<button class="${PERIOD === "custom" ? "on" : ""}" data-act="period-custom" title="Rango personalizado (días o meses, incluso del año pasado)">${customLbl}</button>`;
  return `<div class="app${COLLAPSED ? " collapsed" : ""}" id="appEl">
    <aside class="sidebar">
      <div class="brand"><div class="logo">FA</div><div class="bt"><b>Familia del Amor</b><span>Sistema operativo interno</span></div></div>
      <nav class="nav">${nav}</nav>
      <div class="sbf"><div class="u"><span class="avatar">${esc(initials)}</span><div class="txt"><b>${esc(uname)}</b><span>${esc(cap(USER.rol || ""))} · acceso ${USER.rol === "direccion" ? "global" : "de módulo"}</span></div></div></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="iconbtn" data-act="mtoggle" aria-label="Menú">${ic("menu")}</button>
        <button class="pick" data-act="estabmenu" title="Cambiar establecimiento"><span class="dot"></span><span class="lbl">${esc(estabLbl)}</span><span class="car">▾</span></button>
        <div class="seg hidesm">${seg}</div>
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
function stat(lab, icon, val, unit, sub) {
  return `<div class="card stat"><div class="lab"><span class="ci">${icon}</span>${lab}</div>
    <div class="val tnum">${val}${unit ? ` <small>${unit}</small>` : ""}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}
async function refreshWaPill() {
  try { const r = await fetch("/api/whatsapp/status", { headers: { Authorization: "Bearer " + token() } }); const j = await r.json(); const p = document.getElementById("waPill"); if (!p) return; const ok = j && j.connected; p.innerHTML = `<span class="sdot ${ok ? "st-ok" : "st-crit"}"></span>${ok ? "Sara conectada" : "Sara caída"}`; } catch { /* opcional */ }
}

// ── Modal ligero ─────────────────────────────────────────────────────────────
function modal(title, bodyHtml) {
  const ov = document.createElement("div"); ov.className = "modal-ov";
  ov.innerHTML = `<div class="modal"><div class="modal-h"><b>${esc(title)}</b><button class="iconbtn" data-close aria-label="Cerrar">✕</button></div><div class="modal-b">${bodyHtml}</div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) ov.remove(); });
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
let DASH_LOCAL = "", COLLAPSED = false, PERIOD = "semana", DASH_CONCERNS = 0;
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
function deltaEl(v) { if (v == null || isNaN(v)) return ""; const up = v >= 0; return `<span class="delta ${Math.abs(v) < 0.5 ? "flat" : up ? "up" : "down"}">${up ? "↑" : "↓"} ${signed2(v)}</span>`; }
function kpi({ lab, icon, val, unit, delta }) {
  return `<div class="card stat"><div class="lab"><span class="ci">${ic(icon, 15)}</span>${lab}</div><div class="val tnum">${val}${unit ? ` <small>${unit}</small>` : ""}</div>${delta != null ? deltaEl(delta) : ""}</div>`;
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
// Gráfico de área SVG (línea + relleno). data = array de números.
function area(data, { h = 120 } = {}) {
  const vals = (data || []).map((v) => Number(v) || 0); const w = 640;
  if (vals.length < 2) return `<div class="mut" style="height:${h}px;display:grid;place-items:center;font-size:13px">Sin datos suficientes para el gráfico</div>`;
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0), rng = (max - min) || 1;
  const X = (i) => (i / (vals.length - 1)) * w, Y = (v) => h - 8 - ((v - min) / rng) * (h - 16);
  let d = ""; vals.forEach((v, i) => { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) + " "; });
  const gid = "g" + Math.abs(vals.reduce((s, v, i) => s + v * (i + 1), 7) | 0) % 100000;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" style="display:block"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".22"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs><path d="${d}L ${w} ${h} L 0 ${h} Z" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="var(--brand)" stroke-width="2" vector-effect="non-scaling-stroke"/><circle class="ep" cx="${X(vals.length - 1).toFixed(1)}" cy="${Y(vals[vals.length - 1]).toFixed(1)}" r="3.5"/></svg>`;
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
  NAV.forEach((grp) => grp.items.forEach(([id, label, icon]) => { if (puedeVer(id)) items.push({ t: label, g: "Ir a", icon, view: id }); }));
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
  CMD_ITEMS = allCmd().filter((c) => !q || c.t.toLowerCase().includes(q) || c.g.toLowerCase().includes(q)); CMD_SEL = 0;
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
  const elegibles = MODULOS_SOLO_PUBLICO.has(CURRENT) ? LOCALES.filter((l) => !sinPublico(l)) : LOCALES;
  const opts = [["", "Todos los establecimientos"]].concat(elegibles.map((l) => [l, l]));
  openDrawer("Establecimiento", `<div class="rows">${opts.map(([v, l]) => `<button class="row" data-act="estab-pick" data-local="${esc(v)}" style="width:100%;text-align:left"><span class="sdot ${DASH_LOCAL === v ? "st-ok" : "st-off"}"></span><div class="grow"><div class="t1">${esc(l)}</div></div>${DASH_LOCAL === v ? '<span class="pill brand">Actual</span>' : ""}</button>`).join("")}</div>`);
}

// ════════════════════════ VISTA: DASHBOARD (ejecutivo) ════════════════════════
function renderDashboard(d) {
  const localName = d.scope && d.scope.local;
  DASH_CONCERNS = (d.preocupaciones || []).length;
  // ── Cabecera ejecutiva ──
  const header = `<div class="ph"><div><div class="eyebrow">${saludoHora()}${USER.nombre ? ", " + esc(nombreCorto(USER.nombre)) : ""}</div><h1>Dashboard ejecutivo</h1><div class="sub">${localName ? "Estado de <b>" + esc(localName) + "</b>" : "El estado de todo el grupo, de un vistazo."} · ${fechaLarga(d.fecha)}</div></div><div class="acts"><button class="btn" data-act="cmdk">${ic("search", 15)} Acción rápida</button></div></div>`;
  // ── Sara: veredicto del día ──
  const contexto = [d.ayer && d.ayer.disponible ? d.ayer.texto : "", d.hoy && d.hoy.disponible ? d.hoy.texto : ""].filter(Boolean).join(" ");
  const sara = `<div class="card hero" style="margin-bottom:16px"><div style="display:flex;gap:13px;align-items:flex-start"><span class="avatar" style="width:40px;height:40px;border-radius:12px">S</span><div style="flex:1;min-width:0"><b style="font-size:14px">Sara · dirección de operaciones</b><p style="font-size:18px;line-height:1.5;margin:8px 0 0;font-weight:500;letter-spacing:-.01em">${d.titular || contexto || "Sin datos suficientes para hoy."}</p>${contexto ? `<p class="mut" style="font-size:13px;margin:10px 0 0;line-height:1.6">${contexto}</p>` : ""}</div></div></div>`;
  // ── 4 KPIs reales ──
  const hoyN = (d.hoy && d.hoy.hoy) || {};
  const nCrit = (d.preocupaciones || []).filter((c) => c.tipo === "mantenimiento" && c.sev === "crit").length;
  const kpis = `<div class="grid g4">${kpi({ lab: "Reservas hoy", icon: "cal", val: num(hoyN.n || 0), delta: d.ayer && d.ayer.delta })}${kpi({ lab: "Comensales hoy", icon: "users", val: num(hoyN.personas || 0) })}${kpi({ lab: "Mantenim. abierto", icon: "wrench", val: num((d.mantenimiento && d.mantenimiento.abiertas) || 0), unit: nCrit ? `· ${nCrit} crítica${nCrit === 1 ? "" : "s"}` : "" })}${kpi({ lab: "Por pagar", icon: "euro", val: eur((d.dinero && d.dinero.porPagar && d.dinero.porPagar.total) || 0) })}</div>`;

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
  const stat3 = (lab, val, col) => `<div style="min-width:0"><div class="mut" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em">${lab}</div><div class="big tnum" style="font-size:22px${col ? ";color:" + col : ""}">${val}</div></div>`;
  const ventasBox = (vOk || gOk)
    ? `<div style="display:flex;gap:18px;flex-wrap:wrap;justify-content:flex-end;text-align:right">${stat3("Ventas", vOk ? eur(per.ventas.total) : "—")}${stat3("Gastos", gOk ? eur(per.gastos.total) : "—")}${stat3("Resultado", res != null ? eur(res) : "—", resCol)}</div>`
    : `<div class="mut" style="font-size:12px;text-align:right;line-height:1.5">Ventas y resultado<br><span class="hl">${DASH_RANGE.to === todayStr() && DASH_RANGE.from === todayStr() ? "aún sin cierre de hoy" : "al conectar Ágora"}</span></div>`;
  const grafico = serieVals.length >= 2 ? area(serieVals, { h: 120 }) : `<div class="mut" style="font-size:12.5px;padding:14px 0">${totalPeriodo ? "Rango de un día — sin serie para graficar." : "Sin reservas en este periodo."}</div>`;
  const notaRes = (vOk || gOk) ? `<div class="mut" style="font-size:11px;margin-top:8px">Resultado = ventas${per.hoyEnVivo ? " (incluye hoy)" : ""} − gastos en facturas del periodo (no incluye personal).</div>` : "";
  const actividad = `<div class="card c8"><div class="ch"><h3>Actividad · reservas y resultado</h3><span class="pill" style="text-transform:capitalize">${esc(winLbl)}</span></div><div class="between" style="align-items:flex-end;margin-bottom:8px"><div><div class="big tnum">${num(totalPeriodo)}</div><div class="mut" style="font-size:12.5px">reservas${per && per.reservas && per.reservas.personas ? " · " + num(per.reservas.personas) + " comensales" : ""}</div></div>${ventasBox}</div>${grafico}${notaRes}</div>`;

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
  const lq = DASH_LOCAL ? "&local=" + encodeURIComponent(DASH_LOCAL) : "";
  try {
    const [d, per] = await Promise.all([
      api("/api/dashboard" + (DASH_LOCAL ? "?local=" + encodeURIComponent(DASH_LOCAL) : "")),
      apiOptional(`/api/dashboard/periodo?from=${DASH_RANGE.from}&to=${DASH_RANGE.to}${lq}`),
    ]);
    DASH_PERIODO = per || null;
    view.innerHTML = renderDashboard(d);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
// Rango personalizado (días o meses, incluso del año pasado).
function openPeriodoCustom() {
  const hoy = todayStr();
  const f0 = DASH_RANGE.from || addDaysStr(hoy, -30), t0 = DASH_RANGE.to || hoy;
  const ov = modal("Rango personalizado", `<div class="form-grid">
    <div class="field"><label>Desde</label><input type="date" id="pcFrom" value="${esc(f0)}" max="${esc(hoy)}"></div>
    <div class="field"><label>Hasta</label><input type="date" id="pcTo" value="${esc(t0)}" max="${esc(hoy)}"></div>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" data-pcq="mes-pasado">Mes pasado</button><button class="btn sm" data-pcq="este-ano">Este año</button><button class="btn sm" data-pcq="ano-pasado">Año pasado</button><button class="btn sm" data-pcq="ultimo-ano">Últimos 12 meses</button></div>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="pcAplicar">Aplicar</button></div>`);
  const setRange = (from, to) => { ov.querySelector("#pcFrom").value = from; ov.querySelector("#pcTo").value = to; };
  ov.addEventListener("click", (e) => {
    const q = e.target.getAttribute && e.target.getAttribute("data-pcq"); if (!q) return;
    const y = Number(hoy.slice(0, 4)), m = hoy.slice(5, 7);
    if (q === "mes-pasado") { const d = new Date(hoy + "T12:00:00"); d.setDate(1); d.setMonth(d.getMonth() - 1); const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0); setRange(d.toISOString().slice(0, 10), fin.toISOString().slice(0, 10)); }
    else if (q === "este-ano") setRange(y + "-01-01", hoy);
    else if (q === "ano-pasado") setRange((y - 1) + "-01-01", (y - 1) + "-12-31");
    else if (q === "ultimo-ano") setRange(addDaysStr(hoy, -364), hoy);
  });
  ov.querySelector("#pcAplicar").addEventListener("click", () => {
    const from = ov.querySelector("#pcFrom").value, to = ov.querySelector("#pcTo").value;
    if (!from || !to) { toast("Elige las dos fechas"); return; }
    if (from > to) { toast("El 'desde' debe ser anterior al 'hasta'"); return; }
    PERIOD = "custom"; DASH_RANGE = { from, to, label: from === to ? fechaCorta(from) : `${fechaCorta(from)} – ${fechaCorta(to)}` };
    ov.remove(); loadDashboard();
  });
}

// ════════════════════════ VISTA: RESERVAS ════════════════════════
let RESF = { local: "", from: "", to: "", vista: "dia", foco: "" };
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
  const seg = ["dia:Día", "semana:Semana", "lista:Lista"].map((p) => { const [v, t] = p.split(":"); return `<button class="btn ${RESF.vista === v ? "primary" : ""}" data-act="res-vista" data-vista="${v}">${t}</button>`; }).join("");
  // Sin filtro de local: el ámbito lo marca el selector de establecimiento de la barra superior.
  const toolbar = `<div class="toolbar"><div class="toolbar" style="margin:0;gap:6px">${seg}</div><div style="display:flex;gap:10px;margin-left:auto"><button class="btn" data-act="csv">Exportar CSV</button><button class="btn primary" data-act="nueva">+ Nueva reserva</button></div></div>`;
  const cuerpo = RESF.vista === "lista" ? renderResLista(list) : RESF.vista === "semana" ? renderResSemana(list) : renderResDia(list);
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
    ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Día</th><th>Hora</th><th>Local</th><th class="r">Pers.</th><th>Nombre</th><th>Teléfono</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(fechaCorta(r.dia))}</td><td class="tnum">${esc(r.hora)}</td><td>${esc(r.local)}</td><td class="r tnum">${esc(r.personas)}</td><td>${esc(r.nombre_reserva)}</td><td class="mut">${esc(r.telefono)}</td><td class="r"><button class="linkbtn" data-act="cancel" data-id="${r.id}" data-nombre="${esc(r.nombre_reserva)}">Cancelar</button></td></tr>`).join("")}</tbody></table></div></div>`
    : `<div class="card"><div class="mut" style="padding:8px">No hay reservas en ese rango. Prueba a ampliar las fechas o crea una nueva.</div></div>`;
}
// Rango [from,to] según la vista activa.
function resRango() {
  if (RESF.vista === "dia") return [RESF.foco, RESF.foco];
  if (RESF.vista === "semana") { const l = resLunes(RESF.foco); return [l, addDaysStr(l, 6)]; }
  if (!RESF.from) { RESF.from = todayStr(); RESF.to = addDaysStr(todayStr(), 30); }
  return [RESF.from, RESF.to];
}
// El ámbito de local lo manda el selector de establecimiento de la barra superior; el local
// fijado del usuario (encargado) gana siempre.
function resScope() { RESF.local = localFijadoFE() || DASH_LOCAL || ""; return RESF.local; }
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
    const qs = new URLSearchParams(); qs.set("from", from); qs.set("to", to); if (RESF.local) qs.set("local", RESF.local);
    const data = await api("/api/reservas?" + qs.toString());
    view.innerHTML = renderReservas(data);
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
function mantScope() { MANF.local = localFijadoFE() || DASH_LOCAL || ""; return MANF.local; }
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
        if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; return; }
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
async function loadInventario() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const locales = await api("/api/inventario/locales");
    if ((locales || []).length === 1) { INV.local = locales[0]; return loadInvProveedores(); }
    view.innerHTML = renderInvLocales(locales || []);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function renderInvLocales(locales) {
  const cards = locales.length ? `<div class="grid g2">${locales.map((l) => `<button class="card" data-act="inv-local" data-local="${esc(l)}" style="text-align:left;cursor:pointer;padding:18px"><div style="font-weight:600;font-size:16px">${esc(l)}</div><div class="mut" style="margin-top:4px">Ver proveedores ›</div></button>`).join("")}</div>`
    : `<div class="card"><div class="mut" style="padding:8px">No tienes locales asignados.</div></div>`;
  return `${invHeader("Inventarios", "Elige un establecimiento")}${cards}`;
}
function invPickLocal(local) { INV.local = local; loadInvProveedores(); }
async function loadInvProveedores() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const data = await api("/api/inventario/proveedores?local=" + encodeURIComponent(INV.local));
    view.innerHTML = renderInvProveedores(data || []);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function renderInvProveedores(list) {
  const multi = !localFijadoFE(); // dirección puede volver a elegir local
  const back = multi ? { act: "inv-volver-locales", label: "Locales" } : null;
  const toolbar = `<div class="toolbar"><div class="mut" style="flex:1;font-size:13px">Local: <b>${esc(INV.local)}</b></div><button class="btn" data-act="inv-pedidos">Pedidos</button><button class="btn primary" data-act="inv-nuevo-prov">+ Proveedor</button></div>`;
  const cards = list.length ? `<div class="grid g2">${list.map((p) => {
    const ultimo = p.ultimo_inventario ? fechaCorta(String(p.ultimo_inventario).slice(0, 10)) : "—";
    const estado = Number(p.en_curso) > 0 ? '<span class="pill warn">Inventario en curso</span>' : '<span class="pill ok">Al día</span>';
    return `<div class="card" style="padding:16px"><div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><div><div style="font-weight:600;font-size:16px">${esc(p.nombre)}</div><div class="mut" style="font-size:13px;margin-top:3px">${num(p.n_productos)} producto(s) · último: ${esc(ultimo)}</div><div style="margin-top:8px">${estado}</div></div></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn primary" data-act="inv-contar" data-id="${p.id}" data-nombre="${esc(p.nombre)}" style="flex:1">Contar</button><button class="btn" data-act="inv-config" data-id="${p.id}" data-nombre="${esc(p.nombre)}">Configurar</button></div></div>`;
  }).join("")}</div>` : `<div class="card"><div class="mut" style="padding:8px">No hay proveedores en este local. Crea el primero con «+ Proveedor».</div></div>`;
  return `${invHeader("Proveedores", "Elige un proveedor para inventariar", back)}${toolbar}${cards}`;
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
    const col = r.sugerido > 0 ? "color:var(--brand);font-weight:700" : "color:var(--mut)";
    return `<tr><td>${esc(r.nombre)}</td><td class="r tnum">${num(r.contado)}</td><td class="r tnum">${num(r.necesario)}</td><td class="r tnum">${num(r.diferencia)}</td><td class="r tnum" style="${col}">${r.sugerido > 0 ? num(r.sugerido) + " " + esc(r.unidad || "") : "—"}</td></tr>`;
  }).join("");
  const tabla = rev.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Producto</th><th class="r">Contado</th><th class="r">Necesario</th><th class="r">Dif.</th><th class="r">A pedir</th></tr></thead><tbody>${filas}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin productos.</div></div>`;
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
async function apiRaw(path) { const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } }); if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; throw new Error("noauth"); } const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error"); return j; }
function cliQS() { const qs = new URLSearchParams(); if (CLIF.q) qs.set("q", CLIF.q); if (CLIF.poblacion) qs.set("poblacion", CLIF.poblacion); if (CLIF.local) qs.set("local", CLIF.local); if (CLIF.cumple) qs.set("cumple_mes", "1"); if (CLIF.con_email) qs.set("con_email", "1"); if (CLIF.con_telefono) qs.set("con_telefono", "1"); if (CLIF.excluir_baja) qs.set("excluir_baja", "1"); return qs.toString(); }
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
  return `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Población</th><th>Cumpleaños</th><th>Origen</th><th>Última visita</th><th></th></tr></thead><tbody>${rows.map((c) => {
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
    if (!CLI_POBLACIONES.length) { try { CLI_POBLACIONES = (await apiRaw("/api/contactos/poblaciones")).data || []; } catch { /* opcional */ } }
    const j = await apiRaw("/api/contactos" + (cliQS() ? "?" + cliQS() : "")); view.innerHTML = renderClientes(j);
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
function filtrosClienteBody() { const b = {}; if (CLIF.q) b.q = CLIF.q; if (CLIF.poblacion) b.poblacion = CLIF.poblacion; if (CLIF.local) b.local = CLIF.local; if (CLIF.cumple) b.cumple_mes = String(new Date().getMonth() + 1); if (CLIF.con_email) b.con_email = 1; if (CLIF.con_telefono) b.con_telefono = 1; return b; }
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

// ════════════════════════ VISTA: RESEÑAS (por local · responder · IA · masivas) ════════════════════════
let REVF = { rating: "", local: "", estado: "", q: "", autor: "", from: "", to: "", sort: "recientes" };
let REV_DATA = [], REV_LOCALES = [], REV_SEL = new Set(), REV_STATUS = null;
let REV_CONT = { total: 0, pendientes: 0, respondidas: 0 }, REV_RESUMEN = [], REV_OFFSET = 0, REV_HASMORE = false;

function renderReviews() {
  const rows = REV_DATA;
  const puedeActualizar = USER.rol === "direccion" || USER.rol === "marketing";
  const st = REV_STATUS;
  const fuenteTxt = (s) => s === "places" ? "Places" : s === "business_profile" ? "Business Profile" : (!s || s === "none") ? "Ninguna" : esc(s);
  const estadoBanner = st ? `<div class="card" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="pill ${st.reviews_count > 0 ? "ok" : st.connected ? "warn" : "bad"}">${st.connected ? "OAuth conectado" : "Sin conectar"}</span><div class="grow" style="min-width:0"><div class="t1">${esc(st.mensaje || "")}</div><div class="t2">Fuente: ${fuenteTxt(st.source)} · ${num(st.reviews_count || 0)} reseñas${st.last_fetch ? ` · última sync ${esc(String(st.last_fetch).slice(0, 16).replace("T", " "))}` : ""}${st.last_attempt ? ` · último intento ${esc(String(st.last_attempt).slice(0, 16).replace("T", " "))}` : ""}${st.last_error ? ` · último error: ${esc(String(st.last_error).slice(0, 80))}` : ""}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">${USER.rol === "direccion" ? '<button class="btn" data-act="rev-vincular">Vincular fichas de Google</button>' : ""}${puedeActualizar ? '<button class="btn primary" data-act="rev-refresh">Actualizar desde Google</button>' : ""}</div></div>` : "";
  const cont = `<div class="grid g3" style="margin-bottom:14px">${stat("Total reseñas", "star", num(REV_CONT.total))}${stat("Pendientes", "bell", num(REV_CONT.pendientes))}${stat("Respondidas", "chat", num(REV_CONT.respondidas))}</div>`;
  const chip = (val, label, on) => `<button class="chip ${on ? "on" : ""}" data-act="rev-local" data-local="${esc(val)}">${esc(label)}</button>`;
  const selector = REV_LOCALES.length > 1 ? `<div class="chips">${chip("", "Todos", !REVF.local)}${REV_LOCALES.map((l) => chip(l, nombreCortoLocal(l), REVF.local === l)).join("")}</div>` : "";
  const resumenChips = (REV_RESUMEN && REV_RESUMEN.length > 1) ? `<div class="chips" style="margin:6px 0 2px">${REV_RESUMEN.map((x) => `<span class="chip" style="cursor:default">${esc(nombreCortoLocal(x.local))} · ${x.media != null ? x.media + "★" : "—"} · ${x.pendientes} pend</span>`).join("")}</div>` : "";
  const estadoOpts = [["", "Todas"], ["pendientes", "Sin responder"], ["respondidas", "Respondidas"]].map(([v, t]) => `<option value="${v}" ${REVF.estado === v ? "selected" : ""}>${t}</option>`).join("");
  const ratingOpts = ['<option value="">Todas</option>'].concat([5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${REVF.rating === String(n) ? "selected" : ""}>${n}★</option>`)).join("");
  const sortOpts = [["recientes", "Más recientes"], ["antiguas", "Más antiguas"], ["mejor", "Mejor valoración"], ["peor", "Peor valoración"]].map(([v, t]) => `<option value="${v}" ${REVF.sort === v ? "selected" : ""}>${t}</option>`).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Estado</label><select id="rEstado">${estadoOpts}</select></div><div class="field"><label>Estrellas</label><select id="rRating">${ratingOpts}</select></div><div class="field"><label>Ordenar</label><select id="rSort">${sortOpts}</select></div><div class="field"><label>Buscar</label><input id="rQ" value="${esc(REVF.q)}" placeholder="Texto o autor…"></div><div class="field"><label>Autor</label><input id="rAutor" value="${esc(REVF.autor)}"></div><div class="field"><label>Desde</label><input type="date" id="rFrom" value="${esc(REVF.from)}"></div><div class="field"><label>Hasta</label><input type="date" id="rTo" value="${esc(REVF.to)}"></div><button class="btn" data-act="rev-filtrar">Filtrar</button></div>`;
  const nota = `<div class="pendingblock" style="margin-bottom:16px"><b>Responder en Google, muy pronto.</b> La publicación directa está pendiente de que Google apruebe la cuota de su API. Mientras tanto: redacta la respuesta (con IA si quieres), <b>guárdala</b> aquí y usa <b>Copiar</b> para pegarla en Google.</div>`;
  const bulk = REV_SEL.size ? `<div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><b>${REV_SEL.size} seleccionada${REV_SEL.size === 1 ? "" : "s"}</b><div style="flex:1"></div><button class="btn" data-act="rev-sel-none">Quitar selección</button><button class="btn primary" data-act="rev-bulk">✨ Generar borradores IA</button></div>` : "";
  const body = rows.length ? rows.map(reviewCard).join("") : `<div class="card"><div class="mut" style="padding:8px">${REV_CONT.total ? "Sin reseñas con este filtro." : "Aún no hay reseñas importadas. Pulsa «Actualizar desde Google»."}</div></div>`;
  const masBtn = REV_HASMORE ? `<div style="text-align:center;margin-top:6px"><button class="btn" data-act="rev-more">Cargar más (${num(REV_DATA.length)}/${num(REV_CONT.total)})</button></div>` : "";
  return `<div class="ph"><div class="eyebrow">Reputación</div><h1>Reseñas de Google</h1><div class="sub">Bandeja de gestión · filtra, ordena y responde</div></div>${estadoBanner}${cont}${nota}${selector}${resumenChips}${toolbar}${bulk}${body}${masBtn}`;
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

async function loadReviews(append = false) {
  const view = document.getElementById("view"); if (!append) view.innerHTML = skeleton();
  try {
    const qs = new URLSearchParams();
    ["local", "rating", "estado", "q", "autor", "from", "to", "sort"].forEach((k) => { if (REVF[k]) qs.set(k, REVF[k]); });
    qs.set("limit", "50"); qs.set("offset", String(append ? REV_OFFSET : 0));
    const promStatus = append ? Promise.resolve(REV_STATUS) : fetch("/api/google/status").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [j, status] = await Promise.all([apiSend("GET", "/api/reviews/manage?" + qs.toString()), promStatus]);
    const data = j.data || [];
    if (append) { REV_DATA = REV_DATA.concat(data); REV_OFFSET += data.length; }
    else { REV_DATA = data; REV_OFFSET = data.length; REV_SEL.clear(); }
    REV_LOCALES = j.locales || REV_LOCALES; REV_CONT = j.contadores || REV_CONT; REV_RESUMEN = j.resumen || []; REV_HASMORE = !!j.hasMore; REV_STATUS = status || REV_STATUS;
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
function revSetLocal(l) { REVF.local = l || ""; loadReviews(); }
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
let RRTAB = "candidaturas", RRF = { estado: "", q: "" };
const CAND_EST = { nuevo: "info", revisando: "imp", contratada: "ok", descartada: "bad" };
const RR_TIPOS = { nota: { ic: "📝", lab: "Nota" }, llamada: { ic: "📞", lab: "Llamada" }, incidencia: { ic: "⚠️", lab: "Incidencia" }, consulta: { ic: "💬", lab: "Consulta" } };
const RR_TIPO_COL = { nota: "var(--border2)", llamada: "var(--brand)", incidencia: "var(--danger)", consulta: "var(--info)" };
const RR_VAC_TIPOS = ["Jornada completa", "Jornada parcial", "Fines de semana", "Temporal"];
function rrMesActual() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function rrAutor() { return (USER && (USER.nombre || USER.username || USER.rol)) || "panel"; }
let RRSEG = { workers: [], llamadas: [], preguntas: [], sel: null, notas: [], ficha: null, resumen: [], mes: rrMesActual() };
let RRPREG = { mes: rrMesActual(), preguntas: [] };
function rrParseResp(v) { if (!v) return []; if (Array.isArray(v)) return v; try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
// Pestañas visibles por rol: el encargado solo ve el Seguimiento de su equipo (candidaturas,
// vacantes y preguntas son centrales de RRHH/dirección).
function rrTabsPermitidas() {
  // «Pulso» no está para el encargado: la pregunta 2 va sobre él, y en un local pequeño
  // ver la media de su equipo es leer las respuestas de su gente. El filtro de abajo ya
  // lo deja solo con «Seguimiento», así que basta con no añadírsela.
  const T = [["candidaturas", "Candidaturas"], ["seguimiento", "Seguimiento"], ["pulso", "Pulso del equipo"], ["vacantes", "Vacantes"], ["preguntas", "Preguntas del mes"]];
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
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Candidato</th><th>Puesto</th><th>Población</th><th>Estado</th><th>Fecha</th><th>CV</th><th>Mover a</th></tr></thead><tbody>${rows.map((c) => `<tr><td>${esc(c.nombre)}<div class="t2">${esc(c.telefono || "")}</div></td><td>${esc(c.puesto || "")}</td><td>${esc(c.poblacion || "")}</td><td><span class="pill ${CAND_EST[c.estado] || ""}">${esc(cap(c.estado || "nuevo"))}</span></td><td class="mut">${esc((c.creado_en || "").slice(0, 10))}</td><td>${c.cv_url ? `<a class="btn" href="${esc(c.cv_url)}" target="_blank" rel="noopener">Ver ↗</a>` : '<span class="mut">—</span>'}</td><td class="r" style="white-space:nowrap">${["revisando", "contratada", "descartada"].filter((e) => e !== c.estado).map((e) => e === "contratada" ? `<button class="linkbtn" style="color:var(--brand)" data-act="cand-contratar" data-id="${c.id}" data-nombre="${esc(c.nombre)}">Contratar</button>` : `<button class="linkbtn" style="color:var(--brand)" data-act="cand-estado" data-id="${c.id}" data-estado="${e}">${cap(e)}</button>`).join(" · ")}</td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin candidaturas con esos filtros.</div></div>`;
  return rrPh("Candidaturas y equipo") + rrTabs() + toolbar + table;
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
  return `<div class="card"><div class="ch"><h3>PIN de fichaje</h3>
      <button class="btn sm" data-act="rr-pin" data-id="${RRSEG.sel.id}">${p.tiene ? "Cambiar PIN" : "Asignar PIN"}</button></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${estado}
      ${bloqueado ? '<span class="pill bad">bloqueado por intentos fallidos</span>' : ""}</div></div>`;
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
      if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; return; }
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
  return rrPh("Seguimiento mensual del equipo · " + RRSEG.mes) + rrTabs() + renderRRResumen() + `<div class="rrgrid">${renderRRSegSidebar()}<div id="rrFicha">${renderRRFicha()}</div></div>`;
}
// ── Vacantes ──
function renderRRVac(rows) {
  rows = rows || [];
  const locOpts = LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const tipoOpts = RR_VAC_TIPOS.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  const form = `<div class="card"><div class="ch"><h3>Nueva vacante</h3></div><div class="toolbar"><div class="field"><label>Título</label><input id="vacTitulo" placeholder="Camarero/a…"></div><div class="field"><label>Local</label><select id="vacLocal">${locOpts}</select></div><div class="field"><label>Tipo</label><select id="vacTipo">${tipoOpts}</select></div></div><div class="field" style="width:100%"><label>Descripción</label><textarea id="vacDesc" rows="2" placeholder="Requisitos, horario…"></textarea></div><button class="btn primary" data-act="rr-vac-add">Publicar vacante</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Título</th><th>Local</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map((v) => `<tr><td>${esc(v.titulo || "")}</td><td>${esc(v.local || "")}</td><td class="mut">${esc(v.tipo || "")}</td><td><span class="pill ${v.activo ? "ok" : "bad"}">${v.activo ? "Abierta" : "Cerrada"}</span></td><td class="r"><button class="linkbtn" style="color:var(--brand)" data-act="rr-vac-toggle" data-id="${v.id}" data-activo="${v.activo ? 1 : 0}">${v.activo ? "Cerrar" : "Reabrir"}</button></td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin vacantes creadas.</div></div>`;
  return rrPh("Vacantes activas del grupo") + rrTabs() + form + table;
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
    if (RRTAB === "candidaturas") {
      const qs = new URLSearchParams(); if (RRF.estado) qs.set("estado", RRF.estado); if (RRF.q) qs.set("q", RRF.q);
      view.innerHTML = renderRRCand(await api("/api/hr/applications" + (qs.toString() ? "?" + qs : "")));
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
    } else if (RRTAB === "vacantes") {
      view.innerHTML = renderRRVac(await api("/api/hr/jobs/admin"));
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
  const ov = modal("Añadir trabajador", `<form id="fWorker" class="grid" style="gap:12px"><div class="field"><label>Nombre</label><input name="nombre" required></div><div class="field"><label>Usuario</label><input name="username" required placeholder="nombre.local"></div>${localField}${rolField}<div class="field"><label>Contraseña</label><input name="password" required value="tapeta2024"></div><button class="btn primary" type="submit">Crear</button></form>`);
  ov.querySelector("#fWorker").addEventListener("submit", async (e) => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries());
    try { await apiSend("POST", "/api/rrhh/trabajador", data); ov.remove(); toast("Trabajador creado ✅"); loadRRHH(); } catch (err) { toast("Error: " + err.message); }
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
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Local</th><th>Módulos con acceso</th><th></th></tr></thead><tbody>${rows.map((u) => {
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
  const nota = dir ? "Dirección tiene acceso total; no se puede restringir." : "Desmarca los módulos a los que NO quieres que entre este usuario.";
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px">${items}</div><div class="mut" style="margin-top:8px">${nota}</div>`;
}
function localOptionsHtml(sel) {
  return ['<option value="">— sin local (todos) —</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${l === sel ? "selected" : ""}>${esc(l)}</option>`)).join("");
}
// Cablea el rerender de módulos al cambiar el rol dentro de un modal de usuario.
function wireUserModal(ov) {
  const rolSel = ov.querySelector("select[name=rol]");
  const box = ov.querySelector("#modsBox");
  if (rolSel && box) rolSel.addEventListener("change", () => { box.innerHTML = modsCheckboxesHtml(rolSel.value, new Set(modulosDeRolFE(rolSel.value))); });
}
function modsSeleccionados(ov) { return Array.from(ov.querySelectorAll("input[name=mod]:checked")).map((c) => c.value); }

function openNuevoUsuario() {
  const rol0 = "encargado";
  const body = `<form id="fUser"><div class="form-grid"><div class="field"><label>Usuario</label><input name="username" required></div><div class="field"><label>Nombre</label><input name="nombre"></div><div class="field"><label>Contraseña</label><input name="password" type="text" required></div><div class="field"><label>Rol</label><select name="rol">${ROLES_USUARIO.map((r) => `<option value="${r}" ${r === rol0 ? "selected" : ""}>${r}</option>`).join("")}</select></div><div class="field full"><label>Local</label><select name="local">${localOptionsHtml("")}</select></div></div><div class="field full" style="margin-top:6px"><label>Módulos con acceso</label><div id="modsBox">${modsCheckboxesHtml(rol0, new Set(modulosDeRolFE(rol0)))}</div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Crear usuario</button></div></form>`;
  const ov = modal("Nuevo usuario", body);
  wireUserModal(ov);
  ov.querySelector("#fUser").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const data = { username: f.username.value.trim(), nombre: f.nombre.value.trim(), password: f.password.value, rol: f.rol.value, local: f.local.value, modulos: modsSeleccionados(ov) };
    try { await apiSend("POST", "/api/users", data); ov.remove(); toast("Usuario creado ✅"); loadUsuarios(); } catch (err) { toast("Error: " + err.message); }
  });
}
function openEditarUsuario(id) {
  const u = USERS.find((x) => String(x.id) === String(id)); if (!u) return;
  const sel = new Set(Array.isArray(u.modulos) ? u.modulos : []);
  const body = `<form id="fUserE"><div class="form-grid"><div class="field"><label>Usuario</label><input value="${esc(u.username)}" disabled></div><div class="field"><label>Nombre</label><input name="nombre" value="${esc(u.nombre || "")}"></div><div class="field"><label>Rol</label><select name="rol">${ROLES_USUARIO.map((r) => `<option value="${r}" ${r === u.rol ? "selected" : ""}>${r}</option>`).join("")}</select></div><div class="field"><label>Local</label><select name="local">${localOptionsHtml(u.local || "")}</select></div></div><div class="field full" style="margin-top:6px"><label>Módulos con acceso</label><div id="modsBox">${modsCheckboxesHtml(u.rol, sel)}</div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Guardar cambios</button></div></form>`;
  const ov = modal(`Editar ${u.username}`, body);
  wireUserModal(ov);
  ov.querySelector("#fUserE").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const data = { nombre: f.nombre.value.trim(), rol: f.rol.value, local: f.local.value, modulos: modsSeleccionados(ov) };
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
function horScope() { HOR.local = localFijadoFE() || DASH_LOCAL || ""; return HOR.local; }
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
function horFranja(ini, fin, abierto) {
  const h = (m) => { const b = ((Math.round(m) % 1440) + 1440) % 1440, hh = Math.floor(b / 60), mm = b % 60; return mm ? `${hh}:${String(mm).padStart(2, "0")}` : String(hh); };
  return `${h(ini)}-${abierto ? "cierre" : h(fin)}`;
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

// ── Rejilla por área (la del papel) ──
function horRejilla() {
  const dias = HOR.dias, hoy = todayStr();
  const cab = `<div class="horcell horhead"></div>` + dias.map((dia, i) =>
    `<div class="horcell horhead ${dia === hoy ? "hoy" : ""}"><div class="dwd">${WD[i]}</div><div class="dnum">${Number(dia.slice(-2))}</div></div>`
  ).join("");

  const bloques = (HOR.tramos || []).map((tramo) => {
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
  return bloques + fuera;
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
  return `<details class="card fold" style="margin-bottom:14px" ${j.bloquean.length ? "open" : ""}>
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
let HORCFG = { tab: "necesidades", data: null };

async function horConfig() {
  const ov = modal("Configuración de " + nombreCortoLocal(HOR.local), '<p class="mut">Cargando…</p>');
  ov.querySelector(".modal").style.maxWidth = "820px";
  const pintar = async () => {
    try { HORCFG.data = await apiRaw(`/api/horarios/plantilla?local=${encodeURIComponent(HOR.local)}`); }
    catch (e) { ov.querySelector(".modal-b").innerHTML = `<p class="mut">${esc(e.message)}</p>`; return; }
    const d = HORCFG.data;
    ov.querySelector(".modal-b").innerHTML = `
      <div class="toolbar" style="margin-bottom:14px">
        ${[["necesidades", "Cuánta gente hace falta"], ["contratos", "Contratos"], ["ausencias", "Vacaciones y bajas"], ["disp", "Disponibilidad"]]
          .map(([k, t]) => `<button class="btn ${HORCFG.tab === k ? "primary" : ""}" data-horcfgtab="${k}">${t}</button>`).join("")}
      </div>
      <div id="horCfgCuerpo">${
        HORCFG.tab === "necesidades" ? horCfgNecesidades(d)
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
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button class="btn primary" data-horcfg="guardar-nec">Guardar</button></div>`;
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

  if (act === "guardar-nec") {
    const mapa = new Map();
    ov.querySelectorAll(".horcfg-n").forEach((i) => {
      const k = `${i.dataset.a}|${i.dataset.t}|${i.dataset.d}`;
      if (!mapa.has(k)) mapa.set(k, { area_id: +i.dataset.a, tramo_id: +i.dataset.t, dow: +i.dataset.d });
      const v = i.value.trim();
      mapa.get(k)[i.dataset.k] = v === "" ? null : Number(v);
    });
    try { const r = await apiSend("PUT", "/api/horarios/necesidades", { local: HOR.local, necesidades: [...mapa.values()] });
      toast(`Guardado · ${r.guardadas} casillas`); } catch (err) { toast(err.message); }
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
    <div class="field"><label>Tramo</label><select id="hmT">${opt(HOR.tramos, asig?.tramo_id ?? ctx?.tramo, "Sin tramo")}</select></div>
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
  const amb = localFijadoFE() || DASH_LOCAL || "";
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

  const dentro = j.personas.filter((p) => p.estado !== "fuera");
  const resto = j.personas.filter((p) => p.estado === "fuera");

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
function facQS() { const qs = new URLSearchParams(); ["local", "empresa", "estado", "tipo", "q", "from", "to"].forEach((k) => { if (FACF[k]) qs.set(k, FACF[k]); }); return qs.toString(); }
// El ámbito de local lo manda el selector de establecimiento de la barra superior (no hay filtro
// «Local» duplicado dentro de la vista). Para el encargado, su local fijado gana siempre.
function facScope() { FACF.local = localFijadoFE() || DASH_LOCAL || ""; return FACF.local; }
function facHeader() {
  const amb = facScope();
  return `<div class="ph"><div class="eyebrow">Contabilidad</div><h1>Facturas</h1><div class="sub">Facturas, asignación y configuración fiscal${amb ? ` · <b>${esc(nombreCortoLocal(amb))}</b>` : ""}</div></div><div class="toolbar" style="margin-bottom:12px"><button class="btn ${FACTAB === "facturas" ? "primary" : ""}" data-act="fac-tab" data-tab="facturas">Facturas</button><button class="btn ${FACTAB === "config" ? "primary" : ""}" data-act="fac-tab" data-tab="config">Configuración</button></div>`;
}
const eur = (n) => num(Math.round(Number(n) || 0)) + " €";
function renderFacturas(list, pend, stats, empresas) {
  facScope();
  const empOpts =['<option value="">Todas las empresas</option>'].concat((empresas || []).map((e) => `<option value="${esc(e)}" ${FACF.empresa === e ? "selected" : ""}>${esc(e)}</option>`)).join("");
  const tipoOpts = ['<option value="">Todos los tipos</option>'].concat(["factura", "albaran", "ticket", "otro"].map((t) => `<option value="${t}" ${FACF.tipo === t ? "selected" : ""}>${cap(t)}</option>`)).join("");
  const estOpts = [["", "Todos los estados"], ["pagada", "Pagadas"], ["pendiente", "Pendientes"]].map(([v, l]) => `<option value="${v}" ${FACF.estado === v ? "selected" : ""}>${l}</option>`).join("");
  const resumen = stats && stats.resumenAnual ? `<div class="grid g4" style="margin-bottom:16px">${stat("Facturas (año)", "🧾", num(stats.resumenAnual.num_docs))}${stat("Base imponible", "€", eur(stats.resumenAnual.base))}${stat("IVA", "€", eur(stats.resumenAnual.iva))}${stat("Total", "€", eur(stats.resumenAnual.total))}</div>` : "";
  // Sin botón «Buscar»: los filtros se aplican solos al cambiarlos o al escribir (ver applyFacFilter).
  const toolbar = `<div class="toolbar"><div class="field"><label>Empresa</label><select id="facEmp">${empOpts}</select></div><div class="field"><label>Estado</label><select id="facEstado">${estOpts}</select></div><div class="field"><label>Tipo</label><select id="facTipo">${tipoOpts}</select></div><div class="field"><label>Desde</label>${dpField("facFrom", FACF.from, "Cualquiera", { max: FACF.to || "" })}</div><div class="field"><label>Hasta</label>${dpField("facTo", FACF.to, "Cualquiera", { min: FACF.from || "" })}</div><div class="field" style="flex:1 1 170px"><label>Buscar</label><input id="facQ" placeholder="Proveedor, concepto, nº" value="${esc(FACF.q)}"></div><div style="display:flex;gap:10px;margin-left:auto"><button class="btn primary" data-act="fac-subir">+ Subir factura</button><button class="btn" data-act="fac-export">Exportar CSV</button></div></div>`;
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
    return `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(p.proveedor || "(sin proveedor)")} ${badge}</div><div class="t2">${esc((p.fecha || "").slice(0, 10))} · ${eur(p.total)}</div></div><button class="btn primary" data-act="fac-revisar" data-id="${p.id}">Revisar</button></div>`;
  };
  const pendCard = (pend && pend.length) ? `<div class="card p0" style="margin-bottom:16px"><div class="ch" style="padding:18px 18px 0"><h3>Facturas pendientes de asignar</h3><span class="pill bad">${pend.length}</span></div><div class="rows" style="margin-top:6px">${pend.map(pendRow).join("")}</div></div>` : "";
  // La tabla va aparte y dentro de #facRes: es lo único que se repinta al filtrar en vivo.
  return `${facHeader()}${resumen}${toolbar}${vizGrid}${pendCard}<div id="facRes">${facTablaHtml(list)}</div>`;
}
function facTablaHtml(list) {
  if (!list.length) return `<div class="card"><div class="mut" style="padding:8px">Sin facturas con esos filtros.</div></div>`;
  return `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Nº</th><th>Proveedor</th><th>Local</th><th class="r">Base</th><th class="r">Total</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((f) => `<tr><td class="mut">${esc((f.fecha || "").slice(0, 10))}</td><td class="mut">${esc(f.numero_factura || "")}</td><td>${esc(f.proveedor || "")}${f.tipo && f.tipo !== "factura" ? ` <span class="pill" style="font-size:10px">${esc(f.tipo)}</span>` : ""}</td><td>${esc(f.local || "")}</td><td class="r tnum">${eur(f.base_imponible)}</td><td class="r tnum">${eur(f.total)}</td><td><span class="pill ${f.pagado ? "ok" : ""}">${f.pagado ? "Pagada" : "Pendiente"}</span></td><td class="r"><button class="btn sm" data-act="fac-ficha" data-id="${f.id}">Ficha</button></td></tr>`).join("")}</tbody></table></div></div>`;
}
function facFicha(id) {
  const f = (FAC_LIST || []).find((x) => String(x.id) === String(id)); if (!f) { toast("Factura no encontrada"); return; }
  const fld = (lab, key, type = "text") => `<div class="field"><label>${lab}</label><input data-fic="${key}" type="${type}" value="${esc(f[key] == null ? "" : f[key])}"></div>`;
  const fechaFld = `<div class="field"><label>Fecha</label>${dpField("ficFecha", f.fecha, "Sin fecha", { attr: 'data-fic="fecha"' })}</div>`;
  const tipoSel = `<div class="field"><label>Tipo</label><select data-fic="tipo">${["factura", "albaran", "ticket", "otro"].map((t) => `<option value="${t}" ${f.tipo === t ? "selected" : ""}>${cap(t)}</option>`).join("")}</select></div>`;
  const localSel = `<div class="field"><label>Local</label><select data-fic="local"><option value="">—</option>${LOCALES.map((l) => `<option value="${esc(l)}" ${f.local === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  const ov = modal("Factura · " + (f.proveedor || f.id), `<div class="form-grid">${fld("Proveedor", "proveedor")}${fld("NIF proveedor", "nif")}${fld("Nº documento", "numero_factura")}${fechaFld}${tipoSel}${localSel}${fld("Empresa", "empresa")}${fld("Concepto", "concepto")}${fld("Base (€)", "base_imponible", "number")}${fld("IVA %", "porcentaje_iva", "number")}${fld("Cuota (€)", "cuota_iva", "number")}${fld("Total (€)", "total", "number")}</div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;flex-wrap:wrap"><div style="display:flex;gap:8px">${f.drive_url ? `<a class="btn" href="${esc(f.drive_url)}" target="_blank" rel="noopener">Ver archivo ↗</a>` : ""}<button class="btn ${f.pagado ? "" : "primary"}" id="ficPago">${f.pagado ? "Marcar impagada" : "Marcar pagada"}</button></div><div style="display:flex;gap:8px"><button class="btn danger" id="ficDel">Eliminar</button><button class="btn" data-close>Cerrar</button><button class="btn primary" id="ficSave">Guardar cambios</button></div></div>`);
  ov.querySelector("#ficDel").addEventListener("click", async () => {
    if (!(await confirmModal("¿Eliminar esta factura? Se quitará de la BD y de los Sheets.", { ok: "Eliminar", danger: true }))) return;
    try { await apiSend("DELETE", "/api/facturas/" + id); ov.remove(); toast("Factura eliminada ✅"); loadFacturas(); } catch (e) { toast("Error: " + e.message); }
  });
  ov.querySelector("#ficSave").addEventListener("click", async () => {
    const body = {}; ov.querySelectorAll("[data-fic]").forEach((el) => { body[el.getAttribute("data-fic")] = el.value; });
    try { await apiSend("PATCH", "/api/facturas/" + id, body); ov.remove(); toast("Factura actualizada ✅"); loadFacturas(); } catch (e) { toast("Error: " + e.message); }
  });
  const pb = ov.querySelector("#ficPago"); if (pb) pb.addEventListener("click", async () => { try { await apiSend("PATCH", "/api/facturas/" + id + "/pago"); ov.remove(); toast("Estado de pago actualizado"); loadFacturas(); } catch (e) { toast("Error: " + e.message); } });
}
async function facExport() { try { const r = await fetch("/api/facturas/export.csv" + (facQS() ? "?" + facQS() : ""), { headers: { Authorization: "Bearer " + token() } }); if (!r.ok) { toast("No se pudo exportar"); return; } const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "facturas.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); } catch { toast("No se pudo exportar"); } }
function facSubir() {
  const localOpts = ['<option value="">Detectar automáticamente (por NIF, empresa o proveedor)</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`)).join("");
  const ov = modal("Subir facturas", `<div class="field" style="width:100%"><label>Archivos (PDF o imágenes, puedes elegir varios)</label><input type="file" id="fsFile" accept="application/pdf,image/*" multiple></div><div class="field" style="width:100%"><label>Local</label><select id="fsLocal">${localOpts}</select></div><div class="mut" style="font-size:12px">Se procesan en segundo plano con la misma IA, orden en Drive y control de duplicados que WhatsApp/correo. Requiere Google conectado. Puedes cerrar y seguir trabajando; te aviso al terminar.</div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="fsSend">Subir y procesar</button></div>`);
  ov.querySelector("#fsSend").addEventListener("click", () => {
    const inp = ov.querySelector("#fsFile"); const files = inp && inp.files ? Array.from(inp.files) : [];
    if (!files.length) { toast("Elige al menos un archivo"); return; }
    const loc = ov.querySelector("#fsLocal").value;
    ov.remove(); // fuera la pantallita: sigue trabajando
    toast(files.length === 1 ? `Subiendo «${files[0].name}» en segundo plano…` : `Subiendo ${files.length} facturas en segundo plano…`);
    (async () => {
      try {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        if (loc) fd.append("local", loc);
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
function renderFacturasConfig() {
  // Empresas / CIF por local
  const emp = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Empresa y CIF por local</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th>Empresa</th><th>CIF</th><th>Local contable</th><th></th></tr></thead><tbody>${(FCFG.locales || []).map((l) => `<tr><td>${esc(l.local)}</td><td>${esc(l.empresa || "")}</td><td class="mut">${esc(l.cif || "")}</td><td class="mut">${esc(l.local_contable || "")}</td><td class="r"><button class="linkbtn" data-act="fac-loc-del" data-local="${esc(l.local)}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="5" class="mut">Sin empresas configuradas.</td></tr>'}</tbody></table></div><div class="toolbar" style="padding:12px 18px;margin:0">${facLocalSelect("flLocal")}<input id="flEmp" placeholder="Empresa"><input id="flCif" placeholder="CIF" style="max-width:120px"><input id="flCont" placeholder="Local contable" style="max-width:150px"><button class="btn primary" data-act="fac-loc-add">Guardar</button></div></div>`;
  // Reglas de email → local
  const reg = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Reglas de email → local</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Email remitente</th><th>Local</th><th></th></tr></thead><tbody>${(FCFG.reglas || []).map((r) => `<tr><td>${esc(r.email)}</td><td>${esc(r.local)}</td><td class="r"><button class="linkbtn" data-act="fac-mail-del" data-id="${r.id}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="3" class="mut">Sin reglas.</td></tr>'}</tbody></table></div><div class="toolbar" style="padding:12px 18px;margin:0"><input id="frEmail" placeholder="proveedor@email.com" type="email">${facLocalSelect("frLocal")}<button class="btn primary" data-act="fac-mail-add">Añadir</button></div></div>`;
  // Grupos de WhatsApp de facturas
  const grpOpt = (cur) => { let o = `<option value="">Grupo de WhatsApp…</option>`; const has = (FCFG.groups || []).some((g) => g.id === cur); if (cur && !has) o += `<option value="${esc(cur)}" selected>Grupo actual</option>`; o += (FCFG.groups || []).map((g) => `<option value="${esc(g.id)}">${esc(g.name || g.id)}</option>`).join(""); return o; };
  const grp = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Grupos de WhatsApp para facturas</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th>Grupo</th><th></th></tr></thead><tbody>${(FCFG.grupos || []).map((g) => `<tr><td>${esc(g.local)}</td><td>${(FCFG.groups || []).find((x) => x.id === g.group_jid) ? esc((FCFG.groups.find((x) => x.id === g.group_jid)).name) : '<span class="pill ok">Vinculado</span>'}</td><td class="r"><button class="linkbtn" data-act="fac-grp-del" data-id="${g.id}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="3" class="mut">Sin grupos.</td></tr>'}</tbody></table></div><div class="toolbar" style="padding:12px 18px;margin:0">${facLocalSelect("fgLocal")}<select id="fgGroup">${grpOpt("")}</select><button class="btn primary" data-act="fac-grp-add">Vincular</button></div></div>`;
  // Modelo 303
  const trims = ["1", "2", "3", "4"];
  const d = FAC303.data;
  const m303res = FAC303.error ? `<div class="mut" style="padding:8px 18px 14px">${esc(FAC303.error)}</div>` : (d ? `<div class="rows">${(d.porTipoIva && d.porTipoIva.length) ? d.porTipoIva.map((t) => `<div class="row"><div class="grow"><div class="t1">IVA ${num(t.tipo_iva)}%</div><div class="t2">${num(t.num_docs)} doc(s) · base ${eur(t.base_total)}</div></div><b class="tnum">${eur(t.cuota_total)}</b></div>`).join("") : ""}${(d.totales ? `<div class="row" style="border-top:2px solid var(--border)"><div class="grow"><div class="t1">Base imponible</div><div class="t2">${num((d.totales.num_facturas) || 0)} facturas</div></div><b class="tnum">${eur(d.totales.base_total || 0)}</b></div><div class="row"><div class="grow"><div class="t1">Cuota de IVA</div></div><b class="tnum">${eur(d.totales.cuota_total || 0)}</b></div><div class="row"><div class="grow"><div class="t1">Total facturas</div></div><b class="tnum">${eur(d.totales.importe_total || 0)}</b></div>` : "")}${(d.otrosDocs && (d.otrosDocs.num_otros) ? `<div class="row"><div class="grow"><div class="t1">Otros documentos</div><div class="t2">${num(d.otrosDocs.num_otros || 0)} docs</div></div><b class="tnum">${eur(d.otrosDocs.total_otros || 0)}</b></div>` : "")}</div><div style="padding:10px 18px"><button class="btn sm" data-act="fac-303-csv">Exportar 303 (CSV)</button></div>` : `<div class="mut" style="padding:8px 18px 14px">Elige empresa y trimestre y pulsa Calcular.</div>`);
  const empOpts = `<option value="">Empresa…</option>` + (FCFG.empresas || []).map((e) => `<option value="${esc(e)}" ${FAC303.empresa === e ? "selected" : ""}>${esc(e)}</option>`).join("");
  const m303 = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Modelo 303 (IVA trimestral)</h3></div><div class="toolbar" style="padding:12px 18px;margin:0"><select id="m303emp">${empOpts}</select><select id="m303tri"><option value="">Trimestre…</option>${trims.map((t) => `<option value="${t}" ${FAC303.trimestre === t ? "selected" : ""}>${t}º trimestre</option>`).join("")}</select><button class="btn primary" data-act="fac-303">Calcular</button></div>${m303res}</div>`;
  // Integraciones Google (Drive/Sheets/Gmail)
  const ig = FCFG.integ || {}; const drv = ig.drive || {}; const gm = ig.gmail || {};
  const master = FCFG.master || {};
  const integ = `<div class="card"><div class="ch"><h3>Integraciones (Google)</h3></div><div class="rows" style="padding:0">
    <div class="row" style="padding-left:0;padding-right:0"><div class="grow"><div class="t1">Drive / Sheets</div><div class="t2">Guarda y ordena las facturas por empresa/local/mes</div></div><span class="pill ${drv.conectado ? "ok" : "bad"}">${drv.conectado ? "Conectado" : "Sin conectar"}</span></div>
    <div class="row" style="padding-left:0;padding-right:0"><div class="grow"><div class="t1">Correo (Gmail)</div><div class="t2">${gm.conectado ? `${num((gm.emails && gm.emails.length) || 0)} correos procesados` : "Lee las facturas que llegan por email"}</div></div><span class="pill ${gm.conectado ? "ok" : "bad"}">${gm.conectado ? "Activo" : "Sin conectar"}</span></div>
    <div class="row" style="padding-left:0;padding-right:0"><div class="grow"><div class="t1">Sheet maestro consolidado</div><div class="t2">${master.url ? "Todas las facturas de todos los locales en una hoja" : "Se crea al procesar la primera factura o al reconstruir"}</div></div>${master.url ? `<a class="link" href="${esc(master.url)}" target="_blank" rel="noopener">Abrir ↗</a>` : '<span class="pill">Sin crear</span>'}</div>
    <div class="row" style="padding-left:0;padding-right:0"><div class="grow"><div class="t1">Volcado a Sheets</div><div class="t2">${(drv.pendientes_sheet || 0) > 0 ? `${num(drv.pendientes_sheet)} factura(s) pendientes de volcar (se reintenta solo cada 10 min)` : "Todo volcado. La BD es la fuente de verdad; los Sheets son su reflejo."}${drv.ultimo_reintento ? ` · último reintento ${esc(String(drv.ultimo_reintento).slice(0, 16).replace("T", " "))}` : ""}</div></div><span class="pill ${(drv.pendientes_sheet || 0) > 0 ? "warn" : "ok"}">${(drv.pendientes_sheet || 0) > 0 ? "Pendiente" : "Al día"}</span></div>
  </div><div class="toolbar" style="padding:12px 0 0"><a class="btn" href="/auth/google-facturas">${drv.conectado ? "Reconectar Google" : "Conectar Google"}</a><button class="btn" data-act="fac-migrar">Reordenar Drive</button>${(drv.pendientes_sheet || 0) > 0 ? '<button class="btn primary" data-act="fac-reproyectar">Reintentar volcado</button>' : ""}<button class="btn" data-act="fac-reparar">Verificar y reparar Sheets</button><button class="btn danger" data-act="fac-empezar-cero">Empezar de cero</button></div><div class="mut" style="font-size:12px;margin-top:6px">"Reparar" reescribe todas las hojas y el maestro desde la base de datos (la fuente de verdad). "Empezar de cero" limpia todas las facturas de la base de datos (no borra Drive; eso se hace a mano).</div></div>`;
  // Carpetas de Drive vigiladas (tercer canal de ingesta)
  const carp = FCFG.carpetas || [];
  const drive = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Carpetas de Drive vigiladas</h3></div><div class="mut" style="padding:0 18px;font-size:12.5px">Deja una factura (PDF/imagen) en la carpeta de Drive de un local y entrará sola cada pocos minutos.</div><div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th>Carpeta</th><th></th></tr></thead><tbody>${carp.map((c) => `<tr><td>${esc(c.local)}</td><td class="mut">${c.folder_url ? `<a class="link" href="${esc(c.folder_url)}" target="_blank" rel="noopener">${esc(c.folder_id)}</a>` : esc(c.folder_id)}</td><td class="r"><button class="linkbtn" data-act="fac-drive-del" data-local="${esc(c.local)}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="3" class="mut">Sin carpetas configuradas.</td></tr>'}</tbody></table></div><div class="toolbar" style="padding:12px 18px;margin:0">${facLocalSelect("fdLocal")}<input id="fdFolder" placeholder="Enlace o ID de la carpeta de Drive" style="flex:1;min-width:0"><button class="btn primary" data-act="fac-drive-add">Vincular</button></div></div>`;
  return `${facHeader()}<div class="grid g2">${emp}${reg}</div><div class="grid g2" style="margin-top:16px">${grp}${m303}</div><div style="margin-top:16px">${drive}</div><div style="margin-top:16px">${integ}</div>`;
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
      return;
    }
    const [lst, pend, stats, empresas] = await Promise.all([
      api("/api/facturas" + (facQS() ? "?" + facQS() : "")),
      apiOptional("/api/facturas/pendientes"),
      apiOptional("/api/facturas/stats" + (FACF.local ? "?local=" + encodeURIComponent(FACF.local) : "")),
      apiOptional("/api/facturas/empresas"),
    ]);
    FAC_LIST = lst || [];
    FAC_PEND = pend || [];
    view.innerHTML = renderFacturas(FAC_LIST, FAC_PEND, stats, empresas || []);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function facTab(tab) { FACTAB = tab; loadFacturas(); }
// ── Filtrado en vivo (sin botón «Buscar») ───────────────────────────────────
// Solo repinta #facRes, así el foco del buscador y el estado de los selects no se pierden.
// `_facSeq` descarta respuestas que llegan tarde (si escribes rápido, gana la última).
let _facSeq = 0, _facTimer = null;
function applyFacFilter() {
  ["empresa:facEmp", "estado:facEstado", "tipo:facTipo", "from:facFrom", "to:facTo", "q:facQ"].forEach((pair) => {
    const [k, id] = pair.split(":"); const el = document.getElementById(id); if (el) FACF[k] = (el.value || "").trim();
  });
  // Desde/Hasta se limitan mutuamente (la toolbar ya no se repinta, hay que refrescar los topes).
  const f = document.getElementById("facFrom"), t = document.getElementById("facTo");
  if (f && t) { f.setAttribute("data-max", t.value || ""); t.setAttribute("data-min", f.value || ""); }
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
    const lst = await api("/api/facturas" + (facQS() ? "?" + facQS() : ""));
    if (seq !== _facSeq) return; // llegó tarde: ya hay una búsqueda más nueva
    FAC_LIST = lst || [];
    box.innerHTML = facTablaHtml(FAC_LIST);
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
async function facMigrar() { if (!(await confirmModal("¿Reordenar en Drive todas las facturas a su carpeta Empresa/Local/Mes?", { ok: "Reordenar" }))) return; try { const j = await apiSend("POST", "/api/facturas/migrar-estructura"); toast(`Reordenadas: ${j.resultado ? j.resultado.movidos : "OK"} ✅`); } catch (e) { toast("Error: " + e.message); } }
async function facDriveAdd() { const local = facVal("fdLocal"), folder = facVal("fdFolder"); if (!local || !folder) { toast("Local y carpeta obligatorios"); return; } try { await apiSend("POST", "/api/facturas/drive-carpetas", { local, folder }); toast("Carpeta vinculada ✅"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facDriveDel(local) { if (!(await confirmModal(`¿Dejar de vigilar la carpeta de ${local}?`, { ok: "Eliminar", danger: true }))) return; try { await apiSend("DELETE", "/api/facturas/drive-carpetas/" + encodeURIComponent(local)); toast("Eliminada"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facReconstruir() { if (!(await confirmModal("¿Reconstruir el Sheet maestro con todas las facturas registradas?", { ok: "Reconstruir" }))) return; try { const j = await apiSend("POST", "/api/facturas/reconstruir-maestro"); toast(`Maestro actualizado: ${num(j.total || 0)} facturas ✅`); loadFacturas(); } catch (e) { toast("Error: " + e.message); } }
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
    const maxV = Math.max(1, ...r.cerrados.map((d) => d.ventas || 0), (r.hoy && r.hoy.ventas) || 0);
    const bars = [...r.cerrados, ...(r.hoy ? [r.hoy] : [])].map((d) => {
      const h = Math.round(((d.ventas || 0) / maxV) * 46) + 2;
      const esHoy = d.dia === hoy;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1"><div style="width:100%;max-width:26px;height:${h}px;border-radius:4px 4px 0 0;background:${esHoy ? "var(--accent,#7a8450)" : "var(--brand,#8a9a5b)"};opacity:${esHoy ? 1 : 0.75}" title="${esc(fechaCorta(d.dia))}: ${eur(d.ventas)}"></div><div class="mut" style="font-size:10px">${esc(String(d.dia).slice(8, 10))}</div></div>`;
    }).join("");
    return `<div class="card"><div class="ch"><h3>${esc(nombreCortoLocal(L.local))}</h3>${r.hoy ? '<span class="pill ok">En vivo</span>' : ""}</div>
      <div class="grid g2" style="gap:10px">
        <div><div class="mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Hoy (en curso)</div><div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums">${r.hoy ? eur(r.hoy.ventas) : "—"}</div><div class="mut" style="font-size:11px">${r.hoy ? num(r.hoy.tickets) + " tickets · " + eur(r.hoy.ticket_medio) + "/tk" : ""}</div></div>
        <div><div class="mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Ayer</div><div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums">${r.ayer ? eur(r.ayer.ventas) : "—"}</div><div class="mut" style="font-size:11px">${r.ayer ? num(r.ayer.tickets) + " tickets · " + eur(r.ayer.ticket_medio) + "/tk" : ""}</div></div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:5px;height:64px;margin-top:12px">${bars || '<div class="mut" style="font-size:12px">Sin días previos</div>'}</div>
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
  const body = `<div class="mut" style="font-size:12.5px;margin-bottom:8px">Base: <b>${esc(j.base || "")}</b> · scripts leídos: ${scripts.length}. <b>Cópialo y pégamelo</b>: con las rutas de API cablearé la de ventas/cierres.</div>
    <div class="card p0" style="max-height:34vh;overflow:auto"><div class="ch" style="padding:12px 12px 0"><h3>Rutas prometedoras (venta/cierre/api…)</h3></div><div style="padding:8px 12px">${lista(api)}</div></div>
    <details style="margin-top:8px"><summary class="mut" style="cursor:pointer;font-size:12.5px">Otras rutas (${otras.length})</summary><div class="card p0" style="max-height:24vh;overflow:auto;margin-top:6px"><div style="padding:8px 12px">${lista(otras)}</div></div></details>
    <textarea id="agDescJson" style="width:100%;height:120px;margin-top:10px;font-family:monospace;font-size:11px" readonly>${esc(jsonTxt)}</textarea>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="agDescCopy">Copiar resultado</button><button class="btn primary" data-close>Cerrar</button></div>`;
  const ov = modal("Descubrir rutas · " + local, body);
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
let ANAL = { tipo: "producto", local: "", range: null, tipos: [], data: null, sort: null, cargando: false };
function fmtCelda(v, tipo) {
  if (tipo === "eur") return eur(v);
  if (tipo === "num") return num(v);
  if (tipo === "pct") return (Math.round((Number(v) || 0) * 10) / 10) + "%";
  return esc(v == null ? "" : String(v));
}
function renderAnaliticaTabla(data) {
  if (!data) return "";
  if (data.sinCredenciales) return `<div class="card"><div class="mut" style="font-size:13px">Configura <b>usuario y contraseña</b> del local en <b>Ágora (TPV)</b> para poder consultar informes.</div></div>`;
  const cols = data.columnas || [], filas = data.filas || [];
  if (!cols.length || !filas.length) return `<div class="card"><div class="mut" style="font-size:13px">Sin movimientos en este rango${data.local ? "" : " (prueba a elegir un local abierto)"}.</div></div>`;
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
  const totCells = cols.map((c, i) => { if (i === 0) return `<td><b>Total</b></td>`; const t = data.totales && data.totales[c.key]; return `<td class="${c.tipo === "num" || c.tipo === "eur" || c.tipo === "pct" ? "r tnum" : ""}">${t != null ? "<b>" + fmtCelda(t, c.tipo) + "</b>" : ""}</td>`; }).join("");
  const errores = (data.__errores && data.__errores.length) ? `<div class="mut" style="font-size:12px;margin:6px 2px">${data.__errores.map((e) => `⚠ ${esc(e.local)}: ${esc(e.error)}`).join(" · ")}</div>` : "";
  const tabla = `<div class="card p0"><div class="ch" style="padding:14px 16px 0"><h3>${esc(data.label)}${data.local ? " · " + esc(nombreCortoLocal(data.local)) : ""}</h3><span class="mut" style="font-size:12px">${num(filas.length)} filas${data.generado ? " · " + esc(String(data.generado).slice(11, 16)) : ""}</span></div><div class="tblwrap"><table class="tbl"><thead><tr>${th}</tr></thead><tbody>${body}</tbody><tfoot><tr>${totCells}</tr></tfoot></table></div></div>`;
  return chart + tabla + errores;
}
function renderAnalitica() {
  const amb = analScope();
  const presets =[["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Semana"], ["mes", "Mes"]];
  const cur = ANAL.range || rangoPreset("mes", todayStr());
  const seg = presets.map(([p, l]) => `<button class="${cur.preset === p ? "on" : ""}" data-act="anal-period" data-p="${p}">${l}</button>`).join("") + `<button class="${cur.preset === "custom" ? "on" : ""}" data-act="anal-period-custom">${cur.preset === "custom" ? esc(fechaCorta(cur.from)) + "–" + esc(fechaCorta(cur.to)) : "Personalizado"}</button>`;
  const tabs = (ANAL.tipos || []).map((t) => `<button class="btn ${ANAL.tipo === t.key ? "primary" : ""}" data-act="anal-tab" data-tipo="${esc(t.key)}">${esc(t.label)}</button>`).join("");
  const head = `<div class="ph"><div class="eyebrow">Inteligencia</div><h1>Analítica de ventas</h1><div class="sub">Informes en vivo del TPV · ${esc(cur.label)}${amb ? ` · <b>${esc(nombreCortoLocal(amb))}</b>` : ""}</div><div class="acts"><button class="btn" data-act="anal-refresh">Actualizar</button><button class="btn" data-act="anal-csv">Exportar CSV</button></div></div>`;
  // Sin selector de local: el ámbito lo marca el selector de establecimiento de la barra superior.
  const toolbar = `<div class="toolbar"><div class="field"><label>Periodo</label><div class="seg">${seg}</div></div><div style="flex:1"></div></div>`;
  const tabsBar = tabs ? `<div class="toolbar" style="margin-top:-6px">${tabs}</div>` : "";
  const cuerpo = ANAL.cargando ? `<div class="card"><div class="mut" style="font-size:13px">Consultando el TPV…</div></div>` : renderAnaliticaTabla(ANAL.data);
  return head + toolbar + tabsBar + `<div id="analBody">${cuerpo}</div>`;
}
// Ámbito de local: selector de establecimiento de la barra superior (el fijado manda).
function analScope() { ANAL.local = localFijadoFE() || DASH_LOCAL || ""; return ANAL.local; }
async function loadAnalitica() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  if (!ANAL.range) ANAL.range = rangoPreset("mes", todayStr());
  analScope();
  if (sinPublico(ANAL.local)) { view.innerHTML = avisoSinPublico("Analítica de ventas", "Inteligencia", "ventas"); return; }
  try {
    if (!ANAL.tipos.length) { const j = await apiOptional("/api/agora/informes"); ANAL.tipos = j || []; if (ANAL.tipos.length && !ANAL.tipos.some((t) => t.key === ANAL.tipo)) ANAL.tipo = ANAL.tipos[0].key; }
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
function analTab(tipo) { ANAL.tipo = tipo; document.querySelectorAll('[data-act="anal-tab"]').forEach((x) => x.classList.toggle("primary", x.getAttribute("data-tipo") === tipo)); loadAnalInforme(); }
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
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Campaña</th><th>Segmento</th><th>Estado</th><th class="r">Env.</th><th class="r">Err.</th><th>Fecha</th><th></th></tr></thead><tbody>${rows.map((c) => {
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
    const [list, plantillas, audiencias] = await Promise.all([api("/api/campanas"), apiOptional("/api/plantillas"), apiOptional("/api/audiencias")]);
    CAMP.list = list || []; CAMP.plantillas = plantillas || []; CAMP.audiencias = audiencias || [];
    try { const j = await apiRaw("/api/campanas-config"); CAMP.cfg = { cumple_auto: j.cumple_auto, cumple_plantilla: j.cumple_plantilla }; } catch { CAMP.cfg = { cumple_auto: false, cumple_plantilla: "" }; }
    view.innerHTML = renderCampanas();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function openNuevaCampana() { openCampana("nueva"); }
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
    <div class="field"><label>Objetivo (rellena el mensaje)</label><div style="display:flex;gap:6px;flex-wrap:wrap">${objBtns}</div></div>
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
const VIEWS = { dashboard: loadDashboard, reservas: loadReservas, comunicados: loadComunicados, mantenimiento: loadMant, inventarios: loadInventario, clientes: loadClientes, reviews: loadReviews, campanas: loadCampanas, rrhh: loadRRHH, horarios: loadHorarios, fichajes: loadFichajes, facturas: loadFacturas, analitica: loadAnalitica, sara: loadSara, agora: loadAgora, whatsapp: loadWhatsApp, usuarios: loadUsuarios, web: loadWeb };
function go(view) {
  if (!VIEWS[view]) view = "dashboard";
  // El calendario cuelga de <body>, así que sobrevive al repintado de la vista:
  // si no lo cerramos aquí, se queda flotando encima de la pantalla nueva.
  dpClose();
  CURRENT = view;
  if (!puedeVer(view)) {
    document.getElementById("root").innerHTML = shell(view, `<div class="card"><div class="ch"><h3>Sin acceso</h3></div><p class="mut">No tienes acceso a este módulo.</p></div>`);
    refreshWaPill(); return;
  }
  document.getElementById("root").innerHTML = shell(view, skeleton());
  refreshWaPill();
  VIEWS[view]();
}

document.addEventListener("change", (e) => {
  if (!e.target) return;
  const id = e.target.id;
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
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "cQ") { CLIF.q = e.target.value.trim(); cliRefreshDebounced(); }
  else if (e.target && e.target.id === "facQ") { facFilterDebounced(); }
  else if (e.target && e.target.id === "invSearch") { INV.filtro = e.target.value; invRefreshList(); }
  else if (e.target && e.target.classList && e.target.classList.contains("invqty")) { invInput(e.target.getAttribute("data-id"), e.target.value); }
});
document.addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]"); if (v) { e.preventDefault(); const a = document.getElementById("appEl"); if (a) a.classList.remove("mopen"); go(v.getAttribute("data-view")); return; }
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.getAttribute("data-act");
  if (act === "mtoggle") { const a = document.getElementById("appEl"); if (!a) return; if (window.innerWidth <= 820) a.classList.toggle("mopen"); else { COLLAPSED = !COLLAPSED; a.classList.toggle("collapsed"); } }
  else if (act === "mclose") { const a = document.getElementById("appEl"); if (a) a.classList.remove("mopen"); }
  else if (act === "cmdk") openCmd();
  else if (act === "estabmenu") openEstabMenu();
  // Cambiar de establecimiento reaplica el ámbito sin sacarte de donde estabas.
  else if (act === "estab-pick") { DASH_LOCAL = t.getAttribute("data-local") || ""; closeDrawer(); go(MODULOS_POR_LOCAL.has(CURRENT) ? CURRENT : "dashboard"); }
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
  else if (act === "period") { PERIOD = t.getAttribute("data-p"); const r = rangoPreset(PERIOD, todayStr()); DASH_RANGE = { from: r.from, to: r.to, label: r.label }; document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b === t)); if (CURRENT === "dashboard") loadDashboard(); }
  else if (act === "period-custom") openPeriodoCustom();
  else if (act === "theme") toggleTheme();
  else if (act === "logout") { localStorage.removeItem("token"); location.href = "/login.html"; }
  else if (act === "reload") go(CURRENT);
  else if (act === "res-vista") resVista(t.getAttribute("data-vista"));
  else if (act === "res-prev") resNavega("prev");
  else if (act === "res-next") resNavega("next");
  else if (act === "res-hoy") resNavega("hoy");
  else if (act === "res-dia") resDiaFoco(t.getAttribute("data-dia"));
  else if (act === "nueva") openNuevaReserva();
  else if (act === "csv") downloadCsv();
  else if (act === "cancel") cancelReserva(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "mant-nueva") openNuevaIncidencia();
  else if (act === "mant-estado") mantEstado(t.getAttribute("data-id"), t.getAttribute("data-estado"));
  else if (act === "inv-local") invPickLocal(t.getAttribute("data-local"));
  else if (act === "inv-volver-locales") loadInventario();
  else if (act === "inv-volver-prov") loadInvProveedores();
  else if (act === "inv-volver-conteo") loadInvConteo();
  else if (act === "inv-nuevo-prov") invNuevoProveedor();
  else if (act === "inv-pedidos") loadInvPedidos();
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
  else if (act === "rev-local") revSetLocal(t.getAttribute("data-local"));
  else if (act === "rev-responder") openResponder(t.getAttribute("data-id"));
  else if (act === "rev-sel") revToggleSel(t.getAttribute("data-id"));
  else if (act === "rev-sel-none") revSelNone();
  else if (act === "rev-bulk") revBulk();
  else if (act === "rr-tab") rrTab(t.getAttribute("data-tab"));
  else if (act === "rr-filtrar") applyRRFilter();
  else if (act === "cand-estado") candEstado(t.getAttribute("data-id"), t.getAttribute("data-estado"));
  else if (act === "rr-worker") rrSelWorker(t.getAttribute("data-id"));
  else if (act === "rr-editar-datos") rrEditarDatos(t.getAttribute("data-id"));
  else if (act === "rr-pin") rrAsignarPin(t.getAttribute("data-id"));
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
  else if (act === "fac-subir") facSubir();
  else if (act === "fac-303-csv") fac303Csv();
  else if (act === "fac-migrar") facMigrar();
  else if (act === "fac-drive-add") facDriveAdd();
  else if (act === "fac-drive-del") facDriveDel(t.getAttribute("data-local"));
  else if (act === "fac-reconstruir") facReconstruir();
  else if (act === "fac-reparar") facReparar();
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
requireRole(["direccion", "encargado", "contabilidad", "marketing"]).then((user) => {
  if (!user) return;
  USER = user;
  go(user.rol === "marketing" ? "web" : "dashboard");
}).catch(() => { /* requireRole ya redirige a /login.html */ });
