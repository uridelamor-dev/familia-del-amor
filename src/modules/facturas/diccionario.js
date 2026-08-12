// Facturas — el diccionario de productos. Lógica PURA.
//
// EL PROBLEMA, que es el techo de todo lo demás: el mismo producto se llama de tres maneras.
//
//   En la factura   COCA COLA ZERO 33CL LATA CAJA 24U
//   En el inventario Coca-Cola Zero
//   En Ágora         Refresco lata
//
// Hoy agrupamos por la descripción exacta del proveedor, así que «COCA COLA 33CL» y
// «Coca-Cola 33 cl» son dos productos distintos. Es a propósito —dos filas honestas antes que
// una fusión inventada— pero significa que «cuánto compramos de Coca-Cola» no se puede
// contestar, y que dos locales no se pueden comparar.
//
// LA SALIDA, que es la que ya estaba escrita en docs/lineas-de-factura.md: un diccionario que
// se construye SOLO y confirma una PERSONA. La primera vez que aparece una descripción, el
// sistema propone el producto que más se le parece y alguien dice sí o no. A partir de ahí ese
// texto exacto queda resuelto para siempre.
//
// DOS REGLAS QUE NO SE NEGOCIAN:
//
// 1. **Nada se une solo.** Ni con un 95 % de parecido. Unir dos productos que no son el mismo
//    estropea el histórico de los dos a la vez y no se nota: sale una cifra, parece razonable,
//    y ya no hay forma de saber cuál era cuál. Proponer es gratis; decidir, no.
//
// 2. **Se empieza por lo que más dinero mueve.** El trabajo es finito pero no es corto: con
//    cientos de descripciones, ordenar la cola por gasto hace que las primeras veinte
//    confirmaciones cubran la mayor parte del histórico. Ordenar por orden alfabético o por
//    fecha es la forma más segura de que nadie termine.

import { distancia } from "./duplicados.js";

const PALABRAS_RUIDO = new Set([
  "caja", "cajas", "ud", "uds", "unidad", "unidades", "pack", "packs", "bolsa", "bolsas",
  "bote", "botes", "lata", "latas", "botella", "botellas", "paquete", "paquetes", "estuche",
  "bandeja", "granel", "aprox", "s", "de", "la", "el", "con", "sin", "y",
]);

/** Números con su unidad: «33cl», «1,5kg», «5 l». Es lo que distingue formatos del mismo nombre. */
const RE_MEDIDA = /(\d+(?:[.,]\d+)?)\s*(kg|kgs|gr|grs|g|ml|cl|l|lt|ltr|litros?|uds?|u)\b/g;

/**
 * El «esqueleto» de una descripción: lo que queda al quitar formatos, envases y ruido.
 * «COCA COLA ZERO 33CL LATA CAJA 24U» → «coca cola zero». Sirve para PROPONER parecidos, no
 * para unir: dos productos con el mismo esqueleto pueden ser dos formatos distintos, y eso lo
 * decide una persona.
 */
