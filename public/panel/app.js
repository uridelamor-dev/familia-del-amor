"use strict";
/* Panel interno (cockpit) — Dashboard ejecutivo con datos REALES.
   Reutiliza el login/sesión existente: requireRole() y el JWT de localStorage (auth.js). */

const nf = new Intl.NumberFormat("es-ES");
const num = (n) => nf.format(Number(n) || 0);
const dec1 = (n) => (Number(n) || 0).toFixed(1).replace(".", ",");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
function fechaLarga(iso) {
  try { return cap(new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso + "T12:00:00"))); }
  catch { return iso; }
}
const token = () => localStorage.getItem("token");

// Fetch principal: si no autorizado, vuelve al login (como authFetch).
async function api(path) {
  const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } });
  if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; throw new Error("noauth"); }
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Error del servidor");
  return j.data;
}
// Fetch opcional (enriquecimiento): nunca redirige ni rompe la sesión.
async function apiOptional(path) {
  try { const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } }); if (!r.ok) return null; const j = await r.json(); return j.ok ? j.data : null; }
  catch { return null; }
}

// Enlaces de respaldo al panel clásico mientras migramos módulo a módulo.
const CLASSIC = {
  mantenimiento: "/mantenimiento.html",
  rrhh: "/rrhh.html",
  marketing: "/marketing.html",
  facturas: "/direccion.html",
  config: "/direccion.html",
  reservas: "/encargados.html",
  clientes: "/marketing.html",
  usuarios: "/direccion.html",
};
const NAV = [
  { g: "Resumen", items: [["dashboard", "Dashboard", "📊", null]] },
  { g: "Módulos", items: [
    ["reservas", "Reservas", "🍽️", CLASSIC.reservas],
    ["mantenimiento", "Mantenimiento", "🔧", CLASSIC.mantenimiento],
    ["clientes", "Clientes", "👥", CLASSIC.clientes],
    ["marketing", "Marketing y reseñas", "📣", CLASSIC.marketing],
    ["rrhh", "RR. HH.", "🗂️", CLASSIC.rrhh],
    ["facturas", "Facturas", "🧾", CLASSIC.facturas],
  ] },
];

let USER = null;
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2400); }

function setTheme(v) { const r = document.documentElement; if (v === "auto") { r.removeAttribute("data-theme"); localStorage.removeItem("panelTheme"); } else { r.setAttribute("data-theme", v); localStorage.setItem("panelTheme", v); } }
function toggleTheme() { const r = document.documentElement; const dark = r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches); setTheme(dark ? "light" : "dark"); }
(function initTheme() { const t = localStorage.getItem("panelTheme"); if (t) document.documentElement.setAttribute("data-theme", t); })();

