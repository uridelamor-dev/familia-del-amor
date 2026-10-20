import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {BANCOS_SCHEMA,registrarBancos,crearRecordatorioBancos} from '../../src/modules/bancos/servicio.js';
test('bancos SQL: importación idempotente, conciliación confirmada, reversión y recordatorio persistente',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw(BANCOS_SCHEMA);
 await db.raw('CREATE TABLE facturas_locales(local TEXT,empresa TEXT)');
 await db.raw("INSERT INTO facturas_locales VALUES('Girona','Empresa A'),('Lloret','Empresa B')");
 await db.raw('CREATE TABLE facturas(id SERIAL PRIMARY KEY,empresa TEXT,proveedor TEXT,nif TEXT,numero_factura TEXT,total NUMERIC,fecha TEXT,tipo TEXT,dup_estado TEXT,dup_de INTEGER,pagado INTEGER DEFAULT 0,fecha_pago TEXT,pago_origen TEXT,pago_automatico INTEGER DEFAULT 0)');
 await db.raw("INSERT INTO facturas(empresa,proveedor,numero_factura,total,fecha) VALUES('Empresa A','Proveedor','FAC1001',15,'2026-10-01'),('Empresa B','Proveedor','FAC1002',15,'2026-10-01')");
 const pool={query:db.raw,connect:async()=>({query:db.raw,release(){}})},rutas={};let roles;
 registrarBancos({get:(p,a,h)=>rutas['GET '+p]=h,post:(p,a,h)=>rutas['POST '+p]=h},{pool,auth:r=>(roles=r,()=>{})});
 assert.deepEqual(roles,['direccion','contabilidad']);
 async function call(method,path,body={},query={},params={}){let out,code=200;await rutas[method+' /api/bancos'+path]({body,query,params,user:{username:'Silvia'}},{status(n){code=n;return this;},json(v){out=v;}});return {code,...out};}
 const a=await call('POST','/cuentas',{nombre:'Principal',empresa:'Empresa A',banco:'Sabadell',ultimos4:'1234'});assert.equal(a.code,200);
 assert.equal((await call('POST','/cuentas',{nombre:'Falsa',empresa:'Desconocida',banco:'Sabadell',ultimos4:'1234'})).code,400);
 for(const banco of ['CaixaBank','BBVA','Santander','Otro banco']){assert.equal((await call('POST','/cuentas',{nombre:banco,empresa:'Empresa B',banco,ultimos4:'1234'})).code,200);}
 const texto='Fecha;Concepto;Importe;Saldo\n02/10/2026;Pago FAC1001;-15,00;200,00\n03/10/2026;Ingreso;50,00;250,00',mapa={separador:';',fecha:0,concepto:1,importe:2,saldo:3,decimal:',',formatoFecha:'dmy'};
 const body={texto,mapa,cuenta_id:a.id,mes:'2026-10',archivo:'extracto.csv'};
 const p=await call('POST','/previsualizar',body);assert.equal(p.nuevos,2);
 assert.equal((await db.raw('SELECT count(*) AS n FROM banco_movimientos')).rows[0].n,'0');
 assert.equal((await call('POST','/confirmar',{id:p.id,completo:true})).nuevos,2);
 assert.equal((await call('POST','/confirmar',{id:p.id})).nuevos,2);
 const p2=await call('POST','/previsualizar',{...body,archivo:'otro-nombre.csv'});assert.equal(p2.duplicados,2);
 assert.equal((await call('POST','/confirmar',{id:p2.id})).nuevos,0);
 const lista=await call('GET','/movimientos',{}, {cuenta:a.id,mes:'2026-10'});assert.equal(lista.data.length,2);
 const m=lista.data.find(m=>Number(m.importe)<0);
 const propuestas=await call('GET','/propuestas/:id',{}, {},{id:m.id});assert.equal(propuestas.data.length,1);
 assert.equal((await db.raw('SELECT pagado FROM facturas WHERE id=1')).rows[0].pagado,0);
 assert.equal((await call('POST','/conciliar',{movimiento_id:m.id,factura_id:2})).code,400);
 assert.equal((await call('POST','/conciliar',{movimiento_id:m.id,factura_id:1})).code,200);
 assert.equal((await db.raw('SELECT pagado FROM facturas WHERE id=1')).rows[0].pagado,1);
 assert.equal((await call('POST','/conciliar',{movimiento_id:m.id,factura_id:1})).code,409);
 assert.equal((await call('POST','/desconciliar',{id:m.id})).code,200);
 assert.equal((await db.raw('SELECT pagado FROM facturas WHERE id=1')).rows[0].pagado,0);
 assert.equal((await call('POST','/clasificar',{id:m.id,categoria:'Transferencia entre cuentas'})).code,200);
 assert.equal((await call('POST','/conciliar',{movimiento_id:m.id,factura_id:1})).code,200);
 assert.equal((await call('POST','/anular-importacion',{id:p.id})).code,409);
 await db.raw("UPDATE facturas SET pago_origen='manual',fecha_pago='2026-10-05' WHERE id=1");
 assert.match((await call('POST','/desconciliar',{id:m.id})).advertencia,/conservado/);
 assert.equal((await db.raw('SELECT fecha_pago FROM facturas WHERE id=1')).rows[0].fecha_pago,'2026-10-05');
 assert.equal((await call('POST','/anular-importacion',{id:p.id})).code,200);
 assert.equal((await call('GET','/movimientos',{}, {cuenta:a.id,mes:'2026-10'})).data.length,0);
 assert.equal((await call('POST','/confirmar',{id:p.id})).code,409);
 const p3=await call('POST','/previsualizar',body);assert.equal(p3.nuevos,2);
 assert.equal((await call('POST','/confirmar',{id:p3.id})).nuevos,2);
 await db.raw("UPDATE banco_config SET primer_mes='2026-11'");const enviados=[];
 const recordar=crearRecordatorioBancos({pool,listo:()=>true,enviar:async(...args)=>enviados.push(args)});
 await recordar(new Date('2026-10-20T12:00:00Z'));assert.equal(enviados.length,0);
 await recordar(new Date('2026-11-01T08:00:00Z'));assert.equal(enviados.length,0);
 await recordar(new Date('2026-11-01T09:00:00Z'));await recordar(new Date('2026-11-01T10:00:00Z'));assert.equal(enviados.length,1);assert.match(enviados[0][1],/octubre/);
 const fallo=crearRecordatorioBancos({pool,listo:()=>true,enviar:async()=>{throw Error('simulado');}});
 await assert.rejects(()=>fallo(new Date('2026-12-01T09:00:00Z')));await fallo(new Date('2026-12-01T10:00:00Z'));
 assert.equal((await db.raw("SELECT estado FROM banco_recordatorios WHERE mes='2026-12'")).rows[0].estado,'revisar');
 }finally{await db.fin();}
});

test('bancos exige contabilidad global también en peticiones directas',()=>{
 let permiso;registrarBancos({get:(p,a)=>{permiso=a;},post:()=>{}},{pool:{},auth:()=>((req,res,next)=>next())});
 let status,permitido=false;const res={status(n){status=n;return this;},json(){}};
 permiso({user:{rol:'contabilidad',locales:['Girona']}},res,()=>{permitido=true;});
 assert.equal(status,403);assert.equal(permitido,false);
 permiso({user:{rol:'contabilidad'}},res,()=>{permitido=true;});assert.equal(permitido,true);
});
