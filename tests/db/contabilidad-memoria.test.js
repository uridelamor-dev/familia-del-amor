import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {prepararReglaLocal,guardarReglaLocal,reglasLocales,aplicarReglaLocal,registrarMemoria} from '../../src/modules/facturas/memoria.js';
import {decisionAvisos,avisosAceptados,guardarDecisionAvisos} from '../../src/modules/facturas/avisos-memoria.js';
import {repasarLote} from '../../src/modules/facturas/repaso.js';
import {nifConocido} from '../../src/modules/facturas/nif-conocido.js';
const locales=[{local:'Uno',empresa:'Empresa A'},{local:'Dos',empresa:'Empresa A'},{local:'Tres',empresa:'Empresa B'}];
const factura={id:1,proveedor:'Proveedor',nif:'B12345678',empresa:'Empresa A',local:'Dos',tipo:'factura',fecha:'2026-10-01',numero_factura:'F1',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:122};
test('Una regla solo se aplica al CIF y empresa confirmados, y se puede desactivar',()=>{
 const r=prepararReglaLocal(factura,locales,'Silvia');
 assert.equal(aplicarReglaLocal({nif_proveedor:'B-12345678'},'Empresa A',[r],locales),'Dos');
 assert.equal(aplicarReglaLocal({nif_proveedor:'B12345678'},'Empresa B',[r],locales),null);
 assert.equal(aplicarReglaLocal({nif_proveedor:'B87654321'},'Empresa A',[r],locales),null);
 assert.equal(aplicarReglaLocal({nif_proveedor:r.nif},r.empresa,[{...r,activo:false}],locales),null);
 assert.equal(aplicarReglaLocal({nif_proveedor:r.nif},r.empresa,[r,r],locales),null);
 assert.throws(()=>prepararReglaLocal({...factura,local:'Tres'},locales,'Silvia'),/pertenecer/);
 assert.throws(()=>prepararReglaLocal({...factura,nif:''},locales,'Silvia'),/CIF/);
});
test('Un aviso aceptado no reaparece, pero un cambio de importe o un aviso nuevo sí',()=>{
 const r=repasarLote([factura],{hoy:'2026-10-27'}),avisos=r.revisiones[0].textos;
 const d=decisionAvisos(factura,avisos,'Silvia');
 assert.deepEqual(avisosAceptados({...factura,total:'122.00'},d),avisos);
 assert.equal(repasarLote([{...factura,revisar:null,avisos_aceptados:avisosAceptados(factura,d)}],{hoy:'2026-10-27'}).revisiones.length,0);
 assert.deepEqual(avisosAceptados({...factura,total:123},d),[]);
 assert.ok(repasarLote([{...factura,total:123,avisos_aceptados:avisosAceptados({...factura,total:123},d)}],{hoy:'2026-10-27'}).revisiones.length);
 assert.ok(repasarLote([{...factura,avisos_aceptados:['Otro aviso']}],{hoy:'2026-10-27'}).revisiones.length);
});
test('El CIF confirmado prevalece sobre errores del histórico sin tapar un CIF leído',()=>{
 const alias=[{clave:'proveedor',proveedor:'Proveedor',nif:'B12345678'}];
 assert.equal(nifConocido({proveedor:'Proveedor'},alias,[{nif:'B87654321',numero_factura:'old'}]),'B12345678');
 assert.equal(nifConocido({proveedor:'Proveedor',nif_proveedor:'B87654321'},alias,[]),null);
});
test('Persistencia real de reglas; edición con versión y permisos, sin alterar facturas',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw('CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT)');
 const r=prepararReglaLocal(factura,locales,'Silvia');await guardarReglaLocal(db.run,r);
 const guardadas=await reglasLocales(db.all);assert.equal(guardadas.length,1);
 assert.equal(aplicarReglaLocal({nif_proveedor:factura.nif},factura.empresa,guardadas,locales),'Dos');
 await guardarDecisionAvisos(db.run,1,decisionAvisos(factura,['comprobado'],'Silvia'));
 assert.equal((await reglasLocales(db.all)).length,1,'las decisiones de documentos no se mezclan con reglas');
 const handlers={};registrarMemoria({get:(p,a,h)=>handlers['GET '+p]=h,put:(p,a,h)=>handlers['PUT '+p]=h},{auth:()=>{},dbAll:db.all,dbGet:db.get,dbRun:db.run,global:r=>r.user.global,locales:async()=>locales});
 const invoke=async(body,global=true)=>{let status=200,result;await handlers['PUT /api/facturas/memoria/local']({body,user:{global,nombre:'Silvia'}},{status:n=>{status=n;return {json:r=>result=r};},json:r=>result=r});return {status,result};};
 const body={clave:r.clave,revision:guardadas[0].revision,local:'Uno',activo:true};
 assert.equal((await invoke(body,false)).status,403);
 assert.equal((await invoke({...body,local:'Tres'})).status,400);
 assert.equal((await invoke(body)).status,200);
 assert.equal((await invoke(body)).status,409);
 let nueva=(await reglasLocales(db.all))[0];assert.equal(nueva.local,'Uno');
 assert.equal((await invoke({...body,revision:nueva.revision,activo:false})).status,200);
 nueva=(await reglasLocales(db.all))[0];assert.equal(nueva.activo,false);
 assert.equal(aplicarReglaLocal({nif_proveedor:factura.nif},factura.empresa,[nueva],locales),null);
 }finally{await db.fin();}
});

