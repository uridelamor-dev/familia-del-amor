import { filtrarPorEstado } from './ciclo.js';
export function registrarCalendarioCumpleanos(app,{auth,dbAll,hoyISO,puedeLocal}){
app.get('/api/rrhh/cumpleanos/calendario', auth, async(req,res)=>{
 res.set('Cache-Control','no-store');
 try{
  const rows=await dbAll("SELECT id,nombre,local,activo,fecha_alta,fecha_baja,fecha_nac FROM users WHERE rol IN ('trabajador','encargado') AND fecha_nac IS NOT NULL");
  const activos=filtrarPorEstado(rows,'activos',hoyISO());
  res.json({ok:true,data:activos.filter(w=>puedeLocal(req,w.local)).map(w=>({id:w.id,nombre:w.nombre,local:w.local,cumple:String(w.fecha_nac instanceof Date?w.fecha_nac.toISOString():w.fecha_nac).slice(5,10)}))});
 }catch{res.status(500).json({ok:false,error:'No se pudo cargar el calendario de cumpleaños.'});}
});
}
