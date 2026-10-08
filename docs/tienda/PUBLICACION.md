# Tienda · presentación en modo demostración

Ruta pública: `/tienda/`. Panel existente: `#tienda`, dentro de Marketing.

La primera consulta crea únicamente `tienda_config` y `tienda_registros`, en una transacción con bloqueo. La semilla no sobrescribe datos existentes. No se importan datos de la demo local. El interruptor `TIENDA_ENABLED=false` desactiva la API. La página tiene `noindex` y no está enlazada desde la portada durante la presentación.

La versión se inicia en demostración, sin instrucciones bancarias reales, cobros, emails ni WhatsApp. Las solicitudes se identifican como DEMO; se guardan de forma separada de otros módulos. Los cambios de catálogo y las fotos subidas se guardan en PostgreSQL y sobreviven al redeploy. Solo Dirección dispone inicialmente de todas las capacidades; el módulo no concede operaciones sensibles automáticamente a Marketing.

Edición disponible: nombres CA/ES, formatos, coste confirmado/estimado, venta, IVA, visibilidad, archivo, fotografía, composición de los cuatro lotes, coste de preparación y tarifas de entrega. Pedidos y presupuestos con historial, verificación manual del ingreso, PDF y Excel de resultados filtrados.

Los precios del catálogo y las fotos son provisionales. El margen se comprueba con costes confirmados y preparación, después de los descuentos. Una venta real se bloquea si no se puede comprobar el mínimo del 30%. No hay activación de venta real disponible en esta entrega.

Pendiente para venta real: costes/formatos/IVA reales, derechos y correspondencia de las fotos, capacidad de cajas, costes y condiciones de transporte, personalizaciones valoradas, aceptación de condiciones y privacidad, notificaciones transaccionales y proceso de aceptación de presupuestos por el cliente. Las personalizaciones solicitadas quedan pendientes de valoración, nunca se presuponen gratuitas. El objetivo de esta publicación es enseñar y editar la propuesta, no empezar a cobrar.

Validación: pruebas de cálculo, permisos, margen, idempotencia, copia histórica, API, PDF y XLSX. Se ha probado edición en el panel de demo y lectura del cambio en la tienda. No se ha ejecutado una migración ni tocado una base de producción desde el equipo local.
