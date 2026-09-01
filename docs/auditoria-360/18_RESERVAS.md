# 18 · Reservas

## Endpoints (6 + 1 público de perfil)

| Método | Ruta | Línea | Auth |
|---|---|---|---|
| POST | `/api/reservas` | 6922 | **PÚBLICO** |
| POST | `/api/reservas/:id/perfil` | 4217 | **PÚBLICO** |
| GET | `/api/reservas` | 7003 | dirección, encargado |
| DELETE | `/api/reservas/:id` | 7031 | encargado, dirección |
| GET | `/api/reservas/export.csv` | 7050 | dirección, encargado, contabilidad |
| GET | `/api/reservas/seguimiento` | 13790 | dirección, marketing, encargado |

Módulos: `src/modules/reservas/{agenda,kiosco,modificacion,seguimiento}.js` (495 líneas).

## Flujo completo

```
CLIENTE
  ├─ Web: formulario de reserva (public/index.html + app.js)
  └─ WhatsApp: conversación con Sara → tool-use → setOnReserva()
       ↓
POST /api/reservas   ⚠️ PÚBLICO, SIN RATE LIMIT
       ↓
  1. estaBloqueado(local, dia)?  → 409 con motivo   [bloqueos_reservas]
  2. INSERT INTO reservas (local, personas, dia, hora, telefono, nombre_reserva, creado_en)
  3. if (isReady()):
       · sendConfirmacionCliente / sendConfirmacionPendienteCliente  → al cliente
       · sendNotificacionGrupo / …Pendiente                          → al grupo del local
  4. upsertLead(...) → el cliente entra en el CRM
       ↓
PANEL (vista Reservas): agenda, edición, cancelación
       ↓
CANCELACIÓN → DELETE → sendCancelacionCliente + sendCancelacionGrupo
MODIFICACIÓN → modificacion.js (cambiosDe, validarModificacion, quedaPendiente)
             → sendModificacionGrupo
       ↓
DÍA SIGUIENTE → setInterval → reservas/seguimiento.js
   · puedePreguntarse() / siguesATiempo()
   · «¿Qué tal fue?» por WhatsApp
   · clasificarRespuesta() → CONTENTO / DESCONTENTO
   · enlaceResena() SOLO a quien salió contento         ✅ decisión muy fina
       ↓
KIOSKO → resumenDelDia() (reservas/kiosco.js) → se ven en la tablet ANTES del PIN
```

## 🔴 Hallazgo principal: no hay control de aforo ni de disponibilidad

**HECHO COMPROBADO**: `POST /api/reservas` comprueba **únicamente** `estaBloqueado(local, dia)` y
después inserta. Búsqueda de `aforo|capacidad|max_personas|plazas|disponibilidad` en el contexto de
reservas → **0 resultados**.

**Consecuencias**:
- **No hay límite de reservas por franja horaria.** 40 personas a las 21:00 en un local de 30 se
  aceptan sin avisar.
- **No hay mesas ni turnos** como entidad. `reservas` tiene `personas`, `dia`, `hora` y poco más.
- **No hay «doble reserva»** en el sentido clásico porque **no hay recurso que reservar**: no se
  puede solapar algo que no existe.
- La disponibilidad la gestiona **una persona mirando la agenda**, no el sistema.

**INFERENCIA**: es coherente con un negocio de tapas donde se rota mucho y se acepta casi todo. Pero
es **la mayor carencia funcional del sistema** si se quiere que las reservas se gestionen solas, y
es lo primero que preguntaría cualquiera que comparase con un CoverManager o un TheFork.

## Otros riesgos

| # | Riesgo | Sev. | Detalle |
|---|---|---|---|
| 1 | **Sin aforo** (arriba) | 🔴 | |
| 2 | **`POST /api/reservas` público sin rate limit** | 🟠 | Cada reserva **dispara 2 mensajes de WhatsApp**. Un bucle automatizado puede llenar la agenda y quemar el número. `pulsoRateLimit` ya existe y no se aplica aquí |
| 3 | **`POST /api/reservas/:id/perfil` público** | 🟡 | Requiere adivinar un `id` secuencial. Un `id` es enumerable → **INFERENCIA**: se podría sobrescribir el perfil de reservas ajenas. Habría que ver qué campos toca |
| 4 | **Los envíos de WhatsApp no se esperan** (`if (isReady()) send…` sin `await`) | 🟡 | Si falla, el cliente cree que está confirmada. No hay reintento ni registro del fallo |
| 5 | **Sin transacción** entre el INSERT y `upsertLead` | 🟡 | Reserva sin lead si algo falla en medio |
| 6 | **Race condition teórica** | 🟢 | Sin aforo, no hay condición de carrera que perder |
| 7 | Toda confirmación depende de WhatsApp | 🟠 | Ver `15_WHATSAPP.md` |

## Lo que está bien

- **`bloqueos_reservas`** con motivo, y el mensaje al cliente lo incluye.
- **`reservas/seguimiento.js`**: pedir reseña **solo a quien salió contento** es una decisión de
  producto excelente — evita cosechar reseñas negativas.
- **`reservas/kiosco.js`**: las reservas del día aparecen en la tablet **antes del PIN**, porque es
  lo que se mira al entrar a currar. Y **no lleva teléfonos** a propósito: es una pantalla pública.
- **`modificacion.js`**: `cambiosDe`, `validarModificacion`, `quedaPendiente` — modificar una reserva
  puede devolverla a estado pendiente si el cambio es grande.
