# Pendientes de Familia del Amor

Actualizado: 7 de octubre de 2026. Lista de seguimiento basada en los acuerdos de esta conversación. Las comprobaciones en producción pendientes no implican que siga existiendo el fallo: falta confirmar el resultado real.

## Mejoras aplazadas

- **Chat dentro del panel — aplazado expresamente por Uriel.** No implementarlo ahora. Primera fase propuesta: consultas, exportación de facturas con filtros y preparación de uniones de proveedores. Después, borradores de campañas y gestión de personas. Reutilizar funciones y permisos del panel; mostrar revisión antes de operaciones que modifican datos y confirmar antes de enviar campañas. Evaluar esfuerzo y utilidad antes de comenzar.
- **Ágora: fidelización desde la pantalla de pagos.** Uriel envió a Satur la petición de poder añadir la fidelización al cobrar sin volver al ticket individual. Pendiente de respuesta/viabilidad de Ágora. Ya se encontró cómo gestionar varias fidelizaciones; no confundirlo con este atajo pendiente.

## Dependencias externas

- **Reseñas de Google en el panel.** Pendiente de verificar aprobación de Google Business Profile API para marketing@la-tapeta.com. Solicitud del 6 de octubre, caso 3-7399000042181, proyecto familia-del-amor-ressenyes (257837281629). Google indicó 7–10 días hábiles. Revisión prevista para el 13 de octubre. Después, completar y probar importación y publicación de respuestas. El fallo local que impedía abrir Reseñas ya está corregido; eso no confirma la aprobación de Google.

## Publicación y comprobaciones reales

- **Publicar los cambios locales recientes.** Incluyen revisión/eliminación de documentos, categorías en Sheets, sincronización de cambios con Drive/Sheets, desglose de varios IVA e históricos, corrección de carga de Reseñas y unión de proveedores. Confirmar estado del repositorio antes del siguiente push; no dar por publicado lo preparado localmente.
- **Drive y Sheets.** Comprobar en producción que la organización anual y el archivado de hojas antiguas han terminado y que no quedan archivos inaccesibles. Verificar también una factura antigua modificada, la actualización de categoría/color y el desglose de IVA. No consta en esta revisión una verificación final de todo el proceso en producción.
- **Audios de WhatsApp de Sara.** Confirmar con una prueba real y registros del servidor que se descarga y transcribe el audio tras las correcciones. Hubo fallos repetidos; no cerrar este punto sin una prueba satisfactoria verificable.
- **Duplicados reales de Virutas Branco.** Comparar las dos fichas en producción y utilizar la nueva unión tras publicar. No se han unido desde la vista local, que utiliza datos ficticios.
