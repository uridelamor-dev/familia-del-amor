# La Tapeta (Familia del Amor)

App de gestión interna + web pública de un grupo de restauración. **Responder siempre en español.**

## Stack
- Node.js + Express + **PostgreSQL** (`pg`, `DATABASE_URL`). ESM, **sin build ni bundler**.
  Frontend **vanilla** HTML/CSS/JS en `public/` (sin framework).
- `server.js` es un **monolito grande** — al editar, Read el rango antes de Edit (no editar a ciegas).
  La lógica nueva va en módulos **puros** bajo `src/modules/`, no dentro de `server.js`.
- Integración WhatsApp con **Baileys** (`whatsapp.js`), facturación en `facturas.js`.
- ⚠️ **No se pueden añadir dependencias npm.** `npm install` no funciona en local (el lockfile
  apunta al firewall de Replit) y un fallo de instalación en el despliegue es caída.

## Comandos
- **Arrancar:** `npm run dev` → `node server.js`.
- **Tests:** `npm test` → `node --test "tests/**/*.test.js"`. Descripciones en español;
  hay tests de introspección que leen `server.js`/`app.js` como texto para blindar invariantes.
- **Puerto:** `5000` (en Replit sale por el 80).
- **Reiniciar** (mata puerto + chrome/puppeteer + SingletonLock + relanza): `/restart-tapeta`.
- **Inventario de bloques:** `node tools/inventario-bloques.mjs` lista cada tarjeta de cada
  pantalla con su título y su altura, numeradas. Sirve para pedir cambios por número («12
  plegar», «19 fuera») en vez de describirlos. Necesita `puppeteer`; si falta, se salta.
- **Probar API** (login + endpoints, sin pegar token a mano): skill `tapeta-api` → `.claude/skills/tapeta-api/api.sh <endpoint>`.
- **Barrido de pantallas:** `node tools/barrido-rutas.mjs` abre las 19 vistas del panel en Chrome
  sin ventana (servidor falso incluido) **en ordenador (1280) y en móvil (390)** y avisa de
  errores de JS, pantallas en blanco, desplegables abiertos de casa y páginas que se salen de
  ancho. Necesita `puppeteer`, que **no** es dependencia: si falta, se salta. `npm test` lee el
  código; esto lo ejecuta, y ahí salen otros fallos.
- Login de prueba: usuarios `direccion` / `encargado`, contraseña `tapeta2024`. En una base
  **recién creada** pide cambiarla al entrar (todas las altas nacen con `pass_temporal`).

## Git ↔ Replit (importante)
La app también vive en Replit, que commitea al **mismo `main`**. Por eso **siempre `pull --rebase` antes de push**.
Ya está configurado global `pull.rebase=true` + `rebase.autoStash=true`, así que basta con usar `/commit-push`
(hace add → commit → pull --rebase --autostash → push). Nunca `push --force` sobre `main`.

## WhatsApp / Baileys (hecho recurrente)
- **En cada redeploy de Replit la sesión de WhatsApp se desconecta** y hay que re-linkar (escanear QR).
- Antes de subir cambios que reinicien el server, avisar de que tocará reconectar WhatsApp (y Google si aplica).
- Al reiniciar en local, borrar `.wwebjs_auth/session/SingletonLock` si el navegador quedó bloqueado.

## Seguridad (deuda conocida)
- ~~`JWT_SECRET` con fallback inseguro~~ **Arreglado**: en producción no arranca sin un secreto
  fuerte (`resolveJwtSecret`, refuse-to-boot). El login **sí** tiene freno por usuario y en la
  base (`src/modules/usuarios/acceso.js`: 5 fallos → 30 s, 2, 5, 15 min, y se suelta solo).
  Queda: contraseña seed `tapeta2024` y **sin helmet**.
- No commitear credenciales reales; el `.env` no va al repo.

## Imágenes
- Compresión de galería: `~/.claude/scripts/gallery-import.sh <prefijo> <glob-origen>` (usa `sips`, no hay PIL).

## Horarios y fichajes (registro de jornada)
Módulo grande y con reglas legales detrás (RD-ley 8/2019). Tres invariantes que **no se tocan**:
- `fic_eventos` es **inmutable**: la única columna que se actualiza es `anulado_por`. Corregir
  un fichaje es escribir otra fila, con motivo y autor. Hay un test que falla si aparece
  cualquier otro `UPDATE` o un `DELETE` sobre esa tabla.
