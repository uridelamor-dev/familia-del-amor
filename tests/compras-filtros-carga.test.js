import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {filtroRevision} from '../src/modules/facturas/ambito-revision.js';
const app=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('facturas y combinaciones de tipos generan condiciones exactas junto al resto de filtros',()=>{
 const ctx={SIN_DUDAS:"COALESCE(dup_estado,'') <> 'duda'"};vm.createContext(ctx);vm.runInContext(server.slice(server.indexOf('function facturasWhere('),server.indexOf('async function facturasQueryCategorias')),ctx);
 for(const tipo of ['factura','factura,ticket']){
  const r=ctx.facturasWhere({tipo,empresa:'Empresa A',local:'Blanes',proveedor:'Proveedor A',estado:'pagada',from:'2026-10-01',to:'2026-10-28'});
  assert.match(r.where,tipo.includes(',')?/tipo IN \(\?,\?\)/:/tipo = \?/);
  assert.match(r.where,/local = \?/);assert.match(r.where,/empresa = \?/);assert.match(r.where,/pagado = 1/);
  assert.deepEqual(Array.from(r.params),['Blanes','Empresa A','Proveedor A',...tipo.split(','),'2026-10-01','2026-10-28']);
 }
});
test('avisos de revisión aplican el tipo antes de paginar con parámetros SQL',()=>{
 const f=filtroRevision({tipo:'factura,ticket',empresa:'A',locales:['Blanes']},{tipo:'f.tipo',local:'f.local',empresa:'f.empresa'});
 assert.match(f.sql,/f.tipo = ANY\(\?::text\[\]\)/);assert.deepEqual(f.params,[['Blanes'],'A',['factura','ticket']]);
});
test('una carga antigua no sustituye la lista ni los totales del nuevo filtro',async()=>{
 const view={innerHTML:''},peticiones=[];
 const ctx={_facSeq:0,_facTimer:null,clearTimeout,FACTAB:'facturas',CURRENT:'facturas',FACF:{tipo:'',q:''},document:{getElementById:()=>view},skeleton:()=> 'cargando',facScope(){},facFiltrosActivos:()=>[1],viendoVarios:()=>false,facQS:()=>new URLSearchParams(ctx.FACF).toString(),facRevisionQS:()=>'',pidePorLocales:fn=>new Promise(resolve=>peticiones.push({url:fn(''),resolve})),apiOptional:async()=>[],facSumaTotales:r=>r.totales,renderFacturas:l=>l.map(f=>f.tipo).join(','),facCargarRecepciones(){},facCargarMiniaturas(){},facAvisoLocales(){},facDuplicados(){},errorCard:String};
 vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('async function loadFacturas()'),app.indexOf('// `ir` = true')),ctx);
 const antigua=ctx.loadFacturas();ctx.FACF.tipo='factura';const nueva=ctx.loadFacturas();
 assert.match(peticiones[1].url,/tipo=factura/);
 peticiones[1].resolve({data:[{tipo:'factura'}],totales:{total:100}});await nueva;
 peticiones[0].resolve({data:[{tipo:'ticket'},{tipo:'albaran'}],totales:{total:999}});await antigua;
 assert.equal(view.innerHTML,'factura');assert.equal(ctx.FAC_TOT.total,100);
});
