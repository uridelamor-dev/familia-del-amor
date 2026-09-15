// POR QUÉ TODO FALLABA CON «TypeError», Y CÓMO SE DISTINGUE AHORA.
//
// ── EL FALLO REAL ────────────────────────────────────────────────────────────────────────────
//
// Sincronizar el catálogo daba «No se ha podido leer el catálogo: TypeError» en Lloret y en
// Girona —dos locales cuya conexión saliente funciona— exactamente igual que en un local sin
// configurar. Con eso no se puede arreglar nada, y se estuvo mirando la red durante días.
//
// Eran DOS fallos encadenados:
//
//   1. `agora_locales.host` se guarda TAL COMO SE ESCRIBE: `servidor.example.com:8984`, SIN
//      esquema. Quien le pone el `http://` es `normHost()`, y la sincronización leía la columna en
//      crudo. La URL resultante no es absoluta y `fetch` la rechaza.
//
//      Y no se veía venir: un nombre de host con puntos ES un esquema válido de URL, así que
//      `new URL()` no protesta. El fallo aparece al llamar, como «unknown scheme».
//
//   2. `fetch` nativo da TODOS sus fallos como `TypeError: fetch failed` y esconde el motivo en
//      `e.cause`. El redactor de errores devolvía solo `e.name`. Resultado: el TPV apagado, el
//      nombre que no resuelve, el puerto cerrado y el host mal escrito daban la misma palabra.
//
// Este fichero blinda que ninguno de los dos vuelva, y que las seis etapas se distingan.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ETAPAS, MENSAJE_ETAPA, mensajeEtapa, baseValida, codigoConexion, validarMaestro,
         urlMaestro, errorRedactado, RUTA_MAESTRO, normalizarMaestro, compararCatalogo }
  from "../src/modules/fidelizacion/catalogo.js";
