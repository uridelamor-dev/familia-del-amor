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
    tolerancia_bolsa_min INTEGER NOT NULL DEFAULT 10,
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
  // `tipo='descanso'` marca la fila de FIESTA: no se le asigna a nadie, se calcula sola a
  // partir de quién NO tiene turno ese día (ver descansos.js). Es una columna y no una
  // comprobación por el nombre del bloque porque el nombre lo cambia cualquiera desde el
  // panel, y de ese nombre pasaría a depender que la fila se rellene o no.
  await x.run(`ALTER TABLE hor_tramos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'turno'`);

  // ── Qué trabajo sabe hacer cada persona ────────────────────────────────────
  //
  // El generador sabía las horas de todo el mundo, sus vacaciones y sus descansos, pero no
  // sabía que alguien es cocinero: cubría un hueco de COCINA con quien estuviera libre. El
  // encargado tenía que rehacer a mano lo que le proponía, que es la forma más segura de
  // dejar de usarlo.
  //
  // NO ES UN SISTEMA DE COMPETENCIAS. No hay niveles, ni años, ni puntuaciones. La única
  // pregunta es «¿puede esta persona trabajar en esta área?», y se contesta sí o no.
  //
  // `principal` es un desempate futuro y una etiqueta para la ficha; hoy NO cambia a quién
  // elige el generador. La capacidad es una restricción, no una preferencia.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_worker_areas (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL,
    area_id INTEGER NOT NULL REFERENCES hor_areas(id) ON DELETE CASCADE,
    principal BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TEXT NOT NULL,
    creado_por TEXT,
    UNIQUE (worker_id, area_id)
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_wa_worker ON hor_worker_areas (worker_id)`);
  // Como mucho una área principal por persona. Lo garantiza la base, no el código.
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hor_wa_principal
               ON hor_worker_areas (worker_id) WHERE principal`);

  // ── «Sin configurar» NO es lo mismo que «cero áreas» ───────────────────────
  //
  // Es la distinción que hace que esto se pueda desplegar sin romper nada. Hoy nadie tiene
  // áreas: si «cero filas» significara «no puede trabajar en ninguna parte», el generador
  // dejaría de encontrar a nadie el día del despliegue.
  //
  //   NULL  → nunca se ha tocado. El generador se comporta como siempre (legacy).
  //   fecha → alguien lo configuró a propósito. A partir de ahí manda lo que haya, y CERO
  //           áreas significa de verdad «este no entra en el generador», que es un caso
  //           legítimo: alguien de oficina, o quien está de baja larga.
  //
  // Contar filas no sirve para distinguirlos, y por eso hace falta la columna.
  await x.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS areas_configuradas_en TEXT`);
  await x.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS areas_configuradas_por TEXT`);

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

  // ── Lo que se le comunicó a cada persona cuando cambió su horario ──────────
  //
  // Una fila = una persona × una publicación que le cambió algo. `diff` es el cambio CONGELADO
  // tal y como se le enseñó: no se recalcula nunca contra los datos de hoy, porque dentro de
  // un año la pregunta es «qué se le comunicó», no «qué habría cambiado».
  //
  // `entendido_en` es la ÚNICA columna que se actualiza en toda la tabla, y solo una vez, de
  // NULL a una fecha. Es el mismo trato que `anulado_por` en los fichajes y por el mismo
  // motivo: lo que prueba algo tiene que ser lo que se escribió, no lo que quedó al final.
  //
  // Y NO BLOQUEA NADA. El horario es oficial desde que se publica, pulse o no pulse nadie.
  await x.run(`CREATE TABLE IF NOT EXISTS hor_cambios_comunicados (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    lunes TEXT NOT NULL,
    worker_id INTEGER NOT NULL,
    semana_id INTEGER NOT NULL,
    publicacion_anterior_id INTEGER,
    publicacion_nueva_id INTEGER NOT NULL,
    version_anterior INTEGER,
    version_nueva INTEGER NOT NULL,
    diff TEXT NOT NULL,
    hash TEXT NOT NULL,
    publicado_en TEXT NOT NULL,
    creado_en TEXT NOT NULL,
    entendido_en TEXT,
    entendido_por TEXT,
    UNIQUE (publicacion_nueva_id, worker_id)
  )`);
  // Lo que pregunta el trabajador al entrar: «¿tengo algo sin ver?».
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_camb_wk
               ON hor_cambios_comunicados (worker_id, entendido_en)`);
  // Y lo que pregunta el encargado tras publicar: «¿quién lo ha visto?».
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_camb_pub
               ON hor_cambios_comunicados (publicacion_nueva_id)`);

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

  // ── El circuito humano de una ausencia ─────────────────────────────────────
  // La tabla ya servía para lo que hace Horarios —bloquear la planificación— porque los tres
  // consumidores (descansos, conflictos y el generador) ya filtraban `estado = 'aprobada'`.
  // Lo que faltaba era el flujo: quién la pidió, quién la resolvió y qué se le contestó.
  //
  // Todo aditivo. Ninguna fila existente cambia de significado: `origen = 'adjudicada'` por
  // defecto es exactamente lo que eran todas —las metía un responsable— y `estado` sigue
  // naciendo 'aprobada'.
  for (const col of [
    // 'solicitada' = la pidió el trabajador · 'adjudicada' = la metió un responsable, ya acordada
    "origen TEXT NOT NULL DEFAULT 'adjudicada'",
    "solicitado_por TEXT",       // quién la pidió (el propio trabajador)
    "solicitado_en TEXT",
    "comentario TEXT",           // lo que escribió el TRABAJADOR al pedirla
    "resuelto_por TEXT",         // quién aprobó o rechazó
    "resuelto_en TEXT",
    // Lo que se le contesta al trabajador. Aparte de `motivo`, que es la nota interna de quien
    // la creó: en una baja médica ahí puede haber información que al encargado no le toca ver.
    "respuesta TEXT",
    "cancelado_por TEXT",
    "cancelado_en TEXT",
  ]) {
    await x.run(`ALTER TABLE hor_ausencias ADD COLUMN IF NOT EXISTS ${col}`);
  }
  // La bandeja pregunta siempre por estado + fechas.
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_aus_estado ON hor_ausencias (estado, desde)`);


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

  // ── Disponibilidad: quién la escribió ──────────────────────────────────────
  // Hasta la fase de ausencias la escribía siempre un responsable desde Horarios →
  // Configuración, porque el trabajador no tenía dónde. Al abrirle la puerta hace falta poder
  // distinguir lo que declaró él de lo que le cambió otro: no para discutir, sino para que el
  // encargado sepa qué está mirando cuando el generador no asigna a alguien.
  //
  // Estos ALTER van AQUÍ, detrás del CREATE. Estaban más arriba y en una base existente
  // funcionaban de casualidad; en una nueva, la tabla todavía no existía y el esquema entero
  // se caía en ese punto.
  for (const col of [
    "origen TEXT NOT NULL DEFAULT 'trabajador'",   // 'trabajador' | 'administrativo'
    "autor TEXT",
    "actualizado_en TEXT",
  ]) {
    await x.run(`ALTER TABLE hor_disponibilidad ADD COLUMN IF NOT EXISTS ${col}`);
  }
  await x.run(`CREATE INDEX IF NOT EXISTS idx_hor_disp_wk ON hor_disponibilidad (worker_id)`);
}

// Áreas y tramos por defecto para un local que empieza. Se siembran una sola vez, al
// abrir el módulo: sin esto la primera pantalla estaría vacía y no se podría crear nada.
// Reproducen la estructura del PDF que se venía haciendo a mano.
export const AREAS_POR_DEFECTO = [
  // En el orden en que se recorre el local, que es como se lee un cuadrante.
  { nombre: "SALA", orden: 1 },
  { nombre: "BARRA", orden: 2 },
  { nombre: "COCINA", orden: 3 },
];
// Los dos turnos que se hacen de verdad. Son un PUNTO DE PARTIDA para un local que
// empieza, no una verdad: se editan desde Horarios → Configuración → Turnos, y cada local
// puede tener los suyos. La primera versión de esto venía copiada del PDF de agosto
// (11-16 y 19-01) y no era lo que se trabaja: asumir horarios ajenos sale caro porque
// luego todo lo demás —las necesidades, el generador, el PDF— cuelga de ellos.
export const TRAMOS_POR_DEFECTO = [
  { nombre: "MAÑANA", orden: 1, inicio_min: 480, fin_min: 960 },   // 08:00-16:00
  { nombre: "TARDE", orden: 2, inicio_min: 960, fin_min: 1440 },   // 16:00-00:00
  // La fila de fiesta del cuadrante de papel. Va al final y NO se rellena: sale de quién no
  // tiene turno ese día. Las horas son de relleno (la columna es NOT NULL y hay un CHECK);
  // no se enseñan ni se usan para nada, porque descansar no tiene horario.
  { nombre: "FIESTA", orden: 99, inicio_min: 0, fin_min: 1440, tipo: "descanso" },
];

/**
 * Convierte en fila calculada los bloques de FIESTA que ya existen escritos a mano, y crea
 * la fila en los locales que todavía no la tengan. Idempotente: se puede correr mil veces.
 *
 * Se hace UNA sola vez leyendo el nombre del bloque. A partir de aquí manda `tipo`, así que
 * renombrar el bloque no vuelve a cambiar su comportamiento — que es justo lo que no se
 * quiere: que el cuadrante dependa de cómo alguien escribió una palabra.
 *
 * Los turnos que hubiera colgando de ese bloque NO se borran: se sueltan (`tramo_id = NULL`)
 * y el cuadrante los recoloca en el bloque de trabajo con el que más se solapen. Borrarlos
 * sería perder trabajo planificado sin avisar.
 */
export async function migrarDescansos(x, ahora) {
  await x.run(
    `UPDATE hor_tramos SET tipo = 'descanso'
     WHERE tipo <> 'descanso' AND nombre ~* '^[[:space:]]*(fiesta|fiestas|descanso|descans|libre|libres|libranza|festa|festes)[[:space:]]*$'`
  );
  await x.run(
    `UPDATE hor_asignaciones SET tramo_id = NULL
     WHERE tramo_id IN (SELECT id FROM hor_tramos WHERE tipo = 'descanso')`
  );
  // Un local sin fila de fiesta se queda sin ella en el papel, y el cuadrante impreso deja de
  // decir quién libra. Se crea con el mismo nombre de siempre.
  await x.run(
    `INSERT INTO hor_tramos (local, nombre, orden, inicio_min, fin_min, tipo, creado_en)
     SELECT DISTINCT t.local, 'FIESTA', 99, 0, 1440, 'descanso', ?
       FROM hor_tramos t
      WHERE NOT EXISTS (SELECT 1 FROM hor_tramos d WHERE d.local = t.local AND d.tipo = 'descanso')
     ON CONFLICT (local, nombre) DO NOTHING`,
    [ahora]
  );
}

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
      `INSERT INTO hor_tramos (local, nombre, orden, inicio_min, fin_min, tipo, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (local, nombre) DO NOTHING`,
      [local, t.nombre, t.orden, t.inicio_min, t.fin_min, t.tipo || "turno", ahora]
    );
  }
  await x.run(
    `INSERT INTO hor_config (local, actualizado_en) VALUES (?, ?) ON CONFLICT (local) DO NOTHING`,
    [local, ahora]
  );
}
