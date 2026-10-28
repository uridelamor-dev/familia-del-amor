// Toda decisión se vuelve a comprobar bajo el mismo cerrojo que usa la recepción.
export function rutasPaginas(app,{auth,db,puedeAccederLocal,conBloqueo,paginas}){
 const cargar=async(req,id)=>{
  const p=await db.get('SELECT * FROM facturas_paginas WHERE id=?',[id]);
  if(!p)throw new Error('Propuesta no encontrada');
  const documentos=await db.all('SELECT id,local,nombre,estado,mime,resultado FROM facturas_recepciones WHERE id=ANY(?::bigint[]) ORDER BY id',[[p.primera,p.segunda]]);
  if(documentos.length!==2||documentos.some(f=>!puedeAccederLocal(req,f.local)))throw new Error('Sin acceso a estos documentos');
  return {...p,documentos};
 };
 app.get('/api/facturas/paginas/:id',auth,async(req,res)=>{
  try{const p=await cargar(req,req.params.id);res.setHeader('Cache-Control','no-store');res.json({ok:true,data:{id:p.id,estado:p.estado,motivo:p.pruebas?.motivo,documentos:p.documentos,completada:!!p.pruebas?.completada}});}
  catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/facturas/paginas',auth,async(req,res)=>{
  try{
   const ids=[...new Set((Array.isArray(req.body.ids)?req.body.ids:[]).map(Number))].sort((a,b)=>a-b);
   if(ids.length!==2||ids.some(x=>!Number.isSafeInteger(x)||x<=0))throw new Error('Selecciona dos documentos');
   const r=await conBloqueo(async()=>{
    const filas=await db.all('SELECT id,local,estado FROM facturas_recepciones WHERE id=ANY(?::bigint[]) ORDER BY id',[ids]);
    if(filas.length!==2||filas.some(f=>!puedeAccederLocal(req,f.local))||!filas[0].local||filas[0].local!==filas[1].local)throw new Error('Selecciona dos documentos del mismo establecimiento al que tengas acceso');
    if(filas.some(f=>!['pendiente','revision','error','paginas'].includes(f.estado)))throw new Error('Uno de los documentos ya se ha registrado');
    const p=await db.run(`INSERT INTO facturas_paginas (primera,segunda,estado,pruebas) VALUES (?,?,'revision',?::jsonb)
      ON CONFLICT(primera,segunda) DO UPDATE SET estado='revision',pruebas=EXCLUDED.pruebas WHERE facturas_paginas.estado IN ('distintas','repetida','separadas') RETURNING id`,[...ids,JSON.stringify({manual:true,motivo:'Páginas seleccionadas para revisar por una persona'})]);
    const actual=p||await db.get('SELECT id,estado FROM facturas_paginas WHERE primera=? AND segunda=?',ids);
    if(actual.estado==='unidas')throw new Error('Estos documentos ya están unidos');
    await db.run("UPDATE facturas_recepciones SET estado='paginas',error=NULL WHERE id=ANY(?::bigint[])",[ids]);
    return {ok:true,id:actual.id};
   });res.json(r);
  }catch(e){res.status(400).json({ok:false,error:e.recibido?'Hay otra lectura en curso. Vuelve a intentarlo en un momento.':e.message});}
 });
 app.post('/api/facturas/paginas/:id/:accion',auth,async(req,res)=>{
  try{
   if(!['unir','separar','deshacer'].includes(req.params.accion))throw new Error('Acción no válida');
   const r=await conBloqueo(async()=>{
    const p=await cargar(req,req.params.id);
    if(req.params.accion==='unir'&&p.estado!=='revision')throw new Error('La propuesta ya se ha resuelto');
    const autor=String(req.user?.id||req.user?.username||'usuario');
    return paginas[req.params.accion](p,autor);
   });res.json(r);
  }catch(e){res.status(400).json({ok:false,error:e.revisionDocumento?'La lectura conjunta necesita revisión. Los originales se conservan; no se han unido.':e.recibido?'Hay otra lectura en curso. Vuelve a intentarlo en un momento.':e.message});}
 });
}
