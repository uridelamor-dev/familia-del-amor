import { nifValido, normNif } from './emisor.js';
import { revisarCoherencia } from './coherencia.js';

export const CAMPOS_REVISION = ['tipo','proveedor','nif_proveedor','fecha','numero_factura','base_imponible','porcentaje_iva','cuota_iva','total','retencion','recargo_equivalencia','otros_cargos'];
const numero = v => v === null || v === undefined || v === '' ? null : Number(v);
export function controlesLectura(d = {}) {
  const avisos = [];
  const aviso = (campo,texto) => avisos.push({campo,texto});
  if (!String(d.proveedor || '').trim()) aviso('proveedor','No se ha identificado al proveedor.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') || !Number.isFinite(Date.parse(d.fecha)) || new Date(d.fecha).toISOString().slice(0,10) !== d.fecha) aviso('fecha','Falta una fecha de emisión válida.');
  if (!['factura','ticket','albaran','otro'].includes(d.tipo)) aviso('tipo','Hay que confirmar el tipo de documento.');
  if (d.tipo === 'factura' && !d.numero_factura) aviso('numero_factura','No se ha leído el número de factura.');
  if (d.tipo === 'factura' && !d.nif_proveedor) aviso('nif_proveedor','Falta el NIF del proveedor.');
  if (d.nif_proveedor && !nifValido(d.nif_proveedor)) aviso('nif_proveedor','Revisa el identificador fiscal del proveedor (puede ser extranjero).');
  for (const campo of ['total', ...(d.tipo === 'factura' ? ['base_imponible','cuota_iva'] : [])]) {
    if (d.tipo === 'albaran' && (d[campo] == null || d[campo] === '')) continue; // Un albarán puede no estar valorado.
    if (numero(d[campo]) == null || !Number.isFinite(numero(d[campo]))) aviso(campo,`Falta un importe válido: ${campo.replaceAll('_',' ')}.`);
  }
  if (Array.isArray(d.iva_desglose) && d.iva_desglose.length) {
    for(const fila of d.iva_desglose) {
      if([fila.base,fila.tipo,fila.cuota].some(v=>numero(v)==null || !Number.isFinite(numero(v))) || Math.abs(Number(fila.base)*Number(fila.tipo)/100-Number(fila.cuota))>0.05) aviso('iva_desglose','Una cuota del desglose fiscal no cuadra con su base y tipo.');
    }
    for(const [campo,k] of [['base_imponible','base'],['cuota_iva','cuota']]) if(numero(d[campo])!=null && Math.abs(d.iva_desglose.reduce((s,f)=>s+(numero(f[k])||0),0)-Number(d[campo]))>0.05) aviso(campo,'La suma del desglose fiscal no coincide con el resumen.');
  }
  if (numero(d.porcentaje_iva) === 0 && numero(d.cuota_iva) != null && Math.abs(numero(d.cuota_iva)) > 0.05) aviso('porcentaje_iva','El tipo figura como 0 % pero hay una cuota de IVA. Comprueba el resumen fiscal.');
  if (d._lecturaIncompleta) aviso('lineas','La respuesta se cortó: puede faltar parte del documento.');
  if (d.calidad_imagen === 'ilegible' || d.calidad_imagen === 'recortada') aviso('imagen','Hay partes ilegibles o recortadas. Comprueba el original antes de pedir otra foto.');
  for (const campo of (Array.isArray(d.campos_dudosos) ? d.campos_dudosos : [])) {
    if(d.tipo==='albaran'&&['total','base_imponible','cuota_iva','porcentaje_iva'].includes(campo)&&(d[campo]==null||d[campo]===''))continue;
    aviso(String(campo).slice(0,60),'La lectura señala dudas en este campo.');
  }
  for (const a of revisarCoherencia(d).avisos) aviso(a.clave,a.texto);
  return avisos;
}
export function compararLecturas(a,b) {
  const diferentes = [];
  for (const campo of [...CAMPOS_REVISION,'nif_receptor']) {
    const x=a[campo], y=b[campo];
    const numerico=['base_imponible','porcentaje_iva','cuota_iva','total','retencion','recargo_equivalencia','otros_cargos'].includes(campo);
    const normal=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const iguales=numerico ? (numero(x)===null && numero(y)===null) || (numero(x)!==null && numero(y)!==null && Math.abs(numero(x)-numero(y))<=0.02) : normal(x)===normal(y);
    if(!iguales) diferentes.push({campo,texto:`Las dos lecturas no coinciden en ${campo.replaceAll('_',' ')}.`});
  }
  const desglose = d => (Array.isArray(d.iva_desglose) ? d.iva_desglose : [])
    .map(f=>[numero(f.base),numero(f.tipo),numero(f.cuota)]).sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
  if(JSON.stringify(desglose(a))!==JSON.stringify(desglose(b))) diferentes.push({campo:'iva_desglose',texto:'Las lecturas no coinciden en el desglose de IVA.'});
  return diferentes;
}
export class RevisionDocumento extends Error {
  constructor(datos,avisos,segunda=null) {
    super('Documento guardado para revisión. Sus importes todavía no se han registrado.');
    this.revisionDocumento=true;
    const calidadMala=['ilegible','recortada'].includes(datos.calidad_imagen) && datos.calidad_imagen===segunda?.calidad_imagen;
    const faltaEnAmbas=['proveedor','fecha','total'].some(k=>datos[k]==null && segunda?.[k]==null && !(k==='total' && datos.tipo==='albaran'));
    this.resultado={datos,avisos,segunda,version:1,solicitarFoto:calidadMala && faltaEnAmbas};
  }
}
// Se admite una excepción humana motivada (p. ej. NIF extranjero o retención), nunca silenciosa.
export function datosRevision(original,cambios) {
  const d=structuredClone(original || {});
  for(const campo of CAMPOS_REVISION) {
    if(!Object.hasOwn(cambios,campo)) continue;
    const v=cambios[campo];
    if(['base_imponible','porcentaje_iva','cuota_iva','total','retencion','recargo_equivalencia','otros_cargos'].includes(campo)) {
      if(v!==null && (typeof v!=='number' || !Number.isFinite(v))) throw new Error('Importe no válido');
      d[campo]=v;
    } else {
      if(v!==null && typeof v!=='string') throw new Error('Campo no válido');
      d[campo]=v===null ? null : v.trim().slice(0,300);
    }
  }
  if(d.nif_proveedor) d.nif_proveedor=normNif(d.nif_proveedor);
  // Un cambio de base/IVA invalida el desglose anterior: no mantener datos fiscales contradictorios.
  if(['base_imponible','cuota_iva','porcentaje_iva'].some(k=>d[k]!==original?.[k])) d.iva_desglose=[];
  return d;
}
