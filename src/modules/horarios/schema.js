// Horarios — esquema. Aditivo e idempotente, como src/db/establecimientos.migration.js.
// Se invoca desde initDB() en server.js. Recibe un `x` con { run } para poder probarse
// contra un Postgres temporal sin arrancar el servidor.
//
// CONVENCIONES DEL MODELO
//
// · Los turnos NO tienen fecha de fin. Se guardan como minutos desde las 00:00 del día de
//   negocio, permitiendo pasar de 1440: un 20:00→02:00 es 1200→1560. Ver tiempo.js.
// · SALA y COCINA son FILAS de hor_areas, no constantes: mañana puede haber BARRA u OFFICE.
// · MAÑANA/TARDE/FIESTA son filas de hor_tramos CON su horario canónico. Eso es lo que
//   permite que el PDF solo anteponga la franja a quien se sale del turno general.
// · Una semana publicada nunca se edita: se clona en version+1 como borrador.

export async function ensureSchemaHorarios(x) {
  // Configuración por local. El corte del día decide a qué jornada pertenece un fichaje
  // de madrugada (defecto 06:00: las 02:10 del domingo son del sábado).
  await x.run(`CREATE TABLE IF NOT EXISTS hor_config (
    local TEXT PRIMARY KEY,
    corte_dia_min INTEGER NOT NULL DEFAULT 360,
    hora_cierre_min INTEGER,
    descanso_min_horas NUMERIC NOT NULL DEFAULT 12,
    tolerancia_min INTEGER NOT NULL DEFAULT 10,
    actualizado_en TEXT
  )`);

  await x.run(`CREATE TABLE IF NOT EXISTS hor_areas (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    nombre TEXT NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TEXT NOT NULL,
    UNIQUE (local, nombre)
  )`);

  await x.run(`CREATE TABLE IF NOT EXISTS hor_tramos (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    nombre TEXT NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    inicio_min INTEGER NOT NULL,
    fin_min INTEGER NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TEXT NOT NULL,
    UNIQUE (local, nombre),
    CHECK (fin_min > inicio_min AND fin_min <= 2160)
  )`);

  // Semana + versión + estado. Columna vertebral del versionado.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_semanas (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    lunes TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    estado TEXT NOT NULL DEFAULT 'borrador',
    origen TEXT,
    notas TEXT,
    avisos_aceptados TEXT,
    publicado_en TEXT, publicado_por TEXT,
    sustituido_en TEXT,
    cerrado_en TEXT, cerrado_por TEXT,
    creado_en TEXT NOT NULL, creado_por TEXT,
    UNIQUE (local, lunes, version),
    CHECK (estado IN ('borrador','publicado','sustituido','cerrado','descartado'))
  )`);
  // Como mucho un borrador y una publicada por semana y local. Lo garantiza la BD, no el
  // código: dos pestañas abiertas no pueden crear dos borradores de la misma semana.
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hor_sem_pub
               ON hor_semanas (local, lunes) WHERE estado = 'publicado'`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hor_sem_bor
               ON hor_semanas (local, lunes) WHERE estado = 'borrador'`);

  // Una fila = una persona, un día, unas horas. SIN unique por (semana, persona, día):
  // el turno partido (11-15 y 20-cierre) es lo normal en hostelería. Los solapes los
  // detecta una función pura, que puede explicar el problema; una restricción solo grita.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_asignaciones (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER NOT NULL REFERENCES hor_semanas(id) ON DELETE CASCADE,
    local TEXT NOT NULL,
    worker_id INTEGER NOT NULL,
    dia TEXT NOT NULL,
    area_id INTEGER REFERENCES hor_areas(id),
    tramo_id INTEGER REFERENCES hor_tramos(id),
    inicio_min INTEGER NOT NULL,
    fin_min INTEGER NOT NULL,
    fin_abierto BOOLEAN NOT NULL DEFAULT FALSE,
    tipo TEXT NOT NULL DEFAULT 'turno',
    nota TEXT,
    orden INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL,
    CHECK (tipo IN ('turno','libranza','vacaciones','baja','formacion','festivo')),
    CHECK (fin_min >= inicio_min AND fin_min <= 2160)
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_asig_sem ON hor_asignaciones (semana_id, dia)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_asig_wk ON hor_asignaciones (worker_id, dia)`);

  // Lo que la gente VIO, congelado. El PDF de un horario antiguo se regenera desde aquí,
  // no desde las tablas vivas: aunque en 2028 alguien renombre un área o dé de baja a un
  // trabajador, este JSON sigue contando lo que se publicó.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_publicaciones (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER NOT NULL UNIQUE REFERENCES hor_semanas(id) ON DELETE CASCADE,
    local TEXT NOT NULL,
    lunes TEXT NOT NULL,
    version INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    hash TEXT NOT NULL,
    publicado_en TEXT NOT NULL,
    publicado_por TEXT
  )`);

  // Plantillas: por día de la semana (0=lunes), no por fecha.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_plantillas (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TEXT NOT NULL, creado_por TEXT,
    UNIQUE (local, nombre)
  )`);
  await x.run(`CREATE TABLE IF NOT EXISTS hor_plantilla_lineas (
    id SERIAL PRIMARY KEY,
    plantilla_id INTEGER NOT NULL REFERENCES hor_plantillas(id) ON DELETE CASCADE,
    dow INTEGER NOT NULL,
    worker_id INTEGER,
    area_id INTEGER, tramo_id INTEGER,
    inicio_min INTEGER NOT NULL, fin_min INTEGER NOT NULL,
    fin_abierto BOOLEAN NOT NULL DEFAULT FALSE,
    tipo TEXT NOT NULL DEFAULT 'turno',
    nota TEXT, orden INTEGER NOT NULL DEFAULT 0,
    CHECK (dow BETWEEN 0 AND 6)
  )`);

  // Cuánta gente hace falta. Hoy alimenta los avisos ("el sábado por la noche vas corto");
  // mañana, el generador. Por eso entra ya: el solver no necesitará esquema nuevo.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_necesidades (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    area_id INTEGER NOT NULL REFERENCES hor_areas(id) ON DELETE CASCADE,
    tramo_id INTEGER NOT NULL REFERENCES hor_tramos(id) ON DELETE CASCADE,
    dow INTEGER NOT NULL,
    minimo INTEGER NOT NULL DEFAULT 0,
    objetivo INTEGER,
    desde TEXT, hasta TEXT,
    creado_en TEXT NOT NULL,
    CHECK (dow BETWEEN 0 AND 6)
  )`);

  // Contrato vigente. Fuera de `users` porque tiene historia: cambiar de 20 a 30 horas no
  // debe borrar que antes eran 20, ni recalcular los meses ya pagados.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_contratos (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL,
    desde TEXT NOT NULL,
    hasta TEXT,
    horas_semana NUMERIC NOT NULL,
    dias_semana INTEGER,
    creado_en TEXT NOT NULL, creado_por TEXT
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_contr ON hor_contratos (worker_id, desde)`);

  // Ausencias: bloquean la planificación y explican un "0 fichado" sin incidencia.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_ausencias (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL,
    local TEXT,
    tipo TEXT NOT NULL,
    desde TEXT NOT NULL, hasta TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'aprobada',
    motivo TEXT, autor TEXT, creado_en TEXT NOT NULL,
    CHECK (tipo IN ('vacaciones','baja','permiso','asuntos_propios')),
    CHECK (hasta >= desde)
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_aus ON hor_ausencias (worker_id, desde, hasta)`);

  // Disponibilidad declarada. Alimenta avisos ahora y el generador después.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_disponibilidad (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL,
    dow INTEGER NOT NULL,
    inicio_min INTEGER NOT NULL, fin_min INTEGER NOT NULL,
    preferencia TEXT NOT NULL DEFAULT 'disponible',
    desde TEXT, hasta TEXT, creado_en TEXT NOT NULL,
    CHECK (dow BETWEEN 0 AND 6),
    CHECK (preferencia IN ('disponible','prefiere','no_disponible'))
  )`);
}

