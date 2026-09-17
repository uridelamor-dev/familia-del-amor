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

  // ── WALLET DINÁMICO: EL PASE QUE SE ACTUALIZA SOLO ─────────────────────────
  //
  // Todo lo de aquí abajo es ADITIVO y nace APAGADO. Sin la puerta abierta no se registra ningún
  // dispositivo y no sale ningún aviso; el `.pkpass` se sigue generando y firmando igual que hoy.
  //
  // ── TRES TABLAS Y NO UNA ───────────────────────────────────────────────────
  //
  // Un dispositivo puede tener VARIOS pases (una familia con un iPad compartido) y un pase puede
  // estar en VARIOS dispositivos (el móvil y el iPad de la misma persona). Eso es una relación de
  // muchos a muchos, y meterla en una sola tabla obliga a repetir el token del dispositivo en
  // cada fila — que es justo el dato que no conviene repetir.

  // 1 · EL PASE. Una fila por carné que tenga pase, con su secreto y su etiqueta.
  //
  // `auth_token_enc` es un secreto DISTINTO del token del carné. Reutilizar aquel habría hecho
  // que comprometer uno comprometiera el otro, y el del carné va dentro del QR, a la vista de
  // cualquier cámara. Se guarda cifrado; `auth_huella` permite comparar sin descifrar cuando hace
  // falta mirar rápido, y nunca es suficiente para reconstruir el token.
  //
  // `etiqueta` es el `lastUpdated` de Apple: un contador que solo sube, uno por pase. `huella` es
  // el estado visible tal y como se pintó la última vez, y es lo que evita mandar un aviso cuando
  // no ha cambiado nada de lo que se ve.
  await x.run(`CREATE TABLE IF NOT EXISTS wallet_pases (
    qr_id INTEGER PRIMARY KEY,
    auth_token_enc TEXT NOT NULL,
    auth_huella TEXT NOT NULL,
    etiqueta BIGINT NOT NULL DEFAULT 1,
    huella TEXT,
    generado_en TEXT,
    actualizado_en TEXT,
    motivo TEXT,
    creado_en TEXT NOT NULL
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_wallet_pase_etiqueta ON wallet_pases (etiqueta)`);

  // 2 · EL DISPOSITIVO. El `deviceLibraryIdentifier` que manda Wallet, y su token de APNs.
  //
  // EL TOKEN PUSH VA CIFRADO. Es un identificador de dispositivo: dato personal, y además lo
  // único que hace falta para mandarle algo a ese móvil. No aparece en el panel, ni en la
  // auditoría, ni en ningún error.
  await x.run(`CREATE TABLE IF NOT EXISTS wallet_dispositivos (
    dispositivo TEXT PRIMARY KEY,
    push_token_enc TEXT,
    push_huella TEXT,
    invalidado_en TEXT,
    invalidado_motivo TEXT,
    visto_en TEXT,
    creado_en TEXT NOT NULL
  )`);

  // 3 · LA RELACIÓN. Un alta repetida no crea una fila nueva: el índice único es el candado.
  //
  // Borrar un registro NO borra el carné ni el cliente: solo dice que ese móvil ya no quiere ese
  // pase. Se marca con fecha en vez de borrar la fila, para poder mirar después qué pasó.
  await x.run(`CREATE TABLE IF NOT EXISTS wallet_registros (
    id SERIAL PRIMARY KEY,
    dispositivo TEXT NOT NULL,
    qr_id INTEGER NOT NULL,
    pass_type_id TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    baja_en TEXT,
    baja_motivo TEXT,
    creado_en TEXT NOT NULL,
    actualizado_en TEXT
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_reg_unico
    ON wallet_registros (dispositivo, qr_id)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_wallet_reg_pase
    ON wallet_registros (qr_id) WHERE activo`);

  // 4 · LA COLA DE AVISOS. Mismo patrón que `cap_cola` —estado, intentos, próximo intento— pero
  //     tabla propia: `cap_cola` exige teléfono y texto porque es de WhatsApp, y meter aquí un
  //     token de dispositivo sería mezclar dos cosas que el resto del proyecto separa.
  //
  // ── UN SOLO PENDIENTE POR PASE, Y LO GARANTIZA UN ÍNDICE ──────────────────
  //
  // El candado es el ÍNDICE ÚNICO PARCIAL de abajo, no `clave_idem`. Con una clave de texto única
  // había que REESCRIBIRLA al cerrar cada aviso para liberar el hueco, y si un solo camino de
  // cierre se olvidaba, ese pase no volvía a recibir un aviso NUNCA MÁS, en silencio.
  //
  // Con el índice parcial, una fila terminal —enviada, fallida, bloqueada— deja de estorbar sola,
  // y el siguiente cambio puede crear una generación nueva sin tocar el historial.
  //
  // `clave_idem` se queda como ETIQUETA LEGIBLE de la generación (`wal:<qr>:v<etiqueta>`): sirve
  // para leer en la fila a qué versión correspondía, y ya no decide nada.
  await x.run(`CREATE TABLE IF NOT EXISTS wallet_avisos (
    id SERIAL PRIMARY KEY,
    qr_id INTEGER NOT NULL,
    etiqueta BIGINT NOT NULL DEFAULT 0,
    clave_idem TEXT NOT NULL,
    motivo TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    intentos INTEGER NOT NULL DEFAULT 0,
    ultimo_error TEXT,
    proximo_ms BIGINT NOT NULL,
    creado_en TEXT NOT NULL,
    enviado_en TEXT,
    -- «bloqueado» es distinto de «fallido» A PROPOSITO, y la diferencia se mira en el panel:
    --   fallido    se intento, fallo por algo transitorio y se agotaron los reintentos.
    --   bloqueado  algo NUESTRO esta mal (el certificado, el topic, el entorno de APNs) y
    --              reintentar no lo arregla. Espera a que una persona lo corrija.
    CHECK (estado IN ('pendiente','enviado','fallido','bloqueado','descartado'))
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_wallet_aviso_cola
    ON wallet_avisos (proximo_ms) WHERE estado = 'pendiente'`);
  // EL CANDADO DE VERDAD: como mucho un aviso pendiente por pase. Lo impone la base, así que no
  // depende de que ningún camino de cierre se acuerde de nada.
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_aviso_pendiente
    ON wallet_avisos (qr_id) WHERE estado = 'pendiente'`);

  // 5 · LA PUERTA. Su propia fila y su propia tabla, como las otras dos. Nace APAGADA y NUNCA se
  //     mueve desde una migración: la abre Dirección desde el panel, escribiendo a mano.
  await x.run(`CREATE TABLE IF NOT EXISTS wallet_puerta (
    id INTEGER PRIMARY KEY DEFAULT 1,
    estado TEXT NOT NULL DEFAULT 'apagado',
    entorno_apns TEXT NOT NULL DEFAULT 'produccion',
    confirmado_por TEXT,
    confirmado_en TEXT,
    texto_confirmacion TEXT,
    pausado_por TEXT,
    pausado_en TEXT,
    motivo_pausa TEXT,
    ultimo_envio_en TEXT,
    ultimo_error TEXT,
    ultimo_error_en TEXT,
    actualizado_en TEXT,
    CHECK (id = 1),
    CHECK (estado IN ('apagado','listo_para_activar','activo','pausado')),
    CHECK (entorno_apns IN ('produccion','sandbox'))
  )`);
  try { await x.run(`INSERT INTO wallet_puerta (id, estado, actualizado_en) VALUES (1, 'apagado', ?)
                     ON CONFLICT (id) DO NOTHING`, [new Date().toISOString()]); }
  catch (e) { console.error("[tarjeta] puerta wallet:", e.message); }
}
