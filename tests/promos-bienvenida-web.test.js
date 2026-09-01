// El 10 % de la web: que no se pueda pedir dos veces.
//
// Durante años esto fue el texto «10% de descuento» guardado en `leads.premio` y nada más.
// El lead SÍ se deduplicaba, pero la respuesta era idéntica las dos veces, así que la misma
// persona podía volver al popup cada semana y llevarse el descuento otra vez.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const esquema = readFileSync(new URL("../src/modules/promos/schema.js", import.meta.url), "utf8");
const landing = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

const bienvenida = (() => {
  const i = server.indexOf("async function bienvenidaWeb(");
  assert.ok(i > 0, "no está bienvenidaWeb");
  const f = server.indexOf('app.post("/api/leads"', i);
  assert.ok(f > i);
  return server.slice(i, f);
})();

describe("el descuento de bienvenida no se da dos veces", () => {
  test("se busca por TELÉFONO, no por lead", () => {
    // Los leads se unifican por tel9 o por correo. Quien vuelve con otro correo pero el mismo
    // móvil es la misma persona, y mirando el lead se le daría un cupón nuevo.
    assert.match(bienvenida, /FROM pro_qr WHERE promocion_id = \? AND telefono = \?/);
    assert.match(bienvenida, /proTel9\(telefono\)/);
  });

  test("si ya lo tiene sin usar, NO se emite otro", () => {
    // El camino del cupón previo tiene que salir de la función antes de llegar a proEmitir.
    const previo = bienvenida.slice(bienvenida.indexOf("if (previo)"));
    const hastaEmitir = previo.indexOf("proEmitir(");
    assert.ok(hastaEmitir > 0, "proEmitir tiene que venir después");
    assert.ok(/return \{ estado: "ya_emitido" \}/.test(previo.slice(0, hastaEmitir)),
      "el camino del cupón ya emitido tiene que devolver antes de emitir otro");
  });

  test("y no se enseña en pantalla: se reenvía al móvil", () => {
    // Enseñarlo permitiría sacar el cupón de cualquiera probando teléfonos ajenos.
    const previo = bienvenida.slice(bienvenida.indexOf("if (previo)"), bienvenida.indexOf("const qr = await proEmitir"));
    assert.ok(!/\bqr:/.test(previo), "el cupón ya emitido no puede devolver la imagen");
    assert.ok(!/\burl\b\s*,/.test(previo.replace(/proUrl\([^)]*\)/g, "")), "ni el enlace");
    assert.match(previo, /proEnviarWA/);
  });

  test("si ya lo gastó se dice, y no se emite nada", () => {
    assert.match(bienvenida, /return \{ estado: "ya_usado", texto: info\.texto \}/);
  });

  test("la primera vez sí se enseña, con QR y código", () => {
    assert.match(bienvenida, /estado: "nuevo"[\s\S]{0,80}codigo: qr\.codigo/);
  });

  test("quién decide si el cupón sigue valiendo es el módulo, no este handler", () => {
    // La misma función que usa el kiosco. Si aquí se dedujera por separado, la web podría
    // decir «ya lo usaste» de uno que en la barra sí vale.
    assert.match(bienvenida, /await proEvaluar\(previo, promo, \{\}\)/);
  });
});

describe("un lead no se pierde nunca por culpa del cupón", () => {
  test("la emisión va envuelta y devuelve null si falla", () => {
    // El dato del cliente vale mucho más que el descuento: si algo revienta emitiendo, el
    // formulario tiene que seguir guardando y comportarse como siempre.
    assert.match(server, /async function conCupon\(req, telefono, nombre\)[\s\S]{0,220}catch[\s\S]{0,120}return null/);
    assert.match(server, /bienvenida: await conCupon\(req, telefono, nombre\)/);
  });

  test("si Marketing para la promoción, se devuelve null y no pasa nada", () => {
    assert.match(bienvenida, /if \(!promo \|\| !promo\.activa\) return null/);
  });

  test("el consentimiento se registra ANTES de intentar el envío", () => {
    // `proEnviarWA` mira `marketing_prefs.baja`. Si el consentimiento aún no estuviera
    // guardado, a quien acaba de aceptar en el formulario no se le mandaría el cupón.
    const handler = server.slice(server.indexOf('app.post("/api/leads"'));
    const trozo = handler.slice(0, handler.indexOf("async function conCupon"));
    for (const m of trozo.matchAll(/bienvenida: await conCupon/g)) {
      assert.ok(trozo.lastIndexOf("registrarConsent()", m.index) > 0,
        "registrarConsent tiene que ir antes de emitir el cupón");
    }
  });
});

