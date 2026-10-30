import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import jwt from 'jsonwebtoken';
import { modulosDeRol, modulosEfectivos, sanearModulos } from '../src/modules/usuarios/permisos.js';
const panel=fs.readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('las casillas de todos los roles sobreviven al saneado y la recarga',()=>{
 const roles=panel.match(/const VIEW_ROLES = (.*);/)[1];
 const fn=panel.match(/function modulosDeRolFE\(rol\) \{[^\n]+/)[0];
 const get=vm.runInNewContext(`const VIEW_ROLES=${roles};${fn};modulosDeRolFE`);
 for(const rol of ['direccion','contabilidad','rrhh','encargado','marketing','trabajador']){
  const ids=Array.from(get(rol));
  assert.deepEqual(ids.sort(),modulosDeRol(rol).sort(),rol);
  assert.deepEqual(modulosEfectivos(rol,sanearModulos(rol,ids)).sort(),ids.sort());
  for(const id of ids) assert.ok(modulosEfectivos(rol,sanearModulos(rol,[id])).includes(id),`${rol}: ${id}`);
 }
});
const secret='clave-de-pruebas-solo-local-para-verificar-sesiones';
async function me(user){
 let handler;
 const start=server.indexOf('app.get("/api/auth/me"');
 const end=server.indexOf('// Gestión de usuarios',start);
 vm.runInNewContext(server.slice(start,end),{app:{get:(_p,_a,h)=>handler=h},requireAuth:()=>{},dbGet:async()=>{if(user instanceof Error)throw user;return user;},modulosEfectivos,localesDe:u=>u.local?[u.local]:[],marcadoActivo:u=>u.activo!==false,bajaEfectiva:u=>!!u.fecha_baja,hoyISO:()=> '2026-10-30',jwt,JWT_SECRET:secret});
 const exp=Math.floor(Date.now()/1000)+3600;
 let code=200,body;
 const res={status:c=>{code=c;return res;},json:b=>{body=b;}};
 await handler({user:{id:1,rol:'contabilidad',modulos:['dashboard'],exp}},res);
 return {code,body,exp};
}
test('recargar renueva los permisos de las acciones sin prolongar la sesión',async()=>{
 const {code,body,exp}=await me({id:1,rol:'contabilidad',modulos:['facturas','bancos'],local:'Blanes'});
 assert.equal(code,200);
 const payload=jwt.verify(body.token,secret);
 assert.deepEqual(payload.modulos,['bancos','facturas']);
 assert.equal(payload.exp,exp);
 assert.deepEqual(payload.modulos,Array.from(body.user.modulos));
});
test('no se renueva una cuenta borrada, inactiva o cuya consulta falla',async()=>{
 for(const u of [null,{id:1,activo:false},{id:1,fecha_baja:'2026-10-01'},new Error('db')]){
  const r=await me(u);assert.ok(r.code>=400);assert.equal(r.body.token,undefined);
 }
});
