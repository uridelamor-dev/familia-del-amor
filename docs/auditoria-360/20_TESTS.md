# 20 · Tests

## Ejecución (HECHO — ejecutado durante esta auditoría, sin efectos)

```
$ npm test
ℹ tests 3373    ℹ suites 801
ℹ pass 3373     ℹ fail 0     ℹ skipped 0
ℹ duration_ms 60341
```

**Runner**: `node --test` nativo. Sin Jest, sin Vitest, sin Mocha. Sin cobertura instrumentada.

## Inventario

| Carpeta | Ficheros | Qué contiene |
|---|---:|---|
| `tests/modules/` | 94 | Unitarios de `src/modules/**` |
| `tests/` (raíz) | 63 | Integración, regresión e **introspección** |
| `tests/db/` | **10** | Contra **PostgreSQL real**; se saltan sin `TEST_DATABASE_URL` |
| `tests/core/` | 1 | `access.test.js` (permisos V2) |
| `tests/http/` | 1 | |
| `tests/integrations/` | 1 | |
| **Total** | **170 ficheros, 27.087 líneas** | |

### Helpers (`tests/helpers/`)
- **`memdb.js`** — emulador de PostgreSQL en memoria, **en JS puro sin `pg`**. Reproduce
  `dbGet/dbAll/dbRun`, placeholders `?`, `RETURNING id`, `ON CONFLICT`, transacciones con snapshot y
  el error `42P01` de tabla ausente. Es *dispatch por forma*: solo entiende las consultas exactas de
  los módulos portados.
- **`pgtmp.js`** — esquema desechable en un PostgreSQL real, para validar DDL, CHECKs e índices
  únicos parciales que `memdb` no puede.
- `agrupa-como-la-base.js` · `pdf-falso.js`

## El patrón estrella: **tests de introspección**

Leen `server.js` / `public/panel/app.js` **como texto plano** y fallan si un invariante se rompe.
No prueban comportamiento: **prueban decisiones**.

Ejemplos reales:
- `fic_eventos`: el único `UPDATE` permitido es `anulado_por`; `DELETE` prohibido
- `pro_canjes`: ni `UPDATE` ni `DELETE`
- `VIEW_ROLES` del front debe cubrir `CATALOGO_MODULOS` del back
- Cada módulo-pantalla debe tener entrada en `NAV` y ruta en `VIEWS`
- Nunca se copia `min_planificado` en `min_fichado`
- `hoyISO()` usa hora de Madrid, no UTC
- Paridad de claves `es`/`ca`/`en` en el i18n de la landing
- El canje se resuelve en un solo `UPDATE`, sin `SELECT` previo

✅ **Es el mejor hallazgo de esta auditoría en materia de calidad.** Un test de introspección
sobrevive a refactors y protege el *porqué*, no la implementación. **Durante esta misma sesión uno
de ellos detectó una entrada de menú que faltaba**, antes de que llegara a producción.

## Mapa cobertura ↔ confianza

| Funcionalidad | Tests | Confianza |
|---|---|---|
| Permisos (`permisos`, `locales`, `acceso`) | 6+ ficheros | 🟢 Alta |
| Fichajes (máquina, bolsa, jornadas, revisión, PIN) | ~15 | 🟢 Alta |
| Horarios (solver, conflictos, cuadrante, versiones) | ~14 | 🟢 Alta |
| Facturas (líneas, vencimiento, duplicados, fechas, categorías) | ~18 | 🟢 Alta |
| RR.HH. (ciclo, periodos, ausencias, vigencia) | ~10 | 🟢 Alta |
| Clientes (métricas, hechos, duplicados, valor) | ~8 | 🟢 Alta |
| Campañas / mensajería (segmento, cola, i18n) | ~8 | 🟢 Alta |
| Promociones | 4 (nuevos) | 🟢 Alta |
| Aislamiento por local | 3 e2e | 🟡 Media (casos concretos, no la regla) |
| Dashboard | ~2 | 🟡 Media |
| Ágora (mappers, caché, informes) | ~4 | 🟡 Media (nada contra el TPV real) |
| Inventario (cálculo) | ~2 | 🟡 Media |
| **Reservas** | ~2 | 🔴 **Baja** |
| **Sara / tool-use** | **0** | 🔴 **Ninguna** |
| **whatsapp.js** | **0** | 🔴 **Ninguna** |
| **facturas.js** (el fichero, no los módulos) | 0 directos | 🔴 Baja |
| **Endpoints HTTP end-to-end** | 0 | 🔴 **Ninguna** |
| **Frontend en ejecución** | 0 (`barrido-rutas.mjs` necesita puppeteer no instalado) | 🔴 **Ninguna** |

