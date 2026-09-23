import {test,before,after,describe} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {ensureSchemaEscandallos} from '../../src/modules/escandallos/schema.js';
import {registrarEscandallos} from '../../src/modules/escandallos/rutas.js';
const si=await disponible();
describe('escandallos: rutas reales y PostgreSQL aislado',{skip:si?false:motivoSalto()},()=>{
 let db,id;const rutas=new Map();
 const receta={nombre:'Crema prueba',local:'A',raciones:4,pvp:5.5,iva:10,ingredientes:[{clave:'patata',nombre:'Patata',proveedor:'Proveedor prueba',unidad_compra:'kg',unidad_uso:'g',cantidad:800,factor:1000,merma:20}]};
 before(async()=>{
 db=await conEsquema();await ensureSchemaEscandallos(db.raw);await ensureSchemaEscandallos(db.raw);
 await db.run('CREATE TABLE facturas(id SERIAL PRIMARY KEY,local TEXT,fecha TEXT,proveedor TEXT,tipo TEXT,dup_estado TEXT,conciliado_con TEXT,lineas_estado TEXT)');
 await db.run('CREATE TABLE factura_lineas(id SERIAL PRIMARY KEY,factura_id INTEGER,clave TEXT,descripcion TEXT,unidad TEXT,cantidad NUMERIC,importe NUMERIC,dudosa BOOLEAN DEFAULT FALSE)');
 await db.run('CREATE TABLE producto_alias(clave TEXT PRIMARY KEY,descartado BOOLEAN DEFAULT FALSE)');
 const server=readFileSync('server.js','utf8');const expr=server.slice(server.indexOf('const ALBARAN_YA_CONTADO = '),server.indexOf('\n\nfunction facturasWhere'));
 const albaranContado=vm.runInNewContext(expr+'\nALBARAN_YA_CONTADO');
 const app=Object.fromEntries(['get','post','put'].map(m=>[m,(p,...hs)=>rutas.set(m+' '+p,hs.at(-1))]));
 registrarEscandallos(app,{auth:()=>{},scope:req=>(req.query.local||req.body.local)==='A'?{local:'A',locales:['A','A-extra']}:null,dbAll:db.all,dbGet:db.get,pool:{connect:async()=>({query:db.raw,release(){}})},hoy:()=> '2026-09-23',albaranContado});
 await compra('A','2026-09-01','kg',2,20,10);
 });
 after(async()=>{await db?.fin();});
 async function compra(local,fecha,unidad,precio,importe,cantidad=10,opts={}){
 const f=await db.run("INSERT INTO facturas(local,fecha,proveedor,tipo,dup_estado,conciliado_con,lineas_estado) VALUES(?,?,'Proveedor prueba',?,?,?,?) RETURNING id",[local,fecha,opts.tipo||'factura',opts.dup||null,opts.conciliado||null,opts.estado||'ok']);
 await db.run("INSERT INTO factura_lineas(factura_id,clave,descripcion,unidad,cantidad,importe,dudosa) VALUES(?,'patata','Patata',?,?,?,?)",[f.id,unidad,cantidad,importe??precio*cantidad,!!opts.dudosa]);return f.id;
 }
 async function llamar(m,p,{body={},query={local:'A'},params={}}={}){let status=200,data;await rutas.get(m+' '+p)({body,query,params,user:{username:'prueba'}},{status(s){status=s;return this;},setHeader(){},json(j){data=j;return this;}});return {status,data};}
 test('crear conserva historial y calcula con compra neta',async()=>{
 const a=await llamar('post','/api/escandallos',{body:receta});assert.equal(a.status,200);id=a.data.receta.id;
 const r=await llamar('get','/api/escandallos');assert.equal(r.data.data[0].calculo.coste_lote,2);assert.equal(r.data.data[0].calculo.coste_racion,.5);
 assert.equal((await db.get('SELECT count(*)::int n FROM esc_versiones')).n,1);
 });
 test('las compras nuevas actualizan el coste sin reescribir la receta; incluye centro compartido',async()=>{
 await compra('A-extra','2026-09-20','kg',3,30);
 const r=await llamar('get','/api/escandallos');assert.ok(Math.abs(r.data.data[0].calculo.coste_racion-.75)<1e-10);assert.equal(r.data.data[0].version,1);
 });
 test('ignora local ajeno, futura, dudosa, duplicada y abono',async()=>{
 await compra('B','2026-09-23','kg',9,90);await compra('A','2026-10-01','kg',9,90);await compra('A','2026-09-23','kg',9,90,10,{dudosa:true});await compra('A','2026-09-23','kg',9,90,10,{dup:'duda'});await compra('A','2026-09-23','kg',9,90,10,{tipo:'abono'});
 const r=await llamar('get','/api/escandallos');assert.ok(Math.abs(r.data.data[0].calculo.coste_racion-.75)<1e-10);
 });
 test('no sustituye kg por otra presentación y excluye albarán conciliado ya contado',async()=>{
 await compra('A','2026-09-22','caja',9,90);await compra('A','2026-09-23','kg',9,90,10,{tipo:'albaran',conciliado:'1'});
 const r=await llamar('get','/api/escandallos');assert.ok(Math.abs(r.data.data[0].calculo.coste_racion-.75)<1e-10);
 });
 test('archivar, recuperar y evitar sobrescritura concurrente deja cada versión',async()=>{
 let r=await llamar('post','/api/escandallos/:id/estado',{body:{activo:false,version:1},params:{id}});assert.equal(r.status,200);
 assert.equal((await llamar('get','/api/escandallos')).data.data.length,0);
 r=await llamar('put','/api/escandallos/:id',{body:{...receta,version:1},params:{id}});assert.equal(r.status,409);
 r=await llamar('post','/api/escandallos/:id/estado',{body:{activo:true,version:2},params:{id}});assert.equal(r.status,200);
 const h=await llamar('get','/api/escandallos/:id/versiones',{params:{id}});assert.deepEqual(h.data.data.map(v=>v.version),[3,2,1]);
 });
 test('no se puede leer ni modificar una receta de otro ámbito',async()=>{
 const ajena=await db.run("INSERT INTO esc_recetas(local,nombre,raciones,pvp,iva,ingredientes,creado_por,actualizado_por) VALUES('B','Ajena',1,1,10,'[]','x','x') RETURNING id");
 assert.equal((await llamar('get','/api/escandallos/:id/versiones',{params:{id:ajena.id}})).status,404);
 assert.equal((await llamar('put','/api/escandallos/:id',{params:{id:ajena.id},body:{...receta,version:1}})).status,404);
 assert.equal((await llamar('get','/api/escandallos',{query:{local:'B'}})).status,403);
 });
 test('datos inválidos no crean recetas; producto descartado deja coste pendiente',async()=>{
 assert.equal((await llamar('post','/api/escandallos',{body:{...receta,ingredientes:[null]}})).status,400);
 await db.run("INSERT INTO producto_alias(clave,descartado) VALUES('patata',TRUE)");
 const r=await llamar('get','/api/escandallos');assert.equal(r.data.data[0].calculo.coste_racion,null);assert.equal(r.data.data[0].calculo.faltan,1);
 });
});
