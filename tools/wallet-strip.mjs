// LA BANDA DEL PASE (`strip.png`). Node puro: `zlib` y nada más.
//
// ── QUÉ ES Y DÓNDE SALE ──────────────────────────────────────────────────────────────────────
//
// En un `storeCard`, la banda se pinta DETRÁS del campo principal —el nombre del titular— y ocupa
// el ancho entero. Es LA ÚNICA superficie libre del pase: todo lo demás lo compone iOS.
//
//   375 × 144   ×1        750 × 288   ×2        1125 × 432   ×3
//
// La medida es la de Apple para un `storeCard`, y está comprobada sobre una captura real: la banda
// mide 2,60 : 1 en el iPhone, que es exactamente 375/144. (Durante un tiempo se dibujó a 375 × 123
// —el ancho del formato moderno con el alto del antiguo de 320 pt—, y iOS la estiraba un 17 %.)
//
// ── POR QUÉ LA BANDA ES OSCURA ENTERA ────────────────────────────────────────────────────────
//
// Porque iOS PINTA EN BLANCO el texto que cae sobre la banda, y no hay forma de evitarlo:
// `foregroundColor` se respeta en todo el pase MENOS ahí. Se comprobó en un iPhone de verdad.
//
// Eso descarta cualquier banda clara: el nombre desaparecería. Y decide el tono de la terracota —
// tiene que ser lo bastante profunda para que el blanco se lea. La elegida da 6,9 : 1 de contraste
// con el blanco; un naranja vivo se queda en 2,8 y es ilegible.
//
// ── QUÉ HAY DENTRO, Y POR QUÉ TAN POCO ───────────────────────────────────────────────────────
//
// Tres cosas, y la de en medio casi no se ve:
//
//   1. EL LEMA, arriba a la izquierda, pequeño. Estaba en un campo del pase y iOS le daba una fila
//      entera para él solo: ocupaba más ancho que el nombre del cliente. Aquí vuelve a ser lo que
//      es —una firma de marca— y devuelve esa franja a la tarjeta.
//   2. LA MARCA DE AGUA: la propia firma, ampliada y cortada por el borde derecho, al 7 %. Es lo
//      que convierte un rectángulo de color en un objeto. A un palmo no se ve.
//   3. NADA MÁS. Antes había una ramita vegetal; vista a tamaño real en el teléfono se leía como
//      una ilustración pegada en la esquina, no como textura de marca. Fuera.
//
// La mitad izquierda y baja se deja LIMPIA: ahí cae el nombre, en cuerpo grande.
//
// ── LOS DOS PLANES B, Y ESTÁN A UNA LÍNEA ────────────────────────────────────────────────────
//
// Las dos decisiones estéticas de arriba hay que verlas en un teléfono, no discutirlas:
//
//   · `MARCA_AGUA = false`  →  la banda se queda plana. Si la firma ampliada ensucia, fuera.
//   · `LEMA = ""`           →  el lema sale del frontal. Si un nombre largo lo toca, fuera.
//
// EL NOMBRE MANDA SIEMPRE. El lema se coloca por encima de donde iOS pinta el nombre y con el
// ancho limitado; si no cupiera, no se pinta a medias: no se pinta.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(AQUI, "..", "public", "assets", "wallet");

// ── La paleta ────────────────────────────────────────────────────────────────────────────────
const MARFIL = [244, 242, 237];
const TERRACOTA = [143, 68, 48];   // #8F4430 · 6,9 : 1 con el blanco que iOS impone encima

/** El lema. Cadena vacía = no se pinta (plan B). */
const LEMA = "MENJAR · BEURE · COMPARTIR";
const LEMA_ALFA = 0.45;
const LEMA_ALTO = 0.052;     // del alto de la banda
const LEMA_ARRIBA = 0.075;   // dónde empieza, del alto de la banda
const LEMA_ANCHO_MAX = 0.55; // nunca más de esto: el resto es del nombre

/** La marca de agua. `false` = banda plana (plan B). */
const MARCA_AGUA = true;
const AGUA_ALFA = 0.07;
const AGUA_ALTO = 0.82;      // veces el alto de la banda: se sale por arriba y por abajo
const AGUA_IZQUIERDA = 0.44; // dónde empieza: de ahí a la derecha, y se corta

