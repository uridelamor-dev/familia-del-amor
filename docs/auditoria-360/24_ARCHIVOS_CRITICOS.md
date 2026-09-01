# 24 · Riesgo por archivo

| Archivo | Líneas | Responsabilidad | Criticidad | Complejidad | Acoplamiento | **Riesgo** | Motivo | Recomendación |
|---|---:|---|---|---|---|---|---|---|
| `server.js` | 16.722 | 350 rutas, esquema, cron, IA, cifrado, rate limit | **Máxima** | Muy alta | **Máximo** (importa de 60+ sitios) | 🔴🔴 | Un fallo aquí tumba todo. Cualquier cambio de cualquier dominio lo toca | Extraer por dominio a routers, empezando por facturas (83 rutas) |
| `public/panel/app.js` | 12.351 | 24 vistas, 61 globales, router, estado | **Alta** | Muy alta | Alto (espejo del backend) | 🔴🔴 | Todo el panel en un fichero sin módulos ES | Dividir por vista cuando se pueda usar `type="module"` |
| `whatsapp.js` | 1.260 | Baileys, Sara, envíos, reconexión | **Máxima** | Alta | Alto (18 callbacks) | 🔴 | Dependencia no oficial en RC; caída = sin reservas, sin marketing, sin Sara | Canal de respaldo (email). Tests de la capa de envío |
| `facturas.js` | 1.465 | Pipeline + Drive + Sheets + Gmail | **Alta** | Alta | Alto (3 APIs Google + BD) | 🔴 | Segundo monolito. Toca dinero y contabilidad | Separar transporte (Google) de pipeline |
| `security.js` | ~250 | JWT, uploads CV, errorHandler | **Máxima** | Baja | Bajo | 🔴 | **Contiene el bug §7.1 y la decisión §7.2**. Poco código, consecuencias enormes | Corregir §7.1; invertir el defecto de `isProduction` |
| `src/modules/facturas/pdf-texto.js` | 784 | Extracción de texto de PDF | Media | **Muy alta** | Bajo | 🟠 | Parseo de formato binario; fallo silencioso = factura mal leída | Ya tiene tests. Añadir corpus de PDFs reales |
| `src/modules/horarios/solver.js` | 418 | Generador de cuadrantes | Media | **Muy alta** | Medio | 🟠 | Algoritmo complejo | ✅ 679 líneas de test. **Bien cubierto** |
| `src/modules/dashboard/dashboard.service.js` | 415 | Narrativas del dashboard | Media | Media | Medio | 🟠 | **Produce HTML confiable sin contrato explícito** (§7 nota) | Marcar el contrato + test de escapado |
| `src/db/establecimientos.migration.js` | 197 | Esquema V2 | Baja **hoy** | Media | Bajo | 🟡 | Código apagado que envejece | Activar `PERMISOS_V2` o retirarlo |
| `src/modules/fichajes/schema.js` | 295 | 8 tablas + invariantes legales | **Alta** | Media | Bajo | 🟡 | Obligación legal | ✅ Blindado con tests. **No tocar sin leer los comentarios** |
| `public/fichar.js` | 903 | Kiosko | **Alta** | Media | Bajo | 🟡 | Si falla, nadie ficha | ✅ Bien construido. Sin tests de ejecución |
| `public/{direccion,marketing,rrhh,…}.js` | ~3.400 | 🧟 Paneles legacy | Nula | Media | Bajo | 🟠 | **Servidos públicamente, sin `esc()`, sin mantenimiento** | **Borrar** |
| `public/erp-preview/` | 793 | 🧟 Prototipo | Nula | Baja | Nulo | 🟡 | Confunde; se sirve | **Borrar** |
| `src/modules/promos/promos.js` | 260 | Cupones y carnés | Media | Baja | Bajo | 🟢 | Nuevo, puro, 34 tests | — |
| `src/modules/usuarios/permisos.js` | 183 | **El modelo de permisos** | **Máxima** | Media | Alto (espejo en front) | 🟠 | 183 líneas que deciden quién ve qué. **Contiene el bug del prefijo `/api/mantenimiento`** | Test que valide roles, no solo presencia |
| `src/modules/messaging/queue.js` | 134 | Anti-baneo, opt-in, variables | **Máxima** | Baja | Bajo | 🟡 | Un fallo aquí = escribir a quien pidió no recibir, o quemar el número | ✅ Puro y testeado |

## Los que concentran demasiada responsabilidad

1. **`server.js`** — es literalmente todo el backend.
2. **`users`** (tabla) — cuenta de acceso + ficha de trabajador + credencial de kiosko + ámbito de
   local, todo en una fila. Un `DELETE` requiere revisar 10 tablas a mano (`historicoLaboralDe`).
3. **`public/panel/app.js`** — es literalmente todo el frontend interno.
4. **El número de WhatsApp** — reservas + marketing + Sara + alertas internas. Un baneo lo tumba todo.
5. **`JWT_SECRET`** — firma los JWT **y** los tickets del kiosko **y** (mal) deriva la clave de Ágora.
