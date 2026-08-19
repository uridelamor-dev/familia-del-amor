import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// EL FALLO: entrar al panel, pulsar Equipo (o Fichajes) y aparecer en la pantalla de login,
// sin mensaje ni explicación. Reproducido con el servidor de verdad y Chrome:
//
//   403 /api/rrhh/atencion?local=     → borrado del token → /login.html
//   403 /api/fichajes/hoy?local=      → borrado del token → /login.html
//
// Eran dos cosas encadenadas, y las dos se cierran aquí:
//
//  1. `fueraDeSesion()` trataba el 403 igual que el 401. No son lo mismo: 401 es «no sé quién
//     eres» (token caducado, y volver a entrar es lo único que se puede hacer) y 403 es «sé
//     quién eres y esto no es para ti». Cerrar la sesión por un 403 convierte cualquier
//     permiso denegado —en cualquier pantalla del panel— en una expulsión sin mensaje.
//
//  2. Con «Todos los establecimientos» puesto en la barra, `localActualFE()` devuelve "" y
//     esas pantallas pedían `?local=` vacío. El cuadrante, quién está dentro y la bandeja de
//     atención son de UN local: se pregunta cuál antes de pedir nada.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("un 403 no te echa del panel", () => {
  test("fueraDeSesion() solo actúa ante un 401", () => {
    const i = panel.indexOf("async function fueraDeSesion(");
    assert.notEqual(i, -1, "no está fueraDeSesion()");
    const cuerpo = panel.slice(i, panel.indexOf("\n}", i));
    assert.match(cuerpo, /r\.status !== 401/, "tiene que mirar el 401");
    assert.ok(!/403/.test(cuerpo), "el 403 NO puede cerrar la sesión: es «esto no es para ti», no «no sé quién eres»");
  });

  test("y es el único sitio que borra el token, aparte del botón de salir", () => {
    const veces = (panel.match(/localStorage\.removeItem\("token"\)/g) || []).length;
    assert.ok(veces <= 2, `el token se borra en ${veces} sitios; la regla se decide en uno`);
  });
});

describe("las pantallas de un solo local preguntan cuál antes de pedir nada", () => {
  const guarda = (fn, marca) => {
    const i = panel.indexOf(fn);
    assert.notEqual(i, -1, `no está ${fn}`);
    const cuerpo = panel.slice(i, i + 2600);
    assert.ok(cuerpo.includes("pideEstablecimiento("), `${fn} debe ofrecer elegir establecimiento`);
    const iGuarda = cuerpo.indexOf("pideEstablecimiento(");
    const iPide = cuerpo.indexOf(marca);
    assert.ok(iPide === -1 || iGuarda < iPide, `${fn} pide a la API (${marca}) antes de tener local`);
  };

  test("Fichajes no llama con el local vacío", () => guarda("async function loadFichajes(", "apiRaw"));
  test("Horarios no llama con el local vacío", () => guarda("async function loadHorarios(", "apiRaw"));
  test("La bandeja de Equipo no llama con el local vacío", () => guarda("async function rrPintarAtencion(", "/api/rrhh/atencion"));

  test("el selector trae los botones, no un «búscalo arriba en la barra»", () => {
    const i = panel.indexOf("function pideEstablecimiento(");
    assert.notEqual(i, -1);
    const cuerpo = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(cuerpo, /data-act="estab-pick"/, "sin el botón, la pantalla es un callejón sin salida");
    assert.match(cuerpo, /localesBase\(\)/, "la lista es la misma que la de la barra");
    assert.match(cuerpo, /min-height:44px/, "en el móvil se pulsa con el dedo");
  });
});
