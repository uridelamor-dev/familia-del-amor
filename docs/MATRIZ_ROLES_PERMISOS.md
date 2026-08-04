# Matriz de roles y permisos (estado actual)

> Punto de partida: **hoy la autorización es solo por rol** (`requireAuth([roles])`, `server.js:1515-1533`), sin comprobación de local. Este documento fija el mapa actual; el modelo objetivo (permisos por módulo) está en `MODELO_MODULOS_Y_PERMISOS.md`.

## Roles existentes
`direccion`, `encargado`, `marketing`, `rrhh`, `contabilidad`, `trabajador`.

`requireAuth([])` sin lista = cualquier usuario autenticado. `direccion` aparece en casi todas las rutas (superusuario de facto).

## Mapa rol → acceso (backend, hoy)

| Rol | Puede tocar (API) | NO comprobado |
|---|---|---|
| **direccion** | Todo: usuarios, reservas, whatsapp/sara, facturas, rrhh, marketing, mantenimiento, comunicados, kpi, google, config | — |
| **encargado** | Reservas (ver/borrar), whatsapp (status/qr/groups/link), mantenimiento, comunicados | **local** (ve todos) |
| **marketing** | Contenido web, leads (ver/export), reseñas/google, campañas, config de Sara, upload | **local** |
| **rrhh** | Vacantes, candidaturas, trabajadores, notas, preguntas/llamadas, upload | **local** |
| **contabilidad** | Facturas (ver/pago/stats/303), kpi, export reservas | **local / empresa** |
| **trabajador** | Comunicados (lectura) | — (apenas endpoints propios) |

## Superficie pública (sin login)
`POST /api/auth/login`, `POST /api/leads`, `POST /api/reservas`, `GET /api/hr/jobs`, `POST /api/hr/applications` (⚠️ subida), `GET /api/content`, `GET /api/reviews`, `GET /api/google/status`, `GET /api/health`, callbacks OAuth `/auth/google*`, `GET /` (redirección a login).

## Fugas horizontales confirmadas (a cerrar en pasos 6-7)
- `GET /api/reservas` (2072): filtra por `?local=` del cliente; sin él, **todas** las reservas.
- `GET /api/reservas/export.csv` (2102): **sin filtro**.
- `GET /api/facturas` (1170): `?local=` opcional; sin él, últimas 100 de cualquier local.
- `GET /api/maintenance` (2388): **sin filtro**.
- `GET /api/announcements` (2421): `?local=`/`?rol=` opcionales.
- `GET /api/rrhh/trabajadores` (2285): todos los locales.
- **Escrituras** que aceptan `local` del body sin validar pertenencia: `POST /api/maintenance` (2395), `POST /api/announcements` (2434), `POST/PUT /api/hr/jobs` (2168/2184), `POST /api/whatsapp/link` (2460), `POST /api/facturas/grupos`.

## Objetivo (resumen)
Sustituir la comprobación por rol por **permisos efectivos por módulo/acción acotados a los locales asignados**, verificados **siempre en backend**, ignorando cualquier `local` no autorizado que llegue del frontend. Ver `MODELO_MODULOS_Y_PERMISOS.md` y `MODELO_ACCESO_POR_LOCAL.md`.
