import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DRIVE_SYNC_SCHEMA,configurarBloqueoDrive,sincronizarArchivo} from '../../src/modules/facturas/drive-sync.js';
import {IVA_SCHEMA,guardarIvaLeido,repasarIva} from '../../src/modules/facturas/iva.js';
test('SQL real: migración repetible, reintento Drive y desglose histórico sin pisar cambios',async t=>{
 if(!process.env.TEST_PGLITE_MODULE){t.skip('Requiere PostgreSQL embebido TEST_PGLITE_MODULE');return;}
 const {PGlite}=await import(process.env.TEST_PGLITE_MODULE);const pg=new PGlite();
 try {
  await pg.exec(`CREATE TABLE facturas (id SERIAL PRIMARY KEY,local TEXT,empresa TEXT,fecha TEXT,proveedor TEXT,numero_factura TEXT,drive_url TEXT,base_imponible NUMERIC,cuota_iva NUMERIC,total NUMERIC,tipo TEXT,sheet_synced INTEGER DEFAULT 0);CREATE TABLE facturas_pendientes(id SERIAL PRIMARY KEY);`);
  await pg.exec(DRIVE_SYNC_SCHEMA+IVA_SCHEMA);await pg.exec(DRIVE_SYNC_SCHEMA+IVA_SCHEMA);
  const q=(s,p=[])=>{let n=0;return pg.query(s.replace(/\?/g,()=>'$'+(++n)),p);};
  const deps={dbGet:async(s,p)=>(await q(s,p)).rows[0],dbRun:async(s,p)=>(await q(s,p)).rows[0],dbAll:async(s,p)=>(await q(s,p)).rows};
  await pg.exec("INSERT INTO facturas(local,drive_url,base_imponible,cuota_iva,total,tipo) VALUES ('Lloret','pdf',300,35,335,'factura');");
  configurarBloqueoDrive(async(id,fn)=>fn());
  await sincronizarArchivo(deps,1,async()=>({movido:true}));
  await pg.exec("UPDATE facturas SET local='Girona',sheet_synced=1 WHERE id=1");
  let f=await deps.dbGet('SELECT * FROM facturas WHERE id=1');assert.equal(f.sheet_synced,0);assert.notEqual(f.drive_revision,f.drive_revision_sync);
  await sincronizarArchivo(deps,1,async a=>{assert.equal(a.local,'Girona');return {movido:true};});
  f=await deps.dbGet('SELECT * FROM facturas WHERE id=1');assert.equal(f.drive_revision,f.drive_revision_sync);
  const partes=[{base:100,tipo:4,cuota:4},{base:100,tipo:10,cuota:10},{base:100,tipo:21,cuota:21}];
  await repasarIva(deps,async()=>partes);
  f=await deps.dbGet('SELECT * FROM facturas WHERE id=1');assert.equal(f.iva_estado,'ok');assert.equal(JSON.parse(f.iva_desglose).length,3);
  await pg.exec("UPDATE facturas SET total=336 WHERE id=1");
  await guardarIvaLeido(deps,f,partes);
  assert.equal((await deps.dbGet('SELECT * FROM facturas WHERE id=1')).total,'336');
  await pg.exec("UPDATE facturas SET total=335,iva_estado='manual' WHERE id=1");
  await guardarIvaLeido(deps,f,[]);
  assert.equal((await deps.dbGet('SELECT * FROM facturas WHERE id=1')).iva_estado,'manual');
 }finally{configurarBloqueoDrive(null);await pg.close();}
});
