# Mejoras de entrada y revisión de compras

Registro vivo derivado de la revisión manual. Actualizado: 18/11/2026.

## Objetivo y estados

Validar automáticamente documentos cuyos datos y evidencias superen las comprobaciones, dejando a las personas solo excepciones específicas. No prometer ausencia total de errores ni equiparar «Validado automáticamente» con «Revisado manualmente al 100 %».

Separar tres dimensiones: calidad de lectura, relación contable (factura/albarán/rectificativa) y estado de pago. Una relación pendiente no convierte en incorrectos importes e identidad ya contrastados; un vencimiento no acredita pago bancario.

## Lista priorizada

| Prioridad | Hallazgo y evidencia | Mejora propuesta | Comprobación para darla por terminada | Estado |
|---|---|---|---|---|
| Alta | Cerezo #172/#170/#267/#284/#353: cajas o piezas confundidas con kilos/unidades facturadas aunque el total cuadra | Conservar envases, unidades facturadas y unidad del precio por separado; contrastar cantidad × precio y redondeo con importe sin inventar precios derivados | Casos con 3 cajas=9UN, 3 piezas=7,812kg y precio/kg; respetar descuentos y precio original | Detectado; no implementado en esta sesión |
| Alta | Castellmenatge #527/#528: precios brutos y bases de línea mezclados generan falsos descuadres | Extraer explícitamente IVA incluido a partir de columnas/resumen del original, conservar precio e importe de una misma modalidad | 11×1,98=21,78 bruto; base18 e IVA3,78 no deben compararse como si fueran el mismo importe | Modalidad manual disponible y aplicada; verificar extracción automática |
| Alta | Cerezo #353: NIF perdió un dígito y cuota8,88 en vez de8,86 | Validar formato/identidad fiscal y confrontar base, cuota, total y desglose; usar memoria de proveedor solo con coincidencia sólida | Bloquear coincidencias ambiguas; aceptar 221,40+8,86=230,26 al4%; no forzar impuestos para cuadrar | Corrección manual hecha; prevención por comprobar |
| Alta | Cerezo: fechas impresas y condiciones reales distintas | Memoria de pago por proveedor/empresa/local, con fuente y fecha de confirmación; señalar contradicción sin sobrescribir silenciosamente evidencia | Último día natural del mes siguiente, incluidos febrero/año bisiesto/cambio de año; no sumar30días ni asignar15 | Ocho documentos ajustados; ficha general aún pendiente |
| Alta | Castellmenatge #527: un importe no persistió durante cambios consecutivos; reapertura detectó18 en vez de21,78 | Investigar guardado de líneas y cambio de modalidadIVA; serializar peticiones por documento o usar versión; estado por campo y aviso si no se conservó | Prueba de cambios rápidos en varios campos y reapertura: todos persisten; error nunca muestra éxito | Observación reproducida una vez, causa aún sin diagnosticar |
| Media | Cerezo #268: línea pendiente de servir con cantidad0 impide corregir descripción/precio | Permitir línea documental no servida con cantidad/importe0, diferenciada de entrega/devolución | Editar nombre y precio16,11 conservando0; no crear consumo ni inventario; nunca obligar a cantidad ficticia | Bloqueo reproducido; pendiente de implementación |
| Media | Castellmenatge: etiquetas «dudosa» sobreviven tras contraste manual | Separar confianza OCR original de validación humana actual; mostrar duda histórica en detalle, no como tarea activa resuelta | Al revalidar, no contar duda resuelta; conservar auditoría y reabrir revisión si cambian datos | Detectado |
| Media | Facturas resumen como Lácteos #526 y Joprimsa | Checklist adaptable: «sin detalle en este original» y seguimiento separado de albaranes faltantes | No exigir productos inexistentes ni inventar líneas de subtotal; validación del original no implica conciliación terminada | Detectado |
| Media | Amat #318 vinculado a #485 mantiene vencimiento como deuda independiente | Mostrar albarán vinculado dentro de factura y evitar duplicar deuda/consumo en totales | Factura pagada o pendiente se refleja coherentemente sin marcar arbitrariamente albarán pagado | Detectado |
| Media | Jove #545 nuevo: lectura correcta pero factura rectificada no está disponible | Reconocer rectificativa, conservar signo y referencia; estado específico «factura relacionada pendiente» | -566,33 base/-22,65IVA/-588,98total correctos; no duplicar factura ni exigir corregir datos válidos | Lectura comprobada; seguimiento de relación pendiente |
| Media | Archivos antiguos con nomenclatura incompleta | Renombrado y carpeta por datos validados; distinguir fecha fiscal/local real de dirección fiscal; registrar resultado de Drive | Nombre, empresa, año, mes, local y ID correctos; comprobar persistencia; no cambiar permisos | Revisión manual en curso; automatización por verificar |

## Cuándo validar automáticamente

1. Original accesible y páginas completas.
2. Identidad del proveedor y receptor coherente; local por evidencia de entrega/origen autorizado, no por domicilio fiscal solamente.
3. Tipo, número y fecha consistentes, sin ambigüedad de día/mes ni duplicado sin resolver.
4. Importes, impuestos, recargos, descuentos y redondeos concuerdan con original. Los albaranes sin precio legítimos tienen regla propia, nunca precio inventado.
5. Detalle compatible con su modalidad neta/bruta y unidades; excepciones de facturas resumen expresamente reconocidas.
6. Archivo guardado con nombre y carpeta correctos; resultado verificable.
7. Registrar versión de lectura, reglas aplicadas y motivo específico de cada excepción.

