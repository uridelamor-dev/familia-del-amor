# Medición de navegación publicada — 17/11/2026

Se midió el panel real https://familiadelamor.org/panel/ con sesión Dirección, todos los establecimientos y el histórico completo en Compras. La sesión inicial había caducado; se inició sesión antes de medir. Vista estrecha del navegador integrado.

Método: reloj externo desde antes del clic de navegación hasta que el navegador detectó el control que acredita contenido disponible. Las esperas se reanudaron dentro de la misma llamada, sin incluir pausas entre turnos. Los tiempos incluyen el coste de automatización y detección, por lo que son aproximados, no tiempos puros del servidor. Abrir el menú queda fuera de la medición. No se pudo consultar Resource Timing con la herramienta disponible. No se midieron consultas SQL ni se afirma atribución causal exacta.

| Pantalla | Señal de disponibilidad | Medidas (ms) |
|---|---|---|
| Compras | Seleccionar todas, tabla | 6095, 6974, 6244 |
| Proveedores | Seleccionar todos los proveedores visibles | 591, 559 |
| Productos | Tabla de productos | 1762 |
| Bancos | Selector Empresa o titular fiscal | 578 |
| Clientes | Tabla de clientes | 1398, 1141 |
| Campañas | Buscar envío, listado inicial | 929 |

Compras: mediana 6244 ms. Sus tres entradas cuantificadas son posteriores a la primera carga: no es solamente arranque en frío. La primera entrada superó el límite de observación de tres segundos; se excluye del cuadro por faltar hora exacta de finalización. Proveedores tuvo una primera entrada sin medición continua que también se excluye.

Bancos mide el formulario inicial, sin seleccionar cuenta ni cargar movimientos. Campañas muestra el listado de envíos. Productos muestra la tabla; no se cronometra por separado cada bloque secundario. No se detectaron errores/avisos en el registro de consola disponible al finalizar. El dashboard mostró datos parciales de TPV y actualización en curso: no se tomó la aparición de cifras guardadas como finalización de la lectura de Ágora. No se han medido todos los apartados ni distintos equipos/conexiones.

## Prioridades basadas en código, pendientes de medición interna

1. Compras: RECEPCION_REAL_SQL es una subconsulta correlacionada sobre facturas_recepciones. La lista la reutiliza al menos tres veces por documento (recibido_en, fecha_recepcion y recepcion_confirmada), y también al ordenar/filtrar por recepción. Estudiar un cálculo único por documento y los índices por resultado->>'facturaId' y hash. Conservar la fecha mínima, zona Europe/Madrid, fallback y filtros actuales.
2. Compras: SELECT * recupera drive_thumb desde la base y después lo elimina en JavaScript. Evitar transferir miniaturas en esta consulta. No eliminar campos que sí necesita la ficha de edición.
3. Distintivos: cargarDistintivos recupera cabeceras completas y todas las columnas de líneas para volver a calcular huellas; DISTINCT ON elige la última auditoría. Estudiar seleccionar primero esa última auditoría y recuperar únicamente los campos de la huella, conservando la comprobación de vigencia. Nunca servir un distintivo desactualizado para ganar velocidad.
4. Lista, totales y distintivos se esperan secuencialmente. Medir por etapa antes de paralelizar las partes independientes; no ocultar diferencias de filtro ni errores.
5. actualizarPagosEmpresa se ejecuta antes de devolver la lista y estadísticas, además del temporizador. Medir su coste antes de modificarlo: no introducir cachés que retrasen reglas o vencimientos corregidos.

Siguiente paso: instrumentar tiempos por etapa del servidor, optimizar primero Compras y comparar nuevamente en producción con el mismo ámbito y criterio. Objetivo orientativo: acercar la apertura habitual a 1–2 segundos, sin prometerlo antes de medir. Esta revisión no modifica código ni documentos contables, ni realiza publicación.

## Optimización preparada después del diagnóstico

Implementada localmente a petición del usuario:

- Consulta lateral agregada: calcula una recepción por factura y reutiliza ese resultado en fecha, confirmación, filtro y orden.
- Índices de recepción por ID de factura y por hash, ambos con fecha. Creación idempotente al arrancar el servidor publicado; no se ha ejecutado sobre producción.
- Lista/distintivos y totales se consultan en paralelo después de actualizar pagos. La respuesta sigue esperando todas las validaciones y devuelve error si alguna falla.
- Los distintivos eligen primero la última auditoría y recuperan únicamente los campos que usa la huella, incluidos ajustes, cargos y declaración documental. Sin caché de vigencia ni concesión automática de revisiones.
- Se conserva la interfaz de la lista, todos sus campos (miniatura retirada antes de responder como hasta ahora), permisos, límite de 500, totales completos y separación de albaranes.

Validación: 910 pruebas de regresión superadas sin saltos, más 4 pruebas específicas de carga/SQL superadas (estas últimas incluyen PostgreSQL embebido). Comparación de filas completas anterior/nueva, orden por emisión/recepción, filtros de local/tipo/periodo/referencia, recepción por ID y hash, fallback y ausencia de fecha, zona horaria, última auditoría e invalidación. Pruebas de fallo confirman que no se entrega una lista parcialmente validada.

Prueba sintética: 530 facturas y 3.000 recepciones, EXPLAIN ANALYZE del listado: 654,828 ms consulta anterior sin los índices nuevos; 6,032 ms nueva consulta con índices. Es un dato local sintético, no latencia esperada de producción. El tiempo completo del panel se debe volver a medir después de publicar.

Pendiente para después de publicar: repetir las tres entradas a Compras con todos los establecimientos/histórico y comprobar creación de índices. El nuevo código y las pruebas están preparados, todavía sin push ni despliegue en esta tarea.

## Revisión adicional antes del push — 18/11/2026

- Al refrescar Compras después de filtrar o guardar, tabla, avisos de calidad y totales se muestran juntos en cuanto llega la lista validada. La consulta de documentos sin asignar pasa a ejecutarse en paralelo con duplicados, recepciones y locales.
- El indicador de carga de la tabla ya no espera las consultas auxiliares. La promesa del refresco sí espera todas ellas: «Guardar y seguir» conserva su coordinación con la bandeja actualizada. Se mantienen las protecciones frente a respuestas tardías de otros filtros o pantallas.
- Las miniaturas pendientes se cancelan al sustituir el listado o navegar a otra pantalla; una respuesta tardía no crea imágenes para una tabla retirada. Los recursos de imagen se liberan también cuando falla su visualización.
- Pruebas nuevas verifican presentación inmediata y coherente, espera completa para continuar la revisión, errores de avisos, filtros sucesivos y cancelación de miniaturas.

Validación conjunta actual: 915 pruebas superadas, sin fallos ni saltos, incluidas las pruebas SQL con PostgreSQL embebido. Sin push ni cambios de documentos en producción. La mejora real de navegación queda pendiente de medir tras publicar.
