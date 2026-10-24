import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenTanda} from '../src/modules/facturas/tandas-whatsapp.js';
test('confirmación permite comprobar proveedor, céntimos y fecha sin enlaces internos',()=>{
 const r=resumenTanda([{id:8,estado:'registrado',resultado:{datos:{proveedor:'Proveedor prueba',total:123.45,fecha:'2026-10-24'},driveUrl:'https://drive.google.com/x',sheetUrl:'https://sheets.google.com/x'}}]);
 assert.match(r,/Documento digitalizado/);assert.match(r,/Proveedor: Proveedor prueba/);assert.match(r,/123,45/);assert.match(r,/24\/10\/2026/);assert.doesNotMatch(r,/https|drive|sheets/);
});
test('revisión no confirma datos dudosos ni pide foto por fallos técnicos',()=>{
 const r=resumenTanda([{id:1,estado:'revision',resultado:{datos:{total:0},solicitarFoto:false}},{id:2,estado:'error'}]);
 assert.match(r,/0,00/);assert.match(r,/Sin confirmar/);assert.match(r,/aún no contabilizado/);assert.doesNotMatch(r,/Documento digitalizado|Necesitamos otra foto/);
});
test('foto ilegible pide nueva imagen identificada, cola no se da por terminada',()=>{
 const r=resumenTanda([{id:4,estado:'revision',resultado:{solicitarFoto:true}},{id:5,estado:'leyendo'}]);
 assert.match(r,/Necesitamos otra foto/);assert.match(r,/#4/);assert.match(r,/Avisaremos al terminar/);assert.doesNotMatch(r,/Documento digitalizado/);
});
