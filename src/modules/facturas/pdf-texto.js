// Facturas — leer la CAPA DE TEXTO de un PDF. Lógica PURA (solo `node:zlib`, que viene con Node).
//
// POR QUÉ EXISTE: casi todas las facturas de proveedor llegan en PDF generado por su programa
// de gestión, no escaneado. Ese PDF ya lleva dentro el texto exacto: el número de factura, el
// NIF, los importes al céntimo. Cuando se le manda solo la imagen del documento al modelo, esos
// caracteres se vuelven a «leer» mirando píxeles, y ahí es donde aparecen los 0/8, 5/6, 1/7 y
// los importes con la coma bailada. Extraer el texto del propio archivo es determinista: lo que
// pone, pone.
//
// La imagen NO sobra: la disposición (quién está arriba con el logotipo, qué hay dentro del
// recuadro de «Cliente») es lo que distingue al emisor del receptor, y eso el texto plano
// corriente lo pierde. Por eso aquí el texto se recompone RESPETANDO LA COLOCACIÓN: cada trozo
// se coloca en su columna aproximada, así que las tablas siguen pareciendo tablas y el bloque
// del cliente sigue siendo un bloque. Se manda todo junto: documento + texto.
//
// No se puede usar una librería de PDF (no se pueden añadir dependencias npm), así que el
// intérprete está escrito a mano. Es un lector PARCIAL y a propósito: entiende lo que llevan
// las facturas reales (Flate, object streams, fuentes simples y Type0 con ToUnicode, formularios
// XObject) y se rinde en silencio con lo demás — un PDF cifrado, uno escaneado o uno raro
// devuelven `hayTexto: false` y la factura se lee como siempre, solo con la imagen. Nunca
// levanta una excepción hacia arriba: quedarse sin texto es peor lectura, quedarse sin factura
// es un problema de verdad.

import zlib from "node:zlib";

// ── Tokenizador de sintaxis PDF ────────────────────────────────────────────
// Los objetos y los flujos de contenido comparten sintaxis, así que un solo tokenizador vale
// para las dos cosas. Se trabaja sobre una cadena "latin1" (1 char = 1 byte) porque el PDF es
// binario y la codificación real de cada cadena depende de la fuente, no del archivo.

const ESPACIOS = new Set([" ", "\n", "\r", "\t", "\f", "\0"]);
const DELIM = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);
const esRegular = (c) => !ESPACIOS.has(c) && !DELIM.has(c);

function tokenizar(s) {
  const out = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (ESPACIOS.has(c)) { i++; continue; }
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }

    if (c === "(") {                                  // cadena literal: (texto\(con\) escapes)
      i++;
      let prof = 1;
      const bytes = [];
      while (i < n && prof > 0) {
        const ch = s[i];
        if (ch === "\\") {
          const sig = s[i + 1];
          i += 2;
          if (sig === "n") bytes.push(10);
          else if (sig === "r") bytes.push(13);
          else if (sig === "t") bytes.push(9);
          else if (sig === "b") bytes.push(8);
          else if (sig === "f") bytes.push(12);
          else if (sig === "\n") { /* continuación de línea */ }
          else if (sig === "\r") { if (s[i] === "\n") i++; }
          else if (sig >= "0" && sig <= "7") {         // octal \ddd
            let oct = sig;
            while (oct.length < 3 && s[i] >= "0" && s[i] <= "7") oct += s[i++];
            bytes.push(parseInt(oct, 8) & 0xff);
          } else bytes.push(sig.charCodeAt(0));
          continue;
        }
        if (ch === "(") prof++;
        else if (ch === ")") { prof--; if (!prof) { i++; break; } }
        bytes.push(ch.charCodeAt(0) & 0xff);
        i++;
      }
      out.push({ t: "str", v: bytes });
      continue;
    }

    if (c === "<") {
      if (s[i + 1] === "<") { out.push({ t: "p", v: "<<" }); i += 2; continue; }
      i++;                                            // cadena hexadecimal <48656C6C6F>
      let hex = "";
      while (i < n && s[i] !== ">") { if (/[0-9a-fA-F]/.test(s[i])) hex += s[i]; i++; }
      i++;
      if (hex.length % 2) hex += "0";
      const bytes = [];
      for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16));
      out.push({ t: "str", v: bytes });
      continue;
    }
    if (c === ">") { if (s[i + 1] === ">") { out.push({ t: "p", v: ">>" }); i += 2; } else i++; continue; }
    if (c === "[" || c === "]") { out.push({ t: "p", v: c }); i++; continue; }
    if (c === "{" || c === "}") { i++; continue; }

    if (c === "/") {                                  // nombre: /Type, /F1, /A#20B
      i++;
      let name = "";
      while (i < n && esRegular(s[i])) name += s[i++];
      name = name.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      out.push({ t: "name", v: "/" + name });
      continue;
    }

    if (/[-+.\d]/.test(c)) {
      let num = "";
      while (i < n && /[-+.\deE]/.test(s[i])) num += s[i++];
      const v = parseFloat(num);
      out.push({ t: "num", v: Number.isFinite(v) ? v : 0 });
      continue;
    }

    let kw = "";
    while (i < n && esRegular(s[i])) kw += s[i++];
    if (!kw) { i++; continue; }                       // carácter suelto que no encaja: se ignora
    out.push({ t: "kw", v: kw });
  }
  return out;
}

