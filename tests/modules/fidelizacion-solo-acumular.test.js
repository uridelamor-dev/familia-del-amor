import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluarFactura,rewardDe,rewardVigente,simular,saldo} from '../../src/modules/fidelizacion/puntos.js';
const regla={id:1,version:1,solo_acumular:true,puntos_por_euro:1,redondeo:'floor',puntos_necesarios:0,descuento_euros:0,caducidad_meses:0,activa:true};
test('solo acumular concede euros completos pagados, sin caducidad ni recompensa',()=>{
 const result=evaluarFactura({json:{Payments:[{Amount:32.30,PaidAmount:50,ChangeAmount:17.70}]},extracto:{miembros:[{member:'socio'}]},regla,local:'Lloret',interruptores:{conceder:true},ahora:'2026-10-14T12:00:00Z'});
 assert.equal(result.puntos,32);assert.equal(result.caduca_en,null);assert.equal(result.consumo,null);
 assert.equal(rewardDe({...regla,reward_id:'accidental'},'Lloret'),null);
 assert.equal(rewardVigente({...regla,reward_id:'accidental'},{ahora:'2026-10-14T12:00:00Z'}).ok,false);
 assert.ok(simular(regla).casos.every(c=>c.tipo==='compra'));
});
test('la regla preparada no salta el interruptor de concesión',()=>{
 const result=evaluarFactura({json:{Payments:[{Amount:32.30}]},extracto:{miembros:[{member:'socio'}]},regla,interruptores:{conceder:false},ahora:'2026-10-14T12:00:00Z'});
 assert.equal(result.puntos,0);
});
