// Inventarios — el catálogo de un proveedor: qué se le puede añadir y qué ya está. PURO.
//
// EL PROBLEMA: montar un proveedor con cuarenta referencias son cuarenta modales de diez campos,
// escribiendo a mano una lista que YA existe en dos sitios: en sus facturas (llevamos meses
// comprándole) y, muchas veces, en el mismo proveedor montado en otro local.
//
// LO DELICADO NO ES JUNTAR LAS DOS LISTAS, ES NO DUPLICAR. `inv_productos` no tiene ningún
// UNIQUE: hoy se pueden crear dos productos idénticos, y un alta en lote sin freno los crearía
// a decenas. Aquí vive ese freno, en forma comprobable.

import { claveProducto } from "../facturas/lineas.js";
import { claveProveedor } from "../facturas/categorias.js";
import { esMMDDValido } from "./calculo.js";
import { esUnidadValida } from "./unidades.js";

export const TOPE_LOTE = 200;

/**
 * La clave con la que se decide si dos productos son el mismo.
 *
 * Es la MISMA que usa Compras para agrupar líneas de factura, importada a propósito: si aquí se
 * escribiera otra parecida, dentro de un año se habrían separado y el enlace entre inventario y
 * facturas dejaría de casar sin que nadie tocara nada. Hay un test que compara las dos salidas.
 */
export function claveInvProducto(nombre) { return claveProducto(nombre); }

/**
 * La clave con la que se COTEJA si dos productos son el mismo. Distinta de la que se guarda, y a
 * propósito.
 *
 * `claveProducto` deja «coca cola 33cl» y «coca cola 33 cl» como claves distintas —en Compras eso
 * está bien, ahí las une el diccionario a mano—, pero aquí significaría ofrecer como novedad un
 * producto que ya está montado, y crear el duplicado. Juntando los espacios, las dos son
 * «cocacola33cl».
 *
 * La que se GUARDA sigue siendo `claveInvProducto`, sin tocar: es la que tiene que casar con
 * `factura_lineas.clave` para que el puente con las facturas sirva de algo.
 */
export function claveCotejo(nombre) { return claveProducto(nombre).replace(/ /g, ""); }

/** La clave de cotejo de un producto ya guardado: la suya si la tiene, si no su nombre. */
export function claveDeExistente(p) {
  const guardada = String((p && p.clave_producto) || "").trim();
  return claveCotejo(guardada || (p && p.nombre));
}

/**
 * Cómo se llama este proveedor en las facturas.
 *
 * No vale comparar con `=`: en `facturas` conviven «GRAU», «Vins i Licors Grau, S.A.» y «VINS I
 * LICORS GRAU SA». `claveProveedor` ya quita las formas jurídicas y el ruido, así que las tres
 * caen en la misma clave. Devuelve las escrituras EXACTAS que hay que buscar en la base.
 */
export function variantesDeProveedor(nombre, conocidos = []) {
  const k = claveProveedor(nombre);
  if (!k) return [];
  const vistas = new Set();
  for (const txt of textos(conocidos)) if (claveProveedor(txt) === k) vistas.add(txt);
  // El nombre buscado entra siempre: si el proveedor es nuevo y aún no hay facturas suyas, la
  // consulta no debe quedarse sin ningún valor que comparar.
  vistas.add(String(nombre).trim());
  return [...vistas];
}

const textos = (lista) => (lista || []).map((c) => (typeof c === "string" ? c : (c && c.proveedor))).filter(Boolean);

/**
 * «¿Quisiste decir VINS I LICORS GRAU SA?»
 *
 * Un proveedor de inventario se llama «Grau» y en las facturas pone «VINS I LICORS GRAU SA». Por
 * clave no casan, y por parecido tampoco: un apodo corto dentro de un nombre legal largo saca un
 * 25 %, muy por debajo del mínimo para unir nada.
 *
 * Adivinarlo sería peor que no encontrarlo: «Grau» también está dentro de «Graupera SL», y una
 * lista de productos del proveedor equivocado no se nota hasta que alguien pide una caja de algo
 * que ese señor no vende. Así que NO se adivina: se propone, con el nombre delante, y lo confirma
 * una persona con un clic que arregla el campo para siempre.
 *
 * El criterio es contención por PALABRA ENTERA, no por trozo: «grau» está en «vins i licors grau»
 * pero no en «graupera».
 */
export function sugerenciasDeProveedor(nombre, conocidos = []) {
  const k = claveProveedor(nombre);
  if (!k) return [];
  const mias = k.split(" ").filter((p) => p.length > 3);
  if (!mias.length) return [];
  const fuera = [];
  for (const txt of textos(conocidos)) {
    const ck = claveProveedor(txt);
    if (!ck || ck === k) continue;
    const suyas = ck.split(" ").filter(Boolean);
    if (mias.every((p) => suyas.includes(p))) fuera.push(txt);
  }
  return fuera;
}

/**
 * Marca cuáles de los candidatos ya están montados en este proveedor.
 *
 * Se compara contra TODOS los productos, incluidos los inactivos. Si uno está desactivado y se
 * vuelve a crear, aparece el duplicado que luego nadie entiende de dónde salió; es mejor decir
 * «ya está, está desactivado» y ofrecer reactivarlo.
 *
 * No se filtran: se marcan. Quien ve cuarenta productos en el albarán y doce en la lista piensa
 * que falta información, y deja de fiarse de la pantalla.
 */
