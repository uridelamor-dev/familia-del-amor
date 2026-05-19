requireRole([]).then((user) => {
  if (!user) return;
  loadIssues();
});

async function loadIssues() {
  const table = document.getElementById("issuesTable");
  if (!table) return;
  const res = await authFetch("/api/maintenance");
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    table.textContent = "Sin incidencias.";
    return;
  }
  table.innerHTML = `
    <table class="table">
      <thead><tr><th>Local</th><th>Título</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
      <tbody>
        ${data.data
          .map(
            (i) => `<tr>
              <td>${i.local}</td>
              <td>${i.titulo}</td>
              <td>${i.estado}</td>
              <td>${i.creado_en.slice(0, 10)}</td>
              <td>
                <button class="btn ghost issue-status" data-id="${i.id}" data-status="en_proceso">En proceso</button>
                <button class="btn ghost issue-status" data-id="${i.id}" data-status="cerrada">Cerrar</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  table.querySelectorAll(".issue-status").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const estado = btn.getAttribute("data-status");
      await authFetch(`/api/maintenance/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado })
      });
      loadIssues();
    });
  });
}

const issueForm = document.getElementById("issueForm");
if (issueForm) {
  issueForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(issueForm);
    const payload = Object.fromEntries(formData.entries());
    await authFetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    issueForm.reset();
    loadIssues();
  });
}
