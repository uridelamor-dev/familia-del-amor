import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
test('visor: compatibilidad también sin APIs recientes de Safari',async()=>{
 const c=vm.createContext({});vm.runInContext('Map.prototype.getOrInsertComputed=undefined;WeakMap.prototype.getOrInsertComputed=undefined;Map.prototype.getOrInsert=undefined;Promise.withResolvers=undefined;Promise.try=undefined',c);
 vm.runInContext(fs.readFileSync(new URL('../public/panel/pdf-compat.js',import.meta.url),'utf8'),c);
 assert.equal(vm.runInContext('const m=new Map();m.getOrInsertComputed("a",()=>7);m.getOrInsertComputed("a",()=>9)',c),7);
 assert.equal(await vm.runInContext('Promise.try((x)=>x+1,4)',c),5);
 await assert.rejects(vm.runInContext('Promise.try(()=>{throw Error("fallo")})',c),/fallo/);
 assert.equal(await vm.runInContext('const d=Promise.withResolvers();d.resolve(8);d.promise',c),8);
});
