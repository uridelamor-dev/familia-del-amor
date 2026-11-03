import {obtenerPromocion,promocion,listarPromociones,vincularPromocion,enviosDisponibles} from './promocion-resultados.js';
import {obtenerRecorrido,cargarFuente,OBJETIVOS,prepararSeguimiento} from './recorrido.js';
export function registrarRecorrido(app,{auth,all,get,run}){
 const db={all,get,run};
 const fuente=(o,id,u)=>o==='promocion'?promocion(db,id,u):cargarFuente(db,o,id,u);
 const informe=(o,id,u)=>o==='promocion'?obtenerPromocion(db,id,u):obtenerRecorrido(db,o,id,u);
 app.get('/api/campanas-promociones',auth,async(req,res)=>{
  try{res.json({ok:true,data:await listarPromociones(db,req.user)});}catch{res.status(500).json({ok:false,error:'No se pudieron leer las promociones'});}
 });
 app.get('/api/campanas-promociones/:id/envios',auth,async(req,res)=>{
  try{if(!await promocion(db,req.params.id,req.user))return res.sendStatus(404);res.json({ok:true,data:await enviosDisponibles(db,req.user)});}catch{res.status(500).json({ok:false,error:'No se pudieron leer los envíos'});}
 });
 app.post('/api/campanas-promociones/:id/vinculos',auth,async(req,res)=>{
  try{await vincularPromocion(db,req.params.id,req.user,req.body.origen,String(req.body.envio_id||''),req.body.retirar===true);res.json({ok:true});}catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.get('/api/campanas-promociones/:id',auth,async(req,res)=>{
  res.set('Cache-Control','no-store');try{const data=await obtenerPromocion(db,req.params.id,req.user,req.query);if(!data)return res.sendStatus(404);res.json({ok:true,data});}catch(e){console.error('[resultados-promocion]',e.message);res.status(400).json({ok:false,error:'No se pudieron cargar los resultados de la promoción'});}
 });
 app.get('/api/campanas-resultados/:origen/:id/promociones',auth,async(req,res)=>{
  try{if(!await fuente(req.params.origen,req.params.id,req.user))return res.sendStatus(404);res.json({ok:true,data:await all('SELECT clave FROM campana_promocion_vinculos WHERE origen=? AND envio_id=?',[req.params.origen,req.params.id])});}catch{res.status(500).json({ok:false,error:'No se pudieron leer los vínculos'});}
 });
 app.get('/api/campanas-resultados/:origen/:id',auth,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{const data=await obtenerRecorrido(db,req.params.origen,req.params.id,req.user,req.query);if(!data)return res.status(404).json({ok:false,error:'Envío no encontrado'});res.json({ok:true,data});}
  catch(e){console.error('[recorrido]',e.message);res.status(400).json({ok:false,error:'No se pudo cargar el recorrido. Comprueba las fechas y vuelve a intentarlo.'});}
 });
 app.get('/api/campanas-resultados/:origen/:id/resenas',auth,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{if(!await fuente(req.params.origen,req.params.id,req.user))return res.sendStatus(404);
  const q=String(req.query.q||'').trim();if(q.length<3||q.length>100)return res.status(400).json({ok:false,error:'Escribe al menos tres letras del autor'});
  const data=await all(`SELECT id,author,rating,fecha,location_name,text FROM google_reviews WHERE author ILIKE ? ORDER BY fecha DESC LIMIT 20`,['%'+q.replace(/[\%_]/g,'')+'%']);res.json({ok:true,data});
  }catch{res.status(500).json({ok:false,error:'No se pudieron consultar las reseñas'});}
 });
 app.post('/api/campanas-resultados/:origen/:id/resenas',auth,async(req,res)=>{
  try{const d=await informe(req.params.origen,req.params.id,req.user);if(!d)return res.sendStatus(404);
  const p=d.filas.find(p=>p.id===req.body.persona);const evidencia=String(req.body.evidencia||'').trim();
  if(!p?.telefono||evidencia.length<10||evidencia.length>1000||req.body.confirmar!==true)return res.status(400).json({ok:false,error:'Confirma la identidad e indica cómo la has verificado'});
  const review=await get('SELECT id,fecha FROM google_reviews WHERE id=?',[String(req.body.review_id||'')]);if(!review)return res.status(404).json({ok:false,error:'Reseña no encontrada'});
  const saved=await run('INSERT INTO campana_recorrido_resenas(review_id,telefono,evidencia,autor) VALUES (?,?,?,?) ON CONFLICT(review_id) DO UPDATE SET telefono=EXCLUDED.telefono,evidencia=EXCLUDED.evidencia,autor=EXCLUDED.autor,creado_en=NOW(),revocado_en=NULL,revocado_por=NULL WHERE campana_recorrido_resenas.revocado_en IS NOT NULL RETURNING review_id',[review.id,p.telefono,evidencia,req.user.id]);if(!saved)return res.status(409).json({ok:false,error:'Esta reseña ya está vinculada'});res.json({ok:true});
  }catch(e){res.status(400).json({ok:false,error:e.code==='23505'?'Esta reseña ya tiene una identidad vinculada.':'No se pudo vincular la reseña'});}
 });
 app.post('/api/campanas-resultados/:origen/:id/resenas/desvincular',auth,async(req,res)=>{
  try{const d=await informe(req.params.origen,req.params.id,req.user);if(!d)return res.sendStatus(404);
  const p=d.filas.find(p=>p.id===req.body.persona);if(!p?.telefono)return res.sendStatus(400);
  const r=await run('UPDATE campana_recorrido_resenas SET revocado_en=NOW(),revocado_por=? WHERE review_id=? AND telefono=? AND revocado_en IS NULL RETURNING review_id',[req.user.id,String(req.body.review_id||''),p.telefono]);if(!r)return res.sendStatus(404);res.json({ok:true});
  }catch{res.status(500).json({ok:false,error:'No se pudo retirar el vínculo'});}
 });
 app.post('/api/campanas-resultados/:origen/:id/seguimiento',auth,async(req,res)=>{
  try{const data=await prepararSeguimiento({all,get,run},req.params.origen,req.params.id,req.user,req.body.filtros||{});res.json({ok:true,data});}
  catch(e){res.status(400).json({ok:false,error:e.message||'No se pudo preparar el seguimiento'});}
 });
 app.put('/api/campanas-resultados/:origen/:id/objetivo',auth,async(req,res)=>{
  try{if(!OBJETIVOS.includes(req.body.objetivo))return res.status(400).json({ok:false,error:'Objetivo no válido'});
  if(!await fuente(req.params.origen,req.params.id,req.user))return res.sendStatus(404);
  await run(`INSERT INTO campana_analisis(origen,envio_id,objetivo) VALUES (?,?,?) ON CONFLICT(origen,envio_id) DO UPDATE SET objetivo=EXCLUDED.objetivo,actualizado_en=NOW()`,[req.params.origen,req.params.id,req.body.objetivo]);res.json({ok:true});
  }catch{res.status(500).json({ok:false,error:'No se pudo guardar el objetivo'});}
 });
}
