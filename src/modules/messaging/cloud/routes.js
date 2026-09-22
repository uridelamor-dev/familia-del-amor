import { config, validSignature, equalSecret, events, CloudError, phone } from './protocol.js';
import { createClient } from './client.js';
import { createStore, ensureCloudSchema } from './store.js';

export function mountCloud({ app, express, pool, requireAuth, env = process.env, fetcher }) {
  const cfg=config(env), api=createClient(cfg,fetcher), store=createStore(pool,api,cfg);
  const base='/api/whatsapp/cloud';
  const auth=requireAuth(['direccion']); // El piloto no amplía el acceso a mensajes privados a otros roles.
  const wrap=fn=>async(req,res)=>{try {await fn(req,res);}catch(e){res.status(e instanceof CloudError ? e.status : 500).json({ok:false,error:e instanceof CloudError ? e.message:'No se pudo completar la operación.',code:e.code || 'internal'});}};
  const available=(req,res,next)=>cfg.ready ? next() : res.status(503).json({ok:false,error:'El piloto de WhatsApp todavía no está configurado.'});
  app.get(`${base}/webhook`,(req,res)=>{
    if(cfg.ready && req.query['hub.mode']==='subscribe' && equalSecret(req.query['hub.verify_token'],cfg.verifyToken)
       && typeof req.query['hub.challenge']==='string') return res.type('text/plain').send(req.query['hub.challenge']);
    res.sendStatus(403);
  });
  // Se monta antes de express.json: la firma se calcula sobre los bytes originales.
  app.post(`${base}/webhook`,available,express.raw({type:'application/json',limit:'1mb'}),wrap(async(req,res)=>{
    if(!validSignature(req.body,req.get('x-hub-signature-256'),cfg.secret)) return res.sendStatus(401);
    let payload; try{payload=JSON.parse(req.body.toString('utf8'));}catch{return res.sendStatus(400);}
    await store.ingest(events(payload,cfg));
    res.sendStatus(200); // Solo después de confirmar la transacción: Meta puede reintentar sin duplicar.
  }));
  app.get(`${base}/status`,auth,wrap(async(req,res)=>{
    res.json({ok:true,mode:cfg.mode,configured:cfg.ready,missing:cfg.missing,
      pilot:true,automations:false,daily_limit:40});
  }));
  // JSON local porque estas rutas preceden al parser global.
  app.use(base,auth,available,express.json({limit:'32kb'}));
  app.get(`${base}/conversations`,wrap(async(req,res)=>{
    const state=String(req.query.state || '');
    if(state && !['pending','human','resolved'].includes(state)) throw new CloudError('Filtro inválido.');
    const page=Number(req.query.page || 0);
    if(!Number.isInteger(page) || page<0 || page>10000)throw new CloudError('Página inválida.');
    const rows=await store.list(String(req.query.q || ''),state,page);
    res.json({ok:true,data:rows.slice(0,100),nextPage:rows.length>100 ? page+1 : null});
  }));
  app.post(`${base}/conversations`,wrap(async(req,res)=>{
    await store.create(req.body.phone,req.user.username); res.json({ok:true});
  }));
  app.get(`${base}/conversations/:phone`,wrap(async(req,res)=>{
    const before=req.query.before;
    if(before && !/^\d+$/.test(before)) throw new CloudError('Página inválida.');
    res.json({ok:true,...await store.conversation(phone(req.params.phone),before || null)});
  }));
  app.post(`${base}/conversations/:phone/take`,wrap(async(req,res)=>{await store.take(phone(req.params.phone),req.user.username);res.json({ok:true});}));
  app.post(`${base}/conversations/:phone/resolve`,wrap(async(req,res)=>{await store.resolve(phone(req.params.phone),req.user.username);res.json({ok:true});}));
  app.post(`${base}/conversations/:phone/messages`,wrap(async(req,res)=>{
    res.json({ok:true,message:await store.send(phone(req.params.phone),req.body,req.user.username)});
  }));
  app.get(`${base}/templates`,wrap(async(req,res)=>{res.json({ok:true,data:await api.templates()});}));
  app.get(`${base}/media/:id`,wrap(async(req,res)=>{
    if(!/^\d+$/.test(req.params.id)) throw new CloudError('Adjunto inválido.');
    const media=await store.media(req.params.id);
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    // Siempre descarga: un HTML/SVG recibido no se ejecuta en el origen autenticado del panel.
    res.attachment(String(media.filename || 'adjunto').replace(/[\r\n\\/]/g,'_').slice(0,150));
    res.type('application/octet-stream').send(media.buffer);
  }));
  return {ensureSchema:()=>ensureCloudSchema(pool)};
}
