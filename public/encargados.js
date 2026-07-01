requireRole(["encargado", "direccion"]).then((user) => {
  if (!user) return;
  initTabs();
  loadCalendar();
  loadAnnouncements();
  initWhatsAppPanel();
});

// ── Tabs ─────────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("vistaCalendario").classList.toggle("hidden", view !== "calendario");
      document.getElementById("vistaLista").classList.toggle("hidden", view !== "lista");
      if (view === "lista") loadReservas();
      if (view === "calendario") loadCalendar();
    });
  });
}

// ── Calendario ───────────────────────────────────────────────────────────────

let calWeekStart = getMonday(new Date());

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(date) {
  return date.toISOString().split("T")[0];
}

function localClass(local) {
  if (local.includes("La Tapeta")) return "tapeta";
  if (local.includes("Cooperativa")) return "cooperativa";
  if (local.includes("Can Mateu")) return "canmateu";
  if (local.includes("La Tapa")) return "latapa";
  if (local.includes("Botiga")) return "botiga";
  if (local.includes("Viva")) return "viva";
  return "";
}

function shortLocal(local) {
  return local.split(" - ")[0];
}

function updateCalendarTitle() {
  const end = addDays(calWeekStart, 6);
  const opts = { day: "numeric", month: "short" };
  const from = calWeekStart.toLocaleDateString("es-ES", opts);
  const to = end.toLocaleDateString("es-ES", { ...opts, year: "numeric" });
  document.getElementById("calTitle").textContent = `${from} – ${to}`;
}

async function loadCalendar() {
  const weekEnd = addDays(calWeekStart, 6);
  const qs = new URLSearchParams({ from: isoDate(calWeekStart), to: isoDate(weekEnd) });
  const local = document.getElementById("calLocal")?.value;
  if (local) qs.set("local", local);

  updateCalendarTitle();

  const grid = document.getElementById("calGrid");
  try {
    const res = await authFetch(`/api/reservas?${qs}`);
    const data = await res.json();
    if (!data.ok) {
      if (grid) grid.innerHTML = `<div class="cal-empty">No se pudieron cargar las reservas.</div>`;
      return;
    }
    renderCalendar(data.data || []);
  } catch (err) {
    if (grid) grid.innerHTML = `<div class="cal-empty">Error de conexión al cargar el calendario.</div>`;
  }
}

function renderCalendar(reservas) {
  const grid = document.getElementById("calGrid");
  const today = isoDate(new Date());
  const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  grid.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(calWeekStart, i);
    const iso = isoDate(day);
    const isToday = iso === today;
    const dayRes = reservas
      .filter((r) => r.dia === iso)
      .sort((a, b) => a.hora.localeCompare(b.hora));

    const events = dayRes.length
      ? dayRes.map((r) => `
          <div class="cal-event ${localClass(r.local)}" title="${escapeHtml(r.local)}">
            <span class="cal-time">${escapeHtml(r.hora)}</span>
            <span class="cal-name">${escapeHtml(r.nombre_reserva)}</span>
            <span class="cal-meta">${escapeHtml(String(r.personas))}p · ${escapeHtml(shortLocal(r.local))}</span>
            <button class="cal-del" data-id="${r.id}" title="Eliminar reserva">×</button>
          </div>`).join("")
      : `<div class="cal-empty">—</div>`;

    return `
      <div class="cal-day${isToday ? " is-today" : ""}">
        <div class="cal-day-head">
          <span class="cal-weekday">${DAYS_ES[i]}</span>
          <span class="cal-date-num">${day.getDate()}</span>
          ${dayRes.length ? `<span class="cal-count">${dayRes.length}</span>` : ""}
        </div>
        <div class="cal-events">${events}</div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".cal-del").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("¿Eliminar esta reserva?")) return;
      try {
        const res = await authFetch(`/api/reservas/${btn.dataset.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.ok) throw new Error();
        toast("Reserva eliminada", "success");
        loadCalendar();
      } catch (err) {
        toast("No se pudo eliminar la reserva", "error");
      }
    });
  });
}

document.getElementById("calPrev")?.addEventListener("click", () => {
  calWeekStart = addDays(calWeekStart, -7);
  loadCalendar();
});
document.getElementById("calNext")?.addEventListener("click", () => {
  calWeekStart = addDays(calWeekStart, 7);
  loadCalendar();
});
document.getElementById("calToday")?.addEventListener("click", () => {
  calWeekStart = getMonday(new Date());
  loadCalendar();
});
document.getElementById("calLocal")?.addEventListener("change", loadCalendar);

// ── Lista ─────────────────────────────────────────────────────────────────────

async function loadReservas() {
  const table = document.getElementById("encReservas");
  if (!table) return;
  const qs = new URLSearchParams();
  const local = document.getElementById("encLocal")?.value;
  const from = document.getElementById("encFrom")?.value;
  const to = document.getElementById("encTo")?.value;
  if (local) qs.set("local", local);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  table.textContent = "Cargando reservas...";
  let data;
  try {
    const res = await authFetch(`/api/reservas${qs.toString() ? "?" + qs : ""}`);
    data = await res.json();
  } catch (err) {
    table.textContent = "Error de conexión al cargar reservas.";
    return;
  }

  if (!data.ok) {
    table.textContent = "No se pudieron cargar las reservas.";
    return;
  }
  if (data.data.length === 0) {
    table.textContent = "Sin reservas.";
    return;
  }

  table.innerHTML = `
    <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>Día</th><th>Hora</th><th>Nombre</th>
          <th>Personas</th><th>Local</th><th>Teléfono</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${data.data.map((r) => `
          <tr>
            <td>${escapeHtml(r.dia)}</td>
            <td>${escapeHtml(r.hora)}</td>
            <td>${escapeHtml(r.nombre_reserva)}</td>
            <td>${escapeHtml(String(r.personas))}</td>
            <td>${escapeHtml(r.local)}</td>
            <td>${escapeHtml(r.telefono)}</td>
            <td>
              <button class="btn ghost list-del" data-id="${r.id}" style="padding:0.2rem 0.5rem">×</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>`;

  table.querySelectorAll(".list-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta reserva?")) return;
      try {
        const res = await authFetch(`/api/reservas/${btn.dataset.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.ok) throw new Error();
        toast("Reserva eliminada", "success");
        loadReservas();
      } catch (err) {
        toast("No se pudo eliminar la reserva", "error");
      }
    });
  });
}

