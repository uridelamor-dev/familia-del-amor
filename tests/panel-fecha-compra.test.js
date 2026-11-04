import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function facFechaISO('),source.indexOf('function facFechasEditables('));
const dim=source.slice(source.indexOf('function dpDim('),source.indexOf('function dpFmt('));
const parse=vm.runInNewContext(`const dp2=n=>String(n).padStart(2,'0');${dim}${fn};facFechaISO`);
test('fecha escrita acepta día/mes/año e ISO sin confundir día y mes',()=>{
 assert.equal(parse('4/11/2026'),'2026-11-04');assert.equal(parse('04-11-2026'),'2026-11-04');assert.equal(parse('2026-11-04'),'2026-11-04');assert.equal(parse(''),'');
});
test('rechaza días imposibles, años ambiguos y fechas incompletas',()=>{
 for(const t of ['31/04/2026','29/02/2026','04/11/26','2026-13-01','4/11'])assert.equal(parse(t),null,t);
 assert.equal(parse('29/02/2024'),'2024-02-29');
});