import { normHost } from "../src/integrations/agora/registry.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  return server.slice(i, server.indexOf("\n});", i) + 4);
};
const SYNC = ruta('app.post("/api/fidelizacion/catalogo/sincronizar"');
const FETCH = server.slice(server.indexOf("async function agoraFetchMaestro("),
                           server.indexOf('app.get("/api/fidelizacion/catalogo"'));

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("EL FALLO QUE SE ARREGLA: el host sin esquema", () => {
  test("así se guarda de verdad en la base, y así reventaba", () => {
    // Es la forma que tiene el host en `agora_locales`: la que se escribe en el panel.
    const guardado = "servidor.example.com:8984";
    const mala = urlMaestro(guardado);
    assert.ok(!mala.startsWith("http"), `la URL compuesta era «${mala}»`);
    // Y AQUÍ ESTÁ LA TRAMPA: `new URL()` no protesta, porque un host con puntos es un esquema
    // válido. Por eso nadie lo vio hasta que falló en la llamada.
    const u = new URL(mala);
    assert.equal(u.protocol, "servidor.example.com:", "el host se parsea como esquema");
  });

  test("`baseValida` lo caza ANTES de llamar, y dice qué falta", () => {
    const r = baseValida("servidor.example.com:8984");
    assert.equal(r.ok, false);
    assert.match(r.motivo, /tiene que empezar por http:\/\/ o https:\/\//);
  });

  test("con `normHost` la URL sale bien", () => {
    const base = normHost("servidor.example.com:8984");
    assert.equal(base, "http://servidor.example.com:8984");
    assert.equal(baseValida(base).ok, true);
    const u = new URL(urlMaestro(base));
    assert.equal(u.protocol, "http:");
    assert.equal(u.pathname, RUTA_MAESTRO);
    assert.equal(u.port, "8984");
  });

  test("LA SINCRONIZACIÓN USA `normHost`, no la columna en crudo", () => {
    // Es la línea que arregla el fallo. Si alguien vuelve a leer `cfg.host` directamente, esto
    // falla.
    assert.match(SYNC, /const base = agoraNormHost\(cfg\.host\);/);
    assert.match(SYNC, /const mirada = fidBaseValida\(base\);/);
    assert.match(SYNC, /const url = fidUrlMaestro\(base\);/);
    assert.ok(!/fidUrlMaestro\(cfg\.host\)/.test(SYNC), "se vuelve a componer la URL con el host crudo");
  });

  test("y `normHost` es de la casa: hay un solo sitio que sabe normalizar un host", () => {
    const registry = readFileSync(new URL("../src/integrations/agora/registry.js", import.meta.url), "utf8");
    assert.match(registry, /export function normHost\(h\)/);
    assert.equal([...server.matchAll(/function normHost\(/g)].length, 0, "hay una copia en server.js");
  });

  test("normHost aguanta lo que le echen", () => {
    assert.equal(normHost("http://x.com:1/"), "http://x.com:1");
    assert.equal(normHost("https://x.com"), "https://x.com");
    assert.equal(normHost("  x.com  "), "http://x.com");
    assert.equal(normHost(""), "");
    assert.equal(normHost(null), "");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("`fetch` nativo esconde el motivo, y ahora se saca", () => {
  test("el proyecto usa `fetch` nativo, igual que el resto de la integración", () => {
    // No hay cliente HTTP propio: `ejecutarCandidataAgora`, `fetchTextTimeout` y esto usan el
    // mismo `fetch`. No se introduce una segunda forma de llamar.
    assert.match(FETCH, /await fetch\(url, \{ headers: \{ "Api-Token": token, Accept: "application\/json" \}/);
    const paquetes = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    for (const cliente of ["axios", "node-fetch", "got", "undici", "superagent", "request"]) {
      assert.ok(!(paquetes.dependencies || {})[cliente], `se ha añadido ${cliente}`);
    }
  });

  test("EL MOTIVO REAL SALE DE `e.cause`", () => {
    // Es exactamente la forma que tiene un fallo de `fetch` nativo.
    const comoLoDaFetch = (codigo) => {
      const e = new TypeError("fetch failed");
      e.cause = { code: codigo };
      return e;
    };
    for (const codigo of ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "CERT_HAS_EXPIRED",
                          "UND_ERR_CONNECT_TIMEOUT", "EHOSTUNREACH"]) {
      assert.equal(codigoConexion(comoLoDaFetch(codigo)), codigo);
    }
  });

  test("y el caso exacto de este fallo: «unknown scheme»", () => {
    const e = new TypeError("fetch failed");
    e.cause = { message: "unknown scheme" };
    assert.equal(codigoConexion(e), "UNKNOWN_SCHEME");
  });

  test("NUNCA devuelve el mensaje entero, que puede llevar la URL", () => {
    // `Failed to parse URL from http://host:8984/api/…?apiToken=…` es un mensaje real de `fetch`.
    const e = new TypeError("fetch failed");
    e.cause = { message: "Failed to parse URL from http://servidor.example.com:8984/api/export-master/" };
    const c = codigoConexion(e);
    assert.ok(!c || !/servidor\.example\.com|8984|export-master/.test(c), `se ha filtrado la URL: ${c}`);
  });

  test("SE RECORRE LA CADENA ENTERA: `fetch` envuelve, y nosotros volvemos a envolver", () => {
    // Mirando un solo nivel se perdían justo los dos códigos que más dicen: ECONNREFUSED (el TPV
    // está apagado o el puerto cerrado) y ENOTFOUND (el nombre no resuelve).
    // 198.51.100.7 es del rango que la RFC 5737 reserva PARA DOCUMENTACIÓN: no existe, no se
    // puede llamar y no se parece a ningún servidor nuestro. Va aquí a propósito, porque lo que
    // este test comprueba es justo que este texto NO sale a ninguna parte.
    const interno = new Error("connect ECONNREFUSED 198.51.100.7:8984");
    interno.code = "ECONNREFUSED";
    const deFetch = new TypeError("fetch failed"); deFetch.cause = interno;
    const nuestro = new Error("conexion"); nuestro.etapa = "conexion_fallida"; nuestro.cause = deFetch;
    assert.equal(codigoConexion(nuestro), "ECONNREFUSED");
    // Y el mensaje interno lleva la dirección: por eso se toma el código, nunca el texto.
    assert.ok(!codigoConexion(nuestro).includes("198.51.100.7"));
  });

  test("y un AggregateError también: pasa cuando un nombre resuelve a varias direcciones", () => {
    const uno = new Error("x"); uno.code = "EHOSTUNREACH";
    const agg = new AggregateError([uno], "todas fallaron");
    const deFetch = new TypeError("fetch failed"); deFetch.cause = agg;
    assert.equal(codigoConexion(deFetch), "EHOSTUNREACH");
  });

  test("un error encadenado consigo mismo no cuelga", () => {
    const a = new Error("a"); a.cause = a;
    assert.equal(codigoConexion(a), null);
  });

  test("un timeout se distingue de un rechazo", () => {
    const abort = new Error("abort"); abort.name = "AbortError";
    assert.equal(codigoConexion(abort), "TIMEOUT");
  });

  test("lo que no se reconoce devuelve null, no una invención", () => {
    assert.equal(codigoConexion(null), null);
    assert.equal(codigoConexion(new Error("vete a saber")), null);
  });

  test("el redactor ya no devuelve «TypeError» a secas", () => {
    const e = new TypeError("fetch failed");
    e.cause = { code: "ECONNREFUSED" };
    const linea = errorRedactado(e, { host: "servidor.example.com:8984", token: "SECRETO" });
    assert.match(linea, /TypeError/);
    assert.match(linea, /ECONNREFUSED/, "sigue sin decir el motivo");
  });

  test("y sigue tapando el host y el token si se colaran", () => {
    const e = new Error("x"); e.code = "host servidor.example.com:8984 con token SECRETO";
    const linea = errorRedactado(e, { host: "servidor.example.com:8984", token: "SECRETO" });
    assert.ok(!linea.includes("servidor.example.com"), linea);
    assert.ok(!linea.includes("SECRETO"), linea);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("LAS SEIS ETAPAS", () => {
  test("son las seis acordadas, en orden y congeladas", () => {
    assert.deepEqual([...ETAPAS], ["conexion_fallida", "http_no_ok", "respuesta_no_json",
      "estructura_invalida", "normalizacion_fallida", "persistencia_fallida"]);
    assert.throws(() => { ETAPAS.push("x"); }, TypeError);
  });

  test("cada una tiene su mensaje, y dice QUÉ MIRAR", () => {
    for (const e of ETAPAS) {
      const m = MENSAJE_ETAPA[e];
      assert.ok(m && m.length > 40, `${e} sin mensaje útil`);
      assert.ok(!/TypeError|undefined|null/.test(m), `${e} enseña algo técnico: ${m}`);
    }
    assert.equal(Object.keys(MENSAJE_ETAPA).length, ETAPAS.length);
  });

  test("NINGÚN MENSAJE LLEVA URL, HOST, TOKEN NI CUERPO", () => {
    for (const m of Object.values(MENSAJE_ETAPA)) {
      assert.ok(!/https?:\/\/|\d{4}\b|Api-Token: |token=|filter=/.test(m), m);
    }
  });

  test("una etapa inventada no inventa mensaje", () => {
    assert.equal(mensajeEtapa("lo_que_sea"), "No se ha podido sincronizar el catálogo.");
    assert.equal(mensajeEtapa(null), "No se ha podido sincronizar el catálogo.");
  });

  test("la llamada marca las tres primeras", () => {
    assert.match(FETCH, /x\.etapa = "conexion_fallida";/);
    assert.match(FETCH, /e\.etapa = "http_no_ok"; e\.status = r\.status;/);
    assert.match(FETCH, /e\.etapa = "respuesta_no_json";/);
  });

  test("y la ruta marca las otras tres", () => {
    for (const etapa of ["estructura_invalida", "normalizacion_fallida", "persistencia_fallida"]) {
      assert.ok(SYNC.includes(`"${etapa}"`), `la ruta no marca ${etapa}`);
    }
  });

  test("HTML se distingue de «no es JSON»: es el caso del puerto de administración", () => {
    // El :8984 sirve la web y devuelve HTML con un 200. Sin esto parecía que todo iba bien.
    assert.match(FETCH, /e\.code = \/html\/i\.test\(tipo\) \|\| String\(texto\)\.trimStart\(\)\.startsWith\("<"\) \? "HTML" : "NO_JSON";/);
  });

  test("y de la respuesta no se guarda ni un byte", () => {
    // Solo el tipo declarado y si empieza por `<`. El cuerpo puede llevar datos de clientes.
    const tras = FETCH.slice(FETCH.indexOf('e.etapa = "respuesta_no_json"'));
    assert.ok(!/texto\.slice|bodySample|cuerpo: texto|= texto\b/.test(tras), tras.slice(0, 200));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("ESTRUCTURA INVÁLIDA: lo que evitaba un desastre silencioso", () => {
  test("`normalizarMaestro` es tolerante a propósito: acepta cualquier cosa", () => {
    // Por eso hace falta validar ANTES. Esto no es un fallo del normalizador: es su contrato.
    for (const basura of [null, [], "hola", {}, { Products: "x" }]) {
      const r = normalizarMaestro(basura, { local: "X" });
      assert.equal(r.productos.length, 0, JSON.stringify(basura));
    }
  });

  test("Y LO QUE DESAPARECE SE MARCA INACTIVO: juntos, borraban el catálogo entero", () => {
    // Esta es la prueba del desastre que se evita. Sin la validación de estructura, una respuesta
    // vacía pero válida habría dejado el catálogo en blanco sin ningún error registrado.
    const actuales = [{ producto_id: "1", nombre: "Cafè", activo: true },
                      { producto_id: "2", nombre: "Croissant", activo: true }];
    const vacio = normalizarMaestro({}, { local: "X" });
    const dif = compararCatalogo(actuales, vacio.productos);
    assert.equal(dif.inactivados.length, 2, "ya no desactivaría todo (¿ha cambiado comparar?)");
  });

  test("por eso se bloquea cero productos cuando hay activos", () => {
    assert.equal(validarMaestro({ Products: [] }, { activosAhora: 40 }).ok, false);
    assert.match(validarMaestro({ Products: [] }, { activosAhora: 40 }).detalle, /cero productos/);
    // Un catálogo legítimamente vacío en un local que no tenía nada sí pasa.
    assert.equal(validarMaestro({ Products: [] }, { activosAhora: 0 }).ok, true);
  });

  test("se exige la forma documentada de la guía", () => {
    assert.equal(validarMaestro({ Products: [{ Id: 1 }] }).ok, true);
    for (const malo of [null, undefined, [], "texto", 7, {}, { products: [] }, { Products: "x" },
                        { Products: [], Vats: "no-lista" }]) {
      assert.equal(validarMaestro(malo, { activosAhora: 0 }).ok, false, JSON.stringify(malo));
    }
  });

  test("y el detalle dice qué falta, sin enseñar nada", () => {
    assert.match(validarMaestro({}).detalle, /no viene «Products»/);
    assert.match(validarMaestro({ Products: {} }).detalle, /no es una lista/);
    assert.match(validarMaestro("<html>").detalle, /no es un objeto/);
    for (const m of [validarMaestro({}), validarMaestro([]), validarMaestro("x")]) {
      assert.ok(!/https?:\/\/|token/i.test(m.detalle), m.detalle);
    }
  });

  test("la ruta valida ANTES de normalizar y de guardar", () => {
    const iVal = SYNC.indexOf("fidValidarMaestro(json");
    const iNorm = SYNC.indexOf("fidNormalizarMaestro(json");
    const iGuardar = SYNC.indexOf("INSERT INTO fid_productos");
    assert.ok(iVal > 0 && iNorm > iVal, "se normaliza antes de validar la forma");
    assert.ok(iGuardar > iVal, "se guarda antes de validar la forma");
    assert.match(SYNC, /const activosAhora = actuales\.filter\(\(p\) => p\.activo\)\.length;/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("un fallo no toca ningún producto, y queda registrado", () => {
  test("cada etapa sale ANTES de escribir en fid_productos", () => {
    const iGuardar = SYNC.indexOf("INSERT INTO fid_productos");
    for (const etapa of ["conexion_fallida", "estructura_invalida", "normalizacion_fallida"]) {
      const i = SYNC.indexOf(`etapa: "${etapa}"`);
      assert.ok(i > 0 && i < iGuardar, `${etapa} puede llegar a escribir productos`);
    }
  });

  test("se registra en un solo sitio, con su etapa", () => {
    // Seis `INSERT` copiados serían cinco oportunidades de olvidarse de uno.
    assert.match(server, /async function fidRegistrarFalloSync\(local, etapa, detalle, t0, autor\)/);
    const reg = server.slice(server.indexOf("async function fidRegistrarFalloSync("),
                             server.indexOf("async function agoraFetchMaestro("));
    assert.match(reg, /INSERT INTO fid_sincronizaciones \(local, ok, etapa, error, ms, lanzado_por, creado_en\)/);
    assert.match(reg, /VALUES \(\?,FALSE,\?,\?,\?,\?,\?\)/);
    // Y si el propio registro falla, no tumba la respuesta.
    assert.match(reg, /catch \(e\) \{ console\.error\(lineaErrorSql/);
  });

  test("la columna existe y es aditiva", () => {
    assert.match(esquema, /ALTER TABLE fid_sincronizaciones ADD COLUMN IF NOT EXISTS etapa TEXT/);
  });

  test("y el detalle guardado es corto y técnico, nunca la URL ni el cuerpo", () => {
    const reg = server.slice(server.indexOf("async function fidRegistrarFalloSync("),
                             server.indexOf("async function agoraFetchMaestro("));
    assert.match(reg, /String\(detalle\)\.slice\(0, 80\)/);
    assert.match(reg, /\.slice\(0, 200\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("no se expone nada", () => {
  test("NINGUNA RESPUESTA DEVUELVE URL, HOST, TOKEN NI CUERPO", () => {
    // Se recorta cada `res.json(...)` hasta el `});` que lo cierra, para no partir por el primer
    // `}` —que en el 409 de configuración pertenece a un objeto anidado—.
    const respuestas = [];
    // `status(...)` puede llevar un número O UNA VARIABLE (`status(http)`): exigir un número
    // dejaba fuera justo la respuesta de las etapas, que es la que más datos maneja.
    for (const m of SYNC.matchAll(/res(?:\.status\([^)]*\))?\.json\(/g)) {
      const i = m.index + m[0].length;
      respuestas.push(SYNC.slice(i, SYNC.indexOf("});", i)));
    }
    // Son nueve: permisos, el 409 de configuración, las cinco de etapa, la buena y el 500 de
    // reserva. Se fija el número para que una respuesta NUEVA obligue a pasar por aquí.
    assert.equal(respuestas.length, 9, `se han encontrado ${respuestas.length} respuestas, no 9`);

    for (const cuerpo of respuestas) {
      // Los VALORES que no pueden salir nunca.
      for (const fuga of ["url", "cfg.host", "base:", "texto", "json:", "cfg.token"]) {
        assert.ok(!cuerpo.includes(fuga), `una respuesta devuelve ${fuga}: ${cuerpo.trim().slice(0, 80)}`);
      }
      // La palabra «token» puede salir de dos formas LEGÍTIMAS, y de ninguna otra:
      //   · «Api-Token» dentro de una frase, que es el nombre de la cabecera que hay que rellenar.
      //   · `token: !token`, un booleano que dice si FALTA — nunca cuál es.
      // Se quitan esas dos y, si después queda algún «token», es que sale su valor.
      const sinUsosLegitimos = cuerpo
        .replace(/Api-Token/g, "")
        .replace(/token: !token/g, "")
        .replace(/!token/g, "");
      assert.ok(!/token/i.test(sinUsosLegitimos),
        `el token sale como valor: ${cuerpo.trim().slice(0, 100)}`);
    }
  });

  test("y el 409 de configuración sigue diciendo solo QUÉ FALTA", () => {
    assert.match(SYNC, /falta: \{ host: !cfg\?\.host, token: !token \}/);
    assert.ok(!/error:[^\n]*cfg\.host/.test(SYNC), "se devuelve el host configurado");
  });

  test("los registros pasan todos por el mecanismo redactado", () => {
    for (const m of SYNC.split("\n").filter((l) => !/^\s*\/\//.test(l))
                       .join("\n").matchAll(/console\.(log|error|warn)\(([^\n]*)/g)) {
      assert.match(m[2], /^lineaErrorSql\(/, `registro a pelo: ${m[2]}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("el panel lo explica", () => {
  test("hay una explicación por etapa, con qué mirar", () => {
    const bloque = app.slice(app.indexOf("const FIDG_ETAPAS = {"), app.indexOf("function fidgFalloSync("));
    for (const e of ETAPAS) assert.ok(bloque.includes(`${e}:`), `el panel no explica ${e}`);
    assert.match(bloque, /8984 sirve la web, no la API/);
    assert.match(bloque, /404 es ruta, 401 y 403 son permiso/);
  });

  test("y se enseña en una ventana, no en un aviso que se va solo", () => {
    // Es el momento en que alguien está intentando averiguar por qué no entra el catálogo.
    assert.match(app, /function fidgFalloSync\(local, e\)/);
    assert.match(app, /modal\("Sincronización del catálogo"/);
    assert.match(app, /No se ha modificado ningún producto/);
  });

  test("la etapa y el detalle llegan hasta la pantalla", () => {
    assert.match(app, /if \(j\.etapa\) e\.etapa = j\.etapa;/);
    assert.match(app, /if \(j\.detalle\) e\.detalle = j\.detalle;/);
  });

  test("y la última sincronización fallida enseña su etapa", () => {
    assert.match(app, /u\.etapa \|\| u\.error/);
  });
});
