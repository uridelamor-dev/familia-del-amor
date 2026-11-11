# Inventario del panel interno

> Inventario por módulo, verificado en código. Cada módulo se **clasifica** para poder deprecar con criterio (nunca borrar sin aprobación):
> **CA** = crítico y activo · **A** = activo · **P** = parcialmente funcional · **SU** = sin uso actual · **D** = desconocido · **CD** = candidato a deprecación.

## Leyenda de riesgo de modificación
🔴 alto (producción crítica) · 🟠 medio · 🟢 bajo.

---

## Páginas del panel (frontend)

| Página | JS | Roles con acceso | Clasif. |
|---|---|---|---|
| `login.html` | `login.js`, `auth.js` | público → redirige por rol | CA |
| `direccion.html` | `direccion.js` (981) | direccion | CA |
| `encargados.html` | `encargados.js` (372) | encargado, direccion | CA |
| `marketing.html` | `marketing.js` (979) | marketing, direccion | A |
| `rrhh.html` | `rrhh.js` (675) | rrhh, direccion | P |
| `contabilidad.html` | `contabilidad.js` (32) | contabilidad, direccion | P |
| `trabajadores.html` | `trabajadores.js` (27) | trabajador, encargado, direccion | A |
| `mantenimiento.html` | `mantenimiento.js` (97) | encargado, direccion | A |

`auth.js` aporta `requireRole()` (solo frontend), `authFetch`, `escapeHtml`, `toast`, lista de LOCALES y helpers. **El control de acceso real debe estar en backend** (hoy solo por rol).

---

## Módulos

### Login / Sesión — CA · 🔴
- **Endpoints:** `POST /api/auth/login` (1536), `GET /api/auth/me` (1558).
- **Tablas:** `users`.
- **Permisos hoy:** público (login) / autenticado (me).
- **Estado:** funcional. JWT 8 h Bearer, bcrypt 10.
- **Deuda:** `JWT_SECRET` con fallback inseguro; sin rate-limit; contraseña compartida `tapeta2024`; cuentas por rol (no por persona).

### Usuarios — CA · 🟠
- **Endpoints:** `GET/POST /api/users` (1563/1570), `PUT /api/users/:id/password` (1590), `DELETE /api/users/:id` (1601).
- **Tablas:** `users` (+ backup durable `latapeta_users_v1`).
- **Permisos hoy:** `direccion`.
- **Estado:** funcional. Única entrada de alta de cuentas.
- **Deuda:** sin locales asignables (columna `local` libre, no se usa para autorizar); sin permisos granulares.

### Reservas — CA · 🔴
- **Endpoints:** `POST /api/reservas` (2003, también web pública), `GET /api/reservas` (2072), `DELETE /api/reservas/:id` (2086), `GET /api/reservas/export.csv` (2102). Creación/modificación/cancelación también vía Sara (callbacks).
- **Tablas:** `reservas` (incluye `zona`), `bloqueos_reservas`, `followup_scheduled`, `wa_links` (grupo por local).
- **Acceso por local:** ❌ ninguno. `GET` filtra por `?local=` opcional del cliente; export sin filtro.
- **Estado:** crítico, en producción. No tocar sin pruebas.

### WhatsApp / Conexión — CA · 🔴
- **Endpoints:** `/api/whatsapp/status` (2451), `/groups` (2455), `/link` (2460), `/qr` (2483), `/links` (2490), `/test` (2499), `/send` (2582), `/mensajes` (2607), `/api/health` (2497).
- **Tablas:** `wa_links`, `wa_clientes`, `whatsapp_messages`, `pending_whatsapp`.
- **Permisos hoy:** mezcla direccion/encargado/marketing.
- **Estado:** crítico. Baileys multi-file auth; sesión se pierde en redeploy.

### Sara (chatbot IA) — CA · 🔴
- **Endpoints:** `/api/sara/estado` (2741), `/api/sara/chat` (2747), `/api/sara/aplicar` (2819), `DELETE /api/sara/bloqueo/:id` (2890), `DELETE /api/sara/regla/:id` (2895).
- **Tablas:** `sara_respuestas`, `bloqueos_reservas`, `contents`, `config` (`sara_instrucciones`).
- **Herramientas del bot:** registrar/cancelar/modificar reserva, enviar documento, notificar Nerea/Silvia, guardar dato de cliente.
- **Permisos hoy:** marketing, direccion.
- **Estado:** crítico. Configurador conversacional (proponer→confirmar→aplicar).

### Clientes / Leads — A · 🟠
- **Endpoints:** `POST /api/leads` (1614, público web), `GET /api/leads` (1750), `GET /api/leads/export.csv` (1783), `GET /api/contactos` (2512).
- **Tablas:** `leads`, `wa_clientes`.
- **Permisos hoy:** direccion, marketing.
- **Estado:** funcional. Sin concepto de local. CRM con export CSV.

### Campañas WhatsApp — A · 🟠
- **Endpoints:** `/api/campanas/preview` (2522), `/api/campanas/enviar` (2531), `GET /api/campanas` (2575).
- **Tablas:** `campanas_wa`.
- **Permisos hoy:** direccion, marketing.
- **Estado:** funcional; segmentación por género/cumpleaños/población/local reservado.

### RRHH — Vacantes y candidaturas — P · 🟠
- **Endpoints:** `/api/hr/jobs` (2154 pública, 2161 admin, 2168 POST, 2184 PUT), `/api/hr/applications` (2196 **pública con subida**, 2255 GET, 2274 PUT).
- **Tablas:** `hr_jobs`, `hr_applications`.
- **Permisos hoy:** rrhh, direccion (admin).
- **Deuda:** subida pública sin límites/MIME (riesgo). Verificar uso real.

