import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {configurarBloqueoDrive,sincronizarArchivo,reintentarArchivos} from '../../src/modules/facturas/drive-sync.js';
afterEach(()=>configurarBloqueoDrive(null));
function entorno(){
 const row={id:1,local:'Girona',drive_url:'pdf',drive_revision:2,drive_revision_sync:1};
 configurarBloqueoDrive(async(id,fn)=>fn());
 const deps={dbGet:async()=>({...row}),dbAll:async()=>row.drive_revision_sync<row.drive_revision?[{id:1}]:[],dbRun:async(sql,p)=>{if(sql.includes('SET drive_revision_sync')&&row.drive_revision===p[2]){row.drive_revision_sync=p[0];return {id:row.id};}}};
 return {row,deps};
}
test('fallo Google persiste y el siguiente ciclo mueve los datos actuales',async()=>{
 const {row,deps}=entorno();
 const mover=async()=>{throw new Error('Google temporalmente inaccesible');};
 const r=await sincronizarArchivo(deps,1,mover);assert.equal(r.movido,false);assert.equal(row.drive_revision_sync,1);
 // Representa un reinicio: la cola se reconstruye exclusivamente desde BD.
 row.local='Lloret';row.drive_revision++;
 const result=await reintentarArchivos(deps,f=>sincronizarArchivo(deps,f.id,async actual=>{assert.equal(actual.local,'Lloret');return {movido:true};}));
 assert.equal(result.fallidos,0);assert.equal(row.drive_revision_sync,3);
 assert.equal((await reintentarArchivos(deps,()=>assert.fail('No debe repetirse'))).revisados,0);
});
test('edición durante el movimiento no se marca como sincronizada prematuramente',async()=>{
 const {row,deps}=entorno();
 const resultado=await sincronizarArchivo(deps,1,async()=>{row.local='Blanes';row.drive_revision++;return {movido:true};});
 assert.equal(resultado.movido,false);assert.match(resultado.motivo,/pendiente de reintento/);
 assert.equal(row.drive_revision_sync,1);
 await sincronizarArchivo(deps,1,async f=>{assert.equal(f.local,'Blanes');return {movido:true};});
 assert.equal(row.drive_revision_sync,3);
});
test('un archivo ya bien ubicado se confirma; un fallo de permisos permanece pendiente',async()=>{
 const {row,deps}=entorno();
 await sincronizarArchivo(deps,1,async()=>({movido:false,motivo:'Sin permisos'}));assert.equal(row.drive_revision_sync,1);
 await sincronizarArchivo(deps,1,async()=>({movido:false,motivo:'ya estaba en su sitio'}));assert.equal(row.drive_revision_sync,2);
});
test('bloqueo ocupado no mueve ni confirma una revisión',async()=>{
 const {row,deps}=entorno();configurarBloqueoDrive(async()=>{throw new Error('ocupado');});
 await sincronizarArchivo(deps,1,()=>assert.fail('No debe mover'));assert.equal(row.drive_revision_sync,1);
});

test('una excepción individual no abandona los documentos siguientes',async()=>{
 const ids=[];const resultado=await reintentarArchivos({dbAll:async()=>[{id:1},{id:2}]},async f=>{ids.push(f.id);if(f.id===1)throw new Error('fallo temporal');return {movido:true};});
 assert.deepEqual(ids,[1,2]);assert.deepEqual(resultado,{revisados:2,fallidos:1});
});
test('fallo al confirmar en BD no presenta el movimiento como sincronizado',async()=>{
 const {row,deps}=entorno();const ejecutar=deps.dbRun;deps.dbRun=async(sql,p)=>{if(sql.includes('SET drive_revision_sync'))throw new Error('BD no disponible');return ejecutar(sql,p);};
 const resultado=await sincronizarArchivo(deps,1,async()=>({movido:true}));
 assert.equal(resultado.movido,false);assert.equal(row.drive_revision_sync,1);
});
