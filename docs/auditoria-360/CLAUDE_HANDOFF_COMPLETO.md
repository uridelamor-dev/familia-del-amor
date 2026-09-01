# CLAUDE_HANDOFF_COMPLETO
## Traspaso íntegro del sistema «Familia del Amor» para continuar el trabajo sin acceso al repositorio

> **Cómo usar este documento**: contiene todo lo necesario para razonar sobre el sistema sin verlo.
> Cada afirmación lleva su referencia (`fichero:línea`, `función()`, `endpoint`, `tabla`) para poder
> preguntar «¿por qué ocurre X?» y saber inmediatamente qué inspeccionar.
>
> Auditoría de 2026-09-01 · HEAD `90ded2998c98209fbb347e5043ec153afc6ba14a` · rama `main`
> Etiquetas: **[HECHO]** verificado · **[INFERENCIA]** deducido con evidencia · **[SOSPECHA]** sin verificar

---

# 1 · Qué es Familia del Amor

Un **ERP interno a medida** para un grupo familiar de restauración español (Girona/Barcelona), más
su **web pública**. No es un producto comercial: es software que ha crecido por necesidad real de un
negocio con 6 establecimientos.

**Los 7 establecimientos** (`INV_LOCALES`, `server.js:3732` — **hardcodeados**):
`La Tapeta - Blanes` · `La Tapeta - Lloret` · `La Tapeta - Girona` · `Can Mateu - Tordera` ·
`La Tapa Ibérica - Tordera` · `Botiga d'en Mateu - Tordera` · `Oficina`
(`LOCALES_SIN_PUBLICO = {"Oficina"}`: tiene personal pero no reservas ni ventas ni inventario)

**Sutileza de negocio**: Blanes y la Cooperativa son **un mismo centro para personal** (fichajes,
horarios) y **dos barras separadas para ventas**. Lo resuelve `src/modules/locales/centros.js` con
`ambitoDeRuta(path)`.

**Cubre**: reservas · CRM · marketing por WhatsApp · promociones con QR · RR.HH. · horarios ·
registro de jornada · compras y facturas · inventarios · analítica de ventas del TPV ·
reseñas de Google · asistente de IA en WhatsApp · web pública trilingüe.

**El idioma del código y de los comentarios es el español.** Es una norma del proyecto (`CLAUDE.md`).

---

# 2 · Arquitectura

```
NAVEGADORES (4 superficies)
  web pública · panel interno · kiosko tablet · página de cupón/pulso
        ↓ fetch (JWT Bearer, o token en la URL para kiosko/cupón/pulso)
EXPRESS 4 · server.js · 350 rutas · 16.722 líneas · UN SOLO PROCESO
  middlewares: guardia de esquema → json/urlencoded → static(public) → multer×3
  por ruta:    requireAuth([roles]) → moduloDeRuta() → localScope()
  ⛔ SIN helmet · SIN CSP · SIN CORS · SIN rate limit global · SIN sesiones
        ↓
src/modules/** (18 dominios, 16.131 L) — PUROS, sin Express ni DOM, reciben la conexión `x`
facturas.js (1.465 L) · whatsapp.js (1.260 L) · integrations/agora/
        ↓
PostgreSQL · 91 tablas · 78 índices · 23 FKs · pg.Pool · SQL crudo, sin ORM
```

**Sin cron, sin colas, sin workers, sin WebSockets propios, sin caché externa.**
14 `setInterval` en proceso hacen todo el trabajo de fondo.

**[HECHO]** `server.js:1915` documenta que `setInterval(..., 24h)` **no se dispara casi nunca en
Replit** porque el proceso se recicla. Por eso todos los intervalos son cortos (5-30 min) y cada
tarea comprueba «¿me toca?» contra la base de datos.

---

# 3 · Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20 (Replit) / v25.5.0 (local) · **ESM** (`"type": "module"`) |
| Servidor | Express 4.19.2 |
| BD | PostgreSQL 16 · driver `pg` 8.22 **sin ORM** |
| Auth | `jsonwebtoken` 9 + `bcrypt` 6 |
| Frontend | **JavaScript vanilla. Sin framework, sin bundler, sin build** |
| WhatsApp | `@whiskeysockets/baileys` **^7.0.0-rc13** (no oficial, release candidate) |
| IA | `@anthropic-ai/sdk` 0.97 (Claude Sonnet 5 + Haiku 4.5) |
| PDF | `pdf-lib` + generación manual base-14/WinAnsi |
| Otros | `multer` 1.x · `qrcode` · `dotenv` · `@hapi/boom` · **`pino` (declarado y NUNCA usado)** |
| Despliegue | **Replit VM** (`deploymentTarget = "vm"`), puerto 5000 → 80 |

## ⚠️ LA RESTRICCIÓN QUE LO CONDICIONA TODO

> **`CLAUDE.md`: «No se pueden añadir dependencias npm.»** `npm install` no funciona en local (el
> lockfile apunta al firewall de Replit) y un fallo de instalación en el despliegue es una caída.

**[HECHO]** `node_modules/` existe con 384 entradas pero **`pg` no está instalado** → el servidor
**no arranca en local**.

**Consecuencia para cualquier recomendación**: helmet, Sentry, zod, supertest… **no son opciones**.
Hay que escribirlo a mano o usar `fetch` contra una API HTTP.

---

# 4 · Repositorio

- **Remoto**: `https://github.com/uridelamor-dev/familia-del-amor.git`
- **Rama única**: `main`
- ⚠️ **Replit commitea al MISMO `main`** con el mensaje `Published your App` →
  **siempre `git pull --rebase` antes de push. Nunca `push --force`.**
- Comandos: `npm run dev` (= `node server.js`) · `npm test` (= `node --test`)
- **No hay**: build, bundler, linter, formatter, CI, entorno de staging

## Estructura

```
server.js                16.722 L  ← TODO el backend
public/panel/app.js      12.351 L  ← TODO el panel interno
facturas.js               1.465 L  ← pipeline de facturas + Google
whatsapp.js               1.260 L  ← Baileys + Sara
security.js                ~250 L  ← JWT, uploads, errores
src/core/                            access · scope · flags · canonico
src/db/                              establecimientos.migration · reconciliation
src/integrations/agora/              client · sync · reports · mappers · registry…
src/modules/<18 dominios>/  16.131 L ← lógica PURA y testeable
public/                              web pública · panel · kiosko · cupón · pulso
tests/                   27.087 L  ← 170 ficheros, 3.373 tests
tools/                               barrido-rutas.mjs (necesita puppeteer, NO instalado)
docs/adr/0001-arquitectura-multi-establecimiento.md
```

## 🧟 Código muerto (~5.900 líneas, **rastreado y servido públicamente**)

`public/{direccion,marketing,rrhh,trabajadores,encargados,contabilidad,local}.html+js` ·
`public/erp-preview/` · `index.html` y `styles.css` de la raíz · `test-wa.js` · `b.ctid` (0 bytes) ·
`attached_assets/` · `replit.md` (**describe SQLite; el sistema usa PostgreSQL**)

**[HECHO]** `public/login.js:1` documenta que **todos los roles van al panel unificado** — los
paneles por rol son de una arquitectura anterior. `direccion.js` y `marketing.js` **ni siquiera
definen `esc()`**.

---

# 5 · Backend

**350 endpoints, todos en `server.js`.** No hay `express.Router`, ni `routes/`, ni controladores.

