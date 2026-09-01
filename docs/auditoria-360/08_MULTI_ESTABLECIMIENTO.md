# 08 · Aislamiento entre establecimientos

## Los 6 establecimientos (`server.js:3732`, `INV_LOCALES`)

`La Tapeta - Blanes` · `La Tapeta - Lloret` · `La Tapeta - Girona` · `Can Mateu - Tordera` ·
`La Tapa Ibérica - Tordera` · `Botiga d'en Mateu - Tordera` · `Oficina`

`LOCALES_SIN_PUBLICO = {"Oficina"}` — tiene personal, facturas e incidencias, pero no reservas ni
ventas de TPV ni inventario.

## Dos modelos conviviendo (HECHO)

### Modelo A — el que está en producción: **texto libre**

El discriminante es la **columna `local TEXT`**, con el nombre del establecimiento escrito. Aparece
en ~27 tablas. `WHERE local = ?` se escribe a mano en cada consulta (~190 según el comentario de
`server.js:60`).

### Modelo B — el diseñado y **desactivado**: `establecimiento_id`

`src/db/establecimientos.migration.js` crea `empresas`, `establecimientos`, `user_locations`,
`legacy_access`, `migration_state`. `src/core/access.js` implementa `buildAccessContext`,
`canAccessEstablecimiento`, `authorizeEstablecimiento` con precedencia
`global → assigned → legacy → none`, **default-deny** y **fail-closed** ante error real de BD
(distingue «tabla ausente» `42P01` de un fallo genuino).

**Está detrás del flag `PERMISOS_V2`** (`src/core/flags.js`), que solo se activa si la variable de
entorno vale exactamente `"true"`. **Hoy está apagado.** Ver `docs/adr/0001-arquitectura-multi-establecimiento.md`.

⚠️ **INFERENCIA**: hay una arquitectura correcta, escrita y testeada (`tests/core/access.test.js`),
que **no se está usando**. Es la deuda estructural más grande y más barata de saldar del sistema.

## Cómo se decide el local actual

```
Petición → localScope(req, pedido)              server.js:3701
            └→ localPermitido(user, pedido)     usuarios/locales.js
                 · Sin `local` en el token y rol global → null (sin restricción)
                 · Con `local` → si el pedido es SUYO, ese; si no, EL SUYO
```

✅ **HECHO COMPROBADO**: **el local nunca sale del cuerpo de la petición**. Sale del token (firmado)
o de `?local=` validado contra los locales del usuario. Un encargado que ponga
`?local=La Tapeta - Girona` recibe **su** local, no el pedido — **silenciosamente, no con un error**.

**INFERENCIA sobre esa decisión**: devolver el propio en vez de un 403 evita romper la interfaz,
pero también **oculta** un intento de acceso indebido. No queda registrado en ningún sitio.

### Centros: dos barras, un negocio
`src/modules/locales/centros.js` — Blanes y la Cooperativa son un mismo centro **para personal**
(fichajes, horarios) y barras separadas **para ventas**. `ambitoDeRuta(path)` decide cuál aplicar.
Es una sutileza de negocio real, bien modelada y con tests.

## Qué datos son globales y cuáles locales

| Ámbito | Tablas / módulos |
|---|---|
| **Por local** | `reservas`, `facturas`, `maintenance_issues`, `google_reviews`, `ventas_diarias`, `agora_cache`, `inv_*`, `hor_*`, `fic_*`, `rrhh_periodos`, `users`, `announcements`, `hr_jobs`, `hr_applications` |
| **Globales (por diseño)** | `leads`, `marketing_prefs`, `cliente_metricas`, `cliente_hechos`, `whatsapp_messages`, `campanas_wa`*, `pro_promociones`, `pro_qr`, `contents`, `config` |

\* `campanas_wa` tiene `local` pero el módulo `campanas` es `porLocal: false`: el local es un
**filtro de la campaña**, no el ámbito de quien la gestiona.

✅ **HECHO COMPROBADO**: `leads` y `marketing_prefs` **no tienen columna `local`** (verificado
leyendo su `CREATE TABLE`). Los módulos `clientes`, `campanas`, `promos`, `web`, `sara`, `whatsapp`
están marcados `porLocal: false` en `CATALOGO_MODULOS`.

**No es un fallo: es coherente.** La base de clientes es del grupo, y solo `direccion` y `marketing`
la ven. Pero **es la decisión que rompería una franquicia**, y conviene saberlo antes de venderla.

## ¿Puede Blanes ver Lloret? Pruebas conceptuales

| Vector | Resultado | Evidencia |
|---|---|---|
| `?local=` de otro establecimiento | ❌ Bloqueado | `localPermitido()`; tests `e2e-aislamiento.test.js`, `rrhh-aislamiento-local.test.js` |
| `local` en el body | ❌ No se lee de ahí | El scope viene del token |
| Manipular el JWT | ❌ Firmado | Salvo que el secreto sea el de desarrollo → ver `07_SEGURIDAD.md` §2 |
| Endpoint que olvide filtrar | ⚠️ **Posible** | El filtro es **manual en ~190 consultas**. No hay red de seguridad estructural |
| Datos de cliente entre locales | ⚠️ **Sí, por diseño** | El CRM es global. Solo dirección y marketing acceden |
| Un encargado ve la nómina de otro local | ❌ Bloqueado | `rrhhPuedeLocal(req, wl)` en RR.HH.; documentos `sensible` vetados al encargado |

### 🟡 El riesgo estructural real

**No es que hoy haya una fuga. Es que nada la impide mañana.**

El aislamiento depende de que **cada nueva consulta se acuerde de escribir `WHERE local = ?`**. No
hay Row-Level Security de PostgreSQL, ni una capa de repositorio que lo inyecte, ni un test genérico
que recorra los endpoints comprobándolo. Los tests de aislamiento existentes cubren **casos
concretos** (`e2e-aislamiento`, `rrhh-aislamiento-local`, `subir-factura-permisos`), no la regla.

**Con 350 endpoints y un solo fichero de 16.722 líneas, la probabilidad de que uno se olvide crece
con cada funcionalidad.**

**RECOMENDACIONES** (por orden de coste creciente):
1. Test de introspección que liste los endpoints con `local` en su SQL y falle si aparece uno nuevo
   que consulta una tabla con `local` sin filtrarla. Barato y en el estilo de la casa.
2. Activar `PERMISOS_V2` — ya está escrito y probado.
3. Row-Level Security en PostgreSQL para las tablas por local. Es la única defensa que no depende
   de que nadie se olvide.

## Columnas de local ausentes donde podrían hacer falta

| Tabla | Falta | Impacto |
|---|---|---|
| `factura_lineas` | `local` | Se hereda de `facturas` vía join. **Aceptable** |
| `inv_lineas`, `inv_pedido_lineas` | `local` | Heredado del padre. **Aceptable** |
| `hor_contratos`, `hor_disponibilidad`, `hor_worker_areas` | `local` | Se derivan del trabajador. **Aceptable**, pero un trabajador que cambia de local arrastra su historial |
| `hr_documentos` | `local` | Se resuelve con `rrhhWorkerLocal(doc.worker_id)` en cada acceso — **N+1 y dependiente de que nadie lo olvide** |
| `pro_promociones`, `pro_qr` | `local` | `pro_promociones.locales` es una **lista de texto**, no una FK. Funciona, pero no se puede consultar «promociones de Blanes» con un índice |