describe("la ruta pública ya no está sin freno", () => {
  test("/api/leads tiene límite por IP", () => {
    // Desde que emite valor real, dejarla abierta permite enumerar teléfonos y emitir
    // descuentos en bucle.
    const handler = server.slice(server.indexOf('app.post("/api/leads"'));
    assert.match(handler.slice(0, 400), /pulsoRateLimit\(req, res, 10\)/);
  });
});

describe("nada se emite retroactivamente", () => {
  test("la promoción se crea una sola vez y no se reescribe", () => {
    // A los leads antiguos no se les emite nada: serían cientos de mensajes que nadie ha
    // pedido. Y si Marketing la renombra o la para, se respeta.
    assert.match(esquema, /ON CONFLICT DO NOTHING/);
    // El esquema SÍ puede corregir un texto suyo de una vez, pero solo si nadie lo ha tocado:
    // toda sentencia que escriba sobre la promoción tiene que ir condicionada al valor exacto
    // que se quiere corregir. Un UPDATE a secas pisaría lo que Marketing haya escrito, en cada
    // arranque y sin que nadie se entere.
    for (const m of esquema.matchAll(/UPDATE pro_promociones[\s\S]{0,400}?`/g)) {
      assert.match(m[0], /WHERE[\s\S]{0,120}descripcion = \?/,
        "un UPDATE sobre la promoción tiene que ir guardado por el texto que corrige");
    }
  });
});

describe("lo que se le dice al cliente", () => {
  const envio = server.slice(server.indexOf("async function proEnviarWA"));
  const plantilla = envio.slice(0, envio.indexOf("await sendMensajeLibre"));

  test("no se le recuerda que nos dio sus datos", () => {
    // Se le está haciendo un regalo, no cobrando un peaje. La frase original decía «por
    // dejarnos tus datos en la web» y convertía el detalle en una transacción.
    assert.ok(!/dejarnos tus datos|a cambio|por darnos/i.test(plantilla), plantilla);
    // Y la promoción nace sin esa muletilla: la descripción va vacía.
    assert.match(esquema, /"10 % de descuento", "", 1, "bienvenida_web"/);
  });

  test("el mensaje dice DÓNDE vale, calculado de los locales", () => {
    // No escrito a mano en la descripción: una descripción que diga «en todos los locales» se
    // queda mintiendo en cuanto alguien limita la promoción a una barra.
    assert.match(plantilla, /proDondeVale\(promo\.locales\)/);
  });

  test("la página del cupón usa esa misma frase, no una suya", () => {
    const cupon = readFileSync(new URL("../public/cupon.js", import.meta.url), "utf8");
    assert.match(cupon, /promo\.donde/);
    assert.ok(!/promo\.locales/.test(cupon), "la página no puede montar la frase por su cuenta");
  });

  test("la corrección del texto viejo solo toca lo que nadie ha editado", () => {
    assert.match(esquema, /descripcion = \?[\s\S]{0,120}Descuento de bienvenida por dejarnos tus datos/);
  });
});

describe("la landing cuenta los tres casos", () => {
  test("cada estado tiene su rama y su texto", () => {
    for (const [estado, clave] of [["nuevo", "lead_qr_listo"], ["ya_emitido", "lead_ya_emitido"], ["ya_usado", "lead_ya_usado"]]) {
      assert.ok(landing.includes(`b.estado === "${estado}"`), `falta la rama de «${estado}»`);
      assert.ok(landing.includes(`t2.${clave}`), `falta el texto de «${estado}»`);
    }
  });

  test("con el cupón en pantalla el popup NO se cierra solo", () => {
    // Se cierra a los 2,5 s desde siempre. Con el QR delante eso es quitárselo de las manos
    // antes de que le dé tiempo a guardarlo.
    const rama = landing.slice(landing.indexOf('b.estado === "nuevo"'));
    const hasta = rama.indexOf('b.estado === "ya_emitido"');
    assert.ok(!/popup\.classList\.remove/.test(rama.slice(0, hasta)), "esa rama no puede cerrar el popup");
  });

  test("el cupón se pinta sin construir HTML con texto de fuera", () => {
    const fn = landing.slice(landing.indexOf("function pintarCuponLead"));
    const hasta = fn.indexOf("\n}\n");
    const cuerpo = fn.slice(0, hasta);
    assert.ok(!/innerHTML\s*=\s*[^"']/.test(cuerpo.replace('innerHTML = ""', "")),
      "solo textContent: el nombre de la promoción viene del servidor");
  });
});
