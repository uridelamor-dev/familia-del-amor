import {randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {fechaValida} from './alta-administrativa.js';
export const IDENTIDAD_SCHEMA=`CREATE TABLE IF NOT EXISTS rrhh_identidad_adjuntos (
 id UUID PRIMARY KEY, autor_id INTEGER NOT NULL, cara TEXT NOT NULL, mime TEXT NOT NULL,
 contenido BYTEA NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), worker_id INTEGER
);`;
export function tipoIdentidad(b){
 if(b?.subarray(0,3).equals(Buffer.from([255,216,255])))return 'image/jpeg';
 if(b?.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b?.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 return null;
}
export function idsIdentidad(value){
 if(!value)return [];
 const ids=typeof value==='string'?JSON.parse(value):value;
 if(!Array.isArray(ids)||ids.length>2||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))||new Set(ids).size!==ids.length)throw Error('Revisa los adjuntos del DNI.');
 return ids;
}
export function limpiarLectura(d,hoy=new Date().toISOString().slice(0,10)){
 const nombre=typeof d.nombre==='string'?d.nombre.trim().slice(0,160):'';
 const dni=String(d.dni||'').replace(/[\s-]/g,'').toUpperCase();
 const n=dni.replace(/^[XYZ]/,c=>({X:'0',Y:'1',Z:'2'}[c]));
 const valido=/^\d{8}[A-Z]$/.test(n)&&'TRWAGMYFPDXBNJZSQVHLCKE'[Number(n.slice(0,8))%23]===n.at(-1);
 return {nombre,dni:valido?dni:'',fecha_nac:fechaValida(String(d.fecha_nac||''))&&d.fecha_nac<hoy?d.fecha_nac:''};
}
export async function adjuntarIdentidad(client,valor,autor,worker){
 const ids=idsIdentidad(valor);if(!ids.length)return;
 if(!['direccion','rrhh'].includes(autor.rol))throw Error('Solo RR. HH. puede adjuntar documentos de identidad.');
 for(const id of ids){
  const {rows:[r]}=await client.query('SELECT id,cara,worker_id FROM rrhh_identidad_adjuntos WHERE id=$1 AND autor_id=$2 FOR UPDATE',[id,autor.id]);
  if(!r||(r.worker_id&&String(r.worker_id)!==String(worker)))throw Error('Un adjunto no está disponible. Vuelve a subirlo.');
  if(r.worker_id)continue;
  await client.query('UPDATE rrhh_identidad_adjuntos SET worker_id=$1 WHERE id=$2',[worker,id]);
  await client.query("INSERT INTO hr_documentos(worker_id,tipo,nombre,url,sensible,autor,creado_en) VALUES($1,'dni',$2,$3,1,$4,$5)",[worker,`DNI · ${r.cara==='frontal'?'Parte delantera':'Parte trasera'}`,`dni:${id}`,autor.username,new Date().toISOString()]);
 }
}
export function registrarIdentidad(app,{auth,pool,subir,leer,disponible=()=>true}){
 const lecturas=new Map();
 const seguro=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch{res.status(400).json({ok:false,error:'No se pudo completar la lectura o guardar el adjunto. Comprueba el archivo o rellena los datos manualmente.'});}};
 app.post('/api/rrhh/identidad/adjunto',auth,(req,res,next)=>subir.single('archivo')(req,res,e=>e?res.status(400).json({ok:false,error:'Elige una imagen o PDF de hasta 5 MB.'}):next()),seguro(async(req,res)=>{
  const mime=tipoIdentidad(req.file?.buffer),cara=req.body.cara;
  if(!mime||!['frontal','trasera'].includes(cara))throw Error('Archivo no válido');
  if(mime==='application/pdf'){const pdf=await PDFDocument.load(req.file.buffer);if(pdf.getPageCount()<1||pdf.getPageCount()>2)return res.status(400).json({ok:false,error:'El PDF del DNI debe tener una o dos páginas, sin contraseña.'});}
  // Borradores abandonados: los documentos vinculados nunca se purgan aquí.
  await pool.query("DELETE FROM rrhh_identidad_adjuntos WHERE worker_id IS NULL AND creado_en<NOW()-INTERVAL '30 days'");
  const {rows:[count]}=await pool.query('SELECT count(*) AS n FROM rrhh_identidad_adjuntos WHERE autor_id=$1 AND worker_id IS NULL',[req.user.id]);
  if(Number(count.n)>=100)return res.status(429).json({ok:false,error:'Hay demasiados adjuntos pendientes. Completa las fichas antes de subir más.'});
  const id=randomUUID();await pool.query('INSERT INTO rrhh_identidad_adjuntos(id,autor_id,cara,mime,contenido) VALUES($1,$2,$3,$4,$5)',[id,req.user.id,cara,mime,req.file.buffer]);
  res.json({ok:true,id});
 }));
 app.post('/api/rrhh/identidad/estado',auth,seguro(async(req,res)=>{
  const ids=idsIdentidad(req.body.documentos_identidad);
  const {rows}=await pool.query('SELECT id,cara FROM rrhh_identidad_adjuntos WHERE id=ANY($1::uuid[]) AND autor_id=$2 AND worker_id IS NULL',[ids,req.user.id]);
  if(rows.length!==ids.length)throw Error('Adjuntos no disponibles');res.json({ok:true,data:rows.map(r=>({id:r.id,cara:r.cara}))});
 }));
 app.post('/api/rrhh/identidad/leer',auth,seguro(async(req,res)=>{
  if(!disponible())return res.status(503).json({ok:false,error:'La lectura automática no está conectada. Configura el servicio de IA en el servidor; puedes conservar el adjunto y rellenar los datos manualmente.'});
  const ahora=Date.now();for(const [k,t] of lecturas)if(ahora-t>60000)lecturas.delete(k);
  if(lecturas.has(req.user.id))return res.status(429).json({ok:false,error:'Espera un minuto antes de repetir la lectura.'});
  const ids=idsIdentidad(req.body.documentos_identidad);if(!ids.length)throw Error('Falta documento');
  const {rows}=await pool.query('SELECT mime,contenido FROM rrhh_identidad_adjuntos WHERE id=ANY($1::uuid[]) AND autor_id=$2 AND worker_id IS NULL',[ids,req.user.id]);
  if(rows.length!==ids.length)throw Error('Documento no disponible');
  lecturas.set(req.user.id,ahora);
  try{res.json({ok:true,datos:limpiarLectura(await leer(rows))});}catch(e){lecturas.delete(req.user.id);throw e;}
 }));
}
