import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IVA_SCHEMA} from '../../src/modules/facturas/iva.js';
import {nifsConfirmados} from '../../src/modules/facturas/identidad-confirmada.js';
const server=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
// Extract production declarations so missing/renamed migrations cannot be hidden by fixtures.
const cargos=server.match(/`(ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cargos_base JSONB)`/)?.[1];
const modo=server.match(/"(lineas_iva_incluido BOOLEAN NOT NULL DEFAULT FALSE)"/)?.[1];
const alias=server.match(/`(\s*CREATE TABLE IF NOT EXISTS facturas_proveedor_alias\s*\([\s\S]*?\)\s*)`/)?.[1];
assert.ok(cargos&&modo&&alias,'las migraciones de ingreso deben estar en el arranque');
assert.match(server,/await client\.query\(IVA_SCHEMA\)/);
test('ingreso: migraciones repetibles preservan datos e identidad sin confirmar OCR histórico',async t=>{
 if(!process.env.TEST_PGLITE_MODULE)return t.skip('Requiere TEST_PGLITE_MODULE');
 const {PGlite}=await import(process.env.TEST_PGLITE_MODULE);const pg=new PGlite();
 try{
  await pg.exec('CREATE TABLE facturas(id INTEGER PRIMARY KEY);CREATE TABLE facturas_pendientes(id INTEGER PRIMARY KEY);INSERT INTO facturas VALUES(1);INSERT INTO facturas_pendientes VALUES(1);');
  const migrar=()=>pg.exec(cargos+';ALTER TABLE facturas ADD COLUMN IF NOT EXISTS '+modo+';'+alias+';'+IVA_SCHEMA);
  await migrar();
  const legacy=(await pg.query('SELECT * FROM facturas WHERE id=1')).rows[0];
  assert.equal(legacy.lineas_iva_incluido,false);
  for(const k of ['cargos_base','recargo_equivalencia','retencion','otros_cargos'])assert.equal(legacy[k],null,'no inferir '+k+' en históricos');
  await pg.exec(`UPDATE facturas SET cargos_base='[{"descripcion":"S.L.","importe":3.9,"porcentaje_iva":21}]',lineas_iva_incluido=TRUE,recargo_equivalencia=2.11,retencion=1,otros_cargos=2 WHERE id=1;
    UPDATE facturas_pendientes SET recargo_equivalencia=2.11,retencion=1,otros_cargos=2 WHERE id=1;
    INSERT INTO facturas_proveedor_alias VALUES('revision-nif-antigua','B08485005','SERHS','operador','2026-11-16');`);
  await migrar();
  const f=(await pg.query('SELECT * FROM facturas WHERE id=1')).rows[0];
  assert.equal(f.lineas_iva_incluido,true);assert.equal(f.cargos_base[0].importe,3.9);
  for(const tabla of ['facturas','facturas_pendientes']){
   const a=(await pg.query('SELECT recargo_equivalencia,retencion,otros_cargos FROM '+tabla+' WHERE id=1')).rows[0];
   assert.deepEqual(Object.values(a).map(Number),[2.11,1,2]);
  }
  const antiguas=(await pg.query('SELECT * FROM facturas_proveedor_alias')).rows;
  assert.deepEqual(nifsConfirmados('SERHS',antiguas),[],'la migración no transforma memoria OCR antigua en confirmación humana');
 }finally{await pg.close();}
});
