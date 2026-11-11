# Fase 1 — Auditoría y plan de evolución del panel interno

> Documento maestro. Estado del sistema **verificado sobre el código real** (no suposiciones) y hoja de ruta para convertir el panel interno en la base de un **ERP propio del grupo Familia del Amor**.
> Alcance: **solo el panel interno** y su backend. No se toca la web pública, ni Ágora/Skello/Haddock (aún). No se reescribe nada; el monolito actual se **congela y se clasifica**.

---

## 1. Resumen ejecutivo

El panel interno funciona y da servicio diario, pero fue creciendo como un **monolito** (`server.js`, ~3560 líneas) con la lógica mezclada en las rutas y **autorización basada solo en el rol**. No existe aislamiento por establecimiento: hoy un `encargado` puede ver datos de todos los locales. La seguridad tiene deuda urgente (secreto JWT con fallback en el repo, sin rate-limit/helmet, un endpoint público de subida sin límites). No hay auditoría de acciones ni versionado de configuración.

La Fase 1 **no construye módulos nuevos**: audita, documenta, protege los flujos críticos (WhatsApp/Sara/reservas) con pruebas de regresión, y **diseña la arquitectura objetivo** (modular, basada en permisos, con feature flags, auditoría profesional y clean architecture) para no rehacerla dentro de un año. La implementación funcional se hará **después del gate**, en pasos pequeños y reversibles.

---

## 2. Arquitectura actual (verificada)

| Capa | Tecnología | Notas |
|---|---|---|
| Backend | Node.js + Express (monolito `server.js`) | ~85 endpoints, todas las rutas en un archivo. Sin capas (lógica en las rutas). |
| Chatbot | `whatsapp.js` (Baileys + Anthropic Claude) | Sin rutas HTTP; se conecta a `server.js` por callbacks (`setOnReserva`, etc.). |
| Facturación | `facturas.js` (Gmail + Drive + Sheets + Claude) | Motor de ingesta; sin rutas propias. |
| Frontend | Vanilla HTML/CSS/JS en `public/` | Una página por rol; Dirección embebe las demás por iframe. Sin framework. |
| BD | SQLite (`database.sqlite`, 28 tablas) | Sin ORM; SQL parametrizado a mano. "local" es texto libre repetido en 13 tablas, sin FK. |
| Auth | JWT (HS256, 8 h) en header `Authorization: Bearer` | Payload: `id, username, rol, nombre, local`. |
| Despliegue | Replit Reserved VM, arranque `node server.js` | Persistencia de BD por Replit-KV; sesión de WhatsApp se pierde en cada redeploy. |

**Ficheros clave:** `server.js`, `whatsapp.js`, `facturas.js`, `seed-workers.js`, `public/*.js|html`, `database.sqlite`, `.replit`, `package.json`.

---

## 3. Hallazgos principales

### 3.1 Autorización (crítico para el objetivo)
- `requireAuth(roles)` (`server.js:1515-1533`) valida el JWT y comprueba **solo `payload.rol`**. El `local` del usuario viaja en el token pero **no se lee en ningún sitio** (0 referencias a `req.user.local`).
- **No hay aislamiento por establecimiento.** Endpoints como `GET /api/reservas` (2072), `GET /api/facturas` (1170), `GET /api/maintenance` (2388), `GET /api/reservas/export.csv` (2102) devuelven datos de **todos** los locales, o filtran por un `?local=` que envía el propio frontend sin validar acceso.
- No existe tabla de **establecimientos** ni de **asignación usuario→locales**.

### 3.2 Cuentas e identidad
- Cuentas **compartidas por rol** (un solo `encargado`, un solo `trabajador` genérico) con contraseña única `tapeta2024` (bcrypt coste 10). Sin trazabilidad por persona.
- Los **43 trabajadores nominales** sí tienen `local` asignado y coherente con los strings de las demás tablas → buena semilla para el backfill.

### 3.3 Seguridad urgente
- `JWT_SECRET` con fallback `"tapeta-secret-dev"` presente en el repo (`server.js:315`) → riesgo de **forja de tokens**.
- **Sin** rate-limit, helmet ni CORS (`server.js:317-319`).
- `POST /api/hr/applications` (2196) es **público** y usa multer **sin límite de tamaño ni filtro de tipo**, guardando en `public/uploads` (servido estáticamente).
- Los endpoints devuelven `e.message` interno al cliente; no hay manejador global de errores ni captura de `uncaughtException/unhandledRejection`.
- **Sin auditoría de acciones.** Refresh tokens de Google guardados/backupeados sin cifrar. PII (conversaciones, candidatos) en logs.

### 3.4 Persistencia
- Backup completo a Replit-KV **falla en silencio cuando la BD supera ~512 KB**. Existen backups paralelos de config/leads/users, pero otras tablas (reservas, facturas, whatsapp_messages…) pueden perderse en un redeploy. Sesión de WhatsApp no se respalda → re-linkado por QR tras cada redeploy.

