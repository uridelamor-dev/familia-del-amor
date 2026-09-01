# 03 · Inventario de funcionalidades

## A · Web pública (`public/`)

| Página | Fichero | Qué hace | APIs |
|---|---|---|---|
| Portada | `index.html` + `app.js` (1.454 L) | Presentación, locales, reseñas, **formulario de reserva**, **popup de descuento** | `GET /api/content`, `GET /api/reviews`, `POST /api/reservas`, `POST /api/leads` |
| Nosotros | `nosotros.html` | Historia y valores. Contenido editable desde el panel | `GET /api/content` |
| Eventos | `eventos.html` | Tipos de evento, «Viva la Pepa» | `GET /api/content` |
| Trabaja con nosotros | `trabaja.html` | Vacantes + envío de CV | `GET /api/hr/jobs`, `POST /api/hr/applications` |
| Locales | `locales.html` + `local.html`/`local.js` | Listado y ficha de cada establecimiento | `GET /api/content` |
| Cupón | `cupon.html` + `cupon.js` | QR del cliente a pantalla completa (sin sesión) | `GET /api/cupon/:token` |
| Pulso | `pulso.html` + `pulso.js` | Encuesta **anónima** mensual del equipo | `GET/POST /api/pulso/:token` |
| Kiosko | `fichar.html` + `fichar.js` + `fichar-sw.js` | Fichaje en tablet + validación de cupones | `/api/fichar/:token/*` |

**i18n**: `public/app.js:70` — objeto `i18n` con tres bloques (`es` L71, `ca` L~208, `en` L~345).
Se valida su paridad en `tests/landing-i18n-paridad.test.js`.

**Dependencia de JS**: total. Sin JavaScript no hay reservas, ni formularios, ni traducción.
**INFERENCIA**: no hay SSR ni fallback; el SEO depende de lo que haya en el HTML estático.

## B · Panel interno (`public/panel/`)

SPA de **un solo fichero JS** (12.351 líneas). Router por hash (`#vista`). 16 vistas en el menú:

| Vista | Roles (NAV) | Qué permite |
|---|---|---|
| **Dashboard** | dirección, encargado, contabilidad | KPIs + «atenciones» narradas (ver §Dashboard) |
| **Reservas** | dirección, encargado | Agenda, alta/edición/cancelación, bloqueos, histórico |
| **Comunicados** | dirección, encargado | Avisos al equipo (`announcements`) |
| **Equipo** (RR.HH.) | dirección, rrhh, encargado | Fichas, contratos, documentos, altas/bajas, timeline |
| ↳ Contratación | dirección, rrhh | Vacantes y candidaturas |
| ↳ Pulso del equipo | dirección, rrhh | Resultados agregados de la encuesta anónima |
| ↳ Preguntas del mes | dirección, rrhh | Qué se pregunta cada mes |
| **Horarios** | dirección, rrhh, encargado | Cuadrantes, necesidades, plantillas, generador, PDF |
| **Fichajes** | dirección, rrhh, encargado, **contabilidad** ⚠️ | Jornadas, revisión, correcciones, bolsa de horas, cierres, tablets, PINes |
| **Subir factura** | solo encargado | Alta rápida de factura de proveedor |
| **Compras** | dirección, contabilidad | Facturas, proveedores, IVA, pagos, Drive/Gmail |
| **Productos** | dirección, contabilidad | Qué se compra y a qué precio |
| **Analítica de ventas** | dirección, contabilidad | Informes de Ágora |
| **Clientes** | dirección, marketing | Base unificada, fichas, hechos, duplicados, métricas |
| **Campañas** | dirección, marketing | Segmentación (30 filtros), plantillas, programación, IA, `{cupon}` |
| **Promociones** | dirección, marketing | Promos, emisión de QR/carnés, canjes |
| **Reseñas** | dirección, encargado, contabilidad, marketing | Google Reviews + respuestas |
| **Web** | dirección, marketing | Editor de la web pública (i18n + bloques) |
| **Sara (IA)** | dirección, marketing | Configuración y pruebas del asistente |
| **WhatsApp** | dirección, encargado | Estado, QR de vinculación, grupos |
| **Ágora (TPV)** | solo dirección | Configuración de la conexión al TPV |
| **Usuarios** | solo dirección | Altas, roles, allowlist de módulos, locales |
| **Inventarios** | dirección, encargado | Sesiones de recuento, pedidos |
| **Incidencias** | dirección, encargado | Mantenimiento |

