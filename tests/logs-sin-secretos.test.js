// Los logs no pueden llevar material criptográfico.
//
// INCIDENTE QUE ORIGINA ESTO: los logs de producción imprimieron objetos internos de sesión de
// WhatsApp —`SessionEntry`, claves privadas, raíces, pares efímeros y cadenas— porque
// `initWhatsApp()` hacía `catch(err => console.error("...", err))` con el error ENTERO. Era la
// única línea del fichero que no usaba `.message`.
//
// Estos tests son el candado. Lo que cazan no da error ni rompe nada: un `console.error` con un
// objeto se lee igual de bien en desarrollo, y solo se descubre leyendo los logs de producción
// con las claves ya expuestas.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redactar, resumenError, lineaError, esClaveSensible, REDACTADO } from "../src/modules/seguridad/redactar.js";

const wa = readFileSync(new URL("../whatsapp.js", import.meta.url), "utf8");

/** Los nombres que aparecieron de verdad en el incidente. */
const DEL_INCIDENTE = ["privKey", "rootKey", "baseKey", "chainKey", "ephemeralKeyPair"];

/** Una sesión de libsignal de mentira, con la forma real pero con valores inventados. */
function sesionFalsa() {
  class SessionEntry {
    constructor() {
      this.registrationId = 42;
      this.currentRatchet = {
        rootKey: Buffer.from("no-es-una-clave-de-verdad"),
        ephemeralKeyPair: { privKey: Buffer.alloc(32, 7), pubKey: Buffer.alloc(32, 8) },
        lastRemoteEphemeralKey: Buffer.alloc(32, 9),
      };
      this.chains = { cadena1: { chainKey: { key: Buffer.alloc(32, 1), counter: 3 } } };
      this.indexInfo = { baseKey: Buffer.alloc(32, 2), closed: -1 };
    }
  }
  return new SessionEntry();
}

describe("el redactor tapa lo que no puede salir", () => {
  test("los campos del incidente nunca aparecen", () => {
    const salida = JSON.stringify(redactar({
      privKey: "x", rootKey: "x", baseKey: "x", chainKey: "x", ephemeralKeyPair: { privKey: "x" },
    }));
    for (const campo of DEL_INCIDENTE) {
      assert.ok(!salida.includes('"x"'), `se ha colado un valor sensible: ${salida}`);
      assert.ok(salida.includes(campo), `el nombre «${campo}» debe verse, solo se tapa el valor`);
    }
    assert.ok(salida.includes(REDACTADO));
  });

  test("también anidados, y por muy hondo que estén", () => {
    const hondo = { a: { b: { c: { privKey: "secreto", inocente: "visible" } } } };
    const salida = JSON.stringify(redactar(hondo, { profundidad: 8 }));
    assert.ok(!salida.includes("secreto"), salida);
    assert.ok(salida.includes("visible"));
  });

  test("una sesión de libsignal entera no se abre ni un nivel", () => {
    // Es la forma exacta del objeto que se filtró.
    const salida = JSON.stringify(redactar(sesionFalsa(), { profundidad: 10 }));
    assert.match(salida, /SessionEntry redactado/);
    assert.ok(!salida.includes("no-es-una-clave-de-verdad"), salida);
    for (const campo of DEL_INCIDENTE) {
      assert.ok(!new RegExp(`"${campo}"\\s*:\\s*\\{`).test(salida), `${campo} se ha abierto`);
    }
  });

  test("los bytes no salen NUNCA, ni truncados", () => {
    // Media clave sigue siendo media clave.
    const salida = JSON.stringify(redactar({ dato: Buffer.from([1, 2, 3, 4, 5]) }));
    assert.match(salida, /\[bytes:5\]/);
    assert.ok(!salida.includes("1,2,3"), salida);
  });

  test("un objeto que se referencia a sí mismo no cuelga el proceso", () => {
    const a = { nombre: "raiz" };
    a.yo = a;
    const salida = JSON.stringify(redactar(a));
    assert.match(salida, /circular/);
  });

  test("se recorta por profundidad, por claves y por longitud", () => {
    assert.match(JSON.stringify(redactar({ a: { b: { c: { d: 1 } } } }, { profundidad: 2 })), /…/);
    const muchas = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`c${i}`, i]));
    assert.match(JSON.stringify(redactar(muchas, { maxClaves: 10 })), /claves más/);
    assert.match(redactar("x".repeat(500), { maxTexto: 20 }), /…$/);
  });

  test("nombres sospechosos que no están en la lista también se tapan", () => {
    for (const n of ["authHeader", "mi_token", "clientSecret", "somePrivThing", "sessionKeys"]) {
      assert.equal(esClaveSensible(n), true, n);
    }
    for (const n of ["connection", "statusCode", "reason", "local", "nombre"]) {
      assert.equal(esClaveSensible(n), false, n);
    }
  });
});

