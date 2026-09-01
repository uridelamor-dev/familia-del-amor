# 15 · WhatsApp

> Esta auditoría **no** ha provocado ninguna conexión ni envío. Todo procede de leer el código.

## Librería y sesión

**`@whiskeysockets/baileys ^7.0.0-rc13`** — cliente de WhatsApp Web no oficial. `whatsapp.js`
(1.260 líneas).

⚠️ **Es una *release candidate*** en producción.

### Autenticación
`useMultiFileAuthState(AUTH_DIR)` — sesión en ficheros. Directorio (`whatsapp.js:16-22`):
```js
const persistentDir = "/home/runner/latapeta-data/baileys_auth";   // Replit, persistente
… si no → path.join(__dirname, "baileys_auth")                     // local
```
**INFERENCIA**: el intento de usar un directorio persistente fuera del proyecto es precisamente para
sobrevivir a los redespliegues. `CLAUDE.md` dice que **aun así la sesión se cae en cada redeploy**,
así que o el directorio no persiste o WhatsApp invalida la sesión por otro motivo.

Vinculación: `GET /api/whatsapp/qr` → `getQRImage()` → se escanea desde el panel.

### Reconexión (`whatsapp.js:761-866`)
- Retroceso exponencial: `min(1000 * 2^intentos, 60000)`
- `DisconnectReason.loggedOut` → no reintenta (hay que reescanear)
- **Código 408 + ≥3 intentos** → pausa la reconexión automática: «QR ignorado N veces — pausando»
- **≥4 intentos fallidos** → **avisa por un canal externo** («Lleva N intentos fallidos. Código: X.
  Revisa Replit»)
- `sock.ev.on("creds.update", saveCreds)` — persiste credenciales

✅ La gestión de reconexión está bien pensada: distingue «me han desconectado» de «no puedo
conectar» y no entra en bucle.

## API expuesta (36 exports)

**Envío**: `sendMensajeLibre` · `sendDocumentoLibre` · `sendMediaLibre` · `sendConfirmacionCliente` ·
`sendConfirmacionPendienteCliente` · `sendCancelacionCliente` · `sendModificacionGrupo` ·
`sendNotificacionGrupo(+Pendiente)` · `sendCancelacionGrupo` · `sendMensajeAGrupo` ·
`sendDocumentoAGrupo`

**Estado**: `isReady()` · `getQRImage()` · `forceReconnect()` · `getGroups()` · `initWhatsApp()`

**18 `setOnX()` / `setXLoader()`** — inyección de callbacks desde `server.js`: `setOnReserva`,
`setOnCancelarReserva`, `setOnModificarReserva`, `setOnContactoLead`, `setOnMessage`,
`setOnGroupAttachment`, `setHistorialLoader`, `setPerfilLoader`, `setReservaLoader`,
`setSaraConfigLoader`, `setDocumentoResolver`, `setSeguimientoResolver`, `setTelefonoInterno`…

**INFERENCIA sobre el diseño**: la inversión de control mantiene `whatsapp.js` sin dependencias del
resto del sistema. Es limpio, pero crea un grafo de control invisible: para seguir qué pasa cuando
llega un mensaje hay que saltar entre los dos ficheros.

## Envío masivo — las protecciones (`src/modules/messaging/queue.js` + `server.js:14300-14420`)

Esta es la parte más cuidada, y con razón: **quemar el número de WhatsApp del negocio es
irreversible**.

| Protección | Dónde |
|---|---|
| `delayConJitter(6000, 15000)` entre mensajes | `queue.js` |
| **Tope diario** (`wa_max_diario`, por defecto 40) con reanudación al día siguiente | `enviarLoteWA` |
| Deduplicación: quien ya recibió no vuelve a recibir | `dispatchCampana` vía `campana_envios` |
| `filtrarEnviablesWA` — nunca a bajas, opcionalmente solo opt-in | `queue.js` |
| `excluir_baja = 1` **inyectado a la fuerza** en todo segmento | `segmentoDelBody`, `server.js:14444` |
| `esTelefonoInterno` — excluye al propio equipo | `queue.js` |
| Registro por destinatario | `campana_envios` |

**HECHO documentado**: el tope diario existía y **las campañas lo contaban pero no lo respetaban**;
se corrigió. El comentario lo cuenta: «una de trescientos salía entera de una sentada».

## Recepción y almacenamiento

`whatsapp_messages` (historial) · `wa_clientes` (agenda por `jid`) · `pending_whatsapp` (cola) ·
`wa_links`.

**Opt-out automático** (`server.js:15617`): si el cliente escribe `BAJA|STOP|NO MOLESTAR|DAR DE
BAJA|UNSUBSCRIBE` → `marketing_prefs.baja = 1` **y se borran sus `cliente_hechos`**.
✅ Detalle de RGPD muy por encima de lo habitual.

## Automatismos que envían solos

| Qué | Cuándo |
|---|---|
| Confirmación de reserva (cliente + grupo del local) | Al crear/modificar/cancelar |
| Cumpleaños | A las 10:xx hora de Madrid |
| Campañas programadas y campañas a medias | Cada ciclo del reloj |
| «¿Qué tal fue?» + petición de reseña | Al día siguiente de la reserva, **solo a quien salió contento** (`reservas/seguimiento.js`) |
| Invitaciones del pulso | Mensual |
| Cupones de promoción | Al emitir / en campañas con `{cupon}` |
| CV recibido | A un teléfono **hardcodeado** (`server.js:8015`) |
| Alerta de reconexión fallida | A un teléfono **hardcodeado** (`server.js:16686`) |

## Riesgos

| # | Riesgo | Sev. |
|---|---|---|
| 1 | **Baileys es no oficial y en RC.** WhatsApp puede bloquear la cuenta sin aviso ni recurso | 🔴 |
| 2 | **La sesión se cae en cada redespliegue** y requiere intervención humana (escanear un QR). Mientras tanto: sin confirmaciones de reserva, sin Sara, sin campañas | 🔴 |
| 3 | **Un solo número para todo**: reservas, marketing, Sara, alertas internas. Si se banea, cae todo a la vez | 🟠 |
| 4 | Teléfonos personales hardcodeados como destino de alertas | 🟡 |
| 5 | `.wwebjs_auth/`, `.wwebjs_cache/` — restos de la librería anterior sin limpiar | 🟢 |

**RECOMENDACIÓN estructural**: el sistema hace de WhatsApp una **dependencia crítica sin
alternativa**. Un canal de respaldo (email transaccional para confirmaciones de reserva) reduciría
el riesgo nº 1 y nº 2 a la vez, y el esquema ya está preparado (`campanas_wa.asunto`,
`marketing_prefs.opt_in_email`, `campana_envios.correo`).
