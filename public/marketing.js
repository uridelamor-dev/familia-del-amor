const i18nFields = [
  { key: "about_title", label: "Sobre · Título" },
  { key: "history_title", label: "Historia · Título" },
  { key: "team_title", label: "Equipo · Título" },
  { key: "companies_title", label: "Empresas · Título" },
  { key: "events_title", label: "Eventos · Título" },
  { key: "news_title", label: "Novedades · Título" },
  { key: "reservations_title", label: "Reservas · Título" },
  { key: "jobs_title", label: "Trabaja · Título" },
  { key: "faq_title", label: "FAQ · Título" },
  { key: "contact_title", label: "Contacto · Título" },
  { key: "legal_title", label: "Legal · Título" },
  { key: "hero_eyebrow", label: "Hero · Eyebrow" },
  { key: "hero_title", label: "Hero · Título" },
  { key: "hero_sub", label: "Hero · Subtítulo" },
  { key: "about_text", label: "Sobre · Texto" },
  { key: "about_tile", label: "Sobre · Tarjeta" },
  { key: "companies_sub", label: "Empresas · Subtítulo" },
  { key: "history_sub", label: "Historia · Subtítulo" },
  { key: "history_block_1", label: "Historia · Bloque 1" },
  { key: "history_block_2", label: "Historia · Bloque 2" },
  { key: "history_block_3", label: "Historia · Bloque 3" },
  { key: "team_text", label: "Equipo · Texto" },
  { key: "team_tile", label: "Equipo · Tarjeta" },
  { key: "events_text", label: "Eventos · Texto" },
  { key: "news_sub", label: "Novedades · Subtítulo" },
  { key: "news_items", label: "Novedades · Items (1 por línea)" },
  { key: "reservations_sub", label: "Reservas · Subtítulo" },
  { key: "jobs_text", label: "Trabaja · Texto" },
  { key: "faq_sub", label: "FAQ · Subtítulo" },
  { key: "faq_items", label: "FAQ · Items (Pregunta|Respuesta por línea)" },
  { key: "contact_text", label: "Contacto · Texto" },
  { key: "legal_text", label: "Legal · Texto" },
  { key: "popup_title", label: "Popup · Título" },
  { key: "popup_text", label: "Popup · Texto" }
];

const fields = [
  { key: "site_logo_url", label: "Sitio · Logo (URL o ruta)", type: "input" },
  { key: "hero_image_url", label: "Hero · Imagen de fondo (URL o ruta)", type: "input" },
  ...i18nFields.flatMap((f) => [
    { key: `${f.key}_es`, label: `${f.label} (ES)` },
    { key: `${f.key}_ca`, label: `${f.label} (CA)` },
    { key: `${f.key}_en`, label: `${f.label} (EN)` }
  ])
];

const locals = [
  { slug: "la-tapeta", name: "La Tapeta" },
  { slug: "cooperativa", name: "Cooperativa" },
  { slug: "can-mateu", name: "Can Mateu" },
  { slug: "la-tapa-iberica", name: "La Tapa Ibérica" },
  { slug: "botiga-d-en-mateu", name: "Botiga d'en Mateu" },
  { slug: "viva-la-pepa", name: "Viva la Pepa" }
];

const form = document.getElementById("contentForm");
const localsForm = document.getElementById("localsForm");
const status = document.getElementById("contentStatus");

async function uploadFiles(fileList) {
  const formData = new FormData();
  Array.from(fileList).forEach((f) => formData.append("files", f));
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await res.json();
  return data.ok ? data.urls : [];
}

function normalizeGallery(textarea) {
  const lines = textarea.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  textarea.value = lines.join("\n");
}

