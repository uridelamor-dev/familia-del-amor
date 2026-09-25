import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoCumple, encolarCumples } from '../../src/modules/campaigns/cumple-cola.js';
import { tipoPorToken } from '../../src/modules/messaging/contexto.js';
const now = new Date('2026-09-24T09:00:00Z');
test('cumpleaños: pausa, caducidad Madrid y clasificación comercial', () => {
 assert.equal(estadoCumple('cumple:2026-09-24:600000000', true, now), 'enviar');
 assert.equal(estadoCumple('cumple:2026-09-24:600000000', false, now), 'pausado');
 assert.equal(estadoCumple('cumple:2026-09-23:600000000', true, now), 'caducado');
 assert.equal(estadoCumple('cumple:2026-09-24:600000000', true, new Date('2026-09-24T22:00:00Z')), 'caducado');
 assert.equal(estadoCumple('com:123', false, now), 'ajeno');
 assert.equal(tipoPorToken('cumple:2026-09-24:600000000'), 'comercial');
});
test('encola sin canal, personaliza y excluye bajas, otros días y teléfonos vacíos', async () => {
 const filas=[];
 const c={nombre:'Anna', telefono:'+34 600 000 000', nacimiento:'2000-09-24'};
 await encolarCumples({contactos:[c,{...c,baja:1},{...c,nacimiento:'2000-09-25'},{...c,telefono:''}], plantilla:'Hola', resolverMensaje:()=> 'Per molts anys, {nombre}!', now, dbRun:async(sql,args)=>{assert.match(sql,/ON CONFLICT \(token\) DO NOTHING/);filas.push(args);}});
 assert.equal(filas.length,1);
 assert.equal(filas[0][0],'cumple:2026-09-24:600000000');
 assert.equal(filas[0][3],'Per molts anys, Anna!');
});
