# 16 · Sara / IA / automatizaciones

## Qué es Sara

Un **agente conversacional sobre WhatsApp** que atiende a clientes: responde, toma reservas, las
modifica y las cancela, y manda la carta en PDF. Usa **tool-use de Anthropic**.

**No hay un `src/modules/sara/`.** La lógica está repartida entre `whatsapp.js` (recepción,
historial, `addSaraToHistorial`) y `server.js` (~15.400-15.900: prompt, herramientas, despacho).

## Modelos en uso (HECHO)

| Línea | Modelo | Para qué |
|---|---|---|
| 3598 | `claude-haiku-4-5-20251001` | Respuestas a reseñas de Google |
| 13828 | `claude-haiku-4-5-20251001` | Clasificación (12 tokens, `temperature: 0`) |
| 14650 | `claude-haiku-4-5-20251001` | Traducción de campañas |
| 14907 | `claude-haiku-4-5-20251001` | Redacción de campañas |
| **15484** | **`claude-sonnet-5`** | **Sara** (la conversación con el cliente) |
| 15809 | `claude-haiku-4-5-20251001` | Extracción de hechos de cliente |

**INFERENCIA**: reparto deliberado y sensato — Sonnet para la conversación (donde importa la
calidad), Haiku para las tareas mecánicas (donde importa el coste).

## Todo lo que hace la IA en el sistema

| Función | Dónde | Cómo |
|---|---|---|
| **Sara conversacional** | `server.js:~15484` | Tool-use: reservar, modificar, cancelar, enviar carta |
| **Leer facturas** | `facturas.js` | Extracción estructurada del texto del PDF |
| **Redactar campañas** | `POST /api/campanas/redactar` | Texto libre → segmento + mensaje, **revisable antes de enviar** |
| **Traducir campañas** | `construirResolverIdioma` | Al idioma detectado de cada cliente |
| **Extraer «hechos» de clientes** | `setInterval` 6 h | Dieta, alergias, preferencias de las conversaciones |
| **Responder reseñas** | `server.js:3598` | Borrador de respuesta a Google Reviews |
| **Detectar idioma** | `messaging/i18n.js` | **Offline**, por marcadores de palabras. Sin IA ✅ |

## La regla de oro (y es una buena regla)

**HECHO documentado**: *«La IA NUNCA escribe directamente: su salida pasa siempre por el mismo
saneador que el formulario.»*

- La propuesta de campaña de la IA pasa por `sanearSegmento`, igual que el formulario.
- Hay un test que falla si `CLAVES_SEGMENTO` y `CAMPOS` divergen — **porque ya divergieron una vez y
  la campaña salió a más gente de la que se vio en la vista previa**.
- El prompt prohíbe explícitamente inventar (`server.js:14789`): *«NO inventes ofertas, precios,
  descuentos ni horarios que no te hayan dicho.»*
- Los «hechos» extraídos quedan en estado **`propuesto`** y requieren confirmación humana
  (`GET /api/hechos/propuestos`), con `texto_original` guardado y marca `atribucion_dudosa`.

✅ **Es el patrón correcto**: la IA propone, la persona dispone, y el saneador es el mismo para
ambos caminos.

## Manejo de errores: `src/modules/ia/errores.js`

36 líneas que traducen el error del SDK a algo accionable:
- 401/403 → «La clave de la IA no vale o ha caducado»
- 429 → «Demasiadas peticiones, espera un minuto»
- 402 → «La cuenta se ha quedado sin saldo»
- 404 → «ese modelo no existe o no está disponible para esta cuenta»

El comentario explica el porqué: *«la diferencia entre "espera un minuto" y "la clave no vale" es la
diferencia entre reintentar y perder la tarde»*.

## Capacidades existentes y poco explotadas (INFERENCIA)

| Capacidad | Estado |
|---|---|
| `cliente_hechos` (dieta, alergias, preferencias) | Se rellena solo cada 6 h, con confirmación humana. **¿Se usa en Sara al atender?** — pregunta abierta |
| `cliente_metricas` (RFM, visitas, gasto estimado con intervalo) | Alimenta segmentación. **INFERENCIA**: no alimenta a Sara |
| `sara_respuestas` | Tabla existente. **INFERENCIA**: respuestas guardadas/aprendidas, poco explotadas |
| `traducciones` | Caché por idioma+hash. Bien resuelto |
| `marketing_faltan` | «Filtros que nos piden y no tenemos» — libreta de producto alimentada por el uso real. **Idea excelente, infrautilizada** |

## Riesgos

| # | Riesgo | Sev. |
|---|---|---|
| 1 | **Sara habla con clientes reales sin supervisión.** Un error de tool-use puede crear o cancelar una reserva equivocada | 🟠 |
| 2 | **Sin timeout explícito** en las llamadas al SDK dentro de peticiones HTTP | 🟡 |
| 3 | **Sin límite de gasto** visible. Un bucle de conversación puede disparar el coste | 🟡 |
| 4 | Los modelos están **hardcodeados** en 6 sitios distintos. Cambiar de modelo son 6 ediciones | 🟡 |
| 5 | La lógica de Sara no está en `src/modules/` → **no es testeable en aislamiento** | 🟡 |
