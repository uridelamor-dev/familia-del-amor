// Carga diferida de los dos paquetes pesados: Baileys y el SDK de Anthropic.
//
// EL PROBLEMA: en un módulo ESM los `import` se evalúan ANTES que cualquier línea de código, así
// que `server.js` no ejecutaba nada —ni su `app.listen`— hasta tener cargado el árbol entero.
// Medido: 262 módulos, de los cuales 99 son de Baileys y 91 del SDK de Anthropic. El 73 %. En el
// disco frío de un Reserved VM eso son ~24 s con el puerto cerrado y el healthcheck fallando.
//
// Ninguno de los dos hace falta para arrancar. Lo que blindan estos tests es que sigan sin estar
// arriba, y que diferirlos no haya cambiado nada de lo que hacen: ni la reconexión de WhatsApp, ni
// el comportamiento sin API key, ni lo que sale por los logs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cargaDiferida } from "../src/modules/carga/diferida.js";

const lee = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const server = lee("server.js");
const wa = lee("whatsapp.js");
const facturas = lee("facturas.js");
/** El fichero sin sus líneas de comentario: aquí se explica a propósito lo que NO se debe hacer. */
const soloCodigo = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("no queda ni un import estático de los pesados", () => {
  for (const [nombre, src] of [["server.js", server], ["whatsapp.js", wa], ["facturas.js", facturas]]) {
    test(`${nombre} no los importa arriba`, () => {
      // Un solo `import` estático de cualquiera de los dos devuelve el arranque a donde estaba, y
      // no lo notaría nadie hasta leer los tiempos del siguiente despliegue.
      const codigo = soloCodigo(src);
      assert.ok(!/^import[^\n]*@anthropic-ai\/sdk/m.test(codigo), `${nombre} vuelve a importar el SDK de IA arriba`);
      assert.ok(!/^import[^\n]*@whiskeysockets\/baileys/m.test(codigo), `${nombre} vuelve a importar Baileys arriba`);
    });
  }

  test("y se cargan con `import()` a través del cargador cacheado", () => {
    assert.match(server, /cargaDiferida\(\(\) => import\("@anthropic-ai\/sdk"\)/);
    assert.match(wa, /cargaDiferida\(\(\) => import\("@whiskeysockets\/baileys"\)/);
    assert.match(wa, /cargaDiferida\(\(\) => import\("@anthropic-ai\/sdk"\)/);
    assert.match(facturas, /cargaDiferida\(\(\) => import\("@anthropic-ai\/sdk"\)/);
  });
});

describe("los imports dinámicos resuelven de verdad", () => {
  // Es EL riesgo de diferir: el fallo se traslada del arranque al primer uso. Si el paquete no
  // estuviera, antes no arrancaba el servidor; ahora arrancaría y fallaría el primer mensaje de
  // WhatsApp. Este test lo caza aquí.
  test("@anthropic-ai/sdk se puede cargar y expone el constructor por defecto", async () => {
    const m = await import("@anthropic-ai/sdk");
    assert.equal(typeof m.default, "function");
  });

  test("@whiskeysockets/baileys se puede cargar y trae los seis símbolos que se usaban", async () => {
    const m = await import("@whiskeysockets/baileys");
    assert.equal(typeof m.default, "function", "makeWASocket");
    for (const s of ["DisconnectReason", "useMultiFileAuthState", "downloadMediaMessage", "fetchLatestWaWebVersion"]) {
      assert.ok(m[s] !== undefined, `falta ${s}`);
    }
  });
});

describe("el cargador cachea", () => {
  test("una sola carga por proceso, por muchas veces que se pida", async () => {
    let veces = 0;
    const cargar = cargaDiferida(async () => { veces++; return { ok: true }; });
    await cargar(); await cargar(); await cargar();
    assert.equal(veces, 1);
  });

  test("DOS RECONEXIONES A LA VEZ no cargan Baileys dos veces", async () => {
    // Es el caso real: `scheduleReconnect` y una reconexión manual pueden solaparse. Se cachea la
    // PROMESA, no el resultado, así que la segunda se engancha al `import()` que ya está en vuelo.
    let veces = 0;
    const cargar = cargaDiferida(async () => {
      veces++;
      await new Promise((r) => setTimeout(r, 30));   // el import tarda
      return { default: () => {} };
    });
    const [a, b, c] = await Promise.all([cargar(), cargar(), cargar()]);
    assert.equal(veces, 1, "se ha lanzado más de un import");
    assert.equal(a, b);
    assert.equal(b, c, "cada llamada ha recibido un módulo distinto");
  });

  test("devuelve siempre el MISMO módulo", async () => {
    const cargar = cargaDiferida(async () => ({ marca: Symbol("uno") }));
    assert.equal((await cargar()).marca, (await cargar()).marca);
  });
});

describe("un fallo de carga no deja el proceso muerto", () => {
  test("el rechazo NO se cachea: el siguiente intento vuelve a probar", async () => {
    // Si se cachease, una lectura de disco fallida dejaría WhatsApp sin conectar hasta el
    // siguiente despliegue, y su reconexión automática no serviría de nada.
    let veces = 0;
    const cargar = cargaDiferida(async () => {
      veces++;
      if (veces === 1) throw new Error("disco ocupado");
      return { ok: true };
    }, "[prueba]");
    await assert.rejects(() => cargar(), /disco ocupado/);
    assert.deepEqual(await cargar(), { ok: true }, "el reintento no ha vuelto a cargar");
    assert.equal(veces, 2);
  });

  test("un `throw` síncrono también se recoge", async () => {
    const cargar = cargaDiferida(() => { throw new Error("roto"); }, "[prueba]");
    await assert.rejects(() => cargar(), /roto/);
  });

  test("el error se registra resumido, nunca el objeto", () => {
    const src = lee("src/modules/carga/diferida.js");
    assert.match(src, /console\.error\(lineaError\(/);
    // `lineaError` devuelve TEXTO: no hay forma de que un objeto se expanda en el log.
    assert.ok(!/console\.error\([^)]*\berr\b\s*\)/.test(src.replace(/lineaError\([^)]*\)/g, "X")));
  });
});

describe("sin ANTHROPIC_API_KEY, todo sigue igual", () => {
  test("whatsapp.js devuelve null con el mismo aviso, y NO carga el SDK", () => {
    // La comprobación de la clave va ANTES del import: sin clave no se paga la carga.
    const i = wa.indexOf("async function getAnthropic()");
    assert.ok(i > 0, "getAnthropic ha desaparecido");
    const f = wa.slice(i, i + 600);
    assert.match(f, /ANTHROPIC_API_KEY no configurada — respuestas IA desactivadas/);
    assert.ok(f.indexOf("return null") < f.indexOf("cargarAnthropic"), "se carga el SDK antes de mirar la clave");
    assert.match(f, /if \(!anthropic\)/, "se ha perdido el cacheo del cliente");
  });

  test("quien lo llama lo espera, y conserva su respuesta de cortesía", () => {
    assert.match(wa, /const ai = await getAnthropic\(\);\s*\n\s*if \(!ai\) return "Lo siento, el asistente no está disponible en este momento\.";/);
  });

  test("el 503 de la ruta de IA sigue comprobando la clave antes de nada", () => {
    assert.match(server, /if \(!process\.env\.ANTHROPIC_API_KEY\) return res\.status\(503\)/);
  });

  test("el cliente se crea UNA vez por proceso en los tres ficheros", () => {
    for (const [n, src] of [["server.js", server], ["whatsapp.js", wa], ["facturas.js", facturas]]) {
      assert.match(src, /if \(!(_ia|anthropic)\)/, `${n} crea un cliente nuevo en cada llamada`);
    }
    assert.equal((server.match(/new Anthropic\(/g) || []).length, 1, "server.js instancia el cliente en más de un sitio");
  });
});

describe("WhatsApp: la lógica no ha cambiado", () => {
  test("Baileys se carga DENTRO de connectToWhatsApp, antes del primer uso", () => {
    const i = wa.indexOf("async function connectToWhatsApp()");
    const f = wa.slice(i, i + 1400);
    assert.match(f, /await cargarBaileys\(\)/);
    assert.ok(f.indexOf("cargarBaileys()") < f.indexOf("useMultiFileAuthState(AUTH_DIR)"),
      "se usa un símbolo de Baileys antes de haberlo cargado");
  });

  test("la firma de initWhatsApp no ha cambiado", () => {
    assert.match(wa, /export function initWhatsApp\(\)/);
    assert.match(wa, /lineaError\("\[WhatsApp\] Error iniciando", err\)/);
  });

  test("conexión, QR, reconexión, loggedOut y creds.update siguen igual", () => {
    // Diferir un import no puede tocar la máquina de estados de la conexión.
    assert.match(wa, /if \(code === DisconnectReason\.loggedOut\)/);
    assert.match(wa, /if \(code === 408 && reconnectAttempts >= 3\)/);
    assert.match(wa, /if \(reconnectAttempts >= 4\)/);
    assert.match(wa, /scheduleReconnect\(\);/);
    assert.match(wa, /sock\.ev\.on\("creds\.update", saveCreds\);/);
    assert.match(wa, /WhatsApp conectado y listo/);
    assert.match(wa, /Conexión cerrada — código: \$\{code\} \| razón: \$\{reason\}/);
  });

  test("los tiempos de reintento no se han tocado", () => {
    assert.match(wa, /keepAliveIntervalMs: 25000/);
    assert.match(wa, /connectTimeoutMs: 60000/);
  });

  test("el logger de Baileys sigue en silent y con redacción", () => {
    assert.match(wa, /const logBaileys = \(\) => pino\(\{\s*level: "silent"/);
    assert.match(wa, /logger: logBaileys\(\)/);
  });
});

describe("el arranque", () => {
  test("app.listen sigue en el mismo sitio funcional", () => {
    // La optimización adelanta el MOMENTO en que se llega aquí; no mueve la llamada ni cambia
    // lo que ocurre dentro.
    assert.match(server, /const server = app\.listen\(PORT, async \(\) => \{/);
    assert.match(server, /console\.log\(`Servidor activo en http:\/\/localhost:\$\{PORT\}`\)/);
    const i = server.indexOf("const server = app.listen");
    assert.match(server.slice(i, i + 400), /await initDB\(\);[\s\S]{0,80}DB_LISTA = true;/);
  });

  test("hay una medida del tiempo hasta el listen, justo antes", () => {
    assert.match(server, /console\.log\(`\[arranque\] app\.listen a los \$\{Math\.round\(process\.uptime\(\) \* 1000\)\} ms`\);\s*\n\s*\nconst server = app\.listen/);
  });

  test("la guarda de /api y el manejador de EADDRINUSE siguen donde estaban", () => {
    assert.match(server, /app\.use\("\/api", \(req, res, next\) => \{/);
    assert.match(server, /if \(DB_LISTA\) return next\(\)/);
    assert.match(server, /server\.on\("error", \(err\) => \{[\s\S]{0,120}EADDRINUSE/);
  });
});

describe("los logs no exponen nada", () => {
  test("el cargador no imprime el módulo ni el error entero", () => {
    const src = lee("src/modules/carga/diferida.js");
    assert.ok(!/console\.log/.test(src), "el cargador escribe en el log al cargar");
    assert.equal((src.match(/console\./g) || []).length, 1, "hay más de una salida al log");
  });

  test("no se ha colado el VALOR de la API key en ningún log", () => {
    // Lo que no puede salir es `process.env.ANTHROPIC_API_KEY`. Nombrar la variable en un aviso
    // —«ANTHROPIC_API_KEY no configurada»— es justo lo contrario: dice qué falta sin decir nada.
    for (const [n, src] of [["server.js", server], ["whatsapp.js", wa], ["facturas.js", facturas]]) {
      assert.ok(!/console\.[a-z]+\([^;]*process\.env\.ANTHROPIC_API_KEY/.test(src), `${n} imprime la clave de la IA`);
    }
    // Y el aviso de whatsapp.js, que sí nombra la variable, sigue estando.
    assert.match(wa, /console\.warn\("\[WhatsApp\] ANTHROPIC_API_KEY no configurada/);
  });
});
