# 07 · Seguridad

> Ningún secreto real aparece en este documento. Donde hay uno, se redacta.

## Resumen

| Severidad | Nº | Titulares |
|---|---:|---|
| 🔴 Crítico | 3 | Clave de cifrado de Ágora inválida · refuse-to-boot posiblemente inactivo · subida sin filtro en directorio público |
| 🟠 Alto | 4 | Sin CSP/helmet · JWT en localStorage sin revocación · sin límite de cuerpo · paneles legacy servidos |
| 🟡 Medio | 6 | Sin CSRF (mitigado) · PII en el repo · sin rate global · logs · `/api/health` inútil · backups con PII |
| 🟢 Correcto | — | SQL, path traversal, IDOR, hashing, frenos de fuerza bruta |

---

## 🔴 1 · Las credenciales de Ágora se cifran con la cadena `"[object Object]"`

**HECHO COMPROBADO — verificado ejecutando el módulo.**

`server.js:7132`:
```js
const AGORA_ENC_KEY = crypto.scryptSync(String(resolveJwtSecret() || "tapeta"), "agora-token-v1", 32);
```

`resolveJwtSecret()` (`security.js:56`) devuelve **un objeto** `{ secret, status, source }`, no una
cadena. Comprobación ejecutada durante la auditoría:

```
resolveJwtSecret() devuelve: object Object
String(...) produce: "[object Object]"
¿es truthy? true   ← por tanto el `|| "tapeta"` NUNCA se activa
claves del objeto: [ 'secret', 'status', 'source' ]
```

**Consecuencias**
1. La clave AES-256-GCM que protege las contraseñas del TPV en `agora_locales` se deriva de una
   **constante pública e idéntica en toda instalación**. El cifrado no aporta protección real:
   cualquiera con acceso a la base y al repositorio (que es donde está la línea) las descifra.
2. **No se manifiesta como avería** porque cifrar y descifrar usan la misma clave equivocada. Por
   eso lleva ahí desde que se escribió.
3. El error de tipo hace que el `|| "tapeta"` sea código muerto.

**Qué protegen esas credenciales**: usuario y contraseña de la web de administración del TPV Ágora
de cada local (`src/integrations/agora/client.js` → `POST /auth/`), es decir, acceso a la
facturación en vivo del negocio.

**Corrección** (una línea): `resolveJwtSecret().secret`. ⚠️ **Ojo**: cambia la clave derivada, así
que los tokens ya cifrados dejan de descifrarse → hay que reintroducir las contraseñas de Ágora o
migrar los valores. Debe planificarse, no aplicarse a ciegas.

---

## 🔴 2 · La protección «no arrancar sin secreto fuerte» puede estar inactiva

**HECHO** (`security.js:18`):
```js
export function isProduction(env = process.env) {
  if (env.APP_ENV != null && env.APP_ENV !== "") return env.APP_ENV === "production";
  if (env.NODE_ENV != null && env.NODE_ENV !== "") return env.NODE_ENV === "production";
  return false;                      // ← por defecto: DESARROLLO
}
```

**HECHO**: ni `.replit` ni `package.json` definen `APP_ENV` o `NODE_ENV`. El propio código lo sabe
y avisa (`replitEnvWarning`, `security.js:26`), pero **el aviso no cambia la decisión**.

Si en producción no está `APP_ENV=production` en los Secrets:
- `PROD = false` → `resolveJwtSecret` **no lanza**
- Si `JWT_SECRET` falta o es débil → se usa **`DEV_JWT_SECRET`** (`security.js:42`), una cadena
  fija **que está en el repositorio**
- ⇒ **cualquiera que lea el repo puede firmar un JWT con `rol: "direccion"`** y tener control total

**SOSPECHA, no hecho**: no puedo leer los Secrets de Replit desde aquí. Es la **pregunta abierta
nº 1** (`30_PREGUNTAS_ABIERTAS.md`).

**Comprobación inmediata para el propietario**: en los logs de arranque, buscar el aviso
`Ejecutando en Replit sin APP_ENV/NODE_ENV explícito`. Si aparece → la protección está inactiva.

