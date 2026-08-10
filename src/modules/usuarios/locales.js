// Usuarios — a qué establecimientos llega una persona. Lógica PURA.
//
// EL CASO: el encargado de la Cooperativa lleva también La Tapeta de Blanes, porque están
// pegadas. Con un solo local por usuario había que darle dos cuentas y entrar y salir.
//
// LO QUE ESTO HACE Y LO QUE NO. Da acceso a VARIOS locales y deja elegir en cuál se está
// mirando. NO suma los datos de los dos en la misma pantalla: eso exigiría reescribir las ~126
// consultas que hoy filtran con `local = ?` y es exactamente lo que el ADR 0001 aparta hasta
// después de producción, porque una equivocación ahí no se ve —salen menos reservas, o las de
// otro— y toca reservas, facturas y fichajes a la vez.
//
// La pieza delicada es `localPermitido`: es lo único que impide que alguien pida por la API un
// local que no es suyo. Por eso está aquí, aislada y con tests, y no repartida por las rutas.

/** Normaliza la lista guardada (array, JSON en texto o null) a un array de nombres. */
export function parseLocales(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim());
  if (typeof v === "string" && v.trim()) {
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a.filter((x) => typeof x === "string" && x.trim()) : [];
    } catch { return []; }
  }
  return [];
}

/**
 * Todos los establecimientos a los que llega este usuario: el suyo primero y luego los extra,
 * sin repetidos. Dirección devuelve [] — no está limitada a ninguno, que no es lo mismo que
 * no llegar a ninguno.
 */
export function localesDe(user) {
  if (!user || user.rol === "direccion") return [];
  const principal = String(user.local || "").trim();
  const extra = parseLocales(user.locales_extra);
  const todos = [principal, ...extra].filter(Boolean);
  return [...new Set(todos)];
}

/**
 * El local con el que se debe responder a esta petición.
 *
 *   - Dirección: lo que pida, o null (todos).
 *   - Con un solo local: SIEMPRE el suyo, pida lo que pida.
 *   - Con varios: el que pida, PERO solo si es suyo. Si pide otro, se le da el principal en
 *     vez de un error: la alternativa —devolver 403— convierte un enlace guardado de otro
 *     local en una pantalla rota, y aquí no hay nada que denunciar, solo que ese no es el suyo.
 */
export function localPermitido(user, pedido) {
  if (!user || user.rol === "direccion") return String(pedido || "").trim() || null;
  const mios = localesDe(user);
  if (!mios.length) return null;
  const p = String(pedido || "").trim();
  if (p && mios.includes(p)) return p;
  return mios[0];
}

/**
 * Los establecimientos que se van a consultar cuando se piden VARIOS a la vez.
 *
 * Mismo criterio que `localPermitido`, en plural: lo que pida, pero solo lo suyo. Si de lo
 * pedido no queda nada suyo, se cae a su principal en vez de devolver un error —un enlace
 * guardado de otro local no es un ataque, es un enlace viejo—. Y si de verdad no pide nada,
 * devuelve vacío, que significa «sin restricción» y solo puede pasarle a dirección.
 *
 * Es la puerta de las pantallas que suman varios locales: sin esto, `?locales=` sería una
 * forma de leer los datos de un establecimiento ajeno pidiéndolo por la URL.
 */
export function localesPermitidos(user, pedidos) {
  // Llega como array o como «A,B» en la URL. Los nombres de establecimiento no llevan comas.
  const crudos = typeof pedidos === "string" ? pedidos.split(",") : pedidos;
  const lista = [...new Set(parseLocales(crudos).map((s) => s.trim()).filter(Boolean))];
  if (!user) return [];
  if (user.rol === "direccion") return lista;          // vacío = todos, que es lo suyo
  const mios = localesDe(user);
  if (!mios.length) return [];
  const buenos = lista.filter((l) => mios.includes(l));
  return buenos.length ? buenos : [mios[0]];
}

/** ¿Puede este usuario ver datos de ese local? */
export function puedeLocal(user, local) {
  if (!user || user.rol === "direccion") return true;
  const l = String(local || "").trim();
  if (!l) return false;
  return localesDe(user).includes(l);
}

/**
 * Guarda solo lo válido: nombres del catálogo, sin el principal repetido y sin duplicados.
 * Si no queda ninguno se devuelve null → «sin locales extra», que es el estado normal.
 */
export function sanearLocalesExtra(principal, pedidos, catalogo = []) {
  const p = String(principal || "").trim();
  const limpio = [...new Set(parseLocales(pedidos))]
    .filter((l) => catalogo.includes(l))
    .filter((l) => l !== p);
  return limpio.length ? limpio : null;
}
