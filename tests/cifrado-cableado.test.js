// El cifrado de secretos, cableado (R01).
//
// Introspección sobre `server.js` y el script de migración. Blindan lo que, cuando se rompe, no
// da ningún error: una credencial guardada en claro porque faltaba un Secret, una clave derivada
// de un objeto, o un `--aplicar` que escribe en producción sin que nadie lo haya pedido dos veces.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const script = readFileSync(new URL("../scripts/migrar-cifrado.js", import.meta.url), "utf8");

/**
 * El fichero sin sus líneas de comentario.
 *
 * Hace falta porque este proyecto explica en los comentarios lo que NO se debe hacer —el literal
 * `"[object Object]"` de R01 está escrito con todas sus letras ahí arriba, a propósito— y una
 * búsqueda a pelo confundiría la explicación con el fallo. Solo se quitan líneas que son
 * comentario ENTERAS: nunca se puede perder código por el camino.
 */
const soloCodigo = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const servidor = soloCodigo(server);
const guion = soloCodigo(script);

describe("R01: la clave ya no sale del JWT", () => {
  test("no queda ni una llamada a `derivarClave`", () => {
    // ERA ESTO: `derivarClave(resolveJwtSecret() || "tapeta", "agora-token-v1")`.
    // `resolveJwtSecret()` devuelve un OBJETO; el `String()` de dentro lo convertía en
    // "[object Object]" y ésa era la clave AES real de las credenciales de los cuatro TPV.
    assert.ok(!/derivarClave/.test(server), "server.js vuelve a derivar una clave a mano");
    assert.ok(!/AGORA_ENC_KEY|WALLET_ENC_KEY/.test(server), "vuelven a existir las claves derivadas del JWT");
  });

  test("`resolveJwtSecret` solo se llama para el JWT, y con sus argumentos", () => {
    const llamadas = servidor.match(/resolveJwtSecret\([^)]*\)/g) || [];
    assert.deepEqual(llamadas, ["resolveJwtSecret({ prod: PROD })"],
      "hay una llamada a resolveJwtSecret fuera de la resolución del JWT");
  });

  test("el login sigue exactamente igual", () => {
    // El arreglo separa el cifrado de datos de la autenticación; no toca la autenticación.
    assert.match(server, /const \{ secret: JWT_SECRET, status: jwtStatus, source: jwtSource \} = resolveJwtSecret\(\{ prod: PROD \}\);/);
    assert.match(server, /console\.log\(`\[auth\] JWT secret: \$\{jwtStatus\} \(fuente: \$\{jwtSource\}\)`\);/);
  });

  test("el literal roto vive en un solo sitio, y está marcado como vulnerable", () => {
    const src = new URL("../src/modules/seguridad/legado-inseguro.js", import.meta.url);
    const legado = readFileSync(src, "utf8");
    assert.match(legado, /VULNERABLE/);
    assert.match(legado, /SOLO LECTURA/);
    assert.ok(!/\[object Object\]/.test(servidor), "el literal roto ha vuelto al código de server.js");
    assert.ok(!/scryptSync/.test(servidor), "server.js vuelve a derivar claves");
  });
});

describe("Ágora y Wallet usan el llavero", () => {
  test("Ágora cifra en v2 y lee con señal", () => {
    assert.match(server, /const agoraEncToken = \(plain\) => secCifrar\(plain, LLAVERO, DOMINIOS\.AGORA\);/);
    assert.match(server, /const agoraDecToken = \(stored\) => leerSecreto\(stored, DOMINIOS\.AGORA, "agora_locales"\);/);
  });

  test("Wallet cifra en v2 y lee con señal", () => {
    assert.match(server, /secCifrar\(JSON\.stringify\(guardar\), LLAVERO, DOMINIOS\.WALLET\)/);
    assert.match(server, /leerSecreto\(fila\.datos_enc, DOMINIOS\.WALLET, "wallet_config"\)/);
  });

  test("los dos dominios son distintos: un secreto de un sitio no abre en el otro", () => {
    assert.ok(server.includes("DOMINIOS.AGORA") && server.includes("DOMINIOS.WALLET"));
  });

  test("server.js no vuelve a cifrar por su cuenta", () => {
    assert.equal((server.match(/createCipheriv/g) || []).length, 0);
  });
});

