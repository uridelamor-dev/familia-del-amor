import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {conEsquema,disponible,motivoSalto} from './helpers/pgtmp.js';
import {ENVIOS_SCHEMA,destinatariosCorreo,validarSeleccionCorreo} from '../src/modules/campaigns/email-envios.js';
import {validarCorreo} from '../src/modules/campaigns/email.js';
const can=await disponible();
test('rutas de correo: audiencia en servidor, revisión persistente, dueño y confirmación única',{skip:!can&&motivoSalto()},async()=>{
 const db=await conEsquema();
 try {
  await db.raw(ENVIOS_SCHEMA);
  const routes=new Map();let sends=0;
  const app=Object.fromEntries(['get','post'].map(m=>[m,(path,auth,fn)=>{assert.deepEqual(auth,['direccion','marketing']);routes.set(m+' '+path,fn);} ]));
  const ctx={app,requireAuth:r=>Array.from(r),validarCorreo,validarSeleccionCorreo,destinatariosCorreo,dbGet:db.get,dbRun:db.run,dbAll:db.all,
   contactosGeograficos:async()=>[{telefono:'600000001',correo:'a@example.com',opt_in_email:1},{telefono:'600000002',correo:'b@example.com',opt_in_email:0}],
   consultarDominioResend:async()=>({dominio_verificado:true}),confirmarCorreoResend:async()=>{sends++;},process:{env:{}},console};
  const code=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  vm.runInNewContext(code.slice(code.indexOf('async function audienciaCorreo('),code.indexOf('app.get("/api/correo/estado"')),ctx);
  const call=async(method,path,body={},id='',user=7)=>{
   let status=200,result;
   const res={set(){return this;},status(n){status=n;return this;},json(v){result=v;return this;},sendStatus(n){status=n;return this;}};
   await routes.get(method+' '+path)({body,params:{id},user:{id:user}},res);
   return {status,result};
  };
  const id='11111111-1111-4111-8111-111111111111';
  const body={id,asunto:'Hola',mensaje:'Texto',seleccion:{tipo:'cliente',telefono:'600000001'},destinatarios:[{correo:'inyectado@example.com'}]};
  assert.equal((await call('post','/api/correo/preparar',body)).status,200);
  let row=await db.get('SELECT * FROM correo_envios WHERE id=?',[id]);
  assert.deepEqual(row.destinatarios,[{correo:'a@example.com',nombre:''}]);
  assert.equal(row.estado,'pendiente');assert.equal(sends,0);
  await call('post','/api/correo/preparar',body);
  assert.equal((await db.all('SELECT * FROM correo_envios')).length,1);
  assert.equal((await call('get','/api/correo/envios/:id',{},id,8)).status,404);
  await db.run("UPDATE correo_envios SET estado='preparado',broadcast_id='b' WHERE id=?",[id]);
  assert.equal((await call('post','/api/correo/envios/:id/enviar',{},id)).status,400);
  const results=await Promise.all([call('post','/api/correo/envios/:id/enviar',{confirmar:true},id),call('post','/api/correo/envios/:id/enviar',{confirmar:true},id)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(sends,1);
  row=await db.get('SELECT * FROM correo_envios WHERE id=?',[id]);assert.equal(row.estado,'aceptado');
  await db.run("UPDATE correo_envios SET estado='preparado',actualizado_en=NOW()-INTERVAL '2 hours' WHERE id=?",[id]);
  assert.equal((await call('post','/api/correo/envios/:id/enviar',{confirmar:true},id)).status,409);
  assert.equal(sends,1);
 }finally{await db.fin();}
});
