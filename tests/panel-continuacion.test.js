import { validarComunicado } from '../src/modules/comunicados/comunicados.js';
import { registrarComunicados } from '../src/routes/comunicados.js';
import { validarGestion } from '../src/modules/mantenimiento/gestion.js';
import { updateMaintenanceIssueStatus } from '../src/modules/mantenimiento/maintenance.service.js';
import { visitaCompatibleConSeguimiento, validarEdicionReserva } from '../src/modules/reservas/sala.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validarSala, puedeGestionarSala } from '../src/modules/reservas/sala.js';
import { huellaContenido, validarCambios, diferenciasContenido, aplicarCambios } from '../src/modules/web/borradores.js';
import { revisarFacturas, fechaValida } from '../src/modules/facturas/calidad.js';
import { registrarSala } from '../src/routes/reservas-sala.js';
import { registrarBorradoresWeb } from '../src/routes/web-borradores.js';

test('sala valida estados, longitudes y revisión sin aceptar campos extra',()=> {
  assert.deepEqual(validarSala({estado_sala:'llegada',mesa:' T4 ',notas_sala:' ventana ',version_sala:0,local:'otro'}).data,{estado_sala:'llegada',mesa:'T4',notas_sala:'ventana',version_sala:0});
  for(const extra of [{estado_sala:'cancelada'},{mesa:'x'.repeat(81)},{notas_sala:'x'.repeat(2001)},{version_sala:-1}]) assert.ok(validarSala({estado_sala:'prevista',mesa:'',notas_sala:'',version_sala:0,...extra}).error);
  assert.equal(puedeGestionarSala('Blanes',[]),false); assert.equal(puedeGestionarSala('Blanes',['Girona']),false); assert.equal(puedeGestionarSala('Blanes',null),true);
});
test('contenido: huella estable, borrados restaurables y validación de claves',()=> {
  assert.equal(huellaContenido({b:'2',a:'1'}),huellaContenido({a:'1',b:'2'}));
  const a={titulo:'Antes',otra:'Conservar'}, b={titulo:'Después'};
  assert.deepEqual(aplicarCambios(a,diferenciasContenido(a,b)),b);
  assert.equal(validarCambios({titulo:null},k=>k==='titulo'),null);
  assert.ok(validarCambios({secreto:'x'},k=>k==='titulo'));
  assert.ok(validarCambios({titulo:{}},()=>true));
});
test('calidad detecta fechas imposibles, futuras y coincidencias sin confundir abonos ni ejercicios',()=> {
  assert.equal(fechaValida('2026-02-30'),false); assert.equal(fechaValida('2024-02-29'),true);
  const f={local:'Blanes',proveedor:'Proveedor',numero_factura:'A1',fecha:'2026-09-01',total:30};
  const rows=revisarFacturas([f,{...f,total:0},{...f,fecha:'2025-09-01'},{...f,numero_factura:'A2',total:-30},{...f,fecha:'2028-07-01',numero_factura:'A3'}],'2026-09-22');
  assert.ok(rows[0].calidad.some(x=>x.includes('Mismo proveedor')));
  assert.ok(rows[1].calidad.some(x=>x.includes('cero')));
  assert.deepEqual(rows[2].calidad,[]); assert.deepEqual(rows[3].calidad,[]);
  assert.deepEqual(rows[4].calidad,['Fecha futura']); assert.equal(f.calidad,undefined);
});

