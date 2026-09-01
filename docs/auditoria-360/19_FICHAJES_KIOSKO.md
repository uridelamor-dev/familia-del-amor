# 19 · Fichajes y kiosko

**El módulo mejor construido del sistema.** Tiene obligación legal detrás (RD-ley 8/2019: conservar
el registro de jornada 4 años) y el diseño lo refleja.

## Los tres invariantes (documentados en `CLAUDE.md` y blindados con tests)

1. **`fic_eventos` es inmutable.** La única columna que se actualiza es `anulado_por`. Corregir un
   fichaje es **escribir otra fila**, con motivo y autor.
   → Test: `[...server.matchAll(/UPDATE fic_eventos SET ([a-z_]+)/g)]` debe ser exactamente
   `["anulado_por"]`, y `DELETE FROM fic_eventos` no puede aparecer.
2. **Nunca se copia `min_planificado` en `min_fichado`** (ni al revés). La desviación entre el
   cuadrante y el reloj **es la señal**; borrarla destruye la prueba.
3. **La bolsa de horas es un libro de movimientos.** `fic_bolsa_movimientos` es 100 % append-only,
   sin columna `saldo`: el saldo es `SUM(minutos)`. Corregir es escribir un contra-asiento.

## Autenticación del kiosko — tres capas

```
CAPA 1 · TOKEN DE DISPOSITIVO
   /fichar.html?t=<32 bytes base64url>
   En BD solo el SHA-256 (fic_dispositivos.token_hash)
   Se enseña UNA vez al dar de alta, con su QR
   ficDispositivo(token) → activo AND revocado_en IS NULL

CAPA 2 · PIN DEL TRABAJADOR
   bcrypt contra users.pin_hash · 4-6 dígitos
   Bloqueo escalonado: 5 fallos → 60 s / 300 s / 1800 s
   Se comprueba el bloqueo ANTES de bcrypt (no gastar CPU)
   Mismo error si el usuario no existe, es de otro centro o no tiene PIN

CAPA 3 · TICKET HMAC
   ficEmitirTicket(workerId, dispId, ahora)  →  "wk.disp.exp.firma32"
   HMAC-SHA256 con JWT_SECRET · vale 2 minutos
   Atado al dispositivo: un ticket de una tablet NO vale en otra
   Verificación con crypto.timingSafeEqual
   Gracia de 48 h SOLO para fichajes que subieron de la cola offline
```

**Rate limiting**: `GET /api/fichar/:token` 60/min · `POST /pin` **12/min** («el único sitio del
sistema sin sesión que acepta un secreto») · `POST /evento` 30/min · cupones 30/min.

## Funcionamiento sin conexión

| Pieza | Cómo |
|---|---|
| **Service worker** (`fichar-sw.js`) | Red primero, caché de respaldo. **NUNCA cachea `/api/`** — «un listado de ayer diría que está dentro quien ya se fue» |
| **Cola** | IndexedDB (base `fichar`, store `cola`), con migración desde `localStorage` |
| **Reintento** | Cada 30 s y en `window.online` |
| **Aviso** | Franja amarilla `#ficCola` |
| **La hora** | La del **pulso**, no la del envío. Se marca `origen='kiosco_offline'` con su `desfase_ms` |
| **Validación de hora** | Fuera de [ahora-48 h, ahora+5 min] → **409**: «La tablet tiene la hora mal. Avisa a tu encargado: el fichaje no se ha perdido, hay que meterlo a mano» |
| **Idempotencia** | `cliente_id` → columna UNIQUE `idempotencia_key` |
| **PIN sin línea** | ❌ **No se puede comprobar y no se finge**: «Sin conexión: no se puede comprobar el PIN ahora. Apunta tu hora y dísela a tu encargado» |

✅ **La decisión más fina**: la hora **siempre la pone el servidor** salvo en diferido, y en ese caso
se marca el origen y el desfase. *«Se prefiere un dato marcado a un dato falso.»*

## Interfaz (`public/fichar.html` + `fichar.js`, 903 L)

5 pantallas: **¿Quién eres?** (rejilla de nombres + reservas del día) → **PIN** (teclado 3×4, entra
solo al completar) → **Acciones** (Entrar/Pausa/Salir según la máquina de estados) →
**Validar cupón** (desde 2026-09) → **Confirmación** (3,2 s).

- Botones de **88-96 px**; teclas de 86 px; acciones de 132 px
- **Cero campos de texto.** Solo se toca
- **Nada de `:hover`** (se queda pegado en táctil)
- **Todo se borra a los 20 s** de inactividad: nombre, ticket, PIN — y también del DOM
- Reloj: hora del servidor + `performance.now()`, **nunca `Date.now()` a pelo**

## Máquina de estados (`src/modules/fichajes/maquina.js`)

`fuera` / `dentro` / `pausa` · `accionesPermitidas(estado)` genera los botones ·
`evaluar()` decide si registrar, si es duplicado o si hay incidencia ·
**salir estando en pausa cierra la pausa automáticamente**, escribiendo el `pausa_fin` antes con la
misma hora y marcado como automático.

## Correcciones, validación y cierre

- `fic_correcciones` — append-only, **motivo obligatorio** (`CHECK (length(motivo) >= 5)`) y autor
- `VALIDAR_ROLES = ["direccion","rrhh"]` — **el encargado NO valida horas** (deliberado)
- `fic_jornadas` — proyección **recalculable**; lo único que es fuente de verdad es `min_validado` y
  su `firma_eventos`
- `fic_cierres` — un periodo cerrado no admite fichajes ni correcciones. Reabrir deja rastro.
  Un fichaje que llega tarde a un periodo cerrado **se registra igual** y avisa: «Queda registrado.
  Ese mes ya estaba cerrado, así que lo tiene que revisar tu encargado»
- `fic_auditoria` — quién hizo qué

## Validación de cupones (añadida 2026-09)

Botón discreto bajo la lista de nombres → «¿Quién lo valida?» → PIN → cámara frontal
(`BarcodeDetector`) o código de 8 dígitos tecleado. **Un canje nunca se encola sin conexión**
(al revés que los fichajes): uno guardado se gastaría dos veces en la otra tablet.

## Problemas

| # | Problema | Sev. |
|---|---|---|
| 1 | **`contabilidad` ve «Fichajes» y recibe 403** en los 15 endpoints (`06_AUTH_PERMISOS.md`) | 🔴 |
| 2 | El ticket usa `JWT_SECRET`: si el secreto es el de desarrollo (§7.2), **se pueden forjar tickets** y fichar por otro | 🟠 |
| 3 | `users` es a la vez cuenta de panel, ficha de trabajador y credencial de kiosko | 🟡 |
| 4 | `BarcodeDetector` no existe en Safari/iPad → respaldo tecleado (previsto y funcionando) | 🟢 |
| 5 | El token del dispositivo va en la URL → queda en el historial de la tablet | 🟡 Mitigado: la tablet no se cierra nunca y el token se puede revocar |