## Acceso a datos (`server.js:138-168`)
```js
const pool = new Pool({ connectionString: DATABASE_URL, ssl: …si es neon… });
function toPositional(sql) { let i=0; return sql.replace(/\?/g, () => `$${++i}`); }
dbGet(sql, p) → fila|null    dbAll(sql, p) → filas    dbRun(sql, p) → fila si RETURNING
```
Placeholders `?`. **Siempre parametrizado.** **[HECHO] 0 casos de SQL injection en 350 endpoints.**

## Esquema
**Sin migraciones versionadas.** DDL aditivo e idempotente en cada arranque:
`initDB()` (`server.js:295-1650`, ~60 tablas) + `ensureSchemaHorarios` (14) +
`ensureSchemaFichajes` (8) + `ensureSchemaPromos` (3) + establecimientos (5).
Cada bloque en su propio `try` **no fatal**.

⚠️ **Convención obligatoria** (`server.js:1210`): el despliegue de Replit **no sabe ordenar PKs
compuestas** → siempre `SERIAL` tonto + índice único aparte.

## Distribución de endpoints
`/api/facturas` **83** · `/api/horarios` 35 · `/api/rrhh` 34 · `/api/fichajes` 22 ·
`/api/inventario` 20 · `/api/mi-*` 17 · `/api/agora` 12 · `/api/contactos`+`/clientes` 13 ·
`/api/campanas` 10 · `/api/promos` 9 · `/api/whatsapp` 8 · `/api/users` 8 · `/api/reviews` 8 ·
`/api/hr` 8 · `/api/reservas` 6 · `/api/sara` 5 · **24 públicos**

## Los 14 temporizadores
5 min: Ágora · caché de ventas · Gmail · Drive — 10 min: reintento de Sheets —
30 min: reseñas · repaso de líneas · métricas de cliente — 6 h: hechos de cliente (IA) —
sin periodo fijo: campañas programadas, campañas a medias, cumpleaños, seguimiento de reservas

---

# 6 · Frontend

**Vanilla, sin módulos ES** (los `<script>` son clásicos y **no pueden importar**).

| Superficie | Ficheros | Notas |
|---|---|---|
| **Panel** | `public/panel/index.html` + `app.js` (12.351 L) | 24 vistas · **61 variables globales** · 601 funciones · 243 `innerHTML` · **0 `AbortController`** con 29 `fetch` · 23 listeners delegados en `document` |
| **Web pública** | `public/index.html` + `app.js` (1.454 L) | i18n **es/ca/en** en el objeto `i18n` (`app.js:70`, bloques `es` L71, `ca` ~L208, `en` ~L345) |
| **Kiosko** | `fichar.html` + `fichar.js` (903 L) + `fichar.css` + `fichar-sw.js` | IIFE autocontenido, **cero dependencias**. El mejor frontend del repo |
| **Cupón** | `cupon.html` + `cupon.js` | Sin sesión, token en la URL |
| **Pulso** | `pulso.html` + `pulso.js` | Encuesta anónima |

**Router del panel**: `go(view)` → hash en la URL → `root.innerHTML = shell(view, skeleton())` →
`VIEWS[view]()`. **Destruye y reconstruye el DOM entero** en cada navegación.

**Helpers universales**: `esc()` (`app.js:22`) · `num()` · `api()`/`apiRaw()`/`apiSend()`/`apiOptional()` ·
`modal()` · `drawer()` · `confirmModal()` · `toast()` · `skeleton()` · `errorCard()` · `ic()`

⚠️ **5 espejos manuales del backend** en el frontend (ver §10 y §28).

---

# 7 · Base de datos

**91 tablas · 78 índices · solo 23 FKs.** Ver `DATA_MODEL.md` para el diagrama completo.

## Por dominio
- **Organización (V2, inactiva)**: `empresas` · `establecimientos` · `user_locations` · `legacy_access` · `migration_state`
- **Usuarios**: `users` ⚠️ *(cuenta + ficha de trabajador + credencial de kiosko, todo en una fila)*
- **Reservas**: `reservas` · `bloqueos_reservas`
- **CRM (⚠️ GLOBAL, sin `local`)**: `leads` · `marketing_prefs` · `cliente_hechos` · `cliente_metricas` · `wa_clientes` · `whatsapp_messages` · `followup_scheduled`
- **Marketing**: `campanas_wa` · `campana_envios` · `plantillas_mensaje` · `audiencias` · `traducciones` · `marketing_faltan` · `pending_whatsapp` · `sara_respuestas`
- **Promociones**: `pro_promociones` · `pro_qr` · `pro_canjes`
- **RR.HH.**: `rrhh_periodos` · `hr_jobs` · `hr_applications` · `hr_documentos` · `hr_worker_notes` · `hr_llamadas_mes` · `hr_preguntas_mes`
- **Pulso**: `pulso_invitaciones` · `pulso_respuestas` · `pulso_contactos`
- **Horarios (14)**: `hor_*`
- **Fichajes (8)**: `fic_*`
- **Facturas (15)**: `facturas` · `factura_lineas` · `facturas_*` · `productos_canonicos` · `producto_alias`
- **Inventario (6)**: `inv_*`
- **Ventas**: `ventas_diarias` · `agora_locales` · `agora_cache`
- **Otros**: `google_reviews` · `maintenance_issues` · `announcements` · `contents` · `config` · `wa_links`
- 🧟 `leads_backup_*` · `marketing_prefs_backup_*` (**PII duplicada sin política de borrado**)

## ⭐ La clave de unión del CRM NO es una FK
```sql
RIGHT(regexp_replace(telefono, '[^0-9]', '', 'g'), 9)
```
`MATCH_TEL9` (`server.js:14477`). La usan **9 endpoints**.
⚠️ **Al aplicar funciones sobre la columna, ningún índice B-tree sirve → escaneo secuencial.**
Solución: índice funcional (una línea de SQL, sin tocar código).

## Invariantes protegidos por tests
- `fic_eventos` **INMUTABLE** (solo se actualiza `anulado_por`; `DELETE` prohibido)
- `fic_bolsa_movimientos` **APPEND-ONLY puro**, sin campo `saldo` (saldo = `SUM(minutos)`)
- **Nunca** copiar `min_planificado` ↔ `min_fichado`
- `pro_canjes` **INMUTABLE**
- Índices únicos parciales: un periodo laboral abierto por persona · un carné vivo por teléfono ·
  un cierre vivo por local+periodo · `(promocion_id, telefono, uso_n)` en canjes

---

# 8 · Usuarios

Tabla `users`: `id, username, password_hash (bcrypt), rol, nombre, local, modulos (allowlist JSON),
locales_extra, pass_temporal, pin_hash (bcrypt), pin_len, pin_intentos, pin_bloqueado_hasta`.

**Login**: `POST /api/auth/login` (`server.js:3774`) · público · rate 20/min por IP ·
freno por usuario escalonado (`src/modules/usuarios/acceso.js`: 5 fallos → 30 s / 2 / 5 / 15 min).

**Token** (`server.js:3825`):
```js
jwt.sign({ id, username, rol, nombre, local,
           modulos: modulosEfectivos(rol, user.modulos),
           locales: localesDe(user), pass_temporal },
         JWT_SECRET, { expiresIn: "8h" })
```
Guardado en **`localStorage`** (no cookie). **Sin refresh. Sin revocación.**

⚠️ **Consecuencias prácticas**: despedir a alguien no le cierra la sesión (8 h). Cambiar sus
permisos **tarda hasta 8 h en aplicarse** porque `modulos` viaja **dentro** del JWT.

