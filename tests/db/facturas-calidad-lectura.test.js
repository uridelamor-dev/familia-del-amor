import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {RECEPCION_SCHEMA} from '../../src/modules/facturas/recepcion.js';
import {CALIDAD_LECTURA_SCHEMA,registrarCalidadLectura} from '../../src/modules/facturas/calidad-lectura.js';
import {filtroRevision} from '../../src/modules/facturas/ambito-revision.js';
async function entorno(t,fn){
 if(!await disponible()){t.skip(motivoSalto());return;}const db=await conEsquema();
 try{
  await db.raw(RECEPCION_SCHEMA+CALIDAD_LECTURA_SCHEMA+`CREATE TABLE facturas(id INTEGER PRIMARY KEY,file_hash TEXT,local TEXT,tipo TEXT,empresa TEXT,proveedor TEXT,numero_factura TEXT,fecha TEXT,total NUMERIC,drive_thumb TEXT);CREATE TABLE factura_lineas(id INTEGER PRIMARY KEY,factura_id INTEGER,importe NUMERIC);`);
  const r={datos:{tipo:'factura',_contraste:{estado:'lectura_validada',version:5,duracion_ms:1000}}};
  await db.run(`INSERT INTO facturas_recepciones(id,clave,hash,canal,local,nombre,mime,estado,resultado)VALUES(20,'a','hash','Email','Blanes','f.pdf','application/pdf','registrado',?::jsonb)`,[JSON.stringify(r)]);
  await db.run("INSERT INTO facturas VALUES(1,'hash','Blanes','factura','Empresa','Proveedor','A1','2026-11-26',121,NULL)");await db.run('INSERT INTO factura_lineas VALUES(1,1,100)');
  const rutas={};const app={get:(p,...h)=>rutas['GET '+p]=h.at(-1),post:(p,...h)=>rutas['POST '+p]=h.at(-1)};
  registrarCalidadLectura(app,{auth:()=>{},db,transaccion:fn=>fn(db),ambito:(req,cols)=>filtroRevision({locales:req.user.locales||[]},cols),puedeAcceder:(req,l)=>!req.user.locales?.length||req.user.locales.includes(l)});
  const llamar=async(method,body={},locales=[])=>{
   let resultado,status=200;await rutas[method+' /api/facturas/calidad-lectura'+(method==='POST'?'/'+':id':'')]({params:{id:'20'},body,query:{},user:{id:1,locales}},{setHeader(){},status(s){status=s;return this;},json(r){resultado=r;}},e=>{throw e;});return {status,resultado};
  };
  await fn({db,llamar});
 }finally{await db.fin();}
}
test('indicadores y muestra: guarda evidencia idempotente e invalida al cambiar una línea',async t=>entorno(t,async({db,llamar})=>{
 const j=(await llamar('GET')).resultado;assert.equal(j.totales.automaticas,1);assert.equal(j.muestras.length,1);assert.equal(j.porcentajeAutomatico,100);
 const body={firma:j.muestras[0].firma,resultado:'error',campos:['lineas'],nota:'Cantidad incorrecta en original',confirmado:true};
 assert.equal((await llamar('POST',body)).status,200);await llamar('POST',body);assert.equal((await db.all('SELECT * FROM facturas_calidad_lectura')).length,1);
 let r=(await llamar('GET')).resultado;assert.equal(r.controles.errores,1);assert.equal(r.controles.vigentes,1);
 await db.run('UPDATE factura_lineas SET importe=99 WHERE id=1');
 r=(await llamar('GET')).resultado;assert.equal(r.controles.errores,1);assert.equal(r.controles.vigentes,0);assert.equal(r.muestras[0].control,null);
 assert.equal((await llamar('POST',body)).status,409);
}));
test('muestra respeta local original y actual; no guarda sin confirmación',async t=>entorno(t,async({db,llamar})=>{
 const j=(await llamar('GET')).resultado;assert.equal((await llamar('POST',{firma:j.muestras[0].firma,resultado:'correcto'})).status,400);
 assert.equal((await llamar('GET',{},['Lloret'])).resultado.muestras.length,0);
 await db.run("UPDATE facturas SET local='Lloret' WHERE id=1");
 assert.equal((await llamar('GET',{},['Blanes'])).resultado.muestras.length,0);
 assert.equal((await llamar('POST',{firma:j.muestras[0].firma,resultado:'correcto',confirmado:true},['Blanes'])).status,403);
}));
