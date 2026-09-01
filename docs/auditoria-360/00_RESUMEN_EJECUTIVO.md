# 00 · Resumen ejecutivo

**Auditoría 360º de Familia del Amor (La Tapeta)**
Fecha: 2026-09-01 · HEAD `90ded2998c98209fbb347e5043ec153afc6ba14a` · rama `main`
Modo: **solo lectura**. No se ha modificado ningún fichero del sistema fuera de `docs/auditoria-360/`.

---

## Qué es esto

Un **ERP de restauración hecho a medida** para un grupo familiar de 6 establecimientos, más la web
pública del negocio. Cubre reservas, clientes/CRM, marketing por WhatsApp, RR.HH., horarios,
registro de jornada, compras/facturas, inventarios, analítica de ventas del TPV, reseñas de Google
y un asistente de IA que atiende WhatsApp.

No es un producto genérico: es un sistema interno que ha ido creciendo por necesidad real, y eso se
nota **para bien y para mal**.

---

## Números

| Métrica | Valor |
|---|---|
| Ficheros rastreados | 394 |
| Líneas de JavaScript | ~83.900 |
| Líneas de HTML/CSS | ~7.000 |
| Endpoints HTTP | **350** (24 públicos) |
| Tablas de base de datos | **91** |
| Índices declarados | 78 |
| Ficheros de test | 170 |
| Tests | **3.373, todos en verde** |
| Dependencias npm | 13 |
| `server.js` | **16.722 líneas** |
| `public/panel/app.js` | **12.351 líneas** |

---

## Las cinco cosas que más sorprenden (para bien)

1. **El código explica el *porqué*, no el *qué*.** Los comentarios documentan el bug que arreglan y
   la decisión que sostienen. Es, con diferencia, el activo más valioso del repositorio y lo que
   hace que 16.000 líneas en un fichero sean navegables.
2. **Tests como candados, no como cobertura.** Hay tests de introspección que leen `server.js` como
   texto y fallan si alguien reintroduce un fallo estructural (`fic_eventos` inmutable, paridad
   `VIEW_ROLES`↔`CATALOGO_MODULOS`). Es un patrón poco común y muy efectivo.
3. **Cero marcadores de deuda.** No hay un solo `TODO`, `FIXME` o `HACK` real en 84.000 líneas.
4. **El registro de jornada está bien construido.** `fic_eventos` inmutable, la hora la pone el
   servidor, la bolsa de horas es un libro de movimientos sin campo `saldo`. Cumple el espíritu del
   RD-ley 8/2019.
5. **Módulos puros y testeables** en `src/modules/`, con la lógica separada del transporte HTTP.

## Las cinco cosas que más preocupan

1. 🔴 **La clave de cifrado de las credenciales de Ágora es la cadena `"[object Object]"`.** Bug
   verificado en `server.js:7132`. Ver `07_SEGURIDAD.md` §1.
2. 🔴 **La protección «no arrancar sin secreto fuerte» puede estar inactiva en producción.**
   `isProduction()` depende de `APP_ENV`/`NODE_ENV`, que no se definen en el repo. Si no están en
   los Secrets de Replit, se usa un secreto de desarrollo **que está en el repositorio**.
3. 🔴 **Sin `helmet`, sin CSP, sin límite de tamaño de cuerpo**, y un endpoint de subida sin filtro
   de tipo ni de tamaño que escribe en un directorio servido públicamente.
4. 🟡 **Dos ficheros concentran el 35 % del código** (`server.js` + `public/panel/app.js` = 29.000
   líneas). Es el mayor freno estructural a la evolución.
5. 🟡 **No hay observabilidad.** 258 `console.error` y ningún destino externo: si algo se rompe de
   madrugada, nadie se entera hasta que alguien lo nota.

---

## Veredicto

**Un sistema sorprendentemente sano por dentro y frágil por fuera.**

La calidad del razonamiento interno —los invariantes, los tests-candado, los módulos puros— está
muy por encima de lo habitual en software de este tamaño hecho por una sola persona. El problema no
es el código: es el **perímetro** (cabeceras, secretos, subidas, observabilidad) y la
**concentración** (dos ficheros gigantes).

La buena noticia es que ambas cosas se arreglan sin reescribir nada. El roadmap de `28_ROADMAP.md`
propone 4 tareas P0 que caben en una semana y eliminan el 80 % del riesgo real.

**Lo que NO hay que tocar**: ver `38` → `26_FORTALEZAS.md` y la sección «Cosas que no se deben
romper» de `CLAUDE_HANDOFF_COMPLETO.md`.
