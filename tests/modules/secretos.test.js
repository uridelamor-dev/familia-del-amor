// El cifrado de secretos en reposo: las credenciales de los TPV de Ágora y los certificados de
// firma de la wallet.
//
// Lo que se blinda aquí es LA COMPATIBILIDAD en las dos direcciones. En producción hay valores
// reales cifrados con el mecanismo viejo (R01) que hay que poder seguir leyendo hasta que la
// migración los pase, y valores nuevos que solo se pueden escribir en v2. Si cualquiera de las
// dos cosas se rompe, el síntoma es «el TPV no conecta» y no apunta a ningún sitio.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { cifrar, descifrar, abrir, formatoDe, kidDeValor, pista, DOMINIOS, V2_PREFIJO }
  from "../../src/modules/seguridad/secretos.js";
import { cargarLlavero, VAR_ACTUAL, VAR_ANTERIOR } from "../../src/modules/seguridad/clave-datos.js";
import { claveLegada, descifrarLegado, pareceLegado, SECRETO_ROTO } from "../../src/modules/seguridad/legado-inseguro.js";

const B64_A = Buffer.alloc(32, 0xa1).toString("base64");
const B64_B = Buffer.alloc(32, 0xb2).toString("base64");
const LL = cargarLlavero({ env: { [VAR_ACTUAL]: B64_A } });
const LL_OTRA = cargarLlavero({ env: { [VAR_ACTUAL]: B64_B } });
const LL_SIN = cargarLlavero({ env: {} });

/** Escribe un valor como lo escribía el código roto, byte a byte. Solo para las pruebas. */
function comoElCodigoViejo(plano, sal) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", claveLegada(sal), iv);
  const ct = Buffer.concat([c.update(plano, "utf8"), c.final()]);
  return "enc:" + iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + ct.toString("hex");
}

describe("cifrar y descifrar en v2", () => {
  test("lo que entra es lo que sale", () => {
    const g = cifrar("contraseña con ñ y €", LL, DOMINIOS.AGORA);
    assert.equal(descifrar(g, LL, DOMINIOS.AGORA), "contraseña con ñ y €");
  });

  test("el formato es enc:v2:kid:iv:tag:ciphertext", () => {
    const g = cifrar("x", LL, DOMINIOS.AGORA);
    assert.ok(g.startsWith(V2_PREFIJO), g);
    const partes = g.split(":");
    assert.equal(partes.length, 6);
    assert.equal(partes[1], "v2");
    assert.equal(partes[2], LL.actual.kid);
    assert.equal(formatoDe(g), "v2");
  });

  test("aguanta un valor largo: un .p12 en base64 son varios KB", () => {
    const gordo = crypto.randomBytes(4096).toString("base64");
    assert.equal(descifrar(cifrar(gordo, LL, DOMINIOS.WALLET), LL, DOMINIOS.WALLET), gordo);
  });

  test("dos cifrados del mismo texto salen distintos", () => {
    // IV aleatorio: si salieran iguales, con la base delante se vería qué contraseñas se repiten
    // entre locales.
    assert.notEqual(cifrar("misma", LL, DOMINIOS.AGORA), cifrar("misma", LL, DOMINIOS.AGORA));
  });

  test("vacío y nulo no revientan", () => {
    assert.equal(cifrar("", LL, DOMINIOS.AGORA), null);
    assert.equal(cifrar(null, LL, DOMINIOS.AGORA), null);
    assert.equal(descifrar(null, LL, DOMINIOS.AGORA), null);
  });
});