**Recomendación**: además de definir `APP_ENV=production`, invertir el defecto — asumir producción
salvo prueba en contrario, o exigir secreto fuerte siempre que se detecte Replit (`REPL_ID`).

---

## 🔴 3 · `POST /api/upload` sin filtro de tipo ni de tamaño, a un directorio público

Detallado en `04_ENDPOINTS.md`. Resumen: `multer({ storage })` sin `limits` ni `fileFilter`,
escribiendo en `public/uploads/`, que `express.static` sirve al mundo.

**Vector real**: un usuario con rol `encargado` sube `x.svg` con `<script>` dentro → se sirve desde
el propio origen → **XSS almacenado** → roba el JWT de `localStorage` de quien lo abra → 8 h de
acceso con el rol de la víctima. Sin CSP que lo frene (§4).

---

## 🟠 4 · Sin `helmet`, sin CSP, sin cabeceras de seguridad

**HECHO**: `grep -nE "helmet|Content-Security-Policy|X-Frame-Options|Strict-Transport|cors\("` en
`server.js` → **0 resultados**.

Ausentes: `Content-Security-Policy` · `X-Content-Type-Options: nosniff` ·
`X-Frame-Options`/`frame-ancestors` (→ **clickjacking posible sobre el panel**) ·
`Strict-Transport-Security` · `Referrer-Policy` (solo puesto a mano en algunos HTML).

**Atenuante**: no hay `cors()`, así que **no** hay CORS permisivo. Las peticiones cross-origin las
bloquea el navegador por defecto.

**Coste de arreglarlo**: ⚠️ `helmet` **es una dependencia npm**, y `CLAUDE.md` prohíbe añadirlas.
→ Se puede hacer con un `app.use()` de 10 líneas escrito a mano poniendo las cabeceras.

---

## 🟠 5 · JWT en `localStorage`, sin revocación

- Guardado en `localStorage` (`public/auth.js`) → legible por cualquier XSS. Una cookie
  `HttpOnly; Secure; SameSite=Strict` no lo sería.
- **Sin lista de revocación**: despedir a alguien y borrar su usuario **no cierra su sesión**.
  Sigue operando hasta 8 h.
- **Sin rotación de `JWT_SECRET`** documentada.

---

## 🟠 6 · Sin límite de tamaño de cuerpo

`app.use(express.json())` (`server.js:245`) — por defecto Express limita a 100 kb, lo cual **sí**
protege. Pero `express.urlencoded({ extended: true })` sin `limit` explícito y sin `parameterLimit`
deja abierta la ampliación de parámetros. **Riesgo bajo-medio**; conviene fijarlo explícitamente.

---

## 🟠 7 · Los paneles legacy se siguen sirviendo

`express.static("public")` sirve `direccion.html`, `marketing.html`, `rrhh.html`,
`trabajadores.html`, `encargados.html`, `contabilidad.html`, `erp-preview/` — ~4.200 líneas de
JavaScript **sin mantenimiento** que llaman a la API con el mismo token.

**HECHO**: `public/direccion.js` y `public/marketing.js` tienen **3 interpolaciones sin `esc()`**
cada uno y **no definen `esc()`** en absoluto → sin protección XSS.

**Riesgo**: superficie de ataque viva que nadie revisa, alcanzable por URL directa.
**Recomendación**: borrarlos (P1). Ya no los enlaza nadie — `public/login.js:1` documenta que todos
los roles van al panel unificado.

---

## 🟡 8 · PII y datos personales

- **Teléfonos personales en el código**: `server.js:8015/8019/8022` (`"622065974"` — recibe los CV)
  y `server.js:16686` (`"622149946"` — alertas). También en `test-wa.js`.
- `attached_assets/` contiene capturas de pantalla del sistema, commiteadas.
- Tablas `leads_backup_*` y `marketing_prefs_backup_*` con PII duplicada y sin política de borrado.
- **RGPD**: hay opt-out por WhatsApp que además **borra `cliente_hechos`** (`server.js:15617`) — buen
  detalle. Pero no hay endpoint de «derecho al olvido» ni de portabilidad.

---

## 🟡 9 · CSRF

