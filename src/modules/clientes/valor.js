// Cuánto vale un cliente, con la honestidad por delante. PURO.
//
// LO PRIMERO, PORQUE CONDICIONA TODO LO DEMÁS: **el gasto real por cliente no se puede saber**.
// El TPV no identifica a quien se sienta en la mesa y no da tickets individuales — solo el
// total del día por local (`ventas_diarias`). Así que lo de aquí es un REPARTO de la venta del
// día entre los comensales que había apuntados, y hay que llamarlo por su nombre en pantalla.
//
// EL ERROR QUE HAY QUE NO COMETER: parece natural calcular `personas × ticket_medio`. Está mal,
// y no por poco. Un *ticket* es UNA CUENTA, no un comensal: una mesa de cuatro paga una cuenta.
// Con un ticket medio de 60 €, esa fórmula da 240 € cuando se gastaron 60. El error es
// exactamente el tamaño medio de mesa —de dos a cuatro veces en un sitio de tapas—, así que un
// cliente con diez visitas saldría con «3.000 € gastados» en vez de 900. Y ese es justo el
// número con el que se decide a quién invitar a algo.
//
// La columna `ventas_diarias.comensales` existe y **vale 0 siempre** (el informe global de
// Ágora no lo trae), así que el gasto por comensal tampoco se puede leer: hay que estimarlo.
// Y como no hay un número correcto, se dan DOS y se enseña el intervalo.

/** Suelo y techo de cordura por comensal, en euros. */
export const PC_SUELO = 4;
export const PC_TECHO = 90;

/** Por debajo de esta proporción de visitas con datos de TPV, no se da cifra. */
export const COBERTURA_MINIMA = 0.5;

/**
 * Cuántas veces puede ser el techo mayor que el suelo antes de que el dato deje de servir.
 *
 * Un intervalo de «entre 200 y 840 €» es honesto —es de verdad lo que sabemos— y a la vez es
 * inútil para decidir nada: con esa anchura, el mismo cliente puede ser el mejor o uno del
 * montón. Pasa cuando muy poca gente reserva ese día, que es cuando las dos cotas se separan.
 * Ahí lo correcto no es enseñar el rango con letra pequeña: es decir que no se sabe.
 */
export const ANCHURA_MAXIMA = 3;

// OJO con `Number(null)`, que es 0 y no NaN: sin el primer filtro, un valor que falta se
// convierte en un 0 €, y un cero se lee como «no gasta nada» cuando lo cierto es «no lo
// sabemos». Es la misma distinción que sostiene todo este módulo.
const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const acotar = (v) => (v == null ? null : Math.min(Math.max(v, PC_SUELO), PC_TECHO));

/**
 * Gasto por comensal de un día concreto, en horquilla.
 *
 * → { min, max } o null si ese día no da para estimar nada.
 *
 * `ventas` y `tickets` son del TPV; `comensalesReservados` y `mesasReservadas` salen de las
 * reservas de ese día en ese local.
 *
 *  · el MÍNIMO sale de repartir el ticket medio entre el tamaño medio de mesa. Tira a la baja,
 *    porque quien no reserva suele venir en grupos más pequeños —dos en la barra son una cuenta
 *    y dos personas— y eso hace que la mesa media real sea menor que la de los que reservan.
 *  · el MÁXIMO sale de repartir TODA la venta del día entre los comensales apuntados. Tira al
 *    alza, porque les regala el gasto de todos los que entraron sin reservar.
 *
 * El de verdad está entre los dos. Cuál de los dos extremos se acerca más depende de cuánta
 * gente reserve en ese local, y eso no lo sabemos.
 *
 * EL TECHO QUE HACE FALTA, y esto salió al mirar datos de verdad: un día con 20 cuentas del
 * que solo una era reserva repartía los 1.200 € del día entre los 2 comensales de esa mesa, y
 * daba 600 € por cabeza. Absurdo, y el rango salía cinco veces más ancho que el mínimo.
 * La cota que sí se sostiene: **nadie gasta por cabeza más que el ticket medio**, porque toda
 * cuenta la paga al menos una persona. Es aritmética, no una suposición.
 */
