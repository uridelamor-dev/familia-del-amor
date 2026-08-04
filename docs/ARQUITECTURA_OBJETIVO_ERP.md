# Arquitectura objetivo (fundación ERP)

> Cómo se construye **todo lo nuevo**. No reescribimos el monolito actual (`server.js`): lo **congelamos y clasificamos**, y cada funcionalidad nueva (o cada módulo que migremos por necesidad) sigue esta arquitectura. Objetivo: escalabilidad, mantenibilidad, seguridad, rendimiento, modularidad y facilidad de extensión, sin sobreingeniería.

## 1. Principio: clean architecture por capas

```
Feature (dominio)
  → API      (routes finas: validan entrada, llaman al servicio, formatean salida)
  → Servicio (lógica de negocio; NO conoce Express ni SQL)
  → Repositorio (acceso a datos: SQL/consultas; NO conoce reglas de negocio)
  → Base de datos
```

Reglas:
- **Nada de lógica de negocio en las rutas.** La ruta orquesta; el servicio decide.
- **Nada de SQL fuera de los repositorios.**
- El **servicio** es puro y testeable sin arrancar el servidor (clave para pruebas y para AI-ready).
- Sin `if (rol === "…")` en ningún sitio: la autorización se resuelve con el motor de permisos (`MODELO_MODULOS_Y_PERMISOS.md`).

## 2. Estructura de carpetas (objetivo)

```
src/
  core/
    db.js               # conexión + helpers (dbGet/dbAll/dbRun ya existentes, extraídos)
    auth.js             # verificación de JWT, req.user
    permissions.js      # motor de permisos efectivos + requirePermission()
    locations.js        # acceso por local: requireLocationAccess(), locales efectivos
    financial.js        # requireFinancialAccess()
    audit.js            # registro de auditoría (audit_log)
    flags.js            # feature flags (lectura/caché)
    config.js           # parámetros del sistema (get/set + versionado)
    errors.js           # manejador global de errores (forma {ok:false,error})
    validate.js         # validación de payloads (esquemas)
  modules/
    <dominio>/
      <dominio>.routes.js       # define endpoints, aplica middlewares de core
      <dominio>.service.js      # lógica de negocio
      <dominio>.repository.js   # SQL
      <dominio>.schema.js       # validación de entrada/salida
      <dominio>.actions.js      # (futuro) descripción de acciones para IA
```

El monolito `server.js` sigue funcionando; `src/` se monta como router(s) adicional(es). Migración **incremental**, módulo a módulo, empezando por uno de bajo riesgo (mantenimiento o comunicados) como plantilla de referencia.

## 3. Contrato de API (consistencia)

- Respuestas siempre `{ ok: true, data }` o `{ ok: false, error, code }`.
- Nombres y formas consistentes entre módulos (paginación, filtros, fechas ISO).
- Cada endpoint declara: **permiso requerido** (`modulo.accion`), si es **por local**, y si es **financiero**.
- Esta consistencia es la que permite el **rediseño visual futuro** (front nuevo consumiendo la misma API) — ver `VISION_DISENO_Y_FRONTEND.md`.

## 4. AI-ready (preparación, no implementación)

La **capa de servicios** es, por diseño, la superficie de acciones del ERP. Una IA futura no habla con rutas ni con SQL: invoca servicios.

- Cada módulo podrá exponer un `<dominio>.actions.js`: un **registro de acciones** (nombre, descripción, parámetros validados, permiso requerido) que mapea 1:1 a funciones del servicio.
- Ese registro sirve para: (a) un futuro *tool/function registry* para IA (como ya hace Sara con sus tools, pero generalizado), (b) documentación automática de la API.
- **Requisito de diseño hoy:** servicios sin efectos colaterales ocultos, entradas/salidas explícitas y validadas, y **toda acción sensible pasa por el motor de permisos y por auditoría**. Así una IA queda automáticamente acotada por permisos y auditada.

## 5. Parámetros y catálogos (no-hardcode)

