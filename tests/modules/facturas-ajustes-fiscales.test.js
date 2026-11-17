import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ajustesFiscales} from '../../src/modules/facturas/ajustes-fiscales.js';
import {validarIva} from '../../src/modules/facturas/iva.js';
import {revisarFacturas} from '../../src/modules/facturas/calidad.js';
import {huellaAuditoria} from '../../src/modules/facturas/auditoria-completa.js';
import {huellaRevision} from '../../src/modules/facturas/avisos-memoria.js';
import {filasAnuales,HEADERS} from '../../src/modules/facturas/sheets-anuales.js';
const f={id:534,tipo:'factura',numero_factura:'022026-10/2606074',fecha:'2026-11-13',local:'Can Mateu - Tordera',base_imponible:150.7,cuota_iva:15.07,total:167.88,recargo_equivalencia:2.11,iva_desglose:[{base:150.7,tipo:10,cuota:15.07}],iva_estado:'manual'};
test('Joric: recargo explícito explica total sin cambiar IVA',()=>{
 assert.equal(ajustesFiscales(f),2.11);
 assert.equal(validarIva(f.iva_desglose,f).ok,true);
 assert.deepEqual(revisarFacturas([f],'2026-11-16')[0].calidad,[]);
 assert.equal(validarIva(f.iva_desglose,{...f,recargo_equivalencia:null}).ok,false);
 assert.equal(validarIva([{base:150.7,tipo:10,cuota:17.18}],{...f,cuota_iva:17.18,recargo_equivalencia:null}).ok,false);
});
test('retención, cargos y abonos conservan su signo y no toleran datos inválidos',()=>{
 const b={base_imponible:100,cuota_iva:21,total:109,retencion:15,otros_cargos:3};
 assert.equal(validarIva([{base:100,tipo:21,cuota:21}],b).ok,true);
 assert.equal(validarIva([{base:-100,tipo:21,cuota:-21}],{base_imponible:-100,cuota_iva:-21,recargo_equivalencia:-5.2,total:-126.2}).ok,true);
 for(const v of ['error',{},true,Infinity]){assert.throws(()=>ajustesFiscales({retencion:v}));assert.equal(validarIva(f.iva_desglose,{...f,retencion:v}).ok,false);}
});
test('ajustes nuevos invalidan revisión; migrar null no invalida las antiguas',()=>{
 for(const huella of [x=>huellaAuditoria(x,[]),huellaRevision]){
  const legacy={...f};delete legacy.recargo_equivalencia;
  assert.equal(huella(legacy),huella({...legacy,recargo_equivalencia:null,retencion:null,otros_cargos:null}));
  assert.equal(huella(legacy),huella({...legacy,recargo_equivalencia:0}));
  assert.notEqual(huella(legacy),huella(f));
  assert.notEqual(huella(f),huella({...legacy,retencion:2.11}));
  assert.equal(huella(f),huella({...f,recargo_equivalencia:'2.11'}));
 }
});
test('libro anual exporta recargo separado una vez sin mover columnas existentes',()=>{
 const rows=filasAnuales(f,'Pilar');assert.equal(rows.length,1);assert.equal(rows[0][8],15.07);assert.equal(rows[0][9],167.88);assert.equal(rows[0][19],2.11);assert.equal(HEADERS[19],'Recargo equivalencia (€)');
 const mixed={...f,base_imponible:200,cuota_iva:31,total:233.11,iva_desglose:[{base:100,tipo:10,cuota:10},{base:100,tipo:21,cuota:21}]};
 const m=filasAnuales(mixed,'Pilar');assert.equal(m.length,2);assert.equal(m[0][19],'');assert.equal(m[1][19],2.11);
});
test('modal acepta total con recargo y mantiene visible un descuadre real',()=>{
 const code=readFileSync(new URL('../../public/panel/app.js',import.meta.url),'utf8');
 const ctx=vm.createContext({facRevisarTxt:()=>[]});
 vm.runInContext(code.slice(code.indexOf('function facCamposRevision('),code.indexOf('function facMarcarRevision(')),ctx);
 assert.equal(ctx.facCamposRevision({...f,proveedor:'Joric',nif:'B55291504',numero_factura:'2606074',porcentaje_iva:10},true).total,undefined);
 assert.ok(ctx.facCamposRevision({...f,total:170},true).total.length);
});
test('las tres altas persisten ajustes con tantos parámetros como columnas',()=>{
 const source=readFileSync(new URL('../../facturas.js',import.meta.url),'utf8');
 const matches=[...source.matchAll(/INSERT INTO facturas(?:_pendientes)?\s*\(([^`]*?)\)\s*VALUES\s*\(([^`]*?)\)/g)];assert.equal(matches.length,3);
 for(const m of matches){assert.equal(m[1].split(',').length,m[2].split(',').length);for(const key of ['recargo_equivalencia','retencion','otros_cargos'])assert.ok(m[1].includes(key));}
});