function harness(register,state,opts={}) {
  const handlers=new Map(); let saved, released=0; const sqls=[]; let revisionCounter=state.draft?.revision || 0;
  const db={release(){released++;},async query(sql,p=[]) {
    sqls.push(sql);
    if(sql==='BEGIN') {saved=structuredClone(state);return {rows:[]};}
    if(sql==='ROLLBACK') {Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,saved);return {rows:[]};}
    if(sql==='COMMIT'||sql.startsWith('LOCK TABLE')||sql.startsWith('SELECT pg_advisory'))return {rows:[]};
    if(opts.fail?.(sql))throw new Error('fallo simulado');
    if(sql.startsWith('SELECT key,value'))return {rows:Object.entries(state.content||{}).map(([key,value])=>({key,value}))};
    if(sql.startsWith('SELECT * FROM web_borradores'))return {rows:state.draft?[state.draft]:[]};
    if(sql.startsWith('SELECT id,autor'))return {rows:state.versions||[]};
    if(sql.startsWith('SELECT contenido'))return {rows:(state.versions||[]).filter(x=>x.id===p[0])};
    if(sql.startsWith('INSERT INTO web_borradores')) {state.draft={base_version:p[1],cambios:JSON.parse(p[2]),revision:sql.includes("nextval('web_borrador_revision_seq')") ? ++revisionCounter : p[3]}; return {rows:[state.draft]};}
    if(sql.startsWith('INSERT INTO web_versiones')) { (state.versions ||= []).push({id:state.versions.length+1,autor:p[0],contenido:JSON.parse(p[1])}); return {rows:[]}; }
    if(sql.startsWith('INSERT INTO contents')) {state.content[p[0]]=p[1];return {rows:[]};}
    if(sql.startsWith('DELETE FROM contents')) {delete state.content[p[0]];return {rows:[]};}
    if(sql.startsWith('DELETE FROM web_borradores')) {state.draft=null;return {rows:[]};}
    if(sql.startsWith('SELECT * FROM reservas'))return {rows:state.reserva?[structuredClone(state.reserva)]:[]};
    if(sql.startsWith('SELECT id FROM bloqueos_reservas')) return {rows:opts.blocked?[{id:1}]:[]};
    if(sql.startsWith('UPDATE followup_scheduled')) {state.reprogramado=p;return {rows:[]};}
    if(sql.startsWith('UPDATE reservas')) {Object.assign(state.reserva,{estado_sala:p[1],mesa:p[2],notas_sala:p[3],nombre_reserva:p[4],personas:p[5],dia:p[6],hora:p[7],version_sala:state.reserva.version_sala+1}); return {rows:[state.reserva]};}
    if(sql.startsWith('INSERT INTO reservas_sala_historial')) { (state.historial||=[]).push(p);return {rows:[]}; }
    throw new Error('Consulta no implementada en prueba: '+sql);
  }};
  const app=Object.fromEntries(['get','put','post','patch','delete'].map(method=>[method,(path,auth,fn)=>handlers.set(method+' '+path,fn)]));
  register(app,{ahora:()=>({fecha:'2026-09-22',hora:'18:00'}),pool:{connect:async()=>db},requireAuth:roles=>{assert.ok(roles.includes('direccion'));return ()=>{};},permitido:k=>['titulo','sub'].includes(k),localesPermitidos:()=>opts.locals===undefined?null:opts.locals});
  return {sqls,get released(){return released;},async call(method,path,body={}) {const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await handlers.get(method+' '+path)({body,user:{id:1,username:'prueba'},params:{id:'1'}},res);return res;}};
}
test('publicar guarda la versión anterior, aplica todo y elimina el borrador en una transacción',async()=> {
  const state={content:{titulo:'antes',sub:'viejo'}};const h=harness(registrarBorradoresWeb,state);
  let r=await h.call('put','/api/content/draft',{cambios:{titulo:'nuevo',sub:null},base_version:huellaContenido(state.content),revision:0}); assert.equal(r.code,200);
  assert.equal(state.content.titulo,'antes');
  r=await h.call('post','/api/content/publish',{revision:1}); assert.equal(r.code,200);
  assert.deepEqual(state.content,{titulo:'nuevo'});assert.deepEqual(state.versions[0].contenido,{titulo:'antes',sub:'viejo'});assert.equal(state.draft,null);
  r=await h.call('post','/api/content/restore',{id:1,revision:0}); assert.equal(r.code,200);
  assert.deepEqual(state.content,{titulo:'nuevo'});assert.deepEqual(state.draft.cambios,{titulo:'antes',sub:'viejo'});assert.equal(h.released,3);
});
test('publicación concurrente conserva borrador y no pisa cambios externos',async()=> {
  const state={content:{titulo:'antes'}};const h=harness(registrarBorradoresWeb,state);
  await h.call('put','/api/content/draft',{cambios:{titulo:'mío'},base_version:huellaContenido(state.content),revision:0});
  state.content.titulo='otra persona';const r=await h.call('post','/api/content/publish',{revision:1});
  assert.equal(r.code,409);assert.equal(state.content.titulo,'otra persona');assert.equal(state.draft.cambios.titulo,'mío');
  assert.equal((await h.call('put','/api/content/draft',{cambios:{titulo:'obsoleto'},base_version:state.draft.base_version,revision:0})).code,409);
});
test('un fallo a mitad de publicación revierte datos e historial',async()=> {
  const state={content:{titulo:'antes',sub:'antes'},draft:{cambios:{titulo:'nuevo',sub:'nuevo'},revision:1,base_version:huellaContenido({titulo:'antes',sub:'antes'})}};
  let writes=0;const h=harness(registrarBorradoresWeb,state,{fail:sql=>sql.startsWith('INSERT INTO contents')&&++writes===2});
  assert.equal((await h.call('post','/api/content/publish',{revision:1})).code,500);
  assert.deepEqual(state.content,{titulo:'antes',sub:'antes'});assert.ok(state.draft);assert.equal(state.versions,undefined);
});
test('sala registra autor e historial y rechaza acceso ajeno o revisión vieja',async()=> {
  const state={reserva:{id:1,local:'Blanes',version_sala:0}};
  const h=harness(registrarSala,state,{locals:['Blanes']});const body={estado_sala:'sentada',mesa:'T4',notas_sala:'',version_sala:0};
  assert.equal((await h.call('patch','/api/reservas/:id/sala',body)).code,200);assert.equal(state.reserva.version_sala,1);assert.equal(state.historial[0][1],'prueba');
  assert.equal((await h.call('patch','/api/reservas/:id/sala',body)).code,409);
  assert.equal((await harness(registrarSala,state,{locals:['Girona']}).call('patch','/api/reservas/:id/sala',{...body,version_sala:1})).code,403);
});

