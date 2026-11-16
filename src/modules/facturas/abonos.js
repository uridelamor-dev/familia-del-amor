import {avisosSignosAbono} from './abono-signos.js';
// Solo títulos literales, nunca menciones en concepto ni inferencias por el importe.
const normal = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const esAbono = v => /^(?:abono|nota de credito|credit note)$/.test(normal(v));
export function pistasAbono(texto) {
 const titulos = String(texto || '').split(/\r?\n/).map(normal);
 return {abono: titulos.some(esAbono), factura: titulos.includes('factura')};
}
export function avisosAbono(d) {
 const titulo=normal(d.titulo_documento);
 const abono=esAbono(titulo) || d._evidenciaAbono?.abono === true;
 if (d._evidenciaAbono?.abono && d._evidenciaAbono?.factura)
  return [{campo:'numero_factura',texto:'El archivo contiene títulos de factura y abono. Comprueba si son documentos distintos antes de registrarlo.'}];
 if (abono && !(Number(d.total)<0))
  return [{campo:'total',texto:'El original identifica un abono, pero el total no es negativo. Comprueba el sentido de la operación y sus importes antes de registrarlo.'}];
 if (abono) return avisosSignosAbono(d);
 if (titulo==='factura rectificativa' && !(Number(d.total)<0))
  return [{campo:'total',texto:'La factura rectificativa requiere confirmar si aumenta o reduce la compra. No se deduce el signo del título.'}];
 return [];
}
