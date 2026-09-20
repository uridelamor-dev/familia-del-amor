// LAS REGRESIONES VISUALES QUE UNA AUDITORÍA INDEPENDIENTE ENCONTRÓ, Y EL CANDADO DE CADA UNA.
//
// ── POR QUÉ ESTE FICHERO NO HACE GREP ────────────────────────────────────────────────────────
//
// La auditoría demostró que los candados de CSS de esta casa se podían saltar sin enterarse:
// un `assert.ok(!/\n\.pm-nac-s \{/.test(css))` pasa en verde si el bug vuelve escrito con otra
// especificidad, y un `slice(indexOf(...), indexOf(...))` devuelve la cadena vacía —y aprueba
// todo— cuando su ancla vive dentro de un comentario que el propio test ha borrado.
//
// Aquí no se busca texto: se TOKENIZA el CSS (comentarios y cadenas incluidos), se extraen
// declaraciones de verdad y se afirma sobre ellas. Y cuando hay navegador, se MIDE en Chrome:
// contraste calculado con la fórmula WCAG, anchos reales, `white-space` computado y el aro de
// foco que de verdad pinta el navegador.
//
// ── LA LIMITACIÓN, DICHA ANTES DE QUE LA DESCUBRA NADIE ──────────────────────────────────────
//
// `puppeteer` NO es dependencia declarada de este proyecto (no se pueden añadir: el lockfile
// apunta al firewall de Replit). Está en `node_modules` de la máquina de desarrollo, así que
// aquí las pruebas de navegador CORREN; en un `npm ci` limpio, NO.
//
// Por eso cada defecto tiene DOS candados: uno estructural, que no necesita navegador y no se
// puede saltar con un comentario, y otro medido, que solo corre donde hay Chrome. Si algún día
// alguien lee este fichero en un servidor de integración y ve menos pruebas de las que esperaba,
// la razón es ésta y no que se hayan borrado.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const BASE = leer("public/css/base.css");
const PANEL = leer("public/css/panel.css");
const PUBLICA = leer("public/styles.css");

// ── UN TOKENIZADOR DE VERDAD ─────────────────────────────────────────────────────────────────
//
// Quita comentarios SIN tocar lo que va dentro de una cadena: un `/*` escrito dentro de
// `content:"/*"` no abre un comentario, y los `sinComentarios` de este repo —hay ocho, con
// cuatro semánticas distintas— se equivocan justo ahí.
function sinComentarios(css) {
  let fuera = "", i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const fin = c;
      fuera += c; i++;
      while (i < css.length && css[i] !== fin) {
        if (css[i] === "\\") { fuera += css[i]; i++; }
        if (i < css.length) { fuera += css[i]; i++; }
      }
      if (i < css.length) { fuera += css[i]; i++; }
      continue;
    }
    if (c === "/" && css[i + 1] === "*") {
      const cierre = css.indexOf("*/", i + 2);
      const trozo = css.slice(i, cierre === -1 ? css.length : cierre + 2);
      // Se conservan los saltos de línea para que los números de línea sigan cuadrando.
      fuera += trozo.replace(/[^\n]/g, "");
      i = cierre === -1 ? css.length : cierre + 2;
      continue;
    }
    fuera += c; i++;
  }
  return fuera;
}

/** Balance de llaves, y en qué línea aparece la primera de cierre que no cierra nada. */
function balance(css) {
  const limpio = sinComentarios(css);
  let prof = 0, linea = 1, sobrante = null;
  for (const c of limpio) {
    if (c === "\n") linea++;
    else if (c === "{") prof++;
    else if (c === "}") { prof--; if (prof < 0 && sobrante === null) sobrante = linea; }
  }
  return { prof, sobrante };
}

/**
 * TODAS las reglas de la hoja, a cualquier profundidad, en una sola lista.
 *
 * Baja dentro de `@media`, `@supports` y `@keyframes`: el cuerpo de una regla-at es una lista de
 * REGLAS, no de declaraciones, y tratarlo como declaraciones convierte cada selector anidado en
 * una propiedad inventada. Cada elemento lleva el contexto (`dentro`) para poder decir en qué
 * media query estaba lo que falle.
 */
