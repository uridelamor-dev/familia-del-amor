export const CALIDAD_LECTURA_SCHEMA=`CREATE TABLE IF NOT EXISTS facturas_calidad_lectura (
 id BIGSERIAL PRIMARY KEY, recepcion_id BIGINT NOT NULL, factura_id BIGINT NOT NULL,
 firma TEXT NOT NULL, resultado TEXT NOT NULL CHECK(resultado IN ('correcto','error')),
 campos JSONB NOT NULL DEFAULT '[]', nota TEXT NOT NULL DEFAULT '', autor TEXT NOT NULL,
 creado TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(recepcion_id,firma)
);`;
const FIRMA=`md5((to_jsonb(f)-'drive_thumb')::text || COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)::text FROM factura_lineas l WHERE l.factura_id=f.id),'[]'))`;
const AUTO=`r.estado='registrado' AND r.resultado->'datos'->'_contraste'->>'estado'='lectura_validada' AND r.resultado->'revisionPrevia'->'aprobacion' IS NULL`;
export const CAMPOS_CALIDAD=['proveedor','nif','local','fecha','numero','tipo','lineas','iva','total','vencimiento','paginas','archivo'];
export function validarControlCalidad(body={}) {
 if(body.confirmado!==true)throw new Error('Confirma que has cotejado todas las páginas del original y los datos registrados.');
 if(!['correcto','error'].includes(body.resultado)||!/^[a-f0-9]{32}$/.test(body.firma||''))throw new Error('Control de calidad no válido');
 const campos=[...new Set(Array.isArray(body.campos)?body.campos:[])];
 if(campos.some(c=>!CAMPOS_CALIDAD.includes(c)))throw new Error('Campo de calidad no válido');
 const nota=String(body.nota||'').trim().slice(0,1500);
 if(body.resultado==='error'&&(!campos.length||nota.length<5))throw new Error('Indica el campo y explica el error encontrado.');
 if(body.resultado==='correcto'&&campos.length)throw new Error('Un documento correcto no puede tener errores señalados.');
 return {resultado:body.resultado,firma:body.firma,campos,nota};
}
export function registrarCalidadLectura(app,{auth,db,transaccion,ambito,puedeAcceder}) {
 app.get('/api/facturas/calidad-lectura',auth,async(req,res,next)=>{
  try{
   const a=ambito(req,{local:'r.local',tipo:"r.resultado->'datos'->>'tipo'",empresa:"COALESCE(r.resultado->>'empresa',r.resultado->'datos'->>'empresa')"});
   const af=ambito(req,{local:'f.local',tipo:'f.tipo',empresa:'f.empresa'});
   const t=await db.get(`SELECT COUNT(*)::int AS recibidas,
    COUNT(*) FILTER(WHERE ${AUTO})::int AS automaticas,
    COUNT(*) FILTER(WHERE r.estado='registrado' AND r.resultado->'revisionPrevia'->'aprobacion' IS NOT NULL)::int AS manuales,
    COUNT(*) FILTER(WHERE r.estado='revision')::int AS revision,
    COUNT(*) FILTER(WHERE r.estado IN ('pendiente','leyendo'))::int AS en_proceso,
    COUNT(*) FILTER(WHERE r.estado='error')::int AS errores_tecnicos,
    COUNT(*) FILTER(WHERE r.estado='paginas')::int AS paginas,
    COUNT(*) FILTER(WHERE r.estado='descartado')::int AS apartadas,
    COUNT(*) FILTER(WHERE r.estado='duplicado')::int AS duplicadas,
    COUNT(*) FILTER(WHERE r.resultado->'revisionPrevia'->'aprobacion'->>'falsoAviso'='true')::int AS falsos_avisos_confirmados,
    ROUND(AVG(CASE WHEN r.resultado->'datos'->'_contraste'->>'duracion_ms' ~ '^[0-9]+$' THEN (r.resultado->'datos'->'_contraste'->>'duracion_ms')::numeric END)) AS lectura_media_ms
    FROM facturas_recepciones r WHERE r.creado>=NOW()-INTERVAL '30 days' ${a.sql}`,a.params);
   const muestras=await db.all(`SELECT r.id AS recepcion_id,f.id AS factura_id,f.proveedor,f.numero_factura,f.fecha,f.local,${FIRMA} AS firma,
    q.resultado AS control,q.campos,q.nota,q.creado AS revisado
    FROM facturas_recepciones r JOIN facturas f ON f.file_hash=r.hash
    LEFT JOIN facturas_calidad_lectura q ON q.recepcion_id=r.id AND q.firma=${FIRMA}
    WHERE ${AUTO} AND MOD(r.id,20)=0 AND r.actualizado>=NOW()-INTERVAL '30 days' ${a.sql} ${af.sql}
    ORDER BY (q.id IS NULL) DESC,r.id DESC LIMIT 20`,[...a.params,...af.params]);
   const controles=await db.get(`SELECT COUNT(*)::int AS revisadas,COUNT(*) FILTER(WHERE q.resultado='error')::int AS errores,COUNT(*) FILTER(WHERE q.firma=${FIRMA})::int AS vigentes
    FROM facturas_calidad_lectura q JOIN facturas_recepciones r ON r.id=q.recepcion_id JOIN facturas f ON f.id=q.factura_id
    WHERE q.creado>=NOW()-INTERVAL '30 days' ${a.sql} ${af.sql}`,[...a.params,...af.params]);
   const total=t.automaticas+t.manuales+t.revision;
   res.setHeader('Cache-Control','no-store');res.json({ok:true,periodo:'Recepciones de los últimos 30 días',totales:t,porcentajeAutomatico:total?Math.round(t.automaticas*1000/total)/10:null,denominador:total,controles,muestras});
  }catch(e){next(e);}
 });
 app.post('/api/facturas/calidad-lectura/:id',auth,async(req,res,next)=>{
  try{
   if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Documento no válido'});
   let control;try{control=validarControlCalidad(req.body);}catch(e){return res.status(400).json({error:e.message});}
   const resultado=await transaccion(async tx=>{
    const f=await tx.get(`SELECT r.id,r.local,f.local AS local_factura,f.id AS factura_id,${FIRMA} AS firma FROM facturas_recepciones r JOIN facturas f ON f.file_hash=r.hash WHERE r.id=? AND ${AUTO} AND MOD(r.id,20)=0 FOR UPDATE OF r,f`,[req.params.id]);
    if(!f||!puedeAcceder(req,f.local)||!puedeAcceder(req,f.local_factura))return {status:403,error:'Sin acceso a este documento de la muestra'};
    if(f.firma!==control.firma)return {status:409,error:'El documento ha cambiado. Abre de nuevo el original y los datos antes de confirmar.'};
    const previo=await tx.get('SELECT resultado FROM facturas_calidad_lectura WHERE recepcion_id=? AND firma=?',[f.id,f.firma]);
    if(previo)return previo.resultado===control.resultado?{ok:true}:{status:409,error:'Esta versión ya tiene un control guardado.'};
    await tx.run(`INSERT INTO facturas_calidad_lectura(recepcion_id,factura_id,firma,resultado,campos,nota,autor) VALUES(?,?,?,?,?::jsonb,?,?)`,[f.id,f.factura_id,f.firma,control.resultado,JSON.stringify(control.campos),control.nota,String(req.user.id||req.user.username)]);
    return {ok:true};
   });res.status(resultado.status||200).json(resultado);
  }catch(e){next(e);}
 });
}
