// El catálogo de productos de Ágora. PURO: sin BD, sin Express, sin red.
//
// ── DE DÓNDE SALE ────────────────────────────────────────────────────────────────────────────
//
//   GET /api/export-master/?filter=Vats,Families,PriceLists,Products
//   Api-Token: <el token configurado en Ágora>
//   Accept: application/json
//
// Guía del Integrador 8.7.2, págs. 195-207 (la petición) y 47-61 (el producto).
//
// LA RAÍZ NO ES UN ARRAY: es `{ "Products": [...] }`. Y se piden los cuatro filtros juntos porque
// el producto SOLO trae `VatId`, `FamilyId` y `PriceListId` — identificadores. El porcentaje de
// IVA, el nombre de la familia y el de la tarifa viven en sus propias colecciones y se relacionan
// por id. NO SE DEDUCEN POR EL NOMBRE: un producto que se llame «Café con leche 10%» no dice nada
// de su impuesto.
//
// ── DOS COSAS QUE LA GUÍA NO DA, Y QUE NO SE INVENTAN ────────────────────────────────────────
//
//   · No hay paginación, cursor, versión ni fecha de modificación del maestro. Cada sincronización
//     se trae el catálogo entero; no hay forma documentada de pedir «lo que ha cambiado».
//   · No hay booleano de activo. Lo que hay es `DeletionDate`: si existe, el producto está de baja.
//
// ── LA IDENTIDAD ES COMPUESTA ────────────────────────────────────────────────────────────────
//
// `(local, Id)`. Nunca `Id` a secas. Ya demostramos con `Workplace.Id` que dos instalaciones de
// Ágora repiten identificadores, y no hay ningún motivo para que los productos sean distintos: el
// producto 14 de Girona y el 14 de Lloret son dos cosas que no tienen nada que ver.

/** La ruta y los filtros. Se piden los cuatro juntos: sin ellos el producto es solo identificadores. */
export const RUTA_MAESTRO = "/api/export-master/";
export const FILTROS = Object.freeze(["Vats", "Families", "PriceLists", "Products"]);
export const urlMaestro = (base, filtros = FILTROS) =>
  `${String(base || "").replace(/\/+$/, "")}${RUTA_MAESTRO}?filter=${filtros.join(",")}`;

/** Un escalar corto y sin caracteres de control. Lo que llega lo escribe el TPV. */
export function texto(v, max = 200) {
  if (v === null || v === undefined || typeof v === "object" || typeof v === "boolean") return null;
  const t = String(v).replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  return t ? t.slice(0, max) : null;
}

