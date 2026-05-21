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

// ── EDITOR DE CONTENIDOS WEB (WYSIWYG) ───────────────────────────────────

let ceditLang = "es";
let ceditSaveTimer = null;

async function ceditSave(key, value) {
  try {
    const r = await authFetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value })
    });
    return (await r.json()).ok;
  } catch { return false; }
}

function ceditIndicator(ok) {
  const el = document.getElementById("ceditSaveInd");
  if (!el) return;
  clearTimeout(ceditSaveTimer);
  el.textContent = ok === "loading" ? "Guardando…" : ok ? "✓ Guardado" : "⚠ Error";
  el.className = "cedit-save-indicator" + (ok === "loading" ? " loading" : ok ? " ok show" : " err show");
  if (ok !== "loading") ceditSaveTimer = setTimeout(() => { el.className = "cedit-save-indicator"; }, 2500);
}

// Activar edit mode en el iframe al cargar y tras recargar
(function setupWysiwygFrame() {
  const frame = document.getElementById("previewFrame");
  if (!frame) return;

  function activateFrame() {
    frame.contentWindow?.postMessage({ type: "edit-mode", enabled: true }, "*");
  }

  frame.addEventListener("load", activateFrame);
})();

// Subida de imágenes (hero / logo) desde la barra superior
document.querySelectorAll("[data-img-key]").forEach(input => {
  input.addEventListener("change", async function () {
    if (!this.files[0]) return;
    const key = this.dataset.imgKey;
    ceditIndicator("loading");
    const fd = new FormData();
    fd.append("files", this.files[0]);
    const d = await (await authFetch("/api/upload", { method: "POST", body: fd })).json();
    this.value = "";
    if (!d.ok || !d.urls[0]) { ceditIndicator(false); return; }
    const ok = await ceditSave(key, d.urls[0]);
    ceditIndicator(ok);
    if (ok) {
      const frame = document.getElementById("previewFrame");
      if (frame) {
        frame.addEventListener("load", function once() {
          frame.removeEventListener("load", once);
          frame.contentWindow?.postMessage({ type: "edit-mode", enabled: true }, "*");
        });
        frame.contentWindow?.location.reload();
      }
    }
  });
});

document.querySelectorAll(".cedit-lang").forEach(btn => {
  btn.addEventListener("click", () => {
    ceditLang = btn.dataset.lang;
    document.querySelectorAll(".cedit-lang").forEach(b => b.classList.toggle("active", b === btn));
    document.getElementById("previewFrame")?.contentWindow?.postMessage({ type: "set-lang", lang: ceditLang }, "*");
  });
});

const locals = [
  { slug: "la-tapeta", name: "La Tapeta" },
  { slug: "cooperativa", name: "Cooperativa" },
  { slug: "can-mateu", name: "Can Mateu" },
  { slug: "la-tapa-iberica", name: "La Tapa Ibérica" },
  { slug: "botiga-d-en-mateu", name: "Botiga d'en Mateu" },
  { slug: "viva-la-pepa", name: "Viva la Pepa" }
];

const localsForm = document.getElementById("localsForm");
const localsStatus = document.getElementById("localsStatus");

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

async function saveLocals() {
  if (!localsForm) return;
  if (localsStatus) localsStatus.textContent = "Guardando…";
  const payload = Object.fromEntries(new FormData(localsForm).entries());
  for (const [key, value] of Object.entries(payload)) {
    const res = await authFetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: value || "" })
    });
    const d = await res.json();
    if (!d.ok) {
      if (localsStatus) localsStatus.textContent = "Error guardando.";
      return;
    }
  }
  if (localsStatus) { localsStatus.textContent = "✓ Guardado"; setTimeout(() => (localsStatus.textContent = ""), 2000); }
  document.getElementById("previewFrameLocals")?.contentWindow?.location.reload();
}

document.getElementById("localsSubmitBtn")?.addEventListener("click", saveLocals);
loadContent();

const leadsTable = document.getElementById("leadsTable");
const leadQ = document.getElementById("leadQ");
const leadCity = document.getElementById("leadCity");
const leadFrom = document.getElementById("leadFrom");
const leadTo = document.getElementById("leadTo");
const leadGenero = document.getElementById("leadGenero");
const leadCumple = document.getElementById("leadCumple");
const leadLocal = document.getElementById("leadLocal");
const leadSearch = document.getElementById("leadSearch");
const leadExport = document.getElementById("leadExport");

function buildQuery() {
  const params = new URLSearchParams();
  if (leadQ.value) params.set("q", leadQ.value);
  if (leadCity.value) params.set("poblacion", leadCity.value);
  if (leadGenero?.value) params.set("genero", leadGenero.value);
  if (leadCumple?.value) params.set("cumple_mes", leadCumple.value);
  if (leadLocal?.value) params.set("local", leadLocal.value);
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

  const origenBadge = o => o === "lead"
    ? `<span style="font-size:0.72rem;background:#e8f5e9;color:#2e7d32;border-radius:4px;padding:1px 5px">lead</span>`
    : `<span style="font-size:0.72rem;background:#e3f2fd;color:#1565c0;border-radius:4px;padding:1px 5px">reserva</span>`;

  const rows = data.data.map(r => `
    <tr>
      <td>${r.nombre} ${r.apellidos || ""} ${origenBadge(r.origen)}</td>
      <td>${r.correo || "—"}</td>
      <td>${r.telefono}</td>
      <td>${r.poblacion || "—"}</td>
      <td>${(r.ultima_actividad || "").slice(0, 10)}</td>
    </tr>`).join("");

  leadsTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Población</th><th>Última actividad</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="padding:8px 12px;font-size:0.8rem;color:var(--muted)">${data.data.length} contacto${data.data.length !== 1 ? "s" : ""} en total</p>
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

let editSaveTimer = null;

window.addEventListener("message", async (event) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === "edit-update") {
    const dbKey = msg.lang ? `${msg.key}_${msg.lang}` : msg.key;
    clearTimeout(editSaveTimer);
    editSaveTimer = setTimeout(async () => {
      ceditIndicator("loading");
      ceditIndicator(await ceditSave(dbKey, msg.value));
    }, 600);
  }

  if (msg.type === "cedit-image-click") {
    const input = document.querySelector(`[data-img-key="${msg.key}"]`);
    if (input) input.click();
  }
});