// Áreas y tramos por defecto para un local que empieza. Se siembran una sola vez, al
// abrir el módulo: sin esto la primera pantalla estaría vacía y no se podría crear nada.
// Reproducen la estructura del PDF que se venía haciendo a mano.
export const AREAS_POR_DEFECTO = [
  { nombre: "SALA", orden: 1 },
  { nombre: "COCINA", orden: 2 },
];
// Los dos turnos que se hacen de verdad. Son un PUNTO DE PARTIDA para un local que
// empieza, no una verdad: se editan desde Horarios → Configuración → Turnos, y cada local
// puede tener los suyos. La primera versión de esto venía copiada del PDF de agosto
// (11-16 y 19-01) y no era lo que se trabaja: asumir horarios ajenos sale caro porque
// luego todo lo demás —las necesidades, el generador, el PDF— cuelga de ellos.
export const TRAMOS_POR_DEFECTO = [
  { nombre: "MAÑANA", orden: 1, inicio_min: 480, fin_min: 960 },   // 08:00-16:00
  { nombre: "TARDE", orden: 2, inicio_min: 960, fin_min: 1440 },   // 16:00-00:00
];

export async function sembrarLocal(x, local, ahora) {
  for (const a of AREAS_POR_DEFECTO) {
    await x.run(
      `INSERT INTO hor_areas (local, nombre, orden, creado_en) VALUES (?, ?, ?, ?)
       ON CONFLICT (local, nombre) DO NOTHING`,
      [local, a.nombre, a.orden, ahora]
    );
  }
  for (const t of TRAMOS_POR_DEFECTO) {
    await x.run(
      `INSERT INTO hor_tramos (local, nombre, orden, inicio_min, fin_min, creado_en)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (local, nombre) DO NOTHING`,
      [local, t.nombre, t.orden, t.inicio_min, t.fin_min, ahora]
    );
  }
  await x.run(
    `INSERT INTO hor_config (local, actualizado_en) VALUES (?, ?) ON CONFLICT (local) DO NOTHING`,
    [local, ahora]
  );
}
