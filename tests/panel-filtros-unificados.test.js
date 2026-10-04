import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {conEsquema,disponible,motivoSalto} from './helpers/pgtmp.js';
import {claveProveedor} from '../src/modules/facturas/categorias.js';
const panel=fs.readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
function block(source,name){const a=source.indexOf(name);assert.notEqual(a,-1);return source.slice(a,source.indexOf('\n}\n',a)+3);}
const context={document:{addEventListener(){}},esc:v=>String(v??''),ic:()=>'',dpFmt:v=>v};
vm.createContext(context);
vm.runInContext(panel.slice(panel.indexOf('const LIST_FILTERS = '),panel.indexOf('function categoryFilterHtml')),context);
test('rango numérico y fechas: ceros, rangos abiertos e invertidos',()=>{
 const validate=context.filterRangeError;
 assert.equal(validate({min:'0',max:'8'},[['min','max','Edad',true]]),'');
 assert.match(validate({min:'10',max:'2'},[['min','max','Edad',true]]),/inicio/);
 assert.equal(validate({from:'',to:'2026-10-02'},[['from','to','Fecha']]),'');
 assert.match(validate({from:'2026-10-04',to:'2026-10-02'},[['from','to','Fecha']]),/inicio/);
});
test('el resumen incluye filtros con valor cero y diferencia ordenar de filtrar',()=>{
 const c={title:'Clientes',state:{q:'Ana',edad_min:'0',estado:'',orden:'nombre'},fields:[{key:'edad_min',label:'Edad mínima'},{key:'estado',label:'Estado'}]};
 assert.equal(context.filterActive(c).length,1);
 const html=context.listFilterBar('test',c);
 assert.match(html,/Edad mínima: 0/);assert.doesNotMatch(html,/Quitar filtro orden/);
 assert.match(html,/data-filter-clear/);
});
test('proveedores: categoría, subcategoría, búsqueda, actividad y orden trabajan sobre el mismo conjunto',()=>{
 const ctx={CURRENT:'proveedores',FCATS:{proveedores:[
  {proveedor:'Café Á',categorias:[{categoria:'Bebidas',subcategoria:'Café'}],gasto:30,facturas:2},
  {proveedor:'Vinos B',categorias:[{categoria:'Bebidas',subcategoria:'Vinos'}],gasto:80,facturas:3},
  {proveedor:'Huerta C',categorias:[{categoria:'Verdura',subcategoria:''}],gasto:0,facturas:0}
 ]},PROVF:{q:'',categoria:'Bebidas',subcategoria:'Café',actividad:'',orden:'nombre'},filterValues:v=>String(v||'').split(',').filter(Boolean),parTxt:p=>p.categoria+' '+p.subcategoria};
 vm.runInNewContext(block(panel,'function proveedoresFiltrados()'),ctx);
 assert.deepEqual(Array.from(ctx.proveedoresFiltrados(),x=>x.proveedor),['Café Á']);
 ctx.PROVF.subcategoria='';ctx.PROVF.orden='gasto';
 assert.deepEqual(Array.from(ctx.proveedoresFiltrados(),x=>x.proveedor),['Vinos B','Café Á']);
 ctx.PROVF.q='cafe a';assert.equal(ctx.proveedoresFiltrados().length,1);
 ctx.PROVF.q='';ctx.PROVF.actividad='sin';assert.equal(ctx.proveedoresFiltrados().length,0);
 ctx.PROVF.categoria='';assert.equal(ctx.proveedoresFiltrados()[0].proveedor,'Huerta C');
});
const can=await disponible();
test('SQL real: categorías cruzadas, proveedor normalizado, ámbito, total y cero coincidencias',{skip:!can&&motivoSalto()},async()=>{
 const db=await conEsquema();
 try{
  await db.raw(`CREATE TABLE facturas(proveedor TEXT,local TEXT,total NUMERIC,fecha TEXT,dup_estado TEXT,tipo TEXT,pagado INT,empresa TEXT,concepto TEXT,numero_factura TEXT)`);
  await db.raw(`CREATE TABLE facturas_proveedor_cats(prov_clave TEXT,categoria TEXT,subcategoria TEXT);`);
  for(const [name,local,total] of [['Café Á, S.L.','Girona',20],['Café Á, S.L.','Blanes',40],['Vinos B','Girona',90]])await db.run("INSERT INTO facturas(proveedor,local,total,fecha,tipo,pagado) VALUES(?,?,?,'2026-10-02','factura',0)",[name,local,total]);
  for(const [name,cat,sub] of [['Café Á','Bebidas','Café'],['Vinos B','Bebidas','Vinos']])await db.run('INSERT INTO facturas_proveedor_cats VALUES(?,?,?)',[claveProveedor(name),cat,sub]);
  const ctx={dbAll:db.all,claveProveedor,SIN_DUDAS:"COALESCE(dup_estado,'') <> 'duda'"};vm.createContext(ctx);
  for(const name of ['async function proveedoresDeCategorias','function facturasWhere','async function facturasQueryCategorias'])vm.runInContext(block(server,name),ctx);
  const query=await ctx.facturasQueryCategorias({local:'Girona',categoria:'Bebidas',subcategoria:'Café',from:'2026-10-01',to:'2026-10-04'});
  const {where,params}=ctx.facturasWhere(query);
  const rows=await db.all(`SELECT * FROM facturas ${where}`,params);
  const totals=await db.get(`SELECT SUM(total)::float AS total FROM facturas ${where}`,params);
  assert.equal(rows.length,1);assert.equal(totals.total,20);
  for(const q of [{categoria:'Verdura'},{categoria:'Verdura',subcategoria:'Café'},{categoria:'Bebidas',proveedor:'Otro'}]){
   const w=ctx.facturasWhere(await ctx.facturasQueryCategorias(q));assert.equal((await db.all(`SELECT * FROM facturas ${w.where}`,w.params)).length,0);
  }
 }finally{await db.fin();}
});
