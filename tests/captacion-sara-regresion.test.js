import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { identidadConversacion, contextoCampanas, construirContexto, anteponerCitado } from '../src/modules/messaging/contexto.js';
import { idiomaSugerido, lineaIdioma, pistaIdioma, respuestaCortesia, pulirCatalan } from '../src/modules/messaging/sara.js';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const wa = readFileSync(new URL('../whatsapp.js', import.meta.url), 'utf8');

// Ejecutar la ruta real, sustituyendo únicamente base y transporte. No toca producción.
function formulario(tieneWhatsApp) {
  let handler;
  const datos = { leads: [], consentimientos: [], cola: [], qr: null };
  const f = { clave: 'campana-prueba', version: 2, estado: 'publicado', idioma: 'ca', exige_whatsapp: true,
    campos: [], mensaje_wa: 'Invitació {enlace}' };
  const get = async (sql, args) => {
    if (sql.includes('pg_advisory')) return {};
    if (sql.includes('FROM fid_formularios')) return f;
    if (sql.includes('FROM fid_consentimientos')) return datos.consentimientos[0];
    if (sql.includes('FROM leads')) return datos.leads[0];
    if (sql.includes('FROM pro_qr')) return datos.qr;
    if (sql.includes('FROM fid_bajas')) return { n: 0 };
    if (sql.includes('FROM cap_cola')) return datos.cola.find(x => x.token === args[0]);
    throw new Error('Lectura no simulada: '+sql);
  };
  const run = async (sql, args) => {
    if (sql.includes('INSERT INTO leads')) { const l={ id:1, nombre:args[0] }; datos.leads.push(l); return l; }
    if (sql.includes('UPDATE leads') || sql.includes('INSERT INTO marketing_prefs')) return {};
    if (sql.includes('INSERT INTO fid_consentimientos')) { datos.consentimientos.push({id:datos.consentimientos.length+1}); return {}; }
    if (sql.includes('INSERT INTO cap_cola')) {
      if (datos.cola.some(x=>x.token===args[0])) return null;
      const fila={id:1, token:args[0], estado:'pendiente'}; datos.cola.push(fila); return fila;
    }
    throw new Error('Escritura no simulada: '+sql);
  };
  const env = { app:{post:(_url,fn)=>{handler=fn;}}, console,
    dbGet:get, fidTransaccion:fn=>fn({get,run}), pulsoRateLimit:()=>true,
    fidEnMadrid:()=>({fecha:'2026-09-23'}), isoConOffset:()=> '2026-09-23T10:00:00+02:00', hoyISO:()=> '2026-09-23',
    fidFormAbierto:()=>({ok:true}), fidCampos:x=>x, fidLeerLista:x=>x,
    proTel9:x=>x, fidTexto:x=>String(x||''), FID_LARGOS:{nombre:80},
    fidMensajes:()=>({sin_whatsapp:'sin whatsapp',whatsapp_caido:'canal caído',pendiente_envio:'pendent',ya_registrado:'gràcies'}),
    fidLimiteWA:()=>true, numeroTieneWhatsApp:async()=>{if(tieneWhatsApp instanceof Error) throw tieneWhatsApp;return tieneWhatsApp;},
    POLITICA_VERSION:2,fidPoliticaUrl:()=>'/privacitat.html', MATCH_TEL9:()=> 'telefono = ?',
    proEmitir:async()=>{datos.qr={id:1,token:'prueba',clase:'carnet'};return datos.qr;},
    fidComponerMensaje:x=>x, fidRender:x=>x, proEnlace:()=>'/cupon.html?t=prueba',FID_TIPO_MENSAJE:{ENTREGA:'entrega'},
    capVaciarCola:async()=>{},ficAuditar:async()=>{},lineaErrorSql:(_m,e)=>e.message,FID_MENSAJES_DEF:{error:'error'} };
  const start=server.indexOf('app.post("/api/publico/formulario/:clave"');
  vm.runInNewContext(server.slice(start,server.indexOf('// ── DARSE DE BAJA',start)),env);
  return {datos, enviar:async()=>{const result={status:200};const res={set:()=>{},status:n=>{result.status=n;return res;},json:b=>{result.body=b;}};
    await handler({params:{clave:f.clave},body:{nombre:'Cliente de prueba',telefono:'600000001',consentimiento:true}},res);return result;}};
}

