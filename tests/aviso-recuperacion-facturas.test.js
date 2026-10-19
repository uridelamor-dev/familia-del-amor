import test from 'node:test';
import assert from 'node:assert/strict';
import { crearAvisoRecuperacionFacturas } from '../src/modules/messaging/aviso-recuperacion-facturas.js';
test('treinta documentos y un reinicio producen un solo aviso por grupo', async () => {
  const claves = new Set(), envios = [];
  const deps = { ahora: () => new Date('2026-10-19T12:00:00Z'),
    dbGet: async (_sql,[key]) => { if (claves.has(key)) return null; claves.add(key); return {key}; },
    enviar: async (...args) => envios.push(args) };
  const aviso = crearAvisoRecuperacionFacturas(deps);
  await Promise.all(Array.from({length:30},()=>aviso('lloret@g.us')));
  await crearAvisoRecuperacionFacturas(deps)('lloret@g.us');
  assert.equal(envios.length,1);
  await aviso('girona@g.us');
  assert.equal(envios.length,2);
});
test('un envío incierto no se repite ni bloquea la recepción', async () => {
  let reservado=false, intentos=0;
  const aviso=crearAvisoRecuperacionFacturas({
    dbGet:async()=>{if(reservado)return null;reservado=true;return {key:'x'};},
    enviar:async()=>{intentos++;throw Error('timeout');},log:()=>{}
  });
  await aviso('lloret@g.us'); await aviso('lloret@g.us');
  assert.equal(intentos,1);
});