describe("el kid decide qué clave abre el valor", () => {
  test("con la clave que lo cifró, se abre", () => {
    assert.equal(kidDeValor(cifrar("x", LL, DOMINIOS.AGORA)), LL.actual.kid);
  });

  test("con otra clave NO se abre, y se dice que el kid no se conoce", () => {
    const r = abrir(cifrar("secreto", LL, DOMINIOS.AGORA), LL_OTRA, DOMINIOS.AGORA);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "kid_desconocido");
    assert.equal(r.valor, null);
  });

  test("un kid que no es de nadie tampoco se intenta descifrar a ciegas", () => {
    const g = cifrar("x", LL, DOMINIOS.AGORA).replace(LL.actual.kid, "000000000000");
    assert.equal(abrir(g, LL, DOMINIOS.AGORA).motivo, "kid_desconocido");
  });

  test("ROTACIÓN: con la clave anterior cargada se sigue leyendo lo viejo y se escribe con la nueva", () => {
    // Es lo que permite cambiar de clave sin parar el servicio ni migrar todo de golpe.
    const antiguo = cifrar("credencial", LL_OTRA, DOMINIOS.AGORA);
    const rotado = cargarLlavero({ env: { [VAR_ACTUAL]: B64_A, [VAR_ANTERIOR]: B64_B } });
    assert.equal(descifrar(antiguo, rotado, DOMINIOS.AGORA), "credencial");
    assert.equal(kidDeValor(cifrar("nueva", rotado, DOMINIOS.AGORA)), rotado.actual.kid);
  });
});

describe("un valor manipulado falla, no devuelve otra cosa", () => {
  test("cambiar un byte del criptograma se detecta", () => {
    // Es la diferencia entre GCM y un cifrado a secas. Sin autenticación, cambiar un byte en la
    // base daría una contraseña distinta y el TPV rechazaría el login sin que nadie sospechara
    // que la fila está tocada.
    const g = cifrar("secreto", LL, DOMINIOS.AGORA);
    const roto = g.slice(0, -2) + (g.endsWith("AA") ? "BB" : "AA");
    const r = abrir(roto, LL, DOMINIOS.AGORA);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "no_descifra");
  });

  test("cambiar la etiqueta también", () => {
    const p = cifrar("secreto", LL, DOMINIOS.AGORA).split(":");
    p[4] = Buffer.alloc(16, 3).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    assert.equal(abrir(p.join(":"), LL, DOMINIOS.AGORA).ok, false);
  });

  test("un «enc:» que no es ningún formato es CORRUPTO, no texto en claro", () => {
    // Devolverlo tal cual sería mandarle a Ágora la cadena «enc:...» como si fuera la contraseña.
    for (const basura of ["enc:", "enc:v2:zzz", "enc:1:2:3:4:5:6", "enc:solo-una-cosa"]) {
      assert.equal(formatoDe(basura), "corrupto", basura);
      const r = abrir(basura, LL, DOMINIOS.AGORA);
      assert.equal(r.ok, false);
      assert.equal(r.valor, null);
    }
  });
});

describe("los dominios no se cruzan", () => {
  test("lo de Ágora no se abre con el contexto de la wallet", () => {
    // El formato viejo lo conseguía con una sal distinta por uso. Aquí va como datos
    // autenticados del GCM: misma garantía, una sola clave.
    const g = cifrar("secreto", LL, DOMINIOS.AGORA);
    assert.equal(abrir(g, LL, DOMINIOS.WALLET).ok, false);
    assert.equal(descifrar(g, LL, DOMINIOS.AGORA), "secreto");
  });

  test("cifrar sin decir para qué es, no se puede", () => {
    assert.throws(() => cifrar("x", LL), TypeError);
  });
});

