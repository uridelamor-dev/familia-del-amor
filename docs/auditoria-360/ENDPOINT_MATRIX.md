# ENDPOINT_MATRIX · Endpoints por dominio y riesgo

**350 rutas**, todas en `server.js`.

## Por dominio

| Dominio | Nº | Guardia predominante | Módulo mapeado | Riesgo |
|---|---:|---|:--:|:--:|
| `/api/facturas` | **83** | direccion+contabilidad | ❌ | 🟡 |
| `/api/horarios` | 35 | `HORARIOS_ROLES` | ✅ | 🟢 |
| `/api/rrhh` | 34 | `RRHH_ROLES` | ✅ | 🟢 |
| `/api/fichajes` | 22 | `FICHAJES_ROLES` | ✅ | ⚠️ contabilidad |
| `/api/inventario` + `/api/inv/` | 20 | `INV_ROLES` | ✅ | 🟢 |
| `/api/mi-*`, `/api/mis-*` | 17 | `requireAuth()` | n/a | 🟢 filtra por `req.user.id` |
| `/api/agora` | 12 | direccion+contabilidad | ✅ | 🟢 |
| `/api/contactos` + `/api/clientes` | 13 | direccion+marketing | ✅ | 🟢 |
| `/api/promos` | 9 | `PROMOS_ROLES` | ✅ | 🟢 |
| `/api/campanas` + config | 10 | direccion+marketing | ✅ (config ❌) | 🟢 |
| `/api/whatsapp` | 8 | direccion+encargado | ❌ | 🟡 |
| `/api/users` | 8 | direccion | ❌ | 🟡 |
| `/api/reviews` | 8 | varios (**1 público**) | ✅ | 🟢 |
| `/api/hr` | 8 | `contratacion` (**2 públicos**) | ✅ | 🟡 uploads |
| `/api/reservas` | 6 | direccion+encargado (**2 públicos**) | ✅ | 🟠 |
| `/api/sara` | 5 | direccion+marketing | ✅ | 🟢 |
| `/api/fichar` | 5 | **PÚBLICO** + token+PIN+ticket | n/a | 🟢 |
| `/api/pulso` | 4 | **3 públicos** + token | ✅ (parcial) | 🟢 |
| `/api/hechos` | 4 | direccion+marketing | ❌ | 🟡 PII |
| `/api/maintenance` | 3 | encargado+direccion | ❌ **bug** | 🟠 |
| `/api/leads` | 3 | **1 público** | ❌ | 🟡 |
| `/api/marketing` | 3 | direccion+marketing | ❌ | 🟢 |
| `/api/upload` + `/api/uploads` | 2 | 4 roles | ❌ | 🔴 |
| resto | ~10 | varios | — | 🟢 |

## Los 24 públicos (detalle en `04_ENDPOINTS.md`)

| Riesgo | Rutas |
|---|---|
| 🟢 | `/api/health`, `/api/content`, `/api/reviews`, `/api/hr/jobs`, `/`, `/api/pulso/*` (×3), `/api/fichar/*` (×5), `/api/cupon/:token` |
| 🟡 | `/api/auth/login`, `/api/leads`, `/api/reservas/:id/perfil`, `/auth/google*` (×4) |
| 🟠 | **`POST /api/reservas`** (sin rate limit, dispara WhatsApp), **`POST /api/hr/applications`** (sin rate limit, sube ficheros) |

## Los 10 endpoints de mayor riesgo

| # | Endpoint | Riesgo | Motivo |
|---|---|:--:|---|
| 1 | `POST /api/upload` | 🔴 | Sin `limits` ni `fileFilter`, a directorio público → XSS almacenado |
| 2 | `POST /api/reservas` | 🟠 | Público, sin rate limit, dispara 2 WhatsApps |
| 3 | `POST /api/hr/applications` | 🟠 | Público, sube ficheros, sin rate limit |
| 4 | `GET/POST/PUT /api/maintenance` | 🟠 | La allowlist de módulo **no se aplica** (bug del prefijo) |
| 5 | `POST /api/reservas/:id/perfil` | 🟡 | Público con `id` enumerable |
| 6 | `DELETE /api/facturas/:id` | 🟡 | Borra datos contables sin auditoría |
| 7 | `POST /api/facturas/empezar-cero` | 🟡 | Limpia **todo** el estado de facturas |
| 8 | `DELETE /api/users/:id` | 🟡 | Mitigado con `historicoLaboralDe` ✅ |
| 9 | `POST /api/contactos/mensaje-masivo` | 🟡 | Envío masivo. Bien protegido, pero irreversible |
| 10 | `POST /api/fichajes/reabrir` | 🟡 | Reabre nómina cerrada. Solo dirección + deja rastro ✅ |

## Cobertura de tests por endpoint

**0 tests hacen una petición HTTP real.** Todo lo que se verifica del servidor se verifica leyendo
`server.js` como texto. Ver `20_TESTS.md`.
