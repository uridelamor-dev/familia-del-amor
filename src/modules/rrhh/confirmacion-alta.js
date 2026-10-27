import { randomBytes, createHash } from 'node:crypto';
import { ACCESO_SCHEMA } from './acceso-bienvenida.js';
export const CONFIRMACION_SCHEMA = `CREATE TABLE IF NOT EXISTS rrhh_confirmaciones (
 id SERIAL PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, datos JSONB NOT NULL,
 autor_id INTEGER NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente',
 creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), vence_en TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '7 days',
 respuesta TEXT, worker_id INTEGER, confirmado_en TIMESTAMPTZ, envio TEXT NOT NULL DEFAULT 'pendiente'
);
CREATE UNIQUE INDEX IF NOT EXISTS rrhh_confirmacion_usuario_pendiente ON rrhh_confirmaciones ((datos->>'username')) WHERE estado IN ('pendiente','corregir');
${ACCESO_SCHEMA}`;
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export function resumenConfirmacion(d) {
 const campos={nombre:'Nombre completo',fecha_nac:'Nacimiento',telefono:'Teléfono',email:'Correo',local:'Local',puesto:'Categoría',fecha_alta:'Incorporación',tipo_jornada:'Jornada',tipo_contrato:'Contrato',horas_semana:'Horas semanales',direccion:'Dirección',codigo_postal:'Código postal',poblacion:'Población',pais:'País',talla_camiseta:'Camiseta',talla_sudadera:'Sudadera',username:'Usuario'};
 const r=Object.entries(campos).map(([k,label])=>[label,d[k] || 'Pendiente']);
 for(const [k,label] of [['dni','DNI/NIE'],['iban','IBAN']]) r.push([label,d[k] ? '•••• '+String(d[k]).slice(-4) : 'Pendiente']);
 return r;
}
export function registrarConfirmaciones(app,{auth,pool,validar,crear,enviar,listo,invalidar,procesarAccesos=async()=>{}}) {
 const seguro=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){res.status(e.code==='23505'?409:400).json({ok:false,error:e.code==='23505'?'Ya hay una solicitud pendiente con este usuario. Revísala en Confirmaciones.':e.message||'No se pudo completar la solicitud'});}};
 app.post('/api/rrhh/confirmaciones',auth,seguro(async(req,res)=>{
  const datos=await validar(req,req.body);
  if(!datos.telefono)throw Error('Añade el teléfono del trabajador antes de enviar.');
  if(!listo())throw Error('WhatsApp está desconectado. Reconéctalo antes de enviar.');
  const token=randomBytes(32).toString('hex');
  const {rows:[fila]}=await pool.query('INSERT INTO rrhh_confirmaciones(token_hash,datos,autor_id) VALUES($1,$2,$3) RETURNING id',[hashToken(token),JSON.stringify(datos),req.user.id]);
  let enviado=false;
  try {await enviar(datos.telefono,`Hola ${datos.nombre} 👋\n\n*Tu incorporación a Familia del Amor*\n\nHemos preparado tu ficha para ${datos.local}. Abre el enlace, revisa tus datos y elige *«Sí, mis datos son correctos»* o *«Necesito corregir algo»*.\n\nhttps://familiadelamor.org/confirmar-alta.html#${token}\n\nEl enlace es personal y válido durante 7 días.\n¡Gracias!`);enviado=true;}catch{}
  await pool.query('UPDATE rrhh_confirmaciones SET envio=$1 WHERE id=$2',[enviado?'enviado':'revisar',fila.id]);
  res.json({ok:true,id:fila.id,mensaje:enviado?'WhatsApp enviado. Ficha pendiente de confirmación.':'Solicitud guardada, pero no se pudo confirmar el envío. Revísala en Confirmaciones antes de volver a enviar.'});
 }));
 app.get('/api/rrhh/confirmaciones',auth,seguro(async(req,res)=>{
  const {rows}=await pool.query("SELECT id,datos,estado,respuesta,envio,vence_en,acceso_envio FROM rrhh_confirmaciones WHERE estado IN ('pendiente','corregir') OR (estado='confirmada' AND acceso_envio IN ('pendiente','enviando','revisar')) ORDER BY id DESC LIMIT 100");res.json({ok:true,data:rows});
 }));
 app.post('/api/rrhh/confirmaciones/:id/reenviar-acceso',auth,seguro(async(req,res)=>{
  const {rows}=await pool.query("UPDATE rrhh_confirmaciones SET acceso_envio='pendiente' WHERE id=$1 AND estado='confirmada' AND acceso_envio='revisar' RETURNING id",[req.params.id]);
  if(!rows.length)throw Error('Este envío no necesita un reintento.');
  void procesarAccesos().catch(()=>{});
  res.json({ok:true,mensaje:'Envío preparado. Se comprobará que los datos de acceso sigan siendo los iniciales.'});
 }));
 app.post('/api/rrhh/confirmaciones/:id/recuperar',auth,seguro(async(req,res)=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const {rows:[r]}=await c.query("UPDATE rrhh_confirmaciones SET estado='cancelada' WHERE id=$1 AND estado IN ('pendiente','corregir') RETURNING datos,autor_id",[req.params.id]);
   if(!r)throw Error('Esta solicitud ya no está pendiente.');
   const ids=r.datos.documentos_identidad||[];
   if(ids.length)await c.query('UPDATE rrhh_identidad_adjuntos SET autor_id=$1, creado_en=NOW() WHERE id=ANY($2::uuid[]) AND autor_id=$3 AND worker_id IS NULL',[req.user.id,ids,r.autor_id]);
   await c.query('COMMIT');res.json({ok:true,datos:r.datos});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 const tokenReq=req=>{const t=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(t))throw Error('Enlace no válido o caducado.');return hashToken(t);};
 app.post('/api/alta-personal/revisar',seguro(async(req,res)=>{
  const {rows:[r]}=await pool.query("SELECT datos FROM rrhh_confirmaciones WHERE token_hash=$1 AND estado='pendiente' AND vence_en>NOW()",[tokenReq(req)]);
  if(!r)throw Error('Enlace no disponible: puede haber caducado o estar ya respondido.');
  res.json({ok:true,campos:resumenConfirmacion(r.datos)});
 }));
 app.post('/api/alta-personal/responder',seguro(async(req,res)=>{
  const hash=tokenReq(req),accion=req.body.accion;
  if(!['confirmar','corregir'].includes(accion))throw Error('Elige una respuesta.');
  const nota=String(req.body.nota||'').trim().slice(0,2000);
  if(accion==='corregir'&&!nota)throw Error('Indica qué debemos corregir.');
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const {rows:[r]}=await c.query('SELECT * FROM rrhh_confirmaciones WHERE token_hash=$1 FOR UPDATE',[hash]);
   if(!r||r.estado!=='pendiente'||new Date(r.vence_en)<=new Date())throw Error('Enlace no disponible: puede haber caducado o estar ya respondido.');
   let resultado;
   if(accion==='confirmar')resultado=await crear(c,r);
   await c.query('UPDATE rrhh_confirmaciones SET estado=$1,respuesta=$2,worker_id=$3,confirmado_en=NOW() WHERE id=$4',[accion==='confirmar'?'confirmada':'corregir',nota,resultado?.id||null,r.id]);
   if(accion==='confirmar')await c.query("UPDATE rrhh_confirmaciones SET acceso_envio='pendiente' WHERE id=$1",[r.id]);
   await c.query('COMMIT');invalidar();
   // El alta ya está confirmada: un fallo de WhatsApp no la revierte ni revela las claves.
   if(accion==='confirmar')void procesarAccesos().catch(()=>{});
   res.json({ok:true,mensaje:accion==='confirmar'?'Datos confirmados. Te enviaremos por WhatsApp el enlace al panel, tu usuario, la contraseña inicial y el PIN para fichar en el sistema de tu local. Se mantiene tu fecha de incorporación.':'Hemos registrado la corrección. Tu responsable revisará la ficha antes de activarla.'});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
}
