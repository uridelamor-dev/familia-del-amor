requireRole(["marketing", "direccion"]).then((user) => {
  if (!user) return;
  initWhatsAppStatus("waStatus");
  initGoogleStatus();
  const params = new URLSearchParams(location.search);
  const googleParam = params.get("google");
  const errParam = params.get("err");
  const msgEl = document.getElementById("googleMsg");
  if (googleParam === "connected") {
    msgEl.textContent = "✅ Google Business conectado y reseñas importadas.";
  } else if (googleParam === "token_ok") {
    msgEl.style.color = "var(--accent)";
    msgEl.textContent = "✅ Token guardado" + (errParam ? `. Aviso al importar reseñas: ${decodeURIComponent(errParam)}` : " (reseñas se importarán en breve).");
  }
});

async function initGoogleStatus() {
  const el = document.getElementById("googleStatus");
  if (!el) return;
  try {
    const res = await fetch("/api/google/status");
    const data = await res.json();
    if (data.connected && data.reviews_count > 0) {
      const fecha = data.last_fetch ? new Date(data.last_fetch).toLocaleString("es") : "—";
      el.innerHTML = `✅ Conectado · ${data.reviews_count} reseñas · Última sync: ${fecha}`;
    } else if (data.connected) {
      el.innerHTML = `✅ Token guardado · Sin reseñas aún. Pulsa "Actualizar reseñas ahora" para importarlas.`;
    } else {
      el.innerHTML = `⚠️ No conectado. Pulsa "Conectar Google Business".`;
    }
  } catch {
    el.innerHTML = `⚠️ Error comprobando estado.`;
  }

  document.getElementById("refreshReviews")?.addEventListener("click", async () => {
    const btn = document.getElementById("refreshReviews");
    const msg = document.getElementById("googleMsg");
    btn.disabled = true; btn.textContent = "Actualizando...";
    try {
      const r = await authFetch("/api/reviews/refresh", { method: "POST" });
      const d = await r.json();
      msg.textContent = d.ok ? "✅ Reseñas actualizadas." : "❌ " + d.error;
    } catch {
      msg.textContent = "❌ Error de conexión.";
    }
    btn.disabled = false; btn.textContent = "Actualizar reseñas ahora";
  });
}