**`pass_temporal` NO bloquea** — decisión documentada: *«el encargado que llega a las siete con el
local abriendo no puede quedarse fuera del panel por un formulario»*.

**No existe un rol `trabajador`.** Quien no tiene cuenta usa el kiosko (token + PIN) y el enlace
anónimo del pulso.

---

# 9 · Roles

**5 roles**: `direccion` (superusuario, **salta la comprobación de módulo**) · `encargado` ·
`contabilidad` · `rrhh` · `marketing`.

**Constantes en `server.js`**:
`RRHH_ROLES` :8112 · `HORARIOS_ROLES` :8396 · `CONFIG_ROLES` :9503 · **`FICHAJES_ROLES` :10029** ·
`VALIDAR_ROLES` :10041 *(el encargado NO valida horas)* · `LIQ_ROLES` :11888 · `PULSO_ROLES` :12648 ·
`INV_ROLES` :13967 · `PROMOS_ROLES` :10590

---

# 10 · Permisos

**Modelo** (`src/modules/usuarios/permisos.js`):
> **El rol define el máximo; la allowlist por usuario solo RESTRINGE, nunca amplía.**
> `modulosEfectivos(rol, guardados) = intersección(modulosDeRol(rol), parseModulos(guardados))`
> Allowlist vacía/null → acceso completo del rol.

`CATALOGO_MODULOS` (L13) — **24 módulos** con `{ id, label, roles[], porLocal, dentroDe? }`.
Tres son pestañas dentro de Equipo (`contratacion`, `pulso`, `preguntas`).

**Cadena de comprobación** en `requireAuth` (`server.js:3697`):
1. `jwt.verify` → 401
2. `roles.length && !roles.includes(payload.rol)` → 403
3. `moduloDeRuta(req.path)` ∈ `payload.modulos` → 403 *(salvo `direccion`)*
4. `req.user = payload`

## 🔴 TRES BUGS CONFIRMADOS DE PERMISOS

**B1 · `contabilidad` ve «Fichajes» y la API le da 403.**
`CATALOGO_MODULOS` (`permisos.js:35`), `NAV` y `VIEW_ROLES` incluyen `contabilidad`; los 15
endpoints usan `FICHAJES_ROLES` (`server.js:10029`) que **no lo incluye**.
El comentario de `permisos.js:33` dice que contabilidad necesita los fichajes **para la nómina** →
el bug está en la constante, pero **no basta con añadir el rol**: le daría correcciones y
anulaciones. Hace falta separar lectura de escritura.

**B2 · La allowlist de `mantenimiento` nunca se aplica.**
`MODULO_POR_RUTA` mapea `/api/mantenimiento`; las rutas reales son **`/api/maintenance`** en inglés
(`server.js:13928, 13938, 13951`). `grep -c 'app\..*"/api/mantenimiento'` → **0**.

**B3 · `MODULO_POR_RUTA` solo cubre 21 prefijos de ~45.**
Sin mapear: **`/api/facturas` (83 endpoints)**, `/api/users`, `/api/whatsapp`, `/api/hechos`,
`/api/upload`, `/api/leads`, `/api/marketing`, `/api/ventas`, `/api/debug`…
→ Quitarle «Compras» a un contable **esconde el menú pero no cierra la API**. El **rol** sí se
comprueba; lo que no se aplica es la allowlist por usuario.
*(Está documentado como endurecimiento progresivo: «añadir una entrada ENDURECE».)*

---

# 11 · Establecimientos

## Dos modelos conviviendo

**A · El que está en producción**: columna `local TEXT` con el nombre escrito. En ~27 tablas.
`WHERE local = ?` **a mano en ~190 consultas** (`server.js:60`).

**B · El diseñado y APAGADO**: `establecimiento_id`. `src/core/access.js` (152 L) implementa
`buildAccessContext`, `canAccessEstablecimiento`, `authorizeEstablecimiento` con precedencia
`global → assigned → legacy → none`, **default-deny** y **fail-closed**. Testeado
(`tests/core/access.test.js`). **Detrás del flag `PERMISOS_V2`, hoy `false`** (`src/core/flags.js`).
Ver `docs/adr/0001-arquitectura-multi-establecimiento.md`.

## Cómo se decide el local
`localScope(req, pedido)` (`server.js:3701`) → `localPermitido(user, pedido)`.
✅ **El local nunca sale del cuerpo de la petición.** Sale del token o de `?local=` validado.
Si se pide un local ajeno **se devuelve el propio, en silencio** (no un 403, y no se registra).

## Qué es global
`leads`, `marketing_prefs`, `cliente_metricas`, `cliente_hechos`, `pro_promociones`, `pro_qr`,
`contents`, `config` **no tienen `local`** — el CRM es del grupo, por diseño. Los módulos
`clientes`, `campanas`, `promos`, `web`, `sara`, `whatsapp` son `porLocal: false`.
⚠️ **Es la decisión que rompería una franquicia.**

## El riesgo estructural
**No hay una fuga hoy; lo que no hay es nada que la impida mañana.** El aislamiento depende de que
cada consulta nueva recuerde filtrar. Sin RLS, sin capa de repositorio, sin test genérico.

---

# 12 · Panel

24 vistas. Router por hash. Ver `PERMISSIONS_MATRIX.md` para la tabla rol × módulo.

**Dashboard** (`src/modules/dashboard/dashboard.service.js`, 415 L) — **la pieza más diferenciadora
del producto**. No devuelve solo números: genera **«atenciones» narradas**
`{ sev, tipo, titulo, narrativa, decision, impacto, go }` que explican el problema, **qué haría el
sistema en tu lugar** y cuánto cuesta no hacerlo. Ejemplos reales (L283-328): Sara desconectada ·
incidencia repetida 3 veces · factura sin pagar hace 75 días · gasto disparado sin ventas detrás ·
reseña baja · trabajador acumulando incidencias.

⚠️ **Contrato no documentado**: el servicio produce **HTML confiable** (`<b>…</b>`) escapando los
datos de usuario con su propio `esc()` (L23), y `attRow()` (`public/panel/app.js:940`) lo inserta
con `innerHTML` **sin escapar**. Correcto hoy, **frágil**: un campo nuevo sin `esc()` abre un XSS
almacenado desde, p. ej., el título de una incidencia.

---

# 13 · Reservas

**Flujo**: web o Sara → `POST /api/reservas` (**público, `server.js:6922`**) →
`estaBloqueado(local,dia)`? → `INSERT reservas` → WhatsApp al cliente **y** al grupo del local →
`upsertLead()`. Al día siguiente: «¿qué tal fue?» → **reseña solo a quien salió contento**
(`src/modules/reservas/seguimiento.js`).

## 🔴 NO HAY CONTROL DE AFORO NI DISPONIBILIDAD
**[HECHO]** El endpoint comprueba **únicamente** bloqueos y después inserta. Búsqueda de
`aforo|capacidad|max_personas|plazas|disponibilidad` → **0 resultados**.
- Sin límite por franja horaria · sin mesas · sin turnos como entidad
- **No hay «doble reserva» porque no hay recurso que reservar**
- La disponibilidad la gestiona **una persona mirando la agenda**

**Es la mayor carencia funcional del sistema** y lo primero que preguntaría quien lo comparase con
un CoverManager o un TheFork.

