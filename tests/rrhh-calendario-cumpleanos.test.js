import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrarCalendarioCumpleanos} from '../src/modules/rrhh/calendario-cumpleanos.js';
test('calendario limita ámbito y plantilla y solo devuelve día y mes del nacimiento',async()=>{
 let handler,result;const persona={activo:1,fecha_alta:'2020-01-01',fecha_nac:'1990-10-14',nombre:'Prueba',local:'Oficina',id:1};
 registrarCalendarioCumpleanos({get:(ruta,auth,h)=>{assert.equal(ruta,'/api/rrhh/cumpleanos/calendario');handler=h;}},{auth(){},hoyISO:()=> '2026-10-27',puedeLocal:(_req,l)=>l==='Oficina',dbAll:async()=>[persona,{...persona,id:2,activo:0},{...persona,id:3,fecha_baja:'2025-01-01'},{...persona,id:4,local:'Otro'},{...persona,id:5,fecha_nac:new Date('2000-02-29T00:00:00Z')}]});
 await handler({user:{rol:'rrhh'}},{set(){},json(j){result=j;},status(){return this;}});
 assert.deepEqual(result.data,[{id:1,nombre:'Prueba',local:'Oficina',cumple:'10-14'},{id:5,nombre:'Prueba',local:'Oficina',cumple:'02-29'}]);assert.ok(!JSON.stringify(result).includes('1990'));
});
