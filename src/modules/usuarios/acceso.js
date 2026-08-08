// Usuarios — acceso: contraseña inicial y freno a los intentos de login. PURO.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  LA CONTRASEÑA INICIAL ES EL NOMBRE DE USUARIO, Y ESO SOLO VALE PORQUE SE     │
// │  OBLIGA A CAMBIARLA AL ENTRAR.                                               │
// │                                                                              │
// │  Entre que se crea la cuenta y la persona entra por primera vez, cualquiera   │
// │  que sepa el nombre de usuario puede entrar. Es una ventana real y corta, y   │
// │  es el precio de que dar de alta a cuarenta personas sea posible sin ir       │
// │  repartiendo contraseñas de una en una. Lo que NO se puede es dejar de        │
// │  forzar el cambio: sin eso, cuarenta cuentas se quedan con la contraseña      │
// │  igual al usuario para siempre.                                              │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// El freno al login funciona en dos capas, y son distintas a propósito:
//
//   · Por IP, en memoria: corta el barrido de miles de intentos desde un sitio.
//   · Por usuario, en la base: sobrevive a un reinicio y no se puede esquivar
//     cambiando de red. Es un RETRASO progresivo, no un bloqueo permanente, para que
//     nadie pueda dejar fuera a la dirección probando contraseñas a propósito.

export const MIN_PASSWORD = 6;

// Contraseña inicial. Se devuelve para poder decírsela a la persona, y la cuenta queda
// marcada como «tiene que cambiarla».
export const passwordInicial = (username) => String(username || "").trim();

// ¿Vale como contraseña nueva? Deliberadamente laxo en composición y estricto en las dos
// cosas que importan: que tenga cuerpo y que no sea la que traía puesta.
export function validarPassword(nueva, { username = "" } = {}) {
  const p = String(nueva || "");
  if (p.length < MIN_PASSWORD) return { ok: false, error: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.` };
  if (p.toLowerCase() === String(username || "").trim().toLowerCase()) {
    return { ok: false, error: "No puede ser igual que tu usuario: esa es justo la que hay que cambiar." };
  }
  if (/^\s+$/.test(p)) return { ok: false, error: "La contraseña no puede ser solo espacios." };
  return { ok: true };
}

// ── Freno por usuario ────────────────────────────────────────────────────────
// Tras 5 fallos empieza a costar, y sube hasta 15 minutos. No pasa de ahí: un bloqueo
// permanente por usuario permitiría que alguien dejara fuera al encargado a propósito.
export const FALLOS_ANTES_DE_FRENAR = 5;
export const ESPERAS_SEG = [30, 120, 300, 900];

export function esperaTrasFallo(intentos) {
  const n = Number(intentos) || 0;
  if (n < FALLOS_ANTES_DE_FRENAR) return 0;
  const escalon = Math.min(n - FALLOS_ANTES_DE_FRENAR, ESPERAS_SEG.length - 1);
  return ESPERAS_SEG[escalon];
}

export function estadoFreno(usuario = {}, ahoraMs = Date.now()) {
  const hasta = usuario.login_bloqueado_hasta ? Date.parse(usuario.login_bloqueado_hasta) : 0;
  if (!hasta || !Number.isFinite(hasta) || hasta <= ahoraMs) return { frenado: false, segundos: 0 };
  const segundos = Math.ceil((hasta - ahoraMs) / 1000);
  return {
    frenado: true, segundos,
    mensaje: `Demasiados intentos fallidos. Prueba otra vez en ${textoEspera(segundos)}.`,
  };
}

export function textoEspera(segundos) {
  if (segundos < 60) return `${segundos} segundos`;
  const min = Math.ceil(segundos / 60);
  return min === 1 ? "1 minuto" : `${min} minutos`;
}

export function trasFalloLogin(usuario = {}, ahoraMs = Date.now()) {
  const intentos = Number(usuario.login_intentos || 0) + 1;
  const espera = esperaTrasFallo(intentos);
  return {
    login_intentos: intentos,
    login_bloqueado_hasta: espera ? new Date(ahoraMs + espera * 1000).toISOString() : null,
    segundos: espera,
  };
}

export const trasLoginCorrecto = () => ({ login_intentos: 0, login_bloqueado_hasta: null });

// ── Qué puede hacer alguien que todavía no ha cambiado la contraseña ─────────
// Nada, salvo mirarse a sí mismo y cambiarla. Si solo se comprobara en el navegador,
// bastaría con llamar a la API a mano para saltárselo.
export const RUTAS_CON_PASSWORD_TEMPORAL = ["/api/auth/me", "/api/mi-password", "/api/auth/login"];

export function puedeConPasswordTemporal(ruta) {
  const limpia = String(ruta || "").split("?")[0];
  return RUTAS_CON_PASSWORD_TEMPORAL.includes(limpia);
}
