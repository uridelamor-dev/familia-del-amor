import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validarIva} from '../src/modules/facturas/iva.js';
const code=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const partes=[{base:16.99,tipo:21,cuota:3.57}];
const factura={iva_desglose:JSON.stringify(partes),iva_estado:'revisar',iva_aviso:'Cabecera corregida en repaso',base_imponible:16.99,cuota_iva:3.57,total:20.56};
function editor(f=factura){
 const eventos={},details={};
 const box={innerHTML:'',addEventListener:(t,h)=>eventos[t]=h,querySelector:()=>details};
 const ctx=vm.createContext({esc:String});
 vm.runInContext(code.slice(code.indexOf('function facEditorIva('),code.indexOf('function facFicha(')),ctx);
 return {box,leer:ctx.facEditorIva({querySelector:()=>box},f),confirmar:()=>eventos.click({target:{closest:s=>s==='[data-iva-confirmar]'?{}:null}})};
}
test('abrir IVA pendiente sin confirmar ni editar no solicita validación',()=>{
 const e=editor();assert.equal(e.leer(),undefined);assert.match(e.box.innerHTML,/Confirmar este desglose/);
});
test('confirmación explícita envía desglose actual sin cambiar importes ni otros avisos',()=>{
 const e=editor();e.confirmar();assert.deepEqual(JSON.parse(JSON.stringify(e.leer())),partes);
 assert.match(e.box.innerHTML,/Guardar cambios/);assert.match(e.box.innerHTML,/demás avisos siguen pendientes/);
 assert.equal(factura.iva_estado,'revisar');assert.equal(validarIva(e.leer(),factura).ok,true);
});
test('confirmar un desglose incorrecto no evita la validación del servidor',()=>{
 const e=editor({...factura,total:30});e.confirmar();assert.equal(validarIva(e.leer(),{...factura,total:30}).ok,false);
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/ivaValidado=validarIva\(req.body.iva_desglose/);
});
test('no ofrece confirmación redundante si ya consta validado',()=>{
 const e=editor({...factura,iva_estado:'manual',iva_aviso:null});assert.doesNotMatch(e.box.innerHTML,/data-iva-confirmar/);assert.equal(e.leer(),undefined);
});
test('DDI 511: confirmar el desglose mixto existente solicita revisión sin reescribir cuotas',()=>{
 const iva=[{base:635.11,tipo:21,cuota:133.37},{base:71.06,tipo:10,cuota:7.11}];
 const f={...factura,id:511,base_imponible:706.17,cuota_iva:140.48,total:846.65,iva_desglose:JSON.stringify(iva),iva_aviso:'Importes modificados: revisa el desglose de IVA.'};
 const e=editor(f);assert.equal(e.leer(),undefined);e.confirmar();
 assert.deepEqual(JSON.parse(JSON.stringify(e.leer())),iva);
 assert.equal(validarIva(e.leer(),f).ok,true);
});
