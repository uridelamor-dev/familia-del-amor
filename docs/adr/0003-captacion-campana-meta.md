# ADR 0003 — Captación por campaña de pago

**Estado:** aceptada e implementada · **Fecha:** 7 de septiembre de 2026

## Contexto

Se empieza a pagar tráfico en Meta hacia una ruta propia con un formulario. El cliente lo rellena,
ve una pantalla de gracias **sin el código**, y el código le llega por WhatsApp con un mensaje que
le agradece la confianza. Después lo canjea en barra.

Primera campaña: **desayuno gratis (un café y un mini) en La Tapeta de Girona, solo el 1 de octubre
de 2026**, público mayoritariamente gerundense.

Casi toda la maquinaria existía —cupones, envío por WhatsApp, canje con libro inmutable—, pero el
camino concreto no, y el que había tenía **siete fallos** que habrían roto la promesa de la
pantalla. Están listados abajo porque cuatro de ellos eran anteriores a esta campaña y llevaban
tiempo mintiendo en silencio.

## Decisiones

### 1. La clave de campaña es la puerta de la ruta

`/promo.html?c=girona-desayuno`. Sin una clave viva, la página redirige a la portada; una clave
inexistente y una campaña apagada devuelven **lo mismo** (404), porque distinguirlas convertiría
la ruta en un directorio de campañas que se puede sondear.

No hay **ni un enlace** a `/promo.html` en toda la web, y la página lleva `noindex, nofollow`. Se
entra por el anuncio o no se entra. Hay un test que recorre todos los HTML públicos y falla si
alguno la enlaza.

De paso, la atribución sale gratis: la campaña es una fila, no un texto libre en `leads.fuente`.

### 2. La pantalla de gracias no enseña el código — y eso ES la validación del teléfono

El código solo viaja por WhatsApp. Un número inventado no recibe nada, así que la validación no
necesita ningún mecanismo aparte: es el propio diseño.

Para que esa promesa no se pueda romper por descuido, la respuesta del alta devuelve un **token de
seguimiento distinto del token del cupón**. Con él solo se puede preguntar «¿ha salido ya?». Si
fuera el mismo, con él se abriría la página del cupón y se vería el código.

Y antes de prometer nada se pregunta a WhatsApp si ese número existe (`sock.onWhatsApp`, disponible
en Baileys y sin usar en todo el repo hasta ahora). Si no existe, se le dice en el acto para que lo
corrija en vez de esperar un mensaje que no va a llegar.

### 3. El envío va por cola, no en línea

Tres razones, por orden de importancia:

1. **Se le está prometiendo algo a alguien en pantalla.** En línea, si WhatsApp está caído —y cada
   redespliegue de Replit lo tumba— la promesa se rompe sin dejar rastro de a quién reenviarle.
2. **El ritmo.** Escribir el primero a desconocidos es el patrón que más baneos provoca, y el
   número es el mismo que lleva las reservas, Sara, las facturas y los grupos internos. La cola
   espacia 6-15 s: 150 mensajes son ~25 minutos, no una ráfaga.
3. La respuesta HTTP deja de esperar al socket de WhatsApp.

Reintentos con espera creciente (1 min → 5 → 15 → 1 h → 6 h, cinco intentos). **Nada se borra**: lo
que se rinde queda como `fallido` y se ve en el panel, con su motivo y un botón de reintentar.

Esto último es deliberado y corrige un patrón que ya existía: `pending_whatsapp` borraba la fila
después de intentar el envío, y como las funciones de envío se tragan sus errores, borraba también
las que no habían salido.

### 4. Un cliente, un solo código

Si el teléfono ya tiene cupón de esa promoción, se le dice **«ya estás registrado»** y **no sale
ningún WhatsApp**. Antes el camino equivalente reenviaba el mismo cupón, lo que convertía un
formulario público en una forma de hacer que le llegaran mensajes repetidos a un tercero.

No se revela el código ni se reenvía nada, así que probar el teléfono de otro no da más que esa
frase.

### 5. El idioma lo decide el servidor, en tres escalones

1. Lo que ya supiéramos de esa persona por sus WhatsApps (`marketing_prefs.idioma`),
2. el idioma del móvil (`navigator.language`, que viaja en el formulario),
3. el de la campaña — catalán en la de Girona.

