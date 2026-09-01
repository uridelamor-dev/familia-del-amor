# 02 · Arquitectura real

> Esto describe cómo **ES**, no cómo debería ser.

## Mapa de capas

```
┌─ NAVEGADORES ────────────────────────────────────────────────────────────┐
│  Web pública        Panel interno       Kiosko tablet     Móvil cliente  │
│  index.html         panel/index.html    fichar.html       cupon.html     │
│  app.js (i18n)      app.js (12k)        fichar.js         pulso.html     │
└────────┬─────────────────┬──────────────────┬──────────────────┬─────────┘
         │ fetch           │ fetch + Bearer   │ fetch + token URL│
         ▼                 ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  EXPRESS 4  ·  server.js  (16.722 líneas, 350 rutas)                     │
│                                                                          │
│  MIDDLEWARES (en orden real, server.js:237-300)                          │
│   1. app.use("/api", guardia de esquema)   → 503 si initDB no terminó    │
│   2. express.json() / urlencoded()          ⚠️ SIN límite de tamaño      │
│   3. express.static("public")               ⚠️ sirve TODO public/        │
│   4. multer (3 configuraciones distintas)                                │
│   ── NO HAY: helmet · CORS · CSP · rate-limit global · sesiones ──       │
│                                                                          │
│  POR RUTA: requireAuth([roles])  →  localScope(req)                      │
└───────┬──────────────────────────────────────────────────┬───────────────┘
        │                                                  │
        ▼ lógica pura (inyectando la conexión)             ▼ integraciones
┌───────────────────────────────┐            ┌─────────────────────────────┐
│ src/modules/<dominio>/*.js    │            │ whatsapp.js  (Baileys)      │
│ 18 dominios · 16.131 líneas   │            │ facturas.js  (Drive/Sheets) │
│ SIN Express · SIN DOM         │            │ integrations/agora/ (TPV)   │
│ reciben `x = {get,all,run}`   │            │ @anthropic-ai/sdk (Claude)  │
└───────────────┬───────────────┘            └──────────────┬──────────────┘
                ▼                                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL  ·  pg.Pool  ·  91 tablas  ·  78 índices                     │
│  Helpers: dbGet / dbAll / dbRun  (server.js:156-168)                     │
│  Placeholders `?` → `$1,$2…` vía toPositional()                          │
│  SIN ORM · SIN repositorios · SQL crudo en línea                         │
└──────────────────────────────────────────────────────────────────────────┘
```

## Entrypoint y arranque (`server.js`)

**Orden real** (HECHO, líneas aproximadas):

1. **1-135** — 60+ imports. `server.js` importa de 18 módulos, 3 integraciones y 4 ficheros raíz.
2. **138-168** — `new pg.Pool` + `toPositional()` + `dbGet`/`dbAll`/`dbRun`.
3. **181** — `hoyISO()` = hora de Madrid (no UTC; hay test que lo blinda).
4. **197-200** — `PROD = isProduction()`, `replitEnvWarning()`, `resolveJwtSecret()`.
   ⚠️ **Punto crítico de seguridad** — ver `07_SEGURIDAD.md` §2.
5. **237** — guardia de esquema sobre `/api`.
6. **245-300** — parsers, estáticos, multer.
7. **295-1650** — `initDB()`: ~60 tablas + `ensureSchema*` de horarios, fichajes y promociones.
8. **~1900-1970** — arranque de temporizadores (reviews, Ágora, caché de ventas).
9. **~2000-16700** — las 350 rutas, agrupadas por dominio.
10. **16100-16700** — más temporizadores (Gmail, Drive, campañas, cumpleaños) e `initWhatsApp()`.

**INFERENCIA**: el arranque es secuencial y `initDB()` es no-fatal por bloques (cada `ensureSchema`
va en su propio `try`). Es una decisión deliberada y buena: un fallo en promociones no impide
fichar.

## Procesos, estado y concurrencia

| Elemento | Realidad |
|---|---|
| Procesos | **Uno solo**. `node server.js`. Sin workers, sin cluster |
| Colas | **Ninguna infraestructura**. La «cola» de WhatsApp es un `setInterval` + tabla `pending_whatsapp` |
| Cron | **Ninguno**. 14 `setInterval` en proceso |
| Sesiones | **Ninguna**. JWT sin estado, 8 h, en `localStorage` del navegador |
| Caché | En memoria (`_pulsoHits`, caché de ventas Ágora) + tabla `agora_cache` |
| WebSockets | **Ninguno propio**. El único WS es el de Baileys hacia WhatsApp |
| Estado global | Módulo-scope en `server.js` y en `whatsapp.js` (socket, `reconnectAttempts`) |

