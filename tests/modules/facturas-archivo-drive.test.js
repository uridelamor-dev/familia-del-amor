import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {rutaArchivo,nombreArchivo,carpetaDocumento,moverVerificado,respaldoDatos} from '../../src/modules/facturas/archivo-drive.js';
const original=globalThis.fetch;afterEach(()=>globalThis.fetch=original);
test('empresa/año/mes/local y nombre con ID; nunca inventa fecha',async()=>{
 const f={id:182,empresa:'Empresa SL',local:'Girona',fecha:'2026-10-05',numero_factura:'F/123',proveedor:'Distribuidor'};
 assert.deepEqual(rutaArchivo(f),['Empresa SL','2026','10 · Octubre','Girona']);
 assert.equal(nombreArchivo(f),'2026-10-05 · Documento · Distribuidor · F-123 · Girona · ID-182.pdf');
 assert.deepEqual(rutaArchivo({...f,fecha:null}).slice(1,3),['Sin fecha','Por revisar']);
 assert.equal(rutaArchivo({...f,fecha:'2026-02-31'})[1],'Sin fecha');
 const ruta=[];await carpetaDocumento('t','root',f,async(t,n,p)=>{ruta.push([n,p]);return n;});
 assert.equal(ruta[1][1],'Empresa SL');assert.equal(ruta[3][1],'10 · Octubre');
});
test('movimiento preserva ID y contenido y guarda primero la ubicación original',async()=>{
 const calls=[];let meta={id:'pdf',name:'antes.pdf',parents:['antigua'],md5Checksum:'hash',size:'123'};
 globalThis.fetch=async(url,opt={})=>{calls.push(opt.method||'GET');if(opt.method==='PATCH')meta={...meta,name:JSON.parse(opt.body).name,parents:['nueva']};return {ok:true,json:async()=>({...meta})};};
 const deps={dbRun:async(sql,p)=>{calls.push('DIARIO');assert.equal(JSON.parse(p[1]).name,'antes.pdf');}};
 assert.equal(await moverVerificado('t',deps,'pdf','nueva','despues.pdf'),true);
 assert.deepEqual(calls,['GET','DIARIO','PATCH','GET']);
 assert.equal(await moverVerificado('t',deps,'pdf','nueva','despues.pdf'),false);
});
test('no declara verificado un archivo cuyo contenido difiere',async()=>{
 let n=0;
 globalThis.fetch=async()=>({ok:true,json:async()=>({id:'pdf',name:'x.pdf',parents:[++n===1?'vieja':'nueva'],md5Checksum:n===1?'original':'distinto'})});
 await assert.rejects(moverVerificado('t',{dbRun:async()=>{}},'pdf','nueva'),/verificar/);
});
test('el respaldo incluye líneas y se comprueba descargándolo de nuevo',async()=>{
 let contenido;const rows=[{id:1,total:12}],lineas=[{id:2,factura_id:1,descripcion:'Producto'}];
 globalThis.fetch=async(url,opt={})=>{
  let d;
  if(String(url).includes('alt=media'))d=JSON.parse(contenido);
  else if(String(url).includes('upload/')){contenido=opt.body.split('Content-Type: application/json\r\n\r\n')[2].split('\r\n--')[0];d={id:'backup'};}
  else if(opt.method==='POST')d={id:'carpeta'};else d={files:[]};
  return {ok:true,json:async()=>d};
 };
 assert.equal(await respaldoDatos('t',{dbAll:async()=>lineas},'root',rows),'backup');
 assert.deepEqual(JSON.parse(contenido),{version:1,facturas:rows,lineas});
});

test('fecha imposible tampoco se publica como válida en el nombre',()=>{
 assert.match(nombreArchivo({id:1,fecha:'2026-02-31'}),/^Sin fecha ·/);
});
test('metadatos incompletos o papelera nunca permiten confirmar ni mover',async()=>{
 for(const meta of [{name:'final.pdf',parents:['destino']},{id:'pdf',name:'final.pdf',parents:['destino'],trashed:true}]){
  let llamadas=0;globalThis.fetch=async()=>{llamadas++;return {ok:true,json:async()=>meta};};
  await assert.rejects(moverVerificado('t',{dbRun:async()=>assert.fail('No diario inválido')},'pdf','destino','final.pdf'),/verificar el archivo original/);
  assert.equal(llamadas,1);
 }
});
test('PATCH aplicado pero lectura de comprobación fallida sigue siendo error reintentable',async()=>{
 let meta={id:'pdf',name:'antes.pdf',parents:['vieja'],size:'123'};let llamadas=0;
 globalThis.fetch=async(url,opt={})=>{llamadas++;if(opt.method==='PATCH')meta={...meta,name:'final.pdf',parents:['destino']};if(llamadas===3)throw new Error('red temporal');return {ok:true,json:async()=>({...meta})};};
 await assert.rejects(moverVerificado('t',{dbRun:async()=>{}},'pdf','destino','final.pdf'),/red temporal/);
 assert.equal(await moverVerificado('t',{dbRun:async()=>assert.fail('Ya aplicado')},'pdf','destino','final.pdf'),false);
});

test('no confirma una ubicación parcial que conserva otro padre',async()=>{
 let n=0;globalThis.fetch=async()=>({ok:true,json:async()=>({id:'pdf',name:'x.pdf',parents:++n===1?['vieja']:['nueva','vieja']})});
 await assert.rejects(moverVerificado('t',{dbRun:async()=>{}},'pdf','nueva','x.pdf'),/verificar/);
});
