import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { grupoDeSQL } from '../src/modules/facturas/lineas.js';
import { fusionarGrupos } from '../src/modules/facturas/compras-fusion.js';
import { noEsProducto } from '../src/modules/facturas/no-es-producto.js';
import { unidadComparable } from '../src/modules/facturas/precio-referencia.js';
const source = readFileSync(new URL('../public/panel/app.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ esc: x => String(x).replaceAll('<','&lt;'), num: String, eur2: x => Number(x).toFixed(2)+' €' });
vm.runInContext(source.slice(source.indexOf('function compPrecioUnidad('), source.indexOf('function compChipPrecio(')), ctx);
const group = (extra={}) => grupoDeSQL({ clave:'harina', veces:1, unidades:[null], concantidad:1, conimporte:1, cantidad:2, importe:5.09, ultima:'2026-07-07', ultima_lectura:{cantidad:2,precio:2.545,unidad:null,dudosa:false}, ...extra });
test('harina: la unidad ausente no oculta la lectura ni inventa comparaciones', () => {
 const g=group();
 assert.equal(g.cantidad,null);
 assert.equal(g.ultimoPrecio,null);
 assert.deepEqual(g.precios,[]);
 assert.match(ctx.compCantidadCelda(g), /2 .*Unidad sin indicar/);
 assert.match(ctx.compPrecioCelda(g), /2.54 € · unidad pendiente/);
 assert.equal(g.importe,5.09);
});
test('al juntar locales conserva la compra más reciente, sin sumar unidades desconocidas', () => {
 const g=fusionarGrupos([[group()], [group({ultima:'2026-08-01',ultima_lectura:{cantidad:4,unidad:'caja',precio:8,dudosa:true}})]])[0];
 assert.equal(g.cantidad,null);
 assert.equal(g.ultimaLectura.cantidad,4);
 assert.match(ctx.compCantidadCelda(g), /Última compra.*Lectura por revisar/);
 assert.match(ctx.compPrecioCelda(g), /8.00 €\/caja.*revisar lectura/);
});
test('no recupera un precio antiguo cuando la última lectura no lo tiene', () => {
 const g=fusionarGrupos([[group()], [group({ultima:'2026-08-01',ultima_lectura:{cantidad:null,precio:null,unidad:null}})]])[0];
 assert.match(ctx.compCantidadCelda(g), /Sin cantidad/);
 assert.match(ctx.compPrecioCelda(g), /Sin precio fiable/);
});
test('las notas de recogida se señalan; los artículos y abonos se conservan', () => {
 for(const s of ['recollir caixa','****** G È N E R E A R E T I R A R ******','R E C O L L I R E N V A S O S B U I T S','RC GENERE PENDENT SERVIR DE LA SEVA ULTIMA']) assert.ok(noEsProducto(s),s);
 for(const s of ['CAIXA DE TOMÀQUETS','Fianza envases PR1 retirado','BURGER MEAT MIXTA ABONO']) assert.equal(noEsProducto(s),null,s);
});
test('alias de unidad inequívocos sin convertir cajas en unidades', () => {
 assert.equal(unidadComparable('U.'),'ud');
 assert.equal(unidadComparable('litro'),'l');
 assert.equal(unidadComparable('caja'),null);
});

test('aviso de unidad abre el producto y desaparece cuando consta una unidad', () => {
 assert.match(ctx.compAvisoUnidad(group()), /Configurar unidad/);
 assert.match(ctx.compAvisoUnidad(group()), /data-act="comp-unidad"/);
 assert.equal(ctx.compAvisoUnidad(group({ultima_lectura:{unidad:'kg'}})), '');
});
