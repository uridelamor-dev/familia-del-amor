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
    // Se entra al panel siempre. Si la contraseña es la que le dieron, el aviso para
    // cambiarla sale YA DENTRO (auth.js) y se puede posponer: nadie se queda sin trabajar
    // por un formulario.
    window.location.href = ROLE_REDIRECT[data.rol] || "/";
  } catch {
    errorEl.textContent = "Error de conexión. Inténtalo de nuevo.";
    errorEl.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});


