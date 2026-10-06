import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {agruparAnuales,filaAnual,sincronizarAnuales,configurarBloqueoSheets,verificarHistoricos,HEADERS,avisoAnualesUnaVez} from '../../src/modules/facturas/sheets-anuales.js';
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original; configurarBloqueoSheets(null);});
const rows=[{id:1,local:'Blanes',empresa:'Empresa SL',fecha:'2026-01-03',total:121,base_imponible:100,cuota_iva:21,drive_url:'https://drive.google.com/file/d/pdf1/view'},
 {id:2,local:'Girona',empresa:'Empresa SL',fecha:'2026-02-03',total:55,base_imponible:50,cuota_iva:5,drive_url:'https://drive.google.com/file/d/pdf2/view'}];
const locales=[{local:'Blanes',empresa:'Empresa SL',cif:'B12345678'},{local:'Girona',empresa:'Empresa SL',cif:'B12345678'}];
test('el aviso se repite hasta completar, aunque ya se hubiera mostrado',async()=>{
 const config=new Map([['facturas_anuales_aviso_v1','visto']]);
 const deps={dbGet:async(sql,[key])=>config.has(key)?{value:config.get(key)}:null,dbAll:async sql=>sql.includes('facturas_locales')?locales:rows};
 assert.equal((await avisoAnualesUnaVez(deps)).mostrar,true);
 assert.equal((await avisoAnualesUnaVez(deps)).mostrar,true);
 config.set('facturas_drive_organizacion_completada_v1','ok');
 assert.equal((await avisoAnualesUnaVez(deps)).mostrar,false);
 config.set('facturas_drive_organizacion_pendiente','1');
 assert.equal((await avisoAnualesUnaVez(deps)).mostrar,true);
});
test('empresa compartida, ejercicio separado, fecha desconocida conservada',()=>{
 const g=agruparAnuales([...rows,{...rows[0],id:3,fecha:'2025-12-31'},{...rows[0],id:4,fecha:null}],locales);
 assert.equal(g.length,3); assert.deepEqual(g[0].locales,['Blanes','Girona']); assert.equal(g[0].rows.length,2); assert.equal(g[2].year,'Sin fecha');
 assert.equal(agruparAnuales([{...rows[0],fecha:'2026-02-31'}],locales)[0].year,'Sin fecha');
});
test('NIF fiscal compartido agrupa variantes de nombre, nunca mezcla empresas desconocidas',()=>{
 const ls=[...locales,{local:'Otro',empresa:'Nombre variante',cif:'B12345678'}];
 assert.equal(agruparAnuales([...rows,{...rows[0],local:'Otro',empresa:'Nombre variante'}],ls).length,1);
 assert.equal(agruparAnuales(rows.map(r=>({...r,empresa:''})),[]).length,2);
 assert.throws(()=>agruparAnuales(rows,[...locales,{empresa:'Empresa SL',cif:'B99999999'}]),/varios NIF/);
});
test('preserva ceros, textos y duplicados; nulos no se inventan',()=>{
 const f=filaAnual({...rows[0],total:0,base_imponible:null,proveedor:'=IMPORTXML("x")',dup_estado:'duda'},'Empresa SL');
 assert.equal(f.length,HEADERS.length); assert.equal(f[6],''); assert.equal(f[9],0); assert.equal(f[3],'=IMPORTXML("x")'); assert.equal(f[18],'No');
 assert.throws(()=>filaAnual({...rows[0],total:'no'},'E'),/Importe/);
});
test('sólo excluye albaranes con factura registrada; conserva el albarán y su vínculo',()=>{
 const factura={...rows[0],tipo:'factura'},albaran={...rows[1],tipo:'albaran',conciliado_con:'1'};
 let g=agruparAnuales([factura,albaran],locales)[0];
 assert.equal(filaAnual(g.rows[1],g.empresa)[18],'No');
 assert.match(filaAnual(g.rows[1],g.empresa)[16],/factura #1/);
 g=agruparAnuales([{...factura,dup_estado:'duda'},albaran],locales)[0];
 assert.equal(filaAnual(g.rows[1],g.empresa)[18],'Sí');
 g=agruparAnuales([albaran],locales)[0];assert.equal(filaAnual(g.rows[0],g.empresa)[18],'Sí');
});

function entorno(){
 const config=new Map([['facturas_anuales_historico_verificado','{}']]), books=new Map(), marks=[], requests=[]; let seq=0, corrupt=false, fail=false;
 configurarBloqueoSheets(async fn=>fn());
 const deps={getToken:async()=> 'token', dbAll:async sql=>sql.includes('FROM facturas_locales')?locales:sql.includes('FROM config')?[...config].filter(([k])=>k.startsWith('facturas_anual_v1:')).map(([key,value])=>({key,value})):rows,
 dbGet:async (sql,p)=>config.has(p[0])?{value:config.get(p[0])}:null,
 dbRun:async (sql,p)=>{if(sql.startsWith('INSERT INTO config'))config.set(p[0],p[1]);else if(sql.startsWith('DELETE FROM config')){if(config.get(p[0])===p[1])config.delete(p[0]);}else marks.push(p);}};
 const ok=d=>({ok:true,status:200,json:async()=>d});
 globalThis.fetch=async(url,opt={})=>{
  const u=new URL(url);requests.push({url,opt});
  if(u.hostname==='www.googleapis.com') {
   if(opt.method==='POST'){const b=JSON.parse(opt.body),id='book'+(++seq);books.set(id,{key:b.appProperties.facturasAnualV1,tabs:[]});return ok({id});}
   const q=u.searchParams.get('q');return ok({files:[...books].filter(([,b])=>q.includes(b.key)).map(([id])=>({id}))});
  }
  const id=u.pathname.split('/')[3].split(':')[0],b=books.get(id);
  if(u.pathname.endsWith(':batchUpdate')) {
   if(fail)throw new Error('Google caído');
   for(const r of JSON.parse(opt.body).requests){
    if(r.addSheet)b.tabs.push({properties:r.addSheet.properties,values:[]});
    if(r.updateCells){const t=b.tabs.find(t=>t.properties.sheetId===r.updateCells.range.sheetId);t.values=r.updateCells.rows.map(row=>row.values.map(c=>c.userEnteredValue?.stringValue??c.userEnteredValue?.numberValue??c.userEnteredValue?.formulaValue));}
   }return ok({});
  }
  if(u.pathname.endsWith('/values:batchGet'))return ok({valueRanges:u.searchParams.getAll('ranges').map(range=>{const title=range.split("'")[1];let values=b.tabs.find(t=>t.properties.title===title).values.map(r=>[...r]);if(title==='Resumen anual'){const all=b.tabs.filter(t=>t.properties.title!==title).flatMap(t=>t.values.slice(1)),valid=all.filter(r=>r[18]==='Sí');values=[[all.length,...[6,8,9].map(i=>valid.reduce((n,r)=>n+Number(r[i]||0),0)),all.length-valid.length]];}if(corrupt&&values[1])values[1][9]=999;return {values};})});
  return ok({sheets:b.tabs});
 };
 return {deps,config,books,marks,requests,setCorrupt:()=>{corrupt=true;},setFail:()=>{fail=true;}};
}
test('crear y repetir mantiene un solo libro; doce meses y resumen; escritura atómica',async()=>{
 const e=entorno();const r=await sincronizarAnuales(e.deps);assert.equal(r.total,2);assert.equal(r.libros.length,1);
 await sincronizarAnuales(e.deps,{local:'Girona',fecha:'2026-02-03'});assert.equal(e.books.size,1);assert.equal(e.marks.length,4);
 const b=[...e.books.values()][0];assert.equal(b.tabs.length,13);assert.equal(b.tabs.at(-1).properties.title,'Resumen anual');
 assert.equal(b.tabs[0].values[1][13],'Blanes');assert.equal(b.tabs[1].values[1][13],'Girona');
 assert.ok(!e.requests.some(r=>r.url.includes(':clear')||r.url.includes(':append')));
 assert.ok(e.requests.some(r=>r.opt.body?.includes('formulaValue')));
});
test('fallo Google y lectura que no coincide no marcan facturas sincronizadas',async()=>{
 const e=entorno();e.setFail();await assert.rejects(sincronizarAnuales(e.deps),/caído/);assert.equal(e.marks.length,0);
 const f=entorno();f.setCorrupt();await assert.rejects(sincronizarAnuales(f.deps),/no coincide/);assert.equal(f.marks.length,0);
});
test('no archiva históricos ni mueve documentos antes de verificar los libros',async()=>{
 const e=entorno();let archivo=false;e.setCorrupt();
 await assert.rejects(sincronizarAnuales({...e.deps,trasVerificar:async()=>{archivo=true;}}),/no coincide/);
 assert.equal(archivo,false);
});
test('recupera archivo si cae el proceso antes de persistir registro; no crea duplicado',async()=>{
 const e=entorno();await sincronizarAnuales(e.deps);for(const k of [...e.config.keys()])if(k.startsWith('facturas_anual_v1:'))e.config.delete(k);
 await sincronizarAnuales(e.deps);assert.equal(e.books.size,1);
});
test('cambiar de año vacía el libro anterior y conserva la factura en el nuevo',async()=>{
 const e=entorno();await sincronizarAnuales(e.deps);const originalFecha=rows[0].fecha;
 try {
  rows[0].fecha='2025-01-03';await sincronizarAnuales(e.deps);
  assert.equal(e.books.size,2);
  const listado=[...e.books.values()];assert.equal(listado[0].tabs[0].values.length,1);assert.equal(listado[1].tabs[0].values[1][0],'2025-01-03');
 }finally{rows[0].fecha=originalFecha;}
});
test('un cambio pendiente se reintenta aunque se haya eliminado la última factura',async()=>{
 const e=entorno();await sincronizarAnuales(e.deps);const originalDbAll=e.deps.dbAll;
 e.deps.dbAll=async(sql,...p)=>sql==='SELECT * FROM facturas ORDER BY id'?[]:originalDbAll(sql,...p);
 const r=await sincronizarAnuales(e.deps);assert.equal(r.total,0);assert.equal(e.books.size,1);
 assert.equal([...e.books.values()][0].tabs[0].values.length,1);
 assert.equal(e.config.has('facturas_anuales_reintentar'),false);
});
test('requiere bloqueo antes de consultar o escribir en Google',async()=>{
 await assert.rejects(sincronizarAnuales({}),/bloqueo/);
});
test('el histórico no se migra si falta una factura o difiere un importe',async()=>{
 let total=121;
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('drive/v3')?{files:[{id:'old',name:'Facturas · BLANES · 2026'}]}:String(url).includes('/values/')?{values:[['Fecha','','','','','','','','','','','Archivo Drive'],['2026-01-03','','','','','',100,'',21,total,'',rows[0].drive_url]]}:{sheets:[{properties:{title:'Enero 2026',gridProperties:{rowCount:1000}}}]}});
 const r=await verificarHistoricos('t',rows);assert.equal(r.registros,1);
 await assert.rejects(verificarHistoricos('t',[]),/sin correspondencia/);
 total=122;await assert.rejects(verificarHistoricos('t',rows),/importe/);
});
