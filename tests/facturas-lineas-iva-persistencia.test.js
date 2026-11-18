import {actualizarAvisosTrasCorreccion} from '../src/modules/facturas/avisos-vigentes.js';
import {cuadraTotal} from '../src/modules/facturas/coherencia.js';
import {validarCargosBase,leerCargosBase} from '../src/modules/facturas/cargos-base.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validarSuma,mensajeValidacion} from '../src/modules/facturas/lineas.js';
import {validarIva,porcentajeDeIvaValidado} from '../src/modules/facturas/iva.js';
import {huellaRevision} from '../src/modules/facturas/avisos-memoria.js';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('app.patch("/api/facturas/:id",');
const ruta=source.slice(start,source.indexOf('\n});',start)+4);
async function guardar(body,{acceso=true,factura={},detalle}={}){
 let handler,status=200,result,writes=0,aprendizajes=0;
 let f={id:510,base_imponible:3.802,cuota_iva:.798,total:4.6,tipo:'ticket',local:'Blanes',lineas_iva_incluido:false,...factura};
 const original={...f};const lineas=detalle??[{importe:1.1,dudosa:false},{importe:3.5,dudosa:false}];
 const client={release(){},async query(sql,p=[]){
  if(sql.startsWith('SELECT * FROM facturas'))return {rows:[{...f}]};
  if(sql.startsWith('SELECT importe'))return {rows:lineas};
  if(sql.startsWith('UPDATE facturas SET')){
   writes++;
   if(sql.includes('revisar=?')){f.revisar=p[0];}
   else if(sql.includes('lineas_estado=?')){f.lineas_estado=p[0];f.lineas_aviso=p[1];}
   else {
    const fields=[...sql.matchAll(/([a-z_]+) = \?/g)].map(m=>m[1]);
    fields.forEach((k,i)=>{f[k]=p[i];});
    if(sql.includes("iva_estado = 'manual'")){f.iva_estado='manual';f.iva_aviso=null;}
   }
  }
  return {rows:[]};
 }};
 vm.runInNewContext(ruta,{app:{patch(_p,_a,h){handler=h;}},requireAuth:()=>()=>{},dbGet:async()=>({...f}),
  actualizarAvisosTrasCorreccion,validarCargosBase,leerCargosBase,isoConOffset:()=>'2026-11-16T12:00:00Z',vencimientoManualValido:()=>true,puedeAccederLocal:()=>acceso,ajustesFiscales:()=>0,
  pool:{connect:async()=>client},toPositional:x=>x,validarSuma,mensajeValidacion,huellaRevision,validarIva,porcentajeDeIvaValidado,
  recordarProveedorRevision:async()=>{aprendizajes++;},ficAuditar:async()=>{},reubicarEnDrive:async()=>{},
  resincronizarSheetsFactura:async()=>{},getDriveAccessToken:()=>{},dbAll:async()=>[],dbRun:async()=>{},console});
 const res={status(n){status=n;return this;},json(v){result=v;return this;}};
 await handler({params:{id:'510'},body,user:{username:'contabilidad'}},res);
 return {status,result,f,original,writes,lineas,aprendizajes};
}
test('PATCH guarda modo explícito y recalcula estado sin cambiar importes originales',async()=>{
 const r=await guardar({lineas_iva_incluido:true,confirmar_iva_lineas:true});
 assert.equal(r.status,200);assert.equal(r.result.ok,true);assert.equal(r.f.lineas_iva_incluido,true);assert.equal(r.f.lineas_estado,'ok');
 assert.equal(r.f.total,4.6);assert.equal(r.f.base_imponible,3.802);assert.equal(r.f.cuota_iva,.798);
 assert.deepEqual(r.lineas.map(l=>l.importe),[1.1,3.5]);
 assert.notEqual(huellaRevision(r.f),huellaRevision(r.original));
});
test('PATCH rechaza valor ambiguo o falta de confirmación antes de escribir',async()=>{
 for(const body of [{lineas_iva_incluido:true},{lineas_iva_incluido:'true',confirmar_iva_lineas:true}]){
  const r=await guardar(body);assert.equal(r.status,400);assert.equal(r.writes,0);
 }
});
test('PATCH conserva control de establecimientos',async()=>{
 const r=await guardar({lineas_iva_incluido:true,confirmar_iva_lineas:true},{acceso:false});assert.equal(r.status,403);assert.equal(r.writes,0);
});

