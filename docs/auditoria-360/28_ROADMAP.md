# 28 · Roadmap de mejora

> **Nada de esto se ha implementado.** Son propuestas.
> Restricción transversal: **no se pueden añadir dependencias npm** (`CLAUDE.md`).

---

# P0 — CRÍTICO

### P0.1 · Corregir la clave de cifrado de Ágora
- **Problema**: `String(resolveJwtSecret())` = `"[object Object]"`. La clave AES es una constante
  pública. **Verificado ejecutando el módulo.**
- **Evidencia**: `server.js:7132` · `security.js:56`
- **Riesgo**: las credenciales del TPV de todos los locales están efectivamente en claro para
  cualquiera con acceso a la BD.
- **Solución**: `resolveJwtSecret().secret`. ⚠️ **Cambia la clave derivada** → los tokens ya cifrados
  dejan de descifrarse. Hay que planificar: (a) descifrar con la clave vieja, (b) recifrar con la
  nueva, (c) desplegar. O reintroducir las contraseñas a mano.
- **Dificultad**: Baja (1 línea) + **migración obligatoria**
- **Impacto**: Alto · **Dependencias**: ninguna · **Orden: 1º**

### P0.2 · Asegurar que la protección de arranque está activa
- **Problema**: `isProduction()` devuelve `false` salvo `APP_ENV`/`NODE_ENV`, que no se definen en el
  repo. Si faltan, se usa `DEV_JWT_SECRET`, **que está en el repositorio** → cualquiera puede firmar
  un JWT de dirección.
- **Evidencia**: `security.js:18`, `:42`, `:56` · `.replit` sin `APP_ENV`
- **Solución**: (a) **verificar hoy** si aparece el aviso en los logs de arranque; (b) definir
  `APP_ENV=production` en Secrets; (c) **invertir el defecto**: exigir secreto fuerte siempre que
  `REPL_ID` esté presente, aunque falte `APP_ENV`.
- **Dificultad**: Muy baja · **Impacto**: **Máximo** · **Orden: 2º** (antes que P0.1)

### P0.3 · Acotar `POST /api/upload`
- **Problema**: sin `limits` ni `fileFilter`, escribiendo en `public/uploads/`, servido públicamente
  → XSS almacenado con robo de JWT + agotamiento de disco.
- **Evidencia**: `server.js:257`, `:262-273`, `:6894`, `:247`
- **Solución**: `limits: { fileSize: 10MB, files: 10 }` + `fileFilter` de tipos permitidos +
  **mover el directorio fuera de `public/`** y servirlo por un endpoint autenticado (el molde ya
  existe: `GET /api/rrhh/documentos/:id/archivo`).
- **Dificultad**: Baja-Media · **Impacto**: Alto · **Orden: 3º**

### P0.4 · Cabeceras de seguridad
- **Problema**: sin CSP, `nosniff`, `X-Frame-Options`, HSTS. El panel es *clickjackeable* y no hay
  nada que frene un XSS.
- **Solución**: un `app.use()` de ~12 líneas a mano (sin `helmet`, que es dependencia). CSP en modo
  `report-only` primero — el sistema usa `innerHTML` masivamente y una CSP estricta rompería cosas.
- **Dificultad**: Baja (media si se afina la CSP) · **Impacto**: Alto · **Orden: 4º**

---

# P1 — MUY IMPORTANTE

### P1.1 · Arreglar la inconsistencia contabilidad ↔ fichajes
- `CATALOGO_MODULOS` y `NAV` dan «Fichajes» a contabilidad; los 15 endpoints lo rechazan.
- **Solución**: separar `FICHAJES_ROLES_LECTURA` (con contabilidad, para nómina) de
  `FICHAJES_ROLES_ESCRITURA` (sin). **No basta con añadir el rol**: le daría correcciones y anulaciones.
- **Dificultad**: Baja · **Impacto**: Alto (bug visible) · **Orden: 5º**

### P1.2 · Test que valide roles, no solo presencia
- Habría cazado P1.1 y el bug de `/api/mantenimiento` **antes de llegar a producción**.
- Comprobar: (a) los roles de `CATALOGO_MODULOS` coinciden con las constantes `*_ROLES`;
  (b) todo prefijo de `MODULO_POR_RUTA` **existe** como ruta.
- **Dificultad**: Baja · **Impacto**: Alto · **Orden: 6º**

### P1.3 · Borrar el código muerto servido públicamente
- ~5.900 líneas: paneles legacy, `erp-preview/`, `index.html`/`styles.css` de raíz, `test-wa.js`,
  `b.ctid`. `direccion.js` y `marketing.js` **ni definen `esc()`**.
- **Dificultad**: Muy baja · **Impacto**: Medio-Alto · **Orden: 7º**

### P1.4 · Revocación de sesión
- Despedir a alguien no le cierra la sesión (8 h). Cambiar permisos tarda hasta 8 h en aplicarse.
- **Solución**: columna `users.token_valido_desde`; `requireAuth` compara con `payload.iat`. Sin
  dependencias, sin estado en memoria.
- **Dificultad**: Baja-Media · **Impacto**: Alto · **Orden: 8º**