document.getElementById("encSearch")?.addEventListener("click", loadReservas);

// ── WhatsApp ──────────────────────────────────────────────────────────────────

async function initWhatsAppPanel() {
  const statusEl = document.getElementById("waStatus");
  const panel = document.getElementById("waGroupsPanel");
  if (!statusEl) return;

  // Reintenta hasta que WhatsApp esté conectado mostrando QR si está disponible
  let connected = false;
  for (let i = 0; i < 20; i++) {
    statusEl.innerHTML = `<span>⏳ Conectando WhatsApp…</span>`;
    const res = await authFetch("/api/whatsapp/qr");
    const data = await res.json();
    if (data.connected) { connected = true; break; }
    if (data.qr) {
      statusEl.innerHTML = `
        <p style="margin-bottom:0.75rem">📱 Escanea este QR con WhatsApp para activar las notificaciones:</p>
        <img src="${data.qr}" alt="QR WhatsApp" style="width:220px;height:220px;border-radius:8px;display:block;margin:0 auto" />
        <p style="margin-top:0.5rem;font-size:0.85rem;color:var(--muted)">El QR se actualiza automáticamente. Espera a ver ✅ tras escanearlo.</p>`;
    } else {
      statusEl.innerHTML = `<span>⏳ Generando QR${".".repeat(i % 3 + 1)}</span>`;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (!connected) {
    statusEl.innerHTML = `⚠️ No se pudo conectar WhatsApp. Reinicia el servidor e inténtalo de nuevo.`;
    return;
  }

  statusEl.innerHTML = `✅ WhatsApp conectado`;
  panel.classList.remove("hidden");

  const groupRes = await authFetch("/api/whatsapp/groups");
  const groupData = await groupRes.json();
  const select = document.getElementById("waGroup");
  if (groupData.ok) {
    select.innerHTML = `<option value="">— Selecciona un grupo —</option>` +
      groupData.data.map((g) => `<option value="${escapeHtml(String(g.id))}">${escapeHtml(g.name)}</option>`).join("");
  }

  await loadCurrentLinks();

  document.getElementById("waSave")?.addEventListener("click", async () => {
    const local = document.getElementById("waLocal").value;
    const groupId = document.getElementById("waGroup").value;
    if (!groupId) { toast("Selecciona un grupo", "error"); return; }
    const btn = document.getElementById("waSave");
    btn.disabled = true;
    btn.textContent = "Guardando...";
    try {
      const res = await authFetch("/api/whatsapp/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local, groupId })
      });
      const data = await res.json();
      if (!data.ok) throw new Error();
      toast("Grupo vinculado", "success");
      await loadCurrentLinks();
    } catch (err) {
      toast("No se pudo guardar la vinculación", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Guardar vinculación";
    }
  });
}

async function loadCurrentLinks() {
  const container = document.getElementById("waCurrentLinks");
  if (!container) return;
  try {
    const res = await authFetch("/api/whatsapp/links");
    const data = await res.json();
    if (!data.ok || !data.data.length) {
      container.innerHTML = `<div class="card">Sin grupos vinculados aún.</div>`;
      return;
    }
    container.innerHTML = data.data.map((row) =>
      `<div class="card"><strong>${escapeHtml(row.local)}</strong><br><small style="color:var(--muted)">${escapeHtml(row.group_jid)}</small></div>`
    ).join("");
  } catch (err) {
    container.innerHTML = `<div class="card">Error al cargar los grupos vinculados.</div>`;
  }
}

// ── Comunicados ───────────────────────────────────────────────────────────────

const annForm = document.getElementById("annForm");
if (annForm) {
  annForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(annForm).entries());
    payload.rol = "trabajadores";
    const btn = annForm.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.textContent = "Publicando..."; }
    try {
      const res = await authFetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) throw new Error();
      annForm.reset();
      toast("Comunicado publicado", "success");
      loadAnnouncements();
    } catch (err) {
      toast("No se pudo publicar el comunicado", "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Publicar comunicado"; }
    }
  });
}

async function loadAnnouncements() {
  const list = document.getElementById("annListEnc");
  if (!list) return;
  list.innerHTML = `<div class="card">Cargando comunicados...</div>`;
  try {
    const res = await authFetch("/api/announcements?rol=trabajadores");
    const data = await res.json();
    if (!data.ok) {
      list.innerHTML = `<div class="card">No se pudieron cargar los comunicados.</div>`;
      return;
    }
    if (data.data.length === 0) {
      list.innerHTML = `<div class="card">Sin comunicados.</div>`;
      return;
    }
    list.innerHTML = data.data
      .map((a) => `
        <div class="card">
          <small>${escapeHtml(a.local)} · ${escapeHtml((a.creado_en || "").slice(0, 10))}</small>
          <p>${escapeHtml(a.mensaje)}</p>
        </div>`)
      .join("");
  } catch (err) {
    list.innerHTML = `<div class="card">Error de conexión al cargar comunicados.</div>`;
  }
}