## Otros problemas
- **Sin rate limit** en un endpoint público que **dispara 2 mensajes de WhatsApp** por llamada
- Los envíos **no se esperan** (`if (isReady()) send…` sin `await`): si fallan, el cliente cree que
  está confirmada y no hay reintento ni registro
- Modificar o borrar una reserva **no deja ningún rastro**

---

# 14 · Clientes

**Tres puertas de entrada**: formulario web (`POST /api/leads`) · reserva (`upsertLead`) ·
WhatsApp (`setOnContactoLead`).

**`sqlContactosUnificados(filtros, params)`** (`server.js:4248-4477`, **229 líneas**) —
la pieza central: `leads UNION reservas-sin-lead` (agrupadas por tel9) + `LEFT JOIN marketing_prefs`
+ `LEFT JOIN cliente_metricas`. **La usan 9 endpoints, incluido el envío de campañas.**

- `cliente_metricas` — RFM, visitas, gasto estimado **con intervalo honesto**
  (`src/modules/clientes/valor.js`). Recalculado cada 30 min
- `cliente_hechos` — dieta, alergias, preferencias, extraídas por IA cada 6 h en estado
  **`propuesto`**, con `texto_original` y marca `atribucion_dudosa`. **Requieren confirmación humana**
- `clientes/duplicados.js` — fichas repetidas, con **«mirar» separado de «aplicar»**
- **Opt-out por WhatsApp** (`server.js:15617`): `BAJA|STOP|NO MOLESTAR|…` → `baja=1` **y borra sus
  `cliente_hechos`** ✅ RGPD por encima de lo habitual

---

# 15 · Equipo / RR.HH.

34 endpoints · 9 módulos puros · 7 tablas. Ver `31_ANEXO_HORARIOS_RRHH_Y_RESTO.md` §B.

**Decisión clave**: **periodo laboral ≠ contrato.** `rrhh_periodos` es «trabajó aquí entre estas
fechas»; `hor_contratos` son las horas y el sueldo, que pueden cambiar varias veces dentro del mismo
periodo. Confundirlos haría que el historial dijera «se fue y volvió cuatro veces».

- **Índice único parcial**: una sola incorporación abierta por persona, **garantizado por la base**
- `fecha_baja` = **último día trabajado, inclusive**, con el mismo convenio en las tres tablas
- El **encargado no ve** los documentos marcados `sensible`
- El alta va **en una transacción** (`server.js:8199`): «si falla el contrato, no queda un usuario
  sin contrato»
- `documentosPorCaducar()` y `asuntosPendientes()` **ya están escritos** — materia prima de la
  «bandeja de RR.HH.» propuesta

---

# 16 · Fichajes

**El módulo mejor construido del sistema.** Obligación legal detrás (RD-ley 8/2019, 4 años).

## Tres capas de autenticación del kiosko
```
1. TOKEN DE DISPOSITIVO   /fichar.html?t=<32 bytes>  · en BD solo el SHA-256
2. PIN DEL TRABAJADOR     bcrypt · 4-6 dígitos · 5 fallos → 60/300/1800 s
                          (el bloqueo se comprueba ANTES de bcrypt)
3. TICKET HMAC            ficEmitirTicket() server.js:9985 · 2 min · atado a ESA tablet
                          crypto.timingSafeEqual · gracia de 48 h solo para la cola offline
```
Rate: `GET` 60/min · `POST /pin` **12/min** · `POST /evento` 30/min · cupones 30/min

## Offline
Service worker **red-primero que nunca cachea `/api/`** · cola en **IndexedDB** · reintento cada
30 s y en `window.online` · **la hora es la del pulso, no la del envío**, marcada
`origen='kiosco_offline'` con su `desfase_ms` · fuera de [ahora−48 h, ahora+5 min] → **409**
«La tablet tiene la hora mal» · idempotencia por `cliente_id` UNIQUE
**Sin línea el PIN no se puede comprobar y no se finge.**

## Interfaz
5 pantallas · botones de 88-96 px · **cero campos de texto** · sin `:hover` · el PIN entra solo al
completarse · **todo se borra a los 20 s, también del DOM** · reloj del servidor +
`performance.now()`, **nunca `Date.now()` a pelo**

## Correcciones y cierre
`fic_correcciones` append-only con **motivo obligatorio** (`CHECK length ≥ 5`) ·
**el encargado NO valida horas** (`VALIDAR_ROLES`) · `fic_cierres` (reabrir solo dirección y deja
rastro) · `fic_auditoria`

---

# 17 · Facturación

**El dominio más desarrollado**: 83 endpoints (24 %), 15 tablas, 18 módulos puros.

**4 canales de entrada**: subida manual · Gmail (5 min) · Drive (5 min) · WhatsApp (adjunto en grupo).
⚠️ **El canal determina el `local`** → `GET /api/facturas/locales-raros` (`server.js:5982`) detecta
canales mal configurados: *«arreglar las facturas de ayer sin arreglar el canal es volver a empezar
mañana»*.

**Pipeline**: ghostscript (fusión) → `pdf-texto.js` (784 L) → **Claude** (lectura estructurada; **es
el «OCR» del sistema**) → `json-cortado` → `emisor`/`local-canonico` → `no-es-producto` →
`lineas`+`validarSuma` → `fecha-documento` → `duplicados` → `categorias` → `vencimiento` →
`reparto` → BD → espejo a Sheets (reintento 10 min) → archivo en Drive.

⭐ **`dup_estado='duda'`** (`server.js:759`): una factura sospechosa de duplicado **sale de TODOS los
totales** hasta que alguien decide. **Prefiere un total incompleto a uno falso.**

---

# 18 · Inventarios

6 tablas con **integridad referencial real** (8 FKs). `src/modules/inventario/` (345 L, puro).
```
cantidad a pedir = stock necesario − cantidad contada   (si ≤ 0, no se pide)
```
`enTemporada(hoy, inicio, fin)` **soporta temporadas que cruzan el fin de año** (11-01 → 02-15).

## 🔴 Es un sistema de RECUENTO, no de INVENTARIO
Sabe *cuánto hay* y *cuánto pedir*. **No sabe cuánto se ha consumido ni cuánto vale.**

| Falta | ¿Hay piezas? |
|---|---|
| **Precio** — `inv_productos` no lo tiene | ✅ `factura_lineas` + `precio-referencia.js` |
| **Consumo teórico vs real** (mermas) | ❌ Falta el **escandallo** (receta) |
| **Entradas desde facturas** | ✅ `productos_canonicos` + `producto_alias` normalizan |
| **Descuento al vender** | ✅ `inv_productos.agora_product_id` existe, **[INFERENCIA]** sin explotar |

**Es la mayor oportunidad de producto no explotada.** Ver §32.

---

# 19 · Ventas

`ventas_diarias(local, dia, ventas, tickets)`, alimentada por Ágora. `agora_cache` para «ventas en
vivo», con calentamiento cada 5 min.

---

# 20 · Ágora (TPV)

**[HECHO]** **No es una API oficial: es automatización de la web de administración**
(`src/integrations/agora/client.js:1-9`).
```
1) GET  {host}/version/  → var AGORA_VERSION = 'X.Y.Z'
2) POST {host}/auth/     LoginRequest → cookie "auth-token"
3) POST {host}/bus/      GetAllPosGroupsRequest
4) POST {host}/bus/      GetGlobalSalesReportRequest {From,To,PosGroupsIds}
```
⚠️ El bus exige que `Sender.ApplicationVersion` **coincida con la versión del servidor**.

