import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fuentesVentas,barras} from '../src/modules/locales/centros.js';
import {ventasRecientes} from '../src/modules/dashboard/ventas-recientes.js';

test('Blanes usa un único TPV que incluye Cooperativa, sin duplicar ni marcar parcial',()=>{
 const locales=[...new Set(['La Tapeta - Blanes','Cooperativa - Blanes'].flatMap(fuentesVentas))];
 assert.deepEqual(locales,['La Tapeta - Blanes']);
 const hoy='2026-10-28';
 const r=ventasRecientes({hoy,from:hoy,to:hoy,locales,vivo:{hoy,locales:[{local:'La Tapeta - Blanes',dias:[{dia:hoy,ventas:100,tickets:10}]},{local:'Cooperativa - Blanes',error:'sin servidor'}]}});
 assert.equal(r.parcial,false);assert.equal(r.serie[0].ventas,100);
 const fallido=ventasRecientes({hoy,from:hoy,to:hoy,locales,vivo:{hoy,locales:[]}});
 assert.equal(fallido.parcial,true);
 assert.equal(barras('La Tapeta - Blanes','personal').length,2);
 assert.deepEqual(fuentesVentas('La Tapeta - Girona'),['La Tapeta - Girona']);
});
