# RISK_REGISTER · Registro de riesgos

Probabilidad × Impacto → Severidad. **E** = tipo de evidencia (H=hecho comprobado, I=inferencia, S=sospecha).

| # | Riesgo | E | Prob. | Impacto | Sev. | Evidencia | Mitigación |
|---|---|:--:|:--:|:--:|:--:|---|---|
| R01 | **Credenciales del TPV cifradas con clave constante `"[object Object]"`** | **H** | Cierta | Alto | 🔴 | `server.js:7132` + verificado ejecutando | P0.1 |
| R02 | **`APP_ENV` no definido → secreto JWT de desarrollo en producción → cualquiera firma token de dirección** | **S** | ? | **Catastrófico** | 🔴 | `security.js:18,42` · `.replit` sin `APP_ENV` | P0.2 — **verificar hoy** |
| R03 | **Subida sin filtro a directorio público → XSS almacenado + robo de JWT** | **H** | Media | Alto | 🔴 | `server.js:257,272,6894,247` | P0.3 |
| R04 | **Sesión de WhatsApp se cae en cada redespliegue** | **H** | Cierta | Alto | 🔴 | `CLAUDE.md` · `whatsapp.js:16` | Canal email de respaldo (P2.9) |
| R05 | **Baileys es no oficial y en RC: WhatsApp puede bloquear la cuenta** | **H** | Baja-Media | **Catastrófico** | 🔴 | `package.json` | Sin mitigación real hoy |
| R06 | **Sin CSP/helmet: nada frena un XSS ni el clickjacking** | **H** | Media | Alto | 🟠 | grep → 0 resultados | P0.4 |
| R07 | **Sin revocación de sesión: despedir a alguien no le cierra el acceso (8 h)** | **H** | Media | Alto | 🟠 | `server.js:3825` | P1.4 |
| R08 | **Un cambio de permisos tarda hasta 8 h en aplicarse** (viaja en el JWT) | **H** | Alta | Medio | 🟠 | idem | P1.4 |
| R09 | **`contabilidad` ve «Fichajes» y recibe 403** | **H** | Cierta | Medio | 🟠 | `permisos.js:35` vs `server.js:10029` | P1.1 |
| R10 | **La allowlist de `mantenimiento` nunca se aplica** (prefijo inexistente) | **H** | Cierta | Medio | 🟠 | `permisos.js` vs `server.js:13928` | Quick win #16 |
| R11 | **Reservas sin control de aforo** | **H** | Alta | Medio-Alto | 🟠 | `server.js:6922` | P2.2 |
| R12 | **`POST /api/reservas` público sin rate limit, dispara 2 WhatsApps** | **H** | Media | Medio-Alto | 🟠 | idem | Quick win #7 |
| R13 | **Sin observabilidad: un fallo nocturno no se detecta** | **H** | Alta | Alto | 🟠 | 258 `console.error`, 0 métricas | P1.5 |
| R14 | **`/api/health` devuelve `ok` con la BD caída** | **H** | Cierta | Medio | 🟠 | `server.js:14549` | Quick win #22 |
| R15 | **Paneles legacy servidos, sin `esc()`, sin mantenimiento** | **H** | Baja | Medio | 🟠 | `express.static` + `direccion.js` | P1.3 |
| R16 | **Scope `auth/drive` completo** | **H** | Baja | Alto | 🟠 | grep de scopes | P2.4 |
| R17 | **Ágora es scraping: un cambio del TPV rompe la analítica sin aviso** | **H** | Media | Medio | 🟠 | `client.js:1-9` | Alerta de desincronización |
| R18 | **Aislamiento por local depende de recordar `WHERE local = ?` en ~190 consultas** | **I** | Media | Alto | 🟠 | `server.js:60` | Test genérico / RLS (`08`) |
| R19 | **`server.js` de 16.722 líneas bloquea la evolución** | **H** | Cierta | Medio | 🟠 | — | P1.7 |
| R20 | **`MATCH_TEL9` fuerza escaneo secuencial** | **H** | Media | Medio | 🟡 | `server.js:14477` | Quick win #19 |
| R21 | **Sin auditoría en reservas, usuarios y permisos** | **H** | Alta | Medio | 🟡 | Solo `fic_auditoria` | P2.3 |
| R22 | **Token de refresco de Google caduca en silencio** | **I** | Media | Medio | 🟡 | — | Alerta (P1.5) |
| R23 | **Dependencia total de Claude para leer facturas** | **H** | Baja | Medio | 🟡 | `ia/errores.js` contempla 401/402/429 | — |
| R24 | **Sin backups verificados** | **S** | ? | **Catastrófico** | 🟡 | No hay script en el repo | **Pregunta abierta #10** |
| R25 | **`leads_backup_*` con PII duplicada sin política de borrado** | **H** | Cierta | Medio | 🟡 | Nombres de tabla | P2.8 |
| R26 | **Teléfonos personales hardcodeados** | **H** | Cierta | Bajo | 🟡 | `server.js:8015,16686` | Mover a `config` |
| R27 | **`multer` 1.x (rama legacy)** | **H** | Baja | Medio | 🟡 | `package.json` | P2.12 |
| R28 | **`pino` declarado y sin usar** | **H** | Cierta | Muy bajo | 🟢 | grep → 0 | Quick win #11 |
| R29 | **`ghostscript` es dependencia del sistema no declarada en código** | **H** | Baja | Medio | 🟡 | `.replit` | Documentar |
| R30 | **Contrato de HTML confiable del dashboard sin documentar** | **H** | Baja | Medio | 🟡 | `dashboard.service.js` ↔ `app.js:940` | P2.5 |
| R31 | **Node 25 en local vs. Node 20 en despliegue** | **H** | Baja | Bajo | 🟢 | — | Alinear |
| R32 | **Sin entorno de pruebas: se despliega directo a producción** | **I** | Alta | Medio | 🟡 | Flujo git→Replit | **Pregunta abierta #26** |
| R33 | **Sara opera con clientes reales sin supervisión** | **H** | Media | Medio | 🟡 | `server.js:~15484` | Registro + revisión |
| R34 | **Sin tests HTTP end-to-end de los 350 endpoints** | **H** | Cierta | Medio | 🟡 | `20_TESTS.md` | Pruebas 14-18 |
| R35 | **Sin `AbortController`: condiciones de carrera al cambiar de vista** | **H** | Media | Bajo | 🟢 | 29 fetch / 0 abort | P2.7 |

## Los 5 que atenderías primero

1. **R02** — verificar `APP_ENV` **hoy**. 5 minutos, y de ello depende si todo lo demás importa.
2. **R01** — la clave de Ágora. Verificado, con plan de migración.
3. **R03** — la subida sin filtro. 10 minutos.
4. **R24** — confirmar que hay backups y que restauran. Es el riesgo con peor consecuencia.
5. **R09** — el bug visible de contabilidad↔fichajes.

## Riesgos que NO existen (comprobado)

- ❌ SQL injection — 0 casos en 350 endpoints
- ❌ Path traversal — bien defendido
- ❌ IDOR en autoservicio — todos usan `req.user.id`
- ❌ CORS permisivo — no hay `cors()`
- ❌ Escalado de privilegios por manipulación de rol — el JWT va firmado
- ❌ Pérdida de fichajes — cola offline + idempotencia + inmutabilidad
