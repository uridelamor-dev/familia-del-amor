import {test} from 'node:test';
import assert from 'node:assert/strict';
import {centimos,fechaBanco,leerCSV,normalizarExtracto,propuestas} from '../src/modules/bancos/importacion.js';
const mapa={fecha:0,concepto:1,importe:2,saldo:3,referencia:4,separador:';',decimal:',',formatoFecha:'dmy'};
test('CSV europeo: céntimos exactos, comillas, saltos, BOM y rechazos',()=>{
 assert.equal(centimos('-1.234,56'),-123456);assert.equal(centimos('(10,50)'),-1050);assert.equal(centimos('1,234.56','.'),123456);
 assert.throws(()=>centimos('12,345'));assert.throws(()=>centimos('12x'));assert.throws(()=>centimos('1,23.4'));
 assert.equal(fechaBanco('29/02/2024'),'2024-02-29');assert.throws(()=>fechaBanco('29/02/2025'));
 assert.deepEqual(leerCSV('\uFEFFa;b\r\n"un;texto";"dos\nlineas"'),[['a','b'],['un;texto','dos\nlineas']]);
 assert.throws(()=>leerCSV('a;"sin cerrar'));
});
test('importación conserva operaciones iguales, detecta errores y cargos separados',()=>{
 const texto='Fecha;Concepto;Importe;Saldo;Ref\n01/10/2026;Proveedor;-10,50;100,00;A\n01/10/2026;Proveedor;-10,50;100,00;A';
 const r=normalizarExtracto(texto,mapa);assert.equal(r.errores.length,0);assert.equal(r.movimientos.length,2);assert.notEqual(r.movimientos[0].huella,r.movimientos[1].huella);assert.equal(r.repetidos,2);
 assert.deepEqual(normalizarExtracto(texto,mapa).movimientos,r.movimientos);
 assert.equal(normalizarExtracto('Fecha;Concepto;Importe;Saldo;Ref\n31/02/2026;X;3,00;;',mapa).errores.length,1);
 const sep=normalizarExtracto('Fecha;Concepto;Debe;Haber\n01/10/2026;Prueba;15,00;\n02/10/2026;Abono;;20,00',{fecha:0,concepto:1,cargo:2,abono:3,separador:';'});
 assert.deepEqual(sep.movimientos.map(m=>m.importe),[-1500,2000]);
});
test('propuestas nunca cruzan empresas, albaranes ni dudosas y no inventan coincidencias',()=>{
 const m={empresa:'Empresa A',importe:-1500,concepto:'Pago FAC-1001 Proveedor'};
 const f={id:1,empresa:'Empresa A',total:15,numero_factura:'FAC-1001'};
 assert.equal(propuestas(m,[f])[0].puntuacion,3);
 for(const extra of [{empresa:'Empresa B'},{total:15.01},{tipo:'albaran'},{dup_estado:'duda'},{dup_de:8}])assert.equal(propuestas(m,[{...f,...extra}]).length,0);
 assert.equal(propuestas({...m,importe:1500},[f]).length,0);
});

import {moduloDeRuta,modulosEfectivos} from '../src/modules/usuarios/permisos.js';
test('bancos respeta la restricción por módulo',()=>{assert.equal(moduloDeRuta('/api/bancos/confirmar'),'bancos');assert.equal(modulosEfectivos('marketing',null).includes('bancos'),false);assert.equal(modulosEfectivos('contabilidad',['facturas']).includes('bancos'),false);});
