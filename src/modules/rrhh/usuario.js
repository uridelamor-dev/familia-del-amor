// El nombre de usuario con el que alguien entra al panel. PURO.
//
// ANTES SE PROPONÍA «nombre.local» —«erika.girona»— y eso resolvía por la vía de en medio un
// problema real: el usuario es ÚNICO en toda la casa, y con ocho establecimientos hay más de
// una Erika. Pero el local dentro del usuario no es información de la persona, es información
// de dónde estaba el día que entró: quien cambia de local se queda con un usuario que miente, y
// nadie va a renombrarlo porque es con lo que se identifica.
//
// Nombre y primer apellido juntos; si ya existe, se añade un número.

/** Sin acentos, sin espacios y en minúsculas: lo que acepta el campo de usuario. */
export const limpiar = (s) => String(s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "")
  .slice(0, 24);

/** El formato que exige el alta: de 3 a 32 letras, números, punto, guion o guion bajo. */
export const esUsuarioValido = (u) => /^[a-z0-9._-]{3,32}$/.test(String(u || ""));

/**
 * Las formas de llamar a esa persona, de la más natural a la menos, sin repetir.
 *
 * El orden IMPORTA: es el orden en el que se van a ir probando, así que lo primero tiene que
 * ser lo que uno diría en voz alta. «Erika Soler Puig» → erikasoler · erikasoler2 · erikasoler3…
 */
export function candidatosUsuario(nombre, { max = 12 } = {}) {
  const partes = String(nombre || "").trim().split(/\s+/).map(limpiar).filter((x) => x.length >= 1);
  if (!partes.length) return [];
  const base = partes.slice(0,2).join('').slice(0,24);
  const out = [base];
  for (let i = 2; out.length < max; i++) out.push(`${base}${i}`);
  // Solo los que el alta va a aceptar, sin repetidos y sin pasarse de largo.
  const vistos = new Set();
  return out.filter((u) => esUsuarioValido(u) && !vistos.has(u) && vistos.add(u)).slice(0, max);
}

/**
 * El primero que no esté cogido.
 *
 * `ocupados` llega de la base y puede venir con mayúsculas: el usuario se guarda en minúsculas
 * pero comparar sin normalizar es la clase de detalle que deja pasar un duplicado y lo convierte
 * en un error de clave única a mitad del alta, cuando ya se ha escrito todo lo demás.
 */
export function primerUsuarioLibre(nombre, ocupados = []) {
  const tomados = new Set((ocupados || []).map((u) => String(u || "").trim().toLowerCase()));
  const cands = candidatosUsuario(nombre);
  return cands.find((u) => !tomados.has(u)) || null;
}
