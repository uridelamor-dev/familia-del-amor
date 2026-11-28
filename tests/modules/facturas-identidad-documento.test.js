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

test('una ficha fiscal coincidente permite descartar un alias distinto del mismo NIF', () => {
 const fichas=[...memoria,{proveedor:grau.proveedor,nif:grau.nif_proveedor}];
 assert.deepEqual(avisosIdentidad(grau,fichas),[]);
 assert.ok(avisosIdentidad({...grau,proveedor:'Emisor no acreditado'},fichas).some(a=>a.campo==='proveedor'));
});

test('la revisión humana señala NIF vacío, inválido y los tres NIF propios', async () => {
 const {comprobarRevisionHumana}=await import('../../facturas.js');
 for(const nif of [null,'B12345670','ESB70799135','46535781L','46533801V']){
  const avisos=await comprobarRevisionHumana({...grau,tipo:'albaran',nif_proveedor:nif});
  assert.ok(avisos.some(a=>a.campo==='nif_proveedor'),String(nif));
 }
});

test('una lectura coincidente sin NIF no se autovalida como albarán', async () => {
 const datos={...grau,tipo:'albaran',nif_proveedor:null};
 await assert.rejects(leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{
  leer:async()=>structuredClone(datos),
 }),e=>e.revisionDocumento && e.resultado.avisos.some(a=>a.campo==='nif_proveedor'));
});

test('regresión del informe #2486: acepta Guissona y bloquea el comercio colaborador como emisor', async () => {
 const {comprobarRevisionHumana}=await import('../../facturas.js');
 const nombre='Corporació Alimentària Guissona, S.A.';
 const nif='A25445131';
 const d={tipo:'ticket',titulo_documento:'Factura simplificada',proveedor:nombre,nif_proveedor:nif,
  fecha:'2026-11-13',numero_factura:'2627-T0329C03-70337',total:3.95};
 const fichas=[{proveedor:'Bassols Aguila 2019, S.L.',nif}];
 const dbAll=async sql=>sql.includes('alias')?fichas:[];
 assert.ok(!(await comprobarRevisionHumana(d,{dbAll})).some(a=>a.campo==='proveedor'||a.campo==='nif_proveedor'));
 assert.ok((await comprobarRevisionHumana({...d,proveedor:fichas[0].proveedor},{dbAll})).some(a=>a.campo==='proveedor'));
});

test('regresión del informe #2497: Virutas Branco con NIF fiscal supera memoria; otro emisor queda bloqueado', async () => {
 const {comprobarRevisionHumana}=await import('../../facturas.js');
 const d={tipo:'albaran',titulo_documento:'Albarán',proveedor:'Virutas Branco, S.L.',nif_proveedor:'B44580496',
  fecha:'2026-11-12',numero_factura:'A2026/9748',base_imponible:825,porcentaje_iva:10,cuota_iva:82.50,total:907.50};
 const dbAll=async sql=>sql.includes('alias')?[{proveedor:'Viruta Bronco',nif:d.nif_proveedor}]:[];
 assert.deepEqual(await comprobarRevisionHumana(d,{dbAll}),[]);
 assert.ok((await comprobarRevisionHumana({...d,proveedor:'Proveedor incorrecto'},{dbAll})).some(a=>a.campo==='proveedor'));
});

test('regresión del informe #2891: el título cotejado resuelve la contradicción OCR de tipo', async () => {
 const {comprobarRevisionHumana}=await import('../../facturas.js');
 const {datosRevision}=await import('../../src/modules/facturas/validacion-lectura.js');
 const original={...grau,tipo:'albaran',titulo_documento:'Factura',fecha:'2026-11-17'};
 assert.ok((await comprobarRevisionHumana(original)).some(a=>a.campo==='tipo'));
 const corregido=datosRevision(original,{titulo_documento:'ALBARÀ'});
 assert.ok(!(await comprobarRevisionHumana(corregido)).some(a=>a.campo==='tipo'));
});

test('P1 #1894: un PDF con 26168 y 26166 no se registra como una sola factura',async()=>{
 const primera={...grau,numeros_facturas_independientes:['26168']};
 const segunda={...grau,numeros_facturas_independientes:['26168','26166']};
 let lecturas=0;
 await assert.rejects(leerDocumentoVerificado(Buffer.from('x'),'application/pdf',{
  leer:async()=>structuredClone(lecturas++===0?primera:segunda),
 }),e=>e.revisionDocumento && e.resultado.avisos.some(a=>a.codigo==='varias_facturas'));
 assert.equal(lecturas,2);
});
