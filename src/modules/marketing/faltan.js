// Marketing — lo que nos piden y no podemos filtrar. PURO.
//
// «Quiero escribir a la gente con hijos». Hoy la respuesta es «no se puede» y ahí muere: nadie
// se entera de que hace falta y el mes que viene se vuelve a pedir. Guardándolo, en unas
// semanas la lista dice sola qué datos merece la pena empezar a preguntar en la ficha del
// cliente — que es una decisión de negocio, no de código.
//
// Lo único con miga es AGRUPAR: «gente con hijos», «clientes que tengan hijos» y «con hijos»
// son la misma petición. Si cada frase creara su línea, la lista sería cien peticiones de una
// vez cada una y no diría nada; lo que hace útil la libreta es el número de veces.

// Palabras que no distinguen una petición de otra: sobran para agrupar.
const RELLENO = new Set([
  "por", "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "con", "sin", "que", "y", "o", "a", "al", "en", "para",
  "tengan", "tenga", "tienen", "sean", "sea", "son", "hayan", "han",
  "gente", "clientes", "cliente", "personas", "persona", "usuarios", "contactos",
  "filtrar", "filtro", "poder", "quiero", "querria", "necesito", "saber",
]);

/**
 * La clave con la que se agrupan dos peticiones. Sin tildes, sin puntuación, sin relleno y con
 * las palabras ORDENADAS: «hijos con» y «con hijos» tienen que caer en la misma.
 */
export function claveFalta(texto) {
  const palabras = String(texto || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !RELLENO.has(p));
  // Ordenadas y sin repetir: el orden en que se escribe no cambia lo que se pide.
  return [...new Set(palabras)].sort().join(" ").slice(0, 80);
}

/**
 * Qué se enseña primero. Lo más pedido arriba, y a igualdad lo más reciente: una petición de
 * hace ocho meses que nadie ha vuelto a hacer ya no es una prioridad.
 */
export function ordenarFaltas(filas = []) {
  return [...filas].sort((a, b) =>
    (Number(b.veces) || 0) - (Number(a.veces) || 0) ||
    String(b.ultima_vez || "").localeCompare(String(a.ultima_vez || "")));
}
