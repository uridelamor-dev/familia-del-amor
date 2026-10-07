import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const start=code.indexOf('function facCamposRevision('),end=code.indexOf('function facMarcarRevision(',start);
const ctx=vm.createContext({facRevisarTxt:p=>JSON.parse(p.revisar||'[]')});vm.runInContext(code.slice(start,end),ctx);
const completo={proveedor:'P',nif:'B123',numero_factura:'1',fecha:'2026-01-01',tipo:'factura',base_imponible:0,cuota_iva:0,porcentaje_iva:0,total:0};
test('marca lo ausente y el local sugerido, pero no importes cero',()=>{
 const r=ctx.facCamposRevision({...completo,sugerido:{local:'Blanes'}});assert.deepEqual(Object.keys(r),['local']);
 assert.equal(Object.keys(ctx.facCamposRevision(completo,true)).length,0);
 assert.ok(ctx.facCamposRevision({...completo,proveedor:'',total:null},true).total);
});
test('relaciona descuadres y avisos con sus campos sin marcar todos',()=>{
 const r=ctx.facCamposRevision({...completo,base_imponible:100,total:50},true);
 assert.deepEqual(Object.keys(r),['base_imponible','cuota_iva','total']);
 assert.ok(ctx.facCamposRevision({...completo,fecha:'2026-02-31'},true).fecha);
 assert.ok(ctx.facCamposRevision({...completo,revisar:'["Este proveedor tiene un NIF distinto"]'},true).nif);
});
