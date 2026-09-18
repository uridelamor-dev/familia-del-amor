// LA BANDA DEL PASE (`strip.png`). Node puro: `zlib` y nada más.
//
// ── QUÉ ES Y DÓNDE SALE ──────────────────────────────────────────────────────────────────────
//
// En un `storeCard`, la banda se pinta DETRÁS del campo principal —el nombre del titular— y ocupa
// el ancho entero. Es LA ÚNICA superficie libre del pase: todo lo demás lo compone iOS.
//
//   375 × 123 pt   ×1     750 × 246   ×2     1125 × 369   ×3
//
// ── POR QUÉ EL VERDE VA ABAJO Y NO DETRÁS DEL NOMBRE ─────────────────────────────────────────
//
// Porque `foregroundColor` es UNO para todo el pase. El nombre se pinta sobre la banda, pero el
// número de socio y los puntos se pintan sobre el fondo crema, justo debajo. Si la banda fuera
// verde entera habría que poner el texto claro para que el nombre se leyera — y entonces el
// número de socio y los puntos quedarían en crema sobre crema, invisibles.
//
// Así que la banda es CREMA donde cae el texto y VERDE OSCURO en el borde de abajo. El verde sigue
// siendo el elemento que manda visualmente —cruza el pase de lado a lado, justo bajo el nombre— y
// no hay ni un punto del pase donde el texto no se lea.
//
// La hoja va en el verde, en dorado suave y a media opacidad: es un detalle, no un dibujo. A 375
// puntos de ancho, cualquier cosa más grande compite con el nombre.

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

/** Qué parte de la altura ocupa el verde. Un quinto: se ve de lejos y no se come el nombre. */
const PROPORCION_VERDE = 0.22;

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
 * Una hoja: un tallo y varias hojitas a los lados. Se dibuja con matemáticas y no con una imagen
 * porque tiene que salir nítida en las tres densidades, y escalar un dibujo pequeño lo ensucia.
 *
 * Devuelve la opacidad (0–1) de la hoja en ese punto, con el borde suavizado.
 */
function hoja(x, y, { cx, cy, alto, ancho }) {
  // Coordenadas relativas al tallo, con el tallo en vertical y las hojitas a los lados.
  const dy = (y - cy) / alto;            // −1 (punta) … +1 (base)
  if (dy < -1 || dy > 1) return 0;
  const dx = (x - cx) / ancho;

  // EL TALLO. Una curva suave, no una recta: una recta parece un palo clavado.
  const tallo = dy * dy * 0.22;
  const distTallo = Math.abs(dx - tallo);
  let a = distTallo < 0.06 ? 1 - distTallo / 0.06 : 0;

  // LAS HOJITAS. CUATRO, alternando lado. Con seis se solapaban y quedaba un borrón: a 11 puntos
  // de alto en pantalla, menos hojas y más separadas se leen mejor que más hojas apretadas.
  for (let i = 0; i < 4; i++) {
    const t = -0.62 + i * 0.44;                  // dónde nace, a lo largo del tallo
    const lado = i % 2 === 0 ? 1 : -1;
    const tam = 0.42 * (1 - Math.abs(t) * 0.22); // se encogen hacia los extremos
    const ox = tallo + lado * tam * 0.55;
    const oy = t - 0.10;
    const ux = (dx - ox) / (tam * 1.05);
    const uy = (dy - oy) / (tam * 0.30);         // muy plana: una hoja, no un círculo
    // Girada ~35° hacia la punta del tallo.
    const cos = 0.82, sen = 0.57 * lado;
    const gx = ux * cos - uy * sen;
    const gy = ux * sen + uy * cos;
    const d = gx * gx + gy * gy;
    if (d < 1) a = Math.max(a, Math.min(1, (1 - d) * 2.6));
  }
  return Math.min(1, a);
}

function pintarBanda(w, h) {
  const px = Buffer.alloc(w * h * 4);
  const altoVerde = Math.round(h * PROPORCION_VERDE);
  const y0Verde = h - altoVerde;
  const k = w / 375;   // la densidad: todo lo fino se mide con ella, o a ×3 desaparece

  // La hoja, CENTRADA en la banda verde. `alto` es el semieje, así que con 0.40 de la banda la
  // ramita entera cabe dentro y no se corta por abajo — que era lo que pasaba.
  const hojaCfg = { cx: w * 0.075, cy: y0Verde + altoVerde / 2,
                    alto: altoVerde * 0.34, ancho: w * 0.028 };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c;

      if (y >= y0Verde) {
        c = VERDE;
        // La hoja, en dorado y a media opacidad: un detalle, no un dibujo.
        const a = hoja(x, y, hojaCfg);
        if (a > 0) c = mezclar(c, DORADO, a * 0.42);
      } else {
        c = CREMA;
        // Un filo dorado justo encima del verde. Es lo que separa las dos masas sin meter una
        // línea dura. SE MIDE EN PUNTOS, no en píxeles: a ×3, dos píxeles no se ven.
        const grosor = Math.max(1, Math.round(1.5 * k));
        const d = y0Verde - y;
        if (d <= grosor) c = mezclar(c, DORADO, 0.75);
      }

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

console.log(`banda ${BASE.w}×${BASE.h} · verde ${Math.round(PROPORCION_VERDE * 100)} % de la altura`);
for (const [nombre, k] of salidas) {
  const img = pintarBanda(BASE.w * k, BASE.h * k);
  const png = escribirPng(img);
  fs.writeFileSync(path.join(SALIDA, nombre), png);
  console.log(`  ${nombre.padEnd(14)} ${img.w}×${img.h}  ${String(png.length).padStart(6)} bytes`);
}
