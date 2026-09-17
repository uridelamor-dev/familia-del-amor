// LA PUERTA DEL WALLET DINÁMICO. PURA: sin BD, sin Express, y sin imports.
//
// ── LA TERCERA PUERTA, Y NO SE MEZCLA CON LAS OTRAS DOS ──────────────────────────────────────
//
//   `fid_puerta`          el programa de puntos. Mueve saldo de clientes.
//   `fid_puerta_promos`   las promociones de Ágora. Regala productos.
//   ESTA                  que el pase del móvil se actualice solo.
//
// Son tres decisiones distintas y se toman por separado. Encender Wallet no concede un punto ni
// regala un desayuno: solo hace que lo que YA decidieron las otras dos se vea en el móvil sin
// tener que volver a bajarse el carné.
//
// ── QUÉ PASA CON LA PUERTA CERRADA ───────────────────────────────────────────────────────────
//
// Todo lo de hoy sigue igual: la tarjeta web funciona, el `.pkpass` se genera y se firma, y el
// cliente lo añade a Wallet. Lo único que no ocurre es que el móvil se registre o reciba avisos.
//
// ── `webServiceURL` CON LOS REGISTROS APAGADOS ───────────────────────────────────────────────
//
// NO SE DECLARA. Es la decisión que más se paga si se elige mal.
//
// `webServiceURL` y `authenticationToken` son lo que hace que iOS empiece a llamar. Si se
// declaran y las rutas contestan 401 —porque los registros están apagados—, el iPhone reintenta
// cada vez que el pase aparece en pantalla y el usuario acaba viendo un pase que «da error». Y
// peor: un pase que se bajó con esos campos los conserva para siempre, así que el problema no se
// arregla apagando nada.
//
// Por eso el orden es: desplegar todo apagado → comprobar las rutas → ENCENDER registros →
// bajarse un pase nuevo (ese sí los lleva) → comprobar el registro → encender los avisos.

/** Los cuatro estados. Congelados. */
export const ESTADOS = Object.freeze(["apagado", "listo_para_activar", "activo", "pausado"]);

/**
 * Los tres controles.
 *
 *   registros   el pase nuevo lleva `webServiceURL` y las rutas aceptan altas.
 *   avisos      cuando algo cambia, se le manda el aviso silencioso al móvil.
 *   visibles    mensajes que el usuario VE al actualizarse el pase. Todavía no se implementa:
 *               el control existe para que la arquitectura lo contemple, pero nace apagado y no
 *               hay nada que lo lea. Primero hay que comprobar que lo silencioso funciona.
 */
export const INTERRUPTORES = Object.freeze(["wallet_registros", "wallet_avisos", "wallet_visibles"]);

export const APAGADOS = Object.freeze({
  wallet_registros: false, wallet_avisos: false, wallet_visibles: false,
});

/**
 * LOS REQUISITOS. Todos se comprueban contra un hecho del servidor, no contra una casilla.
 */
export const REQUISITOS = Object.freeze([
  Object.freeze({
    id: "tarjeta_encendida",
    texto: "La tarjeta de cliente está encendida",
    comprueba: (c) => c.tarjetaActiva === true
      || "La tarjeta de cliente está apagada, así que `/api/wallet/*` contesta 404 y nadie puede bajarse un pase.",
  }),
  Object.freeze({
    id: "certificado",
    texto: "El certificado del Pass Type ID está configurado",
    comprueba: (c) => c.certificado === true
      || "No hay certificado de Apple guardado. Es el mismo que firma el pase y el que habla con APNs.",
  }),
  Object.freeze({
    id: "openssl",
    texto: "El servidor puede firmar pases",
    comprueba: (c) => c.openssl === true
      || "Falta el binario `openssl` en el servidor: sin él no se firma ningún pase.",
  }),
  Object.freeze({
    id: "url_publica",
    texto: "La dirección pública es HTTPS y es la nuestra",
    comprueba: (c) => c.urlPublica === true
      || "`webServiceURL` tiene que ser HTTPS y apuntar a nuestro dominio. Se toma de la dirección pública configurada.",
  }),
  Object.freeze({
    id: "clave_datos",
    texto: "Se pueden guardar secretos cifrados",
    comprueba: (c) => c.puedeCifrar === true
      || "Sin la clave de cifrado no se puede guardar el token de un dispositivo, y en claro no se guarda.",
  }),
  Object.freeze({
    id: "entorno_apns",
    texto: "El entorno de APNs está elegido",
    comprueba: (c) => (c.entornoApns === "produccion" || c.entornoApns === "sandbox")
      || "Hay que elegir si los avisos van al APNs de producción o al de pruebas. Mezclarlos no da error: no llega nada.",
  }),
]);

