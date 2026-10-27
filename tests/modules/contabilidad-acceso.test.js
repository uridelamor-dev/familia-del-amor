import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {moduloDeRuta,modulosDeRol,localForzado} from '../../src/modules/usuarios/permisos.js';
const server=fs.readFileSync(new URL('../../server.js',import.meta.url),'utf8');
const source=server.slice(server.indexOf('function requireAuth(roles'),server.indexOf('// Ámbito por local a nivel de servidor'));
function acceso(roles,path,payload={rol:'contabilidad'}){
 const auth=vm.runInNewContext(source+';requireAuth',{jwt:{verify:()=>payload},JWT_SECRET:'test',moduloDeRuta});
 let status=200,passed=false;
 const res={status(n){status=n;return this;},json(){return this;}};
 auth(roles)({headers:{authorization:'Bearer prueba'},path},res,()=>{passed=true;});
 return {status,passed};
}
const routes=[...server.matchAll(/app\.(get|post|put|patch|delete)\(['"](\/api\/facturas[^'"]*)['"],\s*requireAuth\((\[[^\]]*\])/g)].map(m=>({method:m[1],path:m[2],roles:vm.runInNewContext(m[3])}));
test('Contabilidad supera el middleware real en todas las acciones de facturas',()=>{
 assert.ok(routes.length>90);
 for(const r of routes)assert.deepEqual(acceso(r.roles,r.path),{status:200,passed:true},`${r.method} ${r.path}`);
});
test('las acciones de Contabilidad siguen cerradas a trabajadores y marketing',()=>{
 for(const r of routes)for(const rol of ['trabajador','marketing'])assert.equal(acceso(r.roles,r.path,{rol}).status,403,r.path);
});
test('Inventarios admite Contabilidad y respeta restricciones por módulo y local',()=>{
 const roles=vm.runInNewContext(server.match(/const INV_ROLES = (\[[^\]]*\])/)[1]);
 assert.equal(acceso(roles,'/api/inventario/productos').passed,true);
 assert.equal(acceso(roles,'/api/inventario/productos',{rol:'contabilidad',modulos:['bancos']}).status,403);
 assert.ok(modulosDeRol('contabilidad').includes('inventarios'));
 assert.equal(localForzado({rol:'contabilidad',local:'Local A'},'inventarios'),'Local A');
});
test('Contabilidad no obtiene permisos generales de Dirección ni RRHH',()=>{
 for(const roles of [['direccion'],['direccion','rrhh'],['direccion','encargado']])assert.equal(acceso(roles,'/api/usuarios').status,403);
});

test('el acceso a configuración fiscal es visible para Contabilidad y Dirección',()=>{
 const panel=fs.readFileSync(new URL('../../public/panel/app.js',import.meta.url),'utf8');
 const condition=panel.match(/\$\{([^{}]+) \? `<button class="iconbtn" data-act="estab-config"/)[1];
 for(const rol of ['direccion','contabilidad','rrhh','trabajador']){
  assert.equal(vm.runInNewContext(condition,{USER:{rol}}),['direccion','contabilidad'].includes(rol));
 }
});
