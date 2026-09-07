// La captación de campaña, cableada.
//
// Tests de introspección sobre `server.js` y la página. Blindan cuatro cosas que, cuando se
// rompen, NO dan ningún error — se descubren con dinero ya gastado en el anuncio:
//
//   · que el código no se cuele en la respuesta de la pantalla que promete no enseñarlo,
//   · que a la misma persona no se le mande un segundo código,
//   · que el consentimiento se guarde ANTES de intentar el envío,
//   · que la ruta no se pueda alcanzar sin el enlace del anuncio.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const promoJs = readFileSync(new URL("../public/promo.js", import.meta.url), "utf8");
const promoHtml = readFileSync(new URL("../public/promo.html", import.meta.url), "utf8");

/** El cuerpo del handler del alta, acotado. */
const alta = (() => {
  const i = server.indexOf('app.post("/api/captacion", async');
  assert.ok(i > 0, "no está el handler del alta");
  const f = server.indexOf("function capUtm(", i);
  assert.ok(f > i);
  return server.slice(i, f);
})();

describe("las rutas están registradas y en orden", () => {
  test("las públicas y las del panel", () => {
    for (const r of ['app.get("/api/captacion/campana/:clave"', 'app.post("/api/captacion", async',
                     'app.get("/api/captacion/estado/:token"']) {
      assert.ok(server.includes(r), `falta ${r}`);
    }
    assert.match(server, /app\.get\("\/api\/captacion\/campanas", requireAuth\(PROMOS_ROLES\)/);
    assert.match(server, /app\.post\("\/api\/captacion\/campanas", requireAuth\(PROMOS_ROLES\)/);
    assert.match(server, /app\.get\("\/api\/captacion\/cola", requireAuth\(PROMOS_ROLES\)/);
  });

  test("el interruptor de pánico solo lo toca dirección", () => {
    assert.match(server, /app\.post\("\/api\/captacion\/cola\/parada", requireAuth\(\["direccion"\]\)/);
  });

  test("todo lo público lleva freno por IP", () => {
    // Un formulario público que emite un cupón y dispara un WhatsApp sin freno es un generador
    // de mensajes para cualquiera con un bucle.
    for (const r of ['app.get("/api/captacion/campana/:clave"', 'app.post("/api/captacion", async',
                     'app.get("/api/captacion/estado/:token"']) {
      const i = server.indexOf(r);
      assert.match(server.slice(i, i + 200), /pulsoRateLimit\(req, res, /, `${r} sin rate limit`);
    }
  });
});

describe("la pantalla de gracias no entrega el código", () => {
  test("la respuesta del alta no devuelve ni el código, ni el enlace, ni el token del cupón", () => {
    // Es el punto entero del diseño: el código solo viaja por WhatsApp, y eso es lo que
    // comprueba que el teléfono existe. Devolverlo aquí lo tiraría por tierra sin dar error.
    const respuesta = alta.slice(alta.lastIndexOf("res.json({"));
    for (const campo of ["codigo", "enlace", "qr:", "url:", "qr.token"]) {
      assert.ok(!respuesta.includes(campo), `la respuesta del alta lleva «${campo}»`);
    }
    assert.match(respuesta, /token,/, "sí devuelve el token de SEGUIMIENTO");
  });

  test("el token de seguimiento es distinto del token del cupón", () => {
    // Si fuera el mismo, con él se podría abrir la página del cupón y ver el código.
    assert.match(alta, /const token = generarToken\(/);
    assert.ok(!/token: qr\.token/.test(alta), "se está devolviendo el token del cupón");
  });

  test("la consulta de estado devuelve un estado y nada más", () => {
    const i = server.indexOf('app.get("/api/captacion/estado/:token"');
    const cuerpo = server.slice(i, i + 700);
    assert.match(cuerpo, /SELECT estado FROM cap_cola/, "solo se lee el estado de la fila");
    assert.match(cuerpo, /estado: estadoParaCliente\(fila\)/);
    for (const campo of ["codigo", "texto", "telefono", "qr_id"]) {
      assert.ok(!new RegExp(`${campo}\\s*:`).test(cuerpo), `la respuesta de estado lleva «${campo}»`);
    }
  });

  test("la página tampoco pinta ningún código", () => {
    assert.ok(!/codigo/i.test(promoJs), "promo.js menciona un código");
    assert.ok(!/codigo/i.test(promoHtml), "promo.html tiene un hueco para el código");
  });
});

describe("un cliente, un solo código", () => {
  test("si ya tiene cupón de esa promoción no se emite otro NI se le reenvía", () => {
    // Antes, el camino equivalente reenviaba el mismo cupón. Eso convertía un formulario
    // público en una forma de hacer que le llegaran mensajes repetidos a un tercero.
    const i = alta.indexOf("const previo = await dbGet");
    assert.ok(i > 0, "no se comprueba si ya estaba registrado");
    assert.ok(alta.indexOf("proEmitir(", i) > i, "proEmitir tiene que venir después");

    // Solo el `if (previo) { … }`, sin arrastrar los comentarios de lo que viene detrás.
    const abre = alta.indexOf("if (previo) {", i);
    const rama = alta.slice(abre, alta.indexOf("\n    }", abre));
    assert.match(rama, /ya_registrado: true/, "tiene que salir diciendo que ya está registrado");
    assert.ok(!/sendMensajeLibre|cap_cola|proEnviarWA|proEmitir/.test(rama),
      "esa rama no puede emitir ni mandar nada");
    assert.ok(!/codigo|token/.test(rama), "y no puede revelar el código del que ya lo tenía");
  });

  test("se busca por TELÉFONO y por esa promoción", () => {
    assert.match(alta, /FROM pro_qr WHERE promocion_id = \? AND telefono = \? AND anulado_en IS NULL/);
    assert.match(alta, /proTel9\(telefono\)/);
  });
});

describe("consentimiento e idioma", () => {
  test("el checkbox tiene name: si no, no llega nunca al servidor", () => {
    // El de la portada NO lo tenía, así que `marketing_prefs` no se rellenaba jamás desde la web
    // y se habría escrito a gente de una campaña de pago sin registro de consentimiento.
    assert.match(promoHtml, /id="pmConsent"[^>]*name="consent"/);
    assert.match(promoHtml, /name="consent"[^>]*required|required[^>]*name="consent"/);
  });

  test("se guarda ANTES de emitir el cupón y de encolar", () => {
    const iPref = alta.indexOf("setMarketingPref(");
    const iEmitir = alta.indexOf("proEmitir(");
    const iCola = alta.indexOf("INSERT INTO cap_cola");
    assert.ok(iPref > 0 && iEmitir > iPref, "setMarketingPref tiene que ir antes de emitir");
    assert.ok(iCola > iPref, "y antes de encolar: la cola mira `baja`");
  });

  test("el idioma del móvil viaja en el formulario y lo decide el servidor", () => {
    assert.match(promoJs, /lang: navigator\.language/);
    assert.match(alta, /elegirIdioma\(\{ delMovil: req\.body\?\.lang, deCampana: campana\.idioma \}\)/);
    assert.match(alta, /idioma,/, "el idioma elegido se guarda en la ficha");
  });
});

describe("el número tiene que existir en WhatsApp", () => {
  test("se pregunta antes de prometer nada", () => {
    // Enviar a un número sin WhatsApp no da error: se marcaría como enviado y el cliente
    // esperaría un código que no llega.
    const iWA = alta.indexOf("numeroTieneWhatsApp(");
    const iEmitir = alta.indexOf("proEmitir(");
    assert.ok(iWA > 0, "no se comprueba el número");
    assert.ok(iEmitir > iWA, "se comprueba ANTES de emitir el cupón");
  });

  test("«no se ha podido preguntar» NO deja a nadie sin código", () => {
    // `numeroTieneWhatsApp` devuelve null si WhatsApp está caído. Tratar eso como «no tiene»
    // dejaría sin su regalo a todo el que llegue durante una desconexión.
    assert.match(alta, /tieneWA === false/, "solo se corta con un `false` explícito");
  });
});

describe("a la ruta solo se llega por el anuncio", () => {
  test("no está indexada", () => {
    assert.match(promoHtml, /name="robots"\s+content="noindex, nofollow"/);
  });

  test("sin clave de campaña se va a la portada", () => {
    assert.match(promoJs, /if \(!CLAVE\) \{ location\.replace\("\/"\); return; \}/);
  });

  test("una clave que no existe y una apagada contestan lo mismo", () => {
    // Si se distinguieran, probar claves diría cuáles existen.
    const i = server.indexOf('app.get("/api/captacion/campana/:clave"');
    assert.match(server.slice(i, i + 900), /if \(!campana\) return res\.status\(404\)/);
  });

  test("ninguna página pública la enlaza", () => {
    const dir = new URL("../public/", import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".html") && x !== "promo.html")) {
      const html = readFileSync(new URL(f, dir), "utf8");
      assert.ok(!html.includes("promo.html"), `«${f}» enlaza la ruta de campaña`);
    }
  });
});

describe("la cola no pierde ni quema el número", () => {
  const cola = server.slice(server.indexOf("async function capVaciarCola()"),
                            server.indexOf("// ── Panel ──", server.indexOf("async function capVaciarCola()")));

  test("no manda si WhatsApp está caído: reintenta", () => {
    assert.match(cola, /if \(!isReady\(\)\) return;/);
  });

  test("respeta el tope diario y el interruptor de pánico", () => {
    assert.match(cola, /captacion_cola_parada/);
    assert.match(cola, /cupo\.agotado/);
    assert.match(cola, /cuantasSacar\(/);
  });

  test("espacia los envíos", () => {
    // Escribir el primero a desconocidos en ráfaga desde el número que lleva las reservas es
    // como se gana un baneo.
    assert.match(cola, /delayConJitter\(\)/);
  });

  test("dos pasadas no se solapan", () => {
    // La del reloj y la que dispara un alta pueden coincidir, y mandarían el mismo mensaje dos
    // veces.
    assert.match(cola, /if \(capColaCorriendo\) return;/);
    assert.match(server, /capColaCorriendo = false;/);
  });

  test("nada se borra: solo cambia de estado", () => {
    assert.ok(!/DELETE FROM cap_cola/.test(server), "la cola no puede borrar filas");
    assert.match(cola, /UPDATE cap_cola SET estado = \?/);
  });

  test("quien pidió no recibir mensajes no recibe", () => {
    assert.match(cola, /baja/);
    assert.match(cola, /estado = 'descartado'/);
  });
});
