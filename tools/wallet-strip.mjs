// LA BANDA DEL PASE (`strip.png`). Node puro: `zlib` y nada más.
//
// ── QUÉ ES Y DÓNDE SALE ──────────────────────────────────────────────────────────────────────
//
// En un `storeCard`, la banda se pinta DETRÁS del campo principal —el nombre del titular— y ocupa
// el ancho entero. Es LA ÚNICA superficie libre del pase: todo lo demás lo compone iOS.
//
// ── LA MEDIDA, QUE ESTABA MAL ────────────────────────────────────────────────────────────────
//
// La ranura de un `storeCard` es 375 × 144 pt. El equivalente antiguo, para los dispositivos de
// 320 pt de ancho, era 320 × 123. Las dos proporciones son la misma:
//
//     375 / 144 = 2,604        320 / 123 = 2,602
//
// Esta banda se dibujaba a 375 × 123 — el ANCHO del moderno con el ALTO del antiguo—, que es
// 3,049 : 1 y no es ninguna de las dos. iOS la escalaba para llenar la ranura, así que salía
// ESTIRADA UN 17 % A LO ALTO: por eso la ramita parecía un óvalo por mucho que se corrigiera su
// giro, y por eso el filo dorado salía más grueso de lo dibujado.
//
// Se comprobó midiendo una captura real de iPhone: la banda medía 2,63 : 1, que corresponde a un
// alto de ~143 pt. No a 123.
//
//   375 × 144   ×1        750 × 288   ×2        1125 × 432   ×3
//
// ── POR QUÉ LA BANDA ES VERDE ENTERA ─────────────────────────────────────────────────────────
//
// Porque iOS PINTA EN BLANCO el texto que cae sobre la banda, y no hay forma de evitarlo:
// `foregroundColor` se respeta en todo el pase MENOS ahí. Se comprobó en un iPhone de verdad —el
// número de socio salía oscuro y correcto sobre el crema, y el nombre salía blanco sobre la misma
// tinta declarada—.
//
// Con el verde entero, el blanco que impone iOS pasa de ser un problema a ser el diseño: nombre
// grande y claro sobre un bloque verde.
//
// ── Y POR QUÉ NO ES UN BLOQUE DE COLOR ───────────────────────────────────────────────────────
//
// Su ALTO lo fija Apple y no se puede reducir, así que la banda va a ocupar ese sitio pase lo que
// pase. Lo único que se puede decidir es si pesa como una losa o como una composición. Tres cosas,
// y ninguna se ve por separado:
//
//   · PROFUNDIDAD. El verde no es plano: se hunde hacia la esquina inferior derecha. Es un cambio
//     de una decena de niveles, por debajo del umbral de «esto es un degradado», pero hace que la
//     masa tenga un volumen en vez de ser un recorte.
//   · DOS FILOS DORADOS, arriba y abajo. La ENMARCAN en vez de cerrarla por un lado. Un punto de
//     grosor y media opacidad: a un palmo de distancia casi no se ven, y sin ellos la banda parece
//     pegada encima del crema.
//   · LA RAMITA, GRANDE Y CORTADA. Sale por el borde derecho y se sale también por arriba y por
//     abajo. Una ramita pequeña y entera flotando en una esquina es un icono; una cortada con
//     intención es un fondo. Va en dorado al 25 % — es una marca de agua, no un dibujo, y tiene
//     que perder contra el nombre del cliente, que es el protagonista.
//
// La mitad izquierda se deja LIMPIA a propósito: ahí cae el nombre, en cuerpo grande.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(AQUI, "..", "public", "assets", "wallet");

// ── La paleta, la misma de la casa ───────────────────────────────────────────────────────────
const VERDE = [30, 64, 52];        // más oscuro que el de los rótulos: es una masa, no una letra
const VERDE_HONDO = [21, 50, 40];  // el mismo verde, con sombra. NO es un segundo color de marca
const DORADO = [201, 184, 150];

/** Los filos dorados, en puntos. Uno arriba y otro abajo: enmarcan, no separan. */
const FILO_ARRIBA_PT = 1.0;
const FILO_ABAJO_PT = 1.5;
const FILO_ARRIBA_ALFA = 0.30;
const FILO_ABAJO_ALFA = 0.52;

/** La ramita: cuánto pesa. Es una marca de agua y tiene que perder contra el nombre. */
const RAMA_ALFA = 0.25;
const HOJAS = 6;

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
 * LA RAMITA. Devuelve la opacidad (0–1) en ese punto, con el borde suavizado.
 *
 * ── SE TRABAJA EN PÍXELES, NO EN COORDENADAS NORMALIZADAS ────────────────────────────────────
 *
 * Una versión anterior normalizaba `x` por el ancho y `y` por el alto, y esos dos ejes tienen
 * escalas MUY distintas. Girar una elipse en ese espacio no la gira en pantalla: la deforma. Aquí
 * todo se mide en píxeles y el giro es un giro de verdad.
 *
 * ── LA HOJA TIENE PUNTA ──────────────────────────────────────────────────────────────────────
 *
 * Antes era una elipse, y una elipse no parece una hoja: parece un guisante. La anchura se cierra
 * a CERO en los dos extremos —`(1 - t²)^0,95`—, que es lo que le da las dos puntas.
 *
 * EL EXPONENTE ES LO QUE DECIDE SI PARECE UNA HOJA. Con 0,5 sale EXACTAMENTE una elipse; con 0,62
 * —el primer intento— sale casi una elipse, y a tamaño pequeño se lee como un guisante inclinado.
 * Cerca de 1 la curva es parabólica y las dos puntas aparecen de verdad.
 *
 * ── Y SE SALE DEL LIENZO A PROPÓSITO ─────────────────────────────────────────────────────────
 *
 * El tallo abarca más que el alto de la banda y las hojas del lado derecho pasan del borde. Lo que
 * se corta no es un descuido: una ramita entera y pequeña metida en una esquina se lee como un
 * icono pegado, y una cortada se lee como un fondo que sigue más allá.
 */
