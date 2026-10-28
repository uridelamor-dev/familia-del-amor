import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildManageQuery} from '../src/modules/reviews/reviews.service.js';
const src=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const inicio=src.indexOf('  try {\n   const id=aviso.documento_id;');
const ruta=src.slice(inicio,src.indexOf('\n });\n}',inicio));
async function abrir(fuente,extra={}){
 const llamadas=[];
 const ctx={aviso:{fuente,documento_id:999},FAC_LIST:[],FAC_PEND:[],REV_DATA:[],MAN_LIST:[],api:async()=>({id:999}),apiSend:async()=>({data:[{id:999}]}),facFicha:id=>llamadas.push(['factura',id]),facRevisar:id=>llamadas.push(['pendiente',id]),revPuedeResponder:()=>true,openResponder:id=>llamadas.push(['review',id]),toast:t=>llamadas.push(['error',t]),...extra};
 vm.createContext(ctx);await vm.runInContext('(async()=>{'+ruta+'})()',ctx);return {ctx,llamadas};
}
test('abre una factura por ID aunque no esté entre las 500 cargadas',async()=>{
 const {ctx,llamadas}=await abrir('facturas');assert.equal(ctx.FAC_LIST[0].id,999);assert.deepEqual(llamadas,[['factura',999]]);
});
test('abre directamente el formulario del documento pendiente',async()=>{
 const {llamadas}=await abrir('pendientes',{FAC_PEND:[{id:999}]});assert.deepEqual(llamadas,[['pendiente',999]]);
});
test('un pendiente retirado informa y no abre otra factura',async()=>{
 const {llamadas}=await abrir('pendientes');assert.equal(llamadas[0][0],'error');assert.match(llamadas[0][1],/asignado o retirado/);
});
test('abre la reseña exacta fuera de la página actual',async()=>{
 const {llamadas}=await abrir('reviews');assert.deepEqual(llamadas,[['review',999]]);
});
test('el identificador de reseña usa parámetros SQL',()=>{
 const q=buildManageQuery({id:"x' OR 1=1"});assert.match(q.where,/id = \?/);assert.equal(q.params[0],"x' OR 1=1");
});
test('la lectura individual de factura comprueba ámbito y rol',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const route=server.slice(server.indexOf('app.get("/api/facturas/documento/:id"'),server.indexOf('app.get("/api/facturas/pendientes",'));
 assert.match(route,/requireAuth\(\["direccion", "contabilidad"\]\)/);assert.match(route,/documentoEnAmbito\(row,localesScope/);assert.match(route,/status\(403\)/);
});
