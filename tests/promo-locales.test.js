import test from 'node:test';
import assert from 'node:assert/strict';
import { localesPromo, promoEnLocal, vigente } from '../src/modules/fidelizacion/promos.js';

test('la promoción acepta los tres locales seleccionados, sin extenderla al resto', () => {
 const p={estado:'publicada',local:'Girona',locales:['Girona','Blanes','Lloret'],dias:[4]};
 for(const local of p.locales) assert.equal(vigente(p,{local,ahora:'2026-10-15T19:00:00+02:00'}).ok,true);
 assert.equal(vigente(p,{local:'Tordera',ahora:'2026-10-15T19:00:00+02:00'}).motivo,'otro_local');
 assert.equal(vigente(p,{local:'Blanes',ahora:'2026-10-16T19:00:00+02:00'}).motivo,'otro_dia');
});
test('compatibilidad con filas antiguas y listas JSON, sin convertir listas vacías en globales',()=>{
 assert.deepEqual(localesPromo({local:'Girona',locales:'["Blanes","Lloret","Blanes"]'}),['Blanes','Lloret']);
 assert.equal(promoEnLocal({local:'Girona'},'Blanes'),false);
 assert.equal(promoEnLocal({local:null},'Blanes'),true);
 assert.equal(promoEnLocal({local:null,locales:[]},'Blanes'),false);
 assert.equal(promoEnLocal({local:'Girona',locales:'invalid'},'Girona'),false);
});
