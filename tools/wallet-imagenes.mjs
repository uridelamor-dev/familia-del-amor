// Genera las imágenes del pase de la wallet a partir del logo de la marca.
//
// SE EJECUTA A MANO Y UNA SOLA VEZ; los PNG resultantes se commitean. En el servidor no se
// convierte nada: aquí no se pueden añadir dependencias npm para tratar imágenes.
//
//   node tools/wallet-imagenes.mjs
//
// ── POR QUÉ RECORTA, Y POR QUÉ ESO ERA EL PROBLEMA ───────────────────────────────────────────
//
// El logo de la casa es un LOGOTIPO APAISADO —la firma «Familia Del Amor»— dentro de un lienzo
// cuadrado de 1000×1000 con márgenes enormes: la tinta ocupa 776×123, un 9,5 % del cuadro.
//
// La versión anterior escalaba ese cuadrado a 50×50 sin recortarlo, así que en el pase la firma
// quedaba en unos 39×6 píxeles: un garabato ilegible. Ahora se busca el recuadro de la tinta, se
// recorta con un margen mínimo y se escala a lo que Apple admite para el logo (160×50 pt), con
// lo que la firma sale a 160×25 y se lee.
//
// ── POR QUÉ EN NODE Y NO CON `sips` ──────────────────────────────────────────────────────────
//
// `sips` recorta CENTRADO y no acepta un desplazamiento, y el logotipo no está centrado en su
// lienzo. Decodificar y volver a escribir el PNG a mano son unas cien líneas con `zlib`, que ya
// viene con Node — y de paso esto deja de depender de macOS.
import zlib from "zlib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const ORIGEN = path.join(raiz, "..", "public", "assets", "logos",
  "Copia de Logo_proposta_DEL AMOR (1000 x 1000 px) (1920 x 1080 px).png");
const DESTINO = path.join(raiz, "..", "public", "assets", "wallet");

// ── PNG: leer ────────────────────────────────────────────────────────────────────────────────

/** Decodifica un PNG RGBA de 8 bits sin entrelazar. Devuelve { w, h, px } con 4 bytes por píxel. */
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
    throw new Error(`PNG con profundidad ${prof} y tipo ${tipo}: solo se admite RGB/RGBA de 8 bits`);
  }
  const canales = tipo === 6 ? 4 : 3;
  const crudo = zlib.inflateSync(Buffer.concat(trozos));

  // Deshacer los filtros por línea (PNG los aplica para comprimir mejor).
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

// ── PNG: escribir ────────────────────────────────────────────────────────────────────────────

const crc32 = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (b) => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function trozo(nombre, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(nombre, "ascii"), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Escribe un PNG RGBA de 8 bits. Sin filtros: comprime algo peor y no hay nada que equivocar. */
function escribirPng({ w, h, px }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const lineas = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    lineas[y * (w * 4 + 1)] = 0;
    px.copy(lineas, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", zlib.deflateSync(lineas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// ── Recortar y escalar ───────────────────────────────────────────────────────────────────────

/** El recuadro de la tinta: lo que no es transparente ni casi blanco. */
function recuadroDeTinta({ w, h, px }) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const claro = (px[o] + px[o + 1] + px[o + 2]) / 3;
      if (px[o + 3] > 32 && claro < 200) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("el logo no tiene tinta que recortar");
  return { x0, y0, x1, y1 };
}

const recortar = ({ w, px }, { x0, y0, x1, y1 }) => {
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) px.copy(out, y * nw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + nw) * 4);
  return { w: nw, h: nh, px: out };
};

/**
 * Reduce con filtro de caja: cada píxel de salida es la media de los de entrada que le tocan.
 *
 * Con vecino más próximo, una firma de trazo fino se rompe en escalones al reducirla diez veces.
 * La media conserva el trazo, que es justo lo que hay que leer.
 */
function escalar({ w, h, px }, nw, nh) {
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy0 = Math.floor(y * h / nh), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * h / nh));
    for (let x = 0; x < nw; x++) {
      const sx0 = Math.floor(x * w / nw), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * w / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const o = (sy * w + sx) * 4, al = px[o + 3] / 255;
          // Se premultiplica por el alfa: si no, los bordes del trazo se aclaran al promediar.
          r += px[o] * al; g += px[o + 1] * al; b += px[o + 2] * al; a += px[o + 3]; n++;
        }
      }
      const o = (y * nw + x) * 4, am = a / n;
      const k = am > 0 ? 255 / am : 0;
      out[o] = Math.min(255, Math.round(r / n * k));
      out[o + 1] = Math.min(255, Math.round(g / n * k));
      out[o + 2] = Math.min(255, Math.round(b / n * k));
      out[o + 3] = Math.round(am);
    }
  }
  return { w: nw, h: nh, px: out };
}

/** Pone una imagen centrada dentro de un lienzo transparente cuadrado. */
function enCuadrado(img, lado) {
  const out = Buffer.alloc(lado * lado * 4, 0);
  const x0 = Math.floor((lado - img.w) / 2), y0 = Math.floor((lado - img.h) / 2);
  for (let y = 0; y < img.h; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= lado) continue;
    img.px.copy(out, (dy * lado + x0) * 4, y * img.w * 4, (y + 1) * img.w * 4);
  }
  return { w: lado, h: lado, px: out };
}

// ── El trabajo ───────────────────────────────────────────────────────────────────────────────

if (!fs.existsSync(ORIGEN)) {
  console.error("No encuentro el logo de origen:", ORIGEN);
  process.exit(1);
}
fs.mkdirSync(DESTINO, { recursive: true });

const fuente = leerPng(fs.readFileSync(ORIGEN));
const caja = recuadroDeTinta(fuente);
const logo = recortar(fuente, caja);
console.log(`origen ${fuente.w}×${fuente.h} · logotipo recortado ${logo.w}×${logo.h} (${(logo.w / logo.h).toFixed(2)}:1)`);

// EL LOGO. Apple da como mucho 160×50 pt. Con 6,3:1 manda el ancho: 160×25.
const LOGO_ANCHO = 160, LOGO_ALTO_MAX = 50;
let lw = LOGO_ANCHO, lh = Math.round(LOGO_ANCHO * logo.h / logo.w);
if (lh > LOGO_ALTO_MAX) { lh = LOGO_ALTO_MAX; lw = Math.round(LOGO_ALTO_MAX * logo.w / logo.h); }

for (const [nombre, escala] of [["logo.png", 1], ["logo@2x.png", 2], ["logo@3x.png", 3]]) {
  const img = escalar(logo, lw * escala, lh * escala);
  fs.writeFileSync(path.join(DESTINO, nombre), escribirPng(img));
  console.log(`  ${nombre.padEnd(14)} ${img.w}×${img.h}`);
}

// EL ICONO es cuadrado por definición, y un logotipo de 6,3:1 dentro de un cuadrado sale
// pequeño se haga lo que se haga. Al menos se recorta primero, así ocupa todo el ancho en vez
// de perderse entre los márgenes del lienzo original.
for (const [nombre, lado] of [["icon.png", 29], ["icon@2x.png", 58], ["icon@3x.png", 87]]) {
  const dentro = escalar(logo, lado, Math.max(1, Math.round(lado * logo.h / logo.w)));
  fs.writeFileSync(path.join(DESTINO, nombre), escribirPng(enCuadrado(dentro, lado)));
  console.log(`  ${nombre.padEnd(14)} ${lado}×${lado} (logotipo a ${dentro.w}×${dentro.h})`);
}

console.log("\nListo. Los PNG se commitean: en el servidor no se convierte nada.");
