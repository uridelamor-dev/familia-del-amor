// Facturas — detectar la misma factura subida dos veces. Lógica PURA.
//
// Ya se cazaban dos casos: el MISMO archivo (hash idéntico) y el mismo proveedor con el mismo
// número. Los dos son certezas. Lo que faltaba es el caso de en medio, que es el que se cuela:
// la misma factura fotografiada dos veces desde ángulos distintos, o subida una vez en PDF y
// otra en foto. El archivo cambia, y si el número se lee mal —un 8 por un 3, un 0 que se
// pierde— tampoco coincide. Entra dos veces y el gasto del mes sube sin que nadie lo note.
//
// LA REGLA DE FONDO: ante la duda NO se decide sola. Una factura contada dos veces infla el
// gasto; una descartada por error lo baja. Los dos números son falsos, así que en vez de
// elegir cuál falla se aparta, se dice cuánto se ha apartado y lo decide una persona.

/** Solo dígitos: «FRA-0012/26» y «12/26» comparten el 001226 → 1226. */
const soloDigitos = (s) => String(s || "").replace(/\D/g, "").replace(/^0+/, "");

const norm = (s) => String(s || "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** Distancia de edición, acotada: solo interesa saber si difieren en 1 o 2 caracteres. */
export function distancia(a, b, tope = 3) {
  a = String(a || ""); b = String(b || "");
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let mejor = i;
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(prev[j] + 1, fila[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (fila[j] < mejor) mejor = fila[j];
    }
    if (mejor > tope) return tope + 1;   // ya no puede bajar: se corta
    prev = fila;
  }
  return prev[b.length];
}

const dias = (a, b) => {
  const t1 = Date.parse(String(a || "").slice(0, 10)), t2 = Date.parse(String(b || "").slice(0, 10));
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.abs(Math.round((t1 - t2) / 86400000));
};

/** Dos importes son el mismo si difieren menos de un céntimo. */
const mismoImporte = (a, b) => {
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) < 0.005;
};

export const MISMO_PROVEEDOR = (a, b) => {
  // El NIF manda: es el único dato que no depende de cómo se escriba el nombre.
  const na = String(a.nif || "").replace(/[\s.-]/g, "").toUpperCase();
  const nb = String(b.nif || "").replace(/[\s.-]/g, "").toUpperCase();
  if (na && nb) return na === nb;
  return !!norm(a.proveedor) && norm(a.proveedor) === norm(b.proveedor);
};

/**
 * ¿Se parecen lo bastante como para sospechar? Devuelve el veredicto y POR QUÉ, que es lo que
 * luego se le enseña a la persona: «mismo proveedor, mismo importe, un día de diferencia y el
 * número difiere en un carácter» se decide en dos segundos; un porcentaje, no.
 *
 *   → { veredicto: "duplicada" | "duda" | "distinta", motivos: [...], puntos }
 */
export function comparar(a, b, { ventanaDias = 10 } = {}) {
  const motivos = [];
  if (!MISMO_PROVEEDOR(a, b)) return { veredicto: "distinta", motivos: [], puntos: 0 };
  motivos.push("mismo proveedor");

  const numA = soloDigitos(a.numero_factura), numB = soloDigitos(b.numero_factura);
  const numIgual = !!numA && numA === numB;
  const numParecido = !numIgual && !!numA && !!numB && distancia(numA, numB) <= 1
    && Math.max(numA.length, numB.length) >= 3;

  const impIgual = mismoImporte(a.total, b.total);
  const baseIgual = mismoImporte(a.base_imponible, b.base_imponible);
  const d = dias(a.fecha, b.fecha);
  const fechaIgual = d === 0;
  const fechaCerca = d != null && d > 0 && d <= ventanaDias;

  if (numIgual) motivos.push("mismo número de factura");
  else if (numParecido) motivos.push(`el número difiere en un carácter (${a.numero_factura || "?"} / ${b.numero_factura || "?"})`);
  if (impIgual) motivos.push(`mismo importe (${Number(a.total).toFixed(2)} €)`);
  else if (baseIgual) motivos.push("misma base imponible pero distinto total");
  if (fechaIgual) motivos.push("misma fecha");
  else if (fechaCerca) motivos.push(`${d} ${d === 1 ? "día" : "días"} de diferencia`);

  let puntos = 0;
  if (numIgual) puntos += 4;
  else if (numParecido) puntos += 2;
  if (impIgual) puntos += 3;
  else if (baseIgual) puntos += 1;
  if (fechaIgual) puntos += 2;
  else if (fechaCerca) puntos += 1;

  // CERTEZA: número, importe Y fecha. Los tres. Con dos de tres se podría afirmar casi
  // siempre, pero «casi» aquí significa tirar una factura buena de vez en cuando, y eso no se
  // ve: desaparece del gasto y nadie la echa en falta. Si algo no cuadra, se pregunta.
  if (numIgual && impIgual && (fechaIgual || d == null)) {
    return { veredicto: "duplicada", motivos, puntos };
  }

  // Sin importe igual no hay sospecha que valga: dos facturas del mismo proveedor el mismo día
  // son lo más normal del mundo (una comida y una entrega). Lo que las convierte en la misma
  // es que coincida el dinero.
  if (!impIgual) return { veredicto: "distinta", motivos, puntos };

  // Mismo importe + (mismo día o número casi igual) → que lo mire una persona.
  if (fechaIgual || fechaCerca || numParecido) return { veredicto: "duda", motivos, puntos };

  return { veredicto: "distinta", motivos, puntos };
}

/**
 * Busca la factura ya guardada que más se parece a la que entra.
 * `candidatas` deben venir ya acotadas por proveedor y fecha desde la consulta: aquí no se
 * recorre la tabla entera.
 */
export function buscarParecida(nueva, candidatas = [], opts = {}) {
  let mejor = null;
  for (const c of candidatas) {
    if (nueva.id != null && c.id === nueva.id) continue;
    const r = comparar(nueva, c, opts);
    if (r.veredicto === "distinta") continue;
    // Una certeza gana siempre; entre dudas, la de más puntos.
    const gana = !mejor
      || (r.veredicto === "duplicada" && mejor.veredicto !== "duplicada")
      || (r.veredicto === mejor.veredicto && r.puntos > mejor.puntos);
    if (gana) mejor = { ...r, contra: c };
  }
  return mejor;
}

/** Cómo se cuenta una factura según cómo quedó la sospecha. */
export const CUENTA_EN_TOTALES = (dupEstado) => String(dupEstado || "") !== "duda";

/** Frase corta para la lista de pendientes. */
export function resumenMotivos(motivos = []) {
  if (!motivos.length) return "";
  const s = motivos.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
