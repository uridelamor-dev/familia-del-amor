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

### 3. Ninguna respuesta nuestra puede bloquear la caja

Del endpoint de facturas solo salen dos códigos: **200** y **404** (y el 404 es antes de mirar nada,
cuando el token no vale). Hay test que lo comprueba enumerando los `res.status()` del manejador.

| Situación | Respuesta | Por qué |
|---|---|---|
| Todo bien | 200 `accepted` | — |
| JSON malformado | 200 `rejected` | El problema es del documento; un 4xx bloquearía |
| Fallo interno | 200 `rejected` | Sin detalles: al TPV no se le cuenta qué falló |
| Factura repetida | 200 `accepted` | Ya se aceptó una vez |
| Mismo `GlobalId`, otro cuerpo | 200 `accepted` + conflicto auditado | Ver 5 |
| Socio que ya no existe | 200 `accepted`, sin movimientos | Ver 6 |

### 4. Idempotencia impuesta por la base, no por una comprobación previa

`fid_facturas.global_id` es **UNIQUE** y el `INSERT` lleva `ON CONFLICT DO NOTHING RETURNING id`.
Dos reenvíos simultáneos se cruzan **en el índice**, no en un `SELECT` previo que uno de los dos
podría adelantar. Lo mismo en el libro con `clave_idem TEXT NOT NULL UNIQUE`.

Si no viene `GlobalId`, se compone una clave con `SerialNumber`, `Number`, `Date` y el hash del
cuerpo, y **se marca `clave_debil = true`**. No se disfraza de `GlobalId`: una idempotencia que no
se sabe fuerte hay que poder mirarla después.

### 5. Política del conflicto: mismo `GlobalId`, cuerpo distinto

**No se procesa.** Se marca la factura como `conflicto`, se audita con los dos hashes y **se
responde `accepted`**. Devolver un error ahora bloquearía una caja por un problema que es nuestro,
y esa factura ya se aceptó una vez. Queda visible en el panel para mirarlo con calma.

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

- **El charset del MemberId** (ver 1). Es el que puede tumbar el piloto el primer día.
- **No hemos visto una factura real.** `GlobalId`, el campo del importe y el marcador de devolución
  se buscan de forma defensiva entre varios nombres plausibles, y se registra cuál acertó. La
  primera factura de verdad convierte esas suposiciones en certezas.
- **Cero premios**: si alguien espera un descuento en esta fase, no lo habrá. Hay que decírselo al
  equipo de Lloret antes de empezar.
