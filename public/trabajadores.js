requireRole(["trabajador", "encargado", "direccion"]).then((user) => {
  if (!user) return;
  loadAnnouncements();
});

async function loadAnnouncements() {
  const list = document.getElementById("annList");
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
      .map((a) => `<div class="card"><small>${escapeHtml(a.local)} · ${escapeHtml((a.creado_en || "").slice(0, 10))}</small><p>${escapeHtml(a.mensaje)}</p></div>`)
      .join("");
  } catch (err) {
    list.innerHTML = `<div class="card">Error de conexión al cargar comunicados.</div>`;
  }
}
