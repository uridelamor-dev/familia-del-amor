// Vida y disponibilidad durante el arranque.
//
// EL INCIDENTE: Replit pide `GET /` en bucle desde que lanza el deployment, y durante ~24 s
// recibía «connection refused». No es que el arranque fuera lento por hacer algo mal: en un
// módulo ESM los `import` se evalúan ANTES que cualquier línea de código, así que ninguna
// instrucción de `server.js` —incluido su `app.listen`— corría hasta tener cargados sus 118
// imports con el árbol de Baileys dentro.
//
// Lo que blindan estos tests es la distinción que arregla eso: VIDA (¿hay alguien atendiendo el
// socket?) y DISPONIBILIDAD (¿puede trabajar de verdad?) son preguntas distintas, y confundirlas
// tiene dos formas de salir mal. Contestar 200 a todo esconde una base caída; exigir la base para
// contestar «estoy vivo» hace que el supervisor reinicie el proceso cuando el problema es otro.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crearArranque } from "../src/modules/arranque/servidor.js";
import { manejadorProvisional, readinessDe, conTiempo, MENSAJE_ARRANCANDO } from "../src/modules/arranque/estado.js";

const PAGINA = "<!doctype html><title>La Tapeta</title>";

/** Los `console.*` que reciben un objeto suelto como argumento de primer nivel. */
function argumentosCrudos(src) {
  const malos = [];
  const re = /console\.(?:log|error|warn|info)\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, hondo = 1, ini = i;
    const args = [];
    for (; i < src.length && hondo > 0; i++) {
      const c = src[i];
      if (c === "(" || c === "[" || c === "{") hondo++;
      else if (c === ")" || c === "]" || c === "}") { hondo--; if (hondo === 0) break; }
      else if (c === "," && hondo === 1) { args.push(src.slice(ini, i)); ini = i + 1; }
    }
    args.push(src.slice(ini, i));
    for (const a of args) if (/^\s*(err|e|error|req|res|app)\s*$/.test(a)) malos.push(a.trim());
  }
  return malos;
}

/** Levanta un servidor de verdad en un puerto libre. `escuchar:false` + listen(0) para no
 *  pelearse por el 5000 con nada. */
async function conServidor(opciones = {}) {
  const a = crearArranque({ puerto: 0, leerIndex: () => PAGINA, escuchar: false, log: () => {}, ...opciones });
  await new Promise((r) => a.servidor.listen(0, r));
  const puerto = a.servidor.address().port;
  return {
    arranque: a,
    puerto,
    pedir: (ruta) => new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port: puerto, path: ruta }, (res) => {
        let cuerpo = "";
        res.on("data", (c) => (cuerpo += c));
        res.on("end", () => resolve({ codigo: res.statusCode, cabeceras: res.headers, cuerpo }));
      });
      req.on("error", reject);
    }),
    cerrar: () => new Promise((r) => a.servidor.close(r)),
  };
}

describe("VIDA: contesta sin base de datos y sin nada más", () => {
  test("/healthz responde 200 al instante, sin que exista ninguna base", async () => {
    // No hay PostgreSQL en este test. Ni pool, ni DATABASE_URL, ni esquema. Ése es el punto:
    // la vida del proceso no puede depender de nada externo.
    const s = await conServidor();
    const t = Date.now();
    const r = await s.pedir("/healthz");
    const tardanza = Date.now() - t;
    assert.equal(r.codigo, 200);
    assert.equal(r.cuerpo, "ok");
    assert.ok(tardanza < 200, `ha tardado ${tardanza} ms`);
    await s.cerrar();
  });

  test("la página pública se sirve desde el primer instante", async () => {
    // `/` es lo que comprueba Replit, y es un fichero estático que nunca dependió de la base.
    // Durante el arranque se sirve LA MISMA que después: no se finge un 200, se contesta lo que
    // esa ruta contesta siempre.
    const s = await conServidor();
    const r = await s.pedir("/");
    assert.equal(r.codigo, 200);
    assert.equal(r.cuerpo, PAGINA);
    assert.match(r.cabeceras["content-type"], /text\/html/);
    await s.cerrar();
  });

  test("sin página pública en el disco, `/` no miente: 503", async () => {
    const s = await conServidor({ leerIndex: () => null });
    const r = await s.pedir("/");
    assert.equal(r.codigo, 503);
    await s.cerrar();
  });
});

