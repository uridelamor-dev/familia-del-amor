# 21 · Errores y observabilidad

## Estado actual (HECHO)

| Métrica | Valor |
|---|---:|
| `console.error` en `server.js` | **258** |
| `console.log` | 64 |
| `console.warn` | 17 |
| `catch` vacíos o solo con comentario | **43** |
| Logger estructurado | **ninguno** (`pino` está en `package.json` y **nunca se importa**) |
| Destino de logs | stdout/stderr → consola de Replit |
| Métricas | **ninguna** |
| Alertas | **una**: WhatsApp avisa a un teléfono hardcodeado tras 4 reintentos fallidos |
| Healthcheck | `GET /api/health` → `{ok:true}` **sin comprobar nada** |
| Trazas / correlación | ninguna |
| Auditoría de usuario | **parcial**: `fic_auditoria` (fichajes) y `campanas_auditoria` |

## Las dos preguntas que pide la auditoría

### «Si mañana algo deja de funcionar, ¿cómo nos enteramos?»

**Respuesta honesta: porque alguien lo nota.**

| Fallo | Cómo se detecta hoy |
|---|---|
| WhatsApp desconectado | ✅ **Alerta activa** tras 4 reintentos + píldora en el panel + atención en el dashboard |
| Ágora sin sincronizar | ❌ Solo mirando `/api/agora/estado`. **Sin alerta** |
| Google token caducado | ❌ Solo mirando `/api/facturas/status`. **Sin alerta** |
| Base de datos caída | ❌ `/api/health` **sigue diciendo `{ok:true}`** |
| API de Claude sin saldo | ❌ El usuario ve un mensaje al intentar usarla. **Sin alerta previa** |
| Endpoint lento | ❌ **Sin ninguna medición** |
| Error 500 | ❌ Un `console.error` en la consola de Replit que nadie lee |
| Campaña que falla a medias | 🟡 Queda en `campana_envios.estado='error'`, visible en el detalle |
| Cupón no entregado | 🟡 Queda en `pro_qr.enviado_error`, visible en el listado |
| Fichaje perdido | ✅ Imposible por diseño: cola offline + idempotencia |

**El dashboard es la observabilidad de facto**: `dashboard.service.js` genera la atención «Sara está
desconectada de WhatsApp» con severidad crítica. Es ingenioso —convierte un problema técnico en una
tarea de negocio— pero **requiere que alguien abra el panel**.

### «¿Podemos reconstruir qué ocurrió?»

**Parcialmente, y muy desigual:**

| Dominio | Reconstruible | Por qué |
|---|---|---|
| **Fichajes** | ✅ **Totalmente** | `fic_eventos` inmutable + `fic_correcciones` con motivo y autor + `fic_auditoria` |
| **Bolsa de horas** | ✅ **Totalmente** | Libro de movimientos append-only |
| **Canjes de promoción** | ✅ | `pro_canjes` inmutable con `worker_id` y `worker_nombre` |
| **Campañas** | ✅ | `campana_envios` por destinatario + `campanas_auditoria` |
| **Facturas** | 🟡 | Hay estados y `dup_estado`, pero no un historial de cambios |
| **Reservas** | ❌ | Se editan y se borran **sin dejar rastro**. `DELETE FROM reservas` |
| **Usuarios/permisos** | ❌ | Cambiar un rol o una allowlist **no deja registro** |
| **Configuración** | ❌ | `config` se sobreescribe |
| **Clientes** | 🟡 | `cliente_hechos` guarda `texto_original` y estado propuesto/confirmado ✅, pero editar un lead no deja rastro |

⚠️ **El contraste es llamativo**: el dominio con obligación legal (fichajes) tiene auditoría
ejemplar; los demás no tienen ninguna. **INFERENCIA**: la auditoría se construyó porque la ley la
exigía, no como principio del sistema.

## Los 43 `catch` vacíos

Muchos están comentados y son deliberados y correctos:
```js
catch { /* la tabla puede no existir todavía en una instalación nueva */ }
catch { /* nunca debe tumbar un envío */ }
catch { /* si no se puede leer, se sigue: el riesgo es repetir, no dejar de enviar */ }
```
✅ Ese razonamiento explícito es bueno.

⚠️ Pero otros tragan fallos sin dejar rastro. **Un `catch` silencioso en un sistema sin métricas es
un fallo que no existe hasta que alguien lo sufre.**

## Recomendaciones (sin añadir dependencias)

| # | Qué | Coste |
|---|---|---|
| 1 | **`/api/health` de verdad**: `SELECT 1`, estado de WhatsApp, última sincronización de Ágora, edad del token de Google | 20 líneas |
| 2 | **Middleware de tiempo por endpoint**: `console.log` de método, ruta, estado y ms. Base para cualquier optimización | 10 líneas |
| 3 | **Usar `pino`** — ya está instalado. Logs en JSON con nivel, listos para agregar | 30 líneas |
| 4 | **Alertas por WhatsApp** reutilizando `sendMensajeLibre` (ya se hace para la reconexión): Ágora >24 h sin sincronizar, token de Google caducado, tasa de 500 alta | 40 líneas |
| 5 | **Tabla `auditoria` genérica** con el molde de `fic_auditoria`, aplicada a usuarios, permisos, reservas y configuración | 1 tabla + un helper |
| 6 | Sustituir los `catch {}` mudos por `safeLogError(contexto, e)` — la función ya existe en `security.js` | mecánico |

⚠️ **Nota**: un servicio externo (Sentry) sería lo ideal pero **implica una dependencia npm**, que
`CLAUDE.md` prohíbe. Con `fetch` a la API HTTP de Sentry se podría hacer sin paquete — merece
evaluarse.
