requireRole(["trabajador", "encargado", "direccion"]).then((user) => {
  if (!user) return;
  loadPerfil();
  loadAnnouncements();
});

// ── Mi perfil ────────────────────────────────────────────────────────────────
// El usuario y la contraseña los crea la empresa; aquí cada uno completa sus datos
// de contacto. El teléfono importa: es el número por el que nos pondremos en
// contacto, así que lo pone el interesado y no hay que ir persiguiéndolo.
async function loadPerfil() {
  try {
    const res = await authFetch("/api/mi-perfil");
    const data = await res.json();
    if (!data.ok) return;
    const p = data.data;

    const nom = document.getElementById("miNombre");
    if (nom) nom.textContent = `Hola, ${(p.nombre || "").split(" ")[0] || p.username}`;
    const sub = document.getElementById("miSub");
    if (sub) sub.textContent = p.local ? `${p.local}${p.puesto ? " · " + p.puesto : ""}` : "Tus datos y los avisos del equipo.";

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ""; };
    set("pfTelefono", p.telefono);
    set("pfEmail", p.email);
    // El selector propio: el visible muestra dd/mm/aaaa y el oculto guarda AAAA-MM-DD
    const iso = (p.fecha_nac || "").slice(0, 10);
    set("pfNacValue", iso);
    const disp = document.getElementById("pfNacDisplay");
    if (disp) { const [y, m, d] = iso.split("-"); disp.value = iso ? `${d}/${m}/${y}` : ""; }

    // El aviso solo mientras falte de verdad
    const aviso = document.getElementById("avisoTelefono");
    if (aviso) aviso.classList.toggle("hidden", !!(p.telefono && p.telefono.trim()));

    const ficha = document.getElementById("fichaLista");
    if (ficha) {
      const filas = [
        ["Usuario", p.username],
        ["Establecimiento", p.local],
        ["Puesto", p.puesto],
        ["En la empresa desde", (p.fecha_alta || "").slice(0, 10)],
        ["Antigüedad", p.antiguedad && p.antiguedad.texto ? p.antiguedad.texto : ""],
      ].filter(([, v]) => v);
      ficha.innerHTML = filas
        .map(([k, v]) => `<div class="card"><small>${escapeHtml(k)}</small><p>${escapeHtml(String(v))}</p></div>`)
        .join("") || `<div class="card">Sin datos de ficha todavía.</div>`;
    }
  } catch { /* si falla, la página sigue siendo usable para comunicados */ }
}

document.getElementById("perfilForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("perfilMsg");
  const payload = {
    telefono: document.getElementById("pfTelefono").value.trim(),
    email: document.getElementById("pfEmail").value.trim(),
    fecha_nac: document.getElementById("pfNacValue").value,
  };
  if (msg) msg.textContent = "Guardando…";
  try {
    const res = await authFetch("/api/mi-perfil", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (msg) msg.textContent = data.ok ? "Guardado ✅" : (data.error || "No se pudo guardar");
    if (data.ok) {
      const aviso = document.getElementById("avisoTelefono");
      if (aviso) aviso.classList.toggle("hidden", !!payload.telefono);
      loadPerfil();
    }
  } catch {
    if (msg) msg.textContent = "Error de conexión";
  }
});

// ── Comunicados ──────────────────────────────────────────────────────────────
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
