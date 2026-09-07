# ADR 0002 — La tarjeta de cliente y la wallet del móvil

**Estado:** aceptada, **construida y APAGADA** · **Fecha:** 3 de septiembre de 2026

> ⚠️ **No está publicada.** Se terminó y se probó, y en la misma sesión se decidió no sacarla:
> «ahora mismo me lía más de lo que me aporta». Vive detrás de `config.tarjeta_activa`, apagada
> por defecto. Con el interruptor apagado no existe de cara al cliente —nada en la landing, y
> `/api/tarjeta/*` y `/api/wallet/*` devuelven 404— y un carné se comporta exactamente como
> antes de que esto existiera. La enciende dirección desde Promociones → Tarjeta de cliente.
> Ver la decisión 13, al final.

## Contexto

El carné de cliente existía desde el módulo de Promociones: `pro_qr` con `clase = 'carnet'`, uno
vivo por teléfono, con token opaco, código de ocho dígitos y un libro inmutable de canjes
(`pro_canjes`) detrás. Pero solo se podía conseguir de una forma: que alguien de Marketing lo
emitiera a mano desde el panel y se lo mandara por WhatsApp. El cliente no tenía ninguna manera
de pedirlo, y una vez recibido el enlace se perdía en la conversación al mes siguiente.

Lo que se pidió: que el cliente pueda hacerse la tarjeta él mismo —desde la web o escaneando un
QR en el local— y que a partir de ahí eso sea **su cuenta**: sus visitas, sus descuentos y su
paso por los locales. Y que se la pueda guardar en Apple Wallet o Google Wallet.

Explícitamente **no**: ni alta automática al dejar los datos en la web, ni emitirla en masa «a
quien queramos».

## Decisiones

### 1. La tarjeta ES el carné que ya existía

No se crea una entidad `clientes` ni una tabla de socios. Se le añaden columnas a `pro_qr`
(`origen`, `local_alta`, `wallet_apple_en`, `wallet_google_en`) y se le pone delante una página
nueva.

**Por qué:** el carné ya es la identidad del cliente en la barra, ya lo lee el escáner de la
tablet y ya tiene el libro de canjes detrás. Una entidad paralela crearía dos identidades para la
misma persona —el problema exacto que el índice único `idx_pro_qr_carnet` existe para impedir— y
habría que decidir cuál manda cada vez que no coincidieran.

### 2. El token es la llave; no hay cuenta con contraseña

Se sigue el patrón que el proyecto ya usa tres veces (pulso, kiosco, cupón): token opaco de 32
bytes en la URL, página `noindex` y `no-referrer`, rate limit por IP.

**Por qué:** pedirle una contraseña a alguien para ver sus propias visitas en un bar es la forma
más rápida de que nadie use esto. Y el pase de la wallet, que lleva ese enlace dentro, se
convierte en la forma natural de volver a entrar: **la tarjeta es la cuenta**.

### 3. Quien ya tenía tarjeta no la ve: se le manda

El formulario de alta es público y la única prueba de identidad es escribir un teléfono. Por eso:

- teléfono **sin** tarjeta previa → se crea y se le enseña ahí mismo;
- teléfono que **ya tenía** una → no se revela nada, se le reenvía el enlace por WhatsApp.

**Por qué:** si la respuesta enseñara siempre la tarjeta, cualquiera podría ir probando móviles
ajenos y quedarse con las visitas y los descuentos de otra persona. Es la misma regla que ya
razonó `bienvenidaWeb()` para el cupón del 10 %. Las dos ramas dicen lo mismo sobre el WhatsApp
a propósito: si una dijera «te lo hemos mandado» y la otra no, la diferencia entre las dos frases
sería el oráculo que la regla intenta no ser.

### 4. Las visitas se cuentan de `pro_canjes`

Hay tres cifras posibles y las tres son ciertas para otra pregunta: `pro_qr.usos` es un contador
que se puede desincronizar, `cliente_metricas.visitas` cuenta reservas y tickets del TPV (viene
gente que no enseña la tarjeta), y `pro_canjes` es exactamente las veces que un camarero pasó
esa tarjeta por el escáner.

Se elige `pro_canjes`: es la única que el cliente puede reconocer como suya, es inmutable, y es
la única sobre la que se podrán prometer premios sin que nadie se sienta estafado.

### 5. No se le enseña el gasto estimado

`cliente_metricas.gasto_est_min/max` no sale por la API de la tarjeta. Es una estimación nuestra
para segmentar: incómoda si acierta y discutible si falla. Hay un test que lo comprueba.

### 6. Una sola función compone el enlace del código de barras

`urlTarjeta()` en `src/modules/wallet/wallet.js`. La usan el QR de la página, el pase de Apple y
el objeto de Google.

**Por qué:** la tablet de la barra saca el `t=` de la URL con `normalizarEntrada()`. Si alguien
escribiera la URL a mano dentro del pase, el pase se guardaría bien, se vería bien, y el día que
un cliente lo enseñara no lo leería nadie. Hay un test que falla si aparece un segundo sitio.

### 7. El pase es estático, y por eso no declara servicio web

`pass.json` no lleva `webServiceURL` ni `authenticationToken`, y `primaryFields` va vacío.