test('comparar resuelve un conflicto sin publicar y rechaza una comparación obsoleta',async()=> {
  const state={content:{titulo:'original'}};const h=harness(registrarBorradoresWeb,state);
  await h.call('put','/api/content/draft',{cambios:{titulo:'mío'},base_version:huellaContenido(state.content),revision:0});
  state.content.titulo='publicado después';
  let r=await h.call('put','/api/content/draft',{cambios:{titulo:'mío'},base_version:huellaContenido({titulo:'otro'}),revision:1,rebase:true});assert.equal(r.code,409);
  r=await h.call('put','/api/content/draft',{cambios:{titulo:'mío'},base_version:huellaContenido(state.content),revision:1,rebase:true});assert.equal(r.code,200);
  assert.equal(state.content.titulo,'publicado después');
  assert.equal((await h.call('post','/api/content/publish',{revision:2})).code,200);assert.equal(state.content.titulo,'mío');
});

test('comunicados validan mensaje, destinatario y fecha real',()=> {
 const body={rol:'trabajadores',mensaje:'Aviso',hasta:'2026-09-30'};
 assert.equal(validarComunicado(body,'2026-09-22'),null);
 for(const m of [{rol:'todos'},{mensaje:''},{hasta:'2026-02-30'},{hasta:'2026-01-01'},{mensaje:'x'.repeat(5001)}]) assert.ok(validarComunicado({...body,...m},'2026-09-22'));
});
test('los trabajadores solo leen su local y no pueden confirmar anuncios ajenos',async()=> {
 const handlers={};let selects=[],writes=0;
 const app={get:(p,a,f)=>handlers['GET '+p]=f,post:(p,a,f)=>handlers['POST '+p]=f};
 registrarComunicados(app,{requireAuth:()=>()=>{},hoyISO:()=> '2026-09-22',localScope:()=>null,canonizarLocal:x=>x,
 dbAll:async(sql,params)=>{selects.push({sql,params});return [];},dbGet:async()=>({id:3,local:'Girona',rol:'trabajadores'}),dbRun:async()=>{writes++;}});
 const req={user:{id:2,local:'Blanes',rol:'trabajador'},query:{local:'Girona',rol:'direccion'},params:{id:'3'}};
 const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;}};
 await handlers['GET /api/announcements'](req,res);
 assert.deepEqual(selects[0].params,[2,'Blanes','trabajadores','2026-09-22']);
 assert.match(selects[0].sql,/a.hasta >=/);
 await handlers['POST /api/announcements/:id/leido'](req,res);assert.equal(res.code,403);assert.equal(writes,0);
});
test('gestión de incidencias no cambia el estado y detecta ediciones concurrentes',async()=> {
 const g={responsable:' Equipo ',fecha_objetivo:'2026-10-01',version:0};assert.equal(validarGestion(g),null);
 assert.ok(validarGestion({...g,fecha_objetivo:'2026-02-30'}));
 let sql,params;
 const db={run:async(q,p)=>{sql=q;params=p;return {id:1};}};
 assert.equal((await updateMaintenanceIssueStatus(db,{},1,{estado:'abierta',gestion:g})).code,'OK');
 assert.doesNotMatch(sql,/SET estado/);assert.match(sql,/AND estado = \? AND gestion_version = \?/);assert.equal(params[0],'Equipo');
 assert.equal((await updateMaintenanceIssueStatus({run:async()=>null},{},1,{estado:'abierta',gestion:g})).code,'CONFLICT');
});
test('no se envía seguimiento de visita tras cancelación o ausencia registrada',()=> {
 assert.equal(visitaCompatibleConSeguimiento([]),false);
 assert.equal(visitaCompatibleConSeguimiento([{estado_sala:'no_presentada'}]),false);
 assert.equal(visitaCompatibleConSeguimiento([{estado_sala:'no_presentada'},{estado_sala:'finalizada'}]),true);
 assert.equal(visitaCompatibleConSeguimiento([{}]),true); // legado: sin dato de sala
});
test('guardado de borrador serializa cambios escritos mientras llega una respuesta',async()=> {
 const text=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
 const pending=[],calls=[];
 const ctx=vm.createContext({WEB:{content:{}},WEB_TIMERS:{},WEB_DRAFT:{cambios:{titulo:'primero'},base:'base',revision:0,dirty:true,saving:null,seq:1},clearTimeout(){},setTimeout(){},webInd(){},webPreviewStore(){},apiSend:async(m,p,b)=>{calls.push(b);return new Promise(resolve=>pending.push(resolve));}});
 vm.runInContext(text.slice(text.indexOf('async function webSaveDraft()'),text.indexOf('async function webPublish()')),ctx);
 const saving=ctx.webSaveDraft();ctx.webQueueSave('titulo','segundo');
 pending.shift()({borrador:{revision:1}});await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,2);assert.equal(calls[1].revision,1);assert.equal(calls[1].cambios.titulo,'segundo');
 pending.shift()({borrador:{revision:2}});await saving;assert.equal(ctx.WEB_DRAFT.dirty,false);assert.equal(ctx.WEB_DRAFT.revision,2);
});

