import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizarLineas,validarSuma} from '../../src/modules/facturas/lineas.js';
import {controlesLectura} from '../../src/modules/facturas/validacion-lectura.js';
import {revisarFacturas} from '../../src/modules/facturas/calidad.js';
import {valorarAlbaran,referenciasAlbaran} from '../../src/modules/facturas/albaranes.js';
import {decisionAvisos,avisosAceptados} from '../../src/modules/facturas/avisos-memoria.js';
const f={id:8,tipo:'albaran',proveedor:'Prueba',fecha:'2026-10-28',local:'Girona',empresa:'Empresa',nif:'12345678Z',total:null,base_imponible:null};
test('albarán legible sin precios no genera incidencias monetarias ni convierte ausencia en cero',()=>{
 const lineas=normalizarLineas([{descripcion:'Aceite 1L',cantidad:2,unidad:'l'}],'albaran');
 assert.equal(lineas[0].importe,null);assert.equal(lineas[0].precio_unitario,null);assert.equal(lineas[0].dudosa,false);
 assert.equal(validarSuma(lineas,null,'albaran').motivo,'sin_valorar');
 assert.equal(validarSuma(lineas,null,'albaran').suma,null);
 assert.equal(validarSuma(lineas,null,'factura').cuadra,false);
 assert.deepEqual(controlesLectura({...f,total:'',campos_dudosos:['total','cuota_iva']}),[]);
 assert.deepEqual(revisarFacturas([f],'2026-10-28')[0].calidad,[]);
 assert.ok(normalizarLineas([{descripcion:'Aceite',cantidad:null}],'albaran')[0].dudosa);
});
test('el precio de referencia conserva el original y exige misma unidad y formato',()=>{
 const l={clave:'aceite-1l',cantidad:2,unidad:'l',precio_unitario:null,importe:null};
 const h=[{clave:l.clave,unidad:'kg',precio:9},{clave:l.clave,unidad:'l',factor_unidad:6,precio:30},{clave:l.clave,unidad:'litro',precio:4,fecha:'2026-10-20',factura_id:3}];
 const v=valorarAlbaran(f,[l],h)[0];assert.equal(v.precio_referencia,4);assert.equal(v.importe_referencia,8);assert.equal(v.precio_unitario,null);assert.equal(v.importe,null);assert.equal(l.precio_referencia,undefined);
 assert.equal(valorarAlbaran(f,[{...l,precio_unitario:5,importe:10}],h)[0].precio_referencia,undefined);
 assert.equal(valorarAlbaran(f,[{...l,unidad:'caja'}],h)[0].precio_referencia,undefined);
});
test('consulta solo compras confirmadas anteriores del mismo proveedor, empresa y local',async()=>{
 let sql,args;await referenciasAlbaran(async(s,p)=>{sql=s;args=p;return [];},f,[{clave:'aceite',precio_unitario:null,importe:null}]);
 assert.match(sql,/f.tipo='factura'/);assert.match(sql,/f.iva_estado='manual'/);assert.match(sql,/f.fecha<=\?/);assert.match(sql,/f.local=\?/);assert.deepEqual(args.slice(0,6),['Prueba','12345678Z','Empresa','Girona','2026-10-28',8]);
});
test('aceptar un aviso se recuerda y se reabre únicamente si cambian datos revisados',()=>{
 const decision=decisionAvisos(f,['Aviso comprobado'],'Contabilidad');
 assert.deepEqual(avisosAceptados({...f},decision),['Aviso comprobado']);
 assert.deepEqual(avisosAceptados({...f,total:20},decision),[]);
});
test('el aviso antiguo de falta de base deja de tratar el albarán como descuadrado',()=>{
 const r=revisarFacturas([{...f,lineas_estado:'descuadre',lineas_aviso:'El detalle se leyó, pero la factura no trae base imponible con la que contrastarlo.'}],'2026-10-28')[0];
 assert.equal(r.lineas_estado,'sin_valorar');assert.equal(r.lineas_aviso,null);assert.deepEqual(r.calidad,[]);
});
