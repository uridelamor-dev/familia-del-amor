# Dashboard ejecutivo de Dirección

> Objetivo: que Dirección abra el panel y **entienda el estado completo de la empresa en segundos**. No es solo "KPIs": es un panel ejecutivo con indicadores, estados de sistema y alertas accionables. Primera versión **solo con datos existentes y fiables** (nada de ventas/costes/márgenes hasta que lleguen las integraciones).

## 1. Bloques del panel (v1, datos reales)

### Operativa de hoy
- Reservas de **hoy** y **personas previstas**.
- Reservas de la **semana** y del **mes**.
- **Ocupación** (derivada de reservas/personas; sin datos de mesas reales aún → estimación clara, no inventada).
- Reservas **pendientes** (>8 personas sin confirmar).

### Clientes y captación
- **Clientes/leads nuevos** (hoy/semana/mes).
- Conversaciones pendientes de WhatsApp (si puede determinarse de forma fiable).

### Estado de sistemas (semáforos)
- **WhatsApp / Sara** conectado o caído.
- **Gmail** (ingesta de facturas).
- **Google Drive** / **Google Business (Reviews)**.
- Errores recientes de integración.

### RRHH y operativa
- **Candidaturas nuevas**.
- **Incidencias de mantenimiento abiertas**.
- **Facturas pendientes** de asignar (si el módulo funciona).
- **Documentos pendientes**.

### Reseñas
- Últimas **Google Reviews** y valoración media (de `google_reviews`).

## 2. "Necesita tu atención" (centro de alertas)
Bandeja única con lo accionable:
- WhatsApp desconectado.
- Reservas pendientes de confirmar.
- Facturas sin asignar.
- Incidencias abiertas.
- Candidaturas nuevas.
- Errores de integración (Gmail/Drive/Google/IA).

## 3. Filtros
- **Establecimiento** (respetando permisos: cada usuario ve solo sus locales; Dirección, todos).
- **Rango de fechas**.

## 4. Fuentes de datos (fiables, ya existentes)
`reservas`, `leads`/`wa_clientes`, `whatsapp_messages` + estado de conexión, `google_reviews`, `hr_applications`, `maintenance_issues`, `facturas_pendientes`, estados OAuth (Gmail/Drive/Business). Reutiliza y amplía `GET /api/kpi` (`server.js:2118`).

## 5. Lo que NO se muestra todavía (llega con integraciones)
Ventas, previsiones económicas, costes laborales, márgenes, inventario, horarios, escandallos. **No mostrar datos falsos.** Estos indicadores llegarán vía Ágora/Skello/Haddock en fases futuras.

## 6. Notas de arquitectura
- El dashboard consume un endpoint agregador (`kpis` module, en capas) que respeta permisos y locales.
- Diseñado API-first: los mismos datos alimentarán el rediseño visual futuro (`VISION_DISENO_Y_FRONTEND.md`).
