// Reproduce lo que hace la CONSULTA de Productos (ver `comprasDeLocal` en server.js): una fila
// por producto, no una por compra. Vive en los tests y no en `src/` a propósito: en producción
// esto lo hace PostgreSQL, y tener dos implementaciones enviadas al servidor era justo el
// problema que se quitó de en medio.
//
// Sirve para seguir pudiendo probar con líneas de verdad las reglas que no se pueden perder:
// que un null no se convierta en cero, que dos locales fusionados den lo mismo que contados
// juntos, y que el diccionario agrupe lo que tiene que agrupar.
import { claveProducto, grupoDeSQL } from "../../src/modules/facturas/lineas.js";

export function agrupaComoLaBase(lineas = [], { alias = null } = {}) {
  const porClave = new Map();

  for (const l of lineas) {
    const propia = claveProducto(l.descripcion);
    if (!propia) continue;                       // la consulta descarta las líneas sin clave
    const canon = alias?.get?.(propia) || null;
    const clave = canon ? `p:${canon.id}` : propia;
    if (!porClave.has(clave)) porClave.set(clave, { clave, canon, filas: [] });
    porClave.get(clave).filas.push(l);
  }

  const filas = [...porClave.values()].map(({ clave, canon, filas }) => {
    // Como el ORDER BY de los array_agg: de la compra más reciente a la más antigua.
    const porFecha = [...filas].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
    const conPrecio = porFecha.filter((l) => l.precio_unitario != null);
    const num = (v) => (v == null ? null : Number(v));
    const precios = conPrecio.map((l) => Number(l.precio_unitario));

    return {
      clave,
      descripcion: canon ? canon.nombre : porFecha[0].descripcion,
      unificado: !!canon,
      proveedores: [...new Set(filas.map((l) => l.proveedor).filter(Boolean))],
      veces: filas.length,
      dudosas: filas.filter((l) => l.dudosa).length,
      concantidad: filas.filter((l) => l.cantidad != null).length,
      conimporte: filas.filter((l) => l.importe != null).length,
      cantidad: filas.some((l) => l.cantidad != null)
        ? Math.round(filas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0) * 1000) / 1000 : null,
      importe: filas.some((l) => l.importe != null)
        ? Math.round(filas.reduce((s, l) => s + (Number(l.importe) || 0), 0) * 100) / 100 : null,
      preciomin: precios.length ? Math.min(...precios) : null,
      preciomax: precios.length ? Math.max(...precios) : null,
      primera: filas.map((l) => l.fecha).filter(Boolean).sort()[0] || null,
      ultima: filas.map((l) => l.fecha).filter(Boolean).sort().slice(-1)[0] || null,
      precios: precios.slice(0, 40),
      precios_fechas: conPrecio.map((l) => l.fecha).slice(0, 40),
    };
  });

  // Igual que el ORDER BY importe DESC NULLS LAST de la consulta.
  return filas
    .sort((a, b) => (b.importe ?? -Infinity) - (a.importe ?? -Infinity))
    .map(grupoDeSQL);
}
