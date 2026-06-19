requireRole(["direccion"]).then((user) => {
  if (!user) return;
  loadKpi();
  loadUsers();
  initNewUserForm();
  initSidebar();
  if (location.search.includes("facturas=connected")) {
    document.querySelector('[data-view="facturas"]')?.click();
  }
});

function initSidebar() {
  const btns = document.querySelectorAll(".dir-nav-btn");
  const frame = document.getElementById("dirFrame");
  const inlineViews = {
    kpi: document.getElementById("viewKpi"),
    usuarios: document.getElementById("viewUsuarios"),
    whatsapp: document.getElementById("viewWhatsapp"),
    facturas: document.getElementById("viewFacturas"),
  };

  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const view = btn.dataset.view;
      const url = btn.dataset.url;

      // Ocultar todo
      Object.values(inlineViews).forEach((v) => v?.classList.add("hidden"));
      frame.classList.add("hidden");

      if (url) {
        frame.src = url;
        frame.classList.remove("hidden");
      } else {
        inlineViews[view]?.classList.remove("hidden");
        if (view === "kpi") loadKpi();
        if (view === "usuarios") loadUsers();
        if (view === "whatsapp") { initWhatsAppStatus("waStatus"); loadWaMensajes(); }
        if (view === "facturas") loadFacturasPanel();
      }
    });
  });
}

let waAllMessages = [];
let waSelectedPhone = null;

async function loadWaMensajes() {
  const contactList = document.getElementById("waContactList");
  if (!contactList) return;
  try {
    const res = await authFetch("/api/whatsapp/mensajes");
    const data = await res.json();
    if (!data.ok || !data.data.length) {
      contactList.innerHTML = `<div class="card" style="color:var(--muted);text-align:center;padding:1rem">Sin conversaciones aún.</div>`;
      return;
    }

    waAllMessages = data.data;

    // Agrupar por teléfono, ordenar por último mensaje desc
    const byPhone = {};
    data.data.forEach((m) => {
      if (!byPhone[m.telefono]) byPhone[m.telefono] = { telefono: m.telefono, nombre: m.nombre_contacto, msgs: [] };
      byPhone[m.telefono].msgs.push(m);
    });
    const contacts = Object.values(byPhone).sort((a, b) => {
      const aLast = a.msgs[a.msgs.length - 1].creado_en;
      const bLast = b.msgs[b.msgs.length - 1].creado_en;
      return bLast.localeCompare(aLast);
    });

    contactList.innerHTML = contacts.map((c) => {
      const last = c.msgs[c.msgs.length - 1];
      const fecha = new Date(last.creado_en).toLocaleString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
      const preview = (last.mensaje || "").slice(0, 40);
      return `
        <div class="card wa-contact-card" data-phone="${c.telefono}" style="cursor:pointer;padding:0.75rem 1rem;transition:background 0.15s">
          <div style="font-weight:600;font-size:0.9rem">${c.nombre || c.telefono}</div>
          <div style="font-size:0.75rem;color:var(--muted)">${c.telefono}</div>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:0.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}…</div>
          <div style="font-size:0.7rem;color:var(--muted);margin-top:0.2rem">${fecha}</div>
        </div>`;
    }).join("");

    contactList.querySelectorAll(".wa-contact-card").forEach((card) => {
      card.addEventListener("click", () => {
        contactList.querySelectorAll(".wa-contact-card").forEach((c) => c.style.background = "");
        card.style.background = "var(--accent-light, #fdf0ef)";
        renderWaChat(card.dataset.phone, byPhone[card.dataset.phone]);
      });
    });

    // Auto-seleccionar el primero
    if (contacts.length) {
      const firstCard = contactList.querySelector(".wa-contact-card");
      if (firstCard) { firstCard.style.background = "var(--accent-light, #fdf0ef)"; renderWaChat(contacts[0].telefono, byPhone[contacts[0].telefono]); }
    }
  } catch {
    contactList.innerHTML = `<div class="card" style="color:var(--muted)">Error cargando conversaciones.</div>`;
  }
}

