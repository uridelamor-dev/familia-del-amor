# DEPENDENCY_MAP · Dependencias entre módulos

## Grafo (dirección = «importa a»)

```
                        ┌──────────────┐
                        │  server.js   │  ← importa de 60+ sitios
                        │  16.722 L    │     y contiene las 350 rutas
                        └──┬───┬───┬───┘
          ┌────────────────┘   │   └──────────────────┐
          ▼                    ▼                      ▼
    facturas.js          whatsapp.js            security.js
    (Drive/Sheets/Gmail) (Baileys + Sara)       (JWT, uploads, errores)
          │                    │                      │
          │              18 setOnX() ◄────────────────┘
          │              (inyección desde server.js)
          ▼
    src/modules/facturas/*  (18 ficheros)
          │
          ▼
    ╔══════════════════════════════════════════════════════════╗
    ║  src/modules/**  ·  HOJAS  ·  16.131 líneas              ║
    ║  Sin Express · sin DOM · reciben la conexión `x`         ║
    ║  → por eso hay 3.373 tests que corren en 60 s            ║
    ╚══════════════════════════════════════════════════════════╝
          │
          ▼
    ┌─────────────────────────────────────┐
    │ Utilidades compartidas entre dominios│
    │  horarios/tiempo.js  ← fichajes, rrhh│
    │  locales/centros.js  ← ~8 dominios   │
    │  usuarios/locales.js ← scope         │
    │  core/canonico.js    ← firmas        │
    └─────────────────────────────────────┘

    src/core/{access,scope,flags}.js  ── ⚠️ APAGADO (PERMISOS_V2 = false)
    src/db/establecimientos.migration.js ── ⚠️ crea tablas que nadie usa
```

## Frontend

```
public/panel/index.html
  └─ auth.js      (token, LOCALES — ESPEJO de INV_LOCALES)
  └─ datepicker.js
  └─ app.js       (12.351 L — TODO el panel)
        └─ ⚠️ ESPEJOS MANUALES del backend:
             VIEW_ROLES        ← CATALOGO_MODULOS
             MODULOS_POR_LOCAL ← CATALOGO_MODULOS.porLocal
             construirSegmento ← campaigns.service.js
             LOCALES           ← INV_LOCALES

public/index.html → app.js (i18n) + datepicker.js
public/fichar.html → fichar.js (IIFE, CERO dependencias) + fichar-sw.js
public/cupon.html → cupon.js (IIFE, cero dependencias)
public/pulso.html → pulso.js
🧟 public/{direccion,marketing,rrhh,…}.js  — sin enlaces entrantes, servidos igual
```

## Módulos más compartidos (mayor impacto si cambian)

| Módulo | Lo usan | Riesgo de cambio |
|---|---|---|
| `locales/centros.js` | ~8 dominios + `server.js` | 🔴 Alto |
| `horarios/tiempo.js` | fichajes, rrhh, horarios, dashboard | 🔴 Alto |
| `usuarios/permisos.js` | `server.js` + espejo en el front | 🔴 Alto |
| `usuarios/locales.js` | Todo el scope por local | 🔴 Alto |
| `messaging/queue.js` | campañas, promociones, pulso | 🟠 Medio-alto |
| `clientes/metricas.js` | clientes, campañas, dashboard | 🟠 Medio |

## Acoplamientos problemáticos

| # | Acoplamiento | Por qué duele |
|---|---|---|
| 1 | **Todo → `server.js`** | Cualquier cambio de cualquier dominio toca el mismo fichero de 16.722 líneas |
| 2 | **Espejos manuales front↔back** (5 casos) | Ya causaron un incidente real: la campaña salió a más gente de la vista previa |
| 3 | **`whatsapp.js` ↔ `server.js` por 18 callbacks** | Desacopla los ficheros pero hace el flujo de control invisible |
| 4 | **Sara repartida** entre `whatsapp.js` y `server.js` | No es testeable en aislamiento; no tiene módulo propio |
| 5 | **`facturas.js` habla con Google y con la BD** | Segundo monolito; mezcla transporte y lógica |
| 6 | **`JWT_SECRET` firma tres cosas distintas** | JWT + tickets del kiosko + (mal) clave de Ágora. Rotarlo tiene efectos en cascada |

## Lo que está bien del grafo

✅ **`src/modules/**` son hojas.** No importan `server.js`, no se importan entre dominios (salvo
utilidades), y reciben la conexión por parámetro. Es la decisión arquitectónica que sostiene los
3.373 tests, y **es correcta**. La dirección de mejora es **mover más código a esas hojas**, no
reorganizar las que ya existen.
