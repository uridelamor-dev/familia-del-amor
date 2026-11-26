import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const tramo=app.slice(app.indexOf('async function facTerminarRevision('),app.indexOf('function facOfrecerDeshacer('));

async function continuar(paginas,cola=[],cursor='50') {
 const acciones=[];
 let botones=[];
 const ctx=vm.createContext({
  CURRENT:'facturas',FAC_RECEPCIONES_ANTES:null,FAC_RECEPCIONES_ESPERA:false,
  facRevisionQS:()=>'',toast:mensaje=>acciones.push(mensaje),
  document:{querySelector:()=>null,querySelectorAll:()=>botones},
  facCargarRecepciones:async (antes,modo)=>{
   acciones.push([antes,modo]);
   const pagina=paginas.shift();
   botones=(pagina?.ids||[]).map(id=>({dataset:{id},click:()=>acciones.push(id)}));
   return pagina;
  },
  facRefresh:async()=>acciones.push('refrescar Compras')
 });
 vm.runInContext(tramo,ctx);
 await ctx.facTerminarRevision({dataset:{siguiente:'1'},_recepcionAmbito:'',_recepcionPagina:cursor,
  _revisionCola:cola.map(id=>({id,accion:'fac-recepcion-revision'})),querySelector:()=>null});
 return acciones;
}

test('guardar y seguir recarga solo recepción y mantiene el orden del lote',async()=>{
 assert.deepEqual(await continuar([{ids:['nuevo','7']}],['8','7']),[[null,'actualizar'],'7']);
});

test('sigue por el cursor del lote y pasa páginas sin recepciones listas',async()=>{
 assert.deepEqual(await continuar([{ids:[]},{ids:[],siguiente:'20'},{ids:['19']}]),
  [[null,'actualizar'],['50','next'],['20','next'],'19']);
});

test('si falla la consulta de recepción no intenta abrir otro documento',async()=>{
 assert.deepEqual(await continuar([null]),[[null,'actualizar']]);
});
