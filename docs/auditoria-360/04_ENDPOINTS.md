# 04 · Mapa de endpoints

**350 rutas HTTP**, todas declaradas en `server.js` (no hay `express.Router`, ni carpeta `routes/`,
ni controladores). Extraídas por análisis estático del fichero.

## Resumen por guardia

| Guardia | Nº | Comentario |
|---|---:|---|
| `requireAuth(["direccion","contabilidad"])` | 73 | Casi todo facturas |
| `requireAuth(["direccion"])` | 43 | Configuración y operaciones destructivas |
| `requireAuth(["direccion","marketing"])` | 43 | Clientes, campañas, web |
| `requireAuth(HORARIOS_ROLES)` | 32 | dirección, rrhh, encargado |
| `requireAuth(RRHH_ROLES)` | 21 | rrhh, dirección, encargado |
| `requireAuth(INV_ROLES)` | 20 | dirección, encargado |
| `requireAuth()` **sin roles** | 17 | Autoservicio `/api/mi-*` ✅ |
| `requireAuth(FICHAJES_ROLES)` | 15 | dirección, rrhh, encargado |
| `requireAuth(PROMOS_ROLES)` | 9 | dirección, marketing |
| Resto de combinaciones | ~83 | |
| **PÚBLICOS (sin auth)** | **24** | Ver abajo |

## Los 24 endpoints públicos — clasificación de riesgo

| 🚦 | Método | Ruta | Fichero:línea | Rate | Análisis |
|---|---|---|---|---|---|
| 🟢 | GET | `/api/health` | 14549 | no | Devuelve `{ok:true}` sin comprobar nada. **Inútil como healthcheck** (no detecta BD caída) |
| 🟢 | GET | `/api/content` | 6723 | no | Textos de la web pública. Datos por definición públicos |
| 🟢 | GET | `/api/reviews` | 3423 | no | ✅ **Columnas nombradas a propósito** — el comentario documenta que con `*` se filtraban las respuestas internas |
| 🟢 | GET | `/api/hr/jobs` | 7918 | no | Vacantes publicadas |
| 🟢 | GET | `/` | 15911 | no | Portada |
| 🟡 | POST | `/api/auth/login` | 3774 | **sí** | Freno escalonado por usuario (`acceso.js`) + rate por IP |
| 🟡 | POST | `/api/leads` | 4124 | **sí (10/min)** | Añadido en 2026-09 al emitir cupones reales. Antes **no tenía ninguno** |
| 🟡 | POST | `/api/reservas` | 6922 | **no** ⚠️ | Crea reserva y dispara WhatsApp. **Sin rate limit** → ver `18_RESERVAS.md` |
| 🟡 | POST | `/api/hr/applications` | 7966 | **no** ⚠️ | Sube CV. Tiene `fileFilter` + `CV_MAX_BYTES`, pero **sin rate limit** |
| 🟡 | POST | `/api/reservas/:id/perfil` | 4217 | no | Completa el perfil de una reserva. **Requiere adivinar el id** |
| 🟢 | GET/POST | `/api/pulso/:token` (×3) | 12534+ | **sí** | Token aleatorio de 32 bytes, hash en BD |
| 🟢 | GET/POST | `/api/fichar/:token/*` (×5) | 10111+ | **sí** | Token de dispositivo (hash en BD) + PIN + ticket HMAC |
| 🟢 | GET | `/api/cupon/:token` | 10554 | **sí** | Token de 32 bytes |
| 🟡 | GET | `/auth/google*` (×4) | 2178, 3354 | no | Callbacks OAuth |

### 🔴 El que más preocupa: `POST /api/upload`

`server.js:6894` · `requireAuth(["marketing","rrhh","direccion","encargado"])` · `upload.array("files", 10)`

```js
const storage = multer.diskStorage({ destination: → public/uploads, filename: sanitizado });
const upload = multer({ storage });   // ← SIN limits, SIN fileFilter
```

