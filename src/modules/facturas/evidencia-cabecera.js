import {fechasDelTexto} from './fecha-documento.js';
const limpio=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const texto=v=>typeof v==='string'&&v.trim().length>0;
// Solo lee un importe literal; no obtiene el total a partir de productos ni impuestos.
function importeLiteral(value) {
 if(!texto(value))return null;
 let s=value.trim().replace(/(?:EUR|€)/gi,'').replace(/\s/g,'');
 if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1);
 if(!/^[+-]?\d+(?:[.,]\d+)*$/.test(s))return null;
 if(s.includes(',')&&s.includes('.')) {
  const decimal=s.lastIndexOf(',')>s.lastIndexOf('.')?',':'.';
  s=s.replace(decimal===','?/\./g:/,/g,'').replace(',','.');
 } else if(/^[+-]?\d{1,3}(?:[.,]\d{3})+$/.test(s))s=s.replace(/[.,]/g,'');
 else s=s.replace(',','.');
 return Number.isFinite(Number(s))?Number(s):null;
}
export function avisosEvidenciaCabecera(d={}) {
 // Las lecturas antiguas no tenían estos campos. La entrada nueva los exige;
 // una corrección humana validada deja de depender de la evidencia OCR anterior.
 if(d._exigirEvidenciaCabecera!==true)return [];
 const avisos=[],add=(campo,texto)=>avisos.push({campo,texto});
 const f=d.evidencia_fecha;
 const noEmision=/congel|caduc|consum.*prefer|fabric|lote|trazab|pedido|vencim|pago|impres|recepcion/;
 if(!f||!texto(f.etiqueta)||!texto(f.texto)||!texto(f.ubicacion))add('fecha','Falta identificar la etiqueta y ubicación de la fecha de emisión en el original.');
 else if(noEmision.test(limpio(f.etiqueta)) || /producto|lote|trazab/.test(limpio(f.ubicacion)))add('fecha','La fecha elegida procede de un pedido, lote, producto u otra fecha auxiliar; comprueba la fecha de emisión de la cabecera.');
 else {
  const fechas=fechasDelTexto(f.texto);
  if(!/fecha|data|date|emision|expedicion/.test(limpio(f.etiqueta)) || fechas.length!==1 || fechas[0].iso!==d.fecha)add('fecha','La evidencia de la fecha no coincide con la emisión leída. Comprueba la cabecera del documento.');
 }
 // Un albarán realmente sin valorar no necesita inventar un total ni evidencia monetaria.
 if(d.total==null||d.total==='')return avisos;
 const t=d.evidencia_total, literal=importeLiteral(t?.importe_texto);
 const abonoExplicito=/^(abono|nota de credito|credit note)$/.test(limpio(d.titulo_documento).trim()) || d._evidenciaAbono?.abono===true;
 const importeContrastado=literal>0 && Number(d.total)<0 && abonoExplicito ? -literal : literal;
 if(!t||!texto(t.etiqueta)||!texto(t.ubicacion)||literal==null)add('total','Falta el importe literal y la ubicación del total del documento; no sirve el neto de una línea.');
 else if(/subtotal|base|neto/.test(limpio(t.etiqueta)) || !/total|a pagar|a cobrar|importe final|liquido/.test(limpio(t.etiqueta)) || /linea|producto/.test(limpio(t.ubicacion)))add('total','El importe procede de una base, subtotal o línea; comprueba el cuadro de totales del documento.');
 else if(!Number.isFinite(Number(d.total)) || Math.abs(importeContrastado-Number(d.total))>0.000001)add('total','El total leído no coincide con el importe literal del cuadro de totales.');
 return avisos;
}
