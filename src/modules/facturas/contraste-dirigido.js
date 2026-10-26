// Conciliación conservadora: no promedia ni construye una factura mezclando importes.
import { compararLecturas, controlesLectura, CAMPOS_REVISION } from './validacion-lectura.js';
import { normNif, nifValido, esNuestra } from './emisor.js';
const nombre = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');

export function nifComprobable(v) {
  const n=normNif(v);
  if(!nifValido(n)) return false;
  if(!/^[ABCDEFGHJNPQRSUVW]/.test(n)) return true;
  const digitos=n.slice(1,8).split('').map(Number);
  const suma=digitos.reduce((s,x,i)=>s+(i%2 ? x : Math.floor(x*2/10)+(x*2)%10),0);
  const control=(10-suma%10)%10;
  if(/[ABEH]/.test(n[0])) return n[8]===String(control);
  if(/[KPQS]/.test(n[0])) return n[8]==='JABCDEFGHI'[control];
  return n[8]===String(control) || n[8]==='JABCDEFGHI'[control];
}
function varianteMinima(a,b) {
  const x=nombre(a),y=nombre(b);
  return x.length>=10 && x.length===y.length && [...x].filter((c,i)=>c!==y[i]).length<=1;
}
export function prepararContraste(lecturas, fichas=[], nuestras=[], propios=[]) {
  const copias=structuredClone(lecturas);
  const cambios=[];
  // Solo fichas confirmadas por una persona y corroboradas por un NIF leído del original.
  // Un historial de OCR repetido no es prueba de identidad.
  for(const d of copias) {
    if(esNuestra(d.proveedor,d.nif_proveedor,nuestras,propios)) continue;
    const candidatas=fichas.filter(f=>f.autor && nombre(f.proveedor)===nombre(d.proveedor) && nifComprobable(f.nif));
    const nifs=[...new Set(candidatas.map(f=>normNif(f.nif)))];
    if(!d.nif_proveedor && nifs.length===1 && lecturas.some(l=>nombre(l.proveedor)===nombre(d.proveedor) && normNif(l.nif_proveedor)===nifs[0]) && !esNuestra('',nifs[0],nuestras)) {
      d.nif_proveedor=nifs[0];
      cambios.push({campo:'nif_proveedor',valor:nifs[0],origen:'Ficha humana corroborada por otra lectura'});
    }
  }
  const primero=copias[0];
  for(const d of copias.slice(1)) {
    if(nifComprobable(primero.nif_proveedor) && normNif(primero.nif_proveedor)===normNif(d.nif_proveedor)
      && !esNuestra(primero.proveedor,primero.nif_proveedor,nuestras,propios)
      && varianteMinima(primero.proveedor,d.proveedor) && primero.proveedor!==d.proveedor) {
      cambios.push({campo:'proveedor',antes:d.proveedor,valor:primero.proveedor,origen:'Variante de una letra con mismo NIF comprobable'});
      d.proveedor=primero.proveedor;
    }
  }
  return {lecturas:copias,cambios};
}
export function camposParaRelectura(avisos) {
  const permitidos=new Set([...CAMPOS_REVISION,'nif_receptor','iva_desglose','iva_no_cuadra','descuadre_total','imagen','lineas']);
  return [...new Set(avisos.map(a=>a.campo || a.clave).filter(c=>permitidos.has(c)))].slice(0,20);
}
export function elegirLecturaContrastada(primera,segunda,tercera) {
  // Se exige una cabecera completa ya observada, corroborada por la relectura.
  // Si la tercera propone un valor nuevo, vuelve a revisión humana.
  if(controlesLectura(tercera).length) return null;
  for(const candidata of [primera,segunda]) {
    if(!controlesLectura(candidata).length && !compararLecturas(candidata,tercera).length
      && JSON.stringify(candidata.iva_desglose || [])===JSON.stringify(tercera.iva_desglose || [])) {
      // Nunca recuperar una extracción de líneas cortada con una lectura que no incluye líneas.
      if(['ilegible','recortada'].includes(primera.calidad_imagen) || primera._lecturaIncompleta || (primera.campos_dudosos || []).some(c=>/linea|producto/i.test(c))) return null;
      return {...structuredClone(candidata),lineas:structuredClone(primera.lineas || []),_pistasFecha:primera._pistasFecha};
    }
  }
  return null;
}
