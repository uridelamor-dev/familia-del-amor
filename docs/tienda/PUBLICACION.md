# Tienda · presentación en modo demostración

Ruta pública: `/tienda/`. Panel existente: `#tienda`, dentro de Marketing.

La primera consulta crea únicamente `tienda_config` y `tienda_registros`, en una transacción con bloqueo. La semilla no sobrescribe datos existentes. No se importan datos de la demo local. El interruptor `TIENDA_ENABLED=false` desactiva la API. La página tiene `noindex` y no está enlazada desde la portada durante la presentación.

La versión se inicia en demostración, sin instrucciones bancarias reales, cobros, emails ni WhatsApp. Las solicitudes se identifican como DEMO; se guardan de forma separada de otros módulos. Los cambios de catálogo y las fotos subidas se guardan en PostgreSQL y sobreviven al redeploy. Solo Dirección dispone inicialmente de todas las capacidades; el módulo no concede operaciones sensibles automáticamente a Marketing.

Edición disponible: nombres CA/ES, formatos, coste confirmado/estimado, venta, IVA, visibilidad, archivo, fotografía, composición de los lotes, coste de preparación y tarifas de entrega. Pedidos y presupuestos con historial, verificación manual del ingreso, PDF y Excel de resultados filtrados.

Los precios del catálogo y las fotos son provisionales. El margen se comprueba con costes confirmados y preparación, después de los descuentos. Una venta real se bloquea si no se puede comprobar el mínimo del 30%. No hay activación de venta real disponible en esta entrega.

Pendiente para venta real: costes/formatos/IVA reales, derechos y correspondencia de las fotos, capacidad de cajas, costes y condiciones de transporte, personalizaciones valoradas, aceptación de condiciones y privacidad, notificaciones transaccionales y proceso de aceptación de presupuestos por el cliente. Las personalizaciones solicitadas quedan pendientes de valoración, nunca se presuponen gratuitas. El objetivo de esta publicación es enseñar y editar la propuesta, no empezar a cobrar.

Validación: pruebas de cálculo, permisos, margen, idempotencia, copia histórica, API, PDF y XLSX. Se ha probado edición en el panel de demo y lectura del cambio en la tienda. No se ha ejecutado una migración ni tocado una base de producción desde el equipo local.

## Selección Cerezo 2026 · 15 de octubre

23 referencias de catálogo, de 30,90 a 500 euros de PVP orientativo. Productos individuales separados de lotes completos. Las fotos son las imágenes originales incrustadas en el PDF suministrado por Uriel, convertidas a WebP; no generadas. Los textos de las tarjetas resumen los principales componentes; no sustituyen el inventario ni la información alimentaria del proveedor.

Hipótesis pendiente de confirmar: se usa la tarifa del catálogo como coste de compra **sin IVA**, sin las bonificaciones condicionales del 2%. El precio base se calcula desde el PVP objetivo reservando conservadoramente un 21% para IVA y se comprueba `(venta_base - coste) / venta_base >= 0,30`. Esto garantiza el margen de mercancía bajo esa hipótesis, NO el beneficio neto tras portes de entrada, preparación, comisiones u otros gastos aún desconocidos. La reserva del 21% NO se asigna como impuesto fiscal a un lote mixto: su impuesto y total de compra quedan pendientes. Solo los dos estuches exclusivamente de vino/cava tienen IVA configurado.

Los lotes ya incluyen embalaje; no necesitan una segunda caja. Los descuentos por volumen quedan desactivados, con copia de la configuración anterior. Antes de habilitar ventas reales deben confirmarse tarifa del proveedor, impuestos, preparación y logística. Se mantiene el modo demo y el bloqueo de margen existente.

La migración `cerezoRevision=3` se ejecuta una vez, de forma transaccional, al preparar la tienda tras desplegar. Añade los 23 artículos y composiciones, oculta las cuatro composiciones iniciales (con copia), y conserva los productos individuales, pedidos, presupuestos y otros lotes. Los siguientes despliegues no sobrescriben ediciones. No ejecutada contra producción durante esta tarea.

| Ref. Cerezo | Selección | Coste catálogo sin IVA | PVP orientativo | Página PDF |
|---|---|---:|---:|---:|
| 115 | Brindis Anna | 17.50 € | 30.90 € | 40 |
| 113 | Selección Vallformosa | 19.90 € | 35.00 € | 39 |
| 110 | Sabores del Cantábrico | 23.80 € | 45.00 € | 39 |
| 1 | El primer detalle | 30.90 € | 55.00 € | 3 |
| 109 | Dulce Alemany | 33.90 € | 60.00 € | 39 |
| 2 | La sobremesa | 36.90 € | 69.00 € | 3 |
| 3 | Nadal a casa | 44.50 € | 79.00 € | 4 |
| 4 | Para compartir | 51.80 € | 95.00 € | 4 |
| 15 | Espatlla i brindis | 54.90 € | 99.00 € | 10 |
| 5 | El vermut de Nadal | 59.40 € | 109.00 € | 5 |
| 6 | Una mesa generosa | 66.90 € | 119.00 € | 5 |
| 7 | La celebración | 74.20 € | 135.00 € | 6 |
| 8 | La gran sobremesa | 81.50 € | 149.00 € | 7 |
| 19 | Pernil a taula | 80.90 € | 159.00 € | 11 |
| 12 | Ibérico para compartir | 129.90 € | 229.00 € | 9 |
| 34 | El gran Nadal | 129.40 € | 249.00 € | 16 |
| 40 | Reserva en madera | 194.20 € | 349.00 € | 19 |
| 18 | Cinco Jotas esencial | 199.90 € | 375.00 € | 10 |
| 29 | Cinco Jotas celebración | 241.20 € | 429.00 € | 14 |
| 43 | La joya de Nadal | 264.40 € | 500.00 € | 20 |

Ampliación: lotes 16 (espatlla ibérica de campo, 209 €), 17 (espatlla de bellota 100% ibérica, 289 €) y 87 (seis sobres de serrano Duroc de 80 g, 30,90 €). Precios orientativos. Las revisiones posteriores insertan referencias nuevas sin sobrescribir ediciones ni volver a desactivar descuentos. La tienda ordena los lotes por precio. La API pública usa identificadores y rutas de imagen neutrales y excluye metadatos de procedencia; las fotos originales pueden mostrar marcas en los envases.