function renderWaChat(telefono, contactData) {
  waSelectedPhone = telefono;
  const panel = document.getElementById("waChatPanel");
  if (!panel) return;

  const msgs = contactData.msgs;
  const nombre = contactData.nombre || telefono;

  const bubbles = msgs.map((m) => {
    const fecha = new Date(m.creado_en).toLocaleString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
    const histBadge = m.historico ? `<span style="font-size:0.65rem;background:#e8e0ff;color:#6b3fa0;border-radius:3px;padding:1px 4px;vertical-align:middle">historial</span> ` : "";
    return `
      <!-- Mensaje del cliente -->
      <div style="display:flex;justify-content:flex-start;margin-bottom:0.25rem">
        <div style="max-width:70%;background:var(--card);border:1px solid var(--border);border-radius:12px 12px 12px 2px;padding:0.5rem 0.75rem;font-size:0.88rem">
          <div>${escHtml(m.mensaje)}</div>
          <div style="font-size:0.68rem;color:var(--muted);margin-top:0.2rem;text-align:right">${histBadge}${fecha}</div>
        </div>
      </div>
      <!-- Respuesta del bot -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
        <div style="max-width:70%;background:var(--accent);color:#fff;border-radius:12px 12px 2px 12px;padding:0.5rem 0.75rem;font-size:0.88rem">
          <div style="white-space:pre-wrap">${escHtml(m.respuesta)}</div>
          <div style="font-size:0.68rem;opacity:0.75;margin-top:0.2rem;text-align:right">${fecha}</div>
        </div>
      </div>`;
  }).join("");

  panel.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
      <div style="padding:0.75rem 1rem;background:var(--primary);color:#fff;display:flex;align-items:center;gap:0.75rem">
        <div>
          <div style="font-weight:700">${escHtml(nombre)}</div>
          <div style="font-size:0.78rem;opacity:0.8">${telefono} · ${msgs.length} mensaje${msgs.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
      <div style="padding:1rem;display:flex;flex-direction:column;max-height:440px;overflow-y:auto" id="waChatScroll">
        ${bubbles}
      </div>
      <div style="padding:0.75rem 1rem;border-top:1px solid var(--border);display:flex;gap:0.5rem;align-items:flex-end">
        <textarea id="waMsgInput" rows="2" placeholder="Escribe un mensaje..." style="flex:1;resize:none;border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;font-size:0.88rem;font-family:inherit;line-height:1.4"></textarea>
        <button id="waMsgSend" class="btn" style="padding:0.5rem 1rem;align-self:flex-end">Enviar</button>
      </div>
    </div>`;

  const scroll = panel.querySelector("#waChatScroll");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;

  const input = panel.querySelector("#waMsgInput");
  const sendBtn = panel.querySelector("#waMsgSend");

  const doSend = async () => {
    const texto = input.value.trim();
    if (!texto) return;
    sendBtn.disabled = true;
    sendBtn.textContent = "…";
    try {
      const res = await authFetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, mensaje: texto })
      });
      const data = await res.json();
      if (data.ok) {
        input.value = "";
        // Añadir burbuja manual al chat sin recargar toda la lista
        const now = new Date().toLocaleString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
        const bubble = document.createElement("div");
        bubble.style.cssText = "display:flex;justify-content:flex-end;margin-bottom:0.75rem";
        bubble.innerHTML = `<div style="max-width:70%;background:var(--accent);color:#fff;border-radius:12px 12px 2px 12px;padding:0.5rem 0.75rem;font-size:0.88rem">
          <div style="white-space:pre-wrap">${escHtml(texto)}</div>
          <div style="font-size:0.68rem;opacity:0.75;margin-top:0.2rem;text-align:right">${now} · tú</div>
        </div>`;
        scroll.appendChild(bubble);
        scroll.scrollTop = scroll.scrollHeight;
      } else {
        alert("Error: " + (data.error || "No se pudo enviar"));
      }
    } catch {
      alert("Error de conexión al enviar el mensaje.");
    }
    sendBtn.disabled = false;
    sendBtn.textContent = "Enviar";
    input.focus();
  };

  sendBtn.addEventListener("click", doSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
}

function escHtml(str) {
  return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

async function initWhatsAppStatus(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  for (let i = 0; i < 20; i++) {
    const res = await authFetch("/api/whatsapp/qr");
    const data = await res.json();
    if (data.connected) { el.innerHTML = `✅ WhatsApp conectado`; return; }
    if (data.qr) {
      el.innerHTML = `<p style="margin-bottom:0.75rem">📱 Escanea este QR con WhatsApp:</p>
        <img src="${data.qr}" style="width:220px;height:220px;border-radius:8px;display:block;margin:0 auto" />
        <p style="margin-top:0.5rem;font-size:0.85rem;color:var(--muted)">Espera a ver ✅ tras escanearlo.</p>`;
    } else {
      el.innerHTML = `⏳ Generando QR${".".repeat(i % 3 + 1)}`;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  el.innerHTML = `⚠️ No se pudo conectar WhatsApp. Reinicia el servidor.`;
}

const ROL_LABEL = {
  direccion: "Dirección", encargado: "Encargado", trabajador: "Trabajador",
  rrhh: "RR.HH.", marketing: "Marketing", contabilidad: "Contabilidad"
};

async function loadUsers() {
  const container = document.getElementById("userList");
  if (!container) return;
  const res = await authFetch("/api/users");
  const data = await res.json();
  if (!data.ok) { container.innerHTML = `<div class="card">Error cargando usuarios.</div>`; return; }
  container.innerHTML = `
    <table class="table">
      <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Nueva contraseña</th><th></th></tr></thead>
      <tbody>
        ${data.data.map((u) => `
          <tr data-id="${u.id}">
            <td>${u.username}</td>
            <td>${u.nombre || "—"}</td>
            <td>${ROL_LABEL[u.rol] || u.rol}</td>
            <td><input type="password" class="pwd-input" placeholder="Nueva contraseña" style="width:100%" /></td>
            <td style="display:flex;gap:0.5rem">
              <button class="btn ghost pwd-save" style="padding:0.2rem 0.6rem">Guardar</button>
              <button class="btn ghost user-del" style="padding:0.2rem 0.5rem;color:var(--danger,#c00)">×</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  container.querySelectorAll(".pwd-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const id = row.dataset.id;
      const pwd = row.querySelector(".pwd-input").value.trim();
      if (!pwd) { alert("Escribe una contraseña"); return; }
      btn.disabled = true; btn.textContent = "…";
      await authFetch(`/api/users/${id}/password`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pwd }) });
      btn.disabled = false; btn.textContent = "Guardar";
      row.querySelector(".pwd-input").value = "";
      alert("Contraseña actualizada");
    });
  });

  container.querySelectorAll(".user-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      if (!confirm(`¿Eliminar usuario ${row.querySelector("td").textContent}?`)) return;
      await authFetch(`/api/users/${row.dataset.id}`, { method: "DELETE" });
      loadUsers();
    });
  });
}

function initNewUserForm() {
  const form = document.getElementById("newUserForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Creando...";
    const res = await authFetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    btn.disabled = false; btn.textContent = "Crear usuario";
    if (!data.ok) { alert("Error: " + (data.error || "no se pudo crear")); return; }
    form.reset();
    loadUsers();
  });
}

async function loadKpi() {
  const cards = document.getElementById("kpiCards");
  const byLocal = document.getElementById("kpiByLocal");
  if (!cards || !byLocal) return;

  cards.innerHTML = `<div class="card" style="color:var(--muted)">Cargando...</div>`;

  const res = await authFetch("/api/kpi");
  const data = await res.json();
  if (!data.ok) { cards.innerHTML = `<div class="card">Error cargando KPIs.</div>`; return; }

  const d = data.data;
  const kpis = [
    { icon: "📅", label: "Reservas hoy",      value: d.reservas_hoy,   sub: `${d.personas_hoy} personas` },
    { icon: "📆", label: "Reservas este mes",  value: d.reservas_mes,   sub: `${d.personas_mes} personas` },
    { icon: "📋", label: "Reservas totales",   value: d.reservas_total, sub: "histórico" },
    { icon: "👥", label: "Leads este mes",     value: d.leads_mes,      sub: `${d.leads_total} en total` },
    { icon: "📄", label: "Candidaturas",       value: d.candidaturas,   sub: "recibidas" },
  ];

  cards.innerHTML = kpis.map((k) => `
    <div class="card" style="display:flex;flex-direction:column;gap:0.25rem">
      <div style="font-size:1.4rem">${k.icon}</div>
      <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)">${k.label}</div>
      <div style="font-size:2rem;font-weight:700;line-height:1">${k.value}</div>
      <div style="font-size:0.78rem;color:var(--muted)">${k.sub}</div>
    </div>`).join("");

  if (d.reservas_por_local.length) {
    const rows = d.reservas_por_local
      .map((r) => `<tr><td>${r.local}</td><td><strong>${r.total}</strong></td></tr>`)
      .join("");
    byLocal.innerHTML = `
      <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:0.5rem">Reservas por local</div>
      <table class="table"><thead><tr><th>Local</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else {
    byLocal.innerHTML = `<span style="color:var(--muted);font-size:0.9rem">Sin reservas aún.</span>`;
  }
}

// ── Panel de Facturas IA ───────────────────────────────────────────────────

async function loadFacturasPanel() {
  await Promise.all([loadFacturasStatus(), loadLocalesEmpresas(), loadGruposFactura(), loadPendientes(), loadUltimasFacturas(), loadGruposWADisponibles(), loadEmailReglas(), loadGmailStatus()]);
  document.getElementById("formAddGrupoFactura")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const local = document.getElementById("facturaLocal").value;
    const group_jid = document.getElementById("facturaGrupo").value;
    if (!group_jid) { alert("Selecciona un grupo de WhatsApp"); return; }
    const res = await authFetch("/api/facturas/grupos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local, group_jid })
    });
    const data = await res.json();
    if (data.ok) { loadGruposFactura(); }
    else alert("Error: " + data.error);
  });
  document.getElementById("formAddLocal")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const local = document.getElementById("localNombre").value;
    const empresa = document.getElementById("localEmpresa").value.trim();
    const cif = document.getElementById("localCif").value.trim();
    const local_contable = document.getElementById("localContable").value;
    const res = await authFetch("/api/facturas/locales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local, empresa, cif, local_contable })
    });
    const data = await res.json();
    if (data.ok) { document.getElementById("localEmpresa").value = ""; document.getElementById("localCif").value = ""; document.getElementById("localContable").value = ""; loadLocalesEmpresas(); }
    else alert("Error: " + data.error);
  });

  document.getElementById("btnMigrarEstructura")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnMigrarEstructura");
    const status = document.getElementById("migrarStatus");
    if (!confirm("¿Reorganizar los archivos existentes en Drive a la nueva estructura Local → Mes?\n\nEsto puede tardar unos segundos.")) return;
    btn.disabled = true;
    status.textContent = "Reorganizando...";
    try {
      const res = await authFetch("/api/facturas/migrar-estructura", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        status.textContent = `✅ ${data.movidos} movidos, ${data.omitidos} ya correctos${data.errores?.length ? `, ${data.errores.length} errores` : ""}`;
      } else {
        status.textContent = `❌ ${data.error}`;
      }
    } catch {
      status.textContent = "❌ Error de conexión";
    }
    btn.disabled = false;
  });

  document.getElementById("formAddEmailRegla")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("reglaEmail").value.trim();
    const local = document.getElementById("reglaLocal").value;
    const res = await authFetch("/api/facturas/email-reglas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, local })
    });
    const data = await res.json();
    if (data.ok) { document.getElementById("reglaEmail").value = ""; loadEmailReglas(); }
    else alert("Error: " + data.error);
  });
}

