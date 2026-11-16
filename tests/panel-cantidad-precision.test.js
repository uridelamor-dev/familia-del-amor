import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
// Render the actual editable quantity input, with the panel's real number formatter.
const input=code.match(/<input class="lincel" data-campo="cantidad"[^>]*>/)?.[0];
assert.ok(input,'quantity editor must exist');
function render(cantidad){
 const ctx=vm.createContext({l:{cantidad,linea_id:99,descripcion:'Servicio'},esc:String,Intl});
 vm.runInContext('const nf=new Intl.NumberFormat("es-ES",{useGrouping:"always"});const num=n=>nf.format(Number(n)||0);',ctx);
 return vm.runInContext('`'+input+'`',ctx).match(/ value="([^"]*)"/)[1];
}
test('reopening a quantity preserves five decimals and six decimals',()=>{
 assert.equal(render(1.00001),'1,00001');assert.equal(render(0.123456),'0,123456');
});
test('editable quantities do not add thousands separators that change parsing',()=>{
 assert.equal(render(12345.00001),'12345,00001');
 assert.equal(Number(render(12345.00001).replace(',','.')),12345.00001);
});
test('returns keep their sign and unknown quantities remain empty',()=>{
 assert.equal(render(-1.00001),'-1,00001');assert.equal(render(null),'');assert.equal(render(undefined),'');
});
test('quantity reopening and resubmission preserve the value',()=>{
 for(const original of [1.00001,0.00001,-2.00001,1000.123456]){
  const saved=Number(render(original).replace(',','.'));
  assert.equal(saved,original);assert.equal(render(saved),render(original));
 }
});