### P1.5 · Observabilidad mínima
- Healthcheck real, middleware de tiempo por endpoint, `pino` (ya instalado), alertas por WhatsApp
  para Ágora/Google/tasa de errores.
- **Dificultad**: Baja · **Impacto**: Alto · **Orden: 9º**

### P1.6 · Índice funcional para `MATCH_TEL9`
- `CREATE INDEX ON leads ((RIGHT(regexp_replace(telefono,'[^0-9]','','g'),9)))` y equivalente en
  `reservas`. **Sin tocar código de aplicación.**
- **Dificultad**: Muy baja · **Impacto**: Alto si la base crece · **Orden: 10º**

### P1.7 · Empezar a extraer routers de `server.js`
- 16.722 líneas bloquean toda evolución. **Extracción incremental**, empezando por facturas
  (83 rutas). ⚠️ **NO reescribir**: mover con los comentarios intactos.
- **Dificultad**: Media-Alta (por volumen) · **Impacto**: Muy alto a medio plazo · **Orden: 11º**

### P1.8 · Decidir sobre `PERMISOS_V2`
- Arquitectura correcta escrita, testeada y apagada. **O se activa o se retira.** Mientras esté
  apagada, envejece y confunde.
- **Dificultad**: Media (activar) / Muy baja (retirar) · **Orden: 12º**

---

# P2 — IMPORTANTE

| # | Propuesta | Problema | Dificultad | Impacto |
|---|---|---|---|---|
| P2.1 | **Rate limit en `POST /api/reservas`** | Público y dispara 2 WhatsApps por llamada | Muy baja | Alto |
| P2.2 | **Aforo y turnos en reservas** | No existe ningún control de capacidad | Media | **Muy alto** |
| P2.3 | **Auditoría genérica** | Solo fichajes y campañas dejan rastro. Reservas, usuarios y permisos no | Media | Alto |
| P2.4 | **Reducir el scope de Google Drive** | `auth/drive` da acceso a todo el Drive | Media | Alto |
| P2.5 | **Contrato explícito del HTML del dashboard** | `narrativa` se inserta sin escapar por convención no documentada | Baja | Medio |
| P2.6 | **Actualizar `replit.md` y `.env.example`** | Documentan SQLite y variables que no existen | Muy baja | Medio |
| P2.7 | **`AbortController` en el panel** | 29 `fetch`, 0 cancelaciones | Media | Medio |
| P2.8 | **Limpiar `leads_backup_*`** | PII duplicada sin política de borrado | Baja | Medio (RGPD) |
| P2.9 | **Canal email** | Esquema listo, transporte ausente. Reduce la dependencia de WhatsApp | Media | Alto |
| P2.10 | **Cabecera `Cache-Control` en estáticos** | `app.js` de 12k líneas se revalida en cada carga | Muy baja | Medio |
| P2.11 | **`app.set("trust proxy")`** | El rate limit puede estar leyendo la IP del proxy | Muy baja | Medio |
| P2.12 | **Actualizar `multer` a 2.x** | Rama 1.x legacy | Baja ⚠️ requiere `npm install` en Replit | Medio |

---

# P3 — DESEABLE

| # | Propuesta | Impacto |
|---|---|---|
| P3.1 | Pantalla «Hoy» para el encargado | UX alto, esfuerzo mínimo |
| P3.2 | Bandeja de RR.HH. (contratos/documentos que caducan) | UX alto, `documentosPorCaducar()` ya existe |
| P3.3 | Informe semanal por WhatsApp a dirección | Reutiliza dashboard + envío |
| P3.4 | Menú por frecuencia de uso (diario/semanal/config) | UX medio |
| P3.5 | Vista propia del trabajador con cuenta | UX medio |
| P3.6 | Escandallo y coste por plato | **El mayor salto de producto** — ver `27` |
| P3.7 | Entradas de stock desde facturas | Alto |
| P3.8 | Fidelización sobre el carné QR | Medio |
| P3.9 | Resolver puppeteer para `barrido-rutas.mjs` en CI | Medio |
| P3.10 | Accesibilidad del panel (foco, teclado, aria) | Medio |
| P3.11 | Dividir `public/panel/app.js` | Alto a largo plazo |
| P3.12 | Consolidado de grupo en analítica | Medio |

---

## Orden recomendado de ejecución

```
SEMANA 1 (seguridad, ~1-2 días de trabajo real)
  P0.2 verificar APP_ENV  →  P0.1 clave Ágora  →  P0.3 upload  →  P0.4 cabeceras

SEMANA 2 (corrección y limpieza)
  P1.1 contabilidad↔fichajes  →  P1.2 test de roles  →  P1.3 borrar muerto
  →  P2.1 rate limit reservas  →  P2.6 documentación  →  P1.6 índice funcional

SEMANA 3-4 (operación)
  P1.4 revocación  →  P1.5 observabilidad  →  P1.8 decidir PERMISOS_V2

MES 2-3 (estructura)
  P1.7 extracción de routers, dominio a dominio, con los tests como red

DESPUÉS (producto)
  P2.2 aforo  →  P3.1/P3.2 quick wins de UX  →  P3.6 escandallo
```

**Regla transversal**: cada cambio estructural debe ir acompañado de un test de introspección que
impida deshacerlo por accidente. Es el patrón de la casa y funciona.
