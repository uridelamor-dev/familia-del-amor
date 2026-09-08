# ADR 0004 — Vales impresos: cupones anónimos con QR

**Estado:** aceptada e implementada · **Fecha:** 8 de septiembre de 2026

## Contexto

Hacía falta un vale **físico**, con un QR impreso, que sirviera a un cliente **anónimo**: se
reparte en mano y quien lo trae se lo canjea en la barra sin darnos ningún dato. Es lo contrario
de la ruta de captación (ADR 0003), que existe justo para quedarse con el teléfono.

**El sistema ya lo tenía previsto.** El comentario de `pro_canjes`
(`src/modules/promos/schema.js:89`) dice literalmente *«un cupón impreso en un flyer, que no es de
nadie»*, y el índice único del límite por cliente excluye a propósito los canjes sin teléfono. Todo
el camino ya funcionaba con `telefono = ''`: `proEmitir` lo acepta por defecto, `proEvaluar` tiene
el guard `if (promo && tel)`, el canje en el kiosco no lo mira, y la página del cupón ni lo lee.

**Lo único cerrado era la emisión**: `POST /api/promos/emitir` exige destinatarios y descarta a
quien no tenga móvil — deliberadamente, porque emitir a una persona es un acto sobre esa persona.
Un vale impreso es otra cosa y por eso tiene su propia puerta.

## Decisiones

### 1. Cada vale, su QR único y un solo uso

Un papel con un QR se fotografía y se comparte en un grupo de WhatsApp en dos minutos. Con un QR
por vale, el primero que llegue se lo lleva y **el daño se queda en ese vale**. Con un QR
compartido en toda la tirada, una sola foto abre barra libre.

El precio es imprimir dato variable: cada papel es distinto. Se asume, porque es lo que hace que
un vale valga algo.

### 2. `usos_max` nunca puede ser 0

`usos_max = 0` significa **ilimitado** en `estadoDe()` (`if (max > 0 && …)`) y en `SQL_CANJEAR`
(`usos_max = 0 OR usos < usos_max`). Un vale emitido con 0 sería infinitamente canjeable: cien
desayunos gratis con un solo papel, **sin dar ningún error** — se descubriría contando la caja a
final de mes.

La constante `USOS_POR_VALE = 1` vive en `src/modules/promos/vales.js` con esa explicación al
lado, la emisión la usa siempre, y hay un test que falla si aparece un `usosMax: 0`.

### 3. La salida son los QR sueltos, no un vale maquetado

Un ZIP con un **SVG por vale**, un **CSV** y un **LÉEME**. El diseño del papel lo monta quien
imprima con su plantilla de dato variable, que es como se trabaja de verdad.

- **SVG y no PNG**: vectorial, nítido a cualquier tamaño de impresión, sin decidir por adelantado
  a qué resolución se va a imprimir. `QRCode.toString(texto, { type: "svg" })` — la librería ya
  estaba instalada; el proyecto solo usaba `toDataURL`.
- **El CSV es lo que enlaza**: su columna `Fichero` dice qué SVG va en cada papel y `Codigo` qué
  número imprimir debajo. Con BOM, punto y coma y CRLF, como el CSV de facturas: es lo que Excel
  en español abre a la primera.
- **El nombre del fichero lleva el código dentro** (`vale-007-12345678.svg`): cuando en la
  imprenta se descuadra una fila, es lo único que permite volver a casar el papel con su QR.

### 4. El LÉEME va dentro del ZIP, y dice el tamaño mínimo

El fallo caro de esto no es de código: se maqueta el QR a 1,5 cm, no lo lee ninguna cámara, y se
descubre con quinientos papeles impresos. El LÉEME está escrito para quien abre el ZIP —que no
somos nosotros— y dice el número real: **41 módulos, 3 cm de lado mínimo, 0,67 mm por módulo**,
más el margen blanco alrededor.

Corrección de errores **nivel Q** (recupera un 25 %), y no el `M` por defecto: un vale vive
doblado en un bolsillo, se mancha y se arruga. El `M` está pensado para una pantalla limpia.

### 5. Un vale suelto no se envuelve en un ZIP

«Solo voy a hacer un vale» es un caso frecuente, y un ZIP con un fichero dentro es una molestia.
Si la tirada tiene uno, la descarga devuelve el SVG a pelo. Y `GET /api/promos/qr/:id/imagen`
saca el QR de **cualquier** cupón o carné ya emitido, en SVG o PNG — sirve para el vale suelto y
para imprimirle el suyo a alguien concreto sin volver a emitir nada.

### 6. La tirada agrupa, y su nombre no se repite

Columna `tirada TEXT` en `pro_qr` (aditiva, con índice parcial). Sin ella, cien vales son cien
filas idénticas sin nombre en el panel: no habría forma de saber cuáles son del buzoneo de Girona
ni de anular un taco perdido.

**El nombre no se puede repetir.** Si se dejara, el ZIP de «buzoneo-girona» sería a veces los cien
de septiembre y a veces los ciento cincuenta de septiembre y octubre, y nadie sabría qué se
imprimió. Se rechaza con 409 **antes de emitir nada**: media tirada emitida y luego un error es lo
peor de los dos mundos.

### 7. Se emite de uno en uno

`proEmitir` reintenta cuando el código de ocho dígitos ya existía, y esa lógica no se duplica. Con
doscientos como techo, doscientos INSERT son un suspiro y valen más que un camino nuevo que se
pueda desincronizar. El techo son 200 porque `GET /api/promos/qr` lista con `LIMIT 300`: una
tirada mayor no se podría ni mirar entera.

## Lo que hay que aceptar

**Sin identidad no hay «uno por persona».** El único límite es un uso por vale. Y el canje registra
el vale, la barra, la hora y quién lo validó, pero **no quién vino**: no alimenta
`cliente_metricas` ni el historial de nadie. Es el precio de que sea anónimo.

## Dos arreglos de paso

- **«Reenviar» en un cupón sin teléfono solo podía dar 409** (`proEnviarWA` devuelve «Sin
  teléfono»). Un botón que nunca puede funcionar se acaba pulsando igual y parece que algo está
  roto. Se esconde cuando no hay teléfono.
- **La tabla «QR emitidos» habría pintado cien filas de «—».** Un vale impreso se distingue ahora
  por su tirada.

## Verificado

El ZIP se abre con `unzip` de verdad, y los cinco QR de una tirada de prueba **se resuelven módulo
a módulo pintados a 3 cm** (113 px a 96 dpi): se muestrea el centro de cada uno de los 41×41 y se
compara con la matriz que generó `qrcode`. La lectura definitiva es con la tablet y un papel
impreso — `BarcodeDetector` no existe en Chromium sin ventana.
