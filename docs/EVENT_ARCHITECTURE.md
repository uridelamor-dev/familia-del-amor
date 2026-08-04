# Arquitectura de eventos

> Objetivo: **desacoplar los módulos**. Un módulo no llama directamente a otros cinco; **emite un evento** ("ha pasado esto") y quien quiera reacciona. Así se crece durante años añadiendo reacciones sin tocar el módulo origen.
> **Sin sobreingeniería:** empezamos con un **bus de eventos en proceso** (dentro del propio monolito modular), no con Kafka/RabbitMQ ni infraestructura externa. Evolutivo y reversible.

## 1. Idea

```
                 ┌─────────────┐
   Reserva  ───▶ │  EVENTO:    │ ───▶  Dashboard (actualiza KPIs cacheados)
   creada        │ reserva.    │ ───▶  Notificaciones (grupo del local)
                 │ creada      │ ───▶  Sara / IA (contexto proactivo)
                 └─────────────┘ ───▶  Auditoría
                                 ───▶  Analytics / KPIs
```

El emisor **no sabe** quién escucha. Los suscriptores **no conocen** al emisor. Se añaden/quitan reacciones sin modificar el origen.

## 2. Principios

1. **Bus en proceso, ligero.** Un emisor/suscriptor (event emitter) dentro de la app. Nada de brokers externos hasta que el volumen lo justifique (probablemente nunca a esta escala).
2. **Eventos de dominio, en pasado.** `reserva.creada`, `reserva.modificada`, `reserva.cancelada`, `incidencia.abierta`, `factura.recibida`, `candidatura.recibida`, `usuario.permisos.cambiados`, `whatsapp.desconectado`… Nombre claro, verbo en pasado.
3. **Se emiten DESPUÉS de confirmar el cambio** (post-commit): primero persiste el dato, luego se anuncia. Un fallo en un suscriptor **no** revierte la operación principal.
4. **Suscriptores aislados y tolerantes a fallo.** Si "analytics" peta, no afecta a "notificaciones" ni a la reserva. Cada handler con su try/catch; errores a logs/auditoría.
5. **Idempotencia y orden no garantizados** por diseño: los handlers se escriben para tolerar reintentos y no asumir orden estricto.
6. **Payload mínimo y estable:** el evento lleva ids y datos esenciales (p.ej. `reservaId`, `establecimientoId`), no objetos gigantes; quien necesite más, consulta.

## 3. Encaje con la arquitectura aprobada

- Los eventos se emiten desde la **capa de servicios** (ver `ARQUITECTURA_OBJETIVO_ERP.md`), nunca desde las rutas ni desde el SQL. La ruta orquesta, el servicio hace y **emite**, el repositorio persiste.
- **Auditoría** y **Dashboard** dejan de estar "cableados" dentro de cada módulo: se convierten en **suscriptores** → menos acoplamiento, una sola fuente de verdad.
- La **IA** (`IA_ROADMAP.md`) usa los eventos como su flujo de contexto en tiempo real para la capa proactiva.

## 4. ⚠️ Regla crítica de convivencia (no romper nada)

Hoy, el flujo de reservas ya hace **efectos secundarios síncronos** (notifica al grupo de WhatsApp, programa follow-up) dentro del handler. Si añadimos un suscriptor a `reserva.creada` que **también** notifique, el cliente/grupo recibiría **mensajes duplicados**.

**Por tanto:**
- Los eventos se adoptan primero para **consumidores NUEVOS** que hoy no existen (analytics, caché del dashboard, contexto de IA). **No** se duplican los efectos ya existentes.
- La migración de un efecto existente (p.ej. la notificación al grupo) de "llamada síncrona" a "suscriptor de evento" se hace **de forma explícita y atómica**: se mueve, no se añade en paralelo, con pruebas de regresión que verifican **una sola** notificación.
- El flujo actual de WhatsApp/Sara/reservas **no se toca** en esta fase; los eventos se introducen **junto** a él sin alterar su comportamiento.

## 5. Modelo técnico (objetivo, aditivo)

- `core/events.js`: un bus simple (`emit(tipo, payload)`, `on(tipo, handler)`), con registro de suscriptores por módulo.
- Suscriptores registrados al arrancar (declarativos por módulo): p.ej. `dashboard` escucha `reserva.*` para invalidar/recomputar KPIs cacheados; `audit` escucha acciones sensibles; `analytics` acumula.
- **Persistencia opcional futura** (`event_log`): si se quiere reproceso/trazabilidad, los eventos pueden registrarse en una tabla (append-only). No imprescindible al inicio; se reserva el diseño.
- **Entrega:** síncrona en proceso al principio (tras el commit). Si un handler es lento (p.ej. llamar a una API externa), se hace **no bloqueante** (cola en memoria / `setImmediate`) para no penalizar la respuesta al usuario.

## 6. Ejemplo de catálogo inicial de eventos

| Evento | Emite | Escuchan (ejemplos) |
|---|---|---|
| `reserva.creada` | módulo reservas | dashboard, analytics, IA (contexto) — **no** notificaciones (ya es síncrono hoy) |
| `reserva.modificada` / `reserva.cancelada` | reservas | dashboard, analytics, IA |
| `incidencia.abierta` / `incidencia.cerrada` | mantenimiento | dashboard, notificaciones, IA |
| `factura.recibida` / `factura.pagada` | facturación | dashboard, analytics, IA |
| `candidatura.recibida` | rrhh | dashboard, notificaciones |
| `usuario.permisos.cambiados` | permisos | auditoría, versionado de config |
| `whatsapp.desconectado` | whatsapp | dashboard (alerta), notificaciones |
| `ia.accion.ejecutada` | IA | auditoría, dashboard |

## 7. Beneficios para el objetivo a años

- **Añadir un módulo o integración** = suscribirse a los eventos relevantes, sin tocar los existentes.
- **Dashboard en tiempo real** y KPIs precalculados (clave para el <5s de `DASHBOARD_V2.md`).
- **IA proactiva** alimentada de contexto sin acoplarla a nadie.
- **Auditoría y analytics** centralizadas y consistentes.

## 8. Qué NO haremos
- Introducir un broker/infra de mensajería externa "porque es lo moderno" (sobreingeniería para esta escala).
- Emitir eventos antes de persistir (riesgo de anunciar algo que no ocurrió).
- Duplicar efectos existentes (doble notificación). Los eventos son para lo nuevo hasta migrar lo viejo explícitamente.
- Acoplar el resultado de la operación principal al éxito de un suscriptor.
