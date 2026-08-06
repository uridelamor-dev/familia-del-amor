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
    ["clientes", "Clientes", "users", ["direccion", "marketing"]],
  ] },
  { g: "Gestión", items: [
    ["rrhh", "RR. HH.", "idcard", ["direccion"]],
    ["facturas", "Facturas", "receipt", ["direccion", "contabilidad"]],
    ["web", "Web", "globe", ["direccion", "marketing"]],
    ["reviews", "Reseñas", "star", ["direccion", "encargado", "contabilidad", "marketing"]],
    ["campanas", "Campañas", "mkt", ["direccion", "marketing"]],
  ] },
  { g: "Inteligencia", items: [
    ["sara", "Sara (IA)", "bot", ["direccion", "marketing"]],
    ["whatsapp", "WhatsApp", "chat", ["direccion", "encargado"]],
  ] },
  { g: "Sistema", items: [
    ["agora", "Ágora (TPV)", "plug", ["direccion"]],
    ["usuarios", "Usuarios", "cog", ["direccion"]],
  ] },
];
const TITLES = { dashboard: "Dashboard", reservas: "Reservas", comunicados: "Comunicados", mantenimiento: "Mantenimiento", clientes: "Clientes", reviews: "Reseñas", campanas: "Campañas", rrhh: "RR. HH.", facturas: "Facturas", sara: "Sara", agora: "Ágora (TPV)", whatsapp: "WhatsApp", usuarios: "Usuarios", web: "Web" };
const VIEW_ROLES = { dashboard: ["direccion", "encargado", "contabilidad"], reservas: ["direccion", "encargado"], comunicados: ["direccion", "encargado"], mantenimiento: ["direccion", "encargado"], clientes: ["direccion", "marketing"], reviews: ["direccion", "encargado", "contabilidad", "marketing"], campanas: ["direccion", "marketing"], rrhh: ["direccion"], facturas: ["direccion", "contabilidad"], sara: ["direccion", "marketing"], agora: ["direccion"], whatsapp: ["direccion", "encargado"], usuarios: ["direccion"], web: ["direccion", "marketing"] };

let USER = null, CURRENT = "dashboard";

function setTheme(v) { const r = document.documentElement; if (v === "auto") { r.removeAttribute("data-theme"); localStorage.removeItem("panelTheme"); } else { r.setAttribute("data-theme", v); localStorage.setItem("panelTheme", v); } }
function isDark() { const r = document.documentElement; return r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches); }
function toggleTheme() { setTheme(isDark() ? "light" : "dark"); const b = document.getElementById("themeBtn"); if (b) b.innerHTML = ic(isDark() ? "moon" : "sun"); }
(function initTheme() { const t = localStorage.getItem("panelTheme"); if (t) document.documentElement.setAttribute("data-theme", t); })();

