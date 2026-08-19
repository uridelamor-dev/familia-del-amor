// El local de una factura SIEMPRE tiene que ser uno de los establecimientos de la casa,
// escrito exactamente igual. PURO.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  POR QUÉ: el campo `local` se venía guardando como texto libre, y acabaron    │
// │  conviviendo «La Tapeta - Lloret», «Lloret», «BLANES» y «Cooperativa -        │
// │  Blanes» en la misma columna. Filtrando por «La Tapeta - Lloret» faltaban     │
// │  facturas, y el gasto por local salía repartido entre nombres que son el      │
// │  mismo sitio. Un dato que no se puede agrupar no sirve para decidir nada.     │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// La regla es estricta a propósito: si no se reconoce con seguridad, se devuelve null y
// que lo asigne una persona. Adivinar mal es peor que no adivinar — una factura de Lloret
// contada en Blanes descuadra los dos locales a la vez.

// LA COOPERATIVA NO ESTÁ, y es una decisión: por dentro, Blanes es UN establecimiento. Sus
// alias («cooperativa», «coop blanes») apuntan al centro, así que una factura que llegue
// nombrándola se guarda ya donde toca. De cara al cliente sigue siendo un local aparte —con su
// página web y su ficha de Google—, pero eso no pasa por esta lista.
//
// Lo histórico guardado como «Cooperativa - Blanes» se sigue leyendo: de eso se encarga
// `src/modules/locales/centros.js`, que dice DÓNDE HAY QUE MIRAR. Esta lista dice DÓNDE SE
// ESCRIBE. Son dos preguntas distintas y confundirlas haría desaparecer lo viejo.
export const LOCALES = [
  "La Tapeta - Blanes", "La Tapeta - Lloret",
  "La Tapeta - Girona", "Can Mateu - Tordera", "La Tapa Ibérica - Tordera",
  "Botiga d'en Mateu - Tordera", "Oficina",
];

const norm = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// Formas sueltas que se han visto de verdad en las facturas y en la configuración vieja.
// Se listan a mano en vez de inventar reglas: las abreviaturas de cada casa son suyas y
// una heurística que acierte «Lloret» acabaría acertando también donde no debe.
// Se exporta porque es, de hecho, el catálogo de CÓMO SE ESCRIBEN los nombres de la casa en
// las facturas. `no-es-producto.js` lo reutiliza para saber cuándo una línea es el nombre de
// un local en vez de un artículo, y así no hay dos listas que mantener.
export const ALIAS = {
  // La Tapeta - Blanes
  "tapeta blanes": "La Tapeta - Blanes",
  "la tapeta blanes": "La Tapeta - Blanes",
  "blanes": "La Tapeta - Blanes",
  "tapeta muralla 21": "La Tapeta - Blanes",
  // La Cooperativa es la otra barra del MISMO establecimiento: su gasto es gasto de Blanes.
  "cooperativa": "La Tapeta - Blanes",
  "cooperativa blanes": "La Tapeta - Blanes",
  "coop blanes": "La Tapeta - Blanes",
  // La Tapeta - Lloret
  "tapeta lloret": "La Tapeta - Lloret",
  "la tapeta lloret": "La Tapeta - Lloret",
  "lloret": "La Tapeta - Lloret",
  "lloret de mar": "La Tapeta - Lloret",
  // La Tapeta - Girona
  "tapeta girona": "La Tapeta - Girona",
  "la tapeta girona": "La Tapeta - Girona",
  "girona": "La Tapeta - Girona",
  "gerona": "La Tapeta - Girona",
  // Can Mateu - Tordera
  "can mateu": "Can Mateu - Tordera",
  "can mateu tordera": "Can Mateu - Tordera",
  "canmateu": "Can Mateu - Tordera",
  // La Tapa Ibérica - Tordera
  "tapa iberica": "La Tapa Ibérica - Tordera",
  "la tapa iberica": "La Tapa Ibérica - Tordera",
  "tapa iberica tordera": "La Tapa Ibérica - Tordera",
  // Botiga d'en Mateu - Tordera
  "botiga d en mateu": "Botiga d'en Mateu - Tordera",
  "botiga den mateu": "Botiga d'en Mateu - Tordera",
  "botiga mateu": "Botiga d'en Mateu - Tordera",
  "botiga": "Botiga d'en Mateu - Tordera",
  // Oficina
  "oficina": "Oficina",
  "oficinas": "Oficina",
  "administracion": "Oficina",
};

// «Tordera» a secas NO se resuelve: hay tres locales en Tordera y acertaría uno de cada
// tres. Lo mismo pasaría con cualquier alias que apunte a más de un sitio.
export const AMBIGUOS = new Set(["tordera"]);

// Devuelve el nombre canónico, o null si no se reconoce con seguridad.
export function canonizarLocal(valor, { locales = LOCALES } = {}) {
  const n = norm(valor);
  if (!n) return null;

  // 1. Ya es uno de los nombres buenos.
  const exacto = locales.find((l) => norm(l) === n);
  if (exacto) return exacto;

  // 2. Alias conocido.
  if (AMBIGUOS.has(n)) return null;
  if (ALIAS[n] && locales.includes(ALIAS[n])) return ALIAS[n];

  // 3. El nombre canónico aparece entero dentro del texto («factura para LA TAPETA
  //    LLORET, s/n»). Si encaja más de uno, no se elige: se devuelve null.
  const dentro = locales.filter((l) => n.includes(norm(l)));
  if (dentro.length === 1) return dentro[0];

  // 4. Un alias aparece dentro del texto. Igual: solo si es el único.
  const porAlias = [...new Set(Object.entries(ALIAS)
    .filter(([k]) => !AMBIGUOS.has(k) && new RegExp(`(^| )${k}( |$)`).test(n))
    .map(([, v]) => v))].filter((l) => locales.includes(l));
  if (porAlias.length === 1) return porAlias[0];

  return null;
}

export const esLocalCanonico = (valor, { locales = LOCALES } = {}) => locales.includes(String(valor || ""));

// Para el aviso del panel: qué valores raros hay guardados y a cuál se parecen.
export function agruparNoCanonicos(filas = [], { locales = LOCALES } = {}) {
  const mapa = new Map();
  for (const f of filas) {
    const v = f.local == null ? "" : String(f.local);
    if (esLocalCanonico(v, { locales })) continue;
    const k = v || "(vacío)";
    if (!mapa.has(k)) mapa.set(k, { valor: v, n: 0, sugerido: canonizarLocal(v, { locales }) });
    mapa.get(k).n += Number(f.n) || 1;
  }
  return [...mapa.values()].sort((a, b) => b.n - a.n);
}
