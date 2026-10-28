import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {crearCachePeriodo} from '../src/modules/dashboard/cache-periodo.js';
import {rangoAnterior,variacion} from '../src/modules/dashboard/periodos.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
function entorno(){let handler;const consultas=[];
const ctx={app:{get:(_p,_auth,h)=>{handler=h;}},requireAuth:()=>{},localesScope:()=>['Girona'],gastoDeEmpresaPorLocal:async()=>null,cachePeriodoDashboard:crearCachePeriodo(),rangoAnterior,variacion,
periodoDeLocal:async(q,local)=>{consultas.push([q.from,q.to,local]);const n=q.from==='2026-10-01'?200:100;return {reservas:{total:2,personas:5},ventas:{total:n,disponible:true},gastos:{total:20,disponible:true},resultado:n-20};}};
vm.runInNewContext(source.slice(source.indexOf('app.get("/api/dashboard/periodo",'),source.indexOf('// El gasto que es de toda una empresa')),ctx);
return {consultas,async pedir(query){let status=200,body;await handler({query,user:{id:1,rol:'direccion'}},{status:n=>{status=n;return {json:b=>{body=b;}};},json:b=>{body=b;}});return {status,body};}};}
test('compara las fechas elegidas dentro del mismo local y reutiliza el periodo principal',async()=>{
const e=entorno();const q={from:'2026-10-01',to:'2026-10-28'};
await e.pedir(q);
const r=await e.pedir({...q,comparar:'1',compararDesde:'2025-02-01',compararHasta:'2025-02-28'});
assert.equal(r.status,200);assert.equal(r.body.data.comparacion.desde,'2025-02-01');assert.equal(r.body.data.comparacion.resultado,125);
assert.deepEqual(e.consultas,[['2026-10-01','2026-10-28','Girona'],['2025-02-01','2025-02-28','Girona']]);
});
test('rechaza comparaciones con fechas inexistentes o invertidas',async()=>{
for(const [desde,hasta] of [['2025-02-30','2025-03-01'],['2025-03-01','2025-02-01']]){
const e=entorno();assert.equal((await e.pedir({from:'2026-10-01',to:'2026-10-28',comparar:'1',compararDesde:desde,compararHasta:hasta})).status,400);assert.equal(e.consultas.length,0);
}});
