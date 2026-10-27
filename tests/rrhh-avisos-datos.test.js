import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avisosDatos} from '../src/modules/rrhh/avisos-datos.js';
const p={id:5,username:'prueba',nombre:'Persona',local:'Oficina',activo:1,telefono:'',puesto:'Camarero',fecha_nac:'1990-01-01',email:'p@example.org'};
test('un aviso por campo y retirada automática al completarlo',()=>{const a=avisosDatos([p],{hoy:'2026-10-27'});assert.equal(a.length,1);assert.equal(a[0].campo,'telefono');assert.equal(avisosDatos([{...p,telefono:'600000000'}],{hoy:'2026-10-27'}).length,0);});
test('campos privados solo para RRHH y dirección',()=>{assert.ok(!avisosDatos([p]).some(x=>x.campo==='iban'));assert.ok(avisosDatos([p],{privado:true}).some(x=>x.campo==='iban'));});
test('archivados y bajas pasadas no generan pendientes',()=>{assert.equal(avisosDatos([{...p,activo:0},{...p,fecha_baja:'2026-10-01'}],{privado:true,hoy:'2026-10-27'}).length,0);});
