# 01 · Mapa del repositorio

## Identidad (HECHO COMPROBADO)

| Dato | Valor |
|---|---|
| Ruta | `/Users/urieldelamorayllon/Desktop/latapeta` |
| Nombre (package.json) | `familia-del-amor` v0.1.0, `private: true`, `"type": "module"` |
| Rama | `main` |
| HEAD | `90ded2998c98209fbb347e5043ec153afc6ba14a` |
| Remoto | `https://github.com/uridelamor-dev/familia-del-amor.git` |
| Node (local) | v25.5.0 · npm 11.16.0 |
| Node (Replit) | `nodejs-20` (`.replit`, `modules`) |
| Tamaño en disco | 382 MB (incluye `node_modules` y `attached_assets`) |

### Últimos commits

```
90ded29 El cupón dice dónde vale, no cómo se consiguió
f20531a Published your App          ← commit automático de Replit
3b74c0e Promociones con QR: emitir desde Marketing y validar en el kiosko
09387f6 Marketing: arreglar lo que mentía y saber quién viene…
c5535bd Published your App          ← Replit
```

**HECHO**: Replit commitea al mismo `main` con el mensaje `Published your App`. Por eso `CLAUDE.md`
exige `pull --rebase` antes de cada push. Durante esta sesión ocurrió: un push tuvo que rebasar
sobre `f20531a`.

## Scripts y comandos

```json
"scripts": { "dev": "node server.js", "test": "node --test \"tests/**/*.test.js\"" }
```

**No hay `build`, ni bundler, ni linter, ni formatter, ni `db:push`.** El frontend es JavaScript
vanilla servido tal cual.

Herramientas fuera de npm:
- `tools/barrido-rutas.mjs` — abre las 19 vistas del panel a 1280 px y 390 px y detecta errores de
  JS, pantallas en blanco y desbordes. **Requiere puppeteer, que NO es dependencia** → se salta.
- `tools/inventario-bloques.mjs` — inventario visual de tarjetas. Misma dependencia.
- `.claude/skills/tapeta-api/api.sh` — login + llamadas a la API para pruebas manuales.

## Despliegue (HECHO)

`.replit`:
```toml
modules = ["nodejs-20", "web", "postgresql-16"]
[deployment] deploymentTarget = "vm"; run = ["node", "server.js"]
[[ports]] localPort = 5000 → externalPort = 80
```

**INFERENCIA**: es un despliegue VM de Replit (proceso persistente, no serverless). Eso es
*necesario* porque el sistema depende de `setInterval` en proceso y de una sesión WhatsApp viva.

## Inventario por lenguaje (ficheros rastreados por git)

| Lenguaje | Ficheros | Líneas |
|---|---:|---:|
| JavaScript | 304 | 83.899 |
| HTML | 21 | 2.962 |
| CSS | 4 | 4.105 |
| Markdown | 9 | 502 |
| JSON | 3 | 3.111 |
| SQL | 1 | 230 |
| Imágenes (jpg/png/svg/webp) | 53 | — |

## Los 30 ficheros más grandes

| # | Fichero | Líneas | Nota |
|---:|---|---:|---|
| 1 | `server.js` | **16.722** | Monolito: rutas, esquema, cron, IA, integraciones |
| 2 | `public/panel/app.js` | **12.351** | SPA vanilla del panel entero |
| 3 | `public/styles.css` | 3.710 | Estilos de web pública + panel |
| 4 | `package-lock.json` | 3.075 | |
| 5 | `facturas.js` | 1.465 | Pipeline de facturas + Drive/Sheets |
| 6 | `public/app.js` | 1.454 | Web pública (i18n es/ca/en + formularios) |
| 7 | `public/panel/index.html` | 1.299 | Shell del panel |
| 8 | `whatsapp.js` | 1.260 | Baileys + Sara |
| 9 | `public/direccion.js` | 981 | 🧟 **legacy** (ver §Huérfanos) |
| 10 | `public/marketing.js` | 979 | 🧟 **legacy** |
| 11 | `public/fichar.js` | 903 | Kiosko de fichaje |
| 12 | `src/modules/facturas/pdf-texto.js` | 784 | Extracción de texto de PDF |
| 13 | `tests/modules/horarios-solver.test.js` | 679 | |
| 14 | `public/rrhh.js` | 675 | 🧟 **legacy** |
| 15 | `public/erp-preview/app.js` | 646 | 🧟 **prototipo abandonado** |
| 16 | `public/trabajadores.js` | 562 | 🧟 **legacy** |
| 17 | `tests/modules/facturas-lineas.test.js` | 539 | |
| 18 | `tests/modules/facturas-vencimiento.test.js` | 495 | |
| 19 | `tests/panel-compras-vista.test.js` | 473 | |
| 20 | `tests/modules/horarios-conflictos.test.js` | 439 | |
| 21 | `tests/rrhh-fase5-bolsa.test.js` | 427 | |
| 22 | `src/modules/horarios/solver.js` | 418 | Generador de cuadrantes |
| 23 | `public/local.js` | 418 | Página pública de local |
| 24 | `src/modules/dashboard/dashboard.service.js` | 415 | Narrativas del dashboard |
| 25 | `tests/rrhh-fase6-ciclo.test.js` | 399 | |
| 26 | `tests/modules/fichajes-bolsa-liquidacion.test.js` | 394 | |
| 27 | `src/modules/horarios/schema.js` | 394 | 14 tablas `hor_*` |
| 28 | `public/encargados.js` | 372 | 🧟 **legacy** |
| 29 | `src/modules/fichajes/bolsa.js` | 370 | Bolsa de horas |
| 30 | `tests/modules/rrhh-ciclo.test.js` | 359 | |

