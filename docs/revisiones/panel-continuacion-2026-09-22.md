# Continuación de mejoras del panel y la web

22 de septiembre de 2026. Rama de revisión `mejoras-panel-practicidad`, sobre `github/main` 349f5f7. Complementa la primera entrega 5684b76. No se ha desplegado ni se han modificado registros de producción.

## Cambios implementados

### Operación

- Reservas: edición de nombre, día, hora y personas; llegada, en mesa, finalizada y no presentada; mesa/zona y notas internas. Validación de fecha real, hora, tamaño de grupo y días bloqueados. Control de versión y comparación con la reserva original para detectar cambios concurrentes; historial con autor y antes/después.
- Editar una reserva es una gestión interna y la pantalla indica que hay que acordar los cambios con el cliente. No se añaden envíos de WhatsApp al guardar. Si cambia el día, se mueve el seguimiento pendiente identificable; se conserva si hay otra reserva de esa misma visita. Antes de enviar seguimiento se comprueba que siga existiendo una visita compatible; se omiten canceladas y no presentadas.
- Incidencias: responsable o proveedor y fecha objetivo. Se ven las tareas sin asignar y las vencidas. Cambiar organización no vuelve a resolver una preventiva ni modifica su estado. Hay control de concurrencia y se conserva la autorización existente, incluido PERMISOS_V2.
- Comunicados: borrador durante la sesión del panel, revisión de texto/destinatario/vigencia antes de publicar, fecha de caducidad opcional y confirmación explícita de lectura desde el espacio del trabajador. Publicación y lectura son métricas distintas. Un trabajador solo consulta los comunicados vigentes de su local; la confirmación es idempotente y no permite confirmar anuncios de otro equipo.

### Inicio, equipo y datos

- El inicio ordena las tareas por urgencia, conserva todas las tareas de la lista y ofrece solo las correspondientes a módulos permitidos.
- El objetivo de conversaciones usa empleados activos y conversaciones de ese mismo local. Una consulta fallida no se interpreta como cero conversaciones. Se prioriza completar teléfonos cuando faltan. El aviso de contactos incompletos del equipo queda visible.
- Compras muestra «Datos por revisar» en la lista actual: fechas imposibles/futuras, falta de local, importes ausentes/cero, lecturas marcadas y coincidencias de proveedor/número/local/ejercicio. No declara duplicados ni corrige registros automáticamente. Indica explícitamente que esos importes siguen incluidos en los totales y abre la ficha existente, con el documento original.
- Se mantienen las correcciones de la primera entrega sobre cargas del inicio, resultados parciales, reseñas, inventarios, unidades de compra, ámbito de Clientes y locales adicionales de Usuarios.

### Marketing y edición web

- Clientes, Campañas y Promociones comparten una guía de pasos que conduce a captación, audiencia, beneficio, preparación/envío y canjes. Se aprovecha el formulario de campañas existente, que ya conserva filtros de Clientes, previsualiza mensajes y relaciona promociones. Envíos y canjes siguen siendo registros separados: no se inventa una atribución común.
- Editor web con borradores privados persistidos por autor. El guardado se serializa para que una respuesta lenta no sustituya cambios nuevos.
- Publicación explícita, transaccional, con revisión de campos; comparación con la versión publicada; conflicto si alguien publicó mientras se editaba; posibilidad de resolverlo campo a campo.
- Cada publicación conserva el contenido anterior. Recuperar una versión crea un borrador, no publica. Las revisiones de borrador usan una secuencia para no reutilizar números después de publicar o descartar.
- Vista previa en el marco y en una pestaña nueva; no envía formularios. Las páginas públicas normales nunca cargan el borrador. Los textos originales se muestran como referencia en los campos vacíos.
- Controles principales visibles antes de la configuración de medición, que queda plegada al final. No se modifica la lógica de Meta, sus credenciales ni el consentimiento.

### Web pública y móvil

- «Reservar aquí» en las fichas de restaurantes conserva el establecimiento; el selector visible es el campo nativo que se envía.
- Horarios desconocidos invitan a consultar al local en lugar de inventar 08:00–00:00.
- Indicaciones desde la dirección disponible; mapas con URL http/https válida y título accesible.
- Historia, curiosidades y galerías vacías dejan de mostrar relleno. La foto de portada utiliza la primera foto existente del local cuando la hay.
- El formulario aclara que los grupos de 9 o más requieren aceptación del local.
- Agenda, formularios y editor adaptados a 390 px; corregido el ancho de los modales. Navegación de locales del editor en una fila desplazable en móvil.

## Verificación y límites

- Batería general: 5.813 pruebas, cero fallos, con `node --test --test-timeout=30000 --test-skip-pattern='medido en Chrome' 'tests/**/*.test.js'`.
- Incluye 17 nuevas pruebas de lógica, permisos, aislamiento por local, conflictos, reversión transaccional simulada, recuperación, reprogramación y respuestas de guardado fuera de orden.
- Se excluye expresamente la suite «medido en Chrome»: Puppeteer no arranca en este entorno. El contador de Node no representa estas pruebas como verificadas.
- Revisión manual en navegador a 1440×800 y 390×844. Recorridos probados con datos ficticios: guardado/publicación/recuperación de borrador, reserva con mesa y notas, revisión/publicación de comunicado, responsable y fecha de incidencia, y ficha pública → reserva con local preseleccionado. Se comprueba ausencia de desbordamiento horizontal en las vistas revisadas.
- JavaScript y `git diff --check` correctos.
- Las pruebas de transacciones usan un adaptador simulado. No se ha ejecutado la nueva migración contra PostgreSQL real: el entorno impide crear la memoria compartida de una instancia temporal (`shmget: Operation not permitted`). Antes de publicar hace falta comprobar las migraciones y los recorridos con una base de pruebas, además de los roles y las integraciones reales. No se presenta este punto como validado.

## Datos y decisiones que no se han inventado

La revisión de registros reales (fechas de facturas, posibles duplicados, unidades, asignación de documentos y teléfonos del personal) exige contrastar documentos y datos de negocio. Las nuevas bandejas permiten hacerlo; no se han alterado esos registros en producción.

No se ha elegido arbitrariamente entre los números de WhatsApp distintos de las páginas ni se han inventado horarios, aforos o mapas de mesas. Tampoco se han activado wallet, puntos o campañas. Las agrupaciones de establecimientos documentadas se conservan. Horarios y Fichajes ya tienen generación, cobertura, validaciones, versiones y trazabilidad: no se sustituyen esas herramientas ni se alteran los libros inmutables. La guía de marketing facilita el recorrido existente; no equivale a construir un nuevo sistema de atribución comercial entre campañas y visitas.

## Integración y vuelta atrás

No hay nuevas dependencias npm. Hay cambios aditivos de esquema, ejecutados por la inicialización existente: campos de sala e historial de reservas, campos de organización de incidencias, vigencia y lecturas de comunicados, borradores/versiones web y secuencia de revisiones.

Integrar primero en una rama de pruebas con una copia de base de datos; comprobar también los permisos por local y dos sesiones editando a la vez. Revisar el último main porque otras tareas y Replit trabajan en el mismo proyecto. Para volver al código anterior basta revertir este commit y conservar las columnas/tablas nuevas: no deben eliminarse las versiones o historiales durante una reversión. Las publicaciones de contenido se recuperan mediante versiones, como borrador.

El despliegue no se ha ejecutado. Las instrucciones del proyecto advierten que un redeploy puede desconectar WhatsApp y requiere prever su reconexión.
