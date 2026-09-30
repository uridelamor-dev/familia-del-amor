import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listarPaginas,canalFactura} from '../../src/modules/facturas/recepcion.js';
test('recorre páginas de Google aunque la primera ya estuviera procesada',async()=>{
 const llamadas=[];
 const filas=await listarPaginas('https://example.invalid/files?pageSize=100','ficticio','files',async url=>{
  llamadas.push(url);return {ok:true,json:async()=>new URL(url).searchParams.get('pageToken')==='siguiente'?{files:[{id:'nuevo'}]}:{files:[{id:'viejo'}],nextPageToken:'siguiente'}};
 });
 assert.deepEqual(filas.map(f=>f.id),['viejo','nuevo']);assert.equal(llamadas.length,2);
});
test('una página fallida no parece una lista completa',async()=>{
 await assert.rejects(listarPaginas('https://example.invalid','x','messages',async()=>({ok:false,status:503,json:async()=>({error:{}})})),/503/);
});
test('conserva la procedencia al asignar facturas pendientes',()=>{
 assert.equal(canalFactura('manual'),'Manual');assert.equal(canalFactura('email'),'Email');assert.equal(canalFactura('Drive'),'Drive');assert.equal(canalFactura('WhatsApp'),'WhatsApp');
});
