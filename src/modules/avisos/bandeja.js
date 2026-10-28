import {DECISIONES_SCHEMA,claveAviso,versionAviso,repartirAvisos} from './decisiones.js';
import {modulosEfectivos} from '../usuarios/permisos.js';
export const AVISOS_SCHEMA=`CREATE TABLE IF NOT EXISTS panel_avisos_historial (
 ambito TEXT NOT NULL,fuente TEXT NOT NULL,id TEXT NOT NULL,
 primera TIMESTAMPTZ NOT NULL,ultima TIMESTAMPTZ NOT NULL,resuelta TIMESTAMPTZ,
 PRIMARY KEY(ambito,fuente,id));`+DECISIONES_SCHEMA;
export const PLAZOS_AVISOS={imp:3,info:14};
export const FUENTES_AVISOS={
 rrhh:{departamento:'RR. HH.',view:'rrhh',roles:['rrhh','encargado']},
 candidaturas:{departamento:'RR. HH.',view:'contratacion',roles:['rrhh']},
 facturas:{departamento:'Contabilidad',view:'facturas',roles:['contabilidad']},
 pendientes:{departamento:'Contabilidad',view:'facturas',roles:['contabilidad']},
 mantenimiento:{departamento:'Operación',view:'mantenimiento',roles:['encargado']},
 reviews:{departamento:'Marketing',view:'reviews',roles:['marketing']},
 riesgos:{departamento:'Dirección',view:'dashboard',roles:[]},
 whatsapp:{departamento:'Atención al cliente',view:'whatsapp',roles:['encargado']},
};
export function fuentesDeUsuario(user){
 const mods=modulosEfectivos(user.rol,user.modulos);
 return Object.keys(FUENTES_AVISOS).filter(k=>mods.includes(FUENTES_AVISOS[k].view)&&(user.rol==='direccion'||FUENTES_AVISOS[k].roles.includes(user.rol)));
}
export function seleccionarAvisos(items,user,ahora=Date.now()){
 const fuentes=new Set(fuentesDeUsuario(user));
 const privados=new Set(['dni','direccion','iban','tipo_jornada','tipo_contrato','talla_camiseta','talla_sudadera']);
 let seleccion=items.filter(a=>fuentes.has(a.fuente)&&!(user.rol==='encargado'&&privados.has(a.campo))).map(a=>{
  const dias=Math.max(0,Math.floor((ahora-Date.parse(a.primera))/86400000))||0;
  return {...a,dias,escalado:user.rol==='direccion'&&a.sev!=='crit'};
 });
 if(user.rol==='direccion'){
  seleccion=seleccion.filter(a=>a.sev==='crit'||a.dias>=(PLAZOS_AVISOS[a.sev]??14)).sort((a,b)=>a.id.localeCompare(b.id));
  const personas=new Map();
  seleccion=seleccion.filter(a=>{
   if(a.fuente!=='rrhh')return true;
   const key=String(a.worker_id),prev=personas.get(key);
   if(prev){prev.campos.push(a.campo);prev.dias=Math.max(prev.dias,a.dias);return false;}
   a.campos=[a.campo];personas.set(key,a);return true;
  }).map(a=>a.campos?{...a,titulo:`${a.nombre}: ${a.campos.length} ${a.campos.length===1?'dato pendiente':'datos pendientes'}`} :a);
 }
 return seleccion.sort((a,b)=>({crit:0,imp:1,info:2}[a.sev]??2)-({crit:0,imp:1,info:2}[b.sev]??2)||b.dias-a.dias||a.id.localeCompare(b.id));
}

