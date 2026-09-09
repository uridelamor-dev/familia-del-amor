# ADR 0005 — Cifrado de secretos en reposo: `DATA_ENC_KEY` y formato v2 (R01)

**Estado:** implementada, **sin migrar en producción** · **Fecha:** 9 de septiembre de 2026

## Contexto

`server.js` derivaba la clave AES de los secretos guardados así:

```js
const AGORA_ENC_KEY  = derivarClave(resolveJwtSecret() || "tapeta", "agora-token-v1");
const WALLET_ENC_KEY = derivarClave(resolveJwtSecret() || "tapeta", "wallet-v1");
```

`resolveJwtSecret()` devuelve un **objeto** (`{ secret, status, source }`). Es verdadero, así que
el `|| "tapeta"` nunca entraba, y el `String()` de dentro de `derivarClave` lo aplastaba al literal
`"[object Object]"`. La clave real de cifrado era **una constante pública**, idéntica en cualquier
copia de este repositorio y reproducible sin acceso a ningún Secret. No dependía del `JWT_SECRET`.

Lo que hay cifrado con ella en producción: los **tokens y las contraseñas de los cuatro TPV de
Ágora** (`agora_locales.token`, `agora_locales.pass_enc`) y la **configuración de firma de la
wallet** (`wallet_config.datos_enc`). Siete valores confirmados, ninguno de los cuales se sabe de
memoria: si se pierden, no se pueden volver a escribir a mano.

## Decisión

### 1. Clave propia, no derivada del JWT

`DATA_ENC_KEY`: 32 bytes aleatorios en Base64, en los Secrets del deployment, **independiente del
`JWT_SECRET`**. No es solo que la anterior estuviera mal derivada: compartir llave entre la
autenticación y el cifrado de datos significa que rotar el `JWT_SECRET` —algo que se hace por otros
motivos y sin pensárselo— dejaría ilegibles todas las credenciales del TPV, sin aviso.

Se carga en `src/modules/seguridad/clave-datos.js`, que **no convierte nada**: si no es una cadena,
se rechaza diciendo qué llegó. Ésa es exactamente la puerta por la que entró R01.

### 2. El arranque no depende del Secret

**Si falta `DATA_ENC_KEY`, el servidor arranca igual.** Sigue leyendo todo lo guardado —el formato
viejo no necesita esta clave— y lo único que no puede hacer es **escribir** un secreto nuevo, que
es una acción de dirección y ocurre una vez cada muchos meses.

Negarse a arrancar convertiría un Secret olvidado en un restaurante sin reservas, sin Sara y sin
comandas, por un fallo que no afecta a nada de eso. Y obligaría a poner el Secret antes de
desplegar el código que lo entiende; así el orden lo elegimos nosotros.

Lo que **no** se hace, pase lo que pase: inventarse una clave de reserva. Sin clave no se cifra, y
guardar una credencial en claro «por ahora» devuelve un **503 que dice qué falta**.

### 3. Formato v2

```
enc:v2:<kid>:<iv>:<tag>:<ciphertext>
       │      └──────── base64url ────────┘
       └ 12 hex: SHA-256("kid-v2:" ‖ clave), truncado
```

AES-256-GCM, como antes. Lo nuevo:

- **`kid`**: identifica *qué* clave cifró el valor. Es lo que permite rotar sin adivinar: con dos
  claves cargadas (`DATA_ENC_KEY` y `DATA_ENC_KEY_ANTERIOR`), cada valor dice cuál le toca y se
  puede migrar poco a poco en vez de todo a la vez con el servicio parado. No se puede invertir.
- **El dominio va en los datos autenticados del GCM**, no en la cadena. El efecto es el mismo que
  tenían las dos sales del formato viejo —un secreto de Ágora no se abre con el contexto de la
  wallet— pero sin gastar una clave distinta por uso.

Se **leen** tres formas: v2, el formato legado y el texto en claro (que existió: hubo tokens
sembrados desde la variable `AGORA_LOCALES` sin cifrar). Se **escribe** una sola: v2.

Un valor que empieza por `enc:` y no casa con ningún formato es **corrupto**, no texto en claro.
Devolverlo tal cual sería mandarle a Ágora la cadena `enc:…` como si fuera la contraseña.

### 4. El lector viejo, encapsulado y con fecha de caducidad

`src/modules/seguridad/legado-inseguro.js` reproduce el cifrado roto **solo para leer**. Ahí dentro
**no hay ni puede haber una función de cifrar**: es la única garantía que aguanta el paso del
tiempo, porque no se puede llamar a lo que no existe.

Se borra cuando `--verificar` diga que no queda ningún valor legado y haya pasado tiempo suficiente
para descartar una vuelta atrás.

### 5. Una credencial ilegible no desaparece en silencio

Antes, `descifrar()` devolvía `null` tanto si no había contraseña como si la había y no se sabía
abrir, y `configsFromRows` descartaba la fila: el TPV dejaría de sincronizar **sin excepción y sin
una línea en el log**, y en el panel se vería «sin configurar». Se descubriría al cuadrar la caja.

