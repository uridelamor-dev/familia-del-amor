// Vales impresos: cupones ANÓNIMOS con QR para repartir en mano. Lógica PURA.
//
// Un vale es un cupón sin teléfono. El esquema ya lo tenía previsto —el índice del límite por
// cliente deja fuera los canjes sin teléfono a propósito, «un cupón impreso en un flyer, que no
// es de nadie» (schema.js)—, así que aquí no se inventa nada: solo se decide QUÉ se emite, CÓMO
// se llaman los ficheros y QUÉ va en el CSV que recibe la imprenta.
//
// Lo que NO se hace aquí: el diseño del vale. Se entregan los QR y una tabla, y el papel lo monta
// quien imprime con su plantilla de dato variable.

import { normalizarClave } from "../captacion/campana.js";

/**
 * Techo de una tirada.
 *
 * No es un número redondo por gusto: `GET /api/promos/qr` lista con `LIMIT 300`, así que una
 * tirada que pasara de ahí no se podría ni mirar entera desde el panel. Y para más de doscientos
 * vales el sitio no es un ZIP en el navegador, es hablar con la imprenta.
 */
export const MAX_POR_TIRADA = 200;

/**
 * UN USO. NUNCA CERO.
 *
 * `usos_max = 0` significa ILIMITADO en `estadoDe()` (`if (max > 0 && …)`) y en `SQL_CANJEAR`
 * (`usos_max = 0 OR usos < usos_max`). Un vale impreso emitido con 0 sería infinitamente
 * canjeable: cien desayunos gratis con un solo papel, y el fallo no daría ningún error — se
 * descubriría contando la caja. Por eso la constante está aquí y hay un test que la vigila.
 */
export const USOS_POR_VALE = 1;

/** Opciones del QR de un vale, distintas de las de pantalla y con motivo. */
export const QR_OPCIONES = {
  // Nivel Q: recupera un 25 %. Un vale vive doblado en un bolsillo, se mancha y se arruga; el
  // nivel por defecto (M) está pensado para una pantalla limpia.
  errorCorrectionLevel: "Q",
  // Margen justo: la «zona tranquila» que exige la norma son 4 módulos, pero el diseño del vale
  // ya deja blanco alrededor. Con 2 el QR ocupa más dentro del mismo cuadrado, que es lo que se
  // necesita cuando el papel es pequeño.
  margin: 2,
};

/** Lado del PNG, para quien no maqueta con vectores. Sobra para imprimir a 3 cm. */
export const PNG_LADO = 1024;

const texto = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saneado del formulario de tirada. Mismo contrato que `sanearPromocion`: devuelve también lo
 * que se ha caído, porque aquí un campo que desaparece en silencio son papeles ya impresos.
 */
export function sanearTirada(crudo = {}, { promociones = [] } = {}) {
  const descartados = [];
  const t = {};

  // El nombre es de puertas adentro («Buzoneo Girona») y su versión en minúsculas con guiones es
  // lo que agrupa la tirada. Se reutiliza el normalizador de las campañas: es el mismo problema.
  t.nombre = texto(crudo.nombre, 60);
  t.clave = normalizarClave(t.nombre || crudo.clave);
  if (!t.nombre) descartados.push({ campo: "nombre", motivo: "Ponle un nombre a la tirada" });
  else if (t.clave.length < 3) descartados.push({ campo: "nombre", valor: crudo.nombre, motivo: "Necesita al menos tres letras o números" });

  const pid = Number(crudo.promocion_id);
  const promo = (promociones || []).find((p) => Number(p.id) === pid);
  if (!promo) {
    t.promocion_id = null;
    descartados.push({ campo: "promocion_id", valor: crudo.promocion_id, motivo: "Elige una promoción que exista" });
  } else {
    t.promocion_id = promo.id;
  }

  const n = Number(crudo.cantidad);
  if (Number.isInteger(n) && n >= 1 && n <= MAX_POR_TIRADA) {
    t.cantidad = n;
  } else {
    t.cantidad = 0;
    descartados.push({ campo: "cantidad", valor: crudo.cantidad, motivo: `Entre 1 y ${MAX_POR_TIRADA}` });
  }

  const c = texto(crudo.caduca_en, 10);
  if (!c) t.caduca_en = null;
  else if (FECHA.test(c)) t.caduca_en = c;
  else { t.caduca_en = null; descartados.push({ campo: "caduca_en", valor: c, motivo: "La fecha debe ser aaaa-mm-dd" }); }

  return { tirada: t, descartados };
}

