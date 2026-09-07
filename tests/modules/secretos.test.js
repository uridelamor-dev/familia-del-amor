// El cifrado de secretos en reposo, que ahora usan dos sitios: la contraseña del TPV de Ágora y
// las claves de firma de la wallet.
//
// Lo que se blinda aquí es LA COMPATIBILIDAD. Este código salió de dentro de server.js con
// contraseñas de Ágora ya guardadas en la base: si el formato cambiara, la integración del TPV
// se caería en el siguiente arranque y el error que se vería sería «token inválido», que no
// apunta a ningún sitio.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { derivarClave, cifrar, descifrar, pista } from "../../src/modules/seguridad/secretos.js";

const CLAVE = derivarClave("un-secreto-de-prueba-bastante-largo", "agora-token-v1");

describe("cifrar y descifrar", () => {
  test("lo que entra es lo que sale", () => {
    const guardado = cifrar("contraseña con ñ y €", CLAVE);
    assert.equal(descifrar(guardado, CLAVE), "contraseña con ñ y €");
  });

  test("el formato es el de siempre: enc:iv:tag:ciphertext", () => {
    const g = cifrar("x", CLAVE);
    const partes = g.split(":");
    assert.equal(partes[0], "enc");
    assert.equal(partes.length, 4);
    assert.equal(partes[1].length, 24, "el IV son 12 bytes en hexadecimal");
    assert.equal(partes[2].length, 32, "la etiqueta son 16 bytes en hexadecimal");
  });

  test("dos cifrados del mismo texto salen distintos", () => {
    // IV aleatorio: si salieran iguales, con la base delante se vería qué contraseñas se repiten
    // entre locales.
    assert.notEqual(cifrar("misma", CLAVE), cifrar("misma", CLAVE));
  });

  test("un valor manipulado NO se descifra «a otra cosa»: falla", () => {
    // Es la diferencia entre GCM y un cifrado a secas. Sin autenticación, cambiar un byte en la
    // base daría una contraseña distinta y el TPV rechazaría el login sin que nadie sospechara
    // que la fila está tocada.
    const g = cifrar("secreto", CLAVE);
    const roto = g.slice(0, -2) + (g.endsWith("00") ? "11" : "00");
    assert.equal(descifrar(roto, CLAVE), null);
  });

  test("con otra clave no se descifra", () => {
    const otra = derivarClave("otro secreto distinto del anterior", "agora-token-v1");
    assert.equal(descifrar(cifrar("secreto", CLAVE), otra), null);
  });

  test("la sal separa los usos: lo de Ágora no se abre con la clave de la wallet", () => {
    const wallet = derivarClave("un-secreto-de-prueba-bastante-largo", "wallet-v1");
    assert.equal(descifrar(cifrar("secreto", CLAVE), wallet), null);
  });

  test("un valor en claro se devuelve tal cual", () => {
    // Compat: hubo tokens sembrados desde variables de entorno sin cifrar. Romperlos al leer
    // habría dejado el TPV sin conexión sin decir por qué.
    assert.equal(descifrar("token-viejo-en-claro", CLAVE), "token-viejo-en-claro");
  });

  test("vacío y nulo no revientan", () => {
    assert.equal(cifrar("", CLAVE), null);
    assert.equal(cifrar(null, CLAVE), null);
    assert.equal(descifrar(null, CLAVE), null);
  });
});

describe("descifra lo que cifró la versión anterior", () => {
  test("un valor escrito con el código viejo se sigue leyendo", () => {
    // Se reproduce a mano lo que hacía `agoraEncToken` dentro de server.js, byte a byte.
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", CLAVE, iv);
    const ct = Buffer.concat([c.update("contraseña-de-agora", "utf8"), c.final()]);
    const comoAntes = "enc:" + iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + ct.toString("hex");

    assert.equal(descifrar(comoAntes, CLAVE), "contraseña-de-agora");
  });
});

describe("la pista que se enseña en el panel", () => {
  test("solo los cuatro últimos caracteres", () => {
    assert.equal(pista("abcdefgh1234"), "••••1234");
  });

  test("un secreto corto no se enseña entero", () => {
    assert.equal(pista("abc"), "••••");
    assert.equal(pista(""), "••••");
  });
});

describe("Ágora ya no tiene su propia copia del cifrado", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("delega en el módulo y conserva la misma sal", () => {
    // La sal es lo que hace que las contraseñas del TPV que ya están guardadas se sigan
    // descifrando. Cambiarla sería perderlas todas de golpe.
    assert.match(server, /derivarClave\(resolveJwtSecret\(\) \|\| "tapeta", "agora-token-v1"\)/);
    assert.match(server, /const agoraEncToken = \(plain\) => secCifrar\(plain, AGORA_ENC_KEY\)/);
    assert.match(server, /const agoraDecToken = \(stored\) => secDescifrar\(stored, AGORA_ENC_KEY\)/);
  });

  test("no quedan dos implementaciones del mismo cifrado", () => {
    const veces = (server.match(/createCipheriv\("aes-256-gcm"/g) || []).length;
    assert.equal(veces, 0, "server.js vuelve a cifrar por su cuenta; debe usar src/modules/seguridad/secretos.js");
  });
});
