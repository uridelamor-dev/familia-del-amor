// La tarjeta de cliente — esquema. Aditivo e idempotente, invocado desde initDB().
//
// NO CREA UNA TABLA DE CLIENTES. La tarjeta es el carné que ya existe: `pro_qr` con
// `clase = 'carnet'`, uno vivo por teléfono (`idx_pro_qr_carnet` en promos/schema.js). Todo lo
// que se añade aquí son columnas al margen de esa fila y una tabla para las credenciales de
// Apple y Google.
//
// Por qué no una entidad nueva: el carné YA es la identidad del cliente en la barra, ya lo lee
// el escáner de la tablet y ya tiene detrás un libro inmutable de canjes. Crear un `clientes`
// paralelo dejaría dos identidades para la misma persona —el problema exacto que el índice
// único de carnés existe para impedir— y habría que decidir cuál manda cada vez que no
// coincidieran.

export async function ensureSchemaTarjeta(x) {
  // ── De dónde salió cada tarjeta ────────────────────────────────────────────
  // `origen` y `local_alta` son la única forma de contestar «¿el cartel de la mesa sirve de
  // algo?». Sin ellas, dentro de tres meses hay N tarjetas y ni idea de si vinieron de la web
  // o del cartel de Lloret, que es justo lo que decide si se imprimen más carteles.
  //
  // Van como columnas y no como una tabla de eventos porque una tarjeta se da de alta UNA vez:
  // no hay historial que guardar.
  for (const col of [
    "origen TEXT",             // 'web' | 'local' | 'panel'
    "local_alta TEXT",         // el local del cartel que escaneó, si vino de un local
    "wallet_apple_en TEXT",    // cuándo se descargó el pase por primera vez
    "wallet_google_en TEXT",
  ]) {
    try { await x.run(`ALTER TABLE pro_qr ADD COLUMN IF NOT EXISTS ${col}`); }
    catch (e) { console.error("[tarjeta] alter pro_qr:", e.message); }
  }

  // ── Credenciales de Apple Wallet y Google Wallet ───────────────────────────
  // Mismo modelo que `agora_locales`: el secreto se guarda CIFRADO (AES-256-GCM) y no sale
  // nunca por la API — solo `configurado: true` y una pista. Aquí dentro hay una clave privada
  // de firma: quien la tenga puede emitir pases a nombre de la empresa.
  //
  // Un JSON cifrado entero y no una columna por dato: lo que hace falta guardar es distinto en
  // cada plataforma (Apple pide un .p12 con contraseña y el intermedio de Apple; Google, un
  // correo de service account y una clave PEM) y una tabla con las dos formas a la vez sería
  // media tabla vacía en cada fila.
  await x.run(`CREATE TABLE IF NOT EXISTS wallet_config (
    plataforma TEXT PRIMARY KEY,
    activo INTEGER NOT NULL DEFAULT 0,
    datos_enc TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (plataforma IN ('apple','google'))
  )`);
}
