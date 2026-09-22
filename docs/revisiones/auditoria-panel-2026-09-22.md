# Auditoría del panel: rendimiento, funcionamiento y practicidad

Fecha: 22 de septiembre de 2026. Copia local de Familia del Amor; foco en la reorganización de Marketing y comprobación general de las demás pantallas.

## Dictamen

La reorganización abre correctamente y conserva los accesos comprobados. La auditoría sí encontró fallos que las pruebas anteriores no cubrían: carga innecesaria, errores presentados como datos vacíos, respuestas antiguas y una métrica de conversión mal atribuida. Se han corregido en la copia local.

No debe considerarse una certificación de producción: no se ha podido ejecutar la aplicación contra una base PostgreSQL de pruebas ni medir sus consultas con los datos reales. No se ha publicado ni enviado ninguna campaña.

## Funcionamiento: hallazgos y correcciones

| Hallazgo | Efecto práctico | Resultado |
|---|---|---|
| Un fallo al leer cumpleaños se convertía en «desactivado» y mensaje vacío | Se podía confundir un error con la configuración real | Ahora aparece un error con reintento y no se permite guardar sin haber cargado la configuración |
| Cumpleaños dependía del listado de campañas y de otros datos que no utiliza | Un fallo del historial impedía abrir una automatización válida | Carga independiente de una sola consulta |
| Dos cargas podían terminar en orden inverso | Una respuesta antigua podía sustituir campañas o cupones más recientes | Se verifica la carga vigente, la pestaña y la pantalla antes de aplicar el resultado |
| El selector podía abrir un editor aunque su carga hubiera fallado | Se ofrecían datos incompletos o antiguos | El editor solo se abre después de una carga satisfactoria; se elimina una consulta duplicada de captación |
| Fallos de formularios y comunicaciones podían parecer listas vacías | Daba la impresión de que no existían configuraciones | La pestaña muestra un error cuando no puede leer esos datos esenciales |
| Captación dividía los canjes de la promoción completa entre las altas de una campaña | Si varias campañas comparten promoción, el porcentaje no mide su conversión | Se retira el porcentaje y se identifica la cifra como «Canjes de la promoción», con explicación del alcance |
| El detalle de una campaña quedaba al extremo derecho de una tabla ancha | En móvil había que deslizar para encontrarlo | El nombre de la campaña también abre el detalle |
| La API devuelve solo las 50 campañas más recientes | El usuario podía interpretar el listado como historial completo | Se muestra una indicación cuando se alcanza ese límite; sigue pendiente consultar el historial anterior |

La corrección de la métrica no inventa una atribución nueva. La consulta actual cuenta canjes por `promocion_id`, no por campaña. Calcular una conversión real requiere definir y validar la relación entre inscripción, cupón y canje, incluidos los registros históricos.

## Rendimiento

Se ejecutaron los cargadores reales del panel en un entorno controlado, con una respuesta simulada de 25 ms por consulta. La comparación excluye la libreta opcional de filtros que se consulta en segundo plano.

| Pantalla | Consultas antes | Consultas después | Tiempo del cargador en la simulación |
|---|---:|---:|---:|
| Mensajes, primera carga con acceso a promociones | 13 | 4 | 79 → 26 ms |
| Cumpleaños | 13 | 1 | 78 → 27 ms |

Estos milisegundos no representan la velocidad de producción ni el tiempo de dibujo del navegador. Demuestran que se han eliminado dependencias y esperas innecesarias. Captación también solicita en paralelo sus tres recursos independientes.

El archivo principal del panel ronda 1,2 MB sin comprimir; en la medición previa a las correcciones, gzip lo reducía a 344.253 bytes. La hoja de estilos medía 116.405 bytes, o 32.093 comprimidos. El servidor ya aplica gzip y revalidación mediante ETag; el servidor visual de pruebas no reproduce esa compresión.

