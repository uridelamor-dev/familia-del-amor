// Los estados de una incidencia, en UN solo sitio. Lógica PURA.
//
// EL PROBLEMA QUE RESUELVE: había dos pantallas escribiendo estados distintos para la misma
// cosa. El panel manda «en proceso» y «resuelta»; la página vieja `public/mantenimiento.html`
// —que no enlazaba nadie pero se servía igual— mandaba «en_proceso» y «cerrada». Y el `PUT`
// guardaba tal cual lo que le llegara, sin validar nada. Resultado posible: una incidencia en
// «en_proceso» que no sale en ningún filtro del panel y que el Dashboard cuenta como abierta
// para siempre.
//
// Aquí viven los tres valores buenos, la traducción de los viejos y la máquina de estados.
// Lo consumen el servicio (valida el PUT), el panel (pinta y decide el botón siguiente) y el
// Dashboard (qué cuenta como abierto). Añadir un estado se hace en este fichero y en el
// CHECK de la tabla; en ningún otro sitio.

/** Los únicos valores que pueden estar guardados. El orden es el del ciclo de vida. */
export const ESTADOS = ["abierta", "en proceso", "resuelta"];

/** Lo que cuenta como «pendiente» para el Dashboard y para los avisos. */
export const ABIERTOS = ["abierta", "en proceso"];

/**
 * La máquina de estados, que es lineal: no hay bifurcaciones ni vuelta atrás por botón.
 * `resuelta` no está como clave a propósito — es el final, y por eso el panel no pinta botón.
 */
export const SIGUIENTE = { "abierta": "en proceso", "en proceso": "resuelta" };

/** Cómo se llama cada estado en pantalla, y de qué color va la píldora. */
export const ETIQUETA = { "abierta": "Abierta", "en proceso": "En proceso", "resuelta": "Resuelta" };
export const PILL = { "abierta": "bad", "en proceso": "imp", "resuelta": "ok" };

// Los nombres viejos que pudieran quedar guardados o llegar de un cliente antiguo. Se traducen
// en vez de rechazarse: quien pulsó el botón quería decir algo, y devolverle un 400 por la
// forma de escribirlo no arregla nada.
const SINONIMOS = {
  "en_proceso": "en proceso",
  "enproceso": "en proceso",
  "cerrada": "resuelta",
  "cerrado": "resuelta",
  "resuelto": "resuelta",
  "abierto": "abierta",
  "pendiente": "abierta",
};

/**
 * El estado canónico de lo que llegue, o `null` si no se reconoce.
 *
 * Tolerante en la entrada (mayúsculas, espacios de más, los nombres viejos) y estricto en la
 * salida: o devuelve uno de `ESTADOS`, o devuelve `null` para que quien llame conteste 400.
 * Nunca inventa un valor por defecto — guardar «abierta» porque no se entendió lo que pedían
 * es peor que fallar, porque reabre en silencio algo que alguien acababa de resolver.
 */
export function normalizarEstado(valor) {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return null;
  if (ESTADOS.includes(v)) return v;
  return SINONIMOS[v] || null;
}

/** ¿Está pendiente? Acepta nombres viejos, porque también los lee de filas ya guardadas. */
export function esAbierta(estado) {
  const e = normalizarEstado(estado);
  return e ? ABIERTOS.includes(e) : false;
}

/** El estado al que lleva el botón de avanzar, o `null` si ya está resuelta. */
export function siguienteEstado(estado) {
  const e = normalizarEstado(estado);
  return e ? (SIGUIENTE[e] || null) : null;
}