- **Nunca** se copia `min_planificado` en `min_fichado` (ni al revés). La desviación entre el
  cuadrante y el reloj es la señal, y borrarla destruye la prueba.
- La bolsa de horas es un **libro de movimientos**, no un campo `saldo`: `fic_bolsa_movimientos`
  es 100 % append-only y el saldo es `SUM(minutos)`.

Otros puntos: la hora de un fichaje la pone el **servidor** (salvo los diferidos, marcados como
`kiosco_offline` con su desfase); el PDF del cuadrante se escribe a mano (base-14 + WinAnsi)
porque no se pueden añadir dependencias; y el generador (`solver.js`) **propone un borrador**,
no publica.

## Vales impresos (cupones anónimos)
Papeles con QR que se reparten en mano y canjea quien los traiga, sin datos. Un vale es un cupón
de `pro_qr` **sin teléfono** — el esquema ya lo tenía previsto (`idx_pro_canje_cliente` excluye
los canjes sin teléfono a propósito) y el canje en barra funciona igual, porque el candado de
concurrencia está en el UPDATE atómico de `SQL_CANJEAR`, que no mira el teléfono.

⚠️ **`usos_max = 0` significa ILIMITADO.** Un vale impreso con 0 son cien desayunos gratis con un
papel, y no da ningún error. La emisión usa `USOS_POR_VALE` (= 1) y hay test.

Panel → Promociones → **Emitir QR** → «Vales para imprimir · sin cliente»: promoción, nombre de la
tirada, cuántos (máx. 200) y caducidad → se descarga un ZIP con un **SVG por vale**, el CSV que
enlaza la imprenta y un LÉEME. **Con un solo vale baja el SVG suelto.** En «QR emitidos» hay
además «QR» y «PNG» por fila, para sacar el de cualquier cupón ya emitido.
- La **tirada** (`pro_qr.tirada`) agrupa: cuántos van, cuántos han vuelto, y anular un taco perdido.
  Su nombre no se puede repetir, para que el ZIP sea siempre lo que se imprimió.
- **El QR no baja de 3 cm** de lado: son 41 módulos, 0,67 mm cada uno. Va escrito en el LÉEME.
- Sin identidad no hay «uno por persona»: el único límite es un uso por vale, y por eso cada vale
  lleva su propio QR. Y el canje **no dice quién vino** — es el precio de ser anónimo.
Razones completas en `docs/adr/0004-vales-impresos.md`.

## Captación por campaña (anuncios de pago)
La landing **ya no tiene formulario de descuento**: el popup del 10 % y su franja se quitaron. La
captación vive en `/promo.html?c=<clave>`, a la que **solo se llega por el enlace del anuncio**
(sin enlaces internos, `noindex`, y sin una campaña viva redirige a la portada).

Invariantes, con tests que las blindan (`tests/captacion-cableado.test.js`):
- **La pantalla de gracias NO enseña el código.** Solo viaja por WhatsApp, y eso *es* la validación
  del teléfono. La respuesta devuelve un **token de seguimiento distinto del token del cupón**.
- **Un cliente, un solo código.** Si ya lo tiene se le dice «ya estás registrado» y **no sale ningún
  WhatsApp**; ni se revela ni se reenvía.
- **El envío va por cola** (`cap_cola`, worker cada 30 s): reintentos crecientes, ritmo 6-15 s, tope
  diario consultado, y **nada se borra** — lo fallido se ve en el panel y se puede reintentar.
- **El idioma lo decide el servidor**: ficha → móvil (`navigator.language`) → campaña.
- Antes de prometer nada se comprueba con `numeroTieneWhatsApp()` que ese número existe.

Las campañas se crean en **Promociones → Captación** (elige promoción, clave, plazo, tope, idioma,
textos) y sale la URL para pegar en Meta. Interruptor de pánico de la cola y píxel de Meta (apagado
por defecto, solo dirección) en esa misma pestaña. Razones completas en
`docs/adr/0003-captacion-campana-meta.md`.

