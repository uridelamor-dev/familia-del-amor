// Correo (Gmail) — qué está pasando con la lectura de facturas por email. PURO.
//
// EL CASO QUE LO ORIGINA: Drive subía las facturas sin problema y unas que llegaron por correo
// no se ordenaron nunca. En pantalla, tres etiquetas que decían «No se ha podido comprobar» y
// nada más. El error existía —lo escribía `console.error`— pero en la consola del servidor, que
// desde el panel no se ve. Sin ese dato no hay forma de distinguir entre «Google ha rechazado
// el permiso», «no había ningún correo» y «el correo se abrió antes de que le tocara el turno».
//
// La comparación que lo deja claro: Reseñas guarda su último intento, su última sincronización
// y su último error, y los pinta. Por eso ahí siempre se sabe qué pasa. Esto es lo mismo para
// el correo.

/** Claves de `config` donde queda el rastro. Se leen desde el panel; no son secretos. */
export const CLAVES = {
  intento: "gmail_last_attempt",     // cada vez que se mira el buzón, salga bien o mal
  ok: "gmail_last_ok",               // la última vez que entró alguna factura
  error: "gmail_last_error",         // en cristiano, no el JSON de Google
  vistos: "gmail_last_vistos",       // correos con adjunto que había en la ventana
  nuevos: "gmail_last_nuevos",       // los que no se habían mirado todavía
  procesados: "gmail_last_procesados", // adjuntos que acabaron siendo una factura
};

/**
 * Cuántos días atrás se mira el buzón.
 *
 * ANTES SE BUSCABA `is:unread`, y ahí estaba el fallo: abrir el correo en el móvil antes de que
 * pasara el turno —que es cada cinco minutos— dejaba esa factura fuera PARA SIEMPRE. No había
 * reintento ni forma de recuperarla, y nada lo decía. Ahora la memoria de lo ya hecho es la
 * tabla `facturas_emails_procesados`, que es donde tiene que estar, y el buzón se mira entero.
 *
 * Catorce días y no más: es de sobra para cubrir un puente o unas vacaciones, y evita releer
 * un buzón de años cada cinco minutos.
 */
export const DIAS_ATRAS = 14;

/** La búsqueda que se le manda a Gmail. */
export function consultaGmail(dias = DIAS_ATRAS) {
  // Saneado aquí y no solo en quien llama: una búsqueda con `newer_than:NaNd` no falla, la
  // acepta Google y devuelve cero correos. Un fallo que se ve exactamente igual que «no había
  // nada que leer» es el peor tipo de fallo en esta pantalla.
  const n = Math.round(Number(dias));
  return `has:attachment newer_than:${Number.isFinite(n) && n >= 1 ? Math.min(n, 365) : DIAS_ATRAS}d`;
}

/**
 * Traduce lo que devuelve Google a una frase que diga qué hacer.
 *
 * El caso que importa de verdad es el del PERMISO: la conexión con Google se autoriza una vez y
 * con unos permisos concretos. Si se autorizó cuando el sistema solo tocaba Drive, ese permiso
 * guardado no incluye el correo — y entonces pasa exactamente lo que pasó: las facturas se
 * suben a Drive sin problema y las del correo no entran nunca. Se arregla volviendo a pulsar
 * «Conectar Google», pero eso hay que saberlo, y un JSON de Google no lo dice.
 */
export function explicarError(e) {
  if (!e) return null;
  const texto = typeof e === "string" ? e : JSON.stringify(e);
  const t = texto.toLowerCase();

  if (/scope|insufficient|insufficientpermissions|acceso?_?token_?scope/.test(t)) {
    return "La conexión con Google no tiene permiso para leer el correo. Se arregla pulsando «Conectar Google» y autorizando otra vez: Drive seguirá funcionando igual.";
  }
  if (/invalid_grant|token has been expired|revoked/.test(t)) {
    return "Google ha caducado o revocado la conexión. Hay que pulsar «Conectar Google» y volver a autorizarla.";
  }
  if (/no conectado|not connected|missing refresh/.test(t)) {
    return "Google no está conectado todavía: pulsa «Conectar Google».";
  }
  if (/could not determine client id|invalid_client|client_id no configurado|unauthorized_client/.test(t)) {
    // Pasa tras un redespliegue si se pierden los secretos: la conexión guardada sigue ahí pero
    // no hay con qué renovarla. Desde fuera se ve igual que «Google ha dejado de funcionar».
    return "Al servidor le faltan las credenciales de Google (GOOGLE_DRIVE_CLIENT_ID y GOOGLE_DRIVE_CLIENT_SECRET). Hay que reponerlas en la configuración del despliegue.";
  }
  if (/gmail api has not been used|accessnotconfigured|disabled/.test(t)) {
    return "La API de Gmail está desactivada en el proyecto de Google. Hay que activarla en la consola de Google Cloud.";
  }
  if (/rate ?limit|quota|429|userratelimit/.test(t)) {
    return "Google ha limitado las peticiones por ir demasiado rápido. Se reintenta solo en el siguiente turno.";
  }
  if (/403|permission/.test(t)) {
    return "Google ha rechazado la petición por permisos. Prueba a pulsar «Conectar Google» y autorizar otra vez.";
  }
  if (/401|unauthorized/.test(t)) {
    return "Google no ha aceptado la identificación. Hay que volver a conectar la cuenta.";
  }
  // Lo que no se reconoce se enseña tal cual, recortado: un error que no se entiende sigue
  // siendo más útil que ninguno.
  return texto.length > 220 ? texto.slice(0, 220) + "…" : texto;
}

const num = (v) => (v == null || v === "" ? null : Number(v));

/**
 * La frase de estado del correo, a partir del rastro guardado.
 *
 * Se escribe aquí y no en el panel porque son cinco casos y el orden en que se preguntan ES la
 * regla: un error manda sobre cualquier recuento, y «nunca se ha mirado» no es lo mismo que
 * «se miró y no había nada».
 */
export function resumirGmail({ conectado = false, cfg = {}, procesadosEnBase = 0 } = {}) {
  const intento = cfg[CLAVES.intento] || null;
  const ok = cfg[CLAVES.ok] || null;
  const error = cfg[CLAVES.error] || null;
  const vistos = num(cfg[CLAVES.vistos]);
  const nuevos = num(cfg[CLAVES.nuevos]);
  const procesados = num(cfg[CLAVES.procesados]);

  if (!conectado) return { nivel: "bad", titulo: "Sin conectar", detalle: "Google no está conectado: el correo no se está leyendo.", intento, ok, error: null };
  if (error) return { nivel: "bad", titulo: "Con problema", detalle: error, intento, ok, error };
  if (!intento) {
    return { nivel: "warn", titulo: "Sin estrenar", detalle: "Todavía no se ha mirado el buzón ni una vez. Se mira solo cada cinco minutos.", intento, ok, error: null };
  }
  const trozos = [];
  if (vistos != null) trozos.push(`${vistos} ${vistos === 1 ? "correo con adjunto" : "correos con adjunto"} en los últimos ${DIAS_ATRAS} días`);
  if (nuevos != null) trozos.push(nuevos === 0 ? "ninguno nuevo" : `${nuevos} sin mirar`);
  if (procesados) trozos.push(`${procesados} ${procesados === 1 ? "factura" : "facturas"} en el último repaso`);
  if (procesadosEnBase) trozos.push(`${procesadosEnBase} en total`);
  return { nivel: "ok", titulo: "Activo", detalle: trozos.join(" · ") || "Al día.", intento, ok, error: null };
}