// ── Parser de objetos (diccionarios, arrays, referencias) ──────────────────
// Los nombres se representan como cadenas con barra ("/Type"), las referencias como {ref:n} y
// los diccionarios como objetos planos. Es lo bastante para leer /Contents, /Resources y fuentes.

function parseValor(toks, i) {
  const t = toks[i];
  if (!t) return [null, i + 1];
  if (t.t === "num") {
    // "12 0 R" es una referencia indirecta; hay que mirar dos tokens por delante.
    if (toks[i + 1]?.t === "num" && toks[i + 2]?.t === "kw" && toks[i + 2].v === "R") {
      return [{ ref: t.v }, i + 3];
    }
    return [t.v, i + 1];
  }
  if (t.t === "name" || t.t === "str") return [t.v, i + 1];
  if (t.t === "kw") {
    if (t.v === "true") return [true, i + 1];
    if (t.v === "false") return [false, i + 1];
    return [null, i + 1];                             // null y cualquier palabra suelta
  }
  if (t.v === "[") {
    const arr = [];
    let k = i + 1;
    while (k < toks.length && !(toks[k].t === "p" && toks[k].v === "]")) {
      const [v, sig] = parseValor(toks, k);
      if (sig <= k) break;
      arr.push(v); k = sig;
    }
    return [arr, k + 1];
  }
  if (t.v === "<<") {
    const d = {};
    let k = i + 1;
    while (k < toks.length && !(toks[k].t === "p" && toks[k].v === ">>")) {
      if (toks[k].t !== "name") { k++; continue; }
      const clave = toks[k].v;
      const [v, sig] = parseValor(toks, k + 1);
      d[clave] = v;
      k = sig > k ? sig : k + 2;
    }
    return [d, k + 1];
  }
  return [null, i + 1];
}

function parseDiccionario(str) {
  const toks = tokenizar(str);
  const inicio = toks.findIndex((t) => t.t === "p" && t.v === "<<");
  if (inicio < 0) return {};
  return parseValor(toks, inicio)[0] || {};
}

// ── Descompresión ──────────────────────────────────────────────────────────

function inflar(buf) {
  // Muchos PDF traen el flujo con un byte de más o cortado; Z_SYNC_FLUSH devuelve lo que haya
  // descomprimido en vez de tirar el flujo entero por un final imperfecto.
  const opciones = { finishFlush: zlib.constants.Z_SYNC_FLUSH };
  try { return zlib.inflateSync(buf, opciones); } catch { /* puede ser deflate crudo */ }
  try { return zlib.inflateRawSync(buf, opciones); } catch { return null; }
}

