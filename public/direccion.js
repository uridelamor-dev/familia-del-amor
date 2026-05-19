requireRole(["direccion"]).then((user) => {
  if (!user) return;
  loadKpi();
  loadUsers();
  initNewUserForm();
  initSidebar();
});

function initSidebar() {
  const btns = document.querySelectorAll(".dir-nav-btn");
  const frame = document.getElementById("dirFrame");
  const inlineViews = {
    kpi: document.getElementById("viewKpi"),
    usuarios: document.getElementById("viewUsuarios"),
    whatsapp: document.getElementById("viewWhatsapp"),
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
        if (view === "whatsapp") initWhatsAppStatus("waStatus");
      }
    });
  });
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
  const res = await authFetch("/api/kpi");
  const data = await res.json();
  if (!data.ok) return;
  cards.innerHTML = `
    <div class="card">Leads totales: <strong>${data.data.leads}</strong></div>
    <div class="card">Reservas totales: <strong>${data.data.reservas}</strong></div>
  `;
  const rows = data.data.reservas_por_local
    .map((r) => `<tr><td>${r.local}</td><td>${r.total}</td></tr>`)
    .join("");
  byLocal.innerHTML = `
    <table class="table">
      <thead><tr><th>Local</th><th>Reservas</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
