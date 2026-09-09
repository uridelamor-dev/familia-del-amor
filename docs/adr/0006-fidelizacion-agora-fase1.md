# ADR 0006 — Fidelización con Ágora, Fase 1: piloto de Lloret sin premios

**Estado:** implementada, **sin desplegar y sin configurar en el TPV** · **Fecha:** 10 de septiembre de 2026

## Contexto

La Guía del Integrador de Ágora 8.7.2 define dos llamadas hacia nosotros:

1. **Validación** — `GET` a una URL que lleva `{member_id}` dentro. Respuesta: 200 con
   `MemberId`, `DisplayText` y `Rewards`; 404 si el participante no existe.
2. **Factura** — `POST` con la factura entera al cerrarla, con `LoyaltyProgram` dentro de los
   `InvoiceItem` que correspondan. Respuesta: 200 con `Status: "accepted"` y `PrinterText`, o
   `Status: "rejected"` con `RejectReason`.

**Y el dato que gobierna todo el diseño: un 4xx, un 5xx o no contestar IMPIDEN CERRAR LA FACTURA.**
Nuestra API se pone en el camino de la caja. El camarero puede desasociar al participante y cobrar
sin fidelización, pero eso es un paso manual en hora punta que no debería hacer falta nunca por un
fallo nuestro.

## Decisiones

### 1. El MemberId es el token opaco que ya existe

`pro_qr.token`: 32 bytes aleatorios en base64url, el mismo que ya lleva el QR del carné. No es una
URL, no es un teléfono y no se puede deducir de ningún dato personal.

**La búsqueda es SOLO por ese token.** Nunca por teléfono, correo, DNI ni nombre: un identificador
de fidelización que se puede adivinar desde un dato personal no es opaco, y quien tuviera la lista
de teléfonos podría consultar las visitas de cualquiera.

**Solo `clase = 'carnet'`.** `pro_qr` guarda también cupones y vales impresos, que son papeles al
portador. Si un vale sirviera de MemberId, cualquiera con un flyer sería socio.

> ⚠️ **Riesgo abierto:** la guía dice que el identificador es «alfanumérico», y base64url incluye
> `-` y `_`. Si Ágora valida con `[A-Za-z0-9]+` estricto, el piloto falla en el primer escaneo. No
> se cambia ahora (obligaría a reemitir los QR ya repartidos) y se detecta al instante: un 404 con
> un `member_id` recortado lo delata. La salida sería emitir los carnés nuevos con token
> hexadecimal, que `pro_qr.token` admite sin tocar el esquema.

### 2. Fase 1: `Rewards` es siempre `[]`

Congelado en el módulo (`REWARDS_FASE_1 = Object.freeze([])`) y con test. Devolver aquí cualquier
otra cosa sería prometer un descuento que la barra no puede aplicar, y el cliente se enteraría al
llegar la cuenta. `PrinterText` va vacío por lo mismo.

Esta fase sirve para identificar clientes, contar visitas y consumo, y **ver por fin el JSON exacto
que manda Ágora**. Los premios llegan cuando sepamos cómo es.

### 3. `accepted` es una promesa, y solo se hace cuando se puede cumplir

**La primera versión de esto estaba mal.** Contestaba `200 {Status:"rejected"}` ante una caída de
PostgreSQL. `rejected` significa «lo he recibido y no lo quiero»: Ágora lo da por entregado y **no
lo reenvía**. Pero si la base se cayó no sabemos si la factura quedó guardada, y decir que sí
convierte un fallo técnico en una pérdida silenciosa. Hoy, sin premios, se pierde una visita. Con
puntos serán puntos que el cliente cree tener y no tiene, y eso se descubre en la barra.

La regla correcta:

| Código | Significa | Cuándo |
|---|---|---|
| **200 `accepted`** | Está guardada de forma duradera | COMMIT hecho, o ya estaba con el mismo contenido |
| **200 `rejected`** | Decisión de negocio, y estamos SEGUROS | El documento no se puede procesar |
| **500** | **No sabemos si se guardó** | Ágora conserva la posibilidad de reenviar |

Un 500 impide cerrar la factura, sí. Es el precio correcto: el camarero **desasocia al participante
y cobra sin fidelización** —un paso manual, documentado— y no se pierde nada.

#### La matriz completa