### El hueco estructural

**No hay ni un solo test que arranque Express y haga una petición HTTP real.** Todo lo que se prueba
del servidor se prueba **leyendo su código como texto**. Consecuencia: los 350 endpoints —guardias,
códigos de estado, forma de la respuesta, aislamiento por local— **no están cubiertos por
comportamiento**, solo por inspección.

## Las 30 pruebas que más valor aportarían

**Seguridad y permisos (1-8)**
1. Cada endpoint autenticado devuelve 401 sin token y 403 con un rol no permitido *(tabla)*.
2. Un usuario con `local` asignado no obtiene datos de otro local en **todos** los endpoints por local.
3. El JWT con `rol` manipulado se rechaza.
4. `MODULO_POR_RUTA` cubre todo prefijo `/api/*` que tenga módulo en `CATALOGO_MODULOS`
   *(habría cazado el bug `/api/maintenance`)*.
5. Los roles de `CATALOGO_MODULOS` coinciden con los de la constante `*_ROLES` de cada endpoint
   *(habría cazado el bug de contabilidad↔fichajes)*.
6. `resolveJwtSecret()` devuelve objeto: ningún sitio lo usa como cadena
   *(habría cazado el bug de la clave de Ágora)*.
7. `POST /api/upload` rechaza ficheros por tamaño y por tipo.
8. Un token de usuario borrado deja de funcionar *(hoy fallaría — no hay revocación)*.

**Reservas (9-13)**
9. Doble reserva simultánea en la misma franja.
10. Reserva en día bloqueado → 409 con motivo.
11. Si WhatsApp está caído, la reserva se guarda igual y queda constancia del fallo.
12. `POST /api/reservas/:id/perfil` no permite tocar la reserva de otro.
13. Rate limit en `POST /api/reservas`.

**HTTP end-to-end (14-18)**
14. Arrancar Express contra `pgtmp` y hacer el recorrido: login → listar → crear → borrar.
15. `GET /api/health` refleja el estado real de la BD *(hoy siempre `ok`)*.
16. El guardia de esquema devuelve 503 antes de `initDB`.
17. Forma de respuesta `{ok, data}` / `{ok:false, error}` en una muestra de 20 endpoints.
18. `express.static` no sirve los paneles legacy *(tras borrarlos)*.

**Integraciones (19-24)**
19. Ágora offline: `syncVentasLocal` no inserta nada y no lanza.
20. Ágora con hueco de días: se rellenan en el orden correcto.
21. Sara: cada herramienta de tool-use con argumentos inválidos no corrompe datos.
22. Facturas: PDF con total que no cuadra con las líneas → se marca, no se guarda como buena.
23. Facturas: la misma factura por dos canales a la vez no se duplica.
24. Google: `invalid_grant` deja el sistema en estado conocido y avisa.

**Frontend (25-27)**
25. `tools/barrido-rutas.mjs` en CI *(requiere resolver puppeteer)*.
26. `esc()` se aplica a todo dato de BD que entre en un `innerHTML`.
27. Cambiar de vista cancela las peticiones en vuelo *(requiere `AbortController`)*.

**Datos (28-30)**
28. Toda tabla con columna `local` se consulta siempre filtrando por ella.
29. Borrar una promoción / un proveedor no deja huérfanos.
30. `MATCH_TEL9` usa el índice funcional *(tras crearlo)* — `EXPLAIN` sin `Seq Scan`.
