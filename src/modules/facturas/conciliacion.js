// Compras — conciliar albaranes con facturas. Lógica PURA.
//
// EL PROBLEMA REAL: el proveedor deja un albarán con cada entrega y a fin de mes manda UNA
// factura que agrupa varios. Hoy los dos documentos entran por el mismo sitio y se quedan
// sueltos, así que no se sabe (a) si la factura recoge todos los albaranes del mes, ni (b) si
// cobra algo que no se entregó. Es donde se pierde dinero sin que nadie lo vea.
//
// DOS DIFERENCIAS CON EL DETECTOR DE DUPLICADOS, que se parece pero no es lo mismo:
//   · Ahí se buscaban dos documentos IGUALES; aquí, uno que SUMA varios. Una factura de 1.240 €
//     puede corresponder a tres albaranes de 400 + 500 + 340.
//   · Ahí sobraba con el importe; aquí el importe de un albarán casi nunca coincide con el de
//     la factura, y hay que probar combinaciones.
//
// LA REGLA DE FONDO, otra vez: no se concilia nada solo. Se PROPONE, con el porqué, y lo
// confirma una persona. Dar por buena una conciliación equivocada es peor que no tener
// ninguna: se paga una factura creyendo que está comprobada.

import { MISMO_PROVEEDOR } from "./duplicados.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const cent = (v) => Math.round(num(v) * 100);   // en céntimos: sumar euros en coma flotante arrastra restos
const red = (x) => Math.round(x * 100) / 100;

const dias = (a, b) => {
  const t1 = Date.parse(String(a || "").slice(0, 10)), t2 = Date.parse(String(b || "").slice(0, 10));
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round((t1 - t2) / 86400000);
};

/** Tolerancia: un céntimo por documento, por los redondeos de IVA de cada albarán. */
export const margen = (n) => Math.max(2, n);

/**
 * Busca el subconjunto de albaranes cuya suma da el importe de la factura.
 *
 * Es el problema de la mochila, que es exponencial: con 30 albaranes hay mil millones de
 * combinaciones. Por eso se acota — `maxAlbaranes` candidatos y `maxCombinacion` por grupo— y
 * si no se puede probar del todo se DICE (`acotado: true`) en vez de afirmar que no hay
 * combinación. «No la he encontrado» y «no existe» no son lo mismo, y confundirlos aquí
 * llevaría a rehacer a mano un trabajo que sí estaba.
 */
export function buscarCombinacion(albaranes, objetivoCent, { maxCombinacion = 6, tolerancia = 2 } = {}) {
  const items = albaranes.map((a, i) => ({ i, c: cent(a.total) })).filter((x) => x.c > 0);
  let mejor = null, acotado = false, vistas = 0;
  const TOPE_VISITAS = 200000;   // ~0,2 s: pasado eso se contesta «no lo sé», no «no hay»

  // Se prueba por TAMAÑOS: primero si un solo albarán da el total, luego parejas, luego
  // tríos… y se para en cuanto uno cuadra. Así se prefiere siempre la explicación más simple:
  // una factura que cuadra con dos albaranes es más creíble que otra que cuadra con seis, y
  // buscando «la primera que sume» salía la de seis solo por el orden en que se recorrían.
  const buscarTam = (tam, desde, elegidos, suma) => {
    if (vistas++ > TOPE_VISITAS) { acotado = true; return false; }
    if (elegidos.length === tam) {
      const dif = Math.abs(suma - objetivoCent);
      if (dif <= tolerancia) {
        const cand = { indices: [...elegidos], suma, dif, exacta: dif === 0 };
        if (!mejor || cand.dif < mejor.dif) mejor = cand;
        return cand.exacta;
      }
      return false;
    }
    if (suma > objetivoCent + tolerancia) return false;   // los importes son positivos: ya se pasó
    for (let k = desde; k < items.length; k++) {
      elegidos.push(items[k].i);
      const ok = buscarTam(tam, k + 1, elegidos, suma + items[k].c);
      elegidos.pop();
      if (ok) return true;
    }
    return false;
  };

  for (let tam = 1; tam <= Math.min(maxCombinacion, items.length); tam++) {
    if (buscarTam(tam, 0, [], 0)) break;
    if (acotado) break;
  }
  return mejor ? { ...mejor, acotado } : { indices: [], acotado };
}

/**
 * Propone, para una factura, qué albaranes suyos la componen.
 *
 *   → { estado, albaranes: [...], motivos: [...], diferencia }
 *
 * `estado`:
 *   "cuadra"    — la suma da el total, al céntimo. Se propone confirmar.
 *   "parcial"   — hay albaranes del proveedor en el periodo pero no suman el total. Es la
 *                 señal útil: o falta un albarán, o la factura cobra algo de más.
 *   "sin-albaranes" — no hay ninguno con el que comparar. No es un error: hay proveedores que
 *                 no dejan albarán.
 */
