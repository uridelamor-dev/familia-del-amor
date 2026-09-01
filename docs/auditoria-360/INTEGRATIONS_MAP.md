# INTEGRATIONS_MAP · Integraciones externas

| Integración | Librería / vía | Credenciales | Frecuencia | Criticidad | Si cae |
|---|---|---|---|:--:|---|
| **WhatsApp** | `@whiskeysockets/baileys` ^7.0.0-**rc13** | Sesión en ficheros (`baileys_auth/`) | Permanente (WebSocket) | 🔴 **Máxima** | Sin confirmaciones de reserva, sin campañas, sin Sara, sin alertas |
| **Ágora TPV** | HTTP a mano (`integrations/agora/`) | Usuario+contraseña por local en `agora_locales` ⚠️ **cifrado inválido** | 5 min | 🟠 Alta | Sin ventas, sin analítica, dashboard incompleto |
| **Anthropic Claude** | `@anthropic-ai/sdk` ^0.97.1 | `ANTHROPIC_API_KEY` | Bajo demanda + cada 6 h | 🟠 Alta | Sin Sara, sin lectura de facturas, sin redacción de campañas |
| **Google Business Profile** | `fetch` | OAuth `GOOGLE_CLIENT_ID/SECRET` | 30 min | 🟡 Media | Sin reseñas nuevas ni respuestas |
| **Google Drive** | `fetch` | OAuth `GOOGLE_DRIVE_CLIENT_ID/SECRET` | 5 min | 🟠 Alta | Sin archivado ni canal Drive de facturas |
| **Google Gmail** | `fetch` | Mismo OAuth que Drive | 5 min | 🟠 Alta | Sin canal email de facturas |
| **Google Sheets** | `fetch` | Mismo OAuth que Drive | 10 min (reintento) | 🟡 Media | Sin espejo contable |
| **Google Places** | `fetch` | `GOOGLE_PLACES_API_KEY` | Bajo demanda | 🟢 Baja | Sin búsqueda de fichas de local |
| **ntfy.sh** | `fetch` | — | Puntual | 🟢 Baja | Una vía de notificación menos |
| **PostgreSQL** | `pg` ^8.22.0 | `DATABASE_URL` | Permanente | 🔴 **Máxima** | Todo |

## Superficie de scopes de Google

```
business.manage        ← leer y RESPONDER reseñas
drive                  ← ⚠️ DRIVE COMPLETO (no drive.file)
gmail.readonly         ← leer correo
gmail.modify           ← ⚠️ MODIFICAR correo
spreadsheets           ← Sheets completo
```

## Diagrama de dependencia funcional

```
                    ┌─────────────┐
                    │  WhatsApp   │◄── 🔴 punto único de fallo
                    └──┬───┬───┬──┘
        confirmaciones │   │   │ campañas + cupones
                       ▼   ▼   ▼
    RESERVAS ◄──── SARA ── MARKETING ── PROMOCIONES
       │            │(Claude Sonnet 5)
       │            └────────────┐
       ▼                         ▼
    CLIENTES ◄───────────── cliente_hechos (Claude Haiku, cada 6 h)
       │
       ├─ cliente_metricas ── DASHBOARD ◄── VENTAS ◄── ÁGORA TPV
       │                          ▲              (scraping, 5 min)
       └──────────────────────────┤
                                  │
              COMPRAS ────────────┘
                 ▲
      ┌──────────┼──────────┬──────────┐
    Gmail      Drive     WhatsApp    manual
      └──── Claude (lectura de facturas) ────┘
                 │
              Sheets (espejo contable)

    FICHAJES ── ✅ NO depende de NINGUNA integración externa
```

✅ **Observación importante**: **fichajes y horarios son los únicos dominios sin dependencias
externas.** Es coherente con que sean los más críticos legalmente, y explica por qué son los más
robustos: no pueden fallar por algo de fuera.

## Modos de fallo y su gestión

| Integración | ¿Detecta el fallo? | ¿Reintenta? | ¿Avisa a alguien? |
|---|---|---|---|
| WhatsApp | ✅ | ✅ Exponencial, con pausa tras 3 QR ignorados | ✅ **Sí** (WhatsApp a un número + atención en el dashboard) |
| Ágora | ✅ `ping()` | ✅ Cada 5 min, con catch-up | ❌ **No** |
| Claude | ✅ Por código HTTP | ❌ | ❌ (mensaje al usuario que lo intentó) |
| Google (todas) | 🟡 Parcial | ✅ Sheets cada 10 min | ❌ **No** |
| PostgreSQL | 🟡 Guardia de esquema al arrancar | ❌ | ❌ (`/api/health` **sigue diciendo `ok`**) |

## Recomendación estructural

**Dos integraciones sin alternativa sostienen el negocio de cara al cliente**: WhatsApp (Baileys, no
oficial, en RC) y Ágora (scraping de una web de administración). Ninguna de las dos tiene contrato,
API estable ni soporte.

- **WhatsApp**: activar el canal email como respaldo para confirmaciones de reserva. El esquema ya
  lo soporta (`campanas_wa.asunto`, `marketing_prefs.opt_in_email`, `campana_envios.correo`), solo
  falta el transporte, que puede hacerse con `fetch` a Resend/Brevo **sin añadir paquetes**.
- **Ágora**: no hay alternativa realista, pero sí conviene una alerta cuando lleve >24 h sin
  sincronizar.
