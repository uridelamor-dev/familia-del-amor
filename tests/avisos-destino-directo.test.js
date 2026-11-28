import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {puedeLocal} from '../src/modules/usuarios/locales.js';
import {barras as barrasDelCentro,ambitoDeRuta} from '../src/modules/locales/centros.js';
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
test('la lectura individual de factura comprueba ámbito y rol',async()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const route=server.slice(server.indexOf('app.get("/api/facturas/documento/:id"'),server.indexOf('app.get("/api/facturas/pendientes",'));
 assert.match(route,/requireAuth\(\["direccion", "contabilidad"\]\)/);
 const acceso=server.slice(server.indexOf('function puedeAccederLocal('),server.indexOf('// Auth endpoints'));
 let handler,roles;const consultas=[];
 const ctx=vm.createContext({puedeLocal,barrasDelCentro,ambitoDeRuta,
  app:{get:(_path,_middleware,fn)=>{handler=fn;}},requireAuth:r=>{roles=Array.from(r);},
  dbGet:async(sql,args)=>{consultas.push({sql,args:Array.from(args)});return {id:999,local:'La Tapeta - Girona',drive_thumb:'privado'};},
  estadoPago:()=>({}),instanteMadrid:()=>({fecha:'2026-11-17'})});
 const cuadre=server.slice(server.indexOf('async function actualizarCuadreVisibleTickets('),server.indexOf('app.get("/api/facturas",'));
 vm.runInContext(acceso+cuadre+route,ctx);
 assert.deepEqual(roles,['direccion','contabilidad']);
 async function pedir(local){let status=200,body;
  const res={status:n=>{status=n;return res;},json:b=>{body=b;}};
  await handler({params:{id:999},path:'/api/facturas/documento/999',user:{rol:'contabilidad',local}},res,e=>{throw e;});return {status,body};}
 const fuera=await pedir('La Tapeta - Lloret');assert.equal(fuera.status,403);assert.equal(fuera.body.data,undefined);
 const dentro=await pedir('La Tapeta - Girona');assert.equal(dentro.status,200);assert.equal(dentro.body.data.id,999);assert.equal(dentro.body.data.drive_thumb,undefined);
 assert.deepEqual(consultas[0].args,[999]);assert.match(consultas[0].sql,/WHERE id=\?/);

});
