# 23 · Código legacy y deuda técnica

## Marcadores de deuda: ninguno (HECHO)

| Marcador | Apariciones reales |
|---|---:|
| `TODO` | **0** (los 793 hits son la palabra española «todo») |
| `FIXME` | **0** |
| `HACK` | **0** (1 hit, es la palabra dentro de otra) |
| `DEPRECATED` | **0** |
| `XXX` | 0 reales |

✅ **En 84.000 líneas no hay un solo marcador de deuda.** Es excepcional. **INFERENCIA**: la deuda no
se anota, se arregla o se documenta en prosa. Los comentarios largos explicando *por qué* algo está
así hacen el papel del `TODO`, mejor.

## La deuda real, por tamaño

### 🔴 1 · Dos ficheros con 29.073 líneas (35 % del JS)

| Fichero | Líneas | Responsabilidades |
|---|---:|---|
| `server.js` | 16.722 | 350 rutas · esquema de 60 tablas · 14 temporizadores · prompts de IA · cifrado · rate limiting · lógica de negocio de todos los dominios |
| `public/panel/app.js` | 12.351 | 24 vistas · 61 variables globales · 601 funciones · router · componentes · estado |

**Es la deuda que bloquea todo lo demás.** No es un problema de estilo: es que cualquier cambio en
cualquier dominio toca el mismo fichero, y eso multiplica el riesgo de conflicto y de regresión.

⚠️ **Matiz importante**: NO recomiendo una reescritura. Los comentarios de esos ficheros son el
activo más valioso del repositorio y una reescritura los perdería. La salida es **extracción
incremental por dominio**, con los tests de introspección como red. Ver `28_ROADMAP.md` P1.

### 🔴 2 · Código muerto servido públicamente

| Qué | Líneas | Rastreado |
|---|---:|---|
| `public/{direccion,marketing,rrhh,encargados,contabilidad}.html+js` | ~3.400 | sí |
| `public/trabajadores.html+js` | 784 | sí |
| `public/erp-preview/` | 793 | sí |
| `public/local.html+js` | 498 | sí (`locales.html` sí se usa) |
| `index.html` + `styles.css` en la raíz | ~380 | sí |
| `test-wa.js` | 27 | sí |
| `b.ctid` | 0 | sí |
| **Total** | **~5.900 líneas** | |

**HECHO**: `public/login.js:1` documenta que **todos los roles van al panel unificado**. Los paneles
por rol son de una arquitectura anterior. **Siguen sirviéndose** por `express.static` y `direccion.js`
y `marketing.js` **ni siquiera definen `esc()`**.

### 🟠 3 · Duplicación de reglas cliente↔servidor

| Regla | Servidor | Cliente | Protección |
|---|---|---|---|
| Catálogo de módulos | `permisos.js:13` | `app.js:121` `VIEW_ROLES` + `NAV` + `TITLES` | Test de presencia ⚠️ **no de roles** |
| Módulos por local | `CATALOGO_MODULOS.porLocal` | `MODULOS_POR_LOCAL` | Test |
| Lista de locales | `INV_LOCALES` (`server.js:3732`) | `window.LOCALES` (`auth.js`) | Comentario «espejo» |
| Locales sin público | `LOCALES_SIN_PUBLICO` | `window.LOCALES_SIN_PUBLICO` | Comentario |
| Segmento de campaña | `campaigns.service.js` | `construirSegmento` en `app.js` | Test ⚠️ **existe porque ya falló** |

**HECHO**: la desincronización del segmento **ya causó un incidente real** — la campaña salió a más
gente de la que se vio en la vista previa. Está documentado en `server.js`.

### 🟠 4 · Arquitectura V2 escrita y apagada

`src/core/access.js` (152 L) + `src/core/scope.js` (50 L) + 5 tablas + `tests/core/access.test.js`,
todo detrás de `PERMISOS_V2 = false`. **Es trabajo terminado que no aporta nada mientras esté
apagado**, y que envejece.

### 🟡 5 · Documentación desactualizada

`replit.md` describe **SQLite** cuando el sistema lleva tiempo en PostgreSQL. Sigue rastreado y es
lo primero que leería alguien nuevo.

`.env.example` es peor:
```
DB_PATH=./database.sqlite     ← no existe esa variable en el código
PORT=3000                     ← el puerto real es 5000
```
**Ninguna de las 15 variables de entorno reales está documentada.**

### 🟡 6 · Restos de migraciones anteriores

- `.wwebjs_auth/`, `.wwebjs_cache/` — de `whatsapp-web.js`, sustituido por Baileys
- `database.sqlite` (184 KB), `latapeta.db` (0 B) — de la etapa SQLite
- `sqlite` en `.replit` `packages`
- Tablas `leads_backup_*`, `marketing_prefs_backup_*` con **PII duplicada**
- `attached_assets/` — 10 capturas + `Pasted-Eres-un-ingeniero-senior-Migra-esta-app-de-SQLite-a-Pos_….txt`

### 🟡 7 · Deuda funcional declarada

| Qué | Evidencia |
|---|---|
| Canal email de campañas | `server.js:14558` lo rechaza explícitamente; el botón está `disabled`; el esquema ya lo soporta |
| Contraseña seed `tapeta2024` | `CLAUDE.md` la lista como deuda conocida |
| Sin helmet | `CLAUDE.md` la lista como deuda conocida |
| `pino` sin usar | `22_DEPENDENCIAS.md` |
| `agora_product_id` sin explotar | `13_INVENTARIOS.md` |

## Lo que NO es deuda aunque lo parezca

| Parece deuda | Por qué no lo es |
|---|---|
| DDL en cada arranque sin migraciones versionadas | Es una decisión consciente y documentada. En un despliegue de un solo entorno funciona y elimina la clase entera de «olvidé aplicar la migración» |
| SQL crudo sin ORM | Sin dependencias posibles, un ORM no es opción. El SQL está parametrizado y las consultas complejas se exportan como constantes desde módulos puros |
| `MODULO_POR_RUTA` incompleto | Documentado como endurecimiento progresivo: «añadir una entrada ENDURECE; no añadirla no rompe nada» |
| Comentarios muy largos | Son el activo más valioso del repositorio |
| Nombres en español | Coherentes en todo el sistema, y el dominio es español |
