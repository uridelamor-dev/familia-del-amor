import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('seleccionar titular solo ofrece sus cuentas y borra la vista anterior',async()=>{
 const nodos=new Map();const nodo=id=>{if(!nodos.has(id))nodos.set(id,{innerHTML:'',checked:false});return nodos.get(id);};
 const peticiones=[];const ctx=vm.createContext({CURRENT:'bancos',Date,document:{getElementById:nodo,querySelectorAll:()=>[]},esc:s=>String(s),toast:()=>{},apiRaw:async ruta=>{
  peticiones.push(ruta);return ruta==='/api/bancos'?{empresas:['Empresa A','Empresa B'],cuentas:[{id:1,empresa:'Empresa A',nombre:'Cuenta A',ultimos4:'1111'},{id:2,empresa:'Empresa B',nombre:'Cuenta B',ultimos4:'2222'}],categorias:[]}:{data:[],importaciones:[]};
 }});
 vm.runInContext(fs.readFileSync(new URL('../public/panel/bancos.js',import.meta.url),'utf8'),ctx);
 await ctx.loadBancos();assert.doesNotMatch(nodo('view').innerHTML,/Cuenta A|Cuenta B/);
 await nodo('banEmpresa').onchange({target:{value:'Empresa A'}});assert.match(nodo('view').innerHTML,/Cuenta A/);assert.doesNotMatch(nodo('view').innerHTML,/Cuenta B/);assert.match(peticiones.at(-1),/cuenta=1/);
 await nodo('banEmpresa').onchange({target:{value:'Empresa B'}});assert.match(nodo('view').innerHTML,/Cuenta B/);assert.doesNotMatch(nodo('view').innerHTML,/Cuenta A/);assert.match(peticiones.at(-1),/cuenta=2/);
});
test('asistente empieza por titular sin exigir filtros y conserva el mismo modal',()=>{
 const nodos=new Map();const nodo=id=>{if(!nodos.has(id))nodos.set(id,{value:'',innerHTML:''});return nodos.get(id);};
 const box={innerHTML:'',querySelector:nodo};let modales=0;
 const ctx=vm.createContext({Date,esc:String,modal:()=>{modales++;return {classList:{add(){}},querySelector:()=>box};}});
 vm.runInContext(fs.readFileSync(new URL('../public/panel/bancos.js',import.meta.url),'utf8'),ctx);
 vm.runInContext("BANCO.config={cuentas:[{id:1,empresa:'Empresa A',nombre:'Principal'}],empresas:['Empresa A']};banImportar()",ctx);
 assert.match(box.innerHTML,/1 de 6/);nodo('select').value='Empresa A';nodo('#banSiguiente').onclick();
 assert.match(box.innerHTML,/2 de 6/);assert.match(box.innerHTML,/Principal/);assert.equal(modales,1);
 const periodo=ctx.banPeriodo('prueba','2026-09');assert.match(periodo,/Septiembre/);assert.doesNotMatch(periodo,/<input/);
});
