# Plan de pruebas de regresión

> Red de seguridad **antes** de modificar nada funcional. Las pruebas **baseline** de reservas y WhatsApp deben pasar en verde; si fallan, se detiene el trabajo. Las de permisos/locales describen el **objetivo** (rojas hoy, verdes tras los pasos 6-7).

## 1. Herramientas
- **`node:test`** (runner integrado de Node, sin dependencia extra de framework).
- **`supertest`** para pruebas de endpoints HTTP (devDependency).
- **`@playwright/test`** para flujos críticos del panel (devDependency).
- Script `test` en `package.json` (hoy no existe ninguno).
- **BD temporal** por test (fichero SQLite en carpeta temporal), nunca `database.sqlite` real.

## 2. Aislamiento del test-mode (crítico)
`TAPETA_TEST_MODE`:
- Solo se define en el entorno de pruebas; en producción va **ausente**.
- Su único efecto (cuando está activa) es **no arrancar** WhatsApp/Baileys ni los cron, para poder testear contra BD temporal.
- **No cambia el comportamiento de producción, no toca WhatsApp/Sara/reservas, no introduce riesgo.** Se aísla en su propio commit.
- Preferencia: las pruebas de lógica atacan la **capa de servicios/repositorios** (sin efectos de arranque), reduciendo aún más la superficie.

## 3. Reservas — BASELINE (deben pasar hoy)
1. Crear reserva normal → fila en `reservas` con los campos correctos.
2. Reserva de **>8 personas** → `pendiente=true`, mensaje/aviso de pendiente.
3. Elegir **establecimiento** (cada `local` válido).
4. Elegir **zona** (terraza/interior) solo en Blanes×2 y Lloret; resto `indiferente`.
5. **Fecha bloqueada** (`bloqueos_reservas`) → no se registra; motivo devuelto.
6. **Modificar** reserva (2→4 personas, hora, día, zona) → `UPDATE`, **misma fila** (no borra).
7. **Cancelar** → `DELETE`, fila eliminada.
8. **Conservar datos del cliente** (`wa_clientes`/lead) al reservar.
9. **Confirmación** al cliente construida correctamente.
10. **Notificar solo al grupo correcto** (`wa_links` del local) y **a ningún otro**.
11. **Follow-up** programado (+1 día 11:00) solo en confirmadas.
12. **Evitar duplicados** de notificación (cola `pending_whatsapp` si WA caído).

Nivel: unit sobre lógica pura de `whatsapp.js` (schemas de tools, `lineaZona`, formato de teléfono, diff de `modificar_reserva`) + integración replicando el handler contra BD temporal.

## 4. WhatsApp — BASELINE (socket mockeado)
Recibir mensaje · responder · mantener historial (`whatsapp_messages`) · identificar cliente · teléfono internacional (formato JID) · enviar PDF · enviar imagen · reconocer grupo · gestionar error temporal · no duplicar mensajes · conservar sesión cuando la infra lo permite. **Nunca** contra la sesión real.

## 5. Permisos / locales — SPEC OBJETIVO (rojas hoy)
- Encargado de Blanes ve **solo** Blanes.
- Encargado de Lloret ve **solo** Lloret.
- Trabajador de Blanes **no** ve Girona.
- Trabajador **no** ve facturación.
- Usuario sin permiso → **403**.
- Manipular `local`/`establecimiento_id` en query/body **no** da acceso a otro local.
- **Dirección** ve todos los establecimientos.
- Usuario con **dos locales** ve solo esos dos.
- Datos **financieros** denegados sin permiso explícito.

Estas pruebas se escriben ahora como especificación (se marcan como pendientes/`todo`) y pasarán a verde cuando aterrice el motor de permisos (pasos 6-7).

## 6. Playwright (flujos de panel, cuando existan cambios de auth)
- Login por rol → aterriza en su panel.
- Encargado no ve secciones/datos de otro local.
- Dirección → Administración: asignar local a un usuario y comprobar el efecto.
- "Permiso denegado" se muestra correctamente.

## 7. Criterio de ejecución
- `npm test` → **verde en baseline** (reservas + WhatsApp). Las de permisos quedan como spec pendiente.
- Se ejecuta antes y después de cada cambio funcional futuro para probar **no regresión**.
