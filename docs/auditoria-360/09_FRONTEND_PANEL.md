# 09 · Frontend y panel interno

## Arquitectura (HECHO)

**Vanilla JavaScript sin framework, sin bundler, sin build.** Los `<script>` se cargan como scripts
clásicos (no módulos ES) desde `index.html`.

| Superficie | Ficheros | Líneas |
|---|---|---:|
| Panel interno | `public/panel/index.html` + `app.js` | 13.650 |
| Web pública | `public/index.html` + `app.js` + `styles.css` | 5.463 |
| Kiosko | `fichar.html` + `.js` + `.css` + `-sw.js` | 1.374 |
| Cupón cliente | `cupon.html` + `.js` + `.css` | 192 |
| Pulso | `pulso.html` + `.js` | 202 |
| 🧟 Legacy | `direccion|marketing|rrhh|trabajadores|encargados|contabilidad|local` + `erp-preview/` | ~4.900 |

## El panel en números

| Métrica | Valor |
|---|---:|
| Líneas | **12.351** |
| Funciones de nivel superior | **601** |
| Pares `render*`/`load*` (una por vista) | 88 |
| Variables de estado global (`let MAYÚSCULAS`) | **61** |
| `innerHTML` | **243** |
| `document.addEventListener` (delegación global) | **23** |
| `fetch` | 29 |
| `AbortController` | **0** |
| `setTimeout` / `setInterval` | 30 / 2 |
| Atributos `aria-` | 23 (panel) + 4 (HTML) |

## Routing y ciclo de vida

`go(view)` (`public/panel/app.js`, ~L11560):
1. `dpClose()` — cierra el datepicker, que cuelga de `<body>` y sobreviviría al repintado
2. `CURRENT = view`; escribe el hash en la URL
3. `puedeVer(view)` → si no, pinta «Sin acceso»
4. `root.innerHTML = shell(view, skeleton())` — **destruye el DOM anterior entero**
5. `VIEWS[view]()` — carga y repinta

✅ **Bien**: la vista va en la URL (recargar no te devuelve al Dashboard, el botón atrás funciona,
se pueden guardar enlaces). Está documentado como corrección de un fallo previo.

✅ **Bien**: la delegación global de eventos (23 listeners en `document`) hace que **repintar no
pierda listeners**. Es la decisión correcta para un frontend que regenera HTML como string.

⚠️ **El punto débil**: los timers **no se limpian en `go()`**. Se auto-cancelan comprobando
`CURRENT` dentro de su propio tick (`FIC_TIMER` L5785, `WA_POLL` L10309). Funciona, pero significa
que **entre el cambio de vista y el siguiente tick hay una petición de más**, y basta con que
alguien añada un timer sin esa comprobación para tener una fuga.

## Problemas encontrados

### 🔴 1 · Un fichero de 12.351 líneas
Todas las vistas, todos los modales, todo el estado y todo el enrutado en un solo fichero. No hay
módulos ES (los `<script>` clásicos no pueden importar). **Consecuencias**: no se puede cargar por
partes; cualquier cambio recarga los 12.351 líneas; el riesgo de colisión de nombres es real (ya
ocurrió: `estadoDe` está definido en dos módulos distintos del servidor y hubo que renombrar al
importar).

### 🔴 2 · Sin cancelación de peticiones
**0 `AbortController` con 29 `fetch`.** Cambiar de vista rápido deja peticiones en vuelo que
resuelven contra un DOM que ya no existe. Los `catch` lo absorben, pero:
- se gasta ancho de banda y CPU del servidor
- **race condition real**: dos cargas seguidas de la misma vista pueden pintar la respuesta lenta
  encima de la rápida
- mitigado a mano con antirrebote en el buscador de Clientes (`cliRefreshDebounced`, 250 ms)

### 🟡 3 · 61 variables de estado global
`CAMP`, `CLIF`, `FAC_SEL`, `COMP_SEL`, `PROMO`, `HOR`, `FIC`, `DASH_*`… Sin encapsular, sin
inicialización uniforme, sin limpieza al cambiar de vista. **Riesgo**: estado de una vista que
sobrevive a otra y produce comportamientos raros (p. ej. `FAC_SEL` con facturas de otro filtro).

### 🟡 4 · HTML como string + `innerHTML`
243 `innerHTML`. Mitigado con `esc()` aplicado con disciplina, pero:
- **19 interpolaciones de campos de BD sin `esc()`** en el panel (revisadas: en su mayoría títulos
  de modal —que `modal()` escapa— o datos numéricos). Ver `07_SEGURIDAD.md`
- Los paneles legacy `direccion.js` y `marketing.js` **no definen `esc()` en absoluto**

### 🟡 5 · Lógica de negocio en la interfaz
`construirSegmento()` está duplicado: en `src/modules/campaigns/campaigns.service.js` (servidor) y
en `public/panel/app.js` (cliente). Hay un test que obliga a que `CLAVES_SEGMENTO` y `CAMPOS`
coincidan **porque ya se desincronizaron una vez, y la consecuencia fue que una campaña salió a más
gente de la que se vio en la vista previa** (documentado en `server.js`). Es un ejemplo perfecto del
coste de duplicar reglas entre capas.

Igual pasa con `VIEW_ROLES`/`MODULOS_POR_LOCAL` (espejo de `CATALOGO_MODULOS`) y con
`visiblesFE`/`LOCALES` (espejo de `INV_LOCALES`).

### 🟡 6 · Accesibilidad mínima
23 atributos `aria-` en 12.351 líneas. Sin gestión de foco en modales, sin `role="dialog"`
sistemático, sin navegación por teclado documentada. El kiosko sí cuida el táctil (botones de 88 px,
`aria-label` en el teclado numérico), pero eso es ergonomía, no accesibilidad.

### 🟢 7 · Lo que está bien
- **Delegación de eventos** en lugar de re-enganchar listeners.
- **`esc()` disciplinado** en el camino principal.
- **Skeletons** mientras carga (`skeleton()`), y `errorCard()` con botón de reintentar.
- **Peticiones en paralelo** donde importa: `loadClientes` y `loadCampanas` usan `Promise.all` con
  comentarios que explican que encadenarlas duplicaba el tiempo de aparición.
- **Degradación**: `apiOptional()` para lo que puede faltar sin romper la pantalla.
- **Responsive de verdad**: `CLAUDE.md` exige 1440×800 **y** 390×844, y hay una herramienta
  (`tools/barrido-rutas.mjs`) que lo barre. Los comentarios documentan los fallos típicos (tarjetas
  que se apilan, pestañas que se parten, tablas con la primera columna pegajosa).

## El kiosko (`public/fichar.js`, 903 líneas) — aparte y mejor

Merece mención propia porque es el frontend mejor construido del repositorio:
- IIFE autocontenido, sin dependencias, sin `app.js`
- **Reloj del servidor + `performance.now()`**, nunca `Date.now()` a pelo
- **Cola offline en IndexedDB** con reintento y migración desde `localStorage`
- **Service worker** red-primero que nunca cachea `/api/`
- Todo se borra a los 20 s de inactividad, **también del DOM**, porque es una pantalla pública
- Comentarios que explican por qué cada decisión (el hueco a la izquierda del `0` en el teclado,
  el auto-envío al completar el PIN, el temblor al fallar)
