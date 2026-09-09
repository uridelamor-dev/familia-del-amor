// Fidelización con Ágora — esquema. Aditivo e idempotente, invocado desde initDB().
//
// NO CREA UNA IDENTIDAD NUEVA. El socio es el carné que ya existe: `pro_qr` con
// `clase = 'carnet'`, uno vivo por teléfono. Lo que se añade aquí son las tablas del piloto:
// el token de integración, las facturas recibidas y el libro de movimientos.
//
// EL LIBRO ES APPEND-ONLY, como `fic_bolsa_movimientos`. Nunca se actualiza ni se borra una fila:
// una devolución es un movimiento CONTRARIO, no un borrado. Es la misma razón que allí — el libro
// es la prueba de lo que ha pasado, y un libro que se puede reescribir no prueba nada.

export async function ensureSchemaFidelizacion(x) {
  // ── El token con el que Ágora nos llama ────────────────────────────────────
  // Uno por local (el piloto es solo Lloret) y con las tres puertas de siempre: activo, caducidad
  // y revocación. En la base solo vive el hash; el token en claro se enseña UNA vez al crearlo.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_integraciones (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_pista TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TEXT NOT NULL,
    creado_por TEXT,
    caduca_en TEXT,
    revocado_en TEXT,
    revocado_por TEXT
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_integracion_local
    ON fid_integraciones (local) WHERE revocado_en IS NULL`);

  // ── Las facturas que manda Ágora ───────────────────────────────────────────
  // `global_id` es UNIQUE y ES la idempotencia: un reenvío choca contra el índice y no vuelve a
  // sumar nada. `cuerpo_hash` distingue «el mismo reenvío» de «el mismo id con otro contenido»,
  // que es un conflicto y se audita en vez de aplicarse en silencio.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_facturas (
    id SERIAL PRIMARY KEY,
    integracion_id INTEGER NOT NULL,
    local TEXT NOT NULL,
    global_id TEXT NOT NULL,
    clave_debil BOOLEAN NOT NULL DEFAULT FALSE,
    cuerpo_hash TEXT NOT NULL,
    cuerpo_bytes INTEGER NOT NULL,
    cuerpo_enc TEXT,
    esquema TEXT,
    agora_version TEXT,
    items_n INTEGER NOT NULL DEFAULT 0,
    miembros_n INTEGER NOT NULL DEFAULT 0,
    importe_total NUMERIC,
    devolucion BOOLEAN NOT NULL DEFAULT FALSE,
    estado TEXT NOT NULL,
    recibido_en TEXT NOT NULL
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_factura_global ON fid_facturas (global_id)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_factura_fecha ON fid_facturas (recibido_en DESC)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_factura_local ON fid_facturas (local, recibido_en DESC)`);

  // ── El libro ───────────────────────────────────────────────────────────────
  // `clave_idem` UNIQUE es lo que hace que dos peticiones simultáneas con la misma factura no
  // puedan escribir dos veces: la segunda choca en la base, no en una comprobación previa que
  // podría adelantarse por medio.
  //
  // `qr_id` apunta al carné, no al teléfono: la identidad del socio es su carné y así el libro no
  // guarda ni un dato personal.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_movimientos (
    id SERIAL PRIMARY KEY,
    qr_id INTEGER NOT NULL,
    member_hash TEXT NOT NULL,
    local TEXT NOT NULL,
    concepto TEXT NOT NULL,
    unidades INTEGER NOT NULL DEFAULT 0,
    importe NUMERIC NOT NULL DEFAULT 0,
    clave_idem TEXT NOT NULL UNIQUE,
    factura_id INTEGER,
    referencia_id INTEGER,
    nota TEXT,
    autor TEXT NOT NULL,
    creado_en TEXT NOT NULL,
    CHECK (concepto IN ('visita','consumo','devolucion','correccion','puntos'))
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_mov_qr ON fid_movimientos (qr_id, creado_en DESC)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_mov_local ON fid_movimientos (local, creado_en DESC)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_mov_factura ON fid_movimientos (factura_id)`);

  // ── Las validaciones ───────────────────────────────────────────────────────
  // Para poder contestar «¿el TPV nos está llamando?» sin abrir los logs. Del socio solo se
  // guarda un hash: en esta tabla no hay identidades.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_validaciones (
    id SERIAL PRIMARY KEY,
    integracion_id INTEGER,
    local TEXT,
    member_hash TEXT,
    resultado TEXT NOT NULL,
    agora_version TEXT,
    ms INTEGER,
    creado_en TEXT NOT NULL
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_val_fecha ON fid_validaciones (creado_en DESC)`);
}
