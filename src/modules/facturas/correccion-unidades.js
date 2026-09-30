const envase = u => /^(?:packs?|cajas?|bultos?|paquetes?)$/i.test(String(u || '').trim());
const contenido = d => Number(/\b(\d+)\s*(?:uds?\.?|unidades|units)\b/i.exec(String(d || ''))?.[1]) || null;
// La clave de producto no basta para inferir que dos envases tienen el mismo contenido.
export function puedePropagarUnidad(origen, candidata, factor) {
  return Number.isInteger(factor) && factor > 1 && envase(origen.unidad) && envase(candidata.unidad)
    && !origen.factor_unidad && !candidata.factor_unidad
    && contenido(origen.descripcion) === factor && contenido(candidata.descripcion) === factor
    && String(origen.unidad).trim().toLowerCase() === String(candidata.unidad).trim().toLowerCase();
}
