// ENTREGAR UN CÓDIGO NO ES HACER UNA CAMPAÑA.
//
// ── LA DISTINCIÓN ───────────────────────────────────────────────────────────────────────────
//
// ENTREGA — la persona rellenó el formulario hace diez segundos y el mensaje solo le trae lo que
//   pidió: su código. No se la ha metido en ninguna lista, así que «para dejar de recibir estos
//   mensajes» debajo sugeriría que sí. Sin pie.
//
// COMERCIAL — campañas, cumpleaños, envíos masivos, lo programado. Ahí la persona SÍ está en una
//   lista y no ha pedido ESE mensaje concreto. Con su enlace de baja, como siempre.
//
// ── POR QUÉ NO ES UN `.replace()` ───────────────────────────────────────────────────────────
//
// Quitar la coletilla del texto final sería quitar la consecuencia sin tocar la causa: el día que
// alguien traduzca el pie o lo escriba distinto, el recorte no lo encontraría y volvería a salir.
// La decisión se toma UNA vez, por tipo, y el mensaje de entrega nunca llega a llevarlo.
//
// Nada de este fichero abre un socket ni manda un mensaje: se ejecuta el módulo puro y se lee el
// código.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { componerMensaje, conPieDeBaja, llevaPieDeBaja, TIPO_MENSAJE, PIE_BAJA, pieBaja }
  from "../src/modules/fidelizacion/baja.js";

const SERVER = readFileSync(new URL("../server.js", import.meta.url), "utf8");

/** Bloque por conteo de llaves, con la flecha como marca del cuerpo. LANZA si el ancla no está. */
function bloque(texto, ancla) {
  const i = texto.indexOf(ancla);
  if (i === -1) throw new Error(`ancla no encontrada: «${ancla}»`);
  const flecha = texto.slice(i, i + 400).search(/=>\s*\{/);
  let abre = -1;
  if (flecha >= 0) {
    abre = texto.indexOf("{", i + flecha);
  } else {
    let par = 0;
    for (let k = i; k < texto.length; k++) {
      const c = texto[k];
      if (c === "(") par += 1;
      else if (c === ")") par -= 1;
      else if (c === "{" && par === 0) { abre = k; break; }
    }
  }
  if (abre === -1) throw new Error(`no se encuentra el cuerpo de «${ancla}»`);
  let prof = 0, j = abre;
  for (; j < texto.length; j += 1) {
    if (texto[j] === "{") prof += 1;
    else if (texto[j] === "}") { prof -= 1; if (prof === 0) { j += 1; break; } }
  }
  if (prof !== 0) throw new Error(`bloque sin cerrar en «${ancla}»`);
  return texto.slice(i, j);
}

const ALTA = bloque(SERVER, 'app.post("/api/publico/formulario/:clave"');

const CODIGO = "https://familiadelamor.org/tarjeta.html?t=" + "A".repeat(43);
const BAJA = "https://familiadelamor.org/baja?t=" + "B".repeat(40);
const CUERPO = `Gràcies per voler formar part! ❤️\n\nAquí tens el teu codi:\n${CODIGO}\n\nLa Tapeta`;

// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("el WhatsApp inmediato del formulario NO lleva baja", () => {
  test("no aparece el pie en ningún idioma, ni el enlace de baja", () => {
    const texto = componerMensaje(CUERPO, { tipo: TIPO_MENSAJE.ENTREGA, enlaceBaja: BAJA, pie: pieBaja("ca") });
    for (const [idioma, pie] of Object.entries(PIE_BAJA)) {
      assert.ok(!texto.includes(pie), `la entrega lleva el pie en «${idioma}»`);
    }
    assert.ok(!texto.includes(BAJA), "la entrega lleva el enlace de baja");
  });

  test("y el código que pidió SÍ sigue dentro, entero", () => {
    const texto = componerMensaje(CUERPO, { tipo: TIPO_MENSAJE.ENTREGA, enlaceBaja: BAJA, pie: pieBaja("ca") });
    assert.ok(texto.includes(CODIGO), "se ha perdido el enlace individual, que es lo único que importa");
    assert.match(texto, /tarjeta\.html\?t=/, "la URL de la tarjeta ha cambiado de forma");
    assert.equal(texto, CUERPO.trimEnd(), "la entrega tiene que ser el mensaje tal cual, sin añadidos");
  });

  test("da igual que se le pase un enlace de baja: por tipo, no se usa", () => {
    // Es la propiedad que hace que esto no sea un recorte: aunque alguien le pase el enlace, el
    // tipo manda y el pie no se añade.
    assert.equal(componerMensaje(CUERPO, { tipo: TIPO_MENSAJE.ENTREGA, enlaceBaja: BAJA }),
                 componerMensaje(CUERPO, { tipo: TIPO_MENSAJE.ENTREGA }));
    assert.equal(llevaPieDeBaja(TIPO_MENSAJE.ENTREGA), false);
  });
});