/** Predictor PNG (/DecodeParms). Lo usan sobre todo los xref y algún object stream. */
function desPredecir(buf, parms) {
  const pred = Number(parms?.["/Predictor"] || 1);
  if (pred < 10) return buf;
  const cols = Number(parms?.["/Columns"] || 1);
  const colores = Number(parms?.["/Colors"] || 1);
  const bpc = Number(parms?.["/BitsPerComponent"] || 8);
  const bpp = Math.max(1, Math.ceil((colores * bpc) / 8));
  const fila = cols * colores * bpc / 8;
  const out = [];
  let prev = Buffer.alloc(fila);
  for (let p = 0; p + 1 <= buf.length; p += fila + 1) {
    const tipo = buf[p];
    const act = Buffer.from(buf.slice(p + 1, p + 1 + fila));
    if (act.length < fila) break;
    for (let k = 0; k < fila; k++) {
      const a = k >= bpp ? act[k - bpp] : 0, b = prev[k], c = k >= bpp ? prev[k - bpp] : 0;
      if (tipo === 1) act[k] = (act[k] + a) & 0xff;
      else if (tipo === 2) act[k] = (act[k] + b) & 0xff;
      else if (tipo === 3) act[k] = (act[k] + ((a + b) >> 1)) & 0xff;
      else if (tipo === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        act[k] = (act[k] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    out.push(act); prev = act;
  }
  return Buffer.concat(out);
}

// ── Índice de objetos ──────────────────────────────────────────────────────
// Se barre el archivo entero buscando «N G obj … endobj» en vez de seguir la tabla xref. Es
// menos elegante pero mucho más robusto: los PDF de proveedores vienen a menudo con xref rotos,
// actualizados de forma incremental o con basura al final, y el barrido se los traga igual.

const RE_OBJ = /(\d{1,10})\s+(\d{1,5})\s+obj\b/g;

function indexarObjetos(raw) {
  const objetos = new Map();
  RE_OBJ.lastIndex = 0;
  let m;
  let saltarHasta = 0;
  while ((m = RE_OBJ.exec(raw))) {
    if (m.index < saltarHasta) continue;              // estábamos dentro de datos binarios
    const antes = m.index === 0 ? "\n" : raw[m.index - 1];
    if (esRegular(antes)) continue;                   // "1 0 obj" de verdad, no el final de otro número
    const num = Number(m[1]);
    const cuerpo = m.index + m[0].length;

    const finObj = raw.indexOf("endobj", cuerpo);
    let idxStream = raw.indexOf("stream", cuerpo);
    if (idxStream >= 0 && finObj >= 0 && idxStream > finObj) idxStream = -1;

    if (idxStream < 0) {
      objetos.set(num, { dict: raw.slice(cuerpo, finObj < 0 ? cuerpo + 4096 : finObj) });
      continue;
    }
    const dictStr = raw.slice(cuerpo, idxStream);
    let ini = idxStream + 6;
    if (raw[ini] === "\r") ini++;
    if (raw[ini] === "\n") ini++;
    const dict = parseDiccionario(dictStr);
    let fin = -1;
    const len = typeof dict["/Length"] === "number" ? dict["/Length"] : null;
    if (len != null && len > 0 && raw.slice(ini + len, ini + len + 20).includes("endstream")) fin = ini + len;
    if (fin < 0) {
      const e = raw.indexOf("endstream", ini);
      fin = e < 0 ? raw.length : e;
    }
    objetos.set(num, { dict: dictStr, dictP: dict, ini, fin });
    saltarHasta = fin;
    RE_OBJ.lastIndex = Math.max(RE_OBJ.lastIndex, fin);
  }
  return objetos;
}

/** Crea el resolutor de referencias y el lector de flujos sobre un índice ya hecho. */
function crearAcceso(raw, objetos) {
  const cacheDict = new Map();
  const cacheStream = new Map();
  const extra = new Map();                            // objetos rescatados de un /ObjStm

  function dictDe(num) {
    if (extra.has(num)) return extra.get(num);
    if (cacheDict.has(num)) return cacheDict.get(num);
    const o = objetos.get(num);
    const d = !o ? null : (o.dictP || parseDiccionario(o.dict));
    cacheDict.set(num, d);
    return d;
  }

  function res(v, prof = 0) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof v.ref === "number") {
      if (prof > 12) return null;
      return res(dictDe(v.ref), prof + 1);
    }
    return v;
  }

  function datosDe(num) {
    if (cacheStream.has(num)) return cacheStream.get(num);
    const o = objetos.get(num);
    let out = null;
    if (o && o.ini != null) {
      let buf = Buffer.from(raw.slice(o.ini, o.fin), "latin1");
      const d = o.dictP || parseDiccionario(o.dict);
      const filtros = [].concat(res(d["/Filter"]) || []);
      const parms = [].concat(res(d["/DecodeParms"]) || []);
      for (let k = 0; k < filtros.length; k++) {
        const f = filtros[k];
        if (f === "/FlateDecode" || f === "/Fl") {
          const inf = inflar(buf);
          if (!inf) { buf = null; break; }
          buf = desPredecir(inf, res(parms[k]) || null);
        } else if (f === "/ASCIIHexDecode" || f === "/AHx") {
          const hex = buf.toString("latin1").split(">")[0].replace(/[^0-9a-fA-F]/g, "");
          buf = Buffer.from(hex.length % 2 ? hex + "0" : hex, "hex");
        } else { buf = null; break; }                 // LZW, JPX, DCT… no es texto: se abandona
      }
      out = buf;
    }
    cacheStream.set(num, out);
    return out;
  }

  // Los PDF 1.5+ meten diccionarios (páginas, fuentes) dentro de flujos comprimidos /ObjStm.
  // Sin abrirlos, un PDF moderno parece no tener ni páginas.
  for (const [num, o] of objetos) {
    if (o.ini == null) continue;
    const d = o.dictP || parseDiccionario(o.dict);
    if (res(d["/Type"]) !== "/ObjStm") continue;
    const datos = datosDe(num);
    if (!datos) continue;
    const texto = datos.toString("latin1");
    const n = Number(res(d["/N"]) || 0), first = Number(res(d["/First"]) || 0);
    const cab = texto.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < n; k++) {
      const on = cab[k * 2], off = cab[k * 2 + 1];
      if (!Number.isFinite(on) || !Number.isFinite(off)) continue;
      const finPieza = k + 1 < n && Number.isFinite(cab[k * 2 + 3]) ? first + cab[k * 2 + 3] : texto.length;
      const trozo = texto.slice(first + off, finPieza);
      const toks = tokenizar(trozo);
      if (!extra.has(on)) extra.set(on, parseValor(toks, 0)[0]);
    }
  }

  return { res, dictDe, datosDe, extra };
}