⚠️ **RIESGO ESTRUCTURAL**: al ser un proceso único con estado en memoria y una sesión WhatsApp viva,
**el sistema no se puede escalar horizontalmente ni reiniciar sin coste**. Cada redespliegue tira la
sesión de WhatsApp (documentado en `CLAUDE.md`) y vacía las cachés.

## Los 14 temporizadores (HECHO)

| Línea | Cada | Qué hace |
|---|---|---|
| 1941 | 30 min | Sincroniza reseñas de Google |
| 1950 | 5 min | Sincroniza ventas de Ágora |
| 1969 | 5 min | Calienta la caché de «ventas en vivo» |
| 14692 | 6 h | Extrae hechos de clientes de conversaciones (IA) |
| 16117/16154/16222 | — | Campañas programadas, campañas a medias, cumpleaños |
| 16611 | 5 min | Poll de Gmail (facturas por correo) |
| 16614 | 5 min | Poll de Drive (facturas en carpeta) |
| 16627 | 10 min | Reintento de escritura en Sheets |
| 16635 | 30 min | Repaso de líneas de factura |
| 16637 | 30 min | Recálculo de métricas de cliente |
| 16698 | — | Seguimiento de reservas («¿qué tal fue?») |

**HECHO** (`server.js:1915`): hay un comentario que documenta que `setInterval(..., 24h)` **no se
dispara casi nunca en Replit** porque el proceso se recicla. Por eso todos los intervalos son
cortos y las tareas comprueban «¿me toca?» contra la base. Es un patrón correcto dado el entorno.

## Dependencias entre módulos y acoplamientos peligrosos

### Lo bueno
`src/modules/**` es **hoja**: no importa de `server.js` ni entre dominios (salvo utilidades
compartidas como `horarios/tiempo.js`). Reciben la conexión por parámetro. Eso los hace testeables
sin levantar nada, y es la razón de que haya 3.373 tests.

### Los acoplamientos peligrosos (INFERENCIA con evidencia)

1. 🔴 **`server.js` es el centro de todo.** Importa 60+ símbolos y contiene las 350 rutas. Cualquier
   cambio en cualquier dominio lo toca. Es el cuello de botella de toda evolución.

2. 🔴 **Espejo manual frontend↔backend.** `CATALOGO_MODULOS` (`src/modules/usuarios/permisos.js:13`)
   está duplicado a mano en `VIEW_ROLES` (`public/panel/app.js:121`) y en `NAV`. Hay un test que
   obliga a que coincidan, **pero solo comprueba presencia, no los roles** — y ahí ya hay una
   divergencia real (ver `06_AUTH_PERMISOS.md` §Inconsistencias).

3. 🟡 **`whatsapp.js` ↔ `server.js` por inyección de callbacks.** `whatsapp.js` exporta 18
   `setOnX()` que `server.js` rellena al arrancar. Desacopla los módulos pero crea un grafo de
   control invisible: para seguir qué pasa cuando llega un mensaje hay que saltar entre ficheros.

4. 🟡 **La lógica de Sara vive repartida** entre `whatsapp.js` (recepción, historial) y `server.js`
   (prompt, tool-use, ~15.400-15.900). No hay un `src/modules/sara/`.

5. 🟡 **`facturas.js` habla directamente con Google** (Drive, Sheets, Gmail) y con la base. Es el
   segundo monolito.

## Flujo de una petición típica del panel

```
Usuario pulsa «Reservas»
 → public/panel/app.js  go("reservas") → VIEWS.reservas = loadReservas()
 → apiRaw("/api/reservas?...")  con  Authorization: Bearer <jwt>
 → app.use("/api")            ¿initDB terminó? si no → 503
 → requireAuth(["direccion","encargado"])
      · jwt.verify
      · ¿rol permitido?
      · moduloDeRuta("/api/reservas") = "reservas" → ¿está en payload.modulos?
 → localScope(req)  → el local del usuario (nunca uno ajeno)
 → SQL crudo con dbAll(...)  filtrando por local
 → { ok: true, data: [...] }
 → renderReservas() genera HTML como string → innerHTML
```