**Sincronización oportunista con catch-up** (`sync.js`), cada 5 min:
> «Como el TPV solo responde con el local abierto, cada ciclo rellena los días que falten (hasta
> ayer). […] El "estado" (días ya guardados) ES la fuente de verdad.»

`diasFaltantes(existentes, {hoy, maxDias:800})` — **función pura y testeada**. Hoy nunca entra.
✅ **Es la integración mejor diseñada del sistema**: idempotente, sin estado propio, tolerante a un
TPV apagado, con la parte difícil aislada y testeable.

🔴 **Las credenciales están cifradas con una clave inválida.** Ver §25.

---

# 21 · WhatsApp

`@whiskeysockets/baileys ^7.0.0-rc13` · `whatsapp.js` (1.260 L) · sesión en ficheros
(`/home/runner/latapeta-data/baileys_auth` en Replit).

**Reconexión** (L761-866): retroceso exponencial hasta 60 s · `loggedOut` → no reintenta ·
código 408 + ≥3 intentos → **pausa** («QR ignorado N veces») · ≥4 fallos → **avisa por WhatsApp**.

**36 exports**: 11 de envío · 5 de estado · **18 `setOnX()`** que `server.js` rellena al arrancar
(inversión de control).

## Protecciones de envío masivo (`src/modules/messaging/queue.js`)
`delayConJitter(6000, 15000)` · **tope diario** (`wa_max_diario`, 40) con reanudación al día
siguiente · deduplicación por `campana_envios` · `filtrarEnviablesWA` · **`excluir_baja = 1`
inyectado a la fuerza en TODO segmento** (`segmentoDelBody`, `server.js:14444`) ·
`esTelefonoInterno` excluye al equipo.

**[HECHO]** El tope existía y **las campañas lo contaban pero no lo respetaban**: «una de trescientos
salía entera de una sentada». Corregido.

🔴 **Un solo número para todo**: reservas + marketing + Sara + alertas. Si se banea, cae todo.
🔴 **La sesión se cae en cada redespliegue** y requiere escanear un QR a mano.

---

# 22 · Sara

Agente conversacional sobre WhatsApp con **tool-use de Anthropic**: reservar, modificar, cancelar,
enviar la carta en PDF. **No tiene módulo propio**: vive entre `whatsapp.js` y `server.js` (~15.484).

**Modelos**: `claude-sonnet-5` para Sara (`server.js:15484`); `claude-haiku-4-5-20251001` para
reseñas (3598), clasificación (13828), traducción (14650), redacción de campañas (14907) y
extracción de hechos (15809). **[INFERENCIA]** Reparto deliberado: calidad donde importa, coste
donde no.

## ⭐ La regla de oro
> **«La IA NUNCA escribe directamente: su salida pasa siempre por el mismo saneador que el
> formulario.»**

- La propuesta de campaña pasa por `sanearSegmento`, igual que el formulario
- Hay un test que falla si `CLAVES_SEGMENTO` y `CAMPOS` divergen — **porque ya divergieron y la
  campaña salió a más gente de la que se vio en la vista previa**
- El prompt prohíbe inventar (`server.js:14789`): *«NO inventes ofertas, precios, descuentos ni
  horarios que no te hayan dicho.»*
- Los hechos extraídos quedan en estado `propuesto` y requieren confirmación humana

`src/modules/ia/errores.js` traduce el error del SDK a algo accionable (401 = clave caducada,
402 = sin saldo, 429 = espera un minuto).

---

# 23 · Google

**Tres OAuth**: negocio (`GOOGLE_CLIENT_ID/SECRET`) · facturas (`GOOGLE_DRIVE_CLIENT_ID/SECRET`) ·
Places (API key).

**Scopes**: `business.manage` · **`drive` (COMPLETO, no `drive.file`)** ⚠️ · `gmail.readonly` ·
**`gmail.modify`** ⚠️ · `spreadsheets`

Superficies: Business Profile (reseñas, sync 30 min, borrador de respuesta con IA) · Gmail
(facturas, 5 min) · Drive (facturas, 5 min) · Sheets (espejo contable, reintento 10 min).

⚠️ `GOOGLE_REDIRECT_URI` cae por defecto a `https://familia-del-amor.replit.app` si falta `BASE_URL`.

---

# 24 · Integraciones — resumen

| Integración | Criticidad | Si cae |
|---|:--:|---|
| PostgreSQL | 🔴 | Todo (y `/api/health` seguiría diciendo `ok`) |
| WhatsApp (Baileys RC, no oficial) | 🔴 | Sin confirmaciones, sin marketing, sin Sara, sin alertas |
| Ágora (scraping) | 🟠 | Sin ventas ni analítica |
| Claude | 🟠 | Sin Sara, sin lectura de facturas |
| Google Drive/Gmail | 🟠 | Sin canales de facturas |
| Google Business | 🟡 | Sin reseñas |
| Google Sheets | 🟡 | Sin espejo contable |

✅ **Fichajes y horarios no dependen de NINGUNA integración externa.** Coherente con que sean los
más críticos legalmente.

---

# 25 · Seguridad

## 🔴 Los tres críticos

**S1 · La clave de cifrado de Ágora es la cadena `"[object Object]"`** — **[HECHO, verificado
ejecutando el módulo]**
```js
// server.js:7132
const AGORA_ENC_KEY = crypto.scryptSync(String(resolveJwtSecret() || "tapeta"), "agora-token-v1", 32);
```
`resolveJwtSecret()` (`security.js:56`) devuelve **un objeto** `{secret, status, source}`.
`String({...})` = `"[object Object]"`. Además, el objeto es truthy → **el `|| "tapeta"` es código
muerto**.
⇒ Las credenciales del TPV de todos los locales están cifradas con una **constante pública**.
⇒ **No se manifiesta como avería** porque cifrar y descifrar usan la misma clave equivocada.
⚠️ **Corregir a `.secret` cambia la clave derivada** → hay que migrar los valores ya cifrados.

**S2 · La protección refuse-to-boot puede estar inactiva** — **[SOSPECHA fundada]**
`isProduction()` (`security.js:18`) devuelve `false` salvo que `APP_ENV`/`NODE_ENV` estén definidos,
**y no lo están en `.replit` ni en `package.json`**. Si tampoco están en los Secrets:
`PROD = false` → `resolveJwtSecret` no lanza → si `JWT_SECRET` falta o es débil se usa
**`DEV_JWT_SECRET`** (`security.js:42`), **que está en el repositorio**.
⇒ **Cualquiera que lea el repo podría firmar un JWT con `rol: "direccion"`.**
**Comprobación (5 min)**: buscar en los logs de arranque el aviso
`Ejecutando en Replit sin APP_ENV/NODE_ENV explícito`.

**S3 · `POST /api/upload` sin filtro, a directorio público**
`multer({ storage })` **sin `limits` ni `fileFilter`** (`server.js:272`), escribiendo en
`public/uploads/` (`:257`), servido por `express.static` (`:247`).
⇒ Un `.svg` con script se sirve **desde el propio origen** → **XSS almacenado** → roba el JWT de
`localStorage` → 8 h con el rol de la víctima. Sin CSP que lo frene.
*(Contraste: `uploadFacturaMem` sí tiene 20 MB, y `uploadCv` sí tiene límite y `fileFilter`.)*

## 🟠 Altos
- **Sin helmet, sin CSP, sin `nosniff`, sin `X-Frame-Options`** (grep → 0 resultados) →
  clickjacking posible. *Atenuante: tampoco hay `cors()`, así que no hay CORS permisivo.*