### RRHH — Trabajadores / seguimiento — P · 🟠
- **Endpoints:** `/api/rrhh/trabajadores` (2285), `/trabajador/:id/notas` (2298), `/nota` (2309), `DELETE /nota/:id` (2322), `/preguntas/:mes` (2329/2340), `/llamadas/:mes` (2356), `/llamada` (2367).
- **Tablas:** `hr_worker_notes`, `hr_preguntas_mes`, `hr_llamadas_mes`, `users` (trabajadores).
- **Estado:** funcional parcial. Sin filtrado por local del solicitante.

### Facturación / Facturas IA — P/A · 🟠
- **Endpoints:** ~21 rutas `/api/facturas/*` (1136-1406) + OAuth `/auth/google-facturas` (1095/1112).
- **Tablas:** `facturas`, `facturas_grupos`, `facturas_locales`, `facturas_email_reglas`, `facturas_emails_procesados`, `facturas_pendientes`.
- **Permisos hoy:** direccion (gestión), contabilidad (lectura/pago).
- **Estado:** motor funcional (ingesta Gmail/WhatsApp, Drive, Sheets, Modelo 303). Verificar estado real en producción.

### Contabilidad — P · 🟢
- **Endpoints:** reutiliza facturas + `GET /api/reservas/export.csv`, `GET /api/kpi` (2118).
- **Estado:** panel minimalista (export). Depende de Facturación.

### Mantenimiento — A · 🟢
- **Endpoints:** `/api/maintenance` (2388 GET, 2395 POST, 2411 PUT).
- **Tablas:** `maintenance_issues`.
- **Permisos hoy:** encargado, direccion. Sin filtrado por local.
- **Estado:** funcional, bajo riesgo → **buen candidato a módulo piloto** de la nueva arquitectura.

### Comunicados — A · 🟢
- **Endpoints:** `GET /api/announcements` (2421), `POST /api/announcements` (2434).
- **Tablas:** `announcements`.
- **Permisos hoy:** autenticado (lectura), encargado/direccion (publicar). Filtra por `?local=`/`?rol=` opcionales.
- **Estado:** funcional, bajo riesgo → alternativa como módulo piloto.

### Marketing / Edición web — A · 🟠
- **Endpoints:** `GET /api/content` (1801 público), `PUT /api/content` (1810), `/content/registry` (1895), `/content/batch` (1899), `POST /api/upload` (1973), `/uploads/optimize-existing` (1984).
- **Tablas:** `contents`.
- **Permisos hoy:** marketing, direccion.
- **Nota:** edita **contenido de la web pública**. Se conserva; no rediseñar la web en esta fase.

### Google Business / Reseñas — P · 🟢
- **Endpoints:** `/auth/google` (1406), `/api/google/status` (1452), `/api/reviews` (1467), `/api/reviews/refresh` (1481), `/api/places/config` (1502/1507).
- **Tablas:** `google_reviews`, `config` (tokens/places).
- **Estado:** lectura de reseñas funcional (Business o Places); **responder reseñas NO implementado**. Dependiente de cuota Google.

### Gmail (ingesta facturas) — A (background) · 🟠
- **Proceso:** `pollGmail` cada 5 min (3461). Sin endpoints propios de gestión salvo status.
- **Estado:** funcional; parte del módulo Facturación.

### Drive (archivo facturas) — A (background) · 🟠
- Estructura Empresa→Local→Mes; parte de Facturación.

### KPIs / Dashboard — P · 🟢
- **Endpoints:** `GET /api/kpi` (2118).
- **Estado:** KPIs básicos. Base para el **Dashboard ejecutivo** futuro.

### Config general — A · 🟠
- **Tabla:** `config` (clave/valor: tokens OAuth, `sara_instrucciones`, `places_ids`, `leads_sheet_id`, etc.).
- **Estado:** sin CRUD genérico; se toca desde cada módulo. Candidata a "parámetros del sistema" administrables.

### Follow-ups — CA (background) · 🔴
- **Proceso:** scheduler cada 5 min (3125) sobre `followup_scheduled`; parte del flujo de reservas.

---

## Tablas de la BD (28) por dominio

- **Identidad/acceso:** `users`, `config`.
- **Reservas/WhatsApp/Sara:** `reservas`, `bloqueos_reservas`, `followup_scheduled`, `wa_links`, `wa_clientes`, `whatsapp_messages`, `pending_whatsapp`, `sara_respuestas`, `campanas_wa`, `contents`.
- **Clientes:** `leads`.
- **RRHH:** `hr_jobs`, `hr_applications`, `hr_worker_notes`, `hr_preguntas_mes`, `hr_llamadas_mes`.
- **Operativa local:** `maintenance_issues`, `announcements`.
- **Facturación:** `facturas`, `facturas_grupos`, `facturas_locales`, `facturas_email_reglas`, `facturas_emails_procesados`, `facturas_pendientes`.
- **Google:** `google_reviews`.

**Tablas con columna `local` (texto libre, sin FK):** users, reservas, bloqueos_reservas, wa_links, facturas, facturas_grupos, facturas_email_reglas, facturas_pendientes, facturas_locales, hr_jobs, maintenance_issues, announcements. → Objetivo: normalizar a `establecimiento_id` sin romper el texto (ver `MODELO_ACCESO_POR_LOCAL.md`).

**Sin tabla de auditoría.** → Se añadirá `audit_log` (ver `AUDITORIA_PROFESIONAL.md`).
