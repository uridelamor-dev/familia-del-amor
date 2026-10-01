import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SQL_CANJES,filtrarCanjes,resumenCanjes,destinatariosCanjes} from '../src/modules/fidelizacion/actividad-canjes.js';
const rows=[
 {id:'agora:1',promocion_clave:'agora:desayuno',telefono:'+34 600000000',qr_id:1,local:'Girona',epoch_ms:Date.parse('2026-09-30T22:30:00Z')},
 {id:'agora:2',promocion_clave:'agora:desayuno',telefono:'600000000',qr_id:1,local:'Girona',epoch_ms:Date.parse('2026-10-01T07:00:00Z')},
 {id:'cupon:1',promocion_clave:'cupon:1',telefono:'600000001',qr_id:2,local:'Blanes',epoch_ms:Date.parse('2026-09-30T08:00:00Z')}
];
test('filters local, promotion and Madrid calendar date together',()=>{
 assert.equal(filtrarCanjes(rows,{local:'Girona',fecha:'2026-10-01',promocion:'agora:desayuno'}).length,2);
 assert.equal(filtrarCanjes(rows,{fecha:'2026-09-30'}).length,1);
 assert.throws(()=>filtrarCanjes(rows,{fecha:'bad'}));
});
test('counts redemptions separately from identified clients and preserves source identities',()=>{
 assert.deepEqual(resumenCanjes(rows),{canjes:3,clientes:2});
 assert.equal(new Set(rows.map(r=>r.id)).size,3);
});
test('email recipients require explicit consent, deduplicate addresses and exclude optouts',()=>{
 const contactos=[{telefono:'600000000',correo:'A@example.com',opt_in_email:1},{telefono:'+34 600000000',correo:'a@example.com',opt_in_email:1},
 {telefono:'600000001',correo:'b@example.com',opt_in_email:0}];
 assert.equal(destinatariosCanjes(rows,contactos).length,1);
 assert.equal(destinatariosCanjes(rows,[...contactos,{telefono:'600000000',baja:1}]).length,0);
 assert.equal(destinatariosCanjes(rows,[...contactos,{telefono:'699999999',correo:'a@example.com',baja:1}]).length,0);
 assert.equal(destinatariosCanjes(rows,[{telefono:'699999999',correo:'x@example.com',opt_in_email:1}]).length,0);
});
test('reading excludes Agora trials, refunds and reversed redemptions and never writes',()=>{
 assert.match(SQL_CANJES,/u.estado='usado'/);assert.match(SQL_CANJES,/f.es_prueba=FALSE/);
 assert.match(SQL_CANJES,/f.revertida_en IS NULL/);assert.match(SQL_CANJES,/f.devolucion=FALSE/);
 assert.ok(!/\b(UPDATE|INSERT|DELETE)\b/.test(SQL_CANJES));
});
