// Los establecimientos agrupados por pueblo. PURO.
//
// POR QUÉ ESTO NO VA EN `centros.js`: allí un *centro* es un mismo negocio —Blanes y su
// Cooperativa comparten CIF, facturas y plantilla—, y ese agrupamiento contagia a ventas,
// compras, personal e inventarios. Can Mateu, La Tapa Ibérica y Botiga d'en Mateu están los
// tres en Tordera y **no** son el mismo negocio: meterlos en `centros.js` haría que el gasto de
// uno apareciera sumado al de otro, que es exactamente lo que no se quiere.
//
// «Los de Tordera» es una idea de MARKETING, no de contabilidad: a quién le escribo. Vive
// aparte y solo la usan las campañas.
//
// Y no hay lista nueva que mantener: el pueblo ya está en el nombre de cada local, detrás del
// guion. Si mañana abre otro sitio en Tordera, entra solo.

const texto = (s) => String(s == null ? "" : s).trim();

/** «Can Mateu - Tordera» → «Tordera». Sin guion, no hay zona. */
export function zonaDe(local) {
  const partes = texto(local).split(/\s+-\s+/);
  return partes.length > 1 ? texto(partes[partes.length - 1]) : null;
}

/**
 * Las zonas que hay, con sus establecimientos.
 *
 * → [{ zona, locales: [...] }] ordenadas por nombre, y solo las que tienen MÁS DE UNO: ofrecer
 *   «Girona» como zona cuando solo hay un local ahí no añade nada sobre elegir el local, y
 *   llena el desplegable de opciones que no distinguen.
 */
export function zonas(locales = []) {
  const mapa = new Map();
  for (const l of locales) {
    const z = zonaDe(l);
    if (!z) continue;
    if (!mapa.has(z)) mapa.set(z, []);
    mapa.get(z).push(texto(l));
  }
  return [...mapa.entries()]
    .filter(([, ls]) => ls.length > 1)
    .map(([zona, ls]) => ({ zona, locales: ls }))
    .sort((a, b) => a.zona.localeCompare(b.zona, "es"));
}

/**
 * Los nombres EXACTOS de los establecimientos de una zona.
 *
 * La campaña guarda estos nombres, no la zona. Es deliberado: si mañana abre otro local en
 * Tordera, una campaña ya guardada no puede cambiar de destinatarios sin que nadie lo haya
 * decidido. La zona es una comodidad al elegir, no una regla que se reevalúa.
 */
export function localesDeZona(zona, locales = []) {
  const z = texto(zona).toLowerCase();
  if (!z) return [];
  return locales.filter((l) => texto(zonaDe(l)).toLowerCase() === z).map(texto);
}

/** ¿Este texto es una zona con más de un establecimiento? */
export function esZona(nombre, locales = []) {
  return localesDeZona(nombre, locales).length > 1;
}