// Cada ámbito mantiene su foto completa: una lectura de un local no resuelve los de otro.
// El bloqueo evita que dos pestañas guarden fotos fuera de orden.
export async function sincronizarFuente(client,{fuente,ambito,cargar,ahora=Date.now()}){
 const q=(s,p=[])=>client.query(s,p);
 await q('BEGIN');
 try{
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',['panel-avisos:'+fuente+':'+ambito]);
  const items=await cargar();
  const fecha=new Date(ahora).toISOString();
  const registros=items.map(a=>({id:a.id,primera:Math.min(ahora,Date.parse(a.desde)||ahora)}));
  const rows=(await q(`INSERT INTO panel_avisos_historial(ambito,fuente,id,primera,ultima)
   SELECT $1,$2,r.id,to_timestamp(r.primera/1000.0),$4::timestamptz
   FROM jsonb_to_recordset($3::jsonb) AS r(id TEXT,primera DOUBLE PRECISION)
   ON CONFLICT(ambito,fuente,id) DO UPDATE SET
    primera=CASE WHEN panel_avisos_historial.resuelta IS NOT NULL THEN excluded.ultima ELSE panel_avisos_historial.primera END,
    ultima=excluded.ultima,resuelta=NULL RETURNING id,primera`,[ambito,fuente,JSON.stringify(registros),fecha])).rows;
  await q('UPDATE panel_avisos_historial SET resuelta=$3 WHERE ambito=$1 AND fuente=$2 AND resuelta IS NULL AND NOT(id=ANY($4::text[]))',[ambito,fuente,fecha,items.map(a=>a.id)]);
  await q('COMMIT');
  const fechas=new Map(rows.map(r=>[r.id,r.primera]));
  return items.map(a=>({...FUENTES_AVISOS[fuente],...a,fuente,primera:fechas.get(a.id)}));
 }catch(e){await q('ROLLBACK');throw e;}
}

export function registrarBandeja(app,{auth,pool,cargar,ambito}){
 app.get('/api/panel/avisos',auth,async(req,res)=>{
  res.set('Cache-Control','no-store');
  const fuentes=fuentesDeUsuario(req.user),items=[],fallidas=[];
  try{
   for(const fuente of fuentes){
    const client=await pool.connect();
    try{items.push(...await sincronizarFuente(client,{fuente,ambito:ambito(req,fuente),cargar:()=>cargar(client,req,fuente)}));}
    catch{fallidas.push(fuente);}
    finally{client.release();}
   }
   const client=await pool.connect();
   let decisiones;
   try{decisiones=(await client.query('SELECT * FROM panel_avisos_decisiones WHERE usuario=$1',[String(req.user.id??req.user.username)])).rows;}finally{client.release();}
   const {data,ocultos}=repartirAvisos(seleccionarAvisos(items,req.user),decisiones);
   res.json({ok:true,data,ocultos,total:data.length,fallidas,plazos:PLAZOS_AVISOS});
  }catch(e){res.status(500).json({error:'No se pudieron actualizar los avisos. Inténtalo de nuevo.'});}
 });
 app.post('/api/panel/avisos/decision',auth,async(req,res)=>{
  const {fuente,clave,version,accion,motivo='',hasta}=req.body||{};
  if(!fuentesDeUsuario(req.user).includes(fuente))return res.status(403).json({ok:false,error:'Sin acceso a este aviso'});
  if(typeof clave!=='string'||clave.length>500||!['descartar','posponer','restaurar'].includes(accion)||typeof motivo!=='string'||motivo.length>500)return res.status(400).json({ok:false,error:'Decisión no válida'});
  if(accion==='posponer'&&(!Number.isFinite(Date.parse(hasta))||Date.parse(hasta)<=Date.now()))return res.status(400).json({ok:false,error:'Elige una fecha futura'});
  let client;
  try{
   client=await pool.connect();
   const usuario=String(req.user.id??req.user.username);
   const items=await sincronizarFuente(client,{fuente,ambito:ambito(req,fuente),cargar:()=>cargar(client,req,fuente)});
   const aviso=seleccionarAvisos(items,req.user).find(a=>claveAviso(a)===clave);
   if(!aviso||versionAviso(aviso)!==version)return res.status(409).json({ok:false,error:'El aviso ha cambiado o ya se ha resuelto. Actualiza la campana.'});
   if(accion==='restaurar')await client.query('DELETE FROM panel_avisos_decisiones WHERE usuario=$1 AND fuente=$2 AND id=$3',[usuario,fuente,clave]);
   else await client.query(`INSERT INTO panel_avisos_decisiones(usuario,fuente,id,version,accion,motivo,hasta)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(usuario,fuente,id) DO UPDATE SET
    version=excluded.version,accion=excluded.accion,motivo=excluded.motivo,hasta=excluded.hasta,actualizado=NOW()`,[usuario,fuente,clave,version,accion,motivo.trim(),accion==='posponer'?new Date(hasta).toISOString():null]);
   res.json({ok:true});
  }catch{res.status(500).json({ok:false,error:'No se pudo guardar la decisión. Inténtalo de nuevo.'});}
  finally{client?.release();}
 });

}
