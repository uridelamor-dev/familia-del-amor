requireRole(["direccion"]).then((user) => {
  if (!user) return;
  loadKpi();
});

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
