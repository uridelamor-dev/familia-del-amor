import {normalizarLinea} from './lineas.js';
// Contraste del original en dos lecturas independientes. No corrige por mayoría
// ni utiliza una suma correcta como prueba de que los productos son correctos.
const texto = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const numero = v => v == null || v === '' ? null : Number(v);
const aviso = texto => ({campo:'lineas',texto});
export function compararDetalle(a,b) {
  const x=Array.isArray(a.lineas)?a.lineas:[], y=Array.isArray(b.lineas)?b.lineas:[];
  if(x.length!==y.length) return [aviso(`Las lecturas identifican distinto número de líneas (${x.length} y ${y.length}). Comprueba páginas, productos y subtotales.`)];
  const avisos=[];
  if(a.cobertura?.paginas_leidas!==b.cobertura?.paginas_leidas || a.cobertura?.detalle!==b.cobertura?.detalle)
    avisos.push(aviso('Las lecturas no coinciden en las páginas o el alcance del detalle.'));
  // Cargos separados también afectan al coste aunque coincidan los totales.
  const cargos=d=>(Array.isArray(d.cargos_base)?d.cargos_base:[]).map(c=>[texto(c.descripcion),numero(c.importe),numero(c.porcentaje_iva)]);
  if(JSON.stringify(cargos(a))!==JSON.stringify(cargos(b)))avisos.push(aviso('Las lecturas no coinciden en los cargos o descuentos separados del detalle.'));

  x.forEach((l,i)=>{
    const r=y[i];
    if(!l || !r) {avisos.push(aviso(`La línea ${i+1} está incompleta.`));return;}
    const campos=[];
    const nl=normalizarLinea(l),nr=normalizarLinea(r);
    const importesEquivalentes=!nl.dudosa && !nr.dudosa
      && nl.importe!=null && nr.importe!=null && Math.abs(nl.importe-nr.importe)<=0.011
      && ((nl.importe_bruto==null && nr.importe_bruto==null)
        || (nl.importe_bruto!=null && nr.importe_bruto!=null && Math.abs(nl.importe_bruto-nr.importe_bruto)<=0.011));
    for(const k of ['descripcion','unidad']) if(texto(l[k])!==texto(r[k])) campos.push(k);
    for(const k of ['cantidad','precio_unitario','importe','importe_neto','descuento_pct']) {
      if(importesEquivalentes && ['importe','importe_neto'].includes(k))continue;
      const u=numero(l[k]),v=numero(r[k]);
      // No tolerar unidades distintas. Un céntimo sí puede ser redondeo de importe.
      const margen=['importe','importe_neto'].includes(k)?0.011:0.000001;
      if(u===null&&v===null)continue;
      if(u===null||v===null||!Number.isFinite(u)||!Number.isFinite(v)||Math.abs(u-v)>margen)campos.push(k);
    }
    if(campos.length) avisos.push(aviso(`Las lecturas difieren en la línea ${i+1}: ${campos.join(', ')}. Comprueba esa fila en el original.`));
  });
  if(a.lineas_iva_incluido!==b.lineas_iva_incluido)avisos.push(aviso('Las lecturas no coinciden en si los precios incluyen IVA.'));
  return avisos;
}
export function comprobarCobertura(d) {
  if(!d._exigirCobertura)return [];
  const c=d.cobertura;
  if(!c || c.documento_completo!==true || !Number.isInteger(c.paginas_leidas) || c.paginas_leidas<1)
    return [{campo:'imagen',texto:'No se ha podido confirmar que el documento esté completo y todas sus páginas sean legibles.'}];
  if(c.detalle==='sin_detalle' && String(c.motivo_sin_detalle||'').trim() && !(d.lineas||[]).length)return [];
  if(c.detalle!=='completo' || !Array.isArray(d.lineas) || !d.lineas.length)
    return [aviso('Falta confirmar el detalle completo o explicar por qué el original no contiene productos.')];
  const pendientes=[];
  d.lineas.forEach((l,i)=>{
    if(!l || !texto(l.descripcion) || numero(l.cantidad)===null || !Number.isFinite(numero(l.cantidad)))
      pendientes.push(aviso(`Falta descripción o cantidad legible en la línea ${i+1}.`));
    if(d.tipo!=='albaran' && (!l || numero(l.importe)===null || !Number.isFinite(numero(l.importe))))
      pendientes.push(aviso(`Falta el importe original de la línea ${i+1}; no basta con calcularlo para darla por verificada.`));
  });
  return pendientes;
}
