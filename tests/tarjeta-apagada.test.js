// LA TARJETA DE CLIENTE SALE APAGADA Y NO SE VE POR NINGÚN LADO.
//
// Está construida entera y probada, pero sacarla es una decisión de negocio que hoy no toca. En
// vez de borrarla —y tener que rehacerla— se queda detrás de un interruptor apagado.
//
// Este fichero es el candado de esa decisión. Lo que caza es el descuido de siempre: alguien
// toca la landing o el arranque, la tarjeta se enciende sola y aparecen páginas públicas que se
// decidió no publicar. No da error, no rompe nada, y se descubre porque un cliente pregunta.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lee = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const server = lee("../server.js");
const landing = lee("../public/index.html");
const appPublico = lee("../public/app.js");
const cupon = lee("../public/cupon.js");
const alta = lee("../public/alta.js");
const panel = lee("../public/panel/app.js");

describe("viene apagada", () => {
  test("la bandera nace en false", () => {
    assert.match(server, /let TARJETA_ACTIVA = false;/);
  });

  test("si la lectura del interruptor falla, se queda APAGADA", () => {
    // El lado seguro: como mucho no sale una función que hoy nadie usa. Al revés, saldrían a la
    // web páginas que se decidió no publicar, y por un error de base de datos.
    const i = server.indexOf("async function cargarTarjetaActiva");
    assert.ok(i > 0, "no existe cargarTarjetaActiva");
    const f = server.slice(i, i + 400);
    assert.match(f, /catch \([\s\S]*?TARJETA_ACTIVA = false/);
  });

  test("se enciende solo con un «1» explícito en config", () => {
    const i = server.indexOf("async function cargarTarjetaActiva");
    assert.match(server.slice(i, i + 400), /getConfig\("tarjeta_activa"\)[\s\S]*?=== "1"/);
  });
});

describe("de cara al cliente no existe", () => {
  test("la landing no la menciona en ningún sitio", () => {
    for (const rastro of ["alta.html", "tarjeta.html", "card_tarjeta", "Hazte la tarjeta"]) {
      assert.ok(!landing.includes(rastro), `la landing menciona «${rastro}»`);
    }
  });

  test("no quedan textos suyos en los tres idiomas de la web", () => {
    assert.ok(!appPublico.includes("card_tarjeta"), "public/app.js conserva las claves i18n de la tarjeta");
  });

  test("las cuatro rutas públicas están cerradas mientras esté apagada", () => {
    for (const ruta of ["/api/tarjeta/alta", "/api/tarjeta/:token",
                        "/api/wallet/apple/:token", "/api/wallet/google/:token"]) {
      const i = server.indexOf(`"${ruta}"`);
      assert.ok(i > 0, `no se encuentra ${ruta}`);
      // El guardia va lo PRIMERO del handler, antes incluso del rate limit: lo que no existe
      // no necesita freno, y así no hay ninguna rama que se cuele por delante.
      const cabeza = server.slice(i, i + 260);
      assert.match(cabeza, /if \(tarjetaApagada\(res\)\) return;/, `${ruta} no comprueba el interruptor`);
      assert.ok(cabeza.indexOf("tarjetaApagada") < cabeza.indexOf("pulsoRateLimit"),
        `${ruta} comprueba el interruptor DESPUÉS del rate limit`);
    }
  });

  test("apagada contesta 404, no 503", () => {
    // Un 503 dice «esto existe y está caído». Lo que se quiere decir es que aquí no hay nada.
    const i = server.indexOf("function tarjetaApagada");
    assert.match(server.slice(i, i + 260), /res\.status\(404\)/);
  });

  test("el alta se va a la portada si alguien llega probando rutas", () => {
    assert.match(alta, /fetch\("\/api\/tarjeta\/activa"\)/);
    assert.match(alta, /location\.replace\("\/"\)/);
  });
});

describe("apagada, un carné se comporta como antes de que esto existiera", () => {
  test("su enlace se queda en /cupon.html", () => {
    // Es lo que hace que encender y apagar sea reversible de verdad: con el interruptor
    // apagado, `proEnlace` devuelve exactamente lo que devolvía `proUrl` toda la vida.
    const i = server.indexOf("const proEnlace = (req, qr)");
    assert.ok(i > 0, "no se encuentra proEnlace");
    const f = server.slice(i, i + 260);
    assert.match(f, /TARJETA_ACTIVA/, "proEnlace no mira el interruptor");
    assert.match(f, /proUrl\(req, qr\.token\)/, "no queda la rama que apunta a /cupon.html");
  });

  test("la página del cupón solo redirige si el SERVIDOR dice que está encendida", () => {
    // Que lo decida el front sería que la página redirigiera a una que devuelve 404.
    assert.match(cupon, /r\.datos\.clase === "carnet" && r\.datos\.tarjeta/);
    assert.match(server, /tarjeta: TARJETA_ACTIVA,/);
  });
});

describe("el interruptor", () => {
  test("solo lo toca dirección", () => {
    assert.match(server, /app\.post\("\/api\/tarjeta\/activa", requireAuth\(\["direccion"\]\)/);
  });

  test("el GET público devuelve un booleano y nada más", () => {
    const i = server.indexOf('app.get("/api/tarjeta/activa"');
    assert.ok(i > 0);
    assert.match(server.slice(i, i + 200), /res\.json\(\{ ok: true, activa: TARJETA_ACTIVA \}\)/);
  });

  test("va declarado ANTES que /api/tarjeta/:token", () => {
    // Si no, Express le daría «activa» como si fuera un token.
    assert.ok(server.indexOf('"/api/tarjeta/activa"') < server.indexOf('"/api/tarjeta/:token"'));
  });

  test("se apunta quién la encendió", () => {
    assert.match(server, /setConfig\("tarjeta_activa_por"/);
  });
});

describe("en el panel casi no ocupa sitio", () => {
  test("la pestaña solo la ve dirección", () => {
    const i = panel.indexOf('["canjes", "Canjes"]');
    assert.ok(i > 0);
    assert.match(panel.slice(i, i + 260), /USER\.rol === "direccion" \? \[\["tarjeta", "Tarjeta de cliente"\]\] : \[\]/);
  });

  test("apagada no enseña contadores ni carteles ni certificados: solo el interruptor", () => {
    const i = panel.indexOf("function promoTarjeta()");
    const f = panel.slice(i, i + 2200);
    assert.match(f, /if \(!d\.activa\) \{/, "no hay rama de «apagada»");
    const rama = f.slice(f.indexOf("if (!d.activa) {"));
    const fin = rama.indexOf("`;");
    assert.ok(!rama.slice(0, fin).includes("tj-cartel"), "la rama de apagada enseña el cartel");
    assert.ok(!rama.slice(0, fin).includes("tj-cfg"), "la rama de apagada enseña las credenciales");
  });

  test("encenderla se confirma antes", () => {
    // Saca páginas nuevas a la web pública, que es de las cosas que luego nadie recuerda haber
    // hecho.
    const i = panel.indexOf("async function tjInterruptor");
    assert.match(panel.slice(i, i + 700), /confirm\(/);
  });
});
