import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('  setOnCancelarReserva(async');
const code=source.slice(start,source.indexOf('\n  });',start)+6);
for(const fallo of ['consulta_grupo','envio_grupo','borrado'])test('cancelación refleja el guardado aunque falle '+fallo,async()=>{
 let cancelar,borrados=0;
 const reserva={id:1,telefono:'600111222',nombre_reserva:'Prueba',local:'Local',dia:'2026-10-23'};
 vm.runInNewContext(code,{
  console:{log(){},error(){}},setOnCancelarReserva:fn=>cancelar=fn,
  dbAll:async()=>[reserva],dbRun:async()=>{if(fallo==='borrado')throw Error('fallo');borrados++;},
  dbGet:async()=>{if(fallo==='consulta_grupo')throw Error('fallo');return {group_jid:'grupo'};},
  isReady:()=>true,sendCancelacionGrupo:async()=>{if(fallo==='envio_grupo')throw Error('fallo');}
 });
 const r=await cancelar({telefono:'34600111222',dia:'2026-10-23'},'cliente');
 assert.equal(r.ok,fallo!=='borrado');assert.equal(borrados,fallo==='borrado'?0:1);
});