El panel sigue cargando un archivo grande con todas las funciones. Dividirlo por módulos sería una mejora de mantenimiento y de primera carga, pero no es necesario hacer esa refactorización para conservar estas correcciones. No se ha medido el rendimiento en teléfonos antiguos ni bajo concurrencia real.

## Pruebas realizadas

- Ocho pruebas nuevas sobre solicitudes innecesarias, fallos de configuración, dependencia del historial, respuestas fuera de orden, apertura del editor tras un error, atribución de canjes, fallos de formularios y cupones obsoletos. Todas pasan. Los cinco primeros casos se reprodujeron como fallos antes de la corrección.
- Batería general automatizada: 5.827 pruebas pasan, cero fallos. Sintaxis y revisión de diferencias correctas.
- 25 rutas/pestañas en 1440×800 y las mismas 25 en 390×844: 50 comprobaciones sin pantalla en blanco, sin el error general de carga y sin desbordamiento horizontal de la página.
- Las rutas incluyen campañas, automatizaciones, formularios, captación, cupones, canjes, puntos, inicio, reservas, comunicados, equipo, horarios, fichajes, compras, productos, analítica, clientes, reseñas, web, Sara, incidencias, inventarios, WhatsApp, Ágora y usuarios.
- Pruebas adicionales con 50 campañas, 300 cupones y 300 canjes ficticios, en ordenador y móvil. Las tablas conservan su desplazamiento horizontal interno cuando es necesario.
- Configuración ficticia de cumpleaños activada y mensaje personalizado conservados. El editor de mensajes recibe las cinco promociones de prueba, además de la opción sin cupón.
- Sin errores ni advertencias en el registro del navegador consultado durante el barrido.

El barrido verifica el renderizado y la navegación, no todas las operaciones de cada módulo. Parte de las respuestas son vacías o ficticias. No demuestra la velocidad de PostgreSQL, la entrega real de WhatsApp, el canje contra Ágora ni la publicación efectiva en Google. El bloque automatizado preexistente «medido en Chrome» se excluye por las restricciones del navegador de pruebas; la revisión visual se realiza con el navegador disponible.

## Practicidad: lo que todavía conviene mejorar

1. **Historial y búsqueda.** Campañas se limita a 50 registros y cupones/canjes a 300. Falta paginación y un acceso claro al histórico. Un borrador antiguo puede quedar fuera de la lista. La nueva indicación evita confundir el alcance, pero no resuelve la búsqueda histórica.
2. **Tablas en móvil.** No desbordan la página, pero requieren desplazamiento lateral. La lista de 300 cupones genera unos 4.230 elementos dentro de la vista. Conviene paginar y priorizar nombre, estado y acción principal antes de incorporar más columnas.
3. **Resultados por campaña.** La cifra de canjes ya está correctamente rotulada, pero falta una atribución comprobable para comparar la eficacia de distintos anuncios.
4. **Formularios y permisos.** Sigue siendo la parte más técnica de Marketing. La separación actual conserva controles importantes; una futura simplificación debe mantener las versiones de consentimiento y las aprobaciones.
5. **Entrada al panel.** La reducción de consultas ayuda; dividir la carga del archivo principal por módulos es una mejora posterior que necesita su propia comprobación.

## Validación pendiente antes de publicar

Se intentó crear una base PostgreSQL 16 temporal, sin credenciales ni datos de producción. El arranque falló al crear la memoria compartida: `shmget: Operation not permitted`; PostgreSQL retiró el directorio temporal incompleto.

Por tanto, siguen pendientes las migraciones y las operaciones completas de las mejoras anteriores contra una base de pruebas. Después deben comprobarse las integraciones con registros de prueba controlados, sincronizar los cambios de GitHub/Replit y preparar la reconexión de WhatsApp si el despliegue reinicia el servidor.

Las correcciones de esta auditoría solo cambian el panel y sus pruebas; no añaden migraciones ni modifican la lógica de envío, emisión de cupones, canje o puntos del servidor.
