import {controlesLectura} from './validacion-lectura.js';

export const CAMPOS_HISTORICO=['tipo','proveedor','nif','fecha','numero_factura','base_imponible','porcentaje_iva','cuota_iva','total'];
const importes=new Set(['base_imponible','porcentaje_iva','cuota_iva','total']);
const tablas={factura:'facturas',pendiente:'facturas_pendientes',recepcion:'facturas_recepciones'};
const fallo=(mensaje,status=400)=>Object.assign(new Error(mensaje),{status});
export function cabeceraHistorica(f){
 return Object.fromEntries(CAMPOS_HISTORICO.map(k=>[k,f[k]==null||f[k]===''?null:importes.has(k)?Number(f[k]):String(f[k])]));
}
// La misma transacción guarda el cambio y su prueba. Si falla la auditoría no se cambia la factura.
export function crearDecisionesHistorico({transaccion,prepararFecha=async()=>null}){
 return async function decidir({origen,id,body,autor}){
  if(!tablas[origen]||!/^\d+$/.test(String(id)))throw fallo('Documento no válido');
  if(body.confirmado!==true||!['conservar','corregir'].includes(body.decision))throw fallo('Confirma la decisión después de consultar el original');
  const motivo=String(body.motivo||'').trim();
  if(motivo.length<5||motivo.length>2000)throw fallo('Explica qué has comprobado (entre 5 y 2.000 caracteres)');
  return transaccion(async db=>{
   const item=await db.get('SELECT * FROM facturas_repaso_documentos WHERE origen=? AND documento_id=? FOR UPDATE',[origen,id]);
   if(!item||!['revisar','error','sin_original','sin_discrepancias'].includes(item.estado))throw fallo('Este documento no está pendiente de revisión',409);
   if(item.revision_humana)throw fallo('Este documento ya se revisó. Actualiza la lista.',409);
   const antes=await db.get(`SELECT * FROM ${tablas[origen]} WHERE id=? FOR UPDATE`,[id]);
   if(!antes||antes.descartado_en)throw fallo('El documento ya no está disponible en esta bandeja',409);
   if(origen==='recepcion' && body.decision==='corregir')throw fallo('Corrige y registra esta recepción desde Documentos recibidos');
   const actual=origen==='recepcion'?antes.resultado?.datos||{}:cabeceraHistorica(antes);
   if(JSON.stringify(actual)!==JSON.stringify(body.esperado))throw fallo('El documento cambió mientras lo revisabas. Ábrelo de nuevo antes de guardar.',409);
   let despues=antes;
   if(body.decision==='corregir'){
    const cambios=body.campos;
    if(!cambios||CAMPOS_HISTORICO.some(k=>!Object.hasOwn(cambios,k)))throw fallo('Faltan campos de la cabecera');
    for(const k of CAMPOS_HISTORICO){
     const v=cambios[k];
     if(v!==null && (importes.has(k)?typeof v!=='number'||!Number.isFinite(v):typeof v!=='string'||v.length>300))throw fallo('Campo no válido: '+k);
    }
    const datos={...cabeceraHistorica(cambios),nif_proveedor:cambios.nif};
    if(!datos.proveedor?.trim()||!['factura','ticket','albaran','otro'].includes(datos.tipo)||!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha||'')||!Number.isFinite(Date.parse(datos.fecha))||new Date(datos.fecha).toISOString().slice(0,10)!==datos.fecha)throw fallo('Comprueba proveedor, tipo y fecha de emisión');
    const avisos=controlesLectura(datos);
    if(avisos.length && body.excepcion!==true)throw fallo('Persisten avisos. Comprueba el original y confirma la excepción: '+avisos.map(a=>a.texto).join(' '));
    const sets=CAMPOS_HISTORICO.map(k=>`${k}=?`),vals=CAMPOS_HISTORICO.map(k=>datos[k]);
    if(origen==='factura'){
     sets.push('sheet_synced=0');
     if(['base_imponible','cuota_iva','total','porcentaje_iva'].some(k=>datos[k]!==cabeceraHistorica(antes)[k])){
      sets.push("iva_estado='revisar'","iva_aviso='Cabecera corregida en el repaso: revisar desglose de IVA y detalle de productos.'");
     }
     if(datos.fecha!==antes.fecha){
      const venc=await prepararFecha(db,antes,datos.fecha);
      if(venc){sets.push('vencimiento=?','vencimiento_origen=?');vals.push(venc.vencimiento,venc.origen);}
     }
    }
    vals.push(id);
    despues=await db.run(`UPDATE ${tablas[origen]} SET ${sets.join(',')} WHERE id=? RETURNING *`,vals);
   }
   const registro=await db.run('INSERT INTO facturas_repaso_decisiones(origen,documento_id,autor,decision,motivo,antes,despues) VALUES(?,?,?,?,?,?::jsonb,?::jsonb) RETURNING id,fecha',[origen,id,autor,body.decision,motivo,JSON.stringify({...antes,original:undefined}),JSON.stringify({...despues,original:undefined})]);
   await db.run('UPDATE facturas_repaso_documentos SET revision_humana=?::jsonb WHERE origen=? AND documento_id=?',[JSON.stringify({...registro,autor,decision:body.decision,motivo,excepcion:body.excepcion===true}),origen,id]);
   return {antes,despues,origen,decision:body.decision};
  });
 };
}
