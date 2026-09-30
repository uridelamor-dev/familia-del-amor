import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {construirRevision,lineasPropuestaPedido} from '../../src/modules/inventario/calculo.js';
test('pedido real: incompleto bloqueado, fallo intermedio revierte y repetición devuelve el mismo pedido',async t=>{
 if(!await disponible()) return t.skip(motivoSalto());
 const db=await conEsquema();
 try {
 for(const ddl of [
  'CREATE TABLE inv_sesiones(id SERIAL PRIMARY KEY,local TEXT,proveedor_id INTEGER,estado TEXT,finalizado_en TEXT)',
  'CREATE TABLE inv_productos(id SERIAL PRIMARY KEY,proveedor_id INTEGER,activo BOOLEAN,orden INTEGER,nombre TEXT,unidad TEXT,stock_objetivo NUMERIC)',
  'CREATE TABLE inv_lineas(sesion_id INTEGER,producto_id INTEGER,cantidad NUMERIC,observacion TEXT,actualizado_en TEXT,UNIQUE(sesion_id,producto_id))',
  'CREATE TABLE inv_pedidos(id SERIAL PRIMARY KEY,local TEXT,proveedor_id INTEGER,sesion_id INTEGER,estado TEXT,usuario TEXT,creado_en TEXT,actualizado_en TEXT)',
  'CREATE TABLE inv_pedido_lineas(id SERIAL PRIMARY KEY,pedido_id INTEGER,producto_id INTEGER,nombre TEXT,unidad TEXT,stock_contado NUMERIC,stock_necesario NUMERIC,cantidad_sugerida NUMERIC,cantidad_final NUMERIC,observacion TEXT)'
 ])await db.raw(ddl);
 await db.raw("INSERT INTO inv_sesiones VALUES(1,'A',1,'en_curso',NULL)");
 await db.raw("INSERT INTO inv_productos VALUES(1,1,TRUE,1,'Leche','L',20),(2,1,TRUE,2,'Café','kg',5)");
 await db.raw('INSERT INTO inv_lineas(sesion_id,producto_id,cantidad) VALUES(1,1,0)');
 let handler,fallar=false,n=0;
 const fuente=readFileSync('server.js','utf8');const a=fuente.indexOf('app.post("/api/inventario/pedido",');const b=fuente.indexOf('// 8) Pedidos',a);
 const context={app:{post:(_p,_auth,fn)=>handler=fn},requireAuth:()=>{},INV_ROLES:[],pool:{connect:async()=>({release(){},query:async(s,p)=>{if(fallar&&s.startsWith('INSERT INTO inv_pedido_lineas')&&++n===2)throw new Error('corte simulado');return db.raw(s,p);}})},toPositional:s=>{let i=0;return s.replace(/\?/g,()=>`$${++i}`);},puedeAccederLocal:(req,l)=>l==='A',invConstruirRevision:construirRevision,invLineasPedido:lineasPropuestaPedido,hoyMMDD:()=> '09-30'};
 vm.runInNewContext(fuente.slice(a,b),context);
 const llamar=async()=>{let status=200,data;await handler({body:{sesion_id:1},user:{username:'prueba'}},{status(s){status=s;return this;},json(j){data=j;return this;}});return {status,data};};
 assert.equal((await llamar()).status,409);assert.equal((await db.get('SELECT COUNT(*)::int n FROM inv_pedidos')).n,0);
 await db.raw('INSERT INTO inv_lineas(sesion_id,producto_id,cantidad) VALUES(1,2,1)');fallar=true;
 assert.equal((await llamar()).status,500);assert.equal((await db.get('SELECT COUNT(*)::int n FROM inv_pedidos')).n,0);assert.equal((await db.get('SELECT COUNT(*)::int n FROM inv_pedido_lineas')).n,0);assert.equal((await db.get('SELECT estado FROM inv_sesiones')).estado,'en_curso');
 fallar=false;const r=await llamar();assert.equal(r.status,200);assert.equal((await db.get('SELECT COUNT(*)::int n FROM inv_pedido_lineas')).n,2);assert.equal((await llamar()).data.id,r.data.id);assert.equal((await db.get('SELECT COUNT(*)::int n FROM inv_pedidos')).n,1);
 const start=fuente.indexOf('app.post("/api/inventario/sesion/:id/linea"');
 const end=fuente.indexOf('// 6) Revisión',start);
 vm.runInNewContext(fuente.slice(start,end),context);
 const guardar=async(cantidad)=>{let status=200,data;await handler({params:{id:1},body:{producto_id:1,cantidad}},{status(s){status=s;return this;},json(j){data=j;return this;}});return {status,data};};
 assert.equal((await guardar(12)).status,409,"un recuento finalizado no admite cambios tardíos");
 await db.raw("UPDATE inv_sesiones SET estado='en_curso'");
 assert.equal((await guardar(-1)).status,400);
 assert.equal((await guardar(null)).data.cantidad,null);
 assert.equal((await db.get('SELECT COUNT(*)::int n FROM inv_lineas WHERE producto_id=1')).n,0);
 assert.equal((await guardar(0)).data.cantidad,0);
 assert.equal(Number((await db.get('SELECT cantidad FROM inv_lineas WHERE producto_id=1')).cantidad),0);
 } finally {await db.fin();}
});
