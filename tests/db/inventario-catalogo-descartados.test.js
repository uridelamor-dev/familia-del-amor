import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';

// Ejecuta la consulta real del catálogo: una exclusión solo en el render no basta.
const server=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
const inicio=server.indexOf('app.get("/api/inventario/proveedores/:id/catalogo"');
const bloque=server.slice(inicio,server.indexOf('app.post("/api/inventario/productos/lote"',inicio));
const consulta=/const filas = await dbAll\(\s*(`[^`]+`)/.exec(bloque)?.[1];
assert.ok(consulta,'consulta del catálogo disponible');
const sql=vm.runInNewContext(consulta,{restringido:false,ALBARAN_YA_CONTADO:'FALSE'});

test('catálogo excluye servicios descartados, conserva mercancía y no borra el detalle',async t=>{
 if(!await disponible())return t.skip(motivoSalto());
 const db=await conEsquema();
 try{
  for(const ddl of [
   'CREATE TABLE facturas(id INTEGER PRIMARY KEY,proveedor TEXT,fecha TEXT,local TEXT,dup_estado TEXT)',
   'CREATE TABLE factura_lineas(id INTEGER PRIMARY KEY,factura_id INTEGER,clave TEXT,descripcion TEXT,unidad TEXT)',
   'CREATE TABLE producto_alias(clave TEXT PRIMARY KEY,producto_id INTEGER,descartado BOOLEAN)',
   'CREATE TABLE productos_canonicos(id INTEGER PRIMARY KEY,nombre TEXT)',
  ])await db.raw(ddl);
  await db.raw("INSERT INTO facturas VALUES(1,'Mixto','2026-11-01','Blanes',NULL)");
  await db.raw(`INSERT INTO factura_lineas VALUES
   (1,1,'agedi','Derechos AGEDI','servicio'),
   (2,1,'aie','Derechos AIE','servicio'),
   (3,1,'leche','Leche','L'),
   (4,1,'cafe','Café','kg'),
   (5,1,'agua','Agua','L'),
   (6,1,'pan','Pan','ud')`);
  await db.raw("INSERT INTO productos_canonicos VALUES(10,'Café canónico'),(11,'Servicio antiguo')");
  await db.raw(`INSERT INTO producto_alias VALUES
   ('agedi',NULL,TRUE),('aie',11,TRUE),('cafe',10,FALSE),('agua',NULL,FALSE),('pan',NULL,NULL)`);
  const filas=await db.all(sql,[['Mixto'],'2026-01-01']);
  assert.deepEqual(filas.map(x=>x.descripcion).sort(),['Agua','Café canónico','Leche','Pan'].sort());
  assert.equal((await db.get('SELECT COUNT(*)::int AS n FROM factura_lineas')).n,6,'los servicios siguen en el original contable');
  // Revertir la decisión vuelve a permitir la sugerencia sin recrear la línea.
  await db.raw("UPDATE producto_alias SET descartado=FALSE WHERE clave='agedi'");
  assert.ok((await db.all(sql,[['Mixto'],'2026-01-01'])).some(x=>x.descripcion==='Derechos AGEDI'));
 }finally{await db.fin();}
});
