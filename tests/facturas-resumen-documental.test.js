import test from 'node:test';
import assert from 'node:assert/strict';
import {huellaAuditoria,validarConfirmacion,cargarDistintivos,registrarAuditoriaCompleta,COMPROBACIONES,resumenDocumentalVigente} from '../src/modules/facturas/auditoria-completa.js';
import {revisarFacturas} from '../src/modules/facturas/calidad.js';
const f={id:526,tipo:'factura',proveedor:'Lácteos',nif:'A17259508',fecha:'2026-11-12',local:'Can Mateu',base_imponible:204.44,cuota_iva:8.18,recargo_equivalencia:1.02,total:213.64,drive_url:'original',file_hash:'original-1',lineas_estado:'descuadre'};
const detalle={tipo:'resumen_albaranes',confirmado_original:true,referencias:'600191757 · 10/11/2026 · 204,44 €'};
const checks=Object.fromEntries(COMPROBACIONES.map(k=>[k,true]));
const body={huella:huellaAuditoria(f,[]),comprobaciones:{...checks,detalle_documento:detalle},archivo_nombre:'Original.pdf',archivo_ruta:'Contabilidad / Pilar / Noviembre / Can Mateu'};
const audit={factura_id:526,huella:body.huella,factura:f,lineas:[],comprobaciones:body.comprobaciones,autor:'Revisor',fecha:'2026-11-17'};
async function cargar(cambio={},auditoria=audit){const row={...f,...cambio};await cargarDistintivos([row],async()=>auditoria?[{...auditoria,factura:row}]:[]);return row;}
const calidad=row=>revisarFacturas([row],'2026-11-17')[0].calidad;
test('cero líneas sin confirmación conserva aviso; auditoría ordinaria no clasifica resumen',async()=>{
 for(const a of [null,{...audit,comprobaciones:checks}]){
  const row=await cargar({},a);assert.equal(resumenDocumentalVigente(row),false);assert.ok(calidad(row).includes('Lectura pendiente de revisión'));
 }
});
test('confirmación completa válida permite ausencia legítima y deja el OCR intacto',async()=>{
 assert.doesNotThrow(()=>validarConfirmacion(body,body.huella,{f,lineas:[]}));
 const row=await cargar();assert.equal(resumenDocumentalVigente(row),true);assert.equal(row.lineas_estado,'descuadre');
 assert.deepEqual(calidad(row),[]);assert.equal(row.auditoria_completa.detalle_documento.referencias,detalle.referencias);
});
test('rechaza declaraciones incompletas, productos, cargos y documento incorrecto',()=>{
 for(const d of [{...detalle,referencias:''},{...detalle,referencias:'x'.repeat(2001)},{...detalle,confirmado_original:false},{...detalle,tipo:'sin_lineas'}])
  assert.throws(()=>validarConfirmacion({...body,comprobaciones:{...checks,detalle_documento:d}},body.huella,{f,lineas:[]}),e=>e.status===400);
 for(const contexto of [{f:{...f,tipo:'albaran'},lineas:[]},{f,lineas:[{id:1,importe:204.44}]},{f:{...f,cargos_base:[{descripcion:'Cargo',importe:1,porcentaje_iva:21}]},lineas:[]}])
  assert.throws(()=>validarConfirmacion(body,body.huella,contexto),e=>e.status===400);
 for(const k of COMPROBACIONES)assert.throws(()=>validarConfirmacion({...body,comprobaciones:{...body.comprobaciones,[k]:false}},body.huella,{f,lineas:[]}),e=>e.status===400);
 assert.throws(()=>validarConfirmacion(body,'otra-huella',{f,lineas:[]}),e=>e.status===409);
});
test('cambios de cabecera, original o líneas invalidan clasificación y restauran aviso',async()=>{
 for(const cambio of [{total:999},{concepto:'Cambió referencia'},{file_hash:'original-2'},{drive_url:'nuevo'}]){
  const row=await cargar(cambio);assert.equal(resumenDocumentalVigente(row),false);assert.ok(calidad(row).length);
 }
 const row=await cargar({}, {...audit,lineas:[{id:1,descripcion:'Producto',importe:204.44}]});assert.equal(resumenDocumentalVigente(row),false);
});
test('clasificación vigente no oculta errores técnicos ni fiscales aunque sean posteriores',async()=>{
 for(const cambio of [{lineas_estado:'error'},{iva_estado:'revisar'},{iva_estado:'error'}])assert.ok(calidad(await cargar(cambio)).length);
 // Incluso una confirmación ligada a un importe erróneo mantiene el aviso fiscal.
 const mala={...f,total:999};const row=await cargar({total:999},{...audit,huella:huellaAuditoria(mala,[])});
 assert.equal(resumenDocumentalVigente(row),true);assert.ok(calidad(row).includes('Base + IVA difiere del total: comprobar ajustes u original'));
});
test('la auditoría más reciente sin declaración o metadatos inválidos no reutiliza clasificación',async()=>{
 const previo=await cargar();
 for(const comprobaciones of [checks,{...checks,detalle_documento:{...detalle,confirmado_original:false}},'json roto']){
  const row=await cargar({auditoria_completa:previo.auditoria_completa},{...audit,comprobaciones});
  assert.equal(resumenDocumentalVigente(row),false);assert.equal(row.auditoria_completa.vigente,true);
 }
 const row=await cargar({auditoria_completa:previo.auditoria_completa},null);assert.equal(row.auditoria_completa,undefined);
});
test('POST persiste solo auditoría; reapertura conserva evidencia, permisos y concurrencia',async()=>{
 for(const caso of ['ok','sin permiso','cambió']){
  const queries=[];let post,status=200,result;
  const client={query:async(sql,args)=>{queries.push([sql,args]);return {rows:sql.startsWith('SELECT * FROM facturas WHERE')?[caso==='cambió'?{...f,total:999}:f]:[]};},release(){}};
  registrarAuditoriaCompleta({get(){},post(_p,_a,h){post=h;}},{auth(){},pool:{connect:async()=>client},puedeAccederLocal:()=>caso!=='sin permiso'});
  await post({params:{id:526},body,user:{username:'Revisor'}},{status(n){status=n;return this;},json(v){result=v;}});
  const insert=queries.find(([sql])=>sql.startsWith('INSERT INTO facturas_auditoria_completa'));
  assert.equal(status,caso==='ok'?200:caso==='sin permiso'?403:409);
  assert.equal(Boolean(insert),caso==='ok');assert.equal(queries.some(([sql])=>/INSERT INTO factura_lineas|UPDATE facturas SET/.test(sql)),false);
  if(insert){assert.equal(result.ok,true);const guardado=JSON.parse(insert[1][3]);assert.deepEqual(guardado.detalle_documento,detalle);assert.equal(resumenDocumentalVigente(await cargar({}, {...audit,comprobaciones:guardado})),true);}
 }
});

