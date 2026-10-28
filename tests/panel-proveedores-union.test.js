import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
test('Unir desde una ficha usa la misma elección de nombre y CIF que la selección múltiple',async()=>{
 const select={value:''},review={},calls=[];let closed=false;
 const ov={querySelector:s=>s==='#puDestino'?select:review,remove:()=>{closed=true;}};
 const ctx=vm.createContext({apiRaw:async()=>({proveedores:['Origen','Destino']}),modal:()=>ov,esc:String,toast:()=>{},proveedoresUnirSeleccion:n=>calls.push(n)});
 vm.runInContext(code.slice(code.indexOf('async function proveedorUnir('),code.indexOf('async function facProveedorFicha(')),ctx);
 await ctx.proveedorUnir('Origen',{remove(){}});
 review.onclick();assert.equal(calls.length,0);
 select.value='Destino';review.onclick();assert.deepEqual(Array.from(calls[0]),['Origen','Destino']);assert.ok(closed);
});