export function marcarYaConfigurados(candidatos = [], existentes = []) {
  const porClave = new Map();
  for (const e of existentes || []) {
    const k = claveDeExistente(e);
    if (k && !porClave.has(k)) porClave.set(k, e);
  }
  return (candidatos || []).map((c) => {
    const ya = porClave.get(claveCotejo(c.clave_producto || c.nombre));
    return ya
      ? { ...c, ya_esta: true, ya_id: ya.id, ya_inactivo: !ya.activo }
      : { ...c, ya_esta: false, ya_id: null, ya_inactivo: false };
  });
}

/**
 * Junta las dos fuentes sin que un producto salga dos veces.
 *
 * GANA EL DE OTRO LOCAL. Trae unidad y stock decididos por una persona; lo de la factura es una
 * deducción nuestra. Y si además se le compra, se le añade la prueba (cuántas veces, cuándo):
 * eso es lo que hace que se entienda por qué está ahí.
 *
 * Si salieran en las dos listas, se podría marcar el mismo producto dos veces y crear justo el
 * duplicado que todo esto intenta evitar.
 */
export function fusionarFuentes(deFacturas = [], deOtrosLocales = []) {
  const compras = new Map();
  for (const f of deFacturas || []) {
    const k = claveCotejo(f.clave_producto || f.nombre);
    if (k) compras.set(k, f);
  }
  const otros = (deOtrosLocales || []).map((p) => {
    const c = compras.get(claveCotejo(p.clave_producto || p.nombre));
    if (c) compras.delete(claveCotejo(p.clave_producto || p.nombre));
    return { ...p, veces: c ? c.veces : null, ultima: c ? c.ultima : null };
  });
  return { otrosLocales: otros, facturas: [...compras.values()] };
}

const numONull = (v) => { if (v === "" || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * Prepara un lote antes de tocar la base: qué se crea, qué se reactiva, qué sobra y qué está mal.
 *
 * Se llama ANTES de abrir la transacción a propósito. Un nombre vacío tiene que devolver un 400
 * diciendo qué línea, con CERO escrituras: quien tiene la lista delante puede arreglarlo. Lo que
 * no puede pasar es que entren treinta y siete productos y falten tres sin saber cuáles.
 *
 * «Ya existe» NO es un error, es lo normal: dos pestañas abiertas, un doble clic, un panel que
 * lleva un rato abierto. Se omite, se cuenta y se dice.
 */
export function normalizarLote(lineas = [], { existentes = [], stockDefecto = 0, tope = TOPE_LOTE } = {}) {
  const errores = [], omitidos = [], reactivar = [], altas = [];
  if (!Array.isArray(lineas) || !lineas.length) return { altas, reactivar, omitidos, errores: [{ linea: 0, motivo: "El lote está vacío" }] };
  if (lineas.length > tope) return { altas, reactivar, omitidos, errores: [{ linea: 0, motivo: `Demasiados productos de una vez (${lineas.length}, el tope son ${tope})` }] };

  const yaEn = new Map();
  for (const e of existentes || []) { const k = claveDeExistente(e); if (k && !yaEn.has(k)) yaEn.set(k, e); }
  const enEsteLote = new Set();

  lineas.forEach((l, i) => {
    const nombre = String((l && l.nombre) || "").trim();
    if (!nombre) { errores.push({ linea: i + 1, nombre: "", motivo: "Falta el nombre" }); return; }
    // Vacío significa «no lo dijeron» y cae en el de siempre; un valor que no existe significa
    // que alguien manda basura, y eso sí se rechaza.
    const unidad = String((l && l.unidad) || "").trim() || "unidades";
    if (!esUnidadValida(unidad)) { errores.push({ linea: i + 1, nombre, motivo: `Unidad desconocida: ${unidad}` }); return; }
    if (!esMMDDValido(l.temporada_inicio || "") || !esMMDDValido(l.temporada_fin || "")) {
      errores.push({ linea: i + 1, nombre, motivo: "Fechas de temporada inválidas (MM-DD)" }); return;
    }

    const clave = String((l && l.clave_producto) || "").trim() || claveInvProducto(nombre);
    const cotejo = claveCotejo(clave);
    // Dos fuentes distintas pueden traer el mismo producto: se queda el primero, en silencio.
    // No es un error del usuario, es cómo son los datos.
    if (enEsteLote.has(cotejo)) { omitidos.push({ nombre, motivo: "repetido_en_el_lote" }); return; }
    enEsteLote.add(cotejo);

    const ya = yaEn.get(cotejo);
    if (ya && ya.activo) { omitidos.push({ nombre, motivo: "ya_existe" }); return; }
    if (ya) { reactivar.push({ id: ya.id, nombre: ya.nombre }); return; }

    altas.push({
      nombre, unidad, clave_producto: clave,
      stock_objetivo: numONull(l.stock_objetivo) ?? (Number(stockDefecto) || 0),
      stock_minimo: numONull(l.stock_minimo) ?? 0,
      temporada_stock: numONull(l.temporada_stock),
      temporada_inicio: String(l.temporada_inicio || "").trim() || null,
      temporada_fin: String(l.temporada_fin || "").trim() || null,
      observaciones: String(l.observaciones || "").trim() || null,
    });
  });

  return { altas, reactivar, omitidos, errores };
}
