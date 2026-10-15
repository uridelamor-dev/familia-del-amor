// Los identificadores públicos no revelan la referencia de compra.
export const idPublico=id=>String(id).replace(/^cerezo-2026-/, 'lot-nadal-');
export function datosPublicos(value){
 if(Array.isArray(value))return value.map(datosPublicos);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['source','sourceUrl','sourceCatalog','sourcePage','supplierReference','costCents','costEstimated','marginBps','marginCheck'].includes(k)).map(([k,v])=>[k,datosPublicos(v)]));
 if(typeof value==='string')return value.replace(/cerezo-2026-/g,'lot-nadal-');
 return value;
}
export function pedidoInterno(s,b){return {...b,lineas:b.lineas?.map(l=>({...l,id:s.catalog.find(p=>idPublico(p.id)===l.id)?.id||l.id}))};}
