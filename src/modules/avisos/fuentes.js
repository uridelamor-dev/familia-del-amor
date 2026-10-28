import {getDashboard} from '../dashboard/dashboard.service.js';
import {avisosDatos} from '../rrhh/avisos-datos.js';
import {localCoincideConReview} from '../reviews/reviews.service.js';
import {ABIERTOS} from '../mantenimiento/estados.js';

export async function cargarAvisosFuente(client,fuente,{locales=[],hoy,whatsappConnected}){
 const all=async(s,p=[])=>(await client.query(s,p)).rows;
 if(fuente==='rrhh'){
  const rows=await all(`SELECT u.id,u.username,u.nombre,u.local,u.activo,u.fecha_baja,u.telefono,u.puesto,u.fecha_nac,u.email,u.dni,
  a.direccion,a.iban,a.tipo_jornada,a.tipo_contrato,a.talla_camiseta,a.talla_sudadera
  FROM users u LEFT JOIN rrhh_datos_alta a ON a.worker_id=u.id
  WHERE u.rol IN ('trabajador','encargado') AND (NULLIF(u.fecha_alta,'') IS NULL OR u.fecha_alta <= $1)
   AND (cardinality($2::text[])=0 OR u.local=ANY($2))`,[hoy,locales]);
  return avisosDatos(rows,{privado:true,hoy}).map(a=>({...a,sev:['telefono','dni','tipo_contrato','tipo_jornada'].includes(a.campo)?'imp':'info',detalle:a.titulo,titulo:`${a.nombre}: ${a.titulo.toLowerCase()}`}));
 }
 if(fuente==='candidaturas'){
  // No tienen local asignado: solo responsables con ámbito global.
  if(locales.length)return [];
  return (await all("SELECT id,nombre,creado_en FROM hr_applications WHERE estado='nuevo'"))
   .map(r=>({id:`candidatura:${r.id}`,documento_id:r.id,titulo:`Candidatura pendiente: ${r.nombre||'Sin nombre'}`,detalle:'Revisar candidatura',sev:'info',desde:r.creado_en}));
 }
 if(fuente==='facturas'){
  const rows=await all(`SELECT id,proveedor,numero_factura,local,revisar,iva_estado,dup_estado FROM facturas
   WHERE (cardinality($1::text[])=0 OR local=ANY($1)) AND (
    (NULLIF(TRIM(COALESCE(revisar,'')),'') IS NOT NULL AND revisar NOT IN ('[]','null'))
    OR iva_estado='revisar' OR dup_estado='duda')`,[locales]);
  return rows.map(r=>({id:`factura:${r.id}`,documento_id:r.id,local:r.local,sev:'imp',titulo:`${r.proveedor||'Factura'}${r.numero_factura?' · '+r.numero_factura:''}`,detalle:[r.dup_estado==='duda'?'Posible duplicado':null,r.iva_estado==='revisar'?'Revisar IVA':null,r.revisar&&r.revisar!=='[]'?'Comprobar lectura':null].filter(Boolean).join(' · ')}));
 }
 if(fuente==='pendientes'){
  if(locales.length)return [];
  return (await all('SELECT id,proveedor,numero_factura,creado_en FROM facturas_pendientes'))
   .map(r=>({id:`pendiente:${r.id}`,documento_id:r.id,sev:'imp',titulo:`Asignar documento de ${r.proveedor||'proveedor pendiente'}`,detalle:r.numero_factura||'Falta asignar empresa y local',desde:r.creado_en}));
 }
 if(fuente==='mantenimiento'){
  return (await all(`SELECT id,local,titulo,creado_en,fecha_objetivo,
    COUNT(*) OVER(PARTITION BY local,titulo) AS repetidas FROM maintenance_issues
    WHERE estado=ANY($1) AND (cardinality($2::text[])=0 OR local=ANY($2))`,[ABIERTOS,locales]))
    .map(r=>({id:`mantenimiento:${r.id}`,documento_id:r.id,local:r.local,titulo:r.titulo,detalle:r.fecha_objetivo&&r.fecha_objetivo<hoy?'Plazo de resolución vencido':'Incidencia pendiente',sev:Number(r.repetidas)>=3?'crit':'imp',desde:r.creado_en}));
 }
 if(fuente==='reviews'){
  const rows=await all("SELECT id,author,rating,location_name,fecha,creado_en FROM google_reviews r WHERE COALESCE(google_reply,'')='' AND COALESCE(fecha,creado_en)>=COALESCE((SELECT MAX(cutoff) FROM reviews_repaso),'') AND NOT EXISTS(SELECT 1 FROM reviews_repaso_items i WHERE i.review_id=r.id AND i.state='omitir')");
  return rows.filter(r=>!locales.length||locales.some(l=>localCoincideConReview(l,r.location_name))).map(r=>({id:`review:${r.id}`,documento_id:r.id,titulo:`Reseña de ${r.rating??'—'}★ · ${r.author||'Cliente'}`,detalle:'Pendiente de responder',local:locales.find(l=>localCoincideConReview(l,r.location_name))||r.location_name,sev:Number(r.rating)>0&&Number(r.rating)<=2?'imp':'info',desde:r.fecha||r.creado_en}));
 }
 if(fuente==='riesgos'){
  // Conservar los riesgos críticos de negocio que ya detectaba el panel general.
  let fallo=false;
  const consultar=async(sql,params=[])=>{let i=0;try{return await all(sql.replace(/\?/g,()=>'$'+(++i)),params);}catch(e){fallo=true;throw e;}};
  const d=await getDashboard({all:consultar,get:async(s,p)=>(await consultar(s,p))[0]},{now:hoy,whatsappConnected});
  if(fallo)throw Error('No se pudieron comprobar todos los riesgos');
  const texto=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  return (d.preocupaciones||[]).filter(a=>a.sev==='crit'&&!['whatsapp','mantenimiento'].includes(a.go)).map(a=>({
   id:'riesgo:'+a.tipo+':'+a.titulo.replace(/\d+/g,'#'),titulo:texto(a.titulo),detalle:texto(a.decision||a.narrativa),sev:'crit',view:a.go==='marketing'?'reviews':a.go,
   departamento:a.go==='facturas'?'Contabilidad':a.go==='marketing'?'Marketing':'Dirección'
  }));
 }
 if(fuente==='whatsapp')return whatsappConnected?[]:[{id:'whatsapp:conexion',sev:'crit',titulo:'WhatsApp está desconectado',detalle:'Sara no puede recibir ni enviar mensajes. Revisa la conexión.'}];
 return [];
}
