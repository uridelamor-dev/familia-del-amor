import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repartirAvisos,versionAviso,claveAviso} from '../src/modules/avisos/decisiones.js';
import {registrarBandeja} from '../src/modules/avisos/bandeja.js';
const a={id:'factura:1',fuente:'facturas',sev:'imp',detalle:'Revisar IVA',primera:'2026-10-01T00:00:00Z'};
const d={fuente:a.fuente,id:claveAviso(a),version:versionAviso(a),accion:'descartar',motivo:'Comprobado'};
test('descartar persiste entre lecturas, sin depender del contador o la antigüedad',()=>{
 assert.equal(repartirAvisos([a],[d]).data.length,0);
 assert.equal(repartirAvisos([{...a,dias:99,escalado:true}],[d]).ocultos[0].motivo,'Comprobado');
 assert.equal(repartirAvisos([a],[]).data.length,1,'restaurar elimina la decisión');
});
test('cambio de causa, gravedad o nueva recurrencia reactiva el aviso',()=>{
 for(const cambio of [{detalle:'Posible duplicado'},{sev:'crit'},{primera:'2026-10-28T00:00:00Z'}])assert.equal(repartirAvisos([{...a,...cambio}],[d]).data.length,1);
});
test('pospuesto se recupera exactamente al vencer, descartado no caduca',()=>{
 const hasta='2026-11-01T10:00:00Z',t=Date.parse(hasta);
 assert.equal(repartirAvisos([a],[{...d,accion:'posponer',hasta}],t-1).ocultos.length,1);
 assert.equal(repartirAvisos([a],[{...d,accion:'posponer',hasta}],t).data.length,1);
 assert.equal(repartirAvisos([a],[d],t).ocultos.length,1);
});
test('los grupos de datos personales detectan nuevos campos pendientes',()=>{
 const r={...a,fuente:'rrhh',worker_id:7,campos:['dni','telefono']};
 assert.equal(claveAviso(r),'persona:7');assert.equal(versionAviso(r),versionAviso({...r,campos:['telefono','dni']}));
 assert.notEqual(versionAviso(r),versionAviso({...r,campos:['telefono']}));
});
function entorno(){
 let post;const consultas=[];
 const client={release(){},async query(sql,params){consultas.push({sql,params});return {rows:sql.includes('RETURNING id,primera')?[{id:a.id,primera:a.primera}]:[]};}};
 registrarBandeja({get(){},post:(_p,_auth,h)=>post=h},{auth(){},pool:{connect:async()=>client},ambito:()=> '[]',cargar:async()=>[a]});
 return {consultas,async enviar(body,user={id:12,rol:'contabilidad'}){let status=200,data;await post({body,user},{status(n){status=n;return this;},json(v){data=v;}});return {status,data};}};
}
test('decisión se guarda en base de datos para el usuario autenticado y permite recuperar',async()=>{
 const e=entorno(),body={fuente:a.fuente,clave:a.id,version:d.version,accion:'descartar',motivo:' Correcto '};
 assert.equal((await e.enviar(body)).status,200);
 const insert=e.consultas.find(q=>q.sql.includes('INSERT INTO panel_avisos_decisiones'));
 assert.equal(insert.params[0],'12');assert.equal(insert.params[5],'Correcto');
 assert.equal((await e.enviar({...body,accion:'restaurar'})).status,200);
 assert.deepEqual(e.consultas.find(q=>q.sql.startsWith('DELETE')).params,['12','facturas','factura:1']);
});
test('rechaza otro departamento, fecha pasada y decisión sobre una versión obsoleta',async()=>{
 const e=entorno(),body={fuente:a.fuente,clave:a.id,version:d.version,accion:'descartar'};
 assert.equal((await e.enviar(body,{id:3,rol:'marketing'})).status,403);
 assert.equal((await e.enviar({...body,accion:'posponer',hasta:'2020-01-01'})).status,400);
 assert.equal((await e.enviar({...body,version:'obsoleta'})).status,409);
 assert.equal(e.consultas.filter(q=>q.sql.includes('INSERT INTO panel_avisos_decisiones')).length,0);
});
