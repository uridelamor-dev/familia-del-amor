import {redondearImporte} from './redondeo.js';
import {claveProducto, validarSuma, mensajeValidacion} from './lineas.js';

const error=(mensaje,status=400)=>Object.assign(new Error(mensaje),{status});
export function prepararLineaManual(body={}) {
 const descripcion=typeof body.descripcion==='string'?body.descripcion.trim():'';
 const unidad=typeof body.unidad==='string'?body.unidad.trim():'';
 if(!descripcion || descripcion.length>300)throw error('Indica el producto (máximo 300 caracteres).');
 if(!unidad || unidad.length>20)throw error('Indica la unidad: kg, U, caja, L…');
 const numero=(v,nombre)=>{
  if(!['string','number'].includes(typeof v)||String(v).trim()==='')throw error(`Falta ${nombre}.`);
  const n=Number(String(v).trim().replace(',','.'));
  if(!Number.isFinite(n)||Math.abs(n)>1e9)throw error(`Revisa ${nombre}.`);
  return n;
 };
 const cantidad=numero(body.cantidad,'la cantidad');
 if(cantidad===0)throw error('La cantidad no puede ser cero; para devoluciones usa una cantidad negativa.');
 let precio_unitario=numero(body.precio_unitario,'el precio neto');
 const calculado=redondearImporte(cantidad*precio_unitario);
 const importe=body.importe==null||String(body.importe).trim()===''?calculado:numero(body.importe,'el importe neto');
 if(Math.abs(importe-calculado)>0.02)throw error('Cantidad × precio no coincide con el importe neto. Revisa el descuento y los datos del original.');
 if(!Array.isArray(body.lineas_actuales)||body.lineas_actuales.some(id=>!Number.isSafeInteger(id)||id<=0))throw error('Vuelve a cargar el detalle antes de añadir la línea.');
 return {descripcion,unidad,cantidad,precio_unitario,importe:redondearImporte(importe),clave:claveProducto(descripcion),lineas_actuales:[...body.lineas_actuales].sort((a,b)=>a-b)};
}

// El bloqueo y la lista de IDs evitan duplicar una línea al reintentar una petición
// cuya respuesta se perdió, sin impedir dos productos iguales en el mismo original.
export async function agregarLineaManual({id,body,transaccion,puedeAcceder,autor,ahora}) {
 if(!Number.isSafeInteger(id)||id<=0)throw error('Documento no válido.');
 const l=prepararLineaManual(body);
 return transaccion(async db=>{
  const f=await db.get('SELECT id,local,tipo,base_imponible::float AS base_imponible FROM facturas WHERE id=? FOR UPDATE',[id]);
  if(!f)throw error('Factura no encontrada.',404);
  if(!puedeAcceder(f.local))throw error('No puedes modificar ese establecimiento.',403);
  const anteriores=await db.all('SELECT id,orden,importe::float AS importe,dudosa FROM factura_lineas WHERE factura_id=? ORDER BY id',[id]);
  if(JSON.stringify(anteriores.map(x=>Number(x.id)))!==JSON.stringify(l.lineas_actuales))throw error('El detalle ha cambiado. Recárgalo y comprueba si la línea ya está añadida antes de repetirla.',409);
  const orden=Math.max(0,...anteriores.map(x=>Number(x.orden)||0))+1;
  const creada=await db.get(`INSERT INTO factura_lineas(factura_id,orden,descripcion,cantidad,unidad,precio_unitario,importe,dudosa,clave,creado_en)
   VALUES(?,?,?,?,?,?,?,FALSE,?,?) RETURNING id`,[id,orden,l.descripcion,l.cantidad,l.unidad,l.precio_unitario,l.importe,l.clave,ahora]);
  const v=validarSuma([...anteriores,{importe:l.importe,dudosa:false}],f.base_imponible,f.tipo);
  await db.run('UPDATE facturas SET lineas_estado=?,lineas_aviso=? WHERE id=?',[v.motivo==='sin_valorar'?'sin_valorar':v.cuadra?(v.dudosas?'dudas':'ok'):'descuadre',mensajeValidacion(v),id]);
  const {lineas_actuales,...detalle}=l;
  await db.run(`INSERT INTO fic_auditoria(entidad,entidad_id,accion,local,autor,detalle,creado_en) VALUES(?,?,?,?,?,?,?)`,['facturas',id,'linea_anadida',f.local,autor,JSON.stringify({...detalle,linea_id:creada.id}),ahora]);
  return {ok:true,linea_id:creada.id,cuadra:!!v.cuadra,suma:v.suma,base:v.base,diferencia:v.diferencia??0};
 });
}
