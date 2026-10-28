import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nombreLote,buscarTrabajadores,renombrarLote} from '../public/panel/documentos-lote.mjs';
import {nombreDocumento,asociarTrabajador} from '../src/modules/rrhh/documentos-masivos.js';
test('renombrar coincide con el servidor y conserva el mes elegido para pendientes',()=>{
 const docs=[{seleccionado:true,worker_id:'1',nombre:'original.pdf'},{seleccionado:true,worker_id:'',nombre:'pendiente.pdf'},{seleccionado:false,worker_id:1,nombre:'sin cambios.pdf'}];
 const workers=[{id:1,nombre:'María / Prueba'}];
 assert.deepEqual(renombrarLote(docs,workers,'2026-11'),{cambiados:1,pendientes:1});
 assert.equal(docs[0].nombre,nombreDocumento('2026-11',workers[0].nombre));
 assert.equal(docs[1].mes,'2026-11');assert.equal(docs[1].autoNombre,true);assert.equal(docs[1].nombre,'pendiente.pdf');
 assert.equal(docs[2].nombre,'sin cambios.pdf');
 assert.throws(()=>renombrarLote(docs,workers,'2026-00'));
 assert.equal(nombreLote(docs[1].mes,'Ana Prueba'),'Noviembre 2026 - Ana Prueba.pdf');
});
test('selector busca sin acentos, por palabras y por local, conserva homónimos',()=>{
 const workers=[{id:1,nombre:'María Prueba',local:'Blanes'},{id:2,nombre:'María Prueba',local:'Girona'},{id:3,nombre:'Ana Pérez',local:'Girona'}];
 assert.deepEqual(buscarTrabajadores(workers,'prueba maria',['2']).map(w=>w.id),[2,1]);
 assert.deepEqual(buscarTrabajadores(workers,'maria girona').map(w=>w.id),[2]);
 assert.equal(buscarTrabajadores(workers,'nadie').length,0);
});
test('coincidencias completas se asignan y los homónimos quedan pendientes',()=>{
 const w=[{id:'7',nombre:'María Dolores Prueba',dni:''}];
 assert.equal(asociarTrabajador({nombre:'PRUEBA, MARIA DOLORES',hayTexto:true},w).worker_id,'7');
 assert.equal(asociarTrabajador({nombre:'PRUEBA, MARIA DOLORES',hayTexto:true},[...w,{id:8,nombre:w[0].nombre}]).worker_id,null);
});
test('la revisión marca cada campo incorrecto y permite continuar con 35 de 40 páginas',async()=>{
 const {erroresRevision}=await import('../public/panel/documentos-lote.mjs');
 const docs=Array.from({length:40},(_,i)=>({seleccionado:true,worker_id:i<35?1:'',nombre:'Octubre - Prueba.pdf'}));
 const workers=[{id:1,nombre:'Prueba'}];
 assert.deepEqual(erroresRevision(docs,workers).map(e=>e.i),[35,36,37,38,39]);
 docs.slice(35).forEach(d=>d.seleccionado=false);
 assert.deepEqual(erroresRevision(docs,workers),[]);
 docs[0].nombre='../archivo.pdf';docs[1].nombre='';docs[2].worker_id=99;
 assert.deepEqual(erroresRevision(docs,workers).map(e=>[e.i,e.campo]),[[0,'nombre'],[1,'nombre'],[2,'trabajador']]);
});
test('varios documentos para el mismo trabajador no son un error aunque tengan igual nombre',async()=>{
 const {erroresRevision}=await import('../public/panel/documentos-lote.mjs');
 const docs=[{seleccionado:true,worker_id:1,nombre:'original-a.pdf'},{seleccionado:true,worker_id:1,nombre:'original-b.pdf'}];
 const workers=[{id:1,nombre:'Ana Prueba'}];
 assert.deepEqual(renombrarLote(docs,workers,'2026-10'),{cambiados:2,pendientes:0});
 assert.equal(docs[0].nombre,docs[1].nombre);
 assert.deepEqual(erroresRevision(docs,workers),[]);
});
test('errores de recepción distinguen tamaño, servidor no disponible y contexto de documento',async()=>{
 const {validarArchivosLote,leerRespuestaLote}=await import('../public/panel/documentos-lote.mjs');
 assert.throws(()=>validarArchivosLote([]),/Selecciona/);
 assert.throws(()=>validarArchivosLote([{name:'grande.pdf',size:16*1024*1024}]),/grande.pdf/);
 assert.throws(()=>validarArchivosLote(Array(4).fill({name:'archivo.pdf',size:14*1024*1024})),/50 MB/);
 assert.throws(()=>validarArchivosLote(Array(11).fill({name:'archivo.pdf',size:1})),/10 archivos/);
 await assert.rejects(leerRespuestaLote(new Response('HTML',{status:413})),/tamaño/);
 await assert.rejects(leerRespuestaLote(new Response('HTML',{status:504})),/servidor/);
 await assert.rejects(leerRespuestaLote(new Response(JSON.stringify({ok:false,error:'Firma incorrecta',etapa:'preparar firma',documento:2,campo:'firma'}),{status:400})),e=>e.documento===2&&e.campo==='firma'&&e.etapa==='preparar firma');
});
