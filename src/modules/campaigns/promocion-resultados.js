import {telefono,dia,validarFiltros,cargarFuente,resolverIdentidades,analizarRecorrido,cargarActividad} from './recorrido.js';

export const PROMOCION_RESULTADOS_SCHEMA = `CREATE TABLE IF NOT EXISTS campana_promocion_vinculos (
 clave TEXT NOT NULL, origen TEXT NOT NULL CHECK(origen IN ('campana','correo','permiso')), envio_id TEXT NOT NULL,
 autor INTEGER NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(clave,origen,envio_id)
)`;
export function puedePromos(user){return user.rol==='direccion'||!Array.isArray(user.modulos)||!user.modulos.length||user.modulos.includes('promos');}
export async function promocion(db,id,user){
 if(!puedePromos(user)||!/^\d+$/.test(String(id)))return null;
 return db.get('SELECT * FROM fid_promos WHERE id=?',[id]);
}
export async function listarPromociones(db,user){
 if(!puedePromos(user))return [];
 return db.all('SELECT DISTINCT ON (clave) id,clave,nombre,desde,hasta,estado FROM fid_promos ORDER BY clave,version DESC');
}
export async function vincularPromocion(db,id,user,origen,envioId,retirar=false){
 const p=await promocion(db,id,user);if(!p)throw Error('Promoción no disponible');
 if(!await cargarFuente(db,origen,String(envioId),user))throw Error('Envío no disponible');
 if(retirar)await db.run('DELETE FROM campana_promocion_vinculos WHERE clave=? AND origen=? AND envio_id=?',[p.clave,origen,String(envioId)]);
 else await db.run('INSERT INTO campana_promocion_vinculos(clave,origen,envio_id,autor) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',[p.clave,origen,String(envioId),user.id]);
}
export async function enviosDisponibles(db,user){
 const wa=await db.all("SELECT id::text,nombre,creado_en,'campana' AS origen FROM campanas_wa ORDER BY id DESC LIMIT 200");
 const email=await db.all("SELECT id::text,asunto AS nombre,creado_en,'correo' AS origen FROM correo_envios WHERE autor=? ORDER BY creado_en DESC LIMIT 100",[user.id]);
 const permiso=puedePromos(user)?await db.all("SELECT id::text,nombre,creado_en,'permiso' AS origen FROM fid_comunicaciones ORDER BY id DESC LIMIT 100"):[];
 return [...wa,...email,...permiso].sort((a,b)=>String(b.creado_en).localeCompare(String(a.creado_en)));
}
export async function obtenerPromocion(db,id,user,query={}){
 const p=await promocion(db,id,user);if(!p)return null;
 const f=validarFiltros({...query,desde:query.desde||p.desde||dia(p.creado_en)});
 const vinculos=await db.all('SELECT origen,envio_id FROM campana_promocion_vinculos WHERE clave=?',[p.clave]);
 const comunicaciones=[],envios=[];
 for(const v of vinculos){const fuente=await cargarFuente(db,v.origen,v.envio_id,user);if(!fuente)continue;comunicaciones.push(fuente.campana);envios.push(...fuente.envios);}
 const mails=[...new Set(envios.map(e=>String(e.correo||'').trim().toLowerCase()).filter(Boolean))];
 const leads=mails.length?await db.all('SELECT correo,telefono FROM leads WHERE lower(trim(correo))=ANY(?)',[mails]):[];
 const receptores=resolverIdentidades(envios,leads);
 const derechos=await db.all('SELECT q.id AS qr_id,q.nombre,q.telefono,d.concedido_en FROM fid_promo_derechos d JOIN pro_qr q ON q.id=d.qr_id WHERE d.clave=?',[p.clave]);
 // Una factura compartida se suma una sola vez; anulaciones y pruebas nunca son canjes válidos.
 const usos=await db.all(`SELECT u.id,u.qr_id,q.nombre,q.telefono,u.local,u.creado_en AS fecha,u.factura_id,f.importe_total
 FROM fid_promo_usos u JOIN fid_facturas f ON f.id=u.factura_id LEFT JOIN pro_qr q ON q.id=u.qr_id
 WHERE u.clave=? AND u.estado='usado' AND f.es_prueba=FALSE AND f.devolucion=FALSE AND f.revertida_en IS NULL`,[p.clave]);
 const personas=new Map(receptores.map(r=>[r.id,{...r,fecha_envio:r.fecha_envio,derecho:false,observado:true}]));
 for(const r of [...derechos.filter(r=>dia(r.concedido_en)<=f.hasta),...usos.filter(r=>dia(r.fecha)<=f.hasta)]){
 const tel=telefono(r.telefono),key=tel||'qr:'+r.qr_id;
 if(!personas.has(key))personas.set(key,{id:key,telefono:tel,nombre:r.nombre||'',correo:'',enviado:false,fecha_envio:null,identidad:tel?'telefono':'sin_identificar',derecho:false,observado:true});
 const x=personas.get(key);if(!x.nombre)x.nombre=r.nombre||'';
 if(r.concedido_en&&dia(r.concedido_en)<=f.hasta)x.derecho=true;
 }
 const cohort=[...personas.values()].filter(x=>x.derecho||!x.fecha_envio||dia(x.fecha_envio)<=f.hasta);const {tarjetas,eventos}=await cargarActividad(db,cohort.map(x=>x.telefono).filter(Boolean));
 // El inicio de observación no es un envío: se usa solo para el cálculo temporal común.
 const base=analizarRecorrido(cohort.map(x=>({...x,enviado:true,fecha_envio:f.desde+'T00:00:00+14:00'})),tarjetas,eventos,{...f,grupo:'todos',q:''});
 let filas=base.filas.map(row=>{
 const original=personas.get(row.id);
 const canjes=usos.filter(u=>(telefono(u.telefono)?telefono(u.telefono)===row.telefono:'qr:'+u.qr_id===row.id)&&dia(u.fecha)>=f.desde&&dia(u.fecha)<=f.hasta&&(!f.local||u.local===f.local));
 const visitDays=new Set([...row.eventos.filter(e=>['visita','canje'].includes(e.tipo)).map(e=>e.local+'|'+dia(e.fecha)),...canjes.map(u=>u.local+'|'+dia(u.fecha))]);
 return {...row,tarjeta:row.id.startsWith('qr:')?'existente':row.tarjeta,enviado:original.enviado&&dia(original.fecha_envio)<=f.hasta,fecha_envio:original.fecha_envio,derecho:original.derecho,canjes_promocion:canjes.length,usos_promocion:canjes,visitas:visitDays.size,eventos:[...row.eventos,...canjes.map(u=>({tipo:'promocion',fecha:u.fecha,local:u.local,id:u.id}))]};
 });
 const grupos={todos:()=>true,con_tarjeta:x=>x.tarjeta!=='sin_registro',alta_posterior:x=>x.alta_periodo,visita:x=>x.visitas>0,sin_visita:x=>!x.visitas,repite:x=>x.visitas>1,canje:x=>x.canjes_promocion>0,sin_canje:x=>!x.canjes_promocion,resena:x=>x.eventos.some(e=>e.tipo==='resena'),puntos:x=>x.eventos.some(e=>e.tipo==='puntos'),sin_identificar:x=>!x.telefono};
 filas=filas.filter(x=>grupos[f.grupo](x)&&(!f.q||[x.nombre,x.telefono,x.correo].join(' ').toLowerCase().includes(f.q.toLowerCase())));
 const facturas=new Map();for(const x of filas)for(const u of x.usos_promocion)facturas.set(u.factura_id,u.importe_total);
 const resumen={personas:filas.length,enviados:filas.filter(x=>x.enviado).length,derechos:filas.filter(x=>x.derecho).length,usuarios:filas.filter(x=>x.canjes_promocion).length,canjes:filas.reduce((s,x)=>s+x.canjes_promocion,0),visitas:filas.filter(x=>x.visitas).length,tarjetas:filas.filter(x=>x.tarjeta!=='sin_registro').length,resenas:filas.filter(x=>x.eventos.some(e=>e.tipo==='resena')).length,facturas:facturas.size,consumo:facturas.size&&[...facturas.values()].every(x=>x!=null)?Math.round([...facturas.values()].reduce((s,x)=>s+Number(x),0)*100)/100:null};
 const enviados=filas.filter(x=>x.enviado);resumen.conversion=enviados.length?Math.round(enviados.filter(x=>x.usos_promocion.some(u=>Date.parse(u.fecha)>=Date.parse(x.fecha_envio))).length/enviados.length*1000)/10:null;
 return {promocion:{id:p.id,clave:p.clave,nombre:p.nombre,desde:p.desde,hasta:p.hasta},comunicaciones,filtros:f,locales:[...new Set([...base.locales,...usos.map(u=>u.local)])].sort(),filas,resumen,actualizado_en:new Date().toISOString()};
}
