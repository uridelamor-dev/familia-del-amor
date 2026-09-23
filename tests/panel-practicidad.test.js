import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resultadoRegistrado } from '../src/modules/dashboard/resultado.js';
import { fusionarPeriodo } from '../src/modules/dashboard/fusion.js';
import { fusionarGrupos } from '../src/modules/facturas/compras-fusion.js';

const panel = readFileSync(new URL('../public/panel/app.js', import.meta.url), 'utf8');
function bloque(inicio, fin) {
  const a = panel.indexOf(inicio), b = panel.indexOf(fin, a + inicio.length);
  assert.ok(a >= 0 && b > a);
  return panel.slice(a, b);
}
function entornoDashboard() {
  const view = { innerHTML: '' };
  const ctx = vm.createContext({
    document: { getElementById: () => view }, CURRENT: 'dashboard', PERIOD: 'semana',
    DASH_RANGE: { from: '2026-09-21', to: '2026-09-22', label: 'Esta semana' },
    DASH_PERIODO: null, DASH_PERIODO_ESTADO: 'cargando', DASH_CARGA: 0,
    USER: { nombre: 'Dirección' }, local: '', GO_VIEW: {}, puedeVer: () => true,
    viendoVarios: () => false, localActualFE: () => ctx.local,
    skeleton: () => 'cargando', repintarBarra: () => {}, errorCard: (s) => `ERROR ${s}`,
    fijarPendientes: () => {}, nombreCorto: String, nombreCortoLocal: String,
    saludoHora: () => 'Hola', fechaLarga: String, fechaCorta: String, fechaMini: String,
    esc: (s) => String(s ?? '').replaceAll('<', '&lt;'), num: String, eur: (n) => `${n} €`,
    dec1: String, ic: () => '', deltaMismoDiaSemana: () => null,
    deltaEl: () => '', kpi: () => '', area: () => '', attRow: (c) => c.titulo,
    todayStr: () => '2026-09-22',
  });
  vm.runInContext(bloque('function renderDashboard(d) {', 'async function loadDashboard() {') +
    bloque('async function loadDashboard() {', '// Rango personalizado'), ctx);
  return { ctx, view };
}
const datos = { fecha: '2026-09-22', preocupaciones: [], whatsapp: { connected: true } };
const periodo = (n) => ({ reservas: { total: n, personas: n * 2, serie: [] }, ventas: { disponible: false }, gastos: { disponible: false }, resultado: null });
const diferido = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const turno = () => new Promise((r) => setImmediate(r));

test('inicio: esperar o fallar nunca se muestra como cero reservas', () => {
  const { ctx } = entornoDashboard();
  let html = ctx.renderDashboard(datos);
  assert.match(html, /Cargando datos del periodo/);
  assert.doesNotMatch(html, /Sin reservas en este periodo/);
  ctx.DASH_PERIODO_ESTADO = 'error';
  html = ctx.renderDashboard(datos);
  assert.match(html, /No se han podido cargar/);
  assert.doesNotMatch(html, /al conectar Ágora/);
  ctx.DASH_PERIODO = periodo(0);
  ctx.DASH_PERIODO_ESTADO = 'listo';
  assert.match(ctx.renderDashboard(datos), /Sin reservas en este periodo/);
});

test('inicio: una respuesta del local anterior no sobrescribe el filtro nuevo', async () => {
  const { ctx, view } = entornoDashboard();
  const p1 = diferido(), p2 = diferido(), d1 = diferido(), d2 = diferido();
  const ps = [p1, p2], ds = [d1, d2];
  ctx.apiOptional = (path) => path.startsWith('/api/dashboard/hoy') ? Promise.resolve(null) : ps.shift().promise;
  ctx.api = () => ds.shift().promise;
  ctx.local = 'Blanes'; const l1 = ctx.loadDashboard();
  ctx.local = 'Girona'; const l2 = ctx.loadDashboard();
  p2.resolve(periodo(7)); d2.resolve(datos); await l2; await turno();
  const html = view.innerHTML;
  assert.equal(ctx.DASH_PERIODO.reservas.total, 7);
  p1.resolve(periodo(99)); d1.resolve(datos); await l1; await turno();
  assert.equal(ctx.DASH_PERIODO.reservas.total, 7);
  assert.equal(view.innerHTML, html);
});

test('inicio: cambiar de pantalla invalida las dos respuestas pendientes', async () => {
  const { ctx, view } = entornoDashboard();
  const p = diferido(), d = diferido();
  ctx.apiOptional = () => p.promise; ctx.api = () => d.promise;
  const carga = ctx.loadDashboard(); ctx.CURRENT = 'reservas'; view.innerHTML = 'agenda';
  d.resolve(datos); p.resolve(periodo(8)); await carga; await turno();
  assert.equal(view.innerHTML, 'agenda');
});

test('inicio: fallo del periodo deja el resumen visible con un aviso', async () => {
  const { ctx, view } = entornoDashboard();
  ctx.apiOptional = async () => null; ctx.api = async () => datos;
  await ctx.loadDashboard(); await turno();
  assert.match(view.innerHTML, /No se han podido cargar/);
});

