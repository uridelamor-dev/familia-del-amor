import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {criterioFechaCompras,DIA_RECEPCION_SQL} from '../../src/modules/facturas/fecha-listado.js';
const server=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
test('solo acepta factura o recepción, sin interpolar el criterio del cliente',()=>{
 assert.equal(criterioFechaCompras().campo,'fecha');
 assert.equal(criterioFechaCompras({fecha_tipo:'recepcion'}).campo,DIA_RECEPCION_SQL);
 assert.equal(criterioFechaCompras({fecha_tipo:'DROP TABLE'}).campo,'fecha');
 assert.match(DIA_RECEPCION_SQL,/Europe\/Madrid/);
});
test('el periodo usa la recepción y mantiene el resto del ámbito y los parámetros',()=>{
 const ctx=vm.createContext({criterioFechaCompras,SIN_DUDAS:"dup_estado <> 'duda'"});
 vm.runInContext(server.slice(server.indexOf('function facturasWhere('),server.indexOf('async function facturasQueryCategorias')),ctx);
 const filtro={local:'Girona',from:'2026-11-01',to:'2026-11-04'};
 const normal=ctx.facturasWhere(filtro),recibidos=ctx.facturasWhere({...filtro,fecha_tipo:'recepcion'});
 assert.match(normal.where,/fecha >= \?/);assert.ok(recibidos.where.includes(DIA_RECEPCION_SQL+' >= ?'));
 assert.ok(recibidos.where.includes(DIA_RECEPCION_SQL+' <= ?'));
 assert.deepEqual(Array.from(recibidos.params),['Girona','2026-11-01','2026-11-04']);
});
test('la cabecera alterna sin añadir selector y distingue registro de recepción',()=>{
 const app=readFileSync(new URL('../../public/panel/app.js',import.meta.url),'utf8');
 let refrescos=0;const ctx=vm.createContext({FACF:{fecha_tipo:'factura'},FAC_SEL:new Set([1]),facRefresh:()=>refrescos++,esc:String,fechaMini:x=>x});
 vm.runInContext(app.slice(app.indexOf('function facFechaPrincipal('),app.indexOf('function facTablaHtml(')),ctx);
 const f={fecha:'2026-10-28',fecha_recepcion:'2026-11-04',recepcion_confirmada:false};
 assert.equal(ctx.facFechaPrincipal(f),'2026-10-28');assert.match(ctx.facFechaCelda(f),/Registro: 2026-11-04/);
 ctx.facAlternarFecha();assert.equal(ctx.facFechaPrincipal(f),'2026-11-04');assert.match(ctx.facFechaCelda(f),/Factura: 2026-10-28/);assert.equal(ctx.FAC_SEL.size,0);
 ctx.facAlternarFecha();assert.equal(ctx.facFechaPrincipal(f),'2026-10-28');assert.equal(refrescos,2);
});
