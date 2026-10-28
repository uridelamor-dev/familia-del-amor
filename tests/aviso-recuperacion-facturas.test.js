import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('recuperar adjuntos tras publicar no envía avisos de reconexión y conserva las tandas', async () => {
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const inicio=source.indexOf('  setOnGroupAttachment(async (');
 const fin=source.indexOf('\n  initWhatsApp();',inicio);
 assert.ok(inicio>0 && fin>inicio);
 const envios=[], registrados=[];
 let recibir;
 vm.runInNewContext(source.slice(inicio,fin),{
  setOnGroupAttachment: fn=>{recibir=fn;},
  dbGet:async()=>({local:'Oficina'}),dbAll:async()=>[],dbRun:async()=>{},
  canonizarLocal:l=>l, console:{log(){},warn(){},error(){}},
  getDriveAccessToken:async()=>'',
  tandasFacturas:{registrar:async o=>registrados.push(o)},
  sendMensajeAGrupo:async(...args)=>envios.push(args),
  procesarFactura:async o=>{
   await o.onDocumentoGuardado(42);
   if(o.onRecibido)await o.onRecibido(42);
   return {id:42};
  }
 });
 for(const recuperado of [true,true,false]) await recibir({groupJid:'grupo',mensajeId:'doc'+registrados.length,citado:{},recuperado});
 assert.equal(envios.length,0);
 assert.equal(registrados.length,3,'los documentos nuevos y recuperados siguen entrando en el resumen');
});
