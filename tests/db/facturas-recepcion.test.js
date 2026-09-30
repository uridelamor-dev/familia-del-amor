import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema, disponible, motivoSalto} from '../helpers/pgtmp.js';
import {RECEPCION_SCHEMA,crearRecepcion} from '../../src/modules/facturas/recepcion.js';
const archivo={buffer:Buffer.from('factura ficticia'),mimeType:'application/pdf',filename:'prueba.pdf',canal:'Email',local:'La Tapeta - Girona'};
async function preparar(t,fn) {
  if(!await disponible()){t.skip(motivoSalto());return;}
  const db=await conEsquema();
  try {await db.raw(RECEPCION_SCHEMA);await fn(db);}finally{await db.fin();}
}
const cola=(db,procesar)=>crearRecepcion({db,procesar,lock:async(_h,fn)=>fn()});
test('original y origen sobreviven a fallo de Google y un nuevo trabajador los recupera',async t=>preparar(t,async db=>{
 const a=cola(db,async()=>{throw new Error('Google caído');});
 await assert.rejects(a.recibir(archivo), e=>e.recibido===true);
 let f=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(f.estado,'pendiente');assert.deepEqual(f.original,archivo.buffer);assert.equal(f.canal,'Email');
 assert.equal(f.intentos,1);assert.ok(new Date(f.proximo)>new Date());
 await db.run('UPDATE facturas_recepciones SET proximo=NOW()');
 let n=0;
 const b=cola(db,async o=>{n++;assert.equal(o.local,archivo.local);assert.equal(o.canal,'Email');assert.deepEqual(o.buffer,archivo.buffer);return {datos:{total:42},driveUrl:'https://example.invalid/factura'};});
 await b.reintentar();
 f=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(f.estado,'registrado');assert.equal(f.original,null);assert.equal(f.resultado.datos.total,42);
 await b.recibir(archivo);assert.equal(n,1);assert.equal((await db.all('SELECT id FROM facturas_recepciones')).length,1);
}));
test('tras cinco errores conserva el original para revisión y no reintenta sin límite',async t=>preparar(t,async db=>{
 let n=0; const a=cola(db,async()=>{n++;throw new Error('no legible');});
 await assert.rejects(a.recibir(archivo));
 for(let i=1;i<5;i++){await db.run('UPDATE facturas_recepciones SET proximo=NOW()');await a.reintentar();}
 const f=await db.get('SELECT * FROM facturas_recepciones');assert.equal(f.estado,'error');assert.equal(f.intentos,5);assert.deepEqual(f.original,archivo.buffer);
 await a.reintentar();assert.equal(n,5);
}));
test('recupera lectura interrumpida y cierra duplicado sin registrar de nuevo',async t=>preparar(t,async db=>{
 const a=cola(db,async()=>{const e=new Error('ya existe');e.isDuplicate=true;throw e;});
 await assert.rejects(a.recibir(archivo),e=>e.isDuplicate);
 assert.equal((await db.get('SELECT estado FROM facturas_recepciones')).estado,'duplicado');
 await db.run("UPDATE facturas_recepciones SET estado='leyendo',original=?,proximo=NOW()",[archivo.buffer]);
 let n=0;const b=cola(db,async()=>{n++;return {pendiente:true,datos:{}};});
 await b.reintentar();assert.equal(n,1);assert.equal((await db.get('SELECT estado FROM facturas_recepciones')).estado,'registrado');
}));
test('si falla la persistencia no comienza la lectura externa',async()=>{
 let leido=false;const a=cola({run:async()=>{throw new Error('base caída');}},async()=>{leido=true;});
 await assert.rejects(a.recibir(archivo),/base caída/);assert.equal(leido,false);
});
test('A01 reimportación con lector ocupado conserva original y la recupera el trabajador',async t=>preparar(t,async db=>{
 let ocupado=false,existe=true,n=0;
 const r=crearRecepcion({db,existeDestino:async()=>existe,procesar:async()=>({n:++n}),lock:async(_hash,fn)=>{
  if(ocupado)throw Object.assign(new Error('ocupado'),{recibido:true});return fn();
 }});
 await r.recibir(archivo);existe=false;ocupado=true;
 await assert.rejects(r.recibir(archivo),e=>e.recibido===true);
 assert.deepEqual((await db.get('SELECT original FROM facturas_recepciones')).original,archivo.buffer);
 ocupado=false;await r.reintentar();
 const f=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(n,2);assert.equal(f.estado,'registrado');assert.equal(f.original,null);
}));