function ramita(x, y, { cx, cy, alto, largo, ancho }) {
  const dy = (y - cy) / alto;
  if (dy < -1.3 || dy > 1.3) return 0;

  // EL TALLO. Una curva suave, no una recta: una recta parece un palo clavado. Y se afina hacia
  // arriba, que es por donde crece.
  const curva = dy * dy * 0.16;
  const xTallo = cx + curva * largo;
  const grosor = Math.max(0.8, largo * 0.055) * (0.45 + 0.55 * Math.min(1, (dy + 1.3) / 1.7));
  const dTallo = Math.abs(x - xTallo);
  let a = dTallo < grosor ? Math.min(1, (1 - dTallo / grosor) * 2.2) : 0;

  // LAS HOJAS, alternando lado y menguando hacia las puntas del tallo.
  for (let i = 0; i < HOJAS; i++) {
    const t = -0.95 + i * (1.9 / (HOJAS - 1));
    const lado = i % 2 === 0 ? 1 : -1;
    const escala = 0.60 + 0.40 * (1 - Math.abs(t) * 0.55);
    const L = largo * escala, W = ancho * escala;

    const ox = cx + (t * t * 0.16) * largo + lado * L * 0.55;
    const oy = cy + t * alto;

    // Giro en PÍXELES: hacia arriba y hacia fuera, que es el gesto que hace que parezca una hoja.
    const ang = lado * -0.62;
    const px0 = x - ox, py0 = y - oy;
    const u = px0 * Math.cos(ang) - py0 * Math.sin(ang);
    const v = px0 * Math.sin(ang) + py0 * Math.cos(ang);

    const tt = u / L;
    if (tt <= -1 || tt >= 1) continue;
    const env = W * Math.pow(1 - tt * tt, 0.95);   // ← las dos puntas
    const d = Math.abs(v);
    if (d < env) a = Math.max(a, Math.min(1, (1 - d / env) * 2.6));
  }
  return Math.min(1, a);
}

/**
 * LA PROFUNDIDAD. 0 arriba a la izquierda, 1 abajo a la derecha.
 *
 * ES DIAGONAL Y NO RADIAL. La primera versión medía la distancia a una esquina, y eso no se lee
 * como volumen: se lee como un foco encendido en la esquina, con su círculo y todo. Una rampa
 * recta en diagonal no tiene borde que delate de dónde viene la luz.
 *
 * El recorrido entero son unos quince niveles de gris. Tiene que estar POR DEBAJO del umbral de
 * «esto es un degradado»: si se nota, sobra.
 */
function hondura(nx, ny) {
  return Math.min(1, Math.max(0, nx * 0.52 + ny * 0.48)) ** 1.15;
}

function pintarBanda(w, h) {
  const px = Buffer.alloc(w * h * 4);
  const k = w / 375;                 // la densidad: lo fino se mide con ella, o a ×3 desaparece
  const filoArriba = Math.max(1, Math.round(FILO_ARRIBA_PT * k));
  const filoAbajo = Math.max(1, Math.round(FILO_ABAJO_PT * k));

  // LA RAMITA, CORTADA POR EL BORDE DERECHO. El tallo va al 92 % y las hojas de la derecha se
  // salen; por la izquierda llega al 81 %, así que los dos tercios donde cae el nombre quedan
  // limpios. Abarca más alto que la banda, así que también se corta arriba y abajo.
  const rama = {
    cx: w * 0.92,
    cy: h * 0.50,
    alto: h * 0.60,
    largo: w * 0.108,
    ancho: w * 0.024,
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      // 1 · El verde, con su volumen.
      let c = mezclar(VERDE, VERDE_HONDO, hondura(x / (w - 1), y / (h - 1)));

      // 2 · La ramita, en dorado y muy callada: compite con un nombre en cuerpo grande.
      const a = ramita(x, y, rama);
      if (a > 0) c = mezclar(c, DORADO, a * RAMA_ALFA);

      // 3 · Los dos filos. El de abajo es el que separa del crema, así que pesa algo más.
      if (y < filoArriba) c = mezclar(c, DORADO, FILO_ARRIBA_ALFA);
      else if (y >= h - filoAbajo) c = mezclar(c, DORADO, FILO_ABAJO_ALFA);

      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return { w, h, px };
}

// ── Las tres densidades ──────────────────────────────────────────────────────────────────────
//
// Cada una se PINTA a su tamaño, no se escala desde la pequeña: los filos tienen uno o dos
// píxeles y escalarlos los convierte en una mancha.
const BASE = { w: 375, h: 144 };
const salidas = [
  ["strip.png", 1],
  ["strip@2x.png", 2],
  ["strip@3x.png", 3],
];

console.log(`banda ${BASE.w}×${BASE.h} pt · verde con hondura · ramita cortada por la derecha`);
for (const [nombre, k] of salidas) {
  const img = pintarBanda(BASE.w * k, BASE.h * k);
  const png = escribirPng(img);
  fs.writeFileSync(path.join(SALIDA, nombre), png);
  console.log(`  ${nombre.padEnd(14)} ${img.w}×${img.h}  ${String(png.length).padStart(6)} bytes`);
}
