requireRole(["trabajador", "encargado", "direccion"]).then((user) => {
  if (!user) return;
  loadAnnouncements();
});

async function loadAnnouncements() {
  const list = document.getElementById("annList");
  if (!list) return;
  const res = await authFetch("/api/announcements?rol=trabajadores");
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    list.innerHTML = `<div class="card">Sin comunicados.</div>`;
    return;
  }
  list.innerHTML = data.data
    .map((a) => `<div class="card"><small>${a.local} · ${a.creado_en.slice(0, 10)}</small><p>${a.mensaje}</p></div>`)
    .join("");
}
