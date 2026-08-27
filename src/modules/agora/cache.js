// Guardar lo que cuesta pedir. PURO.
//
// EL CASO: los importes de ventas por local tardaban en aparecer, en el Dashboard y en Ágora.
// La causa no era la consulta: era que la caché vivía EN MEMORIA. En Replit el proceso se
// reinicia a menudo —cada despliegue, y a veces solo—, así que estaba fría casi siempre y cada
// visita esperaba a que respondiera cada TPV, en serie y con veinte segundos de margen por
// local. Con ocho establecimientos eso es una pantalla en blanco durante mucho rato.
//
// La caché pasa a la base y se calienta sola cada cuarto de hora. Quien entra lee lo guardado
// al instante — y se le dice de cuándo es, que es la otra mitad: un número sin hora no se sabe
// si es de ahora o de ayer.

/** Cada cuánto se refresca sola. */
export const CADA_MIN = 15;

/** Hasta cuándo se sirve lo guardado aunque ya toque refrescarlo. */
export const SIRVE_HASTA_MIN = 90;

const ms = (m) => Math.max(1, m) * 60 * 1000;

/**
 * ¿Hay que ir a pedirlo otra vez?
 *
 * `forzar` es el botón «Actualizar»: ahí sí se espera, porque lo ha pedido alguien mirando.
 */
export function tocaRefrescar({ guardadoEn = null, ahora = null, cadaMin = CADA_MIN, forzar = false } = {}) {
  if (forzar) return true;
  const t = Date.parse(ahora || "");
  if (!Number.isFinite(t)) return false;        // sin reloj no se decide nada
  if (!guardadoEn) return true;                  // nunca se ha pedido
  const g = Date.parse(guardadoEn);
  if (!Number.isFinite(g)) return true;
  return t - g >= ms(cadaMin);
}

/**
 * ¿Sirve lo que hay guardado mientras se refresca?
 *
 * SÍ, y hasta bastante tarde. Un dato de hace media hora con su hora al lado es infinitamente
 * más útil que una pantalla girando: quien mira las ventas del día quiere el orden de magnitud,
 * y si necesita el minuto exacto tiene el botón de actualizar. Pasado el plazo largo ya no se
 * sirve: un número de anteayer presentado como «las ventas» sí engaña.
 */
export function sirveGuardado({ guardadoEn = null, ahora = null, hastaMin = SIRVE_HASTA_MIN } = {}) {
  const t = Date.parse(ahora || ""), g = Date.parse(guardadoEn || "");
  if (!Number.isFinite(t) || !Number.isFinite(g)) return false;
  return t - g <= ms(hastaMin);
}

/** La antigüedad en palabras, para poder decirla. */
export function edadEnPalabras({ guardadoEn = null, ahora = null } = {}) {
  const t = Date.parse(ahora || ""), g = Date.parse(guardadoEn || "");
  if (!Number.isFinite(t) || !Number.isFinite(g)) return null;
  const min = Math.max(0, Math.round((t - g) / 60000));
  if (min < 1) return "ahora mismo";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
}

/** La clave con la que se guarda cada cosa. Estable: si cambia, se pierde lo guardado. */
export const claveRango = (local, from, to) => `ventas_rango|${local || "*"}|${from}_${to}`;
export const CLAVE_VIVO = "ventas_vivo";
