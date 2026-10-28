import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agruparDesglose,gastoDesglosado} from '../../src/modules/dashboard/desglose.js';
test('el desglose conserva todos los locales, agrupa Blanes y mantiene la falta de datos',()=>{
 const r=agruparDesglose([{local:'La Tapeta - Blanes',total:100,disponible:true},{local:'Cooperativa - Blanes',total:50,disponible:true},{local:'Girona',total:0,disponible:false},...['Lloret','Mateu','Ibérica','Oficina'].map(local=>({local,total:20,disponible:true}))]);
 assert.equal(r.length,6);assert.equal(r.find(x=>x.local==='La Tapeta - Blanes').total,150);assert.equal(r.find(x=>x.local==='Girona').disponible,false);
 assert.equal(r.reduce((s,x)=>s+x.total,0),230);
});
test('gastos propios y de empresa se suman una vez y respetan el ámbito',()=>{
 const base=[{local:'La Tapeta - Blanes',total:100},{local:'Cooperativa - Blanes',total:50},{local:'Girona',total:200}];
 const empresa={porLocal:new Map([['La Tapeta - Blanes',30],['Girona',70]]),sinRepartir:[{total:25}]};
 const global=gastoDesglosado(base,empresa);assert.equal(global.total,475);
 assert.equal(global.porLocal.reduce((s,r)=>s+r.total,0),global.total);
 const filtrado=gastoDesglosado(base,empresa,['La Tapeta - Blanes']);assert.equal(filtrado.total,180);assert.equal(filtrado.porLocal.length,1);
});
test('abonos negativos no se pierden del total',()=>assert.equal(gastoDesglosado([{local:'A',total:100},{local:'B',total:-20}],null).total,80));