function shell(bodyHtml) {
  const initials = (USER.nombre || USER.username || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const nav = NAV.map((grp) => `<div class="ngt">${grp.g}</div>` + grp.items.map(([id, label, ico, ext]) =>
    `<a class="navi ${id === "dashboard" ? "active" : ""}" ${ext ? `href="${ext}"` : `data-act="dashboard"`}>
      <span class="ico">${ico}</span><span>${label}</span>${ext ? '<span class="ext">↗</span>' : ""}</a>`).join("")).join("");
  return `<div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo">FA</div><div><b>Familia del Amor</b><span>Panel interno</span></div></div>
      <nav class="nav">${nav}</nav>
      <div class="sbf"><a class="navi" href="/direccion.html"><span class="ico">🗔</span><span>Panel completo (clásico)</span><span class="ext">↗</span></a></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div style="font-weight:680;letter-spacing:-.01em">Dashboard</div>
        <div class="spacer"></div>
        <span id="waPill" class="pill">WhatsApp…</span>
        <button class="iconbtn" data-act="theme" title="Tema" aria-label="Tema">☀️</button>
        <span class="avatar" title="${esc(USER.nombre || USER.username)}">${esc(initials)}</span>
        <button class="iconbtn" data-act="logout" title="Salir" aria-label="Salir">⎋</button>
      </header>
      <main class="content"><div class="wrap" id="view">${bodyHtml}</div></main>
    </div></div>`;
}

function skeleton() {
  return `<div class="ph"><div class="sk" style="width:120px;height:12px;margin-bottom:10px"></div><div class="sk" style="width:280px;height:26px"></div></div>
    <div class="grid g4">${Array(4).fill('<div class="card"><div class="sk" style="width:60%;height:12px"></div><div class="sk" style="width:50%;height:26px;margin-top:12px"></div></div>').join("")}</div>
    <div class="grid g2" style="margin-top:16px">${Array(2).fill('<div class="card"><div class="sk" style="width:40%;height:14px"></div><div class="sk" style="height:120px;margin-top:14px"></div></div>').join("")}</div>`;
}

function stat(lab, icon, val, unit, sub) {
  return `<div class="card stat"><div class="lab"><span class="ci">${icon}</span>${lab}</div>
    <div class="val tnum">${val}${unit ? ` <small>${unit}</small>` : ""}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}

function renderDashboard(d, kpi) {
  const wa = d.whatsapp && d.whatsapp.connected;
  const atencion = d.atencion || [];
  const kpis = `<div class="grid g4">
    ${stat("Reservas hoy", "🍽️", num(d.reservas.hoy.n), "", `${num(d.reservas.hoy.personas)} comensales`)}
    ${stat("Próximas (7 días)", "📅", num(d.reservas.proximas7))}
    ${stat("Reseñas Google", "⭐", d.resenas.total ? dec1(d.resenas.media) : "—", d.resenas.total ? "★" : "", `${num(d.resenas.total)} reseñas · ${num(d.resenas.nuevas7)} nuevas`)}
    ${stat("Candidaturas nuevas", "🗂️", num(d.candidaturas.nuevas))}</div>`;

  const atencionCard = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>¿Qué requiere tu atención?</h3><span class="pill ${atencion.some((a) => a.sev === "crit") ? "bad" : ""}">${atencion.length}</span></div>
    <div class="rows" style="margin-top:6px">${atencion.length ? atencion.map((a) => {
      const url = CLASSIC[a.go] || "/direccion.html";
      const k = a.sev === "crit" ? "bad" : a.sev === "imp" ? "imp" : "info";
      const ic = a.sev === "crit" ? "⚠️" : a.sev === "imp" ? "❗" : "ℹ️";
      return `<div class="att"><div class="ic ${k}">${ic}</div><div class="grow"><b>${esc(a.mensaje)}</b></div><a class="btn" href="${url}">${esc(a.accion)} ↗</a></div>`;
    }).join("") : `<div style="padding:18px" class="mut">Nada urgente. Todo bajo control. ✅</div>`}</div></div>`;

  const estadoCard = `<div class="card"><div class="ch"><h3>Estado</h3></div>
    <div class="rows" style="margin:-4px -18px -18px">
      <div class="row"><div class="grow"><div class="t1">WhatsApp / Sara</div><div class="t2">Reservas automáticas por WhatsApp</div></div><span class="pill ${wa ? "ok" : "bad"}">${wa ? "Conectado" : "Desconectado"}</span></div>
      <div class="row"><div class="grow"><div class="t1">Facturas pendientes</div><div class="t2">Sin asignar a local</div></div><b class="tnum">${num(d.facturas.pendientes)}</b></div>
      <div class="row"><div class="grow"><div class="t1">Mantenimiento abierto</div><div class="t2">${num(d.mantenimiento.antiguas)} lleva(n) demasiado tiempo</div></div><b class="tnum">${num(d.mantenimiento.abiertas)}</b></div>
    </div></div>`;

  const reservasLocal = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Reservas de hoy por local</h3></div>
    ${d.reservas.porLocal.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th class="r">Reservas</th><th class="r">Comensales</th></tr></thead><tbody>${d.reservas.porLocal.map((r) => `<tr><td>${esc(r.local)}</td><td class="r tnum">${num(r.n)}</td><td class="r tnum">${num(r.personas)}</td></tr>`).join("")}</tbody></table></div>` : '<div style="padding:0 18px 18px" class="mut">No hay reservas para hoy todavía.</div>'}</div>`;

  const incLocal = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Incidencias abiertas por local</h3></div>
    ${d.mantenimiento.porLocal.length ? `<div class="rows" style="margin-top:6px">${d.mantenimiento.porLocal.map((r) => `<div class="row"><div class="grow"><div class="t1">${esc(r.local)}</div></div><b class="tnum">${num(r.n)}</b></div>`).join("")}</div>` : '<div style="padding:0 18px 18px" class="mut">Sin incidencias abiertas. Mantenimiento al día.</div>'}</div>`;

  const resenas = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Reseñas recientes de Google</h3><a class="btn" href="/marketing.html">Gestionar ↗</a></div>
    ${d.resenas.ultimas.length ? `<div class="rows" style="margin-top:6px">${d.resenas.ultimas.map((r) => `<div class="row"><div class="stars">${"★".repeat(Math.max(0, Math.min(5, r.rating || 0)))}</div><div class="grow"><div class="t1">${esc(r.author || "Anónimo")} ${r.location_name ? "· " + esc(r.location_name) : ""}</div><div class="t2">${esc((r.text || "").slice(0, 120))}</div></div></div>`).join("")}</div>` : '<div style="padding:0 18px 18px" class="mut">Sin reseñas recientes.</div>'}</div>`;

  const ventasNote = `<div class="note">💡 <span><b>Ventas y margen por local:</b> conectando el TPV (Ágora). En cuanto esté la integración, verás aquí la facturación y el margen diario de cada local.</span></div>`;

  return `<div class="ph"><div class="eyebrow">Panel de dirección</div><h1>Buenos días${USER.nombre ? ", " + esc(USER.nombre.split(" ")[0]) : ""}</h1><div class="sub">${fechaLarga(d.fecha)} · datos en vivo</div></div>
    ${ventasNote}
    <div style="height:16px"></div>${kpis}
    <div class="grid g12" style="margin-top:16px">
      <div class="c8">${atencionCard}</div><div class="c4">${estadoCard}</div>
      <div class="c6">${reservasLocal}</div><div class="c6">${incLocal}</div>
      <div class="c12">${resenas}</div>
    </div>`;
}

async function loadDashboard() {
  const view = document.getElementById("view");
  view.innerHTML = skeleton();
  try {
    const d = await api("/api/dashboard");
    const kpi = (USER.rol === "direccion" || USER.rol === "contabilidad") ? await apiOptional("/api/kpi") : null;
    view.innerHTML = renderDashboard(d, kpi);
    const waPill = document.getElementById("waPill");
    if (waPill) { const ok = d.whatsapp && d.whatsapp.connected; waPill.className = "pill " + (ok ? "ok" : "bad"); waPill.textContent = ok ? "WhatsApp OK" : "WhatsApp caído"; }
  } catch (e) {
    if (e.message === "noauth") return;
    view.innerHTML = `<div class="card"><div class="ch"><h3>No se pudo cargar el dashboard</h3></div><p class="mut">${esc(e.message)}</p><button class="btn primary" data-act="reload">Reintentar</button></div>`;
  }
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.getAttribute("data-act");
  if (act === "theme") { toggleTheme(); }
  else if (act === "logout") { localStorage.removeItem("token"); location.href = "/login.html"; }
  else if (act === "dashboard") { e.preventDefault(); loadDashboard(); }
  else if (act === "reload") { loadDashboard(); }
});

// Arranque: guard de sesión (reutiliza auth.js) y luego render.
requireRole(["direccion", "encargado", "contabilidad"]).then((user) => {
  USER = user;
  document.getElementById("root").innerHTML = shell(skeleton());
  loadDashboard();
}).catch(() => { /* requireRole ya redirige a /login.html */ });