export function proponerConciliacion(factura, albaranes, { ventanaDias = 45, tolerancia = 2 } = {}) {
  const suyos = (albaranes || []).filter((a) => {
    if (!MISMO_PROVEEDOR(factura, a)) return false;
    const d = dias(factura.fecha, a.fecha);
    // El albarán es ANTERIOR a la factura (se entrega y luego se factura). Se admite algún
    // día después por si la factura se fecha antes de la última entrega del mes.
    return d == null || (d >= -3 && d <= ventanaDias);
  });
  if (!suyos.length) {
    return { estado: "sin-albaranes", albaranes: [], motivos: ["No hay albaranes de este proveedor en el periodo"], diferencia: 0 };
  }

  const objetivo = cent(factura.total);
  const r = buscarCombinacion(suyos, objetivo, { tolerancia });
  const elegidos = r.indices.map((i) => suyos[i]);
  const sumaSel = elegidos.reduce((s, a) => s + cent(a.total), 0);
  const sumaTodos = suyos.reduce((s, a) => s + cent(a.total), 0);

  if (elegidos.length && Math.abs(sumaSel - objetivo) <= tolerancia) {
    const motivos = [`${elegidos.length} ${elegidos.length === 1 ? "albarán suma" : "albaranes suman"} exactamente el total de la factura`];
    if (suyos.length > elegidos.length) motivos.push(`quedan ${suyos.length - elegidos.length} sin usar en el periodo`);
    return { estado: "cuadra", albaranes: elegidos, motivos, diferencia: 0, acotado: !!r.acotado };
  }

  const dif = (sumaTodos - objetivo) / 100;
  const motivos = [`${suyos.length} ${suyos.length === 1 ? "albarán" : "albaranes"} del proveedor en el periodo`,
    dif > 0 ? `suman ${(sumaTodos / 100).toFixed(2)} €, ${dif.toFixed(2)} € MÁS que la factura`
            : `suman ${(sumaTodos / 100).toFixed(2)} €, ${Math.abs(dif).toFixed(2)} € MENOS que la factura`];
  if (r.acotado) motivos.push("hay demasiadas combinaciones para probarlas todas: puede haber una que cuadre");
  return { estado: "parcial", albaranes: suyos, motivos, diferencia: Math.round(dif * 100) / 100, acotado: !!r.acotado };
}

/**
 * Estado de una factura YA conciliada, según lo que sumen sus albaranes.
 *
 * Conciliar no es todo o nada. Si de una factura de 100 € ha llegado un albarán de 40, eso ya
 * es información buena: esos 40 están comprobados y quedan 60 esperando. Obligar a esperar a
 * tenerlo todo para poder marcar algo hace que no se marque nunca, y el trabajo ya hecho se
 * pierde.
 *
 *   → { estado: "conciliada" | "conciliada-parcial", ligado, falta }
 */
export function estadoConciliada(factura, ligados = [], { tolerancia = 2 } = {}) {
  const objetivo = cent(factura && factura.total);
  const suma = ligados.reduce((s, a) => s + cent(a.total), 0);
  const falta = red((objetivo - suma) / 100);
  if (Math.abs(objetivo - suma) <= tolerancia) {
    return { estado: "conciliada", ligado: red(suma / 100), falta: 0 };
  }
  return { estado: "conciliada-parcial", ligado: red(suma / 100), falta };
}

/** Resumen para la cabecera: cuántas cuadran, cuántas no y cuánto dinero hay en juego. */
export function resumenConciliacion(propuestas = []) {
  const c = { cuadran: 0, parciales: 0, sinAlbaranes: 0, importeParcial: 0, importeCuadra: 0 };
  c.aMedias = 0; c.importeAMedias = 0;
  for (const p of propuestas) {
    if (p.estado === "cuadra" || p.estado === "conciliada") { c.cuadran++; c.importeCuadra += num(p.factura && p.factura.total); }
    // Lo conciliado a medias cuenta aparte: está bien encaminado, pero sigue esperando papel.
    else if (p.estado === "conciliada-parcial") { c.aMedias++; c.importeAMedias += num(p.falta); }
    else if (p.estado === "parcial") { c.parciales++; c.importeParcial += num(p.factura && p.factura.total); }
    else c.sinAlbaranes++;
  }
  c.importeAMedias = Math.round(c.importeAMedias * 100) / 100;
  c.importeParcial = Math.round(c.importeParcial * 100) / 100;
  c.importeCuadra = Math.round(c.importeCuadra * 100) / 100;
  return c;
}
