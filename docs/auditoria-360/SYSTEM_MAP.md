# SYSTEM_MAP · Mapa del sistema en una página

```
                        ┌──────────── CLIENTES / PÚBLICO ────────────┐
                        │  familiadelamor.org                        │
   index.html ──────────┤  nosotros · eventos · trabaja · locales    │
   app.js (i18n es/ca/en)  cupon.html?t=…   pulso.html?t=…           │
                        └────────────────────┬───────────────────────┘
                                             │
   ┌──── EQUIPO ────┐    ┌──── BARRA ────┐   │
   │ panel/index    │    │ fichar.html   │   │
   │ panel/app.js   │    │  ?t=<token>   │   │
   │  24 vistas     │    │ + service     │   │
   │  JWT 8 h       │    │   worker      │   │
   └───────┬────────┘    └───────┬───────┘   │
           │ Bearer              │ token+PIN │
           ▼                     ▼           ▼
 ╔═══════════════════════════════════════════════════════════════════╗
 ║  server.js · Express 4 · 350 rutas · 16.722 líneas · PROCESO ÚNICO ║
 ║                                                                   ║
 ║  guardia de esquema → json/urlencoded → static(public) → multer×3 ║
 ║  requireAuth([roles]) → moduloDeRuta() → localScope()             ║
 ║  ⛔ sin helmet · sin CSP · sin CORS · sin rate global              ║
 ╚══╤═════════════════╤═══════════════════════╤══════════════════════╝
    │                 │                       │
    ▼                 ▼                       ▼
 src/modules/    facturas.js (1.465)     whatsapp.js (1.260)
 18 dominios     ├─ Gmail  (5 min)       ├─ Baileys (RC, NO oficial)
 16.131 líneas   ├─ Drive  (5 min)       ├─ sesión en ficheros
 PUROS           └─ Sheets (10 min)      ├─ 18 callbacks → server.js
 testeables                              └─ SARA (Claude Sonnet 5)
    │                 │                       │
    │            integrations/agora/          │
    │            ping→auth→bus (5 min)        │
    │            ⚠️ scraping, no API          │
    ▼                 ▼                       ▼
 ╔═══════════════════════════════════════════════════════════════════╗
 ║  PostgreSQL · 91 tablas · 78 índices · 23 FKs · pg.Pool           ║
 ║  DDL aditivo en cada arranque · SQL crudo · sin ORM               ║
 ╚═══════════════════════════════════════════════════════════════════╝

 EXTERNOS:  Google (Business·Drive·Gmail·Sheets·Places) · Anthropic Claude
            WhatsApp (Baileys) · Ágora TPV
```

## 14 temporizadores en proceso (no hay cron)

```
 5 min  Ágora sync · caché de ventas · Gmail · Drive
10 min  reintento de Sheets
30 min  reseñas de Google · repaso de líneas · métricas de cliente
 6 h    extracción de hechos de cliente (IA)
 —      campañas programadas · campañas a medias · cumpleaños · seguimiento de reservas
```

## Los 5 puntos únicos de fallo

| # | Punto | Si cae |
|---|---|---|
| 1 | **El proceso** (`node server.js`) | Todo |
| 2 | **La sesión de WhatsApp** | Reservas sin confirmar, sin marketing, sin Sara, sin alertas |
| 3 | **`JWT_SECRET`** | Firma los JWT **y** los tickets del kiosko **y** (mal) la clave de Ágora |
| 4 | **PostgreSQL** | Todo (y `/api/health` seguiría diciendo `ok`) |
| 5 | **`server.js`** | Un error de sintaxis impide arrancar el sistema entero |

## Dónde mirar cada cosa

| Pregunta | Fichero |
|---|---|
| ¿Dónde está el endpoint X? | `server.js` (todo) |
| ¿Quién puede ver el módulo X? | `src/modules/usuarios/permisos.js` + espejo en `public/panel/app.js:121` |
| ¿Cómo se define la tabla X? | `server.js:295-1650` o `src/modules/*/schema.js` |
| ¿Cómo se pinta la vista X? | `public/panel/app.js` → `renderX()`/`loadX()` |
| ¿Por qué está así? | **El comentario de encima.** Casi siempre está |
| ¿Qué invariante protege esto? | `tests/*.test.js` de introspección |