export function esqueleto(descripcion) {
  return String(descripcion || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(RE_MEDIDA, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p && !PALABRAS_RUIDO.has(p) && !/^\d+$/.test(p))
    .join(" ")
    .trim();
}

/**
 * El esqueleto para COMPARAR, con los plurales quitados: «virutas ibericas» y «viruta
 * iberica» son el mismo producto y hoy el proveedor escribe uno u otro según el día.
 *
 * Se quita la «s» final solo en palabras largas: «gas» no es el plural de «ga», y en una
 * lista de embutidos eso importa. Esto NO se usa para el nombre que se enseña —ahí se
 * respeta cómo lo escribe el proveedor—, solo para decidir si dos textos son lo mismo.
 */
function esqueletoComparable(descripcion) {
  return esqueleto(descripcion)
    .split(" ")
    .map((p) => (p.length >= 5 && p.endsWith("s") && !p.endsWith("ss") ? p.replace(/es$|s$/, "") : p))
    .join(" ");
}

/** Las medidas que aparecen en la descripción, normalizadas: «33cl», «1.5kg». */
export function medidas(descripcion) {
  const out = [];
  const texto = String(descripcion || "").toLowerCase().replace(",", ".");
  let m;
  const re = new RegExp(RE_MEDIDA.source, "g");
  while ((m = re.exec(texto))) {
    const u = m[2].replace(/^(lt|ltr|litros?)$/, "l").replace(/^(kgs)$/, "kg").replace(/^(grs|gr)$/, "g").replace(/^(uds?|u)$/, "ud");
    out.push(`${Number(m[1])}${u}`);
  }
  return [...new Set(out)].sort();
}

/**
 * Cuánto se parecen dos descripciones, de 0 a 100. No es una medida de texto a secas: pesa lo
 * que distingue de verdad a un producto de otro.
 *
 *   · El esqueleto igual vale mucho (mismo nombre comercial).
 *   · Las medidas IGUALES suben y las DISTINTAS bajan mucho: «aceite 5l» y «aceite 1l» son dos
 *     productos, y confundirlos estropea el precio por unidad de los dos.
 *   · Las palabras compartidas rellenan el resto.
 */
export function parecido(a, b) {
  const ea = esqueletoComparable(a), eb = esqueletoComparable(b);
  if (!ea || !eb) return 0;
  if (ea === eb) {
    const ma = medidas(a).join(), mb = medidas(b).join();
    if (ma && mb && ma !== mb) return 55;          // mismo nombre, distinto formato
    return 100;
  }
  const pa = new Set(ea.split(" ")), pb = new Set(eb.split(" "));
  const comunes = [...pa].filter((p) => pb.has(p)).length;
  const base = Math.round((comunes / Math.max(pa.size, pb.size)) * 100);
  // Un carácter bailado («viruta»/«virutas») no puede contar como palabra distinta.
  const casi = ea.length > 6 && distancia(ea, eb, 2) <= 2 ? 20 : 0;
  const ma = medidas(a).join(), mb = medidas(b).join();
  const penal = ma && mb && ma !== mb ? 25 : 0;
  return Math.max(0, Math.min(99, base + casi - penal));
}

/** A partir de aquí se propone; por debajo, no se enseña ninguna sugerencia. */
export const MINIMO_PROPUESTA = 45;

/**
 * El producto que más se parece a una descripción suelta, entre los que ya existen.
 * Devuelve null si no hay ninguno decente: mejor «no sé» que una propuesta mala, porque una
 * propuesta mala se acepta a ciegas cuando se llevan veinte seguidas.
 */
export function proponer(descripcion, productos = [], { minimo = MINIMO_PROPUESTA } = {}) {
  let mejor = null;
  for (const p of productos) {
    const score = parecido(descripcion, p.nombre);
    if (score < minimo) continue;
    if (!mejor || score > mejor.score) mejor = { producto: p, score };
  }
  return mejor;
}

/**
 * La cola de trabajo: qué descripciones están sin resolver, con su propuesta, **ordenadas por
 * el dinero que mueven**. Las veinte primeras suelen cubrir la mayor parte del histórico.
 *
 * `pendientes` = [{ clave, descripcion, gasto, veces, proveedores }]
 */
export function colaDeTrabajo(pendientes = [], productos = [], { tope = 50, minimo = MINIMO_PROPUESTA } = {}) {
  return [...pendientes]
    .sort((a, b) => (Number(b.gasto) || 0) - (Number(a.gasto) || 0))
    .slice(0, tope)
    .map((p) => {
      const prop = proponer(p.descripcion, productos, { minimo });
      return {
        ...p,
        sugerido: prop ? { id: prop.producto.id, nombre: prop.producto.nombre, score: prop.score } : null,
        // Un nombre limpio para crear el producto si no existe ninguno parecido: la descripción
        // del proveedor con el formato, pero sin el «CAJA 24U» ni el «GRANEL».
        nombrePropuesto: nombreLimpio(p.descripcion),
      };
    });
}

/** El nombre con el que se crearía el producto: legible, con su formato y sin el embalaje. */
export function nombreLimpio(descripcion) {
  const base = esqueleto(descripcion);
  if (!base) return String(descripcion || "").trim().slice(0, 80);
  const bonito = base.split(" ").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  // De las medidas se coge la que identifica al PRODUCTO, no cuántos vienen en la caja:
  // «COCA COLA 33CL CAJA 24U» es una Coca-Cola de 33 cl, no de 24 unidades.
  const med = medidas(descripcion);
  const propia = med.find((m) => !m.endsWith("ud")) || med[0];
  return (propia ? `${bonito} ${propia}` : bonito).slice(0, 80);
}

/**
 * Cuánto del gasto está ya resuelto. Es el número que dice si esto merece la pena seguir: no
 * «cuántas descripciones faltan» —siempre faltarán— sino cuánto dinero cubre lo confirmado.
 */
export function cobertura(resueltos = [], pendientes = []) {
  const suma = (l) => l.reduce((s, x) => s + (Number(x.gasto) || 0), 0);
  const r = suma(resueltos), p = suma(pendientes);
  const total = r + p;
  return {
    resueltas: resueltos.length, pendientes: pendientes.length,
    gastoResuelto: Math.round(r * 100) / 100, gastoPendiente: Math.round(p * 100) / 100,
    pct: total > 0 ? Math.round((r / total) * 1000) / 10 : 0,
  };
}