for (const estado of [null, new Error('sin conexión'), true]) {
  test(`el formulario guarda el alta y entrega pendiente con WhatsApp ${String(estado)}`, async()=>{
    const f=formulario(estado);const r=await f.enviar();
    assert.equal(r.status,200);assert.equal(r.body.evento_lead,true);
    assert.equal(f.datos.leads.length,1);assert.equal(f.datos.cola.length,1);
    assert.equal(r.body.envio.estado,'pendiente_envio');
    const repetida=await f.enviar();assert.equal(repetida.body.evento_lead,false);
    assert.equal(f.datos.leads.length,1);assert.equal(f.datos.cola.length,1);
  });
}
test('un número confirmado sin WhatsApp no recibe un código ni crea un falso lead',async()=>{
  const f=formulario(false);assert.equal((await f.enviar()).status,400);
  assert.equal(f.datos.leads.length,0);assert.equal(f.datos.cola.length,0);
});
test('la identidad no convierte un LID ni un teléfono extranjero en otro cliente español',()=>{
  assert.equal(identidadConversacion('123456789012@lid',null).telefono,null);
  assert.equal(identidadConversacion('123@lid','34600000001').nacional,'600000001');
  assert.equal(identidadConversacion(null,'33600000001').nacional,'33600000001');
});
test('el contexto contiene la entrega y su local, sin inventar fecha ni condiciones',()=>{
  const c=contextoCampanas([{campana:'prueba',texto:'Vine el dia 1',enviado_en:'2026-09-23',donde:'Local de prueba',idioma:'ca'}]);
  assert.ok(c.texto.includes('Local de prueba'));assert.ok(c.texto.includes('Vine el dia 1'));
  assert.equal(c.idioma,'ca');assert.equal(contextoCampanas([]),null);
});
test('agradecer una invitación no dispara presentación ni ofrecimiento de reserva',()=>{
  const p=idiomaSugerido({mensajesCliente:['Gràcies!'],idiomaContacto:'es'});
  assert.equal(p.idioma,'ca');assert.equal(respuestaCortesia('Gràcies!',p.idioma,true),'De res! T’hi esperem 😊');
  assert.equal(respuestaCortesia('Moltes gràcies. Quin horari feu?', 'ca',true),null);
  assert.equal(respuestaCortesia('Gracias', 'es',false),null);
});
test('se corrigen las interferencias de las capturas solo en catalán',()=>{
  assert.equal(pulirCatalan('Dime si necesites algo en què puga ajudar-te. ¿Vols venir?', 'ca'),
    'Digues-me si necessites alguna cosa en què pugui ajudar-te. Vols venir?');
  assert.equal(pulirCatalan('Dime algo', 'es'),'Dime algo');
});

test('Sara recarga el historial con teléfono resuelto aunque la sesión ya esté abierta',async()=>{
  let consultado;let peticion;
  const entrega=contextoCampanas([{campana:'prueba',texto:'Invitació a esmorzar',donde:'Local de Girona',idioma:'ca'}]);
  const historial=construirContexto([{tipo:'saliente',origen:'campana',respuesta:'Invitació a esmorzar'}]);
  const env={console,perfilLoader:async()=>null,resolverTelefono:async()=> '34600000001',
    campanaLoader:async()=>entrega,reservaLoader:null, conversaciones:new Map([['123@lid',[]]]),
    historialLoader:async(...args)=>{consultado=args;return historial;},SESION_TTL_SEG:14400,MAX_HISTORIAL:10,
    getContextoFechaHora:()=> '2026-09-23',idiomaSugerido,lineaIdioma,pistaIdioma,respuestaCortesia,pulirCatalan,
    onActualizarPerfil:null,saraConfigLoader:null,SYSTEM_PROMPT:'Prompt de prueba',buildPerfilContext:()=>'',
    ctxAnteponerCitado:anteponerCitado,TOOLS:[],getAnthropic:()=>({messages:{create:async args=>{
      peticion=args;return {content:[{type:'text',text:'La invitación es para el local de Girona.'}],stop_reason:'end_turn'};
    }}})};
  const a=wa.indexOf('async function responderConIA('),b=wa.indexOf('// Ejecuta una herramienta',a);
  vm.runInNewContext(wa.slice(a,b),env);
  await env.responderConIA('123@lid','¿Dónde es la invitación?',null,null);
  assert.deepEqual(consultado,['123@lid','34600000001']);
  const texto=JSON.stringify(peticion.messages);
  assert.ok(texto.includes('Local de Girona'));assert.ok(texto.includes('Invitació a esmorzar'));
  assert.ok(!texto.includes('Es el primer mensaje de este cliente'));
});

test('la cola espera si sigue sin poder validar y solo envía al reconectar', async()=>{
  const inicio=server.indexOf('        if (waTipoPorToken(fila.token) === "entrega")');
  const fin=server.indexOf('        await sendMensajeLibre(fila.telefono',inicio);
  const guardia=server.slice(inicio,fin);
  for(const tiene of [null,false,true]) {
    let enviados=0, pendientes=0;
    const env={waTipoPorToken:()=> 'entrega',numeroTieneWhatsApp:async()=>tiene,
      dbRun:async()=>{pendientes++;},enviar:()=>{enviados++;}};
    vm.runInNewContext(`async function ejecutar(){for(const fila of [{token:'alta:prueba',telefono:'600000001',id:1}]){${guardia} enviar();}}`,env);
    if(tiene===false) await assert.rejects(env.ejecutar(),/no tiene WhatsApp/);
    else await env.ejecutar();
    assert.equal(enviados,tiene===true?1:0);assert.equal(pendientes,tiene===null?1:0);
  }
});
