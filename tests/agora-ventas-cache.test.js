import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Los importes de ventas por local tardaban en aparecer, en el Dashboard y en Ágora. La causa no
// era la consulta: la caché vivía EN MEMORIA, y en Replit el proceso se reinicia tanto que estaba
// fría casi siempre. Cada visita esperaba a que respondiera cada TPV, en serie y con veinte
// segundos de margen por local. Con ocho establecimientos, eso es mucha pantalla en blanco.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("lo que cuesta pedir se guarda en la BASE, no en memoria", () => {
  test("hay dónde guardarlo", () => {
    assert.match(server, /CREATE TABLE IF NOT EXISTS agora_cache/);
    assert.match(server, /async function cacheLeer\(clave\)/);
    assert.match(server, /async function cacheGuardar\(clave, valor\)/);
  });

  test("las ventas de hoy se leen de ahí antes de ir al TPV", () => {
    const fn = server.slice(server.indexOf("async function ventasVivoData(force)"), server.indexOf('app.get("/api/agora/ventas-vivo"'));
    assert.match(fn, /const dbc = await cacheLeer\(CLAVE_VIVO\)/);
    assert.match(fn, /!tocaRefrescar\(\{ guardadoEn: dbc\.guardadoEn/);
    assert.match(fn, /cacheGuardar\(CLAVE_VIVO, data\)/);
  });

  test("y las del Dashboard también", () => {
    const fn = server.slice(server.indexOf("async function ventasRangoLive(local, from, to)"), server.indexOf("async function runInformeAgora("));
    assert.match(fn, /const dbc = await cacheLeer\(claveRango\(local, from, to\)\)/);
    assert.match(fn, /await cacheGuardar\(claveRango\(local, from, to\), serie\)/);
  });
});

describe("se piden solos cada cuarto de hora", () => {
  test("preguntando cada poco contra una marca guardada, no con un temporizador largo", () => {
    // Un `setInterval` de quince minutos aquí tampoco sería fiable: el proceso se reinicia y la
    // cuenta vuelve a cero. Se pregunta cada cinco y se actúa si han pasado los quince.
    assert.match(server, /setInterval\(calentarVentasVivo, 5 \* 60 \* 1000\)/);
    const fn = server.slice(server.indexOf("async function calentarVentasVivo()"), server.indexOf("setTimeout(calentarVentasVivo"));
    assert.match(fn, /tocaRefrescar\(\{ guardadoEn: dbc\?\.guardadoEn \|\| null[\s\S]{0,80}cadaMin: AG_CACHE_MIN \}\)/);
  });

  test("y sin TPV configurado no se pide nada", () => {
    const fn = server.slice(server.indexOf("async function calentarVentasVivo()"), server.indexOf("setTimeout(calentarVentasVivo"));
    assert.match(fn, /if \(!\(await loadAgoraConfigsActive\(\)\)\.length\) return/);
  });
});

describe("si el TPV no contesta, no se pisa lo bueno con un cero", () => {
  test("en las ventas de hoy", () => {
    // Un cero recién hecho es peor que un número de hace veinte minutos con su hora al lado:
    // el cero se lee como «hoy no se ha vendido nada».
    const fn = server.slice(server.indexOf("async function ventasVivoData(force)"), server.indexOf('app.get("/api/agora/ventas-vivo"'));
    assert.match(fn, /const algo = locales\.some\(\(L\) => !L\.error && \(L\.dias \|\| \[\]\)\.length\)/);
    assert.match(fn, /if \(algo \|\| !dbc\) await cacheGuardar/);
    assert.match(fn, /sinRespuesta: true/);
  });

  test("y en las del Dashboard", () => {
    const fn = server.slice(server.indexOf("async function ventasRangoLive(local, from, to)"), server.indexOf("async function runInformeAgora("));
    assert.match(fn, /if \(dbc && sirveGuardado\(\{ guardadoEn: dbc\.guardadoEn/);
  });
});

describe("y se dice de cuándo es el dato", () => {
  test("en palabras, no en una hora suelta", () => {
    // Un número sin hora no se sabe si es de ahora o de ayer. Y «hace 12 minutos» se entiende
    // sin restar mentalmente.
    assert.match(app, /Datos de \$\{esc\(vivo\.edad/);
    assert.match(app, /se piden solos cada \$\{num\(15\)\} minutos/);
  });

  test("y se avisa cuando lo que se enseña es lo último que se pudo pedir", () => {
    assert.match(app, /el TPV no ha contestado ahora, esto es lo último que se pudo pedir/);
  });
});
