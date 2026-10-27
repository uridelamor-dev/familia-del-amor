import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tipoIdentidad,limpiarLectura,idsIdentidad,adjuntarIdentidad,registrarIdentidad} from '../src/modules/rrhh/documentos-identidad.js';
import {normalizarDireccion,registrarDirecciones} from '../src/modules/rrhh/direcciones.js';
const uuid='11111111-1111-4111-8111-111111111111';
test('identidad: detecta contenido real y rechaza HTML aunque se llame jpg',()=>{
 assert.equal(tipoIdentidad(Buffer.from([255,216,255,1])),'image/jpeg');
 assert.equal(tipoIdentidad(Buffer.from('%PDF-1.7')),'application/pdf');
 assert.equal(tipoIdentidad(Buffer.from('<html>')) ,null);
 assert.equal(tipoIdentidad(undefined),null);
});
test('lectura: comprueba letra DNI/NIE y fecha; no inventa los datos dudosos',()=>{
 assert.deepEqual(limpiarLectura({nombre:' Persona Prueba ',dni:'12345678Z',fecha_nac:'1990-01-01'}),{nombre:'Persona Prueba',dni:'12345678Z',fecha_nac:'1990-01-01'});
 assert.equal(limpiarLectura({dni:'12345678A',fecha_nac:'2000-02-30'}).dni,'');
 assert.equal(limpiarLectura({fecha_nac:'2999-01-01'}).fecha_nac,'');
 assert.equal(limpiarLectura({dni:'X1234567L'}).dni,'X1234567L');
});
test('adjuntos: máximo dos, sin duplicados ni identificadores arbitrarios',()=>{
 assert.deepEqual(idsIdentidad(JSON.stringify([uuid])),[uuid]);
 for(const v of ['{}','["../secret"]',[uuid,uuid],[uuid,uuid,uuid]])assert.throws(()=>idsIdentidad(v));
});
test('adjuntos: solo el autor autorizado puede vincularlos y nunca a dos personas',async()=>{
 const calls=[];let row={id:uuid,cara:'frontal',worker_id:null};
 const client={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT')?[row].filter(Boolean):[]};}};
 await adjuntarIdentidad(client,[uuid],{id:1,rol:'rrhh',username:'responsable'},8);
 assert.ok(calls.some(c=>c.sql.includes('FOR UPDATE')&&c.args[1]===1));
 assert.ok(calls.some(c=>c.sql.includes('INSERT INTO hr_documentos')&&c.sql.includes(',1,')&&c.args[0]===8));
 row={...row,worker_id:8};calls.length=0;await adjuntarIdentidad(client,[uuid],{id:1,rol:'rrhh'},8);assert.equal(calls.length,1);
 await assert.rejects(()=>adjuntarIdentidad(client,[uuid],{id:1,rol:'rrhh'},9));
 await assert.rejects(()=>adjuntarIdentidad(client,[uuid],{id:1,rol:'encargado'},8));
 row=null;await assert.rejects(()=>adjuntarIdentidad(client,[uuid],{id:2,rol:'rrhh'},8));
});
test('direcciones: separa código postal, población y país sin asumir orden',()=>{
 const r=normalizarDireccion({formatted_address:'Calle Mayor 1, 08001 Barcelona, España',address_components:[{types:['country'],long_name:'España'},{types:['postal_code'],long_name:'08001'},{types:['locality'],long_name:'Barcelona'}]});
 assert.equal(r.codigo_postal,'08001');assert.equal(r.poblacion,'Barcelona');assert.equal(r.pais,'España');assert.equal(normalizarDireccion({}).codigo_postal,'');
});
function respuesta(){return {statusCode:200,set(){},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};}
test('direcciones: consulta segura, timeout, mínimos y fallo de proveedor explícito',async()=>{
 let handler,called=0;const app={get:(p,auth,h)=>handler=h};
 registrarDirecciones(app,{auth:()=>{},key:'clave-ficticia',fetcher:async url=>{called++;assert.match(url,/maps.googleapis.com/);return {ok:true,json:async()=>({status:'OK',predictions:[{place_id:'abc',description:'Calle de prueba'}]})};}});
 let res=respuesta();await handler({query:{q:'ab'}},res);assert.equal(called,0);
 res=respuesta();await handler({query:{q:'calle'}},res);assert.deepEqual(res.body.data,[{id:'abc',texto:'Calle de prueba'}]);
 registrarDirecciones(app,{auth:()=>{},key:'',fetcher:()=>{throw Error('No debe llamar');}});res=respuesta();await handler({query:{q:'calle'}},res);assert.equal(res.statusCode,503);
 registrarDirecciones(app,{auth:()=>{},key:'x',fetcher:async()=>({ok:true,json:async()=>({status:'REQUEST_DENIED'})})});res=respuesta();await handler({query:{q:'calle'}},res);assert.equal(res.statusCode,503);
});
test('lectura: rechaza adjuntos ajenos antes de llamar al proveedor',async()=>{
 const routes=new Map();let leido=false;registrarIdentidad({post:(p,...h)=>routes.set(p,h.at(-1))},{auth:()=>{},pool:{query:async()=>({rows:[]})},subir:{single:()=>()=>{}},leer:async()=>{leido=true;}});
 const res=respuesta();await routes.get('/api/rrhh/identidad/leer')({body:{documentos_identidad:[uuid]},user:{id:2}},res);assert.equal(res.statusCode,400);assert.equal(leido,false);
});

test('flujo HTTP: sube dos caras, recupera borrador y lee sin exponer contenido a otro usuario',async()=>{
 const {default:express}=await import('express');const {default:multer}=await import('multer');
 const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
 const archivos=new Map();let lecturas=0;const pool={query:async(sql,args=[])=>{
  if(sql.startsWith('DELETE'))return {rows:[]};
  if(sql.includes('count(*)'))return {rows:[{n:archivos.size}]};
  if(sql.startsWith('INSERT')){const [id,autor_id,cara,mime,contenido]=args;archivos.set(id,{id,autor_id,cara,mime,contenido});return {rows:[]};}
  return {rows:[...archivos.values()].filter(a=>args[0].includes(a.id)&&a.autor_id===args[1])};
 }};
 const app=express();app.use(express.json());const auth=(req,res,next)=>{if(!['rrhh','direccion'].includes(req.headers['x-rol']))return res.sendStatus(403);req.user={id:Number(req.headers['x-actor']||1)};next();};
 registrarIdentidad(app,{auth,pool,subir:multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024}}),leer:async rows=>{lecturas++;assert.equal(rows.length,2);return {nombre:'Persona Prueba',dni:'12345678Z',fecha_nac:'1990-02-03'};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const headers={'x-rol':'rrhh'},ids=[];
  for(const cara of ['frontal','trasera']){const f=new FormData();f.append('cara',cara);f.append('archivo',new Blob([bytes],{type:'application/pdf'}),'prueba.pdf');const r=await fetch(base+'/api/rrhh/identidad/adjunto',{method:'POST',headers,body:f});assert.equal(r.status,200);ids.push((await r.json()).id);}
  const pedir=(p,actor=1)=>fetch(base+'/api/rrhh/identidad/'+p,{method:'POST',headers:{...headers,'Content-Type':'application/json','x-actor':String(actor)},body:JSON.stringify({documentos_identidad:ids})});
  assert.equal((await pedir('estado',2)).status,400);
  const estado=await (await pedir('estado')).json();assert.equal(estado.data.length,2);assert.ok(estado.data.every(a=>!a.contenido));
  assert.equal((await pedir('leer',2)).status,400);assert.equal(lecturas,0);
  const lectura=await (await pedir('leer')).json();assert.equal(lectura.datos.nombre,'Persona Prueba');assert.equal(lecturas,1);
  assert.equal((await pedir('leer')).status,429);
  assert.equal((await fetch(base+'/api/rrhh/identidad/estado',{method:'POST',headers:{'x-rol':'encargado'}})).status,403);
 }finally{await new Promise(r=>server.close(r));}
});
