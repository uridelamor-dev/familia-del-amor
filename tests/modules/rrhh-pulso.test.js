import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  K_ANON, MIN_GLOBAL, mediaSegura, agregarPorLocal, serieMensual,
  puedeMostrarComentarios, barajar, mesAnterior, ultimosMeses, finDePlazo,
  generarToken, hashToken,
} from "../../src/modules/rrhh/pulso.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Genera n respuestas de un local con puntuaciones fijas
const r = (local, n, p1 = 4, p2 = 4) => Array.from({ length: n }, () => ({ local, p1, p2, p3: null, mes: "2026-08" }));

describe("pulso.mediaSegura", () => {
  test("ignora los huecos en vez de contarlos como cero", () => {
    assert.equal(mediaSegura([5, null, 3, undefined]), 4);
  });
  test("sin datos devuelve null, no 0 (0 sería 'están fatal')", () => {
    assert.equal(mediaSegura([]), null);
    assert.equal(mediaSegura([null, null]), null);
  });
});

describe("pulso.agregarPorLocal — la promesa de anonimato", () => {
  test("no expone un local con 3 respuestas", () => {
    const datos = [...r("Blanes", 10), ...r("Lloret", 8), ...r("Girona", 3)];
    const out = agregarPorLocal(datos);
    assert.equal(out.locales.some((l) => l.local === "Girona"), false);
  });

  test("suprime un segundo local si solo uno cae bajo el umbral", () => {
    // Girona (3) queda oculto. Si fuera el único, su media se despejaría restando
    // del total, así que debe ocultarse también el menor de los visibles (Lloret).
    const datos = [...r("Blanes", 10), ...r("Lloret", 5), ...r("Girona", 3)];
    const out = agregarPorLocal(datos);
    const visibles = out.locales.map((l) => l.local);
    assert.deepEqual(visibles, ["Blanes"]);
    assert.equal(out.suprimidos.nLocales, 2);
  });

  test("el agregado suprimido no permite despejar el local oculto por resta", () => {
    // Con dos grupos ocultos, saber su media conjunta no basta para separar ninguno.
    const datos = [...r("Blanes", 10, 5, 5), ...r("Lloret", 6, 4, 4), ...r("Girona", 3, 1, 1), ...r("CanMateu", 2, 2, 2)];
    const out = agregarPorLocal(datos);
    assert.ok(out.suprimidos.nLocales >= 2, "debe haber al menos 2 grupos suprimidos");
    // La media suprimida es una mezcla: no coincide con la de ninguno de los ocultos
    assert.notEqual(out.suprimidos.p1, 1);
    assert.notEqual(out.suprimidos.p1, 2);
  });

  test("no dice CUÁLES son los locales suprimidos, solo cuántos", () => {
    const datos = [...r("Blanes", 10), ...r("Girona", 3), ...r("CanMateu", 2)];
    const out = agregarPorLocal(datos);
    const json = JSON.stringify(out);
    assert.equal(json.includes("Girona"), false);
    assert.equal(json.includes("CanMateu"), false);
  });

  test("con pocas respuestas en todo el mes no se enseña nada", () => {
    const out = agregarPorLocal(r("Blanes", MIN_GLOBAL - 1));
    assert.equal(out.suficiente, false);
    assert.deepEqual(out.locales, []);
    assert.equal(out.suprimidos, null);
  });

  test("un local justo en el umbral sí se ve", () => {
    const datos = [...r("Blanes", K_ANON), ...r("Lloret", K_ANON)];
    const out = agregarPorLocal(datos);
    assert.deepEqual(out.locales.map((l) => l.local).sort(), ["Blanes", "Lloret"]);
    assert.equal(out.suprimidos, null);
  });

  test("cuenta siempre cuántas respuestas hay detrás de cada media", () => {
    const out = agregarPorLocal([...r("Blanes", 7), ...r("Lloret", 6)]);
    for (const l of out.locales) assert.ok(l.n >= K_ANON, `${l.local} sin n`);
  });
});