test('PATCH real guarda factura y regla juntas; no reabre revisiones por formato numérico',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw(`CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE facturas(id INT PRIMARY KEY,proveedor TEXT,nif TEXT,empresa TEXT,local TEXT,tipo TEXT,fecha TEXT,numero_factura TEXT,concepto TEXT,base_imponible NUMERIC(12,2),cuota_iva NUMERIC(12,2),porcentaje_iva NUMERIC,total NUMERIC(12,2),revisar TEXT,sheet_synced INT,iva_estado TEXT,iva_aviso TEXT);
 CREATE TABLE facturas_locales(local TEXT,empresa TEXT,local_contable TEXT);
 CREATE TABLE facturas_repaso_documentos(origen TEXT,documento_id INT,revision_humana JSONB,estado TEXT,resultado JSONB);
 INSERT INTO facturas VALUES(1,'Proveedor','B12345678','Empresa A','Dos','factura','2026-10-01','F1',NULL,100,21,21,122,'["Comprobar"]',1,NULL,NULL);
 INSERT INTO facturas_locales VALUES('Dos','Empresa A',NULL),('Uno','Empresa A',NULL);
 INSERT INTO facturas_repaso_documentos VALUES('factura',1,'{"autor":"Silvia"}','revisar',NULL);`);
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const {huellaRevision}=await import('../../src/modules/facturas/avisos-memoria.js');
 const source=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 const a=source.indexOf('app.patch("/api/facturas/:id",'),b=source.indexOf('\n});',a)+4;
 let handler,antesDeConectar;const toPositional=s=>{let i=0;return s.replace(/\?/g,()=>'$'+(++i));};
 runInNewContext(source.slice(a,b),{app:{patch:(p,auth,h)=>handler=h},requireAuth:()=>()=>{},dbGet:db.get,dbAll:db.all,dbRun:db.run,pool:{connect:async()=>{if(antesDeConectar){await antesDeConectar();antesDeConectar=null;}return {query:db.raw,release(){}};}},toPositional,prepararReglaLocal,guardarReglaLocal,decisionAvisos,guardarDecisionAvisos,huellaRevision,documentoEnAmbito:()=>true,localesScope:()=>[],canonizarLocal:l=>l,ficAuditar:async()=>{},getDriveAccessToken:()=>{},reubicarEnDrive:async()=>{},resincronizarSheetsFactura:async()=>{},console});
 const call=async body=>{let status=200,result;await handler({body,params:{id:1},user:{nombre:'Silvia'}},{status:n=>{status=n;return{json:r=>result=r};},json:r=>result=r});return{status,result};};
 assert.equal((await call({nif:'',recordar_local:true})).status,400);
 antesDeConectar=()=>db.run("UPDATE facturas SET concepto='Cambio de otra persona' WHERE id=1");
 assert.equal((await call({concepto:'Cambio obsoleto',confirmar_avisos:true})).status,409);
 assert.equal((await db.get('SELECT concepto FROM facturas')).concepto,'Cambio de otra persona');
 assert.equal((await db.get('SELECT revisar FROM facturas')).revisar,'["Comprobar"]');
 assert.equal((await call({total:'122',recordar_local:true})).status,200);
 assert.equal((await reglasLocales(db.all))[0].local,'Dos');
 assert.ok((await db.get('SELECT revision_humana FROM facturas_repaso_documentos')).revision_humana);
 assert.equal((await call({confirmar_avisos:true})).status,200);
 assert.equal((await db.get('SELECT revisar FROM facturas')).revisar,null);
 assert.ok(await db.get("SELECT value FROM config WHERE key='contabilidad_revision_1'"));
 assert.equal((await call({total:'123'})).status,200);
 assert.equal((await db.get('SELECT revision_humana FROM facturas_repaso_documentos')).revision_humana,null);
 await db.run('DROP TABLE config');
 assert.equal((await call({local:'Uno',recordar_local:true})).status,500);
 assert.equal((await db.get('SELECT local FROM facturas')).local,'Dos','un fallo al recordar revierte también el cambio de local');
 }finally{await db.fin();}
});

