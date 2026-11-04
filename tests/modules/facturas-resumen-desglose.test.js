import {test} from 'node:test';
import assert from 'node:assert/strict';
import {revisarFacturas} from '../../src/modules/facturas/calidad.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const base={tipo:'factura',fecha:'2026-11-04',local:'Girona',total:121,base_imponible:100,cuota_iva:21};
test('la revisión distingue desglose incompleto, diferencias y documentos coherentes',()=>{
 const [correcta,incompleta,diferente,cero,albaran]=revisarFacturas([base,{...base,cuota_iva:null},{...base,total:130},{...base,cuota_iva:0,total:100},{...base,tipo:'albaran',base_imponible:null,cuota_iva:null,total:null}],'2026-11-04');
 assert.deepEqual(correcta.calidad,[]);assert.ok(incompleta.calidad.includes('Falta base imponible o cuota de IVA'));
 assert.ok(diferente.calidad.some(a=>a.includes('comprobar ajustes')));assert.deepEqual(cero.calidad,[]);
 assert.ok(!albaran.calidad.some(a=>a.includes('IVA')));
});
test('el resumen suma la cobertura entre locales y no oculta datos incompletos',()=>{
 const source=readFileSync(new URL('../../public/panel/app.js',import.meta.url),'utf8');
 const ctx=vm.createContext({FAC_TOT:null,facFiltrosActivos:()=>[],num:String,eur:v=>v+' €',esc:String});
 vm.runInContext(source.slice(source.indexOf('function facSumaTotales('),source.indexOf('/** Los avisos de coherencia')),ctx);
 ctx.FAC_TOT=ctx.facSumaTotales({partes:[{docs:2,total:200,base:100,iva:21,desglose_incompleto:1},{docs:1,total:121,base:100,iva:21,total_ausente:1,desglose_diferente:1}]});
 assert.equal(ctx.FAC_TOT.docs,3);assert.equal(ctx.FAC_TOT.total,321);
 const html=ctx.facKpisHtml();assert.ok(html.includes('base disponible'));assert.ok(html.includes('total disponible'));assert.ok(html.includes('sin base o IVA completos'));assert.ok(!html.includes('fchips'));
});