test('GET auditoría solo ofrece alternativa para factura sin líneas ni cargos',async()=>{
 for(const caso of ['resumen','producto','cargo','albaran']){
  let get,result;const actual={...f,...(caso==='albaran'?{tipo:'albaran'}:{}),...(caso==='cargo'?{cargos_base:[{descripcion:'Cargo',importe:1,porcentaje_iva:21}]}:{})};
  const pool={query:async sql=>({rows:sql.startsWith('SELECT * FROM facturas WHERE')?[actual]:caso==='producto'?[{id:1}]:[]})};
  registrarAuditoriaCompleta({get(_p,_a,h){get=h;},post(){}},{auth(){},pool,puedeAccederLocal:()=>true});
  await get({params:{id:526}},{json(v){result=v;},status(){return this;}});
  assert.equal(result.data.permite_resumen,caso==='resumen');
 }
});

test('endpoint detalle reabre declaración vigente y sigue comprobando ámbito',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');const start=source.indexOf('app.get("/api/facturas/:id/lineas"');
 const endpoint=source.slice(start,source.indexOf('// ── Fichas duplicadas',start));
 const {validarSuma}=await import('../src/modules/facturas/lineas.js');const {leerCargosBase}=await import('../src/modules/facturas/cargos-base.js');
 for(const permitido of [true,false]){
  let handler,status=200,result,consultas=0;
  const ctx=vm.createContext({app:{get(_p,_a,h){handler=h;}},requireAuth(){},dbGet:async()=>({...f}),dbAll:async sql=>{
   consultas++;return sql.includes('DISTINCT ON')?[audit]:[];
  },puedeAccederLocal:()=>permitido,cargarDistintivos,validarSuma,leerCargosBase,referenciasAlbaran:async(_db,_f,ls)=>ls,estadoAlbaran:x=>x});
  vm.runInContext(endpoint,ctx);
  await handler({params:{id:526}},{status(n){status=n;return this;},json(v){result=v;}});
  assert.equal(status,permitido?200:403);
  if(permitido){assert.equal(resumenDocumentalVigente(result.factura),true);assert.equal(result.lineas.length,0);assert.equal(result.suma,null);assert.equal(result.diferencia,null);}
  else assert.equal(consultas,0);
 }
});
