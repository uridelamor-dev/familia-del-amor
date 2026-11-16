# Entrada de compras: preparación de publicación — 17/11/2026

## Estado

Cambios locales preparados; no publicados, sin push y sin modificar datos de producción en esta tarea. La revisión manual del histórico queda pausada en 215 cierres sobre un mínimo de 529 registros. No se dispara un barrido histórico por este trabajo.

## Comportamiento del ingreso

- Dos lecturas independientes de cabecera, emisor, receptor y resumen fiscal. Solo los desacuerdos provocan una tercera lectura dirigida; no hay bucle de llamadas hasta obtener un resultado favorable.
- Cuando la duda afecta a productos, la tercera lectura pide también el detalle. Se conserva como evidencia; no se reemplazan silenciosamente productos discrepantes por una propuesta sin corroborar.
- Antes del alta, controles de identidad, fechas literales, tipo de documento, abonos, impuestos y detalle. Que base más IVA coincida con total no valida por sí solo los productos.
- Las líneas con incertidumbre expresa, importes ausentes en documentos valorados, cantidades/precios incoherentes o sumas incompatibles generan revisión. El control de ingreso permite pequeños redondeos por línea, no una diferencia proporcional del 1 % que podría esconder 50 € sobre 10.000 €.
- Los albaranes legítimamente sin precio y los servicios sin cantidades físicas no se convierten automáticamente en errores. IVA incluido, cargos de la base y ajustes fiscales tienen tratamiento explícito.
- Una cabecera elegida por contraste vuelve a comprobarse con el detalle que realmente se conservará: no se combina una base de 200 € con productos de 100 €.
- El documento con contradicciones permanece en recepción, con original y lecturas, antes de contabilizarse. La corrección humana exige confirmación; si conserva avisos necesita excepción explícita y no sirve como identidad limpia para aprendizaje.
- La fecha confirmada por la persona prevalece sobre la transcripción OCR antigua. Una fecha futura conserva un aviso específico, incluso al aprobar.
- La memoria de NIF utiliza identidades confirmadas; repetir un error de OCR en el histórico no lo convierte en verdad. No se aprende nuestro NIF como el del proveedor.

## Guardado, orden y revisión

- Nombre y carpeta de Drive se derivan del registro vigente. Cambiar el tipo también deja pendiente actualizar el nombre.
- Se comprueban identidad del archivo, papelera, nombre, carpeta y preservación del contenido. Si se edita durante la operación, queda pendiente de reintento; un fallo individual no bloquea toda la tanda.
- Una fecha imposible no se presenta como una fecha válida en el nombre del archivo.
- Se preservan los originales y los reintentos técnicos; un fallo de conexión no equivale a documento ilegible.
- Las correcciones de líneas mantienen precisión y protección frente a concurrencia. Los subtotales descartados no vuelven al catálogo como productos.
- Corregido además un error real que devolvía 500 al consultar el diccionario de productos después de retirar una variable antigua de local.
- El distintivo «Revisado al 100 %» sigue reservado al cotejo manual. Validación automática no significa ausencia garantizada de errores.

## Evidencia de pruebas

Batería específica final: 979/979, cero fallos, cero omisiones. Incluye módulos de facturas, altas, contraste, fechas, identidad, abonos, IVA, cargos, relecturas, Drive, permisos de consulta y edición, precisión y diccionario.

Base de datos PostgreSQL embebida (PGlite): 20/20, cero omisiones. Recepción/aprobación, persistencia, reinicio/reintentos, memoria, permisos/transacción, tandas, sincronización IVA/Drive y exclusión de conceptos descartados. Una prueba adicional de migraciones verifica ejecución repetida, columnas necesarias y conservación de datos.

Sintaxis: facturas.js, server.js y public/panel/app.js; git diff --check sin errores.

Se actualizaron fixtures obsoletos manteniendo o ampliando sus comprobaciones de permisos, conflictos y transacciones. El adaptador PGlite usa exec para SQL múltiple sin parámetros y query para SQL parametrizado.

## Límites de esta validación

- Las respuestas de IA y Google se simulan en los tests; no se mide aquí la precisión del modelo sobre nuevas fotos reales. No se enviaron mensajes reales ni se gastaron llamadas de lectura IA durante las pruebas.
- PGlite ejecuta SQL PostgreSQL, pero no sustituye una prueba de concurrencia real entre procesos ni de arranque completo en el alojamiento.
- La batería general inicial de toda la aplicación tenía 83 fallos: incluye limitaciones de apertura de puertos, fixtures obsoletos y expectativas de otros apartados. Se resolvieron los fallos encontrados en el ámbito específico anterior. No se afirma que toda la aplicación tenga su batería global verde.
- Los controles pueden reducir errores y detectar excepciones; dos lecturas aún pueden coincidir en un error plausible. Conviene comprobar una muestra de las primeras entradas tras publicar antes de reducir la supervisión habitual.

## Publicación

Incluir los módulos nuevos junto con los archivos modificados: identidad-confirmada, tipo-documento, abonos/abono-signos, ajustes-fiscales, cargos-base y conciliar-decision. Las migraciones son aditivas; no sustituir la base, secretos ni documentos con una copia local. No mezclar archivos ajenos a compras (tienda, salida generada o vistas de prueba de tarjeta).

Tras publicar, verificar una recepción clara, una con emisor dudoso y una con líneas incoherentes, y comprobar en Drive nombre y carpeta. Esta comprobación externa queda para el despliegue; no marcarla como realizada en local. La publicación no supone una auditoría retrospectiva de todo el histórico.

## Modal de revisión unificado

Completado localmente el 17/11/2026, sin publicación ni cambios en documentos reales:

- Facturas registradas, recepción, pendientes de asignación y repaso histórico comparten original a la izquierda y datos agrupados en Quién, Documento e Importes. Duplicados conservan la comparación entre documentos y el pie de decisiones común.
- Motivos visibles y accesos a los campos señalados; al pulsarlos se abren las secciones plegadas necesarias y se enfoca el campo.
- Segunda lectura y ajustes secundarios plegados; eliminar/cambiar pago en Otras acciones. Los productos mantienen su revisión independiente y guardado existente.
- Pie de acciones visible, validación obligatoria conservada y botones externos vinculados a su formulario. Guardar y abrir siguiente solo aparece cuando hay siguiente en la bandeja actual.
- Guardar no equivale automáticamente a revisión manual completa. Se mantienen los filtros y posición al continuar.

Validación específica final: 46/46 pruebas, cero omisiones, incluidos DOM con HappyDOM, formularios, avisos, continuación, precisión e IVA. Prueba en navegador con datos ficticios: 37 comprobaciones correctas tanto en escritorio como en 390 × 844, incluido pie dentro del modal y ausencia de desbordamiento horizontal del pie. Captura de escritorio en /tmp/modal-revision-final.png. Comprobación manual del acceso al campo Fecha en móvil. Sintaxis y git diff --check correctos.

Estas pruebas no guardaron documentos en producción ni sustituyen el chequeo de integración tras desplegar. El harness usa el código real del modal y datos simulados; no se afirma una validación integral de toda la aplicación.
