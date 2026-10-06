// Facturas — lógica PURA de autoasignación de local para facturas pendientes.
// Objetivo: cuando el local es "muy claro" (CIF del receptor, empresa con un único
// local, o un proveedor que SIEMPRE se ha asignado al mismo local) proponerlo —y, con
// alta confianza, asignarlo solo—. Sin efectos secundarios: apto para tests unitarios.

// Normaliza un CIF/NIF para comparar (sin espacios, guiones, puntos; mayúsculas).
export function normalizarNif(nif) {
  return String(nif || "").replace(/[\s\-.]/g, "").toUpperCase();
}

// Normaliza texto libre (proveedor/empresa) para comparar: minúsculas, sin acentos,
// espacios colapsados. Así "Makro Girona" y "makro  girona" cuentan como iguales.
export function normalizarTexto(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

// Dado el nombre de local guardado en el histórico (puede ser el "local_contable"),
// devuelve el nombre de local del ERP (campo `local`) que usan el desplegable y la
// asignación. Casa por `local` o por `local_contable`. Si no lo encuentra, devuelve tal cual.
export function resolverLocalERP(nombre, locales) {
  const n = normalizarTexto(nombre);
  if (!n) return null;
  const arr = Array.isArray(locales) ? locales : [];
  const hit = arr.find((l) => normalizarTexto(l.local) === n || normalizarTexto(l.local_contable) === n);
  return hit ? hit.local : nombre;
}

// Indexa el histórico de facturas por proveedor → a qué locales se ha asignado y cuántas
// veces. `unico` = ese proveedor SIEMPRE ha ido al mismo local. Base del "proveedor habitual".
// `facturas`: filas con { proveedor, local }.
export function indexarHistorialProveedor(facturas) {
  const idx = {};
  for (const f of (Array.isArray(facturas) ? facturas : [])) {
    const key = normalizarTexto(f.proveedor);
    if (!key || !f.local) continue;
    const e = idx[key] || (idx[key] = { locales: {}, total: 0 });
    e.locales[f.local] = (e.locales[f.local] || 0) + 1;
    e.total += 1;
  }
  for (const key of Object.keys(idx)) {
    const e = idx[key];
    const nombres = Object.keys(e.locales);
    e.top = nombres.sort((a, b) => e.locales[b] - e.locales[a])[0] || null;
    e.unico = nombres.length === 1;
  }
  return idx;
}

// Devuelve los locales del ERP cuyo CIF coincide con el NIF del receptor.
function localesPorCif(nif, locales) {
  const n = normalizarNif(nif);
  if (!n) return [];
  return (Array.isArray(locales) ? locales : []).filter((l) => normalizarNif(l.cif) === n);
}

// Devuelve los locales del ERP cuya empresa coincide (por nombre) con el texto dado.
function localesPorEmpresa(nombreEmpresa, locales) {
  const n = normalizarTexto(nombreEmpresa);
  if (!n) return [];
  return (Array.isArray(locales) ? locales : []).filter((l) => normalizarTexto(l.empresa) === n);
}

// Sugerencia de local para una factura pendiente. Devuelve { local, confianza, motivo }.
//  - confianza "alta": señal fuerte → apto para autoasignar sin intervención.
//  - confianza "media": buena pista → preseleccionar en el desplegable, pero que confirme.
//  - local null / confianza null: no hay señal suficiente.
// Entradas:
//  - pendiente: { nif_receptor, nombre_receptor, empresa_detectada, proveedor }
//  - locales: [{ local, empresa, cif, local_contable }]
//  - historial: salida de indexarHistorialProveedor (opcional)
// Conectores/ruido que NO deben contar como token de local ("La Tapeta - Lloret" → tapeta, lloret).
const STOP_LOCAL = new Set(["la", "el", "los", "las", "de", "del", "d", "en", "y", "sl", "slu", "sa", "s", "l", "u"]);
// Tokens significativos del nombre de un local (≥4 letras, sin conectores).
function tokensLocal(nombre) {
  return normalizarTexto(nombre).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOP_LOCAL.has(t));
}
// Casa el local por el TEXTO que identifica el establecimiento en la factura (p. ej. el cliente
// "DEL AMOR URIEL SLU (TAPETA LLORET)" o la dirección de entrega). Devuelve el local si hay UNO
// claramente por delante (más tokens coincidentes), o null si no hay o hay empate.
export function localPorPistaTexto(texto, locales) {
  const hint = normalizarTexto(texto);
  if (!hint) return null;
  const palabras = new Set(hint.split(/[^a-z0-9]+/).filter(Boolean));
  const completos = [];
  for (const l of (Array.isArray(locales) ? locales : [])) {
    const toks = tokensLocal(l.local);
    // Exige nombre y localidad completos: una ciudad en la dirección fiscal
    // o un fragmento de otra palabra no identifica un establecimiento.
    if(toks.length >= 2 && toks.every(t=>palabras.has(t))) completos.push(l.local);
  }
  const unicos=[...new Set(completos)];
  return unicos.length===1 ? unicos[0] : null;
}

export function sugerirLocalPendiente({ pendiente = {}, locales = [], historial = {} } = {}) {
  const nula = { local: null, confianza: null, motivo: "" };

  // El receptor fiscal restringe candidatos antes de usar pistas o historial.
  const nif = normalizarNif(pendiente.nif_receptor);
  let candidatos = nif ? localesPorCif(nif, locales) : locales;
  if (nif && !candidatos.length) return {...nula, motivo: "CIF receptor no configurado: revisar empresa"};
  if (nif && candidatos.length === 1) return {local:candidatos[0].local, confianza:"alta", motivo:"CIF del receptor"};
  for (const nombre of [pendiente.nombre_receptor, pendiente.empresa_detectada]) {
    const encontrados = localesPorEmpresa(nombre, candidatos);
    if (encontrados.length) { candidatos = encontrados; break; }
  }
  if (candidatos.length === 1 && candidatos !== locales) return {local:candidatos[0].local, confianza:"alta", motivo:"Empresa receptora"};
  const pista = localPorPistaTexto([pendiente.local_receptor, pendiente.nombre_receptor].filter(Boolean).join(" "), candidatos);
  if (pista) return {local:pista, confianza:"alta", motivo:"Local indicado en la factura"};
  const h = historial[normalizarTexto(pendiente.proveedor)];
  if (h?.unico && h.top) {
    const local = resolverLocalERP(h.top, candidatos);
    if (candidatos.some(c=>c.local === local)) return {local, confianza:"media", motivo:"Proveedor habitual: confirmar establecimiento"};
  }
  return nula;
}