describe("pulso.serieMensual", () => {
  test("un mes flojo sale sin media en vez de con un número inventado", () => {
    const datos = [...r("Blanes", 8).map((x) => ({ ...x, mes: "2026-07" })), ...r("Blanes", 2)];
    const s = serieMensual(datos, ["2026-07", "2026-08"]);
    assert.ok(s[0].media != null);
    assert.equal(s[1].media, null);
    assert.equal(s[1].suficiente, false);
  });
});

describe("pulso.comentarios", () => {
  test("no se muestran si el mes tiene menos del mínimo", () => {
    assert.equal(puedeMostrarComentarios(MIN_GLOBAL - 1), false);
    assert.equal(puedeMostrarComentarios(MIN_GLOBAL), true);
  });
  test("barajar no pierde ni duplica comentarios", () => {
    const orig = ["a", "b", "c", "d", "e"];
    const out = barajar(orig, () => 0.5);
    assert.deepEqual([...out].sort(), [...orig].sort());
    assert.deepEqual(orig, ["a", "b", "c", "d", "e"], "no debe mutar el original");
  });
});

describe("pulso.calendario", () => {
  test("mes anterior cruzando el año", () => {
    assert.equal(mesAnterior("2026-01"), "2025-12");
    assert.equal(mesAnterior("2026-08"), "2026-07");
    assert.equal(mesAnterior("basura"), null);
  });
  test("últimos meses en orden", () => {
    assert.deepEqual(ultimosMeses("2026-02", 3), ["2025-12", "2026-01", "2026-02"]);
  });
  test("caducidad = fin de mes + gracia, cruzando meses y años", () => {
    assert.equal(finDePlazo("2026-08"), "2026-09-10");   // agosto 31 + 10
    assert.equal(finDePlazo("2026-02"), "2026-03-10");   // febrero 28 + 10
    assert.equal(finDePlazo("2024-02"), "2024-03-10");   // bisiesto: 29 + 10
    assert.equal(finDePlazo("2026-12"), "2027-01-10");   // cruza el año
  });
});

describe("pulso.tokens", () => {
  test("el token es largo, urlsafe y distinto cada vez", () => {
    let i = 0;
    const t1 = generarToken(() => Buffer.alloc(32, i++));
    const t2 = generarToken(() => Buffer.alloc(32, i++));
    assert.notEqual(t1, t2);
    assert.ok(t1.length >= 40, "demasiado corto para no ser adivinable");
    assert.match(t1, /^[A-Za-z0-9_-]+$/, "debe poder ir en una URL sin escapar");
  });
  test("se guarda el hash, no el token", () => {
    const h = hashToken("abc", (s) => "sha(" + s + ")");
    assert.equal(h, "sha(abc)");
  });
});

