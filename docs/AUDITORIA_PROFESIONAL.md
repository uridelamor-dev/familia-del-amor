# Auditoría profesional de acciones

> No basta un `audit_log` básico. Cada acción importante debe quedar registrada con contexto suficiente para responder **quién, qué, cuándo, desde dónde y qué cambió** — sin almacenar secretos ni conversaciones completas.

## 1. Qué se registra por evento

| Campo | Descripción |
|---|---|
| `id` | PK |
| `ts` | Fecha/hora (ISO, UTC) |
| `usuario_id` / `username` | Quién (la cuenta usada) |
| `ip` | IP de origen (respetando proxy de Replit, `X-Forwarded-For`) |
| `user_agent` | Navegador/dispositivo |
| `accion` | Código de acción (`reservas.editar`, `permisos.cambiar`, `login`, …) |
| `entidad` | Tipo + id del recurso afectado (p.ej. `reserva:123`) |
| `establecimiento_id` | Contexto de local, si aplica |
| `valor_anterior` | Estado previo (JSON redactado) |
| `valor_nuevo` | Estado nuevo (JSON redactado) |
| `resultado` | `ok` / `denegado` / `error` |

## 2. Acciones auditadas (mínimo)
- Inicio de sesión (y **denegaciones/403**).
- Creación/edición/baja de **usuarios**.
- Cambios de **rol**, **permisos** y **asignación de establecimientos**.
- **Acceso a información financiera**.
- **Reservas**: crear / modificar / cancelar.
- **Respuesta manual por WhatsApp**.
- Cambios de **configuración de Sara**.
- **Exportación de clientes** (CSV).
- **Factura marcada como pagada**.
- **Descarga de documentos**.
- Cambios de **feature flags** y **parámetros del sistema**.

## 3. Política de redacción (qué NO se guarda)
- **Nunca**: contraseñas, hashes, tokens, secretos/credenciales, documentos completos, ni conversaciones completas de WhatsApp.
- En `valor_anterior/nuevo`: solo los **campos relevantes** del cambio (diff), con PII minimizada (p.ej. teléfono parcial cuando el evento no lo requiere completo).
- Los mensajes de WhatsApp siguen en `whatsapp_messages` (su almacén), **no** se duplican en auditoría.

## 4. Modelo de datos (aditivo)
```
audit_log(id, ts, usuario_id, username, ip, user_agent,
          accion, entidad_tipo, entidad_id, establecimiento_id,
          valor_anterior_json, valor_nuevo_json, resultado)
```
Índices por `ts`, `usuario_id`, `accion`, `entidad_tipo+entidad_id`.

## 5. Integración con la arquitectura
- Se registra desde la **capa de servicios** (helper `core/audit.js`), no desde el front.
- El motor de permisos llama a auditoría en cada **denegación** de accesos sensibles.
- Como una IA futura opera a través de los mismos servicios, sus acciones quedan **auditadas automáticamente**.

## 6. Consulta y retención
- Pantalla de Dirección para consultar/filtrar el log (por usuario, acción, entidad, fecha, establecimiento).
- Política de retención configurable (parámetro del sistema); no se borra sin registro.
