import test from 'node:test';
import assert from 'node:assert/strict';
import {telefono,resolverIdentidades,analizarRecorrido,validarFiltros,cargarFuente} from '../src/modules/campaigns/recorrido.js';
const sent='2026-10-01T10:00:00Z',p={id:'34600111222',telefono:'34600111222',nombre:'Ana',enviado:true,fecha_envio:sent};
const f={desde:'2026-10-01',hasta:'2026-10-31'};
const evento=(tipo,fecha='2026-10-02T10:00:00Z',more={})=>({tipo,fecha,telefono:p.telefono,local:'Girona',importe:0,...more});
test('identidad: normaliza España sin confundir extranjeros por los últimos nueve dígitos',()=>{assert.equal(telefono('+34 600 111 222'),telefono('600111222'));assert.equal(telefono('0034600111222'),p.telefono);assert.notEqual(telefono('44600111222'),p.telefono);assert.equal(telefono('12'),'');});
test('email compartido no se asocia y reintentos fallidos no duplican personas',()=>{
 const e={correo:'a@x.es',estado:'enviado',enviado_en:sent};let rows=resolverIdentidades([e],[{correo:'a@x.es',telefono:'600111222'},{correo:'a@x.es',telefono:'600111223'}]);assert.equal(rows[0].telefono,'');
 rows=resolverIdentidades([{telefono:p.telefono,estado:'error',enviado_en:sent},{telefono:'600111222',estado:'enviado',enviado_en:sent},{telefono:p.telefono,estado:'enviado',enviado_en:'2026-10-03'}]);assert.equal(rows.length,1);assert.equal(rows[0].fecha_envio,sent);
});
test('recorrido excluye actividad anterior, duplica ni canjes ni visitas y descuenta devoluciones',()=>{
 const d=analizarRecorrido([p],[{telefono:p.telefono,creado_en:'2026-09-20'}],[evento('visita','2026-09-20'),evento('visita'),evento('canje'),evento('consumo',undefined,{importe:40}),evento('consumo','2026-10-03',{importe:-10}),evento('visita','2026-10-04'),evento('visita','2026-10-05',{local:'Blanes'})],{...f,local:'Girona'});
 assert.equal(d.resumen.visitantes,1);assert.equal(d.filas[0].visitas,2);assert.equal(d.resumen.consumo,30);assert.equal(d.resumen.conversion,100);assert.equal(d.filas[0].tarjeta,'previa');assert.equal(d.resumen.altas,0);assert.equal(d.resumen.resenas,0);
});
test('ausencia de datos no se convierte en gasto cero, alta anterior ni visita de envío fallido',()=>{
 const rows=[p,{...p,id:'otro',telefono:'34600111223',enviado:false,fecha_envio:null}];const d=analizarRecorrido(rows,[{telefono:p.telefono,creado_en:'2026-10-02'}],[evento('visita',undefined,{telefono:'34600111223'})],f);
 assert.equal(d.resumen.consumo,null);assert.equal(d.resumen.altas,1);assert.equal(d.resumen.visitantes,0);assert.equal(d.resumen.enviados,1);
 assert.equal(analizarRecorrido(rows,[],[],{...f,grupo:'sin_visita'}).filas.length,1);
});
test('reseña verificada solo se cuenta dentro del periodo y después del mensaje',()=>{assert.equal(analizarRecorrido([p],[],[evento('resena')],f).resumen.resenas,1);assert.equal(analizarRecorrido([p],[],[evento('resena','2026-09-25')],f).resumen.resenas,0);});
test('fechas y grupos inválidos se rechazan',()=>{for(const q of [{desde:'2026-02-30'},{desde:'2026-12-01',hasta:'2026-10-01'},{grupo:'inventado'}])assert.throws(()=>validarFiltros(q));});
test('correo: acceso limitado al autor y borrador nunca se trata como enviado',async()=>{
 let params;const db={get:async(sql,args)=>{assert.match(sql,/autor=\?/);params=args;return{id:'x',asunto:'A',estado:'borrador',destinatarios:[{correo:'a@x.es'}]};}};
 const d=await cargarFuente(db,'correo','12345678-1234-1234-1234-123456789abc',{id:7});assert.equal(params[1],7);assert.equal(resolverIdentidades(d.envios)[0].enviado,false);
});
