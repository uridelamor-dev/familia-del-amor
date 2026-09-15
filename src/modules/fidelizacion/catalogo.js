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
// ── LAS ETAPAS DE UNA SINCRONIZACIÓN ─────────────────────────────────────────────────────────
//
// ── POR QUÉ HACEN FALTA ──────────────────────────────────────────────────────────────────────
//
// Antes, TODO fallo salía como «No se ha podido leer el catálogo: TypeError». Da igual que el TPV
// esté apagado, que la ruta no exista, que conteste una página web en vez de datos o que el host
// esté mal escrito: la misma frase. Con eso no se puede arreglar nada, y lo que pasó es que se
// estuvo mirando la red durante días cuando el fallo estaba en una línea de código.
//
// Seis etapas, en el orden en que ocurren. Cada una dice QUÉ MIRAR. Ninguna enseña la URL, el
// host, el token ni el cuerpo de la respuesta.
export const ETAPAS = Object.freeze([
  "conexion_fallida",       // no se ha llegado a hablar con el TPV
  "http_no_ok",             // ha contestado, pero con un código de error
  "respuesta_no_json",      // ha contestado algo que no son datos (típicamente una página web)
  "estructura_invalida",    // es JSON, pero no tiene la forma de un maestro de Ágora
  "normalizacion_fallida",  // los datos han reventado al interpretarlos
  "persistencia_fallida",   // se han leído bien y ha fallado guardarlos
]);

/**
 * Qué se le enseña a quien pulsa el botón. Frases que dicen QUÉ HACER, no qué ha pasado por dentro.
 *
 * NINGUNA LLEVA LA URL, EL HOST NI EL TOKEN. Lo único que se añade aparte es el código técnico
 * (`ECONNREFUSED`, `HTTP 404`), que no identifica a nadie y es lo que hace falta para decidir.
 */
export const MENSAJE_ETAPA = Object.freeze({
  conexion_fallida:
    "No se ha podido conectar con el TPV. Comprueba que está encendido, que la dirección del local "
    + "es correcta y que el puerto está abierto desde fuera.",
  http_no_ok:
    "El TPV ha contestado con un error. Suele ser que la ruta del catálogo no existe en esa versión "
    + "de Ágora, o que el Api-Token no vale para este servicio.",
  respuesta_no_json:
    "El TPV ha contestado algo que no son datos: normalmente la página de administración. "
    + "Esa dirección sirve la web, no el catálogo.",
  estructura_invalida:
    "Han llegado datos, pero no tienen la forma de un catálogo de Ágora. No se ha tocado nada.",
  normalizacion_fallida:
    "El catálogo ha llegado pero no se ha podido interpretar. No se ha tocado nada.",
  persistencia_fallida:
    "El catálogo se ha leído bien, pero no se ha podido guardar. Vuelve a intentarlo.",
});

/** El mensaje de una etapa. Una etapa desconocida no se inventa: se dice que no se sabe. */
export const mensajeEtapa = (etapa) =>
  MENSAJE_ETAPA[etapa] || "No se ha podido sincronizar el catálogo.";

/**
 * ¿Es esta base una dirección absoluta con la que se puede llamar?
 *
 * Se comprueba ANTES de llamar porque el fallo de no hacerlo no se parece a lo que es: un host con
 * puntos se parsea como ESQUEMA de URL, así que nada protesta hasta que `fetch` devuelve un
 * `TypeError` seco. Aquí se detecta y se dice exactamente qué falta.
 */
export function baseValida(base) {
  const b = String(base || "").trim();
  if (!b) return { ok: false, motivo: "Falta la dirección del TPV." };
  if (!/^https?:\/\//i.test(b)) {
    return { ok: false,
      motivo: "La dirección del TPV tiene que empezar por http:// o https://." };
  }
  try {
    const u = new URL(b);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, motivo: "La dirección del TPV tiene que empezar por http:// o https://." };
    }
    if (!u.hostname) return { ok: false, motivo: "La dirección del TPV no tiene servidor." };
  } catch {
    return { ok: false, motivo: "La dirección del TPV no se entiende." };
  }
  return { ok: true, motivo: null };
}

/**
 * Clasifica un fallo de conexión. Devuelve solo el CÓDIGO técnico, nunca el mensaje.
 *
 * El mensaje de un error de `fetch` PUEDE LLEVAR LA URL entera —«Failed to parse URL from
 * http://host:8984/…?apiToken=…»—, así que no se usa. El código (`ECONNREFUSED`, `ENOTFOUND`,
 * `CERT_HAS_EXPIRED`, `UND_ERR_CONNECT_TIMEOUT`) no identifica a nadie y es justo lo que hace
 * falta para saber si el TPV está apagado, si el nombre no resuelve o si el puerto está cerrado.
 */
