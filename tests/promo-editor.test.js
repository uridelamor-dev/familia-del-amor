import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const section=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const ctx=vm.createContext({
 FIDG:{promos:[]}, FIDG_TIPO_CODIGO:['oferta_agora'], todayStr:()=> '2026-10-15',
 esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 fgFila:(a,b)=>`<article>${a}${b}</article>`
});
vm.runInContext(section('const FIDG_TIPO_TXT =','/** SIMULAR:'),ctx);
vm.runInContext(section('function fidgPromoResumen(','/**\n * @param'),ctx);
test('el listado conserva publicada y borrador actual, y pliega el historial vencido',()=>{
 ctx.FIDG.promos=[
  {id:1,clave:'coca',version:1,nombre:'Vieja',estado:'finalizada'},
  {id:2,clave:'coca',version:2,nombre:'Vigente',estado:'publicada',hasta:'2026-11-30'},
  {id:3,clave:'coca',version:3,nombre:'Cambios',estado:'borrador'},
  {id:4,clave:'otra',version:1,nombre:'Caducada',estado:'publicada',hasta:'2026-10-01'}
 ];
 const html=ctx.renderFidgPromos(), corte=html.indexOf('Historial y borradores anteriores');
 assert.ok(html.indexOf('Vigente')<corte);
 assert.ok(html.indexOf('Cambios')<corte);
 assert.ok(html.indexOf('Vieja')>corte);
 assert.ok(html.indexOf('Caducada')>corte);
 for(const id of [1,2,3,4]) assert.ok(html.includes(`data-id="${id}"`));
 assert.match(html,/Periodo terminado/);
});
test('la revisión distingue oferta por código, locales, días y audiencia, escapando textos',()=>{
 const c={nombre:'<img>',tipo:'oferta_agora',codigo_agora:'coqu',locales:['Girona','Blanes','Lloret'],dias:[2],hora_desde:'18:00',hora_hasta:'23:50',desde:'2026-10-20',hasta:'2026-11-24',requiere_derecho:false,limite_cuenta:0,coste_puntos:0,compra_minima:0,limite_total:0,texto_cliente:'Coques a 9,50 €'};
 const html=ctx.fidgPromoRevision(c);
 assert.match(html,/Girona, Blanes, Lloret/);
 assert.match(html,/Martes/);
 assert.match(html,/Oferta de Ágora · coqu/);
 assert.match(html,/Cualquier cliente con carnet/);
 assert.match(html,/No consume puntos/);
 assert.match(html,/&lt;img>/);
 assert.doesNotMatch(html,/<img>/);
 assert.match(ctx.fidgPromoRevision({...c,locales:[]}),/Falta seleccionar/);
 assert.match(ctx.fidgPromoRevision({...c,requiere_derecho:true}),/Solo inscritos/);
});
