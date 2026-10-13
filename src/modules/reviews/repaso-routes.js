export function registrarRepaso(app, { repaso, requireAuth, localesDe }) {
  const guard = [requireAuth(['direccion','marketing']), (req,res,next) => {
    if (req.user?.rol !== 'direccion' && localesDe(req.user).length) return res.status(403).json({ok:false,error:'El repaso de todo el grupo requiere acceso global.'});
    next();
  }];
  const route = fn => async (req,res) => {
    try { const result = await fn(req); res.json({ok:true,...result}); }
    catch { res.status(503).json({ok:false,error:'No se pudo completar la operación. El progreso guardado se conserva.'}); }
  };
  app.get('/api/reviews/repaso', ...guard, route(req => repaso.status(Math.max(0,Math.min(100000,parseInt(req.query.offset)||0)))));
  app.post('/api/reviews/repaso/aviso', ...guard, route(async()=>({show:await repaso.notice()})));
  app.post('/api/reviews/repaso/autorizar', ...guard, route(async req=>{
    if (req.body?.confirm !== true) throw Error('Falta autorización');
    const done = await repaso.authorize(String(req.user.id || req.user.username || req.user.nombre),req.body.policy);
    return {done, busy:done===null};
  }));
  app.post('/api/reviews/repaso/control', ...guard, route(async req=>{
    const done = await repaso.control(req.body?.action); return {done,busy:done===null};
  }));
}
