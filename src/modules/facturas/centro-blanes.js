import {canonizarLocal} from './local-canonico.js';

export const CENTRO_BLANES = 'La Tapeta - Blanes';
export const esAliasBlanes = local => local !== CENTRO_BLANES && canonizarLocal(local) === CENTRO_BLANES;

// Ejecutar dentro de una transacción. Solo corrige alias conocidos del centro compartido;
// conserva el grupo, los documentos y una copia de su asociación anterior.
export async function normalizarCentroBlanes(q) {
  const cambios = {};
  for (const tabla of ['facturas','facturas_grupos']) {
    const rows=(await q(`SELECT id,local FROM ${tabla} ORDER BY id`)).rows;
    cambios[tabla]=rows.filter(r=>esAliasBlanes(r.local));
  }
  const total=Object.values(cambios).reduce((n,r)=>n+r.length,0);
  if(!total)return {facturas:0,grupos:0};
  await q("INSERT INTO config(key,value) VALUES ($1,$2)",['normalizacion_blanes_'+Date.now(),JSON.stringify({fecha:new Date().toISOString(),destino:CENTRO_BLANES,cambios})]);
  for(const [tabla,rows] of Object.entries(cambios)) {
    for(const r of rows) await q(`UPDATE ${tabla} SET local=$1${tabla==='facturas'?',sheet_synced=0':''} WHERE id=$2 AND local=$3`,[CENTRO_BLANES,r.id,r.local]);
  }
  await q("INSERT INTO config(key,value) VALUES ('facturas_anuales_reintentar',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[new Date().toISOString()]);
  return {facturas:cambios.facturas.length,grupos:cambios.facturas_grupos.length};
}