test('edición de reserva rechaza fechas imposibles, turnos pasados y datos originales obsoletos',()=> {
 const r={nombre_reserva:'Ana',personas:2,dia:'2026-09-23',hora:'21:00'},ahora={fecha:'2026-09-22',hora:'18:00'};
 const entrada={...r,original:r,personas:4};
 assert.equal(validarEdicionReserva(r,entrada,ahora).data.personas,4);
 for(const cambio of [{dia:'2026-02-30'},{dia:'2026-09-21'},{hora:'25:00'},{personas:1.5},{nombre_reserva:''},{dia:'2026-09-22',hora:'17:00'}])assert.ok(validarEdicionReserva(r,{...entrada,...cambio},ahora).error);
 assert.equal(validarEdicionReserva({...r,personas:3},entrada,ahora).status,409);
 assert.equal(validarEdicionReserva(r,{...entrada,dia:'2026-09-24'},ahora).cambiaTurno,true);
});

test('cambio de fecha reprograma el seguimiento pendiente y un bloqueo no altera nada',async()=> {
 const r={id:1,local:'Blanes',telefono:'600000000',nombre_reserva:'Ana',personas:2,dia:'2026-09-23',hora:'21:00',version_sala:0};
 const b={estado_sala:'prevista',mesa:'T4',notas_sala:'',version_sala:0,reserva:{...r,original:{...r},dia:'2026-09-24'}};
 const blocked={reserva:{...r}};
 assert.equal((await harness(registrarSala,blocked,{blocked:true}).call('patch','/api/reservas/:id/sala',b)).code,400);
 assert.equal(blocked.reserva.dia,r.dia);assert.equal(blocked.historial,undefined);
 const state={reserva:{...r}};const h=harness(registrarSala,state);
 assert.equal((await h.call('patch','/api/reservas/:id/sala',b)).code,200);
 assert.equal(state.reserva.dia,'2026-09-24');assert.equal(state.reprogramado[0],'2026-09-24');
 assert.ok(h.sqls.some(sql=>sql.includes('NOT EXISTS (SELECT 1 FROM reservas')));
});

