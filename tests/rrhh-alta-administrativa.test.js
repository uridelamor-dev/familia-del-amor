import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { CAMPOS_PRIVADOS, puedeVerPrivado, sanearDatosAlta, estadoAlta, sanearConversacion, fechaValida } from '../src/modules/rrhh/alta-administrativa.js';
import { avisarCumpleanos, cumpleanosHoy, CUMPLE_CONFIG } from '../src/modules/rrhh/cumpleanos.js';
import { validarAlta } from '../src/modules/rrhh/ciclo.js';
import { validarFormatoPin } from '../src/modules/fichajes/pin.js';
const hoy = '2026-09-23';
const base = { nombre:'Persona Prueba', dni:'12345678Z', tipo_jornada:'parcial', tipo_contrato:'temporal', local:'Local de prueba', puesto:'Sala', fecha_alta:hoy };
test('los básicos bastan para gestoría aunque la ficha siga incompleta', () => {
  const a = estadoAlta(base, {horas_semana:20});
  assert.equal(a.listaGestoria,true); assert.equal(a.completa,false);
  assert.ok(a.faltanFicha.includes('IBAN')); assert.equal(a.correoConectado,false);
  for (const k of Object.keys(base)) assert.equal(estadoAlta({...base,[k]:null},{horas_semana:20}).listaGestoria,false,k);
  assert.equal(estadoAlta(base,null).listaGestoria,false);
});
test('campos vacíos son pendientes, valores no válidos se rechazan', () => {
  assert.equal(sanearDatosAlta({iban:'',dni:'',email:''},hoy).ok,true);
  for (const x of [{iban:'ES123'},{tipo_jornada:'otra'},{tipo_contrato:'beca'},{fecha_nac:'2026-02-30'},{fecha_nac:'2026-99-99'},{email:'sin arroba'}]) assert.equal(sanearDatosAlta(x,hoy).ok,false);
  assert.equal(fechaValida('2024-02-29'),true);
  assert.equal(fechaValida('2025-02-29'),false);
  assert.equal(sanearDatosAlta({iban:'ES91 2100 0418 4502 0005 1332'},hoy).datos.iban,'ES9121000418450200051332');
});
test('conversaciones conservan fecha, interlocutor, canal y acuerdos; fecha futura se rechaza', () => {
  const x={contenido:' Revisamos la acogida ',asunto:'Acogida',interlocutor:'Responsable',canal:'En persona',acuerdos:'Revisar la semana siguiente',fecha_conversacion:'2026-09-22'};
  assert.equal(sanearConversacion(x,hoy).datos.contenido,'Revisamos la acogida');
  assert.ok(sanearConversacion({...x,fecha_conversacion:'2027-01-01'},hoy).error);
});
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
function altaService() {
  const queries=[];
  const query=async(sql,args=[])=>{queries.push({sql,args}); return {rows:sql.includes('INSERT INTO users')?[{id:7}]:[]};};
  const env={validarAlta,sanearDatosAlta,puedeVerPrivado,CAMPOS_PRIVADOS,validarFormatoPin,INV_LOCALES:['Local de prueba'],hoyISO:()=>hoy,rrhhPuedeLocal:()=>true,toPositional:x=>x,isoConOffset:()=>hoy,passwordInicial:x=>x,bcrypt:{hash:async x=>'hashed:'+x}};
  const start=server.indexOf('async function rrhhCrearTrabajador('), end=server.indexOf('// Envuelve el servicio',start);
  vm.runInNewContext(server.slice(start,end),env);
  return {queries,run:(data,rol='rrhh')=>env.rrhhCrearTrabajador({req:{user:{username:'rrhh',rol}},datos:{nombre:base.nombre,username:'persona',local:base.local,...data},client:{query}})};
}
test('alta real guarda los nuevos campos y PIN elegido hasheado en la misma transacción',async()=>{
  const a=altaService(); const r=await a.run({...base,telefono:'600000001',email:'prueba@example.org',direccion:'Calle de prueba',iban:'',talla_ropa:'M',pin:'4917',horas_semana:20});
  assert.equal(r.ok,true);
  assert.ok(a.queries.some(q=>q.sql.includes('INSERT INTO rrhh_datos_alta')&&q.args.includes('Calle de prueba')));
  const pin=a.queries.find(q=>q.sql.includes('pin_hash ='));
  assert.equal(pin.args[0],'hashed:4917');assert.match(pin.sql,/pin_temporal = FALSE/);
  assert.ok(!JSON.stringify(r).includes('4917'));
  assert.ok(a.queries.some(q=>q.sql.includes('INSERT INTO hor_contratos')&&q.args.includes(20)));
});
test('se puede crear una ficha incompleta; un PIN inválido no escribe nada',async()=>{
  const a=altaService();assert.equal((await a.run({})).ok,true);
  const b=altaService();assert.equal((await b.run({pin:'12'})).ok,false);assert.equal(b.queries.length,0);
});
test('encargado no puede introducir datos privados durante el alta',async()=>{
  const a=altaService();await a.run({...base,direccion:'privada'},'encargado');
  assert.ok(!a.queries.some(q=>q.sql.includes('rrhh_datos_alta')));
  assert.ok(!a.queries.some(q=>q.sql.includes('UPDATE users SET dni')));
});
function rutaNota(rol) {
  let handler,roles;const writes=[];
  const start=server.indexOf('app.post("/api/rrhh/trabajador/:id/nota"'),end=server.indexOf('app.delete("/api/rrhh/nota',start);
  vm.runInNewContext(server.slice(start,end),{app:{post:(_url,mw,fn)=>{roles=mw;handler=fn}},requireAuth:r=>r,sanearConversacion,hoyISO:()=>hoy,rrhhWorkerLocal:async()=>base.local,rrhhPuedeLocal:()=>true,isoConOffset:()=>hoy,dbRun:async(sql,args)=>{writes.push({sql,args});return {id:1}}});
  return {roles,writes,run:async body=>{let result;const res={status:()=>res,json:x=>{result=x}};await handler({params:{id:7},user:{rol,username:'autor-real'},body},res);return result}};
}
test('la nota usa autor autenticado y las rutas excluyen al encargado',async()=>{
  const n=rutaNota('rrhh');assert.deepEqual(Array.from(n.roles),['direccion','rrhh']);
  await n.run({contenido:'Conversación',autor:'autor-falsificado',fecha_conversacion:hoy});
  assert.ok(n.writes[0].args.includes('autor-real'));assert.ok(!n.writes[0].args.includes('autor-falsificado'));
  assert.equal(puedeVerPrivado('encargado'),false);
  assert.match(server,/const notas = puedeVerPrivado\(req.user.rol\) \? await dbAll/);
  assert.match(server,/puedeVerPrivado\(req.user.rol\) \? dbAll\(`SELECT \* FROM hr_worker_notes[\s\S]*?Promise.resolve\(\[\]\)/);
});
const cumple={id:1,nombre:'Persona Prueba',local:'Local de prueba',rol:'trabajador',activo:1,fecha_alta:'2026-01-01',fecha_nac:'2000-09-23'};
test('cumpleaños incluye solo plantilla activa y la fecha exacta',()=>{
  const lista=[cumple,{...cumple,activo:0},{...cumple,fecha_alta:'2026-10-01'},{...cumple,fecha_baja:'2026-09-22'},{...cumple,rol:'marketing'},{...cumple,fecha_nac:'2000-09-24'}];
  assert.equal(cumpleanosHoy(lista,hoy).length,1);
});
function sistemaCumple() {
  const libro=new Map(),mensajes=[];let online=true;let falla=false;
  const deps={ahora:Date.parse('2026-09-23T07:00:00Z'),config:{...CUMPLE_CONFIG,activo:true},conectado:()=>online,personas:async()=>[cumple],reservar:async d=>{if(libro.has(d))return false;libro.set(d,'enviando');return true},enviar:async(t,m)=>{if(falla)throw Error('error');mensajes.push({t,m})},terminar:async(d,e)=>libro.set(d,e)};
  return {deps,libro,mensajes,online:v=>online=v,falla:()=>falla=true};
}
test('aviso apagado por defecto y respeta las 09:00 de Madrid',async()=>{
  assert.equal(CUMPLE_CONFIG.activo,false);const s=sistemaCumple();
  assert.equal(await avisarCumpleanos({...s.deps,ahora:Date.parse('2026-09-23T06:59:00Z')}),'temprano');
  assert.equal(await avisarCumpleanos(s.deps),'enviado');assert.equal(s.mensajes.length,1);
  assert.equal(s.mensajes[0].t,'34622065974');assert.match(s.mensajes[0].m,/Persona Prueba de Local de prueba/);
});
test('WhatsApp desconectado no consume el aviso; reconectar lo entrega una sola vez',async()=>{
  const s=sistemaCumple();s.online(false);await avisarCumpleanos(s.deps);assert.equal(s.libro.size,0);
  s.online(true);await Promise.all([avisarCumpleanos(s.deps),avisarCumpleanos(s.deps)]);
  await avisarCumpleanos(s.deps);assert.equal(s.mensajes.length,1);
});
test('fallo de entrega incierto queda visible y no duplica al reiniciar',async()=>{
  const s=sistemaCumple();s.falla();assert.equal(await avisarCumpleanos(s.deps),'revisar');
  assert.equal(s.libro.get(hoy),'revisar');assert.equal(await avisarCumpleanos(s.deps),'ya_reservado');
});
test('editar datos guarda campos nuevos sin sobrescribir otros y revierte si falla la segunda escritura',async()=>{
  async function ejecutar(fallo=false,rol='rrhh'){
    let handler;const writes=[];
    const start=server.indexOf('app.put("/api/rrhh/trabajador/:id",');
    const end=server.indexOf('app.get("/api/rrhh/trabajador/:id/documentos"',start);
    const client={query:async(sql,args)=>{writes.push({sql,args});if(fallo&&sql.startsWith('UPDATE rrhh_datos_alta'))throw Error('Fallo simulado')},release:()=>{}};
    const env={app:{put:(_u,_m,fn)=>handler=fn},requireAuth:()=>null,RRHH_ROLES:[],dbGet:async()=>({id:7,local:base.local}),rrhhPuedeLocal:()=>true,sanearDatosAlta,hoyISO:()=>hoy,esEncargado:()=>rol==='encargado',HR_CAMPOS_ENC:['email'],HR_CAMPOS_DIR:['email','dni'],CAMPOS_PRIVADOS,puedeVerPrivado,toPositional:x=>x,pool:{connect:async()=>client},invalidarInternos:()=>{}};
    vm.runInNewContext(server.slice(start,end),env);
    let status=200;const res={status:n=>{status=n;return res},json:()=>{}};
    await handler({params:{id:7},user:{rol},body:{email:'nuevo@example.org',direccion:'Dirección nueva'}},res);
    return {writes,status};
  }
  const bien=await ejecutar();assert.equal(bien.status,200);
  assert.ok(bien.writes.some(x=>x.sql==='COMMIT'));
  assert.ok(bien.writes.some(x=>x.sql.includes('SET direccion = ? WHERE worker_id = ?')));
  const mal=await ejecutar(true);assert.equal(mal.status,500);assert.ok(mal.writes.some(x=>x.sql==='ROLLBACK'));assert.ok(!mal.writes.some(x=>x.sql==='COMMIT'));
  const enc=await ejecutar(false,'encargado');assert.ok(!enc.writes.some(x=>x.sql.includes('rrhh_datos_alta')));
});