async function loadGruposWADisponibles() {
  const select = document.getElementById("facturaGrupo");
  if (!select) return;
  try {
    const res = await authFetch("/api/whatsapp/groups");
    const data = await res.json();
    if (data.ok && data.data.length) {
      select.innerHTML = `<option value="">— Selecciona un grupo —</option>` +
        data.data.map(g => `<option value="${g.id}">${g.name}</option>`).join("");
    } else {
      select.innerHTML = `<option value="">Sin grupos disponibles (Sara debe estar conectada)</option>`;
    }
  } catch {
    select.innerHTML = `<option value="">Error cargando grupos</option>`;
  }
}

async function loadFacturasStatus() {
  const el = document.getElementById("facturasStatus");
  const btn = document.getElementById("btnConectarDrive");
  try {
    const res = await authFetch("/api/facturas/status");
    const data = await res.json();
    if (data.conectado) {
      el.innerHTML = `✅ <strong>Google Drive conectado</strong> — los documentos se suben automáticamente.`;
      btn.style.display = "none";
    } else {
      el.innerHTML = `⚠️ Google Drive no conectado. Conecta una cuenta de Google para activar el procesamiento de facturas.`;
      btn.style.display = "inline-flex";
    }
  } catch {
    el.innerHTML = `Error comprobando estado.`;
  }
}

