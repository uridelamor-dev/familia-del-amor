// Facturas — rescatar un JSON que se cortó a la mitad. Lógica PURA.
//
// QUÉ PASÓ: una factura de DDI PROVEA con muchas líneas se quedó sin leer, y el aviso que salía
// era «Expected ',' or ']' after array element in JSON at position 9099». Eso no es que el
// modelo se equivocara: es que la respuesta llegó **cortada** porque topó con el límite de
// tokens de salida, y `JSON.parse` se encontró un array a medio cerrar.
//
// Se arregla por dos sitios y hacen falta los dos:
//
//   1. Pedir más sitio (`max_tokens`) y MIRAR el aviso `stop_reason: "max_tokens"`, que el
//      modelo manda precisamente para decir «me has cortado». Eso está en facturas.js.
//   2. Esto: si aun así se corta, **no perder la factura entera**. Las líneas completas que sí
//      llegaron valen; lo que falta se sabrá porque la suma no cuadrará con la base imponible
//      —ese aviso ya existe— y quedará marcada para mirar.
//
// LO QUE NO SE HACE: adivinar lo que falta. No se completa la última línea a medias, no se
// reparte la diferencia, no se inventa una cantidad. Se cierra por el último dato ENTERO y se
// dice cuántas líneas se salvaron, porque una factura con nueve de sus quince líneas y un aviso
// es útil, y una factura con quince líneas de las cuales seis son inventadas, no.

/**
 * Corta el texto por el último valor completo y cierra lo que quedó abierto.
 * Devuelve `{ ok, valor, recortado, motivo }`. Nunca lanza.
 */
export function repararJsonCortado(texto) {
  const s = String(texto || "");
  if (!s.trim()) return { ok: false, valor: null, recortado: false, motivo: "vacío" };

  // Primero lo obvio: si ya es válido, no hay nada que reparar.
  try {
    return { ok: true, valor: JSON.parse(s), recortado: false, motivo: null };
  } catch { /* sigue */ }

  const pila = [];
  let enCadena = false, escape = false;
  // Último punto donde el JSON estaba «entre valores»: justo después de cerrar algo o de una
  // coma. Solo ahí, y NO al cerrar una comilla: hay dos razones y la segunda es la de peso.
  //
  //   · Un objeto cerrado a la fuerza tras su primer campo («{"descripcion":"LOMO"}») añadiría
  //     un producto fantasma sin cantidad ni importe.
  //   · Y sobre todo: un NÚMERO cortado sigue pareciendo un número. Si «1650» se cortó en
  //     «16», nadie lo notaría nunca — ni la suma, que ya cuadraba mal de todas formas. Perder
  //     un campo entero es recuperable; guardar 16 € donde ponía 1.650 € no.
  let corte = -1, cortePila = "";

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (enCadena) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') { enCadena = false; }
      continue;
    }
    if (c === '"') { enCadena = true; continue; }
    if (c === "{" || c === "[") { pila.push(c); continue; }
    if (c === "}" || c === "]") {
      const abre = pila[pila.length - 1];
      // Un cierre que no casa significa que el texto ya venía roto de antes, no cortado.
      if ((c === "}" && abre !== "{") || (c === "]" && abre !== "[")) {
        return { ok: false, valor: null, recortado: false, motivo: "estructura incoherente" };
      }
      pila.pop();
      corte = i + 1; cortePila = pila.join("");
      continue;
    }
    // Una coma DENTRO de una línea («…,"descripcion":"LOMO",») no vale como corte: cerrar ahí
    // dejaría esa línea a medias. Sí vale entre los campos de arriba del todo, donde faltar un
    // campo se nota (`proveedor` sale vacío) en vez de colarse como un producto más.
    if (c === "," && pila.length === 1) { corte = i + 1; cortePila = pila.join(""); continue; }
  }

  if (enCadena && corte < 0) return { ok: false, valor: null, recortado: false, motivo: "sin ningún dato completo" };
  if (!pila.length) {
    // Balanceado pero ilegible: casi siempre es que SOBRA algo detrás (el cierre de un bloque
    // de markdown, una coletilla del modelo). Se prueba a quedarse hasta la última llave.
    const fin = s.lastIndexOf("}");
    if (fin > 0) {
      try { return { ok: true, valor: JSON.parse(s.slice(0, fin + 1)), recortado: false, motivo: null }; }
      catch { /* entonces sí es otra cosa */ }
    }
    return { ok: false, valor: null, recortado: false, motivo: "no está cortado, pero no se puede leer" };
  }
  if (corte < 0) return { ok: false, valor: null, recortado: false, motivo: "sin ningún dato completo" };

  // La coma final sobra: quedaría «[1,2,]».
  const base = s.slice(0, corte).replace(/[\s,]+$/, "");
  // Se cierra con lo que estaba abierto EN EL PUNTO DE CORTE, no al final del texto: entre uno
  // y otro el modelo ya había empezado a escribir la línea siguiente, y cerrar de más añade
  // llaves que no casan con nada.
  const cierres = [...cortePila].reverse().map((a) => (a === "{" ? "}" : "]")).join("");
  try {
    return { ok: true, valor: JSON.parse(base + cierres), recortado: true, motivo: null };
  } catch {
    // Un intento más: puede que el último valor completo fuera una CLAVE sin su valor
    // («…,"descripcion"»), y entonces hay que retroceder hasta la coma anterior.
    const coma = base.lastIndexOf(",");
    if (coma > 0) {
      try {
        return { ok: true, valor: JSON.parse(base.slice(0, coma) + cierres), recortado: true, motivo: null };
      } catch { /* nada que hacer */ }
    }
    return { ok: false, valor: null, recortado: false, motivo: "no se pudo cerrar" };
  }
}

/**
 * Saca el objeto JSON de una respuesta del modelo, aunque venga cortada.
 *
 * El recorte greedy de siempre (`/\{[\s\S]*\}/`) es justo lo que hace ilegible el fallo: en una
 * respuesta cortada se queda con el último `}` que encuentra —el de una línea suelta— y el
 * error sale con una posición que no dice nada.
 */
export function extraerJson(texto) {
  const s = String(texto || "");
  const abre = s.indexOf("{");
  if (abre < 0) return { ok: false, valor: null, recortado: false, motivo: "no hay JSON" };

  // El modelo suele envolver la respuesta en un bloque de markdown (```json … ```). Cortar
  // desde la primera llave HASTA EL FINAL se lleva también el cierre del bloque, y entonces
  // `JSON.parse` falla por lo que sobra detrás aunque el JSON esté entero y perfecto.
  // Por eso se prueba primero de llave a llave.
  const cierra = s.lastIndexOf("}");
  if (cierra > abre) {
    try {
      return { ok: true, valor: JSON.parse(s.slice(abre, cierra + 1)), recortado: false, motivo: null };
    } catch { /* no era eso: puede venir cortado de verdad */ }
  }
  return repararJsonCortado(s.slice(abre));
}
