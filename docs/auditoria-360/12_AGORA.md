# 12 · Integración Ágora (TPV)

## Qué es

Ágora es el TPV de los locales. La integración **no usa una API oficial**: automatiza la **web de
administración** del TPV. Está documentado con honestidad en `src/integrations/agora/client.js:1-9`:

> «Mecánica confirmada (2026-08) contra el TPV en vivo. […] Autenticación por cookie de sesión
> (la API-Token de Haddock es otra API no accesible aquí).»

## Ficheros

| Fichero | Líneas | Responsabilidad |
|---|---:|---|
| `src/integrations/agora/client.js` | 175 | Cliente HTTP del TPV |
| `src/integrations/agora/sync.js` | 73 | Sincronización de ventas → `ventas_diarias` |
| `src/integrations/agora/reports.js` | 241 | Informes y totales |
| `src/integrations/agora/mappers.js` | 48 | Normalización |
| `src/integrations/agora/registry.js` | 69 | Configuración por establecimiento |
| `src/integrations/agora/descubrir.js` | 91 | Descubrimiento de rutas/informes del TPV |
| `src/integrations/agora/diagnostico.js` | 102 | Diagnóstico de conexión |
| `src/integrations/agora/http.js` | 31 | Utilidades HTTP |
| `src/modules/agora/{cache,ventas,programacion}.js` | 174 | Caché y programación |

## Autenticación (HECHO)

```
1) GET  {host}/version/   → var AGORA_VERSION = 'X.Y.Z'
2) POST {host}/auth/      LoginRequest {UserName, UserPassword} → cookie "auth-token"
3) POST {host}/bus/       GetAllPosGroupsRequest → IDs de grupos de TPV
4) POST {host}/bus/       GetGlobalSalesReportRequest {From,To,PosGroupsIds}
```

⚠️ **El bus exige que `Sender.ApplicationVersion` coincida con la versión del servidor.** Por eso el
paso 1 no es opcional: si Ágora actualiza, hay que releer la versión.

**Credenciales**: host + usuario + contraseña por establecimiento, en `agora_locales`, cifradas con
AES-256-GCM… **con una clave inválida**. Ver 🔴 `07_SEGURIDAD.md` §1.

## Sincronización

`setInterval(agoraSyncSiToca, 5 min)` (`server.js:1950`).

**Estrategia: oportunista con catch-up** (`sync.js:1-4`):
> «Como el TPV solo responde con el local abierto, cada ciclo rellena los días que falten (hasta
> ayer). Robusto a servidor caído: si no responde, salta y reintenta el próximo ciclo. El "estado"
> (días ya guardados) ES la fuente de verdad.»

`diasFaltantes(existentes, {hoy, maxDias=800})` — función **pura y testeada**: calcula qué días
faltan hasta **ayer**, rellenando huecos, con tope de 800 días.

### Respuestas a las preguntas de la auditoría

| Pregunta | Respuesta (HECHO) |
|---|---|
| ¿Periodicidad? | 5 minutos |
| ¿Qué importa? | Ventas agregadas por día → `ventas_diarias(local, dia, ventas, tickets)` |
| ¿Deduplicación? | Sí: solo inserta los días **que faltan**; hoy nunca entra |
| ¿Si Ágora está offline? | `client.ping()` falla → `{reachable:false, insertados:0}`, se reintenta en 5 min |
| ¿Si el local está cerrado? | Igual: el TPV no responde. Por eso la estrategia es de relleno, no de calendario |
| ¿Días pasados? | Se recuperan solos hasta 800 días atrás |
| ¿Si falla una sincronización? | No pasa nada: el estado en BD es la verdad, el siguiente ciclo lo reintenta |
| ¿Reconstruir históricos? | Sí, borrando filas de `ventas_diarias`: el catch-up las vuelve a traer |

✅ **Es la integración mejor diseñada del sistema.** Idempotente, sin estado propio, tolerante a
fallos, y con la parte difícil (qué días pedir) en una función pura testeable.

## Caché de ventas en vivo

`src/modules/agora/cache.js` + tabla `agora_cache` + `setInterval(calentarVentasVivo, 5 min)`
(`server.js:1969`). Persiste entre reinicios. El commit `6af4bd6` lo resume: «las ventas por local
ya están pedidas cuando entras».

## Funcionalidades que dependen de Ágora

| Funcionalidad | Dependencia | Si Ágora cae |
|---|---|---|
| Analítica de ventas (12 endpoints) | **Total** | Vista vacía |
| `ventas_diarias` | Total | Se detiene; se recupera solo |
| Dashboard: KPIs de venta, ticket medio | Alta | Faltan cifras |
| Dashboard: «gasto disparado sin ventas detrás» | Alta | El comentario dice: «Sin ventas conectadas no puedo saber si lo justifica más facturación» |
| Conciliación compras↔ventas | Media | |
| Vinculación de operadores del TPV con fichas de RR.HH. | Baja | Commits `f50b42d`, `584156f` |
| `inv_productos.agora_product_id` | Baja | Enlace preparado, **INFERENCIA**: poco explotado |

## Flujo completo

```
setInterval 5 min → agoraSyncSiToca("timer")
  → loadAgoraConfigs()             (registry.js: hosts + credenciales descifradas)
  → por cada local:
      createAgoraClient(cfg)
      client.ping()  ──✗──→ salta, reintenta en 5 min
        │ ✓
      getVersion()  →  auth() → cookie
      getAllPosGroups() → IDs
      diasFaltantes(BD, hoy)       ← función PURA
      GetGlobalSalesReportRequest(rango completo en UNA consulta)
      agregarVentasPorDia()        ← mapper PURO
      UPSERT ventas_diarias solo de los días que faltaban
  → ERP: analítica · dashboard · conciliación
```

## Riesgos

| # | Riesgo | Severidad |
|---|---|---|
| 1 | **La clave de cifrado de las credenciales no protege nada** (§7.1) | 🔴 |
| 2 | **Es scraping de una web de administración, no una API.** Un cambio en Ágora la rompe sin aviso | 🟠 |
| 3 | El acoplamiento a `ApplicationVersion` significa que una actualización del TPV puede tumbar el bus | 🟠 |
| 4 | La contraseña del TPV en la BD da acceso a la administración del TPV, no solo a lectura de ventas | 🟠 |
| 5 | Sin alerta cuando lleva días sin sincronizar. `/api/agora/estado` existe pero hay que ir a mirarlo | 🟡 |
