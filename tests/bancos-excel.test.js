import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizarExtracto} from '../src/modules/bancos/importacion.js';
const vendor=fs.readFileSync(new URL('../public/vendor/sheetjs/xlsx.full.min.js',import.meta.url),'utf8');
function entorno(){let resultado;const ctx=vm.createContext({TextEncoder,self:{postMessage:v=>resultado=v}});ctx.importScripts=()=>vm.runInContext(vendor,ctx);vm.runInContext(fs.readFileSync(new URL('../public/panel/bancos-excel-worker.js',import.meta.url),'utf8'),ctx);return {ctx,leer:bytes=>{ctx.self.onmessage({data:bytes});return resultado;}};}
for(const formato of ['xlsx','biff8'])test('Excel '+formato+': fechas, céntimos, hojas y huellas equivalentes al CSV',()=>{
 const {ctx,leer}=entorno(),X=ctx.XLSX;
 const libro=X.utils.book_new(),hoja=X.utils.aoa_to_sheet([['Fecha','Concepto','Importe','Saldo','Referencia'],[46315,'Pago FAC1001',-15,200,'00123']]);
 hoja.A2.z='dd/mm/yyyy';X.utils.book_append_sheet(libro,hoja,'Movimientos');X.utils.book_append_sheet(libro,X.utils.aoa_to_sheet([['Información']]),'Ayuda');
 const r=leer(X.write(libro,{type:'array',bookType:formato}));assert.equal(r.error,undefined);assert.equal(r.hojas.length,2);
 const mapa={fecha:0,concepto:1,importe:2,saldo:3,referencia:4,separador:';',decimal:',',formatoFecha:'dmy'};
 const n=normalizarExtracto(r.hojas[0].texto,mapa);assert.equal(n.errores.length,0);assert.equal(n.movimientos[0].importe,-1500);assert.equal(n.movimientos[0].referencia,'00123');
 const fecha=n.movimientos[0].fecha.split('-').reverse().join('/');
 const csv=normalizarExtracto(`Fecha;Concepto;Importe;Saldo;Referencia\n${fecha};Pago FAC1001;-15,00;200,00;00123`,mapa);
 assert.equal(n.movimientos[0].huella,csv.movimientos[0].huella);
});
test('Excel rechaza fórmulas y límites de tamaño',()=>{
 const {ctx,leer}=entorno(),X=ctx.XLSX,libro=X.utils.book_new();const hoja=X.utils.aoa_to_sheet([['Importe'],[15]]);hoja.A2.f='10+5';X.utils.book_append_sheet(libro,hoja,'Datos');assert.match(leer(X.write(libro,{type:'array',bookType:'xlsx'})).error,/fórmulas/);
 delete hoja.A2.f;hoja['!ref']='A1:A20000';assert.match(leer(X.write(libro,{type:'array',bookType:'xlsx'})).error,/grande/);
});
