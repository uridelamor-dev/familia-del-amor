export async function resolverDuplicado(q,{id,accion,autor,locales=[]}) {
 if(!['duplicada','distinta','conservar_nueva'].includes(accion))throw Error('Elige qué factura conservar o indica que las dos son válidas.');
 const primera=(await q('SELECT id,dup_de FROM facturas WHERE id=$1',[id])).rows[0];
 if(!primera)throw Error('Factura no encontrada.');
 const filas=(await q('SELECT * FROM facturas WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[[Number(id),primera.dup_de].filter(Boolean)])).rows;
 const f=filas.find(x=>Number(x.id)===Number(id)),original=filas.find(x=>Number(x.id)===Number(f?.dup_de));
 if(!f||f.dup_estado!=='duda'||f.dup_resuelto_en)throw Error('Esta coincidencia ya está resuelta. Actualiza la lista.');
 if(f.dup_de!==primera.dup_de)throw Error('La coincidencia ha cambiado. Vuelve a revisarla.');
 if(locales.length&&!locales.includes(f.local))throw Error('Sin acceso a este local.');
 if(accion!=='distinta'&&(!original||original.dup_estado==='duda'||locales.length&&!locales.includes(original.local)))throw Error('La factura anterior no está disponible para elegir cuál conservar.');
 const fecha=new Date().toISOString();
 // Las descartadas conservan original e historial y siguen excluidas de los totales
 // mediante el estado de revisión existente. resuelto_en las retira de la bandeja.
 const descartada=accion==='duplicada'?f:accion==='conservar_nueva'?original:null;
 if(descartada)await q("UPDATE facturas SET dup_estado='duda',dup_resuelto_por=$1,dup_resuelto_en=$2,sheet_synced=0 WHERE id=$3",[autor,fecha,descartada.id]);
 if(accion!=='duplicada')await q("UPDATE facturas SET dup_estado='distinta',dup_resuelto_por=$1,dup_resuelto_en=$2,sheet_synced=0 WHERE id=$3",[autor,fecha,f.id]);
 await q('INSERT INTO config(key,value) VALUES ($1,$2)',['duplicado_decision_'+f.id+'_'+Date.now(),JSON.stringify({autor,fecha,accion,antes:filas})]);
 await q("INSERT INTO config(key,value) VALUES ('facturas_anuales_reintentar',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[fecha]);
 return {mensaje:accion==='distinta'?'Las dos facturas se conservan y cuentan en los totales.':accion==='conservar_nueva'?'Se conserva la nueva factura. La anterior queda excluida de los totales.':'Se conserva la factura anterior. La nueva queda excluida de los totales.',afectadas:filas};
}