describe("una comunicación comercial SÍ la lleva", () => {
  test("el pie y el enlace van al final, en su línea", () => {
    const texto = componerMensaje(CUERPO, { tipo: TIPO_MENSAJE.COMERCIAL, enlaceBaja: BAJA, pie: pieBaja("ca") });
    assert.ok(texto.includes(PIE_BAJA.ca), "la comunicación comercial ha perdido su pie");
    assert.ok(texto.includes(BAJA), "la comunicación comercial ha perdido su enlace de baja");
    assert.ok(texto.endsWith(`${PIE_BAJA.ca}\n${BAJA}`),
      "el pie tiene que ir al FINAL: en medio parece parte de la oferta");
  });

  test("en los tres idiomas", () => {
    for (const idioma of ["es", "ca", "en"]) {
      const texto = componerMensaje(CUERPO, { tipo: TIPO_MENSAJE.COMERCIAL, enlaceBaja: BAJA, pie: pieBaja(idioma) });
      assert.ok(texto.includes(PIE_BAJA[idioma]), `falta el pie en «${idioma}»`);
    }
  });

  test("el tipo por defecto es COMERCIAL: olvidarse de decirlo no quita la baja", () => {
    // Si el defecto fuera «entrega», un camino nuevo que olvidara el tipo mandaría una campaña
    // sin salida. El defecto seguro es el que MÁS protege a quien recibe.
    const texto = componerMensaje(CUERPO, { enlaceBaja: BAJA, pie: pieBaja("es") });
    assert.ok(texto.includes(BAJA), "el tipo por defecto ha dejado de llevar el enlace de baja");
    assert.equal(llevaPieDeBaja(undefined), true);
    assert.equal(llevaPieDeBaja("cualquier-cosa"), true);
  });

  test("y no se repite si la plantilla ya lo llevaba escrito a mano", () => {
    const conEnlaceDentro = `${CUERPO}\n\nBaja: ${BAJA}`;
    const texto = componerMensaje(conEnlaceDentro, { tipo: TIPO_MENSAJE.COMERCIAL, enlaceBaja: BAJA });
    assert.equal(texto.split(BAJA).length - 1, 1, "el enlace de baja sale dos veces");
  });
});

