import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conocimientoCartas } from '../src/modules/messaging/sara-cartas-conocimiento.js';
const row=(local,url)=>({local,documento_url:`/documentos/${url}.pdf`,activo:1});
const coope=row('Cooperativa - Blanes','carta-cooperativa-tapeta-blanes');

test('Cooperativa: respuesta documentada de Compartim, mínimo y bebidas sin inventar',()=>{
 const prompt=conocimientoCartas([coope]);
 assert.match(prompt,/Compartim[^\n]*28 €\/persona/);
 assert.match(prompt,/mínimo 4 personas/);
 assert.match(prompt,/4 mini hamburguesas, jamón de bellota, surtido de quesos, croquetas, huevos rotos, pulpo a la gallega, pan y postre/);
 assert.match(prompt,/No afirmar que están incluidas ni cobradas aparte/);
 assert.match(prompt,/LOCALES AUTORIZADOS PARA ESTE CONTENIDO: Cooperativa - Blanes\n/);
 assert.doesNotMatch(prompt,/CARTA: SOLO Can Mateu/);
});
test('precios y packs de Can Mateu no heredan los de Cooperativa',()=>{
 const prompt=conocimientoCartas([row('Can Mateu - Tordera','carta-can-mateu')]);
 assert.match(prompt,/VERMUTILLO: 16,50/);assert.match(prompt,/PICOTEO: 14,50/);
 assert.doesNotMatch(prompt,/Compartim|28 €\/persona/);
});
test('desactivar, cambiar URL, local o versión del PDF retira sus datos',()=>{
 assert.equal(conocimientoCartas([{...coope,activo:0}]),'');
 assert.equal(conocimientoCartas([{...coope,documento_url:'/documentos/otra.pdf'}]),'');
 assert.equal(conocimientoCartas([{...coope,local:'La Tapa Ibérica - Tordera'}]),'');
 assert.equal(conocimientoCartas([coope],()=>null),'');
 assert.equal(conocimientoCartas([coope],()=> 'version-nueva'),'');
});
test('semanal acota días, horario, precio y suplementos',()=>{
 const prompt=conocimientoCartas([row('La Tapeta - Girona','menu-semanal-tapeta-cooperativa')]);
 assert.match(prompt,/Lunes a viernes de 13:00 a 16:00/);
 assert.match(prompt,/18,50/); assert.match(prompt,/suplemento 3/); assert.match(prompt,/suplemento 2/);
 assert.match(prompt,/No extender a fines de semana/);
 assert.equal(conocimientoCartas([row('Can Mateu - Tordera','menu-semanal-tapeta-cooperativa')]),'');
});
test('todas las cartas tienen contenido válido y hashes correspondientes',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../src/modules/messaging/cartas/catalogo.json',import.meta.url),'utf8'));
 for(const doc of catalog)for(const local of doc.locales){
  assert.ok(conocimientoCartas([{local,documento_url:doc.url}]).length>1000,local);
 }
});
test('el cargador real proporciona URL y conecta el contenido al contexto de Sara',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/SELECT id, tema, local, disparadores, respuesta, documento_url FROM sara_respuestas WHERE activo = 1/);
 assert.match(server,/const contenidoCartas = conocimientoCartas\(docs\);\s*if \(contenidoCartas\) partes.push\(contenidoCartas\)/);
});