// ── Páginas ────────────────────────────────────────────────────────────────

function listarPaginas(objetos, acc) {
  const { res, dictDe, extra } = acc;
  const paginas = [];
  const vistos = new Set();

  const recorrer = (nodo, prof = 0) => {
    const d = res(nodo);
    if (!d || typeof d !== "object" || prof > 32) return;
    const tipo = res(d["/Type"]);
    if (tipo === "/Page" || (!tipo && d["/Contents"] && !d["/Kids"])) { paginas.push(d); return; }
    const kids = res(d["/Kids"]);
    if (Array.isArray(kids)) {
      for (const k of kids) {
        const clave = typeof k?.ref === "number" ? k.ref : null;
        if (clave != null) { if (vistos.has(clave)) continue; vistos.add(clave); }
        recorrer(k, prof + 1);
      }
    }
  };

  // Camino normal: catálogo → árbol de páginas. Respeta el orden real del documento.
  for (const [num] of objetos) {
    const d = dictDe(num);
    if (d && res(d["/Type"]) === "/Catalog" && d["/Pages"]) { recorrer(d["/Pages"]); break; }
  }
  if (!paginas.length) for (const [, d] of extra) {
    if (d && res(d["/Type"]) === "/Catalog" && d["/Pages"]) { recorrer(d["/Pages"]); break; }
  }

  // Plan B: cualquier objeto que se declare página, en orden de numeración. Peor orden, pero
  // mejor que devolver un documento vacío porque el catálogo esté raro.
  if (!paginas.length) {
    const todos = [...objetos.keys(), ...extra.keys()].sort((a, b) => a - b);
    for (const num of todos) {
      const d = dictDe(num);
      if (d && res(d["/Type"]) === "/Page") paginas.push(d);
    }
  }
  return paginas;
}

// ── Fuentes: de bytes a caracteres ─────────────────────────────────────────

// WinAnsi solo se separa de latin1 en 0x80–0x9F, y justo ahí está el €, que en una factura
// importa. El resto coincide, así que no hace falta la tabla entera.
const WINANSI_ALTOS = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ",
  0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "'", 0x92: "'", 0x93: "“",
  0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

// Nombres de glifo que aparecen en /Differences. No está la lista completa de Adobe (son
// miles): están las letras, las cifras, la puntuación y lo que lleva una factura en español.
const GLIFOS = (() => {
  const g = {
    space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%",
    ampersand: "&", quotesingle: "'", parenleft: "(", parenright: ")", asterisk: "*", plus: "+",
    comma: ",", hyphen: "-", period: ".", slash: "/", colon: ":", semicolon: ";", less: "<",
    equal: "=", greater: ">", question: "?", at: "@", bracketleft: "[", backslash: "\\",
    bracketright: "]", asciicircum: "^", underscore: "_", grave: "`", braceleft: "{", bar: "|",
    braceright: "}", asciitilde: "~", Euro: "€", euro: "€", quoteright: "'", quoteleft: "'",
    quotedblleft: "“", quotedblright: "”", endash: "–", emdash: "—", bullet: "•",
    degree: "°", ordfeminine: "ª", ordmasculine: "º", exclamdown: "¡", questiondown: "¿",
    periodcentered: "·", currency: "¤", sterling: "£", yen: "¥", cent: "¢", section: "§",
    paragraph: "¶", copyright: "©", registered: "®", plusminus: "±", multiply: "×",
    divide: "÷", onequarter: "¼", onehalf: "½", threequarters: "¾", guillemotleft: "«",
    guillemotright: "»", ellipsis: "…", trademark: "™", dagger: "†", perthousand: "‰",
  };
  const cifras = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  cifras.forEach((n, i) => { g[n] = String(i); });
  for (let c = 65; c <= 90; c++) { const L = String.fromCharCode(c); g[L] = L; g[L.toLowerCase()] = L.toLowerCase(); }
  const acentos = { acute: "́", grave: "̀", dieresis: "̈", tilde: "̃", circumflex: "̂", cedilla: "̧", ring: "̊" };
  for (const base of "AEIOUYNCaeiouyncs") {
    for (const [suf, comb] of Object.entries(acentos)) {
      g[base + suf] = (base + comb).normalize("NFC");
    }
  }
  return g;
})();

