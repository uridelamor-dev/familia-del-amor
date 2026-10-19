import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { adjuntoGrupoDiferidoVigente } from '../src/modules/messaging/entrada-diferida.js';
const source = readFileSync(new URL('../whatsapp.js', import.meta.url), 'utf8');
const start = source.indexOf('async function recibirAdjuntoGrupo(');
const end = source.indexOf('\n}', start) + 2;
const mensaje = () => ({key:{id:'doc-1',remoteJid:'123@g.us'},messageTimestamp:Date.now()/1000,message:{documentMessage:{mimetype:'application/pdf',fileName:'factura.pdf'}}});
test('recupera solo mensajes recientes entrantes de grupos', () => {
  const m=mensaje();
  assert.equal(adjuntoGrupoDiferidoVigente(m),true);
  assert.equal(adjuntoGrupoDiferidoVigente({...m,messageTimestamp:Date.now()/1000-73*3600}),false);
  assert.equal(adjuntoGrupoDiferidoVigente({...m,key:{...m.key,fromMe:true}}),false);
  assert.equal(adjuntoGrupoDiferidoVigente({...m,key:{...m.key,remoteJid:'123@s.whatsapp.net'}}),false);
});
function contexto(permitido=true) {
  const recibidos=[],descargas=[];
  const ctx=vm.createContext({
    onGroupAttachment:async x=>recibidos.push(x), grupoFacturasPermitido:async()=>permitido,
    adjuntoGrupoDiferidoVigente, adjuntosGrupoEnCurso:new Set(),
    downloadMediaMessage:async m=>{descargas.push(m);return Buffer.from('pdf');},console
  });
  vm.runInContext(source.slice(start,end),ctx);
  return {ctx,recibidos,descargas};
}
test('no descarga documentos de grupos ajenos a facturas',async()=>{
  const {ctx,descargas}=contexto(false);
  await ctx.recibirAdjuntoGrupo(mensaje(),true);
  assert.equal(descargas.length,0);
});
test('recupera el original y espera a que el receptor lo haya guardado',async()=>{
  const {ctx,recibidos}=contexto();
  await ctx.recibirAdjuntoGrupo(mensaje(),true);
  assert.equal(recibidos.length,1);
  assert.equal(recibidos[0].recuperado,true);
  assert.equal(recibidos[0].buffer.toString(),'pdf');
});
test('dos entregas simultáneas del mismo adjunto solo se descargan una vez',async()=>{
  const {ctx,descargas}=contexto();
  await Promise.all([ctx.recibirAdjuntoGrupo(mensaje(),true),ctx.recibirAdjuntoGrupo(mensaje(),true)]);
  assert.equal(descargas.length,1);
});
