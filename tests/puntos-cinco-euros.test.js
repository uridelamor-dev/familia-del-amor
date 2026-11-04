import test from 'node:test';import assert from 'node:assert/strict';
import {puntosDe} from '../src/modules/fidelizacion/puntos.js';
test('un punto por cada cinco euros: límites y redondeo por ticket',()=>{for(const [c,p] of [[0,0],[499,0],[500,1],[999,1],[1000,2],[3230,6],[5000,10]])assert.equal(puntosDe(c,{puntos_por_euro:0.2,redondeo:'floor'}),p);});
test('las reglas históricas conservan su cálculo',()=>{assert.equal(puntosDe(3230,{puntos_por_euro:1,redondeo:'floor'}),32);});
