import { huellaContenido, validarCambios, diferenciasContenido } from '../modules/web/borradores.js';
export function registrarBorradoresWeb(app, { pool, requireAuth, permitido }) {
  const auth = requireAuth(['marketing', 'direccion']);
  const contenido = async db => Object.fromEntries((await db.query('SELECT key,value FROM contents')).rows.map(r => [r.key,r.value]));
  const error = (status, message) => Object.assign(new Error(message), { status });
  // Un mismo candado serializa los borradores de un autor. Publicar además bloquea contents,
  // incluyendo los editores antiguos que todavía escriben directamente en esa tabla.
  const run = fn => async (req,res) => {
    let db;
    try {
      db = await pool.connect(); await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(92122,$1::integer)', [req.user.id]);
      const data = await fn(req,db);
      await db.query('COMMIT'); res.json({ ok:true, ...data });
    } catch(e) { if(db) await db.query('ROLLBACK').catch(()=>{}); res.status(e.status || 500).json({ok:false,error:e.status ? e.message : 'No se pudo guardar el contenido. Inténtalo de nuevo.'}); }
    finally { if(db) db.release(); }
  };
  const draft = async (req,db) => (await db.query('SELECT * FROM web_borradores WHERE usuario_id=$1',[req.user.id])).rows[0];
  app.get('/api/content/editor',auth,run(async(req,db)=> {
    const data = await contenido(db);
    return { data, version:huellaContenido(data), borrador:await draft(req,db), versiones:(await db.query('SELECT id,autor,creado_en FROM web_versiones ORDER BY id DESC LIMIT 30')).rows };
  }));
  app.put('/api/content/draft',auth,run(async(req,db)=> {
    const {cambios,base_version,revision} = req.body || {};
    const fallo=validarCambios(cambios,permitido); if(fallo) throw error(400,fallo);
    if(!/^[a-f0-9]{64}$/.test(base_version || '') || !Number.isInteger(revision)) throw error(400,'Versión de borrador inválida');
    const previo=await draft(req,db);
    if((previo?.revision || 0)!==revision) throw error(409,'Tu borrador ha cambiado en otra ventana. Recarga antes de continuar.');
    if(req.body.rebase && huellaContenido(await contenido(db))!==base_version) throw error(409,'La web volvió a cambiar. Vuelve a comparar las versiones.');
    if(previo && previo.base_version!==base_version && !req.body.rebase) throw error(409,'La versión original del borrador ha cambiado. Recarga antes de continuar.');
    const row=(await db.query(`INSERT INTO web_borradores (usuario_id,base_version,cambios,revision) VALUES ($1,$2,$3,nextval('web_borrador_revision_seq')) ON CONFLICT(usuario_id) DO UPDATE SET base_version=EXCLUDED.base_version,cambios=EXCLUDED.cambios,revision=EXCLUDED.revision,actualizado_en=NOW() RETURNING *`,[req.user.id,base_version,JSON.stringify(cambios)])).rows[0];
    return {borrador:row};
  }));
  app.post('/api/content/publish',auth,run(async(req,db)=> {
    const d=await draft(req,db);
    if(!d || req.body.revision!==d.revision) throw error(409,'Guarda el borrador actualizado antes de publicar.');
    if(!Object.keys(d.cambios).length) throw error(400,'No hay cambios para publicar.');
    const fallo=validarCambios(d.cambios,permitido); if(fallo) throw error(400,fallo);
    await db.query('LOCK TABLE contents IN EXCLUSIVE MODE');
    const antes=await contenido(db);
    if(huellaContenido(antes)!==d.base_version) throw error(409,'La web publicada ha cambiado desde que empezaste. Conservamos tu borrador: revisa las diferencias antes de publicarlo.');
    // Guardamos la versión anterior incluso en la primera publicación, para poder recuperarla.
    await db.query('INSERT INTO web_versiones (autor,contenido) VALUES ($1,$2)',[req.user.username,JSON.stringify(antes)]);
    for(const [k,v] of Object.entries(d.cambios)) {
      if(v===null) await db.query('DELETE FROM contents WHERE key=$1',[k]);
      else await db.query(`INSERT INTO contents (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,[k,v,new Date().toISOString()]);
    }
    await db.query('DELETE FROM web_borradores WHERE usuario_id=$1',[req.user.id]);
    return {data:await contenido(db)};
  }));
  app.post('/api/content/restore',auth,run(async(req,db)=> {
    const previo=await draft(req,db);
    if((previo?.revision||0)!==req.body.revision) throw error(409,'El borrador ha cambiado. Recarga antes de recuperar una versión.');
    const v=(await db.query('SELECT contenido FROM web_versiones WHERE id=$1',[req.body.id])).rows[0];
    if(!v) throw error(404,'Versión no encontrada');
    const base=await contenido(db), cambios=diferenciasContenido(base,v.contenido,permitido);
    const row=(await db.query(`INSERT INTO web_borradores (usuario_id,base_version,cambios,revision) VALUES ($1,$2,$3,nextval('web_borrador_revision_seq')) ON CONFLICT(usuario_id) DO UPDATE SET base_version=EXCLUDED.base_version,cambios=EXCLUDED.cambios,revision=EXCLUDED.revision,actualizado_en=NOW() RETURNING *`,[req.user.id,huellaContenido(base),JSON.stringify(cambios)])).rows[0];
    return {borrador:row};
  }));
  app.delete('/api/content/draft',auth,run(async(req,db)=> {
    const previo=await draft(req,db);
    if((previo?.revision||0)!==req.body.revision) throw error(409,'El borrador ha cambiado en otra ventana. Recarga antes de descartarlo.');
    await db.query('DELETE FROM web_borradores WHERE usuario_id=$1',[req.user.id]); return {};
  }));
}
