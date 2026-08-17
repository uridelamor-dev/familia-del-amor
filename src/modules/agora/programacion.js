// Ágora — cuándo toca sincronizar las ventas. PURO.
//
// EL PROBLEMA: se pide «que se sincronice al entrar en el panel y cada 15 minutos». Lo primero,
// tal cual, significa que veinte personas abriendo el panel a la hora de comer lanzan veinte
// sincronizaciones a la vez contra ocho TPV. Y lo segundo, con un temporizador a pelo, se
// desincroniza del primero: una sync a mano en el minuto 14 provoca otra al minuto siguiente.
//
// La regla que resuelve las dos: NO «cada 15 minutos», sino «que nunca sea más viejo de 15
// minutos». Da igual quién pregunte —el temporizador, alguien entrando, el botón—: se mira la
// edad del último y se decide. Aquí solo vive esa decisión; lanzarla es cosa del servidor.

export const VENTANA_MS = 15 * 60 * 1000;

/** Cuántos minutos hace del último, o null si no hay o no se entiende. */
export function edadMinutos(lastSync, ahora = Date.now()) {
  const t = Date.parse(String(lastSync || ""));
  if (!Number.isFinite(t)) return null;
  return Math.round((ahora - t) / 60000);
}

/**
 * ¿Toca sincronizar?
 *
 * El orden importa: primero «hay una en curso» y después la antigüedad. `agora_last_sync` se
 * escribe al TERMINAR, así que durante una sync larga el valor sigue siendo viejo y, sin esta
 * comprobación primero, cada visita lanzaría otra encima.
 */
export function debeSincronizar({ lastSync, ahora = Date.now(), enCurso = false, ventanaMs = VENTANA_MS, forzar = false } = {}) {
  if (enCurso) return { sincronizar: false, motivo: "en-curso", edadMin: edadMinutos(lastSync, ahora) };
  if (forzar) return { sincronizar: true, motivo: "manual", edadMin: edadMinutos(lastSync, ahora) };

  const t = Date.parse(String(lastSync || ""));
  if (!Number.isFinite(t)) return { sincronizar: true, motivo: lastSync ? "fecha-ilegible" : "nunca", edadMin: null };

  const edadMs = ahora - t;
  // Marca en el futuro: el reloj de algún sitio va adelantado. Se trata como reciente para no
  // martillear, pero si el desfase pasa de una hora es que hay algo mal y se sincroniza igual;
  // si no, un reloj mal puesto congelaría las ventas para siempre.
  if (edadMs < 0) {
    return Math.abs(edadMs) > 60 * 60 * 1000
      ? { sincronizar: true, motivo: "fecha-futura", edadMin: Math.round(edadMs / 60000) }
      : { sincronizar: false, motivo: "reciente", edadMin: Math.round(edadMs / 60000) };
  }
  return edadMs >= ventanaMs
    ? { sincronizar: true, motivo: "antiguo", edadMin: Math.round(edadMs / 60000) }
    : { sincronizar: false, motivo: "reciente", edadMin: Math.round(edadMs / 60000) };
}

/**
 * ¿Sigue viva la marca de «hay una en curso»?
 *
 * En la base se guarda CUÁNDO empezó, no un sí/no. Un booleano se quedaría en `true` para
 * siempre si el proceso muere a media sync —y entonces no volvería a sincronizarse nunca—;
 * una marca de tiempo caduca sola.
 */
export function siguebloqueado(inicio, ahora = Date.now(), ttlMs = 5 * 60 * 1000) {
  const t = Date.parse(String(inicio || ""));
  if (!Number.isFinite(t)) return false;
  const edad = ahora - t;
  return edad >= 0 && edad < ttlMs;
}