async function loadGruposFactura() {
  const el = document.getElementById("listaGruposFactura");
  const res = await authFetch("/api/facturas/grupos");
  const data = await res.json();
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin grupos vinculados aún. Añade un grupo arriba.</p>`;
    return;
  }
  el.innerHTML = `<table class="table"><thead><tr><th>Local</th><th>Group JID</th><th>Sheet</th><th></th></tr></thead><tbody>
    ${data.data.map(g => `
      <tr>
        <td>${g.local}</td>
        <td style="font-size:0.8rem;font-family:monospace">${g.group_jid}</td>
        <td>${g.sheet_url ? `<a href="${g.sheet_url}" target="_blank">Ver Sheet</a>` : "—"}</td>
        <td><button class="btn" style="padding:0.25rem 0.6rem;font-size:0.8rem" onclick="eliminarGrupoFactura(${g.id})">Eliminar</button></td>
      </tr>`).join("")}
  </tbody></table>`;
}

window.eliminarGrupoFactura = async function(id) {
  if (!confirm("¿Eliminar este grupo?")) return;
  await authFetch(`/api/facturas/grupos/${id}`, { method: "DELETE" });
  loadGruposFactura();
};

const LOCALES_OPTS = [
  "La Tapeta - Blanes","Cooperativa - Blanes","La Tapeta - Lloret",
  "La Tapeta - Girona","Can Mateu - Tordera","La Tapa Ibérica - Tordera","Botiga d'en Mateu - Tordera"
];

async function loadPendientes() {
  const el = document.getElementById("listaPendientes");
  const badge = document.getElementById("badgePendientes");
  if (!el) return;
  const res = await authFetch("/api/facturas/pendientes");
  const data = await res.json();
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin facturas pendientes. ✅</p>`;
    if (badge) badge.style.display = "none";
    return;
  }
  if (badge) { badge.textContent = data.data.length; badge.style.display = "inline"; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:1rem">
    ${data.data.map(p => {
      const total = p.total != null ? Number(p.total).toFixed(2) + " €" : "—";
      const tipo = p.tipo ? p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1) : "Documento";
      return `
      <div class="card" style="padding:1.1rem;display:flex;flex-direction:column;gap:0.75rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:700;font-size:1rem;margin-bottom:0.15rem">${p.proveedor || "Proveedor desconocido"}</div>
            <span style="font-size:0.75rem;background:rgba(211,106,95,0.12);color:var(--accent);padding:0.1rem 0.45rem;border-radius:99px">${tipo}</span>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:1.05rem;color:var(--accent)">${total}</div>
            <div style="font-size:0.75rem;color:var(--muted)">${p.fecha || "Sin fecha"}</div>
          </div>
        </div>
        <div style="font-size:0.83rem;color:var(--muted);display:flex;flex-direction:column;gap:0.2rem">
          <div><strong>Empresa detectada:</strong> ${p.empresa_detectada || "—"}</div>
          <div><strong>NIF receptor:</strong> <span style="font-family:monospace">${p.nif_receptor || "—"}</span></div>
          ${p.concepto ? `<div><strong>Concepto:</strong> ${p.concepto}</div>` : ""}
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;margin-top:auto">
          <select id="asignarLocal_${p.id}" style="flex:1;font-size:0.85rem;padding:0.4rem 0.5rem;border:1px solid rgba(0,0,0,0.15);border-radius:6px;background:var(--bg)">
            <option value="">— Selecciona local —</option>
            ${LOCALES_OPTS.map(l => `<option value="${l}">${l}</option>`).join("")}
          </select>
          ${p.drive_url ? `<a href="${p.drive_url}" target="_blank" class="btn ghost" style="padding:0.4rem 0.65rem;font-size:0.8rem;white-space:nowrap">Ver PDF</a>` : ""}
          <button class="btn" style="padding:0.4rem 0.75rem;font-size:0.85rem;white-space:nowrap" onclick="asignarPendiente(${p.id})">Asignar</button>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

window.asignarPendiente = async function(id) {
  const local = document.getElementById(`asignarLocal_${id}`)?.value;
  if (!local) { alert("Selecciona un local antes de asignar"); return; }
  const btn = document.querySelector(`[onclick="asignarPendiente(${id})"]`);
  if (btn) { btn.disabled = true; btn.textContent = "Asignando..."; }
  const res = await authFetch(`/api/facturas/pendientes/${id}/asignar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ local })
  });
  const data = await res.json();
  if (data.ok) { loadPendientes(); loadUltimasFacturas(); }
  else { alert("Error al asignar: " + (data.error || "Error desconocido")); if (btn) { btn.disabled = false; btn.textContent = "Asignar"; } }
};

