import {test,before,after,describe} from 'node:test';import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {ensureSchemaFirmas,registrarBorradoresFirma} from '../../src/modules/rrhh/firmas/borradores.js';
const disponibleDB=await disponible();
describe('borradores de firma privados',{skip:disponibleDB?false:motivoSalto()},()=>{
 let db,solicitud;const rutas=new Map();
 before(async()=>{
 db=await conEsquema();await db.run('CREATE TABLE users(id INTEGER PRIMARY KEY,nombre TEXT,email TEXT,telefono TEXT,rol TEXT,activo INTEGER,local TEXT)');
 await db.run('CREATE TABLE hr_documentos(id INTEGER PRIMARY KEY,worker_id INTEGER,nombre TEXT,url TEXT,tipo TEXT)');
 await db.run("INSERT INTO users VALUES(1,'Persona prueba','persona@example.invalid',NULL,'trabajador',1,'A'),(2,'Empresa prueba','empresa@example.invalid',NULL,'direccion',1,NULL),(3,'Persona ajena','ajena@example.invalid',NULL,'trabajador',1,'B')");
 await db.run("INSERT INTO hr_documentos VALUES(1,1,'Contrato prueba','rrhh:prueba.pdf','contrato'),(2,3,'Ajeno','rrhh:ajeno.pdf','contrato')");
 await ensureSchemaFirmas(db.raw);await ensureSchemaFirmas(db.raw);
 const app={get:(p,...hs)=>rutas.set('get '+p,hs.at(-1)),post:(p,...hs)=>rutas.set('post '+p,hs.at(-1))};
 registrarBorradoresFirma(app,{auth:()=>{},dbAll:db.all,dbGet:db.get,pool:{connect:async()=>({query:db.raw,release(){}})},puedeLocal:(_req,l)=>l==='A',leerPdf:async()=>Buffer.from('%PDF-1.7 prueba')});
 });
 after(async()=>{await db?.fin();});
 async function llamar(method,path,body={},params={id:1}){let status=200,data;await rutas.get(method+' '+path)({body,params,user:{username:'rrhh_prueba'}},{setHeader(){},status(s){status=s;return this;},json(j){data=j;return this;}});return {status,data};}
 test('prepara dos firmantes, congela sus datos y no dice que se haya enviado',async()=>{
 const r=await llamar('post','/api/rrhh/documento/:id/firmas',{empresa_id:2});assert.equal(r.status,200);solicitud=r.data.solicitud.id;
 assert.equal(r.data.envio_disponible,false);assert.equal(r.data.solicitud.estado,'borrador');assert.equal(r.data.solicitud.firmantes.length,2);
 await db.run("UPDATE users SET email='nuevo@example.invalid' WHERE id=1");
 const j=await llamar('get','/api/rrhh/documento/:id/firmas');assert.equal(j.data.solicitudes[0].firmantes[0].email,'persona@example.invalid');
 });
 test('impide duplicar el borrador y protege el original de borrado',async()=>{
 assert.equal((await llamar('post','/api/rrhh/documento/:id/firmas',{empresa_id:2})).status,409);
 await assert.rejects(db.run('DELETE FROM hr_documentos WHERE id=1'),/foreign key/);
 });
 test('otro local no se puede consultar ni preparar',async()=>{
 assert.equal((await llamar('get','/api/rrhh/documento/:id/firmas',{}, {id:2})).status,404);
 assert.equal((await llamar('post','/api/rrhh/documento/:id/firmas',{}, {id:2})).status,404);
 });
 test('cancelar conserva autor e historial y permite un nuevo borrador',async()=>{
 assert.equal((await llamar('post','/api/rrhh/documento/:id/firmas/:solicitud/cancelar',{}, {id:1,solicitud})).status,200);
 assert.equal((await llamar('post','/api/rrhh/documento/:id/firmas',{})).status,200);
 const j=await llamar('get','/api/rrhh/documento/:id/firmas');assert.equal(j.data.solicitudes.length,2);assert.equal(j.data.solicitudes[1].cancelado_por,'rrhh_prueba');
 });
 test('no existe estado firmado ni API para fingir una firma',async()=>{
 await assert.rejects(db.run("UPDATE rrhh_firma_borradores SET estado='firmado'"),/check constraint/);
 assert.ok([...rutas.keys()].every(r=>!r.endsWith('/firmar')));
 });
});
