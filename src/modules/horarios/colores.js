// Un color para cada área, y por tanto para cada persona. PURO.
//
// PARA QUÉ: en un cuadrante de siete días con veinte turnos, saber de un vistazo quién es de
// sala y quién de cocina es la mitad de la lectura. Con todo del mismo color hay que ir turno
// por turno leyendo el área en letra pequeña.
//
// EL COLOR SE DERIVA DEL NOMBRE, no se guarda en la base. Es a propósito:
//   · Funciona con las áreas que YA existen, sin migración ni configuración previa.
//   · Es estable: SALA es del mismo color hoy, mañana y en el otro local. Un color que cambia
//     entre pantallas no informa de nada, confunde.
//   · Y un área inventada («OFFICE», «REPARTO») también tiene el suyo, sin que nadie lo elija.
// Si algún día se quiere poder elegirlo a mano, es una columna y esta función pasa a mirarla
// primero. Hasta entonces, cero superficie.
//
// SE DEVUELVE UN TONO (hue), no un color hecho. El panel se pinta en claro y en oscuro, y un
// hex que se ve bien en uno se ve mal en el otro. Con el tono, el CSS calcula la luminosidad
// que toca en cada tema y siempre queda legible.

const norm = (s) => String(s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/**
 * Los tonos de las áreas que existen de verdad en la casa.
 *
 * NO se usa el verde (145-165) ni el rojo (0-20), y es una decisión: el verde es el color de
 * la marca —lo llevan los botones y lo elegido— y el rojo significa peligro en todo el panel.
 * Un área que se pintara de uno de los dos parecería un estado, no un sitio.
 */
export const TONOS_AREA = {
  "sala": 212,        // azul
  "comedor": 212,     // es lo mismo que sala
  "barra": 42,        // ámbar
  "cocina": 280,      // morado
  "terraza": 190,     // turquesa
  "office": 320,      // rosa
  "reparto": 255,     // añil
  "almacen": 28,      // tierra
};

/** Un tono estable para un nombre cualquiera: el mismo texto da siempre el mismo color. */
function tonoDerivado(clave) {
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) % 360;
  // Se esquivan el verde de la marca y el rojo de los avisos, por lo mismo de arriba.
  const prohibido = (t) => (t >= 130 && t <= 170) || t <= 20 || t >= 345;
  let t = h;
  for (let i = 0; i < 360 && prohibido(t); i++) t = (t + 7) % 360;
  return t;
}

/** El tono de un área. Acepta el nombre suelto o la fila entera. */
export function tonoDeArea(area) {
  const nombre = typeof area === "string" ? area : (area && area.nombre);
  const clave = norm(nombre);
  if (!clave) return null;
  if (TONOS_AREA[clave] != null) return TONOS_AREA[clave];
  // «SALA 2» o «Barra de arriba» son la misma familia: si empieza por un área conocida, su color.
  for (const k of Object.keys(TONOS_AREA)) {
    if (clave === k || clave.startsWith(k + " ") || clave.endsWith(" " + k)) return TONOS_AREA[k];
  }
  return tonoDerivado(clave);
}

/**
 * El área que da color a una persona.
 *
 * Con varias, manda la marcada como principal —`hor_worker_areas.principal`, que ya existe—.
 * Sin principal, la primera. Y quien no tiene ninguna no se pinta de nada: inventarle un color
 * diría que es de un sitio, y lo que pasa es que aún no se ha decidido.
 */
export function areaDePersona(areas = []) {
  const lista = (Array.isArray(areas) ? areas : []).filter(Boolean);
  if (!lista.length) return null;
  return lista.find((a) => a && a.principal) || lista[0];
}

/** Lo que necesita una etiqueta: el nombre y su tono. `null` si no tiene área. */
export function colorDePersona(areas = []) {
  const a = areaDePersona(areas);
  if (!a) return null;
  const nombre = typeof a === "string" ? a : a.nombre;
  const tono = tonoDeArea(a);
  return tono == null ? null : { nombre, tono };
}