function glifoAChar(nombre) {
  if (!nombre) return null;
  const n = nombre.replace(/^\//, "");
  if (GLIFOS[n]) return GLIFOS[n];
  let m = /^uni([0-9a-fA-F]{4})$/.exec(n);
  if (m) return String.fromCharCode(parseInt(m[1], 16));
  m = /^u([0-9a-fA-F]{4,6})$/.exec(n);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  return null;                                        // g23, cid45… no se puede saber
}

function hexAUnicode(hex) {
  let out = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const trozo = hex.slice(i, i + 4);
    if (trozo.length < 4) break;
    out += String.fromCharCode(parseInt(trozo, 16));
  }
  return out;
}

/** /ToUnicode: el mapa que el propio PDF trae para decir qué letra es cada código. */
function parseToUnicode(texto) {
  const mapa = new Map();
  if (!texto) return mapa;
  const RE_CHAR = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = RE_CHAR.exec(texto))) {
    const pares = m[1].match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g) || [];
    for (const p of pares) {
      const [, src, dst] = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/.exec(p);
      mapa.set(parseInt(src, 16), hexAUnicode(dst));
    }
  }
  const RE_RANGE = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = RE_RANGE.exec(texto))) {
    const cuerpo = m[1];
    const RE_A = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[([\s\S]*?)\])/g;
    let r;
    while ((r = RE_A.exec(cuerpo))) {
      const lo = parseInt(r[1], 16), hi = parseInt(r[2], 16);
      if (hi - lo > 65535) continue;
      if (r[3] != null) {
        const base = parseInt(r[3], 16);
        for (let c = lo; c <= hi; c++) {
          // Solo se incrementa el último código: es como funciona bfrange con destino simple.
          mapa.set(c, hexAUnicode((base + (c - lo)).toString(16).padStart(r[3].length, "0")));
        }
      } else {
        const lista = r[4].match(/<([0-9a-fA-F]*)>/g) || [];
        lista.forEach((d, i) => mapa.set(lo + i, hexAUnicode(d.replace(/[<>]/g, ""))));
      }
    }
  }
  return mapa;
}

function construirFuente(dictFuente, acc) {
  const { res, datosDe } = acc;
  const d = res(dictFuente);
  const vacia = { dosBytes: false, ancho: () => 500, char: (c) => String.fromCharCode(c) };
  if (!d || typeof d !== "object") return vacia;

  const subtipo = res(d["/Subtype"]);
  const esType0 = subtipo === "/Type0";

  let toUni = new Map();
  const refUni = d["/ToUnicode"];
  if (refUni && typeof refUni.ref === "number") {
    const buf = datosDe(refUni.ref);
    if (buf) toUni = parseToUnicode(buf.toString("latin1"));
  }

  // Codificación de fuente simple: base (WinAnsi/latin1) + las diferencias que declare.
  const dif = new Map();
  const enc = res(d["/Encoding"]);
  if (enc && typeof enc === "object" && Array.isArray(res(enc["/Differences"]))) {
    let codigo = 0;
    for (const it of res(enc["/Differences"])) {
      if (typeof it === "number") codigo = it;
      else if (typeof it === "string") { const ch = glifoAChar(it); if (ch != null) dif.set(codigo, ch); codigo++; }
    }
  }

  // Anchos: hacen falta para saber dónde acaba cada trozo y, con eso, cuánto hueco hay hasta
  // el siguiente. Sin ellos las columnas se pisan.
  const anchos = new Map();
  let anchoDef = 500;
  if (esType0) {
    const desc = res(res(d["/DescendantFonts"])?.[0]);
    anchoDef = Number(res(desc?.["/DW"]) || 1000);
    const W = res(desc?.["/W"]);
    if (Array.isArray(W)) {
      for (let i = 0; i < W.length;) {
        const a = res(W[i]);
        const b = res(W[i + 1]);
        if (Array.isArray(b)) { b.forEach((w, k) => anchos.set(a + k, Number(res(w)) || anchoDef)); i += 2; }
        else { const w = Number(res(W[i + 2])) || anchoDef; for (let c = a; c <= b && c - a < 65536; c++) anchos.set(c, w); i += 3; }
      }
    }
  } else {
    const primero = Number(res(d["/FirstChar"]) || 0);
    const lista = res(d["/Widths"]);
    if (Array.isArray(lista)) lista.forEach((w, i) => anchos.set(primero + i, Number(res(w)) || 0));
    anchoDef = Number(res(res(d["/FontDescriptor"])?.["/MissingWidth"]) || 500);
  }

  return {
    dosBytes: esType0,
    ancho: (c) => (anchos.has(c) ? anchos.get(c) : anchoDef),
    char: (c) => {
      if (toUni.has(c)) return toUni.get(c);
      if (esType0) return "";                         // Type0 sin ToUnicode: los códigos no son letras
      if (dif.has(c)) return dif.get(c);
      if (WINANSI_ALTOS[c]) return WINANSI_ALTOS[c];
      return String.fromCharCode(c);
    },
  };
}

