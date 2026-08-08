// Codificación WinAnsi (cp1252), que es la que usan las fuentes base de PDF.
//
// Cubre todo lo que necesitan el castellano y el catalán: á é í ó ú ü ñ ç à è ò ï, las
// mayúsculas acentuadas, ¿ ¡ y el punt volat (·) de "L·LUÍS". No hay que incrustar ninguna
// fuente ni añadir dependencias.
//
// UN CARÁCTER FUERA DE LA TABLA NO SE PIERDE EN SILENCIO: se sustituye por su equivalente
// sin acento si lo tiene, y si no por "?", y se anota. Un nombre que aparece mal en el
// cuadrante es un problema de verdad para quien lo lee.

// Los códigos 0x80-0x9F de cp1252 no coinciden con Unicode: hay que mapearlos a mano.
const ESPECIALES = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A],
  [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
  [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C],
  [0x017E, 0x9E], [0x0178, 0x9F],
]);

// Último recurso antes del "?": mejor "JOSE" que "JOS?".
const SIN_ACENTO = {
  "Ā":"A","ā":"a","Ă":"A","ă":"a","Ą":"A","ą":"a","Ć":"C","ć":"c","Č":"C","č":"c",
  "Đ":"D","đ":"d","Ē":"E","ē":"e","Ė":"E","ė":"e","Ę":"E","ę":"e","Ğ":"G","ğ":"g",
  "Ī":"I","ī":"i","Į":"I","į":"i","Ł":"L","ł":"l","Ń":"N","ń":"n","Ň":"N","ň":"n",
  "Ō":"O","ō":"o","Ő":"O","ő":"o","Ř":"R","ř":"r","Ś":"S","ś":"s","Ş":"S","ş":"s",
  "Ť":"T","ť":"t","Ū":"U","ū":"u","Ů":"U","ů":"u","Ű":"U","ű":"u","Ź":"Z","ź":"z",
  "Ż":"Z","ż":"z","ǅ":"D","ʼ":"'","‑":"-","−":"-","　":" ",
};

// Texto → array de códigos WinAnsi. Devuelve también los caracteres que no cabían.
export function aWinAnsi(texto) {
  const codigos = [];
  const perdidos = [];
  for (const ch of String(texto == null ? "" : texto)) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x20 && cp <= 0x7E) { codigos.push(cp); continue; }          // ASCII imprimible
    if (cp >= 0xA0 && cp <= 0xFF) { codigos.push(cp); continue; }          // Latin-1: acentos, ñ, ç, ·
    if (ESPECIALES.has(cp)) { codigos.push(ESPECIALES.get(cp)); continue; }
    const alt = SIN_ACENTO[ch];
    if (alt) { for (const c of alt) codigos.push(c.codePointAt(0)); perdidos.push(ch); continue; }
    if (cp === 0x09 || cp === 0x0A || cp === 0x0D) { codigos.push(0x20); continue; }  // tabs y saltos → espacio
    codigos.push(0x3F);                                                    // "?"
    perdidos.push(ch);
  }
  return { codigos, perdidos };
}

// Cadena literal de PDF: los bytes van entre paréntesis y hay que escapar ( ) y \.
export function literalPdf(codigos) {
  let out = "";
  for (const c of codigos) {
    if (c === 0x28 || c === 0x29 || c === 0x5C) out += "\\" + String.fromCharCode(c);
    else if (c < 0x20) out += " ";
    else out += String.fromCharCode(c);
  }
  return "(" + out + ")";
}

// Vuelta atrás, para poder leer en los tests lo que se escribió de verdad en el PDF.
export function deWinAnsi(codigos) {
  const inverso = new Map([...ESPECIALES].map(([uni, win]) => [win, uni]));
  let out = "";
  for (const c of codigos) out += String.fromCodePoint(inverso.has(c) ? inverso.get(c) : c);
  return out;
}
