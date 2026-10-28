import {guardarIvaLeido} from './iva.js';
import {createHash} from 'node:crypto';
export const CAMPOS_PAGINAS=['drive_url','drive_thumb','base_imponible','porcentaje_iva','cuota_iva','total','iva_desglose','iva_estado','iva_aviso','lineas_estado','lineas_aviso','lineas_leidas_en','lineas_version'];
const norm=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'');
export function validarComplemento(f,d){
 for(const [k,lectura] of [['tipo','tipo'],['numero_factura','numero_factura'],['nif','nif_proveedor'],['fecha','fecha']]){
  if(!norm(f[k])||!norm(d[lectura])||norm(f[k])!==norm(d[lectura]))throw new Error('La identidad del documento unido no coincide con la factura registrada. Revisa número, NIF y fecha antes de unir.');
 }
 for(const k of ['base_imponible','cuota_iva','total'])if(f[k]!=null&&(d[k]==null||Math.abs(Number(f[k])-Number(d[k]))>0.02))throw new Error('La lectura conjunta cambia los importes registrados. Revisa la factura antes de unir las páginas; no se ha modificado.');
}
export function huellaPaginas(f,lineas){return createHash('sha256').update(JSON.stringify([['tipo','local','proveedor','nif','fecha','numero_factura',...CAMPOS_PAGINAS].map(k=>f[k]??null),lineas])).digest('hex');}
// Mantiene el ID, pagos y vínculos de la factura. Google conserva también el archivo anterior.
export function crearCompletarPaginas({db,transaccion,leer,archivar,guardarLineas}){
 return async({a,b,p,buffer,autor})=>{
  const f=a.contexto?.facturaId ? await db.get('SELECT * FROM facturas WHERE id=? AND local=?',[a.contexto.facturaId,a.local]) : await db.get('SELECT * FROM facturas WHERE file_hash=? AND local=?',[a.hash,a.local]);
  if(!f)throw new Error('El primer documento aún no está asignado a una factura. Asígnalo antes de completar sus páginas.');
  const lineas=await db.all('SELECT * FROM factura_lineas WHERE factura_id=? ORDER BY id',[f.id]);
  const huella=huellaPaginas(f,lineas);
  const d=await leer(buffer,'application/pdf');
  validarComplemento(f,d);
  const driveUrl=await archivar(f,buffer);
  return transaccion(async tx=>{
   const actual=await tx.get('SELECT * FROM facturas WHERE id=? FOR UPDATE',[f.id]);
   const actuales=await tx.all('SELECT * FROM factura_lineas WHERE factura_id=? ORDER BY id',[f.id]);
   if(!actual||huellaPaginas(actual,actuales)!==huella)throw new Error('La factura se ha modificado durante la lectura. Vuelve a revisar la propuesta.');
   const propuesta=await tx.get('SELECT estado FROM facturas_paginas WHERE id=? FOR UPDATE',[p.id]);
   const recepcion=await tx.get('SELECT estado FROM facturas_recepciones WHERE id=? FOR UPDATE',[b.id]);
   if(propuesta?.estado!=='revision'||!['paginas','pendiente','revision','leyendo'].includes(recepcion?.estado))throw new Error('La propuesta ya se ha resuelto');
   await tx.run('UPDATE facturas SET drive_url=?,drive_thumb=NULL,base_imponible=COALESCE(base_imponible,?),porcentaje_iva=COALESCE(porcentaje_iva,?),cuota_iva=COALESCE(cuota_iva,?),total=COALESCE(total,?),sheet_synced=0 WHERE id=?',[driveUrl,d.base_imponible,d.porcentaje_iva,d.cuota_iva,d.total,f.id]);
   await tx.run('DELETE FROM factura_lineas WHERE factura_id=?',[f.id]);
   await guardarLineas(tx.run,f.id,{...d,tipo:f.tipo},new Date().toISOString());
   if(f.iva_estado!=='manual')await guardarIvaLeido({dbRun:tx.run},{...f,drive_url:driveUrl,base_imponible:f.base_imponible??d.base_imponible,cuota_iva:f.cuota_iva??d.cuota_iva,total:f.total??d.total},d.iva_desglose);
   const despues=await tx.get('SELECT * FROM facturas WHERE id=?',[f.id]);
   const nuevas=await tx.all('SELECT * FROM factura_lineas WHERE factura_id=? ORDER BY id',[f.id]);
   const pruebas={...p.pruebas,completada:{facturaId:f.id,recepcionAnterior:a.id,recepcionAnadida:b.id,antes:Object.fromEntries(CAMPOS_PAGINAS.map(k=>[k,f[k]])),lineas,huella:huellaPaginas(despues,nuevas)}};
   const nuevo=await tx.run(`INSERT INTO facturas_recepciones (clave,hash,canal,local,nombre,mime,original,estado,resultado,contexto)
    VALUES (?,?,?,?,'Factura completada.pdf','application/pdf',?,'registrado',?::jsonb,?::jsonb) RETURNING id`,['paginas-completadas:'+p.id,createHash('sha256').update(buffer).digest('hex'),a.canal,a.local,buffer,JSON.stringify({datos:d,driveUrl,facturaId:f.id}),JSON.stringify({...a.contexto,agrupacion:p.id,facturaId:f.id})]);
   await tx.run("UPDATE facturas_paginas SET estado='unidas',autor=?,destino=?,pruebas=?::jsonb,actualizado=NOW() WHERE id=?",[autor,nuevo.id,JSON.stringify(pruebas),p.id]);
   await tx.run("UPDATE facturas_recepciones SET estado='sustituido',error=NULL,resultado=?::jsonb,actualizado=NOW() WHERE id=ANY(?::bigint[])",[JSON.stringify({paginas:true,facturaId:f.id,driveUrl,recepcionId:nuevo.id}),[a.id,b.id]]);
   await tx.run('UPDATE facturas_avisos_grupo SET recepcion_id=? WHERE recepcion_id=ANY(?::bigint[])',[nuevo.id,[a.id,b.id]]);
   return {ok:true,facturaId:f.id};
  });
 };
}