async function loadContent() {
  const res = await fetch("/api/content");
  const data = await res.json();
  const values = data.ok ? data.data : {};

  form.innerHTML = "";
  fields.forEach((f) => {
    const wrapper = document.createElement("label");
    const value = values[f.key] || "";
    if (f.type === "input") {
      wrapper.innerHTML = `
        <span>${f.label}</span>
        <input name="${f.key}" value="${value}" />
      `;
    } else {
      wrapper.innerHTML = `
        <span>${f.label}</span>
        <textarea name="${f.key}" rows="2">${value}</textarea>
      `;
    }
    form.appendChild(wrapper);
  });

  if (localsForm) {
    localsForm.innerHTML = "";
    locals.forEach((loc) => {
      const instagramKey = `local_${loc.slug}_instagram`;
      const menuKey = `local_${loc.slug}_menu_pdf`;
      const galleryKey = `local_${loc.slug}_gallery`;
      const hoursKey = `local_${loc.slug}_hours`;
      const mapKey = `local_${loc.slug}_map`;
      const historyKey = `local_${loc.slug}_history`;
      const block = document.createElement("div");
      block.className = "card";
      block.innerHTML = `
        <h3>${loc.name}</h3>
        <label>
          <span>Instagram</span>
          <input name="${instagramKey}" value="${values[instagramKey] || ""}" />
        </label>
        <label>
          <span>Horarios</span>
          <textarea name="${hoursKey}" rows="2">${values[hoursKey] || ""}</textarea>
        </label>
        <label>
          <span>Mapa (URL)</span>
          <input name="${mapKey}" value="${values[mapKey] || ""}" />
        </label>
        <label>
          <span>Historia / Curiosidades</span>
          <textarea name="${historyKey}" rows="2">${values[historyKey] || ""}</textarea>
        </label>
        <label>
          <span>Carta PDF (URL o ruta)</span>
          <input name="${menuKey}" value="${values[menuKey] || ""}" />
        </label>
        <label>
          <span>Subir carta (PDF)</span>
          <input type="file" class="menuUpload" data-target="${menuKey}" accept="application/pdf" />
        </label>
        <label>
          <span>Galería (una URL por línea)</span>
          <textarea name="${galleryKey}" rows="3">${values[galleryKey] || ""}</textarea>
        </label>
        <div class="gallery-tools">
          <button type="button" class="btn ghost gallery-up" data-target="${galleryKey}">Subir</button>
          <button type="button" class="btn ghost gallery-down" data-target="${galleryKey}">Bajar</button>
          <button type="button" class="btn ghost gallery-remove" data-target="${galleryKey}">Eliminar última</button>
        </div>
        <label>
          <span>Subir imágenes (añade a la galería)</span>
          <input type="file" class="galleryUpload" data-target="${galleryKey}" accept="image/*" multiple />
        </label>
      `;
      localsForm.appendChild(block);
    });

    localsForm.querySelectorAll(".galleryUpload").forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.files.length) return;
        const urls = await uploadFiles(input.files);
        if (!urls.length) return;
        const target = input.getAttribute("data-target");
        const area = localsForm.querySelector(`textarea[name="${target}"]`);
        if (area) {
          const current = area.value.trim();
          const next = current ? current + "\n" + urls.join("\n") : urls.join("\n");
          area.value = next;
          normalizeGallery(area);
        }
      });
    });

    localsForm.querySelectorAll(".menuUpload").forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.files.length) return;
        const urls = await uploadFiles(input.files);
        if (!urls[0]) return;
        const target = input.getAttribute("data-target");
        const field = localsForm.querySelector(`input[name="${target}"]`);
        if (field) field.value = urls[0];
      });
    });

    localsForm.querySelectorAll("textarea").forEach((area) => {
      area.addEventListener("blur", () => {
        if (area.name.includes("gallery")) normalizeGallery(area);
      });
    });

    localsForm.querySelectorAll(".gallery-up").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        const area = localsForm.querySelector(`textarea[name="${target}"]`);
        if (!area) return;
        const lines = area.value.split("\n").filter(Boolean);
        if (lines.length < 2) return;
        const last = lines.pop();
        lines.unshift(last);
        area.value = lines.join("\n");
      });
    });

    localsForm.querySelectorAll(".gallery-down").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        const area = localsForm.querySelector(`textarea[name="${target}"]`);
        if (!area) return;
        const lines = area.value.split("\n").filter(Boolean);
        if (lines.length < 2) return;
        const first = lines.shift();
        lines.push(first);
        area.value = lines.join("\n");
      });
    });

    localsForm.querySelectorAll(".gallery-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        const area = localsForm.querySelector(`textarea[name="${target}"]`);
        if (!area) return;
        const lines = area.value.split("\n").filter(Boolean);
        lines.pop();
        area.value = lines.join("\n");
      });
    });
  }
}

async function saveContent(e) {
  e.preventDefault();
  status.textContent = "Guardando...";
  const formData = new FormData(form);
  const entries = Object.fromEntries(formData.entries());
  const localsData = localsForm ? Object.fromEntries(new FormData(localsForm).entries()) : {};
  const payload = { ...entries, ...localsData };

  const keys = Object.keys(payload);
  for (const key of keys) {
    const value = payload[key] || "";
    const res = await fetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value })
    });
    const data = await res.json();
    if (!data.ok) {
      status.textContent = "Error guardando algunos campos.";
      return;
    }
  }

  status.textContent = "Cambios guardados.";
  setTimeout(() => (status.textContent = ""), 2000);

  const preview = document.getElementById("previewFrame");
  if (preview) preview.contentWindow.location.reload();
  const previewLocals = document.getElementById("previewFrameLocals");
  if (previewLocals) previewLocals.contentWindow.location.reload();
}

