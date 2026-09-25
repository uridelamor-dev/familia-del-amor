import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {ensureSchemaCaptacion} from '../../src/modules/captacion/schema.js';
import {encolarCumples} from '../../src/modules/campaigns/cumple-cola.js';
test('cumpleaños persiste sin WhatsApp y deduplica reintentos y teléfonos repetidos',async t=>{
 if(!await disponible()){t.skip(motivoSalto());return;}
 const db=await conEsquema();
 try{
  await ensureSchemaCaptacion({run:async(sql,...args)=> /(?:TABLE (?:IF NOT EXISTS )?cap_cola|ON cap_cola)/.test(sql) ? db.run(sql,...args) : undefined});
  const c={nombre:'Prueba',telefono:'600000000',nacimiento:'2000-09-24'};
  const options={contactos:[c,{...c,telefono:'+34 600 000 000'}],plantilla:'Felicidades, {nombre}',now:new Date('2026-09-24T08:00:00Z'),dbRun:db.run};
  await Promise.all([encolarCumples(options),encolarCumples(options)]);
  assert.equal((await db.all('SELECT * FROM cap_cola')).length,1);
  assert.equal((await db.get('SELECT texto FROM cap_cola')).texto,'Felicidades, Prueba');
  await encolarCumples({...options,now:new Date('2027-09-24T08:00:00Z')});
  assert.equal((await db.all('SELECT * FROM cap_cola')).length,2);
 }finally{await db.fin();}
});
