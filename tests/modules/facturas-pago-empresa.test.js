import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pagoPorEmpresa,planPagoEmpresa,aplicarPagosEmpresa} from '../../src/modules/facturas/pago-empresa.js';
import {estadoPago} from '../../src/modules/facturas/vencimiento.js';
import {claveProveedor} from '../../src/modules/facturas/categorias.js';
const f={id:1,empresa:'Del Amor Uriel SLU',proveedor:'Proveedor ejemplo',tipo:'factura',fecha:'2026-09-01',pagado:0};
test('todo septiembre vence el 15 octubre y diciembre pasa al año siguiente',()=>{
 for(const fecha of ['2026-09-01','2026-09-30'])assert.equal(planPagoEmpresa({...f,fecha},[],'2026-10-06').vencimiento,'2026-10-15');
 assert.equal(planPagoEmpresa({...f,fecha:'2026-12-31'},[],'2027-01-01').vencimiento,'2027-01-15');
});
test('no confirma pagos futuros; los registra el día pactado sin intervención',()=>{
 assert.equal(planPagoEmpresa(f,[],'2026-10-14').pagado,0);
 const p=planPagoEmpresa(f,[],'2026-10-15');assert.equal(p.pagado,1);assert.equal(p.fecha_pago,'2026-10-15');
 assert.match(estadoPago({...f,vencimiento:'2026-10-15',pago_automatico:1},'2026-10-06').texto,/Pago automático/);
});
test('Mateu y Pilar al contado, sin confundir Uriel persona física',()=>{
 for(const empresa of ['Mateu Del Amor Salinas','Pilar Ayllón Torres']){
 const p=planPagoEmpresa({...f,empresa},[],'2026-10-06');assert.equal(p.pagado,1);assert.equal(p.fecha_pago,f.fecha);
 }
 assert.equal(pagoPorEmpresa('Uriel Del Amor Ayllón'),null);
});
test('excepciones del proveedor y pagos manuales tienen prioridad',()=>{
 for(const empresa of ['',f.empresa])assert.equal(planPagoEmpresa(f,[{prov_clave:claveProveedor(f.proveedor),empresa}],'2026-10-06'),null);
 assert.ok(planPagoEmpresa(f,[{prov_clave:claveProveedor(f.proveedor),empresa:'Otra sociedad'}],'2026-10-06'));
 for(const extra of [{pagado:1},{pago_origen:'manual'},{tipo:'albaran'},{dup_estado:'duda'},{fecha:'2026-02-31'},{fecha:null}])assert.equal(planPagoEmpresa({...f,...extra},[],'2026-10-06'),null);
});
test('repetir el ciclo no reescribe facturas ya actualizadas',async()=>{
 let escrituras=0;
 await aplicarPagosEmpresa({dbAll:async sql=>sql.includes('facturas_pago_reglas')?[]:[{...f,pago_origen:'empresa',pago_automatico:1,vencimiento:'2026-10-15',fecha_pago:null}],dbRun:async()=>escrituras++},'2026-10-06');
 assert.equal(escrituras,0);
});
test('inicio de mes: llegada y fecha del 1 al 5 se asignan al mes anterior',()=>{
 for(let dia=1;dia<=5;dia++){
  const p=planPagoEmpresa({...f,fecha:`2026-10-0${dia}`,creado_en:`2026-10-0${dia}T10:00:00Z`},[],'2026-10-06');
  assert.equal(p.vencimiento,'2026-10-15');
 }
 assert.equal(planPagoEmpresa({...f,fecha:'2027-01-03',creado_en:'2027-01-04'},[],'2027-01-05').vencimiento,'2027-01-15');
});
test('fecha anterior, recepción tardía y periodo explícito no se confunden',()=>{
 const casos=[
  [{fecha:'2026-09-30',creado_en:'2026-10-04'},'2026-10-15'],
  [{fecha:'2026-10-03',creado_en:'2026-10-06'},'2026-11-15'],
  [{fecha:'2026-10-06',creado_en:'2026-10-06'},'2026-11-15'],
  [{fecha:'2026-10-03',creado_en:'2026-10-03',periodo_facturado:'2026-10'},'2026-11-15'],
  [{fecha:'2026-10-09',creado_en:'2026-10-09',periodo_facturado:'2026-09',periodo_origen:'manual'},'2026-10-15'],
  [{fecha:'2026-10-03'},'2026-11-15'],
 ];
 for(const [datos,vence] of casos)assert.equal(planPagoEmpresa({...f,...datos},[],'2026-10-06').vencimiento,vence);
});
test('la regla de inicio de mes no cambia el pago al contado ni excepciones',()=>{
 const datos={...f,fecha:'2026-10-03',creado_en:'2026-10-04'};
 assert.equal(planPagoEmpresa({...datos,empresa:'Pilar Ayllón'},[],'2026-10-06').vencimiento,'2026-10-03');
 assert.equal(planPagoEmpresa(datos,[{prov_clave:claveProveedor(f.proveedor),empresa:f.empresa}],'2026-10-06'),null);
});
