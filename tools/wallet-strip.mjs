// LA BANDA DEL PASE (`strip.png`). Node puro: `zlib` y nada más.
//
// ── QUÉ ES Y DÓNDE SALE ──────────────────────────────────────────────────────────────────────
//
// En un `storeCard`, la banda se pinta DETRÁS del campo principal —el nombre del titular— y ocupa
// el ancho entero. Es LA ÚNICA superficie libre del pase: todo lo demás lo compone iOS.
//
//   375 × 123 pt   ×1     750 × 246   ×2     1125 × 369   ×3
//
// ── POR QUÉ LA BANDA ES VERDE ENTERA ─────────────────────────────────────────────────────────
//
// Porque iOS PINTA EN BLANCO el texto que cae sobre la banda, y no hay forma de evitarlo:
// `foregroundColor` se respeta en todo el pase MENOS ahí. Se comprobó en un iPhone de verdad —el
// número de socio salía oscuro y correcto sobre el crema, y el nombre salía blanco sobre la misma
// tinta declarada—.
//
// La primera versión de esta banda era crema arriba y verde solo en el borde de abajo, para que el
// texto oscuro se leyera sobre el crema. Salió blanco sobre crema: ilegible.
//
// Con el verde entero, el blanco que impone iOS pasa de ser un problema a ser el diseño: nombre
// grande y claro sobre un bloque verde, que es exactamente lo que se buscaba.
//
// ── LA RAMITA, A LA DERECHA Y CON MARGEN ─────────────────────────────────────────────────────
//
// En la captura del iPhone salía CORTADA por el borde izquierdo: estaba al 7,5 % del ancho y iOS
// ajusta la banda al ancho del dispositivo recortando por los lados. Ahora va centrada al 80 % y
// ocupa del 72 % al 88 %, con sitio de sobra por los dos lados, y lejos de donde empieza el
// nombre —que entra por la izquierda—.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(AQUI, "..", "public", "assets", "wallet");

// ── La paleta, la misma de la casa ───────────────────────────────────────────────────────────
const CREMA = [244, 242, 237];
const VERDE = [30, 64, 52];     // más oscuro que el de los rótulos: es una masa, no una letra
const DORADO = [201, 184, 150];

/** El filo dorado de abajo, en puntos. Separa la banda del crema sin meter una línea dura. */
const FILO_PT = 1.5;

// ── PNG a mano, igual que en `wallet-imagenes.mjs` ───────────────────────────────────────────
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

// ── Pintar ───────────────────────────────────────────────────────────────────────────────────

const mezclar = (fondo, tinta, a) => [
  Math.round(fondo[0] * (1 - a) + tinta[0] * a),
  Math.round(fondo[1] * (1 - a) + tinta[1] * a),
  Math.round(fondo[2] * (1 - a) + tinta[2] * a),
];

/**
 * Una ramita: un tallo curvo y cuatro hojas alternas.
 *
 * ── SE TRABAJA EN PÍXELES, NO EN COORDENADAS NORMALIZADAS ────────────────────────────────────
 *
 * La primera versión normalizaba `x` por el ancho y `y` por el alto, y esos dos ejes tienen
 * escalas MUY distintas —el alto es casi tres veces el ancho—. Girar una elipse en ese espacio no
 * la gira en pantalla: la deforma. Las hojas salían como óvalos horizontales por mucho ángulo que
 * se les pusiera.
 *
 * Aquí todo se mide en píxeles y el giro es un giro de verdad.
 *
 * Devuelve la opacidad (0–1) en ese punto, con el borde suavizado.
 */
function hoja(x, y, { cx, cy, alto, ancho }) {
  const dy = (y - cy) / alto;            // −1 (punta) … +1 (base)
  if (dy < -1.05 || dy > 1.05) return 0;

  // EL TALLO. Una curva suave, no una recta: una recta parece un palo clavado.
  const curva = dy * dy * 0.22;
  const xTallo = cx + curva * ancho;
  const grosor = Math.max(1, ancho * 0.055);
  let a = Math.abs(x - xTallo) < grosor ? 1 - Math.abs(x - xTallo) / grosor : 0;

  // LAS HOJAS. Cuatro, alternando lado. Cada una es una elipse alargada GIRADA 40° hacia la
  // punta del tallo — el gesto que hace que parezca una hoja y no un guisante.
  const largo = ancho * 0.95;            // semieje mayor, en píxeles
  const ancho2 = ancho * 0.30;           // semieje menor
  for (let i = 0; i < 4; i++) {
    const t = -0.58 + i * 0.42;          // dónde nace, a lo largo del tallo
    const lado = i % 2 === 0 ? 1 : -1;
    const escala = 1 - Math.abs(t) * 0.25;
    const ox = cx + (t * t * 0.22) * ancho + lado * largo * escala * 0.62;
    const oy = cy + t * alto;

    // Giro en PÍXELES: 40°, hacia arriba y hacia fuera.
    const ang = lado * -0.70;
    const px0 = x - ox, py0 = y - oy;
    const rx = px0 * Math.cos(ang) - py0 * Math.sin(ang);
    const ry = px0 * Math.sin(ang) + py0 * Math.cos(ang);

    const u = rx / (largo * escala), v = ry / (ancho2 * escala);
    const d = u * u + v * v;
    if (d < 1) a = Math.max(a, Math.min(1, (1 - d) * 3.2));
  }
  return Math.min(1, a);
}

function pintarBanda(w, h) {
  const px = Buffer.alloc(w * h * 4);
  const k = w / 375;                 // la densidad: lo fino se mide con ella, o a ×3 desaparece
  const filo = Math.max(1, Math.round(FILO_PT * k));

  // LA RAMITA. Al 80 % del ancho y bien dentro: en el iPhone, la del 7,5 % salía cortada.
  const hojaCfg = { cx: w * 0.80, cy: h * 0.50, alto: h * 0.30, ancho: w * 0.030 };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = VERDE;

      // La ramita, en dorado y a media opacidad: un detalle, no un dibujo. Compite con un nombre
      // en cuerpo grande, así que cuanto más callada, mejor.
      const a = hoja(x, y, hojaCfg);
      if (a > 0) c = mezclar(c, DORADO, a * 0.30);

      // El filo dorado, en el borde de ABAJO: es lo que separa el verde del crema del pase.
      if (y >= h - filo) c = mezclar(VERDE, DORADO, 0.65);

      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return { w, h, px };
}

// ── Las tres densidades ──────────────────────────────────────────────────────────────────────
//
// Cada una se PINTA a su tamaño, no se escala desde la pequeña: el filo dorado tiene dos píxeles
// y escalarlo lo convierte en una mancha.
const BASE = { w: 375, h: 123 };
const salidas = [
  ["strip.png", 1],
  ["strip@2x.png", 2],
  ["strip@3x.png", 3],
];

console.log(`banda ${BASE.w}×${BASE.h} · verde entero · ramita al 80 % del ancho`);
for (const [nombre, k] of salidas) {
  const img = pintarBanda(BASE.w * k, BASE.h * k);
  const png = escribirPng(img);
  fs.writeFileSync(path.join(SALIDA, nombre), png);
  console.log(`  ${nombre.padEnd(14)} ${img.w}×${img.h}  ${String(png.length).padStart(6)} bytes`);
}