| Caso | HTTP | Cuerpo | Persistencia | ¿Ágora puede cerrar? |
|---|---|---|---|---|
| Factura válida nueva | 200 | `accepted` | Factura + movimientos, **tras COMMIT** | Sí |
| Duplicado idéntico | 200 | `accepted` | Ya estaba; nada nuevo | Sí |
| Mismo `GlobalId`, otro cuerpo | 200 | `rejected` | Solo se marca `conflicto` + auditoría | Sí, sin fidelización |
| JSON malformado | 200 | `rejected` | Ninguna | Sí, sin fidelización |
| Cuerpo demasiado grande | 200 | `rejected` | Ninguna | Sí, sin fidelización |
| Token incorrecto | 404 | `{}` | Ninguna | **No** → desasociar |
| Integración desactivada | 404 | `{}` | Ninguna | **No** → desasociar |
| Socio inexistente | 200 | `accepted` | Factura sí, movimientos no; estado `sin_miembro` | Sí |
| PostgreSQL caído | **500** | `{"Status":"error"}` | **Indeterminada** → ROLLBACK | **No** → reintento o desasociar |
| Tiempo límite de PostgreSQL | **500** | `{"Status":"error"}` | **Indeterminada** → ROLLBACK | **No** → reintento o desasociar |
| Excepción inesperada | **500** | `{"Status":"error"}` | **Indeterminada** → ROLLBACK | **No** → reintento o desasociar |
| Devolución duplicada | 200 | `accepted` | Ya estaba; no se revierte dos veces | Sí |

Los tres 500 no llevan ningún detalle: al TPV no se le cuenta qué ha fallado por dentro.

### 4. Idempotencia impuesta por la base, no por una comprobación previa

La clave única es **`clave_factura`**, no `global_id` a secas:

```
clave_factura = <local-slug> | <tipo> | <global-id>
```

**Lleva el local dentro a propósito.** La Guía del Integrador no garantiza que el `GlobalId` sea
único entre locales distintos, y no tenemos forma de confirmarlo hoy. Si no lo fuera y la clave
fuese solo el `GlobalId`, el día que el piloto se amplíe la factura de un local taparía la de otro:
la segunda se vería como un reenvío, no apuntaría ni una visita y **no daría ningún error**. Meter
el local cuesta nada y cierra ese agujero antes de que exista.

El `INSERT` lleva `ON CONFLICT (clave_factura) DO NOTHING RETURNING id`: dos reenvíos simultáneos se
cruzan **en el índice**, no en un `SELECT` previo que uno de los dos podría adelantar. Lo mismo en
el libro con `clave_idem TEXT NOT NULL UNIQUE`, cuya clave **también lleva el local**.

`global_id_tipo` guarda si el identificador es **`oficial`** (el de Ágora) o **`debil`** (compuesto
por nosotros). Nunca se mezclan sin saber cuál es cuál. Si no viene `GlobalId`, la clave de respaldo
es `debil:<versión-del-algoritmo>:<local>:<hash>` — con el local **y** la versión dentro, porque una
clave de respaldo que no diga de dónde sale ni cómo se calculó no se puede auditar el día que haya
que hacerlo.

### 5. Política del conflicto: mismo `GlobalId`, cuerpo distinto

**No se procesa y NO se confirma.** Un `accepted` diría que hemos aceptado *este* documento, y lo
que tenemos guardado es otro. Se responde **`rejected`** con un motivo genérico —«Documento no
coincide con el ya registrado», sin nada del cuerpo—, se marca la factura como `conflicto` y se
audita. Es un 200, así que no bloquea la caja, y queda visible en el panel para mirarlo con calma.

No se apunta ni un movimiento nuevo.

### 6. Política del socio desaparecido

Si Ágora identificó a alguien cuyo carné ya no está —anulado entre la validación y el cierre—, la
factura **se acepta**, **no se apunta ningún movimiento** y la factura queda en estado
`sin_miembro`. No se crea un socio nuevo: sería un duplicado de una identidad que ya tuvo su carné,
y es exactamente lo que el índice único de carnés existe para impedir.

### 7. El libro es append-only

`fid_movimientos`, con el molde de `fic_bolsa_movimientos`: `clave_idem` único, saldo por `SUM`,
nada se actualiza ni se borra. Hay test de que no existe ni un `UPDATE` ni un `DELETE` sobre él.

**Una visita = una factura aceptada asociada a un MemberId.** Si la misma factura trae cinco líneas
del mismo carné, la clave `visita:<globalId>:<hash>` es la misma las cinco veces y el índice deja
pasar una. Una **devolución** genera un movimiento `devolucion` con importe negativo y **ninguna
visita**; la clave `devolucion:<globalId>:<hash>` impide revertir dos veces.

> El marcador exacto de una devolución no está confirmado: hoy se detecta por importes negativos.
> Se cerrará con la primera devolución real.

### 8. Token de integración

