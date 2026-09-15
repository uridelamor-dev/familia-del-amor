// Búsqueda de municipios para el formulario público. PURO: sin BD, sin Express, sin red.
//
// ── POR QUÉ UN CATÁLOGO LOCAL ────────────────────────────────────────────────────────────────
//
// Lo que escribe alguien en «Població» es un dato suyo, y mandar cada pulsación a un servicio de
// fuera sería enviar a un tercero lo que está tecleando una persona que solo quiere un desayuno.
// El catálogo viaja con la página —5 KB— y la búsqueda ocurre en su móvil: cero peticiones por
// tecla y nada que registrar.
//
// ── ES CURADO, NO EL PADRÓN COMPLETO ─────────────────────────────────────────────────────────
//
// Están los municipios de Cataluña y las ciudades del resto de España, no los 8.100 del INE. Por
// eso EL CAMPO ADMITE TEXTO LIBRE: si alguien vive en un pueblo que no sale, escribe su nombre y
// se guarda igual. Un desplegable cerrado dejaría gente fuera por vivir donde vive.
//
// Va VERSIONADO (`version` en el JSON) para saber con qué lista se rellenó cada ficha el día que
// se amplíe.

/** Sin acentos, sin mayúsculas, sin signos. «Sant Feliu» y «sant feliu» son lo mismo. */
export function normalizar(t) {
  return String(t || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca municipios. Devuelve como mucho `limite`, ya ordenados.
 *
 * EL ORDEN IMPORTA MÁS QUE EL NÚMERO DE RESULTADOS. Quien escribe «bla» quiere Blanes arriba, no
 * un pueblo que lleva «bla» en medio. Por eso:
 *
 *   1. Los que EMPIEZAN por lo escrito, antes que los que solo lo contienen.
 *   2. Entre iguales, Cataluña primero: es donde están los locales y donde vive casi todo el mundo
 *      que rellena esto.
 *   3. A igualdad, el nombre más corto: «Girona» antes que «Gerona capital».
 *
 * Se busca también por PALABRA suelta: «guixols» encuentra «Sant Feliu de Guíxols», que es como lo
 * escribe la gente cuando no se acuerda del principio.
 */
export function buscar(lista, texto, { limite = 8 } = {}) {
  const q = normalizar(texto);
  if (q.length < 2) return [];

  const out = [];
  for (const m of lista || []) {
    const nombre = Array.isArray(m) ? m[0] : m?.nombre;
    if (!nombre) continue;
    const prov = Array.isArray(m) ? m[1] : m?.prov;
    const cat = Array.isArray(m) ? m[2] : m?.cat;
    const n = normalizar(nombre);

    let rango = null;
    if (n.startsWith(q)) rango = 0;
    else if (n.split(" ").some((p) => p.startsWith(q))) rango = 1;
    else if (n.includes(q)) rango = 2;
    if (rango === null) continue;

    out.push({ nombre, prov, cat: !!cat, rango });
  }

  out.sort((a, b) =>
    a.rango - b.rango ||
    (b.cat ? 1 : 0) - (a.cat ? 1 : 0) ||
    a.nombre.length - b.nombre.length ||
    a.nombre.localeCompare(b.nombre, "ca"));
  return out.slice(0, Math.max(1, Math.min(20, limite)));
}

// ── La fecha de nacimiento ───────────────────────────────────────────────────────────────────

/**
 * ¿Vale esta fecha de nacimiento?
 *
 * Se comprueba EN EL SERVIDOR además de en el navegador: el `max` de un `<input type="date">` lo
 * respeta el calendario, pero no impide mandar otra cosa por debajo.
 *
 * Una fecha futura no es un error de dedo: es un dato imposible, y guardarlo ensucia para siempre
 * cualquier segmentación por edad.
 */
export function fechaNacimientoValida(iso, { hoy }) {
  const t = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: false, motivo: "formato" };
  const d = new Date(t + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return { ok: false, motivo: "formato" };
  // Que el mes no se desborde: «2026-02-31» se convierte en marzo sin avisar.
  if (d.toISOString().slice(0, 10) !== t) return { ok: false, motivo: "formato" };
  if (t > String(hoy)) return { ok: false, motivo: "futura" };
  // Nadie que rellene esto nació en 1890. Un año imposible suele ser un dedo en el teclado.
  if (t < "1900-01-01") return { ok: false, motivo: "demasiado_antigua" };
  return { ok: true, motivo: null };
}

/** `2026-09-15` → `15/09/2026`. Para enseñarlo, nunca para guardarlo. */
export const aDdMmAaaa = (iso) => {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length === 3 && p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : "";
};

/** `15/09/2026` → `2026-09-15`. Para leer lo que teclea alguien en un móvil sin calendario. */
export const deDdMmAaaa = (t) => {
  const m = String(t || "").trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
