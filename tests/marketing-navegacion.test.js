import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const navigation=app.slice(app.indexOf('let CAMP_SECCION ='),app.indexOf('function renderCampanas()'));
function setup(allowed=['promos','campanas','fidelizacion'],rol='direccion') {
 const calls=[]; const ctx=vm.createContext({USER:{rol},PROMO:{tab:'lista'},FIDV:{seccion:'resumen'},FID_SECC:[['resumen'],['reglas']],puedeVer:v=>allowed.includes(v),go:async v=>calls.push(v)});
 vm.runInContext(navigation,ctx);return {ctx,calls};
}
test('captación reutiliza Promociones y mensajes vuelve a Campañas sin modificar datos',async()=>{
 const {ctx,calls}=setup();
 await vm.runInContext('marketingCampTab("captacion")',ctx);
 assert.equal(ctx.PROMO.tab,'captacion');assert.deepEqual(calls,['promos']);
 await vm.runInContext('marketingCampTab("envios")',ctx);assert.deepEqual(calls,['promos','campanas']);
});
test('sin permiso de promociones no se ofrece captación ni se navega a ella',async()=>{
 const {ctx,calls}=setup(['campanas']);
 assert.doesNotMatch(vm.runInContext('marketingCampNav("envios")',ctx),/data-tab="captacion"/);
 await vm.runInContext('marketingCampTab("captacion")',ctx);assert.deepEqual(calls,[]);
});
test('la tarjeta permanece exclusiva de Dirección y los puntos respetan su permiso propio',()=>{
 const marketing=setup(undefined,'marketing').ctx;
 assert.doesNotMatch(vm.runInContext('marketingBeneficiosNav("lista")',marketing),/data-tab="tarjeta"/);
 assert.match(vm.runInContext('marketingBeneficiosNav("lista")',setup().ctx),/data-tab="tarjeta"/);
 const soloPuntos=setup(['fidelizacion']).ctx;
 const html=vm.runInContext('marketingBeneficiosNav("puntos")',soloPuntos);
 assert.match(html,/data-tab="puntos"/);assert.doesNotMatch(html,/data-tab="lista"|data-tab="tarjeta"/);
});
test('sin permiso de campañas los accesos no ejecutan ningún cargador',()=>{
 const {ctx,calls}=setup(['promos']);vm.runInContext('marketingCampTab("envios")',ctx);assert.deepEqual(calls,[]);
});

test('los enlaces recuperan su pestaña y una URL no ofrece la tarjeta a Marketing',()=>{
 const {ctx}=setup(undefined,'marketing');
 vm.runInContext('marketingRestaurarRuta("promos","captacion")',ctx);assert.equal(ctx.PROMO.tab,'captacion');
 vm.runInContext('marketingRestaurarRuta("promos","tarjeta")',ctx);assert.equal(ctx.PROMO.tab,'lista');
 vm.runInContext('marketingRestaurarRuta("fidelizacion","reglas")',ctx);assert.equal(ctx.FIDV.seccion,'reglas');
 vm.runInContext('marketingRestaurarRuta("fidelizacion","inventada")',ctx);assert.equal(ctx.FIDV.seccion,'resumen');
});
test('quien solo tiene promociones conserva acceso a captación',async()=>{
 const {ctx,calls}=setup(['promos']);
 assert.match(vm.runInContext('marketingBeneficiosNav("lista")',ctx),/data-tab="captacion"/);
 await vm.runInContext('marketingCampTab("captacion")',ctx);assert.deepEqual(calls,['promos']);
});