/** «001», «042», «137». Ancho fijo para que ordenen bien en cualquier carpeta. */
export const numeroVale = (i) => String(i).padStart(3, "0");

/**
 * Cómo se llama el fichero de un vale.
 *
 * Lleva el CÓDIGO dentro del nombre a propósito: cuando en la imprenta se descuadra una fila, lo
 * único que permite volver a casar el papel con su QR es que el nombre del fichero y la columna
 * del CSV digan lo mismo.
 */
export function nombreVale(i, codigo, ext = "svg") {
  return `vale-${numeroVale(i)}-${String(codigo || "").replace(/\D/g, "")}.${ext}`;
}

/** El nombre del ZIP de una tirada. */
export const nombreZip = (clave) => `vales-${normalizarClave(clave) || "tirada"}.zip`;

// ── El CSV ───────────────────────────────────────────────────────────────────
// Punto y coma, BOM y CRLF, como el CSV de facturas: es lo que Excel en español abre a la
// primera. Con coma, cualquier texto con decimales parte la fila.
const celda = (v) => {
  const s = String(v ?? "");
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_CABECERA = ["Nº", "Codigo", "Enlace", "Fichero", "Promocion", "Caduca"];

/**
 * La tabla que enlaza la imprenta con los QR.
 *
 * `Fichero` es la columna que importa: es la que se conecta con el SVG del ZIP en un montaje de
 * dato variable. `Codigo` va porque el vale tiene que llevar impresos los ocho dígitos además
 * del QR — es lo que teclea el camarero cuando la cámara no lee el papel arrugado.
 */
export function csvDeVales(vales = [], { promocion = "", caducaEn = "" } = {}) {
  const filas = vales.map((v, i) => [
    numeroVale(i + 1), v.codigo, v.url, nombreVale(i + 1, v.codigo), promocion, caducaEn || "",
  ].map(celda).join(";"));
  return "﻿" + [CSV_CABECERA.join(";"), ...filas].join("\r\n") + "\r\n";
}

/**
 * El LÉEME que va dentro del ZIP.
 *
 * Existe por un fallo concreto y caro: se maqueta el QR a 1,5 cm, no lo lee ninguna cámara, y se
 * descubre con quinientos papeles ya impresos. Escrito para quien abre el ZIP, que no somos
 * nosotros.
 */
export const LADO_MINIMO_CM = 3;

export function leeme({ promocion = "", tirada = "", cantidad = 0, caducaEn = "" } = {}) {
  return [
    `VALES · ${promocion}`,
    `Tirada: ${tirada} · ${cantidad} vales${caducaEn ? ` · caducan el ${caducaEn}` : ""}`,
    "",
    "QUÉ HAY AQUÍ",
    `  vales.csv    una fila por vale: número, código de 8 dígitos y su fichero`,
    `  vale-XXX.svg el QR de cada vale, en vectorial`,
    "",
    "CÓMO SE MONTA",
    "  Cada vale es DISTINTO: su QR y su código de ocho dígitos no se repiten.",
    "  En el montaje de dato variable, la columna «Fichero» del CSV dice qué SVG",
    "  va en cada papel, y la columna «Codigo» qué número imprimir debajo.",
    "",
    "DOS COSAS QUE NO SE PUEDEN CAMBIAR",
    "  1. EL QR NO BAJA DE 3 cm DE LADO. Son 41 cuadraditos por lado: a 3 cm,",
    "     cada uno mide 0,7 mm, que es lo mínimo que lee bien la cámara de una",
    "     tablet. A 2 cm bajan a 0,5 mm y deja de leerse — y eso se descubre",
    "     con los vales ya impresos.",
    "  2. Alrededor del QR tiene que quedar un margen blanco de al menos el",
    "     ancho de tres cuadraditos. Ni recuadros, ni texto pegado, ni fondos",
    "     de color debajo.",
    "",
    "  El código de ocho dígitos va impreso junto al QR, legible. Es lo que se",
    "  teclea cuando el papel viene arrugado y la cámara no puede con él.",
    "",
  ].join("\n");
}
