import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {recuperarCarnet,telefonoCarnet,instruccionesCarnet,HERRAMIENTA_CARNET} from '../src/modules/messaging/sara-carnet.js';
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
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');assert.match(server,/setCarnetResolver\(telefono => recuperarCarnet/);assert.match(server,/activo:TARJETA_ACTIVA/);
});
