# 31 · Anexo — Horarios, RR.HH. y módulos no cubiertos en otros documentos

> Añadido en el **control de calidad final**: la lista de entregables pedida no incluía documento
> propio para Horarios ni RR.HH., que son el 2º y 3er dominio por número de endpoints. Este anexo
> cierra ese hueco y recoge lo que no aparecía en ningún otro documento.

---

## A · Horarios (35 endpoints · 16 módulos · 14 tablas `hor_*`)

### Módulos (todos **puros**, sin BD ni `Date` leído por su cuenta)

| Módulo | L | Qué hace |
|---|---:|---|
| `tiempo.js` | 229 | **La pieza de la que depende todo el módulo.** `instanteANegocio`, `lunesDe`, `isoConOffset`, `epochDeLocal`, `instanteMadrid`. El `now` **se inyecta siempre** |
| `solver.js` | 418 | **El generador de cuadrantes. PURO y DETERMINISTA**: los mismos datos dan siempre el mismo cuadrante. Sin `Math.random` ni `Date.now` |
| `conflictos.js` | 284 | Recibe cuadrante + ausencias + contratos + necesidades → qué está mal y con qué gravedad |
| `cuadrante.js` | 204 | Filas planas de BD → estructura que pintan la rejilla y el PDF |
| `versiones.js` | 184 | Versionado y publicación. Snapshot canónico |
| `descansos.js` | 141 | Quién libra |
| `capacidades.js` | 125 | Qué trabajo sabe hacer cada persona (áreas) |
| `repetir.js` | 117 | Repetir un turno en otros días |
| `config.js` | 90 | Los 4 parámetros que antes solo se podían cambiar entrando en PostgreSQL |
| `colores.js` | 87 | Un color por área, y por tanto por persona |
| `schema.js` | 394 | Las 14 tablas |
| `pdf/` (5 ficheros) | 558 | **PDF del cuadrante escrito a mano** (base-14 + WinAnsi + AFM de Helvetica) porque no se pueden añadir dependencias |

### Decisiones destacables

✅ **El generador propone un borrador, no publica.** Es la decisión correcta: un algoritmo no decide
quién trabaja el sábado.

✅ **`solver.js` es determinista.** Sin `Math.random` ni reloj: se puede probar, reproducir y
explicar por qué salió ese cuadrante. 679 líneas de test lo cubren.

✅ **Una semana publicada es inmutable** (`versiones.js` + test «una publicación sigue siendo
inmutable»). El equipo ve un cuadrante que no cambia bajo sus pies.

✅ **El PDF se escribe a mano.** 558 líneas para generar un PDF con fuentes base-14 y codificación
WinAnsi, porque `pdf-lib` no cubría el caso y no se podía añadir otra librería. Es la consecuencia
más visible de la restricción de dependencias.

✅ **Refuerzos vs. turnos completos** (comentado en `fichajes/schema.js`): un refuerzo es *una
duración dentro de una ventana*, no una franja fija. La primera versión no lo contemplaba y «los
refuerzos —que son la mitad de la plantilla en fin de semana— no cabían en el modelo».

⚠️ **`hor_contratos`, `hor_disponibilidad`, `hor_worker_areas` no llevan `local`**: se derivan del
trabajador. Un trabajador que cambia de local arrastra su historial (`08_MULTI_ESTABLECIMIENTO.md`).

---

## B · RR.HH. (34 endpoints · 9 módulos · 7 tablas `hr_*` + `rrhh_periodos`)

| Módulo | L | Qué hace |
|---|---:|---|
| `ciclo.js` | 308 | Alta, estado y baja. `validarAlta`, `planDeBaja`, `firmaPlan`, `asuntosPendientes` |
| `ausencias.js` | 212 | **El circuito humano** de una ausencia: solicitar → transitar → solapes → bandeja |
| `atencion.js` | 183 | La bandeja operativa |
| `pulso.js` | 176 | **Donde vive la promesa de anonimato**, «para que se pueda leer» |
| `periodos.js` | 130 | Periodos laborales, antigüedad, recontratación |
| `vigencia.js` | 113 | ¿Está esta persona laboralmente activa? |
| `ficha.js` | 102 | Antigüedad, **`documentosPorCaducar`**, timeline unificado |
| `usuario.js` | 59 | Generación del nombre de usuario |
| `matching.js` | 52 | **Empareja operadores de Ágora con fichas de trabajador** (Ágora solo expone el `UserName`) |

