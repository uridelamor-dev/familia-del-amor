# Equivalencia operativa con Skello — revisión 23/09/2026

Estado: desarrollo, pendiente de revisión y despliegue. No se ha importado información ni escrito en producción.

## Decisiones de empresa

- Conservar el diseño semanal actual. Añadir vistas, no sustituirlo por el de Skello.
- En Skello, «La tapeta» agrupa equipos que representan los locales. La migración futura debe mapear equipos a centros; no interpretar ese establecimiento como un único local real.
- Histórico a investigar desde 01/01/2025; esa fecha no demuestra que ya hubiese actividad.
- Tablet de fichaje confirmada activa. La ausencia inicial de actividad en otra fecha no era prueba de que no se usara.
- Contratación/candidatos, nuevos flujos de ausencias y pulso quedan para después. Correo de gestoría pendiente de conexión.
- Firmas de nóminas, contratos y otros documentos, por trabajador y empresa, sí forman parte del alcance.

## Inventario contrastado con el código

| Necesidad | Situación |
|---|---|
| Ficha, contrato, jornada parcial, documentación privada | Existente; datos personales ampliados en main |
| Turnos partidos, copiar, repetir, plantillas, generador | Existente; ampliado para conservar vacantes |
| Día / semana / mes | Añadido; semana conserva su diseño; mes abre el día |
| Turnos sin asignar | Añadido; se pueden crear, asignar y liberar; no cuentan como trabajadores ni cobertura |
| Horas de contrato frente a planificadas | Añadido; cambios de contrato y altas parciales se muestran como referencia proporcional |
| Cobertura por tramo y área | Corregida: cuenta personas simultáneas, no todas las que pasan en algún momento |
| Publicación / versiones / PDF | Existente; vacantes incluidas y semanas cerradas solo de consulta |
| Publicación parcial por trabajador | Pendiente; actualmente la publicación es semanal completa |
| Tablet, correcciones, aprobación, bolsa y cierres | Existente; planificación, reloj y validación siguen separados |
| Comparativo descargable | Añadido CSV: planificado, fichado, pausas, efectivo y validado; aprobaciones caducadas identificadas |
| Firma electrónica y seguimiento 0/2, 1/2, 2/2 | Pendiente de implementación e integración de firma |
| Intercambios solicitados por trabajadores | Pendiente de confirmar uso y diseñar aprobación |
| Nóminas: reparto individual masivo | Pendiente; hoy se guardan documentos por ficha |
| Importación Skello | Aplazada hasta aceptación funcional; sin migración ejecutada |

No existe todavía equivalencia total con Skello. Que una pieza figure como existente no certifica todo su recorrido en producción; la aceptación requiere ejemplos reales y verificación de permisos.

## Firma: decisión técnica

Skello utiliza Yousign con autenticación SMS y expediente de prueba. Para reproducir ese proceso se preparará una integración de proveedor, no se equiparará un dibujo o un botón de «leído» a ese servicio.

Flujo requerido: PDF privado original → trabajador y, opcionalmente, firmante de empresa → vista previa y posiciones → solicitud → seguimiento por firmante → documento firmado y expediente descargables. Estados pendientes, parcialmente firmado, finalizado, rechazado, caducado y cancelado. Las notificaciones del proveedor deben ser autenticadas e idempotentes. Original, hash y trazabilidad se conservan; ningún estado «firmado» se acepta desde el navegador.

Antes de activarlo faltará cuenta/API del proveedor elegido, condiciones económicas, remitente y prueba completa en sandbox. No se enviarán documentos reales durante el desarrollo. La cuenta de firma de Skello no supone disponer de API propia de Yousign.

## Validación de esta entrega de horarios

- Pruebas puras de cobertura, contratos, vacantes, versiones, PDF y CSV.
- Pruebas PostgreSQL con esquema aislado: crear/asignar/liberar, referencias ajenas, centro compartido, copia, semanas publicadas inmutables.
- Pruebas de aislamiento de usuarios y locales.
- Navegador local con datos ficticios: 1440×800 y 390×844; calendario mensual, semana, persona y alta de vacante sin desbordamiento.
- Suite general: el lanzador Chrome del test visual no arranca en este entorno; verificación visual independiente con navegador integrado. Los fallos iniciales de expectativas antiguas de centro compartido se corrigieron manteniendo las pruebas de rechazo de centros ajenos.

## Fuentes oficiales

- https://help.skello.io/es/articles/8680464-como-utilizo-las-distintas-vistas-de-planificacion-en-skello
- https://help.skello.io/es/articles/6990612-como-publico-la-planificacion-en-skello
- https://help.skello.io/es/articles/6564522-como-funciona-la-firma-electronica-de-yousign
- https://help.skello.io/es/articles/7972902-como-envio-documentos-para-su-firma-electronica-en-skello
- https://help.skello.io/es/articles/9720306-como-puedo-hacer-un-seguimiento-de-los-documentos-enviados-para-su-firma-electronica-en-skello