export function porComensalDelDia({ ventas, tickets, comensalesReservados, mesasReservadas } = {}) {
  const v = num(ventas), t = num(tickets), c = num(comensalesReservados), m = num(mesasReservadas);
  if (!v || v <= 0 || !t || t <= 0 || !c || c <= 0 || !m || m <= 0) return null;

  const ticketMedio = v / t;
  const mesaMedia = c / m;
  const min = acotar(ticketMedio / mesaMedia);
  const max = acotar(Math.min(v / c, ticketMedio));
  // El acotado puede darles la vuelta en un día raro (ventas mínimas, muchas reservas). Se
  // ordenan en vez de devolver un intervalo del revés, que se leería como un error de cuentas.
  return min <= max ? { min, max } : { min: max, max: min };
}

/**
 * Lo que vale una visita: sus comensales por lo que se estima que gasta cada uno.
 *
 * → { min, max } o null si ese día no tiene datos de TPV.
 */
export function valorDeVisita({ personas, porComensal } = {}) {
  const p = num(personas);
  if (!p || p <= 0 || !porComensal) return null;
  return { min: p * porComensal.min, max: p * porComensal.max };
}

/**
 * El veredicto sobre el valor acumulado de una persona.
 *
 * → { min, max, fiable, cobertura, texto }
 *
 * `fiable` en falso NO significa «cero»: significa «no lo sabemos». La diferencia es todo, y
 * por eso el texto lo dice con palabras en vez de dejar un 0 € que se lee como «no gasta nada».
 * Pasa siempre en los locales sin TPV configurado y en los clientes de antes de que se
 * conectara Ágora, que son muchos.
 */
export function valorDe({ min, max, visitas, visitasConTpv } = {},
  { minimoCobertura = COBERTURA_MINIMA, anchuraMaxima = ANCHURA_MAXIMA } = {}) {
  const v = num(visitas) || 0;
  const conTpv = num(visitasConTpv) || 0;
  const cobertura = v > 0 ? conTpv / v : 0;
  const lo = num(min), hi = num(max);

  if (!v) return { min: null, max: null, fiable: false, cobertura: 0, texto: "Todavía no ha venido" };
  if (!conTpv || lo == null || hi == null) {
    return { min: null, max: null, fiable: false, cobertura,
      texto: "Sin datos de caja de esos días" };
  }
  // Demasiado ancho para servir de algo. Se dice, y no se da la cifra: un rango de cinco veces
  // deja al mismo cliente en «el mejor» o «uno del montón» según qué extremo se mire.
  const anchura = lo > 0 ? hi / lo : Infinity;
  if (anchura > anchuraMaxima) {
    return { min: lo, max: hi, fiable: false, cobertura, anchura,
      texto: "No se puede estimar: esos días reservó muy poca gente" };
  }
  const fiable = cobertura >= minimoCobertura;
  return {
    min: lo, max: hi, fiable, cobertura, anchura,
    texto: fiable ? rango(lo, hi)
      : `${rango(lo, hi)} (solo de ${conTpv} de sus ${v} visitas)`,
  };
}

/**
 * El intervalo en palabras, redondeado a decenas.
 *
 * SIN CÉNTIMOS, y es deliberado: un número con decimales se lee como medido, y esto es una
 * estimación repartida. «Entre 200 y 340 €» invita a leerlo como lo que es; «287,45 €» no.
 */
export function rango(min, max, { paso = 10 } = {}) {
  const a = num(min), b = num(max);
  if (a == null || b == null) return "—";
  const r = (x) => Math.round(x / paso) * paso;
  const ra = r(a), rb = r(b);
  if (ra === rb) return `unos ${ra} €`;
  return `entre ${ra} y ${rb} €`;
}

/**
 * Cómo se llama esto en pantalla. No es una florituras: es la diferencia entre un dato que se
 * entiende y uno que se malinterpreta.
 *
 * Reserva una persona y comen seis, y todo el valor de la mesa se le atribuye a quien reservó.
 * Como «lo que ha gastado» sería falso; como «lo que ha traído», es exactamente lo que mide.
 */
export const ETIQUETA_VALOR = "Valor de las mesas que ha traído";
export const NOTA_VALOR = "Estimado repartiendo la venta del día entre los comensales apuntados. "
  + "No es lo que gastó esta persona: el TPV no identifica al cliente.";