export function codigoConexion(e) {
  const limpio = (v) => {
    const t = String(v == null ? "" : v).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40);
    return t || null;
  };
  if (!e) return null;

  // SE RECORRE LA CADENA ENTERA DE CAUSAS, no solo el primer nivel.
  //
  // `fetch` envuelve una vez (`TypeError: fetch failed` → `cause: { code: "ECONNREFUSED" }`) y
  // nosotros volvemos a envolver para marcar la etapa. Mirando un solo nivel se perdían justo los
  // dos códigos que más dicen —ECONNREFUSED (el TPV está apagado o el puerto cerrado) y ENOTFOUND
  // (el nombre no resuelve)—, y los dos casos volvían a parecerse entre sí.
  //
  // El tope de saltos es por si alguien encadena un error consigo mismo.
  const CONOCIDOS = ["unknown scheme", "unsupported protocol", "certificate",
                     "socket hang up", "other side closed", "bad port"];
  // La pila a recorrer: `cause` encadena, y `errors` aparece cuando un nombre resuelve a varias
  // direcciones y falla en todas (`AggregateError`). Mirando solo `cause` se perdía ese caso.
  const pila = [e];
  for (let salto = 0; pila.length && salto < 16; salto++) {
    const nodo = pila.shift();
    if (!nodo || typeof nodo !== "object") continue;
    if (nodo.name === "AbortError" || nodo.code === "TIMEOUT") return "TIMEOUT";
    if (nodo.code) return limpio(nodo.code);
    if (nodo.errno && typeof nodo.errno === "string") return limpio(nodo.errno);
    // Solo motivos CONOCIDOS y cortos; nunca el mensaje entero, que puede llevar la URL.
    const m = String(nodo.message || "").toLowerCase();
    for (const conocido of CONOCIDOS) {
      if (m.includes(conocido)) return limpio(conocido.replace(/ /g, "_").toUpperCase());
    }
    if (nodo.cause) pila.push(nodo.cause);
    if (Array.isArray(nodo.errors)) pila.push(...nodo.errors.slice(0, 4));
  }
  return null;
}

/**
 * ¿Tiene esto forma de maestro de Ágora?
 *
 * ── POR QUÉ ESTO NO ES UNA FORMALIDAD ────────────────────────────────────────────────────────
 *
 * `normalizarMaestro` es deliberadamente tolerante: acepta `null`, un texto o `{}` y devuelve cero
 * productos sin protestar. Y `compararCatalogo` marca INACTIVO todo lo que no aparece. Juntos, una
 * respuesta vacía pero válida DESACTIVARÍA EL CATÁLOGO ENTERO en silencio, y quien lo mirara al día
 * siguiente vería el catálogo en blanco sin ningún error registrado.
 *
 * Por eso aquí se exige la forma documentada —raíz con `Products` en una lista— y se bloquea el
 * caso de «cero productos cuando antes había»: es indistinguible de haber llamado a la ruta
 * equivocada, y ante la duda no se borra nada.
 */
export function validarMaestro(json, { activosAhora = 0 } = {}) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, detalle: "la respuesta no es un objeto" };
  }
  if (!Object.prototype.hasOwnProperty.call(json, "Products")) {
    return { ok: false, detalle: "no viene «Products»" };
  }
  if (!Array.isArray(json.Products)) {
    return { ok: false, detalle: "«Products» no es una lista" };
  }
  // Los otros filtros que se piden: si vienen, tienen que ser listas.
  for (const clave of ["Vats", "Families", "PriceLists"]) {
    if (json[clave] !== undefined && !Array.isArray(json[clave])) {
      return { ok: false, detalle: `«${clave}» no es una lista` };
    }
  }
  if (json.Products.length === 0 && activosAhora > 0) {
    return { ok: false,
      detalle: `han llegado cero productos y ahora hay ${activosAhora} activos` };
  }
  return { ok: true, detalle: null };
}

export function errorRedactado(e, { host = null, token = null } = {}) {
  const nombre = String((e && e.name) || "Error").slice(0, 40);
  // LA CAUSA, QUE ES DONDE ESTÁ EL MOTIVO. `fetch` nativo lanza siempre `TypeError: fetch failed`
  // y esconde el porqué en `e.cause`. Sin esto, un TPV apagado, un nombre que no resuelve y un
  // host mal escrito daban las tres la misma palabra: «TypeError».
  const causa = codigoConexion(e);
  const code = e && e.code !== undefined ? String(e.code).slice(0, 20) : causa;
  const estado = e && e.status !== undefined ? String(e.status).slice(0, 5) : null;
  let linea = `${nombre}${code ? ` · ${code}` : ""}${estado ? ` · HTTP ${estado}` : ""}`;
  // Por si algo del host o del token se hubiera colado en el nombre o el código.
  for (const secreto of [host, token]) {
    if (secreto) linea = linea.split(String(secreto)).join("[oculto]");
  }
  return linea.slice(0, 120);
}