**No hay tokens CSRF.** **Atenuante fuerte**: la autenticación es por cabecera `Authorization`, no
por cookie, así que un formulario cross-site no puede autenticarse. **Riesgo real: bajo.**

⚠️ Excepción: si alguna vez se pasa a cookies (recomendado en §5), **habrá que añadir CSRF a la vez**.

---

## 🟡 10 · Rate limiting parcial

`pulsoRateLimit` (`server.js:11939`) es un `Map` en memoria, por IP+método, ventana de 60 s, techo
de 5.000 entradas. Aplicado a **11 rutas**: login (20), leads (10), pulso (20/5/5), fichar (60/12/30),
cupón (30/30/30).

**No aplicado a**: `POST /api/reservas` (crea reserva y **envía WhatsApp** — un bucle podría quemar
el número), `POST /api/hr/applications` (sube ficheros), ni a **ninguna** ruta autenticada.

⚠️ **Detalle técnico**: usa `x-forwarded-for` sin `app.set("trust proxy")`. Detrás del proxy de
Replit **INFERENCIA**: puede estar leyendo bien la IP del cliente o la del proxy — merece
verificación, porque si lee la del proxy el límite es global y se agota con tráfico legítimo.

---

## 🟡 11 · Logs y errores

- **258 `console.error` + 64 `console.log` + 17 `console.warn`** en `server.js`. Todo a stdout/stderr.
- `pino` está en `package.json` y **no se importa en ningún sitio** → dependencia muerta.
- ✅ **Bien**: `safeLogError` (`security.js`) registra solo tipo y mensaje, nunca el objeto completo,
  precisamente para no volcar cuerpos con PII o tokens.
- ✅ **Bien**: los mensajes de error al cliente son genéricos («No se pudo cargar…»), sin trazas.
- ⚠️ **43 `catch {}` vacíos** en `server.js`. Muchos son deliberados y comentados; otros ocultan
  fallos reales.

---

## ✅ Lo que está BIEN

| Área | Evidencia |
|---|---|
| **SQL injection** | **0 casos**. Todo parametrizado con `?`. Las 36 interpolaciones usan constantes internas, verificadas una a una |
| **Path traversal** | `path.basename()` sobre el valor de la BD + lista blanca de directorios + rechazo de `.`/`..` (`server.js:~13704`) |
| **IDOR** | Los 17 `/api/mi-*` usan `req.user.id`. `localPermitido()` nunca devuelve un local ajeno |
| **Hashing** | bcrypt para contraseñas **y** para PINes. El PIN es unidireccional a propósito |
| **Fuerza bruta** | Doble freno: por IP y por usuario, escalonado |
| **Comparación de firmas** | `crypto.timingSafeEqual` en el ticket del kiosko (`server.js:9995`) |
| **Tokens** | 32 bytes de `crypto.randomBytes`, base64url. Hasheados en BD donde el anonimato importa (pulso, dispositivos) |
| **Fuga de información** | `GET /api/reviews` usa columnas nombradas a propósito; el kiosko no devuelve teléfonos; el PIN da el mismo error exista o no el usuario |
| **XSS en el panel** | `esc()` aplicado con disciplina. El dashboard produce HTML confiable **escapando en el servidor** (`dashboard.service.js:23`) |
| **Secretos** | Solo uno hardcodeado, y está **etiquetado como de desarrollo** |

## Nota sobre el XSS del dashboard

`dashboard.service.js` genera **HTML a propósito** (`<b>…</b>`) que `attRow()`
(`public/panel/app.js:940`) inserta con `innerHTML` **sin escapar**. Es correcto **hoy**: el servicio
escapa cada dato de usuario con su propio `esc()` (L23) antes de componer.

⚠️ **Es un contrato frágil**: no está documentado como «esto devuelve HTML confiable», y basta con
que alguien añada un campo nuevo sin `esc()` para abrir un XSS almacenado desde, por ejemplo, el
título de una incidencia de mantenimiento. **RECOMENDACIÓN**: marcar el contrato explícitamente
(nombrar el campo `narrativaHtml`) y añadir un test que verifique que todo dato de BD que entra en
una narrativa pasa por `esc`.