describe("sin DATA_ENC_KEY no se guarda un secreto en claro", () => {
  test("Ágora corta la escritura con un 503 que dice qué falta", () => {
    // La alternativa —guardarla en claro «por ahora»— es el fallo que nadie vuelve a mirar.
    const i = server.indexOf('app.post("/api/agora/locales"');
    const f = server.slice(i, server.indexOf('app.delete("/api/agora/locales', i));
    assert.match(f, /if \(\(tokTrim \|\| passTrim\) && !LLAVERO\.puedeCifrar\)/);
    assert.match(f, /res\.status\(503\)/);
    assert.match(f, /DATA_ENC_KEY/);
    // Y el corte va ANTES de cualquier escritura.
    assert.ok(f.indexOf("puedeCifrar") < f.indexOf("INSERT INTO agora_locales"));
  });

  test("Wallet, igual", () => {
    const i = server.indexOf("INSERT INTO wallet_config");
    const f = server.slice(i - 900, i);
    assert.match(f, /!LLAVERO\.puedeCifrar/);
    assert.match(f, /res\.status\(503\)/);
  });

  test("pero el servidor arranca igual sin la clave", () => {
    // Negarse a arrancar dejaría el restaurante sin reservas y sin Sara por un Secret que solo
    // afecta a guardar credenciales del TPV.
    assert.ok(!/process\.exit[\s\S]{0,80}DATA_ENC_KEY/.test(server), "el arranque se cae si falta la clave");
    assert.match(server, /const LLAVERO = cargarLlavero\(/);
  });
});

describe("una credencial ilegible no puede desaparecer en silencio", () => {
  test("`leerSecreto` cuenta los fallos y avisa una sola vez", () => {
    const i = server.indexOf("function leerSecreto(");
    const f = server.slice(i, i + 900);
    assert.match(f, /CIFRADO_FALLOS\.set/);
    assert.match(f, /if \(n === 1\) console\.error/, "un log por sincronización sería ruido que nadie mira");
  });

  test("el estado se ve en el panel", () => {
    assert.match(server, /function cifradoEstado\(\)/);
    assert.match(server, /locales: out, cifrado: cifradoEstado\(\)/);
  });

  test("lo que se enseña es el kid, nunca la clave", () => {
    const i = server.indexOf("function cifradoEstado()");
    const f = server.slice(i, i + 400);
    assert.match(f, /kid: LLAVERO\.actual \? LLAVERO\.actual\.kid : null/);
    assert.ok(!/\.clave/.test(f), "cifradoEstado devuelve material de clave");
  });
});

describe("ningún log lleva claves ni contenidos", () => {
  const modulos = ["clave-datos.js", "secretos.js", "legado-inseguro.js", "migracion-cifrado.js"]
    .map((n) => [n, readFileSync(new URL(`../src/modules/seguridad/${n}`, import.meta.url), "utf8")]);

  test("los módulos de cifrado no imprimen NADA", () => {
    // Un `console.log` de depuración aquí dentro es cómo se filtra una clave: no da error, no
    // rompe ninguna prueba, y solo se descubre leyendo los logs de producción.
    for (const [n, src] of modulos) assert.ok(!/console\./.test(src), `${n} tiene un console.*`);
  });

  test("el arranque escribe el kid, no la clave", () => {
    assert.match(server, /console\.log\(lineaArranque\(LLAVERO\)\)/);
    assert.ok(!/console\.[a-z]+\([^)]*LLAVERO\.actual\.clave/.test(server));
    assert.ok(!/console\.[a-z]+\([^)]*process\.env\.DATA_ENC_KEY/.test(server));
  });

  test("nadie imprime el valor del Secret", () => {
    for (const f of readdirSync(new URL("../src/modules/seguridad/", import.meta.url))) {
      const src = readFileSync(new URL(`../src/modules/seguridad/${f}`, import.meta.url), "utf8");
      assert.ok(!/DATA_ENC_KEY\s*\)/.test(src.replace(/VAR_ACTUAL/g, "")) || !/console/.test(src), f);
    }
  });
});

describe("el script de migración", () => {
  test("en seco por defecto: escribir exige DOS indicadores", () => {
    assert.match(script, /if \(\(aplicar \|\| revertir\) && !seguro\)/);
    assert.match(script, /--si-estoy-seguro/);
    assert.match(script, /process\.exit\(2\)/);
  });

  test("no hay ninguna forma de que se ejecute sola", () => {
    // Ni al arrancar el servidor, ni desde una ruta HTTP.
    assert.ok(!/migrar-cifrado/.test(servidor), "server.js invoca la migración");
    assert.ok(!/app\.(get|post)/.test(guion), "el script expone una ruta");
  });

  test("transacción de verdad, con candado", () => {
    assert.match(script, /await client\.query\("BEGIN"\)/);
    assert.match(script, /await client\.query\("COMMIT"\)/);
    assert.match(script, /await client\.query\("ROLLBACK"\)/);
    assert.match(script, /pg_advisory_xact_lock/);
  });

  test("cualquier error hace ROLLBACK y solo saca el mensaje", () => {
    // Un error de `pg` arrastra la consulta entera, y con ella el criptograma.
    const i = script.indexOf("} catch (e) {");
    const f = script.slice(i, i + 500);
    assert.match(f, /ROLLBACK/);
    assert.match(f, /e\.message/);
    assert.ok(!/console\.error\(e\)/.test(guion), "se imprime el objeto de error entero");
  });

  test("comprueba antes de aplicar, y no aplica si algo es ilegible", () => {
    assert.match(script, /if \(!c\.listo\) \{[\s\S]{0,200}No se migra nada/);
  });

  test("sabe decir cuándo ya no queda nada legado", () => {
    assert.match(script, /--verificar/);
    assert.match(script, /quedaLegado/);
  });

  test("y sabe deshacer", () => {
    assert.match(script, /--restaurar/);
    assert.match(script, /restaurar\(x, \{ aplicar: true \}\)/);
  });
});
