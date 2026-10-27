export function normalizarDireccion(r){
 const componentes=r.addressComponents||r.address_components||[];
 const c=t=>{const v=componentes.find(c=>c.types?.includes(t));return v?.longText||v?.long_name||'';};
 return {direccion:r.formattedAddress||r.formatted_address||'',codigo_postal:c('postal_code'),poblacion:c('locality')||c('postal_town')||c('administrative_area_level_2'),pais:c('country')};
}

const MENSAJES={
 SERVICE_DISABLED:'Hay que activar Places API (New) en el proyecto de Google Cloud.',
 API_KEY_INVALID:'La clave de Google Places no es válida. Hay que revisarla en el servidor.',
 API_KEY_SERVICE_BLOCKED:'La clave de Google no tiene permiso para Places API (New).',
 API_KEY_HTTP_REFERRER_BLOCKED:'La clave de Google está limitada a páginas web; esta conexión necesita una clave autorizada para el servidor.',
 API_KEY_IP_ADDRESS_BLOCKED:'Google no permite consultas desde este servidor. Hay que revisar las restricciones de la clave.',
 BILLING_DISABLED:'Google Places necesita que se active la facturación del proyecto.',
 RESOURCE_EXHAUSTED:'Se ha alcanzado el límite de consultas de Google Places. Inténtalo más tarde.',
 PERMISSION_DENIED:'Google ha rechazado la conexión. Revisa la activación de Places API (New), los permisos de la clave y la facturación.',
 UNAUTHENTICATED:'Google no ha aceptado la clave del servidor.',
 NOT_FOUND:'Esta dirección ya no está disponible. Vuelve a buscarla.',
 TIMEOUT:'Google ha tardado demasiado en responder. Vuelve a intentarlo.',
 UNAVAILABLE:'Google Places no está disponible temporalmente. Vuelve a intentarlo.'
};
function errorProveedor(j,status){
 const reason=j?.error?.details?.find(d=>Object.hasOwn(MENSAJES,d.reason))?.reason;
 const codigo=reason||(Object.hasOwn(MENSAJES,j?.error?.status)?j.error.status:({401:'UNAUTHENTICATED',403:'PERMISSION_DENIED',404:'NOT_FOUND',429:'RESOURCE_EXHAUSTED'})[status])||'UNAVAILABLE';
 return Object.assign(new Error(MENSAJES[codigo]),{codigo});
}

export function registrarDirecciones(app,{auth,key,fetcher=fetch}){
 app.get('/api/rrhh/direcciones',auth,async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!key)return res.status(503).json({ok:false,error:'Las sugerencias necesitan conectar Google Places. Puedes escribir la dirección completa.'});
  const q=String(req.query.q||'').trim().slice(0,200),id=String(req.query.id||'').slice(0,250);
  if(!id&&q.length<4)return res.json({ok:true,data:[]});
  try{
   // Places API (New): las claves de proyectos nuevos no pueden usar la API legacy.
   // La clave viaja en cabecera y no se devuelve ni se registra con la dirección.
   const headers={'X-Goog-Api-Key':key,'X-Goog-FieldMask':id?'formattedAddress,addressComponents':'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'};
   const resp=await fetcher(id?`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=es`:'https://places.googleapis.com/v1/places:autocomplete',{
    method:id?'GET':'POST',headers:{...headers,...(!id?{'Content-Type':'application/json'}:{})},
    ...(!id?{body:JSON.stringify({input:q,languageCode:'es',regionCode:'ES'})}:{}),signal:AbortSignal.timeout(8000)
   });
   const j=await resp.json();
   if(!resp.ok||j.error)throw errorProveedor(j,resp.status);
   if(id&&!j.formattedAddress)throw errorProveedor({},404);
   res.json({ok:true,data:id?normalizarDireccion(j):(j.suggestions||[]).flatMap(s=>{
    const p=s.placePrediction;return p?.placeId&&p.text?.text?[{id:p.placeId,texto:p.text.text}]:[];
   }).slice(0,5)});
  }catch(e){
   const codigo=e.name==='TimeoutError'?'TIMEOUT':e.codigo||'UNAVAILABLE';
   // Solo códigos conocidos: nunca reenviar mensajes del proveedor, claves o datos consultados.
   res.status(503).json({ok:false,codigo,error:(MENSAJES[codigo]||MENSAJES.UNAVAILABLE)+' Puedes escribir la dirección manualmente.'});
  }
 });
}
