let currentUser = null;

requireRole(["rrhh", "direccion"]).then((user) => {
  if (!user) return;
  currentUser = user;
  initTabs();
  initSeguimiento();
  loadJobsAdmin();
  loadHrApplications();
  initPreguntas();
});

// ── TABS ──────────────────────────────────────────────────────────────────

function initTabs() {
  const tabs = document.querySelectorAll("[data-tab]");
  const sections = document.querySelectorAll(".panel-section");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.tab;
      tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
      sections.forEach(s => s.classList.toggle("active", s.dataset.section === name));
    });
  });
}

// ── SEGUIMIENTO ───────────────────────────────────────────────────────────

const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const TIPOS = {
  nota:       { label: "Nota",       icon: "📝", color: "#f0f4ff", border: "#c7d7f5" },
  llamada:    { label: "Llamada",    icon: "📞", color: "#f0fff4", border: "#a8ddb5" },
  incidencia: { label: "Incidencia", icon: "⚠️", color: "#fff8f0", border: "#f5c09a" },
  consulta:   { label: "Consulta",   icon: "💬", color: "#fdf0ff", border: "#d7a8e8" },
};

let segWorkers = [];
let segLlamadasMes = {};
let segSelectedId = null;
let segMes = "";

function getMesActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMesLabel(mes) {
  const [y, m] = mes.split("-");
  return `${MESES_ES[parseInt(m) - 1]} ${y}`;
}

async function initSeguimiento() {
  segMes = getMesActual();
  document.getElementById("segMesLabel").textContent = getMesLabel(segMes);

  const container = document.getElementById("segWorkerList");
  try {
    const [wRes, lRes] = await Promise.all([
      authFetch("/api/rrhh/trabajadores"),
      authFetch(`/api/rrhh/llamadas/${segMes}`)
    ]);
    const wData = await wRes.json();
    const lData = await lRes.json();

    segWorkers = wData.ok ? wData.data : [];
    segLlamadasMes = {};
    if (lData.ok) lData.data.forEach(l => { segLlamadasMes[l.worker_id] = l; });

    renderWorkerList();
  } catch (err) {
    if (container) container.innerHTML = `<div class="seg-loading">Error de conexión al cargar los trabajadores.</div>`;
  }
}

// Track which locals are collapsed
const collapsedLocals = new Set();

function renderWorkerList() {
  const container = document.getElementById("segWorkerList");
  if (!container) return;

  if (!segWorkers.length) {
    container.innerHTML = `<div class="seg-loading">Sin trabajadores.<br><span style="font-size:0.8rem">Pulsa + para añadir el primero.</span></div>`;
    return;
  }

  const byLocal = {};
  segWorkers.forEach(w => {
    const loc = w.local || "Sin local asignado";
    if (!byLocal[loc]) byLocal[loc] = [];
    byLocal[loc].push(w);
  });

  const total = segWorkers.length;
  const llamados = segWorkers.filter(w => segLlamadasMes[w.id]?.realizada).length;

  container.innerHTML = `
    <div class="seg-progress">
      <div class="seg-progress-bar" style="width:${total ? Math.round(llamados / total * 100) : 0}%"></div>
      <span>${llamados}/${total} llamadas este mes</span>
    </div>
    ${Object.entries(byLocal).map(([local, workers]) => {
      const collapsed = collapsedLocals.has(local);
      const localDone = workers.filter(w => segLlamadasMes[w.id]?.realizada).length;
      return `
        <div class="seg-group">
          <div class="seg-group-label seg-collapsible" data-local="${local}">
            <span class="seg-collapse-arrow">${collapsed ? "▶" : "▼"}</span>
            <span class="seg-group-name">${escapeHtml(local)}</span>
            <span class="seg-group-count">${localDone}/${workers.length}</span>
          </div>
          ${collapsed ? "" : workers.map(w => {
            const done = segLlamadasMes[w.id]?.realizada;
            return `
              <div class="seg-worker-card ${w.id === segSelectedId ? "active" : ""} ${done ? "done" : ""}" data-id="${w.id}">
                <div class="seg-worker-avatar">${escapeHtml((w.nombre || w.username).charAt(0).toUpperCase())}</div>
                <div class="seg-worker-info">
                  <span class="seg-worker-name">${escapeHtml(w.nombre || w.username)}</span>
                </div>
                <span class="seg-call-badge ${done ? "done" : "pending"}">${done ? "✓" : "·"}</span>
              </div>`;
          }).join("")}
        </div>`;
    }).join("")}
  `;

  container.querySelectorAll(".seg-collapsible").forEach(lbl => {
    lbl.addEventListener("click", () => {
      const loc = lbl.dataset.local;
      if (collapsedLocals.has(loc)) collapsedLocals.delete(loc);
      else collapsedLocals.add(loc);
      renderWorkerList();
    });
  });

  container.querySelectorAll(".seg-worker-card").forEach(card => {
    card.addEventListener("click", () => {
      segSelectedId = parseInt(card.dataset.id);
      renderWorkerList();
      loadWorkerFicha(segSelectedId);
    });
  });
}

