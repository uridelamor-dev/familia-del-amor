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

// Enlaces de respaldo al panel clásico mientras migramos módulo a módulo.
const CLASSIC = { mantenimiento: "/mantenimiento.html", rrhh: "/rrhh.html", marketing: "/marketing.html", facturas: "/direccion.html", config: "/direccion.html", clientes: "/marketing.html", usuarios: "/direccion.html", reservas: "/encargados.html" };
const NAV = [
  { g: "Resumen", items: [["dashboard", "Dashboard", "📊", null, ["direccion", "encargado", "contabilidad"]]] },
  { g: "Módulos", items: [
    ["reservas", "Reservas", "🍽️", null, ["direccion", "encargado"]],
    ["mantenimiento", "Mantenimiento", "🔧", null, ["direccion", "encargado"]],
    ["clientes", "Clientes", "👥", null, ["direccion"]],
    ["reviews", "Reseñas", "⭐", null, ["direccion", "encargado", "contabilidad"]],
    ["rrhh", "RR. HH.", "🗂️", CLASSIC.rrhh, ["direccion"]],
    ["facturas", "Facturas", "🧾", CLASSIC.facturas, ["direccion", "contabilidad"]],
  ] },
];
const TITLES = { dashboard: "Dashboard", reservas: "Reservas", mantenimiento: "Mantenimiento", clientes: "Clientes", reviews: "Reseñas" };
const VIEW_ROLES = { dashboard: ["direccion", "encargado", "contabilidad"], reservas: ["direccion", "encargado"], mantenimiento: ["direccion", "encargado"], clientes: ["direccion"], reviews: ["direccion", "encargado", "contabilidad"] };

let USER = null, CURRENT = "dashboard";

function setTheme(v) { const r = document.documentElement; if (v === "auto") { r.removeAttribute("data-theme"); localStorage.removeItem("panelTheme"); } else { r.setAttribute("data-theme", v); localStorage.setItem("panelTheme", v); } }
function toggleTheme() { const r = document.documentElement; const dark = r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches); setTheme(dark ? "light" : "dark"); }
(function initTheme() { const t = localStorage.getItem("panelTheme"); if (t) document.documentElement.setAttribute("data-theme", t); })();

