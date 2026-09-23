import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const funcion=src.slice(src.indexOf('async function rrSelWorker(id)'),src.indexOf('\nfunction rrRepaintFicha()'));
test('cambiar rápido de trabajador no mezcla notas y ficha de respuestas tardías',async()=>{
 const pendientes=new Map();const pedir=url=>new Promise(resolve=>pendientes.set(url,resolve));
 const ctx=vm.createContext({RRSEG:{workers:[{id:1},{id:2}]},USER:{rol:'direccion'},CURRENT:'rrhh',RRTAB:'seguimiento',localActualFE:()=> 'A',apiRaw:pedir,apiOptional:pedir,document:{getElementById:()=>({})},renderRRSeg:()=>''});vm.runInContext(funcion,ctx);
 const uno=ctx.rrSelWorker(1),dos=ctx.rrSelWorker(2);
 for(const [url,resolve] of pendientes)if(url.includes('/2/'))resolve({de:2});await dos;
 for(const [url,resolve] of pendientes)if(url.includes('/1/'))resolve({de:1});await uno;
 assert.equal(ctx.RRSEG.sel.id,2);assert.equal(ctx.RRSEG.ficha.de,2);assert.equal(ctx.RRSEG.notas.de,2);assert.equal(ctx.RRSEG.lab.de,2);
});
