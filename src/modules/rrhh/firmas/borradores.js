import {createHash} from 'node:crypto';
export const emailValido = x => typeof x==='string' && x.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
export function prepararFirmantes(trabajador,empresa=null) {
  const firmantes=[{...trabajador,papel:'trabajador'},...(empresa?[{...empresa,papel:'empresa'}]:[])];
  if(empresa && (empresa.rol!=='direccion' || empresa.id===trabajador.id)) return {ok:false,error:'El segundo firmante debe ser una persona distinta de Dirección.'};
  if(firmantes.some(p=>!p.nombre || !emailValido(p.email))) return {ok:false,error:'Cada firmante necesita nombre completo y correo válido en su ficha.'};
  return {ok:true,firmantes:firmantes.map(p=>({id:p.id,nombre:p.nombre,email:p.email,telefono:p.telefono||null,papel:p.papel}))};
}
export function huellaPdf(buffer) {
  if(!Buffer.isBuffer(buffer)||buffer.length<8||buffer.length>8*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-') throw new Error('Para preparar una firma, sube el documento en PDF (máximo 8 MB).');
  return createHash('sha256').update(buffer).digest('hex');
}
export async function ensureSchemaFirmas(q) {
  await q(`CREATE TABLE IF NOT EXISTS rrhh_firma_borradores (
    id SERIAL PRIMARY KEY, documento_id INTEGER NOT NULL REFERENCES hr_documentos(id) ON DELETE RESTRICT,
    worker_id INTEGER NOT NULL, local TEXT NOT NULL, nombre TEXT NOT NULL, sha256 TEXT NOT NULL,
    firmantes JSONB NOT NULL, estado TEXT NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','cancelado')),
    creado_por TEXT NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), cancelado_por TEXT,cancelado_en TIMESTAMPTZ)`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS rrhh_firma_documento_activo ON rrhh_firma_borradores(documento_id) WHERE estado='borrador'`);
}
// Solo preparación interna. No existe ninguna acción de enviar ni de marcar como firmado.
export function registrarBorradoresFirma(app,{auth,dbAll,dbGet,pool,puedeLocal,leerPdf}) {
  const wrap=fn=>async(req,res)=>{try{res.setHeader('Cache-Control','private, no-store');await fn(req,res);}catch(e){console.error('[rrhh] preparar firma:',e.code||'error');res.status(500).json({ok:false,error:'No se pudo preparar la firma.'});}};
  async function documento(req,res) {
    const doc=await dbGet('SELECT d.*,u.local FROM hr_documentos d JOIN users u ON u.id=d.worker_id WHERE d.id=?',[Number(req.params.id)||0]);
    if(!doc || !puedeLocal(req,doc.local)){res.status(404).json({ok:false,error:'Documento no encontrado.'});return null;}
    return doc;
  }
  app.get('/api/rrhh/documento/:id/firmas',auth,wrap(async(req,res)=>{
    const doc=await documento(req,res);if(!doc)return;
    const [solicitudes,empresa]=await Promise.all([
      dbAll('SELECT * FROM rrhh_firma_borradores WHERE documento_id=? ORDER BY id DESC',[doc.id]),
      dbAll("SELECT id,nombre,email FROM users WHERE rol='direccion' AND COALESCE(activo,1)=1 ORDER BY nombre")]);
    const trabajador=await dbGet('SELECT id,nombre,email FROM users WHERE id=?',[doc.worker_id]);
    res.json({ok:true,documento:{id:doc.id,nombre:doc.nombre},trabajador,empresa,solicitudes,envio_disponible:false});
  }));
  app.post('/api/rrhh/documento/:id/firmas',auth,wrap(async(req,res)=>{
    const doc=await documento(req,res);if(!doc)return;
    const trabajador=await dbGet('SELECT id,nombre,email,telefono FROM users WHERE id=?',[doc.worker_id]);
    const empresa=req.body.empresa_id ? await dbGet("SELECT id,nombre,email,telefono,rol FROM users WHERE id=? AND COALESCE(activo,1)=1",[Number(req.body.empresa_id)||0]):null;
    if(req.body.empresa_id && !empresa)return res.status(400).json({ok:false,error:'Firmante de empresa no disponible.'});
    const f=prepararFirmantes(trabajador,empresa);if(!f.ok)return res.status(400).json(f);
    let hash;
    try{hash=huellaPdf(await leerPdf(doc));}catch{return res.status(400).json({ok:false,error:'No se puede leer un PDF válido de este documento. Revisa el archivo antes de preparar la firma.'});}
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const vigente=(await c.query('SELECT id,url FROM hr_documentos WHERE id=$1 FOR UPDATE',[doc.id])).rows[0];
      if(!vigente || vigente.url!==doc.url){await c.query('ROLLBACK');return res.status(409).json({ok:false,error:'El documento ha cambiado. Vuelve a abrirlo.'});}
      const previo=(await c.query("SELECT * FROM rrhh_firma_borradores WHERE documento_id=$1 AND estado='borrador'",[doc.id])).rows[0];
      if(previo){await c.query('ROLLBACK');return res.status(409).json({ok:false,error:'Ya existe un borrador de firma para este documento.'});}
      const r=(await c.query(`INSERT INTO rrhh_firma_borradores(documento_id,worker_id,local,nombre,sha256,firmantes,creado_por)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[doc.id,doc.worker_id,doc.local,doc.nombre||doc.tipo,hash,JSON.stringify(f.firmantes),req.user.username])).rows[0];
      await c.query('COMMIT');res.json({ok:true,solicitud:r,envio_disponible:false});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }));
  app.post('/api/rrhh/documento/:id/firmas/:solicitud/cancelar',auth,wrap(async(req,res)=>{
    const doc=await documento(req,res);if(!doc)return;
    const c=await pool.connect();
    try{const r=await c.query(`UPDATE rrhh_firma_borradores SET estado='cancelado',cancelado_por=$1,cancelado_en=NOW()
      WHERE id=$2 AND documento_id=$3 AND estado='borrador' RETURNING id`,[req.user.username,Number(req.params.solicitud)||0,doc.id]);
      if(!r.rows.length)return res.status(409).json({ok:false,error:'El borrador no existe o ya está cancelado.'});
      res.json({ok:true});
    }finally{c.release();}
  }));
}
