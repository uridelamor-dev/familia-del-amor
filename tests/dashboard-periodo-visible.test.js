import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const panel=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const start=panel.indexOf('function renderDashboard(d)');
const end=panel.indexOf('  // ── Actividad',start);
function render(from,to,per,estado='listo') {
 const env={DASH_RANGE:{from,to,label:from===to?'Ayer':'Periodo'},DASH_PERIODO:per,DASH_PERIODO_ESTADO:estado,USER:{},fijarPendientes(){},saludoHora:()=>'',esc:String,fechaLarga:String,fechaCorta:String,fechaMini:String,todayStr:()=> '2026-10-11',ic:()=>'',eur:n=>String(n),num:String,dec1:String,kpi:o=>JSON.stringify(o)};
 vm.runInNewContext(panel.slice(start,end)+'return header+kpis;}',env);
 return env.renderDashboard({fecha:'2026-10-11',diario:{actual:{ventas:99999,tickets:99,ticketMedio:101},variacion:5,anterior:'2026-10-04'}});
}
test('ayer y rango muestran sus ventas, nunca las cifras de hoy',()=>{
 for(const [from,to] of [['2026-10-10','2026-10-10'],['2026-10-01','2026-10-05']]){
 const html=render(from,to,{ventas:{disponible:true,total:1234,tickets:10,ticket_medio:123.4},comparacion:{ventas:12,etiqueta:'periodo anterior',desde:'2026-09-26',hasta:'2026-09-30'}});
 assert.match(html,/1234/);assert.match(html,/123.4/);assert.match(html,new RegExp(from));assert.doesNotMatch(html,/99999|Facturación hoy/);
 }
});
test('carga y fallo de un periodo no muestran las cifras de hoy',()=>{
 for(const estado of ['cargando','error'])assert.doesNotMatch(render('2026-10-10','2026-10-10',null,estado),/99999|Facturación hoy/);
});
test('hoy conserva las cifras en vivo',()=>assert.match(render('2026-10-11','2026-10-11',null),/99999/));