/** Un número o `null`. Nunca un 0 por defecto: «sin precio» y «gratis» no son lo mismo. */
export function numero(v) {
  if (v === null || v === undefined || typeof v === "object" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * El precio principal de una lista de `Prices[]`.
 *
 * ACEPTA `MainPrice` Y `Price`. La guía documenta `MainPrice`, pero un ejemplo antiguo de la misma
 * guía usa `Price`, y no sabemos qué versión de Ágora tiene cada local. Se admiten los dos, con
 * PRIORIDAD para `MainPrice`: si llegaran ambos, el documentado manda.
 *
 * Se devuelve también de qué tarifa sale, porque un producto puede tener varias y el precio de la
 * tarifa de terraza no es el de la barra.
 */
export function precioDe(prices, { tarifaPreferida = null } = {}) {
  if (!Array.isArray(prices) || !prices.length) return { precio: null, tarifa: null, campo: null };
  const dePrioridad = tarifaPreferida != null
    ? prices.filter((p) => p && String(p.PriceListId) === String(tarifaPreferida))
    : [];
  for (const lista of [dePrioridad, prices]) {
    for (const p of lista) {
      if (!p || typeof p !== "object") continue;
      const principal = numero(p.MainPrice);
      if (principal !== null) return { precio: principal, tarifa: texto(p.PriceListId, 40), campo: "MainPrice" };
      const viejo = numero(p.Price);
      if (viejo !== null) return { precio: viejo, tarifa: texto(p.PriceListId, 40), campo: "Price" };
    }
  }
  return { precio: null, tarifa: null, campo: null };
}

/** Un producto está de baja si trae `DeletionDate`. No hay booleano de activo en la guía. */
export const estaDeBaja = (x) => !!texto(x?.DeletionDate, 40);

/**
 * Normaliza el maestro entero a filas que podemos guardar.
 *
 * Devuelve también lo que NO se ha podido interpretar, por su id: una sincronización que se come
 * productos en silencio es peor que una que falla, porque se descubre cuando falta uno en una
 * campaña.
 */
export function normalizarMaestro(json, { local, tarifaPreferida = null } = {}) {
  const raiz = json && typeof json === "object" ? json : {};
  const lista = (k) => (Array.isArray(raiz[k]) ? raiz[k] : []);

  // Los diccionarios, por id. El IVA y la familia se RELACIONAN; no se adivinan.
  const vats = new Map();
  for (const v of lista("Vats")) {
    const id = texto(v?.Id, 40);
    if (id) vats.set(id, { porcentaje: numero(v?.Percentage ?? v?.Value ?? v?.Rate), nombre: texto(v?.Name) });
  }
  const familias = new Map();
  for (const f of lista("Families")) {
    const id = texto(f?.Id, 40);
    if (id) familias.set(id, texto(f?.Name));
  }
  const tarifas = new Map();
  for (const t of lista("PriceLists")) {
    const id = texto(t?.Id, 40);
    if (id) tarifas.set(id, texto(t?.Name));
  }

  const productos = [];
  const descartados = [];
  for (const p of lista("Products")) {
    if (!p || typeof p !== "object") { descartados.push({ id: null, motivo: "no_es_objeto" }); continue; }
    const id = texto(p.Id, 40);
    const nombre = texto(p.Name, 200);
    // `Id` y `Name` son obligatorios en la guía. Sin ellos no hay producto que guardar.
    if (!id) { descartados.push({ id: null, motivo: "sin_id" }); continue; }
    if (!nombre) { descartados.push({ id, motivo: "sin_nombre" }); continue; }

    const familiaId = texto(p.FamilyId, 40);
    const vatId = texto(p.VatId, 40);
    const pr = precioDe(p.Prices, { tarifaPreferida });

    productos.push({
      local,
      producto_id: id,
      nombre,
      familia_id: familiaId,
      familia: familiaId && familias.has(familiaId) ? familias.get(familiaId) : null,
      vat_id: vatId,
      // `null` si el `VatId` no aparece en `Vats`: eso es un catálogo incompleto, no un 0 %.
      iva: vatId && vats.has(vatId) ? vats.get(vatId).porcentaje : null,
      precio: pr.precio,
      tarifa_id: pr.tarifa,
      tarifa: pr.tarifa && tarifas.has(pr.tarifa) ? tarifas.get(pr.tarifa) : null,
      precio_campo: pr.campo,
      // Si falta, la guía dice que se asume el propio Id del producto.
      formato_base_id: texto(p.BaseSaleFormatId, 40) || id,
      formatos: normalizarFormatos(p.AdditionalSaleFormats, { tarifaPreferida }),
      boton: texto(p.ButtonText, 120),
      plu: texto(p.PLU, 40),
      codigo_barras: texto(p.Barcode, 60),
      por_peso: p.IsSoldByWeight === true,
      vendible_principal: p.SaleableAsMain !== false,
      vendible_complemento: p.SaleableAsAddin === true,
      baja_en: texto(p.DeletionDate, 40),
      activo: !estaDeBaja(p),
    });
  }

  return {
    productos, descartados,
    diccionarios: { vats: vats.size, familias: familias.size, tarifas: tarifas.size },
    // Lo que falta para poder decirlo en pantalla en vez de dejar huecos sin explicar.
    avisos: [
      ...(vats.size ? [] : ["No ha llegado la tabla de impuestos: los productos quedarán sin IVA."]),
      ...(familias.size ? [] : ["No ha llegado la tabla de familias: los productos quedarán sin familia."]),
      ...(descartados.length ? [`${descartados.length} producto(s) no se han podido interpretar.`] : []),
    ],
  };
}

/** Los formatos adicionales, con su propio estado y sus propios precios. */
export function normalizarFormatos(arr, { tarifaPreferida = null } = {}) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const f of arr) {
    if (!f || typeof f !== "object") continue;
    const id = texto(f.Id, 40);
    if (!id) continue;
    const pr = precioDe(f.Prices, { tarifaPreferida });
    out.push({ id, nombre: texto(f.Name, 120), ratio: numero(f.Ratio),
               precio: pr.precio, activo: !estaDeBaja(f) });
  }
  return out;
}

/**
 * Qué ha cambiado entre lo que teníamos y lo que acaba de llegar.
 *
 * LO QUE DESAPARECE NO SE BORRA: se marca inactivo. Un producto puede seguir estando dentro de una
 * campaña vieja o de un movimiento ya escrito, y borrarlo dejaría esas filas apuntando al vacío.
 */
export function compararCatalogo(actuales, llegados) {
  const previos = new Map((actuales || []).map((p) => [String(p.producto_id), p]));
  const nuevos = new Map((llegados || []).map((p) => [String(p.producto_id), p]));

  const anadidos = [], actualizados = [], inactivados = [];
  for (const [id, p] of nuevos) {
    const antes = previos.get(id);
    if (!antes) { anadidos.push(p); continue; }
    const cambia = ["nombre", "familia_id", "vat_id", "precio", "activo", "formato_base_id"]
      .some((k) => String(antes[k] ?? "") !== String(p[k] ?? ""));
    if (cambia) actualizados.push(p);
  }
  for (const [id, p] of previos) {
    if (!nuevos.has(id) && p.activo) inactivados.push({ ...p, activo: false });
  }
  return { anadidos, actualizados, inactivados,
           resumen: { anadidos: anadidos.length, actualizados: actualizados.length,
                      inactivados: inactivados.length, total: nuevos.size } };
}

/**
 * Un error de sincronización, en una línea que se puede enseñar.
 *
 * NUNCA lleva el host, el token ni las credenciales: una pantalla de error es exactamente donde
 * acaban apareciendo, porque nadie piensa en ella al escribir el `catch`.
 */
export function errorRedactado(e, { host = null, token = null } = {}) {
  const nombre = String((e && e.name) || "Error").slice(0, 40);
  const code = e && e.code !== undefined ? String(e.code).slice(0, 20) : null;
  const estado = e && e.status !== undefined ? String(e.status).slice(0, 5) : null;
  let linea = `${nombre}${code ? ` · ${code}` : ""}${estado ? ` · HTTP ${estado}` : ""}`;
  // Por si algo del host o del token se hubiera colado en el nombre o el código.
  for (const secreto of [host, token]) {
    if (secreto) linea = linea.split(String(secreto)).join("[oculto]");
  }
  return linea.slice(0, 120);
}