48 bytes aleatorios en base64url, en la URL porque no sabemos si Ágora admite cabeceras. En la base
solo su **hash** y una pista de cuatro caracteres. Comparación en tiempo constante. Uno por local,
revocable, desactivable y con caducidad a 90 días. **No se reutiliza `JWT_SECRET` ni `DATA_ENC_KEY`**,
y no hace falta ningún Secret nuevo: se genera desde el panel.

`DATA_ENC_KEY` sí se usa, con un dominio propio (`DOMINIOS.FIDELIZACION`), para cifrar el cuerpo de
la factura — que es un dato que **realmente necesita recuperación**: es el objetivo de esta fase.

## Qué se crea

| Tabla | Para qué |
|---|---|
| `fid_integraciones` | El token por local: hash, pista, activo, caducidad, revocación |
| `fid_facturas` | Una fila por factura · `UNIQUE (global_id)` · cuerpo cifrado · estado |
| `fid_movimientos` | El libro append-only · `clave_idem` único |
| `fid_validaciones` | Log de validaciones: hash del socio, resultado, `Agora-Version`, ms |

Rutas: `GET /api/fidelizacion/agora/:token/member/:memberId` ·
`POST /api/fidelizacion/agora/:token/factura` · siete de gestión con `requireAuth(["direccion"])`.

### 9. El JSON capturado

- **Cifrado con `DATA_ENC_KEY` en formato v2**, con dominio propio (`DOMINIOS.FIDELIZACION`). Si no
  hay clave se guarda `NULL`, nunca texto en claro.
- **Nunca aparece en un log ni en la auditoría.** La auditoría guarda contadores y el `GlobalId`;
  del cuerpo, nada.
- **Límite de tamaño** en dos sitios: el middleware `express.raw({ limit })` y una comprobación en
  el manejador.
- **Solo Dirección** puede verlo, y solo pidiéndolo expresamente con `?cuerpo=1`. La vista normal
  del panel enseña el **mapa de campos**, sin valores.
- **Se puede borrar sin tocar el libro**: `POST /api/fidelizacion/facturas/purgar-cuerpos` vacía
  `cuerpo_enc` y conserva la fila, su hash y su idempotencia. Son dos cosas distintas — el JSON es
  una muestra para diseñar la Fase 2; las visitas y el consumo son contables y se quedan.

### 10. Activar y desactivar no dejan nada a medias

El interruptor solo decide si el token resuelve. Con la integración desactivada o revocada, las dos
rutas devuelven **404** desde la primera línea, antes de tocar nada.

**Si se desactiva con una factura ya asociada a un socio, Ágora no podrá cerrarla.** El camarero
tiene que **desasociar al participante y cobrar sin fidelización**. No se pierde la venta, no queda
ninguna fila a medias y el libro no se toca: lo único que ocurre es que esa factura no cuenta como
visita. El panel lo avisa antes de desactivar, en la propia confirmación.

## Vuelta atrás

**Sin migraciones destructivas.** En orden de menos a más:

1. **Desactivar** desde el panel. El TPV recibe 404 al instante y el camarero desasocia y cobra.
   Segundos, y no se pierde ni un dato.
2. **Revocar** el token. Igual de inmediato, y además invalida la URL que esté puesta en Ágora.
3. **Quitar las URLs en Ágora.** Es lo único que hace que el TPV deje de llamarnos.
4. **Volver al commit anterior.** Las cuatro tablas `fid_*` se quedan donde están, sin que nadie las
   lea. No hace falta borrarlas, y borrarlas perdería lo que el piloto haya medido.

Nada de esto toca `pro_qr`, promociones, canjes, vales, leads, ventas ni WhatsApp. La fidelización
solo **lee** de `pro_qr`; hay test de que no escribe.

## Riesgos abiertos

- **El charset del MemberId** (ver 1). Comprobado que `-` y `_` **no son el problema del lado de
  Express**: son «unreserved» en la RFC 3986, `encodeURIComponent` no los toca y un test con un
  servidor Express real confirma que llegan intactos, tanto crudos como porcentaje-codificados. Lo
  que no se puede comprobar desde aquí es si el TPV los acepta al escribirlos en su configuración.
  **No se reemite ningún QR mientras el TPV real no demuestre que hay incompatibilidad.**
- **No hemos visto una factura real.** `GlobalId`, el campo del importe y el marcador de devolución
  se buscan de forma defensiva entre varios nombres plausibles, y se registra cuál acertó. La
  primera factura de verdad convierte esas suposiciones en certezas.
- **Cero premios**: si alguien espera un descuento en esta fase, no lo habrá. Hay que decírselo al
  equipo de Lloret antes de empezar.
