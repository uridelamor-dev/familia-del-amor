import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decidirPaginas} from '../../src/modules/facturas/paginas-clasificacion.js';
import {crearPaginas,mismoOrigen} from '../../src/modules/facturas/paginas.js';
import {validarComplemento,huellaPaginas} from '../../src/modules/facturas/paginas-completar.js';
import {crearRecepcion} from '../../src/modules/facturas/recepcion.js';
import {resumenTanda} from '../../src/modules/facturas/tandas-whatsapp.js';
const prueba=()=>({relacion:'misma',contenido_complementario:true,documentos:[1,2].map(pagina=>({tipo:'factura',nif:'B12345678',numero:'F-123',fecha:'2026-10-28',pagina,paginas:2}))});
const foto=(id,estado='pendiente')=>({id,estado,hash:'h'+id,local:'Blanes',canal:'WhatsApp',nombre:'foto.jpg',mime:'image/jpeg',original:Buffer.from('foto'+id),creado:'2026-10-28T12:00:00Z',contexto:{grupo:'g',remitente:'r'}});
test('solo identidad y páginas impresas diferentes permiten unir automáticamente',()=>{
 assert.equal(decidirPaginas(prueba()),'automatica');
 for(const campo of ['nif','numero','fecha','pagina','paginas']){const p=prueba();p.documentos[1][campo]=null;assert.equal(decidirPaginas(p),'revision');}
 const p=prueba();p.documentos[1].numero='F-124';assert.equal(decidirPaginas(p),'distintas');
 p.documentos[1].numero='F-123';p.documentos[1].pagina=1;assert.equal(decidirPaginas(p),'revision');
 assert.equal(decidirPaginas({relacion:'repetida'}),'repetida');
 assert.throws(()=>decidirPaginas({relacion:'sí'}));
});
test('ni remitentes ni establecimientos distintos se mezclan',()=>{
 const a=foto(1),b=foto(2);assert.ok(mismoOrigen(a,b));
 for(const change of [{local:'Girona'},{contexto:{grupo:'otro',remitente:'r'}},{contexto:{grupo:'g',remitente:'otra'}},{contexto:null}])assert.equal(mismoOrigen(a,{...b,...change}),false);
});
function entorno({estado='pendiente',comparar=async()=>prueba(),fallar=false}={}){
 const a=foto(1,estado),b=foto(2);let p;const cambios=[];
 const db={
  get:async(sql,args)=>{
   if(sql.includes('facturas_paginas'))return p;
   if(sql.includes('facturas_recepciones'))return args[0]===1?a:b;
   throw Error(sql);
  },
  all:async(sql)=>sql.includes('FOR UPDATE')?[a,b]:[b],
  run:async(sql,args)=>{cambios.push({sql,args});
   if(sql.startsWith('INSERT INTO facturas_paginas')){p={id:7,primera:args[0],segunda:args[1],estado:args[2],pruebas:JSON.parse(args[3])};return p;}
   if(sql.startsWith('INSERT INTO facturas_recepciones'))return {id:3};
   return {};
  }
 };
 let completar=0;
 const servicio=crearPaginas({db,transaccion:fn=>fn(db),comparar,combinar:async()=>{if(fallar)throw Error('PDF no disponible');return Buffer.from('pdf');},completar:async()=>{completar++;return {ok:true};}});
 return {a,b,db,servicio,cambios,get propuesta(){return p;},get completadas(){return completar;}};
}
test('reúne fotos ya guardadas aunque la segunda aún esté esperando; preserva originales y un solo alta',async()=>{
 const e=entorno();assert.equal(await e.servicio.antes(e.a),true);
 assert.equal(e.cambios.filter(x=>x.sql.startsWith('INSERT INTO facturas_recepciones')).length,1);
 assert.ok(e.cambios.some(x=>x.sql.includes("estado='sustituido'")));
 assert.ok(!e.cambios.some(x=>/DELETE|original=NULL/.test(x.sql)));
});
test('sin numeración propone revisión y no crea un documento unido',async()=>{
 const e=entorno({comparar:async()=>({...prueba(),documentos:[{},{}]})});await e.servicio.antes(e.a);
 assert.equal(e.propuesta.estado,'revision');assert.ok(e.cambios.some(x=>x.sql.includes("estado='paginas'")));
 assert.equal(e.cambios.filter(x=>x.sql.startsWith('INSERT INTO facturas_recepciones')).length,0);
});
test('dos comprobaciones contradictorias impiden unión automática',async()=>{
 let n=0;const e=entorno({comparar:async()=>++n===1?prueba():{relacion:'distintas'}});await e.servicio.antes(e.a);assert.equal(e.propuesta.estado,'revision');
});
test('una factura registrada exige revisión; no se vuelve a contabilizar',async()=>{
 const e=entorno({estado:'registrado'});e.db.all=async()=>[e.a];await e.servicio.antes(e.b);
 assert.equal(e.propuesta.estado,'revision');assert.equal(e.completadas,0);
});
test('si falla el PDF no se retiran originales; la propuesta automática puede retomarse',async()=>{
 const e=entorno({fallar:true});await assert.rejects(e.servicio.antes(e.a),/PDF/);
 assert.equal(e.propuesta.estado,'automatica');assert.ok(!e.cambios.some(x=>x.sql.includes("estado='sustituido'")));
 await assert.rejects(e.servicio.antes(e.a),/PDF/);
});
test('completar conserva identidad y no cambia un total ya registrado',()=>{
 const f={tipo:'factura',numero_factura:'F1',nif:'B123',fecha:'2026-10-28',total:121,base_imponible:100,cuota_iva:21};
 const d={...f,nif_proveedor:'B123'};validarComplemento(f,d);
 assert.throws(()=>validarComplemento(f,{...d,total:242}),/importes/);
 assert.throws(()=>validarComplemento(f,{...d,numero_factura:'F2'}),/identidad/);
 assert.throws(()=>validarComplemento(f,{...d,total:null}),/importes/);
 assert.notEqual(huellaPaginas(f,[]),huellaPaginas({...f,total:120},[]));
 assert.notEqual(huellaPaginas(f,[]),huellaPaginas({...f,nif:'OTRO'},[]));
});
test('la espera guarda el original y no llama a IA ni registra al recibir la primera foto',async()=>{
 let fila,llamadas=0;const now=new Date('2026-10-28T12:00:00Z');
 const db={get:async()=>fila,run:async(sql,args)=>{assert.ok(sql.startsWith('INSERT'));fila={id:1,estado:'pendiente',hash:args[1],original:args[6],contexto:JSON.parse(args[7]),proximo:args[8]};return fila;}};
 const r=crearRecepcion({db,lock:async(_,fn)=>fn(),procesar:async()=>llamadas++,ahora:()=>now});
 await assert.rejects(r.recibir({buffer:Buffer.from('foto'),mimeType:'image/jpeg',local:'Blanes',contexto:{grupo:'g',remitente:'r'}}),e=>e.recibido===true);
 assert.equal(llamadas,0);assert.equal(new Date(fila.proximo)-now,90000);assert.equal(fila.original.toString(),'foto');
});
test('el resumen de WhatsApp no repite el mismo documento agrupado',()=>{
 const f={id:1,recepcion_id:3,estado:'registrado',resultado:{datos:{proveedor:'Ejemplo',total:12}}};
 assert.equal(resumenTanda([f,{...f,id:2}]),resumenTanda([f]));
});
