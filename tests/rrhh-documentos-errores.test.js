import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {registrarDocumentosMasivos} from '../src/modules/rrhh/documentos-masivos.js';
function rutasCon(pool,workers=async()=>[{id:1,nombre:'Prueba'}]){
 const rutas=new Map(),app={get:(p,...h)=>rutas.set('GET '+p,h.at(-1)),post:(p,...h)=>rutas.set('POST '+p,h.at(-1))};
 registrarDocumentosMasivos(app,{auth:()=>{},pool,upload:{},trabajadores:workers});
 return async(path,req={})=>{let status=200,data;await rutas.get('POST '+path)({user:{id:1,username:'prueba'},params:{id:'lote'},...req},{set(){},status(n){status=n;return this;},json(j){data=j;}});return {status,data};};
}
test('PDF dañado identifica archivo y fase sin acceder a almacenamiento',async()=>{
 const call=rutasCon({connect(){throw Error('no debe guardar');}});
 const r=await call('/api/rrhh/documentos-masivos',{files:[{originalname:'dañado.pdf',size:6,buffer:Buffer.from('no-pdf')}]});
 assert.equal(r.status,400);assert.equal(r.data.archivo,'dañado.pdf');assert.equal(r.data.etapa,'leer PDF');
});
test('error de base de datos indica fase y referencia sin exponer SQL',async()=>{
 const call=rutasCon({connect:async()=>{throw Object.assign(Error('SELECT datos privados'),{code:'42P01'});}});
 const r=await call('/api/rrhh/documentos-masivos/:id/guardar',{body:{documentos:[]}});
 assert.equal(r.status,503);assert.equal(r.data.etapa,'guardar documentos');assert.match(r.data.error,/servicio de documentos/);assert.ok(r.data.referencia);assert.doesNotMatch(JSON.stringify(r.data),/SELECT|privados/);
});
test('dos documentos del mismo trabajador se guardan y un fallo en el segundo revierte el lote',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const contenido=Buffer.from(await pdf.save());
 const paginas=['a','b'].map(id=>({id,huella:id,contenido}));
 for(const falla of [false,true]){
  const consultas=[];let archivos=0,documentos=0;
  const query=async(sql)=>{consultas.push(sql);if(sql.includes('SELECT * FROM rrhh_doc_lotes'))return {rows:[{id:'lote',estado:'revision'}]};if(sql.includes('SELECT * FROM rrhh_doc_paginas'))return {rows:paginas};if(sql.startsWith('INSERT INTO rrhh_doc_archivos')){archivos++;if(falla&&archivos===2)throw Object.assign(Error('disk internal data'),{code:'53100'});return {rows:[{id:'file'}]};}if(sql.startsWith('INSERT INTO hr_documentos')){documentos++;return {rows:[{id:documentos,worker_id:1,nombre:'Prueba.pdf'}]};}return {rows:[]};};
  const call=rutasCon({connect:async()=>({query,release(){}})});
  const r=await call('/api/rrhh/documentos-masivos/:id/guardar',{body:{documentos:paginas.map(p=>({paginas:[p.id],worker_id:1,tipo:'nomina',nombre:'Prueba.pdf'}))}});
  if(falla){assert.equal(r.status,503);assert.equal(r.data.documento,1);assert.equal(r.data.etapa,'guardar archivo');assert.ok(consultas.includes('ROLLBACK'));assert.ok(!consultas.includes('COMMIT'));assert.ok(!consultas.some(s=>s.startsWith('DELETE FROM rrhh_doc_paginas')));}else{assert.equal(r.status,200);assert.equal(r.data.guardados,2);assert.equal(documentos,2);assert.ok(consultas.includes('COMMIT'));}
 }
});
