import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function facRevisionRecepcion(id)');
const fn=source.slice(start,source.indexOf('async function facReintentarRecepcion',start));
async function abrir({fallo=false}={}) {
 const elements=new Map();let html='',cerrados=0;const writes=[],errors=[];
 const get=s=>{if(!elements.has(s))elements.set(s,{style:{},classList:{add(){}},value:'',checked:false,textContent:''});return elements.get(s);};
 const ov={isConnected:true,querySelector:get,insertAdjacentHTML(){}};
 const ctx=vm.createContext({apiRaw:async()=>({data:{resultado:{datos:{tipo:'factura',proveedor:'Cerezo',fecha:'2026-10-07',vencimiento:'2026-10-07'},segunda:{vencimiento:'2026-12-06'},avisos:[{texto:'Las dos lecturas no coinciden en vencimiento.'}]}}}),
  modal:(_title,markup)=>{html=markup;for(const m of markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g))get('#'+m[1]).value=m[2];get('#revTipo').value='factura';return ov;},
  esc:v=>String(v),facPrepararModalRevision(){},fetch:async()=>({ok:false}),token:()=>'',facSelectorProveedor(){},
  apiSend:async(...args)=>{writes.push(args);if(fallo)throw Error('Comprueba el vencimiento');},toast:m=>errors.push(m),facTerminarRevision:async()=>cerrados++});
 vm.runInContext(fn,ctx);await ctx.facRevisionRecepcion(205);
 assert.deepEqual(errors,[]);
 return {get,html,writes,cerrados:()=>cerrados};
}
test('recepción muestra fecha opcional, segunda lectura y fuente documental',async()=>{
 const a=await abrir();
 const input=a.html.match(/<input id="rev-vencimiento"[^>]*>/)?.[0];
 assert.ok(input);assert.match(input,/type="date"/);assert.doesNotMatch(input,/required/);
 assert.match(input,/value="2026-10-07"/);assert.match(a.html,/Segunda lectura: 2026-12-06/);
 assert.match(a.html,/Déjalo vacío si el original no indica una fecha/);
});
test('corregir vencimiento envía la fecha escrita y cierra tras confirmar',async()=>{
 const a=await abrir();a.get('#rev-vencimiento').value='2026-12-06';a.get('#revConfirmado').checked=true;
 await a.get('#revForm').onsubmit({preventDefault(){},submitter:{disabled:false}});
 assert.equal(a.writes[0][1],'/api/facturas/recepciones/205/revision');
 assert.equal(a.writes[0][2].datos.vencimiento,'2026-12-06');assert.equal(a.writes[0][2].confirmado,true);assert.equal(a.cerrados(),1);
});
test('quitar fecha no impresa envía null sin inventar fecha de contado',async()=>{
 const a=await abrir();a.get('#rev-vencimiento').value='';
 await a.get('#revForm').onsubmit({preventDefault(){},submitter:{disabled:false}});
 assert.equal(a.writes[0][2].datos.vencimiento,null);
});
test('si el servidor rechaza, conserva corrección y permite reintentar',async()=>{
 const a=await abrir({fallo:true});a.get('#rev-vencimiento').value='2026-12-06';const submitter={disabled:false};
 await a.get('#revForm').onsubmit({preventDefault(){},submitter});
 assert.equal(a.get('#rev-vencimiento').value,'2026-12-06');assert.equal(a.get('#revError').textContent,'Comprueba el vencimiento');
 assert.equal(submitter.disabled,false);assert.equal(a.cerrados(),0);
});
