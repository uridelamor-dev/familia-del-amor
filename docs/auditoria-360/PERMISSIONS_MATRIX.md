# PERMISSIONS_MATRIX · Matriz real de permisos

Leyenda: ✅ acceso · ➖ sin acceso · ⚠️ **inconsistencia confirmada** · 🔓 solo lo suyo

## Usuarios × módulos (según `CATALOGO_MODULOS` + `NAV`)

| Módulo | direccion | encargado | contabilidad | rrhh | marketing | porLocal |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✅ | ✅ | ✅ | ➖ | ➖ | sí |
| Reservas | ✅ | ✅ | ➖ | ➖ | ➖ | sí |
| Comunicados | ✅ | ✅ | ➖ | ➖ | ➖ | no |
| Equipo (RR.HH.) | ✅ | ✅ | ➖ | ✅ | ➖ | sí |
| ↳ Contratación | ✅ | ➖ | ➖ | ✅ | ➖ | sí |
| ↳ Pulso del equipo | ✅ | ➖ | ➖ | ✅ | ➖ | sí |
| ↳ Preguntas del mes | ✅ | ➖ | ➖ | ✅ | ➖ | no |
| Horarios | ✅ | ✅ | ➖ | ✅ | ➖ | sí |
| **Fichajes** | ✅ | ✅ | ⚠️ **ve el menú, la API le da 403** | ✅ | ➖ | sí |
| Subir factura | ➖ | ✅ | ➖ | ➖ | ➖ | sí |
| Compras | ✅ | ➖ | ✅ | ➖ | ➖ | sí |
| Productos | ✅ | ➖ | ✅ | ➖ | ➖ | sí |
| Analítica de ventas | ✅ | ➖ | ✅ | ➖ | ➖ | sí |
| Inventarios | ✅ | ✅ | ➖ | ➖ | ➖ | sí |
| Incidencias | ✅ | ✅ | ➖ | ➖ | ➖ | sí |
| Clientes | ✅ | ➖ | ➖ | ➖ | ✅ | no |
| Campañas | ✅ | ➖ | ➖ | ➖ | ✅ | no |
| Promociones | ✅ | ➖ | ➖ | ➖ | ✅ | no |
| Reseñas | ✅ | ✅ | ✅ | ➖ | ✅ | sí |
| Web | ✅ | ➖ | ➖ | ➖ | ✅ | no |
| Sara (IA) | ✅ | ➖ | ➖ | ➖ | ✅ | no |
| WhatsApp | ✅ | ✅ | ➖ | ➖ | ➖ | no |
| Ágora (TPV) | ✅ | ➖ | ➖ | ➖ | ➖ | no |
| Usuarios | ✅ | ➖ | ➖ | ➖ | ➖ | sí |

## Constantes de rol en `server.js` (lo que la API aplica de verdad)

| Constante | Línea | Roles |
|---|---|---|
| `RRHH_ROLES` | 8112 | rrhh, direccion, encargado |
| `HORARIOS_ROLES` | 8396 | direccion, rrhh, encargado |
| `CONFIG_ROLES` | 9503 | direccion, rrhh, encargado *(encargado solo lectura)* |
| **`FICHAJES_ROLES`** | **10029** | **direccion, rrhh, encargado** ⚠️ sin contabilidad |
| `VALIDAR_ROLES` | 10041 | direccion, rrhh — **el encargado NO valida horas** |
| `LIQ_ROLES` | 11888 | direccion, rrhh |
| `PULSO_ROLES` | 12648 | direccion, rrhh |
| `INV_ROLES` | 13967 | direccion, encargado |
| `PROMOS_ROLES` | 10590 | direccion, marketing |

## Capacidades sensibles

| Capacidad | Quién | Dónde |
|---|---|---|
| Validar horas de jornada | direccion, rrhh | `VALIDAR_ROLES` |
| Liquidar bolsa de horas | direccion, rrhh | `LIQ_ROLES` |
| Cerrar periodo de nómina | direccion, rrhh | `/api/fichajes/cerrar` |
| **Reabrir periodo cerrado** | **solo direccion** | `/api/fichajes/reabrir` |
| Ver documentos `sensible` de RR.HH. | ❌ **el encargado NO** | `esEncargado(req) && doc.sensible → 403` |
| Borrar usuario | solo direccion | + `historicoLaboralDe` avisa de 10 tablas con datos |
| Emitir/revocar tablets y PINes | `FICHAJES_ROLES` | |
| Enviar campaña masiva | direccion, marketing | + `excluir_baja` forzado |
| Configurar Ágora | **solo direccion** | |
| Subir ficheros | marketing, rrhh, direccion, encargado | ⚠️ sin filtro — `07_SEGURIDAD.md` §3 |
| Ver `/api/debug/estado` | solo direccion | |

## Ámbito por local

| Rol | Alcance |
|---|---|
| `direccion` | **Todos.** Salta la comprobación de módulo |
| `encargado` | 🔓 Su(s) local(es). `?local=` ajeno → devuelve el suyo, en silencio |
| `contabilidad` | Según `locales` del token |
| `rrhh` | Todos los locales para Equipo (`server.js:8098`) |
| `marketing` | Módulos globales, sin ámbito por local |

## Dónde se comprueba cada cosa

| Comprobación | Dónde | Fiabilidad |
|---|---|---|
| ¿Autenticado? | `requireAuth` → `jwt.verify` | 🟢 Depende de `JWT_SECRET` (§7.2) |
| ¿Rol permitido? | `requireAuth(roles)` | 🟢 |
| ¿Módulo en la allowlist? | `moduloDeRuta(req.path)` | 🟡 **Solo 21 prefijos de ~45** |
| ¿Local permitido? | `localScope`/`localPermitido` | 🟡 A mano en cada consulta |
| ¿Botón visible? | `puedeVer(view)` en el front | 🔴 **Solo cosmético** |

## ⚠️ Los tres casos donde esconder el botón es la única protección

1. **`/api/facturas`** (83 endpoints) — sin mapeo de módulo. Un contable con «Compras» quitado
   sigue pudiendo llamar a la API.
2. **`/api/maintenance`** — el mapeo apunta a `/api/mantenimiento`, que **no existe**.
3. **`/api/users`, `/api/whatsapp`, `/api/hechos`, `/api/upload`** — sin mapeo.

En los tres casos el **rol** sí se comprueba; lo que no se aplica es la **allowlist por usuario**.