describe("la decisión vive en un solo sitio", () => {
  test("`conPieDeBaja` ya no se llama desde el servidor: se pasa por `componerMensaje`", () => {
    assert.ok(!/fidConPieBaja|conPieDeBaja\(/.test(SERVER),
      "hay un sitio que añade el pie saltándose la decisión por tipo");
    assert.match(SERVER, /componerMensaje as fidComponerMensaje/,
      "el servidor ya no importa el compositor por tipo");
  });

  test("TODOS los que componen un mensaje declaran su tipo", () => {
    // Antes esto exigía que fueran EXACTAMENTE dos. Ese número escrito a mano no protegía nada:
    // un tercer camino correcto lo hacía fallar, y uno que se olvidara del tipo habría pasado si
    // el recuento cuadraba. Lo que importa no es cuántos son, sino que NINGUNO se olvide.
    const usos = [...SERVER.matchAll(/fidComponerMensaje\(/g)];
    assert.ok(usos.length >= 2, `solo ${usos.length} composiciones de mensaje`);
    const sinTipo = [];
    for (const m of usos) {
      const ventana = SERVER.slice(m.index, m.index + 500);
      if (!/tipo: FID_TIPO_MENSAJE\.(ENTREGA|COMERCIAL)/.test(ventana)) {
        sinTipo.push(ventana.split("\n")[0].trim().slice(0, 70));
      }
    }
    assert.deepEqual(sinTipo, [],
      "hay un mensaje que no declara su tipo: caería en el defecto comercial y llevaría pie de " +
      "baja, o peor, alguien cambiaría el defecto y se lo quitaría a una campaña");
    assert.match(SERVER, /tipo: FID_TIPO_MENSAJE\.COMERCIAL/, "falta el camino comercial");
    assert.match(SERVER, /tipo: FID_TIPO_MENSAJE\.ENTREGA/, "falta el camino de entrega");
  });

  test("el alta del formulario es ENTREGA y no compone ningún enlace de baja", () => {
    assert.match(ALTA, /tipo: FID_TIPO_MENSAJE\.ENTREGA/,
      "el alta ha dejado de declararse como entrega");
    // Se miran las LÍNEAS DE CÓDIGO, no el fichero: el bloque explica en sus comentarios qué
    // hacía antes con `fid_bajas`, y esa explicación no puede hacer fallar al candado que
    // comprueba justo que ya no lo hace.
    const codigo = ALTA.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    for (const resto of ["fidEnlaceBaja", "fidNuevoTokenBaja", "fidHuellaBaja", "fidPieBaja"]) {
      assert.ok(!codigo.includes(resto),
        `el alta todavía usa «${resto}»: un token que no viaja en ningún mensaje no sirve para ` +
        `darse de baja de nada`);
    }
    assert.ok(!/INSERT INTO fid_bajas/.test(codigo),
      "el alta sigue escribiendo un token de baja que ya no viaja en ningún mensaje");

    // Pero el RECUENTO de bajas confirmadas se queda, y tiene que quedarse: es lo que distingue
    // «se dio de baja y ha vuelto a apuntarse» de «ha pulsado dos veces», y sin él quien vuelve
    // tras una baja no recibiría su código.
    assert.match(codigo, /SELECT COUNT\(\*\)::int AS n FROM fid_bajas/,
      "se ha perdido el recuento de ciclos: quien vuelve tras una baja se quedaría sin su código");
  });

  test("y ya no puede quedarse sin mandar por no poder componer un enlace que no usa", () => {
    assert.ok(!/if \(!urlBaja\) return/.test(ALTA),
      "sigue la guarda que bloqueaba la entrega del código si el enlace de baja fallaba");
  });
});

describe("no se ha tocado nada de lo que tenía que quedarse igual", () => {
  test("el enlace individual sigue saliendo de `proEnlace`", () => {
    assert.match(ALTA, /enlace: proEnlace\(req, qr\)/,
      "el enlace del código ya no sale del único sitio que lo compone");
    assert.ok(!/tarjeta\.html\?t=|cupon\.html\?t=/.test(ALTA),
      "hay una URL de QR escrita a mano en el alta");
  });

  test("la cola y la clave de idempotencia no cambian", () => {
    assert.match(ALTA, /INSERT INTO cap_cola[\s\S]*?ON CONFLICT \(token\) DO NOTHING/,
      "el alta ya no encola de forma idempotente");
    assert.match(ALTA, /`alta:\$\{clave\}:v\$\{f\.version\}:\$\{f\.campana \|\| clave\}:\$\{tel\}:\$\{qr\.id\}:c\$\{ciclo\}`/,
      "la clave de idempotencia ha cambiado: quien ya se apuntó podría recibirlo otra vez");
  });

  test("el consentimiento se sigue guardando igual", () => {
    assert.match(ALTA, /INSERT INTO fid_consentimientos/,
      "el alta ha dejado de guardar el consentimiento");
    assert.match(ALTA, /INSERT INTO marketing_prefs/,
      "el alta ha dejado de guardar las preferencias de contacto");
  });

  test("y quien pidió que no le escribieran sigue sin recibir NI la entrega", () => {
    // El freno no está en el mensaje, está en el worker. Quitar el pie no toca esto.
    const worker = bloque(SERVER, "async function capVaciarCola()");
    assert.match(worker, /SELECT baja FROM marketing_prefs/,
      "el worker ha dejado de mirar si esa persona pidió no recibir mensajes");
    assert.match(worker, /Pidió no recibir mensajes/);
  });

  test("las bajas siguen funcionando: la página y el POST no se tocan", () => {
    assert.match(SERVER, /function fidPaginaBaja/, "ha desaparecido la página de baja");
    assert.match(SERVER, /fidDecidirBaja/, "ha desaparecido la decisión de darse de baja");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  UN CANDADO QUE NACE DE UN FALLO DE ESTA MISMA SESIÓN
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Al hacer este cambio cambié el `import` de `server.js` y el script que lo escribía falló antes
// de guardar. `node --check` pasó —la sintaxis era válida— y el identificador quedó SIN DEFINIR:
// el servidor habría reventado al recibir el primer alta, en producción.
//
// Comprobar la sintaxis no es comprobar que las cosas existen. Esto sí.
describe("todo lo que server.js importa existe de verdad", () => {
  test("cada nombre importado de un módulo del proyecto está exportado", async () => {
    // `[^}]*` para no cruzar de un `import` al siguiente: con `[\\s\\S]*?` el recorte se comía
    // varias declaraciones y daba nombres inventados.
    const re = /import\s*\{([^}]*)\}\s*from\s*"(\.\/[^"]*)"/g;
    const rotos = [];
    let total = 0;
    for (const m of SERVER.matchAll(re)) {
      const ruta = m[2];
      let mod;
      try { mod = await import(new URL(ruta, import.meta.url).href.replace("/tests/", "/")); }
      catch { rotos.push(`${ruta}: no se puede cargar`); continue; }
      for (const trozo of m[1].split(",")) {
        const nombre = trozo.trim().split(/\s+as\s+/)[0].trim();
        if (!nombre) continue;
        total += 1;
        if (!(nombre in mod)) rotos.push(`${ruta} no exporta «${nombre}»`);
      }
    }
    assert.ok(total > 400, `solo se han comprobado ${total} nombres: el análisis no está mirando bien`);
    assert.deepEqual(rotos, [], "server.js importa algo que no existe");
  });
});