function bloques(css, { limpio = sinComentarios(css), dentro = "" } = {}) {
  const salida = [];
  let i = 0;
  while (i < limpio.length) {
    const abre = limpio.indexOf("{", i);
    if (abre === -1) break;
    const selector = limpio.slice(i, abre).trim().replace(/\s+/g, " ");
    let prof = 1, j = abre + 1;
    while (j < limpio.length && prof > 0) {
      if (limpio[j] === "{") prof++;
      else if (limpio[j] === "}") prof--;
      j++;
    }
    const cuerpo = limpio.slice(abre + 1, j - 1);
    if (/^@(media|supports|container|layer|document|keyframes|-\w+-keyframes)\b/i.test(selector)) {
      salida.push(...bloques("", { limpio: cuerpo, dentro: dentro ? `${dentro} › ${selector}` : selector }));
    } else {
      salida.push({ selector, dentro, cuerpo, decls: declaraciones(cuerpo) });
    }
    i = j;
  }
  return salida;
}

/** Declaraciones `prop: valor` de un cuerpo, quitando ANTES las reglas anidadas enteras. */
function declaraciones(cuerpo) {
  // Se quita `selector { … }` completo —selector incluido— y se repite hasta que no quede
  // ninguno, para que el anidamiento de CSS nativo tampoco deje selectores sueltos.
  let plano = cuerpo, antes;
  do { antes = plano; plano = plano.replace(/[^{};]*\{[^{}]*\}/g, ""); } while (plano !== antes);

  // El `;` solo separa declaraciones FUERA de paréntesis y de comillas. Dentro de un
  // `url("data:image/svg+xml;utf8,<svg …>")` hay puntos y comas, dos puntos y barras que no
  // son sintaxis de CSS, y partir por ellos inventa declaraciones que no existen.
  const trozos = [];
  let act = "", par = 0, comilla = null;
  for (let i = 0; i < plano.length; i++) {
    const c = plano[i];
    if (comilla) {
      act += c;
      if (c === "\\") { act += plano[++i] ?? ""; continue; }
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'") { comilla = c; act += c; continue; }
    if (c === "(") par++;
    else if (c === ")") par--;
    else if (c === ";" && par === 0) { trozos.push(act); act = ""; continue; }
    act += c;
  }
  trozos.push(act);

  return trozos.map((d) => d.trim()).filter(Boolean).map((d) => {
    // Y los dos puntos que separan propiedad de valor son los PRIMEROS fuera de paréntesis.
    let p = 0, q = null, corte = -1;
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "(") p++;
      else if (c === ")") p--;
      else if (c === ":" && p === 0) { corte = i; break; }
    }
    if (corte === -1) return { prop: d, valor: "" };
    return { prop: d.slice(0, corte).trim(), valor: d.slice(corte + 1).trim() };
  });
}

