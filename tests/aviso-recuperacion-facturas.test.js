import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {avisoReenvioFactura,citarOriginalFactura} from '../src/modules/facturas/tandas-whatsapp.js';
import {canonico as localCentro} from '../src/modules/locales/centros.js';

test('recuperar adjuntos tras publicar no envía avisos de reconexión y conserva el vínculo con el original', async () => {
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const inicio=source.indexOf('  setOnGroupAttachment(async (');
 const fin=source.indexOf('\n  initWhatsApp();',inicio);
 assert.ok(inicio>0 && fin>inicio);
 const envios=[], registrados=[];
 class FacturaDuplicadaError extends Error {}
 let recibir;
 vm.runInNewContext(source.slice(inicio,fin),{
  setOnGroupAttachment: fn=>{recibir=fn;},
  dbGet:async()=>({local:'Oficina'}),dbAll:async()=>[],dbRun:async()=>{},
  canonizarLocal:l=>l, localCentro, console:{log(){},warn(){},error(){}},
  FacturaDuplicadaError,avisoReenvioFactura,citarOriginalFactura,
  getDriveAccessToken:async()=>'',
  tandasFacturas:{registrar:async o=>registrados.push(o)},
  sendMensajeAGrupo:async(...args)=>envios.push(args),
  procesarFactura:async o=>{
   if(o.filename==='rechazado')throw Object.assign(new Error('Formato'),{codigoOriginal:'formato'});
   if(o.filename==='incierto')throw new Error('timeout');
   if(o.filename==='duplicado')throw new FacturaDuplicadaError();
   await o.onDocumentoGuardado(42);
   if(o.onRecibido)await o.onRecibido(42);
   return {id:42};
  }
 });
 for(const recuperado of [true,true,false]) await recibir({groupJid:'grupo',mensajeId:'doc'+registrados.length,citado:{},recuperado});
 assert.equal(envios.length,0);
 assert.equal(registrados.length,3,'los documentos nuevos y recuperados conservan su referencia de WhatsApp');
 const citado={key:{id:'1'},message:{conversation:'Original'}};
 await recibir({groupJid:'grupo',filename:'rechazado',citado,recuperado:true});
 await recibir({groupJid:'grupo',filename:'incierto',citado});
 await recibir({groupJid:'grupo',filename:'duplicado',citado});
 assert.equal(envios.length,0);
 await recibir({groupJid:'grupo',filename:'rechazado',citado});
 assert.equal(envios.length,1);
 assert.match(envios[0][1],/Necesitamos que reenvíes/);
 assert.deepEqual(envios[0][2].quoted,citado);
});
