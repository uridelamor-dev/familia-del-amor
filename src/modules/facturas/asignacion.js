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
export function sugerirLocalPendiente({ pendiente = {}, locales = [], historial = {} } = {}) {
  const nula = { local: null, confianza: null, motivo: "" };

  // 1) CIF del receptor → un único local del ERP. Señal más fuerte.
  const porCif = localesPorCif(pendiente.nif_receptor, locales);
  if (porCif.length === 1) return { local: porCif[0].local, confianza: "alta", motivo: "CIF del receptor" };

  // 2) Empresa receptora (por nombre del receptor o empresa ya detectada) con un único local.
  for (const nombre of [pendiente.nombre_receptor, pendiente.empresa_detectada]) {
    const porEmp = localesPorEmpresa(nombre, locales);
    if (porEmp.length === 1) return { local: porEmp[0].local, confianza: "alta", motivo: "Empresa receptora" };
  }

  // 3) Proveedor habitual: si SIEMPRE se ha asignado al mismo local, proponerlo.
  const h = historial[normalizarTexto(pendiente.proveedor)];
  if (h && h.unico && h.top) {
    const local = resolverLocalERP(h.top, locales);
    if (local) return { local, confianza: h.total >= 2 ? "alta" : "media", motivo: "Proveedor habitual" };
  }

  return nula;
}