function shell(active, bodyHtml) {
  const initials = (USER.nombre || USER.username || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const nav = NAV.map((grp) => {
    const items = grp.items.filter(([, , , , roles]) => !roles || roles.includes(USER.rol));
    if (!items.length) return "";
    return `<div class="ngt">${grp.g}</div>` + items.map(([id, label, ico, ext]) =>
      `<a class="navi ${!ext && id === active ? "active" : ""}" ${ext ? `href="${ext}"` : `data-view="${id}"`}>
        <span class="ico">${ico}</span><span>${label}</span>${ext ? '<span class="ext">↗</span>' : ""}</a>`).join("");
  }).join("");
  return `<div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo">FA</div><div><b>Familia del Amor</b><span>Panel interno</span></div></div>
      <nav class="nav">${nav}</nav>
      <div class="sbf"><a class="navi" href="/direccion.html"><span class="ico">🗔</span><span>Panel completo (clásico)</span><span class="ext">↗</span></a></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div style="font-weight:680;letter-spacing:-.01em">${TITLES[active] || "Panel"}</div>
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
function errorCard(msg) { return `<div class="card"><div class="ch"><h3>No se pudo cargar</h3></div><p class="mut">${esc(msg)}</p><button class="btn primary" data-act="reload">Reintentar</button></div>`; }
function stat(lab, icon, val, unit, sub) {
  return `<div class="card stat"><div class="lab"><span class="ci">${icon}</span>${lab}</div>
    <div class="val tnum">${val}${unit ? ` <small>${unit}</small>` : ""}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}
async function refreshWaPill() {
  try { const r = await fetch("/api/whatsapp/status", { headers: { Authorization: "Bearer " + token() } }); const j = await r.json(); const p = document.getElementById("waPill"); if (!p) return; const ok = j && j.connected; p.className = "pill " + (ok ? "ok" : "bad"); p.textContent = ok ? "WhatsApp OK" : "WhatsApp caído"; } catch { /* opcional */ }
}

// ── Modal ligero ─────────────────────────────────────────────────────────────
function modal(title, bodyHtml) {
  const ov = document.createElement("div"); ov.className = "modal-ov";
  ov.innerHTML = `<div class="modal"><div class="modal-h"><b>${esc(title)}</b><button class="iconbtn" data-close aria-label="Cerrar">✕</button></div><div class="modal-b">${bodyHtml}</div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) ov.remove(); });
  return ov;
}

// ════════════════════════ VISTA: DASHBOARD ════════════════════════
function renderDashboard(d) {
  const wa = d.whatsapp && d.whatsapp.connected;
  const atencion = d.atencion || [];
  const kpis = `<div class="grid g4">
    ${stat("Reservas hoy", "🍽️", num(d.reservas.hoy.n), "", `${num(d.reservas.hoy.personas)} comensales`)}
    ${stat("Próximas (7 días)", "📅", num(d.reservas.proximas7))}
    ${stat("Reseñas Google", "⭐", d.resenas.total ? dec1(d.resenas.media) : "—", d.resenas.total ? "★" : "", `${num(d.resenas.total)} reseñas · ${num(d.resenas.nuevas7)} nuevas`)}
    ${stat("Candidaturas nuevas", "🗂️", num(d.candidaturas.nuevas))}</div>`;
  const atencionCard = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>¿Qué requiere tu atención?</h3><span class="pill ${atencion.some((a) => a.sev === "crit") ? "bad" : ""}">${atencion.length}</span></div>
    <div class="rows" style="margin-top:6px">${atencion.length ? atencion.map((a) => {
      const url = CLASSIC[a.go] || "/direccion.html"; const k = a.sev === "crit" ? "bad" : a.sev === "imp" ? "imp" : "info"; const ic = a.sev === "crit" ? "⚠️" : a.sev === "imp" ? "❗" : "ℹ️";
      return `<div class="att"><div class="ic ${k}">${ic}</div><div class="grow"><b>${esc(a.mensaje)}</b></div><a class="btn" href="${url}">${esc(a.accion)} ↗</a></div>`;
    }).join("") : `<div style="padding:18px" class="mut">Nada urgente. Todo bajo control. ✅</div>`}</div></div>`;
  const estadoCard = `<div class="card"><div class="ch"><h3>Estado</h3></div>
    <div class="rows" style="margin:-4px -18px -18px">
      <div class="row"><div class="grow"><div class="t1">WhatsApp / Sara</div><div class="t2">Reservas automáticas por WhatsApp</div></div><span class="pill ${wa ? "ok" : "bad"}">${wa ? "Conectado" : "Desconectado"}</span></div>
      <div class="row"><div class="grow"><div class="t1">Facturas pendientes</div><div class="t2">Sin asignar a local</div></div><b class="tnum">${num(d.facturas.pendientes)}</b></div>
      <div class="row"><div class="grow"><div class="t1">Mantenimiento abierto</div><div class="t2">${num(d.mantenimiento.antiguas)} lleva(n) demasiado tiempo</div></div><b class="tnum">${num(d.mantenimiento.abiertas)}</b></div>
    </div></div>`;
  const reservasLocal = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Reservas de hoy por local</h3><a class="btn" data-view="reservas">Ver todas</a></div>
    ${d.reservas.porLocal.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th class="r">Reservas</th><th class="r">Comensales</th></tr></thead><tbody>${d.reservas.porLocal.map((r) => `<tr><td>${esc(r.local)}</td><td class="r tnum">${num(r.n)}</td><td class="r tnum">${num(r.personas)}</td></tr>`).join("")}</tbody></table></div>` : '<div style="padding:0 18px 18px" class="mut">No hay reservas para hoy todavía.</div>'}</div>`;
  const incLocal = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Incidencias abiertas por local</h3></div>
    ${d.mantenimiento.porLocal.length ? `<div class="rows" style="margin-top:6px">${d.mantenimiento.porLocal.map((r) => `<div class="row"><div class="grow"><div class="t1">${esc(r.local)}</div></div><b class="tnum">${num(r.n)}</b></div>`).join("")}</div>` : '<div style="padding:0 18px 18px" class="mut">Sin incidencias abiertas. Mantenimiento al día.</div>'}</div>`;
  const resenas = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Reseñas recientes de Google</h3><a class="btn" href="/marketing.html">Gestionar ↗</a></div>
    ${d.resenas.ultimas.length ? `<div class="rows" style="margin-top:6px">${d.resenas.ultimas.map((r) => `<div class="row"><div class="stars">${"★".repeat(Math.max(0, Math.min(5, r.rating || 0)))}</div><div class="grow"><div class="t1">${esc(r.author || "Anónimo")} ${r.location_name ? "· " + esc(r.location_name) : ""}</div><div class="t2">${esc((r.text || "").slice(0, 120))}</div></div></div>`).join("")}</div>` : '<div style="padding:0 18px 18px" class="mut">Sin reseñas recientes.</div>'}</div>`;
  const ventasNote = `<div class="note">💡 <span><b>Ventas y margen por local:</b> conectando el TPV (Ágora). En cuanto esté la integración, verás aquí la facturación y el margen diario de cada local.</span></div>`;
  return `<div class="ph"><div class="eyebrow">Panel de dirección</div><h1>Buenos días${USER.nombre ? ", " + esc(USER.nombre.split(" ")[0]) : ""}</h1><div class="sub">${fechaLarga(d.fecha)} · datos en vivo</div></div>
    ${ventasNote}<div style="height:16px"></div>${kpis}
    <div class="grid g12" style="margin-top:16px">
      <div class="c8">${atencionCard}</div><div class="c4">${estadoCard}</div>
      <div class="c6">${reservasLocal}</div><div class="c6">${incLocal}</div>
      <div class="c12">${resenas}</div></div>`;
}
async function loadDashboard() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const d = await api("/api/dashboard"); view.innerHTML = renderDashboard(d); }
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
  if (!confirm(`¿Cancelar la reserva de ${nombre}? Se avisará al grupo de WhatsApp del local.`)) return;
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
async function mantEstado(id, estado) { try { await apiSend("PUT", "/api/maintenance/" + encodeURIComponent(id), { estado }); toast("Incidencia → " + estado); loadMant(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
function openNuevaIncidencia() {
  const localOpts = LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
  const body = `<form id="fInc"><div class="form-grid"><div class="field full"><label>Local</label><select name="local" required>${localOpts}</select></div><div class="field full"><label>Título</label><input type="text" name="titulo" required></div><div class="field full"><label>Descripción</label><input type="text" name="descripcion" required></div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Crear incidencia</button></div></form>`;
  const ov = modal("Nueva incidencia", body);
  ov.querySelector("#fInc").addEventListener("submit", async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries()); try { await apiSend("POST", "/api/maintenance", data); ov.remove(); toast("Incidencia creada ✅"); loadMant(); } catch (err) { toast("Error: " + err.message); } });
}

// ════════════════════════ VISTA: CLIENTES ════════════════════════
let CLIF = { q: "", poblacion: "", local: "", cumple: false };
async function apiRaw(path) { const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } }); if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; throw new Error("noauth"); } const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error"); return j; }
function cliQS() { const qs = new URLSearchParams(); if (CLIF.q) qs.set("q", CLIF.q); if (CLIF.poblacion) qs.set("poblacion", CLIF.poblacion); if (CLIF.local) qs.set("local", CLIF.local); if (CLIF.cumple) qs.set("cumple_mes", "1"); return qs.toString(); }
function renderClientes(j) {
  const rows = j.data || []; const total = j.total != null ? j.total : rows.length;
  const localOpts = ['<option value="">Cualquier local</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${CLIF.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Buscar</label><input id="cQ" placeholder="Nombre, teléfono, email…" value="${esc(CLIF.q)}"></div><div class="field"><label>Población</label><input id="cPob" value="${esc(CLIF.poblacion)}"></div><div class="field"><label>Local</label><select id="cLocal">${localOpts}</select></div><label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" id="cCumple" ${CLIF.cumple ? "checked" : ""} style="width:auto;height:auto"> Cumple este mes</label><button class="btn" data-act="cli-filtrar">Buscar</button><div style="flex:1"></div><button class="btn" data-act="cli-csv">Exportar CSV</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Población</th><th>Origen</th><th>Última visita</th></tr></thead><tbody>${rows.map((c) => `<tr><td>${esc(((c.nombre || "") + " " + (c.apellidos || "")).trim() || "—")}</td><td class="mut">${esc(c.telefono || "")}</td><td class="mut">${esc(c.correo || "")}</td><td>${esc(c.poblacion || "")}</td><td>${esc(c.origen || "")}</td><td class="mut">${esc((c.ultima_actividad || "").slice(0, 10))}</td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin clientes con esos filtros.</div></div>`;
  return `<div class="ph"><div class="eyebrow">CRM</div><h1>Clientes</h1><div class="sub">${num(total)} contacto${total === 1 ? "" : "s"}${rows.length < total ? ` · mostrando ${rows.length}` : ""}</div></div>${toolbar}${table}`;
}
async function loadClientes() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const j = await apiRaw("/api/contactos" + (cliQS() ? "?" + cliQS() : "")); view.innerHTML = renderClientes(j); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function applyCliFilter() { const q = document.getElementById("cQ"), p = document.getElementById("cPob"), l = document.getElementById("cLocal"), c = document.getElementById("cCumple"); if (q) CLIF.q = q.value.trim(); if (p) CLIF.poblacion = p.value.trim(); if (l) CLIF.local = l.value; if (c) CLIF.cumple = c.checked; loadClientes(); }
async function downloadClientesCsv() { try { const r = await fetch("/api/leads/export.csv" + (cliQS() ? "?" + cliQS() : ""), { headers: { Authorization: "Bearer " + token() } }); if (!r.ok) { toast("No se pudo exportar"); return; } const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "clientes.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); } catch { toast("No se pudo exportar"); } }

// ════════════════════════ VISTA: RESEÑAS ════════════════════════
let REVF = { rating: "" };
function renderReviews(list) {
  let rows = (list || []).slice();
  if (REVF.rating) rows = rows.filter((r) => String(r.rating) === REVF.rating);
  const media = rows.length ? (rows.reduce((s, r) => s + (r.rating || 0), 0) / rows.length) : 0;
  const puedeActualizar = USER.rol === "direccion";
  const ratingOpts = ['<option value="">Todas</option>'].concat([5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${REVF.rating === String(n) ? "selected" : ""}>${n}★</option>`)).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Puntuación</label><select id="rRating">${ratingOpts}</select></div><button class="btn" data-act="rev-filtrar">Filtrar</button><div style="flex:1"></div>${puedeActualizar ? '<button class="btn primary" data-act="rev-refresh">Actualizar desde Google</button>' : ""}</div>`;
  const head = `<div class="grid g4" style="margin-bottom:16px">${stat("Media", "⭐", rows.length ? dec1(media) : "—", rows.length ? "★" : "", `${num(rows.length)} reseñas`)}</div>`;
  const body = rows.length ? `<div class="card p0"><div class="rows">${rows.map((r) => `<div class="row"><div class="stars" style="min-width:70px">${"★".repeat(Math.max(0, Math.min(5, r.rating || 0)))}</div><div class="grow"><div class="t1">${esc(r.author || "Anónimo")} ${r.location_name ? "· " + esc(r.location_name) : ""}</div><div class="t2">${esc(r.text || "")}</div></div><div class="mut" style="font-size:11px">${esc((r.fecha || r.creado_en || "").slice(0, 10))}</div></div>`).join("")}</div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin reseñas con ese filtro.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Reputación</div><h1>Reseñas de Google</h1><div class="sub">Opiniones de los clientes por local</div></div>${head}${toolbar}${body}`;
}
async function loadReviews() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try { const data = await api("/api/reviews?limit=200"); view.innerHTML = renderReviews(data); }
  catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function applyRevFilter() { const r = document.getElementById("rRating"); if (r) REVF.rating = r.value; loadReviews(); }
async function refreshReviews() { toast("Actualizando reseñas…"); try { await apiSend("POST", "/api/reviews/refresh"); toast("Reseñas actualizadas ✅"); loadReviews(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }

// ── Router ───────────────────────────────────────────────────────────────────
const VIEWS = { dashboard: loadDashboard, reservas: loadReservas, mantenimiento: loadMant, clientes: loadClientes, reviews: loadReviews };
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
  const v = e.target.closest("[data-view]"); if (v) { e.preventDefault(); go(v.getAttribute("data-view")); return; }
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.getAttribute("data-act");
  if (act === "theme") toggleTheme();
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
  else if (act === "rev-filtrar") applyRevFilter();
  else if (act === "rev-refresh") refreshReviews();
});

// ── Arranque ─────────────────────────────────────────────────────────────────
requireRole(["direccion", "encargado", "contabilidad"]).then((user) => {
  if (!user) return;
  USER = user;
  go("dashboard");
}).catch(() => { /* requireRole ya redirige a /login.html */ });
