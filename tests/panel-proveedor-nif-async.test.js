import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const fn=src.slice(src.indexOf('function facSelectorProveedor('),src.indexOf('\nfunction facMarcarVacios('));
function entorno(){
 const elemento=(value='')=>({value,disabled:false,listeners:{},addEventListener(t,f){(this.listeners[t]??=[]).push(f);},dispatchEvent(e){for(const f of this.listeners[e.type]||[])f(e);},removeAttribute(){},setAttribute(){},insertAdjacentElement(){}});
 const proveedor=elemento('Viejo'),nif=elemento('ANTERIOR'),guardar=elemento();const creados=[],peticiones=[];
 const ov={querySelector:s=>s==='#proveedor'?proveedor:nif,querySelectorAll:()=>[guardar]};
 const ctx={facFechasEditables(){},document:{createElement(){const e=elemento();creados.push(e);return e;}},Event:class{constructor(type){this.type=type;}},apiRaw:()=>new Promise(resolve=>peticiones.push(resolve)),facNifProveedorElegido:f=>f.nif};
 vm.createContext(ctx);vm.runInContext(fn,ctx);ctx.facSelectorProveedor(ov,'#proveedor');
 return {proveedor,nif,guardar,peticiones,aviso:creados[0],cambiar(nombre){proveedor.value=nombre;return proveedor.listeners.change[0]();},editar(v){nif.value=v;nif.dispatchEvent({type:'input'});}};
}
test('respuesta completa NIF cuando no se ha editado mientras consulta',async()=>{
 const e=entorno(),p=e.cambiar('Nuevo');assert.equal(e.nif.value,'');assert.equal(e.guardar.disabled,true);
 e.peticiones[0]({nif:'B08485005'});await p;assert.equal(e.nif.value,'B08485005');assert.equal(e.guardar.disabled,false);
});
test('respuesta no sobrescribe escritura ni borrado manual explícito durante consulta',async()=>{
 for(const manual of ['79300994F','']){
  const e=entorno(),p=e.cambiar('Ambiseint');e.editar(manual);e.peticiones[0]({nif:'NIFHISTORICO'});await p;
  assert.equal(e.nif.value,manual);assert.equal(e.guardar.disabled,false);assert.match(e.aviso.textContent,/conserva/);
 }
});
test('respuesta antigua de proveedor no modifica elección ni edición nueva',async()=>{
 const e=entorno(),primero=e.cambiar('A'),segundo=e.cambiar('B');e.editar('MANUAL-B');
 e.peticiones[0]({nif:'NIF-A'});await primero;assert.equal(e.nif.value,'MANUAL-B');assert.equal(e.guardar.disabled,true);
 e.peticiones[1]({nif:'NIF-B'});await segundo;assert.equal(e.nif.value,'MANUAL-B');assert.equal(e.guardar.disabled,false);
});
