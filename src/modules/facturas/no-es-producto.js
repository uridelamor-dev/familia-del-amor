// Qué líneas de factura NO son un producto. PURO.
//
// EL CASO: en Productos aparecía «La Cooperativa (Blanes)» como si fuera un artículo —371 €,
// comprado 4 veces— cuando es el nombre de uno de los locales, que se coló como línea. Y al
// revisar la cola de unificar salen «TEMPS OPERARI PER REPARACIÓ DE PERSIANA ELÈCTRICA»,
// «Albarán Nº 2602388 de 07/07/2026» o media hoja de la gestoría. Son gastos de verdad, pero
// no son mercancía: no tiene sentido preguntarse cuánto subió su precio ni cuánto se compra.
//
// LO QUE ESTO HACE Y LO QUE NO. Solo SEÑALA, con un motivo escrito. No aparta nada solo: la
// decisión de sacar algo del catálogo es de una persona, y por eso el aviso lleva siempre el
// porqué al lado — un aviso que no se puede juzgar se acaba ignorando entero.
//
// LA REGLA GRANDE ES «ES», NO «CONTIENE», y ahí está todo. En la misma pantalla conviven:
//
//     «La Cooperativa (Blanes)»                              → NO es un producto
//     «24 cartes 14x25 cm 2c pvc 3mm per la cooperativa»      → SÍ lo es (cartas impresas)
//
// Con «contiene» las dos se marcarían y el aviso sería ruido desde el primer día.

import { LOCALES, ALIAS } from "./local-canonico.js";

/** Sin acentos, sin puntuación y en minúsculas. Mismo criterio que `claveProducto`. */
export const norm = (s) => String(s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// Palabras que no aportan nada al comparar un nombre: artículos y preposiciones, en castellano
// y en catalán, más los municipios donde están los locales.
const VACIAS = new Set(["la", "el", "els", "les", "los", "las", "l", "d", "de", "del", "dels",
  "da", "i", "y", "en", "a", "sl", "sa", "slu", "scp", "s l", "s a",
  "blanes", "lloret", "girona", "tordera", "mar"]);

const soloUtiles = (txt) => norm(txt).split(" ").filter((p) => p && !VACIAS.has(p));

/**
 * Los nombres de la casa: establecimientos, sus formas de escribirlos y las sociedades.
 *
 * Se derivan de `local-canonico.js` —que ya tiene todas las variantes vistas en facturas— en
 * vez de escribirlas otra vez. `empresas` son las de `facturas_locales`, que las conoce la
 * base y cambian sin tocar código.
 */
export function nombresDeLaCasa({ empresas = [], extra = [] } = {}) {
  const propios = [
    // Nombres de la casa que no son un establecimiento ni una sociedad registrada. Van a mano
    // y NO se leen de la plantilla: sacarlos de `users.nombre` marcaría «Clara», «Rosa» u
    // «Oliva» —que son productos de verdad— el día que alguien con ese nombre entre a trabajar.
    "familia del amor", "viva la pepa", "la pepa",
    "uriel", "mateu", "pilar", "del amor",
  ];
  const todos = [...LOCALES, ...Object.keys(ALIAS), ...propios, ...empresas, ...extra];
  const fuera = new Set();
  const out = [];
  for (const n of todos) {
    const clave = soloUtiles(n).join(" ");
    // «Blanes» a secas es solo un municipio: como nombre de la casa no distingue nada y
    // marcaría cualquier línea que se llame así. Se cae solo al quitar las palabras vacías.
    if (!clave || fuera.has(clave)) continue;
    fuera.add(clave); out.push({ clave, nombre: String(n) });
  }
  return out;
}

// Cosas que se pagan pero no se compran: mano de obra, gestiones, portes, referencias de
// albarán. Cada patrón es una forma que se ha visto DE VERDAD en las facturas de la casa, no
// una categoría inventada: si no se ha visto, no está.
const NO_ES_MERCANCIA = [
  { re: /\b(temps|hores?) (d )?operari/, motivo: "horas de operario" },
  { re: /\b(mano|hora|horas) de obra\b/, motivo: "mano de obra" },
  { re: /\bma d obra\b/, motivo: "mano de obra" },
  { re: /\bhoras? (de )?(trabajo|treball|tecnico|servicio)\b/, motivo: "horas de trabajo" },
  { re: /^albaran n?o? ?\d/, motivo: "referencia de un albarán, no un artículo" },
  { re: /^(factura|fra|abono) n?o? ?\d/, motivo: "referencia de un documento" },
  { re: /\bseguridad social\b/, motivo: "gestión laboral" },
  { re: /\b(contrato|contratos|nomina|nominas|finiquito|sepe)\b/, motivo: "gestión laboral" },
  { re: /\b(desplazamiento|desplacament|portes|transporte incluido)\b/, motivo: "desplazamiento o portes" },
  { re: /\b(reparacion|reparacio|instalacion|instalacio|montaje|muntatge|manteniment|mantenimiento)\b/, motivo: "trabajo de mantenimiento" },
  { re: /\b(cuota|cuotas|alquiler|lloguer|renting|suscripcion|subscripcio)\b/, motivo: "cuota o alquiler" },
];

/**
 * ¿Esta línea es un producto?
 *
 * Devuelve `null` si lo es —el caso normal— y `{ motivo, detalle }` si no lo parece. Nunca
 * decide nada: lo que devuelve va a una pantalla con dos botones al lado.
 */
export function noEsProducto(descripcion, nombres = nombresDeLaCasa()) {
  const texto = String(descripcion || "").trim();
  if (!texto) return null;
  const partes = soloUtiles(texto);
  if (!partes.length) return null;
  const clave = partes.join(" ");

  // 1. ¿Es, ENTERO, el nombre de un local o de una empresa nuestra?
  for (const n of nombres) {
    if (!n.clave) continue;
    if (clave === n.clave) return { motivo: "es el nombre de un establecimiento nuestro", detalle: n.nombre };
    // O es ese nombre y poco más: «La Cooperativa (Blanes) 2026» sigue sin ser un producto.
    // Se cuentan solo LETRAS en lo que sobra, y ahí está el matiz: un año o un número de
    // referencia no describen un artículo, así que no cuentan como «hay algo más». Cuatro
    // letras es el listón — por debajo no cabe nada que diga qué es la cosa.
    if (clave.startsWith(n.clave + " ") || clave.endsWith(" " + n.clave)) {
      const resto = clave.replace(n.clave, "").replace(/[^a-z]/g, "");
      if (resto.length < 4) return { motivo: "es el nombre de un establecimiento nuestro", detalle: n.nombre };
    }
  }

  // 2. ¿Es algo que se paga pero no se compra?
  for (const p of NO_ES_MERCANCIA) {
    if (p.re.test(clave)) return { motivo: p.motivo, detalle: null };
  }

  // 3. Una línea que es media hoja de texto no es el nombre de un artículo: es el concepto de
  // un servicio. Doce palabras es mucho más de lo que ocupa el producto más largo de la casa
  // («anchoa filete en aceite de girasol 100f 0 850 k» son diez).
  if (partes.length > 12) return { motivo: "demasiado largo para ser el nombre de un artículo", detalle: null };

  return null;
}

/** Las que no parecen productos, con su motivo. Para pintar el aviso de una vez. */
export function repasarLineas(filas = [], nombres = nombresDeLaCasa()) {
  const out = [];
  for (const f of (Array.isArray(filas) ? filas : [])) {
    const d = noEsProducto(f && (f.descripcion ?? f.nombre), nombres);
    if (d) out.push({ ...f, aviso: d });
  }
  return out;
}
