import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {vencimientoManualValido,calcularVencimiento,vencimientoFijado,origenVencimientoEditado} from '../../src/modules/facturas/vencimiento.js';
import {planPagoEmpresa,aplicarPagosEmpresa} from '../../src/modules/facturas/pago-empresa.js';
test('quitar fecha admite vacío y rechaza fechas imposibles',()=>{
 for(const v of [undefined,null,'','2026-10-06','2028-02-29'])assert.equal(vencimientoManualValido(v),true);
 for(const v of ['2026-02-29','2026-13-01','06/10/2026',false,0,{},' '])assert.equal(vencimientoManualValido(v),false);
});
test('quitar vencimiento del papel permite volver a la regla de empresa',()=>{
 const f={empresa:'Pilar Ayllón Torres',proveedor:'Agrària',tipo:'factura',fecha:'2026-10-06',vencimiento:null,vencimiento_origen:null};
 assert.equal(planPagoEmpresa(f,[],'2026-11-08').vencimiento,'2026-10-06');
});

test('la corrección manual no se presenta como leída del documento',()=>{
 const antes={vencimiento:'2026-08-15',vencimiento_origen:'factura'};
 assert.equal(origenVencimientoEditado(antes,'2026-08-20'),'manual');
 assert.equal(origenVencimientoEditado(antes,'2026-08-15'),'factura');
 assert.equal(origenVencimientoEditado(antes,undefined),'factura');
 assert.equal(origenVencimientoEditado(antes,''),null);
 assert.equal(origenVencimientoEditado(antes,null),null);
 assert.equal(calcularVencimiento({vencimientoLeido:'2026-08-20'}).origen,'factura');
});

test('las reglas de empresa conservan fecha y origen manual, sin convertirla en papel',async()=>{
 const manual={id:52,empresa:'Del Amor Uriel SLU',proveedor:'Virutas Branco',tipo:'factura',fecha:'2026-07-29',pagado:0,vencimiento:'2026-08-20',vencimiento_origen:'manual'};
 assert.equal(vencimientoFijado(manual),true);
 assert.equal(planPagoEmpresa(manual,[],'2026-08-16').pagado,0);
 let guardado;
 await aplicarPagosEmpresa({dbAll:async s=>s.includes('facturas_pago_reglas')?[]:[manual],dbRun:async(sql,args)=>{guardado={sql,args};}},'2026-08-16');
 assert.deepEqual(guardado.args.slice(0,4),['2026-08-20','manual',0,null]);
 const sinFecha={...manual,vencimiento:null,vencimiento_origen:null};
 assert.equal(vencimientoFijado(sinFecha),false);
 assert.equal(planPagoEmpresa(sinFecha,[],'2026-08-16').vencimiento,'2026-08-15');
 assert.equal(vencimientoFijado({...manual,vencimiento:'2026-02-31'}),false);
});

test('editar fecha, repasar histórico y cambiar condiciones respetan las fechas individuales',()=>{
 const server=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 assert.match(server,/prepararFecha:async\(db,f,fecha\)=>vencimientoFijado\(f\)\?null:/);
 const endpoint=server.slice(server.indexOf('app.post("/api/facturas/:id/fecha"'),server.indexOf('app.post("/api/facturas/:id/fecha"')+5000);
 assert.match(endpoint,/if \(!vencimientoFijado\(f\)\)/);
 assert.match(server,/vals.push\(origenVencimientoEditado\(antes,req.body.vencimiento\)\)/);
 assert.match(server,/COALESCE\(vencimiento_origen,''\) NOT IN \('factura','manual'\)/);
 const repaso=readFileSync(new URL('../../src/modules/facturas/repaso.js',import.meta.url),'utf8');
 assert.match(repaso,/vencimientoDelPapel:\s*f.vencimiento_origen\s*===\s*"factura"/);
});