### Decisiones destacables

✅ **Periodo laboral ≠ contrato.** «Trabajó aquí entre estas fechas» es `rrhh_periodos`; las horas y
el sueldo son `hor_contratos` y pueden cambiar varias veces dentro del mismo periodo. Confundirlos
haría que el historial dijera «se fue y volvió cuatro veces» cada vez que alguien pasa de 20 a 30 h.

✅ **Índice único parcial**: una sola incorporación abierta por persona, garantizado **por la base**,
no por el código — «dos peticiones de recontratar a la vez pasan las dos la comprobación previa».

✅ **`fecha_baja` es el último día trabajado, inclusive**, con el mismo convenio en las tres tablas.

✅ **El encargado no ve los documentos `sensible`.**

✅ **`asuntosPendientes` y `documentosPorCaducar` ya están escritos** — es la materia prima de la
«bandeja de RR.HH.» que propongo como quick win (`29_QUICK_WINS.md` #27).

⚠️ **`matching.js`**: el emparejado con Ágora es heurístico sobre un nombre de operador. Si dos
trabajadores se llaman parecido, **INFERENCIA**: puede atribuir ventas a quien no toca.

---

## C · Módulos que no aparecían en ningún otro documento

| Módulo | L | Qué hace | Observación |
|---|---:|---|---|
| `web/web.service.js` | 94 | **Editor de la web pública.** `LANGS = ["es","ca","en"]`, `i18nKey(base, lang)` → `home_titulo_ca`. Bloques de página como JSON con `{es,ca,en}`. `missingLangs()` lista lo que falta traducir | ✅ Bien resuelto. El fallback a la clave base evita huecos en la web |
| `locales/zonas.js` | 60 | Los establecimientos agrupados por pueblo | Trivial |
| `mantenimiento/maintenance.service.js` | 136 | **«Contiene TODA la lógica de autorización y acceso a datos de los 3 endpoints. NO importa Express.»** | ⭐ **Es el único dominio con un servicio completo**, incluida la autorización. Es el modelo a seguir para extraer `server.js` (P1.7) |
| `campaigns/plantillas.js` | 129 | 10 plantillas de campaña **con «cuándo usarla»** | ✅ Detalle fino: el texto lo cambia cualquiera en 10 s; saber cuándo tiene sentido es lo que ahorra tiempo |
| `marketing/segmento.js` | 185 | `CAMPOS` — los 30 filtros válidos. **La única lista que manda** | ⭐ Pieza central de las campañas |
| `marketing/faltan.js` | 44 | «Filtros que nos piden y no tenemos» | Idea de producto excelente |
| `clientes/hechos.js` | 172 | Etiquetas, saneado y agrupación de los «hechos» de cliente | Estado propuesto→confirmado |
| `fichajes/{jornadas,revision,export}.js` | 474 | Construcción de jornada, firma de eventos, revisión por lotes, CSV del registro | ✅ El CSV es requisito legal |
| `agora/programacion.js` | 61 | Programación de la sincronización | |
| `reservas/agenda.js` | 100 | Estructura de la agenda del panel | |
| `.claude/preview-server.js` | — | Servidor estático para el prototipo `erp-preview` | 🧟 Herramienta de desarrollo, no del producto |
| `public/contabilidad.js`, `public/mantenimiento.js` | 129 | 🧟 Paneles legacy | Ver `23_DEUDA_TECNICA.md` |
| `public/logo-preview.html` | 50 | 🧟 Previsualización de logotipo | Borrable |

---

## D · Hallazgo del control de calidad

⭐ **`mantenimiento/maintenance.service.js` es el único dominio del sistema donde la autorización y
el acceso a datos viven en un servicio puro fuera de `server.js`**, con esta cabecera:

> «Contiene TODA la lógica de autorización y acceso a datos de los 3 endpoints. NO importa Express.
> Recibe explícitamente: conexión/adaptador…»

Es exactamente el patrón que haría falta para desmontar `server.js` (P1.7). **Existe, funciona,
tiene tests y se aplicó a un solo dominio** — el más pequeño. La plantilla para la refactorización
más importante del sistema ya está escrita dentro del propio repositorio.

**RECOMENDACIÓN**: al abordar P1.7, usar `maintenance.service.js` como molde en vez de inventar uno.