**HECHO COMPROBADO**:
- `uploadsDir = path.join(__dirname, "public", "uploads")` (`server.js:257`)
- `express.static("public")` (`server.js:247`) **sirve ese directorio al mundo**
- No hay límite de tamaño ni de tipo MIME

**Riesgos**: agotamiento de disco (10 ficheros de cualquier tamaño por petición); y sobre todo
**almacenamiento de contenido arbitrario servido desde el propio origen** — un `.svg` o `.html`
subido se sirve con su content-type y ejecuta JavaScript en el dominio de la aplicación
(**XSS almacenado con robo de JWT desde `localStorage`**). Requiere una cuenta con uno de esos
4 roles, pero `encargado` es el rol más numeroso.

Contraste: los otros dos multer **sí** están acotados —
`uploadFacturaMem` (20 MB, memoria) y `uploadCv` (`CV_MAX_BYTES` + `isAllowedCvUpload`).

## Rutas con acceso a filesystem

| Ruta | Análisis |
|---|---|
| `GET /api/rrhh/documentos/:id/archivo` (~13712) | ✅ **Bien defendida**. `path.basename()` sobre el valor **de la BD**, rechaza `.`/`..`, lista blanca de dos directorios, `Cache-Control: private, no-store`, y comprueba `sensible` contra el rol encargado |

## Patrones de riesgo buscados y **no** encontrados

| Patrón | Resultado |
|---|---|
| Concatenación de input en SQL (`"..." + var`) | **0 casos** |
| SQL con `${}` de input de usuario | **0 casos**. Las 36 interpolaciones usan constantes internas (`SQL_RECUADRE`, `REPASO_COLS`, listas fijas de tablas) — verificado caso por caso en `server.js:4039` y `5991` |
| IDOR en `/api/mi-*` | **0 casos**: todos usan `req.user.id` |
| Path traversal | **0 casos** |
| Command injection | `execSync`/`execFileSync` importados; usados para ghostscript sobre rutas internas |

## Observaciones estructurales

1. **350 rutas en un fichero.** No hay agrupación por router. Encontrar una ruta exige `grep`.
2. **La autorización por módulo es deliberadamente incompleta.** `MODULO_POR_RUTA`
   (`permisos.js:133`) mapea **21 prefijos** de los ~45 existentes. Lo no mapeado se comprueba
   **solo por rol**. Está documentado como decisión consciente («añadir una entrada ENDURECE; no
   añadirla no rompe nada»), pero conviene saber qué queda fuera:

   | Prefijo sin mapear | Endpoints | Consecuencia |
   |---|---:|---|
   | `/api/facturas` | **83** | Quitarle «Compras» a un contable **no le impide** llamar a la API por URL |
   | `/api/users` | 8 | |
   | `/api/whatsapp` | 8 | |
   | `/api/hechos` | 4 | Datos personales de clientes (dieta, alergias) |
   | `/api/marketing`, `/api/leads`, `/api/campanas-config` | 7 | |
   | `/api/upload`, `/api/uploads` | 2 | |
   | `/api/ventas`, `/api/kpi`, `/api/places`, `/api/google`, `/api/announcements`, `/api/debug` | ~8 | |

3. 🔴 **BUG CONFIRMADO — un mapeo apunta a un prefijo que no existe.**
   `MODULO_POR_RUTA` contiene `["/api/mantenimiento", "mantenimiento"]`, pero las rutas reales son
   **`/api/maintenance`** en inglés (`server.js:13928`, `13938`, `13951`).
   `grep -c 'app\..*"/api/mantenimiento'` → **0**.
   → La allowlist del módulo `mantenimiento` **nunca se aplica**. Quitarle «Incidencias» a un
   encargado esconde el botón pero no cierra la API. Es exactamente el fallo que ese mapa
   existía para evitar.
4. **Sin versionado de API** ni contrato documentado. La forma `{ok, data}` es convención, no norma.
