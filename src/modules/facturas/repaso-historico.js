import {compararLecturas} from './validacion-lectura.js';
export const REPASO_HISTORICO_SCHEMA=`
CREATE TABLE IF NOT EXISTS facturas_repaso_unico (
 id INTEGER PRIMARY KEY CHECK(id=1), estado TEXT NOT NULL DEFAULT 'disponible',
 visto TIMESTAMPTZ, iniciado TIMESTAMPTZ, terminado TIMESTAMPTZ, autor TEXT
);
INSERT INTO facturas_repaso_unico(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS facturas_repaso_documentos (
 origen TEXT NOT NULL, documento_id BIGINT NOT NULL, guardado JSONB NOT NULL,
 estado TEXT NOT NULL DEFAULT 'pendiente', resultado JSONB, actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(origen,documento_id)
);
ALTER TABLE facturas_repaso_unico ADD COLUMN IF NOT EXISTS fase TEXT NOT NULL DEFAULT 'muestra';
ALTER TABLE facturas_repaso_unico ADD COLUMN IF NOT EXISTS ultimo_control JSONB;
ALTER TABLE facturas_repaso_documentos ADD COLUMN IF NOT EXISTS orden BIGINT;
ALTER TABLE facturas_repaso_documentos ADD COLUMN IF NOT EXISTS prioridad INTEGER NOT NULL DEFAULT 3;
ALTER TABLE facturas_repaso_documentos ADD COLUMN IF NOT EXISTS revision_humana JSONB;
CREATE TABLE IF NOT EXISTS facturas_repaso_decisiones (
 id BIGSERIAL PRIMARY KEY, origen TEXT NOT NULL, documento_id BIGINT NOT NULL,
 fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(), autor TEXT NOT NULL, decision TEXT NOT NULL,
 motivo TEXT NOT NULL, antes JSONB, despues JSONB
);
CREATE INDEX IF NOT EXISTS facturas_repaso_cola ON facturas_repaso_documentos(estado,orden);
`;
// Una instantánea transaccional: pulsar dos veces o volver a publicar no amplía ni reinicia el lote.
export function crearRepasoHistorico({db,lock,leer,original}) {
 async function estado(){
  const trabajo=await db.get('SELECT * FROM facturas_repaso_unico WHERE id=1');
  const filas=await db.all(`SELECT estado,COUNT(*)::int AS n,COUNT(*) FILTER(WHERE revision_humana IS NULL AND estado IN ('revisar','error','sin_original'))::int AS pendientes FROM facturas_repaso_documentos GROUP BY estado`);
  const contadores=Object.fromEntries(filas.map(f=>[f.estado,f.n]));
  const revisadas=await db.get('SELECT COUNT(*)::int AS n FROM facturas_repaso_documentos WHERE revision_humana IS NOT NULL');
  return {...trabajo,contadores,porRevisar:filas.reduce((n,f)=>n+Number(f.pendientes||0),0),revisadas:revisadas.n,total:filas.reduce((n,f)=>n+Number(f.n),0)};
 }
 async function visto(){return !!await db.run('UPDATE facturas_repaso_unico SET visto=NOW() WHERE id=1 AND visto IS NULL RETURNING id');}
 async function iniciar(autor){
  await db.run(`WITH inicio AS (
    UPDATE facturas_repaso_unico SET estado='en_curso',iniciado=NOW(),autor=? WHERE id=1 AND estado='disponible' RETURNING id
  ), documentos AS (
    SELECT 'factura' AS origen,f.id AS documento_id,to_jsonb(f) AS guardado FROM facturas f
    UNION ALL SELECT 'pendiente',p.id,to_jsonb(p) FROM facturas_pendientes p WHERE p.descartado_en IS NULL
    UNION ALL SELECT 'recepcion',r.id,COALESCE(r.resultado->'datos','{}'::jsonb) || jsonb_build_object('local',r.local,'nombre',r.nombre,'file_hash',r.hash)
      FROM facturas_recepciones r WHERE r.estado NOT IN ('registrado','duplicado','descartado','sustituido')
      AND NOT EXISTS(SELECT 1 FROM facturas f WHERE f.file_hash=r.hash)
      AND NOT EXISTS(SELECT 1 FROM facturas_pendientes p WHERE p.file_hash=r.hash AND p.descartado_en IS NULL)
  ) , variedad AS (
    SELECT *, ROW_NUMBER() OVER(PARTITION BY origen,COALESCE(guardado->>'proveedor',''),COALESCE(guardado->>'local',''),COALESCE(guardado->>'tipo','') ORDER BY documento_id DESC) AS turno FROM documentos
  ) INSERT INTO facturas_repaso_documentos(origen,documento_id,guardado,orden)
    SELECT d.origen,d.documento_id,d.guardado,ROW_NUMBER() OVER(ORDER BY d.turno,d.documento_id DESC,d.origen) FROM variedad d CROSS JOIN inicio ON CONFLICT DO NOTHING`,[autor]);
  return estado();
 }
 async function controlar(accion,autor){
  const cambios={pausar:["estado='pausado'","estado='en_curso'"],continuar:["estado='en_curso'","estado='pausado'"],ampliar:["estado='en_curso',fase='completo'","estado='muestra_lista'"]};
  if(!cambios[accion])throw new Error('Acción no válida');
  const [set,where]=cambios[accion];
  await db.run(`UPDATE facturas_repaso_unico SET ${set},ultimo_control=?::jsonb WHERE id=1 AND ${where}`,[JSON.stringify({accion,autor,fecha:new Date().toISOString()})]);
  return estado();
 }
 async function paso(){
  return lock(async()=>{
   const trabajo=await estado();
   if(trabajo.estado!=='en_curso')return;
   const procesados=trabajo.total-Number(trabajo.contadores.pendiente||0)-Number(trabajo.contadores.leyendo||0);
   if(trabajo.fase==='muestra' && procesados>=Math.min(25,trabajo.total)){
    await db.run("UPDATE facturas_repaso_unico SET estado='muestra_lista' WHERE id=1 AND estado='en_curso'");return;
   }
   const f=await db.get("SELECT * FROM facturas_repaso_documentos WHERE estado IN ('pendiente','leyendo') ORDER BY orden NULLS LAST,documento_id,origen LIMIT 1");
   if(!f){await db.run("UPDATE facturas_repaso_unico SET estado='completado',terminado=NOW() WHERE id=1 AND estado='en_curso'");return;}
   await db.run("UPDATE facturas_repaso_documentos SET estado='leyendo',actualizado=NOW() WHERE origen=? AND documento_id=?",[f.origen,f.documento_id]);
   let resultado,estadoFinal;
   try {
    const archivo=await original(f);
    if(!archivo) {estadoFinal='sin_original';resultado={avisos:[{texto:'No se ha encontrado el original. No se ha podido verificar este documento.'}]};}
    else {
     let datos,avisos=[],segunda=null;
     try{datos=await leer(archivo.buffer,archivo.mimeType);}
     catch(e){if(!e.revisionDocumento)throw e;({datos,avisos,segunda}=e.resultado);}
     if(datos?.es_documento_compra===false)avisos.push({texto:'El lector no reconoce un documento de compra: comprobar original.'});
     if(f.origen!=='recepcion') {
      const anterior={...f.guardado,nif_proveedor:f.guardado.nif ?? f.guardado.nif_proveedor};
      // Solo comparar lo que se guardaba: los ajustes fiscales nuevos no existían en la tabla antigua.
      const nuevos={...datos};
      for(const k of ['retencion','recargo_equivalencia','otros_cargos','nif_receptor']) if(!Object.hasOwn(anterior,k)) delete nuevos[k];
      avisos.push(...compararLecturas(anterior,nuevos).map(a=>({...a,texto:`El dato guardado y la nueva lectura no coinciden en ${a.campo.replaceAll('_',' ')}.`})));
     }
     resultado={datos,segunda,avisos};estadoFinal=avisos.length?'revisar':'sin_discrepancias';
    }
   }catch{estadoFinal='error';resultado={avisos:[{texto:'No se pudo completar la comprobación por un fallo de acceso o lectura. No se ha considerado correcto ni se ha modificado.'}]};}
   const campos=(resultado.avisos||[]).map(a=>a.campo);
   const prioridad=campos.some(k=>['proveedor','nif_proveedor','nif_receptor','total','base_imponible','cuota_iva','iva_desglose'].includes(k))?0:campos.includes('fecha')?1:['error','sin_original'].includes(estadoFinal)?2:3;
   await db.run('UPDATE facturas_repaso_documentos SET estado=?,resultado=?::jsonb,prioridad=?,actualizado=NOW() WHERE origen=? AND documento_id=?',[estadoFinal,JSON.stringify(resultado),prioridad,f.origen,f.documento_id]);
  });
 }
 return {estado,visto,iniciar,controlar,paso};
}