describe("de un error solo sale lo que sirve para diagnosticar", () => {
  test("nombre, mensaje y códigos — nada más", () => {
    const err = Object.assign(new Error("conexión cerrada"), {
      name: "SignalError", statusCode: 401, code: "ENOSESSION",
      session: sesionFalsa(), creds: { noiseKey: { privKey: "x" } },
    });
    const r = resumenError(err);
    assert.deepEqual(Object.keys(r).sort(), ["code", "message", "name", "statusCode"]);
    const salida = JSON.stringify(r);
    assert.ok(!salida.includes("privKey"), salida);
    assert.ok(!salida.includes("SessionEntry"), salida);
  });

  test("el código y el estado SÍ salen: son lo que hace falta para una desconexión", () => {
    // El 401, el 408 y el `loggedOut` son justo lo que se mira cuando WhatsApp se cae.
    const linea = lineaError("[WhatsApp] Error iniciando", Object.assign(new Error("boom"), { statusCode: 408 }));
    assert.match(linea, /408/);
    assert.match(linea, /boom/);
  });

  test("devuelve TEXTO, no un objeto: así no hay forma de que se expanda", () => {
    assert.equal(typeof lineaError("ctx", new Error("x")), "string");
  });

  test("aguanta lo que le echen sin romper el arranque", () => {
    for (const raro of [null, undefined, "una cadena", 42, {}, []]) {
      assert.equal(typeof lineaError("ctx", raro), "string");
    }
  });
});

describe("whatsapp.js no imprime objetos", () => {
  test("ningún console.* recibe un error crudo", () => {
    // El patrón exacto del incidente: `console.error("...", err)`.
    //
    // Se leen los argumentos DE VERDAD contando paréntesis, no con una expresión regular: con
    // una regex, `console.error(lineaError("ctx", err))` —que es lo correcto— parece el fallo,
    // porque el `err` de dentro va pegado a un paréntesis. Contando, el argumento de primer
    // nivel es la llamada entera y no un error suelto.
    const malos = [];
    const re = /console\.(?:log|error|warn|info)\(/g;
    let m;
    while ((m = re.exec(wa))) {
      let i = m.index + m[0].length, hondo = 1, ini = i, args = [];
      for (; i < wa.length && hondo > 0; i++) {
        const c = wa[i];
        if (c === "(" || c === "[" || c === "{") hondo++;
        else if (c === ")" || c === "]" || c === "}") { hondo--; if (hondo === 0) break; }
        else if (c === "," && hondo === 1) { args.push(wa.slice(ini, i)); ini = i + 1; }
      }
      args.push(wa.slice(ini, i));
      for (const a of args) {
        if (/^\s*(err|e|error|update|state|creds|sock)\s*$/.test(a)) {
          malos.push(`línea ${wa.slice(0, m.index).split("\n").length}: ${a.trim()}`);
        }
      }
    }
    assert.deepEqual(malos, [], "hay un console con un objeto entero como argumento");
  });

  test("initWhatsApp usa la línea segura", () => {
    const i = wa.indexOf("export function initWhatsApp()");
    assert.ok(i > 0);
    const f = wa.slice(i, i + 600);
    assert.match(f, /lineaError\("\[WhatsApp\] Error iniciando", err\)/);
    assert.ok(!/console\.error\("Error iniciando WhatsApp:", err\)/.test(wa), "la línea del incidente sigue ahí");
  });

  test("el logger de Baileys sigue en silent", () => {
    // Es la garantía de verdad: Baileys registra sesiones enteras a nivel debug.
    assert.match(wa, /const logBaileys = \(\) => pino\(\{\s*level: "silent"/);
    assert.match(wa, /logger: logBaileys\(\)/);
    assert.ok(!/level:\s*"(debug|trace|info)"/.test(wa), "alguien ha subido el nivel del logger");
  });

  test("y lleva redacción por si alguien lo sube para depurar", () => {
    const i = wa.indexOf("const logBaileys");
    const f = wa.slice(i, i + 1400);
    for (const campo of DEL_INCIDENTE) assert.ok(f.includes(campo), `falta ${campo} en redact`);
    assert.match(f, /censor: "\[redactado\]"/);
  });
});

describe("los logs operativos siguen estando", () => {
  test("conexión, desconexión con su código, reintentos y pausa", () => {
    // Quitar la fuga no puede dejarnos ciegos ante una desconexión.
    assert.match(wa, /WhatsApp conectado y listo/);
    assert.match(wa, /Conexión cerrada — código: \$\{code\} \| razón: \$\{reason\}/);
    assert.match(wa, /Sesión cerrada \(loggedOut\)/);
    assert.match(wa, /pausando reconexión automática/);
    assert.match(wa, /Intento \$\{reconnectAttempts \+ 1\}/);
  });

  test("la lógica de conexión y reconexión no ha cambiado", () => {
    // El arreglo toca cómo se ESCRIBE, no lo que se hace.
    assert.match(wa, /if \(code === DisconnectReason\.loggedOut\)/);
    assert.match(wa, /if \(code === 408 && reconnectAttempts >= 3\)/);
    assert.match(wa, /if \(reconnectAttempts >= 4\)/);
    assert.match(wa, /scheduleReconnect\(\);/);
    assert.match(wa, /sock\.ev\.on\("creds\.update", saveCreds\);/);
  });

  test("el aviso al móvil se mantiene", () => {
    assert.match(wa, /sendNtfyAlert\(/);
  });
});
