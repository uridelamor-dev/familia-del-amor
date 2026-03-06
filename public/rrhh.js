async function loadJobsAdmin() {
  const table = document.getElementById("jobsTable");
  if (!table) return;
  const res = await fetch("/api/hr/jobs/admin");
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    table.textContent = "Sin vacantes.";
    return;
  }
  table.innerHTML = `
    <table class="table">
      <thead><tr><th>Título</th><th>Local</th><th>Tipo</th><th>Activa</th><th>Acciones</th></tr></thead>
      <tbody>
        ${data.data
          .map(
            (j) => `<tr>
              <td>${j.titulo}</td>
              <td>${j.local}</td>
              <td>${j.tipo}</td>
              <td>${j.activo ? "Sí" : "No"}</td>
              <td>
                <button class="btn ghost job-toggle" data-id="${j.id}" data-active="${j.activo}">${j.activo ? "Cerrar" : "Abrir"}</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  table.querySelectorAll(".job-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const active = btn.getAttribute("data-active") === "1";
      await fetch(`/api/hr/jobs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data.data.find((j) => String(j.id) === id), activo: !active })
      });
      loadJobsAdmin();
    });
  });
}

async function loadHrApplications() {
  const table = document.getElementById("hrTable");
  if (!table) return;
  const qs = new URLSearchParams();
  const q = document.getElementById("hrQ")?.value;
  const estado = document.getElementById("hrEstado")?.value;
  const from = document.getElementById("hrFrom")?.value;
  const to = document.getElementById("hrTo")?.value;
  if (q) qs.set("q", q);
  if (estado) qs.set("estado", estado);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const res = await fetch(`/api/hr/applications${qs.toString() ? "?" + qs.toString() : ""}`);
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    table.textContent = "Sin candidaturas.";
    return;
  }
  table.innerHTML = `
    <table class="table">
      <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Puesto</th><th>Estado</th><th>CV</th><th>Acciones</th></tr></thead>
      <tbody>
        ${data.data
          .map(
            (a) => `<tr>
              <td>${a.nombre}</td>
              <td>${a.email}</td>
              <td>${a.telefono}</td>
              <td>${a.puesto}</td>
              <td>${a.estado}</td>
              <td>${a.cv_url ? `<a href="${a.cv_url}" target="_blank">CV</a>` : "-"}</td>
              <td>
                <button class="btn ghost hr-status" data-id="${a.id}" data-status="en_proceso">En proceso</button>
                <button class="btn ghost hr-status" data-id="${a.id}" data-status="cerrado">Cerrar</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  table.querySelectorAll(".hr-status").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const estado = btn.getAttribute("data-status");
      await fetch(`/api/hr/applications/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado })
      });
      loadHrApplications();
    });
  });
}

const jobForm = document.getElementById("jobForm");
if (jobForm) {
  jobForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(jobForm);
    const payload = Object.fromEntries(formData.entries());
    payload.activo = jobForm.querySelector('input[name="activo"]').checked;
    await fetch("/api/hr/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    jobForm.reset();
    loadJobsAdmin();
  });
}

document.getElementById("hrSearch")?.addEventListener("click", loadHrApplications);

loadJobsAdmin();
loadHrApplications();