test('SERHS abono: guardar cabecera negativa retira aviso que comparaba contra la base positiva antigua',async()=>{
 const detalle=[{importe:-5.71,dudosa:false}];
 const factura={id:278,tipo:'albaran',base_imponible:5.71,cuota_iva:.57,total:6.28,lineas_estado:'descuadre',lineas_aviso:'Base anterior 5,71 €'};
 const r=await guardar({base_imponible:-5.71,cuota_iva:-.57,total:-6.28,iva_desglose:[{base:-5.71,tipo:10,cuota:-.57}]},{factura,detalle});
 assert.equal(r.status,200);assert.equal(r.result.ok,true);
 assert.equal(r.f.base_imponible,-5.71);assert.equal(r.f.total,-6.28);assert.equal(r.f.iva_estado,'manual');
 assert.equal(r.f.lineas_estado,'ok');assert.equal(r.f.lineas_aviso,null);
 assert.deepEqual(r.lineas,detalle);
});
test('corregir cabecera no crea avisos de líneas en documentos sin detalle o no aplicables',async()=>{
 for(const estado of [null,'no_aplica','no_leible']){
  const r=await guardar({base_imponible:100,cuota_iva:21,total:121},{factura:{lineas_estado:estado},detalle:[]});
  assert.equal(r.status,200);assert.equal(r.f.lineas_estado,estado);
 }
});
test('una cabecera corregida que sigue sin cuadrar conserva aviso basado en el nuevo importe',async()=>{
 const r=await guardar({base_imponible:-6,cuota_iva:-.6,total:-6.6},{factura:{lineas_estado:'descuadre'},detalle:[{importe:-5.71,dudosa:false}]});
 assert.equal(r.status,200);assert.equal(r.f.lineas_estado,'descuadre');assert.match(r.f.lineas_aviso,/base imponible es -6(?:[,.]00)? €/);assert.match(r.f.lineas_aviso,/0[,.]29/);
});

