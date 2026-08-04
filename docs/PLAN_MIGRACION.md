# Plan de migración

> Todas las migraciones son **aditivas y reversibles** (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`). Nunca `DROP`/`DELETE`/`RENAME`. Cada paso indica impacto, compatibilidad, rollback y recuperación de acceso. Se ejecutan **después del gate**, en commits separados.

## 0. Preparación (antes de cualquier migración)
- Rama separada (`fase-1-auditoria-erp`), sin tocar `main` hasta aprobar.
- Forzar backup KV + **copia local de `database.sqlite`**.
- Verificar que las pruebas baseline pasan.

## 1. Seguridad de bajo riesgo + durabilidad de WhatsApp (paso 4 — PRIORIDAD)
- **`JWT_SECRET` obligatorio:** si falta la env en prod, hoy usa fallback inseguro; se exige un secreto fuerte. Ventana transitoria que acepta el secreto actual mientras se define el nuevo; avisar antes de forzar. Rollback: fallback temporal + reponer env. Recuperación de acceso: `RIESGOS_Y_ROLLBACK.md` §3.
- **Otros fixes baratos y aislados:** rate-limit en login/rutas públicas, helmet, CORS restrictivo, límites/MIME en multer + proteger `/api/hr/applications`, manejador global de errores (dejar de filtrar `e.message`).
- **Durabilidad de la sesión de WhatsApp:** persistir `baileys_auth` en almacenamiento durable (fuera del filesystem efímero de Replit) para dejar de perder la sesión en cada redeploy. Es el mayor riesgo operativo del sistema y va tras una abstracción de almacenamiento (portable, `ARQUITECTURA_OBJETIVO_ERP.md` §7). Cambio aditivo; no toca la lógica de Baileys/Sara.

## 2. Núcleo `src/core` + módulo piloto (paso 5)
- **Aditivo:** nuevo código en `src/`, montado como router adicional; el monolito sigue sirviendo el resto.
- **Sin cambio de comportamiento:** el módulo piloto (mantenimiento o comunicados) responde igual que hoy; pruebas antes/después idénticas.
- **Rollback:** revert del commit del módulo.

## 3. Modelo de datos (paso 6)
Tablas nuevas (conviven con las columnas `local` actuales, que **no se tocan**):
```
empresas(id, nombre, cif, activo)
establecimientos(id, nombre, empresa_id, alias, activo, local_text UNIQUE)
user_locations(id, usuario_id, establecimiento_id, rol_local NULL, activo, desde, hasta)
role_templates(rol PK, permisos_json)
permisos(id, usuario_id, permiso, efecto, establecimiento_id NULL)   -- o permisos_json por usuario
feature_flags(clave PK, activo, ambito, establecimiento_id NULL, descripcion, actualizado_en, actualizado_por)
audit_log(id, ts, usuario_id, username, ip, user_agent, accion, entidad_tipo, entidad_id, establecimiento_id, valor_anterior_json, valor_nuevo_json, resultado)
config_versions(id, ambito, clave, valor_json, version, creado_en, creado_por, comentario)
```
Índices: `establecimientos.local_text`, `user_locations(usuario_id)`, `audit_log(ts, usuario_id, accion)`.

### Backfill (idempotente, verificable, con reconciliación estricta)
- **Paso 0 — reconciliación OBLIGATORIA:** verificar que todos los `local` de las 13 tablas casan con un establecimiento canónico; si alguno no casa, **fallar ruidosamente** y corregir el dato antes de seguir. Nunca asumir coincidencia de strings.
- `establecimientos` ← 7 filas de `LOCALES` (`whatsapp.js`).
- `empresas` ← `facturas_locales` (producción) + confirmación de Dirección.
- `user_locations` ← los **43 trabajadores** por su `users.local` (match exacto, ya reconciliado). Cuentas existentes en la migración → grandfather acotado; **usuarios nuevos = default-deny**.
- `role_templates` ← plantillas propuestas en `MODELO_MODULOS_Y_PERMISOS.md`.
- **Prioridad ALTA:** añadir `establecimiento_id` (FK) a las tablas con `local`, dejando `local_text` como puente temporal (Single Source of Truth).
- **Portabilidad:** las tablas y consultas nuevas evitan features exclusivas de SQLite para ser portables a PostgreSQL sin reescritura (`ARQUITECTURA_OBJETIVO_ERP.md` §7).
- **Rollback:** `DROP` de tablas nuevas (aisladas); columnas `local` intactas; datos originales sin tocar.

## 4. Motor de permisos (paso 7)
- **Detrás de feature flag** `permisos_v2`. Con flag OFF, todo funciona como hoy (autorización por rol).
- **Grandfather:** usuario sin `user_locations`/permisos → acceso como hoy; Dirección global.
- Aplicación **módulo a módulo** (empezando por lectura de reservas/mantenimiento), con pruebas de "no filtra de más ni de menos".
- **Rollback:** desactivar el flag → vuelve al comportamiento por rol, sin desplegar.

## 5. Pantalla de Administración (paso 8)
- Solo nuevos endpoints/pantalla; no altera datos existentes.
- Cambios de permisos **auditados** y **versionados** → restaurables.

## 6. De-hardcode progresivo (transversal)
- `LOCALES`, JIDs (Nerea/Silvia/Laura), `group_jid` por local, umbrales → a `establecimientos`/config.
- **Coexistencia:** el código lee primero de BD; si no hay valor, usa el literal actual. Luego se retira el literal. Sin ventana de rotura.

## 7. Orden y gates
Cada paso: migración → backfill → pruebas verdes → commit → (si aplica) activar flag. **No se avanza** si falla una prueba baseline, se desconecta WhatsApp, o una migración no es reversible.

**Orden de ejecución (revisado):** la **seguridad de bajo riesgo** (JWT fuerte, rate-limit, helmet, CORS, uploads/errores) y la **durabilidad de la sesión de WhatsApp** (persistir `baileys_auth` fuera del filesystem efímero) van **ANTES** del módulo piloto (ver `FASE_1_AUDITORIA_Y_PLAN.md` §5). La **arquitectura de eventos NO se construye** en Fase 1 (solo diseño). La autorización arranca por **rol + establecimiento**; la granularidad se añade solo ante casos reales.

## 8. Qué NO se migra en esta fase
Nada funcional: esta fase entrega **solo** documentación y pruebas. Las migraciones anteriores son el **diseño** a ejecutar tras la aprobación del gate.
