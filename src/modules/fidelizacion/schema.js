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

  // ADITIVO. Verificación del local y vínculo con el Workplace de Ágora.
  //
  // `activada_en` se escribe la PRIMERA vez que se activa y ya no se borra. Es lo único que
  // distingue «generada y nunca puesta en un TPV» de «puesta y apagada después», y de eso depende
  // que nadie regenere un token que está pegado en una caja.
  //
  // Los cuatro campos de Workplace se escriben SOLO cuando Dirección lo confirma a mano mirando el
  // Id y el Name observados. Nunca se copia el primer valor que llegue: un vínculo puesto solo se
  // deshace revocando, y un vínculo equivocado es peor que ninguno.
  //
  // No hay columna `estado`: se deriva de estas fechas con `estadoVerificacion()`. Una columna de
  // estado escrita a mano se desincroniza del hecho que representa.
  for (const col of ["activada_en TEXT", "workplace_id TEXT", "workplace_nombre TEXT",
                     "workplace_confirmado_en TEXT", "workplace_confirmado_por TEXT"]) {
    try { await x.run(`ALTER TABLE fid_integraciones ADD COLUMN IF NOT EXISTS ${col}`); }
    catch (e) { console.error("[fidelizacion] alter fid_integraciones:", e.message); }
  }

  // ── Las facturas que manda Ágora ───────────────────────────────────────────
  // LA IDEMPOTENCIA ES `clave_factura`, NO `global_id` A SECAS. La guía no garantiza que el
  // GlobalId sea único entre locales distintos, y si no lo fuera, un índice global haría que la
  // factura de Lloret tapara la de Blanes el día que el piloto se amplíe: la segunda se vería como
  // un reenvío y no apuntaría ni una visita, sin dar ningún error. La clave lleva el local dentro.
  //
  // `global_id_tipo` dice si el identificador es el OFICIAL de Ágora o una clave compuesta por
  // nosotros. Nunca se mezclan sin saber cuál es cuál: una idempotencia que no se sabe fuerte hay
  // que poder mirarla después.
  //
  // `cuerpo_hash` distingue «el mismo reenvío» de «el mismo id con otro contenido», que es un
  // conflicto y se rechaza en vez de aplicarse en silencio.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_facturas (
    id SERIAL PRIMARY KEY,
    integracion_id INTEGER NOT NULL,
    local TEXT NOT NULL,
    global_id TEXT NOT NULL,
    global_id_tipo TEXT NOT NULL DEFAULT 'oficial',
    clave_factura TEXT NOT NULL,
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
    es_prueba BOOLEAN NOT NULL DEFAULT FALSE,
    recibido_en TEXT NOT NULL
  )`);
  // Aditivo, para una base que ya tuviera la tabla de una versión anterior de este esquema.
  //
  // `es_prueba` marca las facturas que hemos hecho nosotros para observar el formato de Ágora.
  // Es lo ÚNICO que permite ver sus importes desde el panel: sin ella, esa herramienta sería una
  // ventana abierta a cualquier factura de cualquier cliente. Se borra cuando la fase de puntos
  // esté validada y la herramienta deje de hacer falta.
  for (const col of ["global_id_tipo TEXT NOT NULL DEFAULT 'oficial'", "clave_factura TEXT",
                     "es_prueba BOOLEAN NOT NULL DEFAULT FALSE"]) {
    try { await x.run(`ALTER TABLE fid_facturas ADD COLUMN IF NOT EXISTS ${col}`); }
    catch (e) { console.error("[fidelizacion] alter fid_facturas:", e.message); }
  }
  // El índice viejo era solo por `global_id` y no aislaba los locales. Se retira antes de poner el
  // bueno; `IF EXISTS` lo hace idempotente y no toca ninguna fila.
  try { await x.run(`DROP INDEX IF EXISTS idx_fid_factura_global`); }
  catch (e) { console.error("[fidelizacion] drop idx viejo:", e.message); }
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_factura_clave ON fid_facturas (clave_factura)`);
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
  // ── PUNTOS: columnas aditivas sobre el MISMO libro ─────────────────────────
  //
  // SE REUTILIZA `fid_movimientos` y no se crea una tabla de puntos aparte. El libro ya es
  // append-only, ya tiene `clave_idem UNIQUE`, ya guarda local, factura y autor — y su `CHECK`
  // sobre `concepto` YA CONTEMPLABA 'puntos'. Dos libros para el mismo cliente es como se acaba
  // con dos saldos que no cuadran y nadie sabe cuál es el bueno.
  //
  // `punto_tipo` cualifica el movimiento SIN tocar el `CHECK`: el concepto sigue siendo 'puntos'.
  // Añadir valores al CHECK obligaría a borrarlo y recrearlo sobre una tabla con datos, y eso no
  // se hace por una columna que se puede añadir al lado.
  //
  // UN LOTE ES UN MOVIMIENTO DE 'ganados', con su propia caducidad. Lo que se le quita —consumos,
  // caducidad— y lo que se le devuelve apuntan a él por `lote_id`. El restante es la suma, así que
  // NO HAY NINGÚN SALDO QUE EDITAR: se calcula, como la bolsa de horas.
  for (const col of ["punto_tipo TEXT", "lote_id INTEGER", "caduca_en TEXT",
                     "regla_id INTEGER", "regla_version INTEGER", "importe_centimos INTEGER"]) {
    try { await x.run(`ALTER TABLE fid_movimientos ADD COLUMN IF NOT EXISTS ${col}`); }
    catch (e) { console.error("[fidelizacion] alter fid_movimientos:", e.message); }
  }
  // FIFO: se gasta antes lo que antes caduca. Este índice es el que lo hace barato.
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_mov_lotes
    ON fid_movimientos (qr_id, caduca_en, id) WHERE punto_tipo = 'ganados'`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_mov_lote ON fid_movimientos (lote_id) WHERE lote_id IS NOT NULL`);

  // ── LAS REGLAS DEL PROGRAMA, VERSIONADAS E INMUTABLES ──────────────────────
  //
  // Una fila NO SE EDITA NUNCA. Cambiar el programa es insertar una versión nueva, y por eso cada
  // movimiento guarda `regla_id` y `regla_version`: una factura de hace tres meses se explica con
  // la regla que había entonces, no con la de hoy. Editar en sitio haría imposible contestar
  // «¿por qué este cliente ganó 56 puntos?» en cuanto alguien tocara el programa.
  //
  // Ningún importe ni porcentaje comercial vive en el código: todo sale de aquí.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_reglas (
    id SERIAL PRIMARY KEY,
    ambito TEXT NOT NULL,
    local TEXT,
    version INTEGER NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    -- EL IDENTIFICADOR DEL REWARD, generado al publicar y NUNCA recalculado.
    --
    -- Derivarlo de las condiciones —como se hacía antes— tenía un fallo que solo se ve en barra:
    -- entre identificar al cliente y cerrar la factura, Dirección puede publicar otra versión, y
    -- entonces rechazaríamos en caja un descuento que nosotros mismos acabábamos de ofrecer.
    -- Guardándolo, la factura que vuelve encuentra SU versión, con SUS condiciones.
    reward_id TEXT,
    -- Minutos que un Reward ya emitido sigue valiendo después de que su versión sea sustituida.
    -- NULL = solo mientras su versión esté vigente. Pendiente de decidir su valor.
    gracia_minutos INTEGER,
    puntos_por_euro NUMERIC NOT NULL,
    redondeo TEXT NOT NULL DEFAULT 'floor',
    puntos_necesarios INTEGER NOT NULL,
    descuento_euros NUMERIC NOT NULL,
    consumo_minimo NUMERIC NOT NULL,
    caducidad_meses INTEGER NOT NULL,
    max_rewards_factura INTEGER NOT NULL DEFAULT 1,
    vigente_desde TEXT,
    vigente_hasta TEXT,
    creado_en TEXT NOT NULL,
    creado_por TEXT NOT NULL,
    CHECK (ambito IN ('global','local')),
    CHECK (redondeo IN ('floor'))
  )`);
  // Una versión por ámbito y local. Reinsertar la misma no duplica: choca aquí.
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_regla_version
    ON fid_reglas (ambito, COALESCE(local, ''), version)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_regla_ambito ON fid_reglas (ambito, local, version DESC)`);
  // Por él se busca la versión EXACTA cuando vuelve una factura con descuento.
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_regla_reward
    ON fid_reglas (reward_id) WHERE reward_id IS NOT NULL`);
  // Aditivo, por si la tabla ya existía de una versión anterior de este esquema.
  for (const col of ["reward_id TEXT", "gracia_minutos INTEGER"]) {
    try { await x.run(`ALTER TABLE fid_reglas ADD COLUMN IF NOT EXISTS ${col}`); }
    catch (e) { console.error("[fidelizacion] alter fid_reglas:", e.message); }
  }

  // ── LO QUE HAY QUE MIRAR A MANO ────────────────────────────────────────────
  //
  // Varios socios en una factura, una devolución parcial, una devolución sin original. Son los
  // casos de los que NO tenemos una prueba real, y adivinar en ellos es tocar el saldo de alguien.
  // Se aceptan para no bloquear la caja, se anotan aquí y salen en el panel.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_revisiones (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER NOT NULL,
    local TEXT NOT NULL,
    motivo TEXT NOT NULL,
    detalle TEXT,
    creado_en TEXT NOT NULL,
    resuelto_en TEXT,
    resuelto_por TEXT,
    nota_resolucion TEXT
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_revision_factura
    ON fid_revisiones (factura_id, motivo)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_revision_abierta
    ON fid_revisiones (creado_en DESC) WHERE resuelto_en IS NULL`);

  // ── EL MODO SOMBRA ─────────────────────────────────────────────────────────
  //
  // Calcula lo que HABRÍA hecho, sin tocar ni un saldo ni contestar ni un Reward. Es lo que
  // permite encender el programa sabiendo ya que los números salen, en vez de descubrirlo con
  // clientes delante. NO guarda JSON ni nada del cliente: importes, puntos y motivo.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_sombra (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER NOT NULL UNIQUE,
    local TEXT NOT NULL,
    importe_pagado_centimos INTEGER,
    importe_antes_reward_centimos INTEGER,
    suma_paid_centimos INTEGER,
    suma_cambio_centimos INTEGER,
    suma_propina_centimos INTEGER,
    puntos_calculados INTEGER,
    reward_aplicado BOOLEAN NOT NULL DEFAULT FALSE,
    regla_id INTEGER,
    regla_version INTEGER,
    motivo TEXT,
    creado_en TEXT NOT NULL
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_sombra_fecha ON fid_sombra (creado_en DESC)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_sombra_local ON fid_sombra (local, creado_en DESC)`);
  // Por motivo: es lo que contesta «¿cuántas facturas no se han podido calcular, y por qué?».
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_sombra_motivo ON fid_sombra (motivo, creado_en DESC)
    WHERE motivo IS NOT NULL`);

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
