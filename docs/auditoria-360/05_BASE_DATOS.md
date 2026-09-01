# 05 · Base de datos

**PostgreSQL** (Replit `postgresql-16`, o Neon si la URL lo contiene — `server.js:140` activa SSL
en ese caso). Sin ORM. **91 tablas, 78 índices.**

## Cómo se gestiona el esquema (HECHO)

**No hay migraciones versionadas.** El patrón es **DDL aditivo e idempotente en cada arranque**:

- `initDB()` en `server.js:295-1650` — ~60 tablas con `CREATE TABLE IF NOT EXISTS` +
  31 `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
- Por dominio: `ensureSchemaHorarios` (14 tablas), `ensureSchemaFichajes` (8),
  `ensureSchemaPromos` (3), `ensureSchema` de establecimientos (5).
- Cada bloque va en su propio `try/catch` **no fatal**: si promociones falla, fichajes sigue.

**Ventajas**: cero fricción, imposible olvidar aplicar una migración.
**Desventajas**: (a) no se puede **quitar** ni renombrar nada; (b) no hay historial de qué cambió
cuándo; (c) el orden de arranque importa y no está declarado; (d) **no hay rollback**.

⚠️ **Nota operativa documentada** (`server.js:1210`): el despliegue de Replit genera migraciones
diffando el esquema y **no sabe ordenar claves primarias compuestas** → convención obligatoria:
`SERIAL` tonto + índice único aparte.

## Acceso a datos

```js
// server.js:138-168
const pool = new Pool({ connectionString: DATABASE_URL, ssl: …neon… });
function toPositional(sql) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }
async function dbGet(sql, p) → primera fila | null
async function dbAll(sql, p) → filas
async function dbRun(sql, p) → primera fila si hay RETURNING | undefined
```

- **Placeholders `?`** traducidos por posición. Siempre parametrizado.
- **Sin repositorios.** SQL crudo dentro de cada handler. Lo más parecido a un repositorio son
  constantes SQL exportadas desde módulos puros: `SQL_RECALCULO`, `SQL_PODAR`
  (`clientes/metricas.js`), `SQL_GRUPOS`/`SQL_APLICAR` (`clientes/duplicados.js`),
  `SQL_CANJEAR`/`SQL_CANJES_CLIENTE` (`promos/promos.js`).
- **Transacciones**: `pool.connect()` + `BEGIN/COMMIT/ROLLBACK` manual, solo donde importa
  (unificar duplicados, alta de trabajador con contrato — `server.js:8199`).

## Las 91 tablas por dominio

### Núcleo / organización (5)
`empresas` · `establecimientos` · `user_locations` · `legacy_access` · `migration_state`
→ Creadas por `src/db/establecimientos.migration.js`. **Es la arquitectura V2, hoy inactiva.**

### Usuarios (1)
`users` — id, username, password_hash (bcrypt), rol, nombre, **local**, modulos (allowlist JSON),
locales_extra, pass_temporal, **pin_hash** (bcrypt), pin_len, pin_intentos, pin_bloqueado_hasta.

⚠️ **Tabla sobrecargada**: `users` es a la vez cuenta de acceso, ficha de trabajador y credencial
de kiosko. Ver `24_ARCHIVOS_CRITICOS.md`.

### Reservas (2)
`reservas` (con `local`) · `bloqueos_reservas`

### Clientes / CRM (8) — **globales, sin `local`**
`leads` · `marketing_prefs` · `cliente_hechos` · `cliente_metricas` · `wa_clientes` ·
`whatsapp_messages` · `followup_scheduled` · `leads_backup_*`

✅ **HECHO COMPROBADO**: `leads` y `marketing_prefs` **no tienen columna `local`**. La base de
clientes es **compartida por todo el grupo**, por diseño (los módulos `clientes`, `campanas`,
`promos` están marcados `porLocal: false` en `CATALOGO_MODULOS`). Coherente, pero es la decisión
que habría que revisar si algún día se franquicia.

**La clave de unión de todo el CRM es `RIGHT(regexp_replace(tel,'[^0-9]','','g'), 9)`**
(`MATCH_TEL9`, `server.js:14477`) — **no hay FK**. Relación implícita en ~9 endpoints.

### Marketing / campañas (8)
`campanas_wa` (+`promocion_id`) · `campana_envios` · `plantillas_mensaje` · `audiencias` ·
`traducciones` · `marketing_faltan` · `pending_whatsapp` · `sara_respuestas`

### Promociones (3) — nuevas 2026-09
`pro_promociones` · `pro_qr` · `pro_canjes` (**inmutable**)

### RR.HH. (7)
`rrhh_periodos` · `hr_jobs` · `hr_applications` · `hr_documentos` · `hr_worker_notes` ·
`hr_llamadas_mes` · `hr_preguntas_mes`

### Pulso del equipo (3)
`pulso_invitaciones` (token **hasheado**) · `pulso_respuestas` · `pulso_contactos`
→ Diseño anónimo: se sabe **que** contestaste, no **qué**.

### Horarios (14)
`hor_semanas` · `hor_asignaciones` · `hor_necesidades` · `hor_tramos` · `hor_areas` ·
`hor_worker_areas` · `hor_contratos` · `hor_disponibilidad` · `hor_ausencias` · `hor_config` ·
`hor_plantillas` · `hor_plantilla_lineas` · `hor_publicaciones` · `hor_cambios_comunicados`

### Fichajes (8)
`fic_eventos` (**inmutable**) · `fic_correcciones` · `fic_jornadas` (recalculable) ·
`fic_bolsa_movimientos` (**append-only puro**) · `fic_cierres` · `fic_dispositivos` ·
`fic_auditoria` · (+ `rrhh_periodos`)

### Facturas / compras (15)
`facturas` · `factura_lineas` · `facturas_pendientes` · `facturas_grupos` · `facturas_locales` ·
`facturas_email_reglas` · `facturas_emails_procesados` · `facturas_drive_carpetas` ·
`facturas_drive_procesados` · `facturas_proveedor_alias` · `facturas_proveedor_cats` ·
`facturas_proveedor_pago` · `facturas_pago_reglas` · `facturas_somos_nosotros` ·
`facturas_conciliacion_descartes`
→ Más `productos_canonicos` · `producto_alias`

### Inventario (6)
`inv_productos` · `inv_proveedores` · `inv_sesiones` · `inv_lineas` · `inv_pedidos` · `inv_pedido_lineas`

### Ventas / Ágora (3)
`ventas_diarias` · `agora_locales` (credenciales cifradas) · `agora_cache`

### Otros (6)
`google_reviews` · `maintenance_issues` · `announcements` · `contents` · `config` · `wa_links`

## Problemas detectados

### 🔴 Integridad referencial muy desigual

**HECHO COMPROBADO**: hay **23 claves ajenas** en 91 tablas, y están **concentradas** en tres
dominios:

| Dominio | FKs | Comentario |
|---|---:|---|
| `inv_*` (inventario) | 8 | Con `ON DELETE CASCADE`/`SET NULL` bien pensados |
| `hor_*` (horarios) | 8 | Idem |
| `facturas`, `productos_canonicos`, `establecimientos`, `empresas` | 7 | |
| **`reservas`, `leads`, `fic_*`, `pro_*`, `users`, `campanas_wa`, `cliente_*`** | **0** | `worker_id`, `promocion_id`, `qr_id`, `campana_id` son enteros sueltos |

**INFERENCIA**: los módulos escritos más recientemente y con más cuidado (inventario, horarios) sí
declaran integridad; el núcleo histórico no. No es una decisión, es sedimentación.

**Consecuencia**: la integridad depende del código. Ya hay defensa explícita en un sitio
(`historicoLaboralDe`, `server.js:4025`, recorre **10 tablas** buscando huérfanos antes de borrar
un usuario) — lo que demuestra que el problema es conocido y se paga a mano.

**RIESGO**: borrar una promoción deja `pro_qr` y `pro_canjes` apuntando al vacío. Borrar un
proveedor deja `inv_productos` colgando.

### 🟡 Tablas de respaldo con nombre dinámico
`leads_backup_*` y `marketing_prefs_backup_*` — **INFERENCIA**: creadas por scripts de migración con
sufijo de fecha. Nadie las limpia. Ocupan espacio y contienen **PII duplicada**.

### 🟡 Campos JSON que deberían modelarse
- `campanas_wa.segmento_json` — 30 filtros como JSON. Imposible consultar «¿qué campañas
  filtraron por Blanes?» sin recorrerlas todas en JS.
- `users.modulos` — allowlist como JSON/texto. `parseModulos()` acepta array, string JSON o null.
- `fic_jornadas.incidencias`, `hor_publicaciones` (snapshot), `audiencias.filtros_json`.

### 🟡 Índices: 78 para 91 tablas
**INFERENCIA**: cobertura razonable en los dominios nuevos (fichajes, horarios, promos tienen
índices explícitos y pensados). **Los dominios antiguos —`leads`, `reservas`, `facturas`— son los
que menos índices declarados tienen**, y son justo los que más crecen.

⚠️ **Sospecha de escaneo completo**: `MATCH_TEL9` aplica `RIGHT(regexp_replace(...))` sobre la
columna → **ningún índice B-tree normal puede usarse**. Con `leads` + `reservas` creciendo, las 9
consultas que lo usan degradan linealmente. **Solución conocida**: índice funcional
`CREATE INDEX ON leads ((RIGHT(regexp_replace(telefono,'[^0-9]','','g'),9)))`.

### 🟡 N+1 detectados
- `historicoLaboralDe` (`server.js:4037`) — 10 consultas en bucle por usuario a borrar. Aceptable
  (operación rara).
- `POST /api/fichar/:token/cupon/ver` con carné — recorre hasta 20 promociones y hace **una
  consulta de canjes por cada una**. Se ejecuta con el cliente delante en la barra.
- `proEmitir` en campañas — una emisión + un UPDATE por destinatario, dentro del bucle de envío.
  Aceptable: el `delayConJitter` de 6-15 s domina.

### 🟢 Lo que está bien
- **`fic_eventos` inmutable** con test-candado.
- **`fic_bolsa_movimientos` append-only sin campo `saldo`** — el saldo es `SUM(minutos)`.
- **`pro_canjes` inmutable** con índice único sobre `(promocion_id, telefono, uso_n)` que resuelve
  la carrera de dos tablets sin transacción.
- **Índices únicos parciales bien usados**: un periodo laboral abierto por persona, un carné vivo
  por teléfono, un cierre vivo por local+periodo, una reversión por movimiento.
