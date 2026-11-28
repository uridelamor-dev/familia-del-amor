import {esDocumentoPrevioFactura} from './tipo-documento.js';
export const MOTIVOS_REVISION={
 paginas:{titulo:'Páginas o imagen incompletas',accion:'Comprueba el original completo y sus continuaciones.'},
 proforma:{titulo:'Proforma o presupuesto',accion:'Conserva este documento y comprueba si existe la factura definitiva.'},
 identidad:{titulo:'Proveedor o identidad fiscal',accion:'Contrasta emisor y NIF con el membrete, no con el destinatario.'},
 fechas:{titulo:'Fecha o vencimiento',accion:'Comprueba la fecha de emisión y las condiciones confirmadas de pago.'},
 importes:{titulo:'Importes e impuestos',accion:'Revisa el cuadro fiscal: bases, IVA, recargos, retenciones y total.'},
 detalle:{titulo:'Productos, unidades o descuentos',accion:'Comprueba la fila señalada y sus encabezados: cantidad, formato y precio.'},
 local:{titulo:'Establecimiento por identificar',accion:'Contrasta la procedencia y el local de entrega; el domicilio fiscal no basta.'},
 tecnico:{titulo:'Error técnico',accion:'El original está guardado. Reintenta la lectura o comprueba la conexión.'},
 registro:{titulo:'Registro pendiente',accion:'La revisión está confirmada. El registro y el archivo se procesan en la cola.'},
 proceso:{titulo:'Lectura en curso',accion:'Todavía no necesita una decisión: espera a que termine la lectura.'},
 datos:{titulo:'Otros datos por comprobar',accion:'Abre el documento y revisa los campos señalados.'}
};
export function clasificarRevision(f={}) {
 const r=f.resultado||{},d=r.datos||{},avisos=Array.isArray(r.avisos)?r.avisos:[];
 const tipos=new Set();
 if(['pendiente','leyendo'].includes(f.estado))tipos.add(r.aprobacion?'registro':'proceso');
 else if(f.estado==='error')tipos.add('tecnico');
 else {
  if(f.estado==='paginas'||['recortada','ilegible'].includes(d.calidad_imagen)||avisos.some(a=>(a.campo||a.clave)==='imagen'||/páginas|paginas|recortad/i.test(a.texto||'')))tipos.add('paginas');
  if(esDocumentoPrevioFactura(d))tipos.add('proforma');
  for(const a of avisos){const k=a.campo||a.clave||'';
   if(/proveedor|nif|emisor|receptor/.test(k))tipos.add('identidad');
   else if(/fecha|vencimiento/.test(k))tipos.add('fechas');
   else if(/total|base|iva|recargo|retencion|cargo/.test(k))tipos.add('importes');
   else if(/linea|unidad|producto|detalle/.test(k))tipos.add('detalle');
   else if(/local|empresa/.test(k))tipos.add('local');
  }
  if(!f.local)tipos.add('local');
 }
 if(!tipos.size)tipos.add('datos');
 const categorias=Object.keys(MOTIVOS_REVISION).filter(k=>tipos.has(k));
 return {principal:categorias[0],categorias,...MOTIVOS_REVISION[categorias[0]],avisos:[...new Set(avisos.map(a=>a.texto).filter(Boolean))]};
}
