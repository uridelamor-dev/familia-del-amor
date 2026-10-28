# Pendientes de Familia del Amor

Actualizado: 13 de octubre de 2026. Lista de seguimiento basada en los acuerdos de esta conversación. Las comprobaciones en producción pendientes no implican que siga existiendo el fallo: falta confirmar el resultado real.

## Mejoras aplazadas

- **Dashboard — aplazado por Uriel el 28/10/2026.** Comparar ventas, gastos y resultado con un periodo elegible; tabla ordenable por locales; gráfico de ventas con periodo de referencia; abrir las facturas desde el importe de gastos conservando filtros; aclarar el resultado que no incluye personal; evitar duplicar ventas y relegar reservas y reseñas. Retomar cuando se solicite.

- **WhatsApp: evaluar migración a la API oficial — aparcado por Uriel el 19/10/2026.** Mantener el número actual y la integración Baileys sin cambios por este estudio. Antes de retomar: confirmar elegibilidad y estado de los recursos Meta, resolver cuentas antiguas desactivadas, decidir coexistencia o uso exclusivo desde el panel y estudiar los requisitos OBA/límites de la API de grupos. Probar con un número separado antes de tocar producción; preservar historial y los flujos de facturas, avisos y atención al cliente. No migrar, desconectar ni activar costes sin retomar expresamente la tarea.

- **Informe mensual de reseñas — piloto privado a Uriel.** Implementado localmente el 14/10/2026, pendiente de publicar y comprobar recepción real. Solo 622149946: septiembre una vez al publicar (10:00–21:00 Madrid, con WhatsApp conectado); octubre el 1/11/2026 desde las 10:00. Sin entregas posteriores ni destinatarios locales. Resumen general y mensaje por ficha vinculada, uno por minuto, con cantidad, media mensual ponderada, nota global oficial a fecha de consulta, temas con evidencias y prioridades. Informes y originales en Reseñas → engranaje → Informes mensuales (dirección). Guarda estado en config bajo claves fijas, bloqueo entre procesos y pausa ante envío incierto. Confirmar en WhatsApp los casos inciertos antes de cualquier recuperación manual; no se reenvían automáticamente.

- **Privacidad: completar documentación por responsable.** La versión 4 identifica Del Amor Uriel SLU, Mateu Del Amor Salinas y Pilar Ayllón Torres con NIF del panel y domicilio Camí Ral, 8, confirmado por Uriel el 13/10/2026. Quedan contacto electrónico por entidad, inventario contractual de proveedores/transferencias y conservación concreta. Para La Pepa siguen pendientes evidencia del consentimiento Fourvenues, acuerdos y configuración Resend, seguimiento y baja; no activar campañas por esta actualización.

- **Chat dentro del panel — aplazado expresamente por Uriel.** No implementarlo ahora. Primera fase propuesta: consultas, exportación de facturas con filtros y preparación de uniones de proveedores. Después, borradores de campañas y gestión de personas. Reutilizar funciones y permisos del panel; mostrar revisión antes de operaciones que modifican datos y confirmar antes de enviar campañas. Evaluar esfuerzo y utilidad antes de comenzar.
- **Ágora: fidelización desde la pantalla de pagos.** Uriel envió a Satur la petición de poder añadir la fidelización al cobrar sin volver al ticket individual. Pendiente de respuesta/viabilidad de Ágora. Ya se encontró cómo gestionar varias fidelizaciones; no confundirlo con este atajo pendiente.

## Dependencias externas

- **Reseñas de Google en el panel.** Pendiente de verificar aprobación de Google Business Profile API para marketing@la-tapeta.com. Solicitud del 6 de octubre, caso 3-7399000042181, proyecto familia-del-amor-ressenyes (257837281629). Google indicó 7–10 días hábiles. Revisión prevista para el 13 de octubre. Después, completar y probar importación y publicación de respuestas. El fallo local que impedía abrir Reseñas ya está corregido; eso no confirma la aprobación de Google.

## Publicación y comprobaciones reales

- **Publicar los cambios locales recientes.** Incluyen revisión/eliminación de documentos, categorías en Sheets, sincronización de cambios con Drive/Sheets, desglose de varios IVA e históricos, corrección de carga de Reseñas y unión de proveedores. Confirmar estado del repositorio antes del siguiente push; no dar por publicado lo preparado localmente.
- **Drive y Sheets.** Comprobar en producción que la organización anual y el archivado de hojas antiguas han terminado y que no quedan archivos inaccesibles. Verificar también una factura antigua modificada, la actualización de categoría/color y el desglose de IVA. No consta en esta revisión una verificación final de todo el proceso en producción.
- **Audios de WhatsApp de Sara.** Confirmar con una prueba real y registros del servidor que se descarga y transcribe el audio tras las correcciones. Hubo fallos repetidos; no cerrar este punto sin una prueba satisfactoria verificable.
- **Duplicados reales de Virutas Branco.** Comparar las dos fichas en producción y utilizar la nueva unión tras publicar. No se han unido desde la vista local, que utiliza datos ficticios.