async function loadLocalesEmpresas() {
  const el = document.getElementById("listaLocales");
  if (!el) return;
  const res = await authFetch("/api/facturas/locales");
  const data = await res.json();
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin locales configurados. Añade cada local con su empresa arriba.</p>`;
    return;
  }
  el.innerHTML = `<table class="table"><thead><tr><th>Local</th><th>Empresa</th><th>CIF</th><th>Agrupa con</th><th></th></tr></thead><tbody>
    ${data.data.map(l => `
      <tr>
        <td>${l.local}</td>
        <td>${l.empresa}</td>
        <td style="font-family:monospace;font-size:0.85rem">${l.cif || "—"}</td>
        <td style="color:${l.local_contable ? "var(--accent)" : "var(--muted)"}">
          ${l.local_contable ? `→ ${l.local_contable}` : "—"}
        </td>
        <td><button class="btn" style="padding:0.25rem 0.6rem;font-size:0.8rem" onclick="eliminarLocal('${encodeURIComponent(l.local)}')">Eliminar</button></td>
      </tr>`).join("")}
  </tbody></table>`;
}

window.eliminarLocal = async function(localEnc) {
  if (!confirm("¿Eliminar esta asignación?")) return;
  await authFetch(`/api/facturas/locales/${localEnc}`, { method: "DELETE" });
  loadLocalesEmpresas();
};

async function loadGmailStatus() {
  const el = document.getElementById("gmailStatus");
  if (!el) return;
  try {
    const res = await authFetch("/api/facturas/gmail-status");
    const data = await res.json();
    if (!data.conectado) {
      el.innerHTML = `⚠️ Gmail no conectado. Conecta Google Drive/Gmail arriba con el botón "Conectar Google Drive".`;
      return;
    }
    const ultimoEmail = data.emails?.[0];
    const ultimoTexto = ultimoEmail
      ? `Último email procesado: <strong>${ultimoEmail.de_email}</strong> → ${ultimoEmail.local} (${ultimoEmail.procesado?.slice(0, 10)})`
      : "Sin emails procesados aún.";
    el.innerHTML = `✅ <strong>Gmail conectado</strong> — revisando bandeja cada 5 minutos.<br><small style="color:var(--muted)">${ultimoTexto}</small>`;
  } catch {
    el.innerHTML = `Error comprobando estado de Gmail.`;
  }
}

async function loadEmailReglas() {
  const el = document.getElementById("listaEmailReglas");
  if (!el) return;
  const res = await authFetch("/api/facturas/email-reglas");
  const data = await res.json();
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin reglas configuradas. Añade el email de cada encargado arriba.</p>`;
    return;
  }
  el.innerHTML = `<table class="table"><thead><tr><th>Email encargado</th><th>Local</th><th></th></tr></thead><tbody>
    ${data.data.map(r => `
      <tr>
        <td>${r.email}</td>
        <td>${r.local}</td>
        <td><button class="btn" style="padding:0.25rem 0.6rem;font-size:0.8rem" onclick="eliminarEmailRegla(${r.id})">Eliminar</button></td>
      </tr>`).join("")}
  </tbody></table>`;
}

window.eliminarEmailRegla = async function(id) {
  if (!confirm("¿Eliminar esta regla?")) return;
  await authFetch(`/api/facturas/email-reglas/${id}`, { method: "DELETE" });
  loadEmailReglas();
};

async function loadUltimasFacturas() {
  const el = document.getElementById("listaFacturas");
  const res = await authFetch("/api/facturas");
  const data = await res.json();
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin facturas procesadas aún.</p>`;
    return;
  }
  el.innerHTML = `<table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Local</th><th>Proveedor</th><th>Total</th><th>Drive</th></tr></thead><tbody>
    ${data.data.map(f => `
      <tr>
        <td>${f.fecha || "—"}</td>
        <td>${f.tipo || "—"}</td>
        <td>${f.local}</td>
        <td>${f.proveedor || "—"}</td>
        <td>${f.total != null ? Number(f.total).toFixed(2) + " €" : "—"}</td>
        <td>${f.drive_url ? `<a href="${f.drive_url}" target="_blank">Ver</a>` : "—"}</td>
      </tr>`).join("")}
  </tbody></table>`;
}
