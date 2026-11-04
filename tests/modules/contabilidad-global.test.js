import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {contabilidadGlobal} from '../../src/modules/usuarios/contabilidad-global.js';
test('Contabilidad administra el catálogo compartido con Oficina u otro local asignado',()=>{
 for(const user of [{rol:'contabilidad',local:'Oficina'},{rol:'contabilidad',local:'La Tapeta - Blanes'},{rol:'contabilidad'},{rol:'direccion',local:'Oficina'}])assert.equal(contabilidadGlobal(user),true);
});
test('otros roles no obtienen acceso al catálogo contable aunque tengan todos los locales',()=>{
 for(const rol of ['encargado','marketing','rrhh','trabajador',undefined])assert.equal(contabilidadGlobal({rol,locales:['Oficina','La Tapeta - Blanes']}),false);
 assert.equal(contabilidadGlobal(null),false);
});
test('unión simple, múltiple y memoria usan autorización contable en lugar del filtro local',()=>{
 const s=fs.readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 const union=s.slice(s.indexOf("app.post('/api/facturas/proveedores-unir/preview'"),s.indexOf('// La versión evita sobrescribir una ficha'));
 assert.equal((union.match(/contabilidadGlobal\(req.user\)/g)||[]).length,3);
 assert.ok(!union.includes('localesScope('));
 assert.ok(s.includes('global:req=>contabilidadGlobal(req.user)'));
});