*(Detalle exhaustivo por módulo en `INVENTARIO_PANEL_INTERNO.md`; flujos en `FLUJO_RESERVAS.md` y `FLUJO_WHATSAPP.md`; riesgos y rollback en `RIESGOS_Y_ROLLBACK.md`.)*

---

## 4. Objetivo de arquitectura (fundación ERP)

Principios que guían todo lo nuevo (detalle en `ARQUITECTURA_OBJETIVO_ERP.md`):

1. **Autorización por permisos, no por rol.** Usuario → Locales → Permisos → Rol (solo plantilla inicial). Nada de `if (rol === …)`.
2. **Sistema por módulos** con acciones `modulo.accion` (ver/crear/editar/eliminar/exportar/administrar).
3. **Feature flags** para activar módulos/integraciones sin desplegar.
4. **Auditoría profesional** (usuario, fecha, IP, navegador, acción, antes/después).
5. **Versionado de configuración** restaurable.
6. **Todo configurable desde Dirección** (de-hardcode progresivo).
7. **Dashboard ejecutivo** real.
8. **AI-ready**: la capa de servicios es la superficie de acciones reutilizable por una IA.
9. **Clean architecture** para lo nuevo: Feature → API → Servicio → Repositorio → BD.
10. **API-first** para no limitar el rediseño visual futuro.

---

## 5. Hoja de ruta (orden estricto)

| Paso | Entrega | Estado |
|---|---|---|
| 1 | Auditoría (estos documentos) | **Esta fase** |
| 2 | Documentar flujos WhatsApp y reservas (Mermaid) | **Esta fase** |
| 3 | Pruebas de regresión (baseline + spec de permisos) | **Esta fase** |
| — | **GATE: revisión y autorización** | **Parada obligatoria** |
| 4 | **Seguridad de bajo riesgo + durabilidad de la sesión de WhatsApp** (JWT fuerte, rate-limit, helmet, CORS, uploads/errores; persistir `baileys_auth` fuera del FS efímero) | Post-gate |
| 5 | Núcleo `src/core` + módulo piloto en capas (sin cambiar comportamiento) | Post-gate |
| 6 | Modelo de datos (empresas, establecimientos, user_locations, permisos, flags, audit_log, config_versions) + reconciliación `local` → `establecimiento_id` (FK) | Post-gate |
| 7 | Autorización **rol + establecimiento** (granularidad solo ante casos reales); **default-deny** + grandfather acotado | Post-gate |
| 8 | Pantalla Dirección → Administración (todo configurable) | Post-gate |
| 9 | Menú y filtros por permisos + flags | Post-gate |
| 10 | Dashboard ejecutivo v1 (datos reales) | Post-gate |
| 11 | Auditoría activada + base de versionado + documentar integraciones futuras | Post-gate |

> **Arquitectura de eventos:** solo diseño; **no se construye en Fase 1** (se introducirá cuando exista un segundo consumidor real). Ver `EVENT_ARCHITECTURE.md`.

**No se avanza** si: no compila, fallan las pruebas baseline, WhatsApp se desconecta, las reservas dejan de funcionar, no hay rollback, o hay migración destructiva.

---

## 6. Criterios de aceptación de la Fase 1 (parte ejecutable)

- [ ] Los documentos de `docs/` reflejan el **código real** y son coherentes entre sí.
- [ ] Existen pruebas de regresión; las **baseline de reservas y WhatsApp pasan** en verde.
- [ ] La bandera `TAPETA_TEST_MODE` está **aislada** y no afecta a producción.
- [ ] No se ha modificado ningún endpoint, tabla ni la web pública.
- [ ] Todo en una **rama separada**; sin cambios en producción hasta aprobar.
- [ ] El diseño posterior (pasos 4-11) queda documentado y **gated**.

## 7. Modo de trabajo (durante el desarrollo)
Reglas obligatorias a partir de la construcción:
- **Una sola fase por iteración**; cambios pequeños; **commits pequeños**.
- **Pruebas antes y después** de cada cambio; **revisión antes de continuar**.
- **Ningún cambio fuera del alcance** de la iteración; **ningún refactor innecesario**.
- **Ninguna migración destructiva**; todo **aditivo y reversible**.
- **Ningún cambio que afecte a WhatsApp, Sara o Reservas sin pruebas específicas.**
- Avance **incremental, seguro y reversible**.

## 8. Estado de la planificación
**Fase 1 CONGELADA** tras incorporar: los 5 ajustes (grandfather acotado + default-deny, reconciliación estricta de `local` y prioridad a FK, decisión explícita del modelo de clientes, reordenar seguridad + durabilidad de WhatsApp antes del piloto, eventos solo como diseño con autorización rol+local) y los principios de **infraestructura desacoplada**, **single source of truth** y **modularidad real** (`ARQUITECTURA_OBJETIVO_ERP.md` §7-9). No se amplía más documentación salvo problema realmente importante. La siguiente fase es **construir** por iteraciones pequeñas.
