# 29 · Quick wins — bajo esfuerzo, alto impacto

Ordenados por relación impacto/esfuerzo. Los primeros se hacen en minutos.

## 🔐 Seguridad

| # | Qué | Esfuerzo | Impacto | Dónde |
|---|---|---|---|---|
| 1 | **Verificar si aparece el aviso «Ejecutando en Replit sin APP_ENV»** en los logs de arranque. Si aparece, definir `APP_ENV=production` en Secrets | **5 min** | 🔥🔥🔥 | Consola de Replit |
| 2 | `resolveJwtSecret().secret` en la clave de Ágora ⚠️ requiere plan de migración | 15 min + plan | 🔥🔥🔥 | `server.js:7132` |
| 3 | `limits: { fileSize: 10*1024*1024, files: 10 }` + `fileFilter` en `upload` | 10 min | 🔥🔥🔥 | `server.js:272` |
| 4 | Cabeceras a mano: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` (CSP aparte, con calma) | 20 min | 🔥🔥 | `server.js:~245` |
| 5 | `express.urlencoded({ extended: true, limit: "100kb" })` | 2 min | 🔥 | `server.js:246` |
| 6 | `app.set("trust proxy", 1)` para que el rate limit lea la IP real | 2 min | 🔥🔥 | `server.js:~240` |
| 7 | `pulsoRateLimit(req, res, 5)` en `POST /api/reservas` | 5 min | 🔥🔥 | `server.js:6922` |
| 8 | `pulsoRateLimit` en `POST /api/hr/applications` | 5 min | 🔥 | `server.js:7966` |

## 🧹 Limpieza

| # | Qué | Esfuerzo | Impacto |
|---|---|---|---|
| 9 | Borrar `b.ctid`, `index.html` y `styles.css` de la raíz, `test-wa.js` | **5 min** | 🔥 |
| 10 | Borrar los 7 paneles legacy + `erp-preview/` (~5.900 líneas servidas públicamente) | 20 min | 🔥🔥 |
| 11 | Quitar `pino` de `package.json` **o** usarlo | 5 min / 30 min | 🔥 |
| 12 | Actualizar `.env.example` con las 15 variables reales | 15 min | 🔥🔥 (onboarding) |
| 13 | Corregir o borrar `replit.md` (dice SQLite) | 10 min | 🔥 |
| 14 | Quitar `sqlite` de `.replit` `packages` | 2 min | 🔥 |

## 🐛 Bugs

| # | Qué | Esfuerzo | Impacto |
|---|---|---|---|
| 15 | **Fichajes para contabilidad**: separar roles de lectura y escritura | 30 min | 🔥🔥🔥 (bug visible) |
| 16 | `MODULO_POR_RUTA`: `/api/mantenimiento` → `/api/maintenance` | **2 min** | 🔥🔥 |
| 17 | Test: los prefijos de `MODULO_POR_RUTA` existen como rutas | 20 min | 🔥🔥 |
| 18 | Test: los roles de `CATALOGO_MODULOS` = los de las constantes `*_ROLES` | 40 min | 🔥🔥🔥 |

## ⚡ Rendimiento

| # | Qué | Esfuerzo | Impacto |
|---|---|---|---|
| 19 | Índice funcional para `MATCH_TEL9` en `leads` y `reservas` | **10 min** | 🔥🔥🔥 si la base crece |
| 20 | `Cache-Control` en `express.static` para `app.js`/`styles.css` | 10 min | 🔥🔥 |
| 21 | `max` e `idleTimeoutMillis` explícitos en el `Pool` | 5 min | 🔥 |

## 👀 Observabilidad

| # | Qué | Esfuerzo | Impacto |
|---|---|---|---|
| 22 | **`/api/health` real**: `SELECT 1` + WhatsApp + última sync de Ágora | 20 min | 🔥🔥🔥 |
| 23 | Middleware de tiempo por endpoint (método, ruta, estado, ms) | 10 min | 🔥🔥🔥 (base de toda optimización) |
| 24 | Alerta por WhatsApp si Ágora lleva >24 h sin sincronizar (reutiliza `sendMensajeLibre`) | 30 min | 🔥🔥 |
| 25 | Sustituir los `catch {}` mudos por `safeLogError()` (ya existe) | 1 h | 🔥🔥 |

## 🎨 UX

| # | Qué | Esfuerzo | Impacto |
|---|---|---|---|
| 26 | **Pantalla «Hoy» del encargado**: quién trabaja, quién ha fichado, reservas, incidencias. Todos los datos existen | 3-4 h | 🔥🔥🔥 |
| 27 | **Bandeja de RR.HH.**: contratos y documentos que caducan. `documentosPorCaducar()` ya escrito | 2-3 h | 🔥🔥🔥 |
| 28 | Aviso en el panel si WhatsApp lleva desconectado >1 h (la píldora existe; falta la insistencia) | 30 min | 🔥🔥 |
| 29 | Informe semanal por WhatsApp a dirección con las atenciones del dashboard | 2 h | 🔥🔥 |
| 30 | Agrupar el menú por frecuencia (diario / semanal / configuración) | 1 h | 🔥🔥 |

---

## Si solo hay una tarde

```
1. Verificar APP_ENV en Replit            (5 min)   🔥🔥🔥
2. Índice funcional MATCH_TEL9            (10 min)  🔥🔥🔥
3. Límites en POST /api/upload            (10 min)  🔥🔥🔥
4. /api/health de verdad                  (20 min)  🔥🔥🔥
5. Middleware de tiempo por endpoint      (10 min)  🔥🔥🔥
6. Arreglar /api/mantenimiento            (2 min)   🔥🔥
7. Rate limit en POST /api/reservas       (5 min)   🔥🔥
8. Borrar los paneles legacy              (20 min)  🔥🔥
                                          ──────
                                          ~1h 20m
```
