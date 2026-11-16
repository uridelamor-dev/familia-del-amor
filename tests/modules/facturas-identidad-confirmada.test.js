import test from 'node:test';
import assert from 'node:assert/strict';
import {nifsConfirmados} from '../../src/modules/facturas/identidad-confirmada.js';
import {contraHistorial} from '../../src/modules/facturas/coherencia.js';
import {nifConocido} from '../../src/modules/facturas/nif-conocido.js';
import {recordarProveedorRevision} from '../../src/modules/facturas/aprendizaje-revision.js';
import {repasarLote} from '../../src/modules/facturas/repaso.js';
const nombre='SERHS Distribució i Logística, S.L.',bueno='B08485005',otro='B12345674';
const ficha={clave:'revision-nif-confirmado-'+bueno,proveedor:nombre,nif:bueno,autor:'contabilidad'};
test('SERHS: identidad humana prevalece sobre cuarenta lecturas OCR erróneas',()=>{
 const confirmados=nifsConfirmados(nombre,[ficha]);assert.deepEqual(confirmados,[bueno]);
 const historial={nifs:Array(40).fill('B07899136'),nifsConfirmados:confirmados};
 assert.deepEqual(contraHistorial({nif:bueno},historial),[]);
 const avisos=contraHistorial({nif:'B07899136'},historial);assert.equal(avisos.length,1);assert.match(avisos[0].texto,/confirmada manualmente/);assert.match(avisos[0].texto,/no se ha sustituido/);
});
test('sin evidencia manual no se autocompleta ni convierte frecuencia en certeza',()=>{
 const datos={proveedor:nombre};
 assert.equal(nifConocido(datos,[],Array(40).fill({nif:bueno})),null);
 assert.equal(nifConocido(datos,[{...ficha,autor:null}]),null);
 assert.equal(nifConocido(datos,[{...ficha,clave:'revision-nif-'+bueno}]),null);
 const avisos=contraHistorial({nif:bueno},{nifs:['B07899136','B07899136']});
 assert.match(avisos[0].texto,/puede contener errores/);assert.doesNotMatch(avisos[0].texto,/siempre|no cambia/);
});
test('homónimos con dos CIF humanos no se fusionan ni se elige uno por frecuencia',()=>{
 const fichas=[ficha,{...ficha,nif:otro,clave:'revision-nif-confirmado-'+otro}];
 assert.equal(nifConocido({proveedor:nombre},fichas),null);
 assert.equal(nifConocido({proveedor:nombre,nif_proveedor:'B07899136'},[ficha]),null);
 assert.equal(nifConocido({proveedor:nombre+' 2'},[ficha]),null);
 assert.deepEqual(contraHistorial({nif:bueno},{nifsConfirmados:[bueno,otro]}),[]);
});
test('aprendizaje conserva alias existentes: no reescribe otras identidades',async()=>{
 const writes=[];const q=async(sql,p)=>{if(sql.startsWith('INSERT'))writes.push([sql,p]);return {rows:[]};};
 await recordarProveedorRevision(q,{proveedor:nombre,nif:bueno},'contabilidad');
 assert.equal(writes.length,1);assert.equal(writes[0][1][0],'revision-nif-confirmado-'+bueno);assert.match(writes[0][0],/ON CONFLICT\(clave\) DO NOTHING/);
});
test('repaso también usa identidad confirmada al reconstruir avisos antiguos',()=>{
 const rows=[1,2,3].map(id=>({id,proveedor:nombre,nif:id===3?bueno:'B07899136',fecha:'2026-11-0'+id,numero_factura:String(id),tipo:'factura',local:'Blanes',base_imponible:100,cuota_iva:10,porcentaje_iva:10,total:110,nifs_confirmados:[bueno]}));
 const plan=repasarLote(rows,{hoy:'2026-11-16'});
 assert.ok(!plan.revisiones.some(r=>r.id===3 && r.textos.some(t=>/NIF/.test(t))));
});
