import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {RECORRIDO_SCHEMA,prepararSeguimiento,destinatariosSeguimiento} from '../../src/modules/campaigns/recorrido.js';
import {PROMOCION_RESULTADOS_SCHEMA,obtenerPromocion,vincularPromocion} from '../../src/modules/campaigns/promocion-resultados.js';
test('promoción: versiones, envíos, derechos, tickets únicos, anulaciones y seguimiento',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();try{
 await db.raw(RECORRIDO_SCHEMA);await db.raw(PROMOCION_RESULTADOS_SCHEMA);
 await db.raw(`CREATE TABLE fid_promos(id INTEGER,clave TEXT,nombre TEXT,version INTEGER,desde TEXT,hasta TEXT,creado_en TEXT);
 CREATE TABLE pro_qr(id INTEGER,clase TEXT,nombre TEXT,telefono TEXT,creado_en TEXT);
 CREATE TABLE fid_promo_derechos(clave TEXT,qr_id INTEGER,concedido_en TEXT);
 CREATE TABLE fid_promo_usos(id INTEGER,promo_id INTEGER,clave TEXT,qr_id INTEGER,local TEXT,creado_en TEXT,factura_id INTEGER,estado TEXT);
 CREATE TABLE fid_facturas(id INTEGER,importe_total NUMERIC,es_prueba BOOLEAN,devolucion BOOLEAN,revertida_en TEXT);
 CREATE TABLE fid_movimientos(id INTEGER,qr_id INTEGER,concepto TEXT,creado_en TEXT,local TEXT,importe NUMERIC,unidades INTEGER,factura_id INTEGER);
 CREATE TABLE pro_canjes(id INTEGER,telefono TEXT,canjeado_en TEXT,local TEXT);
 CREATE TABLE google_reviews(id TEXT,fecha TEXT,location_name TEXT);
 CREATE TABLE campanas_wa(id SERIAL,nombre TEXT,creado_en TEXT,mensaje TEXT,segmento_json TEXT,canal TEXT,estado TEXT,total_enviados INTEGER);
 CREATE TABLE campana_envios(id INTEGER,campana_id INTEGER,nombre TEXT,telefono TEXT,correo TEXT,estado TEXT,enviado_en TEXT);
 CREATE TABLE correo_envios(id UUID,autor INTEGER,asunto TEXT,estado TEXT,destinatarios JSONB,actualizado_en TEXT,creado_en TEXT);
 CREATE TABLE leads(correo TEXT,telefono TEXT);
 INSERT INTO fid_promos VALUES(1,'cafe','Café Girona',1,'2026-10-01','2026-10-01','2026-09-20'),(2,'cafe','Café Girona',2,'2026-10-01','2026-10-01','2026-09-25');
 INSERT INTO pro_qr VALUES(1,'carnet','Ana','600111222','2026-09-01'),(2,'carnet','Luis','600111223','2026-09-01'),(3,'carnet','Eva','600111224','2026-09-01');
 INSERT INTO fid_promo_derechos VALUES('cafe',1,'2026-09-30'),('cafe',2,'2026-09-30'),('cafe',3,'2026-09-30');
 INSERT INTO fid_facturas VALUES(1,20,FALSE,FALSE,NULL),(2,300,TRUE,FALSE,NULL),(3,400,FALSE,FALSE,'2026-10-02');
 INSERT INTO fid_promo_usos VALUES(1,1,'cafe',1,'Girona','2026-10-01T08:00Z',1,'usado'),(2,2,'cafe',1,'Girona','2026-10-01T08:01Z',1,'usado'),(3,2,'cafe',2,'Girona','2026-10-01T08:00Z',2,'usado'),(4,2,'cafe',2,'Girona','2026-10-01T08:00Z',3,'usado'),(5,2,'otra',2,'Girona','2026-10-01T08:00Z',1,'usado'),(6,2,'cafe',2,'Girona','2026-10-01T08:00Z',1,'revertido');
 INSERT INTO campanas_wa(id,nombre,creado_en) VALUES(10,'Invitación','2026-09-29'),(11,'Recordatorio','2026-09-30');
 INSERT INTO campana_envios VALUES(1,10,'Ana','600111222',NULL,'enviado','2026-09-30'),(2,11,'Ana','600111222',NULL,'enviado','2026-09-30'),(3,10,'Luis','600111223',NULL,'enviado','2026-09-30');
 INSERT INTO correo_envios VALUES('11111111-1111-1111-1111-111111111111',9,'Privado','enviado','[]','2026-09-30','2026-09-30');`);
 const esquema=readFileSync(new URL('../../src/modules/fidelizacion/schema.js',import.meta.url),'utf8');
 const migracion=esquema.match(/ALTER TABLE fid_promo_usos ADD COLUMN IF NOT EXISTS descuento_centimos INTEGER/)[0];
 const antes=await db.all('SELECT id,estado,factura_id FROM fid_promo_usos ORDER BY id');
 await db.run(migracion);
 await db.run(migracion);
 assert.deepEqual(await db.all('SELECT id,estado,factura_id FROM fid_promo_usos ORDER BY id'),antes);
 assert.equal((await db.get('SELECT COUNT(descuento_centimos)::int AS n FROM fid_promo_usos')).n,0);
 await db.run('UPDATE fid_promo_usos SET descuento_centimos=450 WHERE id IN (1,2,3,4,5,6)');
 const user={id:7,rol:'direccion'},f={hasta:'2026-10-02'};
 let d=await obtenerPromocion(db,'2',user,f);assert.equal(d.resumen.enviados,0);assert.equal(d.resumen.canjes,2);assert.equal(d.resumen.consumo,20);assert.equal(d.resumen.descuento,4.5);assert.equal(d.resumen.tickets_con_descuento,1);assert.equal(d.resumen.conversion,null);assert.equal(d.resumen.derechos,3);
 await vincularPromocion(db,'1',user,'campana','10');await vincularPromocion(db,'2',user,'campana','11');await vincularPromocion(db,'2',user,'campana','10');
 d=await obtenerPromocion(db,'2',user,f);assert.equal(d.comunicaciones.length,2);assert.equal(d.resumen.enviados,2);assert.equal(d.resumen.conversion,50);assert.equal(d.resumen.usuarios,1);assert.equal(d.filas.find(x=>x.nombre==='Ana').visitas,1);
 assert.equal(await obtenerPromocion(db,'2',{id:8,rol:'marketing',modulos:['campanas']},f),null);
 await assert.rejects(()=>vincularPromocion(db,'2',user,'correo','11111111-1111-1111-1111-111111111111'));
 const draft=await prepararSeguimiento(db,'promocion','2',user,{...f,grupo:'sin_canje'});const saved=await db.get('SELECT segmento_json FROM campanas_wa WHERE id=?',[draft.id]);const ref=JSON.parse(saved.segmento_json).seguimiento_id;
 assert.deepEqual([...await destinatariosSeguimiento(db,ref)].sort(),['34600111223','34600111224']);
 await db.run("INSERT INTO fid_promo_usos VALUES(7,2,'cafe',2,'Girona','2026-10-02',1,'usado',NULL)");
 assert.deepEqual([...await destinatariosSeguimiento(db,ref)],['34600111224']);
 const filtered=await obtenerPromocion(db,'2',user,{...f,grupo:'canje',local:'Blanes'});assert.equal(filtered.resumen.canjes,0);assert.equal(filtered.resumen.consumo,null);assert.equal(filtered.resumen.descuento,null);
 await vincularPromocion(db,'2',user,'campana','10',true);assert.equal((await obtenerPromocion(db,'1',user,f)).comunicaciones.length,1);
 await db.raw(`ALTER TABLE fid_promos ADD COLUMN tipo TEXT, ADD COLUMN reward_id TEXT,
   ADD COLUMN codigo_agora TEXT, ADD COLUMN codigo_agora_adicional TEXT;
  ALTER TABLE fid_facturas ADD COLUMN cuerpo_enc TEXT;
  INSERT INTO fid_promos (id,clave,nombre,version,desde,hasta,tipo,reward_id,codigo_agora)
    VALUES (3,'bf','Black Friday',1,'2026-11-26','2026-11-29','oferta_agora','fidp:bf','BFR1');
  INSERT INTO fid_facturas (id,importe_total,es_prueba,devolucion,cuerpo_enc) VALUES
    (4,16.65,FALSE,FALSE,'ticket histórico'),(5,24,FALSE,FALSE,NULL);
  INSERT INTO fid_promo_usos (id,promo_id,clave,qr_id,local,creado_en,factura_id,estado) VALUES
    (8,3,'bf',1,'Girona','2026-11-27T12:00Z',4,'usado'),
    (9,3,'bf',2,'Girona','2026-11-27T12:00Z',5,'usado')`);
 const historico={...db,leerFacturaPromocion:valor=>{
  assert.equal(valor,'ticket histórico');
  return {InvoiceItems:[{VatIncluded:true,
   LoyaltyProgram:{Rewards:[{Id:'fidp:bf',Type:'Offer',Code:'BFR1'}]},
   Lines:[{OfferCode:'BFR1',UnitPrice:18.50,Quantity:1,TotalAmount:16.65,DiscountRate:0.1}]}]};
 }};
 const informe=await obtenerPromocion(historico,'3',user,{desde:'2026-11-27',hasta:'2026-11-27',local:'Girona'});
 assert.equal(informe.resumen.facturas,2);
 assert.equal(informe.resumen.tickets_con_descuento,1);
 assert.equal(informe.resumen.descuento,1.85);
 assert.doesNotMatch(JSON.stringify(informe),/ticket histórico|cuerpo_enc/);
 assert.equal((await db.get('SELECT descuento_centimos FROM fid_promo_usos WHERE id=8')).descuento_centimos,null);
 }finally{await db.fin();}
});
