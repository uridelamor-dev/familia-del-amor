# Riesgos y plan de rollback

> Principio: **cada cambio debe ser reversible**. Ninguna migración destructiva. Los flujos críticos (WhatsApp/Sara/reservas) no se tocan sin pruebas verdes y rollback preparado.

## 1. Salvaguardas transversales

- **Rama de trabajo separada** (`fase-1-auditoria-erp`); `main` (compartido con Replit) no se toca hasta aprobar.
- **Backups Replit-KV** existentes: BD completa (`latapeta_db_v3`), config (`latapeta_critical_config_v2`), leads (`latapeta_leads_v1`), usuarios (`latapeta_users_v1`). Antes de cualquier migración, forzar backup y **exportar copia local** de `database.sqlite`.
- **Migraciones aditivas**: solo `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ADD COLUMN`. Nunca `DROP`/`DELETE`/`RENAME`/`ALTER … DROP`. Cada migración con su reverso documentado.
- **Feature flags**: la lógica nueva (permisos, aislamiento) se activa detrás de flag → se puede **desactivar sin desplegar** si algo falla.
- **Gate de pruebas**: no se hace merge si fallan las baseline de reservas/WhatsApp.

## 2. Riesgos por cambio y su rollback

| Cambio (paso) | Riesgo | Mitigación | Rollback |
|---|---|---|---|
| Test-mode flag (esta fase) | Alterar arranque en prod | Flag ausente en prod = comportamiento idéntico; aislado en su commit | Revertir el commit; el flag sin definir no hace nada |
| Núcleo `src/core` + piloto (4) | Regresión en el módulo migrado | Migrar módulo de bajo riesgo (mantenimiento/comunicados); pruebas antes/después iguales | Revert del commit del módulo; el resto del monolito intacto |
| `JWT_SECRET` obligatorio (5) | Dejar fuera a usuarios logueados / caída si falta la env | Definir la env **antes** de desplegar; ventana de compatibilidad que acepta el secreto viejo temporalmente; documentar recuperación de acceso | Revertir a fallback temporal + reponer env |
| rate-limit / helmet / CORS (5) | Bloqueos falsos, CORS roto | Límites holgados al inicio; CORS con allowlist propia; probar login y panel | Revertir middleware; son `app.use` aislados |
| multer límites/MIME + proteger `/api/hr/applications` (5) | Rechazar CVs legítimos; romper formulario público de empleo | Límites razonables (p.ej. 10 MB, PDF/imagen); mantener endpoint funcional con auth/anti-abuso, sin cambiar la web pública | Revertir config de multer |
| Manejador global de errores (5) | Cambiar formato de respuestas de error | Mantener forma `{ok:false,error}` para el cliente; dejar de filtrar internos | Revertir middleware |
| Modelo de datos nuevo (6) | Desalineación de strings de `local`; datos huérfanos | Tablas nuevas conviven con columnas `local` actuales (no se tocan); backfill idempotente y verificable | `DROP` de tablas nuevas (vacías/aisladas); columnas `local` intactas |
| Motor de permisos (7) | Dejar a alguien sin acceso (lockout) | **Grandfather**: sin asignaciones = acceso total como hoy; Dirección siempre con acceso global; activación por flag | Desactivar flag → vuelve al comportamiento por rol |
| Filtrado por local en queries (7) | Ocultar datos que antes se veían | Aplicar por módulo, con pruebas de "no filtra de más ni de menos"; primero en modo observación si hace falta | Revertir por módulo; flag global de bypass |
| Pantalla Administración (8) | Cambios de permisos erróneos | Versionado de config (restaurar estado anterior); auditoría de cada cambio | Restaurar snapshot de permisos |
| Menú/filtros por permisos (9) | Ocultar secciones necesarias | Grandfather + Dirección ve todo; validación con usuarios reales | Revertir front; backend no depende del menú |
| Dashboard ejecutivo (10) | Mostrar datos incorrectos | Solo datos existentes y fiables; nada de ventas/costes | Revertir vista; sin impacto en datos |

## 3. Procedimiento de recuperación de acceso (si un cambio de auth deja fuera a Dirección)
1. Acceso al servidor (Replit) y a la BD.
2. Reponer/definir `JWT_SECRET` correcto en el entorno.
3. Si hace falta, resetear contraseña de un usuario `direccion` por script (`bcrypt.hash`) directamente en `users`.
4. `restoreUsers()`/backup KV como red adicional.

## 4. Señales de parada (abortar y revertir)
- No compila / `node --check` falla.
- Falla cualquier prueba **baseline** de reservas o WhatsApp.
- WhatsApp se desconecta por un cambio nuestro.
- Una reserva no se crea/modifica/cancela o no notifica al grupo correcto.
- Aparece riesgo de pérdida de datos o una migración resulta no reversible.