**Por qué:** son los campos que activan las actualizaciones automáticas, y declararlos sin el
servicio detrás hace que iOS reintente contra un 404 cada vez que el pase aparece en pantalla. Lo
único que merecería el campo principal son las visitas, y un número congelado el día que se
guardó el pase es peor que ningún número: vive en la página, a un toque del propio QR.

**Consecuencia que hay que asumir:** un pase ya guardado **no se puede revocar**. Anular un carné
impide emitir pases nuevos, pero el que está en el móvil sigue ahí. No es un agujero: la validez
se decide siempre en el servidor cuando el camarero escanea, así que un carné anulado sale como
«anulado» en la tablet. El pase es una foto del QR, no una autorización.

### 8. Google sin llamadas servidor-a-servidor

El JWT de guardado lleva dentro la clase y el objeto, y Google los crea al guardarlos.

**Por qué:** evita OAuth, refresco de tokens y una cuota que se agote un sábado por la noche. El
precio es que cambiar el diseño de la clase más adelante sí pide la API — un cambio que se hace
una vez al año.

### 9. Apple se firma con el binario de openssl

Node sabe firmar pero no sabe construir una estructura CMS/PKCS#7, y aquí no se pueden añadir
dependencias npm. Se usa `openssl smime` vía `execFileSync`, como ya se usa `gs` para comprimir
PDF, y se declara `openssl` en `.replit` junto a `sqlite` y `ghostscript`.

Si openssl no está, el botón de Apple no se enseña y se dice por qué.

### 10. El ZIP del pase se monta con el escritor de las facturas

`crearZip()` de `src/modules/facturas/zip.js`, método «store», con su propia tabla de CRC-32.
Apple no exige deflate, los PNG ya vienen comprimidos, y la tabla propia evita depender de
`zlib.crc32`, que no está garantizado en el Node 20 de Replit.

### 11. La wallet no es un módulo del panel, es una pestaña de Promociones

Así no hay que tocar `NAV`, `TITLES`, `VIEW_ROLES`, `MODULOS_POR_LOCAL` ni `CATALOGO_MODULOS` ni
sus cuatro tests espejo. Las credenciales, dentro de esa pestaña, solo las ve dirección.

### 12. El cifrado de secretos sale de server.js

`agoraEncToken`/`agoraDecToken` pasan a delegar en `src/modules/seguridad/secretos.js`, que ahora
usan dos sitios. Misma sal (`agora-token-v1`) y mismo formato, así que lo que ya estaba guardado
se sigue descifrando. Hay un test que reproduce el formato viejo y comprueba que se lee.

### 13. Se entrega apagada, detrás de un interruptor, en vez de sin fusionar

Terminada la implementación, la decisión fue no publicarla: *«todo esto de las tarjetas y la
cuenta de cliente es importante, pero ahora mismo me lía más de lo que me aporta»*.

Se descartó **borrarla** (habría que rehacerla entera) y se descartó **dejarla en una rama**
(una rama viva se pudre: `server.js` recibe cambios cada semana y el conflicto crece solo). Se
elige un interruptor en `config`, apagado por defecto, con estas propiedades:

- **De cara al cliente no existe.** La landing no la menciona en ningún idioma, y las cuatro
  rutas públicas devuelven **404** —no 503— porque lo que se quiere decir no es «existe y está
  caído», es que ahí no hay nada.
- **Es reversible sin cicatriz.** Con el interruptor apagado, `proEnlace` devuelve para un carné
  exactamente lo que devolvía antes (`/cupon.html`), la página del cupón no redirige, y la
  tablet de la barra valida igual. Un carné emitido hoy se seguirá escaneando el día que se
  encienda: el token viaja en `?t=` en las dos URL.
- **La decisión la toma el servidor, no el navegador.** `/api/cupon/:token` devuelve un campo
  `tarjeta` y el front obedece. Si lo decidiera el front, redirigiría a una página que contesta
  404.
- **Si la lectura del interruptor falla, se queda apagada.** El lado seguro: como mucho no sale
  una función que hoy nadie usa; al revés saldrían páginas públicas que se decidió no publicar.
- **En el panel casi no ocupa sitio.** La pestaña solo la ve dirección y, apagada, enseña una
  tarjeta con un párrafo y un botón: ni contadores, ni carteles, ni certificados. Enseñar el
  aparataje de algo que nadie puede usar es justo lo que hace ilegible un panel.

Candado: `tests/tarjeta-apagada.test.js`. El descuido que caza es el de siempre —alguien toca la
landing o el arranque, esto se enciende solo, y aparecen páginas públicas que nadie quería—, que
no da error y se descubre porque lo pregunta un cliente.

## Lo que queda fuera, a propósito

- **La tarjeta que se actualiza sola** («7 visitas» sin abrir nada). En Google es un `PATCH`; en
  Apple obliga a montar el servicio web de PassKit entero más APNs. Se deja para más adelante y
  se mantienen simétricas las dos plataformas: una tarjeta que en Android se actualiza y en
  iPhone no es peor que una que no se actualiza en ninguna.
- **Los descuentos acumulados** (escalones de visitas que emiten un cupón). El diseño previsto es
  que la fidelización solo EMITA cupones y no invente una segunda forma de canjear nada, para que
  todo lo de aguas abajo siga siendo lo que ya está probado.
- **Los distintivos oficiales** de Apple y Google. Sus guías de marca exigen su propia imagen;
  mientras tanto hay un icono neutro acompañando un texto que dice lo mismo.