// ── Intérprete del flujo de contenido ──────────────────────────────────────

const IDENT = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

function interpretar(contenido, recursos, acc, items, ctmInicial, prof = 0) {
  const { res, datosDe } = acc;
  const toks = tokenizar(contenido);
  const fuentes = new Map();
  const dictFuentes = res(recursos?.["/Font"]) || {};
  const dictXObj = res(recursos?.["/XObject"]) || {};

  const fuenteDe = (nombre) => {
    if (!fuentes.has(nombre)) fuentes.set(nombre, construirFuente(dictFuentes[nombre], acc));
    return fuentes.get(nombre);
  };

  let ctm = ctmInicial || IDENT;
  const pila = [];
  let tm = null, tlm = null;
  let fuente = null, size = 0, tc = 0, tw = 0, th = 1, tl = 0;
  const ops = [];
  const num = (i) => { const v = ops[i]; return typeof v === "number" ? v : 0; };

  const mostrar = (bytes) => {
    if (!tm || !bytes || !bytes.length) return;
    const f = fuente || construirFuente(null, acc);
    const trm = mul(tm, ctm);
    const escalaY = Math.hypot(trm[2], trm[3]) || Math.hypot(trm[0], trm[1]) || 1;
    let texto = "";
    let avance = 0;
    for (let i = 0; i < bytes.length; i += f.dosBytes ? 2 : 1) {
      const c = f.dosBytes ? (bytes[i] << 8) | (bytes[i + 1] || 0) : bytes[i];
      texto += f.char(c);
      avance += ((f.ancho(c) / 1000) * size + tc + (!f.dosBytes && c === 32 ? tw : 0)) * th;
    }
    const anchoDisp = Math.abs(avance * (Math.hypot(trm[0], trm[1]) || 1));
    // El tamaño que se ve en la página es el de la fuente por la escala de la matriz: hay
    // facturas que usan Tf 1 y escalan con Tm, y sin esto todas las líneas parecerían de 1 punto.
    if (texto.trim()) items.push({ x: trm[4], y: trm[5], texto, size: Math.abs(size * escalaY) || 10, ancho: anchoDisp });
    tm = mul([1, 0, 0, 1, avance, 0], tm);
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== "kw" || t.v === "true" || t.v === "false" || t.v === "null") {
      const [v, sig] = parseValor(toks, i);
      ops.push(v);
      i = sig - 1;
      if (ops.length > 64) ops.splice(0, ops.length - 64);
      continue;
    }
    const op = t.v;
    switch (op) {
      case "q": pila.push(ctm); break;
      case "Q": ctm = pila.pop() || IDENT; break;
      case "cm": if (ops.length >= 6) ctm = mul(ops.slice(-6).map(Number), ctm); break;
      case "BT": tm = tlm = IDENT; break;
      case "ET": tm = tlm = null; break;
      case "Tf": fuente = fuenteDe(ops[ops.length - 2]); size = num(ops.length - 1); break;
      case "TL": tl = num(ops.length - 1); break;
      case "Tc": tc = num(ops.length - 1); break;
      case "Tw": tw = num(ops.length - 1); break;
      case "Tz": th = (num(ops.length - 1) || 100) / 100; break;
      case "TD": tl = -num(ops.length - 1); // sin break: TD es Td y además fija el interlineado
      // falls through
      case "Td":
        tlm = mul([1, 0, 0, 1, num(ops.length - 2), num(ops.length - 1)], tlm || IDENT);
        tm = tlm; break;
      case "Tm": if (ops.length >= 6) { tlm = ops.slice(-6).map(Number); tm = tlm; } break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -tl], tlm || IDENT); tm = tlm; break;
      case "Tj": mostrar(ops[ops.length - 1]); break;
      case "'": tlm = mul([1, 0, 0, 1, 0, -tl], tlm || IDENT); tm = tlm; mostrar(ops[ops.length - 1]); break;
      case '"':
        tw = num(ops.length - 3); tc = num(ops.length - 2);
        tlm = mul([1, 0, 0, 1, 0, -tl], tlm || IDENT); tm = tlm;
        mostrar(ops[ops.length - 1]); break;
      case "TJ": {
        const arr = ops[ops.length - 1];
        if (Array.isArray(arr)) for (const e of arr) {
          if (typeof e === "number") tm = mul([1, 0, 0, 1, (-e / 1000) * size * th, 0], tm || IDENT);
          else mostrar(e);
        }
        break;
      }
      case "Do": {
        // Muchas facturas dibujan todo dentro de un formulario XObject; sin entrar, la página
        // sale en blanco.
        if (prof >= 6) break;
        const ref = dictXObj[ops[ops.length - 1]];
        const xo = res(ref);
        if (!xo || res(xo["/Subtype"]) !== "/Form" || typeof ref?.ref !== "number") break;
        const datos = datosDe(ref.ref);
        if (!datos) break;
        const matriz = res(xo["/Matrix"]);
        const base = Array.isArray(matriz) && matriz.length === 6 ? mul(matriz.map(Number), ctm) : ctm;
        interpretar(datos.toString("latin1"), res(xo["/Resources"]) || recursos, acc, items, base, prof + 1);
        break;
      }
      default: break;
    }
    ops.length = 0;
  }
}

