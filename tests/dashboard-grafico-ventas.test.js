import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
test('el gráfico usa ventas ordenadas por día, no comensales; la altura sigue el importe',()=>{
 let data;const ctx={esc:String,fechaCorta:String,eur:n=>n+' €',area:d=>{data=d;return 'gráfico';}};
 vm.runInNewContext(src.slice(src.indexOf('function graficoVentasDashboard'),src.indexOf('function renderDashboard')),ctx);
 ctx.graficoVentasDashboard({reservas:{serie:[{dia:'2026-10-01',personas:9999}]},ventas:{disponible:true,serie:[{dia:'2026-10-03',ventas:50},{dia:'2026-10-01',ventas:100},{dia:'2026-10-02',ventas:200}]}},'');
 assert.deepEqual(Array.from(data.valores),[100,200,50]);
 const graph={num:String,eur:String,esc:String};vm.runInNewContext(src.slice(src.indexOf('function area('),src.indexOf('// Un solo escuchador para todos los gráficos')),graph);
 const html=graph.area(data,{h:120});
 const path=html.match(/<path d="([^"]+)"/)[1];
 const ys=[...path.matchAll(/[ML][\d.]+ ([\d.]+)/g)].slice(0,3).map(x=>Number(x[1]));
 assert.ok(ys[1]<ys[0]&&ys[0]<ys[2]);
 assert.match(ctx.graficoVentasDashboard({ventas:{disponible:true,parcial:true,serie:[]}},''),/lectura completa/);
});