// ── AÑADIR / BORRAR TRABAJADORES ─────────────────────────────────────────

const LOCALES_LIST = window.LOCALES;

function openNewWorkerModal() {
  let modal = document.getElementById("segWorkerModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "segWorkerModal";
    modal.className = "seg-modal-overlay";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="seg-modal">
      <div class="seg-modal-head">
        <strong>Nuevo trabajador</strong>
        <button class="seg-modal-close" id="segModalClose">×</button>
      </div>
      <div class="seg-modal-body">
        <label><span>Nombre</span><input id="nwNombre" type="text" placeholder="Nombre completo" /></label>
        <label><span>Username</span><input id="nwUsername" type="text" placeholder="nombre_local (único)" /></label>
        <label><span>Local</span>
          <select id="nwLocal">
            <option value="">Selecciona local</option>
            ${LOCALES_LIST.map(l => `<option value="${l}">${l}</option>`).join("")}
          </select>
        </label>
        <label><span>Contraseña inicial</span><input id="nwPassword" type="text" value="tapeta2024" /></label>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
          <button class="btn" id="nwGuardar">Crear trabajador</button>
          <button class="btn ghost" id="segModalClose2">Cancelar</button>
        </div>
        <p class="form-note" id="nwMsg"></p>
      </div>
    </div>`;
  modal.classList.add("show");

  // Auto-fill username from nombre + local
  const nwNombre = modal.querySelector("#nwNombre");
  const nwLocal = modal.querySelector("#nwLocal");
  const nwUsername = modal.querySelector("#nwUsername");
  const autoUsername = () => {
    const n = nwNombre.value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const l = (nwLocal.value || "").split(" - ")[1]?.toLowerCase().replace(/[^a-z]/g, "") || "";
    if (n && l) nwUsername.value = `${n}_${l}`;
  };
  nwNombre.addEventListener("input", autoUsername);
  nwLocal.addEventListener("change", autoUsername);

  const close = () => modal.classList.remove("show");
  modal.querySelector("#segModalClose").addEventListener("click", close);
  modal.querySelector("#segModalClose2").addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  modal.querySelector("#nwGuardar").addEventListener("click", async () => {
    const nombre = nwNombre.value.trim();
    const username = nwUsername.value.trim();
    const local = nwLocal.value;
    const password = modal.querySelector("#nwPassword").value.trim();
    const msg = modal.querySelector("#nwMsg");
    if (!nombre || !username || !local || !password) { msg.textContent = "Rellena todos los campos."; return; }
    const btn = modal.querySelector("#nwGuardar");
    btn.disabled = true; btn.textContent = "Guardando…";
    const res = await authFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, rol: "trabajador", nombre, local })
    });
    const d = await res.json();
    if (d.ok) {
      close();
      await initSeguimiento();
    } else {
      msg.textContent = d.error || "Error al crear. ¿Username ya existe?";
      btn.disabled = false; btn.textContent = "Crear trabajador";
    }
  });

  modal.querySelector("#nwNombre").focus();
}

document.getElementById("btnNewWorker")?.addEventListener("click", openNewWorkerModal);

async function loadWorkerFicha(workerId) {
  const main = document.getElementById("segMain");
  if (!main) return;

  const worker = segWorkers.find(w => w.id === workerId);
  if (!worker) return;

  main.innerHTML = `<div class="seg-loading" style="padding:3rem 0">Cargando ficha…</div>`;

  const [notasRes, pregRes] = await Promise.all([
    authFetch(`/api/rrhh/trabajador/${workerId}/notas`),
    authFetch(`/api/rrhh/preguntas/${segMes}`)
  ]);
  const notasData = await notasRes.json();
  const pregData = await pregRes.json();

  const notas = notasData.ok ? notasData.data : [];
  const preguntas = pregData.ok ? pregData.data : [];
  const llamadaMes = segLlamadasMes[workerId];

  main.innerHTML = `
    <div class="seg-ficha">

      <!-- Header trabajador -->
      <div class="seg-ficha-header">
        <div class="seg-ficha-avatar">${escapeHtml((worker.nombre || worker.username).charAt(0).toUpperCase())}</div>
        <div>
          <div class="seg-ficha-name">${escapeHtml(worker.nombre || worker.username)}</div>
          <div class="seg-ficha-meta">${escapeHtml(worker.local || "Sin local")}</div>
        </div>
        <div class="seg-ficha-mes-badge ${llamadaMes?.realizada ? "done" : "pending"}">
          ${llamadaMes?.realizada
            ? `✅ Llamada realizada · ${new Date(llamadaMes.fecha_llamada).toLocaleDateString("es-ES", { day:"2-digit", month:"short" })}`
            : `⏳ Pendiente llamada de ${getMesLabel(segMes)}`}
        </div>
        <button class="seg-delete-worker" data-id="${worker.id}" title="Eliminar trabajador">🗑</button>
      </div>

      <!-- Llamada mensual -->
      <div class="seg-ficha-section" id="fichaLlamadaSection">
        <div class="seg-section-title">
          <span>📞 Llamada de ${getMesLabel(segMes)}</span>
          ${!llamadaMes?.realizada
            ? `<button class="btn" id="btnRegistrarLlamada" style="font-size:0.82rem;padding:0.4rem 0.9rem">Registrar llamada</button>`
            : `<button class="btn ghost" id="btnEditarLlamada" style="font-size:0.82rem;padding:0.4rem 0.9rem">Editar</button>`}
        </div>

        ${llamadaMes?.realizada ? renderLlamadaResumen(llamadaMes, preguntas) : ""}

        <div id="fichaLlamadaForm" class="seg-llamada-form hidden">
          ${preguntas.length ? `
            <div class="seg-llamada-preguntas">
              ${preguntas.map((p, i) => `
                <label class="seg-pregunta-label">
                  <span>${escapeHtml(p.pregunta)}</span>
                  <textarea class="seg-pregunta-input" data-idx="${i}" rows="2" placeholder="Respuesta…"></textarea>
                </label>`).join("")}
            </div>` : `<p style="font-size:0.85rem;color:var(--muted);margin-bottom:0.75rem">No hay preguntas configuradas para este mes. <a href="#" id="goPreguntas">Configurar →</a></p>`}
          <label style="margin-top:0.5rem">
            <span style="font-size:0.82rem;font-weight:600;color:var(--muted)">Espacio libre — lo que el trabajador quiera expresar</span>
            <textarea id="fichaComentarioLibre" rows="3" placeholder="Inquietudes, sugerencias, comentarios del trabajador…"></textarea>
          </label>
          <div style="display:flex;gap:0.6rem;margin-top:0.75rem;flex-wrap:wrap">
            <button class="btn" id="btnGuardarLlamada">Guardar llamada</button>
            <button class="btn ghost" id="btnCancelarLlamada">Cancelar</button>
          </div>
        </div>
      </div>

      <!-- Añadir nota -->
      <div class="seg-ficha-section">
        <div class="seg-section-title">
          <span>📋 Historial</span>
          <button class="btn ghost" id="btnAddNota" style="font-size:0.82rem;padding:0.4rem 0.9rem">+ Añadir nota</button>
        </div>
        <div id="fichaAddNota" class="seg-add-nota hidden">
          <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap">
            ${Object.entries(TIPOS).map(([k, v]) => `
              <button class="seg-tipo-btn ${k === "nota" ? "active" : ""}" data-tipo="${k}">${v.icon} ${v.label}</button>`).join("")}
          </div>
          <textarea id="notaContenido" rows="3" placeholder="Escribe aquí el contenido de la nota…"></textarea>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
            <button class="btn" id="btnGuardarNota">Guardar</button>
            <button class="btn ghost" id="btnCancelarNota">Cancelar</button>
          </div>
        </div>

        <div id="fichaTimeline">
          ${notas.length ? notas.map(n => renderNotaCard(n)).join("") : `<div class="seg-empty-timeline">Sin entradas aún.</div>`}
        </div>
      </div>

    </div>
  `;

  // Wire up llamada form
  const btnRegistrar = main.querySelector("#btnRegistrarLlamada");
  const btnEditar = main.querySelector("#btnEditarLlamada");
  const form = main.querySelector("#fichaLlamadaForm");
  const btnGuardar = main.querySelector("#btnGuardarLlamada");
  const btnCancelar = main.querySelector("#btnCancelarLlamada");
  const goPreg = main.querySelector("#goPreguntas");

  const showForm = () => {
    form?.classList.remove("hidden");
    if (llamadaMes?.respuestas) {
      try {
        const resp = JSON.parse(llamadaMes.respuestas);
        form.querySelectorAll(".seg-pregunta-input").forEach(ta => {
          ta.value = resp[ta.dataset.idx] || "";
        });
      } catch {}
    }
    if (llamadaMes?.comentario_libre) {
      const cl = form.querySelector("#fichaComentarioLibre");
      if (cl) cl.value = llamadaMes.comentario_libre;
    }
  };

  btnRegistrar?.addEventListener("click", showForm);
  btnEditar?.addEventListener("click", showForm);
  goPreg?.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelector("[data-tab='preguntas']")?.click();
  });

  btnGuardar?.addEventListener("click", async () => {
    const respuestas = {};
    form.querySelectorAll(".seg-pregunta-input").forEach(ta => {
      respuestas[ta.dataset.idx] = ta.value.trim();
    });
    const comentario_libre = form.querySelector("#fichaComentarioLibre")?.value.trim();
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando…";
    const res = await authFetch("/api/rrhh/llamada", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker_id: workerId, mes: segMes, respuestas, comentario_libre, autor: currentUser?.nombre || currentUser?.username })
    });
    const d = await res.json();
    if (d.ok) {
      const lRes = await authFetch(`/api/rrhh/llamadas/${segMes}`);
      const lData = await lRes.json();
      if (lData.ok) { segLlamadasMes = {}; lData.data.forEach(l => { segLlamadasMes[l.worker_id] = l; }); }
      renderWorkerList();
      toast("Llamada registrada", "success");
      loadWorkerFicha(workerId);
    } else {
      toast("Error al guardar la llamada", "error");
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar llamada";
    }
  });

  btnCancelar?.addEventListener("click", () => form?.classList.add("hidden"));

  // Wire up nota form
  const btnAddNota = main.querySelector("#btnAddNota");
  const addNotaBox = main.querySelector("#fichaAddNota");
  const btnGuardarNota = main.querySelector("#btnGuardarNota");
  const btnCancelarNota = main.querySelector("#btnCancelarNota");
  let selectedTipo = "nota";

  btnAddNota?.addEventListener("click", () => {
    addNotaBox?.classList.toggle("hidden");
    if (!addNotaBox?.classList.contains("hidden")) addNotaBox.querySelector("#notaContenido")?.focus();
  });

  addNotaBox?.querySelectorAll(".seg-tipo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      addNotaBox.querySelectorAll(".seg-tipo-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedTipo = btn.dataset.tipo;
    });
  });

  btnGuardarNota?.addEventListener("click", async () => {
    const contenido = addNotaBox.querySelector("#notaContenido")?.value.trim();
    if (!contenido) return;
    btnGuardarNota.disabled = true;
    const res = await authFetch(`/api/rrhh/trabajador/${workerId}/nota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: selectedTipo, contenido, autor: currentUser?.nombre || currentUser?.username })
    });
    const d = await res.json();
    if (d.ok) { toast("Nota guardada", "success"); loadWorkerFicha(workerId); }
    else { toast("Error al guardar la nota", "error"); btnGuardarNota.disabled = false; }
  });

  btnCancelarNota?.addEventListener("click", () => addNotaBox?.classList.add("hidden"));

  // Delete worker
  main.querySelector(".seg-delete-worker")?.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar a ${worker.nombre || worker.username}? Se borrarán también sus notas.`)) return;
    const res = await authFetch(`/api/users/${worker.id}`, { method: "DELETE" });
    const d = await res.json();
    if (d.ok) {
      segSelectedId = null;
      document.getElementById("segMain").innerHTML = `<div class="seg-empty"><div style="font-size:2.5rem;margin-bottom:0.75rem">👤</div><p>Selecciona un trabajador para ver su ficha</p></div>`;
      await initSeguimiento();
      toast("Trabajador eliminado", "success");
    } else {
      toast("Error al eliminar el trabajador", "error");
    }
  });

  // Delete nota
  main.querySelectorAll(".seg-nota-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta nota?")) return;
      const res = await authFetch(`/api/rrhh/nota/${btn.dataset.id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) loadWorkerFicha(workerId);
    });
  });
}

