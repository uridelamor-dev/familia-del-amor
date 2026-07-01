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
      localStorage.removeItem("token");
      window.location.href = "/login.html";
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

  window.authFetch = authFetch;
  window.requireRole = requireRole;
  window.logout = logout;
  window.escapeHtml = escapeHtml;
  window.toast = toast;

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("logoutBtn");
    if (btn) btn.addEventListener("click", logout);
  });
})();
