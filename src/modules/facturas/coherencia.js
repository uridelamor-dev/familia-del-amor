// Facturas — comprobar que lo leído se sostiene. Lógica PURA.
//
// LA IDEA DE FONDO: no vamos a conseguir que la lectura no falle nunca. Ni con visión, ni
// pasándolo a texto, ni con un modelo mejor. Lo que sí se puede conseguir es que NINGÚN fallo
// pase desapercibido, y eso no se hace leyendo mejor: se hace comprobando lo leído contra
// cosas que tienen que cumplirse sí o sí.
//
// Todas las comprobaciones de aquí son DETERMINISTAS: aritmética y datos que ya tenemos. No
// dependen de ningún modelo, así que no fallan cuando el modelo falla — que es justo cuando
// hacen falta.
//
// Y ninguna corrige nada. Avisan. Corregir un importe «porque no cuadra» es inventarse un dato
// contable, y un dato inventado que parece revisado es peor que uno mal que se nota.

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const red = (x) => Math.round(x * 100) / 100;

/** Tolerancia por redondeos: un céntimo arriba o abajo es normal en cualquier factura. */
export const TOLERANCIA = 0.02;

/**
 * 1) BASE + IVA = TOTAL.
 * Es la comprobación con mejor relación esfuerzo/captura que hay: si los tres números no
 * cuadran, uno está mal leído, y no hace falta saber cuál para avisar.
 */
export function cuadraTotal(d) {
  const base = n(d.base_imponible), iva = n(d.cuota_iva), total = n(d.total);
  if (base == null || total == null) return null;          // falta un dato: no se afirma nada
  const suma = red(base + (iva || 0));
  const dif = red(suma - total);
  if (Math.abs(dif) <= TOLERANCIA) return null;
  return {
    clave: "descuadre_total",
    grave: true,
    texto: `Base ${base.toFixed(2)} € + IVA ${(iva || 0).toFixed(2)} € = ${suma.toFixed(2)} €, pero el total dice ${total.toFixed(2)} € (${dif > 0 ? "+" : ""}${dif.toFixed(2)} €). Alguno de los tres está mal leído.`,
  };
}

/**
 * 2) La cuota de IVA cuadra con su porcentaje.
 * Caza el caso en que el porcentaje se lee bien y la cuota mal, o al revés — que el chequeo
 * anterior no distingue si el total también viene mal.
 */
export function cuadraIva(d) {
  const base = n(d.base_imponible), iva = n(d.cuota_iva), pct = n(d.porcentaje_iva);
  if (base == null || iva == null || pct == null || pct <= 0) return null;
  const esperada = red(base * pct / 100);
  const dif = red(iva - esperada);
  // Margen algo mayor: hay facturas con varios tipos de IVA en las que el porcentaje que se
  // guarda es solo el principal, y ahí un descuadre pequeño es normal, no un error.
  const margen = Math.max(0.05, Math.abs(base) * 0.005);
  if (Math.abs(dif) <= margen) return null;
  return {
    clave: "iva_no_cuadra",
    grave: false,
    texto: `El ${pct} % de ${base.toFixed(2)} € son ${esperada.toFixed(2)} €, pero la cuota dice ${iva.toFixed(2)} €. Puede ser una factura con varios tipos de IVA, o un número mal leído.`,
  };
}

/**
 * 3) Contra el historial del proveedor.
 *
 * `historial` = { nifs: [...], totales: [...] } de las facturas anteriores de ese proveedor.
 * Dos señales:
 *   · El NIF no es el de siempre. Un proveedor no cambia de NIF; lo que cambia es la lectura.
 *   · El importe se sale muchísimo de lo habitual. Es el caso del punto decimal perdido:
 *     una factura de 400 € leída como 40.000 € se paga sin que nadie lo mire.
 */
export function contraHistorial(d, historial = {}) {
  const avisos = [];
  const nifs = (historial.nifs || []).filter(Boolean);
  const nif = String(d.nif_proveedor || d.nif || "").replace(/[\s.\-/]/g, "").toUpperCase();
  if (nif && nifs.length >= 2 && !nifs.includes(nif)) {
    avisos.push({
      clave: "nif_distinto", grave: false,
      texto: `Este proveedor siempre ha venido con el NIF ${nifs[0]} y esta vez pone ${nif}. Un proveedor no cambia de NIF: lo que suele cambiar es la lectura.`,
    });
  }

  const totales = (historial.totales || []).map(n).filter((x) => x != null && x > 0);
  const total = n(d.total);
  if (total != null && total > 0 && totales.length >= 4) {
    const orden = [...totales].sort((a, b) => a - b);
    const mediana = orden[Math.floor(orden.length / 2)];
    // Un factor 20 sobre la mediana no es «un mes fuerte»: es un punto decimal perdido o una
    // cifra de más. Se compara contra la mediana y no contra la media porque una sola factura
    // enorme ya leída mal desplazaría la media y taparía a las siguientes.
    if (mediana > 0 && total > mediana * 20) {
      avisos.push({
        clave: "importe_raro", grave: true,
        texto: `Son ${total.toFixed(2)} € y de este proveedor lo normal son ${mediana.toFixed(2)} €. Comprueba que no sobre una cifra o falte una coma.`,
      });
    }
  }
  return avisos;
}

/**
 * Todas las comprobaciones juntas.
 *   → { avisos: [...], grave: bool }
 * `grave` marca lo que no debería pagarse sin mirarlo: un descuadre aritmético o un importe
 * fuera de escala. El resto es «échale un ojo».
 */
export function revisarCoherencia(datos = {}, historial = {}) {
  const avisos = [cuadraTotal(datos), cuadraIva(datos), ...contraHistorial(datos, historial)].filter(Boolean);
  return { avisos, grave: avisos.some((a) => a.grave) };
}

/** Los textos, para guardarlos o enseñarlos. */
export const textosDe = (avisos = []) => avisos.map((a) => a.texto);
