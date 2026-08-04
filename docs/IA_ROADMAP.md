# Roadmap de IA — de chatbot a asistente operativo

> Sara no se queda en "chatbot de WhatsApp". Evoluciona hasta ser el **asistente operativo del ERP**: un compañero que consulta, actúa y propone dentro de todo el sistema. **Regla absoluta:** toda acción de la IA pasa por la **capa de permisos** y por **auditoría**, exactamente igual que un usuario humano.

## 1. Principio de diseño: la IA es un actor más del sistema

- La IA **no tiene una puerta trasera**. Actúa a través de la **capa de servicios** (misma que usan las rutas y una futura API), y por tanto está sujeta a:
  - **Permisos** (`modulo.accion` + establecimiento) — la IA opera con un **ámbito de permisos explícito**, propio o "en nombre de" un usuario.
  - **Auditoría** (usuario/IA, acción, antes/después) — toda acción de IA queda registrada como tal.
  - **Feature flags** — cada capacidad de IA se activa/desactiva sin desplegar.
- Consecuencia: darle más poder a la IA **no** requiere código nuevo de seguridad; hereda el mismo motor. Esto sólo funciona si mantenemos la arquitectura de servicios (ver `ARQUITECTURA_OBJETIVO_ERP.md`).

## 2. La Sara actual NO se toca (todavía)

La Sara de producción (WhatsApp/Baileys + sus herramientas de reserva) **permanece congelada** en esta fase (constraint del proyecto). El "asistente operativo del ERP" se construye como **capacidad nueva sobre la capa de acciones**, y con el tiempo ambas "caras" de Sara compartirán ese mismo núcleo. Nunca se rediseña ni se rompe el flujo actual de WhatsApp/reservas para avanzar en IA.

## 3. Niveles de autonomía (gradiente seguro)

Cada capacidad se introduce en el nivel más bajo y sube solo con confianza y permiso:

1. **Consultar (solo lectura).** Responder preguntas sobre datos (reservas, incidencias, clientes, facturación…), siempre acotado a permisos/locales del solicitante.
2. **Proponer (borrador).** Prepara la acción y la deja lista; **un humano confirma**. (Es el patrón que ya usa el configurador de Sara: proponer→confirmar→aplicar.)
3. **Actuar con confirmación.** Ejecuta tras un "sí" explícito; ideal para acciones reversibles de bajo riesgo.
4. **Actuar autónomamente (acotado).** Solo para acciones seguras, reversibles y con reglas claras, activadas por flag y con **límites** (rate limits, importes, tipos). Siempre auditado; siempre desactivable.

**Human-in-the-loop obligatorio** para: datos financieros, cambios de permisos/usuarios, comunicaciones masivas, y cualquier acción irreversible o sensible.

## 4. Capacidades por fases

### Fase A — Consultar (lectura)
- "¿Cuántas reservas hay hoy en Lloret?", "¿qué incidencias abiertas hay en Blanes?", "¿qué candidatos esperan?".
- Resúmenes del dashboard en lenguaje natural.
- **Requisito:** capa de servicios de lectura + permisos. Sin riesgo (no modifica nada).

### Fase B — Actuar (reservas y operativa, con confirmación)
- Crear/modificar/cancelar reservas (ya existe vía las tools actuales de Sara — se generaliza al panel).
- Gestionar incidencias de mantenimiento (crear, cambiar estado).
- Responder/gestionar WhatsApp (ya existe; se integra en la capa común).
- Generar borradores de **comunicados** internos (humano publica).

### Fase C — Conocimiento transversal (lectura ampliada)
- Consultar RRHH (respetando `rrhh.verDatosPrivados`), facturación/contabilidad (solo con permiso financiero explícito).
- Generar **informes** bajo demanda ("resumen semanal de Blanes").

### Fase D — Inteligencia proactiva
- **Detectar anomalías** (caídas de reservas, facturas vencidas, picos de incidencias) → tarjetas de recomendación en el dashboard (`DASHBOARD_V2.md`).
- **Proponer mejoras** y **automatizar tareas** repetitivas (con confirmación o autonomía acotada por flag).

## 5. Cómo se conecta técnicamente (sin acoplar)

- Cada módulo expone sus operaciones como **acciones** (nombre, descripción, parámetros validados, permiso requerido) — el *action registry* previsto en `ARQUITECTURA_OBJETIVO_ERP.md`.
- La IA consume ese registro como su catálogo de herramientas (igual que hoy Sara consume sus tools, pero generalizado a todo el ERP).
- Los **eventos** (`EVENT_ARCHITECTURE.md`) alimentan a la IA de contexto en tiempo real (p.ej. "reserva creada", "incidencia abierta") para su capa proactiva, sin acoplarla a los módulos.
- Añadir un módulo nuevo = exponer sus acciones → la IA lo puede operar **sin cambios en la IA**.

## 6. Seguridad, control y confianza

- **Ámbito de permisos de la IA configurable desde Dirección** (qué puede consultar/hacer, en qué locales, en qué modo de autonomía).
- **Registro de todo** en auditoría, distinguiendo acción humana vs IA.
- **Kill switch** por flag: desactivar cualquier capacidad de IA al instante, sin desplegar.
- **Explicabilidad:** cada acción/recomendación de IA dice en qué se basa.
- **Sin almacenar** secretos ni conversaciones completas más allá de lo necesario (coherente con `AUDITORIA_PROFESIONAL.md`).

## 7. Qué NO haremos
- Dar a la IA acceso saltándose permisos o auditoría.
- Autonomía en acciones financieras o irreversibles sin humano.
- Romper o reescribir la Sara de WhatsApp actual para "avanzar en IA".
- Prometer capacidades sobre datos que aún no tenemos (ventas/costes llegan con integraciones).
