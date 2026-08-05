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
  { g: "Resumen", items: [["dashboard", "Dashboard", "📊", null, ["direccion", "encargado", "contabilidad"]]] },
  { g: "Módulos", items: [
    ["reservas", "Reservas", "🍽️", null, ["direccion", "encargado"]],
    ["mantenimiento", "Mantenimiento", "🔧", null, ["direccion", "encargado"]],
    ["clientes", "Clientes", "👥", null, ["direccion"]],
    ["reviews", "Reseñas", "⭐", null, ["direccion", "encargado", "contabilidad"]],
    ["campanas", "Campañas", "📣", null, ["direccion"]],
    ["rrhh", "RR. HH.", "🗂️", null, ["direccion"]],
    ["facturas", "Facturas", "🧾", null, ["direccion", "contabilidad"]],
  ] },
  { g: "Sistema", items: [["whatsapp", "WhatsApp", "💬", null, ["direccion", "encargado"]], ["usuarios", "Usuarios", "👤", null, ["direccion"]]] },
];
const TITLES = { dashboard: "Dashboard", reservas: "Reservas", mantenimiento: "Mantenimiento", clientes: "Clientes", reviews: "Reseñas", campanas: "Campañas", rrhh: "RR. HH.", facturas: "Facturas", whatsapp: "WhatsApp", usuarios: "Usuarios" };
const VIEW_ROLES = { dashboard: ["direccion", "encargado", "contabilidad"], reservas: ["direccion", "encargado"], mantenimiento: ["direccion", "encargado"], clientes: ["direccion"], reviews: ["direccion", "encargado", "contabilidad"], campanas: ["direccion"], rrhh: ["direccion"], facturas: ["direccion", "contabilidad"], whatsapp: ["direccion", "encargado"], usuarios: ["direccion"] };

let USER = null, CURRENT = "dashboard";

function setTheme(v) { const r = document.documentElement; if (v === "auto") { r.removeAttribute("data-theme"); localStorage.removeItem("panelTheme"); } else { r.setAttribute("data-theme", v); localStorage.setItem("panelTheme", v); } }
function isDark() { const r = document.documentElement; return r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches); }
function toggleTheme() { setTheme(isDark() ? "light" : "dark"); const b = document.getElementById("themeBtn"); if (b) b.textContent = isDark() ? "🌙" : "☀️"; }
(function initTheme() { const t = localStorage.getItem("panelTheme"); if (t) document.documentElement.setAttribute("data-theme", t); })();