// ── Recomposición: de trozos sueltos a texto con disposición ───────────────

/**
 * Coloca los trozos en una rejilla de caracteres. Es lo que hace que una tabla de líneas siga
 * pareciendo una tabla y que el bloque del cliente no se mezcle con el del emisor.
 * Exportada para poder probarla sin PDF de por medio.
 */
export function componerPagina(items, { anchoMax = 200 } = {}) {
  if (!items.length) return "";
  const tamanos = items.map((i) => i.size).filter((s) => s > 0).sort((a, b) => a - b);
  const tam = tamanos[Math.floor(tamanos.length / 2)] || 10;
  const unidad = Math.min(7, Math.max(2.5, tam * 0.5));   // ancho aproximado de un carácter

  const orden = [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lineas = [];
  for (const it of orden) {
    const ult = lineas[lineas.length - 1];
    const tol = Math.max(1.5, Math.min(6, it.size * 0.4));
    if (ult && Math.abs(ult.y - it.y) <= tol) { ult.items.push(it); ult.y = (ult.y + it.y) / 2; }
    else lineas.push({ y: it.y, items: [it] });
  }

  const minX = Math.min(...items.map((i) => i.x));
  const salida = [];
  let yPrev = null;
  for (const linea of lineas) {
    if (yPrev != null && yPrev - linea.y > tam * 2.2) salida.push("");   // hueco: párrafo aparte
    yPrev = linea.y;
    let s = "";
    let xFin = -Infinity;                                 // dónde acabó de pintar el trozo anterior
    for (const it of linea.items.sort((a, b) => a.x - b.x)) {
      const hueco = it.x - xFin;
      // Hay facturas que pintan LETRA A LETRA (una orden de posición por glifo). Si se mirara
      // solo la coordenada, cada letra caería en su columna y saldría «P r o p i e t a r i».
      // Por eso lo que decide es el HUECO real respecto al final del trozo anterior: sin hueco,
      // se pega; con hueco, se respeta la columna.
      if (hueco > unidad * 0.28) {
        const col = Math.max(0, Math.round((it.x - minX) / unidad));
        const destino = Math.max(col, s.length + (s.length ? 1 : 0));   // al principio, sin sangría
        s += " ".repeat(Math.min(destino - s.length, anchoMax));
      }
      // Hay PDF cuyo /ToUnicode traduce el espacio a un carácter de control (U+0001 es el
      // clásico). Se normalizan a espacio: un carácter invisible dentro de un NIF o de un
      // importe es exactamente el tipo de basura que no queremos mandarle al modelo.
      s += it.texto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
      xFin = it.x + it.ancho;
    }
    salida.push(s.replace(/\s+$/, ""));
  }
  return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── API pública ────────────────────────────────────────────────────────────

const RE_PALABRA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/g;

/**
 * ¿Lo extraído es una capa de texto de verdad?
 *
 * Un PDF escaneado suele traer algo de texto: el sello de la impresora, un pie, una marca de
 * agua. Mandar cuatro palabras sueltas como si fueran «el texto exacto de la factura» es peor
 * que no mandar nada, porque invita a fiarse de un fragmento. Se pide, además, que haya cifras:
 * una factura sin números no es una factura.
 */
export function pareceCapaDeTexto(texto) {
  const t = String(texto || "");
  const palabras = (t.match(RE_PALABRA) || []).length;
  const cifras = (t.match(/\d/g) || []).length;
  return t.replace(/\s/g, "").length >= 80 && palabras >= 12 && cifras >= 8;
}

/**
 * Extrae la capa de texto de un PDF. Nunca lanza: si algo no se entiende, `hayTexto` es false
 * y el que llama sigue como si el PDF fuera una foto.
 *
 * @returns {{hayTexto:boolean, texto:string, paginas:string[], motivo:string|null}}
 */
export function extraerTextoPdf(buffer, { maxPaginas = 8, maxChars = 40000 } = {}) {
  const vacio = (motivo) => ({ hayTexto: false, texto: "", paginas: [], motivo });
  try {
    if (!buffer || !buffer.length) return vacio("sin archivo");
    const raw = Buffer.isBuffer(buffer) ? buffer.toString("latin1") : String(buffer);
    if (!raw.startsWith("%PDF") && !raw.slice(0, 1024).includes("%PDF")) return vacio("no es un PDF");
    // Un PDF cifrado descomprime a basura; no merece la pena intentarlo.
    if (/\/Encrypt\b/.test(raw.slice(-4096)) || /trailer[\s\S]{0,400}\/Encrypt\b/.test(raw)) return vacio("PDF cifrado");

    const objetos = indexarObjetos(raw);
    if (!objetos.size) return vacio("sin objetos legibles");
    const acc = crearAcceso(raw, objetos);
    const paginas = listarPaginas(objetos, acc).slice(0, maxPaginas);
    if (!paginas.length) return vacio("sin páginas");

    const textos = [];
    for (const pag of paginas) {
      const items = [];
      const recursos = acc.res(pag["/Resources"]) || {};
      const contenidos = [].concat(pag["/Contents"] || []);
      const trozos = [];
      for (const c of contenidos) {
        const arr = acc.res(c);
        const refs = Array.isArray(arr) ? arr : [c];
        for (const r of refs) {
          if (typeof r?.ref !== "number") continue;
          const datos = acc.datosDe(r.ref);
          if (datos) trozos.push(datos.toString("latin1"));
        }
      }
      if (!trozos.length) { textos.push(""); continue; }
      // Un flujo de contenido puede venir partido en varios objetos; se concatenan porque el
      // estado gráfico continúa de uno al siguiente.
      interpretar(trozos.join("\n"), recursos, acc, items, IDENT);
      textos.push(componerPagina(items));
    }

    let texto = textos.map((t, i) => (textos.length > 1 ? `[Página ${i + 1}]\n${t}` : t)).join("\n\n").trim();
    if (texto.length > maxChars) texto = texto.slice(0, maxChars) + "\n[…texto recortado…]";
    if (!pareceCapaDeTexto(texto)) return vacio("sin capa de texto aprovechable");
    return { hayTexto: true, texto, paginas: textos, motivo: null };
  } catch (e) {
    return vacio("error al leer el PDF: " + (e?.message || e));
  }
}

/**
 * El bloque que se le manda al modelo junto al documento. Las instrucciones importan tanto como
 * el texto: sin ellas el modelo no sabe cuál de las dos fuentes manda cuando discrepan, y la
 * gracia de todo esto es que para los CARACTERES mande el texto (es exacto) y para la
 * DISPOSICIÓN mande el documento (el texto plano no sabe qué hay dentro del recuadro del logo).
 */
export function bloqueTextoParaClaude(texto) {
  return `\n\n=== CAPA DE TEXTO DEL PDF (extraída del propio archivo, no leída de la imagen) ===
Es el texto EXACTO que el emisor escribió en el PDF, recolocado para respetar más o menos la
disposición original (las columnas se conservan con espacios).
Cómo usarla:
- Para NÚMEROS Y TEXTOS LITERALES (nº de factura, NIF, fechas, cantidades, precios, importes,
  descripciones) manda esta capa: no tiene errores de lectura. Si lo que ves en la imagen y lo
  que pone aquí no coincide, copia lo de aquí.
- Para SABER QUIÉN ES QUIÉN y qué significa cada bloque manda el documento: el membrete, los
  recuadros y la posición se ven en la imagen, no aquí.
- Puede estar incompleta o descolocada (columnas pegadas, alguna línea partida). Si algo no
  aparece aquí pero sí en la imagen, usa la imagen. No inventes nada que no esté en ninguna.
--- INICIO DE LA CAPA DE TEXTO ---
${texto}
--- FIN DE LA CAPA DE TEXTO ---`;
}
