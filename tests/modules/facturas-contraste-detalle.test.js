import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compararDetalle,comprobarCobertura} from '../../src/modules/facturas/contraste-detalle.js';
import {leerDocumentoVerificado} from '../../facturas.js';
const linea={descripcion:'Mata mosquito 2W',cantidad:2,precio_unitario:17.95,importe:35.9};
const documento={tipo:'factura',proveedor:'Proveedor',nif_proveedor:'B12345674',fecha:'2026-10-28',fecha_texto:'28/10/2026',numero_factura:'123',base_imponible:35.9,cuota_iva:7.54,porcentaje_iva:21,total:43.44,lineas:[linea]};
const leer=valores=>{let i=0;return async()=>structuredClone(valores[i++]);};
test('detecta cantidad equivocada aunque el importe y la cabecera coincidan',()=>{
 assert.match(compararDetalle(documento,{...documento,lineas:[{...linea,cantidad:1}]})[0].texto,/cantidad/);
});
test('detecta productos distintos con los mismos importes y líneas omitidas',()=>{
 assert.ok(compararDetalle(documento,{...documento,lineas:[{...linea,descripcion:'Otro artículo'}]}).length);
 assert.ok(compararDetalle(documento,{...documento,lineas:[]}).length);
});
test('conserva decimales de cantidad y no acepta precio ausente',()=>{
 assert.ok(compararDetalle(documento,{...documento,lineas:[{...linea,cantidad:2.001}]}).length);
 assert.ok(compararDetalle(documento,{...documento,lineas:[{...linea,precio_unitario:null}]}).length);
 assert.deepEqual(compararDetalle(documento,{...documento,lineas:[{...linea,descripcion:'MATA MOSQUITO 2W',importe:35.91}]}),[]);
});
test('cobertura ausente o incompleta nunca valida una lectura nueva',()=>{
 for(const cobertura of [null,{documento_completo:false,paginas_leidas:1},{documento_completo:true,paginas_leidas:1,detalle:'completo'}])
 assert.ok(comprobarCobertura({_exigirCobertura:true,cobertura,lineas:[]}).length);
 assert.deepEqual(comprobarCobertura({_exigirCobertura:true,cobertura:{documento_completo:true,paginas_leidas:1,detalle:'sin_detalle',motivo_sin_detalle:'Solo resumen de cuota mensual'},lineas:[]}),[]);
});
test('albarán sin precios puede contrastarse sin inventarlos',()=>{
 const d={lineas:[{descripcion:'Pan',cantidad:5,precio_unitario:null,importe:null}]};
 assert.deepEqual(compararDetalle(d,structuredClone(d)),[]);
});
test('dos lecturas coherentes conservan evidencia y estado automático separado',async()=>{
 const d=await leerDocumentoVerificado(Buffer.from('fixture'),'image/jpeg',{leer:leer([documento,documento])});
 assert.equal(d._contraste.version,5);assert.equal(d._contraste.estado,'lectura_validada');
 assert.equal(d._revisionHumana,undefined);assert.deepEqual(d.lineas,[linea]);
});
test('una tercera cabecera sin productos no borra discrepancias de detalle',async()=>{
 const diferente={...documento,lineas:[{...linea,descripcion:'Otro artículo'}]};
 await assert.rejects(leerDocumentoVerificado(Buffer.from('fixture'),'image/jpeg',{leer:leer([documento,diferente,{...documento,lineas:[]}])}),e=>e.revisionDocumento&&e.resultado.contraste.estado==='requiere_revision');
});
test('tercera lectura corroborada resuelve sin reemplazar productos por mayoría',async()=>{
 const diferente={...documento,lineas:[{...linea,descripcion:'Otro artículo'}]};
 const d=await leerDocumentoVerificado(Buffer.from('fixture'),'image/jpeg',{leer:leer([documento,diferente,documento])});
 assert.deepEqual(d.lineas,[linea]);assert.equal(d._contraste.resueltoPorRelectura,true);
});
test('fallo técnico del historial no equivale a historial limpio',async()=>{
 await assert.rejects(leerDocumentoVerificado(Buffer.from('fixture'),'image/jpeg',{
 leer:leer([documento,documento]),dbAll:async sql=>{if(sql.includes('total::float'))throw Error('historial no disponible');return [];}
 }),/historial no disponible/);
});
test('detecta páginas o cargos diferentes',()=>{
 assert.ok(compararDetalle({...documento,cobertura:{paginas_leidas:2}}, {...documento,cobertura:{paginas_leidas:1}}).length);
 assert.ok(compararDetalle(documento,{...documento,cargos_base:[{descripcion:'Portes',importe:5,porcentaje_iva:21}]}).length);
});
