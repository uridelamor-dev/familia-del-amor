# 22 · Dependencias

## El contexto que lo condiciona todo

> ⚠️ **`CLAUDE.md`: «No se pueden añadir dependencias npm.»** `npm install` no funciona en local (el
> lockfile apunta al firewall de Replit) y un fallo de instalación en el despliegue es una caída.

**HECHO COMPROBADO durante esta auditoría**: `node_modules/` existe con 384 entradas pero **`pg` no
está instalado** → el servidor **no arranca en local**. Es la manifestación exacta del problema
descrito.

Consecuencia práctica: **cualquier recomendación de esta auditoría que implique un paquete nuevo
(helmet, sentry, zod, un test-runner HTTP) hay que resolverla escribiendo el código a mano o vía
`fetch`.**

## Las 13 dependencias

| Paquete | Versión | Uso | Estado |
|---|---|---|---|
| `express` | ^4.19.2 | Servidor HTTP | 🟡 **Express 4**. La 5 es estable desde 2024. Sin vulnerabilidades conocidas graves |
| `pg` | ^8.22.0 | PostgreSQL | 🟢 Al día |
| `jsonwebtoken` | ^9.0.3 | JWT | 🟢 Al día (la 9.x corrigió los CVE de la 8.x) |
| `bcrypt` | ^6.0.0 | Contraseñas y PINes | 🟢 Al día. Módulo nativo |
| `multer` | ^1.4.5-lts.1 | Subidas | 🟠 **La rama 1.x es *legacy*.** La 2.x corrigió DoS. `-lts` recibe parches, pero es deuda |
| `dotenv` | ^16.4.5 | Entorno | 🟢 |
| `pdf-lib` | ^1.17.1 | PDFs | 🟡 Sin releases recientes; estable y suficiente |
| `qrcode` | ^1.5.4 | Generar QR | 🟢 |
| `qrcode-terminal` | ^0.12.0 | QR en consola | 🟡 Abandonado (2019), pero trivial |
| `@whiskeysockets/baileys` | **^7.0.0-rc13** | WhatsApp | 🔴 **Release candidate en producción**, librería **no oficial** |
| `@hapi/boom` | ^10.0.1 | Errores (lo pide Baileys) | 🟢 |
| `@anthropic-ai/sdk` | ^0.97.1 | Claude | 🟢 |
| **`pino`** | ^10.3.1 | — | 🔴 **NUNCA SE IMPORTA.** Dependencia muerta |

## Hallazgos

### 🔴 `pino` declarado y no usado
`grep -rn 'from "pino"'` en `server.js`, `src/`, `facturas.js`, `whatsapp.js`, `security.js` → **0**.
Se instaló para logging estructurado y nunca se conectó. **O se usa (ver `21_OBSERVABILIDAD.md` §3)
o se quita.**

### 🔴 Baileys en RC y no oficial
Riesgo doble: (a) una RC puede tener regresiones; (b) WhatsApp puede bloquear la cuenta sin recurso.
El sistema depende de ello para reservas, marketing, Sara y alertas. Ver `15_WHATSAPP.md`.

### 🟠 `multer` 1.x
Rama legacy. Combinado con el `upload` sin `limits` ni `fileFilter` (`07_SEGURIDAD.md` §3), el riesgo
se acumula.

### 🟡 Dependencias del **sistema** (no npm)
`.replit`: `packages = ["sqlite", "ghostscript"]`
- **`ghostscript`** — lo usa `combinarArchivosEnPdf`. Si el entorno cambia, se rompe la fusión de
  PDFs de facturas. **No está declarado en ningún sitio del código como requisito.**
- **`sqlite`** — 🧟 resto de la etapa anterior. Ya no se usa.
- **`puppeteer`** — usado por `tools/*.mjs` y **NO instalado** → las herramientas visuales se saltan.

### 🟢 Lo que está bien
- **Solo 13 dependencias** para un sistema de 84.000 líneas. Superficie de ataque mínima.
- **Cero dependencias de frontend.** Ni React, ni jQuery, ni utilidades. Todo vanilla.
- **Sin librerías redundantes**: no hay dos que hagan lo mismo.
- Node 20 en despliegue (LTS con soporte).

### ⚠️ Node 25 en local vs. Node 20 en Replit
El desarrollo se hace con v25.5.0 y el despliegue con 20. **INFERENCIA**: hasta ahora no ha dado
problemas porque el código no usa APIs muy nuevas, pero es una diferencia que puede morder
(`node --test` ha cambiado bastante entre esas versiones).

## Auditoría de vulnerabilidades

⚠️ **No ejecutada.** `npm audit` requiere red y resolución del lockfile, que en este entorno está
roto. **RECOMENDACIÓN**: ejecutar `npm audit` **desde Replit**, donde el lockfile sí resuelve.

Por inspección de versiones, ninguna dependencia está en un rango con CVE crítico conocido, salvo la
observación sobre `multer` 1.x.
