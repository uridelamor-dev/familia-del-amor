async function loadReservas() {
  const table = document.getElementById("encReservas");
  if (!table) return;
  const local = document.getElementById("encLocal")?.value;
  const from = document.getElementById("encFrom")?.value;
  const to = document.getElementById("encTo")?.value;
  const qs = new URLSearchParams();
  if (local) qs.set("local", local);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const res = await fetch(`/api/reservas${qs.toString() ? "?" + qs.toString() : ""}`);
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    table.textContent = "Sin reservas.";
    return;
  }
  table.innerHTML = `
    <table class="table">
      <thead><tr><th>Local</th><th>Nombre</th><th>Personas</th><th>Día</th><th>Hora</th></tr></thead>
      <tbody>
        ${data.data
          .map(
            (r) => `<tr><td>${r.local}</td><td>${r.nombre_reserva}</td><td>${r.personas}</td><td>${r.dia}</td><td>${r.hora}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

const encSearch = document.getElementById("encSearch");
encSearch?.addEventListener("click", loadReservas);
loadReservas();

const annForm = document.getElementById("annForm");
if (annForm) {
  annForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(annForm);
    const payload = Object.fromEntries(formData.entries());
    payload.rol = "trabajadores";
    await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    annForm.reset();
    loadAnnouncements();
  });
}

async function loadAnnouncements() {
  const list = document.getElementById("annListEnc");
  if (!list) return;
  const res = await fetch("/api/announcements?rol=trabajadores");
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    list.innerHTML = "<div class=\"card\">Sin comunicados.</div>";
    return;
  }
  list.innerHTML = data.data
    .map((a) => `<div class=\"card\">${a.mensaje}</div>`)
    .join("");
}

loadAnnouncements();