⚠️ **BUG CONFIRMADO**: «Fichajes» aparece en el menú para `contabilidad`
(`permisos.js:35`, `NAV`, `VIEW_ROLES`) pero **todos** los endpoints `/api/fichajes/*` usan
`FICHAJES_ROLES = ["direccion","rrhh","encargado"]` (`server.js:10029`), que **excluye
contabilidad**. Resultado: contabilidad ve la entrada, entra y recibe 403. Ver `06_AUTH_PERMISOS.md`.

### El Dashboard es peculiar (y bueno)

`src/modules/dashboard/dashboard.service.js` no devuelve solo números: genera **«atenciones»**
narradas con `{ sev, tipo, titulo, narrativa, decision, impacto, go }`. Cada una explica el problema,
**qué haría el sistema en tu lugar** y por qué importa en dinero. Ejemplos reales (L283-328):
Sara desconectada, incidencia repetida 3 veces, factura sin pagar hace 75 días, gasto disparado,
reseña baja, trabajador acumulando incidencias.

**INFERENCIA**: es lo más cercano a «producto» que hay en el repositorio, y la pieza más
diferenciadora frente a un ERP genérico.

## C · Kiosko de fichaje

Ver `19_FICHAJES_KIOSKO.md`. Resumen: tablet fija, token de dispositivo en la URL, PIN por
trabajador, ticket HMAC de 2 minutos, cola offline en IndexedDB, service worker, y desde
2026-09 validación de cupones con `BarcodeDetector`.

## D · Áreas funcionales por volumen de API

| Área | Endpoints | Documento |
|---|---:|---|
| Facturas / compras | **83** | `14_FACTURACION.md` |
| Horarios | 35 | — |
| RR.HH. | 34 | — |
| Fichajes | 22 | `19_FICHAJES_KIOSKO.md` |
| Inventario | 20 | `13_INVENTARIOS.md` |
| Ágora | 12 | `12_AGORA.md` |
| Promociones | 9 | — |
| Clientes/contactos | 13 | — |
| WhatsApp | 8 | `15_WHATSAPP.md` |
| Usuarios | 8 | `06_AUTH_PERMISOS.md` |
| Reseñas | 8 | `17_GOOGLE.md` |
| Contratación | 8 | — |
| Campañas | 8 | — |
| Reservas | 6 | `18_RESERVAS.md` |
| Sara | 5 | `16_SARA_IA.md` |
| «Mi …» (autoservicio) | 17 | — |

**HECHO**: facturas concentra el 24 % de los endpoints. Es el dominio más desarrollado del sistema,
por encima de reservas (6 endpoints) que es el más visible para el cliente.

## E · Autoservicio del trabajador (17 endpoints `requireAuth()` sin roles)

`/api/mi-password`, `/api/mi-pin`, `/api/mi-perfil`, `/api/mi-cuadrante`, `/api/mi-registro(+csv)`,
`/api/mi-horario/cambios`, `/api/mis-ausencias`, `/api/mi-disponibilidad`, `/api/pulso/mi-enlace`,
`/api/announcements`, `/api/auth/me`.

✅ **HECHO COMPROBADO**: todos filtran por `req.user.id`, no por parámetro. Sin IDOR.

## F · Funcionalidades a medio hacer (HECHO)

| Qué | Evidencia |
|---|---|
| **Canal email de campañas** | `server.js:14558` rechaza explícitamente `canal !== "whatsapp"`. El botón del panel está `disabled`. El esquema ya tiene `asunto`, `opt_in_email`, `campana_envios.correo` |
| **Permisos V2 multi-establecimiento** | `src/core/access.js` + `scope.js` completos y testeados, **detrás del flag `PERMISOS_V2` que está desactivado** (`src/core/flags.js`) |
| **`leads.premio`** | Hasta 2026-09 era texto decorativo. Ya reemplazado por cupones reales |
| **`erp-preview/`** | Prototipo de rediseño completo, sin enlazar |
| **`pino`** | Dependencia declarada y **nunca importada** |
