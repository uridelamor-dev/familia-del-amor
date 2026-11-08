import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vencimientoManualValido,calcularVencimiento} from '../../src/modules/facturas/vencimiento.js';
import {planPagoEmpresa} from '../../src/modules/facturas/pago-empresa.js';
test('quitar fecha admite vacío y rechaza fechas imposibles',()=>{
 for(const v of [undefined,null,'','2026-10-06','2028-02-29'])assert.equal(vencimientoManualValido(v),true);
 for(const v of ['2026-02-29','2026-13-01','06/10/2026',false,0,{},' '])assert.equal(vencimientoManualValido(v),false);
});
test('quitar vencimiento del papel permite volver a la regla de empresa',()=>{
 const f={empresa:'Pilar Ayllón Torres',proveedor:'Agrària',tipo:'factura',fecha:'2026-10-06',vencimiento:null,vencimiento_origen:null};
 assert.equal(planPagoEmpresa(f,[],'2026-11-08').vencimiento,'2026-10-06');
});
