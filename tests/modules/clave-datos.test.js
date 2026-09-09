// DATA_ENC_KEY: cómo se carga y, sobre todo, qué se rechaza.
//
// R01 fue una conversión silenciosa: un objeto que se convirtió en la cadena "[object Object]" y
// acabó siendo la clave AES de las credenciales de los TPV. Todo este fichero existe para que la
// puerta por la que entró esté cerrada con un test que falla si alguien la vuelve a abrir.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { validarClave, cargarLlavero, kidDe, lineaArranque, entornoDe, LONGITUD_CLAVE, VAR_ACTUAL, VAR_ANTERIOR }
  from "../../src/modules/seguridad/clave-datos.js";

// Claves de mentira, deterministas. Ninguna se parece a la de producción.
const CLAVE_A = Buffer.alloc(32, 0xa1).toString("base64");
const CLAVE_B = Buffer.alloc(32, 0xb2).toString("base64");

describe("qué se acepta como clave", () => {
  test("32 bytes en Base64, y nada más", () => {
    const r = validarClave(CLAVE_A);
    assert.equal(r.ok, true);
    assert.equal(r.clave.length, LONGITUD_CLAVE);
  });

  test("un OBJETO se rechaza diciendo que es un objeto", () => {
    // LA PRUEBA DE R01. `resolveJwtSecret()` devuelve `{ secret, status, source }` y el código
    // viejo lo metía en un `String()`, que lo aplastaba a "[object Object]". Aquí no se
    // convierte nada: si no es texto, no pasa.
    const r = validarClave({ secret: "x", status: "fuerte", source: "env" });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /no es texto \(llegó un object\)/);
  });

  test("y tampoco un número, un booleano, null o undefined", () => {
    for (const malo of [42, true, null, undefined, []]) {
      assert.equal(validarClave(malo).ok, false, String(malo));
    }
  });

  test("Base64 inválido se rechaza aunque Node sepa sacarle bytes", () => {
    // `Buffer.from(x, "base64")` IGNORA en silencio todo lo que no sea del alfabeto: "@@@@" da
    // un Buffer vacío sin quejarse. Por eso se comprueba la vuelta, no solo la longitud.
    for (const malo of ["no es base64!!", "@@@@", "abc def", "%%%%%%%%"]) {
      const r = validarClave(malo);
      assert.equal(r.ok, false, malo);
      assert.match(r.motivo, /Base64|bytes/);
    }
  });

  test("longitud incorrecta: ni 31 bytes ni 64", () => {
    for (const n of [16, 24, 31, 33, 64]) {
      const r = validarClave(Buffer.alloc(n, 5).toString("base64"));
      assert.equal(r.ok, false, `${n} bytes`);
      assert.match(r.motivo, new RegExp(`decodifica ${n}`));
    }
  });

  test("vacía o solo espacios se rechaza", () => {
    for (const malo of ["", "   ", "\n"]) assert.equal(validarClave(malo).ok, false, JSON.stringify(malo));
  });

  test("el motivo NUNCA lleva el valor que se examinó", () => {
    // Un mensaje de error acaba en un log, y un log acaba en una captura de pantalla.
    const secreto = Buffer.alloc(31, 9).toString("base64");
    const r = validarClave(secreto);
    assert.ok(!r.motivo.includes(secreto), r.motivo);
    assert.ok(!r.motivo.includes(secreto.slice(0, 8)), r.motivo);
  });
});

describe("el kid", () => {
  test("identifica la clave y no la reconstruye", () => {
    const kid = kidDe(Buffer.from(CLAVE_A, "base64"));
    assert.match(kid, /^[0-9a-f]{12}$/);
    assert.notEqual(kid, kidDe(Buffer.from(CLAVE_B, "base64")));
  });

  test("es estable: la misma clave da siempre el mismo kid", () => {
    assert.equal(kidDe(Buffer.from(CLAVE_A, "base64")), kidDe(Buffer.from(CLAVE_A, "base64")));
  });

  test("no es el SHA-256 pelado de la clave", () => {
    // El prefijo de dominio impide que coincida con un hash que pudiera calcular cualquier otra
    // herramienta sobre el mismo material, y con él una comparación cruzada.
    const clave = Buffer.from(CLAVE_A, "base64");
    const pelado = crypto.createHash("sha256").update(clave).digest("hex").slice(0, 12);
    assert.notEqual(kidDe(clave), pelado);
  });

  test("solo acepta un Buffer", () => {
    assert.throws(() => kidDe("una cadena"), TypeError);
  });
});

