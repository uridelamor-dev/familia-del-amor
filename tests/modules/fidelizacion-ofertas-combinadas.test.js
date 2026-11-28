import { descuentoPromocionCentimos } from '../../src/modules/fidelizacion/descuento-promocion.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewardsDePromo, rewardsCoincidenConPromo, idPromoDeReward, puedePublicar, elegible } from '../../src/modules/fidelizacion/promos.js';
import { evaluarFactura } from '../../src/modules/fidelizacion/puntos.js';
const p = { id: 1, tipo: 'oferta_agora', reward_id: 'fidp:BF_version1',
  codigo_agora: 'BFR1', codigo_agora_adicional: 'BFR2', codigo_comprobado_en: '2026-11-26',
  nombre: 'Black Friday', texto_cliente: '10% resto; 20% tarjetas', texto_camarero: 'Black Friday',
  local: 'La Tapeta - Girona', locales: ['La Tapeta - Girona'], estado: 'publicada',
  desde: '2026-11-26', hasta: '2026-11-29', limite_cuenta: 0, coste_puntos: 0, acumulable: false };
const emitted = rewardsDePromo(p);
const decision = rewards => evaluarFactura({ json: { DocumentType: 'StandardInvoice', Payments: [{ Amount: 40.65 }],
  InvoiceItems: [{ LoyaltyProgram: { MemberId: 'socio', Rewards: rewards } }] },
  extracto: { miembros: [{ qrId: 1 }] }, promoReward: p, regla: null,
  interruptores: {}, saldoDisponible: 0, ahora: '2026-11-27T12:00:00Z' });
test('emite solo dos ofertas, sin porcentaje sobre el ticket', () => {
  assert.deepEqual(emitted.map(r => [r.Id, r.Type, r.Code]), [
    ['fidp:BF_version1', 'Offer', 'BFR1'], ['fidp:BF_version1:2', 'Offer', 'BFR2']]);
  assert.ok(emitted.every(r => !('Value' in r)));
});
test('cierra tickets con ambos grupos o con uno solo, sin consumir puntos', () => {
  for (const rs of [emitted, [...emitted].reverse(), [emitted[0]], [emitted[1]]]) {
    assert.equal(rewardsCoincidenConPromo(p, rs), true);
    assert.equal(decision(rs).accion, 'aceptar');
    assert.equal(decision(rs).consumo, null);
  }
});
test('rechaza acumulación global, otros premios, duplicados y códigos adulterados', () => {
  const malos = [ [...emitted, { Id: 'fidp:old10', Type: 'DiscountRate', Value: 10 }],
    [emitted[0], { ...emitted[1], Code: 'coqu' }],
    [emitted[0], { ...emitted[1], Type: 'CashDiscount', Value: 100 }],
    [emitted[0], { ...emitted[1], Id: 'fidp:other:2' }], [emitted[1], emitted[1]],
    [{ ...emitted[1], Id: 'fidp:BF_version1:3' }] ];
  for (const rs of malos) {
    assert.equal(rewardsCoincidenConPromo(p, rs), false);
    assert.equal(decision(rs).accion, 'rechazar');
  }
});
test('una oferta simple conserva su límite de un premio', () => {
  const simple = { ...p, codigo_agora_adicional: null };
  assert.equal(rewardsDePromo(simple).length, 1);
  assert.equal(rewardsCoincidenConPromo(simple, emitted), false);
});
test('solo resuelve sufijos emitidos y mantiene versiones separadas', () => {
  assert.equal(idPromoDeReward(emitted[1].Id), p.reward_id);
  assert.equal(idPromoDeReward('fidp:BF_version1:3'), 'fidp:BF_version1:3');
  assert.equal(rewardsCoincidenConPromo({ ...p, reward_id: 'fidp:BF_version2' }, emitted), false);
});
test('no publica combinaciones inválidas o acumulables', () => {
  assert.equal(puedePublicar(p).ok, true);
  for (const cambio of [{ codigo_agora_adicional: 'BFR1' }, { codigo_agora_adicional: 'bad code' },
    { acumulable: true }, { coste_puntos: 1 }, { tipo: 'descuento_pct', valor: 10 }]) {
    assert.equal(puedePublicar({ ...p, ...cambio }).ok, false);
    assert.deepEqual(rewardsDePromo({ ...p, ...cambio }), []);
  }
});
test('solo local autorizado y hasta el domingo inclusive', () => {
  const ctx = { local: p.local, usos: 0, usosTotales: 0, saldo: 0, derechos: 0 };
  assert.equal(elegible(p, { ...ctx, ahora: '2026-11-29T22:59:00Z' }).ok, true);
  assert.equal(elegible(p, { ...ctx, ahora: '2026-11-29T23:00:00Z' }).ok, false);
  assert.equal(elegible(p, { ...ctx, ahora: '2026-11-27T12:00:00Z', local: 'otro' }).ok, false);
});


test('Black Friday: suma solo descuentos conciliados de las dos ofertas', () => {
  const ticket = {InvoiceItems:[{VatIncluded:true,LoyaltyProgram:{Rewards:emitted},Lines:[
    {OfferCode:'BFR1',UnitPrice:18.5,Quantity:1,TotalAmount:16.65,DiscountRate:0.1},
    {OfferCode:'BFR2',UnitPrice:30,Quantity:1,TotalAmount:24,CashDiscount:6},
    {OfferCode:'otra',UnitPrice:10,Quantity:1,TotalAmount:5,CashDiscount:5},
  ]}]};
  assert.equal(descuentoPromocionCentimos(ticket,p),785);
  const incompleto = structuredClone(ticket);
  incompleto.InvoiceItems[0].Lines[1].OfferCode = 'otra';
  assert.equal(descuentoPromocionCentimos(incompleto,p),null);
  const descuadre = structuredClone(ticket);
  descuadre.InvoiceItems[0].Lines[0].TotalAmount = 16;
  assert.equal(descuentoPromocionCentimos(descuadre,p),null);
});