**HECHO**: `server.js` + `public/panel/app.js` = **29.073 líneas = 35 % de todo el JavaScript**.

## Estructura de carpetas

```
/
├── server.js                 16.722 líneas · TODO el HTTP + esquema + cron
├── facturas.js                1.465 · pipeline de facturas (Drive, Sheets, OCR vía IA)
├── whatsapp.js                1.260 · Baileys + Sara (agente IA sobre WhatsApp)
├── security.js                  ~250 · JWT, uploads de CV, errorHandler
├── seed-workers.js              ~180 · siembra de trabajadores
├── test-wa.js                    27 · 🧟 script suelto de prueba de WhatsApp
├── index.html, styles.css           · 🧟 duplicados de public/ en la raíz
├── b.ctid                         0 bytes · 🧟 fichero basura RASTREADO por git
├── src/
│   ├── core/          access.js · scope.js · flags.js · canonico.js
│   ├── db/            establecimientos.migration.js · reconciliation.js
│   ├── http/          comprimir.js
│   ├── integrations/agora/   client · sync · reports · mappers · registry · http · descubrir · diagnostico
│   └── modules/       18 dominios (ver abajo)
├── public/
│   ├── index.html + app.js    web pública (i18n es/ca/en)
│   ├── panel/                 EL panel (index.html + app.js)
│   ├── fichar.*               kiosko de fichaje (+ service worker)
│   ├── cupon.*                página del cupón que ve el cliente
│   ├── pulso.*                encuesta anónima del equipo
│   ├── erp-preview/           🧟 prototipo de ERP abandonado
│   └── direccion|marketing|rrhh|trabajadores|encargados|contabilidad|local.*  🧟 legacy
├── tests/             170 ficheros · 3.373 tests
├── tools/             barrido-rutas.mjs · inventario-bloques.mjs (necesitan puppeteer)
├── scripts/           migrate-establecimientos.js · limpiar-leads-duplicados.sql
├── docs/adr/          0001-arquitectura-multi-establecimiento.md
└── attached_assets/   🧟 10 capturas + 1 prompt histórico pegado
```

### Los 18 módulos de `src/modules/` (16.131 líneas)

`agora` · `campaigns` · `clientes` · `dashboard` · `facturas` · `fichajes` · `horarios` · `ia` ·
`inventario` · `locales` · `mantenimiento` · `marketing` · `messaging` · `promos` · `reservas` ·
`reviews` · `rrhh` · `usuarios` · `web`

El más grande es `facturas` (18 ficheros, ~3.000 líneas); le siguen `horarios` (16) y `fichajes` (9).

## Ficheros huérfanos / candidatos a borrar (HECHO)

| Fichero | Rastreado | Evidencia de abandono |
|---|---|---|
| `b.ctid` | **sí** | 0 bytes, sin referencias |
| `index.html`, `styles.css` (raíz) | **sí** | Duplicados de `public/`; `express.static` sirve `public/`, no la raíz |
| `test-wa.js` | **sí** | Script suelto; contiene un teléfono real |
| `public/erp-preview/` | **sí** | 793 líneas; `<title>… (prototipo)`; sin enlaces entrantes |
| `public/{direccion,marketing,rrhh,encargados,contabilidad}.html+js` | **sí** | ~3.400 líneas. `public/login.js:1` documenta que **todos los roles van al panel unificado**. Sin enlaces entrantes |
| `public/trabajadores.html+js` | **sí** | 784 líneas, misma situación |
| `public/local.html+js`, `public/locales.html` | **sí** | `locales.html` sí está enlazada (8 refs); `local.html` es su ficha |
| `attached_assets/` | **sí** | 10 imágenes + `Pasted-Eres-un-ingeniero-senior-Migra-esta-app-de-SQLite-a-Pos_…txt` |
| `.wwebjs_auth/`, `.wwebjs_cache/` | no (ignorados) | Restos de `whatsapp-web.js`, sustituido por Baileys |
| `database.sqlite` (184 KB), `latapeta.db` (0 B) | no (ignorados) | Restos de la etapa SQLite |
| `replit.md` | **sí** | **Desactualizado**: describe SQLite; hoy es PostgreSQL |

⚠️ **RIESGO**: los HTML legacy **se siguen sirviendo** por `express.static` (`server.js:247`).
Son alcanzables por URL directa aunque no estén enlazados. Ver `07_SEGURIDAD.md`.

## Funciones especialmente grandes

**INFERENCIA** (medida por distancia entre declaraciones en `server.js`): los bloques más densos son
el pipeline de facturas (~2.100-3.200), el de RR.HH./horarios (~8.100-9.500), el de fichajes
(~10.000-11.900) y el de campañas/IA (~14.300-15.900). No hay una sola función monstruo: el problema
es la **acumulación en un fichero**, no la longitud individual.
