import {createHash} from 'node:crypto';
const numeros=new Set(['base_imponible','porcentaje_iva','cuota_iva','total']);
const campos=['proveedor','nif','tipo','fecha','numero_factura','base_imponible','porcentaje_iva','cuota_iva','total','concepto','vencimiento','vencimiento_origen'];
export function huellaRevision(f){
 return createHash('sha256').update(JSON.stringify(campos.map(k=>numeros.has(k)?f[k]==null||f[k]===''?null:Number(f[k]):String(f[k]??'')))).digest('hex');
}
export function decisionAvisos(f,avisos,autor){return {huella:huellaRevision(f),avisos:[...new Set(avisos.map(String))],autor,fecha:new Date().toISOString()};}
export function avisosAceptados(f,decision){return decision?.huella===huellaRevision(f)&&Array.isArray(decision.avisos)?decision.avisos:[];}
export async function guardarDecisionAvisos(dbRun,id,decision){
 await dbRun('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['contabilidad_revision_'+id,JSON.stringify(decision)]);
}

// También detecta cambios hechos desde otros editores o importaciones, no solo desde la ficha.
export async function reabrirHistoricoModificado(dbRun){
 for(const [origen,tabla] of [['factura','facturas'],['pendiente','facturas_pendientes']]){
  await dbRun(`UPDATE facturas_repaso_documentos d SET revision_humana=NULL,estado='revisar',
   resultado=jsonb_build_object('avisos',jsonb_build_array(jsonb_build_object('texto','Los datos cambiaron después de la revisión. Comprueba el documento actual.')))
   FROM ${tabla} f,facturas_repaso_decisiones h
   WHERE d.origen=? AND f.id=d.documento_id AND h.id::text=d.revision_humana->>'id'
   AND EXISTS(SELECT 1 FROM jsonb_each_text(h.despues) e
    WHERE e.key IN ('proveedor','nif','fecha','numero_factura','tipo','base_imponible','porcentaje_iva','cuota_iva','total')
    AND CASE WHEN e.key IN ('base_imponible','porcentaje_iva','cuota_iva','total')
     THEN NULLIF(e.value,'')::numeric IS DISTINCT FROM NULLIF(to_jsonb(f)->>e.key,'')::numeric
     ELSE COALESCE(e.value,'') IS DISTINCT FROM COALESCE(to_jsonb(f)->>e.key,'') END)`,[origen]);
 }
}