function renderLlamadaResumen(llamada, preguntas) {
  let html = `<div class="seg-llamada-resumen">`;
  if (llamada.respuestas && preguntas.length) {
    try {
      const resp = JSON.parse(llamada.respuestas);
      preguntas.forEach((p, i) => {
        const r = resp[i];
        if (r) html += `<div class="seg-llamada-qa"><strong>${escapeHtml(p.pregunta)}</strong><p>${escapeHtml(r)}</p></div>`;
      });
    } catch {}
  }
  if (llamada.comentario_libre) {
    html += `<div class="seg-llamada-qa seg-libre"><strong>💬 Espacio libre</strong><p>${escapeHtml(llamada.comentario_libre)}</p></div>`;
  }
  if (llamada.autor) html += `<div class="seg-llamada-meta">Registrado por ${escapeHtml(llamada.autor)}</div>`;
  html += `</div>`;
  return html;
}

function renderNotaCard(nota) {
  const tipo = TIPOS[nota.tipo] || TIPOS.nota;
  const fecha = new Date(nota.creado_en).toLocaleString("es-ES", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  return `
    <div class="seg-nota-card" style="border-color:${tipo.border};background:${tipo.color}">
      <div class="seg-nota-header">
        <span class="seg-nota-tipo">${tipo.icon} ${tipo.label}</span>
        <span class="seg-nota-fecha">${escapeHtml(fecha)}${nota.autor ? ` · ${escapeHtml(nota.autor)}` : ""}</span>
        <button class="seg-nota-delete" data-id="${nota.id}" title="Eliminar">×</button>
      </div>
      <div class="seg-nota-body">${escapeHtml(nota.contenido).replace(/\n/g, "<br>")}</div>
    </div>`;
}

// ── PREGUNTAS DEL MES ─────────────────────────────────────────────────────

function initPreguntas() {
  const mesInput = document.getElementById("preguntasMes");
  if (mesInput) mesInput.value = getMesActual();

  document.getElementById("preguntasCargar")?.addEventListener("click", cargarPreguntas);
  document.getElementById("preguntasAdd")?.addEventListener("click", addPreguntaRow);
  document.getElementById("preguntasGuardar")?.addEventListener("click", guardarPreguntas);

  cargarPreguntas();
}

async function cargarPreguntas() {
  const mes = document.getElementById("preguntasMes")?.value || getMesActual();
  const res = await authFetch(`/api/rrhh/preguntas/${mes}`);
  const data = await res.json();
  const list = document.getElementById("preguntasList");
  if (!list) return;
  list.innerHTML = "";
  const preguntas = data.ok ? data.data : [];
  if (preguntas.length) {
    preguntas.forEach(p => addPreguntaRow(p.pregunta));
  } else {
    addPreguntaRow("");
  }
}

function addPreguntaRow(texto = "") {
  const list = document.getElementById("preguntasList");
  if (!list) return;
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:0.5rem;align-items:center";
  row.innerHTML = `
    <span style="flex-shrink:0;width:20px;text-align:right;color:var(--muted);font-size:0.82rem">${list.children.length + 1}.</span>
    <input type="text" value="${texto.replace(/"/g, "&quot;")}" placeholder="Escribe la pregunta…" style="flex:1;font-size:0.88rem;border:1.5px solid var(--border);border-radius:8px;padding:0.4rem 0.7rem" />
    <button style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--muted);font-size:1.1rem;padding:0 0.2rem" title="Eliminar">×</button>
  `;
  row.querySelector("button").addEventListener("click", () => { row.remove(); renumberPreguntas(); });
  list.appendChild(row);
}

function renumberPreguntas() {
  document.querySelectorAll("#preguntasList > div").forEach((row, i) => {
    const num = row.querySelector("span");
    if (num) num.textContent = `${i + 1}.`;
  });
}

async function guardarPreguntas() {
  const mes = document.getElementById("preguntasMes")?.value || getMesActual();
  const preguntas = Array.from(document.querySelectorAll("#preguntasList input")).map(i => i.value.trim()).filter(Boolean);
  const msg = document.getElementById("preguntasMsg");
  if (msg) msg.textContent = "Guardando…";
  try {
    const res = await authFetch(`/api/rrhh/preguntas/${mes}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preguntas })
    });
    const d = await res.json();
    if (!d.ok) throw new Error();
    if (msg) { msg.textContent = "✓ Preguntas guardadas"; setTimeout(() => { msg.textContent = ""; }, 2000); }
    toast("Preguntas guardadas", "success");
  } catch (err) {
    if (msg) msg.textContent = "";
    toast("No se pudieron guardar las preguntas", "error");
  }
}

// ── VACANTES ──────────────────────────────────────────────────────────────

async function loadJobsAdmin() {
  const table = document.getElementById("jobsTable");
  if (!table) return;
  let data;
  try {
    const res = await authFetch("/api/hr/jobs/admin");
    data = await res.json();
  } catch (err) {
    table.textContent = "Error de conexión al cargar vacantes.";
    return;
  }
  if (!data.ok) { table.textContent = "No se pudieron cargar las vacantes."; return; }
  if (data.data.length === 0) { table.textContent = "Sin vacantes."; return; }
  table.innerHTML = `
    <div class="table-wrap">
    <table class="table">
      <thead><tr><th>Título</th><th>Local</th><th>Tipo</th><th>Activa</th><th></th></tr></thead>
      <tbody>
        ${data.data.map(j => `<tr>
          <td>${escapeHtml(j.titulo)}</td>
          <td>${escapeHtml(j.local)}</td>
          <td>${escapeHtml(j.tipo)}</td>
          <td>${j.activo ? "Sí" : "No"}</td>
          <td><button class="btn ghost job-toggle" data-id="${j.id}" data-active="${j.activo}">${j.activo ? "Cerrar" : "Abrir"}</button></td>
        </tr>`).join("")}
      </tbody>
    </table>
    </div>`;
  table.querySelectorAll(".job-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const j = data.data.find(x => String(x.id) === btn.dataset.id);
      try {
        const res = await authFetch(`/api/hr/jobs/${btn.dataset.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...j, activo: btn.dataset.active !== "1" }) });
        const d = await res.json();
        if (!d.ok) throw new Error();
        toast("Vacante actualizada", "success");
        loadJobsAdmin();
      } catch (err) {
        toast("No se pudo actualizar la vacante", "error");
      }
    });
  });
}

