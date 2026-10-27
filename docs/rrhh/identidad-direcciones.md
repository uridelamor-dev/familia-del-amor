# DNI y dirección en la incorporación

El alta y la edición comparten adjuntos de las dos caras del DNI/NIE y propuestas de lectura de nombre, número y nacimiento. El acceso «Rellenar nombre y nacimiento desde el DNI» está en el primer paso; la subida está junto al DNI en el tercer paso. Aplicar una propuesta requiere una revisión explícita. No se cambia ningún dato por el mero hecho de subir el archivo.

Los adjuntos se guardan en PostgreSQL, fuera de las carpetas públicas, y se vinculan a `hr_documentos` como sensibles en la misma transacción que crea o modifica la ficha. Los borradores guardan únicamente sus identificadores. La confirmación del trabajador conserva los identificadores y los vincula al activar la ficha. Recuperar una solicitud transfiere los adjuntos pendientes al responsable que la retoma. Las subidas sin ficha asociada se eliminan después de 30 días durante la siguiente subida. Los documentos vinculados no se purgan.

Se admiten JPEG, PNG y PDF de hasta 5 MB por cara; PDF sin contraseña y de una o dos páginas. La lectura comprueba el formato y letra de control del DNI/NIE y la fecha. Los datos no reconocidos quedan vacíos. Solo Dirección y RR. HH. pueden subir y leer estos documentos. No se envían por WhatsApp.

La dirección usa las sugerencias y detalles de Google Places. Al seleccionar una sugerencia se rellenan dirección, código postal, población y país. Los campos siguen siendo editables para completar piso, puerta o corregir datos.

## Configuración del servidor

- `ANTHROPIC_API_KEY`: servicio de lectura ya utilizado por otras funciones de la app. Modelo `claude-haiku-4-5-20251001`, Messages API, imágenes y PDF en base64, sin herramientas. Una lectura por minuto y responsable.
- `GOOGLE_PLACES_API_KEY`: clave existente del servidor, con **Places API (New)** habilitada y permitida en las restricciones de la clave. La conexión sale del servidor: no usar una clave restringida a referentes HTTP del navegador. El proyecto necesita facturación activa y cuota disponible. No se expone al navegador. Las sugerencias muestran la atribución de Google.
- La migración de `initDB` crea `rrhh_identidad_adjuntos` y añade los componentes de dirección. No se necesita una migración manual ni nuevas dependencias.

Si falta una clave o el proveedor falla, el formulario muestra el problema y permite completar los datos manualmente. La subida del DNI no depende de que la lectura automática funcione.

## Validación realizada

51 pruebas específicas aprobadas: adjuntos, permisos, lectura, vinculación transaccional, recuperación de confirmaciones, componentes de dirección y regresiones de RR. HH. Prueba HTTP de subida multipart con PDF ficticio. Navegador local: alta, edición, aplicación de propuesta, selección de dirección, recuperación de borrador y vista móvil de 390 px. Servicios externos simulados en esas pruebas, sin enviar documentos personales.

La batería general conserva fallos existentes en `b07baa4`; la comparación no detectó nuevos fallos. Las claves y PostgreSQL de producción no están disponibles en el equipo local: queda verificar la conexión real de los proveedores tras publicar, con un documento de prueba y una dirección pública.

Referencias de integración: [Claude Vision](https://platform.claude.com/docs/en/build-with-claude/vision), [PDF](https://platform.claude.com/docs/en/build-with-claude/pdf-support), [Google Places Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete).

## Corrección de conexión de direcciones

La verificación publicada detectó que la subida y lectura del documento ficticio funcionaban, pero las direcciones devolvían un error genérico. Se sustituye la llamada Legacy por Autocomplete (New), mediante POST, y Place Details (New), mediante GET y máscara limitada a dirección y componentes. El contrato del formulario se conserva. Las claves quedan únicamente en las cabeceras del servidor.

El formulario distingue ahora servicio desactivado, clave inválida, restricciones de API, IP o referente, facturación, cuota y timeout. Solo muestra mensajes locales a partir de códigos conocidos; nunca devuelve el mensaje bruto de Google ni la dirección consultada en registros. No se ha confirmado todavía cuál de esas causas produjo el error en producción.

Para verificar después de publicar: buscar una dirección pública, elegir la sugerencia y comprobar dirección, código postal, población y país. Si aparece un código de configuración, revisar en Google Cloud el proyecto de la clave guardada en Replit, sin pegar ni compartir su valor. El error SERVICE_DISABLED requiere habilitar Places API (New); API_KEY_SERVICE_BLOCKED requiere permitir esa API en la clave. Los cambios de código no activan servicios ni facturación en Google Cloud.
