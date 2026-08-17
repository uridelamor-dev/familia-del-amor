// Facturas — «este albarán NO es de esta factura». PURO.
//
// EL PROBLEMA: la conciliación propone parejas por proveedor, fecha e importe. Cuando una
// propuesta es falsa, hoy no hay forma de decirlo: al no confirmarse, la siguiente vez se
// vuelve a proponer igual. Para siempre. Quien concilia acaba pasando por encima de las mismas
// tres propuestas malas cada semana, y esa es justo la manera de que un día pulse sin mirar.
//
// EL DESCARTE ES POR PAREJA, no por albarán. «Este albarán no es de ESTA factura» no dice nada
// del resto: el mismo albarán puede ser perfectamente de la factura del mes siguiente, y
// esconderlo de todas sería peor que no poder descartarlo.

/** Los ids llegan de la base como número y del navegador como texto: se comparan como texto. */
const id = (v) => String(v ?? "");

/** `[{factura_id, albaran_id}]` → `Map<facturaId, Set<albaranId>>`. */
export function indiceDescartes(filas = []) {
  const m = new Map();
  for (const f of filas || []) {
    if (!f) continue;
    const k = id(f.factura_id);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(id(f.albaran_id));
  }
  return m;
}

/** Los albaranes descartados de una factura. Siempre un Set, aunque no haya ninguno. */
export function descartadosDe(indice, facturaId) {
  return (indice instanceof Map ? indice.get(id(facturaId)) : null) || new Set();
}

/** Quita de una lista de albaranes los que estén descartados. */
export function sinDescartados(albaranes = [], descartados) {
  if (!descartados || !descartados.size) return albaranes || [];
  return (albaranes || []).filter((a) => !descartados.has(id(a && a.id)));
}
