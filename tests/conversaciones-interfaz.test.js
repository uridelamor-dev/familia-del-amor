import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/panel/conversaciones.js',import.meta.url),'utf8');
function entorno(extra={}){const c=vm.createContext({Map,Date,JSON,encodeURIComponent,CURRENT:'conversaciones',...extra});vm.runInContext(source,c);return c;}
test('borradores separados por conversación y borrar texto elimina solo el suyo',()=>{
 const input={value:'Respuesta pendiente'};const c=entorno({document:{getElementById:()=>input}});
 vm.runInContext("CONV.jid='uno';convGuardarBorrador()",c);input.value='Otro borrador';vm.runInContext("CONV.jid='dos';convGuardarBorrador()",c);
 assert.equal(vm.runInContext("CONV_BORRADORES.get('uno')",c),'Respuesta pendiente');
 input.value='';vm.runInContext('convGuardarBorrador()',c);assert.equal(vm.runInContext("CONV_BORRADORES.has('dos')",c),false);
});
test('vincular muestra todos los resultados aunque las fichas no tengan jid',async()=>{
 const box={children:[],innerHTML:'',appendChild(x){this.children.push(x);}},input={value:'Laura'},form={};
 const ov={isConnected:true,querySelector:s=>s==='form'?form:s==='input'?input:s==='#convLinkResultados'?box:null};
 const c=entorno({modal:()=>ov,esc:String,document:{createElement:()=>({})},apiRaw:async()=>({data:[{id:1,nombre:'Laura Uno'},{id:2,nombre:'Laura Dos'},{id:3,nombre:'Laura Tres'}]})});
 await c.convVincular();await form.onsubmit({preventDefault(){}});assert.equal(box.children.length,3);
});
test('el detalle antiguo no sobrescribe el chat recién seleccionado',async()=>{
 let resolver;const c=entorno({apiRaw:()=>new Promise(r=>resolver=r),document:{getElementById(){throw Error('No debe pintar el chat antiguo');}}});
 vm.runInContext("CONV.jid='uno';CONV.version=1",c);const tarea=c.convRefrescar();
 vm.runInContext("CONV.jid='dos';CONV.version=2;CONV.cargandoHilo=false",c);resolver({});await tarea;
 assert.equal(vm.runInContext('CONV.cargandoHilo',c),false);
});
