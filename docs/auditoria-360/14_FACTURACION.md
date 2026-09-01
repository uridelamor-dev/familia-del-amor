# 14 · Facturación y proveedores

**El dominio más desarrollado del sistema**: 83 endpoints (24 % del total), 15 tablas, 18 módulos en
`src/modules/facturas/` (~3.000 líneas) y `facturas.js` (1.465 líneas).

## Canales de entrada (HECHO) — cuatro

| Canal | Cómo | Fichero |
|---|---|---|
| **Subida manual** | Módulo «Subir factura» (solo encargado) → `uploadFacturaMem` (20 MB, memoria) | `server.js` |
| **Gmail** | `setInterval(pollGmail, 5 min)` · reglas en `facturas_email_reglas` · control en `facturas_emails_procesados` | `facturas.js` |
| **Google Drive** | `setInterval(pollDriveFacturas, 5 min)` · carpetas en `facturas_drive_carpetas` · control en `facturas_drive_procesados` | `facturas.js` |
| **WhatsApp** | Adjunto en un grupo → `setOnGroupAttachment` · grupos en `facturas_grupos` | `whatsapp.js` → `server.js` |

⚠️ **HECHO**: el canal determina el `local` de la factura. Si un grupo/remitente/carpeta apunta a un
nombre que no es un establecimiento canónico, **todo lo que entre por ahí queda mal asignado**. Hay
un endpoint dedicado a detectarlo: `GET /api/facturas/locales-raros` (`server.js:5982`), con el
comentario: «arreglar las facturas de ayer sin arreglar el canal es volver a empezar mañana».

## El pipeline

```
PDF/imagen entra por uno de los 4 canales
  → combinarArchivosEnPdf()        (varias páginas sueltas → un PDF; usa ghostscript)
  → pdf-texto.js (784 L)           extracción de texto
  → Claude (@anthropic-ai/sdk)     lectura estructurada  ← «OCR» real del sistema
  → json-cortado.js                repara JSON truncado del modelo
  → emisor.js / local-canonico.js  quién emite y a qué local va
  → no-es-producto.js              descarta líneas que no son producto
  → lineas.js + validarSuma()      cuadra líneas contra el total
  → fecha-documento.js (261 L)     fecha real del documento
  → duplicados.js / buscarParecida ¿ya la teníamos?
  → categorias.js / diccionario.js clasificación de gasto
  → vencimiento.js (235 L)         cuándo hay que pagarla
  → reparto.js                     reparto entre locales / empresa
  → facturas + factura_lineas
  → espejo a Google Sheets (reintento cada 10 min)
  → archivo en Google Drive
```

**INFERENCIA**: no hay OCR clásico (Tesseract). El reconocimiento lo hace **Claude** sobre el texto
extraído. Es una decisión coherente con «no se pueden añadir dependencias».

## Módulos puros (18) — el catálogo de problemas resueltos

Cada uno existe porque un caso real falló. Los nombres lo cuentan solos:

`duplicados` · `proveedores-duplicados` · `json-cortado` · `no-es-producto` · `local-canonico` ·
`fecha-documento` · `coherencia` · `conciliacion` · `descartes` · `relectura` · `repaso` ·
`reparto` · `precio-referencia` · `compras-fusion` · `asignacion` · `gmail-estado` · `zip` ·
`diccionario`

Commits recientes que ilustran la madurez del dominio:
- `89261ae` «Facturas: que un año mal leído no llegue al IVA del trimestre»
- `6e1a351` «Compras: nuestro propio CIF nunca es el NIF de un proveedor»
- `4d09e18` «Compras: dejar de aparecer como proveedores de nosotros mismos»

## Contabilidad

- **IVA**: base imponible + total; hay lógica trimestral y una defensa explícita contra fechas mal
  leídas.
- **`SIN_ALBARANES`**: constante SQL que excluye albaranes de los totales.
- **`dup_estado='duda'`**: una factura sospechosa de duplicado **sale de TODOS los totales** hasta
  que alguien decide (`server.js:759`). Excelente: prefiere un total incompleto a uno falso.
- **`reparto`**: una factura puede repartirse entre locales o imputarse a «empresa».
- **`facturas_somos_nosotros`**: evita tratarse a uno mismo como proveedor.

## Riesgos

| # | Riesgo | Sev. | Evidencia |
|---|---|---|---|
| 1 | **Dependencia total de Claude para leer facturas.** Sin API key o con la cuenta sin saldo, el pipeline se para | 🟠 | `mensajeDeErrorIA` contempla 401/402/429 → señal de que ya ha pasado |
| 2 | **Dependencia de 3 APIs de Google** (Gmail, Drive, Sheets) con OAuth y refresh tokens | 🟠 | `17_GOOGLE.md` |
| 3 | **`facturas.js` es el segundo monolito** (1.465 L) y habla con Google y con la BD directamente | 🟡 | |
| 4 | El `local` depende de la configuración del canal, no del contenido | 🟡 | Mitigado con `/api/facturas/locales-raros` |
| 5 | **83 endpoints sin mapeo de módulo** en `MODULO_POR_RUTA` | 🟡 | `04_ENDPOINTS.md` |
| 6 | `ghostscript` es una dependencia **del sistema** (`.replit` `packages = ["sqlite","ghostscript"]`), no de npm | 🟡 | Si el entorno cambia, la fusión de PDFs se rompe |

## Lo que está muy bien

- **Mirar va separado de aplicar** (`server.js:6444`): las operaciones destructivas enseñan primero
  exactamente qué va a pasar.
- **Idempotencia por canal**: `facturas_emails_procesados`, `facturas_drive_procesados`.
- **Reintento de Sheets** cada 10 min: un fallo de red no pierde el espejo contable.
- **`validarSuma`** cuadra las líneas contra el total antes de dar la factura por buena.
