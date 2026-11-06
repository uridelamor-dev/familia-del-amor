import {nifComprobable} from './contraste-dirigido.js';
import {normNif} from './emisor.js';
// Solo identidad fiscal confirmada; jamás aprende importes, fechas o porcentajes.
export async function recordarProveedorRevision(q,datos,autor) {
 const nif=normNif(datos.nif_proveedor || datos.nif),proveedor=String(datos.proveedor||'').trim();
 if(!proveedor || !nifComprobable(nif) || !autor)return false;
 const propias=(await q('SELECT cif FROM facturas_locales')).rows;
 if(propias.some(f=>normNif(f.cif)===nif))return false;
 await q('SELECT pg_advisory_xact_lock(hashtext($1))',['revision-proveedor-'+nif]);
 const existentes=(await q('SELECT proveedor FROM facturas_proveedor_alias WHERE nif=$1',[nif])).rows;
 if(existentes.some(f=>f.proveedor.trim().toLocaleLowerCase()!==proveedor.toLocaleLowerCase()))return false;
 await q(`INSERT INTO facturas_proveedor_alias(clave,nif,proveedor,autor,creado_en) VALUES($1,$2,$3,$4,$5) ON CONFLICT(clave) DO NOTHING`,['revision-nif-'+nif,nif,proveedor,autor,new Date().toISOString()]);
 return true;
}