async function initWhatsAppStatus(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  for (let i = 0; i < 20; i++) {
    const res = await authFetch("/api/whatsapp/qr");
    const data = await res.json();
    if (data.connected) { el.innerHTML = `✅ WhatsApp conectado`; return; }
    if (data.qr) {
      el.innerHTML = `<p style="margin-bottom:0.75rem">📱 Escanea este QR con WhatsApp:</p>
        <img src="${data.qr}" style="width:220px;height:220px;border-radius:8px;display:block;margin:0 auto" />
        <p style="margin-top:0.5rem;font-size:0.85rem;color:var(--muted)">Espera a ver ✅ tras escanearlo.</p>`;
    } else {
      el.innerHTML = `⏳ Generando QR${".".repeat(i % 3 + 1)}`;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  el.innerHTML = `⚠️ No se pudo conectar WhatsApp. Reinicia el servidor.`;
}

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
  { key: "gallery_images", label: "Galería · Imágenes (1 URL por línea)" },
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
  const res = await authFetch("/api/upload", { method: "POST", body: formData });
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
      const instagramKey  = `local_${loc.slug}_instagram`;
      const menuKey       = `local_${loc.slug}_menu_pdf`;
      const almuKey       = `local_${loc.slug}_menu_almuerzo_pdf`;
      const galleryKey    = `local_${loc.slug}_gallery`;
      const hoursKey      = `local_${loc.slug}_hours`;
      const mapKey        = `local_${loc.slug}_map`;
      const historyKey    = `local_${loc.slug}_history`;

      const menuUrl  = values[menuKey]  || "";
      const almuUrl  = values[almuKey]  || "";

      function pdfSlot(label, key, url, uploadClass) {
        const preview = url
          ? `<a href="${url}" target="_blank" class="btn ghost" style="font-size:0.75rem;padding:0.35rem 0.8rem">Ver PDF actual</a>`
          : `<span style="font-size:0.82rem;color:var(--muted)">Sin PDF asignado</span>`;
        return `
          <div class="pdf-slot" style="display:flex;flex-direction:column;gap:0.5rem;padding:0.75rem;background:#f9f4ee;border-radius:10px;border:1px solid #eadfce">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted)">${label}</div>
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">
              ${preview}
              <label class="upload" style="margin:0">
                <input type="file" class="${uploadClass}" data-target="${key}" accept="application/pdf" />
                <span>${url ? "Reemplazar PDF" : "Subir PDF"}</span>
              </label>
            </div>
            <input type="hidden" name="${key}" value="${url}" class="pdf-url-field" data-key="${key}" />
          </div>`;
      }

      const block = document.createElement("div");
      block.className = "card";
      block.innerHTML = `
        <h3 style="margin-top:0">${loc.name}</h3>

        <div style="display:flex;flex-direction:column;gap:0.6rem;margin-bottom:0.75rem">
          ${pdfSlot("Carta", menuKey, menuUrl, "menuUpload")}
          ${pdfSlot("Menú mediodía", almuKey, almuUrl, "menuUpload")}
        </div>

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
        const slot = input.closest(".pdf-slot");
        if (slot) slot.style.opacity = "0.5";
        const urls = await uploadFiles(input.files);
        if (slot) slot.style.opacity = "1";
        if (!urls[0]) return;
        const target = input.getAttribute("data-target");
        const hidden = localsForm.querySelector(`input[name="${target}"]`);
        if (hidden) hidden.value = urls[0];
        if (slot) {
          const oldLink = slot.querySelector("a.btn");
          const noLabel = slot.querySelector("span[style*='Sin PDF']");
          const uploadLabel = input.closest("label");
          if (oldLink) {
            oldLink.href = urls[0];
          } else {
            const a = document.createElement("a");
            a.href = urls[0];
            a.target = "_blank";
            a.className = "btn ghost";
            a.style.cssText = "font-size:0.75rem;padding:0.35rem 0.8rem";
            a.textContent = "Ver PDF actual";
            if (noLabel) noLabel.replaceWith(a);
            else uploadLabel.before(a);
          }
          input.closest("label").querySelector("span").textContent = "Reemplazar PDF";
        }
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
    const res = await authFetch("/api/content", {
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
  const res = await authFetch(`/api/leads${qs ? "?" + qs : ""}`);
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

leadSearch.addEventListener("click", () => loadLeads());

leadExport.addEventListener("click", async (e) => {
  e.preventDefault();
  const qs = buildQuery();
  const res = await authFetch(`/api/leads/export.csv${qs ? "?" + qs : ""}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leads.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

loadLeads();

const heroUpload = document.getElementById("heroUpload");
if (heroUpload) {
  heroUpload.addEventListener("change", async () => {
    if (!heroUpload.files.length) return;
    const formData = new FormData();
    formData.append("files", heroUpload.files[0]);
    const res = await authFetch("/api/upload", { method: "POST", body: formData });
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

const galleryUpload = document.getElementById("galleryUpload");
const galleryPreview = document.getElementById("galleryPreview");
if (galleryUpload) {
  galleryUpload.addEventListener("change", async () => {
    if (!galleryUpload.files.length) return;
    status.textContent = `Subiendo ${galleryUpload.files.length} foto(s)...`;
    const urls = await uploadFiles(galleryUpload.files);
    if (!urls.length) { status.textContent = "Error subiendo fotos."; return; }

    const area = form.querySelector("textarea[name='gallery_images']");
    if (area) {
      const current = area.value.trim();
      area.value = current ? current + "\n" + urls.join("\n") : urls.join("\n");
      normalizeGallery(area);
    }

    if (galleryPreview) {
      urls.forEach((url) => {
        const img = document.createElement("img");
        img.src = url;
        img.style.cssText = "width:80px;height:80px;object-fit:cover;border-radius:8px;";
        galleryPreview.appendChild(img);
      });
    }

    status.textContent = `${urls.length} foto(s) añadidas. Guarda cambios.`;
    galleryUpload.value = "";
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
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    activateTab(tab);
    if (tab === "campanas") initCampanas();
  });
});
activateTab("web");

// ── CAMPAÑAS WHATSAPP ─────────────────────────────────────────────────
async function initCampanas() {
  loadCampHistorial();
}

function getCampSegmento() {
  return {
    genero: document.getElementById("campGenero").value,
    poblacion: document.getElementById("campPoblacion").value.trim(),
    local: document.getElementById("campLocal").value,
    cumple_mes: document.getElementById("campCumpleMes").value
  };
}

async function loadCampHistorial() {
  const tbody = document.getElementById("campHistorial");
  if (!tbody) return;
  const res = await authFetch("/api/campanas");
  const data = await res.json();
  if (!data.ok || !data.data.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding:12px;color:#888">Sin campañas enviadas aún.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.data.map((c, i) => {
    const fecha = new Date(c.creado_en).toLocaleString("es-ES", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" });
    const bg = i % 2 === 0 ? "" : "background:var(--bg)";
    const estado = c.finalizado_en ? `${c.total_enviados} ✅` : `⏳ enviando...`;
    return `<tr style="${bg}">
      <td style="padding:8px 12px;color:var(--muted);white-space:nowrap">${fecha}</td>
      <td style="padding:8px 12px">${c.nombre}</td>
      <td style="padding:8px 12px">${estado}</td>
      <td style="padding:8px 12px;color:${c.total_errores > 0 ? '#c0392b' : 'var(--muted)'}">${c.total_errores}</td>
    </tr>`;
  }).join("");
}

document.getElementById("campPreview")?.addEventListener("click", async () => {
  const msg = document.getElementById("campMsg");
  msg.textContent = "Calculando...";
  const segmento = getCampSegmento();
  const res = await authFetch("/api/campanas/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(segmento)
  });
  const data = await res.json();
  if (!data.ok) { msg.textContent = "Error al calcular."; return; }
  const muestra = data.muestra.map(c => `${c.nombre} ${c.apellidos} (${c.telefono})`).join(", ");
  msg.innerHTML = `<strong>${data.total} contacto${data.total !== 1 ? "s" : ""}</strong> recibirán este mensaje.<br><span style="color:var(--muted);font-size:0.8em">Muestra: ${muestra}${data.total > 5 ? "..." : ""}</span>`;
});

document.getElementById("campEnviar")?.addEventListener("click", async () => {
  const nombre = document.getElementById("campNombre").value.trim();
  const mensaje = document.getElementById("campMensaje").value.trim();
  const msg = document.getElementById("campMsg");
  if (!nombre) { msg.textContent = "Añade un nombre a la campaña."; return; }
  if (!mensaje) { msg.textContent = "Escribe el mensaje."; return; }
  if (!confirm(`¿Enviar esta campaña? Los mensajes se enviarán con 4s de delay entre cada uno.`)) return;
  msg.textContent = "Iniciando envío...";
  const segmento = getCampSegmento();
  const res = await authFetch("/api/campanas/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre_campana: nombre, mensaje, ...segmento })
  });
  const data = await res.json();
  if (data.ok) {
    msg.innerHTML = `✅ Campaña iniciada — <strong>${data.total} mensajes</strong> en cola. El envío continúa en segundo plano.`;
    setTimeout(loadCampHistorial, 3000);
  } else {
    msg.textContent = `❌ Error: ${data.error}`;
  }
});

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
