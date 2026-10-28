import {prepararFirma} from './firmas/panel.js';
import {randomUUID,createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {extraerTextoPdf} from '../facturas/pdf-texto.js';
import {limpiarLectura} from './documentos-identidad.js';
export const MASIVOS_SCHEMA=`CREATE TABLE IF NOT EXISTS rrhh_doc_lotes(id UUID PRIMARY KEY,autor_id INTEGER NOT NULL,estado TEXT NOT NULL DEFAULT 'revision',creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS rrhh_doc_paginas(id UUID PRIMARY KEY,lote_id UUID NOT NULL REFERENCES rrhh_doc_lotes(id) ON DELETE CASCADE,archivo TEXT NOT NULL,pagina INTEGER NOT NULL,huella TEXT NOT NULL,contenido BYTEA NOT NULL,propuesta JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS rrhh_doc_archivos(id UUID PRIMARY KEY,worker_id INTEGER NOT NULL,huella TEXT NOT NULL,contenido BYTEA NOT NULL,UNIQUE(worker_id,huella));`;
const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const normal=s=>String(s||'').replace(/M[ªº]/gi,'Maria').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' ');
const nif=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function detectarNomina(texto,archivo=''){
 const lineas=String(texto||'').split('\n'),i=lineas.findIndex(l=>/TRABAJADOR/.test(l));
 // La posición de la cabecera y el nombre puede diferir varios caracteres.
 const fila=i>=0?String(lineas[i+1]||''):'';
 const columna=i>=0?lineas[i].indexOf('TRABAJADOR'):0;
 const bloques=[...fila.matchAll(/\S(?:.*?\S)?(?= {3,}|$)/g)];
 const inicio=bloques.find(b=>b.index>=Math.max(0,columna-5))?.index??columna;
 const nombre=fila.slice(inicio).trim().replace(/\s+/g,' ').slice(0,160);
 const linea=lineas.find(l=>/N\.I\.F/.test(l)),bruto=linea?nif(linea.split('N.I.F')[1]):'';
 const candidato=bruto.match(/(?:[XYZ]\d{7}|\d{8})[A-Z]/)?.[0]||'';
 const dni=limpiarLectura({dni:candidato}).dni;
 const periodo=archivo.match(/(?:NOMIN\w*\s*)(0[1-9]|1[0-2])(20\d{2})/i);
 return {nombre,dni,mes:periodo?`${periodo[2]}-${periodo[1]}`:'',hayTexto:!!texto};
}
export function asociarTrabajador(datos,workers){
 if(datos.dni){const matches=workers.filter(w=>nif(w.dni)===datos.dni);if(matches.length===1)return {worker_id:matches[0].id,motivo:'DNI/NIE coincidente'};if(matches.length>1)return {worker_id:null,motivo:'DNI/NIE duplicado: revisar'};}
 const n=normal(datos.nombre),matches=n?workers.filter(w=>normal(w.nombre)===n):[];
 if(matches.length===1&&(!datos.dni||!matches[0].dni||nif(matches[0].dni)===datos.dni))return {worker_id:matches[0].id,motivo:'Nombre completo coincidente'};
 // Los nombres abreviados de las nóminas son propuestas para revisión,
 // nunca asignaciones automáticas por parecido ni por un nombre de pila único.
 const tokens=n.split(' ').filter(t=>t.length>1);
 const candidatos=workers.filter(w=>{
  if(datos.dni&&w.dni&&nif(w.dni)!==datos.dni)return false;
  const otros=normal(w.nombre).split(' ').filter(t=>t.length>1);
  return tokens.length>=2&&otros.filter(t=>tokens.includes(t)).length>=2;
 }).map(w=>w.id);
 return {worker_id:null,candidatos,motivo:matches.length>1?'Varios trabajadores con el mismo nombre: revisar':candidatos.length?'Posible coincidencia: selecciona y confirma al trabajador':datos.hayTexto?'Sin coincidencia segura: comprueba el nombre completo y el DNI de la ficha':'Sin texto legible: asociar manualmente'};
}
export function nombreDocumento(mes,nombre){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(mes))throw Error('Selecciona el mes y año de los documentos.');
 const n=String(nombre||'').replace(/[\\/<>:"|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
 if(!n)throw Error('Falta el nombre del trabajador.');return `${meses[Number(mes.slice(5))-1]} ${mes.slice(0,4)} - ${n}.pdf`;
}
export function validarReparto(documentos,paginas,workers){
 if(!Array.isArray(documentos)||!documentos.length||documentos.length>150)throw Error('No hay documentos para guardar.');
 const usados=new Set(),map=new Map(paginas.map(p=>[p.id,p]));
 return documentos.map(d=>{
  if(!Array.isArray(d.paginas)||!d.paginas.length)throw Error('Revisa las páginas del documento.');
  const ps=d.paginas.map(id=>{if(!map.has(id)||usados.has(id))throw Error('Hay páginas repetidas o ajenas a este lote.');usados.add(id);return map.get(id);});
  const w=workers.find(w=>Number(w.id)===Number(d.worker_id));if(!w)throw Error('Selecciona un trabajador válido para cada documento.');
  if(!['nomina','contrato','dni','manipulador','otro'].includes(d.tipo))throw Error('Selecciona el tipo de documento.');
  const nombre=String(d.nombre||'').trim();if(!nombre||nombre.length>220||/[\\/\x00-\x1f]/.test(nombre)||!nombre.toLowerCase().endsWith('.pdf'))throw Error('Revisa el nombre del archivo PDF.');
  return {paginas:ps,worker:w,tipo:d.tipo,nombre,firma:d.firma||null};
 });
}
export function registrarDocumentosMasivos(app,{auth,pool,upload,trabajadores}){
 const safe=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){res.status(400).json({ok:false,error:e.publico?e.message:'No se pudo procesar el lote. Revisa los archivos o vuelve a intentarlo.'});}};
 const fallo=msg=>Object.assign(new Error(msg),{publico:true});
 app.post('/api/rrhh/documentos-masivos',auth,(req,res,next)=>upload.array('archivos',10)(req,res,e=>e?res.status(400).json({ok:false,error:'Sube hasta 10 PDF de 15 MB como máximo cada uno.'}):next()),safe(async(req,res)=>{
  const files=req.files||[];if(!files.length||files.reduce((n,f)=>n+f.size,0)>50*1024*1024)throw fallo('Sube PDF con un tamaño total de hasta 50 MB.');
  const workers=await trabajadores(req),id=randomUUID(),paginas=[];
  for(const f of files){
   if(f.buffer.subarray(0,5).toString()!=='%PDF-')throw fallo('Solo se admiten PDF.');
   let pdf;try{pdf=await PDFDocument.load(f.buffer);}catch{throw fallo('Hay un PDF dañado o protegido con contraseña.');}
   if(pdf.getPageCount()+paginas.length>150)throw fallo('Cada lote admite hasta 150 páginas.');
   const nombre=String(f.originalname).replace(/[\\/\x00-\x1f]/g,' ').slice(0,200);
   for(let n=0;n<pdf.getPageCount();n++){
    const out=await PDFDocument.create(),[page]=await out.copyPages(pdf,[n]);out.addPage(page);const contenido=Buffer.from(await out.save());
    const texto=extraerTextoPdf(contenido,{maxPaginas:1,maxChars:20000}).texto;
    const d=detectarNomina(texto,nombre),asociacion=asociarTrabajador(d,workers);
    // El DNI se usa para comparar, pero no se guarda en la propuesta ni se expone al navegador.
    paginas.push({id:randomUUID(),archivo:nombre,pagina:n+1,huella:createHash('sha256').update(f.buffer).update(':'+n).digest('hex'),contenido,propuesta:{nombre_detectado:d.nombre,mes:d.mes,...asociacion}});
   }
  }
  const c=await pool.connect();try{await c.query('BEGIN');
   await c.query("DELETE FROM rrhh_doc_lotes WHERE autor_id=$1 AND creado_en<NOW()-INTERVAL '7 days'",[req.user.id]);
   const {rows:[count]}=await c.query("SELECT COUNT(*)::int AS n FROM rrhh_doc_lotes WHERE autor_id=$1 AND estado='revision'",[req.user.id]);
   if(count.n>=10)throw fallo('Hay 10 lotes pendientes. Guarda o descarta alguno antes de subir más.');
   await c.query('INSERT INTO rrhh_doc_lotes(id,autor_id) VALUES($1,$2)',[id,req.user.id]);
   for(const p of paginas)await c.query('INSERT INTO rrhh_doc_paginas(id,lote_id,archivo,pagina,huella,contenido,propuesta) VALUES($1,$2,$3,$4,$5,$6,$7)',[p.id,id,p.archivo,p.pagina,p.huella,p.contenido,JSON.stringify(p.propuesta)]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  res.json({ok:true,id,paginas:paginas.map(({contenido,...p})=>p),trabajadores:workers.map(({id,nombre,local})=>({id,nombre,local}))});
 }));
 app.get('/api/rrhh/documentos-masivos',auth,safe(async(req,res)=>{const {rows}=await pool.query("SELECT id,creado_en FROM rrhh_doc_lotes WHERE autor_id=$1 AND estado='revision' AND creado_en>NOW()-INTERVAL '7 days' ORDER BY creado_en DESC",[req.user.id]);res.json({ok:true,data:rows});}));
 app.get('/api/rrhh/documentos-masivos/:id',auth,safe(async(req,res)=>{
  const {rows}=await pool.query("SELECT p.id,p.archivo,p.pagina,p.propuesta,p.contenido FROM rrhh_doc_paginas p JOIN rrhh_doc_lotes l ON l.id=p.lote_id WHERE l.id=$1 AND l.autor_id=$2 AND l.estado='revision' AND l.creado_en>NOW()-INTERVAL '7 days' ORDER BY p.archivo,p.pagina",[req.params.id,req.user.id]);
  if(!rows.length)throw fallo('Lote no disponible.');const workers=await trabajadores(req);res.json({ok:true,id:req.params.id,paginas:rows.map(({contenido,...p})=>{const d=detectarNomina(extraerTextoPdf(contenido,{maxPaginas:1,maxChars:20000}).texto,p.archivo);return {...p,propuesta:{nombre_detectado:d.nombre,mes:d.mes,...asociarTrabajador(d,workers)}};}),trabajadores:workers.map(({id,nombre,local})=>({id,nombre,local}))});
 }));
 app.get('/api/rrhh/documentos-masivos/:id/pagina/:pagina',auth,safe(async(req,res)=>{
  const {rows:[p]}=await pool.query("SELECT p.contenido FROM rrhh_doc_paginas p JOIN rrhh_doc_lotes l ON l.id=p.lote_id WHERE l.id=$1 AND l.autor_id=$2 AND p.id=$3 AND l.estado='revision' AND l.creado_en>NOW()-INTERVAL '7 days'",[req.params.id,req.user.id,req.params.pagina]);
  if(!p)return res.sendStatus(404);res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="revision.pdf"','X-Content-Type-Options':'nosniff'});res.send(p.contenido);
 }));
 app.post('/api/rrhh/documentos-masivos/:id/guardar',auth,safe(async(req,res)=>{
  const c=await pool.connect();try{await c.query('BEGIN');
   const {rows:[l]}=await c.query("SELECT * FROM rrhh_doc_lotes WHERE id=$1 AND autor_id=$2 AND creado_en>NOW()-INTERVAL '7 days' FOR UPDATE",[req.params.id,req.user.id]);
   if(!l)throw fallo('Lote no disponible.');if(l.estado==='guardado'){await c.query('COMMIT');return res.json({ok:true,repetido:true});}
   const {rows:paginas}=await c.query('SELECT * FROM rrhh_doc_paginas WHERE lote_id=$1',[l.id]);
   let docs;try{docs=validarReparto(req.body.documentos,paginas,await trabajadores(req));}catch(e){throw fallo(e.message);}
   let guardados=0,duplicados=0;
   for(const d of docs){
    const out=await PDFDocument.create();for(const p of d.paginas){const src=await PDFDocument.load(p.contenido);const [page]=await out.copyPages(src,[0]);out.addPage(page);}
    const contenido=Buffer.from(await out.save()),huella=createHash('sha256').update(d.paginas.map(p=>p.huella).join(':')).digest('hex'),fileId=randomUUID();
    const {rows}=await c.query('INSERT INTO rrhh_doc_archivos(id,worker_id,huella,contenido) VALUES($1,$2,$3,$4) ON CONFLICT(worker_id,huella) DO NOTHING RETURNING id',[fileId,d.worker.id,huella,contenido]);
    if(!rows.length){duplicados++;continue;}
    const {rows:[documento]}=await c.query("INSERT INTO hr_documentos(worker_id,tipo,nombre,url,sensible,autor,creado_en) VALUES($1,$2,$3,$4,1,$5,$6) RETURNING id,worker_id,nombre",[d.worker.id,d.tipo,d.nombre,'lote:'+fileId,req.user.username,new Date().toISOString()]);
    if(d.firma){try{await prepararFirma({documento,bytes:contenido,posicion:d.firma,autor:req.user.id},c.query.bind(c));}catch(e){throw fallo(e.message);}}
    guardados++;
   }
   const usadas=docs.flatMap(d=>d.paginas.map(p=>p.id)),pendientes=paginas.length-usadas.length;
   await c.query('DELETE FROM rrhh_doc_paginas WHERE lote_id=$1 AND id=ANY($2::uuid[])',[l.id,usadas]);
   if(!pendientes)await c.query("UPDATE rrhh_doc_lotes SET estado='guardado' WHERE id=$1",[l.id]);
   await c.query('COMMIT');res.json({ok:true,guardados,duplicados,pendientes});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 app.post('/api/rrhh/documentos-masivos/:id/descartar',auth,safe(async(req,res)=>{await pool.query("DELETE FROM rrhh_doc_lotes WHERE id=$1 AND autor_id=$2 AND estado='revision'",[req.params.id,req.user.id]);res.json({ok:true});}));
}