- **JWT en `localStorage`, sin revocación** → despedir a alguien no cierra su sesión (8 h)
- **`express.urlencoded()` sin `limit`** explícito
- **Los paneles legacy se siguen sirviendo** y `direccion.js`/`marketing.js` **no definen `esc()`**

## 🟡 Medios
Sin CSRF *(riesgo bajo: la auth va por cabecera, no por cookie — pero si alguna vez se pasa a
cookies, habrá que añadirlo)* · teléfonos personales hardcodeados (`server.js:8015`, `:16686`) ·
`leads_backup_*` con PII · rate limit solo en 11 rutas · `x-forwarded-for` sin
`app.set("trust proxy")` · 43 `catch` vacíos · `pino` sin usar

## ✅ Lo que está BIEN
**0 SQL injection** en 350 endpoints (todo parametrizado; las 36 interpolaciones usan constantes
internas, verificadas una a una) · **0 path traversal** (`path.basename` sobre el valor de BD +
lista blanca) · **0 IDOR** (los 17 `/api/mi-*` usan `req.user.id`) · bcrypt para contraseñas **y**
PINes · doble freno de fuerza bruta · `crypto.timingSafeEqual` · tokens de 32 bytes hasheados donde
el anonimato importa · `GET /api/reviews` con columnas nombradas a propósito · `safeLogError` no
vuelca PII

---

# 26 · Rendimiento

- 🔴 **`MATCH_TEL9` impide usar índices** → escaneo secuencial en 9 endpoints.
  **Solución: índice funcional, una línea de SQL.**
- 🟡 `sqlContactosUnificados` (229 L) es la consulta más cara; crece con dos tablas
- 🟡 N+1: `/api/fichar/:token/cupon/ver` con carné hace hasta 20 consultas **con el cliente delante**
- 🟡 `public/panel/app.js` = 12.351 líneas cargadas de golpe, sin minificar ni dividir
- 🟡 **0 `AbortController`** con 29 `fetch`
- 🟡 Sin `Cache-Control` explícito en estáticos · `Pool` sin `max` ni `idleTimeoutMillis`
- 🟡 Sin política de archivado: `whatsapp_messages`, `fic_eventos` (4 años), `agora_cache` crecen sin fin
- ✅ Caché de ventas de Ágora con calentamiento anticipado · `Promise.all` en las cargas del panel

**⚠️ No hay NINGUNA medición de tiempos.** Cualquier optimización sería a ciegas.

---

# 27 · Testing

**3.373 tests · 801 suites · 170 ficheros · 27.087 líneas · TODOS EN VERDE · 60 s**
Runner: `node --test` nativo. Sin cobertura instrumentada.

**Helpers**: `memdb.js` (emulador PostgreSQL en memoria **en JS puro sin `pg`**) ·
`pgtmp.js` (Postgres real efímero, se salta sin `TEST_DATABASE_URL`)

## ⭐ El patrón estrella: tests de introspección
Leen `server.js`/`app.js` **como texto** y fallan si un invariante se rompe. **Protegen decisiones,
no implementaciones**, y sobreviven a los refactors. Ejemplos: inmutabilidad de `fic_eventos` y
`pro_canjes` · paridad `VIEW_ROLES`↔`CATALOGO_MODULOS` · «cada módulo-pantalla tiene menú y ruta» ·
nunca copiar planificado↔fichado · `hoyISO()` en hora de Madrid · paridad i18n es/ca/en.

## 🔴 El hueco
**Ni un solo test arranca Express ni hace una petición HTTP real.** Los 350 endpoints —guardias,
códigos de estado, aislamiento por local— **no están cubiertos por comportamiento**.
Sin cobertura: **Sara (0)**, **`whatsapp.js` (0)**, **reservas (~2)**, **frontend en ejecución (0)**.

---

# 28 · Deuda técnica

1. 🔴 **Dos ficheros con 29.073 líneas** (35 % del JS): `server.js` 16.722 + `panel/app.js` 12.351
2. 🔴 **~5.900 líneas de código muerto servidas públicamente**
3. 🟠 **5 espejos manuales cliente↔servidor**: `CATALOGO_MODULOS`↔`VIEW_ROLES` · `porLocal`↔`MODULOS_POR_LOCAL` · `INV_LOCALES`↔`window.LOCALES` · `LOCALES_SIN_PUBLICO` · **`construirSegmento`** *(este último ya causó un incidente real)*
4. 🟠 **`PERMISOS_V2` escrito, testeado y apagado**
5. 🟡 `replit.md` describe SQLite · `.env.example` documenta variables inexistentes *(ninguna de las 15 reales está documentada)*
6. 🟡 Restos: `.wwebjs_*`, `database.sqlite`, `sqlite` en `.replit`, `leads_backup_*`, `attached_assets/`
7. 🟡 Canal email declarado y rechazado (`server.js:14558`) · contraseña seed `tapeta2024` · `pino` sin usar

**⭐ [HECHO] En 84.000 líneas NO hay un solo `TODO`, `FIXME`, `HACK` ni `DEPRECATED`.** La deuda se
documenta en prosa explicando el porqué, no con marcadores.

---

# 29 · Riesgos — el top 10

| # | Riesgo | Sev. |
|---|---|:--:|
| 1 | `APP_ENV` no definido → secreto JWT de desarrollo en producción | 🔴 **[SOSPECHA — verificar hoy]** |
| 2 | Credenciales del TPV cifradas con clave constante | 🔴 [HECHO] |
| 3 | Subida sin filtro a directorio público → XSS almacenado | 🔴 [HECHO] |
| 4 | Sesión de WhatsApp se cae en cada redespliegue | 🔴 [HECHO] |
| 5 | Baileys no oficial en RC: WhatsApp puede banear la cuenta | 🔴 [HECHO] |
| 6 | Sin CSP/helmet | 🟠 |
| 7 | Sin revocación de sesión (8 h) ni aplicación inmediata de permisos | 🟠 |
| 8 | Sin observabilidad: un fallo nocturno no se detecta | 🟠 |
| 9 | Reservas sin aforo | 🟠 |
| 10 | **Sin backups verificados** — no hay ningún script en el repo | 🟡 **[SOSPECHA]** |

Registro completo (35 riesgos) en `RISK_REGISTER.md`.

---

# 30 · Fortalezas

1. ⭐ **Los comentarios explican el *porqué*, no el *qué*** — el activo más valioso del repositorio
2. ⭐ **Tests de introspección como candados** — protegen decisiones, sobreviven a refactors
3. **Invariantes de datos bien elegidos** (inmutabilidad, libro de movimientos, «duda» fuera de totales)
4. **Módulos puros y testeables** — la razón de que haya 3.373 tests que corren en 60 s
5. ⭐ **El patrón «di la verdad»**: `{resultado, descartados}` · «Ya lo usó el 3 de septiembre a las
   21:40» en vez de «no válido» · estimaciones con intervalo · «vas a escribir a 340 personas»
6. **«Mirar» separado de «aplicar»** en toda operación destructiva
7. **Protecciones de WhatsApp** (jitter, tope, dedup, `excluir_baja` forzado, opt-out que borra datos)
8. **La sincronización de Ágora** — idempotente y tolerante a fallos
9. **El kiosko de fichaje** — reloj del servidor, cola offline, se borra todo a los 20 s
10. **El dashboard narrado** — la pieza más diferenciadora
11. **13 dependencias para 84.000 líneas**, cero en el frontend

