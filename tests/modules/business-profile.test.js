import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteBusinessProfile, esNombreResena } from '../../src/modules/reviews/business-profile.js';
import { mapManageRow } from '../../src/modules/reviews/reviews.service.js';
const name = 'accounts/123/locations/456/reviews/Ab_c-1';
function fake(pages) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({url, options});
    assert.ok(pages.length, 'No se esperan más peticiones');
    const data = pages.shift();
    return { ok: !data.error, status: data.error ? 403 : 200, json: async () => data };
  }};
}
test('lee todas las páginas de cuentas y locales sin publicar', async () => {
  const f = fake([{accounts:[{name:'accounts/1'}],nextPageToken:'a'}, {accounts:[{name:'accounts/2'}]}, {locations:[{name:'locations/3'}],nextPageToken:'b'}, {locations:[{name:'locations/4'}]}, {locations:[]}]);
  const api = clienteBusinessProfile({token:'test',fetchImpl:f.fetchImpl});
  const r = await api.ubicaciones();
  assert.equal(r.accounts,2); assert.equal(r.locations.length,2);
  assert.equal(r.locations[1].account,'accounts/1');
  assert.match(f.calls[1].url,/pageToken=a/); assert.match(f.calls[3].url,/pageToken=b/);
  assert.ok(f.calls.every(c=>!c.options.method));
});
test('lee reseñas v4, pagina y construye el nombre completo', async () => {
  const f = fake([{reviews:[{reviewId:'Ab_c-1'}],nextPageToken:'next'}, {reviews:[{reviewId:'two',reviewReply:{comment:'Gracias'}}]}]);
  const r = await clienteBusinessProfile({token:'test',fetchImpl:f.fetchImpl}).resenas({account:'accounts/123',name:'locations/456'});
  assert.equal(r[0].name,name); assert.equal(r.length,2);
  assert.match(f.calls[0].url,/mybusiness.googleapis.com\/v4\/accounts\/123\/locations\/456\/reviews/);
});
test('no convierte errores de acceso ni páginas repetidas en un éxito vacío', async () => {
  for (const pages of [[{error:{message:'denied'}}],[{accounts:[],nextPageToken:'x'},{accounts:[],nextPageToken:'x'}]]) {
    const f = fake(pages);
    await assert.rejects(clienteBusinessProfile({token:'test',fetchImpl:f.fetchImpl}).ubicaciones());
  }
});
test('publica una vez y exige que Google confirme el texto', async () => {
  const f = fake([{comment:'Gracias',updateTime:'2026-10-13T12:00:00Z'}]);
  const r=await clienteBusinessProfile({token:'test',fetchImpl:f.fetchImpl}).publicar(name,' Gracias ');
  assert.equal(r.comment,'Gracias'); assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].options.method,'PUT'); assert.equal(JSON.parse(f.calls[0].options.body).comment,'Gracias');
  for (const data of [{}, {comment:'Otro',updateTime:'today'}, {error:{}}]) {
    const x=fake([data]); await assert.rejects(clienteBusinessProfile({token:'test',fetchImpl:x.fetchImpl}).publicar(name,'Gracias'));
    assert.equal(x.calls.length,1);
  }
});
test('rechaza nombres inseguros, Places y texto inválido antes de enviar', async () => {
  const f=fake([]); const api=clienteBusinessProfile({token:'test',fetchImpl:f.fetchImpl});
  for (const n of ['places_123','accounts/../locations/1/reviews/a',name+'?x=1',name+'%2Fother']) {
    assert.equal(esNombreResena(n),false); await assert.rejects(api.publicar(n,'Gracias'));
  }
  for(const text of ['', ' ', 'a'.repeat(4097),null]) await assert.rejects(api.publicar(name,text));
  assert.equal(f.calls.length,0);
});
test('distingue borrador y respuesta pública sin atribuir publicación al borrador', () => {
  const r=mapManageRow({reply:'Mi borrador',google_reply:'Respuesta anterior',origen:'business_profile',google_name:name});
  assert.equal(r.reply,'Mi borrador'); assert.equal(r.google_reply,'Respuesta anterior'); assert.equal(r.publicada,true); assert.equal(r.puede_publicar,true);
  assert.equal(mapManageRow({reply:'Borrador'}).publicada,false);
  assert.equal(mapManageRow({google_reply:'Ya respondida'}).respondida,true);
  assert.equal(mapManageRow({origen:'places',google_name:name}).puede_publicar,false);
});
test('informe lee nota global oficial y todas las páginas, sin inferirla de la muestra',async()=>{
 const f=fake([{averageRating:4.3,totalReviewCount:2},{reviews:[{reviewId:'a'}],nextPageToken:'b'},{reviews:[{reviewId:'b'}]}]);
 const data=await clienteBusinessProfile({token:'test',fetchImpl:f.fetchImpl}).informe({account:'accounts/1',name:'locations/2'});
 assert.equal(data.average,4.3);assert.equal(data.total,2);assert.equal(data.rows.length,2);
 const empty=fake([{totalReviewCount:0},{reviews:[]}]);
 assert.equal((await clienteBusinessProfile({token:'test',fetchImpl:empty.fetchImpl}).informe({account:'accounts/1',name:'locations/2'})).average,null);
});
