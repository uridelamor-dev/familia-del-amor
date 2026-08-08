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

  // Día en que arranca el periodo de nómina. 1 = mes natural (lo habitual); 21 = del 21 al
  // 20, que también se usa mucho en hostelería. Es un ajuste por local, no una decisión que
  // haya que tomar para siempre: cambiarlo no toca ningún periodo ya cerrado.
  await x.run(`ALTER TABLE hor_config ADD COLUMN IF NOT EXISTS dia_inicio_periodo INTEGER NOT NULL DEFAULT 1`);

  // Grupo de WhatsApp al que se manda el cuadrante de este local. Se elige una vez y se
  // recuerda. Va aquí y no en `facturas_grupos` porque el grupo de las facturas es el de
  // los encargados y el del horario es el de todo el equipo: mandar el cuadrante al que no
  // es sería enseñárselo a quien no toca.
  await x.run(`ALTER TABLE hor_config ADD COLUMN IF NOT EXISTS wa_grupo_jid TEXT`);

  // ── Refuerzos ──────────────────────────────────────────────────────────────
  // Una necesidad puede ser de dos formas:
  //
  //   · TURNO COMPLETO: hereda las horas de su tramo (08-16, 16-00). Es el caso normal.
  //   · REFUERZO: una duración (4 h) dentro de una VENTANA (por ejemplo, las mañanas), y
  //     las horas concretas se deciden al planificar. Un refuerzo puede ser de 10 a 14 un
  //     día y de 11 a 15 otro, y eso no se puede expresar con una franja fija.
  //
  // La primera versión solo tenía lo primero, así que los refuerzos —que son la mitad de
  // la plantilla en fin de semana— no cabían en el modelo.
  for (const col of [
    "duracion_min INTEGER",          // si está, es refuerzo: esto es lo que dura
    "ventana_inicio_min INTEGER",    // y esta es la horquilla en la que puede caer
    "ventana_fin_min INTEGER",
    "etiqueta TEXT",                 // "Refuerzo mañana", para que se distinga en pantalla
  ]) {
    await x.run(`ALTER TABLE hor_necesidades ADD COLUMN IF NOT EXISTS ${col}`);
  }
  // El tramo deja de ser obligatorio: un refuerzo no pertenece a ninguno.
  await x.run(`ALTER TABLE hor_necesidades ALTER COLUMN tramo_id DROP NOT NULL`);

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

  // Bolsa de horas. LIBRO DE MOVIMIENTOS: no hay ninguna columna `saldo` en ninguna parte.
  // El saldo es SUM(minutos) —de todas las filas, sin filtros— y siempre se puede señalar de
  // dónde sale cada minuto. Corregir no modifica ninguna fila: se escribe un contra-asiento
  // y luego el movimiento nuevo, y los tres se quedan.
  //
  // Esta tabla es 100 % append-only: no tiene ni una sola columna que se actualice, ni
  // siquiera `anulado_por`. Un movimiento que ya no debe contar tiene enfrente otro que lo
  // compensa; tener además una marca de estado permitía descontarlo dos veces.
  await x.run(`CREATE TABLE IF NOT EXISTS fic_bolsa_movimientos (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL,
    local TEXT NOT NULL,
    dia TEXT,
    periodo TEXT NOT NULL,
    concepto TEXT NOT NULL,
    minutos INTEGER NOT NULL,
    clave_idem TEXT NOT NULL UNIQUE,
    referencia_id INTEGER,
    nota TEXT,
    autor TEXT NOT NULL,
    creado_en TEXT NOT NULL,
    CHECK (concepto IN ('jornada','ajuste','contra','liquidacion','arrastre'))
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_bolsa_wk ON fic_bolsa_movimientos (worker_id, periodo)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fic_bolsa_loc ON fic_bolsa_movimientos (local, periodo)`);

  // Cierre de periodo. Un periodo cerrado no admite fichajes nuevos ni correcciones: sin
  // esto, corregir un día de marzo en noviembre cambiaría una nómina ya pagada sin que
  // nadie se entere. Reabrir se puede, pero deja rastro.
  await x.run(`CREATE TABLE IF NOT EXISTS fic_cierres (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    etiqueta TEXT NOT NULL,
    desde TEXT NOT NULL,
    hasta TEXT NOT NULL,
    resumen TEXT,
    hash TEXT,
    cerrado_en TEXT NOT NULL,
    cerrado_por TEXT NOT NULL,
    reabierto_en TEXT,
    reabierto_por TEXT,
    reabierto_motivo TEXT
  )`);
  // Un solo cierre vivo por local y periodo; los reabiertos dejan de contar.
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fic_cierre_vivo
               ON fic_cierres (local, etiqueta) WHERE reabierto_en IS NULL`);

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