Las condiciones concretas deben probarse antes de activar el estado automático. Una puntuación OCR elevada o un total que cuadra no bastan por sí solos.

## Medición pendiente

No hay todavía medición que demuestre que «casi todos» los documentos nuevos fallan. Separar el histórico de los recibidos después de cada publicación y medir: porcentaje con lectura correcta, excepciones reales, avisos innecesarios, campos corregidos y minutos de revisión. Mantener una muestra manual de los validados automáticamente para detectar errores silenciosos.

## Próxima actualización

Añadir cada caso nuevo con ID, evidencia, causa confirmada o hipótesis, solución propuesta, estado de implementación y resultado de pruebas. No marcar una mejora como implantada por haber corregido solo los documentos afectados.

### Caso añadido: IDAX #220 (A6973)
El total y los impuestos eran correctos, pero faltaba el único producto del original. Se añadió manualmente1U a coste neto225€, con tarifa264,71 y descuento15% documentados. La validación automática debe detectar detalle ausente cuando el original contiene productos, distinguiéndolo de una factura resumen legítimamente sin detalle. Conservar tarifa, descuento y neto por separado; el modal actual solo permite coste neto, por lo que la explicación queda en concepto. Pendiente mejora de extracción y representación estructurada del descuento.

### Caso añadido: Agrària #512 (266546)
Original y datos guardados correctos, pero etiqueta de línea «dudosa» permanece. Cantidad0,51 yprecio1,538 producen diferencia de redondeo menor que un céntimo respecto a importeimpreso0,79: conservar original y tolerancia explícita, no inventarunidadniimportecorregido. Enlistado total0,82 se muestra1€ yIVA0,03 como0€; en revisión contable mostrar céntimos ayudaría a comprender importes pequeños sin abrir cada ficha. Propuestaspendientes, no implementadas.

### Entrada nueva: Hinojosa #547 A/4223
Recibida 18/11. Original imprime PAGARÉ A 90 DÍAS F.F.; panel había vencimiento igual a emisión (31/10) y Pagada automática. Corregido manualmente a 29/01/2027, guardado confirmado. Prioridad alta: condición impresa explícita debe prevalecer sobre regla genérica, guardando fuente y cálculo. No confundir llegada del vencimiento con cargo bancario confirmado. Prueba: 31/10 +90 días=29/01, incluido cambio de año. Cinco productos, IVA y RE estaban correctamente leídos; no atribuir este caso a fallo global de OCR.

### Local confirmado: Hinojosa A/4223 y A/4224
Usuario confirmaBotiga; ambos entraronCanMateu pese a destinoambiguoReservaMateu. NoinferirlocalporreceptorPilar ni palabraMateu: amboscompartenidentidades. Guardarconfirmación trazable porcliente/proveedor y pedir excepción si hayambigüedad. SinconvertirestasdosconfirmacionesenreglauniversalparaHinojosa. Sincronizaciónactualpanel→Drive renombróymoviócorrectamenteambos; verificadaenDrive.

### Tickets con pago explícito — Consum #397
Ticket imprime tarjeta11.18 y cambio0,pero panel daba crédito hasta15nov. Detectar pagoalcomprar solo cuando hay evidencia clara del original; conservar fuente y separarlo de conciliaciónbancaria. Evitar generar deuda/vencimientomensualporreglaempresarialgenérica. Ticket confirmado manualmente; reglaautomática aúnpendiente.

### Redondeo y avisos obsoletos — Consum
#396:avisoNIFseguía citandoF46075986 pese campo corregidoF46078986; desapareció trasconfirmarevidencia. #280/#281descuadrelistadoobsoleto pese detallequecuadraba desapareció trasguardarunidades/recalcular. Prueba futura: corregircampo debeinvalidaravisoanterior,recalcularconvaloresactuales y conservarhistorialsinmostrarerrorresuelto. CuotasConsumredondeadasporunidad(p.ej9×0.13=1.17,base11.88)deben conservarse segúnimpreso,no recalcularforzosamente1.19. Cierre manual6tickets,reglasautomáticas noimplantadasenestasesión.

## Correcciones preparadas el 18/11 — pendientes de publicación

- Al guardar una corrección, sustituir exclusivamente avisos aritméticos reconocidos que se pueden recalcular con todos los datos presentes. Conservar advertencias desconocidas, fechas ambiguas, duplicados y errores restantes. Compatibilidad conservadora con aviso antiguo de NIF: solo retirar cuando la corrección explícita coincide con el NIF esperado y no cambia la entidad.
- Repaso de histórico: conservar el desglose de IVA mixto en el objeto comprobado, evitando compararlo como si tuviera un único porcentaje.
- Eliminar el borrado general de avisos por la frase «mal leído» al cambiar la fecha: podía borrar problemas independientes de identidad o impuestos.
- Líneas explícitamente «no servido / sin servir / no entregado» con cantidad cero e importe original cero no son una duda por sí mismas. Cantidad ausente, importe no impreso, importe distinto de cero o lectura dudosa siguen pendientes.
- No se cambian datos de producción, distintivos humanos ni decisiones de revisión por estas modificaciones de código. No se ha ejecutado una limpieza masiva del histórico.

Validación: 898 pruebas de contabilidad seleccionadas; 893 aprobadas, 5 omitidas, 0 fallos. Incluye prueba del guardado HTTP simulado y retirada selectiva de avisos. Suite general detecta fallos previos (60 en copia de HEAD), además de diferencias del entorno; no declarar todo el sistema verde. Resto de propuestas de este documento siguen pendientes salvo indicación expresa. No se ha hecho push ni publicación.