---

# 31 · Problemas principales

1. **Perímetro sin proteger**: sin cabeceras, subida sin filtro, secretos posiblemente en el defecto
   de desarrollo
2. **Concentración**: dos ficheros con el 35 % del código
3. **Sin observabilidad**: si algo se rompe de madrugada, nadie se entera
4. **Tres bugs de permisos confirmados** (contabilidad↔fichajes, prefijo `/api/maintenance`,
   83 endpoints de facturas sin mapear)
5. **Reservas sin aforo**
6. **Dos dependencias frágiles sin alternativa** (Baileys, Ágora por scraping)
7. **Aislamiento por local que depende de recordar `WHERE local = ?`** en ~190 consultas
8. **Sin tests HTTP** de los 350 endpoints
9. **Sesiones irrevocables de 8 h**
10. **Inventario a medio construir** (sin precio, sin consumo)

---

# 32 · Oportunidades

| # | Oportunidad | Valor | Esfuerzo | Qué falta |
|---|---|:--:|:--:|---|
| 1 | **Escandallo + coste por plato** | 🔥🔥🔥 | Medio | Tabla `recetas` + cruce. Precios, normalización y ventas **ya existen** |
| 2 | **Aforo y turnos en reservas** | 🔥🔥🔥 | Medio | Capacidad por local/franja |
| 3 | **Consumo teórico vs real (mermas)** | 🔥🔥🔥 | Medio-alto | Depende de (1) |
| 4 | **Entradas de stock desde facturas** | 🔥🔥 | Medio | Puente `factura_lineas` → `inv_lineas` |
| 5 | **Pantalla «Hoy» del encargado** | 🔥🔥🔥 | **Muy bajo** | Solo agregar datos existentes |
| 6 | **Bandeja de RR.HH.** | 🔥🔥🔥 | **Muy bajo** | `documentosPorCaducar()` ya escrito |
| 7 | **Canal email** | 🔥🔥 | Bajo | Esquema listo; transporte vía `fetch` sin paquete |
| 8 | **Informe semanal por WhatsApp** | 🔥🔥 | Bajo | Dashboard + envío, ambos existen |
| 9 | **Fidelización sobre el carné QR** | 🔥🔥 | Bajo | El carné ya existe |
| 10 | **Multi-empresa / franquicia** | 🔥 | Alto | `core/access.js` escrito; el CRM global lo bloquea |

**El diagnóstico de producto**: compras (✅ maduro), inventario (🟡 básico) y ventas (✅ Ágora)
existen por separado. **Falta el puente entre los tres**, y ese puente —coste real por plato y
merma— es literalmente por lo que se paga un ERP de restauración.

---

# 33 · Roadmap recomendado

```
SEMANA 1 · SEGURIDAD (1-2 días reales)
  1. Verificar APP_ENV en Secrets de Replit          (5 min)   ← LO PRIMERO
  2. resolveJwtSecret().secret + migración de Ágora  (plan)
  3. limits + fileFilter en POST /api/upload         (10 min)
  4. Cabeceras a mano (nosniff, X-Frame-Options…)    (20 min)

SEMANA 2 · CORRECCIÓN Y LIMPIEZA
  5. Separar FICHAJES_ROLES lectura/escritura
  6. Test que valide ROLES, no solo presencia        ← habría cazado 2 de los 3 bugs
  7. Borrar ~5.900 líneas de código muerto
  8. Rate limit en POST /api/reservas
  9. Índice funcional para MATCH_TEL9                (10 min)
 10. Actualizar .env.example y replit.md

SEMANA 3-4 · OPERACIÓN
 11. Revocación de sesión (users.token_valido_desde vs payload.iat)
 12. Observabilidad: /api/health real · middleware de tiempo · alertas por WhatsApp
 13. Decidir PERMISOS_V2: activar o retirar

MES 2-3 · ESTRUCTURA
 14. Extraer routers de server.js, dominio a dominio, empezando por facturas (83 rutas)
     ⭐ USAR src/modules/mantenimiento/maintenance.service.js COMO MOLDE
     ⚠️ NO reescribir: mover CON los comentarios intactos

DESPUÉS · PRODUCTO
 15. Aforo en reservas → 16. Pantalla «Hoy» + bandeja RR.HH. → 17. Escandallo
```

**Regla transversal**: cada cambio estructural debe llevar un test de introspección que impida
deshacerlo por accidente. Es el patrón de la casa y funciona.

---

# 34 · Archivos más importantes

| Archivo | L | Por qué importa |
|---|---:|---|
| `server.js` | 16.722 | **Todo el backend.** 350 rutas, esquema, cron, IA, cifrado |
| `public/panel/app.js` | 12.351 | **Todo el panel.** 24 vistas, 61 globales, 601 funciones |
| `whatsapp.js` | 1.260 | Baileys + Sara. Punto único de fallo |
| `facturas.js` | 1.465 | Pipeline + Google |
| `security.js` | ~250 | **JWT y los dos bugs críticos** (§25 S1 y S2) |
| `src/modules/usuarios/permisos.js` | 183 | **El modelo de permisos.** Y el bug del prefijo |
| `src/modules/usuarios/locales.js` | 113 | El aislamiento por local |
| `src/modules/locales/centros.js` | 195 | Blanes+Cooperativa = un centro para personal |
| `src/modules/messaging/queue.js` | 134 | Anti-baneo, opt-in, variables |
| `src/modules/dashboard/dashboard.service.js` | 415 | Las narrativas. **Produce HTML confiable** |
| `src/modules/horarios/tiempo.js` | 229 | «La pieza de la que depende todo el módulo» |
| `src/modules/horarios/solver.js` | 418 | Generador **puro y determinista** |
| `src/modules/fichajes/schema.js` | 295 | Los invariantes legales |
| `src/integrations/agora/sync.js` | 73 | La sincronización, con `diasFaltantes()` pura |
| `src/modules/mantenimiento/maintenance.service.js` | 136 | ⭐ **El único servicio completo. El molde para refactorizar** |
| `public/fichar.js` | 903 | El kiosko |
| `tests/helpers/memdb.js` | — | Emulador PostgreSQL que sostiene los 3.373 tests |
| `CLAUDE.md` | — | **Léelo antes que nada.** Contiene las normas del proyecto |
| `docs/adr/0001-…` | — | La arquitectura multi-establecimiento objetivo |

---

# 35 · Tablas más importantes

`users` *(sobrecargada: cuenta + trabajador + kiosko)* · `reservas` · **`leads`** *(el CRM, global)* ·
`marketing_prefs` *(consentimiento RGPD, por teléfono)* · `facturas` + `factura_lineas` ·
**`fic_eventos`** *(inmutable, legal)* · `fic_bolsa_movimientos` *(append-only)* ·
`hor_asignaciones` *(el cuadrante)* · `rrhh_periodos` · `ventas_diarias` ·
`agora_locales` *(credenciales, cifrado roto)* · `campanas_wa` + `campana_envios` ·
`pro_qr` + `pro_canjes` · `cliente_metricas` · `config` *(clave-valor: tokens de Google, ajustes)*

---

# 36 · Endpoints más importantes

