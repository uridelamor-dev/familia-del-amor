requireRole(["trabajador", "encargado", "direccion"]).then((user) => {
  if (!user) return;
  loadPerfil();
  loadCuadrante();
  loadRegistro();
  loadAnnouncements();
  loadPulso();
  loadAusencias();
  loadDisponibilidad();
});

// Enlace a la encuesta del mes, por si perdió el WhatsApp o lo borró. Pedirlo ROTA el
// token, así que el enlace viejo deja de valer: si alguien le hubiera cogido el móvil,
// ese enlace ya no sirve.
async function loadPulso() {
  const bloque = document.getElementById("pulsoBloque");
  if (!bloque) return;
  try {
    const res = await authFetch("/api/pulso/mi-enlace", { method: "POST" });
    const data = await res.json();
    if (!data.ok || !data.url) return; // ya contestada, caducada o aún sin encuesta: no molestamos
    document.getElementById("pulsoLink").href = data.url;
    bloque.classList.remove("hidden");
  } catch { /* si falla, simplemente no se enseña */ }
}

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

    // El bloque del PIN solo si ya tiene uno: a quien no ficha no le sirve de nada, y
    // enseñárselo solo conseguiría preocuparle.
    const pinBloque = document.getElementById("pinBloque");
    if (pinBloque) {
      const tiene = !!(p.pin && p.pin.tiene);
      pinBloque.classList.toggle("hidden", !tiene);
      if (tiene) {
        const provisional = !!p.pin.pin_temporal;
        // Con el provisional no se pide el actual: es el que le acaban de decir en voz
        // alta, y pedírselo sería un obstáculo justo cuando más interesa que lo cambie.
        document.getElementById("pinActualCampo").classList.toggle("hidden", provisional);
        document.getElementById("pinSub").textContent = provisional
          ? "Ahora mismo usas el que te dio tu encargado. Cámbialo por uno que solo sepas tú."
          : "Es el que tecleas en la tablet del local.";
      }
    }

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

// ── Mi horario ───────────────────────────────────────────────────────────────
// Solo lo PUBLICADO. Un borrador es una idea a medias del encargado, y enseñarlo haría
// que la gente se organizara la vida con horarios que todavía pueden cambiar.
const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const TIPO_NO_TURNO = { libranza: "Libre", vacaciones: "Vacaciones", baja: "Baja", formacion: "Formación", festivo: "Festivo" };
let CUAD_LUNES = "";

async function loadCuadrante() {
  const bloque = document.getElementById("cuadranteBloque");
  const lista = document.getElementById("cuadranteLista");
  if (!bloque || !lista) return;
  try {
    const res = await authFetch("/api/mi-cuadrante" + (CUAD_LUNES ? "?lunes=" + CUAD_LUNES : ""));
    const data = await res.json();
    if (!data.ok || data.sinLocal) return;   // sin local asignado no hay cuadrante que enseñar
    bloque.classList.remove("hidden");
    CUAD_LUNES = data.lunes;

    const rango = document.getElementById("semRango");
    if (rango) rango.textContent = `${fechaCorta(data.dias[0])} – ${fechaCorta(data.dias[6])}`;
    const sub = document.getElementById("cuadranteSub");
    if (sub) sub.textContent = data.publicado
      ? `${data.local} · publicado el ${(data.publicadoEn || "").slice(0, 10)}`
      : data.local;

    if (!data.publicado) {
      lista.innerHTML = `<div class="card"><p>El horario de esta semana todavía no está publicado.
        En cuanto lo esté, aparecerá aquí y lo verás también en el grupo.</p></div>`;
      return;
    }

    const porDia = new Map(data.dias.map((d) => [d, []]));
    for (const t of data.turnos) if (porDia.has(t.dia)) porDia.get(t.dia).push(t);

    lista.innerHTML = `<ul class="sem-lista">${data.dias.map((d, i) => {
      const turnos = porDia.get(d) || [];
      const esHoy = d === data.hoy;
      const detalle = turnos.length
        ? turnos.map((t) => t.tipo === "turno"
            ? `<span class="sem-turno"><b>${escapeHtml(t.inicio)}–${t.finAbierto ? "cierre" : escapeHtml(t.fin)}</b>${t.area ? ` <small>${escapeHtml(t.area)}</small>` : ""}${t.nota ? ` <small>· ${escapeHtml(t.nota)}</small>` : ""}</span>`
            : `<span class="sem-libre">${escapeHtml(TIPO_NO_TURNO[t.tipo] || t.tipo)}</span>`).join("")
        : `<span class="sem-libre">Libre</span>`;
      return `<li class="${esHoy ? "es-hoy" : ""}">
        <span class="sem-dia">${DIAS_SEMANA[i]} <small>${fechaCorta(d)}</small></span>
        <span class="sem-detalle">${detalle}</span></li>`;
    }).join("")}</ul>`;
  } catch { /* si falla, la página sigue sirviendo para lo demás */ }
}