function shell(active, bodyHtml) {
  const initials = (USER.nombre || USER.username || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const nav = NAV.map((grp) => {
    const items = grp.items.filter(([, , , , roles]) => !roles || roles.includes(USER.rol));
    if (!items.length) return "";
    return `<div class="ngt">${grp.g}</div>` + items.map(([id, label, ico]) =>
      `<a class="navi ${id === active ? "active" : ""}" data-view="${id}">
        <span class="ico">${ico}</span><span>${label}</span></a>`).join("");
  }).join("");
  return `<div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo">FA</div><div><b>Familia del Amor</b><span>Panel interno</span></div></div>
      <nav class="nav">${nav}</nav>
      <div class="sbf"><a class="navi" href="/direccion.html"><span class="ico">⚙️</span><span>Ajustes avanzados</span><span class="ext">↗</span></a></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="iconbtn menu" data-act="menu" aria-label="Abrir menú">☰</button>
        <div style="font-weight:680;letter-spacing:-.01em">${TITLES[active] || "Panel"}</div>
        <div class="spacer"></div>
        <span id="waPill" class="pill">WhatsApp…</span>
        <button class="iconbtn" id="themeBtn" data-act="theme" title="Cambiar tema" aria-label="Cambiar tema">${isDark() ? "🌙" : "☀️"}</button>
        <span class="avatar" title="${esc(USER.nombre || USER.username)}">${esc(initials)}</span>
        <button class="iconbtn" data-act="logout" title="Salir" aria-label="Salir">⎋</button>
      </header>
      <main class="content"><div class="wrap" id="view">${bodyHtml}</div></main>
    </div>
    <div class="navov" data-act="navclose" aria-hidden="true"></div></div>`;
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

// ════════════════════════ VISTA: DASHBOARD (periódico ejecutivo) ════════════════════════
let DASH_LOCAL = "";
const nombreCorto = (s) => String(s || "").split(" ")[0];
const GO_VIEW = { whatsapp: "whatsapp", mantenimiento: "mantenimiento", clientes: "clientes", facturas: "facturas", rrhh: "rrhh", marketing: "reviews", reservas: "reservas", reviews: "reviews", campanas: "campanas" };
const CICO = { whatsapp: "💬", mantenimiento: "🔧", facturas: "💶", resenas: "⭐", clientes: "👥", proveedores: "🚚", rrhh: "🧑‍🍳" };
const SEVLAB = { crit: "Crítico", imp: "Importante", info: "A vigilar" };
function saludoHora() { const h = new Date().getHours(); return h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches"; }
function renderDashboard(d) {
  const localName = d.scope && d.scope.local;
  const selector = `<div class="chips">${['<button class="chip ' + (!DASH_LOCAL ? "on" : "") + '" data-act="dash-local" data-local="">Todos</button>'].concat(LOCALES.map((l) => `<button class="chip ${DASH_LOCAL === l ? "on" : ""}" data-act="dash-local" data-local="${esc(l)}">${esc(l)}</button>`)).join("")}</div>`;
  // ── Portada: Sara da su lectura del día (veredicto primero); ayer/hoy como contexto ──
  const contexto = [d.ayer && d.ayer.disponible ? d.ayer.texto : "", d.hoy && d.hoy.disponible ? d.hoy.texto : ""].filter(Boolean).join(" ");
  const hero = `<div class="hero">
    <div class="sarahead"><span class="saraface">S</span><div><div class="sname">Sara · dirección de operaciones</div><div class="mut" style="font-size:12.5px">${saludoHora()}${USER.nombre ? ", " + esc(nombreCorto(USER.nombre)) : ""} · ${fechaLarga(d.fecha)}${localName ? " · <b>" + esc(localName) + "</b>" : ""}</div></div></div>
    <p class="lead" style="margin:16px 0 0">${d.titular || contexto || "Aún sin datos suficientes para hoy."}</p>
    ${contexto ? `<p class="context ${d.hoy && d.hoy.alerta ? "warn" : ""}">${contexto}</p>` : ""}</div>`;
  // ── Lo que me preocupa — Sara razona y decide ──
  const concerns = d.preocupaciones || [];
  const concernsHtml = concerns.length ? concerns.map((c) => {
    const view = GO_VIEW[c.go]; const btn = view ? `<button class="btn" data-view="${view}">Abrir ${TITLES[view] || view}</button>` : "";
    return `<div class="concern ${c.sev}"><div class="stripe"></div><div class="body"><div class="ttl"><span class="cico">${CICO[c.tipo] || "•"}</span><span class="ttx">${c.titulo}</span><span class="sevtag ${c.sev}">${SEVLAB[c.sev] || ""}</span></div><p class="narr">${c.narrativa}</p><div class="decision"><span class="k">Yo haría</span><span class="d">${c.decision}</span></div>${c.impacto ? `<div class="impacto">💡 ${esc(c.impacto)}</div>` : ""}${btn ? `<div style="margin-top:12px">${btn}</div>` : ""}</div></div>`;
  }).join("") : `<div class="card"><p class="lead" style="margin:0">${localName ? `Hoy <b>${esc(localName)}</b> está tranquilo. Nada urgente — buen día para cuidar el servicio y al equipo.` : `Hoy el grupo está tranquilo. Nada que apagar — buen momento para reconocer al equipo o preparar la semana.`}</p></div>`;
  // ── Mi plan para hoy ──
  const agenda = d.agenda || [];
  const agendaHtml = agenda.length ? `<div class="card"><ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:12px">${agenda.map((a) => `<li><b>${esc(a.t)}</b><div class="mut" style="font-size:13px;margin-top:2px;color:var(--ink2)">${a.decision}</div></li>`).join("")}</ol></div>` : "";

  // ── Radar por local (solo vista de grupo): cada local como un negocio ──
  const radar = d.radarLocales || [];
  let radarHtml = "";
  if (!localName && radar.length) {
    radarHtml = `<div class="section-title">Radar por establecimiento</div><div class="card p0"><div class="tblwrap"><table class="tbl radar"><thead><tr><th>Establecimiento</th><th class="r">Hoy (comensales)</th><th class="r">Incidencias abiertas</th><th class="r">Gasto del mes</th><th></th></tr></thead><tbody>${radar.map((r) => `<tr><td><b>${esc(r.local)}</b></td><td class="r tnum">${num(r.hoyPersonas)}</td><td class="r tnum">${r.incidenciasAbiertas > 0 ? `<span class="badge ${r.incidenciasAbiertas >= 3 ? "bad" : "warn"}">${r.incidenciasAbiertas}</span>` : "0"}</td><td class="r tnum">${eur(r.gastoMes)}</td><td class="r"><button class="btn sm" data-act="dash-local" data-local="${esc(r.local)}">Entrar</button></td></tr>`).join("")}</tbody></table></div></div>`;
  }

  // ── Dinero: lo que debo + gasto por local (honesto sobre ventas) ──
  const din = d.dinero || {};
  const pagar = din.porPagar || { total: 0, n: 0 };
  const acre = din.acreedores || [];
  const gl = din.gastoLocal || [];
  const porPagarCard = `<div class="card"><div class="ch"><h3>Lo que debo ahora mismo</h3><button class="btn" data-view="facturas">Facturas</button></div>${pagar.n > 0
    ? `<div style="display:flex;align-items:baseline;gap:10px"><div style="font-size:32px;font-weight:750" class="tnum">${eur(pagar.total)}</div><div class="mut">en ${num(pagar.n)} factura${pagar.n === 1 ? "" : "s"} sin pagar</div></div>${din.masAntigua ? `<div class="callout ${din.masAntigua.dias >= 75 ? "bad" : "warn"}" style="margin-top:10px">La más antigua: <b>${esc(din.masAntigua.proveedor || "—")}</b> · ${eur(din.masAntigua.total)} · lleva <b>${din.masAntigua.dias} días</b> sin pagar</div>` : ""}${acre.length ? `<div class="rows" style="margin-top:10px">${acre.slice(0, 4).map((a) => `<div class="row"><div class="grow"><div class="t1">${esc(a.proveedor)}</div><div class="t2">${a.n} factura${a.n === 1 ? "" : "s"}</div></div><b class="tnum">${eur(a.total)}</b></div>`).join("")}</div>` : ""}`
    : `<p class="lead" style="margin:0">Estás al día: no hay facturas pendientes de pago${localName ? " en este local" : ""}.</p>`}</div>`;
  const gastoCard = gl.length ? `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Gasto por establecimiento (este mes)</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th class="r">Este mes</th><th class="r">vs mes pasado</th></tr></thead><tbody>${gl.map((g) => `<tr><td>${esc(g.local)}</td><td class="r tnum">${eur(g.actual)}</td><td class="r tnum">${g.delta == null ? "<span class='mut'>—</span>" : `<span style="color:${g.delta > 0 ? "var(--danger)" : "var(--brand)"}">${g.delta > 0 ? "+" : ""}${num(g.delta)}%</span>`}</td></tr>`).join("")}</tbody></table></div></div>` : "";
  const dineroNota = `<div class="pendingblock"><b>Ventas y margen todavía no</b> — solo veo gasto. ${esc((din.sinFuente && din.sinFuente.nota) || "")}</div>`;
  const dineroHtml = `<div class="section-title">El dinero</div><div class="grid g2">${porPagarCard}${gastoCard}</div>${dineroNota}`;

  // ── Equipo: incidencias + check-ins (honesto sobre rendimiento) ──
  const eq = d.equipo || {};
  const inc = eq.incidencias || [];
  const ck = eq.checkins;
  const equipoInner = [];
  if (ck && ck.plantilla > 0) { const pct = Math.round((ck.hechos / ck.plantilla) * 100); equipoInner.push(`<div class="card"><div class="ch"><h3>¿He escuchado al equipo?</h3><button class="btn" data-view="rrhh">RR.HH.</button></div><div style="display:flex;align-items:baseline;gap:10px"><div style="font-size:32px;font-weight:750" class="tnum">${ck.hechos}/${ck.plantilla}</div><div class="mut">check-ins este mes</div></div><div class="progress" style="margin-top:10px"><span style="width:${pct}%;background:${pct >= 80 ? "var(--brand)" : pct >= 40 ? "#c99a3a" : "var(--danger)"}"></span></div><div class="mut" style="font-size:12px;margin-top:6px">${ck.hechos >= ck.plantilla ? "Has hablado con todo el equipo. 👏" : `Te faltan ${ck.plantilla - ck.hechos} personas por escuchar.`}</div></div>`); }
  if (inc.length) equipoInner.push(`<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Quién necesita atención</h3></div><div class="rows" style="margin-top:6px">${inc.map((w) => `<div class="row"><div class="grow"><div class="t1">${esc(w.nombre || "—")}</div><div class="t2">${w.local ? esc(w.local) : ""}</div></div><span class="badge ${w.c >= 2 ? "bad" : "warn"}">${w.c} incidencia${w.c === 1 ? "" : "s"}</span></div>`).join("")}</div></div>`);
  const equipoHtml = (equipoInner.length || true) ? `<div class="section-title">El equipo</div>${equipoInner.length ? `<div class="grid g2">${equipoInner.join("")}</div>` : `<div class="card"><p class="lead" style="margin:0">Sin incidencias ni check-ins registrados${localName ? " en este local" : ""} este mes.</p></div>`}<div class="pendingblock"><b>Coste de personal, horas y ausencias todavía no</b> — ${esc((eq.sinFuente && eq.sinFuente.nota) || "")}</div>` : "";

  // ── Clientes: a quién llamar (fuga) + mejores (premiar) ──
  const cl = d.clientes || {};
  const enfr = cl.enfriando || [];
  const mej = cl.mejores || [];
  const cliInner = [];
  if (enfr.length) cliInner.push(`<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>A los que llamaría hoy (se enfrían)</h3></div><div class="rows" style="margin-top:6px">${enfr.slice(0, 6).map((c) => `<div class="row"><div class="grow"><div class="t1">${esc(c.nombre || "—")}</div><div class="t2">${c.visitas} reservas · última ${esc(c.ultima)}${c.local ? " · " + esc(c.local) : ""}</div></div>${c.telefono ? `<a class="btn" href="tel:${esc(c.telefono)}">Llamar</a>` : ""}</div>`).join("")}</div></div>`);
  if (mej.length) cliInner.push(`<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Mis mejores clientes (a cuidar)</h3></div><div class="rows" style="margin-top:6px">${mej.map((c) => `<div class="row"><div class="grow"><div class="t1">${esc(c.nombre || "—")}</div><div class="t2">${c.visitas} reservas · última ${esc(c.ultima)}${c.local ? " · " + esc(c.local) : ""}</div></div>${c.telefono ? `<a class="btn" href="tel:${esc(c.telefono)}">Llamar</a>` : ""}</div>`).join("")}</div></div>`);
  const clientesHtml = cliInner.length ? `<div class="section-title">Los clientes</div><div class="grid g2">${cliInner.join("")}</div>` : "";

  // ── Reputación por local (Google) ──
  const rep = d.reputacionLocales || [];
  const repHtml = rep.length ? `<div class="section-title">Reputación en Google, por local</div><div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>De peor a mejor</h3><button class="btn" data-view="reviews">Ver reseñas</button></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Local (Google)</th><th class="r">Media</th><th class="r">Reseñas</th></tr></thead><tbody>${rep.map((r) => `<tr><td>${esc(r.local)}</td><td class="r tnum"><b style="color:${r.media <= 3.5 ? "var(--danger)" : r.media >= 4.3 ? "var(--brand)" : "inherit"}">${dec1(r.media)}★</b></td><td class="r tnum mut">${num(r.n)}</td></tr>`).join("")}</tbody></table></div></div>` : "";

  return selector + hero +
    `<div class="section-title">Lo que me preocupa</div>${concernsHtml}` +
    (agenda.length ? `<div class="section-title">Mi plan para hoy</div>${agendaHtml}` : "") +
    radarHtml + dineroHtml + equipoHtml + clientesHtml + repHtml;
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
let CLIF = { q: "", poblacion: "", local: "", cumple: false };
async function apiRaw(path) { const r = await fetch(path, { headers: { Authorization: "Bearer " + token() } }); if (r.status === 401 || r.status === 403) { localStorage.removeItem("token"); location.href = "/login.html"; throw new Error("noauth"); } const j = await r.json(); if (!j.ok) throw new Error(j.error || "Error"); return j; }
function cliQS() { const qs = new URLSearchParams(); if (CLIF.q) qs.set("q", CLIF.q); if (CLIF.poblacion) qs.set("poblacion", CLIF.poblacion); if (CLIF.local) qs.set("local", CLIF.local); if (CLIF.cumple) qs.set("cumple_mes", "1"); return qs.toString(); }
function renderClientes(j) {
  const rows = j.data || []; const total = j.total != null ? j.total : rows.length;
  const localOpts = ['<option value="">Cualquier local</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${CLIF.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const toolbar = `<div class="toolbar"><div class="field"><label>Buscar</label><input id="cQ" placeholder="Nombre, teléfono, email…" value="${esc(CLIF.q)}"></div><div class="field"><label>Población</label><input id="cPob" value="${esc(CLIF.poblacion)}"></div><div class="field"><label>Local</label><select id="cLocal">${localOpts}</select></div><label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" id="cCumple" ${CLIF.cumple ? "checked" : ""} style="width:auto;height:auto"> Cumple este mes</label><button class="btn" data-act="cli-filtrar">Buscar</button><div style="flex:1"></div><button class="btn" data-act="cli-csv">Exportar CSV</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Población</th><th>Origen</th><th>Última visita</th></tr></thead><tbody>${rows.map((c) => `<tr><td>${esc(((c.nombre || "") + " " + (c.apellidos || "")).trim() || "—")}</td><td class="mut">${esc(c.telefono || "")}</td><td class="mut">${esc(c.correo || "")}</td><td>${esc(c.poblacion || "")}</td><td>${esc(c.origen || "")}</td><td class="mut">${esc((c.ultima_actividad || "").slice(0, 10))}</td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin clientes con esos filtros.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Base de clientes</div><h1>Clientes</h1><div class="sub">${num(total)} contacto${total === 1 ? "" : "s"}${rows.length < total ? ` · mostrando ${rows.length}` : ""}</div></div>${toolbar}${table}`;
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
  const head = `<div class="grid g4" style="margin-bottom:16px">${stat("Media de las mostradas", "⭐", rows.length ? dec1(media) : "—", rows.length ? "★" : "", `${num(rows.length)} reseñas · la media oficial por local está en el Dashboard`)}</div>`;
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

// ════════════════════════ VISTA: RR. HH. ════════════════════════
let RRTAB = "candidaturas", RRF = { estado: "", q: "" };
const CAND_EST = { nuevo: "info", revisando: "imp", contratada: "ok", descartada: "bad" };
function renderRRHH(data) {
  const tabs = `<div class="toolbar" style="margin-bottom:12px"><button class="btn ${RRTAB === "candidaturas" ? "primary" : ""}" data-act="rr-tab" data-tab="candidaturas">Candidaturas</button><button class="btn ${RRTAB === "trabajadores" ? "primary" : ""}" data-act="rr-tab" data-tab="trabajadores">Trabajadores</button></div>`;
  let body;
  if (RRTAB === "candidaturas") {
    const rows = data || [];
    const estOpts = ['<option value="">Todos los estados</option>'].concat(["nuevo", "revisando", "contratada", "descartada"].map((e) => `<option value="${e}" ${RRF.estado === e ? "selected" : ""}>${cap(e)}</option>`)).join("");
    const toolbar = `<div class="toolbar"><div class="field"><label>Estado</label><select id="rEstado">${estOpts}</select></div><div class="field"><label>Buscar</label><input id="rQ" value="${esc(RRF.q)}" placeholder="Nombre, puesto…"></div><button class="btn" data-act="rr-filtrar">Buscar</button></div>`;
    const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Candidato</th><th>Puesto</th><th>Población</th><th>Estado</th><th>Fecha</th><th>CV</th><th>Mover a</th></tr></thead><tbody>${rows.map((c) => `<tr><td>${esc(c.nombre)}<div class="t2">${esc(c.telefono || "")}</div></td><td>${esc(c.puesto || "")}</td><td>${esc(c.poblacion || "")}</td><td><span class="pill ${CAND_EST[c.estado] || ""}">${esc(cap(c.estado || "nuevo"))}</span></td><td class="mut">${esc((c.creado_en || "").slice(0, 10))}</td><td>${c.cv_url ? `<a class="btn" href="${esc(c.cv_url)}" target="_blank" rel="noopener">Ver ↗</a>` : '<span class="mut">—</span>'}</td><td class="r" style="white-space:nowrap">${["revisando", "contratada", "descartada"].filter((e) => e !== c.estado).map((e) => `<button class="linkbtn" style="color:var(--brand)" data-act="cand-estado" data-id="${c.id}" data-estado="${e}">${cap(e)}</button>`).join(" · ")}</td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin candidaturas con esos filtros.</div></div>`;
    body = toolbar + table;
  } else {
    const rows = data || [];
    body = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Local</th></tr></thead><tbody>${rows.map((t) => `<tr><td>${esc(t.nombre || "")}</td><td class="mut">${esc(t.username || "")}</td><td>${esc(t.rol || "")}</td><td>${esc(t.local || "")}</td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin trabajadores.</div></div>`;
  }
  return `<div class="ph"><div class="eyebrow">Personas</div><h1>RR. HH.</h1><div class="sub">Candidaturas y equipo</div></div>${tabs}${body}`;
}
async function loadRRHH() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    let data;
    if (RRTAB === "candidaturas") { const qs = new URLSearchParams(); if (RRF.estado) qs.set("estado", RRF.estado); if (RRF.q) qs.set("q", RRF.q); data = await api("/api/hr/applications" + (qs.toString() ? "?" + qs : "")); }
    else data = await api("/api/rrhh/trabajadores");
    view.innerHTML = renderRRHH(data);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function rrTab(tab) { RRTAB = tab; loadRRHH(); }
function applyRRFilter() { const es = document.getElementById("rEstado"), q = document.getElementById("rQ"); if (es) RRF.estado = es.value; if (q) RRF.q = q.value.trim(); loadRRHH(); }
async function candEstado(id, estado) { try { await apiSend("PUT", "/api/hr/applications/" + encodeURIComponent(id), { estado }); toast("Candidatura actualizada ✅"); loadRRHH(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }

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
const eur = (n) => num(Math.round(Number(n) || 0)) + " €";
function renderFacturas(list, pend, stats) {
  const localOpts = ['<option value="">Todos los locales</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}" ${FACF.local === l ? "selected" : ""}>${esc(l)}</option>`)).join("");
  const resumen = stats && stats.resumenAnual ? `<div class="grid g4" style="margin-bottom:16px">${stat("Facturas (año)", "🧾", num(stats.resumenAnual.num_docs))}${stat("Base imponible", "€", eur(stats.resumenAnual.base))}${stat("IVA", "€", eur(stats.resumenAnual.iva))}${stat("Total", "€", eur(stats.resumenAnual.total))}</div>` : "";
  const toolbar = `<div class="toolbar"><div class="field"><label>Local</label><select id="facLocal">${localOpts}</select></div><button class="btn" data-act="fac-filtrar">Buscar</button><div style="flex:1"></div><a class="btn" href="/direccion.html">Configuración avanzada ↗</a></div>`;
  const pendCard = (pend && pend.length) ? `<div class="card p0" style="margin-bottom:16px"><div class="ch" style="padding:18px 18px 0"><h3>Facturas pendientes de asignar</h3><span class="pill bad">${pend.length}</span></div><div class="rows" style="margin-top:6px">${pend.map((p) => `<div class="row"><div class="grow"><div class="t1">${esc(p.proveedor || "(sin proveedor)")}</div><div class="t2">${esc((p.fecha || "").slice(0, 10))} · ${eur(p.total)}</div></div><select class="facSel" data-id="${p.id}" style="max-width:190px"><option value="">Asignar a…</option>${LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}</select><button class="btn" data-act="fac-asignar" data-id="${p.id}">Asignar</button></div>`).join("")}</div></div>` : "";
  const table = list.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Proveedor</th><th>Local</th><th>Fecha</th><th class="r">Total</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((f) => `<tr><td>${esc(f.proveedor || "")}</td><td>${esc(f.local || "")}</td><td class="mut">${esc((f.fecha || "").slice(0, 10))}</td><td class="r tnum">${eur(f.total)}</td><td><span class="pill ${f.pagado ? "ok" : ""}">${f.pagado ? "Pagada" : "Pendiente"}</span></td><td class="r"><button class="linkbtn" style="color:var(--brand)" data-act="fac-pago" data-id="${f.id}">${f.pagado ? "Marcar impagada" : "Marcar pagada"}</button></td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Sin facturas.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Contabilidad</div><h1>Facturas</h1><div class="sub">Últimas facturas y pendientes de asignar</div></div>${resumen}${toolbar}${pendCard}${table}`;
}
async function loadFacturas() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const [lst, pend, stats] = await Promise.all([
      api("/api/facturas" + (FACF.local ? "?local=" + encodeURIComponent(FACF.local) : "")),
      apiOptional("/api/facturas/pendientes"),
      apiOptional("/api/facturas/stats"),
    ]);
    view.innerHTML = renderFacturas(lst || [], pend || [], stats);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
function applyFacFilter() { const l = document.getElementById("facLocal"); if (l) FACF.local = l.value; loadFacturas(); }
async function facPago(id) { try { await apiSend("PATCH", "/api/facturas/" + encodeURIComponent(id) + "/pago"); toast("Estado de pago actualizado"); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }
async function facAsignar(id) { const sel = document.querySelector('.facSel[data-id="' + id + '"]'); const local = sel ? sel.value : ""; if (!local) { toast("Elige un local"); return; } try { await apiSend("POST", "/api/facturas/pendientes/" + encodeURIComponent(id) + "/asignar", { local }); toast("Factura asignada a " + local); loadFacturas(); } catch (e) { if (e.message !== "noauth") toast("Error: " + e.message); } }

// ════════════════════════ VISTA: WHATSAPP ════════════════════════
let WA_POLL = null;
function renderWhatsApp(status, qr, links) {
  const connected = status && status.connected;
  const rows = links || [];
  const conn = `<div class="card"><div class="ch"><h3>Conexión de Sara</h3><span class="pill ${connected ? "ok" : "bad"}">${connected ? "Conectado" : "Desconectado"}</span></div>${connected ? `<p class="mut">Sara está conectada y atiende reservas por WhatsApp automáticamente.</p>` : `<p class="mut">Escanea este código desde WhatsApp → Dispositivos vinculados para reconectar a Sara:</p>${qr && qr.qr ? `<div style="text-align:center;padding:10px"><img src="${esc(qr.qr)}" alt="Código QR" style="width:240px;height:240px;border-radius:12px;background:#fff;padding:8px"></div><div class="mut" style="text-align:center;font-size:12px">El código se actualiza solo; en cuanto vincules, esta pantalla lo detectará.</div>` : '<p class="mut">Generando código QR…</p>'}`}</div>`;
  const linksCard = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Grupos por local</h3></div>${rows.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th class="r">Estado</th></tr></thead><tbody>${rows.map((l) => `<tr><td>${esc(l.local)}</td><td class="r">${l.group_jid ? '<span class="pill ok">Vinculado</span>' : '<span class="pill">Sin vincular</span>'}</td></tr>`).join("")}</tbody></table></div>` : '<div style="padding:0 18px 12px" class="mut">Sin grupos vinculados.</div>'}<div style="padding:14px 18px"><a class="btn" href="/direccion.html">Configurar grupos ↗</a></div></div>`;
  return `<div class="ph"><div class="eyebrow">Comunicación</div><h1>WhatsApp / Sara</h1><div class="sub">Estado de la conexión y grupos por local</div></div><div class="grid g2">${conn}${linksCard}</div>`;
}
async function loadWhatsApp() {
  const view = document.getElementById("view"); view.innerHTML = skeleton();
  try {
    const status = await apiRaw("/api/whatsapp/status");
    let qr = null; if (!status.connected) { try { qr = await apiRaw("/api/whatsapp/qr"); } catch { /* opcional */ } }
    const links = await apiOptional("/api/whatsapp/links");
    view.innerHTML = renderWhatsApp(status, qr, links);
    clearInterval(WA_POLL); WA_POLL = null;
    if (!status.connected) WA_POLL = setInterval(pollWa, 6000);
  } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); }
}
async function pollWa() {
  if (CURRENT !== "whatsapp") { clearInterval(WA_POLL); WA_POLL = null; return; }
  try { const s = await apiRaw("/api/whatsapp/status"); if (s && s.connected) { clearInterval(WA_POLL); WA_POLL = null; loadWhatsApp(); } } catch { /* reintenta */ }
}

// ════════════════════════ VISTA: CAMPAÑAS ════════════════════════
function renderCampanas(list) {
  const rows = list || [];
  const toolbar = `<div class="toolbar"><div style="flex:1"></div><button class="btn primary" data-act="camp-nueva">+ Nueva campaña</button></div>`;
  const table = rows.length ? `<div class="card p0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Campaña</th><th>Segmento</th><th class="r">Enviados</th><th class="r">Errores</th><th>Fecha</th></tr></thead><tbody>${rows.map((c) => { let seg = ""; try { const s = JSON.parse(c.segmento_json || "{}"); seg = Object.entries(s).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", "); } catch { /* */ } return `<tr><td>${esc(c.nombre)}</td><td class="mut">${esc(seg || "—")}</td><td class="r tnum">${num(c.total_enviados)}</td><td class="r tnum">${num(c.total_errores || 0)}</td><td class="mut">${esc((c.creado_en || "").slice(0, 10))}</td></tr>`; }).join("")}</tbody></table></div></div>` : `<div class="card"><div class="mut" style="padding:8px">Aún no hay campañas enviadas.</div></div>`;
  return `<div class="ph"><div class="eyebrow">Marketing</div><h1>Campañas de WhatsApp</h1><div class="sub">Historial de envíos a clientes</div></div>${toolbar}${table}`;
}
async function loadCampanas() { const view = document.getElementById("view"); view.innerHTML = skeleton(); try { const data = await api("/api/campanas"); view.innerHTML = renderCampanas(data); } catch (e) { if (e.message !== "noauth") view.innerHTML = errorCard(e.message); } }
function openNuevaCampana() {
  const localOpts = ['<option value="">Todos los locales</option>'].concat(LOCALES.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`)).join("");
  const body = `<form id="fCamp"><div class="form-grid">
    <div class="field full"><label>Nombre de la campaña</label><input name="nombre_campana" required></div>
    <div class="field full"><label>Mensaje</label><input name="mensaje" required placeholder="Hola {nombre}! Este finde…"></div>
    <div class="field"><label>Género</label><select name="genero"><option value="">Todos</option><option value="M">Hombre</option><option value="F">Mujer</option></select></div>
    <div class="field"><label>Población</label><input name="poblacion"></div>
    <div class="field"><label>Local</label><select name="local">${localOpts}</select></div>
    <label class="field" style="flex-direction:row;align-items:center;gap:7px;margin-top:16px"><input type="checkbox" name="cumple_mes" style="width:auto;height:auto"> Cumpleaños este mes</label>
  </div><div id="campPrev" class="mut" style="margin-top:12px;font-size:12.5px"></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><button type="button" class="btn" data-close>Cerrar</button><button type="button" class="btn" id="campPrevBtn">Previsualizar</button><button type="submit" class="btn primary">Enviar campaña</button></div></form>`;
  const ov = modal("Nueva campaña", body);
  const filtros = (form) => { const d = Object.fromEntries(new FormData(form).entries()); if (!d.cumple_mes) delete d.cumple_mes; else d.cumple_mes = 1; return d; };
  ov.querySelector("#campPrevBtn").addEventListener("click", async () => { try { const j = await apiSend("POST", "/api/campanas/preview", filtros(ov.querySelector("#fCamp"))); ov.querySelector("#campPrev").textContent = `Se enviaría a ${j.total} contacto${j.total === 1 ? "" : "s"}.`; } catch (e) { toast("Error: " + e.message); } });
  ov.querySelector("#fCamp").addEventListener("submit", async (e) => {
    e.preventDefault(); const d = filtros(e.target);
    let prev; try { prev = await apiSend("POST", "/api/campanas/preview", d); } catch (err) { toast("Error: " + err.message); return; }
    if (!(await confirmModal(`Vas a enviar esta campaña a ${prev.total} contacto(s) por WhatsApp.`, { ok: "Enviar campaña" }))) return;
    try { await apiSend("POST", "/api/campanas/enviar", d); ov.remove(); toast("Campaña en envío ✅"); loadCampanas(); } catch (err) { toast("Error: " + err.message); }
  });
}

// ── Router ───────────────────────────────────────────────────────────────────
const VIEWS = { dashboard: loadDashboard, reservas: loadReservas, mantenimiento: loadMant, clientes: loadClientes, reviews: loadReviews, campanas: loadCampanas, rrhh: loadRRHH, facturas: loadFacturas, whatsapp: loadWhatsApp, usuarios: loadUsuarios };
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
  const v = e.target.closest("[data-view]"); if (v) { e.preventDefault(); document.body.classList.remove("navopen"); go(v.getAttribute("data-view")); return; }
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.getAttribute("data-act");
  if (act === "menu") document.body.classList.toggle("navopen");
  else if (act === "navclose") document.body.classList.remove("navopen");
  else if (act === "theme") toggleTheme();
  else if (act === "logout") { localStorage.removeItem("token"); location.href = "/login.html"; }
  else if (act === "reload") go(CURRENT);
  else if (act === "dash-local") { DASH_LOCAL = t.getAttribute("data-local") || ""; loadDashboard(); }
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
  else if (act === "rr-tab") rrTab(t.getAttribute("data-tab"));
  else if (act === "rr-filtrar") applyRRFilter();
  else if (act === "cand-estado") candEstado(t.getAttribute("data-id"), t.getAttribute("data-estado"));
  else if (act === "user-nuevo") openNuevoUsuario();
  else if (act === "user-pass") userPass(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "user-del") userDel(t.getAttribute("data-id"), t.getAttribute("data-nombre"));
  else if (act === "fac-filtrar") applyFacFilter();
  else if (act === "fac-pago") facPago(t.getAttribute("data-id"));
  else if (act === "fac-asignar") facAsignar(t.getAttribute("data-id"));
  else if (act === "camp-nueva") openNuevaCampana();
});

// ── Arranque ─────────────────────────────────────────────────────────────────
requireRole(["direccion", "encargado", "contabilidad"]).then((user) => {
  if (!user) return;
  USER = user;
  go("dashboard");
}).catch(() => { /* requireRole ya redirige a /login.html */ });