| Endpoint | Por qué |
|---|---|
| `POST /api/auth/login` :3774 | La puerta |
| `POST /api/reservas` :6922 | **Público, sin aforo, sin rate limit, dispara WhatsApp** |
| `POST /api/leads` :4124 | Público. Emite el cupón de bienvenida |
| `GET /api/fichar/:token` :10111 | El kiosko |
| `POST /api/fichar/:token/pin` :10183 | **El único sitio sin sesión que acepta un secreto** |
| `POST /api/fichar/:token/evento` :10246 | El fichaje |
| `GET /api/contactos` :13982 | La vista de Clientes (usa `sqlContactosUnificados`) |
| `POST /api/campanas/:id/enviar` | Envío masivo, irreversible |
| `POST /api/upload` :6894 | **Sin filtro, a directorio público** |
| `GET /api/dashboard` | Las narrativas |
| `GET /api/agora/ventas-vivo` | Habla con el TPV en vivo |
| `DELETE /api/users/:id` | Mitigado con `historicoLaboralDe` (10 tablas) |
| `POST /api/fichajes/reabrir` | Reabre nómina cerrada. Solo dirección |

---

# 37 · Flujos críticos

Los 17 flujos completos (actor → UI → endpoint → lógica → BD → integración → respuesta) están en
`25_FLUJOS_NEGOCIO.md`. Los cinco que hay que entender sí o sí:

1. **Fichaje** — el más robusto: token + PIN + ticket + cola offline + inmutabilidad
2. **Crear reserva** — el más frágil: público, sin aforo, sin rate limit, WhatsApp sin esperar
3. **Entrada de factura** — el más elaborado: 4 canales → ghostscript → Claude → 10 módulos → Sheets
4. **Sincronización de Ágora** — el mejor diseñado: idempotente con catch-up
5. **Cambio de permisos** — el más contraintuitivo: **tarda hasta 8 h en aplicarse** porque
   `modulos` viaja dentro del JWT

---

# 38 · Cosas que NO se deben romper

1. La inmutabilidad de `fic_eventos`, `fic_bolsa_movimientos` y `pro_canjes`
2. **Los tests de introspección** — son el sistema inmunitario del repositorio
3. **Los comentarios explicativos** — una reescritura que los pierda destruye más de lo que crea
4. `excluir_baja = 1` inyectado a la fuerza en `segmentoDelBody`
5. El tope diario y el jitter de WhatsApp
6. Que la hora del fichaje la ponga **el servidor**
7. Que `localPermitido()` **nunca** devuelva un local ajeno
8. Que la salida de la IA pase **siempre** por el mismo saneador que el formulario
9. Que el kiosko **no encole** canjes de cupón (los fichajes sí, los canjes no)
10. Que el kiosko **no muestre teléfonos**
11. Que «mirar» siga separado de «aplicar» en las operaciones destructivas
12. Que `dup_estado='duda'` saque la factura de **todos** los totales

---

# 39 · Incógnitas

**No determinables leyendo el código.** Las 28 completas en `30_PREGUNTAS_ABIERTAS.md`. Las críticas:

1. 🔴 **¿Está `APP_ENV=production` en los Secrets de Replit?** De ello depende que S2 sea un
   incidente o un no-problema.
2. 🔴 **¿`JWT_SECRET` es fuerte?**
3. 🔴 **¿El repositorio de GitHub es público?** Si lo es, `DEV_JWT_SECRET` es conocido.
4. 🔴 **¿Hay backups de la BD? ¿Se ha probado restaurarlos?**
5. 🟠 **¿Con qué frecuencia hay que reescanear el QR de WhatsApp? ¿Se pierden reservas mientras?**
6. 🟠 **¿Qué pasa cuando caduca un refresh token de Google?**
7. 🟠 **¿Cuántos registros hay en `leads`, `reservas`, `facturas`, `fic_eventos`?** Determina si los
   problemas de índices ya duelen.
8. 🟡 **¿Se usa el módulo de Inventarios de verdad?**
9. 🟡 **¿Cómo se gestiona hoy el aforo de reservas?**
10. 🟡 **¿Hay intención de vender esto a otros restaurantes?** Cambia toda la priorización.

---

# 40 · Contexto técnico para continuar

## Antes de tocar nada
1. **Leer `CLAUDE.md`** — normas del proyecto (español, sin dependencias nuevas, móvil obligatorio,
   `pull --rebase` antes de push, invariantes de fichajes)
2. **`npm test`** debe seguir dando **3.373 en verde**
3. `server.js` es de 16.722 líneas: **leer el rango antes de editar**, nunca a ciegas
4. **`node --check <fichero>`** antes de commitear cualquier `.js`

## Convenciones de la casa
- **Todo en español**: código, comentarios, tests, mensajes de commit
- **Lógica nueva → módulo puro en `src/modules/<dominio>/`**, sin Express ni DOM, recibiendo `x`
- **Esquema → `ensureSchema<Dominio>(x)` aditivo e idempotente**, cableado desde `initDB()`
- **PK `SERIAL` tonta + índice único aparte** (Replit no ordena PKs compuestas)
- **Tests con `node --test` + `tests/helpers/memdb.js`**, descripciones en español
- **Comentar el porqué**, sobre todo el bug que se está arreglando
- **Un módulo nuevo del panel toca 4 sitios**: `CATALOGO_MODULOS`, `MODULO_POR_RUTA`, `VIEW_ROLES`,
  `NAV`+`VIEWS` — **y hay un test que falla si falta alguno**
- **Interfaz a 1440×800 Y 390×844**, siempre

## Variables de entorno (15, ninguna documentada en `.env.example`)
`DATABASE_URL` · `JWT_SECRET` · `PORT` · `BASE_URL` · `PUBLIC_URL` · `ANTHROPIC_API_KEY` ·
`GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_DRIVE_CLIENT_ID` · `GOOGLE_DRIVE_CLIENT_SECRET` ·
`GOOGLE_PLACES_API_KEY` · `TEST_DATABASE_URL` · `REPL_ID` · `REPL_SLUG` · `REPLIT_DB_URL`
**Ausentes y críticas: `APP_ENV` / `NODE_ENV`.**

## Operativa
- **Cada redespliegue tira la sesión de WhatsApp** → hay que reescanear el QR. **Avisar siempre**
  antes de subir algo que reinicie el servidor
- Replit commitea a `main` → **`pull --rebase` antes de push, nunca `--force`**
- Login de prueba: `direccion` / `encargado`, contraseña `tapeta2024` *(deuda conocida)*
- `npm install` **no funciona en local**; `pg` **no está instalado** → el servidor no arranca en
  local. Se puede validar DDL con `psql` contra un Postgres local

## Cómo encontrar cosas
| Pregunta | Dónde |
|---|---|
| ¿Dónde está el endpoint X? | `grep -n 'app\..*"/api/X' server.js` |
| ¿Quién puede ver el módulo X? | `src/modules/usuarios/permisos.js` + espejo `public/panel/app.js:121` |
| ¿Cómo se define la tabla X? | `server.js:295-1650` o `src/modules/*/schema.js` |
| ¿Cómo se pinta la vista X? | `public/panel/app.js` → `renderX()`/`loadX()` |
| **¿Por qué está así?** | **El comentario de encima. Casi siempre está.** |
| ¿Qué invariante protege esto? | Los tests de introspección en `tests/*.test.js` |

## La regla que resume el proyecto

> El código de este repositorio no está escrito para ser bonito: está escrito para que dentro de dos
> años se entienda **por qué** se tomó cada decisión. Antes de cambiar algo que parezca raro, busca
> el comentario. Casi siempre explica el fallo real que ese código está evitando.