Todo lo que hoy está hardcodeado y tiene sentido administrar se mueve a datos configurables (ver `VERSIONADO_CONFIGURACION.md` y `FEATURE_FLAGS.md`):
- `LOCALES` (whatsapp.js) → tabla `establecimientos`.
- JIDs de personas (Nerea/Silvia/Laura) y `group_jid` por local → config/`establecimientos`.
- Umbrales (p.ej. >8 personas, horarios de reserva) → parámetros del sistema.
De-hardcode **progresivo y no disruptivo**: primero coexisten valor en código y en BD (BD gana si existe), luego se retira el literal.

## 6. Rendimiento y datos

- SQLite es suficiente para el volumen actual; el patrón repositorio deja la puerta abierta a otro motor si algún día hace falta, sin tocar servicios.
- Índices en columnas de filtrado frecuente (`local`/`establecimiento_id`, fechas, teléfono) al introducir el modelo de datos.
- Cachés en memoria para feature flags y permisos efectivos (invalidación al cambiar).

## 7. Infraestructura desacoplada (portabilidad)

La arquitectura nueva debe poder migrar en el futuro a **Docker + PostgreSQL + cloud/VPS** sin reescribir la aplicación. **No** significa migrar ahora; significa que **ninguna decisión nueva lo impida**. Sin dependencias arquitectónicas de Replit.

- **BD tras el repositorio:** ningún servicio/ruta conoce SQLite; cambiar a Postgres = cambiar la implementación del repositorio. Evitar en el código nuevo features exclusivas de SQLite.
- **Sin acoplamiento al filesystem efímero:** datos persistentes (BD, sesión de WhatsApp, subidas) tras una abstracción de almacenamiento; nada crítico depende de `/home/runner`, `/tmp` ni de rutas absolutas de plataforma.
- **Scheduler portable:** tareas programadas como temporizadores propios o cron estándar, no mecanismos exclusivos de Replit.
- **Config y secretos por variables de entorno**, no valores de plataforma.
- **Sin suponer proceso único:** el diseño no debe romperse con varias instancias/procesos (evitar estado global en memoria como única fuente de verdad; cachés reconstruibles).
- **La infraestructura es sustituible sin reescribir la app.** Replit KV, rutas `/home/runner`, backups KV, etc. son detalles del monolito actual (clasificados, no borrados); el código nuevo se aísla de ellos mediante interfaces.

## 8. Single Source of Truth (fuente única de verdad)

Cada entidad tiene **una única fuente de verdad**; los datos derivados se **calculan o sincronizan** desde ella, nunca se duplican a mano.

- Entidades canónicas: `establecimientos`, `empresas` (jurídicas), `usuarios`, perfiles de `trabajadores`, `proveedores`, `clientes`, `reservas`, `productos`…
- **Fin del texto libre:** el establecimiento canónico es la tabla `establecimientos` (con `establecimiento_id`), no el string `local` repetido en 13 tablas (ver `MODELO_ACCESO_POR_LOCAL.md`).
- **Nada de sincronización manual** entre módulos: si un dato se necesita en dos sitios, se **referencia por id** o se **deriva** (por consulta o evento), no se copia.
- Los agregados (KPIs) son **derivados** de sus fuentes; se cachean, pero la verdad vive en las tablas de origen.

## 9. Modularidad real

Todo módulo nuevo debe ser:

- **Independiente y desacoplado:** sin dependencias directas de otros módulos (nada de que "reservas importe RRHH"). La comunicación entre dominios va por la **capa de servicios/API** o por **eventos** (cuando existan), nunca por acoplamiento directo.
- **Con permisos propios** (`modulo.accion`).
- **Con auditoría propia** (registra sus acciones sensibles).
- **Con API propia** (contrato JSON consistente).
- **Activable/desactivable por Feature Flag.**
- **Eliminable sin romper el resto:** apagar o quitar un módulo no debe tumbar a los demás.

Regla: si un módulo no se puede desactivar sin romper otro, están acoplados y hay que rediseñar la frontera.

## 10. Qué NO hacer (recordatorio)
- No migrar todo el monolito de golpe.
- No cambiar framework/BD/auth por gusto.
- No introducir capas o abstracciones que no resuelvan un problema real (sin sobreingeniería).
