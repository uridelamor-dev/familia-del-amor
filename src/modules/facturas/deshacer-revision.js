import {randomUUID} from 'node:crypto';
const TIPOS={duplicado:{tabla:'facturas',campos:['dup_estado','dup_de','dup_motivos','dup_resuelto_por','dup_resuelto_en']},descarte:{tabla:'facturas_pendientes',campos:['descartado_en','descartado_por']}};
const estable=f=>JSON.stringify(Object.fromEntries(Object.entries(f).filter(([k])=>!['sheet_synced','sheet_id'].includes(k)).sort(([a],[b])=>a.localeCompare(b))));
export async function guardarDeshacerRevision(q,{tipo,antes,autor}) {
 const regla=TIPOS[tipo];if(!regla)throw Error('Acción no reversible');
 const ids=antes.map(f=>f.id);
 const despues=(await q(`SELECT * FROM ${regla.tabla} WHERE id=ANY($1::int[]) ORDER BY id`,[ids])).rows;
 const token=randomUUID();
 await q('INSERT INTO config(key,value) VALUES($1,$2)',['revision_deshacer_'+token,JSON.stringify({tipo,antes,despues,autor,fecha:new Date().toISOString()})]);
 return token;
}
export async function deshacerRevision(q,{token,autor,puedeAcceder}) {
 if(!/^[0-9a-f-]{36}$/.test(String(token)))throw Error('Acción no válida');
 const key='revision_deshacer_'+token;
 const registro=(await q('SELECT value FROM config WHERE key=$1 FOR UPDATE',[key])).rows[0];
 if(!registro)throw Error('Esta acción ya no está disponible');
 const d=JSON.parse(registro.value),regla=TIPOS[d.tipo];
 if(!regla || d.autor!==autor)throw Error('Solo puede deshacerlo quien tomó la decisión');
 if(d.deshecha)throw Error('Ya se ha deshecho');
 const actuales=(await q(`SELECT * FROM ${regla.tabla} WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE`,[d.antes.map(f=>f.id)])).rows;
 if(actuales.length!==d.antes.length)throw Error('Un documento ya no existe. No se puede deshacer');
 for(const f of actuales){
  if(!puedeAcceder(f,d.tipo))throw Error('Sin acceso a este documento');
  if(estable(f)!==estable(d.despues.find(x=>x.id===f.id)||{}))throw Error('El documento cambió después de esta decisión. Revísalo antes de deshacer');
 }
 for(const f of d.antes)await q(`UPDATE ${regla.tabla} SET ${regla.campos.map((k,i)=>`${k}=$${i+1}`).join(',')}${d.tipo==='duplicado'?',sheet_synced=0':''} WHERE id=$${regla.campos.length+1}`,[...regla.campos.map(k=>f[k]??null),f.id]);
 d.deshecha=new Date().toISOString();
 await q('UPDATE config SET value=$1 WHERE key=$2',[JSON.stringify(d),key]);
 if(d.tipo==='duplicado')await q("INSERT INTO config(key,value) VALUES('facturas_anuales_reintentar',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[d.deshecha]);
 return {tipo:d.tipo,afectadas:actuales};
}