test('guardar otros campos no confirma un NIF OCR; corregir identidad sí solicita aprendizaje seguro',async()=>{
 assert.equal((await guardar({concepto:'Detalle revisado'})).aprendizajes,0);
 assert.equal((await guardar({proveedor:'SERHS Distribució i Logística, S.L.'},{factura:{proveedor:'SERHS',nif:'B12345674'}})).aprendizajes,0);
 assert.equal((await guardar({nif:'B-08485005'},{factura:{nif:'B08485005'}})).aprendizajes,0);
 assert.equal((await guardar({base_imponible:100,cuota_iva:21,total:121})).aprendizajes,0);
 assert.equal((await guardar({nif:'B08485005'})).aprendizajes,1);
 assert.equal((await guardar({nif:'B08485005'},{factura:{nif:'B08485005'}})).aprendizajes,0);
});
test('DDI 511: confirmar desglose mixto elimina aviso obsoleto, sin cambiar importes',async()=>{
 const iva=[{base:635.11,tipo:21,cuota:133.37},{base:71.06,tipo:10,cuota:7.11}];
 const factura={id:511,base_imponible:706.17,cuota_iva:140.48,total:846.65,iva_desglose:JSON.stringify(iva),iva_estado:'revisar',iva_aviso:'Importes modificados: revisa el desglose de IVA.'};
 const sinConfirmar=await guardar({concepto:'Revisado'},{factura});
 assert.equal(sinConfirmar.f.iva_estado,'revisar');assert.equal(sinConfirmar.f.iva_aviso,factura.iva_aviso);
 const r=await guardar({iva_desglose:iva},{factura});
 assert.equal(r.status,200);assert.equal(r.result.ok,true);
 assert.equal(r.f.iva_estado,'manual');assert.equal(r.f.iva_aviso,null);
 assert.deepEqual(JSON.parse(r.f.iva_desglose),[...iva].sort((a,b)=>a.tipo-b.tipo));
 assert.equal(r.f.base_imponible,706.17);assert.equal(r.f.cuota_iva,140.48);assert.equal(r.f.total,846.65);
 const malo=await guardar({iva_desglose:[{base:706.17,tipo:21,cuota:140.48}]},{factura});
 assert.equal(malo.status,400);assert.equal(malo.writes,0);assert.equal(malo.f.iva_estado,'revisar');
});
test('Gran Reino 514, 515 y 530: confirmación de IVA incluido conserva originales y retira falso descuadre',async()=>{
 const casos=[
  {id:514,base_imponible:1.736,cuota_iva:.364,total:2.10,importes:[2.10]},
  {id:515,base_imponible:1.488,cuota_iva:.312,total:1.80,importes:[1.80]},
  {id:530,base_imponible:12.231,cuota_iva:2.569,total:14.80,importes:[2.90,11.90]},
 ];
 for(const {importes,...factura} of casos){
  const detalle=importes.map(importe=>({importe,dudosa:false}));
  const r=await guardar({lineas_iva_incluido:true,confirmar_iva_lineas:true},{factura:{...factura,lineas_estado:'descuadre',lineas_aviso:'Sobra detalle'},detalle});
  assert.equal(r.status,200);assert.equal(r.result.ok,true);
  assert.equal(r.f.lineas_iva_incluido,true);assert.equal(r.f.lineas_estado,'ok');assert.equal(r.f.lineas_aviso,null);
  for(const k of ['base_imponible','cuota_iva','total'])assert.equal(r.f[k],factura[k]);
  assert.deepEqual(r.lineas,detalle);
  const reabierto=validarSuma(r.lineas,r.f.base_imponible,r.f.tipo,r.f);
  assert.equal(reabierto.cuadra,true);assert.equal(reabierto.diferencia,0);assert.equal(reabierto.referencia,'base más IVA');
 }
});

test('DDI: PATCH cargos integra S.L. sin tocar productos ni total, y rechaza edición obsoleta',async()=>{
 const factura={id:213,tipo:'factura',base_imponible:546.61,cuota_iva:106.58,total:653.19,lineas_estado:'descuadre'};
 const detalle=[{importe:542.71,dudosa:false}];
 const cargos=[{descripcion:'S.L. del original',importe:'3,90',porcentaje_iva:'21'}];
 const r=await guardar({cargos_base:cargos,cargos_base_antes:[]},{factura,detalle});
 assert.equal(r.status,200);assert.equal(r.f.lineas_estado,'ok');assert.equal(r.f.total,653.19);assert.equal(r.f.base_imponible,546.61);assert.deepEqual(r.lineas,detalle);
 assert.equal(JSON.parse(r.f.cargos_base)[0].importe,3.9);assert.notEqual(huellaRevision(r.f),huellaRevision(r.original));
 const obsoleto=await guardar({cargos_base:cargos,cargos_base_antes:[]},{factura:{...factura,cargos_base:[{descripcion:'Otro',importe:2,porcentaje_iva:21}]},detalle});
 assert.equal(obsoleto.status,409);assert.equal(obsoleto.writes,0);
 const invalido=await guardar({cargos_base:[{descripcion:'S.L.',importe:3.9}],cargos_base_antes:[]},{factura,detalle});
 assert.equal(invalido.status,400);assert.equal(invalido.writes,0);
 const ajeno=await guardar({cargos_base:cargos,cargos_base_antes:[]},{factura,detalle,acceso:false});
 assert.equal(ajeno.status,403);assert.equal(ajeno.writes,0);
});


test('PATCH persiste la retirada selectiva del descuadre sin confirmar otras dudas',async()=>{
 const factura={base_imponible:100,cuota_iva:21,total:150};
 factura.revisar=JSON.stringify([cuadraTotal(factura).texto,'Fecha ambigua']);
 const r=await guardar({total:121},{factura});
 assert.equal(r.status,200);
 assert.deepEqual(JSON.parse(r.f.revisar),['Fecha ambigua']);
});
