import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanearPerfil,guardarPerfil} from '../src/modules/tarjeta/perfil.js';
test('Perfil: fecha completa, bisiestos, futuro y población',()=>{
 assert.deepEqual(sanearPerfil({poblacion:' Blanes ',nacimiento:'2000-02-29'},'2026-10-04'),{poblacion:'Blanes',nacimiento:'2000-02-29'});
 for(const nacimiento of ['2025-02-29','1990-04-31','2027-01-01','1890-01-01','1990-02','x'])assert.throws(()=>sanearPerfil({nacimiento},'2026-10-04'));
 assert.throws(()=>sanearPerfil({poblacion:'a'.repeat(81)}));
 assert.deepEqual(sanearPerfil({}),{poblacion:'',nacimiento:''});
});
test('Perfil SQL: token, titular, actualización sin duplicados y campos vacíos',{skip:!process.env.TEST_PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.TEST_PGLITE_MODULE);const db=new PGlite();
 const pool={connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})};
 try{
 await db.exec(`CREATE TABLE pro_qr(id serial primary key,token text,clase text,anulado_en text,caduca_en text,telefono text,nombre text);
 CREATE TABLE leads(id serial primary key,nombre text,telefono text,poblacion text,nacimiento text,fuente text,creado_en text,actualizado_en text);
 INSERT INTO pro_qr(token,clase,telefono,nombre) VALUES('token-secreto-largo-1234567890','carnet','34600111222','Ana'),('otro-token-largo-1234567890','cupon','34600333444','Otro');`);
 assert.equal(await guardarPerfil(pool,'600111222',{poblacion:'X',nacimiento:''}),false);
 assert.equal(await guardarPerfil(pool,'token-inexistente-1234567890',{poblacion:'X',nacimiento:''}),false);
 assert.equal(await guardarPerfil(pool,'otro-token-largo-1234567890',{poblacion:'X',nacimiento:''}),false);
 assert.equal(await guardarPerfil(pool,'token-secreto-largo-1234567890',{poblacion:'Blanes',nacimiento:'1990-01-12'}),true);
 assert.equal(await guardarPerfil(pool,'token-secreto-largo-1234567890',{poblacion:'Girona',nacimiento:''}),true);
 const {rows}=await db.query('SELECT * FROM leads');assert.equal(rows.length,1);assert.equal(rows[0].poblacion,'Girona');assert.equal(rows[0].nacimiento,'1990-01-12');assert.equal(rows[0].telefono,'34600111222');
 await db.query("UPDATE pro_qr SET anulado_en='2026-01-01'");
 assert.equal(await guardarPerfil(pool,'token-secreto-largo-1234567890',{poblacion:'X',nacimiento:''}),false);
 }finally{await db.close();}
});
