// Inventarios — las unidades en las que se cuenta, y cómo se adivinan de una factura. PURO.
//
// La lista vivía SOLO en el navegador (`INV_UNIDADES`, public/panel/app.js), así que el servidor
// aceptaba cualquier texto como unidad: una petición a mano podía dejar un producto en «cajitas»
// y nadie se enteraba hasta que el pedido salía raro. Subirla aquí es lo que permite validarla.

/** Las unidades en las que se cuenta un producto. Espejo de INV_UNIDADES en el panel. */
export const UNIDADES = ["unidades", "cajas", "botellas", "kilos", "bolsas", "barriles", "litros", "packs"];

export function esUnidadValida(u) { return UNIDADES.includes(String(u || "")); }

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

// Lo que se ve escrito en las facturas. No es una lista cerrada: es lo observado.
const EQUIVALE = new Map([
  ["ud", "unidades"], ["uds", "unidades"], ["u", "unidades"], ["un", "unidades"], ["unid", "unidades"],
  ["unidad", "unidades"], ["unidades", "unidades"], ["pza", "unidades"], ["pzas", "unidades"],
  ["pieza", "unidades"], ["piezas", "unidades"],
  ["kg", "kilos"], ["kgs", "kilos"], ["kilo", "kilos"], ["kilos", "kilos"], ["kgr", "kilos"],
  ["l", "litros"], ["lt", "litros"], ["lts", "litros"], ["ltr", "litros"], ["litro", "litros"], ["litros", "litros"],
  ["cj", "cajas"], ["cja", "cajas"], ["caja", "cajas"], ["cajas", "cajas"],
  ["bot", "botellas"], ["bt", "botellas"], ["btl", "botellas"], ["botella", "botellas"], ["botellas", "botellas"],
  ["bls", "bolsas"], ["bolsa", "bolsas"], ["bolsas", "bolsas"],
  ["barril", "barriles"], ["barriles", "barriles"],
  ["pk", "packs"], ["pack", "packs"], ["packs", "packs"],
]);

/**
 * La unidad de la factura, traducida a una de las nuestras.
 *
 * DEVUELVE null CUANDO NO LA RECONOCE, y eso es lo importante. Caer en «unidades» por defecto
 * sería lo cómodo y lo peligroso: quedaría un dato inventado con la misma pinta que uno leído, y
 * el stock necesario se pondría sobre una unidad que nadie ha visto.
 */
export function unidadDeFactura(u) {
  const k = norm(u);
  if (!k) return null;
  return EQUIVALE.get(k) || (UNIDADES.includes(k) ? k : null);
}

/**
 * Qué unidad se propone para un producto, a partir de TODAS las que traen sus facturas.
 *
 * Una sola y reconocida → esa. Varias distintas → null: con «kg» en unas facturas y «ud» en
 * otras, elegir cualquiera de las dos es inventarse el dato. Es la misma regla que ya aplica
 * `grupoDeSQL` en facturas, y por el mismo motivo.
 */
export function unidadSugerida(unidades) {
  const vistas = new Set((unidades || []).map(unidadDeFactura).filter(Boolean));
  return vistas.size === 1 ? [...vistas][0] : null;
}
