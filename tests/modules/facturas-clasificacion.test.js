import {test} from 'node:test';
import assert from 'node:assert/strict';
import {esAdjuntoDecorativo} from '../../src/modules/facturas/clasificacion.js';
import {crearRecepcion} from '../../src/modules/facturas/recepcion.js';
const logo={es_documento_compra:false,confianza_clasificacion:'alta',clase_adjunto:'logo',tipo:'otro',lineas:[]};
test('excluye decoración clara, conservando documentos dudosos y evidencia de compra',()=>{
 assert.equal(esAdjuntoDecorativo(logo),true);
 for(const extra of [{tipo:'factura'},{iva_desglose:[{base:100,tipo:21,cuota:21}]},{tipo:'albaran'},{tipo:'ticket'},{total:0},{numero_factura:'A1'},{lineas:[{descripcion:'producto'}]},{confianza_clasificacion:'baja'},{es_documento_compra:null},{clase_adjunto:'dudoso'}])assert.equal(esAdjuntoDecorativo({...logo,...extra}),false);
 assert.equal(esAdjuntoDecorativo({}),false);
});
test('un descarte automático termina la recepción sin reintentar ni volver a procesar',async()=>{
 let f={id:1,hash:'h',estado:'pendiente',intentos:0,proximo:0,original:Buffer.from('logo')},n=0;
 const db={get:async()=>f,run:async(sql,p)=>{
  if(sql.includes('resultado=?::jsonb')){f={...f,estado:p[0],resultado:JSON.parse(p[1]),original:null};}
 }};
 const r=crearRecepcion({db,lock:async(h,fn)=>fn(),procesar:async()=>{n++;return {descartado:true};}});
 await r.ejecutar(1);assert.equal(f.estado,'descartado');assert.equal(f.original,null);
 await r.ejecutar(1);assert.equal(n,1);
});
