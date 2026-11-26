# Black Friday: tarjetas regalo y resto de productos

## Estado a 26/11/2026

Configuración guardada y reabierta en los tres Ágora. Integración modificada y probada LOCALMENTE, todavía sin publicar ni activar la nueva campaña compuesta en producción. El antiguo 10% global del panel se conserva hasta hacer la sustitución controlada. No afirmar que el 20% se aplica ya automáticamente por leer el carnet.

| Local | Productos catálogo 30/60/90 € | Formatos de venta 30/60/90 € | Familia | Oferta tarjetas BFR2 | Oferta resto BFR1 |
|---|---|---|---|---|---|
| Blanes | 711/712/713 | 1049/1050/1051 | 54 | 17 | 18 |
| Lloret | 1456/1457/1458 | 1523/1524/1525 | 30 | 1012 | 1013 |
| Girona | 1386/1387/1388 | 1465/1466/1467 | 31 | 13 | 14 |

- Familia `Tarjetas regalo`, visible en pantalla de venta, sin familia padre, contiene los tres productos. No se crearon botones sueltos en la pantalla principal.
- Precios nominales 30/60/90 €, IVA 10% confirmado por el usuario. En Lloret/Girona el impuesto se llama `Reduït`, valor verificado en Impuestos: 10,000%.
- BFR2: 20%, solo los tres formatos de tarjeta, una unidad por aplicación, aplicaciones ilimitadas.
- BFR1: 10%, catálogo de formatos seleccionado desde el selector nativo, retirados explícitamente los tres formatos de tarjetas antes de guardar. Por Unidades, mínimo 0 para admitir cantidades fraccionarias. Reabierta y comprobada la exclusión ordenando IDs descendentes.
- Ambas: 26–29 noviembre 2026 incluidos, todos los días dentro de ese intervalo, `Sólo clientes y tickets seleccionados`, sin aplicación indiscriminada a todos los tickets.
- La restricción al Club la aporta la integración al validar un carnet válido. Las ofertas nativas seleccionables, por sí solas, no acreditan carnet.
- Un primer intento de guardar BFR2 en Blanes falló: Código admite máximo 4 caracteres y se había rellenado BFREG20. Se recargó y se creó correctamente con BFR2; ID 17 confirmado. No consta oferta 16 persistida.
- Las evidencias muestran una administración, las tres se verificaron mediante el formulario reabierto. La visibilidad está configurada; no se ha observado aún una caja física después de sincronizar.

## Cambio de integración

Una campaña versionada `oferta_agora` puede tener `codigo_agora` y `codigo_agora_adicional`. Se envían dos Rewards Offer con IDs inmutables relacionados (padre y padre:2). No se envía DiscountRate ni se selecciona otra campaña. El cierre valida códigos/tipos/versiones y cuenta una sola utilización dentro de la transacción e idempotencia actuales. Admite ambos códigos o solo el que se haya aplicado a los productos del ticket. Rechaza mezcla con el 10% global, puntos u otras campañas. Conserva comprobaciones de local, fechas, derechos y consumo habilitado.

No se alteran automáticamente promociones existentes. La columna nueva es nullable y se añade idempotentemente. La segunda oferta solo se permite para `oferta_agora`, distinta de la primera, sin coste de puntos ni acumulación con otras campañas. El modal muestra ambos códigos y exige verificar configuración de Ágora antes de publicar.

## Activación pendiente tras publicar el código

1. Editar la campaña existente `black-friday-club-10` manteniendo su clave (sustituir su versión, no crear otra campaña global paralela).
2. Tipo Oferta creada en Ágora; código BFR1; segunda oferta BFR2; nombre y mensajes: 10% resto / 20% tarjetas regalo.
3. Blanes, Lloret, Girona; desde 26/11 hasta 29/11/2026; todo el día; sin coste, sin mínimo, sin límites de uso, sin derecho individual (todos los carnets), no acumulable. Confirmar las dos ofertas nativas y publicación a todos los socios.
4. Releer carnet en un ticket NUEVO. No mezclar la antigua recompensa DiscountRate con las nuevas Offer. Los tickets ya abiertos con el 10% anterior deben revisarse antes de usarlos como prueba.
5. Probar el flujo normal de fidelización: la documentación de Ágora indica que muestra premios seleccionables. No está demostrado si esta versión preselecciona ambos; no prometer automatismo completo hasta comprobarlo. Si obliga a escoger adicionalmente los premios, esta solución no cumple todavía el requisito del usuario y se debe continuar investigando integración/TPV, no presentar instrucciones manuales como solución automática.
6. Prueba solo tarjetas: 30→24, 60→48, 90→72. Prueba solo consumo: 18,50→16,65. Prueba mixta: tarjeta 30 + consumo 18,50→40,65. Varias tarjetas: 30+60+90→144. Sin carnet: precios originales. Fuera de fecha: sin descuentos. Comprobar también cierre y respuesta accepted; no realizar cobros reales sin instrucción del usuario.
7. Si la prueba falla, pausar la versión compuesta antes de seguir; no dar por completada la automatización.

## Pruebas

309 pruebas pasan (9 archivos de fidelización/promociones/puntos/devoluciones/panel/puerta). Incluyen 11 nuevas comprobaciones de oferta doble: emisión sin DiscountRate, ticket mixto, segundo código solo, combinación indebida, IDs/códigos manipulados, no duplicar uso en reenvíos, versiones, fechas y local, consumo apagado. Validación de sintaxis de server.js y public/panel/app.js correcta. No sustituyen la prueba real del motor de precios de Ágora ni de la preselección de Rewards.

## Referencia de tarjetas físicas

Numeración única por tarjeta (p. ej. FA-2026-000001), diferente del ID del producto y del carnet del Club. Registro compartido de número, valor nominal, importe cobrado, ticket/local/fecha de emisión, canjes y saldo restante. Una tarjeta de 30 € vendida por 24 € conserva 30 € de saldo. El número no programa por sí solo descuentos en caja; el usuario ha elegido canje manual y control de saldo por número.

Fuentes: https://www.agorapos.com/manual/agora-restaurant/html/WA_Administracion_Promociones.html (no aplica dos ofertas al mismo producto); https://www.agorapos.com/manual/agora-restaurant/html/Fidelizacion.html (selección de premios al identificar socio).
