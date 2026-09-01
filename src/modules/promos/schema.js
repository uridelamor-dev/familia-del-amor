// Promociones — esquema. Aditivo e idempotente, invocado desde initDB().
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  pro_canjes ES INMUTABLE. Solo INSERT: ni UPDATE ni DELETE.              │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Por qué: un canje es lo que pasó en la barra, con el nombre de quien lo validó al lado.
// Es lo que se mira cuando cuadran mal las cuentas de una promoción, y es lo que protege al
// camarero cuando alguien sugiere que un cupón se validó solo. Un registro que se puede
// editar no sirve para ninguna de las dos cosas. Corregir un canje es anular el QR y emitir
// otro, nunca reescribir la fila.
//
// Hay un test que lee server.js y falla si alguien escribe un UPDATE o un DELETE sobre esta
// tabla. No es documentación: es un candado. Mismo trato que fic_eventos.

export async function ensureSchemaPromos(x) {
  // ── La promoción ───────────────────────────────────────────────────────────
  // `locales` vacío = vale en todas las barras. Se guarda como lista de textos y no como FK
  // a `establecimientos` porque todo el resto del sistema —fichajes, horarios, reservas—
  // sigue identificando el local por su texto, y mezclar los dos criterios en una tabla
  // nueva obligaría a traducir en cada consulta.
  //
  // `automatica` es la clave de las promociones que crea el propio sistema y no una persona
  // (hoy solo `bienvenida_web`, el 10 % de la landing). Sirve para poder encontrarla sin
  // depender de su nombre, que Marketing puede cambiar cuando quiera.
  await x.run(`CREATE TABLE IF NOT EXISTS pro_promociones (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    locales TEXT NOT NULL DEFAULT '',
    desde TEXT,
    hasta TEXT,
    usos_por_cliente INTEGER NOT NULL DEFAULT 1,
    automatica TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TEXT NOT NULL,
    creado_por TEXT
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_promo_auto
    ON pro_promociones (automatica) WHERE automatica IS NOT NULL`);

  // ── El QR emitido ──────────────────────────────────────────────────────────
  // Dos clases:
  //   · `cupon`  — para una promoción concreta, con caducidad y usos contados.
  //   · `carnet` — permanente, sin promoción y sin límite: identifica a la persona. Su
  //                contador de `usos` acaba siendo el número de visitas registradas.
  //
  // EL TOKEN SE GUARDA EN CLARO, al revés que en pulso_invitaciones y fic_dispositivos.
  // Allí el hash existe para que ni con la base delante se pueda atar una respuesta a una
  // persona; aquí no hay nada que anonimizar. Y guardarlo en claro es lo único que permite
  // reenviar el enlace a quien perdió el mensaje, volver a enseñar el QR desde el panel e
  // imprimirlo. El código de 8 dígitos tiene que estar en claro de todas formas —lo teclea
  // el camarero—, así que hashear el token no cerraría nada que el código deje abierto.
  await x.run(`CREATE TABLE IF NOT EXISTS pro_qr (
    id SERIAL PRIMARY KEY,
    clase TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    codigo TEXT NOT NULL UNIQUE,
    promocion_id INTEGER,
    telefono TEXT NOT NULL DEFAULT '',
    nombre TEXT NOT NULL DEFAULT '',
    usos_max INTEGER NOT NULL DEFAULT 1,
    usos INTEGER NOT NULL DEFAULT 0,
    caduca_en TEXT,
    anulado_en TEXT,
    anulado_por TEXT,
    enviado_en TEXT,
    enviado_error TEXT,
    creado_en TEXT NOT NULL,
    creado_por TEXT,
    CHECK (clase IN ('cupon','carnet'))
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_pro_qr_promo ON pro_qr (promocion_id)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_pro_qr_tel ON pro_qr (telefono)`);
  // Un solo carné vivo por persona: si se emite otro sin anular el anterior, la misma
  // persona tendría dos identidades y sus visitas se contarían por separado.
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_qr_carnet
    ON pro_qr (telefono) WHERE clase = 'carnet' AND anulado_en IS NULL AND telefono <> ''`);

  // ── El canje ───────────────────────────────────────────────────────────────
  // `uso_n` es el ordinal de ESE cliente en ESA promoción: 1 el primero, 2 el segundo. No es
  // decorativo, es el candado del límite por cliente.
  //
  // El límite «una vez por persona» no se puede garantizar contando antes de insertar: dos
  // tablets escaneando el mismo carné a la vez leen las dos «lleva 0» y las dos canjean. Con
  // el ordinal dentro de un índice único, las dos calculan `uso_n = 1`, la base acepta una y
  // rechaza la otra. El código solo tiene que saber leer esa colisión como «ya se usó».
  //
  // El índice deja fuera los canjes sin teléfono (un cupón impreso en un flyer, que no es de
  // nadie): ahí no hay cliente al que limitar.
  await x.run(`CREATE TABLE IF NOT EXISTS pro_canjes (
    id SERIAL PRIMARY KEY,
    qr_id INTEGER NOT NULL,
    promocion_id INTEGER,
    telefono TEXT NOT NULL DEFAULT '',
    uso_n INTEGER NOT NULL DEFAULT 1,
    local TEXT,
    dispositivo_id INTEGER,
    worker_id INTEGER,
    worker_nombre TEXT,
    canjeado_en TEXT NOT NULL,
    epoch_ms BIGINT NOT NULL,
    idempotencia_key TEXT UNIQUE
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_pro_canje_qr ON pro_canjes (qr_id)`);
  // El índice del límite por cliente y, de paso, el de la consulta que lo comprueba: se hace
  // en caliente, con el cliente esperando en la barra.
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_canje_cliente
    ON pro_canjes (promocion_id, telefono, uso_n)
    WHERE telefono <> '' AND promocion_id IS NOT NULL`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_pro_canje_promo ON pro_canjes (promocion_id, epoch_ms)`);

  // ── El enganche con Campañas ───────────────────────────────────────────────
  // Una campaña puede llevar una promoción detrás: entonces el envío emite un cupón por
  // destinatario y resuelve `{cupon}` con el enlace personal de cada uno.
  //
  // Va aquí y no en initDB porque es la columna que ATA campañas con promociones, y quien
  // venga a entender esto tiene que encontrarlo junto al resto. El try es por si el esquema de
  // campañas no se hubiera creado todavía: entonces no hay nada que enganchar y no pasa nada.
  try { await x.run(`ALTER TABLE campanas_wa ADD COLUMN IF NOT EXISTS promocion_id INTEGER`); }
  catch (e) { console.error("[promos] campanas_wa.promocion_id:", e.message); }

  // ── La promoción de bienvenida de la web ───────────────────────────────────
  // El «10 % de descuento» del popup de la landing existía desde el principio como un texto
  // fijo en el handler de /api/leads: se guardaba en `leads.premio` y ahí se acababa. No
  // había código, ni caducidad, ni forma de saber si alguien lo había usado, así que la
  // misma persona podía pedirlo las veces que quisiera.
  //
  // Se crea una sola vez. Si Marketing la renombra o la desactiva, se respeta: el ON
  // CONFLICT DO NOTHING no vuelve a tocarla nunca.
  //
  // A los leads que ya existen NO se les emite cupón. Serían cientos de mensajes que nadie
  // ha pedido, y un descuento que se prometió hace dos años. Esta promoción cuenta desde
  // hoy; a quien reclame uno antiguo se le emite a mano desde Marketing.
  await x.run(
    `INSERT INTO pro_promociones (nombre, descripcion, usos_por_cliente, automatica, creado_en, creado_por)
     VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
    ["10 % de descuento", "Descuento de bienvenida por dejarnos tus datos en la web.", 1,
     "bienvenida_web", new Date().toISOString(), "sistema"]);
}
