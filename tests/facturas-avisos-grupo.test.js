import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avisoReenvioFactura,citarOriginalFactura} from '../src/modules/facturas/tandas-whatsapp.js';
import {crearRecepcion} from '../src/modules/facturas/recepcion.js';

test('el reenvío solo se pide por una validación anterior a guardar el original',async()=>{
 const cola=crearRecepcion({db:{run:async()=>assert.fail('No debe guardar adjuntos rechazados')}});
 for(const [archivo,instruccion] of [
  [{buffer:Buffer.alloc(0),mimeType:'image/jpeg'},/Vuelve a enviar/],
  [{buffer:Buffer.alloc(20*1024*1024+1),mimeType:'application/pdf'},/hasta 20 MB/],
  [{buffer:Buffer.from('doc'),mimeType:'text/plain'},/como foto o PDF/],
 ]){
  await assert.rejects(cola.recibir(archivo),error=>{
   assert.match(avisoReenvioFactura(error),instruccion);
   return true;
  });
 }
 for(const error of [new Error('timeout'),{recibido:true},{permanente:true},{codigoOriginal:'toString'}]){
  assert.equal(avisoReenvioFactura(error),null);
 }
});

test('la cita conserva el mensaje original y reconstruye la miniatura',()=>{
 const citado={key:{id:'foto'},message:{imageMessage:{caption:'Original'}},miniatura:Buffer.from('foto').toString('base64')};
 const {quoted}=citarOriginalFactura(citado);
 assert.equal(quoted.key.id,'foto');
 assert.deepEqual(quoted.message.imageMessage.jpegThumbnail,Buffer.from('foto'));
 assert.equal(quoted.miniatura,undefined);
 assert.equal(citado.message.imageMessage.jpegThumbnail,undefined);
 assert.deepEqual(citarOriginalFactura(null),{});
});
