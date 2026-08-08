// Fichajes — esquema. Aditivo e idempotente, invocado desde initDB().
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  fic_eventos ES INMUTABLE. No se hace UPDATE ni DELETE sobre ella, con   │
// │  una única excepción: marcar `anulado_por`. Corregir un fichaje es       │
// │  ESCRIBIR OTRA FILA, nunca cambiar la que había.                        │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Por qué: el registro de jornada es la prueba que la ley obliga a conservar cuatro años
// (RD-ley 8/2019). Un registro que se puede editar no prueba nada — es exactamente lo que
// un inspector espera encontrar en uno falsificado. Que las correcciones sean filas nuevas,
// con motivo y con nombre, es lo que hace que el registro valga algo, y de paso protege al
// trabajador: nadie puede cambiarle una hora sin dejar rastro.
//
// Hay un test que lee server.js y falla si alguien escribe un UPDATE o un DELETE sobre esta
// tabla. No es documentación: es un candado.

export async function ensureSchemaFichajes(x) {
  // El PIN vive en `users` como las demás columnas del perfil. bcrypt, unidireccional:
  // nada de copia reversible como la de las contraseñas de dirección — un PIN que se puede
  // leer permite fichar en nombre de otro.
  for (const col of [
    "pin_hash TEXT",
    "pin_temporal BOOLEAN DEFAULT FALSE",
    "pin_actualizado_en TEXT",
    "pin_intentos INTEGER DEFAULT 0",
    "pin_bloqueado_hasta TEXT",
  ]) {
    await x.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col}`);
  }

  // Tablets. El token viaja en la URL una sola vez; en la base solo su hash, como las
  // invitaciones del pulso.
  await x.run(`CREATE TABLE IF NOT EXISTS fic_dispositivos (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    nombre TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_visto TEXT,
    creado_en TEXT NOT NULL,
    creado_por TEXT,
    revocado_en TEXT,
    revocado_por TEXT
  )`);

  await x.run(`CREATE TABLE IF NOT EXISTS fic_eventos (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL,
    local TEXT NOT NULL,
    tipo TEXT NOT NULL,
    ocurrido_en TEXT NOT NULL,
    epoch_ms BIGINT NOT NULL,
    dia_negocio TEXT NOT NULL,
    minuto_local INTEGER NOT NULL,
    origen TEXT NOT NULL DEFAULT 'kiosco',
    dispositivo_id INTEGER,
    autor TEXT,
    motivo TEXT,
    idempotencia_key TEXT UNIQUE,
    desfase_ms BIGINT,
    anulado_por INTEGER,
    creado_en TEXT NOT NULL,
    CHECK (tipo IN ('entrada','salida','pausa_inicio','pausa_fin')),
    CHECK (origen IN ('kiosco','kiosco_offline','manual','importado'))
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_ev_wk ON fic_eventos (worker_id, dia_negocio)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_ev_loc ON fic_eventos (local, dia_negocio)`);

  // El `local` que se guarda es el DEL DISPOSITIVO, no el de la ficha del trabajador: lo
  // que importa del registro es dónde se fichó de verdad.

  // Correcciones. Append-only, motivo OBLIGATORIO y autor: es lo que hace que un registro
  // editable siga valiendo como prueba. Apunta al evento que se anula y/o al que se añade;
  // ninguno de los dos se toca después.
  await x.run(`CREATE TABLE IF NOT EXISTS fic_correcciones (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL,
    local TEXT NOT NULL,
    dia_negocio TEXT NOT NULL,
    accion TEXT NOT NULL,
    evento_anulado_id INTEGER,
    evento_nuevo_id INTEGER,
    motivo TEXT NOT NULL,
    autor TEXT NOT NULL,
    creado_en TEXT NOT NULL,
    CHECK (accion IN ('anadir','anular','sustituir')),
    CHECK (length(motivo) >= 5)
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_corr ON fic_correcciones (worker_id, dia_negocio)`);

  // Proyección de la jornada: RECALCULABLE. Nada de lo que hay aquí es fuente de verdad
  // salvo `min_validado` y su firma — el resto sale de fic_eventos y de hor_asignaciones
  // y se puede volver a calcular en cualquier momento.
  //
  // `min_planificado` y `min_fichado` viven en columnas SEPARADAS y jamás se copian el uno
  // en el otro. La diferencia entre ambos es la única señal de si el cuadrante es realista.
  await x.run(`CREATE TABLE IF NOT EXISTS fic_jornadas (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL,
    local TEXT NOT NULL,
    dia_negocio TEXT NOT NULL,
    semana_id INTEGER,
    min_planificado INTEGER NOT NULL DEFAULT 0,
    min_fichado INTEGER NOT NULL DEFAULT 0,
    min_pausa INTEGER NOT NULL DEFAULT 0,
    min_validado INTEGER,
    firma_eventos TEXT,
    validado_en TEXT,
    validado_por TEXT,
    validado_nota TEXT,
    incidencias TEXT,
    requiere_revision BOOLEAN NOT NULL DEFAULT FALSE,
    calculado_en TEXT NOT NULL,
    UNIQUE (worker_id, dia_negocio)
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_jor_loc ON fic_jornadas (local, dia_negocio)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_jor_rev ON fic_jornadas (local, requiere_revision) WHERE requiere_revision`);

  await x.run(`CREATE TABLE IF NOT EXISTS fic_auditoria (
    id SERIAL PRIMARY KEY,
    entidad TEXT NOT NULL,
    entidad_id INTEGER,
    accion TEXT NOT NULL,
    local TEXT,
    worker_id INTEGER,
    autor TEXT NOT NULL,
    detalle TEXT,
    creado_en TEXT NOT NULL
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_aud ON fic_auditoria (entidad, entidad_id)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_aud_t ON fic_auditoria (creado_en)`);
}
