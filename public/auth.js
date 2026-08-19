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
      // Aviso de contraseña, sin bloquear: se puede posponer y seguir trabajando.
      if (user.pass_temporal) setTimeout(() => avisoPassword(user), 700);
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

  // ── Aviso de contraseña sin estrenar ───────────────────────────────────
  // La primera contraseña la elige quien da el alta, así que la sabe más de una persona.
  // Conviene cambiarla, pero NO se bloquea el panel por ello: quien abre el local a las siete
  // de la mañana no puede quedarse fuera por un formulario. Se avisa, se puede cambiar aquí
  // mismo, y se puede dejar para luego.
  //
  // Se pide la contraseña ACTUAL. Antes se daba por hecho que era el nombre de usuario —cierto
  // solo en un tipo de alta— y a todos los demás les decía «la actual no es correcta», que es
  // el peor error posible: el que acusa a la persona de equivocarse cuando no lo ha hecho.
  const POSPUESTO = "avisoPassPospuesto";

  // El estilo viaja con el aviso: el panel no carga styles.css y las páginas de rol sí, así
  // que dejarlo en una hoja u otra lo dejaría sin estilo justo en la mitad de los sitios.
  function estiloAviso() {
    if (document.getElementById("passAvisoCSS")) return;
    const st = document.createElement("style");
    st.id = "passAvisoCSS";
    st.textContent = `
      .pass-ov{position:fixed;inset:0;z-index:9000;display:grid;place-items:center;padding:18px;
        background:rgba(15,17,12,.45);animation:passIn .18s ease}
      @keyframes passIn{from{opacity:0}to{opacity:1}}
      .pass-card{width:min(400px,100%);background:#fff;color:#20241d;border-radius:16px;padding:22px;
        box-shadow:0 18px 50px rgba(0,0,0,.25);max-height:92vh;overflow:auto}
      .pass-card h3{margin:0 0 8px;font-size:18px}
      .pass-card p{margin:0 0 16px;font-size:13.5px;line-height:1.55;color:#5b6157}
      .pass-card label{display:block;margin-bottom:11px}
      .pass-card label span{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px;color:#3c423a}
      .pass-card input{width:100%;padding:11px 12px;border:1px solid #d8ddd4;border-radius:10px;
        font-size:15px;box-sizing:border-box;background:#fff;color:#20241d}
      .pass-card input:focus{outline:none;border-color:#5c7a4a;box-shadow:0 0 0 3px rgba(92,122,74,.15)}
      .pass-err{display:none;margin:2px 0 10px;padding:9px 11px;border-radius:9px;background:#fdeaea;color:#a32020;font-size:13px}
      .pass-acts{display:flex;gap:9px;justify-content:flex-end;margin-top:6px}
      .pass-btn{padding:11px 16px;border-radius:10px;border:1px solid #d8ddd4;background:#fff;
        font-size:14px;font-weight:600;cursor:pointer;color:#3c423a}
      .pass-btn:hover{border-color:#b9c2b0}
      .pass-btn.pass-ok{background:#5c7a4a;border-color:#5c7a4a;color:#fff}
      .pass-btn.pass-ok:hover{background:#4d6a3d}
      .pass-btn:disabled{opacity:.6;cursor:default}
      @media (max-width:420px){.pass-acts{flex-direction:column-reverse}.pass-btn{width:100%}}`;
    document.head.appendChild(st);
  }

  function avisoPassword(user) {
    if (document.getElementById("passAviso")) return;
    estiloAviso();
    // Pospuesto hace menos de un día: no se repite en cada pantalla.
    const hasta = Number(localStorage.getItem(POSPUESTO) || 0);
    if (hasta && Date.now() < hasta) return;

    const ov = document.createElement("div");
    ov.id = "passAviso";
    ov.className = "pass-ov";
    ov.innerHTML = `
      <div class="pass-card" role="dialog" aria-labelledby="passT">
        <h3 id="passT">Cambia tu contraseña</h3>
        <p>Entraste con la contraseña que te dieron, así que la sabe alguien más.
           Elige una que solo sepas tú. Puedes hacerlo ahora o dejarlo para luego.</p>
        <form id="passForm">
          <label><span>Contraseña actual</span>
            <input type="password" name="actual" required autocomplete="current-password"></label>
          <label><span>Nueva</span>
            <input type="password" name="nueva" required autocomplete="new-password" minlength="6"></label>
          <label><span>Repite la nueva</span>
            <input type="password" name="repite" required autocomplete="new-password" minlength="6"></label>
          <div id="passErr" class="pass-err"></div>
          <div class="pass-acts">
            <button type="button" class="pass-btn" id="passLuego">Ahora no</button>
            <button type="submit" class="pass-btn pass-ok">Guardar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(ov);
    const cerrar = () => ov.remove();
    const err = (t) => { const e = ov.querySelector("#passErr"); e.textContent = t; e.style.display = "block"; };

    ov.querySelector("#passLuego").addEventListener("click", () => {
      // Un día. Ni cada pantalla —que es acoso— ni nunca más —que es olvidarlo—.
      localStorage.setItem(POSPUESTO, String(Date.now() + 24 * 60 * 60 * 1000));
      cerrar();
    });

    ov.querySelector("#passForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const actual = f.actual.value, nueva = f.nueva.value, repite = f.repite.value;
      if (nueva !== repite) return err("Las dos contraseñas nuevas no coinciden.");
      const btn = f.querySelector(".pass-ok");
      btn.disabled = true; btn.textContent = "Guardando…";
      try {
        const res = await fetch("/api/mi-password", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ actual, nueva }),
        });
        const data = await res.json();
        if (!data.ok) { btn.disabled = false; btn.textContent = "Guardar"; return err(data.error || "No se pudo cambiar."); }
        localStorage.setItem("token", data.token);   // el nuevo ya no lleva la marca
        localStorage.removeItem(POSPUESTO);
        cerrar();
        toast("Contraseña cambiada ✅", "success");
      } catch {
        btn.disabled = false; btn.textContent = "Guardar";
        err("Error de conexión. Inténtalo de nuevo.");
      }
    });
  }

  // ── Locales (fuente única de verdad) ───────────────────────────────────
  // Antes esta lista estaba copiada a mano en ~13 sitios con órdenes
  // distintos. Ahora vive aquí y los <select> se rellenan solos.
  // La Cooperativa NO está: por dentro, Blanes es un solo establecimiento en todos los
  // departamentos. De cara al cliente sigue siendo un local aparte, pero eso vive en la web
  // pública (que tiene su propia lista con su página) y en su ficha de Google.
  const LOCALES = [
    "La Tapeta - Blanes",
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
  window.avisoPassword = avisoPassword;
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
