// Cuándo toca sincronizar las ventas del TPV.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { debeSincronizar, edadMinutos, siguebloqueado, VENTANA_MS } from "../../src/modules/agora/programacion.js";

const AHORA = Date.parse("2026-08-17T12:00:00Z");
const haceMin = (m) => new Date(AHORA - m * 60000).toISOString();

describe("«nunca más viejo de 15 minutos», no «cada 15 minutos»", () => {
  test("nunca sincronizado: se sincroniza", () => {
    assert.equal(debeSincronizar({ lastSync: null, ahora: AHORA }).sincronizar, true);
    assert.equal(debeSincronizar({ lastSync: null, ahora: AHORA }).motivo, "nunca");
  });

  test("hace tres minutos: no", () => {
    const r = debeSincronizar({ lastSync: haceMin(3), ahora: AHORA });
    assert.equal(r.sincronizar, false);
    assert.equal(r.motivo, "reciente");
    assert.equal(r.edadMin, 3);
  });

  test("hace veinte: sí", () => {
    assert.equal(debeSincronizar({ lastSync: haceMin(20), ahora: AHORA }).sincronizar, true);
  });

  test("justo en el filo cuenta como antiguo", () => {
    assert.equal(debeSincronizar({ lastSync: new Date(AHORA - VENTANA_MS).toISOString(), ahora: AHORA }).sincronizar, true);
  });
});

describe("los casos que estropean un temporizador", () => {
  test("si ya hay una en curso, no se lanza otra encima", () => {
    // `agora_last_sync` se escribe al TERMINAR: durante una sync larga sigue siendo viejo, y
    // sin esta comprobación cada visita lanzaría otra.
    const r = debeSincronizar({ lastSync: haceMin(60), ahora: AHORA, enCurso: true });
    assert.equal(r.sincronizar, false);
    assert.equal(r.motivo, "en-curso");
  });

  test("y ni siquiera el botón manual se salta una en curso", () => {
    assert.equal(debeSincronizar({ lastSync: null, ahora: AHORA, enCurso: true, forzar: true }).sincronizar, false);
  });

  test("el botón manual sí se salta la ventana de 15 minutos", () => {
    // Es un botón que se pulsa a propósito: tiene que hacer algo aunque acabe de sincronizar.
    assert.equal(debeSincronizar({ lastSync: haceMin(1), ahora: AHORA, forzar: true }).sincronizar, true);
  });

  test("una fecha que no se entiende no congela la sincronización", () => {
    assert.equal(debeSincronizar({ lastSync: "ayer por la tarde", ahora: AHORA }).sincronizar, true);
  });

  test("un reloj algo adelantado no dispara una sync por cada visita", () => {
    assert.equal(debeSincronizar({ lastSync: haceMin(-5), ahora: AHORA }).sincronizar, false);
  });

  test("pero uno MUY adelantado no puede dejarlo congelado para siempre", () => {
    assert.equal(debeSincronizar({ lastSync: haceMin(-120), ahora: AHORA }).sincronizar, true);
  });
});

describe("el candado de la base caduca solo", () => {
  test("recién puesto, bloquea", () => {
    assert.equal(siguebloqueado(haceMin(1), AHORA), true);
  });

  test("pasados cinco minutos, ya no", () => {
    // Es lo que salva un reinicio a media sync: un booleano se quedaría en `true` para siempre
    // y no se volvería a sincronizar nunca.
    assert.equal(siguebloqueado(haceMin(6), AHORA), false);
  });

  test("y sin marca, no bloquea", () => {
    assert.equal(siguebloqueado(null, AHORA), false);
    assert.equal(siguebloqueado("cualquier cosa", AHORA), false);
  });

  test("edadMinutos dice null cuando no se sabe", () => {
    assert.equal(edadMinutos(null), null);
    assert.equal(edadMinutos(haceMin(7), AHORA), 7);
  });
});

describe("dónde vive el aviso del panel", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("NO cuelga de /api/agora, que exigiría el módulo de analítica", () => {
    // El mapa de permisos manda todo lo que empiece por /api/agora al módulo «analitica»: un
    // encargado sin analítica se comería un 403 nada más abrir el panel.
    assert.match(server, /app\.post\("\/api\/ventas\/sync-ping"/);
    assert.match(panel, /fetch\("\/api\/ventas\/sync-ping"/);
    assert.doesNotMatch(panel, /fetch\("\/api\/agora\/[^"]*ping/);
  });

  test("y lo puede llamar cualquiera que haya entrado", () => {
    const i = server.indexOf('app.post("/api/ventas/sync-ping"');
    assert.match(server.slice(i, i + 120), /requireAuth\(\[\]\)/);
  });

  test("el panel no espera al aviso ni enseña errores por él", () => {
    // Es un recado de fondo: si Ágora está caído no es asunto de quien entra a ver reservas.
    const i = panel.indexOf('fetch("/api/ventas/sync-ping"');
    const linea = panel.slice(i, panel.indexOf("\n", i));
    assert.match(linea, /method: "POST"/);
    assert.match(linea, /\.catch\(\(\) => \{\}\);?$/, "sin catch, un fallo de red saldría por consola cada vez que se entra");
    assert.doesNotMatch(linea, /await|apiSend|toast/, "no puede esperar ni avisar: es un recado de fondo");
  });

  test("la sincronización lleva candado y no se llama ya sin él", () => {
    assert.match(server, /let _agoraEnCurso = null;/);
    assert.match(server, /if \(_agoraEnCurso\) return _agoraEnCurso;/);
    // Fuera del propio `lanzarAgoraSync`, nadie llama a runAgoraSync a pelo.
    const llamadas = [...server.matchAll(/runAgoraSync\(\)/g)].length;
    assert.equal(llamadas, 2, "runAgoraSync solo se llama desde lanzarAgoraSync (más su declaración)");
  });
});