describe("las rutas normales siguen protegidas mientras arranca", () => {
  test("la API contesta 503 con Retry-After, no 500 ni datos a medias", async () => {
    // Una consulta contra una columna que todavía no existe no falla a medias: falla del todo, y
    // el error que se ve («column ... does not exist») no apunta a ningún sitio.
    const s = await conServidor();
    for (const ruta of ["/api/reservas", "/api/agora/estado", "/api/promos/vales"]) {
      const r = await s.pedir(ruta);
      assert.equal(r.codigo, 503, ruta);
      assert.equal(r.cabeceras["retry-after"], "3", ruta);
      assert.match(r.cuerpo, new RegExp(MENSAJE_ARRANCANDO.slice(0, 20)));
    }
    await s.cerrar();
  });

  test("el panel tampoco se sirve a medias", async () => {
    const s = await conServidor();
    assert.equal((await s.pedir("/panel/app.js")).codigo, 503);
    assert.equal((await s.pedir("/login.html")).codigo, 503);
    await s.cerrar();
  });

  test("nada de lo que se responde al arrancar se guarda en caché", async () => {
    // Un 503 cacheado sobreviviría al arranque y el sitio parecería caído después.
    const s = await conServidor();
    for (const ruta of ["/", "/healthz", "/readyz", "/api/x"]) {
      assert.equal((await s.pedir(ruta)).cabeceras["cache-control"], "no-store", ruta);
    }
    await s.cerrar();
  });
});

describe("DISPONIBILIDAD: dice la verdad sobre PostgreSQL", () => {
  test("503 mientras el esquema se está inicializando", async () => {
    const r = await readinessDe({ esquemaListo: false, ping: () => { throw new Error("no debería llamarse"); } });
    assert.equal(r.codigo, 503);
    assert.equal(r.cuerpo.listo, false);
    assert.equal(r.cuerpo.fase, "esquema");
  });

  test("200 cuando el esquema está y la base contesta", async () => {
    const r = await readinessDe({ esquemaListo: true, ping: async () => ({ rows: [{ "?column?": 1 }] }) });
    assert.equal(r.codigo, 200);
    assert.equal(r.cuerpo.listo, true);
  });

  test("503 si PostgreSQL falla, aunque el esquema esté inicializado", async () => {
    // ÉSTE es el test que hace que /readyz sirva de algo. Sin el `SELECT 1`, diría «listo» para
    // siempre desde el primer arranque, aunque la base se cayera media hora después.
    const r = await readinessDe({ esquemaListo: true, ping: async () => { throw new Error("ECONNREFUSED"); } });
    assert.equal(r.codigo, 503);
    assert.equal(r.cuerpo.listo, false);
    assert.equal(r.cuerpo.fase, "bd");
  });

  test("503 si la base no cuelga pero tampoco contesta", async () => {
    // Una base colgada sin el tiempo límite colgaría también el healthcheck, y entonces no
    // informa de nada: ni «bien» ni «mal», solo silencio.
    const r = await readinessDe({ esquemaListo: true, ping: () => new Promise(() => {}), timeoutMs: 50 });
    assert.equal(r.codigo, 503);
    assert.equal(r.cuerpo.fase, "bd");
  });

  test("el motivo NUNCA lleva el mensaje de la excepción", () => {
    // Diría host, usuario o la consulta entera.
    return readinessDe({ esquemaListo: true, ping: async () => { throw new Error("password authentication failed for user pepe at db.interno:5432"); } })
      .then((r) => {
        const txt = JSON.stringify(r.cuerpo);
        assert.ok(!txt.includes("password"), txt);
        assert.ok(!txt.includes("pepe"), txt);
        assert.ok(!txt.includes("5432"), txt);
      });
  });

  test("`conTiempo` no deja temporizadores colgando", async () => {
    await assert.rejects(() => conTiempo(new Promise(() => {}), 20), /tiempo agotado/);
    assert.equal(await conTiempo(Promise.resolve(7), 1000), 7);
  });

  test("durante el arranque, /readyz dice 503 y no toca la base", async () => {
    const s = await conServidor();
    const r = await s.pedir("/readyz");
    assert.equal(r.codigo, 503);
    assert.equal(JSON.parse(r.cuerpo).listo, false);
    assert.equal(r.cabeceras["retry-after"], "3");
    await s.cerrar();
  });
});

