import {localesDe} from '../usuarios/locales.js';
import {randomUUID} from 'node:crypto';
import {leerCSV,normalizarExtracto,hash,propuestas,categorias} from './importacion.js';
import {instanteMadrid} from '../horarios/tiempo.js';
export const BANCOS_SCHEMA=`
CREATE TABLE IF NOT EXISTS banco_cuentas(id SERIAL PRIMARY KEY,nombre TEXT NOT NULL,empresa TEXT NOT NULL,banco TEXT NOT NULL,ultimos4 TEXT NOT NULL,moneda TEXT NOT NULL DEFAULT 'EUR',mapa JSONB,creado_por TEXT,creado_en TIMESTAMPTZ DEFAULT now(),UNIQUE(empresa,banco,ultimos4));
CREATE TABLE IF NOT EXISTS banco_importaciones(id UUID PRIMARY KEY,cuenta_id INTEGER NOT NULL REFERENCES banco_cuentas(id),mes TEXT NOT NULL,archivo TEXT NOT NULL,contenido TEXT NOT NULL,hash TEXT NOT NULL,mapa JSONB NOT NULL,estado TEXT NOT NULL DEFAULT 'borrador',nuevos INTEGER DEFAULT 0,duplicados INTEGER DEFAULT 0,completo BOOLEAN NOT NULL DEFAULT false,autor TEXT,creado_en TIMESTAMPTZ DEFAULT now(),confirmado_en TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS banco_importaciones_mes ON banco_importaciones(cuenta_id,mes,estado);
CREATE TABLE IF NOT EXISTS banco_movimientos(id BIGSERIAL PRIMARY KEY,cuenta_id INTEGER NOT NULL REFERENCES banco_cuentas(id),importacion_id UUID NOT NULL REFERENCES banco_importaciones(id),fecha DATE NOT NULL,concepto TEXT NOT NULL,importe BIGINT NOT NULL CHECK(importe<>0),saldo BIGINT,referencia TEXT,huella TEXT NOT NULL,categoria TEXT NOT NULL DEFAULT 'Por revisar',revisado BOOLEAN NOT NULL DEFAULT false,anulado BOOLEAN NOT NULL DEFAULT false);
CREATE UNIQUE INDEX IF NOT EXISTS banco_movimientos_activos ON banco_movimientos(cuenta_id,huella) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS banco_movimientos_fecha ON banco_movimientos(cuenta_id,fecha);
CREATE TABLE IF NOT EXISTS banco_conciliaciones(id BIGSERIAL PRIMARY KEY,movimiento_id BIGINT NOT NULL UNIQUE REFERENCES banco_movimientos(id),factura_id INTEGER NOT NULL UNIQUE,pago_anterior JSONB NOT NULL,autor TEXT,creado_en TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS banco_auditoria(id BIGSERIAL PRIMARY KEY,accion TEXT NOT NULL,entidad TEXT NOT NULL,autor TEXT,detalle JSONB NOT NULL DEFAULT '{}',creado_en TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS banco_recordatorios(mes TEXT PRIMARY KEY,estado TEXT NOT NULL,creado_en TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS banco_config(id INTEGER PRIMARY KEY CHECK(id=1),primer_mes TEXT NOT NULL);
INSERT INTO banco_config(id,primer_mes) SELECT 1,to_char(date_trunc('month',now() AT TIME ZONE 'Europe/Madrid')+CASE WHEN extract(day FROM now() AT TIME ZONE 'Europe/Madrid')=1 THEN interval '0 months' ELSE interval '1 month' END,'YYYY-MM') ON CONFLICT DO NOTHING;`;
const error=(texto,status=400)=>Object.assign(Error(texto),{status});
const mesValido=m=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(m||''));
const entero=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
async function transaccion(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const auditar=(c,accion,id,autor,detalle={})=>c.query('INSERT INTO banco_auditoria(accion,entidad,autor,detalle) VALUES($1,$2,$3,$4)',[accion,String(id),autor,JSON.stringify(detalle)]);
export function registrarBancos(app,{pool,auth}) {
 const autenticar=auth(['direccion','contabilidad']);
 const permiso=(req,res,next)=>autenticar(req,res,()=>{
  if(localesDe(req.user).length)return res.status(403).json({ok:false,error:'Bancos requiere acceso contable global. Pide a Dirección que revise tus permisos.'});
  return next();
 });
 const wrap=fn=>async(req,res)=>{try{res.json({ok:true,...await fn(req)});}catch(e){console.error('[Bancos]',e.message);res.status(e.status||500).json({ok:false,error:e.status?e.message:'No se pudo completar la operación. No repitas sin actualizar el panel.'});}};
 const ruta='/api/bancos';
 app.get(ruta,permiso,wrap(async()=>({cuentas:(await pool.query('SELECT * FROM banco_cuentas ORDER BY nombre')).rows,empresas:(await pool.query("SELECT DISTINCT empresa FROM facturas_locales WHERE NULLIF(trim(empresa),'') IS NOT NULL ORDER BY empresa")).rows.map(r=>r.empresa),categorias,recordatorio:(await pool.query('SELECT mes,estado FROM banco_recordatorios ORDER BY mes DESC LIMIT 1')).rows[0]||null})));
 app.post(ruta+'/cuentas',permiso,wrap(async req=>{
  const {nombre,empresa,banco,ultimos4}=req.body||{};
  if(!String(nombre||'').trim()||String(nombre).length>100||!['Sabadell','CaixaBank','BBVA','Santander','Otro banco'].includes(banco)||!/^\d{4}$/.test(String(ultimos4||'')))throw error('Indica nombre, banco y los últimos cuatro dígitos de la cuenta.');
  if(!(await pool.query('SELECT 1 FROM facturas_locales WHERE empresa=$1',[empresa])).rows.length)throw error('Elige una empresa de la configuración de locales.');
  const r=await pool.query('INSERT INTO banco_cuentas(nombre,empresa,banco,ultimos4,creado_por) VALUES($1,$2,$3,$4,$5) ON CONFLICT(empresa,banco,ultimos4) DO NOTHING RETURNING id',[nombre.trim(),empresa,banco,ultimos4,req.user.username]);
  if(!r.rows.length)throw error('Esa cuenta ya está registrada.',409);return {id:r.rows[0].id};
 }));
 app.post(ruta+'/columnas',permiso,wrap(async req=>{
  try {const filas=leerCSV(req.body?.texto,req.body?.separador);return {filas:filas.slice(0,35),total:filas.length};}catch(e){throw error(e.message);}
 }));
 app.post(ruta+'/previsualizar',permiso,wrap(async req=>{
  const {texto,mapa,cuenta_id,mes,archivo}=req.body||{};
  if(!mesValido(mes)||!(await pool.query('SELECT id FROM banco_cuentas WHERE id=$1',[entero(cuenta_id)])).rows.length)throw error('Selecciona cuenta y mes.');
  let n;try{n=normalizarExtracto(texto,mapa||{});}catch(e){throw error(e.message);}
  for(const m of n.movimientos)if(m.fecha.slice(0,7)!==mes)n.errores.push({fila:m.fila,error:'La fecha no pertenece al mes elegido.'});
  if(n.errores.length)return {errores:n.errores.slice(0,50),totalErrores:n.errores.length};
  const existentes=new Set((await pool.query('SELECT huella FROM banco_movimientos WHERE cuenta_id=$1 AND NOT anulado AND huella=ANY($2::text[])',[cuenta_id,n.movimientos.map(m=>m.huella)])).rows.map(r=>r.huella));
  const nuevos=n.movimientos.filter(m=>!existentes.has(m.huella)),id=randomUUID();
  await pool.query('INSERT INTO banco_importaciones(id,cuenta_id,mes,archivo,contenido,hash,mapa,autor) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,cuenta_id,mes,String(archivo||'extracto.csv').split(/[\\/]/).pop().slice(0,150),texto,hash(texto),JSON.stringify(mapa),req.user.username]);
  return {id,total:n.movimientos.length,nuevos:nuevos.length,duplicados:n.movimientos.length-nuevos.length,repetidos:n.repetidos,entradas:nuevos.filter(m=>m.importe>0).reduce((a,b)=>a+b.importe,0),salidas:-nuevos.filter(m=>m.importe<0).reduce((a,b)=>a+b.importe,0),muestra:n.movimientos.slice(0,10)};
 }));
 app.post(ruta+'/confirmar',permiso,wrap(async req=>transaccion(pool,async c=>{
  if(!/^[0-9a-f-]{36}$/.test(String(req.body?.id||'')))throw error('Importación no válida.');
  const imp=(await c.query('SELECT * FROM banco_importaciones WHERE id=$1 FOR UPDATE',[req.body.id])).rows[0];
  if(!imp)throw error('Importación no encontrada.',404);
  if(imp.estado==='confirmada')return {nuevos:imp.nuevos,duplicados:imp.duplicados};
  if(imp.estado!=='borrador')throw error('La importación está anulada. Prepara una nueva.',409);
  // Serializa dos extractos solapados de una misma cuenta.
  await c.query('SELECT id FROM banco_cuentas WHERE id=$1 FOR UPDATE',[imp.cuenta_id]);
  const n=normalizarExtracto(imp.contenido,imp.mapa);if(n.errores.length)throw error('El archivo contiene errores.');
  let nuevos=0;
  for(const m of n.movimientos){const r=await c.query('INSERT INTO banco_movimientos(cuenta_id,importacion_id,fecha,concepto,importe,saldo,referencia,huella) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(cuenta_id,huella) WHERE NOT anulado DO NOTHING RETURNING id',[imp.cuenta_id,imp.id,m.fecha,m.concepto,m.importe,m.saldo,m.referencia,m.huella]);nuevos+=r.rows.length;}
  const duplicados=n.movimientos.length-nuevos;
  await c.query("UPDATE banco_importaciones SET estado='confirmada',nuevos=$2,duplicados=$3,completo=$4,confirmado_en=now() WHERE id=$1",[imp.id,nuevos,duplicados,req.body.completo===true]);
  await c.query('UPDATE banco_cuentas SET mapa=$2 WHERE id=$1',[imp.cuenta_id,JSON.stringify(imp.mapa)]);
  await auditar(c,'importar',imp.id,req.user.username,{nuevos,duplicados});return {nuevos,duplicados};
 })));
 app.post(ruta+'/anular-importacion',permiso,wrap(async req=>transaccion(pool,async c=>{
  if(!/^[0-9a-f-]{36}$/.test(String(req.body?.id||'')))throw error('Importación no válida.');
  const imp=(await c.query('SELECT * FROM banco_importaciones WHERE id=$1 FOR UPDATE',[req.body.id])).rows[0];if(!imp)throw error('Importación no encontrada.',404);
  await c.query('SELECT id FROM banco_cuentas WHERE id=$1 FOR UPDATE',[imp.cuenta_id]);
  await c.query('SELECT id FROM banco_movimientos WHERE importacion_id=$1 ORDER BY id FOR UPDATE',[imp.id]);
  if((await c.query('SELECT x.id FROM banco_conciliaciones x JOIN banco_movimientos m ON m.id=x.movimiento_id WHERE m.importacion_id=$1',[imp.id])).rows.length)throw error('Deshaz primero las conciliaciones de este extracto.',409);
  await c.query('UPDATE banco_movimientos SET anulado=true WHERE importacion_id=$1',[imp.id]);
  await c.query("UPDATE banco_importaciones SET estado='anulada',completo=false WHERE id=$1",[imp.id]);
  await auditar(c,'anular_importacion',imp.id,req.user.username);return {};
 })));
 app.get(ruta+'/movimientos',permiso,wrap(async req=>{
  const cuenta=entero(req.query.cuenta),mes=req.query.mes;if(!cuenta||!mesValido(mes))throw error('Selecciona cuenta y mes.');
  const desde=mes+'-01',params=[cuenta,desde];
  const data=(await pool.query(`SELECT m.*,m.fecha::text AS fecha,c.empresa,x.factura_id FROM banco_movimientos m JOIN banco_cuentas c ON c.id=m.cuenta_id LEFT JOIN banco_conciliaciones x ON x.movimiento_id=m.id WHERE NOT m.anulado AND m.cuenta_id=$1 AND m.fecha >= $2::date AND m.fecha < $2::date+interval '1 month' ORDER BY m.fecha DESC,m.id DESC LIMIT 10000`,params)).rows;
  const importaciones=(await pool.query("SELECT id,archivo,estado,nuevos,duplicados,completo,confirmado_en FROM banco_importaciones WHERE cuenta_id=$1 AND mes=$2 AND estado IN ('confirmada','anulada') ORDER BY confirmado_en DESC LIMIT 20",[cuenta,mes])).rows;
  return {data,importaciones};
 }));
 app.get(ruta+'/propuestas/:id',permiso,wrap(async req=>{
  const m=(await pool.query('SELECT m.*,m.fecha::text,c.empresa FROM banco_movimientos m JOIN banco_cuentas c ON c.id=m.cuenta_id WHERE NOT m.anulado AND m.id=$1',[entero(req.params.id)])).rows[0];if(!m)throw error('Movimiento no encontrado.',404);
  const f=(await pool.query("SELECT id,empresa,proveedor,nif,numero_factura,total,fecha,tipo,dup_estado,dup_de,pagado FROM facturas WHERE empresa=$1 AND total=$2::numeric/100 AND COALESCE(tipo,'')<>'albaran' AND COALESCE(dup_estado,'')<>'duda' AND dup_de IS NULL AND NOT EXISTS(SELECT 1 FROM banco_conciliaciones x WHERE x.factura_id=facturas.id) ORDER BY fecha DESC LIMIT 200",[m.empresa,-Number(m.importe)])).rows;
  return {data:propuestas(m,f)};
 }));
 app.post(ruta+'/conciliar',permiso,wrap(async req=>transaccion(pool,async c=>{
  const m=(await c.query('SELECT m.*,m.fecha::text AS fecha,c.empresa FROM banco_movimientos m JOIN banco_cuentas c ON c.id=m.cuenta_id WHERE NOT m.anulado AND m.id=$1 FOR UPDATE OF m',[entero(req.body?.movimiento_id)])).rows[0];
  const f=(await c.query('SELECT * FROM facturas WHERE id=$1 FOR UPDATE',[entero(req.body?.factura_id)])).rows[0];
  if(!m||!f)throw error('Movimiento o factura no encontrados.',404);
  if(!propuestas(m,[f]).length)throw error('Debe coincidir la empresa y el importe completo de una factura válida.');
  if((await c.query('SELECT id FROM banco_conciliaciones WHERE movimiento_id=$1 OR factura_id=$2',[m.id,f.id])).rows.length)throw error('Ya hay una conciliación. Actualiza antes de continuar.',409);
  const anterior={pagado:f.pagado,fecha_pago:f.fecha_pago,pago_origen:f.pago_origen,pago_automatico:f.pago_automatico};
  await c.query('INSERT INTO banco_conciliaciones(movimiento_id,factura_id,pago_anterior,autor) VALUES($1,$2,$3,$4)',[m.id,f.id,JSON.stringify(anterior),req.user.username]);
  await c.query("UPDATE facturas SET pagado=1,fecha_pago=$2,pago_origen='banco',pago_automatico=0 WHERE id=$1",[f.id,m.fecha]);
  await c.query("UPDATE banco_movimientos SET categoria='Pago a proveedor',revisado=true WHERE id=$1",[m.id]);
  await auditar(c,'conciliar',m.id,req.user.username,{factura_id:f.id});return {};
 })));
 app.post(ruta+'/desconciliar',permiso,wrap(async req=>transaccion(pool,async c=>{
  const id=entero(req.body?.id);await c.query('SELECT id FROM banco_movimientos WHERE id=$1 AND NOT anulado FOR UPDATE',[id]);
  const x=(await c.query('SELECT * FROM banco_conciliaciones WHERE movimiento_id=$1 FOR UPDATE',[id])).rows[0];if(!x)throw error('No hay conciliación.',409);
  const f=(await c.query('SELECT * FROM facturas WHERE id=$1 FOR UPDATE',[x.factura_id])).rows[0];
  const m=(await c.query('SELECT fecha::text FROM banco_movimientos WHERE id=$1',[id])).rows[0];
  const restaurar=f&&f.pago_origen==='banco'&&Number(f.pagado)===1&&f.fecha_pago===m.fecha;
  const p=x.pago_anterior;
  if(restaurar)await c.query('UPDATE facturas SET pagado=$2,fecha_pago=$3,pago_origen=$4,pago_automatico=$5 WHERE id=$1',[f.id,p.pagado,p.fecha_pago,p.pago_origen,p.pago_automatico]);
  await c.query('DELETE FROM banco_conciliaciones WHERE id=$1',[x.id]);
  await c.query("UPDATE banco_movimientos SET categoria='Por revisar',revisado=false WHERE id=$1",[id]);
  await auditar(c,'desconciliar',id,req.user.username,{factura_id:x.factura_id,restaurado:!!restaurar});return {advertencia:restaurar?null:'La factura había cambiado después; se ha conservado su estado actual.'};
 })));
 app.post(ruta+'/clasificar',permiso,wrap(async req=>transaccion(pool,async c=>{
  const {id,categoria}=req.body||{};if(!categorias.includes(categoria))throw error('Categoría no válida.');
  const r=await c.query('SELECT id FROM banco_movimientos WHERE id=$1 AND NOT anulado FOR UPDATE',[entero(id)]);if(!r.rows.length)throw error('Movimiento no encontrado.',404);
  if((await c.query('SELECT id FROM banco_conciliaciones WHERE movimiento_id=$1',[id])).rows.length)throw error('Deshaz la conciliación antes de cambiar la categoría.',409);
  await c.query('UPDATE banco_movimientos SET categoria=$2,revisado=$3 WHERE id=$1',[id,categoria,categoria!=='Por revisar']);await auditar(c,'clasificar',id,req.user.username,{categoria});return {};
 })));
}
export function crearRecordatorioBancos({pool,enviar,listo}) {
 return async (ahora=new Date())=>{
  const {fecha,hora}=instanteMadrid(ahora);if(hora<'10:00:00'||hora>='21:00:00'||!listo())return;
  const mes=fecha.slice(0,7);
  const cfg=(await pool.query('SELECT primer_mes FROM banco_config WHERE id=1')).rows[0];if(!cfg||mes<cfg.primer_mes)return;
  const prev=new Date(mes+'-01T12:00:00Z');prev.setUTCMonth(prev.getUTCMonth()-1);const anterior=prev.toISOString().slice(0,7);
  // Se recupera al reconectar aunque el servidor estuviera apagado el día 1.
  const r=await pool.query("INSERT INTO banco_recordatorios(mes,estado) VALUES($1,'enviando') ON CONFLICT DO NOTHING RETURNING mes",[mes]);if(!r.rows.length)return;
  const nombre=prev.toLocaleDateString('es-ES',{month:'long',year:'numeric',timeZone:'Europe/Madrid'});
  try{await enviar('645619572',`Hola, Silvia 👋\n\nYa puedes subir los movimientos bancarios de *${nombre}*.\n\n1. Descarga el extracto completo del mes en Excel o CSV, por cada cuenta y titular fiscal.\n2. Entra en *Contabilidad → Bancos* y elige el titular fiscal, su cuenta y el mes ${anterior}.\n3. Sube el archivo, revisa la vista previa y confirma.\n\nEl panel detectará coincidencias ya importadas. Revisa las propuestas antes de marcar facturas como pagadas.\n\nhttps://familiadelamor.org/panel/#bancos\n\nSi ya lo has subido, no hace falta repetirlo.`);await pool.query("UPDATE banco_recordatorios SET estado='enviado' WHERE mes=$1",[mes]);}
  catch(e){await pool.query("UPDATE banco_recordatorios SET estado='revisar' WHERE mes=$1",[mes]);throw e;}
 };
}
