import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
function fn(name) { const i=source.indexOf(`function ${name}(`); const begin=source.slice(Math.max(0,i-6),i)==='async '?i-6:i;return source.slice(begin,source.indexOf('\n}',i)+2); }
function setup({section='envios',request}={}) {
 const paths=[],node={innerHTML:''};
 const apiRaw=async path=>{paths.push(path);return request ? request(path) : {data:[]};};
 const context=vm.createContext({
  CAMP_SECCION:section,CURRENT:'campanas',CAMP:{list:[],plantillas:[],audiencias:[],cfg:null},PROMO:{list:[]},FID:{locales:[]},FIDG:{},Map,
  document:{getElementById:()=>node},apiRaw,api:async path=>(await apiRaw(path)).data,apiOptional:async path=>(await apiRaw(path)).data,
  puedeVer:()=>true,skeleton:()=> 'cargando',errorCard:m=>`error:${m}`,renderCampanas:()=>JSON.stringify(context.CAMP),campFaltan:()=>{},esc:String,toast:()=>{},
 });
 vm.runInContext('let CAMP_LOAD_ID = 0;'+fn('loadFidGestion')+'\n'+fn('loadCampanas'),context);
 return {context,paths,node};
}
test('mensajes no consulta datos de puntos o formularios que no se muestran',async()=>{
 const h=setup();await h.context.loadCampanas();assert.equal(h.paths.filter(p=>p.startsWith('/api/fidelizacion/')).length,0);
});
test('fallo al leer cumpleaños se presenta como error, nunca como desactivado',async()=>{
 const h=setup({section:'auto',request:async p=>{if(p==='/api/campanas-config')throw Error('Sin conexión');return {data:[]};}});
 assert.equal(await h.context.loadCampanas(),false);assert.match(h.node.innerHTML,/error:/);assert.equal(h.context.CAMP.cfg,null);
});
test('cumpleaños funciona aunque falle el historial de campañas',async()=>{
 const h=setup({section:'auto',request:async p=>{if(p==='/api/campanas')throw Error('historial no disponible');return {data:[],cumple_auto:true,cumple_plantilla:'Hola'};}});
 await h.context.loadCampanas();assert.equal(h.context.CAMP.cfg?.cumple_auto,true);assert.deepEqual(h.paths,['/api/campanas-config']);
});
test('una respuesta antigua no sustituye el listado más reciente',async()=>{
 let primera;let n=0;
 const h=setup({request:async p=>{if(p==='/api/campanas'){n++;if(n===1)return new Promise(r=>primera=r);return {data:[{nombre:'nuevo'}]};}return {data:[]};}});
 const pendiente=h.context.loadCampanas();await h.context.loadCampanas();primera({data:[{nombre:'antiguo'}]});await pendiente;
 assert.equal(h.context.CAMP.list[0].nombre,'nuevo');assert.match(h.node.innerHTML,/nuevo/);
});
test('si falla el cargador, el selector no abre un editor con datos antiguos',async()=>{
 let click,opened=0;
 const c=vm.createContext({puedeVer:()=>true,modal:()=>({remove(){},addEventListener:(_,cb)=>click=cb}),marketingCampTab:async()=>false,openNuevaCampana:()=>opened++,toast:()=>{}});
 vm.runInContext(fn('marketingCrearCampana'),c);c.marketingCrearCampana();await click({target:{closest:()=>({dataset:{objetivo:'mensaje'}})}});assert.equal(opened,0);
});
test('los canjes de una promoción compartida no se presentan como conversión del anuncio',()=>{
 const c=vm.createContext({PROMO:{cap:{data:[{nombre:'Anuncio A',clave:'a',promocion:'Compartida',estado:'activa',altas:2,canjeados:9}],cupo:{}},capCola:[]},USER:{rol:'marketing'},CAP_EST:{activa:['ok','Activa'],no_existe:['','']},CAP_COLA_EST:{},esc:String,num:n=>String(n||0),promoPct:(n,d)=>Math.round(n/d*100)});
 vm.runInContext(fn('promoCaptacion'),c);const html=c.promoCaptacion();assert.match(html,/Canjes de la promoción/);assert.doesNotMatch(html,/450%/);assert.match(html,/pueden incluir otras campañas/);
});
test('un fallo de formularios no aparece como una lista vacía lista para editar',async()=>{
 const h=setup({section:'formularios',request:async p=>{if(p==='/api/fidelizacion/formularios')throw Error('Sin conexión');return {data:[]};}});
 assert.equal(await h.context.loadCampanas(),false);assert.match(h.node.innerHTML,/error:/);
});
test('un listado de cupones tardío no reemplaza los cupones más recientes',async()=>{
 let first,queries=0;const node={innerHTML:''};
 const c=vm.createContext({PROMO:{tab:'qr',list:[]},document:{getElementById:()=>node},skeleton:()=>'',errorCard:m=>m,renderPromos:()=>JSON.stringify(c.PROMO.qrs),apiRaw:async p=>{if(p==='/api/promos/qr'){if(++queries===1)return new Promise(r=>first=r);return {data:[{id:2}]};}return {data:[]};}});
 vm.runInContext('let PROMO_LOAD_ID=0;'+fn('loadPromos'),c);
 const pending=c.loadPromos();while(!first)await Promise.resolve();await c.loadPromos();first({data:[{id:1}]});await pending;assert.equal(c.PROMO.qrs[0].id,2);assert.match(node.innerHTML,/2/);
});
