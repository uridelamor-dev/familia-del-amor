export function normalizarDireccion(r){
 const c=t=>(r.address_components||[]).find(c=>c.types?.includes(t))?.long_name||'';
 return {direccion:r.formatted_address||'',codigo_postal:c('postal_code'),poblacion:c('locality')||c('postal_town')||c('administrative_area_level_2'),pais:c('country')};
}
export function registrarDirecciones(app,{auth,key,fetcher=fetch}){
 app.get('/api/rrhh/direcciones',auth,async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!key)return res.status(503).json({ok:false,error:'Las sugerencias necesitan conectar Google Places. Puedes escribir la dirección completa.'});
  const q=String(req.query.q||'').trim().slice(0,200),id=String(req.query.id||'').slice(0,250);
  if(!id&&q.length<4)return res.json({ok:true,data:[]});
  try{
   const params=new URLSearchParams({key,language:'es',...(id?{place_id:id,fields:'formatted_address,address_components'}:{input:q,types:'address'})});
   const resp=await fetcher(`https://maps.googleapis.com/maps/api/place/${id?'details':'autocomplete'}/json?${params}`,{signal:AbortSignal.timeout(8000)});
   if(!resp.ok)throw Error();const j=await resp.json();
   if(!['OK','ZERO_RESULTS'].includes(j.status))throw Error();
   res.json({ok:true,data:id?normalizarDireccion(j.result||{}):(j.predictions||[]).slice(0,5).map(p=>({id:p.place_id,texto:p.description}))});
  }catch{res.status(503).json({ok:false,error:'No se pudieron consultar las direcciones. Puedes escribirla manualmente.'});}
 });
}
