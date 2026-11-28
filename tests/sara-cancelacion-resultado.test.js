import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {telefonoCarnet} from '../src/modules/messaging/sara-carnet.js';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('  setOnCancelarReserva(async');
const code=source.slice(start,source.indexOf('\n  });',start)+6);
for(const fallo of ['consulta_grupo','envio_grupo','borrado'])test('cancelación refleja el guardado aunque falle '+fallo,async()=>{
 let cancelar,borrados=0;
 const reserva={id:1,telefono:'600111222',nombre_reserva:'Prueba',local:'Local',dia:'2026-10-23'};
 vm.runInNewContext(code,{
  console:{log(){},error(){}},telefonoCarnet,setOnCancelarReserva:fn=>cancelar=fn,
  dbAll:async()=>[reserva],dbRun:async()=>{if(fallo==='borrado')throw Error('fallo');borrados++;return {id:1};},
  dbGet:async()=>{if(fallo==='consulta_grupo')throw Error('fallo');return {group_jid:'grupo'};},
  isReady:()=>true,sendCancelacionGrupo:async()=>{if(fallo==='envio_grupo')throw Error('fallo');}
 });
 const r=await cancelar({telefono:'34600111222',dia:'2026-10-23'},'cliente');
 assert.equal(r.ok,fallo!=='borrado');assert.equal(borrados,fallo==='borrado'?0:1);
});

test('si hay dos reservas no borra la última por defecto, pide hora y cancela la elegida', async () => {
 let cancelar;const borradas=[];
 const reserva = {dia:'2026-11-28',local:'La Tapeta - Girona',telefono:'600111222',nombre_reserva:'Prueba'};
 const filas = [{...reserva,id:2,hora:'21:00:00'}, {...reserva,id:1,hora:'20:00:00'},
   {...reserva,id:3,telefono:'+33600111222',hora:'19:00:00'}];
 vm.runInNewContext(code,{console:{log(){},error(){}},telefonoCarnet,setOnCancelarReserva:f=>cancelar=f,
  dbAll:async()=>filas,dbRun:async(sql,[id])=>{assert.match(sql,/RETURNING id/);borradas.push(id);return {id};},
  dbGet:async()=>null});
 const entrada = {dia:reserva.dia,local:reserva.local,telefono:'+34600111222'};
 const r = await cancelar(entrada);
 assert.equal(r.pedir,'hora');assert.deepEqual([...r.horas],['20:00','21:00']);assert.deepEqual(borradas,[]);
 assert.equal((await cancelar({...entrada,hora:'19:00'})).ok,false);
 assert.equal((await cancelar({...entrada,hora:'20:00'})).ok,true);assert.deepEqual(borradas,[1]);
});
