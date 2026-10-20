# Movimientos bancarios

Preparado el 20/10/2026; pendiente de publicación y validación con el primer extracto real de cada banco.

## Uso

Contabilidad → Bancos. Acceso: Dirección o Contabilidad global; los usuarios limitados a locales no pueden consultar movimientos bancarios de toda una empresa.

1. Seleccionar primero la empresa o titular fiscal y después una de sus cuentas. Añadir cada cuenta: nombre, empresa titular de la configuración de locales, Sabadell, CaixaBank, BBVA, Santander u Otro banco y cuatro últimos dígitos. Solo EUR. No se solicitan credenciales bancarias.
2. Subir Excel (.xlsx o .xls) o CSV del mes completo por cuenta (hasta 2 MB y 10.000 movimientos). Excel se lee directamente en el navegador; si hay varias hojas, se elige la de movimientos. PDF y Norma 43 no están admitidos.
3. En el modal, elegir fila de cabecera, columnas de fecha/concepto/importe (o cargo y abono), separador, formato de fecha y decimal. Saldo y referencia son opcionales pero recomendables. El formato queda guardado por cuenta.
4. Revisar totales, errores, coincidencias y muestra. Confirmar para incorporar movimientos. Un error bloquea la importación completa.
5. Abrir Revisar en cada movimiento. Las propuestas exigen empresa e importe completo coincidentes. Confirmar solo tras comprobar proveedor/referencia: esa acción marca la factura como pagada. Clasificar un movimiento no paga facturas.

## Límites y garantías

- Datos y contenido CSV normalizado en PostgreSQL privado, no en archivos públicos. No realiza pagos ni conecta con la banca.
- Importación transaccional e idempotente. Huella por fecha/concepto/importe/saldo/referencia y ordinal de filas iguales; reimportar la misma exportación no duplica datos. Exportaciones con diferente contenido o movimientos idénticos sin referencias requieren revisión; no se garantiza deduplicación bancaria universal.
- Anular importación conserva historial y elimina sus movimientos de la vista activa. Si hay conciliaciones, deshacerlas primero. Deshacer conciliación restaura el estado previo salvo cambios posteriores detectados en el pago.
- Las transferencias internas se clasifican manualmente. No se concilian automáticamente liquidaciones de tarjetas, pagos parciales o agrupados. Entradas menos salidas no representa beneficio ni saldo de cuenta.
- No se han verificado todavía los formatos concretos de exportación de los bancos con datos reales. No se han creado cuentas reales ni modificado facturas de producción.

## Recordatorio de Silvia

Integrado en el servidor de producción, no depende de que el panel esté abierto. Usa el teléfono existente de Silvia documentado en whatsapp.js. Primer mes: siguiente mes al inicializar el esquema (si se inicializa un día 1, ese mes). Publicado en octubre antes de terminar el mes: 1 de noviembre, a partir de las 10:00 de Madrid, para pedir octubre. El mensaje solicita Excel o CSV.

Cada minuto se comprueba si toca; solo entre 10:00 y 21:00 y con WhatsApp listo. Si estaba desconectado, recupera el aviso del mes al reconectar. La reserva de envío se guarda antes de enviar y evita duplicar tras reinicios. Ante resultado incierto queda «revisar» y no se reenvía automáticamente. El estado aparece en Importaciones y ayuda. No se ha enviado ningún WhatsApp de prueba.

## Publicación

El arranque crea tablas banco_* de forma aditiva. Mantener producción y secretos; no copiar base de desarrollo ni reinicializar campañas. Tras publicar: entrar con Dirección/Contabilidad global, configurar cuentas reales y validar un extracto de cada banco con Silvia antes del uso habitual. No se publica como parte de la preparación.

## Verificación

Pruebas de parser, importación y duplicados, misma empresa, conciliación y reversión, conservación de modificaciones posteriores, anulación/reimportación, permisos y recordatorio persistente con PostgreSQL temporal. Vista previa y carga comprobadas con datos ficticios; modal comprobado a 390 px. La comprobación visual del último botón de conciliación quedó interrumpida por un diálogo del navegador; el flujo de servidor está cubierto por las pruebas.

## Lectura de Excel

SheetJS CE 0.20.3 se incluye localmente en public/vendor/sheetjs con licencia Apache 2.0, sin nuevas dependencias npm ni CDN en ejecución. Fuente: https://docs.sheetjs.com/docs/getting-started/installation/standalone/ . Worker dedicado con corte de 15 segundos. Máximo 2 MB de archivo, 100 columnas y 10.000 movimientos. Se rechazan fórmulas y celdas con errores. Las fechas y cifras numéricas se normalizan y pasan por las mismas validaciones del servidor. No se conserva el binario Excel, sino sus filas normalizadas; la selección de columnas y la confirmación siguen siendo necesarias. Probado con XLSX y XLS binario, varias hojas, fechas, céntimos y equivalencia de huellas con CSV. Pendiente primer archivo bancario real.

Actualización: confirmado el Excel real de Sabadell de septiembre de 2026 (91 movimientos sin errores). No se guarda dicho archivo en el repositorio. BBVA, Santander y CaixaBank pendientes de verificar con un extracto real; registrar el banco no garantiza que todas sus variantes de exportación estén validadas. Se permiten múltiples extractos mensuales por cuenta.

La subida abre un único modal de seis pasos: titular, cuenta (alta dentro del mismo modal), mes/año, archivo, columnas y confirmación. No requiere filtros previos; estos solo consultan movimientos. El alta de cuenta se guarda al continuar y se indica expresamente; los movimientos solo al confirmar. Verificado en navegador con CSV ficticio hasta la confirmación final y retroceso conservando archivo y periodo.
