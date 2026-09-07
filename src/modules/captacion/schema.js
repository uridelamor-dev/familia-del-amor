// Captación por campaña — esquema. Aditivo e idempotente, invocado desde initDB().
//
// Dos tablas y tres columnas. Nada de esto duplica lo que ya existe: la promoción y el cupón
// siguen siendo `pro_promociones` y `pro_qr`, y el canje sigue siendo `pro_canjes`. Aquí solo
// se añade de dónde vino la gente y cómo se le hizo llegar el código.

export async function ensureSchemaCaptacion(x) {
  // ── De dónde vino cada lead ────────────────────────────────────────────────
  // `leads.fuente` existía pero es texto libre, lo escribe cualquiera desde una ruta pública y
  // desde la web siempre valía 'web'. Con eso no se puede contestar la única pregunta que
  // importa cuando se paga por el tráfico: de lo que trajo el anuncio, ¿cuánto vino al local?
  //
  // `utm` va como JSON en una sola columna y no como cinco: son parámetros de otro (Meta) que
  // cambian cuando les apetece, y una columna por cada uno obliga a migrar el día que aparezca
  // el siguiente. Aquí no se filtra por ellos, se leen enteros al mirar una campaña.
  for (const col of ["campana TEXT", "utm TEXT", "landing TEXT"]) {
    try { await x.run(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col}`); }
    catch (e) { console.error("[captacion] alter leads:", e.message); }
  }
  await x.run(`CREATE INDEX IF NOT EXISTS idx_leads_campana ON leads (campana) WHERE campana IS NOT NULL`);

  // ── La campaña ─────────────────────────────────────────────────────────────
  // `clave` es la que viaja en la URL del anuncio (`/promo.html?c=girona-desayuno`) y es la
  // PUERTA: sin una clave viva la página redirige a la portada. Por eso es la primary key y no
  // un id numérico — un id se adivina probando, una clave no.
  //
  // `tope_altas` existe porque el primer regalo es un desayuno gratis en un solo local y un
  // solo día: sin tope, un anuncio que funciona demasiado bien se convierte en una cola de
  // gente a la que no se puede servir. 0 = sin tope.
  //
  // `textos` es un JSON por idioma con lo que se lee en la página y lo que se manda por
  // WhatsApp. Por idioma y no traducido al vuelo: son cuatro frases, las escribe Marketing, y
  // una traducción automática de la frase que le regala algo a un cliente es justo donde no se
  // quiere una sorpresa.
  await x.run(`CREATE TABLE IF NOT EXISTS cap_campanas (
    clave TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    promocion_id INTEGER NOT NULL,
    textos TEXT NOT NULL DEFAULT '{}',
    idioma TEXT NOT NULL DEFAULT 'es',
    altas_desde TEXT,
    altas_hasta TEXT,
    tope_altas INTEGER NOT NULL DEFAULT 0,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TEXT NOT NULL,
    creado_por TEXT
  )`);

  // ── La cola de envíos ──────────────────────────────────────────────────────
  // POR QUÉ UNA COLA Y NO ENVIAR EN LÍNEA, que es lo que se hacía:
  //
  //  1. Se le promete al cliente en pantalla que le llegará. Enviar en línea significa que si
  //     WhatsApp está caído —y cada redespliegue de Replit lo tumba— la promesa se rompe y no
  //     queda ni rastro de a quién había que reenviarle nada.
  //  2. El ritmo. Escribir el primero a desconocidos es el patrón que más baneos provoca, y el
  //     número es el mismo que lleva las reservas, Sara y los grupos internos. Una cola permite
  //     espaciar (6-15 s) en vez de soltar una ráfaga cada vez que el anuncio va bien.
  //  3. La respuesta HTTP no espera a WhatsApp. Antes el formulario se quedaba colgado lo que
  //     tardara el socket.
  //
  // `token` es DISTINTO del token del cupón, a propósito: es lo único que la página de gracias
  // recibe, y con él solo se puede preguntar «¿ha salido ya?». Si fuera el del cupón, la
  // pantalla que promete no enseñar el código lo estaría entregando en la respuesta.
  await x.run(`CREATE TABLE IF NOT EXISTS cap_cola (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    campana TEXT,
    telefono TEXT NOT NULL,
    texto TEXT NOT NULL,
    qr_id INTEGER,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    intentos INTEGER NOT NULL DEFAULT 0,
    ultimo_error TEXT,
    proximo_ms BIGINT NOT NULL,
    creado_en TEXT NOT NULL,
    enviado_en TEXT,
    CHECK (estado IN ('pendiente','enviado','fallido','descartado'))
  )`);
  // El índice de la consulta que corre cada treinta segundos.
  await x.run(`CREATE INDEX IF NOT EXISTS idx_cap_cola_pendientes
    ON cap_cola (proximo_ms) WHERE estado = 'pendiente'`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_cap_cola_campana ON cap_cola (campana)`);
}