form.addEventListener("submit", saveContent);
loadContent();

const leadsTable = document.getElementById("leadsTable");
const leadQ = document.getElementById("leadQ");
const leadCity = document.getElementById("leadCity");
const leadFrom = document.getElementById("leadFrom");
const leadTo = document.getElementById("leadTo");
const leadSearch = document.getElementById("leadSearch");
const leadExport = document.getElementById("leadExport");

function buildQuery() {
  const params = new URLSearchParams();
  if (leadQ.value) params.set("q", leadQ.value);
  if (leadCity.value) params.set("poblacion", leadCity.value);
  if (leadFrom.value) params.set("from", leadFrom.value);
  if (leadTo.value) params.set("to", leadTo.value);
  return params.toString();
}

async function loadLeads() {
  leadsTable.textContent = "Cargando clientes...";
  const qs = buildQuery();
  const res = await fetch(`/api/leads${qs ? "?" + qs : ""}`);
  const data = await res.json();
  if (!data.ok) {
    leadsTable.textContent = "Error cargando clientes.";
    return;
  }

  if (data.data.length === 0) {
    leadsTable.textContent = "Sin resultados.";
    return;
  }

  const rows = data.data
    .map(
      (r) => `
      <tr>
        <td>${r.nombre} ${r.apellidos}</td>
        <td>${r.correo}</td>
        <td>${r.telefono}</td>
        <td>${r.poblacion}</td>
        <td>${r.creado_en.slice(0, 10)}</td>
      </tr>
    `
    )
    .join("");

  leadsTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Correo</th>
          <th>Teléfono</th>
          <th>Población</th>
          <th>Fecha</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

leadSearch.addEventListener("click", () => {
  loadLeads();
  const qs = buildQuery();
  leadExport.href = `/api/leads/export.csv${qs ? "?" + qs : ""}`;
});

leadExport.addEventListener("click", () => {
  const qs = buildQuery();
  leadExport.href = `/api/leads/export.csv${qs ? "?" + qs : ""}`;
});

loadLeads();

const heroUpload = document.getElementById("heroUpload");
if (heroUpload) {
  heroUpload.addEventListener("change", async () => {
    if (!heroUpload.files.length) return;
    const formData = new FormData();
    formData.append("files", heroUpload.files[0]);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (data.ok && data.urls[0]) {
      const input = form.querySelector("input[name='hero_image_url']");
      if (input) input.value = data.urls[0];
      status.textContent = "Imagen subida. Guarda cambios.";
    } else {
      status.textContent = "Error subiendo imagen.";
    }
  });
}

const navToggle = document.getElementById("navToggle");
const nav = document.querySelector(".nav");
if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  nav.querySelectorAll("a, button").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const editModeToggle = document.getElementById("editModeToggle");
const editModeToggleLocals = document.getElementById("editModeToggleLocals");
const previewFrame = document.getElementById("previewFrame");
const previewFrameLocals = document.getElementById("previewFrameLocals");

function postEditMode(frame, enabled) {
  if (!frame) return;
  frame.contentWindow.postMessage({ type: "edit-mode", enabled }, "*");
}

if (editModeToggle) {
  editModeToggle.addEventListener("change", () => {
    postEditMode(previewFrame, editModeToggle.checked);
  });
}

if (editModeToggleLocals) {
  editModeToggleLocals.addEventListener("change", () => {
    postEditMode(previewFrameLocals, editModeToggleLocals.checked);
  });
}

const tabs = document.querySelectorAll("[data-tab]");
const sections = document.querySelectorAll(".panel-section");
function activateTab(name) {
  tabs.forEach((b) => {
    b.classList.toggle("ghost", b.getAttribute("data-tab") !== name);
  });
  sections.forEach((s) => {
    s.classList.toggle("active", s.getAttribute("data-section") === name);
  });
}
tabs.forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.getAttribute("data-tab")));
});
activateTab("web");

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === "edit-select") {
    if (!msg.enabled) return;
    const { key, lang } = msg;
    const candidateKey = lang ? `${key}_${lang}` : key;
    let field = document.querySelector(`[name="${candidateKey}"]`);
    if (!field) field = document.querySelector(`[name="${key}"]`);
    if (!field) return;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus();
    return;
  }
  if (msg.type === "edit-update") {
    const { key, lang, value } = msg;
    const candidateKey = lang ? `${key}_${lang}` : key;
    let field = document.querySelector(`[name="${candidateKey}"]`);
    if (!field) field = document.querySelector(`[name="${key}"]`);
    if (!field) return;
    field.value = value;
  }
});