Ahora `abrir()` devuelve `{ ok, valor, formato, motivo }`, y `server.js` cuenta los fallos y los
publica en `GET /api/agora/estado` bajo `cifrado`. El motivo nunca lleva datos.

## Migración

`scripts/migrar-cifrado.js`. **En seco por defecto**; escribir exige dos indicadores
(`--aplicar --si-estoy-seguro`). Todo en **una transacción** con `pg_advisory_xact_lock` y
`SELECT … FOR UPDATE`.

Tres reglas, y las tres existen por el mismo motivo — nadie se sabe esas contraseñas:

1. Antes de tocar un valor se guarda el **criptograma** anterior en `cifrado_copia_v1`. El
   criptograma, no el contenido: la copia no le vale a nadie que no tenga la clave, y permite
   deshacer sin conocer ni una contraseña. Tampoco se guarda un hash del contenido — un SHA-256 de
   una contraseña se rompe a fuerza bruta, y sería el mismo agujero en otra tabla.
2. Antes de confirmar, cada valor nuevo **se descifra y se compara** con el original, en memoria.
   Un `UPDATE` que escribe algo que no se puede volver a leer es la avería que nadie detecta hasta
   el día siguiente.
3. Si **un solo** valor no se puede leer, no se migra **ninguno**. Migrar «lo que se pueda» dejaría
   la mitad de los TPV en v2 y la otra mitad ilegible, sin forma de saber cuál era cuál.

**Idempotente y reanudable.** Al ser una sola transacción, una interrupción no deja nada escrito y
basta con relanzarla. Una segunda pasada con todo migrado no reescribe nada: los valores ya en v2
se saltan, y la copia solo se inserta si no existía (`ON CONFLICT DO NOTHING`), así que **nunca se
pisa la copia buena con el valor nuevo** — que es el fallo que la dejaría inservible.

### Cómo se ejecuta contra producción sin mover `DATABASE_URL`

El problema real: la Shell del workspace ve la base **vacía** del workspace, no la del deployment.
Copiar la `DATABASE_URL` de producción a otro sitio para lanzar un script es exactamente lo que no
queremos hacer.

**Mecanismo elegido: el comando de arranque del deployment.** Es el único proceso que ya tiene esas
credenciales, no abre ninguna superficie nueva y no deja nada montado después.

En `.replit`, temporalmente:

```toml
[deployment]
deploymentTarget = "vm"
run = ["sh", "-c", "node scripts/migrar-cifrado.js --aplicar --si-estoy-seguro; node server.js"]
```

El `;` (y no `&&`) es deliberado: si la migración aborta, el servidor arranca igual y sigue leyendo
el formato legado. Nunca se queda el restaurante sin sistema por esto.

**Se descartó una ruta administrativa temporal.** Aunque llevara autenticación de dirección,
confirmación adicional, uso único y auditoría, seguiría siendo un endpoint que reescribe
credenciales y que hay que acordarse de borrar. El comando de arranque hace lo mismo sin existir en
la superficie HTTP ni un segundo.

## Vuelta atrás

Escalada, de menos a más. Ninguna necesita conocer las contraseñas originales.

**A. Un TPV no conecta después de migrar.** Mirar `GET /api/agora/estado` → `cifrado.fallos`. Si
hay motivos `kid_desconocido`, el Secret no es el que se usó al migrar: reponerlo y redesplegar. Es
lo más probable y no requiere tocar la base.

**B. Restaurar los criptogramas anteriores.** Mismo mecanismo de arranque, con:

```toml
run = ["sh", "-c", "node scripts/migrar-cifrado.js --restaurar --si-estoy-seguro; node server.js"]
```

Devuelve cada columna al valor exacto que tenía en `cifrado_copia_v1`. El código actual **sigue
leyendo el formato legado**, así que a partir de ahí todo funciona como antes de la migración.
Después se revierte `.replit`.

**C. Volver al commit anterior.** Solo hace falta si el problema no es de datos sino de código. El
formato legado se sigue leyendo con el código viejo, así que B y C son compatibles en cualquier
orden.

**Qué NO toca nada de esto:** `leads`, reservas, WhatsApp, promociones, vales, canjes y ventas
históricas. Las tres columnas afectadas están listadas en `OBJETIVOS` y no hay ninguna más.

`cifrado_copia_v1` y el lector legado **no se borran automáticamente**. Se borran a mano cuando
`--verificar` esté limpio y haya pasado tiempo.

## Riesgos que quedan abiertos

- **Los secretos viejos hay que considerarlos comprometidos.** El cifrado no protegía nada frente a
  quien tuviera una copia de la base: la clave se reconstruye leyendo el repositorio. Migrar arregla
  el futuro, no el pasado. Lo correcto es **cambiar las contraseñas de los cuatro TPV en Ágora** y
  volver a introducirlas desde el panel, ya en v2. Decisión de Uriel.
- **Nada de esto se ha ejecutado contra producción.** Los conteos que se dan abajo son los
  esperados, no los medidos.
- La copia guarda criptogramas del cifrado roto, que sigue siendo descifrable por quien lea el
  repositorio. Es aceptable mientras esté (permite deshacer) y es una razón más para borrarla en
  cuanto la migración se dé por buena.
