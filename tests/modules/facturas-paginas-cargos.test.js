import test from 'node:test';
import assert from 'node:assert/strict';
import {crearCompletarPaginas,huellaPaginas} from '../../src/modules/facturas/paginas-completar.js';
const cargo={descripcion:'S.L.',importe:3.9,porcentaje_iva:21};
test('completar páginas con cargos manuales bloquea antes de OCR, archivo o transacción',async()=>{
 const acciones=[];
 const completar=crearCompletarPaginas({db:{get:async()=>({id:213,cargos_base:[cargo]}),all:async()=>{acciones.push('leer lineas');return [];}},leer:async()=>acciones.push('OCR'),archivar:async()=>acciones.push('Drive'),transaccion:async()=>acciones.push('transaccion')});
 await assert.rejects(()=>completar({a:{contexto:{facturaId:213},local:'Tordera'}}),/cargos revisados manualmente/);
 assert.deepEqual(acciones,[]);
});
test('huella de páginas detecta cargo añadido durante OCR pero conserva legacy sin cargos',()=>{
 const f={id:213,total:653.19};
 assert.equal(huellaPaginas(f,[]),huellaPaginas({...f,cargos_base:[]},[]));
 assert.notEqual(huellaPaginas(f,[]),huellaPaginas({...f,cargos_base:[cargo]},[]));
 assert.equal(huellaPaginas({...f,cargos_base:[cargo]},[]),huellaPaginas({...f,cargos_base:JSON.stringify([cargo])},[]));
});
