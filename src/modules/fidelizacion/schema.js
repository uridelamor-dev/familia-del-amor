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
  // `serie` y `numero` son la identidad de DOCUMENTO, que no es el `GlobalId`: una devolución
  // llega con `RelatedInvoice { Serie, Number }` y sin ellos no hay forma de casarla con su
  // original. `importe_centimos` evita tener que descifrar el cuerpo para comparar importes.
  for (const col of ["global_id_tipo TEXT NOT NULL DEFAULT 'oficial'", "clave_factura TEXT",
                     "es_prueba BOOLEAN NOT NULL DEFAULT FALSE",
                     "serie TEXT", "numero TEXT", "tipo_documento TEXT", "importe_centimos INTEGER",
                     "devolucion_de INTEGER", "revertida_en TEXT", "revertida_por INTEGER"]) {
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
  // Por aquí se busca el original de una devolución. Lleva el local dentro: una devolución de un
  // local NUNCA puede tocar la factura de otro, aunque coincidan serie y número.
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_factura_doc
    ON fid_facturas (local, serie, numero) WHERE serie IS NOT NULL OR numero IS NOT NULL`);

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
  // `nombre` y `descripcion` son LO QUE LEE EL CAMARERO en su pantalla, así que se configuran:
  // un texto escrito en el código no se puede cambiar sin un despliegue, y ahí es donde se explica
  // el mínimo de la compra. `estado` separa el borrador de lo publicado.
  for (const col of ["reward_id TEXT", "gracia_minutos INTEGER", "nombre TEXT", "descripcion TEXT",
                     // BORRADOR por defecto. La tabla es nueva y no hay ninguna fila que
                     // rellenar, así que un `DEFAULT 'publicada'` solo serviría para que un INSERT
                     // descuidado dejara una regla viva sin que nadie lo decidiera. El endpoint
                     // siempre manda el estado explícito.
                     "estado TEXT NOT NULL DEFAULT 'borrador'"]) {
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

  // ── EL CATÁLOGO DE PRODUCTOS DE ÁGORA ──────────────────────────────────────
  //
  // LA IDENTIDAD ES COMPUESTA: `(local, producto_id)`. Nunca el `Id` a secas. Ya demostramos con
  // `Workplace.Id` que dos instalaciones de Ágora repiten identificadores, y el producto 14 de
  // Girona no tiene nada que ver con el 14 de Lloret.
  //
  // LO QUE DESAPARECE NO SE BORRA: se marca inactivo. Un producto puede seguir dentro de una
  // campaña vieja o de un movimiento ya escrito, y borrarlo dejaría esas filas apuntando al vacío.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_productos (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    producto_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    familia_id TEXT,
    familia TEXT,
    vat_id TEXT,
    iva NUMERIC,
    precio NUMERIC,
    tarifa_id TEXT,
    tarifa TEXT,
    precio_campo TEXT,
    formato_base_id TEXT,
    formatos TEXT,
    boton TEXT,
    plu TEXT,
    codigo_barras TEXT,
    por_peso BOOLEAN NOT NULL DEFAULT FALSE,
    vendible_principal BOOLEAN NOT NULL DEFAULT TRUE,
    vendible_complemento BOOLEAN NOT NULL DEFAULT FALSE,
    baja_en TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    sincronizado_en TEXT NOT NULL,
    creado_en TEXT NOT NULL
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_producto
    ON fid_productos (local, producto_id)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_producto_familia
    ON fid_productos (local, familia_id) WHERE activo`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_producto_nombre ON fid_productos (local, nombre)`);

  // El registro de CADA sincronización. Sin él, «el catálogo está sincronizado» es una afirmación
  // que nadie puede comprobar. NUNCA guarda el host ni el token: solo qué pasó y cuándo.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_sincronizaciones (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    ok BOOLEAN NOT NULL,
    api_version TEXT,
    anadidos INTEGER NOT NULL DEFAULT 0,
    actualizados INTEGER NOT NULL DEFAULT 0,
    inactivados INTEGER NOT NULL DEFAULT 0,
    descartados INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    ms INTEGER,
    error TEXT,
    avisos TEXT,
    lanzado_por TEXT NOT NULL,
    creado_en TEXT NOT NULL
  )`);
  // EN QUÉ ETAPA FALLÓ. Aditivo. Sin esto, todo fallo se guardaba como una palabra suelta —casi
  // siempre «TypeError»— y no se podía saber si el TPV estaba apagado, si la ruta no existía o si
  // lo que contestó no eran datos. Es lo que convierte el registro en algo que sirve para arreglar.
  try { await x.run(`ALTER TABLE fid_sincronizaciones ADD COLUMN IF NOT EXISTS etapa TEXT`); }
  catch (e) { console.error("[fidelizacion] alter fid_sincronizaciones:", e.message); }
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_sync_local ON fid_sincronizaciones (local, creado_en DESC)`);

  // ── GRUPOS DE PRODUCTOS REUTILIZABLES ──────────────────────────────────────
  //
  // «Cafés», «Bocadillos». Se eligen A MANO desde el catálogo: interpretar «cualquier café» por el
  // nombre metería un café irlandés de 6 € en un desayuno gratuito, y nadie lo vería hasta pagarlo.
  //
  // VERSIONADOS: una campaña guarda la versión del grupo con la que se publicó, así que ampliar
  // «Cafés» mañana no cambia lo que se prometió ayer.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_grupos (
    id SERIAL PRIMARY KEY,
    local TEXT NOT NULL,
    clave TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    productos TEXT NOT NULL DEFAULT '[]',
    estado TEXT NOT NULL DEFAULT 'borrador',
    creado_en TEXT NOT NULL,
    creado_por TEXT NOT NULL,
    CHECK (estado IN ('borrador','publicado','retirado'))
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_grupo_version
    ON fid_grupos (local, clave, version)`);

  // ── PROMOCIONES Y PREMIOS DE ÁGORA ─────────────────────────────────────────
  //
  // ESTO NO ES `pro_promociones`. Aquéllos son los cupones de la casa, que el camarero escanea en
  // la tablet. Esto es un `Reward` que le mandamos a ÁGORA para que lo aplique dentro de la
  // factura. Ni comparten tabla, ni límite, ni contador: juntarlos dejaría gastar dos veces el
  // mismo beneficio —una en la tablet y otra en la caja— sin que nadie lo viera hasta cuadrar el mes.
  //
  // VERSIONES INMUTABLES, como las reglas: publicar es insertar. El `reward_id` se genera al
  // publicar y no se recalcula, para que una factura que vuelve encuentre SUS condiciones.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_promos (
    id SERIAL PRIMARY KEY,
    clave TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    local TEXT,
    nombre TEXT NOT NULL,
    texto_cliente TEXT,
    texto_camarero TEXT,
    tipo TEXT NOT NULL,
    codigo_agora TEXT,
    codigo_comprobado_en TEXT,
    codigo_comprobado_por TEXT,
    valor NUMERIC,
    coste_puntos INTEGER NOT NULL DEFAULT 0,
    compra_minima NUMERIC NOT NULL DEFAULT 0,
    grupos TEXT NOT NULL DEFAULT '[]',
    dias TEXT NOT NULL DEFAULT '[]',
    hora_desde TEXT,
    hora_hasta TEXT,
    desde TEXT,
    hasta TEXT,
    limite_cuenta INTEGER NOT NULL DEFAULT 1,
    limite_total INTEGER NOT NULL DEFAULT 0,
    acumulable BOOLEAN NOT NULL DEFAULT FALSE,
    prioridad INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'borrador',
    gracia_minutos INTEGER,
    reward_id TEXT,
    campana TEXT,
    creado_en TEXT NOT NULL,
    creado_por TEXT NOT NULL,
    CHECK (estado IN ('borrador','publicada','pausada','finalizada'))
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_promo_version ON fid_promos (clave, version)`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_promo_reward
    ON fid_promos (reward_id) WHERE reward_id IS NOT NULL`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_promo_viva
    ON fid_promos (local, estado, desde, hasta) WHERE estado = 'publicada'`);

  // EL LIBRO DE PREMIOS. Append-only y con `clave_idem`, igual que los puntos: es lo que impide
  // que dos cajas den el último desayuno a la vez, y que un reenvío lo cuente dos veces.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_promo_usos (
    id SERIAL PRIMARY KEY,
    promo_id INTEGER NOT NULL,
    clave TEXT NOT NULL,
    qr_id INTEGER NOT NULL,
    local TEXT NOT NULL,
    factura_id INTEGER,
    clave_idem TEXT NOT NULL UNIQUE,
    reward_id TEXT,
    estado TEXT NOT NULL DEFAULT 'usado',
    nota TEXT,
    autor TEXT NOT NULL,
    creado_en TEXT NOT NULL,
    CHECK (estado IN ('usado','revertido'))
  )`);
  // Un premio por cuenta y promoción: el índice es el candado de verdad, no una comprobación previa.
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_promo_uso_cuenta ON fid_promo_usos (promo_id, qr_id)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_promo_uso_clave ON fid_promo_usos (clave, qr_id)`);

  // ── EL FORMULARIO PÚBLICO, CONFIGURABLE Y VERSIONADO ───────────────────────
  //
  // NO ES UN CENSO NUEVO. El alta sigue yendo a `leads`, el carné a `pro_qr` y el WhatsApp a
  // `cap_cola`, exactamente como hoy. Esto guarda SOLO cómo se ve y qué se pide: títulos, campos,
  // textos legales y fechas. Un segundo censo sería la forma más rápida de acabar con dos listas
  // de clientes que no cuadran.
  //
  // TEXTO SEGURO, NUNCA HTML. Lo escribe Marketing y lo lee un cliente en su móvil: aceptar HTML
  // libre aquí es aceptar un `<script>` en una página pública.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_formularios (
    id SERIAL PRIMARY KEY,
    clave TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    campana TEXT,
    local TEXT,
    estado TEXT NOT NULL DEFAULT 'borrador',
    titulo TEXT NOT NULL,
    subtitulo TEXT,
    introduccion TEXT,
    texto_boton TEXT NOT NULL DEFAULT 'Enviar',
    mensaje_exito TEXT,
    texto_posterior TEXT,
    imagen TEXT,
    campos TEXT NOT NULL DEFAULT '[]',
    consentimiento_texto TEXT,
    privacidad_url TEXT,
    abre_en TEXT,
    cierra_en TEXT,
    creado_en TEXT NOT NULL,
    creado_por TEXT NOT NULL,
    CHECK (estado IN ('borrador','publicado','cerrado'))
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_form_version ON fid_formularios (clave, version)`);
  // Aditivo. `idioma` decide en qué se le habla al cliente; `destacado` es la tarjeta verde;
  // `mensajes` guarda los textos de error TRADUCIDOS, porque un formulario en catalán que falla en
  // castellano es un formulario a medio traducir. `exige_whatsapp` y `sugerir_poblacion` son
  // comportamiento, no texto, y por eso se configuran también: una campaña que no regale nada por
  // WhatsApp no tiene por qué exigirlo.
  for (const col of ["idioma TEXT NOT NULL DEFAULT 'es'", "destacado TEXT",
                     "mensajes TEXT NOT NULL DEFAULT '{}'",
                     "exige_whatsapp BOOLEAN NOT NULL DEFAULT FALSE",
                     "sugerir_poblacion BOOLEAN NOT NULL DEFAULT FALSE",
                     // EL WHATSAPP QUE SE MANDA AL APUNTARSE. Aditivo y sin valor por defecto:
                     // vacío significa «no mandes nada». Encenderlo en una campaña que no lo
                     // prometía enviaría un mensaje a gente que se apuntó sin esperarlo.
                     "mensaje_wa TEXT"]) {
    try { await x.run(`ALTER TABLE fid_formularios ADD COLUMN IF NOT EXISTS ${col}`); }
    catch (e) { console.error("[fidelizacion] alter fid_formularios:", e.message); }
  }
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_form_vivo ON fid_formularios (clave, estado)`);

  // EL CONSENTIMIENTO, versionado con su texto. Guardar «aceptó» sin guardar QUÉ aceptó no sirve
  // para nada el día que alguien pregunte, que es justo cuando hace falta.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_consentimientos (
    id SERIAL PRIMARY KEY,
    telefono TEXT NOT NULL,
    formulario_clave TEXT,
    formulario_version INTEGER,
    texto TEXT NOT NULL,
    acepta_comercial BOOLEAN NOT NULL DEFAULT FALSE,
    origen TEXT,
    campana TEXT,
    creado_en TEXT NOT NULL,
    baja_en TEXT,
    baja_origen TEXT
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_cons_tel ON fid_consentimientos (telefono, creado_en DESC)`);
  // QUÉ POLÍTICA ACEPTÓ. Aditivo. Guardar el texto del consentimiento sin guardar la política a la
  // que remite deja la mitad de la respuesta: la frase dice «consulta la política», y sin saber
  // CUÁL no se puede reconstruir qué se le enseñó a esa persona ese día.
  for (const col of ["politica_version INTEGER", "politica_url TEXT"]) {
    try { await x.run(`ALTER TABLE fid_consentimientos ADD COLUMN IF NOT EXISTS ${col}`); }
    catch (e) { console.error("[fidelizacion] alter fid_consentimientos:", e.message); }
  }

  // ── LAS BAJAS ──────────────────────────────────────────────────────────────
  //
  // EL TOKEN NO SE GUARDA EN CLARO, se guarda su huella. El enlace viaja dentro de un WhatsApp,
  // que se reenvía, se captura y se queda en el móvil de cualquiera: si la base guardara el token
  // tal cual, quien leyera una fila podría darse de baja por otra persona —o volver a montar el
  // enlace—. Con la huella, de lo guardado no se puede reconstruir el enlace.
  //
  // Y NO HAY TELÉFONO EN ESTA TABLA salvo el que hace falta para aplicar la baja: se guarda
  // normalizado, porque es lo que hay que marcar en `marketing_prefs`, que es donde toda la casa
  // mira antes de escribirle a nadie.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_bajas (
    id SERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    telefono TEXT NOT NULL,
    comunicacion_id INTEGER,
    campana TEXT,
    creado_en TEXT NOT NULL,
    -- NULL mientras no se haya confirmado. Abrir el enlace NO lo rellena: solo el POST.
    confirmado_en TEXT,
    descartados INTEGER NOT NULL DEFAULT 0
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_bajas_tel ON fid_bajas (telefono)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_bajas_hechas ON fid_bajas (confirmado_en) WHERE confirmado_en IS NOT NULL`);

  // ── LA TARJETA DEL CLIENTE, CONFIGURABLE ───────────────────────────────────
  //
  // Una sola fila viva por versión. Colores de una PALETA CERRADA: dejar escribir un color libre
  // es dejar escribir `url(javascript:...)` en un estilo.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_tarjeta_config (
    id SERIAL PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    estado TEXT NOT NULL DEFAULT 'borrador',
    mostrar_puntos BOOLEAN NOT NULL DEFAULT TRUE,
    titulo TEXT,
    explicacion TEXT,
    paleta TEXT NOT NULL DEFAULT 'verde',
    imagen TEXT,
    texto_progreso TEXT,
    texto_recompensa TEXT,
    texto_sin_saldo TEXT,
    texto_preparacion TEXT,
    faq TEXT NOT NULL DEFAULT '[]',
    condiciones TEXT,
    orden_bloques TEXT NOT NULL DEFAULT '[]',
    contacto TEXT,
    privacidad_url TEXT,
    creado_en TEXT NOT NULL,
    creado_por TEXT NOT NULL,
    CHECK (estado IN ('borrador','publicada','retirada'))
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_tarjeta_version ON fid_tarjeta_config (version)`);

  // ── COMUNICACIONES ─────────────────────────────────────────────────────────
  //
  // El ENVÍO lo hace `cap_cola`, que ya existe, con sus reintentos, su ritmo y su tope diario.
  // Esto es la preparación: a quién, con qué texto, quién lo aprueba y cómo va. Sin aprobación de
  // Dirección no sale ni un mensaje.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_comunicaciones (
    id SERIAL PRIMARY KEY,
    clave TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    campana TEXT,
    local TEXT,
    plantilla TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'borrador',
    filtro TEXT NOT NULL DEFAULT '{}',
    destinatarios INTEGER NOT NULL DEFAULT 0,
    excluidos TEXT NOT NULL DEFAULT '{}',
    programada_para TEXT,
    aprobada_por TEXT,
    aprobada_en TEXT,
    pausada_en TEXT,
    enviados INTEGER NOT NULL DEFAULT 0,
    fallidos INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL,
    creado_por TEXT NOT NULL,
    CHECK (estado IN ('borrador','aprobada','enviando','pausada','terminada'))
  )`);
  // En qué idioma se le habla a la gente. Aditivo. Hace falta para el pie del enlace de baja: un
  // mensaje en catalán que acaba en «Para dejar de recibir estos mensajes» está a medio traducir.
  try { await x.run(`ALTER TABLE fid_comunicaciones ADD COLUMN IF NOT EXISTS idioma TEXT NOT NULL DEFAULT 'es'`); }
  catch (e) { console.error("[fidelizacion] alter fid_comunicaciones:", e.message); }
  // Un destinatario por comunicación: el índice es lo que impide mandar dos veces el mismo mensaje.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_comunicacion_envios (
    id SERIAL PRIMARY KEY,
    comunicacion_id INTEGER NOT NULL,
    telefono TEXT NOT NULL,
    qr_id INTEGER,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    motivo TEXT,
    cola_id INTEGER,
    creado_en TEXT NOT NULL,
    actualizado_en TEXT,
    CHECK (estado IN ('pendiente','encolado','entregado','fallido','excluido'))
  )`);
  await x.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_com_envio
    ON fid_comunicacion_envios (comunicacion_id, telefono)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_fid_com_envio_estado
    ON fid_comunicacion_envios (comunicacion_id, estado)`);

  // ── LA PUERTA DE PUESTA EN PRODUCCIÓN ──────────────────────────────────────
  //
  // UNA SOLA FILA. Guarda en qué punto está el programa en ESTA casa, quién lo confirmó y cuándo.
  // No es un interruptor más: encenderlo empieza a mover dinero de clientes reales, así que exige
  // una confirmación escrita y queda firmado. `pausado` es el freno de emergencia.
  //
  // El historial va en `fic_auditoria`, que es el registro transversal de la casa: aquí solo vive
  // el estado actual, para que no haya dos sitios donde mirar cuál es.
  await x.run(`CREATE TABLE IF NOT EXISTS fid_puerta (
    id INTEGER PRIMARY KEY DEFAULT 1,
    estado TEXT NOT NULL DEFAULT 'no_preparado',
    confirmado_por TEXT,
    confirmado_en TEXT,
    texto_confirmacion TEXT,
    pausado_por TEXT,
    pausado_en TEXT,
    motivo_pausa TEXT,
    sombra_revisada_en TEXT,
    sombra_revisada_por TEXT,
    actualizado_en TEXT,
    CHECK (id = 1),
    CHECK (estado IN ('no_preparado','sombra','listo_para_activar','activo','pausado'))
  )`);
  // Nace en `no_preparado` y NO se inserta nada más: un despliegue jamás deja el programa activo.
  try { await x.run(`INSERT INTO fid_puerta (id, estado, actualizado_en) VALUES (1, 'no_preparado', ?)
                     ON CONFLICT (id) DO NOTHING`, [new Date().toISOString()]); }
  catch (e) { console.error("[fidelizacion] puerta:", e.message); }

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
