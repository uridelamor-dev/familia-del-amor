# Lectura y revisión de compras — versión 5

Estado: implementado y probado localmente; pendiente de publicación. No se han modificado compras de producción en esta tarea.

## Cambios terminados

1. **Total final:** reconoce «Recuadro de Impuestos, línea Total factura» como ubicación fiscal, sin confundirla con una línea de producto. Regresión de recepciones 977/978. Conserva los controles de literal, importe y subtotal.
2. **Unidades y envases:** compara alias inequívocos (ud/unidades); una unidad ausente o kg frente a piezas sigue siendo discrepancia. El contenido literal de una caja puede justificar la conversión únicamente si coincide con la aritmética. No se deduce por dividir importes.
3. **Relectura dirigida:** dos primeras lecturas independientes; si hay dudas, la única tercera lectura recibe el original completo y hasta dos recortes de apoyo. Se comprueban límites y orientación; PDF girado o recorte fallido conserva la lectura del original. El número real de páginas se contrasta cuando puede obtenerse. Los recortes no se cuentan como páginas. Dependencia sharp fijada en package.json y lock; entorno de publicación nodejs-20.
4. **Memoria confirmada:** opción en revisión para recordar columnas neto/bruto o formato de unidades/envases. Exige autor, NIF y ausencia de avisos restantes. Solo se usa si las primeras lecturas coinciden en NIF, como orientación para la tercera, nunca como importe/unidad ausente. Confirmaciones contradictorias no se resuelven por mayoría. Conserva fuentes y auditoría.
5. **Pendientes accionables:** grupos por páginas, proforma, identidad, fechas, importes, detalle, local, error técnico y lectura en curso. Cuenta lo visible en la página, sin presentarlo como censo global. Editor de líneas en el modal habitual, sin salir del documento; las filas intactas mantienen sus dudas. Permite añadir/corregir/quitar líneas antes del registro y conserva antes/después.
6. **Calidad:** botón en Compras con indicadores de recepción de 30 días y tiempo medido de lectura (sin cola). Muestra sistemática de registros automáticos, ID divisible por 20, hasta 20 visibles, pendientes primero. Comprobación del original completo, cabecera, líneas e impuestos desde el modal común. Registra correcto/error, campos, nota y autor. La firma de cabecera y líneas impide confirmar una versión modificada. No concede el distintivo humano al 100 %, no marca pagos ni cambia importes. Los errores históricos de control permanecen contabilizados aunque después se corrija la compra.

## Recuperación de pendientes

La nueva versión del recuperador conserva el lote original de 73 IDs. Solo reencola los afectados todavía en revisión, con original y sin aprobación humana. Hasta dos por ciclo y una sola vez por versión; los casos registrados/descartados quedan fuera. Se conserva íntegro el resultado anterior. Los ya revisados con versión 4 pueden recibir la nueva lectura; versión 5 no se vuelve a intentar indefinidamente. Todas las validaciones, deduplicación y archivo siguen ejecutándose.

Esto no significa que los 73 vayan a registrarse: las dudas reales continúan pendientes. No se han ampliado automáticamente a todo el histórico.

## Pruebas realizadas

- 908 pruebas, 0 fallos, 0 omitidas: módulos facturas, recepción en PostgreSQL embebido y calidad.
- Tras el ajuste final de instrucciones PDF y límite de tamaño de imágenes: 35 pruebas relevantes adicionales, todas correctas.
- Imágenes reales sintéticas procesadas con sharp; PDF de dos páginas recortado conservando original.
- SQL ejecutado con PGlite: ámbitos original/actual, firma y cambios de líneas, auditoría idempotente, conservación de errores históricos, rechazo sin confirmación.
- Persistencia de memoria humana; rechazo con avisos y rechazo de falso aviso si se cambiaron datos.
- Navegador local con datos ficticios y los componentes reales: apertura del control común, original con zoom, guardado y actualización del resultado sin cambiar de ruta; edición de cantidad/importe de una línea. Vista estrecha apilada.
- Comprobaciones de sintaxis y git diff --check correctas.

## Límites y comprobación tras publicar

Las pruebas no llaman a IA real ni demuestran una tasa de acierto. No se ha hecho una auditoría manual de Drive en esta tarea. Verificar tras publicación: creación de tabla de controles, visibilidad por rol/local, primeras nuevas lecturas versión 5, evolución del lote acotado, tiempos reales y falsos avisos confirmados. Mantener pendientes las excepciones; nunca retirar controles para mejorar el porcentaje.

Las métricas de aceptación automática no son precisión. La muestra sistemática no proporciona garantía estadística. Los controles guardados se vinculan a la versión del documento; una modificación exige nueva comprobación.
