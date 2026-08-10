// TODO EL MUNDO al mismo panel. Antes cada rol aterrizaba en una página suelta —encargados,
// rrhh, marketing, contabilidad— que eran versiones viejas y paralelas de lo mismo: sin el
// menú de la izquierda, sin los módulos nuevos y, en el caso de Encargados, con un selector
// de «Todos los locales» que no pinta nada en la pantalla de alguien que lleva un local.
//
// El panel ya sabe enseñarle a cada uno lo suyo: filtra el menú por rol y `puedeVer()` corta
// el paso a lo que no le toca. No hacía falta una página por rol; hacía falta una sola.
//
// El trabajador es la excepción y a propósito: no tiene NINGÚN módulo del panel (no gestiona
// nada). Su página es su cuadrante y sus fichajes, que es otra cosa.
const PANEL = "/panel/";
const ROLE_REDIRECT = {
  direccion: PANEL,
  encargado: PANEL,
  rrhh: PANEL,
  marketing: PANEL,
  contabilidad: PANEL,
  trabajador: "/trabajadores.html",
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


