import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {prepararUnionGrupo,ejecutarUnionGrupo} from '../../src/modules/facturas/unir-proveedores-grupo.js';
import {resolverDuplicado} from '../../src/modules/facturas/duplicados-decision.js';
import {filtroRevision} from '../../src/modules/facturas/ambito-revision.js';
import {claveProveedor} from '../../src/modules/facturas/categorias.js';
import {FICHA_COMERCIAL_SCHEMA} from '../../src/modules/facturas/ficha-comercial.js';
import {DRIVE_SYNC_SCHEMA} from '../../src/modules/facturas/drive-sync.js';
const setup=async()=>{const db=await conEsquema();const q=(sql,p=[])=>{const ordered=[];sql=sql.replace(/\$(\d+)/g,(_,n)=>{ordered.push(p[Number(n)-1]);return '?';});return db.raw(sql,ordered);};
 await q(`CREATE TABLE facturas(id SERIAL PRIMARY KEY,proveedor TEXT,nif TEXT,total NUMERIC,sheet_synced INT DEFAULT 1,local TEXT,empresa TEXT,fecha TEXT,numero_factura TEXT,drive_url TEXT);
 CREATE TABLE facturas_pendientes(id SERIAL PRIMARY KEY,proveedor TEXT,nif TEXT,total NUMERIC);
 CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE facturas_proveedor_cats(prov_clave TEXT,proveedor TEXT,categoria TEXT,subcategoria TEXT,creado_en TEXT,PRIMARY KEY(prov_clave,categoria,subcategoria));
 CREATE TABLE facturas_pago_reglas(prov_clave TEXT,proveedor TEXT,empresa TEXT,modo TEXT,dias INT,dia_pago INT,meses_despues INT,domiciliado INT,actualizado_por TEXT,actualizado_en TEXT,PRIMARY KEY(prov_clave,empresa));
 CREATE TABLE facturas_proveedor_pago(prov_clave TEXT PRIMARY KEY,proveedor TEXT,modo TEXT,dias INT,dia_pago INT,meses_despues INT,domiciliado INT,actualizado_por TEXT,actualizado_en TEXT);
 CREATE TABLE facturas_proveedor_alias(clave TEXT PRIMARY KEY,nif TEXT,proveedor TEXT,autor TEXT,creado_en TEXT);
 CREATE TABLE inv_proveedores(id SERIAL PRIMARY KEY,factura_proveedor TEXT);
 `+FICHA_COMERCIAL_SCHEMA+';'+DRIVE_SYNC_SCHEMA);
return {db,q};};
test('Unión múltiple conserva documentos, elecciones y proveedores ajenos',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const {db,q}=await setup();
 try{
 const nombres=['Proveedor A','Proveedor B','Proveedor C'];
 for(const [i,n] of [...nombres,'Ajeno'].entries()){
  await q('INSERT INTO facturas(proveedor,nif,total,local,empresa) VALUES($1,$2,$3,$4,$5)',[n,'B12345678',i+10,'Lloret','Empresa A']);
  await q('INSERT INTO facturas_proveedor_fichas(clave,datos) VALUES($1,$2::jsonb)',[claveProveedor(n),JSON.stringify({direccion:'Calle '+i,telefono_comercial:'tel'+i})]);
 }
 let p=await prepararUnionGrupo(q,nombres);
 assert.equal(p.facturas,3);assert.equal(p.faltan.length,3);
 const elecciones={nombre:nombres[1],'ficha:direccion':nombres[2],'ficha:telefono_comercial':nombres[0]};
 await q('BEGIN');await assert.rejects(()=>ejecutarUnionGrupo(q,{nombres,revision:p.revision,elecciones:{}},'test'),/Elige/);await q('ROLLBACK');
 await q('UPDATE facturas SET total=50 WHERE proveedor=$1',[nombres[0]]);
 await q('BEGIN');await assert.rejects(()=>ejecutarUnionGrupo(q,{nombres,revision:p.revision,elecciones},'test'),/cambiado/);await q('ROLLBACK');
 p=await prepararUnionGrupo(q,nombres);
 await q('BEGIN');await ejecutarUnionGrupo(q,{nombres,revision:p.revision,elecciones},'test');await q('COMMIT');
 const fs=(await q('SELECT * FROM facturas ORDER BY id')).rows;
 assert.equal(fs.length,4);assert.deepEqual(fs.map(f=>f.proveedor),[nombres[1],nombres[1],nombres[1],'Ajeno']);
 assert.deepEqual(fs.map(f=>Number(f.total)),[50,11,12,13]);
 assert.ok(fs.slice(0,3).every(f=>f.sheet_synced===0));assert.equal(fs[3].sheet_synced,1);
 const ficha=(await q('SELECT datos FROM facturas_proveedor_fichas WHERE clave=$1',[claveProveedor(nombres[1])])).rows[0].datos;
 assert.equal(ficha.direccion,'Calle 2');assert.equal(ficha.telefono_comercial,'tel0');
 assert.equal((await q('SELECT count(*)::int n FROM facturas_proveedor_fichas')).rows[0].n,2);
 await assert.rejects(()=>prepararUnionGrupo(q,['Ajeno','Ajeno']),/equivalentes/);
 }finally{await db.fin();}
});
test('Duplicados: elegir anterior, nueva o ambas sin perder originales; scope y doble clic',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const {db,q}=await setup();
 try{
 await q('ALTER TABLE facturas ADD dup_de INT,ADD dup_estado TEXT,ADD dup_resuelto_por TEXT,ADD dup_resuelto_en TEXT');
 for(const accion of ['duplicada','conservar_nueva','distinta']){
  const a=(await q("INSERT INTO facturas(proveedor,total,local,drive_url) VALUES('A',100,'Lloret','original.pdf') RETURNING id")).rows[0].id;
  const b=(await q("INSERT INTO facturas(proveedor,total,local,drive_url,dup_estado,dup_de) VALUES('A',101,'Lloret','nueva.pdf','duda',$1) RETURNING id",[a])).rows[0].id;
  await q('BEGIN');await assert.rejects(()=>resolverDuplicado(q,{id:b,accion,autor:'test',locales:['Girona']}),/Sin acceso/);await q('ROLLBACK');
  await q('BEGIN');await resolverDuplicado(q,{id:b,accion,autor:'test',locales:['Lloret']});await q('COMMIT');
  const rows=(await q('SELECT * FROM facturas WHERE id=ANY($1::int[]) ORDER BY id',[[a,b]])).rows;
  assert.deepEqual(rows.map(r=>r.drive_url),['original.pdf','nueva.pdf']);
  const total=rows.filter(r=>r.dup_estado!=='duda').reduce((s,r)=>s+Number(r.total),0);
  assert.equal(total,{duplicada:100,conservar_nueva:101,distinta:201}[accion]);
  assert.equal(rows.filter(r=>r.dup_estado==='duda'&&!r.dup_resuelto_en).length,0);
  await q('BEGIN');await assert.rejects(()=>resolverDuplicado(q,{id:b,accion,autor:'test'}),/resuelta/);await q('ROLLBACK');
 }
 }finally{await db.fin();}
});
test('Filtros SQL combinan empresa y locales sin mezclar ámbitos',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw('CREATE TABLE docs(id INT,local TEXT,empresa TEXT)');
 await db.raw("INSERT INTO docs VALUES(1,'Lloret','A'),(2,'Girona','A'),(3,'Lloret','B'),(4,NULL,'A')");
 for(const [locales,empresa,esperados] of [[['Lloret'],'A',[1]],[['Lloret','Girona'],'A',[1,2]],[[],'B',[3]],[[],'',[1,2,3,4]]]){
  const f=filtroRevision({locales,empresa});const rs=await db.all('SELECT id FROM docs WHERE 1=1'+f.sql+' ORDER BY id',f.params);assert.deepEqual(rs.map(r=>r.id),esperados);
 }
 }finally{await db.fin();}
});

