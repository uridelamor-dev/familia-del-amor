import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
test('La unión exige revisión y resolución de diferencias antes de enviar la confirmación',async()=>{
 const select={value:'Destino'},summary={innerHTML:''},button={disabled:false,textContent:''},choice={value:''};
 let removed=false,refresh=false;const calls=[],messages=[];
 const ov={querySelector:s=>({'#puDestino':select,'#puResumen':summary,'#puRevisar':button,'[data-pu-choice="0"]':choice}[s]),remove:()=>{removed=true;}};
 const ctx=vm.createContext({apiRaw:async()=>({proveedores:['Origen','Destino']}),modal:()=>ov,esc:String,num:String,toast:m=>messages.push(m),CURRENT:'proveedores',loadProveedores:()=>{refresh=true;},apiSend:async(method,url,body)=>{calls.push({url,body});return {destino:'Destino',facturas:2,pendientes:0,revision:'version',conflictos:[{id:'categorias',etiqueta:'Categorías',origen:['A'],destino:['B']}]};}});
 vm.runInContext(code.slice(code.indexOf('async function proveedorUnir('),code.indexOf('async function facProveedorFicha(')),ctx);
 await ctx.proveedorUnir('Origen',{remove(){}});
 await button.onclick();assert.equal(calls.length,1);assert.match(calls[0].url,/preview$/);assert.equal(button.textContent,'Confirmar unión');
 await button.onclick();assert.equal(calls.length,1);assert.match(messages.at(-1),/diferencias/);
 choice.value='destino';await button.onclick();assert.equal(calls.length,2);assert.equal(calls[1].body.revision,'version');assert.equal(calls[1].body.elecciones.categorias,'destino');assert.ok(removed&&refresh);
});
