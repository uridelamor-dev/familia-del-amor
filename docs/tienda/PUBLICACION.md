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

Actualización del 15 de octubre: Uriel confirma un 8% de descuento sobre todos los lotes. El coste de compra **sin IVA** es ahora la tarifa original × 0,92, redondeada a céntimos. No se suman las bonificaciones condicionales del 2%. La tarifa original queda conservada en `catalogCostCents` y el descuento en `supplierDiscountBps`; los PVP públicos se recalculan con venta neta = coste negociado / 0,70, redondeando al céntimo superior. El precio base se calcula desde el PVP objetivo reservando conservadoramente un 21% para IVA y se comprueba `(venta_base - coste) / venta_base >= 0,30`. Esto garantiza el margen de mercancía bajo esa hipótesis, NO el beneficio neto tras portes de entrada, preparación, comisiones u otros gastos aún desconocidos. La reserva del 21% NO se asigna como impuesto fiscal a un lote mixto: su impuesto y total de compra quedan pendientes. Solo los dos estuches exclusivamente de vino/cava tienen IVA configurado.

Los lotes ya incluyen embalaje; no necesitan una segunda caja. Los descuentos por volumen quedan desactivados, con copia de la configuración anterior. Antes de habilitar ventas reales deben confirmarse tarifa del proveedor, impuestos, preparación y logística. Se mantiene el modo demo y el bloqueo de margen existente.

La migración `cerezoRevision=5` se ejecuta una vez, de forma transaccional, al preparar la tienda tras desplegar. Añade los 23 artículos y composiciones, oculta las cuatro composiciones iniciales (con copia), y conserva los productos individuales, pedidos, presupuestos y otros lotes. La revisión 5 actualiza costes y PVP de las 23 referencias, conserva una copia anterior y no modifica pedidos ni presupuestos históricos. No vuelve a aplicar el descuento en siguientes despliegues. Pendiente de desplegar esta revisión.

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


## Revisión de precios y oferta privada · 15 de octubre

La tabla anterior conserva los precios iniciales como historial. La tarifa vigente tras esta revisión es la siguiente. Totales orientativos con reserva del 21% donde el IVA mixto está pendiente; transporte y preparación aparte. No se aplica el descuento del proveedor a productos individuales ajenos a este catálogo.

| Referencia | Coste original sin IVA | Coste -8% sin IVA | Venta base (30% margen) | Total web orientativo |
|---|---:|---:|---:|---:|
| 115 | 17.50 | 16.10 | 23.00 | 27.83 |
| 87 | 13.50 | 12.42 | 17.75 | 21.48 |
| 113 | 19.90 | 18.31 | 26.16 | 31.65 |
| 110 | 23.80 | 21.90 | 31.29 | 37.86 |
| 1 | 30.90 | 28.43 | 40.62 | 49.15 |
| 109 | 33.90 | 31.19 | 44.56 | 53.92 |
| 2 | 36.90 | 33.95 | 48.50 | 58.69 |
| 3 | 44.50 | 40.94 | 58.49 | 70.77 |
| 4 | 51.80 | 47.66 | 68.09 | 82.39 |
| 15 | 54.90 | 50.51 | 72.16 | 87.31 |
| 5 | 59.40 | 54.65 | 78.08 | 94.48 |
| 6 | 66.90 | 61.55 | 87.93 | 106.40 |
| 7 | 74.20 | 68.26 | 97.52 | 118.00 |
| 8 | 81.50 | 74.98 | 107.12 | 129.62 |
| 19 | 80.90 | 74.43 | 106.33 | 128.66 |
| 16 | 115.90 | 106.63 | 152.33 | 184.32 |
| 12 | 129.90 | 119.51 | 170.73 | 206.58 |
| 34 | 129.40 | 119.05 | 170.08 | 205.80 |
| 17 | 159.90 | 147.11 | 210.16 | 254.29 |
| 40 | 194.20 | 178.66 | 255.23 | 308.83 |
| 18 | 199.90 | 183.91 | 262.73 | 317.90 |
| 29 | 241.20 | 221.90 | 317.00 | 383.57 |
| 43 | 264.40 | 243.25 | 347.50 | 420.48 |

Oferta exclusiva de 88 lotes guardada en `oferta-cliente-88-lotes.json`: descuento del 10% sobre nuestra nueva venta base, nunca sobre precios Martí. Se acepta un margen aproximado de 22,22% para este cliente. No se habilita descuento público ni se rebaja el bloqueo general de ventas reales. Falta identificar al cliente, confirmar IVA/portes de los precios rivales y acordar composiciones; no se ha enviado una oferta ni creado un pedido.
