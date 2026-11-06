import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avisosIdentidad} from '../../src/modules/facturas/identidad-documento.js';
import {prepararContraste} from '../../src/modules/facturas/contraste-dirigido.js';
import {leerDocumentoVerificado} from '../../facturas.js';
const grau={proveedor:'Vins i Licors Grau SA',nif_proveedor:'B12345674',tipo:'factura',fecha:'2026-09-03',fecha_texto:'03/09/2026',numero_factura:'330033',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121};
const memoria=[{proveedor:'Transgourmet Ibérica SAU',nif:'B12345674',autor:'Contabilidad'}];
test('un alias contaminado no cambia GRAU a Transgourmet aunque coincidan los NIF',()=>{
 const r=prepararContraste([grau,grau],memoria);
 assert.equal(r.lecturas[0].proveedor,grau.proveedor);assert.equal(r.lecturas[1].proveedor,grau.proveedor);
 assert.ok(avisosIdentidad(grau,memoria).some(a=>a.campo==='proveedor'));
});
test('tres lecturas iguales no ocultan el conflicto con memoria',async()=>{
 await assert.rejects(leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{leer:async()=>structuredClone(grau),dbAll:async sql=>sql.includes('facturas_proveedor_alias')?memoria:[]}),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.texto.includes('memoria')));
});
test('el repaso puede leer originales sin usar asociaciones históricas',async()=>{
 const r=await leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{usarMemoria:false,leer:async()=>structuredClone(grau),dbAll:async sql=>{assert.ok(!sql.includes('alias'));return [];}});
 assert.equal(r.proveedor,grau.proveedor);
});
test('NIF del destinatario, evidencia ausente o contradictoria exige revisión',()=>{
 for(const datos of [{...grau,nif_receptor:grau.nif_proveedor},{...grau,_exigirEvidenciaEmisor:true},{...grau,_exigirEvidenciaEmisor:true,evidencia_emisor:{nombre_literal:grau.proveedor,nif_literal:grau.nif_proveedor,ubicacion_nif:'recuadro cliente'}}]) assert.ok(avisosIdentidad(datos).length);
 const d={...grau,_exigirEvidenciaEmisor:true,evidencia_emisor:{nombre_literal:'Vins i Licors Grau S.A.',nif_literal:grau.nif_proveedor,ubicacion_nif:'texto vertical del margen izquierdo'}};
 assert.deepEqual(avisosIdentidad(d),[]);
});
test('no se aprende el CIF de nuestra empresa como proveedor',async()=>{
 const {recordarProveedorRevision}=await import('../../src/modules/facturas/aprendizaje-revision.js');
 let escrituras=0;
 const q=async sql=>{if(sql.startsWith('INSERT'))escrituras++;return {rows:sql==='SELECT cif FROM facturas_locales'?[{cif:'B12345674'}]:[]};};
 assert.equal(await recordarProveedorRevision(q,{proveedor:'Proveedor mal leído',nif:'B12345674'},'Contabilidad'),false);
 assert.equal(escrituras,0);
});
