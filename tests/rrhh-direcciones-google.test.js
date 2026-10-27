import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrarDirecciones} from '../src/modules/rrhh/direcciones.js';
function ruta(fetcher){let handler;registrarDirecciones({get:(p,a,h)=>handler=h},{auth:()=>{},key:'clave-secreta-prueba',fetcher});return async query=>{const r={statusCode:200,set(){},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};await handler({query},r);return r;};}
const ok=j=>({ok:true,status:200,json:async()=>j});
test('Places New: sugerencias por POST, clave privada, máscara mínima y máximo cinco',async()=>{
 const h=ruta(async(url,opts)=>{
  assert.equal(url,'https://places.googleapis.com/v1/places:autocomplete');assert.equal(opts.method,'POST');
  assert.equal(opts.headers['X-Goog-Api-Key'],'clave-secreta-prueba');assert.equal(opts.headers['X-Goog-FieldMask'],'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');
  assert.deepEqual(JSON.parse(opts.body),{input:'Calle Mayor',languageCode:'es',regionCode:'ES'});assert.ok(opts.signal);
  return ok({suggestions:[{queryPrediction:{text:{text:'ignorar'}}},...Array.from({length:7},(_,i)=>({placePrediction:{placeId:'id'+i,text:{text:'Calle '+i}}}))]});
 });
 const r=await h({q:' Calle Mayor '});assert.equal(r.statusCode,200);assert.equal(r.body.data.length,5);assert.deepEqual(r.body.data[0],{id:'id0',texto:'Calle 0'});assert.ok(!JSON.stringify(r.body).includes('clave-secreta'));
});
test('Places New: seleccionar dirección devuelve CP, población y país en el contrato del formulario',async()=>{
 const h=ruta(async(url,opts)=>{
  assert.equal(url,'https://places.googleapis.com/v1/places/id%2Fcon%3Fseparadores?languageCode=es');assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);
  assert.equal(opts.headers['X-Goog-FieldMask'],'formattedAddress,addressComponents');
  return ok({formattedAddress:'Calle Mayor 1, 08001 Barcelona, España',addressComponents:[{types:['postal_code'],longText:'08001'},{types:['locality'],longText:'Barcelona'},{types:['country'],longText:'España'}]});
 });
 assert.deepEqual((await h({id:'id/con?separadores'})).body.data,{direccion:'Calle Mayor 1, 08001 Barcelona, España',codigo_postal:'08001',poblacion:'Barcelona',pais:'España'});
});
test('Places New: cero resultados no es un error y detalle vacío no borra el formulario',async()=>{
 const h=ruta(async()=>ok({}));assert.deepEqual((await h({q:'zzzzz'})).body,{ok:true,data:[]});assert.equal((await h({id:'missing'})).body.codigo,'NOT_FOUND');
});
test('Places New: identifica configuración y cuota sin revelar el mensaje privado de Google',async()=>{
 for(const codigo of ['SERVICE_DISABLED','BILLING_DISABLED','API_KEY_INVALID','API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED','RESOURCE_EXHAUSTED']){
  const h=ruta(async()=>({ok:false,status:403,json:async()=>({error:{status:'PERMISSION_DENIED',message:'clave-secreta-prueba dirección privada',details:[{reason:codigo,metadata:{consumer:'privado'}}]}})}));
  const r=await h({q:'calle'});assert.equal(r.statusCode,503);assert.equal(r.body.codigo,codigo);assert.doesNotMatch(JSON.stringify(r.body),/clave-secreta|dirección privada|consumer/);
 }
});
test('Places New: controla timeout, JSON inválido y errores de red sin filtrar datos',async()=>{
 for(const [failure,codigo] of [[Object.assign(new Error('secret'),{name:'TimeoutError'}),'TIMEOUT'],[new Error('secret'),'UNAVAILABLE']]){
  const h=ruta(async()=>{throw failure;});const r=await h({q:'calle'});assert.equal(r.body.codigo,codigo);assert.doesNotMatch(JSON.stringify(r.body),/secret/);
 }
 const r=await ruta(async()=>({ok:false,status:502,json:async()=>{throw new Error('html privado');}}))({q:'calle'});assert.equal(r.body.codigo,'UNAVAILABLE');
});