⚠️ Escribimos **primero** desde el número que lleva reservas, Sara y los grupos: es el patrón que
más baneos provoca. Ritmo, tope y `wa_max_diario` no son adorno. Si escala → número aparte o API
oficial.

## Tarjeta de cliente y wallet — CONSTRUIDA Y APAGADA
⚠️ **Viene apagada y de cara al cliente NO EXISTE**: nada en la landing, y `/api/tarjeta/*` y
`/api/wallet/*` contestan 404. Decisión de negocio (sep 2026): está entera y probada, pero no se
publica todavía. El interruptor es `config.tarjeta_activa` (`'1'` = encendida), en memoria como
`TARJETA_ACTIVA`, y lo enciende **dirección** desde Promociones → Tarjeta de cliente, que es la
única pestaña que se ve mientras tanto. Candado: `tests/tarjeta-apagada.test.js`.
Con ella apagada, un carné se comporta EXACTAMENTE como antes: su enlace se queda en
`/cupon.html` y la barra lo valida igual. Encenderla es reversible y no borra nada.

La tarjeta **es** el carné de `pro_qr` (`clase = 'carnet'`), no una entidad nueva. Encendida, el
cliente se la hace él solo en `/alta.html` (o `/alta.html?l=<local>`, el QR del cartel de una mesa)
y su página `/tarjeta.html?t=<token>` es su cuenta: visitas, descuentos e historial. **No hay alta
automática ni emisión en masa**; la emisión manual de Promociones → Emitir se queda como rescate.

Cuatro cosas que no se tocan:
- **Un solo sitio compone el enlace del QR**: `urlTarjeta()` en `src/modules/wallet/wallet.js`. Lo
  usan la página, el pase de Apple y el de Google. La tablet de la barra saca el `t=` de esa URL;
  escribirla a mano en el pase da un pase que se guarda bien y que nadie puede leer en la barra.
- **Quien ya tenía tarjeta no la ve, se le manda**: `respuestaAlta()` no devuelve token si el
  teléfono ya tenía una. Es lo que impide llevarse la tarjeta de otro probando móviles ajenos.
- **Las visitas se cuentan de `pro_canjes`**, no de `pro_qr.usos` ni de `cliente_metricas`.
- **El gasto estimado no se le enseña al cliente.** Hay test.

El pase es estático a propósito (sin `webServiceURL`), así que **un pase ya guardado no se puede
revocar**: la validez se decide siempre en el servidor al escanear. Apple exige cuenta de Apple
Developer (99 €/año) y firma con el binario `openssl` (declarado en `.replit`); Google es gratis y
no necesita ninguna llamada servidor-a-servidor. Cada botón sale solo si su plataforma está
configurada, en Promociones → Tarjeta de cliente (credenciales solo para dirección).
Razones completas en `docs/adr/0002-tarjeta-de-cliente-y-wallet.md`.

Las imágenes del pase se generan **una vez** con `node tools/wallet-imagenes.mjs` (usa `sips`, solo
macOS) y se commitean en `public/assets/wallet/`.

## Interfaz: ordenador Y móvil, siempre
Todo cambio visual se entrega funcionando en las dos, sin que haya que pedirlo: el panel se usa
dentro de los locales con el teléfono en la mano. Comprobar a **1440×800 y 390×844** antes de dar
nada por hecho (`node tools/barrido-rutas.mjs` ya barre las dos). Lo que más falla: tarjetas que
se apilan y se comen la pantalla, barras de pestañas que se parten en dos filas, y tablas anchas
cuya primera columna —pegajosa— deja el dinero fuera de la vista.

## Deuda conocida
- ~~`hoyISO()` en UTC~~ **Arreglado.** Hay un único `hoyISO()` en `server.js` y usa
  `instanteMadrid()` (hora de Madrid). Lo que sigue en UTC —y es correcto— es la **aritmética
  sobre una fecha ya dada** (`addDiasISO`, `addDaysISO`): ahí el huso no estorba y meter hora
  local podría introducir saltos con el cambio de hora. Test: `tests/hora-de-madrid.test.js`.
- Analítica e Inventarios mantienen su propio selector de local (el resto usa el de la barra).

## Roadmap y estado
Roadmap de 8 mejoras + estado de Google Business/Reseñas: ver memoria global `project-latapeta`
(caso Google ID 1-7056000040689, pendiente de aprobación de cuota).