describe("la entrega a Express", () => {
  test("cambia el manejador SIN reabrir el puerto", async () => {
    // Cerrar y volver a escuchar dejaría un hueco de milisegundos rechazando conexiones, que es
    // justo el agujero que estamos tapando.
    const s = await conServidor();
    const antes = s.arranque.servidor.address().port;
    assert.equal((await s.pedir("/loquesea")).codigo, 503);

    s.arranque.entregar((req, res) => { res.statusCode = 200; res.end("soy express"); });
    assert.equal(s.arranque.servidor.address().port, antes, "el puerto ha cambiado");
    assert.equal((await s.pedir("/loquesea")).cuerpo, "soy express");
    await s.cerrar();
  });

  test("NO se entrega dos veces: la segunda es un error", async () => {
    // Dos aplicaciones sobre el mismo socket es la clase de fallo que solo se ve en producción.
    const s = await conServidor();
    s.arranque.entregar((req, res) => res.end("a"));
    assert.throws(() => s.arranque.entregar((req, res) => res.end("b")), /dos veces/);
    await s.cerrar();
  });

  test("no acepta cualquier cosa como aplicación", async () => {
    const s = await conServidor();
    assert.throws(() => s.arranque.entregar({ no: "soy express" }), TypeError);
    await s.cerrar();
  });

  test("`escuchar: false` no ocupa ningún puerto", () => {
    // Es lo que permite que estos tests existan sin pelearse por el 5000.
    const a = crearArranque({ puerto: 5000, leerIndex: () => null, escuchar: false, log: () => {} });
    assert.equal(a.servidor.listening, false);
  });
});

