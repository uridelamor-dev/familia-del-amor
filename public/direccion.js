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
        toast("Error: " + (data.error || "No se pudo enviar"), "error");
      }
    } catch {
      toast("Error de conexión al enviar el mensaje.", "error");
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
  container.innerHTML = `<div class="card">Cargando usuarios...</div>`;
  let data;
  try {
    const res = await authFetch("/api/users");
    data = await res.json();
  } catch (err) {
    container.innerHTML = `<div class="card">Error de conexión al cargar usuarios.</div>`;
    return;
  }
  if (!data.ok) { container.innerHTML = `<div class="card">Error cargando usuarios.</div>`; return; }
  container.innerHTML = `
    <div class="table-wrap">
    <table class="table">
      <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Nueva contraseña</th><th></th></tr></thead>
      <tbody>
        ${data.data.map((u) => `
          <tr data-id="${u.id}">
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.nombre || "—")}</td>
            <td>${escapeHtml(ROL_LABEL[u.rol] || u.rol)}</td>
            <td><input type="password" class="pwd-input" placeholder="Nueva contraseña" style="width:100%" /></td>
            <td style="display:flex;gap:0.5rem">
              <button class="btn ghost pwd-save" style="padding:0.2rem 0.6rem">Guardar</button>
              <button class="btn ghost user-del" style="padding:0.2rem 0.5rem;color:var(--danger,#c00)">×</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>`;

  container.querySelectorAll(".pwd-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const id = row.dataset.id;
      const pwd = row.querySelector(".pwd-input").value.trim();
      if (!pwd) { toast("Escribe una contraseña", "error"); return; }
      btn.disabled = true; btn.textContent = "…";
      try {
        const res = await authFetch(`/api/users/${id}/password`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pwd }) });
        const d = await res.json();
        if (!d.ok) throw new Error();
        row.querySelector(".pwd-input").value = "";
        toast("Contraseña actualizada", "success");
      } catch (err) {
        toast("No se pudo actualizar la contraseña", "error");
      } finally {
        btn.disabled = false; btn.textContent = "Guardar";
      }
    });
  });

  container.querySelectorAll(".user-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      if (!confirm(`¿Eliminar usuario ${row.querySelector("td").textContent}?`)) return;
      try {
        const res = await authFetch(`/api/users/${row.dataset.id}`, { method: "DELETE" });
        const d = await res.json();
        if (!d.ok) throw new Error();
        toast("Usuario eliminado", "success");
        loadUsers();
      } catch (err) {
        toast("No se pudo eliminar el usuario", "error");
      }
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
    if (!data.ok) { toast("Error: " + (data.error || "no se pudo crear"), "error"); return; }
    form.reset();
    toast("Usuario creado", "success");
    loadUsers();
  });
}

async function loadKpi() {
  const cards = document.getElementById("kpiCards");
  const byLocal = document.getElementById("kpiByLocal");
  if (!cards || !byLocal) return;

  cards.innerHTML = `<div class="card" style="color:var(--muted)">Cargando...</div>`;

  let data;
  try {
    const res = await authFetch("/api/kpi");
    data = await res.json();
  } catch (err) {
    cards.innerHTML = `<div class="card">Error de conexión al cargar KPIs.</div>`;
    return;
  }
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
      .map((r) => `<tr><td>${escapeHtml(r.local)}</td><td><strong>${escapeHtml(String(r.total))}</strong></td></tr>`)
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
  inicializarSelectoresAño();
  await Promise.all([loadFacturasStatus(), loadLocalesEmpresas(), loadGruposFactura(), loadPendientes(), loadUltimasFacturas(), loadGruposWADisponibles(), loadEmailReglas(), loadGmailStatus(), loadEstadisticas(), initModelo303()]);
  document.getElementById("formAddGrupoFactura")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const local = document.getElementById("facturaLocal").value;
    const group_jid = document.getElementById("facturaGrupo").value;
    if (!group_jid) { toast("Selecciona un grupo de WhatsApp", "error"); return; }
    try {
      const res = await authFetch("/api/facturas/grupos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local, group_jid })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      toast("Grupo vinculado", "success");
      loadGruposFactura();
    } catch (err) {
      toast("Error: " + (err.message || "no se pudo vincular"), "error");
    }
  });
  document.getElementById("formAddLocal")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const local = document.getElementById("localNombre").value;
    const empresa = document.getElementById("localEmpresa").value.trim();
    const cif = document.getElementById("localCif").value.trim();
    const local_contable = document.getElementById("localContable").value;
    try {
      const res = await authFetch("/api/facturas/locales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local, empresa, cif, local_contable })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      document.getElementById("localEmpresa").value = "";
      document.getElementById("localCif").value = "";
      document.getElementById("localContable").value = "";
      toast("Local guardado", "success");
      loadLocalesEmpresas();
    } catch (err) {
      toast("Error: " + (err.message || "no se pudo guardar"), "error");
    }
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
    try {
      const res = await authFetch("/api/facturas/email-reglas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, local })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      document.getElementById("reglaEmail").value = "";
      toast("Regla añadida", "success");
      loadEmailReglas();
    } catch (err) {
      toast("Error: " + (err.message || "no se pudo añadir"), "error");
    }
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
        data.data.map(g => `<option value="${escapeHtml(String(g.id))}">${escapeHtml(g.name)}</option>`).join("");
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
  if (!el) return;
  let data;
  try {
    const res = await authFetch("/api/facturas/grupos");
    data = await res.json();
  } catch (err) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Error de conexión al cargar grupos.</p>`;
    return;
  }
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin grupos vinculados aún. Añade un grupo arriba.</p>`;
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Local</th><th>Group JID</th><th>Sheet</th><th></th></tr></thead><tbody>
    ${data.data.map(g => `
      <tr>
        <td>${escapeHtml(g.local)}</td>
        <td style="font-size:0.8rem;font-family:monospace">${escapeHtml(g.group_jid)}</td>
        <td>${g.sheet_url ? `<a href="${escapeHtml(g.sheet_url)}" target="_blank" rel="noopener">Ver Sheet</a>` : "—"}</td>
        <td><button class="btn" style="padding:0.25rem 0.6rem;font-size:0.8rem" onclick="eliminarGrupoFactura(${g.id})">Eliminar</button></td>
      </tr>`).join("")}
  </tbody></table></div>`;
}