test('abrir vista previa en una pestaña nueva recupera el borrador mediante sesión; la web normal no',async()=> {
 const source=readFileSync(new URL('../public/js/content-preview.js',import.meta.url),'utf8');
 const make=search=> {
   const calls=[];const ctx=vm.createContext({window:{},URLSearchParams,URL,Response,JSON,location:{search,origin:'http://prueba',href:'http://prueba/index.html'},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=> 'sesion-de-prueba'},document:{addEventListener(){},getElementById(){return null;}},fetch:async url=>{calls.push(url);return new Response(JSON.stringify(url.includes('editor')?{ok:true,data:{titulo:'publicado'},borrador:{cambios:{titulo:'borrador'}}}:{ok:true,data:{titulo:'publicado'}}));}});
   vm.runInContext(source,ctx);return {ctx,calls};
 };
 const preview=make('?vista_previa=1');assert.equal((await (await preview.ctx.window.webContentFetch()).json()).data.titulo,'borrador');assert.equal(preview.calls.length,2);
 const live=make('');assert.equal((await (await live.ctx.window.webContentFetch()).json()).data.titulo,'publicado');assert.equal(live.calls.length,1);
});

test('las revisiones no se reutilizan después de publicar: una ventana antigua no publica otro borrador',async()=> {
 const state={content:{titulo:'original'}};const h=harness(registrarBorradoresWeb,state);
 await h.call('put','/api/content/draft',{cambios:{titulo:'uno'},base_version:huellaContenido(state.content),revision:0});
 await h.call('post','/api/content/publish',{revision:1});
 await h.call('put','/api/content/draft',{cambios:{titulo:'dos'},base_version:huellaContenido(state.content),revision:0});
 assert.equal(state.draft.revision,2);
 assert.equal((await h.call('post','/api/content/publish',{revision:1})).code,409);
 assert.equal(state.content.titulo,'uno');assert.equal(state.draft.cambios.titulo,'dos');
});
