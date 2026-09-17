// LA POLÍTICA DE PRIVACIDAD: que exista, que diga lo que tiene que decir y que quede registrado
// qué versión aceptó cada persona.
//
// ── POR QUÉ SE COMPRUEBA EL CONTENIDO Y NO SOLO QUE EL FICHERO ESTÉ ──────────────────────────
//
// Una política a la que le falta el responsable, la base jurídica o cómo reclamar no es una
// política: es un texto tranquilizador. Y lo que se enlaza desde el formulario tiene que ser
// exactamente lo que dice ser el día que alguien lo mire.
//
// ── Y POR QUÉ SE COMPRUEBA QUE LOS DOS IDIOMAS DIGAN LO MISMO ───────────────────────────────
//
// Si la castellana y la catalana divergieran, cada persona habría aceptado una de las dos sin
// saber cuál, y la versión guardada no querría decir nada.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { POLITICA_VERSION, POLITICA_FECHA, POLITICA_URL, politicaUrl,
         POLITICA_ENLACE, politicaEnlace, selloConsentimiento }
  from "../src/modules/legal/politica.js";

const lee = (f) => readFileSync(new URL("../public/" + f, import.meta.url), "utf8");
const CA = lee("privacitat.html");
const ES = lee("privacidad.html");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const ruta = (firma) => {
  const i = server.indexOf(firma);
  if (i < 0) throw new Error(`no existe la ruta ${firma}`);
  return server.slice(i, server.indexOf("\n});", i) + 4);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("las dos páginas existen y se sirven", () => {
  test("están en `public/`, que es lo que se sirve estático", () => {
    // Una política tiene que poder leerse aunque la aplicación esté caída: por eso es un fichero
    // y no una ruta que dependa de que el servidor conteste.
    for (const f of ["privacitat.html", "privacidad.html"]) {
      assert.ok(existsSync(new URL("../public/" + f, import.meta.url)), `falta ${f}`);
    }
  });

  test("cada una declara su idioma", () => {
    assert.match(CA, /<html lang="ca">/);
    assert.match(ES, /<html lang="es">/);
  });

  test("y se enlazan entre ellas", () => {
    assert.match(CA, /href="privacidad\.html"/);
    assert.match(ES, /href="privacitat\.html"/);
  });

  test("las direcciones del módulo apuntan a esos ficheros", () => {
    assert.equal(POLITICA_URL.ca, "/privacitat.html");
    assert.equal(POLITICA_URL.es, "/privacidad.html");
    assert.equal(politicaUrl("ca"), "/privacitat.html");
    assert.equal(politicaUrl("zz"), "/privacidad.html", "un idioma raro cae en castellano");
    assert.equal(politicaUrl(null), "/privacidad.html");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("dice todo lo que tiene que decir", () => {
  const APARTADOS = [
    ["responsable", /Uriel del Amor Ayllón/, /Uriel del Amor Ayllón/],
    ["NIF", /77620565G/, /77620565G/],
    ["domicilio", /Carrer Muralla 21, Blanes/, /Carrer Muralla 21, Blanes/],
    ["contacto", /info@la-tapeta\.com/, /info@la-tapeta\.com/],
    ["finalidad", /Gestionar la promoció/, /Gestionar la promoción/],
    ["comunicaciones", /descomptes i comunicacions/, /descuentos y comunicaciones/],
    ["datos tratados", /Telèfon mòbil/, /Teléfono móvil/],
    ["base jurídica: consentimiento", /consentiment/i, /consentimiento/i],
    ["artículo del RGPD", /6\.1\.a/, /6\.1\.a/],
    ["conservación", /bloquejades/, /bloqueados/],
    ["destinatarios", /WhatsApp \(Meta\)/, /WhatsApp \(Meta\)/],
    ["derechos: acceso", /Accés/, /Acceso/],
    ["derechos: rectificación", /Rectificació/, /Rectificación/],
    ["derechos: supresión", /Supressió/, /Supresión/],
    ["derechos: oposición", /Oposició/, /Oposición/],
    ["baja", /donar-te de baixa/i, /darte de baja/i],
    ["AEPD", /Agència Espanyola de Protecció de Dades/, /Agencia Española de Protección de Datos/],
    ["enlace a la AEPD", /https:\/\/www\.aepd\.es/, /https:\/\/www\.aepd\.es/],
  ];

  for (const [que, reCa, reEs] of APARTADOS) {
    test(`incluye ${que}, en los dos idiomas`, () => {
      assert.match(CA, reCa, `falta en catalán: ${que}`);
      assert.match(ES, reEs, `falta en castellano: ${que}`);
    });
  }

  test("lleva su versión y su fecha impresas, para poder comprobarlas", () => {
    // NO se fija un número a mano: se comprueba que LO IMPRESO Y LA CONSTANTE COINCIDEN. Subir la
    // versión en `politica.js` y olvidarse de la página —o al revés— es el fallo que importa, y
    // fijar el número aquí solo obligaba a tocar tres sitios en vez de dos.
    const MESES = ["gener/enero", "febrer/febrero", "març/marzo", "abril/abril", "maig/mayo",
      "juny/junio", "juliol/julio", "agost/agosto", "setembre/septiembre", "octubre/octubre",
      "novembre/noviembre", "desembre/diciembre"];
    const [y, m, d] = POLITICA_FECHA.split("-").map(Number);
    const [mesCa, mesEs] = MESES[m - 1].split("/");
    assert.match(CA, new RegExp(`Versió ${POLITICA_VERSION} · en vigor des del ${d} de ${mesCa} de ${y}`));
    assert.match(ES, new RegExp(`Versión ${POLITICA_VERSION} · en vigor desde el ${d} de ${mesEs} de ${y}`));
    // Y la versión solo sube: bajarla dejaría consentimientos guardados apuntando a un texto que
    // ya no es el vigente.
    assert.ok(POLITICA_VERSION >= 2, "la versión no puede bajar");
    assert.match(POLITICA_FECHA, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("v2 · explica qué se guarda al añadir el carné a la cartera del móvil", () => {
    // El servicio de actualización guarda un identificador del dispositivo y un testigo de
    // notificaciones. Son datos personales y antes no se decía en ningún sitio.
    const plano = (t) => t.replace(/\s+/g, " ");
    for (const [idioma, txt, frases] of [
      ["catalán", plano(CA), [
        /identificador tècnic del dispositiu/i,
        /testimoni de notificacions/i,
        /només serveixen per mantenir el carnet actualitzat/i,
        /No contenen el teu telèfon, ni el teu nom, ni els teus punts/i,
        /mentre el carnet estigui registrat/i,
        /s'elimina o s'invalida/i,
        /Apple.{0,80}proveïdor de la plataforma/i,
      ]],
      ["castellano", plano(ES), [
        /identificador técnico del dispositivo/i,
        /testigo de notificaciones/i,
        /solo sirven para mantener el carné actualizado/i,
        /No contienen tu teléfono, ni tu nombre, ni tus puntos/i,
        /mientras el carné siga registrado/i,
        /se elimina o se invalida/i,
        /Apple.{0,80}proveedor de la plataforma/i,
      ]],
    ]) {
      for (const re of frases) assert.match(txt, re, `falta en ${idioma}: ${re}`);
    }
  });

  test("y no cuenta nada de las tripas", () => {
    // Una política no nombra tablas, variables, servidores ni claves.
    for (const [idioma, txt] of [["catalán", CA], ["castellano", ES]]) {
      for (const malo of ["wallet_", "pro_qr", "APNs", "api.push.apple.com", "pkpass",
                          "DATA_ENC_KEY", "passTypeIdentifier", "serialNumber", "PostgreSQL"]) {
        assert.ok(!txt.includes(malo), `la política en ${idioma} nombra «${malo}»`);
      }
    }
  });

  test("explica que se guarda qué versión aceptó cada persona", () => {
    // El texto viene partido en varias líneas en el HTML: se compara sin los saltos.
    const plano = (t) => t.replace(/\s+/g, " ");
    assert.match(plano(CA), /Guardem quina versió vas acceptar/);
    assert.match(plano(ES), /Guardamos qué versión aceptaste/);
  });

  test("y las dos tienen los mismos apartados, en el mismo orden", () => {
    const ids = (t) => [...t.matchAll(/<h2 id="([a-z]+)">/g)].map((m) => m[1]);
    assert.deepEqual(ids(CA), ids(ES));
    assert.ok(ids(CA).length >= 9, `solo hay ${ids(CA).length} apartados`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("LOS PROVEEDORES SON LOS QUE DE VERDAD INTERVIENEN", () => {
  const paquetes = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const deps = Object.keys(paquetes.dependencies || {});

  test("WhatsApp: se nombra porque el número y el texto pasan por ahí", () => {
    assert.ok(deps.includes("@whiskeysockets/baileys"), "ya no se manda por WhatsApp");
    assert.match(CA, /WhatsApp \(Meta\)/);
  });

  test("Anthropic: se nombra porque le llega el texto de los mensajes recibidos", () => {
    assert.ok(deps.includes("@anthropic-ai/sdk"));
    assert.match(server, /SELECT id, telefono, mensaje FROM whatsapp_messages/);
    assert.match(CA, /Anthropic/);
    // Y se dice QUÉ le llega, que no es la ficha de nadie.
    assert.match(ES, /Le llega el texto del mensaje, no tu ficha/);
  });

  test("Google: se nombra porque hay un espejo de las altas en una hoja de cálculo", () => {
    assert.match(server, /async function mirrorLeadToSheet\(lead\)/);
    assert.match(server, /sheets\.googleapis\.com/);
    assert.match(CA, /Google/);
    // Y se dice que solo pasa cuando la cuenta está conectada, que es la condición real.
    assert.match(server, /const refresh = await getConfig\("google_drive_refresh_token"\);\s*\n\s*if \(!refresh\) return;/);
    assert.match(ES, /cuando tenemos la cuenta conectada/);
  });

  test("ÁGORA NO SE NOMBRA: solo recibe un identificador opaco", () => {
    // Nombrarlo como destinatario sería decir que le mandamos datos personales, y no es verdad:
    // intercambia un identificador de socio que no dice quién es nadie.
    for (const t of [CA, ES]) assert.ok(!/Ágora|Agora/.test(t), "se nombra Ágora como destinatario");
    // Y así es como funciona de verdad: lo que entra se convierte en huella antes de nada.
    const tpv = ruta('app.get("/api/fidelizacion/agora/:token/member/:memberId"');
    assert.match(tpv, /const mHash = fidHash\(memberId\)\.slice\(0, 16\);/);
    // Se dice explícitamente, porque es lo que alguien podría suponer al revés.
    assert.match(CA, /sistema de caixa <b>no rep les teves dades<\/b>/);
    assert.match(ES, /sistema de caja <b>no recibe tus datos<\/b>/);
  });

  test("NO SE INVENTA NINGÚN PROVEEDOR", () => {
    // Cada nombre propio de la lista de encargados tiene que corresponder a algo que esté en el
    // código. Los que no están, no se nombran.
    const bloque = ES.slice(ES.indexOf('<h2 id="destinataris">'), ES.indexOf('<h2 id="drets">'));
    const nombrados = [...bloque.matchAll(/<li><b>([^<]+)<\/b>/g)].map((m) => m[1].trim());
    assert.deepEqual(nombrados, ["WhatsApp (Meta)", "Replit", "Google", "Anthropic"]);
    for (const falso of ["Mailchimp", "Stripe", "Amazon", "Cloudflare", "Sendgrid", "Twilio",
                         "Hubspot", "Salesforce", "Brevo"]) {
      assert.ok(!bloque.includes(falso), `se nombra ${falso}, que no interviene`);
    }
  });

  test("NO SE PUBLICA NADA INTERNO: ni hosts, ni claves, ni nombres de tabla", () => {
    for (const t of [CA, ES]) {
      for (const secreto of ["DATABASE_URL", "JWT_SECRET", "DATA_ENC_KEY", "ANTHROPIC_API_KEY",
                             "replit.app", "neon.tech", "postgres://", "Api-Token",
                             "fid_", "cap_cola", "marketing_prefs", "pro_qr", "localhost", ":5000"]) {
        assert.ok(!t.includes(secreto), `la política publica «${secreto}»`);
      }
      // Ni direcciones IP.
      assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(t), "hay una IP en la política");
    }
  });

  test("y se dice lo de las transferencias fuera de la UE", () => {
    assert.match(CA, /fora de la Unió Europea/);
    assert.match(ES, /fuera de la Unión Europea/);
    assert.match(ES, /cláusulas contractuales tipo/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("SE GUARDA QUÉ POLÍTICA ACEPTÓ CADA PERSONA", () => {
  const POST = ruta('app.post("/api/publico/formulario/:clave"');

  test("con los cinco datos, y juntos", () => {
    const s = selloConsentimiento({ texto: "Acepto", formularioVersion: 3, campana: "esmorzar-girona",
      origen: "formulario", ahora: "2026-09-15T10:00:00+02:00", idioma: "ca" });
    assert.equal(s.texto, "Acepto");
    assert.equal(s.formulario_version, 3);
    assert.equal(s.politica_version, POLITICA_VERSION);
    assert.equal(s.politica_url, "/privacitat.html");
    assert.equal(s.campana, "esmorzar-girona");
    assert.equal(s.origen, "formulario");
    assert.equal(s.creado_en, "2026-09-15T10:00:00+02:00");
    assert.throws(() => { s.politica_version = 9; }, TypeError, "el sello se puede reescribir");
  });

  test("el alta guarda la versión y la dirección de la política", () => {
    assert.match(POST, /politica_version, politica_url\)/);
    assert.match(POST, /POLITICA_VERSION, fidPoliticaUrl\(f\.idioma\)/);
  });

  test("y las columnas existen, de forma aditiva", () => {
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.match(esquema, /ADD COLUMN IF NOT EXISTS \$\{col\}/);
    assert.ok(esquema.includes('"politica_version INTEGER"'));
    assert.ok(esquema.includes('"politica_url TEXT"'));
  });

  test("LA VERSIÓN ES UNA CONSTANTE, no un hash ni una fecha calculada", () => {
    // Si se dedujera del fichero, cambiar una coma movería la versión de todo el mundo y lo
    // guardado dejaría de significar nada.
    const mod = readFileSync(new URL("../src/modules/legal/politica.js", import.meta.url), "utf8");
    assert.match(mod, /export const POLITICA_VERSION = \d+;/);
    assert.ok(!/createHash|readFileSync|statSync|Date\.now/.test(mod),
      "la versión se calcula en vez de declararse");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("se enlaza desde donde hace falta", () => {
  test("desde el pie de todas las páginas públicas", () => {
    // Es donde se busca, y la ley pide que se pueda encontrar sin rellenar nada primero.
    for (const f of ["index.html", "eventos.html", "locales.html", "nosotros.html", "trabaja.html"]) {
      assert.match(lee(f), /href="privacidad\.html"/, `${f} no enlaza la política`);
    }
  });

  test("y desde donde se recogen datos personales", () => {
    assert.match(lee("alta.html"), /href="privacidad\.html"[\s\S]{0,200}Política de privacidad/);
    // El camino histórico de `/promo.html` también, sin tocarle nada más.
    assert.match(lee("promo.html"), /id="pmPrivLink"/);
    assert.match(lee("promo.html"), /<input id="pmConsent" name="consent" type="checkbox" required \/>/,
      "se ha tocado la casilla del camino histórico");
  });

  test("el formulario configurable enlaza la de su idioma aunque la campaña no ponga ninguna", () => {
    const GET = ruta('app.get("/api/publico/formulario/:clave"');
    assert.match(GET, /privacidad_url: f\.privacidad_url \|\| fidPoliticaUrl\(f\.idioma\)/);
    assert.match(GET, /privacidad_texto: fidPoliticaEnlace\(f\.idioma\)/);
  });

  test("y la propuesta de Girona apunta a la catalana", () => {
    assert.match(app, /privacidad_url: "\/privacitat\.html"/);
  });

  test("el nombre del enlace está en cada idioma", () => {
    assert.equal(politicaEnlace("ca"), "Política de privacitat");
    assert.equal(politicaEnlace("es"), "Política de privacidad");
    assert.equal(politicaEnlace("zz"), POLITICA_ENLACE.es);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("EL ENLACE VA DENTRO DE LA FRASE, no suelto debajo", () => {
  const promoJs = readFileSync(new URL("../public/promo.js", import.meta.url), "utf8");
  const bloque = promoJs.slice(promoJs.indexOf("function pintarConsentimiento("),
                               promoJs.indexOf("function montarFecha("));

  test("la frase de Girona nombra la política, para poder subrayarla dentro", () => {
    assert.match(app, /Omplint aquest formulari acceptes rebre descomptes del grup de la Família del Amor\. Consulta la Política de privacitat\./);
  });

  test("se compone con nodos, nunca con innerHTML", () => {
    assert.ok(!/innerHTML/.test(bloque), "el consentimiento se pinta como HTML");
    assert.match(bloque, /document\.createElement\("a"\)/);
    assert.match(bloque, /document\.createTextNode/);
  });

  test("se abre en otra pestaña y sin filtrar de dónde viene nadie", () => {
    assert.match(bloque, /a\.target = "_blank";/);
    assert.match(bloque, /a\.rel = "noopener noreferrer";/);
  });

  test("si la frase NO lo nombra, el enlace se añade igual", () => {
    // Una campaña que se olvide de nombrarlo sigue teniendo enlace: es lo que no puede faltar.
    assert.match(bloque, /if \(i < 0\) \{/);
    assert.match(bloque, /caja\.appendChild\(a\);/);
  });

  test("y sin política no se inventa un enlace vacío", () => {
    assert.match(bloque, /if \(!url\) \{ caja\.textContent = frase; return; \}/);
  });

  test("va SUBRAYADO y con foco visible", () => {
    // El color por sí solo deja fuera a quien no lo distingue.
    const css = readFileSync(new URL("../public/promo.css", import.meta.url), "utf8");
    const reglas = css.slice(css.indexOf(".pm-legal {"), css.indexOf(".pm-error"));
    assert.match(reglas, /text-decoration: underline/);
    assert.match(reglas, /\.pm-legal:focus-visible \{[\s\S]{0,120}outline:/);
  });
});