export function evaluarPuerta(guardado, ctx) {
  const c = ctx || {};
  const requisitos = REQUISITOS.map((r) => {
    const v = r.comprueba(c);
    return { id: r.id, texto: r.texto, ok: v === true, motivo: v === true ? null : String(v) };
  });
  const pendientes = requisitos.filter((r) => !r.ok);
  const estado = ESTADOS.includes(guardado?.estado) ? guardado.estado : "apagado";
  return {
    estado, requisitos,
    pendientes: pendientes.map((r) => r.motivo),
    puede_activar: pendientes.length === 0,
    incoherente: estado === "activo" && pendientes.length > 0,
    confirmado_por: guardado?.confirmado_por || null,
    confirmado_en: guardado?.confirmado_en || null,
    pausado_por: guardado?.pausado_por || null,
    pausado_en: guardado?.pausado_en || null,
    motivo_pausa: guardado?.motivo_pausa || null,
  };
}

export function puedeTransitar(desde, hacia, { puedeActivar = false } = {}) {
  if (!ESTADOS.includes(hacia)) return { ok: false, error: "Ese estado no existe" };
  if (desde === hacia) return { ok: false, error: "Ya está en ese estado" };
  if (hacia === "pausado") {
    if (desde !== "activo") return { ok: false, error: "Solo se puede pausar algo que esté activo" };
    return { ok: true };
  }
  if (hacia === "activo") {
    if (desde !== "listo_para_activar" && desde !== "pausado") {
      return { ok: false, error: "Antes hay que pasar por «listo para activar»" };
    }
    if (!puedeActivar) return { ok: false, error: "Todavía no se cumplen todos los requisitos" };
    return { ok: true };
  }
  if (hacia === "listo_para_activar") {
    if (!puedeActivar) return { ok: false, error: "Todavía no se cumplen todos los requisitos" };
    if (desde === "activo") return { ok: false, error: "Para eso hay que pausar primero" };
    return { ok: true };
  }
  if (hacia === "apagado") {
    if (desde === "activo") return { ok: false, error: "Para eso hay que pausar primero" };
    return { ok: true };
  }
  return { ok: false, error: "Transición no permitida" };
}

/** Distinta de las otras dos a propósito: no se activa una pegando la confirmación de otra. */
export const CONFIRMACION_EXIGIDA = "ACTIVAR WALLET";
export function confirmacionValida(texto) {
  return String(texto || "").trim().toUpperCase().replace(/\s+/g, " ") === CONFIRMACION_EXIGIDA;
}

/**
 * ¿Se puede mover este interruptor?
 *
 * APAGAR SIEMPRE SE PUEDE. Encender exige la puerta abierta; los avisos exigen además que haya
 * registros —avisar a un móvil que no se ha registrado no es que falle: es que no existe—; y los
 * mensajes visibles exigen avisos y todavía no están implementados, así que no se dejan encender.
 */
export function puedeEncender(interruptor, valor, { estadoPuerta = "apagado", guardados = {} } = {}) {
  if (!INTERRUPTORES.includes(interruptor)) return { ok: false, error: "Ese interruptor no existe" };
  if (valor === false) return { ok: true };
  if (estadoPuerta !== "activo") {
    return { ok: false,
      error: "El Wallet dinámico no está puesto en producción. Actívalo primero desde «Wallet dinámico»." };
  }
  if (interruptor === "wallet_avisos" && !guardados.wallet_registros) {
    return { ok: false, error: "No se puede avisar a un dispositivo que no puede registrarse. Enciende primero los registros." };
  }
  if (interruptor === "wallet_visibles") {
    return { ok: false,
      error: "Los mensajes visibles todavía no están implementados. Primero hay que comprobar que la actualización silenciosa funciona." };
  }
  return { ok: true };
}

/** EL CANDADO FINAL. Lo guardado es una intención; esto es lo que pasa. */
export function aplicarPuerta(guardados, estadoPuerta) {
  const out = { ...APAGADOS, ...(guardados || {}) };
  if (!out.wallet_registros) { out.wallet_avisos = false; out.wallet_visibles = false; }
  if (!out.wallet_avisos) out.wallet_visibles = false;
  // Nunca, mientras no se implementen.
  out.wallet_visibles = false;
  if (estadoPuerta !== "activo") return { ...APAGADOS };
  return { wallet_registros: !!out.wallet_registros, wallet_avisos: !!out.wallet_avisos,
           wallet_visibles: false };
}

/**
 * ¿El pase que se genera AHORA lleva servicio web?
 *
 * Solo si los registros están permitidos de verdad. Ver la cabecera: declararlo con los registros
 * apagados deja al iPhone reintentando contra un 401 para siempre, y un pase ya bajado conserva
 * ese campo aunque después se encienda o se apague nada.
 */
export const paseLlevaServicio = (efectivos) => !!efectivos?.wallet_registros;
