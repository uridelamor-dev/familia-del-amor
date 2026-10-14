import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {vigente, rewardDePromo} from '../src/modules/fidelizacion/promos.js';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const ctx=vm.createContext({fgVal:()=>'',fgChk:()=>false,FIDG_TIPO_CODIGO:[],document:{querySelectorAll:()=>[{value:'2'}]}});
vm.runInContext(source.slice(source.indexOf('function fidgPromoDias('),source.indexOf('/** SIMULAR:',source.indexOf('function fidgPromoDias('))),ctx);
test('el formulario conserva días al copiar y envía martes al guardar y simular',()=>{
 assert.equal(JSON.stringify(ctx.fidgPromoDias('[2]')),'[2]');
 assert.equal(JSON.stringify(ctx.fidgPromoDias([2,2,9])),'[2]');
 assert.equal(JSON.stringify(ctx.fidgPromoDias('roto')),'[]');
 assert.equal(JSON.stringify(ctx.fidgPromoCuerpo().dias),'[2]');
});
test('la oferta de cocas solo se ofrece los martes en Madrid y en su local',()=>{
 const p={estado:'publicada',local:'Blanes',dias:[2],tipo:'oferta_agora',reward_id:'test',codigo_agora:'COCAS_MARTES'};
 assert.equal(vigente(p,{local:'Blanes',ahora:'2026-10-20T12:00:00+02:00'}).ok,true);
 assert.equal(vigente(p,{local:'Blanes',ahora:'2026-10-21T12:00:00+02:00'}).motivo,'otro_dia');
 assert.equal(vigente(p,{local:'Girona',ahora:'2026-10-20T12:00:00+02:00'}).ok,false);
 const reward=rewardDePromo(p);
 assert.equal(reward.Type,'Offer'); assert.equal(reward.Code,'COCAS_MARTES');
 assert.equal(reward.Value,undefined);
});
