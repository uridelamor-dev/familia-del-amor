# 11 · Rendimiento

## Backend

### 🔴 El problema estructural: `MATCH_TEL9` no puede usar índices

`server.js:14477`:
```sql
RIGHT(regexp_replace(col, '[^0-9]', '', 'g'), 9) = RIGHT(regexp_replace(?, '[^0-9]', '', 'g'), 9)
```

**HECHO**: al aplicar funciones sobre la columna, **ningún índice B-tree normal sirve** → escaneo
secuencial de `leads` (y de `reservas` en la vista unificada) en **cada** llamada.

Lo usan ~9 endpoints, entre ellos `GET /api/contactos` (la vista principal de Clientes), la ficha de
cliente, `POST /api/leads` (público) y el envío de campañas.

**Solución conocida y barata**: índice funcional.
```sql
CREATE INDEX idx_leads_tel9 ON leads ((RIGHT(regexp_replace(telefono,'[^0-9]','','g'),9)));
```
Sin cambiar una línea de código de aplicación.

### 🟡 `sqlContactosUnificados` (`server.js:4248-4477`)

229 líneas generando SQL: `leads UNION reservas-sin-lead` (agrupadas por tel9) + `LEFT JOIN
marketing_prefs` + `LEFT JOIN cliente_metricas`. La usan **9 endpoints**, incluido el envío de
campañas.

**INFERENCIA**: es la consulta más cara del sistema y crece con dos tablas a la vez. Con la base
actual probablemente va bien; con 50.000 contactos, no.

### 🟡 N+1 identificados

| Dónde | Consultas | Criticidad |
|---|---|---|
| `historicoLaboralDe` (`server.js:4037`) | 10 en bucle | Baja — solo al borrar un usuario |
| `POST /api/fichar/:token/cupon/ver` con carné | hasta 20 (una por promoción vigente) | **Media — se ejecuta con el cliente delante en la barra** |
| `proEnviarWA` en emisión por lotes | 1 pref + 1 update por destinatario | Baja — el `delayConJitter` de 6-15 s domina |
| `recalcularMetricasSiToca` | `SQL_RECALCULO` sobre toda la base | Media — cada 30 min |

### 🟡 Llamadas externas dentro de peticiones HTTP

- **Claude** (`@anthropic-ai/sdk`) en `/api/campanas/redactar`, `/api/sara/*`, extracción de hechos,
  lectura de facturas. Latencia de segundos, **sin timeout explícito visible**.
- **Ágora**: `/api/agora/ventas-vivo` habla con el TPV en vivo. Mitigado con caché
  (`src/modules/agora/cache.js`) y un `setInterval` que la calienta cada 5 min. ✅ Buena decisión.
- **Google** (Drive, Sheets, Gmail, Business): en tareas de fondo, no en peticiones. ✅

### 🟢 Lo que está bien
- **Caché de ventas de Ágora** con calentamiento anticipado — el comentario del commit `6af4bd6`
  dice literalmente «las ventas por local ya están pedidas cuando entras».
- **`agora_cache`** persiste entre reinicios.
- **Tope diario de WhatsApp** con reanudación al día siguiente: protege el número y reparte carga.
- **`Promise.all`** en las cargas del panel, con comentarios que explican que encadenarlas duplicaba
  el tiempo.

## Frontend

| Aspecto | Estado |
|---|---|
| Peso del JS | `panel/app.js` = **12.351 líneas** cargadas de golpe en cada visita. Sin minificar, sin dividir, sin `defer` documentado |
| CSS | `styles.css` = 3.710 líneas, compartido entre web pública y panel |
| Peticiones | Sin `AbortController` → peticiones huérfanas al cambiar de vista |
| Datos duplicados | `INV_LOCALES`/`LOCALES`, `CATALOGO_MODULOS`/`VIEW_ROLES` duplicados cliente-servidor |
| Caché HTTP | **INFERENCIA**: sin `Cache-Control` explícito en `express.static` → depende de los defectos de Express (ETag). El panel de 12k líneas se revalida en cada carga |
| Polling | 2 (`FIC_TIMER`, `WA_POLL`), ambos se auto-cancelan comprobando `CURRENT` |
| DOM | `root.innerHTML = …` destruye y reconstruye la vista entera en cada navegación |
| Imágenes | `attached_assets/` y `public/assets/` sin pipeline de optimización. `CLAUDE.md` menciona un script `gallery-import.sh` con `sips` |

## Base de datos

| Aspecto | Estado |
|---|---|
| Índices | 78 para 91 tablas. Bien en dominios nuevos (`fic_*`, `hor_*`, `pro_*`), pobre en los antiguos (`leads`, `reservas`, `facturas`) |
| Escaneos | `MATCH_TEL9` (arriba). También `SELECT DISTINCT local FROM facturas` sin índice |
| Agregaciones | El dashboard hace varios `COUNT`/`SUM` por petición sobre `facturas`, `reservas`, `ventas_diarias` |
| Históricos | Sin política de archivado. `whatsapp_messages`, `fic_eventos` (4 años por ley), `google_reviews`, `agora_cache` crecen sin límite |
| Pool | `new Pool(...)` **sin `max` ni `idleTimeoutMillis` explícitos** → 10 conexiones por defecto de `pg` |

## Causas probables de un dashboard lento (INFERENCIA)

Por orden de sospecha:
1. Varias agregaciones sin índice sobre `facturas`/`reservas` en la misma petición.
2. `dashboard.service.js` calcula ~10 «atenciones», cada una con su(s) consulta(s).
3. `MATCH_TEL9` si alguna atención cruza clientes.
4. El peso del propio `app.js` en la primera carga.

**RECOMENDACIÓN de diagnóstico** (no invasiva): registrar la duración de cada endpoint con un
middleware de 5 líneas y mirar el percentil 95 durante una semana. Hoy **no hay ninguna medición**,
así que cualquier optimización sería a ciegas.
