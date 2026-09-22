# Panel: primera entrega de mejoras prácticas

## Problema y comportamiento nuevo

El inicio mostraba cero reservas mientras esperaba el periodo y podía aceptar respuestas de un local anterior. Ahora distingue carga, error y cero confirmado, e ignora respuestas que ya no pertenecen a la pantalla, local o periodo vigente. Las consultas siguen saliendo en paralelo.

Los resultados económicos quedan pendientes si falta una fuente. En una selección de varios locales se muestran avisos de datos parciales y no se calcula un resultado completo ni una comparación a partir de un subconjunto.

Las alertas críticas del inicio aparecen abiertas y antes del gráfico. En móvil los cuatro indicadores ocupan dos filas. La fecha del panel usa Europe/Madrid, también al cruzar medianoche.

Inventarios distingue falta de productos, ausencia de conteos, conteo en curso y último conteo cerrado. Reseñas distingue una respuesta guardada de su publicación en Google, que no se puede verificar con los datos actuales. Clientes explica que utiliza sus propios filtros y presenta la acción de comunicación como preparación. Usuarios muestra los establecimientos adicionales que explican por qué alguien aparece en el filtro de otro local.

Productos no presenta una tendencia ni un porcentaje de precio como fiable cuando hay lecturas dudosas o falta una unidad común; la fusión de locales conserva la falta de unidad común. Los importes originales siguen consultables. Las alertas de facturas antiguas proponen verificar el documento y el estado de pago antes de actuar.

## Validación

- 5.796 tests pasan, cero fallos, con `node --test --test-timeout=30000 --test-skip-pattern='medido en Chrome' 'tests/**/*.test.js'`.
- La suite automática «medido en Chrome» se excluye expresamente porque el navegador de Puppeteer no puede arrancar en este entorno. No se presenta como validada.
- Comprobación manual en el navegador de Codex con un servidor local de datos ficticios: inicio a 1440×800 y 390×844; reseñas y clientes sin desbordamiento horizontal a 390 px; ficha de usuarios con local adicional visible.
- Pruebas nuevas de respuestas fuera de orden, cambio de pantalla, fallo de carga, falta de fuentes, mezcla de unidades y fechas en Madrid.
- Sintaxis de JavaScript y `git diff --check` correctos.

## Alcance pendiente

Esta entrega no completa todo el informe de usabilidad. Quedan el recorrido completo de reservas, la revisión de datos reales (fechas, posibles duplicados y asignaciones), la organización integral de marketing, el editor web con borradores y las fichas públicas. Las agrupaciones de establecimientos se conservan: el código confirma que algunas son decisiones de negocio deliberadas. No se han modificado datos de producción, permisos, envíos ni conexiones.

## Integración y publicación

Aplicar primero en una rama de revisión; comprobar la versión más reciente de main porque Replit y otras tareas trabajan sobre el mismo repositorio. No requiere dependencias nuevas ni migraciones de base de datos. Antes del despliegue, probar con datos representativos y roles distintos. Según las instrucciones del proyecto, un redeploy puede desconectar la sesión de WhatsApp y requiere prever su reconexión. La vuelta atrás consiste en revertir el commit de esta entrega; no hay datos migrados que restaurar.