// ── PNG: escribir. Igual que en `wallet-imagenes.mjs` ────────────────────────────────────────
const crc32 = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function trozo(nombre, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(nombre, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function escribirPng({ w, h, px }) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(w, 0);
  cabecera.writeUInt32BE(h, 4);
  cabecera[8] = 8;       // 8 bits por canal
  cabecera[9] = 6;       // RGBA
  // Una fila por línea, con el byte de filtro 0 delante: sin filtro. Ocupa algo más y se lee sin
  // sorpresas, que en un fichero que va dentro de un pase firmado es lo que interesa.
  const crudo = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    crudo[y * (w * 4 + 1)] = 0;
    px.copy(crudo, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cabecera),
    trozo("IDAT", zlib.deflateSync(crudo, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// ── PNG: leer ────────────────────────────────────────────────────────────────────────────────
//
// COPIADO de `wallet-imagenes.mjs` a propósito, y no importado: ese fichero ES UN GUION —escribe
// las seis imágenes del logotipo al cargarse y no exporta nada—, así que importarlo aquí
// regeneraría media carpeta como efecto secundario de dibujar una banda.
function leerPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("no es un PNG");
  let i = 8, w = 0, h = 0, tipo = 0, prof = 0;
  const trozos = [];
  while (i < buf.length) {
    const largo = buf.readUInt32BE(i);
    const nombre = buf.toString("ascii", i + 4, i + 8);
    const datos = buf.subarray(i + 8, i + 8 + largo);
    if (nombre === "IHDR") {
      w = datos.readUInt32BE(0); h = datos.readUInt32BE(4);
      prof = datos[8]; tipo = datos[9];
      if (datos[12] !== 0) throw new Error("PNG entrelazado: no se admite");
    } else if (nombre === "IDAT") trozos.push(datos);
    else if (nombre === "IEND") break;
    i += 12 + largo;
  }
  if (prof !== 8 || (tipo !== 6 && tipo !== 2)) {
    throw new Error(`PNG con profundidad ${prof} y tipo ${tipo}: solo RGB/RGBA de 8 bits`);
  }
  const canales = tipo === 6 ? 4 : 3;
  const crudo = zlib.inflateSync(Buffer.concat(trozos));
  const px = Buffer.alloc(w * h * 4, 255);
  const anchoLinea = w * canales;
  let prev = Buffer.alloc(anchoLinea, 0);
  for (let y = 0; y < h; y++) {
    const filtro = crudo[y * (anchoLinea + 1)];
    const linea = Buffer.from(crudo.subarray(y * (anchoLinea + 1) + 1, (y + 1) * (anchoLinea + 1)));
    for (let x = 0; x < anchoLinea; x++) {
      const a = x >= canales ? linea[x - canales] : 0;
      const b = prev[x];
      const c = x >= canales ? prev[x - canales] : 0;
      let v = linea[x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      linea[x] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * canales;
      px[o] = linea[s]; px[o + 1] = linea[s + 1]; px[o + 2] = linea[s + 2];
      px[o + 3] = canales === 4 ? linea[s + 3] : 255;
    }
    prev = linea;
  }
  return { w, h, px };
}

// ── Pintar ───────────────────────────────────────────────────────────────────────────────────

const mezclar = (fondo, tinta, a) => [
  Math.round(fondo[0] * (1 - a) + tinta[0] * a),
  Math.round(fondo[1] * (1 - a) + tinta[1] * a),
  Math.round(fondo[2] * (1 - a) + tinta[2] * a),
];

/** Pone un color sobre el píxel (x, y) con la opacidad dada. Fuera del lienzo, no hace nada. */
function tocar(img, x, y, color, alfa) {
  if (alfa <= 0 || x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  const c = mezclar([img.px[i], img.px[i + 1], img.px[i + 2]], color, Math.min(1, alfa));
  img.px[i] = c[0]; img.px[i + 1] = c[1]; img.px[i + 2] = c[2];
}

// ── LA TIPOGRAFÍA DEL LEMA ───────────────────────────────────────────────────────────────────
//
// ── POR QUÉ HAY UN ALFABETO AQUÍ DENTRO ──────────────────────────────────────────────────────
//
// Porque hay que escribir texto en un PNG y no se pueden añadir dependencias. Las dos salidas
// habituales —una fuente de mapa de bits o rasterizar con un navegador— no valen: la primera sale
// dentada al triplicarla, y la segunda ataría la generación de un asset firmado a que en la
// máquina haya un Chrome instalado.
//
// Así que las letras son TRAZOS: polilíneas en una caja unidad, dibujadas con una pluma redonda de
// grosor constante y el borde suavizado por distancia. Sale nítido a cualquier densidad porque no
// hay píxeles que escalar, y de paso el resultado —un monolineal geométrico en versalitas— es
// exactamente el registro que pide una marca de restauración.
//
// Solo están las letras de LA FRASE. No es una fuente: es este lema.

/** Una curva, muestreada. Los ángulos van en radianes y la `y` crece hacia abajo. */
const arco = (cx, cy, rx, ry, a0, a1, n = 16) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
};

const PI = Math.PI;
/** Ancho de casi todas las letras, en unidades de alto. Condensado a propósito. */
const AN = 0.62;

/** Cada letra: una lista de polilíneas en la caja [0..AN] × [0..1]. */
const LETRAS = {
  M: [[[0, 1], [0, 0], [AN / 2, 0.52], [AN, 0], [AN, 1]]],
  E: [[[0, 0], [0, 1]], [[0, 0], [0.56, 0]], [[0, 0.5], [0.46, 0.5]], [[0, 1], [0.56, 1]]],
  N: [[[0, 1], [0, 0], [AN, 1], [AN, 0]]],
  J: [[[0.56, 0], [0.56, 0.70], ...arco(0.28, 0.70, 0.28, 0.30, 0, PI)]],
  A: [[[0, 1], [AN / 2, 0], [AN, 1]], [[0.12, 0.68], [0.50, 0.68]]],
  R: [[[0, 1], [0, 0], [0.34, 0], ...arco(0.34, 0.26, 0.24, 0.26, -PI / 2, PI / 2), [0, 0.52]],
      [[0.28, 0.52], [AN, 1]]],
  B: [[[0, 1], [0, 0], [0.32, 0], ...arco(0.32, 0.25, 0.22, 0.25, -PI / 2, PI / 2), [0, 0.50]],
      [[0, 0.50], [0.34, 0.50], ...arco(0.34, 0.75, 0.24, 0.25, -PI / 2, PI / 2), [0, 1]]],
  U: [[[0, 0], [0, 0.70], ...arco(AN / 2, 0.70, AN / 2, 0.30, PI, 0)], [[AN, 0.70], [AN, 0]]],
  C: [arco(AN / 2, 0.5, AN / 2, 0.5, 0.35 * PI, 1.65 * PI, 20)],
  O: [arco(AN / 2, 0.5, AN / 2, 0.5, 0, 2 * PI, 26)],
  P: [[[0, 1], [0, 0], [0.34, 0], ...arco(0.34, 0.26, 0.24, 0.26, -PI / 2, PI / 2), [0, 0.52]]],
  T: [[[0, 0], [AN, 0]], [[AN / 2, 0], [AN / 2, 1]]],
  I: [[[AN / 2, 0], [AN / 2, 1]]],
  // El punto medio: un segmento degenerado. La pluma redonda lo convierte en un punto.
  "·": [[[0.15, 0.55], [0.15, 0.55]]],
  " ": [],
};

/** Lo que avanza el cursor después de cada letra, en unidades de alto. */
const AVANCE = { "·": 0.30, " ": 0.30 };
const avanceDe = (ch) => AVANCE[ch] ?? AN;

/** La distancia de un punto a un segmento. Con el segmento degenerado, la distancia al punto. */
function distanciaASegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** El ancho que ocuparía una frase, en píxeles. Para comprobar que cabe ANTES de pintarla. */
function anchoDeTexto(cadena, alto, separacion) {
  let ancho = 0;
  for (const ch of cadena.toUpperCase()) ancho += avanceDe(ch) * alto + separacion;
  return ancho - separacion;
}

/**
 * Escribe una frase. Solo se recorre la caja de cada letra, no el lienzo entero: a ×3 son unos
 * miles de píxeles en vez de medio millón.
 */
function escribirTexto(img, { cadena, x, y, alto, separacion, color, alfa, grosor }) {
  let cursor = x;
  for (const ch of cadena.toUpperCase()) {
    const trazos = LETRAS[ch];
    if (trazos === undefined) throw new Error(`el alfabeto del lema no tiene «${ch}»`);
    if (trazos.length) {
      const x0 = Math.floor(cursor - grosor), x1 = Math.ceil(cursor + AN * alto + grosor);
      const y0 = Math.floor(y - grosor), y1 = Math.ceil(y + alto + grosor);
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          let d = Infinity;
          for (const linea of trazos) {
            for (let i = 0; i < Math.max(1, linea.length - 1); i++) {
              const a = linea[i], b = linea[i + 1] || linea[i];
              d = Math.min(d, distanciaASegmento(
                px + 0.5, py + 0.5,
                cursor + a[0] * alto, y + a[1] * alto,
                cursor + b[0] * alto, y + b[1] * alto));
            }
          }
          // El borde se suaviza en un píxel: sin esto, a ×1 el texto sale dentado.
          const cobertura = Math.min(1, Math.max(0, grosor / 2 + 0.5 - d));
          tocar(img, px, py, color, cobertura * alfa);
        }
      }
    }
    cursor += avanceDe(ch) * alto + separacion;
  }
}

/**
 * LA MARCA DE AGUA: la firma de la casa, ampliada y cortada por el borde derecho.
 *
 * Se lee del `logo@3x.png` que ya está generado —viene recortado a su tinta— y se usa SU CANAL
 * ALFA como plantilla: la firma es tinta oscura sobre transparente, así que el alfa es exactamente
 * el trazo. Encima se pinta marfil, no la tinta original.
 *
 * A este tamaño solo cabe el principio de la firma. Eso es lo que se busca: una forma grande
 * cortada por el encuadre se lee como textura; la palabra entera y pequeña, como un sello pegado.
 */
function marcaDeAgua(img, logo) {
  const alto = img.h * AGUA_ALTO;
  const ancho = alto * (logo.w / logo.h);
  const x0 = Math.round(img.w * AGUA_IZQUIERDA);
  const y0 = Math.round((img.h - alto) / 2);

  // MUESTREO BILINEAL, y no por vecino más cercano. Aquí la firma se amplía muchas veces, así que
  // el vecino más cercano deja la escalera de píxeles del original a la vista — y un borde
  // dentado se nota incluso al 7 %, que es justo lo que delata que esto es una imagen escalada.
  const alfaEn = (fx, fy) => {
    const x = Math.min(logo.w - 1, Math.max(0, fx)), y = Math.min(logo.h - 1, Math.max(0, fy));
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(logo.w - 1, x0 + 1), y1 = Math.min(logo.h - 1, y0 + 1);
    const tx = x - x0, ty = y - y0;
    const a = (cx, cy) => logo.px[(cy * logo.w + cx) * 4 + 3] / 255;
    return (a(x0, y0) * (1 - tx) + a(x1, y0) * tx) * (1 - ty)
         + (a(x0, y1) * (1 - tx) + a(x1, y1) * tx) * ty;
  };

  for (let y = 0; y < img.h; y++) {
    for (let x = x0; x < img.w; x++) {
      const sx = ((x - x0) / ancho) * logo.w;
      const sy = ((y - y0) / alto) * logo.h;
      if (sx < 0 || sy < 0 || sx >= logo.w || sy >= logo.h) continue;
      const alfa = alfaEn(sx, sy);
      if (alfa > 0) tocar(img, x, y, MARFIL, alfa * AGUA_ALFA);
    }
  }
}

function pintarBanda(w, h, logo) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = TERRACOTA[0]; px[i * 4 + 1] = TERRACOTA[1];
    px[i * 4 + 2] = TERRACOTA[2]; px[i * 4 + 3] = 255;
  }
  const img = { w, h, px };

  if (MARCA_AGUA && logo) marcaDeAgua(img, logo);

  if (LEMA) {
    const alto = h * LEMA_ALTO;
    const separacion = alto * 0.42;     // versalitas espaciadas: es lo que las hace de marca
    const ancho = anchoDeTexto(LEMA, alto, separacion);
    // EL NOMBRE MANDA. Si la frase se pasara del ancho reservado, no se recorta a medias: no se
    // pinta. Media frase en la banda de la tarjeta de alguien es peor que ninguna.
    if (ancho <= w * LEMA_ANCHO_MAX) {
      escribirTexto(img, {
        cadena: LEMA, x: Math.round(w * 0.055), y: Math.round(h * LEMA_ARRIBA),
        alto, separacion, color: MARFIL, alfa: LEMA_ALFA,
        grosor: Math.max(1, alto * 0.115),
      });
    } else {
      console.warn(`  ⚠ el lema ocupa ${Math.round(100 * ancho / w)} % del ancho: no se pinta`);
    }
  }
  return img;
}

// ── Las tres densidades ──────────────────────────────────────────────────────────────────────
//
// Cada una se PINTA a su tamaño, no se escala desde la pequeña: el lema tiene un punto de grosor
// y escalarlo lo convierte en una mancha.
const BASE = { w: 375, h: 144 };
const salidas = [["strip.png", 1], ["strip@2x.png", 2], ["strip@3x.png", 3]];

const logo = MARCA_AGUA
  ? leerPng(fs.readFileSync(path.join(SALIDA, "logo@3x.png")))
  : null;

console.log(`banda ${BASE.w}×${BASE.h} pt · terracota #8F4430`
  + ` · lema ${LEMA ? "sí" : "no"} · marca de agua ${MARCA_AGUA ? "sí" : "no"}`);
for (const [nombre, k] of salidas) {
  const img = pintarBanda(BASE.w * k, BASE.h * k, logo);
  const png = escribirPng(img);
  fs.writeFileSync(path.join(SALIDA, nombre), png);
  console.log(`  ${nombre.padEnd(14)} ${img.w}×${img.h}  ${String(png.length).padStart(6)} bytes`);
}
