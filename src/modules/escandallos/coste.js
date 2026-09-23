// Cálculo puro. Compra neta sin IVA; PVP con IVA; nunca presentar datos incompletos como cero.
const numero = v => v === '' || v == null || typeof v === 'boolean' ? NaN : Number(v);
export const claveFuente = x => JSON.stringify([x.clave, x.proveedor, x.unidad_compra]);
export function validarReceta(d = {}) {
  if (!d || typeof d !== "object") return {ok:false,errores:["Receta inválida."]};
  const errores = [];
  const nombre = String(d.nombre || '').trim();
  if (nombre.length < 2 || nombre.length > 160) errores.push('Indica un nombre de 2 a 160 caracteres.');
  const raciones = numero(d.raciones), pvp = numero(d.pvp), iva = numero(d.iva);
  if (!Number.isFinite(raciones) || raciones < 0.000001 || raciones > 100000) errores.push('Las raciones deben ser mayores que cero.');
  if (!Number.isFinite(pvp) || pvp < 0 || pvp > 100000) errores.push('Indica el precio de venta con IVA, o 0 si aún no se vende.');
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) errores.push('Indica un porcentaje de IVA válido.');
  if (!Array.isArray(d.ingredientes) || !d.ingredientes.length || d.ingredientes.length > 200) errores.push('Añade entre 1 y 200 ingredientes.');
  const ingredientes = (Array.isArray(d.ingredientes) ? d.ingredientes : []).slice(0,200).map((i, n) => {
    if (!i || typeof i !== "object") { errores.push(`Ingrediente ${n+1}: formato inválido.`); i={}; }
    const cantidad = numero(i.cantidad), factor = numero(i.factor), merma = numero(i.merma);
    const campos = ['clave','proveedor','unidad_compra','unidad_uso'];
    if (campos.some(k => typeof i[k] !== 'string' || !i[k].trim() || i[k].length > 300)) errores.push(`Ingrediente ${n+1}: faltan producto, proveedor o unidades.`);
    if (!Number.isFinite(cantidad) || cantidad < 0.000001 || cantidad > 1e8) errores.push(`Ingrediente ${n+1}: cantidad inválida.`);
    if (!Number.isFinite(factor) || factor < 0.000001 || factor > 1e8) errores.push(`Ingrediente ${n+1}: indica cuántas unidades de uso contiene una unidad de compra.`);
    if (!Number.isFinite(merma) || merma < 0 || merma >= 100) errores.push(`Ingrediente ${n+1}: la merma debe estar entre 0 y menos de 100%.`);
    return { clave: i.clave, proveedor: i.proveedor, unidad_compra: i.unidad_compra,
      unidad_uso: String(i.unidad_uso || '').trim(), nombre: String(i.nombre || i.clave || '').slice(0,300), cantidad, factor, merma };
  });
  return { ok: !errores.length, errores, datos: {nombre, raciones, pvp, iva, ingredientes} };
}
export function calcularReceta(receta, fuentes = []) {
  const mapa = new Map(fuentes.map(f => [claveFuente(f), f]));
  const ingredientes = receta.ingredientes.map(i => {
    const f = mapa.get(claveFuente(i));
    const precio = f ? numero(f.precio) : NaN;
    const calculado = Number.isFinite(precio) && precio >= 0 ? precio * i.cantidad / i.factor / (1-i.merma/100) : NaN;
    const coste = Number.isFinite(calculado) ? calculado : null;
    return {...i, precio_compra: Number.isFinite(precio)?precio:null, coste,
      fecha_precio:f?.fecha || null, factura_id:f?.factura_id || null,
      motivo:coste==null?'Sin compra válida para este producto, proveedor y formato.':null};
  });
  const faltan = ingredientes.filter(i=>i.coste==null).length;
  const coste_conocido = ingredientes.reduce((s,i)=>s+(i.coste??0),0);
  const coste_lote = faltan ? null : coste_conocido;
  const coste_racion = coste_lote == null ? null : coste_lote/receta.raciones;
  const venta_neta = receta.pvp/(1+receta.iva/100);
  const margen = coste_racion==null || venta_neta<=0 ? null : venta_neta-coste_racion;
  return {ingredientes,faltan,coste_conocido,coste_lote,coste_racion,venta_neta,
    margen,margen_pct:margen==null?null:margen/venta_neta*100};
}