describe("el llavero", () => {
  test("con la clave puesta, se puede cifrar", () => {
    const ll = cargarLlavero({ env: { [VAR_ACTUAL]: CLAVE_A } });
    assert.equal(ll.estado, "ok");
    assert.equal(ll.puedeCifrar, true);
    assert.equal(ll.actual.kid, kidDe(Buffer.from(CLAVE_A, "base64")));
  });

  test("sin clave, se arranca igual pero NO se cifra", () => {
    // Es la decisión que permite desplegar el código antes de poner el Secret: se sigue leyendo
    // todo lo guardado y solo se corta la escritura de secretos nuevos.
    const ll = cargarLlavero({ env: {} });
    assert.equal(ll.estado, "ausente");
    assert.equal(ll.puedeCifrar, false);
    assert.equal(ll.actual, null);
  });

  test("NUNCA hay clave de reserva", () => {
    // Un valor por defecto sería volver a R01 con otro nombre.
    for (const env of [{}, { [VAR_ACTUAL]: "" }, { [VAR_ACTUAL]: "chapuza" }, { JWT_SECRET: "un-secreto-largo-de-verdad" }]) {
      assert.equal(cargarLlavero({ env }).actual, null, JSON.stringify(env));
    }
  });

  test("una clave inválida se dice, y tampoco se cifra", () => {
    const ll = cargarLlavero({ env: { [VAR_ACTUAL]: "esto-no-vale" } });
    assert.equal(ll.estado, "invalida");
    assert.equal(ll.puedeCifrar, false);
  });

  test("la clave anterior se carga para poder rotar", () => {
    const ll = cargarLlavero({ env: { [VAR_ACTUAL]: CLAVE_A, [VAR_ANTERIOR]: CLAVE_B } });
    assert.equal(ll.actual.kid, kidDe(Buffer.from(CLAVE_A, "base64")));
    assert.equal(ll.anterior.kid, kidDe(Buffer.from(CLAVE_B, "base64")));
  });

  test("una clave anterior mal escrita no tumba la actual", () => {
    // Rotar es justo cuando más se escribe a mano en un panel de Secrets.
    const ll = cargarLlavero({ env: { [VAR_ACTUAL]: CLAVE_A, [VAR_ANTERIOR]: "rota" } });
    assert.equal(ll.puedeCifrar, true);
    assert.equal(ll.anterior, null);
    assert.match(ll.motivo, /ANTERIOR/);
  });

  test("distingue producción, test y desarrollo", () => {
    assert.equal(entornoDe({ APP_ENV: "production" }), "produccion");
    assert.equal(entornoDe({ NODE_ENV: "test" }), "test");
    assert.equal(entornoDe({}), "desarrollo");
  });
});

describe("la línea del arranque", () => {
  test("dice el kid y NUNCA la clave", () => {
    const ll = cargarLlavero({ env: { [VAR_ACTUAL]: CLAVE_A } });
    const linea = lineaArranque(ll);
    assert.ok(linea.includes(ll.actual.kid));
    assert.ok(!linea.includes(CLAVE_A), linea);
    assert.ok(!linea.includes(CLAVE_A.slice(0, 10)), linea);
  });

  test("si falta en producción, se grita; en desarrollo, no", () => {
    assert.match(lineaArranque(cargarLlavero({ env: { APP_ENV: "production" } })), /AVISO/);
    assert.ok(!/AVISO/.test(lineaArranque(cargarLlavero({ env: {} }))));
  });

  test("una clave inválida se ve, sin enseñar el valor", () => {
    const linea = lineaArranque(cargarLlavero({ env: { [VAR_ACTUAL]: "valor-secreto-mal-puesto" } }));
    assert.match(linea, /INVÁLIDA/);
    assert.ok(!linea.includes("valor-secreto-mal-puesto"), linea);
  });
});