describe("el cierre", () => {
  test("cierra aunque haya una conexión keep-alive abierta", async () => {
    // El riesgo real de un SIGTERM: una conexión persistente mantiene el servidor vivo y el
    // proceso no se muere hasta que el supervisor lo mata a lo bruto, cortando lo que hubiera
    // en vuelo. Por eso `shutdown` llama a `closeAllConnections()`.
    const s = await conServidor();
    const socket = net.connect(s.puerto, "127.0.0.1");
    await new Promise((r) => socket.on("connect", r));
    socket.write("GET /healthz HTTP/1.1\r\nHost: x\r\nConnection: keep-alive\r\n\r\n");
    await new Promise((r) => socket.once("data", r));

    const cerrado = new Promise((r) => s.arranque.servidor.close(() => r("cerrado")));
    s.arranque.servidor.closeAllConnections();
    assert.equal(await Promise.race([cerrado, new Promise((r) => setTimeout(() => r("colgado"), 1500))]), "cerrado");
    socket.destroy();
  });

  test("un SIGTERM termina el proceso con código 0", async () => {
    // Se lanza un proceso de verdad con este mismo módulo y el mismo `shutdown` que usa
    // server.js, y se le manda la señal. Es la única forma de comprobar que la señal se atiende.
    const raiz = fileURLToPath(new URL("../", import.meta.url));
    const guion = `
      import { crearArranque } from ${JSON.stringify(raiz + "src/modules/arranque/servidor.js")};
      const a = crearArranque({ puerto: 0, leerIndex: () => null, log: () => {} });
      const shutdown = () => {
        setTimeout(() => process.exit(0), 5000).unref();
        a.servidor.closeAllConnections?.();
        a.servidor.close(() => process.exit(0));
      };
      process.on("SIGTERM", shutdown);
      a.servidor.on("listening", () => console.log("arriba"));
    `;
    const hijo = spawn(process.execPath, ["--input-type=module", "-e", guion], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((r, x) => {
      hijo.stdout.on("data", (d) => String(d).includes("arriba") && r());
      hijo.on("error", x);
      setTimeout(() => x(new Error("el hijo no arrancó")), 8000);
    });
    hijo.kill("SIGTERM");
    const codigo = await new Promise((r) => hijo.on("exit", (c) => r(c)));
    assert.equal(codigo, 0, "el proceso no ha cerrado limpiamente con SIGTERM");
  });
});

describe("server.js está cableado como toca", () => {
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const soloCodigo = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const codigo = soloCodigo(server);

  test("el arranque temprano es EL PRIMER import", () => {
    // Si baja aunque sea una línea por debajo de otro import, deja de servir para nada: ese otro
    // import se evalúa antes y el puerto vuelve a abrirse tarde.
    const imports = codigo.split("\n").filter((l) => l.startsWith("import "));
    assert.match(imports[0], /from "\.\/src\/arranque-temprano\.js"/,
      "el arranque temprano ya no es el primer import; el puerto se abrirá tarde otra vez");
  });

  test("ya no queda ningún `app.listen`", () => {
    // Dos sitios escuchando es EADDRINUSE en producción y en ningún otro lado.
    assert.ok(!/app\.listen\(/.test(codigo), "server.js vuelve a escuchar por su cuenta");
    assert.match(codigo, /const server = entregar\(app, async \(\) => \{/);
  });

  test("vida y disponibilidad están registradas, y son distintas", () => {
    assert.match(codigo, /app\.get\("\/healthz"/);
    assert.match(codigo, /app\.get\("\/readyz"/);
    const i = server.indexOf('app.get("/healthz"');
    assert.ok(!/pool|dbGet|dbAll|await/.test(server.slice(i, i + 200)), "/healthz mira la base");
  });

  test("/readyz hace un SELECT 1 de verdad", () => {
    const i = server.indexOf('app.get("/readyz"');
    const f = server.slice(i, i + 500);
    assert.match(f, /ping: \(\) => pool\.query\("SELECT 1"\)/);
    assert.match(f, /esquemaListo: DB_LISTA/);
  });

  test("la guarda de /api sigue intacta", () => {
    assert.match(codigo, /app\.use\("\/api", \(req, res, next\) => \{/);
    assert.match(codigo, /if \(DB_LISTA\) return next\(\)/);
    assert.match(codigo, /arrancando: true/);
  });

  test("el esquema listo se anuncia justo donde se pone DB_LISTA", () => {
    assert.match(codigo, /DB_LISTA = true;[\s\S]{0,80}marcarEsquemaListo\(\);/);
  });

  test("el reintento por puerto ocupado se ha mudado con el listen", () => {
    // Si se hubiera quedado en server.js, entre la apertura del puerto y su registro habría 24
    // segundos en los que un EADDRINUSE —el puerto que el proceso anterior todavía no ha soltado,
    // que es CUÁNDO ocurre— solo se habría escrito en el log, y el servidor nunca habría escuchado.
    const arr = readFileSync(new URL("../src/modules/arranque/servidor.js", import.meta.url), "utf8");
    assert.match(arr, /EADDRINUSE/);
    assert.match(arr, /servidor\.close\(\); servidor\.listen\(puerto\);/);
    assert.ok(!/EADDRINUSE/.test(codigo), "server.js conserva un segundo reintento: se pisarían");
  });

  test("SIGTERM y SIGINT siguen atendidos, y el cierre no ha cambiado", () => {
    assert.match(codigo, /process\.on\("SIGTERM", \(\) => shutdown\("SIGTERM"\)\)/);
    assert.match(codigo, /process\.on\("SIGINT",\s+\(\) => shutdown\("SIGINT"\)\)/);
    assert.match(codigo, /server\.closeAllConnections\?\.\(\)/);
    assert.match(codigo, /server\.close\(async \(\) => \{/);
  });

  test("el arranque no imprime objetos ni secretos", () => {
    // Los argumentos se leen DE VERDAD contando paréntesis, no con una expresión regular: con
    // una regex, `console.error(lineaError("ctx", err))` —que es lo correcto— parece el fallo,
    // porque el `err` de dentro va pegado a un paréntesis. Es el mismo candado que
    // tests/logs-sin-secretos.test.js, y por el mismo motivo.
    for (const f of ["../src/arranque-temprano.js", "../src/modules/arranque/servidor.js", "../src/modules/arranque/estado.js"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      assert.deepEqual(argumentosCrudos(src), [], `${f} imprime un objeto entero en un console.*`);
      assert.ok(!/process\.env\.(JWT_SECRET|DATA_ENC_KEY|DATABASE_URL)/.test(src), `${f} toca un Secret`);
    }
  });
});
