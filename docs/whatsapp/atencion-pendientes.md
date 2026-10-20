# Atención y recuperación de conversaciones

Preparado el 20 de octubre de 2026. Pendiente de publicar y comprobar en producción.

- Una consulta derivada por Sara no bloquea las siguientes preguntas seguras. Pedir expresamente una persona o tomar el relevo manual sí bloquea a Sara.
- Las tareas persisten en `wa_atencion`; muestran responsable, resumen y estado. «Resuelta · devolver a Sara» cierra el pendiente y reactiva todas las identidades conocidas.
- Cada minuto se revisan entradas recientes. Solo se intenta recuperar el último texto entrante de entre 5 minutos y 72 horas que no tenga procesamiento, respuesta, cierre o intervención humana registrados. La reclamación se guarda antes de ejecutar para evitar repetir acciones ante un reinicio incierto.
- Las entradas sin respuesta de los últimos 7 días y las pausas previas generan tareas. No se reproducen automáticamente mensajes antiguos ni adjuntos. Un procesamiento incierto requiere revisión humana.
- Avisos agrupados a marketing y escalado a dirección, de 10:00 a 21:00 Madrid. Niveles a los 0, 30 y 60 minutos desde la apertura (tiempo transcurrido, no horario laborable); máximo 20 tareas por aviso. No es un aviso por cada mensaje. Un aviso cuya entrega falla queda señalado en el panel.
- No se cambia la campaña PEPAWEEN ni se reemplazan datos de producción. El arranque añade tablas y permite respuesta nula en el historial para registrar mensajes atendidos por humanos sin inventar una respuesta de Sara.

Validación local: 169 pruebas correctas, 0 fallidas, 3 omitidas; incluye PostgreSQL temporal aislado. Vista de conversación comprobada con datos ficticios a 390 y 1440 píxeles.

Tras publicar: comprobar conexión de WhatsApp, una solicitud nueva de reserva, una consulta derivada con un segundo mensaje y una conversación tomada manualmente. Verificar recepción real de los avisos. Los casos antiguos, incluido el de Carla, deben revisarse en el panel antes de confirmar o cancelar reservas.
