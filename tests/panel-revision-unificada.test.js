import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const tramo=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)+a.length));
test('duplicados: conserva ambas, cierra solo su modal y refresca sin navegar',async()=>{
 const llamadas=[];
 const ctx=vm.createContext({facOfrecerDeshacer:()=>{},confirmModal:async()=>true,apiSend:async(...args)=>{llamadas.push(args);return {};},toast:()=>{},document:{querySelectorAll:()=>[{dataset:{duplicado:'7'},querySelector:()=>({click:()=>llamadas.push('cerrar')})}]},facRefresh:async options=>llamadas.push(['refrescar',options.mantenerRevision])});
 vm.runInContext(tramo('async function facDupResolver(', '// ── Dónde están'),ctx);
 await ctx.facDupResolver('7','distinta');
 assert.equal(llamadas[0][1],'/api/facturas/duplicados/7/resolver');assert.equal(llamadas[0][2].accion,'distinta');
 assert.deepEqual(llamadas.slice(1),['cerrar',['refrescar',true]]);
});
test('duplicados: cancelar no escribe y un fallo no elimina el aviso',async()=>{
 for(const aceptar of [false,true]) {
  let cerrados=0,actualizados=0;
  const ctx=vm.createContext({confirmModal:async()=>aceptar,apiSend:async()=>{throw Error('Fallo');},toast:()=>{},document:{querySelectorAll:()=>{cerrados++;return [];}},facRefresh:async()=>actualizados++});
  vm.runInContext(tramo('async function facDupResolver(', '// ── Dónde están'),ctx);
  await ctx.facDupResolver('7','distinta');assert.equal(cerrados,0);assert.equal(actualizados,0);
 }
});
test('la bandeja muestra motivos y todas las filas de calidad sin desplegables interiores',()=>{
 const ctx=vm.createContext({esc:v=>String(v)});vm.runInContext(tramo('function facCalidadHtml(', 'function facPrepararModalRevision('),ctx);
 const html=ctx.facCalidadHtml(Array.from({length:25},(_,id)=>({id,proveedor:'Proveedor',calidad:['Fecha dudosa']})));
 assert.equal((html.match(/data-act="fac-ficha"/g)||[]).length,25);assert.ok(html.includes('Fecha dudosa'));assert.ok(!html.includes('<details'));
});
test('restaura el desplazamiento de contenido y tabla sin volver atrás si el usuario se mueve',()=>{
 for(const intervenir of [false,true]) {
  const listeners=new Map(),movimientos=[],view={};
  const context=vm.createContext({CURRENT:'facturas',document:{getElementById:()=>view,querySelector:selector=>({scrollTop:selector==='.content'?700:120,scrollLeft:30,scrollTo:pos=>movimientos.push([selector,pos.top,pos.left])})},window:{scrollX:0,scrollY:10,addEventListener:(e,fn)=>listeners.set(e,fn),removeEventListener:e=>listeners.delete(e),scrollTo:pos=>movimientos.push(['window',pos.top,pos.left])}});
  vm.runInContext(tramo('function facGuardarPosicionRevision()', 'async function facRefresh('),context);
  const restaurar=context.facGuardarPosicionRevision();
  if(intervenir)listeners.get('wheel')();
  restaurar();assert.equal(listeners.size,0);
  assert.deepEqual(movimientos,intervenir?[]:[['.content',700,30],['#facRes .tw',120,30],['window',10,0]]);
 }
});
test('una respuesta antigua o salir de compras no restaura posiciones',()=>{
 let scrolls=0;const view={};
 const ctx=vm.createContext({CURRENT:'facturas',document:{getElementById:()=>view,querySelector:()=>null},window:{scrollX:0,scrollY:0,addEventListener:()=>{},removeEventListener:()=>{},scrollTo:()=>scrolls++}});
 vm.runInContext(tramo('function facGuardarPosicionRevision()', 'async function facRefresh('),ctx);
 ctx.facGuardarPosicionRevision()(false);
 const restaurar=ctx.facGuardarPosicionRevision();ctx.CURRENT='clientes';restaurar();assert.equal(scrolls,0);
});
test('guardar, asignar, fusionar, pagos y vinculación actualizan la lista sin recargar la vista',()=>{
 for(const [a,b] of [['async function facFusionarPendientes()', '// ── Posibles duplicados'],['async function facNormalizarLocales()', 'function fac'],['async function facSelPagar(', '// Solo repinta'],['function facFicha(', 'function facExport('],['function facRevisar(', '// ════════════════════════ VISTA: WHATSAPP'],['async function facPago(', 'function fac']]) {
  const fn=tramo(a,b);assert.ok(fn.includes('facRefresh({mantenerRevision:true})'),a);assert.ok(!fn.includes('loadFacturas()'),a);
 }
});
test('guardar y seguir solo abre el siguiente disponible si seguimos en compras sin otro modal',async()=>{
 for(const caso of ['seguir','guardar','otra pantalla','otro modal']) {
  let cerrado=0,abierto=0;
  const ov={_revisionCola:[{accion:'fac-ficha',id:'9'},{accion:'fac-revisar',id:'10'}],dataset:{siguiente:caso==='guardar'?'':'1'},querySelector:()=>({click:()=>cerrado++})};
  const ctx=vm.createContext({CURRENT:caso==='otra pantalla'?'clientes':'facturas',facRefresh:async()=>{},toast:()=>{},document:{querySelector:()=>caso==='otro modal'?{}:null,querySelectorAll:()=>[{dataset:{act:'fac-revisar',id:'10'},click:()=>abierto++}]}});
  vm.runInContext(tramo('async function facTerminarRevision(', 'function facOfrecerDeshacer('),ctx);
  await ctx.facTerminarRevision(ov);
  assert.equal(cerrado,1);assert.equal(abierto,caso==='seguir'?1:0);
 }
});
