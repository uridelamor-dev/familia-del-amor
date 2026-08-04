# Dashboard V2 — el centro del ERP

> La pantalla más importante del sistema. No es un muro de gráficas: es un **centro de mando ejecutivo e inteligente** que responde, en menos de 5 segundos, "¿cómo va la empresa y qué necesita mi atención?".
> Extiende y **supersede** a `DASHBOARD_EJECUTIVO.md` (que queda como el milestone v1: mismo espíritu, solo con datos reales existentes). V2 es la estrella polar hacia la que evoluciona.

## 1. Principio rector

**Responder preguntas, no mostrar métricas.** Cada elemento del dashboard existe para contestar una pregunta concreta que Dirección (o un encargado) se hace de verdad. Si un dato no ayuda a decidir o actuar, no está.

Preguntas que el dashboard debe responder de un vistazo:
- ¿Cómo va **hoy** la empresa?
- ¿Qué necesita **mi atención**?
- ¿Qué **problemas** hay?
- ¿Qué **reservas** tengo?
- ¿Qué **incidencias** están abiertas?
- ¿Qué **candidatos** esperan?
- ¿Qué **locales** requieren actuación?
- ¿Qué **tareas** tengo pendientes?
- ¿Qué está haciendo **Sara**?
- ¿Qué **recomienda la IA**?

## 2. Regla de oro: priorización visual

No todo pesa igual. El dashboard **ordena por urgencia/impacto**, no por módulo:
1. **Rojo (actuar ya):** WhatsApp caído, reserva grande sin confirmar, incidencia crítica, error de integración.
2. **Ámbar (revisar hoy):** facturas sin asignar, candidatos nuevos, reservas pendientes, tareas del día.
3. **Verde (todo bien):** estados sanos, resumidos y silenciosos.

Lo urgente **sube y destaca**; lo sano se **colapsa**. El usuario nunca tiene que "buscar" un problema.

## 3. Anatomía (bloques, no pantallas)

### A. "Necesita tu atención" (lo primero, siempre arriba)
Bandeja unificada y priorizada de lo accionable, con **acción directa** en cada ítem (resolver sin salir del dashboard):
- WhatsApp/Sara desconectado → "Reconectar".
- Reservas pendientes de confirmar → "Ver/confirmar".
- Facturas sin asignar → "Asignar".
- Incidencias abiertas (por gravedad) → "Ver".
- Candidaturas nuevas → "Revisar".
- Errores de integración (Gmail/Drive/Google/IA) → "Diagnóstico".
- Tareas pendientes del usuario.

### B. Pulso de hoy (operativa)
Tarjetas compactas, número grande + tendencia:
- Reservas de hoy y **personas previstas**; próximas horas punta.
- Reservas de la semana/mes.
- Ocupación estimada (clara como estimación, sin inventar).
- Clientes/leads nuevos (hoy/semana).

### C. Estado de sistemas (semáforos)
WhatsApp/Sara · Gmail · Drive · Google Business · IA. Verde/ámbar/rojo + último check. Un problema aquí escala a la bandeja A.

### D. Por establecimiento
Vista compacta que responde "¿qué local requiere actuación?": por cada local, un semáforo con lo pendiente (reservas, incidencias, facturas). Respeta permisos (cada usuario ve sus locales; Dirección, todos).

### E. Actividad de Sara
"¿Qué está haciendo Sara?": conversaciones activas/pendientes, reservas gestionadas hoy por Sara, acciones que esperan validación humana, y alertas (p.ej. clientes esperando respuesta). Transparencia total sobre el asistente.

### F. Recomendaciones de la IA (madura por fases)
Tarjetas de **insight accionable** generadas por la IA: anomalías detectadas ("caída de reservas en Girona este finde"), sugerencias ("3 facturas llevan 40 días sin pagar"), oportunidades. Cada recomendación explica **por qué** y ofrece la **acción**. — Ver §6 sobre madurez y datos reales.

## 4. Filtros (respetan permisos)
- **Establecimiento** (uno, varios o todos según permisos).
- **Rango de fechas**.
Cambiar un filtro re-contextualiza todo el dashboard al instante (datos cacheados).

## 5. Interacción y velocidad
- **Objetivo <5s** (idealmente <2s): los agregados se sirven **precalculados/cacheados** (al inicio, con una caché simple de KPIs actualizada por llamadas directas; cuando exista la arquitectura de eventos —hoy solo diseño— se actualizarán por eventos, ver `EVENT_ARCHITECTURE.md`), no se recalculan en cada carga.
- **Skeleton** inmediato; cada tarjeta carga de forma independiente (una lenta no bloquea al resto).
- Todo ítem accionable resuelve **en contexto** (panel lateral/modal), sin perder el dashboard.
- Personalizable por rol (qué tarjetas ve cada quién), configurable desde Dirección.

## 6. Honestidad de datos (crítico, coherente con la visión)
- **Nunca datos falsos.** En v1, solo lo que existe y es fiable (reservas, leads, incidencias, candidaturas, facturas pendientes, estados de integración, reseñas).
- **Ventas, costes, márgenes, inventario, horarios, escandallos NO se muestran** hasta que lleguen por integraciones (Ágora/Skello/Haddock). Su hueco se diseña, pero no se rellena con humo.
- Las **recomendaciones de IA** se activan por **feature flag** y solo cuando hay datos suficientes para que sean fiables; una recomendación siempre es **explicable** (por qué la propone) y **verificable**. Empiezan como sugerencias informativas, no acciones automáticas.

## 7. Evolución (v1 → v2 → v3)
- **v1:** bandeja "Necesita tu atención" + pulso de hoy + semáforos + por-establecimiento, con datos reales. (Es el `DASHBOARD_EJECUTIVO.md`.)
- **v2:** actividad de Sara, priorización inteligente, primeras recomendaciones de IA (anomalías simples sobre datos propios).
- **v3:** insights avanzados con datos de integraciones (ventas/costes), predicciones, y acciones sugeridas que Sara puede ejecutar con confirmación.

## 8. Anti-patrones (lo que este dashboard NO será)
- Un muro de 12 gráficas que nadie mira.
- KPIs sin acción asociada.
- Números sin contexto ni tendencia.
- Datos inventados para "rellenar".
- Una pantalla que tarda 15s en cargar.
