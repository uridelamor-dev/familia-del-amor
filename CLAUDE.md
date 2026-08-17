# La Tapeta (Familia del Amor)

App de gestión interna + web pública de un grupo de restauración. **Responder siempre en español.**

## Stack
- Node.js + Express + **PostgreSQL** (`pg`, `DATABASE_URL`). ESM, **sin build ni bundler**.
  Frontend **vanilla** HTML/CSS/JS en `public/` (sin framework).
- `server.js` es un **monolito grande** — al editar, Read el rango antes de Edit (no editar a ciegas).
  La lógica nueva va en módulos **puros** bajo `src/modules/`, no dentro de `server.js`.
- Integración WhatsApp con **Baileys** (`whatsapp.js`), facturación en `facturas.js`.
- ⚠️ **No se pueden añadir dependencias npm.** `npm install` no funciona en local (el lockfile
  apunta al firewall de Replit) y un fallo de instalación en el despliegue es caída.

## Comandos
- **Arrancar:** `npm run dev` → `node server.js`.
- **Tests:** `npm test` → `node --test "tests/**/*.test.js"`. Descripciones en español;
  hay tests de introspección que leen `server.js`/`app.js` como texto para blindar invariantes.
- **Puerto:** `5000` (en Replit sale por el 80).
- **Reiniciar** (mata puerto + chrome/puppeteer + SingletonLock + relanza): `/restart-tapeta`.
- **Inventario de bloques:** `node tools/inventario-bloques.mjs` lista cada tarjeta de cada
  pantalla con su título y su altura, numeradas. Sirve para pedir cambios por número («12
  plegar», «19 fuera») en vez de describirlos. Necesita `puppeteer`; si falta, se salta.
- **Probar API** (login + endpoints, sin pegar token a mano): skill `tapeta-api` → `.claude/skills/tapeta-api/api.sh <endpoint>`.
- **Barrido de pantallas:** `node tools/barrido-rutas.mjs` abre las 19 vistas del panel en Chrome
  sin ventana (servidor falso incluido) **en ordenador (1280) y en móvil (390)** y avisa de
  errores de JS, pantallas en blanco, desplegables abiertos de casa y páginas que se salen de
  ancho. Necesita `puppeteer`, que **no** es dependencia: si falta, se salta. `npm test` lee el
  código; esto lo ejecuta, y ahí salen otros fallos.
- Login de prueba: usuarios `direccion` / `encargado`, contraseña `tapeta2024`. En una base
  **recién creada** pide cambiarla al entrar (todas las altas nacen con `pass_temporal`).

## Git ↔ Replit (importante)
La app también vive en Replit, que commitea al **mismo `main`**. Por eso **siempre `pull --rebase` antes de push**.
Ya está configurado global `pull.rebase=true` + `rebase.autoStash=true`, así que basta con usar `/commit-push`
(hace add → commit → pull --rebase --autostash → push). Nunca `push --force` sobre `main`.

## WhatsApp / Baileys (hecho recurrente)
- **En cada redeploy de Replit la sesión de WhatsApp se desconecta** y hay que re-linkar (escanear QR).
- Antes de subir cambios que reinicien el server, avisar de que tocará reconectar WhatsApp (y Google si aplica).
- Al reiniciar en local, borrar `.wwebjs_auth/session/SingletonLock` si el navegador quedó bloqueado.

## Seguridad (deuda conocida)
- ~~`JWT_SECRET` con fallback inseguro~~ **Arreglado**: en producción no arranca sin un secreto
  fuerte (`resolveJwtSecret`, refuse-to-boot). El login **sí** tiene freno por usuario y en la
  base (`src/modules/usuarios/acceso.js`: 5 fallos → 30 s, 2, 5, 15 min, y se suelta solo).
  Queda: contraseña seed `tapeta2024` y **sin helmet**.
- No commitear credenciales reales; el `.env` no va al repo.

## Imágenes
- Compresión de galería: `~/.claude/scripts/gallery-import.sh <prefijo> <glob-origen>` (usa `sips`, no hay PIL).

## Horarios y fichajes (registro de jornada)
Módulo grande y con reglas legales detrás (RD-ley 8/2019). Tres invariantes que **no se tocan**:
- `fic_eventos` es **inmutable**: la única columna que se actualiza es `anulado_por`. Corregir
  un fichaje es escribir otra fila, con motivo y autor. Hay un test que falla si aparece
  cualquier otro `UPDATE` o un `DELETE` sobre esa tabla.
- **Nunca** se copia `min_planificado` en `min_fichado` (ni al revés). La desviación entre el
  cuadrante y el reloj es la señal, y borrarla destruye la prueba.
- La bolsa de horas es un **libro de movimientos**, no un campo `saldo`: `fic_bolsa_movimientos`
  es 100 % append-only y el saldo es `SUM(minutos)`.

Otros puntos: la hora de un fichaje la pone el **servidor** (salvo los diferidos, marcados como
`kiosco_offline` con su desfase); el PDF del cuadrante se escribe a mano (base-14 + WinAnsi)
porque no se pueden añadir dependencias; y el generador (`solver.js`) **propone un borrador**,
no publica.

## Interfaz: ordenador Y móvil, siempre
Todo cambio visual se entrega funcionando en las dos, sin que haya que pedirlo: el panel se usa
dentro de los locales con el teléfono en la mano. Comprobar a **1440×800 y 390×844** antes de dar
nada por hecho (`node tools/barrido-rutas.mjs` ya barre las dos). Lo que más falla: tarjetas que
se apilan y se comen la pantalla, barras de pestañas que se parten en dos filas, y tablas anchas
cuya primera columna —pegajosa— deja el dinero fuera de la vista.

## Deuda conocida
- ~~`hoyISO()` en UTC~~ **Arreglado.** Hay un único `hoyISO()` en `server.js` y usa
  `instanteMadrid()` (hora de Madrid). Lo que sigue en UTC —y es correcto— es la **aritmética
  sobre una fecha ya dada** (`addDiasISO`, `addDaysISO`): ahí el huso no estorba y meter hora
  local podría introducir saltos con el cambio de hora. Test: `tests/hora-de-madrid.test.js`.
- Analítica e Inventarios mantienen su propio selector de local (el resto usa el de la barra).

## Roadmap y estado
Roadmap de 8 mejoras + estado de Google Business/Reseñas: ver memoria global `project-latapeta`
(caso Google ID 1-7056000040689, pendiente de aprobación de cuota).
