# Plan de migración

> Todas las migraciones son **aditivas y reversibles** (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`). Nunca `DROP`/`DELETE`/`RENAME`. Cada paso indica impacto, compatibilidad, rollback y recuperación de acceso. Se ejecutan **después del gate**, en commits separados.

## 0. Preparación (antes de cualquier migración)
- Rama separada (`fase-1-auditoria-erp`), sin tocar `main` hasta aprobar.
- Forzar backup KV + **copia local de `database.sqlite`**.
- Verificar que las pruebas baseline pasan.

## 1. Seguridad — `JWT_SECRET` obligatorio (paso 5)
- **Impacto:** si falta la env en prod, hoy usa fallback inseguro; queremos exigirla.
- **Compatibilidad:** ventana transitoria que acepta el secreto actual mientras se define el nuevo; avisar antes de forzar.
- **Rollback:** revertir a fallback temporal + reponer env.
- **Recuperación de acceso:** ver `RIESGOS_Y_ROLLBACK.md` §3 (resetear contraseña de un `direccion` por script).

## 2. Núcleo `src/core` + módulo piloto (paso 4)
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

### Backfill (idempotente, verificable)
- `establecimientos` ← 7 filas de `LOCALES` (`whatsapp.js`).
- `empresas` ← `facturas_locales` (producción) + confirmación de Dirección.
- `user_locations` ← los **43 trabajadores** por su `users.local` (match por `local_text`).
- `role_templates` ← plantillas propuestas en `MODELO_MODULOS_Y_PERMISOS.md`.
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

## 8. Qué NO se migra en esta fase
Nada funcional: esta fase entrega **solo** documentación y pruebas. Las migraciones anteriores son el **diseño** a ejecutar tras la aprobación del gate.
