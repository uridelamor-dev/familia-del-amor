// Cache acotada por ambito autorizado: entrega lo conocido y comparte la renovacion.
export function crearCachePeriodo({ahora=Date.now,fresco=60000,maxEdad=900000,limite=120}={}) {
 const valores=new Map(),pendientes=new Map();
 return async function leer(clave,cargar,{esperar=false}={}) {
  const anterior=valores.get(clave);
  const envolver=(r,actualizando=false)=>({...structuredClone(r.data),lectura:{actualizado:new Date(r.ts).toISOString(),actualizando}});
  if(anterior && ahora()-anterior.ts<fresco)return envolver(anterior);
  if(!pendientes.has(clave)) {
   const p=Promise.resolve().then(cargar).then(data=>{
    const r={data:structuredClone(data),ts:ahora()};
    valores.delete(clave);valores.set(clave,r);
    while(valores.size>limite)valores.delete(valores.keys().next().value);
    return r;
   }).finally(()=>pendientes.delete(clave));
   pendientes.set(clave,p);p.catch(()=>{});
  }
  if(!esperar && anterior && ahora()-anterior.ts<maxEdad)return envolver(anterior,true);
  return envolver(await pendientes.get(clave));
 };
}
