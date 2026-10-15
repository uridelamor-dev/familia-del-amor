# Solicitudes de tienda sin compra directa · 15/10/2026

El carrito público termina en «Solicitar pedido». Nombre y teléfono son obligatorios; empresa y comentarios son opcionales. No pide email, NIF, tarjeta ni transferencia. `/orders` y `/quotes` públicos rechazan compras; `/requests` guarda una solicitud real, aunque la configuración histórica del catálogo siga marcada demo.

La solicitud (`quotes`, fuente `tienda_lotes`), el alta/reutilización del lead por teléfono, el hecho CRM «Interesado en lotes» y el aviso se guardan en la misma transacción PostgreSQL. Una repetición con la misma clave no duplica registros. El consentimiento opcional de próximas campañas se conserva con texto, idioma, fecha y finalidad en la solicitud; no habilita marketing general ni revoca bajas. No hay campañas automáticas nuevas.

En Marketing → Tienda / Lotes → Presupuestos se ven teléfono, enlace a WhatsApp, selección, consentimiento, estado del aviso y seguimiento Nueva/Contactado/Cerrada/No realizada. En CRM, «Lo que sabemos» permite ver el interés por campaña.

En producción el worker revisa cada 15 segundos y envía al 622149946 (mismo destinatario de los informes mensuales). No envía al cliente. Si WhatsApp está desconectado, espera. Usa bloqueo entre procesos y cola persistente: los reinicios conservan pendientes. Si un envío tiene un resultado incierto o se interrumpe mientras se envía, queda «Revisar entrega antes de repetir»; no se reenvía a ciegas. El estado Enviado confirma aceptación por el servicio, no lectura en el móvil.

Publicación: desplegar estos cambios con TIENDA_ENABLED distinto de false y campaña pública activa. Reconectar WhatsApp si el despliegue lo requiere. Validar después con una solicitud identificada de prueba y confirmar recepción en el teléfono; esta comprobación real queda pendiente mientras solo está preparado localmente. No requiere configurar IBAN ni activar compra directa.

Validación local: 69 pruebas de tienda/CRM; PostgreSQL aislado con concurrencia, rollback y registro conjunto; formulario 1440×800 y 390×844, envío completo hasta referencia. Sin WhatsApp real de prueba ni modificaciones en la base de producción.
