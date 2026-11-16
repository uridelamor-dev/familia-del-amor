import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('app.patch("/api/facturas/lineas/:id",');
const route=source.slice(start,source.indexOf('\n});',start)+4);
async function ejecutar({sinPadre=false,sinLinea=false,updateVacio=false,acceso=true}={}){
 let handler,status=200,body;const events=[];
 const linea={id:1,factura_id:213,local:'Tordera',cantidad:1,precio_unitario:22.21,importe:22.21,unidad:'caja',descripcion:'Barra',base_imponible:22.21};
 const tx={
  get:async(sql)=>{if(sql.includes('FOR UPDATE')){events.push('lock padre');return sinPadre?null:{id:213};}if(sql.startsWith('SELECT l.id')){events.push('leer linea');return sinLinea?null:linea;}if(sql.startsWith('UPDATE factura_lineas')){events.push('update returning');return updateVacio?null:{id:1};}throw Error(sql);},
  all:async()=>[],run:async()=>events.push('write')
 };
 vm.runInNewContext(route,{app:{patch(_p,_a,h){handler=h;}},requireAuth:()=>null,
  transaccionPaginas:async fn=>{events.push('BEGIN');try{const r=await fn(tx);events.push('COMMIT');return r;}catch(e){events.push('ROLLBACK');throw e;}},
  puedeAccederLocal:()=>acceso,claveProducto:x=>x,console:{error(){}},
  recalcularCuadre:async(_id,_base,deps)=>{assert.equal(deps.dbGet,tx.get);events.push('cuadre tx');return {cuadra:true,suma:22.21,base:22.21,diferencia:0};}
 });
 const res={status(n){status=n;return this;},json(v){events.push('respuesta');body=v;return this;}};
 await handler({params:{id:'1'},body:{descripcion:'Barra gallega',conservar_original:true}},res);
 return {status,body,events};
}
test('PATCH línea bloquea padre antes leer y responde solo tras commit; cuadre usa misma transacción',async()=>{
 const r=await ejecutar();assert.equal(r.status,200);assert.equal(r.body.ok,true);
 assert.deepEqual(r.events,['BEGIN','lock padre','leer linea','update returning','cuadre tx','COMMIT','respuesta']);
});
test('línea sustituida por relectura devuelve conflicto y no éxito falso ni cuadre',async()=>{
 for(const flags of [{sinPadre:true},{sinLinea:true},{updateVacio:true}]){
  const r=await ejecutar(flags);assert.equal(r.status,409);assert.equal(r.body.ok,false);assert.ok(r.events.includes('ROLLBACK'));assert.ok(!r.events.includes('COMMIT'));assert.ok(!r.events.includes('cuadre tx'));
 }
});
test('permiso local se comprueba antes escritura incluso con bloqueo transaccional',async()=>{
 const r=await ejecutar({acceso:false});assert.equal(r.status,403);assert.ok(!r.events.includes('update returning'));assert.ok(r.events.includes('ROLLBACK'));
});
