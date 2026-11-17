import {resumenDocumentalVigente} from './auditoria-completa.js';
import {ajustesFiscales} from './ajustes-fiscales.js';
import {estadoAlbaran} from './albaranes.js';
import {numeroDocumentoAusente} from './numero-documento.js';
// Señales de revisión, nunca correcciones automáticas ni una prueba de duplicidad.
const limpio = v => String(v ?? '').normalize('NFKC').trim().toLocaleLowerCase('es');
function tieneAvisosLectura(value) {
  if(typeof value==='string') {
    if(!value.trim())return false;
    try {value=JSON.parse(value);} catch {return true;}
  }
  return Array.isArray(value)?value.length>0:Boolean(value);
}
export function fechaValida(value) {
  const s = String(value ?? '').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T12:00:00Z')) && new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
}
export function revisarFacturas(rows, hoy) {
  const grupos=new Map();
  const clave=f => {
    const numero=limpio(f.numero_factura), proveedor=limpio(f.nif || f.proveedor);
    if(numeroDocumentoAusente(f.numero_factura) || !proveedor || !fechaValida(f.fecha)) return null;
    return JSON.stringify([proveedor,numero,limpio(f.local),String(f.fecha).slice(0,4),f.tipo || 'factura']);
  };
  for(const f of rows) { const k=clave(f); if(k) grupos.set(k,(grupos.get(k)||0)+1); }
  return rows.map(original=> {
    const f=estadoAlbaran(original);
    const avisos=[];
    let ajustes=0;try{ajustes=ajustesFiscales(f);}catch{avisos.push('Ajustes fiscales no válidos');}
    if(!fechaValida(f.fecha)) avisos.push('Fecha pendiente de verificar');
    else if(String(f.fecha).slice(0,10)>hoy) avisos.push('Fecha futura');
    if(!limpio(f.local)) avisos.push('Falta asignar local');
    // Puede ser una ausencia legítima: una revisión completa vigente la acredita.
    // La omisión automática, incluso en un albarán sin valorar, requiere contraste.
    if(['factura','albaran'].includes(f.tipo) && numeroDocumentoAusente(f.numero_factura) && f.auditoria_completa?.vigente!==true) avisos.push('Número de documento pendiente de comprobar');
    if(f.tipo==='albaran'&&(f.total==null||f.total==='')) {}
    else if(f.total===null || f.total===undefined || f.total==='' || !Number.isFinite(Number(f.total))) avisos.push('Importe no disponible');
    else if(Number(f.total)===0) avisos.push('Importe cero: comprobar original');
    if(f.tipo!=='albaran') {
      if(f.base_imponible==null || f.base_imponible==='' || f.cuota_iva==null || f.cuota_iva==='') avisos.push('Falta base imponible o cuota de IVA');
      else if(f.total!=null && f.total!=='' && Math.abs(Number(f.total)-Number(f.base_imponible)-Number(f.cuota_iva)-ajustes)>.020001) avisos.push('Base + IVA difiere del total: comprobar ajustes u original');
    }
    // La auditoría vigente cubre las dudas OCR, pero no errores o descuadres
    // recalculados: estos estados pueden cambiar sin cambiar la huella auditada.
    const dudasLectura=f.lineas_estado==='dudas' || tieneAvisosLectura(f.revisar);
    if((f.lineas_estado==='error' || (f.lineas_estado==='descuadre' && !resumenDocumentalVigente(f))) || (f.auditoria_completa?.vigente!==true && dudasLectura)) avisos.push('Lectura pendiente de revisión');
    if(['revisar','error'].includes(f.iva_estado)) avisos.push('Desglose de IVA pendiente de revisión');
    if((grupos.get(clave(f)) || 0)>1) avisos.push('Mismo proveedor y número en esta lista');
    return {...f, calidad:avisos};
  });
}