test('las alertas críticas aparecen abiertas antes de los gráficos', () => {
  const { ctx } = entornoDashboard();
  const html = ctx.renderDashboard({ ...datos, preocupaciones: [{ sev: 'crit', titulo: 'Revisar conexión' }] });
  assert.match(html, /class="card fold c7 p0" open/);
  assert.ok(html.indexOf('Necesita tu atención') < html.indexOf('Actividad ·'));
});

test('resultado: datos ausentes no son cero, pero un cero comprobado sí es válido', () => {
  assert.equal(resultadoRegistrado({ disponible: false, total: 0 }, { disponible: true, total: 100 }), null);
  assert.equal(resultadoRegistrado({ disponible: true, total: 300 }, { disponible: false, total: 0 }), null);
  assert.equal(resultadoRegistrado({ disponible: true, total: null }, { disponible: true, total: 10 }), null);
  assert.equal(resultadoRegistrado({ disponible: true, total: 0 }, { disponible: true, total: 0 }), 0);
  assert.equal(resultadoRegistrado({ disponible: true, total: 123.45 }, { disponible: true, total: 23.4 }), 100.05);
});

test('sumar locales no oculta la falta de ventas de uno de ellos', () => {
  const a = { ...periodo(2), ventas: { disponible: true, total: 100 }, gastos: { disponible: true, total: 30 } };
  const b = { ...periodo(3), ventas: { disponible: false, total: 0 }, gastos: { disponible: true, total: 50 } };
  const r = fusionarPeriodo([a, b]);
  assert.equal(r.reservas.total, 5);
  assert.equal(r.ventas.total, 100);
  assert.equal(r.ventas.parcial, true);
  assert.equal(r.resultado, null);
});

test('mezclar kg y unidades impide una comparación de precios engañosa', () => {
  const r = fusionarGrupos([[{ clave: 'aceite', unidad: 'kg', proveedores: [] }], [{ clave: 'aceite', unidad: 'ud', proveedores: [] }]]);
  assert.equal(r[0].unidad, null);
  const ctx = vm.createContext({ eur2: String, esc: String, signed2: String });
  vm.runInContext(bloque('function compChipPrecio(g) {', 'function compCategoriasHtml(g)'), ctx);
  assert.match(ctx.compChipPrecio({ precioNormal: 169, ultimoPrecio: 0.03, unidad: null }), /Revisar/);
  assert.match(ctx.compChipPrecio({ precioNormal: 169, ultimoPrecio: 0.03, unidad: 'kg', dudosas: 1 }), /Revisar/);
  assert.doesNotMatch(ctx.compChipPrecio({ precioNormal: 10, ultimoPrecio: 8, unidad: 'kg', dudosas: 0 }), /Revisar/);
});

test('inventario: sin productos o sin conteos no significa al día', () => {
  const ctx = vm.createContext({ INV: { local: 'Blanes' }, esc: String, num: String, nombreCortoLocal: String, fechaCorta: String, fechaMini: String, invHeader: () => '' });
  vm.runInContext(bloque('function renderInvProveedores(list) {', '/**\n * Los inventarios ya cerrados'), ctx);
  assert.match(ctx.renderInvProveedores([{ n_productos: 0 }]), /Sin productos configurados/);
  assert.match(ctx.renderInvProveedores([{ n_productos: 4 }]), /Sin conteos cerrados/);
  assert.match(ctx.renderInvProveedores([{ n_productos: 4, en_curso: 1 }]), /Inventario en curso/);
});

test('el día del panel coincide con Madrid al cruzar medianoche en verano e invierno', () => {
  const linea = panel.split('\n').find((s) => s.startsWith('const todayStr ='));
  for (const [instante, esperado] of [['2026-09-21T22:30:00Z', '2026-09-22'], ['2026-01-21T23:30:00Z', '2026-01-22']]) {
    class FechaPrueba extends Date { constructor() { super(instante); } }
    const ctx = vm.createContext({ Date: FechaPrueba });
    assert.equal(vm.runInContext(linea + '\ntodayStr()', ctx), esperado);
  }
});

test('inicio: sin comensales solo se oculta esa tarjeta, incluido cero de ventas válido', () => {
  const {ctx}=entornoDashboard(); ctx.kpi=({lab,val})=>`<div>${lab}: ${val}</div>`;
  const html=ctx.renderDashboard({...datos,diario:{hoy:datos.fecha,anterior:'2026-09-15',actual:{ventas:0,tickets:2,ticketMedio:0,comensales:null},variacion:-100}});
  assert.match(html,/Facturación hoy: 0 €/); assert.match(html,/Ticket medio: 0 €/);
  assert.match(html,/Vs. semana pasada/); assert.doesNotMatch(html,/Comensales hoy/);
});
test('inicio: un fallo del resumen no elimina las ventas que sí llegan', async () => {
  const {ctx,view}=entornoDashboard(); ctx.kpi=({lab,val})=>`<div>${lab}: ${val}</div>`;
  ctx.api=async()=>{throw new Error('Failed to fetch')};
  ctx.apiOptional=async(path)=>path.startsWith('/api/dashboard/hoy')?{hoy:datos.fecha,actual:{ventas:123,tickets:3,ticketMedio:41}}:null;
  await ctx.loadDashboard();await turno();
  assert.match(view.innerHTML,/Facturación hoy: 123 €/);
  assert.match(view.innerHTML,/No se ha podido cargar el resto/);
});
