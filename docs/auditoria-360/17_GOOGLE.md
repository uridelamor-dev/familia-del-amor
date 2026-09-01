# 17 · Integraciones Google

## Tres OAuth distintos (HECHO)

| Integración | Variables de entorno | Callback | Para qué |
|---|---|---|---|
| **Google (negocio)** | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `/auth/google/callback` (`server.js:3366`) | Business Profile (reseñas) |
| **Google Facturas** | `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` | `/auth/google-facturas/callback` (`server.js:2195`) | Gmail + Drive + Sheets |
| **Places (API key)** | `GOOGLE_PLACES_API_KEY` | — | Búsqueda de fichas de local |

`GOOGLE_REDIRECT_URI = (process.env.BASE_URL || "https://familia-del-amor.replit.app") + "/auth/google/callback"`
(`server.js:1725` y `1957`).

⚠️ **HECHO**: el respaldo de `BASE_URL` es un dominio de Replit hardcodeado. Si `BASE_URL` no está
puesta y el dominio cambia, el OAuth se rompe silenciosamente.

## Scopes solicitados (HECHO)

```
https://www.googleapis.com/auth/business.manage     ← Business Profile: leer y RESPONDER reseñas
https://www.googleapis.com/auth/drive               ← Drive COMPLETO (no drive.file)
https://www.googleapis.com/auth/gmail.readonly      ← leer correo
https://www.googleapis.com/auth/gmail.modify        ← MODIFICAR correo (marcar leído/etiquetar)
https://www.googleapis.com/auth/spreadsheets        ← Sheets completo
```

⚠️ **`auth/drive` es el scope más amplio posible**: acceso a **todo** el Drive de la cuenta, no solo
a los ficheros que la app crea (`drive.file`). Si la cuenta es personal o corporativa con más
contenido, la aplicación puede leerlo todo.
**RECOMENDACIÓN**: evaluar `drive.file` + carpeta compartida. Ver `28_ROADMAP.md` P2.

⚠️ **`gmail.modify`** permite modificar y borrar correo, no solo leerlo. Se usa para marcar
procesados. **INFERENCIA**: `gmail.readonly` + una etiqueta gestionada aparte sería menos peligroso,
pero probablemente `modify` es necesario para el flujo actual.

## Superficies

### Google Business Profile / Reseñas
- APIs: `mybusinessaccountmanagement`, `mybusinessbusinessinformation`, `.../v4/accounts/*/reviews`
- Tabla `google_reviews` · módulo `src/modules/reviews/reviews.service.js` (254 L)
- `setInterval(reviewsSyncSiToca, 30 min)` (`server.js:1941`)
- Funciones: `syncReviews`, `mapManageRow`, `draftRequest` (**borrador de respuesta con IA**),
  `buildManageQuery`, `queryTextSearch`, `normalizarUbicacionBP`, `placeIdsConfigurados`
- Endpoint público `GET /api/reviews` para la portada (columnas nombradas a propósito)
- **HECHO** (memoria del proyecto): hay un caso abierto con Google (ID 1-7056000040689) pendiente de
  aprobación de cuota

### Gmail (facturas)
`setInterval(pollGmail, 5 min)` · `facturas_email_reglas` (remitente → local) ·
`facturas_emails_procesados` (idempotencia) · `src/modules/facturas/gmail-estado.js`

### Drive (facturas)
`setInterval(pollDriveFacturas, 5 min)` · `facturas_drive_carpetas` · `facturas_drive_procesados` ·
`migrarEstructuraDrive`, `reubicarEnDrive`, `idDeDriveUrl`, `GET /api/facturas/drive-diagnostico`,
`POST /api/facturas/drive-colocar-raiz`

### Sheets (espejo contable)
`mirrorLeadToSheet` (leads) · `reconstruirSheetMaestro` · `resincronizarSheetsFactura` ·
`repararTodosLosSheets` · `setInterval(reintentarSheets, 10 min)`

✅ **El reintento cada 10 minutos es una buena decisión**: un fallo de red no rompe el espejo contable.

## Tokens y errores

**INFERENCIA** (por los endpoints de estado y diagnóstico que existen —
`GET /api/facturas/status`, `/drive-diagnostico` —): los refresh tokens se guardan en `config` y se
renuevan al vencer. Hay tratamiento de fallo, pero **no he podido verificar la política de
renovación ni el manejo de un `invalid_grant`**, que es el fallo típico (el usuario revoca el
acceso o la contraseña de Google cambia).

→ **Pregunta abierta**: `30_PREGUNTAS_ABIERTAS.md` nº 6.

## Riesgos

| # | Riesgo | Sev. |
|---|---|---|
| 1 | **Scope `auth/drive` completo** — más permiso del necesario | 🟠 |
| 2 | **`gmail.modify`** — puede modificar correo | 🟡 |
| 3 | Si un refresh token se invalida, **INFERENCIA**: el pipeline de facturas se para en silencio hasta que alguien mire `/api/facturas/status` | 🟠 |
| 4 | `BASE_URL` con respaldo hardcodeado a un dominio de Replit | 🟡 |
| 5 | Cuota de la API de Business Profile pendiente de aprobación | 🟡 |
| 6 | **Tres integraciones de Google = tres puntos de fallo** para el dominio más desarrollado del sistema | 🟠 |
