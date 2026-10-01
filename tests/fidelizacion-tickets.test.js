import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {proyectarImportes} from '../src/modules/fidelizacion/importes.js';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('app.get("/api/fidelizacion/tickets",'),source.indexOf('app.get("/api/fidelizacion/facturas",'));
function setup(overrides={}) {
 const handlers={},calls=[];
 const context={app:{get:(path,auth,fn)=>{assert.deepEqual(Array.from(auth),['direccion']);handlers[path]=fn;}},requireAuth:x=>x,
 fidLocalDePeticion:(req,local)=>({ok:true,local}),fidPuedeVer:(req,local)=>local==='Girona',
 dbAll:async(sql,args)=>{calls.push({sql,args});return [{id:1,local:'Girona'},{id:2,local:'Otro'}];},
 dbGet:async()=>({local:'Girona',cuerpo_enc:'cipher',miembros_n:2}),
 leerSecreto:()=>JSON.stringify({Customer:{Phone:'secret'},InvoiceItems:[{Lines:[{ProductName:'Café',Quantity:1,TotalAmount:0}]}]}),
 DOMINIOS:{FIDELIZACION:'f'},fidProyectarImportes:proyectarImportes,fidHash:()=>'',...overrides};
 vm.runInNewContext(code,context);
 const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
 return {handlers,res,calls};
}
test('requires a selection and rejects malformed card ids',async()=>{
 for(const query of [{},{qr:'1 OR 1=1'}]){const t=setup();await t.handlers['/api/fidelizacion/tickets']({query},t.res);assert.equal(t.res.statusCode,400);assert.equal(t.calls.length,0);}
});
test('excludes test invoices, scopes clients and uses Madrid day',async()=>{
 const t=setup();await t.handlers['/api/fidelizacion/tickets']({query:{qr:'12',fecha:'2026-10-01'}},t.res);
 assert.equal(t.res.body.data.length,1);assert.match(t.calls[0].sql,/f.es_prueba = FALSE/);assert.match(t.calls[0].sql,/Europe\/Madrid/);assert.deepEqual(Array.from(t.calls[0].args),[12,'2026-10-01']);assert.equal(t.res.headers['Cache-Control'],'no-store');
});
test('details never expose customer payload, preserve zero and flag shared ticket',async()=>{
 const t=setup();await t.handlers['/api/fidelizacion/tickets/:id']({params:{id:'1'}},t.res);
 assert.equal(t.res.body.compartido,true);assert.equal(t.res.body.comprobantes[0].lineas[0].total,0);assert.ok(!JSON.stringify(t.res.body).includes('secret'));
});
test('denies another local and reports missing retained detail',async()=>{
 let t=setup({fidPuedeVer:()=>false});await t.handlers['/api/fidelizacion/tickets/:id']({params:{id:'1'}},t.res);assert.equal(t.res.statusCode,403);
 t=setup({leerSecreto:()=>null});await t.handlers['/api/fidelizacion/tickets/:id']({params:{id:'1'}},t.res);assert.equal(t.res.statusCode,409);
});