Los textos van escritos a mano en los tres idiomas, no traducidos al vuelo: son cuatro frases, las
escribe Marketing, y la frase con la que se le regala algo a un cliente no es sitio para una
sorpresa de una traducción automática. Un idioma que no hablamos cae al siguiente escalón en vez de
colarse.

### 6. Tope de códigos por campaña

Un desayuno gratis, un local, un día. Sin tope, un anuncio que funciona demasiado bien es una cola
de gente a la que no se puede servir. Al llegar al tope el formulario lo dice y deja de dar
códigos. `0` = sin tope.

### 7. Las campañas se crean desde el panel

Promociones → Captación. Se elige una promoción ya creada, se rellenan clave, plazo, tope, idioma y
textos, y **sale la URL para pegar en Meta**. Apagar una campaña o cambiar el tope es un clic. No
hace falta tocar código para lanzar la siguiente.

### 8. Fuera el formulario de la landing

El popup del 10 % y su franja salieron de la portada: el descuento en tienda no está preparado. Con
ellos se fueron sus textos i18n en los tres idiomas y los cinco campos del editor web que ya no
pintaban nada — dejar campos editables de algo invisible es hacer que Marketing escriba textos que
no ve nadie. Lo guardado sigue en `contents` y vuelve el día que vuelva la sección.

### 9. Píxel de Meta, apagado por defecto y solo en esa página

Sin píxel, Meta optimiza a ciegas y cada formulario sale mucho más caro. Se carga **solo en
`/promo.html`** y solo si alguien de dirección escribe el id: un script de terceros en la portada es
otra conversación y otro consentimiento. El aviso de cookies es responsabilidad de quien lo activa,
y el panel lo dice al pedir el id.

## Lo que estaba roto y se ha arreglado de paso

| # | Qué | Por qué importaba |
|---|---|---|
| 1 | Una promoción **que aún no había empezado decía que ya había terminado** (`estadoDe` juntaba «todavía no» y «ya no» en `fuera_de_fechas`, y el texto miraba `hasta`) | Todo el que se registrara antes del 1 de octubre habría visto «Esta promoción terminó el 1 de octubre». Ahora hay estado `aun_no_empieza` y dice «Podrás usarlo el 1 de octubre» |
| 2 | **El consentimiento nunca llegaba al servidor**: el checkbox de la portada no tenía `name`, así que no entraba en el `FormData` | `marketing_prefs` no se rellenaba **jamás** desde la web. El formulario nuevo lo lleva, y hay un test |
| 3 | `bienvenidaWeb` **ignoraba el retorno de `proEnviarWA`** | La web decía «te lo hemos enviado» aunque WhatsApp estuviera caído |
| 4 | `proEnviarWA` con WhatsApp caído **no escribía nada en la base** | Esos cupones salían en el panel como «—», iguales que los recién emitidos: invisibles, imposible saber a quién reenviar |
| 5 | **No se comprobaba que el número tuviera WhatsApp**, y `formatPhone` antepone `34` a cualquier móvil que empiece por 6/7/9 | Un móvil francés se convierte en un español real: el código se le manda a otra persona. Y enviar a un número inexistente no da error |
| 6 | El **tope diario se incrementaba pero no se consultaba** desde cupones y carnés | Con 30-150 altas al día se pasaba entero y en silencio, desde el número que lleva la operación |
| 7 | **Cero atribución** y ningún píxel | No se podía saber qué trajo el anuncio |

## Lo que hay que asumir

Escribimos primero, desde el mismo número que lleva reservas, Sara, facturas y grupos internos. Con
30-150 al día se puede, con ritmo, tope y el interruptor de pánico del panel. **Si la campaña
escala, el camino es un número aparte para marketing o la API oficial de WhatsApp.** Un baneo aquí
no tumba la campaña: tumba la operación.

## Lo que queda fuera, a propósito

- **El embudo completo** (formularios → entregados → canjeados → han vuelto). Los números están
  todos, falta la pantalla que los cruza.
- **Los filtros de comportamiento en el panel.** `marketing/segmento.js` ya soporta
  `nunca_ha_venido`, `sin_venir_desde`, `visitas_min`, `valor_min`… y no están en ningún formulario.
  Es lo que permitiría la segunda ola: escribir el 2 de octubre a quien pidió el desayuno y no
  apareció.
- **Conversions API de Meta**, para atribuirle a Meta el canje real y no solo el formulario.
