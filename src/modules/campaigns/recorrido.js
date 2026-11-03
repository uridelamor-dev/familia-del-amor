import {randomUUID} from 'node:crypto';
// Hechos posteriores a una comunicación, no atribución causal ni reservas = visitas.
export const OBJETIVOS = ['visitas','club','descuentos','regalos','resenas','puntos','reactivacion','otro'];
export const RECORRIDO_SCHEMA = `CREATE TABLE IF NOT EXISTS campana_analisis (
 origen TEXT NOT NULL, envio_id TEXT NOT NULL, objetivo TEXT NOT NULL DEFAULT 'visitas',
 actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(origen,envio_id)
); CREATE TABLE IF NOT EXISTS campana_recorrido_resenas (
 review_id TEXT PRIMARY KEY, telefono TEXT NOT NULL, evidencia TEXT NOT NULL, autor INTEGER NOT NULL, revocado_en TIMESTAMPTZ, revocado_por INTEGER, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
); CREATE TABLE IF NOT EXISTS campana_seguimientos (
 id UUID PRIMARY KEY, origen TEXT NOT NULL, envio_id TEXT NOT NULL, autor INTEGER NOT NULL,
 filtros JSONB NOT NULL, personas JSONB NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
export function telefono(v) {
 let t=String(v||'').replace(/\D/g,'').replace(/^00/,'');
 if (/^[6789]\d{8}$/.test(t))t='34'+t;
 return /^\d{10,15}$/.test(t)?t:'';
}
const sqlTel = c => `(CASE WHEN length(regexp_replace(${c},'[^0-9]','','g'))=9 THEN '34'||regexp_replace(${c},'[^0-9]','','g') ELSE regexp_replace(regexp_replace(${c},'[^0-9]','','g'),'^00','') END)`;
const fecha = v => {const t=Date.parse(v);return Number.isFinite(t)?t:null;};
export function dia(v) {const t=fecha(v);return t==null?'':new Date(t).toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'});}
export function validarFiltros(q={},hoy=dia(new Date().toISOString())) {
 const f={desde:String(q.desde||''),hasta:String(q.hasta||hoy),local:String(q.local||''),grupo:String(q.grupo||'todos'),q:String(q.q||'').slice(0,150)};
 for(const k of ['desde','hasta'])if(f[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(f[k])||new Date(f[k]+'T12:00:00Z').toISOString().slice(0,10)!==f[k]))throw Error('Fecha no válida');
 if(f.desde&&f.desde>f.hasta)throw Error('El inicio debe ser anterior al final');
 if(!['todos','con_tarjeta','alta_posterior','visita','sin_visita','repite','canje','resena','puntos','sin_identificar'].includes(f.grupo))throw Error('Filtro no válido');
 if(f.local.length>160)throw Error('Local no válido');
 return f;
}
export async function cargarFuente({all,get},origen,id,usuario) {
 let c,envios;
 if(origen==='permiso'&&usuario.rol!=='direccion'&&Array.isArray(usuario.modulos)&&usuario.modulos.length&&!usuario.modulos.includes('promos'))return null;
 if(!['campana','correo','permiso'].includes(origen))throw Error('Origen no válido');
 if(origen==='correo') {
 if(!/^[a-f0-9-]{36}$/i.test(id))return null;
 c=await get('SELECT * FROM correo_envios WHERE id=? AND autor=?',[id,usuario.id]);
 if(c){const ds=typeof c.destinatarios==='string'?JSON.parse(c.destinatarios):c.destinatarios;
 envios=(ds||[]).map(e=>({...e,estado:c.estado==='enviado'?'aceptado_proveedor':c.estado,enviado_en:c.estado==='enviado'?c.actualizado_en:null}));c.nombre=c.asunto;}
 } else {
 if(!/^\d+$/.test(id))return null;
 c=await get(`SELECT * FROM ${origen==='campana'?'campanas_wa':'fid_comunicaciones'} WHERE id=?`,[id]);
 if(c)envios=await all(origen==='campana'?'SELECT nombre,telefono,correo,estado,enviado_en FROM campana_envios WHERE campana_id=? ORDER BY id':`SELECT e.telefono,e.estado,COALESCE(q.enviado_en,e.actualizado_en) AS enviado_en FROM fid_comunicacion_envios e LEFT JOIN cap_cola q ON q.id=e.cola_id WHERE e.comunicacion_id=? ORDER BY e.id`,[id]);
 }
 return c?{campana:{id:String(c.id),origen,nombre:c.nombre,creado_en:c.creado_en,canal:origen==='correo'?'email':'whatsapp'},envios}:null;
}
export function resolverIdentidades(envios,leads=[]) {
 const emails=new Map();
 for(const l of leads){const e=String(l.correo||'').trim().toLowerCase(),t=telefono(l.telefono);if(!e||!t)continue;if(!emails.has(e))emails.set(e,new Set());emails.get(e).add(t);}
 const map=new Map();
 for(const e of envios){const mail=String(e.correo||'').trim().toLowerCase(),matches=emails.get(mail),direct=telefono(e.telefono),tel=direct||(matches?.size===1?[...matches][0]:'');
 const key=tel||mail||'fila-'+map.size;const enviado=['enviado','entregado','aceptado_proveedor'].includes(e.estado)&&fecha(e.enviado_en)!=null;
 const anterior=map.get(key);const x={id:key,nombre:e.nombre||'',telefono:tel,correo:mail,identidad:direct?'telefono':tel?'email_actual':'sin_identificar',enviado,estado:e.estado,fecha_envio:enviado?e.enviado_en:null};
 if(!anterior||(!anterior.enviado&&enviado)||(enviado&&anterior.enviado&&fecha(e.enviado_en)<fecha(anterior.fecha_envio)))map.set(key,x);
 }
 return [...map.values()];
}
export function analizarRecorrido(personas,tarjetas,eventos,filtros={}) {
 const f=validarFiltros(filtros);const cards=new Map(),events=new Map();
 for(const c of tarjetas){const t=telefono(c.telefono);if(!cards.has(t))cards.set(t,[]);cards.get(t).push(c);}
 for(const e of eventos){const t=telefono(e.telefono);if(!events.has(t))events.set(t,[]);events.get(t).push(e);}
 const locales=[...new Set(eventos.map(e=>e.local).filter(Boolean))].sort();
 let filas=personas.filter(p=>!p.enviado||dia(p.fecha_envio)<=f.hasta).map(p=>{
 const envio=fecha(p.fecha_envio);const cs=cards.get(p.telefono)||[];
 const primera=cs.map(c=>c.creado_en).filter(v=>fecha(v)!=null&&dia(v)<=f.hasta).sort((a,b)=>fecha(a)-fecha(b))[0];
 const ev=p.enviado?(events.get(p.telefono)||[]).filter(e=>fecha(e.fecha)!=null&&fecha(e.fecha)>=envio&&(!f.desde||dia(e.fecha)>=f.desde)&&dia(e.fecha)<=f.hasta&&(!f.local||e.local===f.local)):[];
 const visitas=new Set(ev.filter(e=>e.tipo==='visita'||e.tipo==='canje').map(e=>e.local+'|'+dia(e.fecha)));
 const consumo=ev.filter(e=>e.tipo==='consumo'||e.tipo==='devolucion');
 const alta=primera&&p.enviado&&fecha(primera)>envio&&(!f.desde||dia(primera)>=f.desde)&&dia(primera)<=f.hasta;
 return {...p,tarjeta:primera?(envio==null?'existente':fecha(primera)<=envio?'previa':'posterior'):'sin_registro',fecha_tarjeta:primera||null,alta_periodo:!!alta,visitas:visitas.size,canjes:ev.filter(e=>e.tipo==='canje').length,consumo:consumo.length?Math.round(consumo.reduce((s,e)=>s+Number(e.tipo==='devolucion'?-Math.abs(e.importe):e.importe||0),0)*100)/100:null,puntos:ev.filter(e=>e.tipo==='puntos').reduce((s,e)=>s+Number(e.unidades||0),0),eventos:ev.sort((a,b)=>fecha(a.fecha)-fecha(b.fecha))};
 });
 const coincide=p=>({todos:true,con_tarjeta:p.tarjeta!=='sin_registro',alta_posterior:p.alta_periodo,visita:p.visitas>0,sin_visita:p.enviado&&!!p.telefono&&!p.visitas,repite:p.visitas>1,canje:p.canjes>0,resena:p.eventos.some(e=>e.tipo==='resena'),puntos:p.eventos.some(e=>e.tipo==='puntos'),sin_identificar:!p.telefono})[f.grupo];
 filas=filas.filter(p=>coincide(p)&&(!f.q||[p.nombre,p.telefono,p.correo].join(' ').toLowerCase().includes(f.q.toLowerCase())));
 const enviados=filas.filter(p=>p.enviado),visitantes=enviados.filter(p=>p.visitas>0),importes=filas.filter(p=>p.consumo!==null);
 const serie=new Map();for(const p of filas)for(const e of p.eventos){const d=dia(e.fecha);if(!serie.has(d))serie.set(d,{fecha:d,personas:new Set(),consumo:null});const x=serie.get(d);if(['visita','canje'].includes(e.tipo))x.personas.add(p.id);if(['consumo','devolucion'].includes(e.tipo))x.consumo=(x.consumo||0)+Number(e.tipo==='devolucion'?-Math.abs(e.importe):e.importe||0);}
 return {filtros:f,locales,filas,resumen:{personas:filas.length,enviados:enviados.length,identificados:enviados.filter(p=>p.telefono).length,tarjeta:filas.filter(p=>p.tarjeta!=='sin_registro').length,altas:filas.filter(p=>p.alta_periodo).length,visitantes:visitantes.length,repetidores:filas.filter(p=>p.visitas>1).length,canjes:filas.reduce((s,p)=>s+p.canjes,0),consumo:importes.length?Math.round(importes.reduce((s,p)=>s+p.consumo,0)*100)/100:null,conversion:enviados.length?Math.round(visitantes.length/enviados.length*1000)/10:null,resenas:filas.filter(p=>p.eventos.some(e=>e.tipo==='resena')).length},serie:[...serie.values()].sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(x=>({...x,personas:x.personas.size,consumo:x.consumo==null?null:Math.round(x.consumo*100)/100}))};
}
export async function obtenerRecorrido(db,origen,id,usuario,filtros={}) {
 const fuente=await cargarFuente(db,origen,id,usuario);if(!fuente)return null;
 const mails=[...new Set(fuente.envios.map(e=>String(e.correo||'').trim().toLowerCase()).filter(Boolean))];
 const leads=mails.length?await db.all('SELECT correo,telefono FROM leads WHERE lower(trim(correo))=ANY(?)',[mails]):[];
 const personas=resolverIdentidades(fuente.envios,leads),tels=[...new Set(personas.map(p=>p.telefono).filter(Boolean))];
 const config=await db.get('SELECT objetivo FROM campana_analisis WHERE origen=? AND envio_id=?',[origen,id]);
 let tarjetas=[],eventos=[];
 if(tels.length){
 tarjetas=await db.all(`SELECT id,telefono,creado_en FROM pro_qr WHERE clase='carnet' AND ${sqlTel('telefono')}=ANY(?)`,[tels]);
 eventos=await db.all(`SELECT 'canje' AS tipo,k.id::text AS id,k.telefono,k.canjeado_en AS fecha,k.local,0::numeric AS importe,0 AS unidades FROM pro_canjes k WHERE ${sqlTel('k.telefono')}=ANY(?) UNION ALL SELECT m.concepto AS tipo,m.id::text AS id,q.telefono,m.creado_en AS fecha,m.local,m.importe,m.unidades FROM fid_movimientos m JOIN pro_qr q ON q.id=m.qr_id LEFT JOIN fid_facturas ff ON ff.id=m.factura_id WHERE COALESCE(ff.es_prueba,FALSE)=FALSE AND ${sqlTel('q.telefono')}=ANY(?) AND m.concepto IN ('visita','consumo','devolucion','puntos')`,[tels,tels]);
 const resenas=await db.all(`SELECT 'resena' AS tipo,r.id,r.fecha,r.location_name AS local,v.telefono,0 AS importe,0 AS unidades FROM campana_recorrido_resenas v JOIN google_reviews r ON r.id=v.review_id WHERE v.revocado_en IS NULL AND v.telefono=ANY(?)`,[tels]);
 eventos.push(...resenas);
 }
 const f=validarFiltros(filtros);if(!f.desde)f.desde=personas.filter(p=>p.enviado).map(p=>dia(p.fecha_envio)).sort()[0]||dia(fuente.campana.creado_en)||f.hasta;
 return {...analizarRecorrido(personas,tarjetas,eventos,f),campana:fuente.campana,objetivo:config?.objetivo||'visitas',actualizado_en:new Date().toISOString()};
}

export async function prepararSeguimiento(db,origen,id,usuario,filtros) {
 const d=await obtenerRecorrido(db,origen,id,usuario,filtros);if(!d)throw Error('Envío no encontrado');
 const personas=d.filas.filter(p=>p.enviado&&p.telefono).map(p=>p.telefono);if(!personas.length)throw Error('No hay personas identificadas para preparar el seguimiento');
 const ref=randomUUID();
 await db.run('INSERT INTO campana_seguimientos(id,origen,envio_id,autor,filtros,personas) VALUES (?,?,?,?,?,?)',[ref,origen,id,usuario.id,JSON.stringify(d.filtros),JSON.stringify(personas)]);
 const c=await db.run(`INSERT INTO campanas_wa(nombre,mensaje,segmento_json,canal,estado,total_enviados) VALUES (?,?,?,'whatsapp','borrador',0) RETURNING id`,['Seguimiento · '+d.campana.nombre,'Hola {nombre}, ¿qué tal? Nos encantará volver a verte en Familia del Amor.',JSON.stringify({seguimiento_id:ref,excluir_baja:1,soloOptIn:true})]);
 return {id:c.id,personas:personas.length};
}
export async function destinatariosSeguimiento(db,ref) {
 if(!/^[a-f0-9-]{36}$/i.test(ref))throw Error('Seguimiento no válido');
 const s=await db.get('SELECT * FROM campana_seguimientos WHERE id=?',[ref]);if(!s)throw Error('Seguimiento no encontrado');
 const leer=v=>typeof v==='string'?JSON.parse(v):v;
 const f=leer(s.filtros);const d=await obtenerRecorrido(db,s.origen,s.envio_id,{id:s.autor},{...f,hasta:dia(new Date().toISOString())});if(!d)throw Error('No se puede comprobar la campaña de origen');
 const originales=new Set(leer(s.personas));return new Set(d.filas.filter(p=>p.enviado&&p.telefono&&originales.has(p.telefono)).map(p=>p.telefono));
}

export async function permisoSeguimiento(db,tel){
 const prefs=await db.all(`SELECT baja,opt_in_wa FROM marketing_prefs WHERE ${sqlTel('telefono')}=?`,[telefono(tel)]);
 return !prefs.some(p=>Number(p.baja)===1||Number(p.opt_in_wa)===0);
}
