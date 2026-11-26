# Verificación en producción: informe de personal de Nerea

Fecha: 26/11/2026, final verificado 17:33 Europe/Madrid.

- Consulta de solo lectura mediante Replit → Production Database → My Data (edición deshabilitada).
- Clave persistente: `planificacion_personal_2026-11_v3`.
- Ciclo noviembre 2026; objetivo diciembre 2026, referencia diciembre 2025.
- Antes del reintento: 280 intentos de datos, ningún mensaje preparado ni enviado, error de ventas incompletas, retryAt 16:28:34 UTC.
- Recuperación automática: primer envío 16:28:47 UTC; último 16:33:38 UTC.
- Estado final: `enviada`, `enviados=6`, seis mensajes preparados, error NULL.
- Contraste independiente con `whatsapp_messages`: destinataria configurada Nerea, tipo saliente, fecha 26/11, título PLANIFICACIÓN DE PERSONAL y DICIEMBRE DE 2026: seis registros, seis textos distintos. Cinco informes locales y resumen general.
- No se reinició el contador, no se ejecutó un envío manual ni se modificó la base de datos. No se afirma lectura por la destinataria; se verificó envío registrado.

## Girona

Prueba del panel: conexión y lectura correctas, Ágora 8.7.4. Administración accesible. La vista Ventas mostró Girona «En vivo», 326 € y 79 tickets; el resto de locales también en vivo. El aviso anterior era una lectura fallida previa; no se modificaron credenciales ni configuración. No queda acreditada la causa técnica de aquel fallo puntual.

## Formato compacto solicitado y reenvío autorizado

- Usuario solicitó un solo mensaje con facturación sin IVA = total/1,10 para todos los locales, presupuesto 35 % y personas equivalentes a 2.200 €/mes.
- Cambios subidos a origin/main, último commit b92a7b3; 11 pruebas superadas. Pendiente publicar en Replit para futuros ciclos.
- Conservada la clave v3 y los estados enviados/inciertos: publicar no reinicia el ciclo ya completado.
- Reenvío explícitamente autorizado del informe de diciembre mediante una única llamada al endpoint de envío directo del panel, a la misma destinataria configurada. Respuesta HTTP satisfactoria: {ok:true}. No se repitió la llamada.
- Mensaje compacto: facturación sin IVA 216.902,50 €, presupuesto 75.915,87 €. Formato idéntico al generador, incluido separador de miles de Can Mateu.
- No se cambió estado del programador ni se publicó la aplicación.