describe("sin clave no se cifra, y se nota", () => {
  test("cifrar LANZA: nunca guarda en claro por no tener clave", () => {
    // Guardar en claro la contraseña de un TPV porque faltaba un Secret sería mucho peor que el
    // error que se ve al intentarlo.
    assert.throws(() => cifrar("contraseña", LL_SIN, DOMINIOS.AGORA), /DATA_ENC_KEY/);
  });

  test("pero se sigue LEYENDO todo lo que ya estaba", () => {
    // Es lo que permite desplegar el código antes de poner el Secret.
    assert.equal(descifrar(comoElCodigoViejo("contraseña-vieja", DOMINIOS.AGORA), LL_SIN, DOMINIOS.AGORA), "contraseña-vieja");
    assert.equal(descifrar("token-en-claro", LL_SIN, DOMINIOS.AGORA), "token-en-claro");
  });

  test("una clave suelta en vez de un llavero se rechaza: no se convierte nada", () => {
    // R01 entró por una conversión silenciosa. Aquí, o es un llavero o es un TypeError.
    for (const malo of [Buffer.alloc(32, 1), "una-clave", 42, null, undefined, {}]) {
      assert.throws(() => cifrar("x", malo, DOMINIOS.AGORA), TypeError, String(malo));
      assert.throws(() => abrir("x", malo, DOMINIOS.AGORA), TypeError, String(malo));
    }
  });
});

describe("compatibilidad hacia atrás", () => {
  test("se lee lo que escribió el código con el fallo R01", () => {
    // LA PRUEBA QUE PROTEGE LOS DATOS REALES: en producción hay siete valores escritos así.
    for (const sal of [DOMINIOS.AGORA, DOMINIOS.WALLET]) {
      const viejo = comoElCodigoViejo("credencial-real", sal);
      assert.equal(formatoDe(viejo), "legado");
      const r = abrir(viejo, LL, sal);
      assert.equal(r.ok, true);
      assert.equal(r.valor, "credencial-real");
      assert.equal(r.formato, "legado");
    }
  });

  test("la clave legada sale del literal «[object Object]», que es lo que pasó de verdad", () => {
    assert.equal(SECRETO_ROTO, "[object Object]");
    assert.deepEqual(claveLegada(DOMINIOS.AGORA), crypto.scryptSync("[object Object]", DOMINIOS.AGORA, 32));
  });

  test("un valor en claro se devuelve tal cual", () => {
    // Compat: hubo tokens sembrados desde la variable AGORA_LOCALES sin cifrar. Romperlos al leer
    // habría dejado el TPV sin conexión sin decir por qué.
    assert.equal(formatoDe("token-viejo-en-claro"), "claro");
    assert.equal(descifrar("token-viejo-en-claro", LL, DOMINIOS.AGORA), "token-viejo-en-claro");
  });

  test("las sales viejas seguían separando Ágora de la wallet", () => {
    assert.equal(descifrarLegado(comoElCodigoViejo("x", DOMINIOS.AGORA), DOMINIOS.WALLET), null);
  });

  test("`pareceLegado` no confunde un v2 con el formato viejo", () => {
    assert.equal(pareceLegado(cifrar("x", LL, DOMINIOS.AGORA)), false);
  });
});

describe("NO se puede escribir en formato legado", () => {
  const legado = readFileSync(new URL("../../src/modules/seguridad/legado-inseguro.js", import.meta.url), "utf8");
  const secretos = readFileSync(new URL("../../src/modules/seguridad/secretos.js", import.meta.url), "utf8");

  test("el módulo legado no exporta nada que cifre", () => {
    // La única garantía que aguanta el paso del tiempo: no se puede llamar a lo que no existe.
    assert.ok(!/createCipheriv/.test(legado), "el lector legado tiene una función de cifrar");
    assert.ok(!/export function cifrar/.test(legado));
  });

  test("el módulo de secretos solo cifra en v2", () => {
    const cifrados = secretos.match(/createCipheriv\([^)]*\)/g) || [];
    assert.equal(cifrados.length, 1, "hay más de un camino para cifrar");
    const i = secretos.indexOf("export function cifrar");
    assert.match(secretos.slice(i, i + 900), /V2_PREFIJO/);
  });

  test("todo lo que sale de `cifrar` empieza por enc:v2:", () => {
    for (const txt of ["a", "ñ", "x".repeat(1000), "{}"]) {
      assert.ok(cifrar(txt, LL, DOMINIOS.WALLET).startsWith("enc:v2:"), txt.slice(0, 10));
    }
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