test('Revisión histórica: reaparece al cambiar datos por cualquier vía, sin confundir 100 con 100.00',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 const {reabrirHistoricoModificado}=await import('../../src/modules/facturas/avisos-memoria.js');
 try{
 await db.raw(`CREATE TABLE facturas(id INT,total NUMERIC(12,2),proveedor TEXT);
 CREATE TABLE facturas_pendientes(id INT,total NUMERIC,proveedor TEXT);
 CREATE TABLE facturas_repaso_documentos(origen TEXT,documento_id INT,revision_humana JSONB,estado TEXT,resultado JSONB);
 CREATE TABLE facturas_repaso_decisiones(id INT,despues JSONB);
 INSERT INTO facturas VALUES(1,100,'Prueba');
 INSERT INTO facturas_repaso_documentos VALUES('factura',1,'{"id":2,"autor":"Silvia"}','revisar',NULL);
 INSERT INTO facturas_repaso_decisiones VALUES(2,'{"total":"100.0","proveedor":"Prueba"}');`);
 await reabrirHistoricoModificado(db.run);
 assert.ok((await db.get('SELECT revision_humana FROM facturas_repaso_documentos')).revision_humana);
 await db.run('UPDATE facturas SET total=150');await reabrirHistoricoModificado(db.run);
 const r=await db.get('SELECT * FROM facturas_repaso_documentos');
 assert.equal(r.revision_humana,null);assert.match(r.resultado.avisos[0].texto,/cambiaron/);
 assert.equal((await db.get('SELECT count(*)::int n FROM facturas_repaso_decisiones')).n,1);
 }finally{await db.fin();}
});


test('Regla de proveedor: una edición concurrente no se sobrescribe aunque conserve nombre y CIF',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw(`CREATE TABLE facturas(proveedor TEXT);
 CREATE TABLE facturas_proveedor_alias(clave TEXT PRIMARY KEY,nif TEXT,proveedor TEXT,autor TEXT,creado_en TEXT);
 INSERT INTO facturas VALUES('Destino');
 INSERT INTO facturas_proveedor_alias VALUES('origen','B12345678','Origen','Silvia','2026-10-01');`);
 const handlers={};let intercalar=false;
 registrarMemoria({get(){},put:(p,a,h)=>handlers[p]=h},{auth:()=>{},dbAll:db.all,dbGet:db.get,dbRun:async(s,p)=>{
  if(intercalar){intercalar=false;await db.run("UPDATE facturas_proveedor_alias SET autor='Otra persona' WHERE clave='origen'");}
  return db.run(s,p);
 },global:()=>true,locales:async()=>[]});
 const call=async revision=>{let status=200;await handlers['/api/facturas/memoria/proveedor']({body:{clave:'origen',proveedor:'Destino',nif:'B12345678',revision},user:{nombre:'Silvia'}},{status:n=>{status=n;return{json(){}};},json(){}});return status;};
 const revision=()=>db.get('SELECT clave,nif,proveedor,autor,creado_en FROM facturas_proveedor_alias');
 intercalar=true;assert.equal(await call(JSON.stringify(await revision())),409);
 assert.equal((await revision()).autor,'Otra persona');
 assert.equal(await call(JSON.stringify(await revision())),200);
 assert.equal((await revision()).proveedor,'Destino');
 }finally{await db.fin();}
});
