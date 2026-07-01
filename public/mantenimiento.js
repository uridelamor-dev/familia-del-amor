requireRole(["encargado", "direccion"]).then((user) => {
  if (!user) return;
  loadIssues();
});

async function loadIssues() {
  const table = document.getElementById("issuesTable");
  if (!table) return;
  table.textContent = "Cargando incidencias...";
  try {
    const res = await authFetch("/api/maintenance");
    const data = await res.json();
    if (!data.ok) {
      table.textContent = "No se pudieron cargar las incidencias.";
      return;
    }
    if (data.data.length === 0) {
      table.textContent = "Sin incidencias.";
      return;
    }
    table.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Local</th><th>Título</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
          <tbody>
            ${data.data
              .map(
                (i) => `<tr>
                  <td>${escapeHtml(i.local)}</td>
                  <td>${escapeHtml(i.titulo)}</td>
                  <td>${escapeHtml(i.estado)}</td>
                  <td>${escapeHtml((i.creado_en || "").slice(0, 10))}</td>
                  <td>
                    <button class="btn ghost issue-status" data-id="${i.id}" data-status="en_proceso">En proceso</button>
                    <button class="btn ghost issue-status" data-id="${i.id}" data-status="cerrada">Cerrar</button>
                  </td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    table.querySelectorAll(".issue-status").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const estado = btn.getAttribute("data-status");
        if (estado === "cerrada" && !confirm("¿Cerrar esta incidencia?")) return;
        btn.disabled = true;
        try {
          const res = await authFetch(`/api/maintenance/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado })
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Error");
          toast(estado === "cerrada" ? "Incidencia cerrada" : "Incidencia actualizada", "success");
          loadIssues();
        } catch (err) {
          toast("No se pudo actualizar la incidencia", "error");
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    table.textContent = "Error de conexión al cargar incidencias.";
  }
}

const issueForm = document.getElementById("issueForm");
if (issueForm) {
  issueForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = issueForm.querySelector("button[type=submit]");
    const formData = new FormData(issueForm);
    const payload = Object.fromEntries(formData.entries());
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creando..."; }
    try {
      const res = await authFetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      issueForm.reset();
      toast("Incidencia creada", "success");
      loadIssues();
    } catch (err) {
      toast("No se pudo crear la incidencia", "error");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Crear incidencia"; }
    }
  });
}
