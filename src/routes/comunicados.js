import { validarComunicado } from '../modules/comunicados/comunicados.js';
export function registrarComunicados(app,{requireAuth,dbAll,dbGet,dbRun,localScope,hoyISO,canonizarLocal}) {
  const localDe = req => req.user.rol==='trabajador' ? req.user.local : localScope(req) || req.query.local;
  app.get('/api/announcements',requireAuth(),async(req,res)=> {
    try {
      const local=localDe(req), worker=req.user.rol==='trabajador';
      if(worker && !local) return res.json({ok:true,data:[]});
      const where=[],params=[req.user.id];
      if(local) {where.push('a.local = ?');params.push(local);}
      if(worker || req.query.rol) {where.push('a.rol = ?');params.push(worker?'trabajadores':req.query.rol);}
      if(worker) {where.push("(a.hasta = '' OR a.hasta >= ?)");params.push(hoyISO());}
      const data=await dbAll(`SELECT a.*, EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id=a.id AND r.user_id=?) AS leido,
        (SELECT COUNT(*)::int FROM announcement_reads r WHERE r.announcement_id=a.id) AS lecturas
        FROM announcements a ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.creado_en DESC`,params);
      res.json({ok:true,data});
    } catch {res.status(500).json({ok:false,error:'No se pudieron cargar los comunicados.'});}
  });
  app.post('/api/announcements',requireAuth(['encargado','direccion']),async(req,res)=> {
    const fallo=validarComunicado(req.body || {},hoyISO());if(fallo)return res.status(400).json({ok:false,error:fallo});
    const local=canonizarLocal(req.body.local),scope=localScope(req,local);
    if(!local)return res.status(400).json({ok:false,error:'Elige un local válido.'});
    if(scope && scope!==local)return res.status(403).json({ok:false,error:'No puedes publicar para ese local.'});
    try {
      const row=await dbRun('INSERT INTO announcements (local,rol,mensaje,creado_en,hasta) VALUES (?,?,?,?,?) RETURNING id',[local,'trabajadores',req.body.mensaje.trim(),new Date().toISOString(),req.body.hasta || '']);
      res.json({ok:true,id:row.id});
    }catch {res.status(500).json({ok:false,error:'No se pudo publicar el comunicado.'});}
  });
  app.post('/api/announcements/:id/leido',requireAuth(['trabajador','encargado','direccion']),async(req,res)=> {
    if(!/^\d+$/.test(req.params.id))return res.status(400).json({ok:false,error:'Comunicado inválido'});
    try {
      const row=await dbGet('SELECT * FROM announcements WHERE id=?',[req.params.id]);
      if(!row)return res.status(404).json({ok:false,error:'Comunicado no encontrado'});
      // Solo el equipo del destinatario confirma recepción: dirección no altera la métrica.
      if(req.user.local!==row.local || !['trabajador','encargado'].includes(req.user.rol) || row.rol!=='trabajadores')return res.status(403).json({ok:false,error:'Este comunicado no está dirigido a tu equipo.'});
      await dbRun('INSERT INTO announcement_reads (announcement_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING',[row.id,req.user.id]);
      res.json({ok:true});
    }catch {res.status(500).json({ok:false,error:'No se pudo confirmar la lectura.'});}
  });
}
