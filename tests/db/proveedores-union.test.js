import { test } from 'node:test';
import assert from 'node:assert/strict';
import {prepararUnion, ejecutarUnion} from '../../src/modules/facturas/unir-proveedores.js';
import {claveProveedor, nombreCanonico} from '../../src/modules/facturas/categorias.js';
import {FICHA_COMERCIAL_SCHEMA} from '../../src/modules/facturas/ficha-comercial.js';
import {DRIVE_SYNC_SCHEMA} from '../../src/modules/facturas/drive-sync.js';

test('Unión real SQL: revisión, conflictos, conservación, alias y cola de sincronización',async t=>{
 if(!process.env.TEST_PGLITE_MODULE){t.skip('Requiere PostgreSQL embebido');return;}
 const {PGlite}=await import(process.env.TEST_PGLITE_MODULE);const pg=new PGlite();
 const q=(s,p=[])=>pg.query(s,p);
 try{
 await pg.exec(`CREATE TABLE facturas(id SERIAL PRIMARY KEY,proveedor TEXT,nif TEXT,total NUMERIC,sheet_synced INT DEFAULT 1,local TEXT,empresa TEXT,fecha TEXT,numero_factura TEXT,drive_url TEXT);
 CREATE TABLE facturas_pendientes(id SERIAL PRIMARY KEY,proveedor TEXT,nif TEXT,total NUMERIC);
 CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE facturas_proveedor_cats(prov_clave TEXT,proveedor TEXT,categoria TEXT,subcategoria TEXT,creado_en TEXT,PRIMARY KEY(prov_clave,categoria,subcategoria));
 CREATE TABLE facturas_pago_reglas(prov_clave TEXT,proveedor TEXT,empresa TEXT,modo TEXT,dias INT,dia_pago INT,meses_despues INT,domiciliado INT,actualizado_por TEXT,actualizado_en TEXT,PRIMARY KEY(prov_clave,empresa));
 CREATE TABLE facturas_proveedor_pago(prov_clave TEXT PRIMARY KEY,proveedor TEXT,modo TEXT,dias INT,dia_pago INT,meses_despues INT,domiciliado INT,actualizado_por TEXT,actualizado_en TEXT);
 CREATE TABLE facturas_proveedor_alias(clave TEXT PRIMARY KEY,nif TEXT,proveedor TEXT,autor TEXT,creado_en TEXT);
 CREATE TABLE inv_proveedores(id SERIAL PRIMARY KEY,factura_proveedor TEXT);
 `+FICHA_COMERCIAL_SCHEMA+';'+DRIVE_SYNC_SCHEMA);
 const origen='Viruta Bronco SL',destino='Virutas Branco SL';const a=claveProveedor(origen),b=claveProveedor(destino);
 await q('INSERT INTO facturas(proveedor,nif,total) VALUES ($1,$3,100),($2,$3,200)',[origen,destino,'B12345678']);
 await q('INSERT INTO facturas_pendientes(proveedor,nif,total) VALUES ($1,$2,50)',[origen,'B12345678']);
 await q('INSERT INTO inv_proveedores(factura_proveedor) VALUES ($1)',[origen]);
 await q('INSERT INTO facturas_proveedor_fichas(clave,datos) VALUES ($1,$3::jsonb),($2,$4::jsonb)',[a,b,JSON.stringify({notas:'nota antigua',telefono_comercial:'123',condiciones:[{local:'Lloret',plazo:'24h'}]}),JSON.stringify({notas:'nota actual',email_comercial:'test@example.com',condiciones:[{local:'Girona',plazo:'48h'}]})]);
 await q("INSERT INTO facturas_proveedor_cats VALUES ($1,$3,'Varios','',$5),($2,$4,'Servicios y profesionales','',$5)",[a,b,origen,destino,'hoy']);
 await q("INSERT INTO facturas_pago_reglas(prov_clave,proveedor,empresa,modo,dia_pago,meses_despues,domiciliado) VALUES ($1,$3,'Uriel','mensual',15,1,1),($2,$4,'Uriel','mensual',20,1,1)",[a,b,origen,destino]);
 await q('INSERT INTO facturas_proveedor_alias(clave,nif,proveedor) VALUES ($1,$2,$3)',['branko','B12345678',origen]);
 const plan=await prepararUnion(q,origen,destino);
 assert.equal(plan.facturas,2);assert.equal(plan.pendientes,1);
 assert.deepEqual(plan.faltan.sort(),['categorias','ficha:notas','pago:Uriel']);
 const body={origen,destino,revision:plan.revision,elecciones:{categorias:'destino','ficha:notas':'origen','pago:Uriel':'destino'}};
 await q('BEGIN');
 await assert.rejects(()=>ejecutarUnion(q,{...body,elecciones:{}},'test'),/Resuelve/);await q('ROLLBACK');
 await q('UPDATE facturas SET total=201 WHERE proveedor=$1',[destino]);
 await q('BEGIN');await assert.rejects(()=>ejecutarUnion(q,body,'test'),/han cambiado/);await q('ROLLBACK');
 body.revision=(await prepararUnion(q,origen,destino)).revision;
 await q('BEGIN');await ejecutarUnion(q,body,'test');await q('COMMIT');
 const facturas=(await q('SELECT * FROM facturas ORDER BY id')).rows;
 assert.equal(facturas.length,2);assert.equal(Number(facturas[0].total)+Number(facturas[1].total),301);
 assert.ok(facturas.every(f=>f.proveedor===destino&&f.sheet_synced===0));
 assert.ok(facturas[0].drive_revision>facturas[0].drive_revision_sync);
 const ficha=(await q('SELECT datos FROM facturas_proveedor_fichas')).rows;
 assert.equal(ficha.length,1);assert.equal(ficha[0].datos.notas,'nota antigua');assert.equal(ficha[0].datos.telefono_comercial,'123');assert.equal(ficha[0].datos.email_comercial,'test@example.com');assert.equal(ficha[0].datos.condiciones.length,2);
 assert.equal((await q('SELECT proveedor FROM facturas_pendientes')).rows[0].proveedor,destino);
 const alias=(await q('SELECT * FROM facturas_proveedor_alias')).rows;
 assert.equal(nombreCanonico({proveedor:origen},alias),destino);
 assert.equal(nombreCanonico({proveedor:'otra lectura',nif:'B12345678'},alias),destino);
 assert.equal((await q('SELECT * FROM config')).rows.length,2);
 assert.equal((await q('SELECT dia_pago FROM facturas_pago_reglas')).rows[0].dia_pago,20);
 assert.equal(nombreCanonico({proveedor:'branko'},alias),destino);
 assert.equal((await q('SELECT factura_proveedor FROM inv_proveedores')).rows[0].factura_proveedor,destino);
 // Un NIF diferente requiere una confirmación explícita y no se propaga como ancla.
 await q('INSERT INTO facturas(proveedor,nif,total) VALUES ($1,$2,7)',[origen,'B99999999']);
 const distinto=await prepararUnion(q,origen,destino);
 assert.ok(distinto.faltan.includes('nifs'));
 await q('BEGIN');await ejecutarUnion(q,{origen,destino,revision:distinto.revision,elecciones:{nifs:'destino'}},'test');await q('COMMIT');
 assert.equal((await q('SELECT count(DISTINCT nif)::int AS n FROM facturas')).rows[0].n,2);
 assert.equal((await q('SELECT nif FROM facturas_proveedor_alias WHERE clave=$1',[a])).rows[0].nif,null);

 await assert.rejects(()=>prepararUnion(q,origen,destino),/ya no existe/);
 }finally{await pg.close();}
});
