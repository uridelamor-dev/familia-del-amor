import { paginaPendiente, proponerPaginas } from './paginas.js';
export function rutasPaginas(app,{auth,db,puedeAccederLocal,transaccion,conBloqueo,paginas}){
 const cargar=async(req,id)=>{
  const p=await db.get('SELECT * FROM facturas_paginas WHERE id=?',[id]);
  if(!p)throw new Error('Propuesta no encontrada');
  const documentos=await db.all('SELECT id,local,nombre,estado,mime,resultado FROM facturas_recepciones WHERE id=ANY(?::bigint[]) ORDER BY id',[[p.primera,p.segunda]]);
  if(documentos.length!==2||documentos.some(f=>!puedeAccederLocal(req,f.local)))throw new Error('Sin acceso a estos documentos');
  return {...p,documentos};
 };
 app.get('/api/facturas/paginas/:id',auth,async(req,res)=>{
  try{const p=await cargar(req,req.params.id);res.setHeader('Cache-Control','no-store');res.json({ok:true,data:{id:p.id,estado:p.estado,motivo:p.pruebas?.motivo,documentos:p.documentos,completada:!!p.pruebas?.completada, accionable:p.estado==='revision' && p.documentos.every(paginaPendiente) && !!p.documentos[0].local && p.documentos[0].local===p.documentos[1].local}});}
  catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/facturas/paginas',auth,async(req,res)=>{
  try{
   const ids=[...new Set((Array.isArray(req.body.ids)?req.body.ids:[]).map(Number))].sort((a,b)=>a-b);
   if(ids.length!==2||ids.some(x=>!Number.isSafeInteger(x)||x<=0))throw new Error('Selecciona dos documentos');
   const r=await transaccion(async tx=>{
    const filas=await tx.all('SELECT id,local FROM facturas_recepciones WHERE id=ANY(?::bigint[]) ORDER BY id FOR UPDATE',[ids]);
    if(filas.length!==2||filas.some(f=>!puedeAccederLocal(req,f.local))||!filas[0].local||filas[0].local!==filas[1].local)throw new Error('Selecciona dos documentos del mismo establecimiento al que tengas acceso');
    const p=await proponerPaginas(tx,ids,'revision',{manual:true,motivo:'Páginas seleccionadas para revisar por una persona'});
    if(!p)throw new Error('Selecciona dos documentos pendientes de revisión que no estén en otra propuesta o en lectura.');
    if(p.estado!=='revision')throw new Error('Ya se tomó una decisión para esta pareja.');
    return {ok:true,id:p.id};
   });res.json(r);
  }catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/facturas/paginas/:id/:accion',auth,async(req,res)=>{
  try{
   if(!['unir','separar','deshacer'].includes(req.params.accion))throw new Error('Acción no válida');
   const {accion}=req.params;
   const decidir=async()=>{
    const p=await cargar(req,req.params.id);
    if(accion==='unir' && (p.estado!=='revision' || !p.documentos.every(paginaPendiente) || p.documentos[0].local!==p.documentos[1].local))throw new Error('Los documentos han cambiado. Actualiza la lista.');
    const autor=String(req.user?.id||req.user?.username||'usuario');
    return paginas[accion](p,autor,{soloPendientes:true});
   };
   res.json(await (accion==='deshacer' ? conBloqueo(decidir) : decidir()));
  }catch(e){res.status(400).json({ok:false,error:e.revisionDocumento?'La lectura conjunta necesita revisión. Los originales se conservan; no se han unido.':e.recibido?'Espera a que termine la lectura para deshacer la unión. Puedes seguir revisando otros documentos.':e.message});}
 });
}
