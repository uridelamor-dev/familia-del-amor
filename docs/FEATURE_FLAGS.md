# Feature flags (activación de módulos e integraciones)

> Poder **encender/apagar módulos e integraciones sin desplegar código**. Se diseña ahora la arquitectura; la activación real y la UI llegan después del gate.

## 1. Qué gobierna un flag
- **Módulos del ERP:** `reservas`, `rrhh`, `marketing`, `facturacion`, `contabilidad`, `mantenimiento`, `kpis`, `ia`, …
- **Integraciones externas:** `facturas_ia`, `google_business`, `agora`, `skello`, `haddock`, …

Ejemplo del estado objetivo:

| Flag | Estado |
|---|---|
| reservas | ON |
| whatsapp / sara | ON |
| facturas_ia | ON |
| rrhh | ON/OFF (según preparación) |
| marketing | ON |
| google_business | ON |
| ia (asistente transversal) | OFF |
| agora / skello / haddock | OFF |

## 2. Modelo de datos (aditivo)

```
feature_flags(clave PK, activo, ambito ENUM(global, establecimiento),
              establecimiento_id NULL, descripcion, actualizado_en, actualizado_por)
```
- `ambito=global` → afecta a todo el grupo.
- `ambito=establecimiento` → activar un módulo/integración **solo en ciertos locales** (p.ej. Ágora en un restaurante que ya lo tiene).

## 3. Comportamiento
- Un módulo con flag **OFF**: sus endpoints responden `404/403 "módulo no disponible"` y **no aparece en el menú** (el front pregunta los flags al cargar). No se borra código ni datos.
- Los flags se leen con **caché en memoria** e invalidación al cambiar.
- Cambiar un flag es una **acción auditada** y **versionada** (ver `AUDITORIA_PROFESIONAL.md`, `VERSIONADO_CONFIGURACION.md`).

## 4. Relación con permisos
Flag y permiso son ortogonales y **ambos** deben permitir:
```
acceso = flag(módulo).activo  AND  usuario.tiene(permiso)  AND  acceso_local
```
El flag dice "este módulo existe/está disponible"; el permiso dice "este usuario puede usarlo".

## 5. Administrable desde Dirección
Dirección podrá activar/desactivar módulos e integraciones (global o por establecimiento) desde la pantalla de Administración, sin tocar código. Para integraciones OFF (Ágora/Skello/Haddock) el flag existe pero no se piden credenciales todavía (ver `ARQUITECTURA_OBJETIVO_ERP.md` y el doc de integraciones futuras).