function fechaCorta(iso) {
  const [, m, d] = String(iso || "").split("-");
  return d ? `${d}/${m}` : "";
}

document.getElementById("semAnt")?.addEventListener("click", () => { CUAD_LUNES = sumaDiasISO(CUAD_LUNES, -7); loadCuadrante(); });
document.getElementById("semSig")?.addEventListener("click", () => { CUAD_LUNES = sumaDiasISO(CUAD_LUNES, 7); loadCuadrante(); });
function sumaDiasISO(iso, n) {
  const d = new Date(iso + "T12:00:00Z");   // mediodía: así ningún cambio de hora mueve el día
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Mi registro ──────────────────────────────────────────────────────────────
const EV_TXT = { entrada: "Entrada", salida: "Salida", pausa_inicio: "Pausa", pausa_fin: "Vuelta" };
const enHoras = (min) => {
  const n = Math.abs(Math.round(min || 0));
  const h = Math.floor(n / 60), m = n % 60;
  return (min < 0 ? "−" : "") + (h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`);
};

async function loadRegistro() {
  const bloque = document.getElementById("registroBloque");
  const lista = document.getElementById("registroLista");
  if (!bloque || !lista) return;
  try {
    const res = await authFetch("/api/mi-registro");
    const data = await res.json();
    if (!data.ok || data.sinLocal) return;
    if (!data.dias.length) return;   // sin fichajes todavía, no se enseña una tabla vacía
    bloque.classList.remove("hidden");

    const resumen = document.getElementById("registroResumen");
    if (resumen) {
      resumen.innerHTML = `
        <div class="card"><small>Del ${escapeHtml(data.periodo.desde)} al ${escapeHtml(data.periodo.hasta)}</small>
          <p>${escapeHtml(enHoras(data.totalFichado))} fichados</p></div>
        <div class="card"><small>Validado por la empresa</small>
          <p>${data.totalValidado ? escapeHtml(enHoras(data.totalValidado)) : "Todavía nada"}</p></div>
        <div class="card"><small>Tu bolsa de horas</small>
          <p>${escapeHtml((data.saldoBolsa > 0 ? "+" : "") + enHoras(data.saldoBolsa))}</p></div>`;
    }

    lista.innerHTML = `<ul class="reg-lista">${data.dias.map((d) => `<li>
      <span class="reg-dia">${fechaCorta(d.dia)}</span>
      <span class="reg-evs">${d.eventos.map((e) => `<span class="${e.anulado ? "anulado" : ""}">
        ${escapeHtml(EV_TXT[e.tipo] || e.tipo)} ${escapeHtml(e.hora)}${e.aMano ? ' <small class="a-mano">a mano</small>' : ""}
        ${e.motivo ? `<small>· ${escapeHtml(e.motivo)}</small>` : ""}</span>`).join("")}</span>
      <span class="reg-tot">${d.minFichado != null ? escapeHtml(enHoras(d.minFichado)) : "—"}</span>
    </li>`).join("")}</ul>`;
  } catch { /* idem */ }
}

// El CSV va por fetch con el token: un <a href> no lleva la cabecera de sesión.
document.getElementById("registroCsv")?.addEventListener("click", async () => {
  try {
    const res = await authFetch("/api/mi-registro/csv");
    if (!res.ok) return;
    const nombre = (res.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "mi-registro.csv";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch { /* nada que hacer */ }
});

// ── Mi PIN ───────────────────────────────────────────────────────────────────
document.getElementById("pinForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("pinMsg");
  if (msg) msg.textContent = "Guardando…";
  try {
    const res = await authFetch("/api/mi-pin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actual: document.getElementById("pinActual").value,
        pin: document.getElementById("pinNuevo").value,
      }),
    });
    const data = await res.json();
    if (msg) msg.textContent = data.ok ? "PIN cambiado ✅" : (data.error || "No se pudo cambiar");
    if (data.ok) { document.getElementById("pinForm").reset(); loadPerfil(); }
  } catch { if (msg) msg.textContent = "Error de conexión"; }
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

// ── Mis ausencias ────────────────────────────────────────────────────────────
// Pedir unas vacaciones y ver si te las han dado. Hasta ahora esto era un WhatsApp que se
// perdía en el grupo y una respuesta que nadie recordaba haber dado.
const AUS_ESTADO_CLASE = { pendiente: "pend", aprobada: "ok", rechazada: "no", cancelada: "can" };

async function loadAusencias() {
  const bloque = document.getElementById("ausenciasBloque");
  const lista = document.getElementById("ausLista");
  if (!bloque || !lista) return;
  let data;
  try {
    const res = await authFetch("/api/mis-ausencias");
    data = await res.json();
    if (!data.ok) return;
  } catch { return; }
  bloque.classList.remove("hidden");

  // El selector de tipo lo manda el servidor: la baja médica NO está, y no puede estarlo.
  const sel = document.getElementById("ausTipo");
  if (sel && !sel.options.length) {
    sel.innerHTML = (data.tipos || []).map((t) => `<option value="${escapeHtml(t.valor)}">${escapeHtml(t.etiqueta)}</option>`).join("");
  }

  if (!data.data.length) {
    lista.innerHTML = `<p class="mut">Todavía no has pedido ninguna. Cuando lo hagas, aparecerá aquí con su estado.</p>`;
    return;
  }
  lista.innerHTML = `<ul class="aus-lista">${data.data.map((a) => `<li class="aus ${AUS_ESTADO_CLASE[a.estado] || ""}">
      <div class="aus-cab">
        <b>${escapeHtml(a.etiquetaTipo)}</b>
        <span class="aus-estado">${escapeHtml(a.etiquetaEstado)}</span>
      </div>
      <div class="aus-fechas">${escapeHtml(rangoCorto(a.desde, a.hasta))}</div>
      ${a.comentario ? `<div class="aus-nota">«${escapeHtml(a.comentario)}»</div>` : ""}
      ${a.respuesta ? `<div class="aus-resp">Respuesta: ${escapeHtml(a.respuesta)}</div>` : ""}
      ${a.puedeCancelar ? `<button class="btn ghost btn-sm" type="button" data-aus-cancelar="${a.id}">Cancelar solicitud</button>` : ""}
    </li>`).join("")}</ul>`;
}

/** «24–27 de agosto» o «14 de septiembre» si es un solo día. */
function rangoCorto(desde, hasta) {
  const M = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [, m1, d1] = String(desde).split("-");
  const [, m2, d2] = String(hasta).split("-");
  if (desde === hasta) return `${Number(d1)} de ${M[Number(m1) - 1]}`;
  if (m1 === m2) return `${Number(d1)}–${Number(d2)} de ${M[Number(m1) - 1]}`;
  return `${Number(d1)} de ${M[Number(m1) - 1]} – ${Number(d2)} de ${M[Number(m2) - 1]}`;
}

document.getElementById("ausNueva")?.addEventListener("click", () => {
  document.getElementById("ausForm")?.classList.remove("hidden");
  document.getElementById("ausNueva")?.classList.add("hidden");
});
document.getElementById("ausCancelar")?.addEventListener("click", () => {
  document.getElementById("ausForm")?.classList.add("hidden");
  document.getElementById("ausNueva")?.classList.remove("hidden");
  const msg = document.getElementById("ausMsg"); if (msg) msg.textContent = "";
});

document.getElementById("ausForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("ausMsg");
  const cuerpo = {
    tipo: document.getElementById("ausTipo").value,
    desde: document.getElementById("ausDesdeValue").value,
    hasta: document.getElementById("ausHastaValue").value || document.getElementById("ausDesdeValue").value,
    comentario: document.getElementById("ausComentario").value,
  };
  if (!cuerpo.desde) { if (msg) msg.textContent = "Elige al menos la fecha de inicio."; return; }
  if (msg) msg.textContent = "Enviando…";
  try {
    const res = await authFetch("/api/mis-ausencias", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    });
    const data = await res.json();
    if (!data.ok) { if (msg) msg.textContent = data.error || "No se pudo enviar"; return; }
    document.getElementById("ausForm").reset();
    document.getElementById("ausDesdeValue").value = "";
    document.getElementById("ausHastaValue").value = "";
    document.getElementById("ausCancelar").click();
    const aviso = document.getElementById("ausAviso");
    if (aviso) aviso.textContent = data.mensaje || "Solicitud enviada.";
    loadAusencias();
  } catch { if (msg) msg.textContent = "Error de conexión"; }
});

document.getElementById("ausLista")?.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-aus-cancelar]");
  if (!b) return;
  if (!confirm("¿Cancelar esta solicitud?")) return;
  try {
    const res = await authFetch(`/api/mis-ausencias/${b.getAttribute("data-aus-cancelar")}/cancelar`, { method: "POST" });
    const data = await res.json();
    const aviso = document.getElementById("ausAviso");
    if (aviso) aviso.textContent = data.ok ? (data.mensaje || "Cancelada.") : (data.error || "No se pudo cancelar");
    loadAusencias();
  } catch { /* sin conexión: se reintenta al recargar */ }
});

// ── Mi disponibilidad ────────────────────────────────────────────────────────
// Siete filas, tres opciones y una franja opcional. Se rellena con el móvil en la mano, así
// que va apilado y con botones grandes: nada de tabla de siete columnas.
const DIAS_DISP = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const PREFS = [["disponible", "Disponible"], ["prefiere", "Prefiero no"], ["no_disponible", "No puedo"]];

async function loadDisponibilidad() {
  const bloque = document.getElementById("dispBloque");
  const caja = document.getElementById("dispDias");
  if (!bloque || !caja) return;
  let data;
  try {
    const res = await authFetch("/api/mi-disponibilidad");
    data = await res.json();
    if (!data.ok) return;
  } catch { return; }
  bloque.classList.remove("hidden");

  // Solo se guardan `prefiere` y `no_disponible`: lo que no está es que se puede.
  const porDow = new Map((data.data || []).map((f) => [Number(f.dow), f]));
  caja.innerHTML = DIAS_DISP.map((nombre, dow) => {
    const f = porDow.get(dow);
    const pref = f ? f.preferencia : "disponible";
    const todoElDia = !f || (Number(f.inicio_min) === 0 && Number(f.fin_min) >= 1560);
    return `<div class="disp-dia" data-dow="${dow}">
      <div class="disp-nombre">${escapeHtml(nombre)}${f && f.origen === "administrativo"
        ? ` <small class="disp-admin">lo cambió ${escapeHtml(f.autor || "administración")}</small>` : ""}</div>
      <div class="disp-opts">${PREFS.map(([v, t]) => `<label class="disp-opt ${pref === v ? "on" : ""}">
        <input type="radio" name="disp-${dow}" value="${v}" ${pref === v ? "checked" : ""}> ${escapeHtml(t)}</label>`).join("")}</div>
      <div class="disp-franja ${pref === "disponible" ? "hidden" : ""}">
        <label class="disp-todo"><input type="checkbox" class="disp-todoeldia" ${todoElDia ? "checked" : ""}> Todo el día</label>
        <span class="disp-horas ${todoElDia ? "hidden" : ""}">
          de <input type="time" class="disp-ini" value="${escapeHtml(minAHora(f ? f.inicio_min : 0))}">
          a <input type="time" class="disp-fin" value="${escapeHtml(minAHora(f ? f.fin_min : 1440))}">
        </span>
      </div>
    </div>`;
  }).join("");
}

const minAHora = (min) => {
  const b = ((Math.round(Number(min) || 0) % 1440) + 1440) % 1440;
  return `${String(Math.floor(b / 60)).padStart(2, "0")}:${String(b % 60).padStart(2, "0")}`;
};
const horaAMinutos = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

document.getElementById("dispDias")?.addEventListener("change", (e) => {
  const dia = e.target.closest(".disp-dia");
  if (!dia) return;
  if (e.target.type === "radio") {
    dia.querySelectorAll(".disp-opt").forEach((l) => l.classList.toggle("on", l.contains(e.target)));
    // «Disponible» no tiene franja que elegir: no hay nada que acotar.
    dia.querySelector(".disp-franja").classList.toggle("hidden", e.target.value === "disponible");
  }
  if (e.target.classList.contains("disp-todoeldia")) {
    dia.querySelector(".disp-horas").classList.toggle("hidden", e.target.checked);
  }
});

document.getElementById("dispGuardar")?.addEventListener("click", async () => {
  const msg = document.getElementById("dispMsg");
  const franjas = [];
  for (const dia of document.querySelectorAll(".disp-dia")) {
    const pref = dia.querySelector('input[type="radio"]:checked')?.value;
    if (!pref || pref === "disponible") continue;
    const todo = dia.querySelector(".disp-todoeldia").checked;
    // Hasta 26:00 en minutos absolutos: la noche que acaba de madrugada sigue siendo del día.
    const ini = todo ? 0 : (horaAMinutos(dia.querySelector(".disp-ini").value) ?? 0);
    const fin = todo ? 1560 : (horaAMinutos(dia.querySelector(".disp-fin").value) ?? 1440);
    if (fin <= ini) { if (msg) msg.textContent = `En ${DIAS_DISP[Number(dia.getAttribute("data-dow"))]}, la hora de fin tiene que ser posterior a la de inicio.`; return; }
    franjas.push({ dow: Number(dia.getAttribute("data-dow")), preferencia: pref, inicio_min: ini, fin_min: fin });
  }
  if (msg) msg.textContent = "Guardando…";
  try {
    const res = await authFetch("/api/mi-disponibilidad", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ franjas }),
    });
    const data = await res.json();
    if (msg) msg.textContent = data.ok ? (data.mensaje || "Guardada ✅") : (data.error || "No se pudo guardar");
  } catch { if (msg) msg.textContent = "Error de conexión"; }
});