const buscarBloques = (css, re) => bloques(css).filter((b) => re.test(b.selector));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · LA WEB PÚBLICA NO SE VUELVE OSCURA A MEDIAS
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Lo que pasó: `base.css` —que cargan las 16 páginas públicas, el panel y la vista previa— traía
// un `@media (prefers-color-scheme:dark)` que redefinía `--bg` a #0F110C pero NO `--text`, que
// es de `styles.css`. Trece páginas quedaban con texto casi negro sobre fondo casi negro:
// 1,14 : 1, texto invisible, para cualquier visitante con el móvil en modo oscuro.
//
// Y ganaba aunque `styles.css` cargue después: `:root:not([data-theme="light"])` pesa (0,2,0)
// frente al (0,1,0) de un `:root` pelado, y una media query no añade especificidad.
//
// La decisión: la identidad de la casa es crema y verde, y la web se queda clara diga lo que
// diga el sistema. El tema oscuro es del panel, que tiene conmutador, y vive en `panel.css`.
describe("el modo oscuro del sistema no toca la web pública", () => {
  test("`base.css` no declara ningún tema oscuro: ni por media query ni por atributo", () => {
    const limpio = sinComentarios(BASE);
    assert.ok(!/prefers-color-scheme\s*:\s*dark/.test(limpio),
      "base.css ha vuelto a traer un @media de esquema oscuro. La cargan las 16 páginas públicas, " +
      "cuyo styles.css NO tiene tema oscuro: redefinir el fondo sin redefinir el texto deja la " +
      "web a 1,14:1. El tema oscuro va en panel.css.");
    assert.ok(!/\[data-theme\s*=\s*["']?dark/.test(limpio),
      "base.css ha vuelto a traer el bloque [data-theme=dark]. Va en panel.css.");
  });

  test("`panel.css` conserva los DOS bloques: el elegido a mano y el automático", () => {
    const limpio = sinComentarios(PANEL);
    assert.ok(/:root\[data-theme="dark"\]\s*\{/.test(limpio),
      "falta el tema oscuro explícito: `setTheme('dark')` dejaría de tener efecto");
    assert.ok(/@media\s*\(prefers-color-scheme:\s*dark\)/.test(limpio),
      "falta el tema oscuro automático: el modo «auto» de setTheme() dejaría de seguir al sistema");
    assert.ok(/:root:not\(\[data-theme="light"\]\)/.test(limpio),
      "el bloque automático necesita el :not([data-theme=light]) para que «claro» gane a un " +
      "sistema oscuro; sin él, elegir claro no serviría de nada");
  });

  test("solo el panel carga la hoja que trae el tema oscuro", () => {
    const html = fs.readdirSync(path.join(RAIZ, "public"))
      .filter((f) => f.endsWith(".html"))
      .map((f) => ({ f, t: leer(`public/${f}`) }));
    const conPanel = html.filter((h) => /css\/panel\.css/.test(h.t)).map((h) => h.f);
    assert.deepEqual(conPanel, [],
      `estas páginas públicas cargan panel.css y heredarían su tema oscuro: ${conPanel.join(", ")}`);
    assert.ok(/css\/panel\.css/.test(leer("public/panel/index.html")),
      "el panel debe seguir cargando panel.css");
  });

  test("`styles.css` no define ningún tema oscuro propio, así que no debe recibir uno ajeno", () => {
    // Este es el porqué del candado de arriba, comprobado y no supuesto: si algún día
    // `styles.css` gana su propia paleta oscura completa, esta prueba avisa de que la decisión
    // de arriba se puede revisar.
    const oscuros = buscarBloques(PUBLICA, /prefers-color-scheme|data-theme/);
    const conTexto = oscuros.filter((b) => b.decls.some((d) => d.prop === "--text"));
    assert.equal(conTexto.length, 0,
      "styles.css ha ganado un tema oscuro: revisa si la web pública ya puede admitir uno");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · EL PUNTO Y COMA QUE FALTABA
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `--mono:…monospace;color-scheme:light` y, tras un comentario, `--h:212`. Sin el `;` tras
// `light`, el navegador leía UNA declaración —`color-scheme: light --h:212`—, inválida, y la
// descartaba entera: ni había esquema de color declarado ni existía `--h`.
//
// El test viejo daba esto por bueno porque su regex `/(--[\w-]+)\s*:/g` encontraba la cadena
// `--h:` en el texto. Encontrar el nombre no demuestra que el navegador lo tenga.
describe("las declaraciones de CSS están bien cerradas", () => {
  for (const [nombre, css] of [["base.css", BASE], ["panel.css", PANEL], ["styles.css", PUBLICA]]) {
    test(`${nombre}: ninguna declaración se ha tragado a la siguiente`, () => {
      const malas = [];
      for (const b of bloques(css)) {
        for (const d of b.decls) {
          // Una declaración cuyo VALOR contiene otro `--algo:` o `algo:` es dos declaraciones
          // pegadas por un punto y coma que falta.
          if (/(^|[\s,()])--?[a-z][\w-]*\s*:/i.test(d.valor)) {
            malas.push(`${b.selector} { ${d.prop}: ${d.valor.slice(0, 60)} }`);
          }
          // Y un nombre de propiedad con un espacio dentro es lo mismo visto por el otro lado.
          if (/\s/.test(d.prop.trim()) && !d.prop.startsWith("@")) {
            malas.push(`${b.selector} { «${d.prop}» }`);
          }
        }
      }
      assert.deepEqual(malas, [],
        `falta un punto y coma: el navegador descarta la declaración entera.\n  ${malas.join("\n  ")}`);
    });
  }

  test("`color-scheme: light` es una declaración por derecho propio en base.css", () => {
    const raiz = buscarBloques(BASE, /^:root$/);
    assert.ok(raiz.length >= 1, "base.css ha perdido su bloque :root");
    const cs = raiz.flatMap((b) => b.decls).find((d) => d.prop === "color-scheme");
    assert.ok(cs, "base.css ya no declara color-scheme en :root: el navegador pintaría los " +
      "controles nativos (desplegables, barras de scroll, campos) en oscuro sobre nuestra crema");
    assert.equal(cs.valor, "light");
  });

  test("`--h` existe de verdad como declaración, no solo como cadena en el fichero", () => {
    const h = buscarBloques(BASE, /^:root$/).flatMap((b) => b.decls).find((d) => d.prop === "--h");
    assert.ok(h, "--h no está declarado: `hsl(var(--h) …)` de horarios se queda sin valor de reserva");
    assert.match(h.valor, /^\d+$/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 · LLAVES DESCOMPENSADAS
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `styles.css` tenía una `}` de más. No cerraba nada: era el resto de una edición. Chrome la
// trata como error de análisis y se come LA REGLA SIGUIENTE — que resultaba ser el aro de foco
// de toda la web. Medido: con la llave, `outline: 1px auto` (el del navegador); sin ella,
// `2px solid #2C4A3E`, que es el que dice la regla.
describe("ninguna hoja tiene llaves de más ni de menos", () => {
  for (const [nombre, css] of [["base.css", BASE], ["panel.css", PANEL], ["styles.css", PUBLICA],
                               ["promo.css", leer("public/promo.css")],
                               ["alta.css", leer("public/alta.css")],
                               ["tarjeta.css", leer("public/tarjeta.css")],
                               ["legal.css", leer("public/legal.css")],
                               ["consentimiento.css", leer("public/css/consentimiento.css")]]) {
    test(`${nombre} está equilibrado`, () => {
      const { prof, sobrante } = balance(css);
      assert.equal(prof, 0, prof > 0
        ? `quedan ${prof} bloques sin cerrar: todo lo que siga queda dentro de ellos`
        : `sobran ${-prof} llaves de cierre; la primera, en la línea ${sobrante}. ` +
          `Chrome descarta la regla que va DETRÁS de una llave huérfana`);
      assert.equal(sobrante, null,
        `llave de cierre huérfana en la línea ${sobrante} de ${nombre}`);
    });
  }

  test("la regla del aro de foco sigue existiendo en styles.css", () => {
    const foco = buscarBloques(PUBLICA, /:focus-visible/);
    assert.ok(foco.length >= 1, "styles.css ya no define ningún estilo de :focus-visible");
    const outline = foco.flatMap((b) => b.decls).find((d) => d.prop === "outline");
    assert.ok(outline, "la regla de :focus-visible ya no declara `outline`");
    assert.match(outline.valor, /2px\s+solid/,
      "el aro de foco debe ser visible y grueso; 1px lo pierde quien peor ve");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · EL NOMBRE DEL ESTABLECIMIENTO NO SE APLASTA
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `.topbar > * { min-width: 0 }` se puso para matar un desborde de 8-14 px en tableta, y de paso
// dejó al rótulo del local en 25 px a 834 y 33 a 900: ilegible justo en la franja que venía a
// arreglar. El desborde era real; la cura, demasiado ancha.
describe("la cabecera del panel deja leer dónde estás", () => {
  test("`.pick` tiene un suelo que el `min-width:0` general no le quita", () => {
    const limpio = sinComentarios(PANEL);
    const reglas = bloques(PANEL).filter((b) => /\.topbar\s*>\s*\.pick/.test(b.selector));
    assert.ok(reglas.length >= 1,
      "no hay ninguna regla que le devuelva un ancho mínimo a .pick. Con `.topbar > * {min-width:0}` " +
      "el nombre del local se queda en 25 px a 834 px");
    const mw = reglas.flatMap((b) => b.decls).find((d) => d.prop === "min-width");
    assert.ok(mw, ".topbar > .pick existe pero no declara min-width");
    assert.ok(!/^0\w*$/.test(mw.valor), "el suelo de .pick no puede ser 0: eso es no tener suelo");
    // Gana al general porque (0,2,0) > (0,1,0): dos clases frente a una clase y un universal.
    assert.ok(/\.topbar\s*>\s*\*\s*\{\s*min-width:\s*0/.test(limpio.replace(/\s+/g, " ")),
      "si se quita el min-width:0 general hay que revisar este par de reglas entero");
  });

  test("`.pick` conserva el recorte con puntos suspensivos", () => {
    const limpio = sinComentarios(PANEL).replace(/\s+/g, " ");
    assert.match(limpio, /\.pick \.lbl\s*\{[^}]*text-overflow:\s*ellipsis/,
      "sin elipsis, un nombre largo se corta a media palabra y parece roto");
    assert.match(limpio, /\.pick\s*\{[^}]*max-width/,
      "sin max-width, el suelo nuevo podría empujar la cabecera y provocar desborde");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · LAS ETIQUETAS LARGAS SE PARTEN
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `.chk { white-space: nowrap }` se escribió pensando en los filtros de Clientes, que son de dos
// palabras. Pero `.chk` la usan ocho sitios más con frases enteras —«He comprobado que ese
// código existe en Ágora» mide 318 px indivisibles— y en un móvil de 390 eso sale de su caja.
describe("una casilla con una frase larga se parte en vez de desbordar", () => {
  test("`.chk` no impone `white-space: nowrap`", () => {
    // Cualquier regla cuyo selector toque `.chk`, se escriba como se escriba: `.chk`,
    // `label.chk`, `.toolbar .chk`, o dentro de una media query (el analizador ya ha bajado).
    const reglas = bloques(PANEL).filter((b) => /(^|[\s,>+~])[a-z]*\.chk(\s|$|[,:>+~])/i.test(b.selector + " "));
    assert.ok(reglas.length >= 1, "ha desaparecido la regla de .chk");
    const nowrap = reglas.flatMap((b) => b.decls.map((d) => ({ ...d, sel: b.selector })))
      .filter((d) => d.prop.toLowerCase() === "white-space" && /nowrap/i.test(d.valor));
    assert.deepEqual(nowrap.map((d) => d.sel), [],
      "`.chk` ha vuelto a llevar white-space:nowrap. Las ocho etiquetas de frase entera del " +
      "panel dejarían de partirse y se saldrían de su caja en un móvil");
  });

  test("la casilla sigue sin estirarse ni heredar el `width:100%` de los campos", () => {
    const limpio = sinComentarios(PANEL).replace(/\s+/g, " ");
    assert.match(limpio, /\.chk\s*>?\s*input[^{]*\{[^}]*flex:\s*none/,
      "sin `flex: none`, la casilla se encoge cuando la etiqueta ocupa dos líneas");
    assert.match(limpio, /\.chk input\[type="checkbox"\][^{]*\{[^}]*width:\s*auto/,
      "la casilla volvería a heredar el width:100% de los campos del panel");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE SOLO SE PUEDE SABER ABRIENDO UN NAVEGADOR
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Todo lo de arriba se sostiene sin Chrome. Lo de aquí abajo NO: contraste que de verdad hereda
// un elemento, anchos tras el reparto de flex, `white-space` computado y el aro que el navegador
// pinta. Si `puppeteer` no está, estas pruebas se saltan y se dice por qué.
describe("medido en Chrome", { skip: sinPuppeteer() }, () => {
  let navegador, servidor, puerto;

  before(async () => {
    const { default: pup } = await import("puppeteer");
    const http = await import("node:http");
    const RAIZ_PUB = path.join(RAIZ, "public");
    const TIPOS = { ".html": "text/html;charset=utf-8", ".css": "text/css", ".js": "text/javascript",
      ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon",
      ".jpg": "image/jpeg", ".webp": "image/webp" };
    const USUARIO = { username: "direccion", nombre: "Dirección", rol: "direccion", local: "", locales: [], modulos: null };
    const VACIO = { ok: true, data: [], items: [], rows: [], reservas: [], clientes: [], productos: [],
      totales: {}, resumen: {}, stats: {}, categorias: { categorias: [] }, cuadrante: {} };
    servidor = http.createServer((req, res) => {
      const u = decodeURIComponent((req.url || "/").split("?")[0]);
      if (u.startsWith("/api/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(u === "/api/auth/me" ? { ok: true, user: USUARIO } : VACIO));
      }
      const rel = (u === "/" || u === "/panel" || u === "/panel/") ? "/panel/index.html" : u;
      const f = path.join(RAIZ_PUB, rel);
      if (!f.startsWith(RAIZ_PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); return res.end("no");
      }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(rel)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    await new Promise((r) => servidor.listen(0, r));
    puerto = servidor.address().port;
    navegador = await pup.launch({ headless: "new", args: ["--no-sandbox"] });
  });

  // Sin esto el proceso de `node --test` no termina nunca: quedan vivos Chrome y el servidor.
  after(async () => {
    if (navegador) await navegador.close();
    if (servidor) await new Promise((r) => servidor.close(r));
  });

  // El contraste se CALCULA con la fórmula de la WCAG sobre los colores que el navegador dice
  // que se están pintando. No se estima a ojo ni se lee del fichero.
  const luminancia = (c) => {
    const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const contraste = (a, b) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const aRGB = (s) => (String(s).match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);

  async function abrir(ruta, { ancho = 1440, esquema = "light", tema = null } = {}) {
    const pg = await navegador.newPage();
    await pg.setViewport({ width: ancho, height: 900 });
    await pg.emulateMediaFeatures([{ name: "prefers-color-scheme", value: esquema }]);
    await pg.evaluateOnNewDocument((t) => {
      try {
        localStorage.setItem("token", "x");
        if (t) localStorage.setItem("panelTheme", t); else localStorage.removeItem("panelTheme");
      } catch {}
    }, tema);
    // `networkidle0` no llega nunca en las páginas que sondean al servidor (fichar, pulso), así
    // que se espera a que el DOM esté y se le da un margen fijo a las hojas y al arranque del JS.
    await pg.goto(`http://127.0.0.1:${puerto}${ruta}`,
      { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, ruta.startsWith("/panel") ? 900 : 250));
    return pg;
  }

  const PUBLICAS = ["/index.html", "/nosotros.html", "/eventos.html", "/trabaja.html",
    "/locales.html", "/privacidad.html", "/privacitat.html", "/login.html", "/cupon.html",
    "/pulso.html", "/trabajadores.html", "/promo.html", "/alta.html", "/tarjeta.html", "/fichar.html"];

  // El contraste del `body` no depende del ancho —lo deciden los tokens, no el viewport— así que
  // las quince páginas se miden una vez por esquema, y el barrido de anchos se deja para lo que
  // sí cambia con ellos (la cabecera y las casillas, más abajo). Noventa cargas de página no
  // caben en una suite que se ejecuta entera en cada cambio.
  for (const esquema of ["light", "dark"]) {
    test(`1 · la web pública se lee con el sistema en ${esquema}`, async () => {
      const malas = [];
      for (const ruta of PUBLICAS) {
        const pg = await abrir(ruta, { esquema });
        const d = await pg.evaluate(() => {
          const c = getComputedStyle(document.body);
          const h = getComputedStyle(document.documentElement);
          return { bg: c.backgroundColor, fg: c.color, cs: h.colorScheme };
        });
        const r = contraste(aRGB(d.fg), aRGB(d.bg));
        if (r < 4.5) malas.push(`${ruta} → ${r.toFixed(2)}:1 (color-scheme: ${d.cs})`);
        await pg.close();
      }
      assert.deepEqual(malas, [],
        `texto ilegible sobre su propio fondo (mínimo 4,5:1):\n  ${malas.join("\n  ")}`);
    });
  }

  test("1 · y en los tres anchos, con el sistema en oscuro, la portada sigue clara", async () => {
    for (const ancho of [1440, 834, 390]) {
      const pg = await abrir("/index.html", { ancho, esquema: "dark" });
      const d = await pg.evaluate(() => {
        const c = getComputedStyle(document.body);
        return { bg: c.backgroundColor, fg: c.color };
      });
      await pg.close();
      assert.ok(luminancia(aRGB(d.bg)) > 0.5,
        `a ${ancho} px la portada se ha vuelto oscura con el sistema en oscuro`);
      assert.ok(contraste(aRGB(d.fg), aRGB(d.bg)) >= 4.5, `a ${ancho} px no llega a 4,5:1`);
    }
  });

  test("1 · el panel conserva sus tres modos de tema", async () => {
    const casos = [
      ["auto, sistema claro", { esquema: "light", tema: null }, "claro"],
      ["auto, sistema oscuro", { esquema: "dark", tema: null }, "oscuro"],
      ["elegido oscuro sobre sistema claro", { esquema: "light", tema: "dark" }, "oscuro"],
      ["elegido claro sobre sistema oscuro", { esquema: "dark", tema: "light" }, "claro"],
    ];
    for (const [eti, opts, esperado] of casos) {
      const pg = await abrir("/panel/", opts);
      const d = await pg.evaluate(() => {
        const c = getComputedStyle(document.body);
        return { bg: c.backgroundColor, fg: c.color };
      });
      const esClaro = luminancia(aRGB(d.bg)) > 0.5;
      assert.equal(esClaro ? "claro" : "oscuro", esperado, `el panel en «${eti}» salió al revés`);
      assert.ok(contraste(aRGB(d.fg), aRGB(d.bg)) >= 4.5, `«${eti}» no llega a 4,5:1`);
      await pg.close();
    }
  });

  test("2 · el nombre del establecimiento se lee en los tres anchos, sin desbordar", async () => {
    const LARGO = "La Tapeta - Santa Coloma de Farners";
    const malas = [];
    for (const ancho of [1440, 1024, 900, 834, 821, 640, 390]) {
      const pg = await abrir("/panel/", { ancho });
      const d = await pg.evaluate((txt) => {
        const l = document.querySelector(".topbar .pick .lbl");
        if (!l) return null;
        l.textContent = txt;
        return { lbl: Math.round(l.getBoundingClientRect().width),
                 sw: document.documentElement.scrollWidth, vw: window.innerWidth };
      }, LARGO);
      await pg.close();
      if (!d) continue;
      // 60 px son unos ocho caracteres: lo justo para distinguir un local de otro. A 834 px
      // llegó a medir 25, que no distingue nada.
      if (d.lbl < 60) malas.push(`@${ancho}: el rótulo mide ${d.lbl} px (mínimo 60)`);
      if (d.sw > d.vw + 2) malas.push(`@${ancho}: la página desborda ${d.sw - d.vw} px`);
    }
    assert.deepEqual(malas, [], `la cabecera del panel:\n  ${malas.join("\n  ")}`);
  });

  test("3 · una etiqueta de casilla larga se parte y cabe en un móvil", async () => {
    const pg = await abrir("/panel/", { ancho: 390 });
    const d = await pg.evaluate(() => {
      const caja = document.createElement("div");
      caja.style.cssText = "width:320px";
      caja.innerHTML = '<label class="chk"><input type="checkbox"> ' +
        'He comprobado que ese código existe en Ágora</label>';
      document.getElementById("view").appendChild(caja);
      const l = caja.querySelector(".chk");
      const r = l.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), ws: getComputedStyle(l).whiteSpace };
    });
    await pg.close();
    assert.notEqual(d.ws, "nowrap", "la etiqueta sigue sin poder partirse");
    assert.ok(d.w <= 322, `la etiqueta mide ${d.w} px dentro de una caja de 320: se sale`);
    assert.ok(d.h > 20, "la etiqueta no llegó a partirse en dos líneas; revisa el caso de prueba");
  });

  test("5 · el aro de foco que pinta el navegador es el nuestro, en web y en panel", async () => {
    for (const ruta of ["/index.html", "/panel/"]) {
      const pg = await abrir(ruta);
      await pg.keyboard.press("Tab");
      const d = await pg.evaluate(() => {
        const e = document.activeElement;
        const c = getComputedStyle(e);
        return { casa: e.matches(":focus-visible"),
                 out: `${c.outlineWidth} ${c.outlineStyle}`, color: c.outlineColor };
      });
      await pg.close();
      assert.ok(d.casa, `en ${ruta}, tabular no dejó ningún elemento en :focus-visible`);
      assert.equal(d.out, "2px solid",
        `en ${ruta} el aro de foco es «${d.out}», no el nuestro. Una llave huérfana en el CSS ` +
        `hace que Chrome descarte la regla siguiente y caiga al aro por defecto del navegador`);
    }
  });
});

function sinPuppeteer() {
  try {
    fs.accessSync(path.join(RAIZ, "node_modules", "puppeteer", "package.json"));
    return false;
  } catch {
    return "puppeteer no está instalado (no es dependencia declarada del proyecto): " +
      "las comprobaciones estructurales de este fichero sí se han ejecutado";
  }
}
