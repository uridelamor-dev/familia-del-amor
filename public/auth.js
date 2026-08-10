(function () {
  // Si estamos dentro de un iframe, ocultar header y footer
  if (window !== window.top) {
    const s = document.createElement("style");
    s.textContent = "header.top, .footer { display: none !important; } body { padding-top: 0 !important; }";
    document.head.appendChild(s);
  }

  // Ocultar contenido inmediatamente hasta verificar la sesión
  const _hide = document.createElement("style");
  _hide.id = "_auth_hide";
  _hide.textContent = "main, footer { visibility: hidden !important; }";
  document.head.appendChild(_hide);

  function revealPage() {
    const s = document.getElementById("_auth_hide");
    if (s) s.remove();
  }

  function getToken() {
    return localStorage.getItem("token");
  }

  async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      // La contraseña sin estrenar no es una sesión caducada: el token vale, pero esa cuenta
      // no puede hacer nada hasta cambiarla. Se conserva el token —lo necesita la pantalla de
      // cambio— y se dice a qué va, en vez de soltar a la persona en el login sin explicación.
      let j = null;
      try { j = await res.clone().json(); } catch { /* algunos 401 no traen cuerpo */ }
      if (j && j.passwordTemporal) {
        window.location.href = "/login.html?cambiar=1";
      } else {
        localStorage.removeItem("token");
        window.location.href = "/login.html";
      }
      throw new Error("No autorizado");
    }
    return res;
  }

  async function requireRole(roles) {
    const token = getToken();
    if (!token) {
      window.location.href = "/login.html";
      return null;
    }
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.ok) throw new Error();
      const user = data.user;
      if (roles && roles.length && !roles.includes(user.rol)) {
        window.location.href = "/login.html";
        return null;
      }
      const bar = document.getElementById("userBar");
      if (bar) bar.innerHTML = `<strong>${user.nombre || user.username}</strong>`;
      revealPage();
      return user;
    } catch {
      localStorage.removeItem("token");
      window.location.href = "/login.html";
      return null;
    }
  }

  function logout() {
    localStorage.removeItem("token");
    window.location.href = "/login.html";
  }

  // ── Helpers compartidos ────────────────────────────────────────────────

  // Escapa datos no confiables (nombres de clientes, OCR de facturas, notas…)
  // antes de insertarlos en innerHTML. Evita XSS almacenado.
  function escapeHtml(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Notificación inline no bloqueante. tipo: "success" | "error" | "info"
  function toast(message, tipo = "info", ms = 3500) {
    let cont = document.getElementById("toastContainer");
    if (!cont) {
      cont = document.createElement("div");
      cont.id = "toastContainer";
      cont.className = "toast-container";
      document.body.appendChild(cont);
    }
    const el = document.createElement("div");
    el.className = `toast toast-${tipo}`;
    el.textContent = message;
    cont.appendChild(el);
    // forzar reflow para animar la entrada
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, ms);
  }

  // ── Locales (fuente única de verdad) ───────────────────────────────────
  // Antes esta lista estaba copiada a mano en ~13 sitios con órdenes
  // distintos. Ahora vive aquí y los <select> se rellenan solos.
  const LOCALES = [
    "La Tapeta - Blanes",
    "Cooperativa - Blanes",
    "La Tapeta - Lloret",
    "La Tapeta - Girona",
    "Can Mateu - Tordera",
    "La Tapa Ibérica - Tordera",
    "Botiga d'en Mateu - Tordera",
    "Oficina"
  ];

  // Centros SIN atención al público: no se puede reservar en ellos ni venden por TPV,
  // pero sí reciben facturas, incidencias, trabajadores e inventario.
  // El formulario público de reservas tiene su propia lista (RESERVA_LOCALS en app.js),
  // así que estos no aparecen ahí; esta constante es para el panel y el servidor.
  const LOCALES_SIN_PUBLICO = ["Oficina"];

  // Rellena un <select data-locales>. Atributos opcionales:
  //   data-placeholder="texto"  → primera opción con value=""
  //   data-all="texto"          → última opción "todos"
  //   data-all-value="Todos"    → value de esa opción (por defecto "Todos")
  function fillLocalesSelect(sel) {
    const prev = sel.value;
    const placeholder = sel.getAttribute("data-placeholder");
    const allLabel = sel.getAttribute("data-all");
    const allValue = sel.getAttribute("data-all-value") || "Todos";
    let html = "";
    if (placeholder !== null) html += `<option value="">${escapeHtml(placeholder)}</option>`;
    html += LOCALES.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
    if (allLabel !== null) html += `<option value="${escapeHtml(allValue)}">${escapeHtml(allLabel)}</option>`;
    sel.innerHTML = html;
    if (prev) sel.value = prev;
  }

  function fillAllLocalesSelects(root = document) {
    root.querySelectorAll("select[data-locales]").forEach(fillLocalesSelect);
  }

  window.authFetch = authFetch;
  window.requireRole = requireRole;
  window.logout = logout;
  window.escapeHtml = escapeHtml;
  window.toast = toast;
  window.LOCALES = LOCALES;
  window.LOCALES_SIN_PUBLICO = LOCALES_SIN_PUBLICO;
  window.fillLocalesSelect = fillLocalesSelect;
  window.fillAllLocalesSelects = fillAllLocalesSelects;

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("logoutBtn");
    if (btn) btn.addEventListener("click", logout);
    fillAllLocalesSelects();
  });
})();
