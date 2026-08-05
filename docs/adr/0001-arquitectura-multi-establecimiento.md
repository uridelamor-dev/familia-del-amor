# ADR 0001 — Arquitectura multi-establecimiento e integraciones

- **Estado:** aceptado (guía de evolución; NO se ejecuta el refactor completo antes de producción)
- **Fecha:** 2026-08-05
- **Contexto de decisión:** revisión de calidad previa a producción. Objetivo del negocio: que cada
  establecimiento sea prácticamente independiente y que el sistema escale a decenas de locales,
  ~1.000 trabajadores, muchas integraciones y millones de registros, sin `if`/`switch` por local.

## Contexto

El ERP es un monolito Node/Express + PostgreSQL. Conviven **dos mundos**:

1. **Legacy en producción** (`server.js`, `whatsapp.js`, `facturas.js`): el local se identifica por
   **texto libre** en una columna `local` repartida por ~15 tablas, sin FK ni (hasta ahora) índices.
2. **Modelo nuevo, ya diseñado pero NO cableado** (`src/core/`, `src/db/`): tablas `empresas`,
   `establecimientos(id, local_text UNIQUE, empresa_id)`, `user_locations`, acceso por establecimiento,
   todo detrás del flag `PERMISOS_V2` (hoy **desactivado** a propósito).

### Problemas reales detectados (hoy)

- **5 fuentes de verdad de "qué locales existen"** y ya divergentes: `LOCALES` y `SYSTEM_PROMPT`
  (`whatsapp.js`), `SARA_LOCALES` y `WEB_LOCALES` (`server.js`), `CATALOGO_CANONICO`
  (`src/db/reconciliation.js`). `WEB_LOCALES` tiene 8 entradas (incluye "Viva la Pepa") que no existen
  en las demás listas.
- **Alta de un local nuevo = editar código en ~6 puntos de 3 ficheros + redeploy.** No es
  configurable por panel.
- **Integraciones mono-credencial global**: una sola sesión de WhatsApp/Baileys (en memoria del
  proceso) para todos los locales, una sola cuenta Google, una sola clave Anthropic.
- **Sin índices** en tablas legacy → full-scans que a millones de filas degradan de forma no lineal.
- **Estado de conversación en memoria** (Maps) ⇒ no escala horizontalmente y es punto único de fallo.
- **Prompt de Sara crece con el nº de locales** (se envía en cada mensaje).

## Decisión

**Antes de producción NO se toca la capa de integraciones ni el modelo de identificación de local.**
Rehacer Baileys/estado en memoria, el `SYSTEM_PROMPT`, o meter `establecimiento_id`/RLS en tablas
vivas es un cambio de alto riesgo que puede tumbar reservas, WhatsApp/Sara y facturas —justo los
sistemas en uso diario. Se registra aquí la **arquitectura objetivo** y una **migración por fases**
no disruptiva, y solo se ejecutan las fases seguras.

### Arquitectura objetivo (destino, no inmediato)

- **Registro único de establecimientos** (`establecimientos`/`empresas`, ya creado) como **única
  fuente de verdad**. Las 5 listas hardcodeadas se derivan de él en runtime.
- **Config por proveedor y por establecimiento**, conceptualmente:
  ```
  integrations/
    whatsapp/<establecimiento>/  → sesión/número, group_jid_reservas, group_jid_facturas
    google/<establecimiento>/    → place_id, drive_folder_id, sheet_id, empresa_fiscal, cif
    anthropic/                   → credencial global + prompt PARAMETRIZADO por establecimiento
  ```
  El ~60 % ya vive en datos (`wa_links`, `facturas_grupos`, `facturas_locales`): el trabajo es
  colgarlas de `establecimiento_id` (FK) en vez de `local` (texto) y exponer alta por panel.
- **Sara parametrizada**: el prompt recibe solo el/los local(es) relevantes, no los 50.
- **Sesión WhatsApp desacoplada del proceso** (estado en Redis/BD, worker Baileys separado, cola).
- **Cola de jobs** idempotente para facturas/reseñas/follow-ups (fuera del hilo de request).
- **`establecimiento_id` + índices + RLS** en todas las tablas operativas.

### Migración por fases

- **Fase 0 — segura, alto valor (parcialmente hecha en esta entrega):**
  índices en tablas legacy (`server.js initDB`, aditivo/idempotente); acotar la concurrencia de
  consultas del dashboard (`mapLimit`, hecho); pendiente: paginación en endpoints sin techo
  (sobre todo `whatsapp_messages`).
- **Fase 1 — fuente de verdad (bajo riesgo):** poblar `establecimientos` como catálogo y derivar de él
  las listas de solo lectura (`WEB_LOCALES`, `SARA_LOCALES`) antes que `LOCALES`/prompt.
- **Fase 2 — `establecimiento_id` aditivo (riesgo medio):** columna nullable + backfill desde
  `local_text` con la reconciliación existente como red de seguridad; doble escritura hasta validar.
- **Fase 3 — colgar la config de integraciones del id** y alta de local por panel (sin código).
- **Fase 4 — post-producción (mayor riesgo, planificar aparte):** estado WhatsApp fuera de memoria,
  worker Baileys, cola de jobs, RLS/tenant y enforcement real de `PERMISOS_V2`.

## Consecuencias

- **Positivo:** el modelo objetivo ya está diseñado; no hay que inventarlo, hay que cablearlo por
  fases. La Fase 0 mejora rendimiento sin cambiar comportamiento.
- **Coste asumido:** hasta la Fase 1-3, dar de alta un local sigue requiriendo tocar código. Es una
  deuda **conocida y contenida**, aceptable para arrancar producción con 7 locales.
- **Riesgo evitado:** no se desestabilizan integraciones en uso diario la víspera del go-live.

## Qué NO hacer antes de producción (explícito)

- No activar `PERMISOS_V2=true`.
- No refactorizar la sesión Baileys ni el estado en memoria.
- No cambiar el `SYSTEM_PROMPT` de Sara.
- No añadir `establecimiento_id`/RLS a tablas vivas ni correr el backfill.