window.eliminarGrupoFactura = async function(id) {
  if (!confirm("¿Eliminar este grupo?")) return;
  try {
    const res = await authFetch(`/api/facturas/grupos/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) throw new Error();
    toast("Grupo eliminado", "success");
    loadGruposFactura();
  } catch (err) {
    toast("No se pudo eliminar el grupo", "error");
  }
};

const LOCALES_OPTS = window.LOCALES;

async function loadPendientes() {
  const el = document.getElementById("listaPendientes");
  const badge = document.getElementById("badgePendientes");
  if (!el) return;
  let data;
  try {
    const res = await authFetch("/api/facturas/pendientes");
    data = await res.json();
  } catch (err) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Error de conexión al cargar pendientes.</p>`;
    return;
  }
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
            <div style="font-weight:700;font-size:1rem;margin-bottom:0.15rem">${escapeHtml(p.proveedor || "Proveedor desconocido")}</div>
            <span style="font-size:0.75rem;background:rgba(44,74,62,0.12);color:var(--panel-fill);padding:0.1rem 0.45rem;border-radius:99px">${escapeHtml(tipo)}</span>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:1.05rem;color:var(--panel-fill)">${escapeHtml(total)}</div>
            <div style="font-size:0.75rem;color:var(--muted)">${escapeHtml(p.fecha || "Sin fecha")}</div>
          </div>
        </div>
        <div style="font-size:0.83rem;color:var(--muted);display:flex;flex-direction:column;gap:0.2rem">
          <div><strong>Empresa detectada:</strong> ${escapeHtml(p.empresa_detectada || "—")}</div>
          <div><strong>NIF receptor:</strong> <span style="font-family:monospace">${escapeHtml(p.nif_receptor || "—")}</span></div>
          ${p.concepto ? `<div><strong>Concepto:</strong> ${escapeHtml(p.concepto)}</div>` : ""}
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;margin-top:auto">
          <select id="asignarLocal_${p.id}" style="flex:1;font-size:0.85rem;padding:0.4rem 0.5rem;border:1px solid rgba(0,0,0,0.15);border-radius:6px;background:var(--bg)">
            <option value="">— Selecciona local —</option>
            ${LOCALES_OPTS.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("")}
          </select>
          ${p.drive_url ? `<a href="${escapeHtml(p.drive_url)}" target="_blank" rel="noopener" class="btn ghost" style="padding:0.4rem 0.65rem;font-size:0.8rem;white-space:nowrap">Ver PDF</a>` : ""}
          <button class="btn" style="padding:0.4rem 0.75rem;font-size:0.85rem;white-space:nowrap" onclick="asignarPendiente(${p.id})">Asignar</button>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

window.asignarPendiente = async function(id) {
  const local = document.getElementById(`asignarLocal_${id}`)?.value;
  if (!local) { toast("Selecciona un local antes de asignar", "error"); return; }
  const btn = document.querySelector(`[onclick="asignarPendiente(${id})"]`);
  if (btn) { btn.disabled = true; btn.textContent = "Asignando..."; }
  try {
    const res = await authFetch(`/api/facturas/pendientes/${id}/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error desconocido");
    toast("Factura asignada", "success");
    loadPendientes(); loadUltimasFacturas();
  } catch (err) {
    toast("Error al asignar: " + err.message, "error");
    if (btn) { btn.disabled = false; btn.textContent = "Asignar"; }
  }
};

async function loadLocalesEmpresas() {
  const el = document.getElementById("listaLocales");
  if (!el) return;
  let data;
  try {
    const res = await authFetch("/api/facturas/locales");
    data = await res.json();
  } catch (err) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Error de conexión al cargar locales.</p>`;
    return;
  }
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin locales configurados. Añade cada local con su empresa arriba.</p>`;
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Local</th><th>Empresa</th><th>CIF</th><th>Agrupa con</th><th></th></tr></thead><tbody>
    ${data.data.map(l => `
      <tr>
        <td>${escapeHtml(l.local)}</td>
        <td>${escapeHtml(l.empresa)}</td>
        <td style="font-family:monospace;font-size:0.85rem">${escapeHtml(l.cif || "—")}</td>
        <td style="color:${l.local_contable ? "var(--panel-fill)" : "var(--muted)"}">
          ${l.local_contable ? `→ ${escapeHtml(l.local_contable)}` : "—"}
        </td>
        <td><button class="btn" style="padding:0.25rem 0.6rem;font-size:0.8rem" onclick="eliminarLocal('${encodeURIComponent(l.local)}')">Eliminar</button></td>
      </tr>`).join("")}
  </tbody></table></div>`;
}

window.eliminarLocal = async function(localEnc) {
  if (!confirm("¿Eliminar esta asignación?")) return;
  try {
    const res = await authFetch(`/api/facturas/locales/${localEnc}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) throw new Error();
    toast("Asignación eliminada", "success");
    loadLocalesEmpresas();
  } catch (err) {
    toast("No se pudo eliminar la asignación", "error");
  }
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
  let data;
  try {
    const res = await authFetch("/api/facturas/email-reglas");
    data = await res.json();
  } catch (err) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Error de conexión al cargar reglas.</p>`;
    return;
  }
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin reglas configuradas. Añade el email de cada encargado arriba.</p>`;
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Email encargado</th><th>Local</th><th></th></tr></thead><tbody>
    ${data.data.map(r => `
      <tr>
        <td>${escapeHtml(r.email)}</td>
        <td>${escapeHtml(r.local)}</td>
        <td><button class="btn" style="padding:0.25rem 0.6rem;font-size:0.8rem" onclick="eliminarEmailRegla(${r.id})">Eliminar</button></td>
      </tr>`).join("")}
  </tbody></table></div>`;
}

window.eliminarEmailRegla = async function(id) {
  if (!confirm("¿Eliminar esta regla?")) return;
  try {
    const res = await authFetch(`/api/facturas/email-reglas/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) throw new Error();
    toast("Regla eliminada", "success");
    loadEmailReglas();
  } catch (err) {
    toast("No se pudo eliminar la regla", "error");
  }
};

async function loadUltimasFacturas() {
  const el = document.getElementById("listaFacturas");
  if (!el) return;
  let data;
  try {
    const res = await authFetch("/api/facturas");
    data = await res.json();
  } catch (err) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Error de conexión al cargar facturas.</p>`;
    return;
  }
  if (!data.ok || !data.data.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin facturas procesadas aún.</p>`;
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr>
    <th>Fecha</th><th>Tipo</th><th>Local</th><th>Proveedor</th><th style="text-align:right">Total</th><th>Drive</th><th style="text-align:center">Pagado</th>
  </tr></thead><tbody>
    ${data.data.map(f => `
      <tr id="fila-factura-${f.id}">
        <td>${escapeHtml(f.fecha || "—")}</td>
        <td>${escapeHtml(f.tipo || "—")}</td>
        <td>${escapeHtml(f.local)}</td>
        <td>${escapeHtml(f.proveedor || "—")}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${f.total != null ? Number(f.total).toFixed(2) + " €" : "—"}</td>
        <td>${f.drive_url ? `<a href="${escapeHtml(f.drive_url)}" target="_blank" rel="noopener">Ver</a>` : "—"}</td>
        <td style="text-align:center">
          <button
            onclick="togglePagado(${f.id}, ${f.pagado ? 1 : 0})"
            title="${f.pagado ? "Marcar como pendiente" : "Marcar como pagado"}"
            style="background:none;border:none;cursor:pointer;font-size:1.15rem;line-height:1;padding:0.1rem 0.3rem;border-radius:4px;transition:opacity 0.15s"
            onmouseenter="this.style.opacity='0.65'" onmouseleave="this.style.opacity='1'"
          >${f.pagado ? "✅" : "⬜"}</button>
        </td>
      </tr>`).join("")}
  </tbody></table></div>`;
}

window.togglePagado = async function(id, estadoActual) {
  const btn = document.querySelector(`#fila-factura-${id} button`);
  if (btn) btn.style.opacity = "0.4";
  const res  = await authFetch(`/api/facturas/${id}/pago`, { method: "PATCH" });
  const data = await res.json();
  if (data.ok && btn) {
    const pagado = data.pagado;
    btn.textContent = pagado ? "✅" : "⬜";
    btn.title = pagado ? "Marcar como pendiente" : "Marcar como pagado";
    btn.onclick = () => togglePagado(id, pagado);
    btn.style.opacity = "1";
  } else if (!data.ok) {
    if (btn) btn.style.opacity = "1";
    toast("Error: " + data.error, "error");
  }
};

// ── Estadísticas ──────────────────────────────────────────────────────────────

const CHART_COLORS = ["#d36a5f","#4a90d9","#7cb27c","#f0a030","#9b6bbf","#2bb0ad","#e87b3e","#c9497a","#56b4a0","#c07b34"];
const MESES_ABREV  = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

let _chartMensual = null, _chartLocal = null, _chartProv = null;

function inicializarSelectoresAño() {
  const año = new Date().getFullYear();
  [document.getElementById("statsAño"), document.getElementById("m303Año")].forEach(sel => {
    if (!sel || sel.options.length > 1) return;
    sel.innerHTML = "";
    for (let y = año; y >= año - 3; y--) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === año) opt.selected = true;
      sel.appendChild(opt);
    }
  });
}

async function loadEstadisticas() {
  const año = document.getElementById("statsAño")?.value || new Date().getFullYear();
  const res  = await authFetch(`/api/facturas/stats?año=${año}`);
  const data = await res.json();
  if (!data.ok) return;
  const { mensual, topProveedores, porLocal, resumenAnual } = data.data;

  // — KPIs —
  const kpis = document.getElementById("statsKpis");
  if (kpis) {
    const fmt = n => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    kpis.innerHTML = [
      { icon: "📄", label: "Documentos",      val: resumenAnual?.num_docs || 0,       unit: "" },
      { icon: "💰", label: "Base imponible",   val: fmt(resumenAnual?.base),           unit: " €" },
      { icon: "🏛️", label: "IVA soportado",    val: fmt(resumenAnual?.iva),            unit: " €" },
      { icon: "💳", label: "Total gastos",     val: fmt(resumenAnual?.total),          unit: " €" },
    ].map(k => `
      <div class="card" style="padding:1rem;text-align:center">
        <div style="font-size:1.4rem;margin-bottom:0.3rem">${k.icon}</div>
        <div style="font-size:1.25rem;font-weight:700;color:var(--accent);line-height:1.2">${k.val}${k.unit}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:0.2rem">${k.label}</div>
      </div>`).join("");
  }

  // — Gráfico mensual apilado —
  const ctxM = document.getElementById("chartMensual");
  if (ctxM) {
    const locales  = [...new Set(mensual.map(r => r.local))];
    const datasets = locales.map((loc, i) => ({
      label: loc,
      data: MESES_ABREV.map((_, idx) => {
        const m = String(idx + 1).padStart(2, "0");
        return mensual.find(r => r.local === loc && r.mes === m)?.total || 0;
      }),
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + "cc",
      borderColor:     CHART_COLORS[i % CHART_COLORS.length],
      borderWidth: 1
    }));
    if (_chartMensual) _chartMensual.destroy();
    _chartMensual = new Chart(ctxM, {
      type: "bar",
      data: { labels: MESES_ABREV, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, ticks: { callback: v => v.toLocaleString("es-ES") + " €" } }
        }
      }
    });
  }

  // — Gráfico doughnut por local —
  const ctxL = document.getElementById("chartLocal");
  if (ctxL && porLocal.length) {
    if (_chartLocal) _chartLocal.destroy();
    _chartLocal = new Chart(ctxL, {
      type: "doughnut",
      data: {
        labels: porLocal.map(r => r.local),
        datasets: [{
          data: porLocal.map(r => r.total || 0),
          backgroundColor: porLocal.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + "dd"),
          borderWidth: 2,
          borderColor: "#fff"
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "60%",
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 11, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${Number(ctx.parsed).toLocaleString("es-ES",{minimumFractionDigits:2})} €` } }
        }
      }
    });
  }

  // — Gráfico horizontal top proveedores —
  const ctxP = document.getElementById("chartProveedores");
  if (ctxP && topProveedores.length) {
    if (_chartProv) _chartProv.destroy();
    _chartProv = new Chart(ctxP, {
      type: "bar",
      data: {
        labels: topProveedores.map(r => r.proveedor?.length > 22 ? r.proveedor.slice(0, 20) + "…" : r.proveedor),
        datasets: [{
          label: "Total (€)",
          data: topProveedores.map(r => r.total || 0),
          backgroundColor: CHART_COLORS[0] + "cc",
          borderColor:     CHART_COLORS[0],
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { callback: v => v.toLocaleString("es-ES") + " €" } },
          y: { ticks: { font: { size: 11 } } }
        }
      }
    });
  }
}

// ── Modelo 303 ────────────────────────────────────────────────────────────────

async function initModelo303() {
  const sel = document.getElementById("m303Empresa");
  if (!sel) return;
  const res  = await authFetch("/api/facturas/empresas");
  const data = await res.json();
  if (!data.ok || !data.data.length) {
    sel.innerHTML = `<option value="">Sin empresas configuradas</option>`;
    return;
  }
  sel.innerHTML = data.data.map(e => `<option value="${e}">${e}</option>`).join("");

  // Preseleccionar trimestre actual
  const q = Math.ceil((new Date().getMonth() + 1) / 3);
  const prevQ = q === 1 ? 4 : q - 1;
  const tSel = document.getElementById("m303Trimestre");
  if (tSel) tSel.value = prevQ;
}

window.calcularModelo303 = async function() {
  const empresa   = document.getElementById("m303Empresa")?.value;
  const año       = document.getElementById("m303Año")?.value;
  const trimestre = document.getElementById("m303Trimestre")?.value;
  const el        = document.getElementById("m303Result");
  if (!empresa || !trimestre || !el) return;

  el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Calculando...</p>`;

  const res  = await authFetch(`/api/facturas/modelo303?empresa=${encodeURIComponent(empresa)}&año=${año}&trimestre=${trimestre}`);
  const data = await res.json();

  if (!data.ok) { el.innerHTML = `<p style="color:var(--accent)">Error: ${data.error}</p>`; return; }

  const d   = data.data;
  const fmt = n => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NOMBRES_T = { 1: "Enero · Febrero · Marzo", 2: "Abril · Mayo · Junio", 3: "Julio · Agosto · Septiembre", 4: "Octubre · Noviembre · Diciembre" };

  if (!d.totales?.num_facturas) {
    el.innerHTML = `<p style="color:var(--muted);font-size:0.9rem">Sin facturas en T${d.trimestre} ${d.año} para <strong>${empresa}</strong>.</p>`;
    return;
  }

  const totalBase  = d.porTipoIva.reduce((s, r) => s + (r.base_total  || 0), 0);
  const totalCuota = d.porTipoIva.reduce((s, r) => s + (r.cuota_total || 0), 0);

  el.innerHTML = `
    <div class="card" style="padding:1.5rem;max-width:640px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem">
        <div>
          <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted)">MODELO 303 — IVA SOPORTADO</div>
          <div style="font-size:1.05rem;font-weight:700;margin-top:0.2rem">T${d.trimestre} ${d.año} — ${NOMBRES_T[d.trimestre]}</div>
          <div style="font-size:0.82rem;color:var(--muted);margin-top:0.15rem">${empresa}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:1.4rem;font-weight:700;color:var(--accent)">${fmt(d.totales.importe_total)} €</div>
          <div style="font-size:0.75rem;color:var(--muted)">${d.totales.num_facturas} facturas</div>
        </div>
      </div>

      <table class="table" style="margin-bottom:0.5rem">
        <thead>
          <tr>
            <th>Tipo IVA</th>
            <th style="text-align:right">Nº facturas</th>
            <th style="text-align:right">Base imponible</th>
            <th style="text-align:right">Cuota IVA</th>
          </tr>
        </thead>
        <tbody>
          ${d.porTipoIva.map(r => `
            <tr>
              <td><strong>${r.tipo_iva}%</strong>${r.tipo_iva === 0 ? " <span style='font-size:0.75rem;color:var(--muted)'>(exento)</span>" : ""}</td>
              <td style="text-align:right">${r.num_docs}</td>
              <td style="text-align:right">${fmt(r.base_total)} €</td>
              <td style="text-align:right">${fmt(r.cuota_total)} €</td>
            </tr>`).join("")}
          <tr style="font-weight:700;border-top:2px solid rgba(0,0,0,0.1)">
            <td>TOTAL</td>
            <td style="text-align:right">${d.totales.num_facturas}</td>
            <td style="text-align:right">${fmt(d.totales.base_total)} €</td>
            <td style="text-align:right;color:var(--accent)">${fmt(d.totales.cuota_total)} €</td>
          </tr>
        </tbody>
      </table>

      ${d.otrosDocs?.num_otros > 0 ? `
        <div style="font-size:0.8rem;color:var(--muted);margin-top:0.75rem;padding:0.6rem;background:rgba(0,0,0,0.04);border-radius:6px">
          ℹ️ También hay ${d.otrosDocs.num_otros} documento${d.otrosDocs.num_otros>1?"s":""} de tipo no factura (albaranes / tickets) por ${fmt(d.otrosDocs.total_otros)} € que <strong>no</strong> se incluyen en este cálculo.
        </div>` : ""}

      ${d.locales.length ? `
        <div style="font-size:0.8rem;color:var(--muted);margin-top:0.5rem">
          Locales incluidos: ${d.locales.join(" · ")}
        </div>` : ""}

      <div style="margin-top:1rem;padding:0.75rem;background:rgba(240,160,48,0.1);border:1px solid rgba(240,160,48,0.3);border-radius:8px;font-size:0.8rem;color:#8a6a00">
        ⚠️ <strong>Aviso:</strong> Este resumen es orientativo. Solo refleja el IVA soportado en compras registradas en el sistema. Debe ser validado por tu asesor fiscal antes de presentar el Modelo 303.
      </div>
    </div>`;
};
