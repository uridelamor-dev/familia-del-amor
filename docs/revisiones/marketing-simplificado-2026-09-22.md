# Marketing simplificado — 22 de septiembre de 2026

## Resultado

La navegación habitual de Marketing tiene cinco entradas: Clientes, Campañas, Promociones y puntos, Reseñas y Web. Sara y WhatsApp se agrupan en Atención al cliente, manteniendo sus permisos anteriores.

Campañas reúne los accesos a mensajes, captación, automatizaciones y formularios/consentimientos. «Crear campaña» pregunta el objetivo y abre el editor existente correspondiente. El listado de mensajes aparece primero; la ayuda para redactar y las plantillas quedan plegadas. Cumpleaños tiene su propia pestaña.

Promociones y puntos distingue cupones, promociones en caja, programa de puntos y tarjeta de cliente. La tarjeta permanece exclusiva de Dirección. Los cupones emitidos y los canjeados se consultan desde una misma sección; emitir cupones es una acción. La consulta del carné en Clientes queda plegada. Se elimina el recorrido explicativo repetido de marketing.

Los puntos conservan su ruta y su permiso independiente. Si un usuario tiene puntos pero no promociones, mantiene un acceso propio en el menú. Si tiene promociones pero no Campañas, conserva un acceso a Captación. No se amplía ningún permiso.

Los enlaces de pestaña permiten recargar sin perder el sitio, por ejemplo `#campanas/auto`, `#promos/captacion`, `#promos/qr` y `#fidelizacion/reglas`. Las rutas antiguas siguen existiendo.

## Alcance y compatibilidad

Esta entrega reorganiza la interfaz y conecta los editores existentes. No fusiona registros de campañas ni altera los procesos del servidor. Enlaces públicos, códigos QR, canjes, consentimientos, bajas, colas, programación, reglas de puntos y controles de activación conservan su implementación. No introduce migraciones ni dependencias. No se publicaron cambios ni se enviaron mensajes.

Los formularios y las comunicaciones del programa mantienen su pantalla dentro de Campañas → Formularios y permisos. Los resultados de captación y de mensajes permanecen separados: no se atribuyen canjes a envíos sin una relación comprobada.

## Verificación

- Revisión general: 5.819 pruebas pasan, cero fallos. Se excluye el bloque preexistente «medido en Chrome», que necesita el navegador de pruebas restringido por el entorno.
- Seis pruebas nuevas comprueban navegación, permisos independientes, tarjeta exclusiva de Dirección y recuperación de pestañas.
- Después de los últimos ajustes visuales y de textos: 75 pruebas específicas pasan, comprobación de sintaxis y revisión de diferencias.
- Revisión visual con datos ficticios en 1440×800 y 390×844; campañas, selector de objetivos, editores existentes, automatizaciones y navegación de beneficios. Los textos del selector se adaptan al móvil.
- No se realizó un envío real ni un canje de producción. Los listados del entorno visual contienen datos ficticios o están vacíos; no equivalen a una validación con los registros reales.

## Antes de publicar el conjunto de mejoras

Esta reorganización no modifica la base de datos. Las mejoras de turnos anteriores sí incluyen migraciones: sigue pendiente validarlas en una base de pruebas antes de desplegar todo el conjunto. Debe sincronizarse con los cambios de GitHub/Replit y prever la reconexión de WhatsApp si el despliegue reinicia el servidor.
