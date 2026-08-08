const ROLE_REDIRECT = {
  direccion: "/panel/",          // nuevo panel cockpit (Dashboard ejecutivo real)
  encargado: "/encargados.html",
  trabajador: "/trabajadores.html",
  rrhh: "/rrhh.html",
  marketing: "/marketing.html",
  contabilidad: "/contabilidad.html"
};

// Si ya hay sesión activa, redirigir directamente
(async function checkExisting() {
  const token = localStorage.getItem("token");
  if (!token) return;
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.ok) {
      // Si dejó la sesión a medias sin cambiar la contraseña, no se le manda al panel:
      // allí todo le daría 403. Se le vuelve a pedir el cambio aquí.
      if (data.user.pass_temporal) return pedirCambio(data.user.rol, data.user.username);
      window.location.href = ROLE_REDIRECT[data.user.rol] || "/";
    }
  } catch {
    localStorage.removeItem("token");
  }
})();

const form = document.getElementById("loginForm");
const errorEl = document.getElementById("loginError");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.style.display = "none";
  const btn = form.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Entrando...";

  const { username, password } = Object.fromEntries(new FormData(form).entries());
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!data.ok) {
      errorEl.textContent = data.error || "Credenciales incorrectas";
      errorEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Entrar";
      return;
    }
    localStorage.setItem("token", data.token);
    // Primera vez: el token que acaba de llegar no sirve para nada más que para cambiar la
    // contraseña (el servidor corta el resto), así que se enseña el cambio aquí mismo.
    if (data.debeCambiarPassword) return pedirCambio(data.rol, username);
    window.location.href = ROLE_REDIRECT[data.rol] || "/";
  } catch {
    errorEl.textContent = "Error de conexión. Inténtalo de nuevo.";
    errorEl.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});

// ── Cambio obligatorio de la primera vez ─────────────────────────────────────
const cambioForm = document.getElementById("cambioForm");
const cambioError = document.getElementById("cambioError");
let ROL_DESTINO = null, USUARIO_ACTUAL = "";

function pedirCambio(rol, username) {
  ROL_DESTINO = rol;
  USUARIO_ACTUAL = username;
  form.classList.add("hidden");
  cambioForm.classList.remove("hidden");
  cambioForm.querySelector('[name="nueva"]').focus();
}

cambioForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  cambioError.style.display = "none";
  const { nueva, repite } = Object.fromEntries(new FormData(cambioForm).entries());
  const fallo = (txt) => { cambioError.textContent = txt; cambioError.style.display = "block"; };
  if (nueva !== repite) return fallo("Las dos contraseñas no coinciden.");

  const btn = cambioForm.querySelector("button");
  btn.disabled = true; btn.textContent = "Guardando…";
  try {
    const res = await fetch("/api/mi-password", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") },
      // `actual` es la inicial, que es el propio usuario: no se le pide otra vez algo que
      // acaba de escribir hace diez segundos.
      body: JSON.stringify({ actual: USUARIO_ACTUAL, nueva }),
    });
    const data = await res.json();
    if (!data.ok) { btn.disabled = false; btn.textContent = "Guardar y entrar"; return fallo(data.error || "No se pudo cambiar"); }
    localStorage.setItem("token", data.token);   // el nuevo ya no lleva la marca
    window.location.href = ROLE_REDIRECT[ROL_DESTINO] || "/";
  } catch {
    btn.disabled = false; btn.textContent = "Guardar y entrar";
    fallo("Error de conexión. Inténtalo de nuevo.");
  }
});
