# La Tapeta (Familia del Amor)

App de gestión interna + web pública de un grupo de restauración. **Responder siempre en español.**

## Stack
- Node.js + Express + **SQLite** (`database.sqlite`). Frontend **vanilla** HTML/CSS/JS en `public/` (sin framework).
- `server.js` es un **monolito de ~105 KB** — al editar, Read el rango antes de Edit (no editar a ciegas).
- Integración WhatsApp con **Baileys** (`whatsapp.js`), facturación en `facturas.js`.

## Comandos
- **Arrancar:** `npm run dev` → `node server.js`. Sin build ni tests.
- **Puerto:** `3000`.
- **Reiniciar** (mata puerto + chrome/puppeteer + SingletonLock + relanza): `/restart-tapeta`.
- **Probar API** (login + endpoints, sin pegar token a mano): skill `tapeta-api` → `.claude/skills/tapeta-api/api.sh <endpoint>`.
- Login de prueba: usuarios `direccion` / `encargado`, contraseña `tapeta2024`.

## Git ↔ Replit (importante)
La app también vive en Replit, que commitea al **mismo `main`**. Por eso **siempre `pull --rebase` antes de push**.
Ya está configurado global `pull.rebase=true` + `rebase.autoStash=true`, así que basta con usar `/commit-push`
(hace add → commit → pull --rebase --autostash → push). Nunca `push --force` sobre `main`.

## WhatsApp / Baileys (hecho recurrente)
- **En cada redeploy de Replit la sesión de WhatsApp se desconecta** y hay que re-linkar (escanear QR).
- Antes de subir cambios que reinicien el server, avisar de que tocará reconectar WhatsApp (y Google si aplica).
- Al reiniciar en local, borrar `.wwebjs_auth/session/SingletonLock` si el navegador quedó bloqueado.

## Seguridad (deuda conocida)
- `JWT_SECRET` tiene fallback inseguro `tapeta-secret-dev`; contraseña seed `tapeta2024`; **sin rate-limit ni helmet**.
- No commitear credenciales reales; el `.env` no va al repo.

## Imágenes
- Compresión de galería: `~/.claude/scripts/gallery-import.sh <prefijo> <glob-origen>` (usa `sips`, no hay PIL).

## Roadmap y estado
Roadmap de 8 mejoras + estado de Google Business/Reseñas: ver memoria global `project-latapeta`
(caso Google ID 1-7056000040689, pendiente de aprobación de cuota).