function shell(active, bodyHtml) {
  const uname = USER.nombre || USER.username || "Usuario";
  const initials = uname.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const nav = NAV.map((grp) => {
    const items = grp.items.filter(([, , , roles]) => !roles || roles.includes(USER.rol));
    if (!items.length) return "";
    return `<div class="ngt">${grp.g}</div>` + items.map(([id, label, icon]) => {
      const badge = (id === "dashboard" && DASH_CONCERNS > 0) ? `<span class="badge">${DASH_CONCERNS}</span>` : "";
      return `<button class="navi ${id === active ? "active" : ""}" data-view="${id}"><span class="ico">${ic(icon)}</span><span>${label}</span>${badge}</button>`;
    }).join("");
  }).join("");
  const estabLbl = DASH_LOCAL ? nombreCortoLocal(DASH_LOCAL) : "Todos los establecimientos";
  const seg = ["7d", "14d", "mes"].map((p) => `<button class="${PERIOD === p ? "on" : ""}" data-act="period" data-p="${p}">${p === "7d" ? "7 días" : p === "14d" ? "14 días" : "Mes"}</button>`).join("");
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

// ════════════════════════ ESTADO GLOBAL + COMPONENTES (lenguaje del prototipo) ════════════════════════
let DASH_LOCAL = "", COLLAPSED = false, PERIOD = "7d", DASH_CONCERNS = 0;
const nombreCorto = (s) => String(s || "").split(" ")[0];
const nombreCortoLocal = (l) => String(l || "").replace(/^La Tapeta\s*[-·]\s*/i, "").trim() || l;
const GO_VIEW = { whatsapp: "whatsapp", mantenimiento: "mantenimiento", clientes: "clientes", facturas: "facturas", rrhh: "rrhh", marketing: "reviews", reservas: "reservas", reviews: "reviews", campanas: "campanas" };
const ICN_TIPO = { whatsapp: "chat", mantenimiento: "wrench", facturas: "receipt", resenas: "star", clientes: "users", proveedores: "receipt", rrhh: "idcard" };
function saludoHora() { const h = new Date().getHours(); return h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches"; }
const signed2 = (v) => (v >= 0 ? "+" : "−") + Math.abs(Number(v) || 0).toFixed(1) + "%";

// ── Iconos SVG (sustituyen a los emojis) ──
const ICONS = {
  dash: '<path d="M4 13h7V4H4zM13 20h7v-9h-7zM13 4v5h7V4zM4 20h7v-5H4z"/>',
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
  NAV.forEach((grp) => grp.items.forEach(([id, label, icon, roles]) => { if (!roles || roles.includes(USER.rol)) items.push({ t: label, g: "Ir a", icon, view: id }); }));
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
  const opts = [["", "Todos los establecimientos"]].concat(LOCALES.map((l) => [l, l]));
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

  // ── Actividad (gráfico real de reservas) ──
  const serie = d.serieReservas || []; const win = PERIOD === "mes" ? 30 : PERIOD === "14d" ? 14 : 7;
  const slice = serie.slice(-win); const serieVals = slice.map((x) => x.personas || x.n || 0);
  const totalPeriodo = slice.reduce((s, x) => s + (x.n || 0), 0);
  const winLbl = PERIOD === "mes" ? "últimos 30 días" : PERIOD === "14d" ? "últimos 14 días" : "últimos 7 días";
  const ventasOk = d.ventas && d.ventas.disponible;
  const ventasBox = ventasOk
    ? `<div style="text-align:right"><div class="big tnum" style="font-size:30px">${eur(d.ventas.total)}</div><div class="mut" style="font-size:12px">ventas (30 días)</div></div>`
    : `<div class="mut" style="font-size:12px;text-align:right;line-height:1.5">Ventas y ticket medio<br><span class="hl">al conectar Ágora</span></div>`;
  const actividad = `<div class="card c8"><div class="ch"><h3>Actividad · reservas</h3><span class="pill">${winLbl}</span></div><div class="between" style="align-items:flex-end;margin-bottom:8px"><div><div class="big tnum">${num(totalPeriodo)}</div><div class="mut" style="font-size:12.5px">reservas en ${winLbl}</div></div>${ventasBox}</div>${area(serieVals, { h: 120 })}</div>`;

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
  try { const d = await api("/api/dashboard" + (DASH_LOCAL ? "?local=" + encodeURIComponent(DASH_LOCAL) : "")); view.innerHTML = renderDashboard(d); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}

// ════════════════════════ VISTA: RESERVAS ════════════════════════
let RESF = { local: "", from: "", to: "" };
function renderReservas(list) {
  const rows = (list || []).slice().sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  const localOpts = ['<option value="">Todos los locales</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${RESF.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const toolbar = `<div class="toolbar">
    <div class="field"><label>Local</label><select id="fLocal">${localOpts}</select></div>
    <div class="field"><label>Desde</label><input type="date" id="fFrom" value="${RESF.from}"></div>
    <div class="field"><label>Hasta</label><input type="date" id="fTo" value="${RESF.to}"></div>
    <button class="btn" data-act="filtrar">Buscar</button>
    <div class="spacer" style="flex:1"></div>
    <button class="btn" data-act="csv">Exportar CSV</button>
    <button class="btn primary" data-act="nueva">+ Nueva reserva</button></div>`;
  const table = rows.length
    ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Día</th><th>Hora</th><th>Local</th><th class="r">Pers.</th><th>Nombre</th><th>Teléfono</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(fechaCorta(r.dia))}</td><td class="tnum">${esc(r.hora)}</td><td>${esc(r.local)}</td><td class="r tnum">${esc(r.personas)}</td><td>${esc(r.nombre_reserva)}</td><td class="mut">${esc(r.telefono)}</td><td class="r"><button class="linkbtn" data-act="cancel" data-id="${r.id}" data-nombre="${esc(r.nombre_reserva)}">Cancelar</button></td></tr>`).join("")}</tbody></table></div></div>`
    : `<div class="card"><div class="mut" style="padding:8px">No hay reservas en ese rango. Prueba a ampliar las fechas o crea una nueva.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Operación</div><h1>Reservas</h1><div class="sub">${rows.length} reserva${rows.length === 1 ? "" : "s"} · ${esc(fechaCorta(RESF.from))} → ${esc(fechaCorta(RESF.to))}</div></div>${toolbar}${table}`;
}
async function loadReservas() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  if (!RESF.from) { RESF.from = todayStr(); RESF.to = addDaysStr(todayStr(), 30); }
  try {
    const qs = new URLSearchParams(); qs.set("from", RESF.from); qs.set("to", RESF.to); if (RESF.local) qs.set("local", RESF.local);
    const data = await api("/api/reservas?" + qs.toString());
    view.innerHTML = renderReservas(data);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function applyReservasFilter() {
  const l = document.getElementById("fLocal"), f = document.getElementById("fFrom"), t = document.getElementById("fTo");
  if (l) RESF.local = l.value; if (f && f.value) RESF.from = f.value; if (t && t.value) RESF.to = t.value;
  loadReservas();
}
function openNuevaReserva() {
  const localOpts = LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
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
const EST_PILL = { "abierta": "bad", "en proceso": "imp", "resuelta": "ok", "cerrada": "ok" };
function renderMant(list) {
  let rows = (list || []).slice();
  if (MANF.estado) rows = rows.filter((r) => (r.estado || "") === MANF.estado);
  rows.sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
  const localOpts = ['<option value="">Todos los locales</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${MANF.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const estOpts = ['<option value="">Todos los estados</option>'].concat(["abierta", "en proceso", "resuelta"].map((e) => `<option value="${e}" ${MANF.estado === e ? "selected" : ""}>${cap(e)}</option>`)).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Local</label><select id="mLocal">${localOpts}</select></div><div class="field"><label>Estado</label><select id="mEstado">${estOpts}</select></div><button class="btn" data-act="mant-filtrar">Buscar</button><div style="flex:1"></div><button class="btn primary" data-act="mant-nueva">+ Nueva incidencia</button></div>`;
  const body = rows.length ? `<div class="card p0"><div class="rows">${rows.map((r) => {
    const est = r.estado || "abierta"; const next = est === "abierta" ? ["en proceso", "Tomar"] : est === "en proceso" ? ["resuelta", "Resolver"] : null;
    return `<div class="row"><div class="grow"><div class="t1">${esc(r.titulo)}</div><div class="t2">${esc(r.local)} · ${esc(fechaCorta((r.creado_en || "").slice(0, 10)))}${r.descripcion ? " · " + esc((r.descripcion || "").slice(0, 80)) : ""}</div></div><span class="pill ${EST_PILL[est] || ""}">${esc(cap(est))}</span>${next ? `<button class="btn" data-act="mant-estado" data-id="${r.id}" data-estado="${next[0]}">${next[1]}</button>` : ""}</div>`;
  }).join("")}</div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin incidencias con esos filtros.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Operación</div><h1>Mantenimiento</h1><div class="sub">${rows.length} incidencia${rows.length === 1 ? "" : "s"}</div></div>${toolbar}${body}`;
}
async function loadMant() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const qs = MANF.local ? "?local=" + encodeURIComponent(MANF.local) : ""; const data = await api("/api/maintenance" + qs); view.innerHTML = renderMant(data); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function applyMantFilter() { const l = document.getElementById("mLocal"), es = document.getElementById("mEstado"); if (l) MANF.local = l.value; if (es) MANF.estado = es.value; loadMant(); }
async function mantEstado(id, estado) { try { await apiSend("PUT", "/api/maintenance/" + encodeURIComponent(id), { estado }); toast("Incidencia actualizada ✅"); loadMant(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
function openNuevaIncidencia() {
  const localOpts = LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const body = `<form id="fInc"><div class="form-grid"><div class="field full"><label>Local</label><select name="local" required>${localOpts}</select></div><div class="field full"><label>Título</label><input type="text" name="titulo" required></div><div class="field full"><label>Descripción</label><input type="text" name="descripcion" required></div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Crear incidencia</button></div></form>`;
  const ov = modal("Nueva incidencia", body);
  ov.querySelector("#fInc").addEventListener("submit", async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries()); try { await apiSend("POST", "/api/maintenance", data); ov.remove(); toast("Incidencia creada ✅"); loadMant(); } catch (err) { toast("Error: " + err.message); } });
}

// ════════════════════════ VISTA: CLIENTES ════════════════════════
let CLIF = { q: "", poblacion: "", local: "", cumple: false, con_email: false, con_telefono: false, excluir_baja: false };
let CLI_TOTAL = 0;
async function apiRaw(path) { const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } }); if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; throw new Error("noauth"); } const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error"); return j; }
function cliQS() { const qs = new URLSearchParams(); if (CLIF.q) qs.set("q", CLIF.q); if (CLIF.poblacion) qs.set("poblacion", CLIF.poblacion); if (CLIF.local) qs.set("local", CLIF.local); if (CLIF.cumple) qs.set("cumple_mes", "1"); if (CLIF.con_email) qs.set("con_email", "1"); if (CLIF.con_telefono) qs.set("con_telefono", "1"); if (CLIF.excluir_baja) qs.set("excluir_baja", "1"); return qs.toString(); }
function cliChk(id, campo, label) { return `<label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" id="${id}" ${CLIF[campo] ? "checked" : ""} style="width:auto;height:auto"> ${esc(label)}</label>`; }
function renderClientes(j) {
  const rows = j.data || []; const total = j.total != null ? j.total : rows.length; CLI_TOTAL = total;
  const localOpts = ['<option value="">Cualquier local</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${CLIF.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Buscar</label><input id="cQ" placeholder="Nombre, teléfono, email…" value="${esc(CLIF.q)}"></div><div class="field"><label>Población</label><input id="cPob" value="${esc(CLIF.poblacion)}"></div><div class="field"><label>Local</label><select id="cLocal">${localOpts}</select></div>${cliChk("cCumple", "cumple", "Cumple este mes")}${cliChk("cEmail", "con_email", "Con email")}${cliChk("cTel", "con_telefono", "Con teléfono")}${cliChk("cBaja", "excluir_baja", "Excluir bajas")}<button class="btn" data-act="cli-filtrar">Buscar</button></div>`;
  const actionsBar = `<div class="toolbar" style="margin-top:-6px"><button class="btn primary" data-act="cli-masivo" ${total ? "" : "disabled"}>${ic("chat", 15)} Escribir a los ${num(total)} filtrados (WhatsApp)</button><button class="btn" data-act="cli-masivo-email" disabled title="Se activa al configurar el email">Enviar email a los filtrados</button><div style="flex:1"></div><button class="btn" data-act="cli-csv">Exportar CSV</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Población</th><th>Origen</th><th>Última visita</th><th></th></tr></thead><tbody>${rows.map((c) => {
    const tel = c.telefono || ""; const nom = ((c.nombre || "") + " " + (c.apellidos || "")).trim() || "—";
    const baja = c.baja === 1 || c.baja === true;
    const wa = c.es_contacto_wa ? '<span class="sdot" title="Tiene WhatsApp" style="display:inline-block;width:7px;height:7px;border-radius:999px;background:var(--success);margin-left:6px"></span>' : "";
    const acc = `<div style="display:flex;gap:4px;justify-content:flex-end">${tel ? `<button class="btn sm" data-act="cli-wa" data-tel="${esc(tel)}" data-nombre="${esc(nom)}" title="Escribir por WhatsApp">${ic("chat", 14)}</button><a class="btn sm" href="tel:${esc(tel)}" title="Llamar">${ic("bell", 14)}</a>` : ""}${c.correo ? `<a class="btn sm" href="mailto:${esc(c.correo)}" title="Enviar email">@</a>` : ""}<button class="btn sm" data-act="cli-ficha" data-tel="${esc(tel)}" title="Ver ficha">Ficha</button></div>`;
    return `<tr><td>${esc(nom)}${wa}${baja ? ' <span class="pill bad" style="font-size:10px">Baja</span>' : ""}</td><td class="mut">${esc(tel)}</td><td class="mut">${esc(c.correo || "")}</td><td>${esc(c.poblacion || "")}</td><td>${esc(c.origen || "")}</td><td class="mut">${esc((c.ultima_actividad || "").slice(0, 10))}</td><td>${acc}</td></tr>`;
  }).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin clientes con esos filtros.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Base de clientes</div><h1>Clientes</h1><div class="sub">${num(total)} contacto${total === 1 ? "" : "s"}${rows.length < total ? ` · mostrando ${rows.length}` : ""}</div></div>${toolbar}${actionsBar}${table}`;
}
async function loadClientes() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const j = await apiRaw("/api/contactos" + (cliQS() ? "?" + cliQS() : "")); view.innerHTML = renderClientes(j); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function applyCliFilter() {
  const q = document.getElementById("cQ"), p = document.getElementById("cPob"), l = document.getElementById("cLocal");
  if (q) CLIF.q = q.value.trim(); if (p) CLIF.poblacion = p.value.trim(); if (l) CLIF.local = l.value;
  CLIF.cumple = !!(document.getElementById("cCumple") || {}).checked;
  CLIF.con_email = !!(document.getElementById("cEmail") || {}).checked;
  CLIF.con_telefono = !!(document.getElementById("cTel") || {}).checked;
  CLIF.excluir_baja = !!(document.getElementById("cBaja") || {}).checked;
  loadClientes();
}
async function downloadClientesCsv() { try { const r = await fetch("/api/leads/export.csv" + (cliQS() ? "?" + cliQS() : ""), { headers: { Authorization: "Bearer " + token() } }); if (!r.ok) { toast("No se pudo exportar"); return; } const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "clientes.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); } catch { toast("No se pudo exportar"); } }
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
    <div class="card" style="padding:12px 14px"><div class="t2">${esc(tel)}${d.es_contacto_wa ? " · tiene WhatsApp" : ""}</div><div style="margin-top:4px">${esc(d.correo || "Sin email")} · ${esc(d.poblacion || "Sin población")} · ${d.visitas} visita(s)${d.ultimo_local ? " · último: " + esc(d.ultimo_local) : ""}</div></div>
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
let REVF = { rating: "", local: "", estado: "" };
let REV_DATA = [], REV_LOCALES = [], REV_SEL = new Set();

function renderReviews() {
  const rows = REV_DATA;
  const puedeActualizar = USER.rol === "direccion";
  const chip = (val, label, on) => `<button class="chip ${on ? "on" : ""}" data-act="rev-local" data-local="${esc(val)}">${esc(label)}</button>`;
  const selector = REV_LOCALES.length > 1 ? `<div class="chips">${chip("", "Todos", !REVF.local)}${REV_LOCALES.map((l) => chip(l, nombreCortoLocal(l), REVF.local === l)).join("")}</div>` : "";
  const estadoOpts = [["", "Todas"], ["pendientes", "Pendientes"], ["respondidas", "Respondidas"]].map(([v, t]) => `<option value="${v}" ${REVF.estado === v ? "selected" : ""}>${t}</option>`).join("");
  const ratingOpts = ['<option value="">Todas</option>'].concat([5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${REVF.rating === String(n) ? "selected" : ""}>${n}★</option>`)).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Estado</label><select id="rEstado">${estadoOpts}</select></div><div class="field"><label>Puntuación</label><select id="rRating">${ratingOpts}</select></div><button class="btn" data-act="rev-filtrar">Filtrar</button><div style="flex:1"></div>${puedeActualizar ? '<button class="btn primary" data-act="rev-refresh">Actualizar desde Google</button>' : ""}</div>`;
  const nota = `<div class="pendingblock" style="margin-bottom:16px"><b>Responder en Google, muy pronto.</b> La publicación directa está pendiente de que Google apruebe la cuota de su API. Mientras tanto: redacta la respuesta (con IA si quieres), <b>guárdala</b> aquí y usa <b>Copiar</b> para pegarla en Google.</div>`;
  const bulk = REV_SEL.size ? `<div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><b>${REV_SEL.size} seleccionada${REV_SEL.size === 1 ? "" : "s"}</b><div style="flex:1"></div><button class="btn" data-act="rev-sel-none">Quitar selección</button><button class="btn primary" data-act="rev-bulk">✨ Generar borradores IA</button></div>` : "";
  const body = rows.length ? rows.map(reviewCard).join("") : `<div class="card"><div class="mut" style="padding:8px">${REV_LOCALES.length ? "Sin reseñas con este filtro." : "Aún no hay reseñas importadas. Pulsa «Actualizar desde Google» (requiere que la conexión y la cuota de Google estén activas)."}</div></div>`;
  return `<div class="ph"><div class="eyebrow">Reputación</div><h1>Reseñas de Google</h1><div class="sub">Opiniones por local · responde una a una o en lote</div></div>${nota}${selector}${toolbar}${bulk}${body}`;
}

function reviewCard(r) {
  const badge = r.respondida ? '<span class="badge">Respondida</span>' : '<span class="badge warn">Pendiente</span>';
  const check = r.respondida ? "" : `<input type="checkbox" class="revsel" data-act="rev-sel" data-id="${esc(r.id)}" ${REV_SEL.has(String(r.id)) ? "checked" : ""} aria-label="Seleccionar reseña">`;
  const stars = `<span class="stars">${"★".repeat(r.rating)}<span class="mut">${"★".repeat(5 - r.rating)}</span></span>`;
  return `<div class="card revcard ${r.negativa ? "neg" : ""}" style="margin-bottom:12px"><div style="display:flex;gap:12px;align-items:flex-start">${check}<div class="grow" style="min-width:0;flex:1">
    <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">${stars}<b>${esc(r.author)}</b><span class="mut" style="font-size:12px">· ${esc(r.local)} · ${esc(r.fecha)}</span><span style="flex:1"></span>${badge}</div>
    ${r.text ? `<p style="margin:8px 0 0;font-size:13.5px;line-height:1.5">${esc(r.text)}</p>` : '<p class="mut" style="margin:8px 0 0;font-size:13px">(sin texto, solo puntuación)</p>'}
    ${r.reply ? `<div class="revreply"><span class="k">Tu respuesta</span><span>${esc(r.reply)}</span></div>` : ""}
    <div style="margin-top:10px;display:flex;gap:8px"><button class="btn sm" data-act="rev-responder" data-id="${esc(r.id)}">${r.respondida ? "Editar respuesta" : "Responder"}</button></div>
  </div></div></div>`;
}

async function loadReviews() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const qs = new URLSearchParams();
    if (REVF.local) qs.set("local", REVF.local);
    if (REVF.rating) qs.set("rating", REVF.rating);
    if (REVF.estado) qs.set("estado", REVF.estado);
    const j = await apiSend("GET", "/api/reviews/manage" + (qs.toString() ? "?" + qs.toString() : ""));
    REV_DATA = j.data || []; REV_LOCALES = j.locales || []; REV_SEL.clear();
    view.innerHTML = renderReviews();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function applyRevFilter() { const rt = document.getElementById("rRating"), es = document.getElementById("rEstado"); if (rt) REVF.rating = rt.value; if (es) REVF.estado = es.value; loadReviews(); }
async function refreshReviews() { toast("Actualizando reseñas…"); try { await apiSend("POST", "/api/reviews/refresh"); toast("Reseñas actualizadas ✅"); loadReviews(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
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
let RRSEG = { workers: [], llamadas: [], preguntas: [], sel: null, notas: [], mes: rrMesActual() };
let RRPREG = { mes: rrMesActual(), preguntas: [] };
function rrParseResp(v) { if (!v) return []; if (Array.isArray(v)) return v; try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
function rrTabs() {
  const T = [["candidaturas", "Candidaturas"], ["seguimiento", "Seguimiento"], ["vacantes", "Vacantes"], ["preguntas", "Preguntas del mes"]];
  return `<div class="toolbar" style="margin-bottom:12px">${T.map(([id, lab]) => `<button class="btn ${RRTAB === id ? "primary" : ""}" data-act="rr-tab" data-tab="${id}">${lab}</button>`).join("")}</div>`;
}
function rrPh(sub) { return `<div class="ph"><div class="eyebrow">Personas</div><h1>RR. HH.</h1><div class="sub">${esc(sub)}</div></div>`; }
// ── Candidaturas ──
function renderRRCand(rows) {
  rows = rows || [];
  const estOpts = ['<option value="">Todos los estados</option>'].concat(["nuevo", "revisando", "contratada", "descartada"].map((e) => `<option value="${e}" ${RRF.estado === e ? "selected" : ""}>${cap(e)}</option>`)).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Estado</label><select id="rEstado">${estOpts}</select></div><div class="field"><label>Buscar</label><input id="rQ" value="${esc(RRF.q)}" placeholder="Nombre, puesto…"></div><button class="btn" data-act="rr-filtrar">Buscar</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Candidato</th><th>Puesto</th><th>Población</th><th>Estado</th><th>Fecha</th><th>CV</th><th>Mover a</th></tr></thead><tbody>${rows.map((c) => `<tr><td>${esc(c.nombre)}<div class="t2">${esc(c.telefono || "")}</div></td><td>${esc(c.puesto || "")}</td><td>${esc(c.poblacion || "")}</td><td><span class="pill ${CAND_EST[c.estado] || ""}">${esc(cap(c.estado || "nuevo"))}</span></td><td class="mut">${esc((c.creado_en || "").slice(0, 10))}</td><td>${c.cv_url ? `<a class="btn" href="${esc(c.cv_url)}" target="_blank" rel="noopener">Ver ↗</a>` : '<span class="mut">—</span>'}</td><td class="r" style="white-space:nowrap">${["revisando", "contratada", "descartada"].filter((e) => e !== c.estado).map((e) => `<button class="linkbtn" style="color:var(--brand)" data-act="cand-estado" data-id="${c.id}" data-estado="${e}">${cap(e)}</button>`).join(" · ")}</td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin candidaturas con esos filtros.</div></div>`;
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
  return `<div class="card p0"><div class="ch" style="padding:16px 16px 0"><h3>Equipo</h3><button class="btn sm" data-act="rr-worker-add">+ Añadir</button></div>${groups || '<div class="mut" style="padding:14px">Sin trabajadores.</div>'}</div>`;
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
function renderRRFicha() {
  const w = RRSEG.sel;
  if (!w) return `<div class="card" style="min-height:200px;display:grid;place-items:center"><div class="mut">Selecciona un trabajador para ver su ficha, check-in mensual y notas.</div></div>`;
  return `<div class="grid" style="gap:16px"><div class="card hero"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><div class="eyebrow">Ficha</div><h2 style="margin:0;font-size:19px">${esc(w.nombre || w.username || "—")}</h2><div class="t2">${esc(w.rol || "")}${w.local ? " · " + esc(w.local) : ""}${w.username ? " · @" + esc(w.username) : ""}</div></div><button class="btn sm danger" data-act="rr-worker-del" data-id="${w.id}" data-nombre="${esc(w.nombre || w.username || "")}">Eliminar</button></div></div>${renderRRCheckin()}${renderRRNotas()}</div>`;
}
function renderRRSeg() {
  return rrPh("Seguimiento mensual del equipo · " + RRSEG.mes) + rrTabs() + `<div class="rrgrid">${renderRRSegSidebar()}<div id="rrFicha">${renderRRFicha()}</div></div>`;
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
  try {
    if (RRTAB === "candidaturas") {
      const qs = new URLSearchParams(); if (RRF.estado) qs.set("estado", RRF.estado); if (RRF.q) qs.set("q", RRF.q);
      view.innerHTML = renderRRCand(await api("/api/hr/applications" + (qs.toString() ? "?" + qs : "")));
    } else if (RRTAB === "seguimiento") {
      RRSEG.mes = rrMesActual();
      const [workers, llamadas, preguntas] = await Promise.all([api("/api/rrhh/trabajadores"), apiOptional("/api/rrhh/llamadas/" + RRSEG.mes), apiOptional("/api/rrhh/preguntas/" + RRSEG.mes)]);
      RRSEG.workers = workers || []; RRSEG.llamadas = llamadas || []; RRSEG.preguntas = preguntas || [];
      if (RRSEG.sel) { const still = RRSEG.workers.find((w) => String(w.id) === String(RRSEG.sel.id)); RRSEG.sel = still || null; }
      view.innerHTML = renderRRSeg();
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
  RRSEG.sel = w;
  try { RRSEG.notas = (await apiOptional("/api/rrhh/trabajador/" + id + "/notas")) || []; } catch { RRSEG.notas = []; }
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
  const locOpts = LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const ov = modal("Añadir trabajador", `<form id="fWorker" class="grid" style="gap:12px"><div class="field"><label>Nombre</label><input name="nombre" required></div><div class="field"><label>Usuario</label><input name="username" required placeholder="nombre.local"></div><div class="field"><label>Local</label><select name="local">${locOpts}</select></div><div class="field"><label>Rol</label><select name="rol"><option value="trabajador">Trabajador</option><option value="encargado">Encargado</option></select></div><div class="field"><label>Contraseña</label><input name="password" required value="tapeta2024"></div><button class="btn primary" type="submit">Crear</button></form>`);
  ov.querySelector("#fWorker").addEventListener("submit", async (e) => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries());
    try { await apiSend("POST", "/api/users", data); ov.remove(); toast("Trabajador creado ✅"); loadRRHH(); } catch (err) { toast("Error: " + err.message); }
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
function renderUsuarios(list) {
  const rows = list || [];
  const toolbar = `<div class="toolbar"><div style="flex:1"></div><button class="btn primary" data-act="user-nuevo">+ Nuevo usuario</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Local</th><th></th></tr></thead><tbody>${rows.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.nombre || "")}</td><td>${esc(u.rol)}</td><td>${esc(u.local || "")}</td><td class="r" style="white-space:nowrap"><button class="linkbtn" style="color:var(--brand)" data-act="user-pass" data-id="${u.id}" data-nombre="${esc(u.username)}">Contraseña</button> · <button class="linkbtn" data-act="user-del" data-id="${u.id}" data-nombre="${esc(u.username)}">Eliminar</button></td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">No hay usuarios todavía. Crea el primero con «+ Nuevo usuario».</div></div>`;
  return `<div class="ph"><div class="eyebrow">Sistema</div><h1>Usuarios</h1><div class="sub">${rows.length} cuenta${rows.length === 1 ? "" : "s"}</div></div>${toolbar}${table}`;
}
async function loadUsuarios() { const view = document.getElementById("view"); view.innerHTML = skeleton(); try { const data = await api("/api/users"); view.innerHTML = renderUsuarios(data); } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); } }
function openNuevoUsuario() {
  const roles = ["direccion", "encargado", "trabajador", "rrhh", "marketing", "contabilidad"];
  const localOpts = ['<option value="">— sin local —</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`)).join("");
  const body = `<form id="fUser"><div class="form-grid"><div class="field"><label>Usuario</label><input name="username" required></div><div class="field"><label>Nombre</label><input name="nombre"></div><div class="field"><label>Contraseña</label><input name="password" type="text" required></div><div class="field"><label>Rol</label><select name="rol">${roles.map((r) => `<option value="${r}">${r}</option>`).join("")}</select></div><div class="field full"><label>Local</label><select name="local">${localOpts}</select></div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Crear usuario</button></div></form>`;
  const ov = modal("Nuevo usuario", body);
  ov.querySelector("#fUser").addEventListener("submit", async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries()); try { await apiSend("POST", "/api/users", data); ov.remove(); toast("Usuario creado ✅"); loadUsuarios(); } catch (err) { toast("Error: " + err.message); } });
}
async function userPass(id, nombre) { const p = await promptModal(`Nueva contraseña para ${nombre}`, { type: "password", placeholder: "Escribe la nueva contraseña", ok: "Actualizar" }); if (!p) return; try { await apiSend("PUT", "/api/users/" + encodeURIComponent(id) + "/password", { password: p }); toast("Contraseña actualizada ✅"); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function userDel(id, nombre) { if (!(await confirmModal(`¿Eliminar la cuenta ${nombre}? No se puede deshacer.`, { ok: "Eliminar", danger: true }))) return; try { await apiSend("DELETE", "/api/users/" + encodeURIComponent(id)); toast("Usuario eliminado ✅"); loadUsuarios(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }

// ════════════════════════ VISTA: FACTURAS ════════════════════════
let FACF = { local: "" };
let FACTAB = "facturas";
let FCFG = { locales: [], reglas: [], grupos: [], empresas: [], groups: [] };
let FAC303 = { empresa: "", trimestre: "", data: null, error: "" };
function facHeader() { return `<div class="ph"><div class="eyebrow">Contabilidad</div><h1>Facturas</h1><div class="sub">Facturas, asignación y configuración fiscal</div></div><div class="toolbar" style="margin-bottom:12px"><button class="btn ${FACTAB === "facturas" ? "primary" : ""}" data-act="fac-tab" data-tab="facturas">Facturas</button><button class="btn ${FACTAB === "config" ? "primary" : ""}" data-act="fac-tab" data-tab="config">Configuración</button></div>`; }
const eur = (n) => num(Math.round(Number(n) || 0)) + " €";
function renderFacturas(list, pend, stats) {
  const localOpts = ['<option value="">Todos los locales</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${FACF.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const resumen = stats && stats.resumenAnual ? `<div class="grid g4" style="margin-bottom:16px">${stat("Facturas (año)", "🧾", num(stats.resumenAnual.num_docs))}${stat("Base imponible", "€", eur(stats.resumenAnual.base))}${stat("IVA", "€", eur(stats.resumenAnual.iva))}${stat("Total", "€", eur(stats.resumenAnual.total))}</div>` : "";
  const toolbar = `<div class="toolbar"><div class="field"><label>Local</label><select id="facLocal">${localOpts}</select></div><button class="btn" data-act="fac-filtrar">Buscar</button></div>`;
  const pendCard = (pend && pend.length) ? `<div class="card p0" style="margin-bottom:16px"><div class="ch" style="padding:18px 18px 0"><h3>Facturas pendientes de asignar</h3><span class="pill bad">${pend.length}</span></div><div class="rows" style="margin-top:6px">${pend.map((p) => `<div class="row"><div class="grow"><div class="t1">${esc(p.proveedor || "(sin proveedor)")}</div><div class="t2">${esc((p.fecha || "").slice(0, 10))} · ${eur(p.total)}</div></div><select class="facSel" data-id="${p.id}" style="max-width:190px"><option value="">Asignar a…</option>${LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}</select><button class="btn" data-act="fac-asignar" data-id="${p.id}">Asignar</button></div>`).join("")}</div></div>` : "";
  const table = list.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Proveedor</th><th>Local</th><th>Fecha</th><th class="r">Total</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((f) => `<tr><td>${esc(f.proveedor || "")}</td><td>${esc(f.local || "")}</td><td class="mut">${esc((f.fecha || "").slice(0, 10))}</td><td class="r tnum">${eur(f.total)}</td><td><span class="pill ${f.pagado ? "ok" : ""}">${f.pagado ? "Pagada" : "Pendiente"}</span></td><td class="r"><button class="linkbtn" style="color:var(--brand)" data-act="fac-pago" data-id="${f.id}">${f.pagado ? "Marcar impagada" : "Marcar pagada"}</button></td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin facturas.</div></div>`;
  return `${facHeader()}${resumen}${toolbar}${pendCard}${table}`;
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
  const m303res = FAC303.error ? `<div class="mut" style="padding:8px 18px 14px">${esc(FAC303.error)}</div>` : (d ? `<div class="rows">${(d.totales ? `<div class="row"><div class="grow"><div class="t1">Base imponible</div><div class="t2">${num((d.totales.num_facturas) || 0)} facturas</div></div><b class="tnum">${eur(d.totales.base_total || 0)}</b></div><div class="row"><div class="grow"><div class="t1">Cuota de IVA</div></div><b class="tnum">${eur(d.totales.cuota_total || 0)}</b></div><div class="row"><div class="grow"><div class="t1">Total facturas</div></div><b class="tnum">${eur(d.totales.importe_total || 0)}</b></div>` : "")}${(d.otrosDocs && (d.otrosDocs.num_otros) ? `<div class="row"><div class="grow"><div class="t1">Otros documentos</div><div class="t2">${num(d.otrosDocs.num_otros || 0)} docs</div></div><b class="tnum">${eur(d.otrosDocs.total_otros || 0)}</b></div>` : "")}</div>` : `<div class="mut" style="padding:8px 18px 14px">Elige empresa y trimestre y pulsa Calcular.</div>`);
  const empOpts = `<option value="">Empresa…</option>` + (FCFG.empresas || []).map((e) => `<option value="${esc(e)}" ${FAC303.empresa === e ? "selected" : ""}>${esc(e)}</option>`).join("");
  const m303 = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Modelo 303 (IVA trimestral)</h3></div><div class="toolbar" style="padding:12px 18px;margin:0"><select id="m303emp">${empOpts}</select><select id="m303tri"><option value="">Trimestre…</option>${trims.map((t) => `<option value="${t}" ${FAC303.trimestre === t ? "selected" : ""}>${t}º trimestre</option>`).join("")}</select><button class="btn primary" data-act="fac-303">Calcular</button></div>${m303res}</div>`;
  return `${facHeader()}<div class="grid g2">${emp}${reg}</div><div class="grid g2" style="margin-top:16px">${grp}${m303}</div>`;
}

async function loadFacturas() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    if (FACTAB === "config") {
      const [locales, reglas, grupos, empresas, groups] = await Promise.all([
        apiOptional("/api/facturas/locales"), apiOptional("/api/facturas/email-reglas"), apiOptional("/api/facturas/grupos"), apiOptional("/api/facturas/empresas"), apiOptional("/api/whatsapp/groups"),
      ]);
      FCFG = { locales: locales || [], reglas: reglas || [], grupos: grupos || [], empresas: empresas || [], groups: groups || [] };
      view.innerHTML = renderFacturasConfig();
      return;
    }
    const [lst, pend, stats] = await Promise.all([
      api("/api/facturas" + (FACF.local ? "?local=" + encodeURIComponent(FACF.local) : "")),
      apiOptional("/api/facturas/pendientes"),
      apiOptional("/api/facturas/stats"),
    ]);
    view.innerHTML = renderFacturas(lst || [], pend || [], stats);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function facTab(tab) { FACTAB = tab; loadFacturas(); }
function applyFacFilter() { const l = document.getElementById("facLocal"); if (l) FACF.local = l.value; loadFacturas(); }
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
async function facAsignar(id) { const sel = document.querySelector('.facSel[data-id="' + id + '"]'); const local = sel ? sel.value : ""; if (!local) { toast("Elige un local"); return; } try { await apiSend("POST", "/api/facturas/pendientes/" + encodeURIComponent(id) + "/asignar", { local }); toast("Factura asignada a " + local); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }

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
let AGORA = { locales: [], lastSync: null };
function agoraCfgFor(local) { return AGORA.locales.find((x) => x.local === local) || null; }
function renderAgoraRow(local, i) {
  const c = agoraCfgFor(local);
  const est = c && c.estado;
  const alive = est ? est.alive : null;
  const pill = !c ? '<span class="pill">Sin configurar</span>' : (!c.activo ? '<span class="pill">Desactivado</span>' : (alive === true ? '<span class="pill ok">TPV vivo</span>' : alive === false ? '<span class="pill bad">Sin respuesta</span>' : '<span class="pill brand">Activo</span>'));
  const tokPh = c && c.tokenSet ? `${c.tokenHint} · guardado — escribe para cambiar` : "apiToken de Ágora";
  return `<div class="card" data-agrow="${i}"><div class="ch"><h3>${esc(local)}</h3>${pill}</div>
    <div class="toolbar">
      <div class="field grow"><label>Host (DynDNS + puerto)</label><input id="agHost_${i}" value="${esc(c ? c.host : "")}" placeholder="local.chickenkiller.com:8984"></div>
      <div class="field"><label>Local ID (opcional)</label><input id="agLid_${i}" value="${esc(c && c.local_id ? c.local_id : "")}" placeholder="—" style="max-width:120px"></div>
    </div>
    <div class="field" style="width:100%"><label>apiToken</label><input id="agTok_${i}" type="password" autocomplete="off" placeholder="${esc(tokPh)}"></div>
    <div class="toolbar" style="align-items:center">
      <label class="chip" style="cursor:pointer"><input type="checkbox" id="agAct_${i}" ${(!c || c.activo) ? "checked" : ""} style="margin-right:6px">Activo</label>
      <span class="grow"></span>
      <button class="btn" data-act="ag-probe" data-local="${esc(local)}" ${c && c.tokenSet ? "" : "disabled"}>Probar conexión</button>
      <button class="btn primary" data-act="ag-save" data-local="${esc(local)}" data-i="${i}">Guardar</button>
      ${c ? `<button class="btn sm danger" data-act="ag-del" data-local="${esc(local)}">Eliminar</button>` : ""}
    </div>${est && est.ts ? `<div class="mut" style="font-size:12px;margin-top:2px">Última comprobación: ${esc(String(est.ts).slice(0, 16).replace("T", " "))}</div>` : ""}</div>`;
}
function renderAgora() {
  const head = `<div class="ph"><div class="eyebrow">Sistema · Integraciones</div><h1>Ágora (TPV)</h1><div class="sub">Conecta el TPV de cada local para traer las ventas. El apiToken se guarda cifrado y nunca se muestra.</div><div class="acts"><button class="btn primary" data-act="ag-sync">Sincronizar ventas ahora</button></div></div>`;
  const info = `<div class="card"><div class="mut" style="font-size:13px">El servidor del TPV solo responde con el <b>local abierto</b> (programa Ágora encendido). Requisitos: licencia de integración, v6.0.6, DynDNS y el puerto 8984 abierto.${AGORA.lastSync ? ` · Última sincronización: <b>${esc(String(AGORA.lastSync).slice(0, 16).replace("T", " "))}</b>` : " · Aún no se ha sincronizado."}</div></div>`;
  const rows = LOCALES.map((l, i) => renderAgoraRow(l, i)).join("");
  return head + info + `<div class="grid" style="gap:14px;margin-top:6px">${rows}</div>`;
}
async function loadAgora() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const j = await apiRaw("/api/agora/locales");
    AGORA.locales = j.data || []; AGORA.lastSync = j.lastSync || null;
    view.innerHTML = renderAgora();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
async function agoraSave(local, i) {
  const host = (document.getElementById("agHost_" + i) || {}).value || "";
  const token = (document.getElementById("agTok_" + i) || {}).value || "";
  const local_id = (document.getElementById("agLid_" + i) || {}).value || "";
  const activo = (document.getElementById("agAct_" + i) || {}).checked ? 1 : 0;
  if (!host.trim()) { toast("Pon el host del TPV"); return; }
  try { await apiSend("POST", "/api/agora/locales", { local, host: host.trim(), token: token.trim(), local_id: local_id.trim(), activo }); toast("Configuración guardada ✅"); loadAgora(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
}
async function agoraProbe(local) {
  toast("Probando conexión…");
  try { const j = await apiSend("POST", "/api/agora/probe", { local }); toast(j.alive ? "✅ " + (j.mensaje || "El TPV respondió") : "⚠ " + (j.mensaje || "Sin respuesta")); loadAgora(); }
  catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); }
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

// ════════════════════════ VISTA: CAMPAÑAS ════════════════════════
let CAMP = { list: [], plantillas: [], cfg: { cumple_auto: false, cumple_plantilla: "" } };
const CAMP_EST = { borrador: "", programada: "info", enviando: "warn", enviada: "ok" };
function renderCampanas() {
  const rows = CAMP.list || []; const cfg = CAMP.cfg || {};
  const head = `<div class="ph"><div class="eyebrow">Marketing</div><h1>Campañas</h1><div class="sub">Segmentar y enviar por WhatsApp · plantillas · programación · cumpleaños</div><div class="acts"><button class="btn primary" data-act="camp-nueva">+ Nueva campaña</button></div></div>`;
  const cumple = `<div class="card"><div class="ch"><h3>🎂 Cumpleaños automático</h3><label class="chip" style="cursor:pointer"><input type="checkbox" id="cumpleAuto" ${cfg.cumple_auto ? "checked" : ""} style="margin-right:6px">Activado</label></div><div class="field" style="width:100%"><label>Mensaje (usa {nombre})</label><textarea id="cumpleMsg" rows="2" placeholder="¡Feliz cumpleaños, {nombre}! 🎉">${esc(cfg.cumple_plantilla || "")}</textarea></div><div class="toolbar" style="padding:0"><button class="btn" data-act="camp-cumple-save">Guardar</button><span class="mut" style="font-size:12px;align-self:center">Cada mañana felicita a quien cumple ese día (excluye bajas).</span></div></div>`;
  const plist = (CAMP.plantillas || []).map((p) => `<div class="row"><div class="grow" style="min-width:0"><div class="t1">${esc(p.nombre)}</div><div class="t2">${esc((p.cuerpo || "").slice(0, 80))}</div></div><button class="btn sm danger" data-act="camp-plant-del" data-id="${p.id}">✕</button></div>`).join("") || `<div class="mut" style="padding:10px 14px">Sin plantillas guardadas.</div>`;
  const plantillas = `<div class="card p0"><div class="ch" style="padding:16px 16px 0"><h3>Plantillas</h3><button class="btn sm" data-act="camp-plant-add">+ Nueva</button></div><div class="rows">${plist}</div></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Campaña</th><th>Segmento</th><th>Estado</th><th class="r">Env.</th><th class="r">Err.</th><th>Fecha</th><th></th></tr></thead><tbody>${rows.map((c) => {
    let seg = ""; try { const s = JSON.parse(c.segmento_json || "{}"); seg = Object.entries(s).filter(([k, v]) => v && k !== "excluir_baja" && k !== "soloOptIn").map(([k, v]) => `${k}: ${v}`).join(", "); } catch { /* */ }
    const est = c.estado || "enviada";
    const acc = `<button class="linkbtn" style="color:var(--brand)" data-act="camp-detalle" data-id="${c.id}">Detalle</button>${(est === "borrador" || est === "programada") ? ` · <button class="linkbtn" style="color:var(--brand)" data-act="camp-enviar" data-id="${c.id}">Enviar</button>` : ""} · <button class="linkbtn" style="color:var(--danger)" data-act="camp-del" data-id="${c.id}">Eliminar</button>`;
    return `<tr><td>${esc(c.nombre)}${c.canal === "email" ? " 📧" : ""}</td><td class="mut">${esc(seg || "—")}</td><td><span class="pill ${CAMP_EST[est] || ""}">${cap(est)}</span>${(est === "programada" && c.programada_para) ? `<div class="t2">${esc(String(c.programada_para).slice(0, 16).replace("T", " "))}</div>` : ""}</td><td class="r tnum">${num(c.total_enviados)}</td><td class="r tnum">${num(c.total_errores || 0)}</td><td class="mut">${esc((c.creado_en || "").slice(0, 10))}</td><td class="r" style="white-space:nowrap">${acc}</td></tr>`;
  }).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Aún no hay campañas.</div></div>`;
  return `${head}<div class="grid g2">${cumple}${plantillas}</div><div style="margin-top:16px">${table}</div>`;
}
async function loadCampanas() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const [list, plantillas] = await Promise.all([api("/api/campanas"), apiOptional("/api/plantillas")]);
    CAMP.list = list || []; CAMP.plantillas = plantillas || [];
    try { const j = await apiRaw("/api/campanas-config"); CAMP.cfg = { cumple_auto: j.cumple_auto, cumple_plantilla: j.cumple_plantilla }; } catch { CAMP.cfg = { cumple_auto: false, cumple_plantilla: "" }; }
    view.innerHTML = renderCampanas();
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function openNuevaCampana() {
  const localOpts = ['<option value="">Todos los locales</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`)).join("");
  const plantOpts = ['<option value="">— Insertar plantilla (opcional) —</option>'].concat((CAMP.plantillas || []).map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`)).join("");
  const body = `<form id="fCamp"><div class="form-grid">
    <div class="field full"><label>Nombre de la campaña</label><input name="nombre" required></div>
    <div class="field full"><label>Plantilla</label><select id="campPlant">${plantOpts}</select></div>
    <div class="field full"><label>Mensaje</label><textarea name="mensaje" id="campMsg" rows="3" required placeholder="Hola {nombre}! Este finde…"></textarea></div>
    <div class="field"><label>Género</label><select name="genero"><option value="">Todos</option><option value="M">Hombre</option><option value="F">Mujer</option></select></div>
    <div class="field"><label>Población</label><input name="poblacion"></div>
    <div class="field"><label>Local</label><select name="local">${localOpts}</select></div>
    <label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" name="cumple_mes" style="width:auto;height:auto"> Cumpleaños este mes</label>
    <label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" id="campOptin" style="width:auto;height:auto"> Solo opt-in</label>
    <div class="field"><label>Programar para (opcional)</label><input type="datetime-local" id="campWhen"></div>
  </div><div id="campPrev" class="mut" style="margin-top:12px;font-size:12.5px"></div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap"><button type="button" class="btn" data-close>Cerrar</button><button type="button" class="btn" id="campPrevBtn">Previsualizar</button><button type="button" class="btn" id="campBorrador">Guardar borrador</button><button type="button" class="btn" id="campProg">Programar</button><button type="button" class="btn primary" id="campEnviarYa">Enviar ya</button></div></form>`;
  const ov = modal("Nueva campaña", body);
  const seg = (form) => { const d = Object.fromEntries(new FormData(form).entries()); if (!d.cumple_mes) delete d.cumple_mes; else d.cumple_mes = String(new Date().getMonth() + 1); return d; };
  ov.querySelector("#campPlant").addEventListener("change", (e) => { const p = (CAMP.plantillas || []).find((x) => String(x.id) === e.target.value); if (p) ov.querySelector("#campMsg").value = p.cuerpo; });
  ov.querySelector("#campPrevBtn").addEventListener("click", async () => { try { const j = await apiSend("POST", "/api/campanas/preview", seg(ov.querySelector("#fCamp"))); ov.querySelector("#campPrev").textContent = `Se enviaría a ~${j.total} contacto(s) (antes de excluir bajas/sin teléfono).`; } catch (e) { toast("Error: " + e.message); } });
  const lanzar = async (accion) => {
    const d = seg(ov.querySelector("#fCamp"));
    if (!d.nombre || !d.mensaje) { toast("Pon nombre y mensaje"); return; }
    d.accion = accion; d.soloOptIn = ov.querySelector("#campOptin").checked;
    if (accion === "programar") { const w = ov.querySelector("#campWhen").value; if (!w) { toast("Elige fecha y hora"); return; } d.programada_para = w; }
    if (accion === "enviar") { if (!(await confirmModal("¿Enviar esta campaña ahora por WhatsApp?", { ok: "Enviar" }))) return; }
    try { const j = await apiSend("POST", "/api/campanas", d); ov.remove(); toast(accion === "enviar" ? `Enviando a ${j.enviables} contacto(s) ✅` : accion === "programar" ? "Campaña programada ✅" : "Borrador guardado ✅"); loadCampanas(); }
    catch (e) { toast("Error: " + e.message); }
  };
  ov.querySelector("#campBorrador").addEventListener("click", () => lanzar("borrador"));
  ov.querySelector("#campProg").addEventListener("click", () => lanzar("programar"));
  ov.querySelector("#campEnviarYa").addEventListener("click", () => lanzar("enviar"));
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
const VIEWS = { dashboard: loadDashboard, reservas: loadReservas, comunicados: loadComunicados, mantenimiento: loadMant, clientes: loadClientes, reviews: loadReviews, campanas: loadCampanas, rrhh: loadRRHH, facturas: loadFacturas, sara: loadSara, agora: loadAgora, whatsapp: loadWhatsApp, usuarios: loadUsuarios, web: loadWeb };
function go(view) {
  if (!VIEWS[view]) view = "dashboard";
  CURRENT = view;
  if (VIEW_ROLES[view] && !VIEW_ROLES[view].includes(USER.rol)) {
    document.getElementById("root").innerHTML = shell(view, `<div class="card"><div class="ch"><h3>Sin acceso</h3></div><p class="mut">Tu rol no tiene acceso a este módulo.</p></div>`);
    refreshWaPill(); return;
  }
  document.getElementById("root").innerHTML = shell(view, skeleton());
  refreshWaPill();
  VIEWS[view]();
}

document.addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]"); if (v) { e.preventDefault(); const a = document.getElementById("appEl"); if (a) a.classList.remove("mopen"); go(v.getAttribute("data-view")); return; }
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.getAttribute("data-act");
  if (act === "mtoggle") { const a = document.getElementById("appEl"); if (!a) return; if (window.innerWidth <= 820) a.classList.toggle("mopen"); else { COLLAPSED = !COLLAPSED; a.classList.toggle("collapsed"); } }
  else if (act === "mclose") { const a = document.getElementById("appEl"); if (a) a.classList.remove("mopen"); }
  else if (act === "cmdk") openCmd();
  else if (act === "estabmenu") openEstabMenu();
  else if (act === "estab-pick") { DASH_LOCAL = t.getAttribute("data-local") || ""; closeDrawer(); go("dashboard"); }
  else if (act === "period") { PERIOD = t.getAttribute("data-p"); document.querySelectorAll('.seg [data-act="period"]').forEach((b) => b.classList.toggle("on", b.getAttribute("data-p") === PERIOD)); if (CURRENT === "dashboard") loadDashboard(); }
  else if (act === "theme") toggleTheme();
  else if (act === "logout") { localStorage.removeItem("token"); location.href = "/login.html"; }
  else if (act === "reload") go(CURRENT);
  else if (act === "filtrar") applyReservasFilter();
  else if (act === "nueva") openNuevaReserva();
  else if (act === "csv") downloadCsv();
  else if (act === "cancel") cancelReserva(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "mant-filtrar") applyMantFilter();
  else if (act === "mant-nueva") openNuevaIncidencia();
  else if (act === "mant-estado") mantEstado(t.getAttribute("data-id"), t.getAttribute("data-estado"));
  else if (act === "cli-filtrar") applyCliFilter();
  else if (act === "cli-csv") downloadClientesCsv();
  else if (act === "cli-wa") cliWa(t.getAttribute("data-tel"), t.getAttribute("data-nombre"));
  else if (act === "cli-ficha") cliFicha(t.getAttribute("data-tel"));
  else if (act === "cli-masivo") cliMasivo();
  else if (act === "rev-filtrar") applyRevFilter();
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
  else if (act === "user-pass") userPass(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "user-del") userDel(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "fac-filtrar") applyFacFilter();
  else if (act === "fac-pago") facPago(t.getAttribute("data-id"));
  else if (act === "fac-asignar") facAsignar(t.getAttribute("data-id"));
  else if (act === "fac-tab") facTab(t.getAttribute("data-tab"));
  else if (act === "fac-loc-add") facLocAdd();
  else if (act === "fac-loc-del") facLocDel(t.getAttribute("data-local"));
  else if (act === "fac-mail-add") facMailAdd();
  else if (act === "fac-mail-del") facMailDel(t.getAttribute("data-id"));
  else if (act === "fac-grp-add") facGrpAdd();
  else if (act === "fac-grp-del") facGrpDel(t.getAttribute("data-id"));
  else if (act === "fac-303") fac303();
  else if (act === "com-add") comAdd();
  else if (act === "ag-save") agoraSave(t.getAttribute("data-local"), t.getAttribute("data-i"));
  else if (act === "ag-probe") agoraProbe(t.getAttribute("data-local"));
  else if (act === "ag-del") agoraDel(t.getAttribute("data-local"));
  else if (act === "ag-sync") agoraSyncNow();
  else if (act === "camp-nueva") openNuevaCampana();
  else if (act === "camp-detalle") campDetalle(t.getAttribute("data-id"));
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
