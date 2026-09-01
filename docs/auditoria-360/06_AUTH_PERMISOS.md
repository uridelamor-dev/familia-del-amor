# 06 · Autenticación, roles y permisos

## Cadena completa

```
LOGIN            POST /api/auth/login  (público, rate 20/min por IP)
  ↓              bcrypt.compare + freno escalonado por usuario (acceso.js)
TOKEN            jwt.sign({ id, username, rol, nombre, local,
                            modulos: modulosEfectivos(rol, user.modulos),
                            locales: localesDe(user), pass_temporal },
                          JWT_SECRET, { expiresIn: "8h" })          server.js:3825
  ↓              → localStorage del navegador (no cookie)
PETICIÓN         Authorization: Bearer <jwt>
  ↓
requireAuth()    1. jwt.verify
server.js:3697   2. ¿roles.length && !roles.includes(payload.rol)? → 403
                 3. moduloDeRuta(req.path) ∈ payload.modulos? → 403   (mapa incompleto)
                 4. req.user = payload
  ↓
localScope(req)  El local con el que se responde. Nunca uno ajeno.
  ↓
SQL              WHERE local = ?   (a mano, en cada consulta)
```

## Roles (5)

| Rol | Alcance | Nº endpoints |
|---|---|---:|
| `direccion` | **Superusuario.** Salta la comprobación de módulo (`payload.rol !== "direccion"`) | todos |
| `encargado` | Su(s) local(es). Operación diaria | ~90 |
| `contabilidad` | Compras, productos, analítica | ~78 |
| `rrhh` | Equipo, horarios, fichajes, pulso | ~60 |
| `marketing` | Clientes, campañas, promos, web, reseñas, Sara | ~50 |

**No existe un rol `trabajador`.** Un trabajador sin cuenta de panel **solo** interactúa con el
kiosko (token de dispositivo + PIN) y con el enlace anónimo del pulso. Quien sí tiene cuenta usa los
17 endpoints `/api/mi-*`.

## Modelo de permisos (`src/modules/usuarios/permisos.js`)

**El rol define el máximo; la allowlist por usuario solo RESTRINGE, nunca amplía.**

```js
modulosEfectivos(rol, guardados) = intersección(modulosDeRol(rol), parseModulos(guardados))
// allowlist vacía/null → acceso completo del rol
```

`CATALOGO_MODULOS` (L13) declara **24 módulos** con `{ id, label, roles[], porLocal, dentroDe? }`.
Tres son pestañas dentro de Equipo (`contratacion`, `pulso`, `preguntas`) y no aparecen en el menú.

### Ámbito por local
`src/modules/usuarios/locales.js` — `localesDe`, `localPermitido`, `localesPermitidos`.
Regla: **un local no propio nunca se devuelve; se cae al principal.**
`src/modules/locales/centros.js` — dos barras que son un mismo negocio (Blanes + Cooperativa) se
tratan como un centro para personal, y como barras separadas para ventas.

### Freno de fuerza bruta (`src/modules/usuarios/acceso.js`)
5 fallos → 30 s, 2 min, 5 min, 15 min. Se suelta solo. Por **usuario**, además del rate por IP.
El PIN del kiosko tiene su propio freno (`fichajes/pin.js`): 5 fallos → 60 s / 300 s / 1800 s,
comprobado **antes** de bcrypt para no gastar CPU.

## 🔴 Inconsistencias CONFIRMADAS

### 1. `contabilidad` ve «Fichajes» y recibe 403

| Fuente | Roles de `fichajes` |
|---|---|
| `permisos.js:35` (`CATALOGO_MODULOS`) | dirección, rrhh, encargado, **contabilidad** |
| `public/panel/app.js` (`NAV`, `VIEW_ROLES`) | dirección, rrhh, encargado, **contabilidad** |
| `server.js:10029` (`FICHAJES_ROLES`) | dirección, rrhh, encargado — **sin contabilidad** |

**Los 15 endpoints `/api/fichajes/*` usan `FICHAJES_ROLES`.** Un usuario de contabilidad ve la
entrada del menú, entra, y la vista falla entera.

**INFERENCIA sobre la intención**: contabilidad necesita los fichajes **para la nómina** — el propio
comentario de `permisos.js:33` lo dice («contabilidad necesita los fichajes para la nómina pero no
debe poder tocar el cuadrante»). Así que el bug está en `FICHAJES_ROLES`, no en el catálogo. Pero
darle los 15 endpoints incluiría correcciones y anulaciones. **Hace falta separar lectura de
escritura**, no simplemente añadir el rol.

### 2. El mapeo de módulo de mantenimiento nunca se aplica
`MODULO_POR_RUTA` tiene `["/api/mantenimiento", "mantenimiento"]`; las rutas reales son
`/api/maintenance` (`server.js:13928/13938/13951`). Ver `04_ENDPOINTS.md` §3.

### 3. La allowlist no cubre 83 endpoints de facturas
`/api/facturas` no está en `MODULO_POR_RUTA`. Quitarle el módulo «Compras» a un usuario de
contabilidad **esconde el menú pero no cierra la API**.

## Escenarios probados conceptualmente

| Escenario | Resultado | Evidencia |
|---|---|---|
| Trabajador (sin cuenta) accede a facturación | ❌ Imposible | No tiene JWT |
| Encargado pide `?local=` de otro establecimiento | ❌ Bloqueado | `localPermitido()` devuelve el suyo, no el pedido. Tests: `e2e-aislamiento.test.js`, `rrhh-aislamiento-local.test.js` |
| Usuario manipula `establecimiento_id` en el body | ❌ No aplica | El local sale del **token**, no del cuerpo |
| Acceso por URL directa a un módulo oculto | ⚠️ **Parcial** | Solo bloqueado en los 21 prefijos mapeados |
| Escalado de privilegios cambiando `rol` | ❌ Bloqueado | El rol va **firmado** en el JWT |
| Endpoints internos públicos | ⚠️ 24 públicos, revisados uno a uno en `04` |
| Usuario sin rol | ⚠️ `roles.length === 0` → pasa. Es lo que hacen los `/api/mi-*`, correcto |
| `direccion` salta la comprobación de módulo | ✅ Documentado y deliberado |
| **Default allow** | ⚠️ **Sí, por diseño**: lo no mapeado en `MODULO_POR_RUTA` pasa |

## Riesgos de la sesión

| Aspecto | Estado |
|---|---|
| Almacenamiento del token | `localStorage` → **accesible por cualquier XSS**. Ver `07_SEGURIDAD.md` |
| Caducidad | 8 h. Razonable para un turno |
| Revocación | ❌ **Ninguna**. Un token robado vale 8 h. Cambiar la contraseña o el rol **no invalida** el token existente |
| Refresh | ❌ No hay. Al caducar se vuelve a entrar |
| `pass_temporal` | Viaja en el token pero **no bloquea** (decisión documentada y razonable: el encargado que abre a las 7 no puede quedarse fuera por un formulario) |

⚠️ **Consecuencia práctica de la falta de revocación**: si se despide a alguien, quitarle el usuario
**no le cierra la sesión**. Sigue teniendo acceso hasta 8 h. Ver `28_ROADMAP.md` P1.

→ Matriz completa en `PERMISSIONS_MATRIX.md`.