// ── El candado: impide que dentro de seis meses alguien cruce las dos tablas ──
describe("pulso — separación estructural de las dos tablas", () => {
  const server = fs.readFileSync(path.join(RAIZ, "server.js"), "utf8");

  test("pulso_respuestas no guarda worker_id, token ni fecha", () => {
    const m = /CREATE TABLE IF NOT EXISTS pulso_respuestas\s*\(([\s\S]*?)\)\s*`/.exec(server);
    assert.ok(m, "no encuentro el CREATE TABLE de pulso_respuestas");
    const cuerpo = m[1].toLowerCase();
    for (const prohibido of ["worker_id", "token", "usuario", "user_id", "telefono", "creado_en", "timestamp"]) {
      assert.equal(cuerpo.includes(prohibido), false,
        `pulso_respuestas NO puede tener "${prohibido}": es lo que permitiría saber quién dijo qué`);
    }
  });

  test("ninguna consulta menciona las dos tablas a la vez", () => {
    // Solo lo que va DENTRO de plantillas (índices impares al partir por backtick): los
    // comentarios que explican el diseño sí nombran ambas, y eso es deseable.
    const dentro = server.split("`").filter((_, i) => i % 2 === 1);
    const culpables = dentro
      .filter((t) => t.includes("pulso_respuestas") && t.includes("pulso_invitaciones"))
      .map((t) => t.replace(/\s+/g, " ").trim().slice(0, 120));
    assert.deepEqual(culpables, [],
      "una consulta que toque las dos tablas rompe el anonimato por construcción");
  });

  test("las peticiones de hablar tampoco se pueden cruzar con las respuestas", () => {
    // pulso_contactos SÍ lleva nombre (la persona lo dio a propósito). Justo por eso no
    // puede aparecer nunca en la misma consulta que las respuestas anónimas.
    const dentro = server.split("`").filter((_, i) => i % 2 === 1);
    const culpables = dentro
      .filter((t) => t.includes("pulso_respuestas") && t.includes("pulso_contactos"))
      .map((t) => t.replace(/\s+/g, " ").trim().slice(0, 120));
    assert.deepEqual(culpables, [],
      "cruzar las peticiones de hablar con las respuestas pondría nombre a lo anónimo");
  });

  test("no hay endpoint que devuelva respuestas individuales", () => {
    // Todo SELECT sobre pulso_respuestas debe agregar (COUNT/AVG/SUM) o pedir solo
    // las columnas públicas para agregarlas en el módulo puro.
    const selects = [...server.matchAll(/SELECT([\s\S]*?)FROM\s+pulso_respuestas/gi)].map((m) => m[1].toLowerCase());
    assert.ok(selects.length > 0, "esperaba al menos una consulta de lectura");
    for (const s of selects) {
      const agrega = /count\(|avg\(|sum\(/.test(s);
      const soloPublicas = !/worker|token|telefono|nombre/.test(s);
      assert.ok(agrega || soloPublicas, `SELECT sospechoso sobre pulso_respuestas: ${s.trim().slice(0, 80)}`);
    }
  });
});

describe("el enlace del pulso no caduca", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("ni para abrir el formulario ni para contestar", () => {
    // El plazo se probó como caducidad y el resultado es que quien estaba de vacaciones o de
    // baja justo esos diez días se quedaba sin voz ese mes — que es exactamente la persona
    // cuya opinión más falta hace.
    const publico = server.slice(server.indexOf('app.get("/api/pulso/:token"'), server.indexOf("// Público: «quiero que hablemos»"));
    assert.doesNotMatch(publico, /caduca_en < hoy\) (return res\.status\(410\)|\{ await client)/);
    assert.match(publico, /fueraDePlazo/, "pero sí se dice que llega tarde");
  });

  test("y el plazo sigue sirviendo para dejar de dar la lata con recordatorios", () => {
    // Ese uso sí tiene sentido: insistir eternamente por WhatsApp, no.
    const recordatorios = server.slice(server.indexOf("async function despacharPulsoPendientes"));
    assert.match(recordatorios.slice(0, 600), /i\.caduca_en >= \?/);
  });

  test("la respuesta tardía NO se marca: en un equipo pequeño eso señala a alguien", () => {
    // `pulso_respuestas` no tiene fecha a propósito. Un «esta llegó fuera de plazo» sería una
    // fecha encubierta, y quien estuvo de baja ese mes es identificable.
    const post = server.slice(server.indexOf('app.post("/api/pulso/:token"'), server.indexOf("// Público: «quiero que hablemos»"));
    assert.doesNotMatch(post, /INSERT INTO pulso_respuestas[^;]*tarde/i);
  });

  test("y el trabajador puede pedir su enlace aunque haya pasado el plazo", () => {
    const mi = server.slice(server.indexOf('app.post("/api/pulso/mi-enlace"'), server.indexOf('app.post("/api/pulso/mi-enlace"') + 1200);
    assert.doesNotMatch(mi, /El plazo de este mes ya ha pasado/);
    assert.match(mi, /Ya has contestado este mes/, "lo que sí sigue: no contestar dos veces");
  });
});
