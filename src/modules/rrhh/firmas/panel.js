import {createHash} from 'node:crypto';
import {PDFDocument,rgb,StandardFonts} from 'pdf-lib';
export const FIRMAS_PANEL_SCHEMA=`CREATE TABLE IF NOT EXISTS rrhh_firmas_panel (
 id SERIAL PRIMARY KEY,documento_id INTEGER NOT NULL REFERENCES hr_documentos(id) ON DELETE RESTRICT,
 worker_id INTEGER NOT NULL,nombre TEXT NOT NULL,original BYTEA NOT NULL,original_sha256 TEXT NOT NULL,
 posicion JSONB NOT NULL,estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','firmado','cancelado')),
 solicitado_por INTEGER NOT NULL,creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 firmado_en TIMESTAMPTZ,firmado_por INTEGER,firmante_nombre TEXT,consentimiento TEXT,trazos JSONB,
 firmado BYTEA,firmado_sha256 TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS rrhh_firmas_panel_activa ON rrhh_firmas_panel(documento_id) WHERE estado<>'cancelado';`;
export const CONSENTIMIENTO='He revisado este documento y confirmo que quiero firmarlo con la firma que he dibujado.';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export function validarPosicion(p,total){
 if(!p||!Number.isInteger(p.pagina)||p.pagina<1||p.pagina>total||!['x','y','ancho','alto'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]))||p.x<0||p.y<0||p.ancho<.12||p.ancho>.8||p.alto<.04||p.alto>.4||p.x+p.ancho>1.000001||p.y+p.alto>1.000001)throw Error('Marca una zona de firma válida dentro de la página.');
 return {pagina:p.pagina,x:p.x,y:p.y,ancho:p.ancho,alto:p.alto};
}
export function validarTrazos(trazos){
 if(!Array.isArray(trazos)||!trazos.length||trazos.length>100)throw Error('Dibuja tu firma antes de continuar.');
 let total=0,longitud=0;
 const limpio=trazos.map(t=>{if(!Array.isArray(t)||t.length<2)throw Error('La firma está vacía.');total+=t.length;
  return t.map((p,i)=>{if(!Array.isArray(p)||p.length!==2||!p.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))throw Error('La firma no es válida.');if(i)longitud+=Math.hypot(p[0]-t[i-1][0],p[1]-t[i-1][1]);return p;});});
 if(total>2000||total<5||longitud<.15)throw Error('Dibuja una firma completa (máximo 2000 puntos).');return limpio;
}
// Coordenadas visibles de PDF.js (arriba/izquierda) a la caja real del PDF, incluyendo rotación.
export function puntoPdf(page,x,y){const c=page.getCropBox(),r=((page.getRotation().angle%360)+360)%360;
 if(r===90)return {x:c.x+y*c.width,y:c.y+x*c.height};
 if(r===180)return {x:c.x+(1-x)*c.width,y:c.y+y*c.height};
 if(r===270)return {x:c.x+(1-y)*c.width,y:c.y+(1-x)*c.height};
 return {x:c.x+x*c.width,y:c.y+(1-y)*c.height};
}
export async function prepararFirma({documento,bytes,posicion,autor},q){
 if(!Buffer.isBuffer(bytes)||bytes.length>20*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('La firma necesita un PDF de hasta 20 MB.');
 const pdf=await PDFDocument.load(bytes);const p=validarPosicion(posicion,pdf.getPageCount());
 const {rows:[r]}=await q(`INSERT INTO rrhh_firmas_panel(documento_id,worker_id,nombre,original,original_sha256,posicion,solicitado_por) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[documento.id,documento.worker_id,documento.nombre,bytes,sha256(bytes),JSON.stringify(p),autor]);return r;
}
export async function crearPdfFirmado(s,trazos,fecha,nombre){
 if(sha256(s.original)!==s.original_sha256)throw Error('El original no coincide con su huella.');
 const pdf=await PDFDocument.load(s.original),p=validarPosicion(s.posicion,pdf.getPageCount()),page=pdf.getPage(p.pagina-1);
 for(const trazo of validarTrazos(trazos))for(let i=1;i<trazo.length;i++){
  const at=xy=>puntoPdf(page,p.x+xy[0]*p.ancho,p.y+xy[1]*p.alto);
  page.drawLine({start:at(trazo[i-1]),end:at(trazo[i]),thickness:1.2,color:rgb(.08,.15,.22)});
 }
 const audit=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica);
 const safe=t=>String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
 const lines=['Registro de firma en el panel','',`Documento: ${s.nombre}`,`Firmante: ${nombre}`,`Usuario: ${s.worker_id}`,`Solicitud: ${s.id}`,`Fecha UTC: ${fecha.toISOString()}`,'','Huella SHA-256 del original:',s.original_sha256,'',CONSENTIMIENTO,'','Firma manuscrita recogida en la cuenta del trabajador.','El documento original se conserva.'];
 let y=790;for(const line of lines){const txt=safe(line);for(let start=0;start<Math.max(1,txt.length);start+=85){audit.drawText(txt.slice(start,start+85),{x:40,y,size:10,font});y-=18;}}
 return Buffer.from(await pdf.save());
}
export function registrarFirmasPanel(app,{authAdmin,authUser,pool,puedeLocal,leerPdf}){
 const wrap=fn=>async(req,res)=>{res.set('Cache-Control','private, no-store');try{await fn(req,res);}catch(e){res.status(e.status||400).json({ok:false,error:e.code==='23505'?'Este documento ya tiene una solicitud de firma.':e.publico?e.message:'No se pudo completar la operación de firma. Vuelve a intentarlo.'});}};
 const error=(msg,status=400)=>Object.assign(Error(msg),{publico:true,status});
 async function adminDoc(req){const {rows:[d]}=await pool.query('SELECT d.*,u.local FROM hr_documentos d JOIN users u ON u.id=d.worker_id WHERE d.id=$1',[Number(req.params.id)||0]);if(!d||!puedeLocal(req,d.local))throw error('Documento no encontrado.',404);return d;}
 app.get('/api/rrhh/documento/:id/firma-panel',authAdmin,wrap(async(req,res)=>{
  const d=await adminDoc(req),{rows}=await pool.query('SELECT id,estado,creado_en,firmado_en,posicion FROM rrhh_firmas_panel WHERE documento_id=$1 ORDER BY id DESC',[d.id]);res.json({ok:true,solicitudes:rows});
 }));
 app.post('/api/rrhh/documento/:id/firma-panel',authAdmin,wrap(async(req,res)=>{
  const d=await adminDoc(req),bytes=await leerPdf(d),c=await pool.connect();try{await c.query('BEGIN');
   const {rows:[actual]}=await c.query('SELECT url FROM hr_documentos WHERE id=$1 FOR UPDATE',[d.id]);if(!actual||actual.url!==d.url)throw error('El documento ha cambiado. Vuelve a abrirlo.',409);
   let r;try{r=await prepararFirma({documento:d,bytes,posicion:req.body.posicion,autor:req.user.id},c.query.bind(c));}catch(e){if(!e.code)e.publico=true;throw e;}
   await c.query('COMMIT');res.json({ok:true,id:r.id});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 app.post('/api/rrhh/documento/:id/firma-panel/:firma/cancelar',authAdmin,wrap(async(req,res)=>{const d=await adminDoc(req);const r=await pool.query("UPDATE rrhh_firmas_panel SET estado='cancelado' WHERE id=$1 AND documento_id=$2 AND estado='pendiente' RETURNING id",[Number(req.params.firma)||0,d.id]);if(!r.rows.length)throw error('La solicitud ya no está pendiente.',409);res.json({ok:true});}));
 const enviar=(res,bytes,nombre)=>{res.set({'Content-Type':'application/pdf','X-Content-Type-Options':'nosniff','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(nombre||'documento.pdf')});res.send(bytes);};
 app.get('/api/rrhh/documento/:id/firmado',authAdmin,wrap(async(req,res)=>{const d=await adminDoc(req);const {rows:[s]}=await pool.query("SELECT firmado FROM rrhh_firmas_panel WHERE documento_id=$1 AND estado='firmado'",[d.id]);if(!s)throw error('Todavía no está firmado.',404);enviar(res,s.firmado,d.nombre);}));
 app.get('/api/mis-documentos',authUser,wrap(async(req,res)=>{const {rows}=await pool.query("SELECT d.id,d.nombre,COALESCE(s.estado,'disponible') AS estado,d.creado_en,s.firmado_en,s.posicion,d.tipo FROM hr_documentos d LEFT JOIN rrhh_firmas_panel s ON s.documento_id=d.id AND s.estado<>'cancelado' WHERE d.worker_id=$1 AND (d.url LIKE 'lote:%' OR s.id IS NOT NULL) ORDER BY d.creado_en DESC",[req.user.id]);res.json({ok:true,data:rows,consentimiento:CONSENTIMIENTO});}));
 app.get('/api/mis-documentos/:id/archivo',authUser,wrap(async(req,res)=>{const {rows:[d]}=await pool.query("SELECT d.*,s.original,s.firmado FROM hr_documentos d LEFT JOIN rrhh_firmas_panel s ON s.documento_id=d.id AND s.estado<>'cancelado' WHERE d.id=$1 AND d.worker_id=$2 AND (d.url LIKE 'lote:%' OR s.id IS NOT NULL)",[Number(req.params.id)||0,req.user.id]);if(!d)throw error('Documento no encontrado.',404);const bytes=req.query.original==='1'?d.original||await leerPdf(d):d.firmado||d.original||await leerPdf(d);enviar(res,bytes,d.nombre);}));
 app.post('/api/mis-documentos/:id/firmar',authUser,wrap(async(req,res)=>{
  if(req.body.consentimiento!==true)throw error('Debes confirmar que quieres firmar.');let trazos;try{trazos=validarTrazos(req.body.trazos);}catch(e){throw error(e.message);}
  const c=await pool.connect();try{await c.query('BEGIN');
   const {rows:[s]}=await c.query("SELECT * FROM rrhh_firmas_panel WHERE documento_id=$1 AND worker_id=$2 AND estado<>'cancelado' FOR UPDATE",[Number(req.params.id)||0,req.user.id]);if(!s)throw error('Documento no encontrado.',404);
   if(s.estado==='firmado'){await c.query('COMMIT');return res.json({ok:true,repetido:true});}
   const {rows:[u]}=await c.query('SELECT nombre FROM users WHERE id=$1',[req.user.id]);const fecha=new Date(),bytes=await crearPdfFirmado(s,trazos,fecha,u.nombre);
   await c.query("UPDATE rrhh_firmas_panel SET estado='firmado',firmado_en=$1,firmado_por=$2,firmante_nombre=$3,consentimiento=$4,trazos=$5,firmado=$6,firmado_sha256=$7 WHERE id=$8",[fecha,req.user.id,u.nombre,CONSENTIMIENTO,JSON.stringify(trazos),bytes,sha256(bytes),s.id]);
   await c.query('COMMIT');res.json({ok:true});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
}
