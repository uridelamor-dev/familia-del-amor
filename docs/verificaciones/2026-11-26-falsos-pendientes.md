# Corrección de falsos pendientes — 26/11/2026

## Evidencia y alcance

Consulta de producción solo lectura, corte 17:53:21 UTC: 578 recepciones pendientes, 578 consultadas sin errores. No equivale a 578 compras únicas ni incluye las compras ya registradas. Se inspeccionaron resultados y lecturas almacenadas, no se cotejaron todos los originales. Ningún documento fue aprobado ni modificado en producción en esta tarea.

73 recepciones presentan alguno de los fallos corregidos: 26 clasificadas de forma concordante como material decorativo, 43 con prefijo ES y 6 con importe de línea ya descontado (dos casos solapan). Todos conservan original. Identificadores y avisos restantes en `2026-11-26-pendientes-validacion.json`.

Recalculando controles sobre las lecturas guardadas, sin memoria fiscal ni nueva lectura: 26 decorativas, 10 documentos sin avisos básicos y 37 con otros avisos. No es una aprobación: las 73 deben pasar por el lector y controles vigentes. La recepción 3042 es una proforma y no debe convertirse en factura; 3147 tiene discrepancias reales y no forma parte del lote.

## Cambios preparados

- NIF español con/sin ES representa la misma identidad; conserva validación de control, evidencia literal y distinción de NIF extranjero. Normaliza la identidad en el contraste y registra el ajuste.
- Reconoce importe neto en la casilla `importe` solo cuando cantidad, tarifa y descuento lo corroboran aritméticamente. No vuelve a descontarlo. Dos representaciones equivalentes se comparan por su importe normalizado, manteniendo controles de descripción, cantidad, tarifa, descuento, unidad y totales.
- Adjunto explícitamente decorativo puede tener tipo vacío. Se excluyen documentos con fecha, título, importes, líneas, dudas, recortes o lectura incompleta. El original se conserva al apartarlo.
- Lectura automática versión 4 conserva los controles de cabecera, fiscalidad, detalle y cobertura preparados previamente; no concede distintivo de revisión humana ni certifica Drive.

## Recuperación después de publicar

El trabajador de producción revisará exclusivamente los 73 IDs inventariados, bajo el bloqueo existente. Como máximo dos se reencolan por ciclo; el trabajador de recepción realiza una lectura NUEVA del original con todos los controles, deduplicación y archivo normales. No reutiliza la aprobación humana ni acepta avisos por defecto.

Cada reencolado conserva el resultado previo y fecha/motivo en `resultado.revalidacion`. Se salta cualquier fila ya registrada, sin original, con aprobación humana, procesada por la versión nueva o previamente reintentada por esta corrección. Los casos todavía dudosos vuelven a revisión y no se reintentan en bucle. Se mantienen las excepciones ajenas al lote (incluido Canetpa A-5055). No se activa en desarrollo.

## Verificación

Suite de módulos de facturas y recepción con PostgreSQL embebido: comprobaciones de registro automático, prefijos fiscales, descuentos, proformas bloqueadas, datos incoherentes bloqueados, SQL real, conservación del original, límite del lote, ausencia de doble proceso y persistencia del resultado anterior. Resultado final: 895 pruebas aprobadas, 0 fallos y 0 omitidas. `node --check server.js` y `git diff --check` también correctos.

## Pendiente operativo

Código sin publicar. La recuperación NO se ha ejecutado en producción. Después de publicar, comprobar estado final por los mismos IDs, contar registrados / apartados / todavía pendientes y revisar causas restantes. No presentar los 73 como cerrados ni los 10 sin avisos básicos como facturas ya verificadas.
