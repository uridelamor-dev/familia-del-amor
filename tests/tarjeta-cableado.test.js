// La tarjeta de cliente, cableada en server.js.
//
// Tests de introspección: se lee `server.js` como texto. Es el estilo de la casa para el
// monolito —990 KB no se montan en un test— y aquí sirve para blindar tres cosas que no dan
// error cuando se rompen: el orden de las rutas, que los secretos no salgan por la API, y que
// haya UN SOLO SITIO componiendo el enlace que lee el escáner de la barra.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const wallet = readFileSync(new URL("../src/modules/wallet/wallet.js", import.meta.url), "utf8");

/** Dónde se declara una ruta. -1 si no está. */
const donde = (ruta) => server.indexOf(`"${ruta}"`);

describe("las rutas de la tarjeta están registradas", () => {
  test("las públicas del cliente", () => {
    assert.match(server, /app\.post\("\/api\/tarjeta\/alta"/);
    assert.match(server, /app\.get\("\/api\/tarjeta\/:token"/);
    assert.match(server, /app\.get\("\/api\/wallet\/apple\/:token"/);
    assert.match(server, /app\.get\("\/api\/wallet\/google\/:token"/);
  });

  test("las del panel", () => {
    assert.match(server, /app\.get\("\/api\/tarjeta\/cartel", requireAuth\(PROMOS_ROLES\)/);
    assert.match(server, /app\.get\("\/api\/tarjeta\/resumen", requireAuth\(PROMOS_ROLES\)/);
    assert.match(server, /app\.get\("\/api\/wallet\/config", requireAuth\(WALLET_ROLES\)/);
    assert.match(server, /app\.post\("\/api\/wallet\/config", requireAuth\(WALLET_ROLES\)/);
    assert.match(server, /app\.post\("\/api\/wallet\/probe", requireAuth\(WALLET_ROLES\)/);
  });

  test("las credenciales solo las toca dirección", () => {
    // Ahí dentro hay una clave privada de firma: quien la tenga puede emitir pases a nombre de
    // la empresa.
    assert.match(server, /const WALLET_ROLES = \["direccion"\]/);
  });
});

describe("orden de las rutas", () => {
  // Express recorre las rutas en orden y gana la primera que casa. Si `/api/tarjeta/:token`
  // fuera antes, «cartel» y «resumen» llegarían como si fueran un token y el panel vería un 404
  // sin ninguna pista de por qué. Mismo motivo por el que `/api/contactos/poblaciones` va antes
  // que `/api/contactos/:telefono`.
  const token = donde("/api/tarjeta/:token");

  test("las literales van ANTES que /:token", () => {
    assert.ok(token > 0, "no se encuentra /api/tarjeta/:token");
    for (const literal of ["/api/tarjeta/alta", "/api/tarjeta/cartel", "/api/tarjeta/resumen"]) {
      const p = donde(literal);
      assert.ok(p > 0, `no se encuentra ${literal}`);
      assert.ok(p < token, `${literal} se declara DESPUÉS de /:token y nunca se alcanzará`);
    }
  });
});

describe("frenos en lo que es público", () => {
  test("todas las rutas públicas de la tarjeta llevan rate limit", () => {
    // Sin freno, un formulario público que crea tarjetas y manda WhatsApps se convierte en un
    // generador de mensajes. Mismo criterio que /api/leads y /api/pulso/:token.
    for (const ruta of ["/api/tarjeta/alta", "/api/tarjeta/:token",
                        "/api/wallet/apple/:token", "/api/wallet/google/:token"]) {
      const i = donde(ruta);
      assert.ok(i > 0, `no se encuentra ${ruta}`);
      const cuerpo = server.slice(i, i + 400);
      assert.match(cuerpo, /pulsoRateLimit\(req, res, /, `${ruta} no tiene rate limit`);
    }
  });
});

describe("los secretos no salen por la API", () => {
  const i = server.indexOf('app.get("/api/wallet/config"');
  const j = server.indexOf('app.post("/api/wallet/config"');
  const handler = server.slice(i, j);

  test("el handler de lectura existe y está acotado", () => {
    assert.ok(i > 0 && j > i, "no se encuentran los handlers de /api/wallet/config");
  });

  /** El objeto literal que se le asigna a `salida.<qué>`, con las llaves contadas. Leer el
   *  handler entero no vale: ahí dentro SÍ se lee el .p12 para sacarle la fecha de caducidad, y
   *  lo que importa no es que se lea, es que no se devuelva. */
  function literalDe(que) {
    const ini = handler.indexOf(`salida.${que} = {`);
    assert.ok(ini > 0, `no se encuentra la construcción de salida.${que}`);
    let p = handler.indexOf("{", ini), n = 0;
    for (let i = p; i < handler.length; i++) {
      if (handler[i] === "{") n++;
      else if (handler[i] === "}" && --n === 0) return handler.slice(p, i + 1);
    }
    throw new Error(`no se cierra el literal de salida.${que}`);
  }

  test("no devuelve el certificado, la contraseña ni la clave privada", () => {
    // Ni siquiera a dirección: no hay ninguna pantalla que los necesite, y lo que no sale por la
    // API no se filtra por un log ni por el historial del navegador.
    //
    // Se persiguen dos formas de colarlo: una CLAVE con ese nombre en la respuesta, y el secreto
    // puesto tal cual como VALOR de otra clave. Mencionarlo dentro de un `!!( … )` para decir si
    // está cargado no cuenta: eso devuelve un sí o un no, no el secreto.
    const devuelto = literalDe("apple") + literalDe("google");
    for (const campo of ["p12_b64", "p12_pass", "sa_key", "datos_enc", "wwdr_pem"]) {
      assert.ok(!new RegExp(`(^|[\\s{,])${campo}\\s*:`).test(devuelto),
        `la respuesta lleva una clave «${campo}»`);
      assert.ok(!new RegExp(`:\\s*(apple|google|c)\\.${campo}\\b`).test(devuelto),
        `la respuesta devuelve ${campo} como valor`);
    }
  });

  test("tampoco se cuela un volcado entero de la configuración", () => {
    // `...apple` o `...cfg` en la respuesta lo mandaría todo, secretos incluidos, sin que
    // ninguna línea del fichero mencione un solo nombre de campo.
    const devuelto = literalDe("apple") + literalDe("google");
    assert.ok(!/\.\.\.\s*(apple|google|cfg|c)\b/.test(devuelto), "se está esparciendo la configuración entera");
    assert.ok(!/res\.json\([^)]*datos_enc/.test(handler));
  });

  test("de la contraseña y de la clave solo sale una pista", () => {
    assert.match(handler, /secPista\(/);
  });

  test("lo que se guarda va cifrado, no en claro", () => {
    // Desde R01 la clave es `DATA_ENC_KEY` (un Secret propio) y no una derivada del JWT_SECRET,
    // que resultó ser la cadena "[object Object]". El dominio separa esto de los secretos de
    // Ágora: un certificado de la wallet no se abre con el contexto del TPV ni al revés.
    const escritura = server.slice(j, j + 3000);
    assert.match(escritura, /secCifrar\(JSON\.stringify\(guardar\), LLAVERO, DOMINIOS\.WALLET\)/);
    assert.ok(!/datos_enc.*JSON\.stringify\(guardar\)\s*,/.test(escritura.replace(/secCifrar\([^)]*\)/g, "X")),
      "parece que se guarda el JSON sin cifrar");
  });

  test("y no se guarda NADA si falta la clave", () => {
    // Guardar un .p12 en claro porque faltaba un Secret sería peor que el error de no guardarlo.
    const handlerGuardar = server.slice(server.indexOf('app.post("/api/wallet/config"'),
                                        server.indexOf("INSERT INTO wallet_config"));
    assert.match(handlerGuardar, /!LLAVERO\.puedeCifrar[\s\S]{0,220}res\.status\(503\)/);
  });
});

describe("un solo sitio compone el enlace que lee la barra", () => {
  test("`urlTarjeta` es la única que escribe /tarjeta.html", () => {
    // El día que alguien lo escriba a mano en el pase de Apple, el pase se guardará bien, se
    // verá bien, y no lo leerá nadie en la barra. Sin este test, eso se descubre con un cliente
    // delante.
    const sinComentarios = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const enServer = (sinComentarios(server).match(/\/tarjeta\.html/g) || []).length;
    assert.equal(enServer, 0, "server.js compone la URL de la tarjeta a mano; debe usar urlTarjeta()");

    const enWallet = (sinComentarios(wallet).match(/\/tarjeta\.html/g) || []).length;
    assert.equal(enWallet, 1, "hay más de un sitio en wallet.js componiendo la URL");
  });

  test("el pase de Apple y el objeto de Google llaman a urlTarjeta", () => {
    const apple = wallet.slice(wallet.indexOf("export function pasePlanoApple"), wallet.indexOf("export function objetoGoogle"));
    assert.match(apple, /message: urlTarjeta\(base, qr\.token\)/);
    const google = wallet.slice(wallet.indexOf("export function objetoGoogle"));
    assert.match(google, /value: urlTarjeta\(base, qr\.token\)/);
  });
});

describe("esquema y módulos", () => {
  test("initDB prepara el esquema de la tarjeta, y en su propio try", () => {
    // Si esto fallara, validar carnés en la barra tiene que seguir funcionando: lo que se pierde
    // es poder guardar la tarjeta en el móvil.
    const i2 = server.indexOf("await ensureSchemaTarjeta(schemaX)");
    assert.ok(i2 > 0, "initDB no llama a ensureSchemaTarjeta");
    const alrededor = server.slice(i2 - 400, i2 + 400);
    assert.match(alrededor, /catch \(e\)/, "la llamada no está protegida por un try/catch");
    assert.match(alrededor, /no fatal/i);
  });

  test("la lógica vive en módulos, no dentro de server.js", () => {
    for (const mod of ["tarjeta/schema.js", "tarjeta/alta.js", "tarjeta/cuenta.js",
                       "wallet/wallet.js", "wallet/pkpass.js", "wallet/firma.js", "wallet/google.js"]) {
      assert.ok(server.includes(`./src/modules/${mod}`), `server.js no importa ${mod}`);
    }
  });

  test("el pase se descarga con su tipo de contenido y sin caché compartida", () => {
    const i3 = server.indexOf('app.get("/api/wallet/apple/:token"');
    const cuerpo = server.slice(i3, i3 + 2500);
    assert.match(cuerpo, /application\/vnd\.apple\.pkpass/);
    assert.match(cuerpo, /Cache-Control", "private, no-store/);
  });
});