const jobForm = document.getElementById("jobForm");
jobForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(jobForm).entries());
  payload.activo = jobForm.querySelector('input[name="activo"]').checked;
  const btn = jobForm.querySelector("button[type=submit]");
  if (btn) { btn.disabled = true; btn.textContent = "Creando..."; }
  try {
    const res = await authFetch("/api/hr/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!d.ok) throw new Error();
    jobForm.reset();
    toast("Vacante creada", "success");
    loadJobsAdmin();
  } catch (err) {
    toast("No se pudo crear la vacante", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Crear vacante"; }
  }
});

// ── CANDIDATURAS ──────────────────────────────────────────────────────────

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
  let data;
  try {
    const res = await authFetch(`/api/hr/applications${qs.toString() ? "?" + qs : ""}`);
    data = await res.json();
  } catch (err) {
    table.textContent = "Error de conexión al cargar candidaturas.";
    return;
  }
  if (!data.ok) { table.textContent = "No se pudieron cargar las candidaturas."; return; }
  if (!data.data.length) { table.textContent = "Sin candidaturas."; return; }
  table.innerHTML = `
    <div class="table-wrap">
    <table class="table">
      <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Puesto</th><th>Estado</th><th>CV</th><th></th></tr></thead>
      <tbody>
        ${data.data.map(a => `<tr>
          <td>${escapeHtml(a.nombre)}</td>
          <td>${escapeHtml(a.email || "—")}</td>
          <td>${escapeHtml(a.telefono)}</td>
          <td>${escapeHtml(a.puesto)}</td>
          <td><span style="font-size:0.75rem;padding:2px 7px;border-radius:12px;background:${a.estado==="nuevo"?"#e3f2fd":a.estado==="en_proceso"?"#fff8e1":"#fce4ec"};color:#333">${escapeHtml(a.estado)}</span></td>
          <td>${a.cv_url ? `<a href="${encodeURI(a.cv_url)}" target="_blank" rel="noopener">Ver CV</a>` : "—"}</td>
          <td style="display:flex;gap:0.3rem">
            <button class="btn ghost hr-status" data-id="${a.id}" data-status="en_proceso" style="font-size:0.75rem;padding:0.25rem 0.6rem">En proceso</button>
            <button class="btn ghost hr-status" data-id="${a.id}" data-status="cerrado" style="font-size:0.75rem;padding:0.25rem 0.6rem">Cerrar</button>
          </td>
        </tr>`).join("")}
      </tbody>
    </table>
    </div>`;
  table.querySelectorAll(".hr-status").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        const res = await authFetch(`/api/hr/applications/${btn.dataset.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: btn.dataset.status }) });
        const d = await res.json();
        if (!d.ok) throw new Error();
        toast("Candidatura actualizada", "success");
        loadHrApplications();
      } catch (err) {
        toast("No se pudo actualizar la candidatura", "error");
      }
    });
  });
}

document.getElementById("hrSearch")?.addEventListener("click", loadHrApplications);