test('Rutas de avisos ejecutan SQL real y filtran empresa/local actuales',async t=>{
 if(!await disponible())return t.skip(motivoSalto());
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const server=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 const db=await conEsquema();
 try{
 await db.raw(`CREATE TABLE facturas(id INT,local TEXT,empresa TEXT,proveedor TEXT,nif TEXT,total NUMERIC,dup_estado TEXT);
 CREATE TABLE facturas_pendientes(id INT,empresa_detectada TEXT);
 CREATE TABLE facturas_recepciones(id INT,local TEXT,resultado JSONB);
 CREATE TABLE facturas_locales(cif TEXT);
 CREATE TABLE facturas_repaso_documentos(origen TEXT,documento_id INT,guardado JSONB,estado TEXT,resultado JSONB,prioridad INT,revision_humana JSONB);
 CREATE TABLE facturas_repaso_unico(id INT,fase TEXT);
 INSERT INTO facturas VALUES(1,'Lloret','A','Uno','B12345678',100,NULL),(2,'Girona','A','Dos','B12345678',200,NULL),(3,'Lloret','B','Tres','B12345678',300,NULL);
 INSERT INTO facturas_repaso_documentos SELECT 'factura',id,'{"local":"Obsoleto"}','revisar',NULL,1,NULL FROM facturas;`);
 const invoke=async(path,query)=>{
  let handler,out;
  const marker=server.includes(`app.get('${path}'`)?`app.get('${path}'`:`app.get("${path}"`;
  const a=server.indexOf(marker),b=server.indexOf('\n});',a)+4;
  assert.ok(a>=0);
  runInNewContext(server.slice(a,b),{app:{get:(_p,_a,h)=>handler=h},requireAuth:()=>()=>{},filtroRevision,localesScope:r=>r.query.locales?.split(',')||[],dbAll:db.all,dbGet:db.get,gruposDuplicados:filas=>filas,console});
  await handler({query,user:{rol:'contabilidad'}},{json:j=>out=j,status:()=>({json:j=>{throw Error(JSON.stringify(j));}})},e=>{throw e;});return out;
 };
 const r=await invoke('/api/facturas/repaso-unico/resultados',{empresa:'A',locales:'Lloret'});
 assert.deepEqual(r.data.map(r=>Number(r.documento_id)),[1],'usa el local actual, no la instantánea antigua');
 const proveedores=await invoke('/api/facturas/proveedores-duplicados',{empresa:'A',locales:'Lloret'});
 assert.deepEqual(proveedores.grupos.map(p=>p.proveedor),['Uno']);
 }finally{await db.fin();}
});
