import {calcularVencimiento} from './vencimiento.js';
import {claveProveedor} from './categorias.js';

const normalizar = valor => String(valor||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function pagoPorEmpresa(empresa) {
 const n=normalizar(empresa);
 if(['del amor uriel slu','del amor uriel sl','del amor uriel s l u','del amor uriel s l','del amor uriel'].includes(n)) return {modo:'mensual',dia_pago:15,meses_despues:1,dias:null,domiciliado:false,automatico:true,porDefecto:true,empresa};
 if(['mateu del amor salinas','mateo del amor salinas','mateu del amor','mateo del amor','pilar ayllon torres','pilar ayllon'].includes(n)) return {modo:'dias',dias:0,dia_pago:null,automatico:true,porDefecto:true,empresa};
 return null;
}
export function periodoPago(f) {
 const explicito=String(f.periodo_facturado||'');
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(explicito)) return {mes:explicito,origen:f.periodo_origen==='manual'?'manual':'documento'};
 const fecha=String(f.fecha||'').slice(0,10);
 if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(fecha)) return {mes:null,origen:null};
 const llegada=String(f.creado_en||'').slice(0,10);
 if(pagoPorEmpresa(f.empresa)?.modo==='mensual' && /^\d{4}-\d{2}-0[1-5]$/.test(llegada) && fecha.slice(0,7)===llegada.slice(0,7) && Number(fecha.slice(8))<=5) {
  const d=new Date(fecha+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);
  return {mes:d.toISOString().slice(0,7),origen:'estimado'};
 }
 return {mes:fecha.slice(0,7),origen:'fecha_factura'};
}
export function planPagoEmpresa(f, reglas, hoy) {
 if(f.pago_origen==='manual' || (Number(f.pagado) && f.pago_origen!=='empresa')) return null;
 if(String(f.tipo||'factura').toLowerCase()!=='factura' || f.dup_estado==='duda') return null;
 const clave=claveProveedor(f.proveedor);
 const excepcion=reglas.some(r=>r.prov_clave===clave && (!r.empresa || r.empresa===f.empresa));
 const c=excepcion?null:pagoPorEmpresa(f.empresa);
 if(!c) return null;
 const fecha=String(f.fecha||'').slice(0,10);
 const instante=new Date(fecha+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(instante.getTime()) || instante.toISOString().slice(0,10)!==fecha) return null;
 const periodo=periodoPago(f);
 const base=c.modo==='mensual' && periodo.mes ? periodo.mes+'-15':fecha;
 const v=calcularVencimiento({fecha:base,condiciones:c}).vencimiento;
 return {vencimiento:v,automatico:1,pagado:v<=hoy?1:0,fecha_pago:v<=hoy?v:null};
}
export async function aplicarPagosEmpresa({dbAll,dbRun},hoy) {
 const reglas=await dbAll('SELECT prov_clave, empresa FROM facturas_pago_reglas');
 const filas=await dbAll("SELECT id, fecha, creado_en, periodo_facturado, periodo_origen, empresa, proveedor, tipo, dup_estado, pagado, fecha_pago, vencimiento, pago_origen, pago_automatico FROM facturas WHERE COALESCE(pago_origen,'') <> 'manual' AND (COALESCE(pagado,0)=0 OR pago_origen='empresa')");
 for(const f of filas) {
  const p=planPagoEmpresa(f,reglas,hoy);if(!p)continue;
  if(f.vencimiento===p.vencimiento && Number(f.pagado)===p.pagado && f.fecha_pago===p.fecha_pago && Number(f.pago_automatico)===1)continue;
  await dbRun(`UPDATE facturas SET vencimiento=?, vencimiento_origen='empresa', pago_automatico=1, pago_origen='empresa', pagado=?, fecha_pago=? WHERE id=? AND COALESCE(pago_origen,'') <> 'manual' AND empresa IS NOT DISTINCT FROM ? AND fecha IS NOT DISTINCT FROM ? AND proveedor IS NOT DISTINCT FROM ? AND pagado IS NOT DISTINCT FROM ?`,[p.vencimiento,p.pagado,p.fecha_pago,f.id,f.empresa,f.fecha,f.proveedor,f.pagado]);
 }
}
