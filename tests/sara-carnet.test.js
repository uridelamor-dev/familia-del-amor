import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import vm from 'node:vm';
import {recuperarCarnet,telefonoCarnet,instruccionesCarnet,HERRAMIENTA_CARNET,notaClubReserva,clubEnReserva,consultarClubReserva} from '../src/modules/messaging/sara-carnet.js';
const opciones={telefono:'34600111222',base:'https://familiadelamor.org',activo:true,hoy:'2026-11-04'};
test('devuelve el carnet existente sin modificar datos ni crear otro',async()=>{
 let params;const r=await recuperarCarnet({...opciones,all:async(sql,p)=>{assert.match(sql,/SELECT token/);params=p;return [{token:'abc&123',anulado_en:null,caduca_en:null}];}});
 assert.deepEqual(params,['34600111222']);assert.equal(r.estado,'encontrado');assert.equal(r.url,'https://familiadelamor.org/tarjeta.html?t=abc%26123');assert.match(instruccionesCarnet(r),/abc%26123/);
});
test('sin carnet ofrece el alta, sin revelar token alguno',async()=>{const r=await recuperarCarnet({...opciones,all:async()=>[]});assert.equal(r.estado,'sin_carnet');assert.equal(r.url,'https://familiadelamor.org/alta.html');});
test('un fallo de lectura no se convierte en ausencia de carnet',async()=>{await assert.rejects(()=>recuperarCarnet({...opciones,all:async()=>{throw Error('db');}}));assert.match(instruccionesCarnet({estado:'error'}),/No significa que no tenga/);});
test('carnets anulados, caducados o ambiguos no revelan enlaces',async()=>{
 for(const rows of [[{token:'a',anulado_en:'2026-01-01'}],[{token:'a',caduca_en:'2026-11-03'}],[{token:'a'},{token:'b'}]]){const r=await recuperarCarnet({...opciones,all:async()=>rows});assert.equal(r.url,undefined);assert.ok(['no_vigente','ambiguo'].includes(r.estado));}
 assert.equal((await recuperarCarnet({...opciones,all:async()=>[{token:'a',caduca_en:'2026-11-04'}]})).estado,'encontrado');
});
test('identidad desconocida y servicio apagado no consultan tarjetas',async()=>{const all=async()=>assert.fail('No consultar');assert.equal((await recuperarCarnet({...opciones,telefono:null,all})).estado,'identidad_no_verificada');assert.equal((await recuperarCarnet({...opciones,activo:false,all})).estado,'no_disponible');});
test('normaliza formatos españoles sin truncar números internacionales',()=>{assert.equal(telefonoCarnet('600 111 222'),'34600111222');assert.equal(telefonoCarnet('0034600111222'),'34600111222');assert.equal(telefonoCarnet('+33600111222'),'33600111222');assert.notEqual(telefonoCarnet('+33600111222'),telefonoCarnet('600111222'));});
test('herramienta sin argumentos y resolución exclusiva del remitente de WhatsApp',()=>{
 assert.deepEqual(HERRAMIENTA_CARNET.input_schema.properties,{});assert.equal(HERRAMIENTA_CARNET.input_schema.additionalProperties,false);
 const s=fs.readFileSync(new URL('../whatsapp.js',import.meta.url),'utf8');const bloque=s.slice(s.indexOf('if (name === "consultar_mi_carnet")'),s.indexOf('if (name === "registrar_reserva")'));
 assert.match(bloque,/await resolverTelefono\(jid\)/);assert.match(bloque,/await carnetResolver\(telefono\)/);assert.doesNotMatch(bloque,/input\./);assert.match(bloque,/s\\.whatsapp\\.net\|lid/);assert.match(bloque,/catch \{ resultado = \{estado:'error'\}/);
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');assert.match(server,/setCarnetResolver\(resolverCarnetSara\)/);assert.match(server,/function resolverCarnetSara[\s\S]*return recuperarCarnet\(/);assert.match(server,/activo:TARJETA_ACTIVA/);
});

test('la nota de reserva consulta el carnet vigente sin exponer el enlace personal ni inventar un alta', async () => {
 const base = {local:'La Tapeta - Blanes', telefono:'600111222', idioma:'ca'};
 const nota = estado => notaClubReserva({...base, consultar:async()=>({estado, url:estado==='encontrado'?'https://example.test/token-privado':'https://example.test/alta.html'})});
 assert.match(await nota('encontrado'), /ensenyar la targeta/);
 assert.doesNotMatch(await nota('encontrado'), /token-privado/);
 assert.match(await nota('sin_carnet'), /de franc.*alta\.html/);
 for (const estado of ['ambiguo','no_vigente','sin_comunicaciones','no_disponible']) assert.equal(await nota(estado), '');
 assert.equal(await notaClubReserva({...base,local:'Can Mateu - Tordera', consultar:()=>assert.fail()}), '');
 assert.equal(await notaClubReserva({...base, consultar:()=>{throw Error('BD');}}), '');
});

test('la confirmación en cola espera el alta y reintenta el envío que no salió', async () => {
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const whatsapp=fs.readFileSync(new URL('../whatsapp.js',import.meta.url),'utf8');
 let hora=1000, carnet=false, socketDisponible=false, lecturas=0;
 const eliminadas=[], enviados=[];
 const reserva={reservaId:100,local:'La Tapeta - Lloret', dia:'2026-11-28', hora:'21:30', personas:2, nombre_reserva:'Prueba', idioma:'ca', clubEsperaHasta:121000};
 const filas=[{id:1,tipo:'confirmacion',destino:'600111222',reserva_json:JSON.stringify(reserva)},
  {id:2,tipo:'confirmacion',destino:'600111222',reserva_json:JSON.stringify({...reserva,reservaId:200})}];
 const env={console:{log(){},error(){}},Date:class extends Date{static now(){return hora;}},
  isReady:()=>true, clientReady:true, sock:{}, dbAll:async()=>filas.filter(r=>!eliminadas.includes(r.id)),dbRun:async(_sql,[id])=>eliminadas.push(id),
  dbGet:async(_sql,[id])=>id===100?reserva:null, formatPhone:()=> 'test', DIRECCIONES_RESERVA:{}, addSaraToHistorial(){}, onMensajeSaliente:null, notaClubReserva, clubEnReserva, consultarClubReserva,
  resolverCarnetSara:async()=>{lecturas++;return carnet?{estado:'encontrado'}:{estado:'sin_carnet',url:'https://example.test/alta.html'};},
  carnetResolver:async()=> ({estado:'encontrado'}),
  enviarDesdeAplicacion:async(_jid,{text})=>{if(!socketDisponible)throw Error('desconectado');enviados.push(text);},
 };
 const envios=whatsapp.slice(whatsapp.indexOf('function zonaConfirmacion'),whatsapp.indexOf('export async function sendNotificacionGrupo')).replaceAll('export async function','async function');
 const cola=server.slice(server.indexOf('let procesandoPendientesWA'),server.indexOf('// Manejador de errores global'));
 vm.runInNewContext(envios+cola,env);
 await env.procesarPendientesWA();
 assert.equal(lecturas,1);
 assert.deepEqual(eliminadas,[2]);
 carnet=true;hora=3000;
 await env.procesarPendientesWA();
 assert.deepEqual(eliminadas,[2]);
 socketDisponible=true;
 await env.procesarPendientesWA();
 assert.equal(enviados.length,1);
 assert.match(enviados[0], /Reserva confirmada.*\n.*Lloret[\s\S]*ensenyar la targeta/);
 assert.doesNotMatch(enviados[0], /alta\.html/);
 assert.deepEqual(eliminadas,[2,1]);
});

test('reserva web confirma ahora al socio y espera el alta solo si aún no tiene carnet', async () => {
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 let reservar, estado='encontrado'; const confirmadas=[], cola=[];
 const env={app:{post:(_ruta,fn)=>{reservar=fn;}}, Date, console:{log(){}},
  esLocalSinPublico:()=>false, disponibilidadReserva:async()=>({ok:true,horas:['20:30']}),
  dbRun:async()=>({id:8}), dbGet:async()=>null, clubEnReserva, consultarClubReserva, TARJETA_ACTIVA:true,
  resolverCarnetSara:async()=>({estado}), DIRECCIONES_RESERVA:{}, upsertLeadFromReserva(){},
  programarSeguimiento:async()=>({ok:true}), isReady:()=>true,
  guardarPendienteWA:async(...args)=>{cola.push(args);return true;}, procesarPendientesWA:async()=>{},
  sendConfirmacionCliente:async(...args)=>{confirmadas.push(args);return true;}, sendConfirmacionPendienteCliente:async()=>assert.fail(),
 };
 const a=source.indexOf('app.post("/api/reservas",'), b=source.indexOf('\n});',a);
 vm.runInNewContext(source.slice(a,b+4),env);
 const req={body:{local:'La Tapeta - Blanes',personas:2,dia:'2026-11-28',hora:'20:30',telefono:'600111222',nombre_reserva:'Prueba',esperar_alta_club:true}};
 const res={status(n){assert.fail('Estado '+n);},json(v){assert.equal(v.ok,true);}};
 await reservar(req,res);
 assert.equal(confirmadas.length,1);
 assert.equal(cola.length,0);
 estado='sin_carnet';
 await reservar(req,res);
 assert.equal(confirmadas.length,1);
 assert.equal(cola.length,1);
 assert.ok(cola[0][2].clubEsperaHasta>Date.now());
});
