// Se invoca únicamente cuando ya hay evidencia explícita de título Abono/Nota de crédito.
// Una rectificación mixta puede ser legítima: se pide revisión, nunca se invierten datos.
export function avisosSignosAbono(d = {}) {
 const avisos=[];
 for(const campo of ['base_imponible','cuota_iva']){
  if(d[campo]!=null && Number(d[campo])>0)avisos.push({campo,texto:'El original identifica un abono, pero este importe fiscal es positivo. Coteja sus signos con el documento antes de registrarlo.'});
 }
 if(Array.isArray(d.lineas) && d.lineas.some(l=>[l?.importe,l?.importe_neto].some(v=>v!=null&&Number(v)>0)))
  avisos.push({campo:'lineas',texto:'El abono conserva productos con importe positivo. Revisa todas las líneas y sus signos; no basta con cambiar el total de la cabecera.'});
 if(Array.isArray(d.iva_desglose) && d.iva_desglose.some(p=>[p?.base,p?.cuota].some(v=>v!=null&&Number(v)>0)))
  avisos.push({campo:'iva_desglose',texto:'El desglose del abono contiene bases o cuotas positivas. Comprueba el desglose completo antes de registrarlo.'});
 return avisos;
}
