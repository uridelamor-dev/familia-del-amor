import {normNif} from './emisor.js';
const IMPORTES=['sin_indicacion','neto','bruto'];
const UNIDADES=['sin_indicacion','peso_unidad','envases'];
export function validarFormato(formato) {
 if(formato==null)return null;
 if(!formato||!IMPORTES.includes(formato.importes)||!UNIDADES.includes(formato.unidades))throw new Error('Formato de proveedor no válido');
 if(formato.importes==='sin_indicacion'&&formato.unidades==='sin_indicacion')return null;
 return {importes:formato.importes,unidades:formato.unidades};
}
export function pistasFormato(lecturas=[],confirmadas=[]) {
 const nif=normNif(lecturas[0]?.nif_proveedor);
 if(!nif||lecturas.length<2||!lecturas.every(d=>normNif(d.nif_proveedor)===nif))return [];
 const candidatas=confirmadas.filter(f=>f.autor&&normNif(f.nif)===nif&&f.formato);
 const pistas=[];
 for(const campo of ['importes','unidades']){
  const valores=[...new Set(candidatas.map(f=>f.formato?.[campo]).filter(v=>(campo==='importes'?IMPORTES:UNIDADES).includes(v)&&v!=='sin_indicacion'))];
  // Una discrepancia entre confirmaciones no se resuelve eligiendo la más frecuente.
  if(valores.length===1)pistas.push({campo,valor:valores[0],fuentes:candidatas.filter(f=>f.formato?.[campo]===valores[0]).map(f=>String(f.recepcion_id)).filter(id=>/^\d+$/.test(id)).slice(0,5)});
 }
 return pistas;
}
export function instruccionesFormato(pistas=[]) {
 const textos={neto:'En documentos confirmados de este emisor la columna importe ya incluye el descuento. Comprueba si este original usa el mismo formato antes de aplicar nada.',bruto:'En documentos confirmados de este emisor aparecen importe bruto y neto por separado. Lee ambos y comprueba el descuento.',peso_unidad:'En documentos confirmados se distingue peso y unidades. Lee la unidad impresa de cada fila.',envases:'En documentos confirmados aparecen cajas o envases. Busca el contenido literal por envase y la unidad a la que corresponde el precio.'};
 return pistas.length?'\nPISTAS DE FORMATO CONFIRMADAS POR UNA PERSONA (no son datos de esta compra): '+pistas.map(p=>textos[p.valor]||'').filter(Boolean).join(' ')+' Nunca rellenes importes, tamaños ni unidades ausentes con estas pistas. Si el documento contradice la memoria, manda el original.':'';
}
