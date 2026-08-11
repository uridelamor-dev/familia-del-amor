// Facturas — cuándo hay que pagar cada una. Lógica PURA.
//
// LA PREGUNTA QUE CONTESTA: «¿qué pago esta semana?». Hoy no se puede contestar. Sabemos
// cuánto se debe (14.000 €) y cuál es la factura más antigua sin pagar, pero eso no es
// accionable: un total de deuda no se paga, se pagan facturas con fecha.
//
// DE DÓNDE SALE LA FECHA, POR ORDEN:
//   1. Del PAPEL. Si la factura trae su vencimiento escrito, manda ese y no se discute: es lo
//      que el proveedor va a reclamar.
//   2. De lo PACTADO con ese proveedor (30 días, 60, contado…). Se guarda una vez por
//      proveedor y sirve para todas las suyas.
//   3. De ninguna parte: la factura se queda **sin fecha**, y se dice. No se inventa un
//      «30 días» por defecto: una fecha inventada se paga tarde o se paga dos veces, y encima
//      con la tranquilidad de que estaba puesta.
//
// Nada de esto decide pagos: ordena. Quien paga sigue siendo una persona.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const esISO = (s) => ISO.test(String(s || ""));

function addDias(iso, n) {
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ultimoDiaDeMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Redondea al día de pago del proveedor. Muchos cobran «a 30 días, pero pagando los días 10»:
 * sin esto, el vencimiento saldría un 3 y el dinero saldría de verdad el 10, y la previsión de
 * la semana estaría mal por sistema.
 *
 * Si el mes no tiene ese día (un 31 en noviembre), se paga el último: adelantar al 1 del mes
 * siguiente sería moverlo de mes y descuadrar la previsión.
 */
function alDiaDePago(iso, diaPago) {
  const dia = Number(diaPago);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return iso;
  let [y, m, d] = iso.split("-").map(Number);
  if (d > dia) { m += 1; if (m > 12) { m = 1; y += 1; } }   // ya pasó este mes: al siguiente
  const dEfectivo = Math.min(dia, ultimoDiaDeMes(y, m));
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(dEfectivo).padStart(2, "0")}`;
}

/**
 * La fecha de vencimiento de una factura y DE DÓNDE sale, que importa tanto como la fecha:
 * una calculada se puede recalcular si cambian las condiciones; una leída del papel, no.
 *
 *   → { vencimiento: "YYYY-MM-DD"|null, origen: "factura"|"proveedor"|null }
 */
export function calcularVencimiento({ fecha, vencimientoLeido, condiciones } = {}) {
  if (esISO(vencimientoLeido)) return { vencimiento: String(vencimientoLeido).slice(0, 10), origen: "factura" };
  if (!esISO(fecha) || !condiciones) return { vencimiento: null, origen: null };

  const dias = Number(condiciones.dias);
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) return { vencimiento: null, origen: null };

  const base = addDias(String(fecha).slice(0, 10), dias);
  return { vencimiento: alDiaDePago(base, condiciones.dia_pago), origen: "proveedor" };
}

/** Días de HOY a la fecha: negativo = ya pasó. */
export function diasHasta(hoy, fecha) {
  if (!esISO(hoy) || !esISO(fecha)) return null;
  return Math.round((Date.parse(fecha + "T00:00:00Z") - Date.parse(hoy + "T00:00:00Z")) / 86400000);
}

/**
 * En qué situación está una factura. Los estados son los que se usan para decidir, no los que
 * quedan bonitos: lo primero es lo que ya se debía, y lo último lo que no tiene fecha —que no
 * es «no urgente», es «no se sabe», y se mira aparte—.
 */
export function estadoPago({ vencimiento, pagado, fecha } = {}, hoy) {
  if (pagado) return { estado: "pagada", orden: 5, dias: null, texto: "Pagada" };
  if (!esISO(vencimiento)) {
    return { estado: "sin_fecha", orden: 4, dias: null,
      texto: "Sin fecha de pago", pista: "No sabemos cuándo vence: ponle condiciones al proveedor o míralo en el papel." };
  }
  const d = diasHasta(hoy, vencimiento);
  if (d == null) return { estado: "sin_fecha", orden: 4, dias: null, texto: "Sin fecha de pago" };
  if (d < 0) return { estado: "vencida", orden: 0, dias: d, texto: `Vencida hace ${-d} ${-d === 1 ? "día" : "días"}` };
  if (d === 0) return { estado: "hoy", orden: 1, dias: 0, texto: "Vence hoy" };
  if (d <= 7) return { estado: "semana", orden: 2, dias: d, texto: `Vence en ${d} ${d === 1 ? "día" : "días"}` };
  return { estado: "proxima", orden: 3, dias: d, texto: `Vence el ${vencimiento}` };
}

/** Los grupos de la pantalla de pagos, en el orden en que se miran. */
export const GRUPOS_PAGO = [
  { clave: "vencida", titulo: "Ya vencidas", nota: "Deberían estar pagadas. Cada día que pasa es una llamada del proveedor." },
  { clave: "hoy", titulo: "Vencen hoy", nota: "" },
  { clave: "semana", titulo: "Esta semana", nota: "Los próximos 7 días." },
  { clave: "proxima", titulo: "Más adelante", nota: "" },
  { clave: "sin_fecha", titulo: "Sin fecha de pago", nota: "No es que no corran prisa: es que no sabemos cuándo vencen." },
];

/**
 * Reparte las facturas sin pagar por urgencia y suma cada grupo. Devuelve SIEMPRE los cinco
 * grupos —aunque estén vacíos— porque un grupo que desaparece se lee como «eso ya está», y
 * «sin fecha» vacío no es lo mismo que «sin fecha» que no se ha mirado.
 */
export function agruparPagos(filas = [], hoy) {
  const grupos = GRUPOS_PAGO.map((g) => ({ ...g, facturas: [], total: 0, n: 0 }));
  const porClave = new Map(grupos.map((g) => [g.clave, g]));
  for (const f of filas) {
    const e = estadoPago(f, hoy);
    if (e.estado === "pagada") continue;
    const g = porClave.get(e.estado);
    if (!g) continue;
    g.facturas.push({ ...f, _estado: e });
    g.total += Number(f.total) || 0;
    g.n += 1;
  }
  for (const g of grupos) {
    // Dentro de cada grupo, lo que antes vence primero. Sin fecha, la más antigua arriba.
    g.facturas.sort((a, b) => String(a.vencimiento || a.fecha || "").localeCompare(String(b.vencimiento || b.fecha || "")));
    g.total = Math.round(g.total * 100) / 100;
  }
  return grupos;
}

/** El titular de la pantalla: lo que hay que pagar ya y lo que viene esta semana. */
export function resumenPagos(grupos = []) {
  const de = (c) => grupos.find((g) => g.clave === c) || { n: 0, total: 0 };
  const v = de("vencida"), h = de("hoy"), s = de("semana"), sf = de("sin_fecha");
  return {
    vencidas: { n: v.n, total: v.total },
    // «Esta semana» incluye lo de hoy: quien pregunta «qué pago esta semana» cuenta hoy dentro.
    semana: { n: h.n + s.n, total: Math.round((h.total + s.total) * 100) / 100 },
    sinFecha: { n: sf.n, total: sf.total },
    total: Math.round(grupos.reduce((t, g) => t + g.total, 0) * 100) / 100,
  };
}

/** Cómo se dice una condición de pago en una línea. */
export function textoCondiciones(c) {
  if (!c || !Number.isInteger(Number(c.dias))) return "Sin condiciones";
  const d = Number(c.dias);
  const base = d === 0 ? "Al contado" : `A ${d} días`;
  const dia = Number(c.dia_pago);
  return Number.isInteger(dia) && dia >= 1 && dia <= 31 ? `${base}, pagando los días ${dia}` : base;
}
