# Lectura validada de documentos — 23/10/2026

## Implementado

- Recepción durable antes de leer. Dos llamadas independientes al lector existente (Claude Haiku): la segunda revisa cabecera y resumen fiscal, sin ver la primera respuesta ni volver a extraer productos. No son dos proveedores distintos ni garantizan ausencia de errores coincidentes.
- Contraste de proveedor, NIF, fecha, número, receptor e importes; aritmética, desglose fiscal, retenciones y señales del historial. La capa de texto PDF es una evidencia, no una verdad infalible.
- NIF ausente completado solo por identidad inequívoca previamente conocida, indicando su procedencia. Nunca sustituye un NIF leído.
- Los documentos discrepantes se conservan en `facturas_recepciones`, estado `revision`, con original y ambas lecturas. No se insertan en facturas, no se suben a Sheets ni entran en pagos/totales hasta confirmar.
- Modal en Compras → Documentos recibidos: original, lecturas, campos editables, confirmación y motivo obligatorio. Una excepción que siga generando avisos requiere confirmación adicional. Autor, fecha y datos previos conservados en el resultado de recepción. La cola retoma el alta tras confirmar.
- Resumen al grupo tras dos minutos sin nuevos documentos, sin enlaces de Drive/Sheets. La cola puede seguir leyendo después del acuse.
- Solicitud de foto automática solo cuando ambas lecturas coinciden en calidad ilegible/recortada y les falta un dato esencial. También puede solicitarla Dirección/Contabilidad desde el modal tras comprobar el original. Nunca se pide por una caída de servicio.
- Se cita el mensaje original. Si la foto nueva responde a la solicitud (o a la foto expresamente solicitada) del mismo grupo, se vincula. La anterior pasa a sustituida solo después de registrar la nueva. Una foto sin respuesta explícita no se asocia por conjetura.
- Avisos persistentes con bloqueo entre procesos. Si el envío tiene resultado incierto, queda marcado para comprobarlo, sin repetición automática. Desconexión conocida: reintento al reconectar.

## Alcance y límites

- Preparado localmente, sin publicar ni enviar mensajes reales durante las pruebas.
- Aplica a nuevas recepciones y reintentos. El repaso histórico descrito abajo es independiente y no modifica facturas ya contabilizadas.
- Una lectura doble puede compartir errores. No constituye auditoría fiscal ni una garantía de exactitud. Tiene más latencia/coste de lectura que una sola llamada.
- Si hace falta corregir detalle de productos, sigue disponible su editor existente tras el registro. El modal de recepción corrige cabecera/importes; no reconstruye automáticamente líneas truncadas. La excepción manual queda documentada.
- Las solicitudes con envío incierto se comprueban en el grupo: no se habilita un botón que pueda duplicarlas sin revisión.
- Hace falta probar después de publicar con documentos reales conocidos: factura clara, foto borrosa y respuesta con una foto nueva. Comprobar en el móvil que la cita identifica la foto correcta. No se afirma entrega real por una prueba simulada.

## Despliegue

Migración aditiva: crea `facturas_avisos_grupo`, `facturas_repaso_unico` y `facturas_repaso_documentos` y `facturas_repaso_decisiones`; no borra ni reinicializa tablas. Conservar base de producción y secretos, y no activar la copia de desarrollo. No se toca la campaña PEPAWEEN. No se añaden dependencias.

Pruebas: reglas de validación, cola y tandas sobre PostgreSQL temporal, regresiones de facturas; modal con datos ficticios a 1440×800 y 390×844. Sin llamadas reales a IA, Drive o WhatsApp en las pruebas nuevas.

## Repaso único del histórico

- Modal automático solo en producción y para Dirección, una vez por base de datos (no por publicación ni dispositivo). El cierre no inicia nada. Acceso manual posterior desde Compras → Repaso del histórico.
- Inicio explícito con aviso del coste de lectura IA. Primera tanda de hasta 25 documentos, repartidos por proveedor/local/tipo/origen mediante orden intercalado; se detiene en `muestra_lista` y necesita «Continuar con el resto». La primera tanda muestra también documentos sin avisos para comprobar falsos negativos. Se fija atómicamente el conjunto existente: facturas registradas, documentos por asignar no descartados y recepciones no finalizadas, evitando repetir recepciones cuyo hash ya está registrado. No incluye documentos descartados ni los recibidos después del inicio.
- Lectura de los originales mediante la misma validación doble. Contrasta cabecera e importes con la instantánea, conserva propuestas y avisos. La lectura no sustituye datos contables ni registra recepciones pendientes; tampoco publica en Drive/Sheets ni envía mensajes. Las correcciones humanas sí se guardan expresamente y siguen el circuito de sincronización de facturas.
- Cola secuencial con bloqueo PostgreSQL compartido con la recepción: los nuevos documentos tienen prioridad entre lecturas. Una lectura histórica ya iniciada debe terminar antes de ceder el bloqueo. Reanudación después de un reinicio, sin volver a empezar. Si el proceso cae durante una llamada IA, ese documento puede releerse; nunca se duplica el registro contable.
- Progreso y resultados paginados en el mismo modal. Sin original o fallo técnico significa «no comprobado», nunca correcto. Se conservan los resultados para revisión humana. La bandeja prioriza proveedor/NIF/importes, fechas y otros casos. Modal con original, datos actuales y propuestas por campo. Se puede conservar la información o confirmar una corrección de cabecera (facturas y documentos por asignar). Recepciones pendientes: se corrigen/registran en el flujo de Documentos recibidos. No hay un segundo barrido automático.
- Pruebas PostgreSQL: inicio y aviso idempotentes, instantánea fija, recuperación de documento en lectura tras reinicio, exclusión de duplicados, errores y ausencia de original, inmutabilidad de los importes contabilizados. No se ha ejecutado el barrido sobre producción.

### Controles y decisiones humanas

- Pausar/Continuar persiste en la base de datos. La lectura ya iniciada acaba, pero no se inicia otra mientras esté pausado. Ampliar la tanda inicial es una decisión separada, no se activa al reanudar ni al publicar.
- Corrección y auditoría en una misma transacción, con bloqueo de filas y comprobación de la cabecera actual frente a la que se abrió. Evita sobrescribir cambios posteriores. Un doble envío no repite la decisión. Auditoría append-only: autor, fecha, motivo, datos anteriores/nuevos; no copia los bytes del original de recepciones.
- Confirmación humana y motivo obligatorios. Los avisos persistentes necesitan excepción explícita. La corrección no cambia pagos ni líneas de producto. Cambios de importes marcan el desglose IVA para revisar; una fecha corregida recalcula el vencimiento salvo que proceda expresamente del documento. Drive/Sheets se sincronizan después de guardar y su fallo no revierte el dato confirmado.
- Solo Dirección puede iniciar/controlar/decidir el repaso. No está lanzado en producción. Pruebas locales con datos ficticios: pausa, continuación, límite de 25, variedad, conflictos y rollback ante fallo de auditoría; interfaz de ordenador y móvil.
