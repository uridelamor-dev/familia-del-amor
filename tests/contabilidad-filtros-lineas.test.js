import {test} from 'node:test';import assert from 'node:assert/strict';
import {filtrosLineas} from '../src/modules/facturas/filtros-lineas.js';
test('combina locales, periodo, proveedor, categorías y búsqueda sin ampliar el alcance',async()=>{
 const f=await filtrosLineas({from:'2026-10-01',to:'2026-10-28',proveedor:'Empresa',categoria:'Bebidas',q:'Agua'}, {locales:['A','B'],proveedoresDeCategorias:async()=>['Empresa'],claveProducto:s=>s.toLowerCase()});
 assert.deepEqual(f.params,[['A','B'],'2026-10-01','2026-10-28','Empresa',['Empresa'],'%agua%']);
 for(const s of ['f.local = ANY(?)','f.fecha >= ?','f.fecha <= ?','LOWER(f.proveedor)','f.proveedor = ANY(?)','l.clave LIKE ?'])assert.ok(f.sql.includes(s));
});
test('una categoría sin proveedores conserva el conjunto vacío',async()=>{
 const f=await filtrosLineas({categoria:'Inexistente'}, {proveedoresDeCategorias:async()=>[],claveProducto:String});
 assert.deepEqual(f.params,[[]]);assert.match(f.sql,/f.proveedor = ANY/);
});
