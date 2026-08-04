# Versionado de configuración

> Poder **restaurar configuraciones anteriores** de lo importante (permisos, usuarios, configuración, parámetros). Se diseña ahora; la implementación llega después del gate.

## 1. Qué se versiona
- **Permisos** (plantillas de rol y permisos por usuario).
- **Usuarios** (altas/bajas, rol, asignación de locales) — metadatos, nunca contraseñas.
- **Configuración de módulos** (p.ej. instrucciones de Sara, reglas de facturas, feature flags).
- **Parámetros del sistema** (umbrales, horarios, catálogos).

## 2. Modelo de datos (aditivo)
```
config_versions(id, ambito, clave, valor_json, version, creado_en, creado_por, comentario)
```
- Cada cambio de una config "importante" crea una **nueva versión** (append-only); la actual es la de mayor `version`.
- `ambito` distingue permisos / usuarios / config-módulo / parámetros.
- No se sobrescribe: restaurar = escribir una nueva versión con el `valor_json` de una anterior (queda traza).

## 3. Operaciones
- **Ver historial** de una clave (quién, cuándo, comentario).
- **Comparar** dos versiones (diff).
- **Restaurar** una versión anterior (crea versión nueva idéntica a la elegida).
- Todo esto es una **acción auditada** (`AUDITORIA_PROFESIONAL.md`).

## 4. Relación con los backups existentes
- Distinto de los backups Replit-KV (que son copia de la BD completa/por tabla para supervivencia entre redeploys). El versionado es **funcional**: historial y restauración a nivel de configuración, desde el panel.
- Ambos coexisten: KV protege ante pérdida de infraestructura; `config_versions` permite "deshacer" un cambio de negocio.

## 5. Alcance en esta fase
Solo **diseño** (este documento) + reservar el modelo en `PLAN_MIGRACION.md`. No se implementa todavía.
