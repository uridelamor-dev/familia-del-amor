# WhatsApp Cloud API — preparación y piloto

Estado: primera fase implementada, sin desplegar ni migrar el número operativo.
Fecha de revisión: 22 de septiembre de 2026.

## Decisión

Integración propia con Meta Cloud API. Número final: +34 633 129 031, hoy en WhatsApp Business.
La primera entrega usa exclusivamente un número de prueba de Meta, una lista cerrada de
receptores y atención humana. El número real está bloqueado como emisor por código. La API
rechaza `WA_CLOUD_MODE=production`: esta entrega NO es un cambio de proveedor listo para producción.

## Implementado

- `/panel/#whatsapp-cloud`, accesible desde WhatsApp, únicamente para dirección.
- Mensajes individuales entrantes de prueba, historial paginado, búsqueda y estados.
- Tomar/resolver una conversación, propiedad exclusiva persistente y auditoría.
- Respuestas de texto dentro de la ventana de 24 horas y plantillas aprobadas simples con
  variables posicionales. Solo se ofrecen plantillas BODY/FOOTER; no multimedia ni botones.
- Descarga autenticada de medios entrantes, máximo 20 MB, nunca ejecución inline en el panel.
- Firma HMAC sobre cuerpo original, filtrado de WABA/número/receptores, confirmación HTTP
  posterior al COMMIT y deduplicación por identificador de Meta.
- Registro persistente de intención antes del envío, idempotencia por petición y contenido,
  actualización monotónica de estados, correlación de recibos con intentos inciertos.
- Un timeout no se reintenta. La conversación bloquea nuevos envíos hasta reconciliar el
  resultado para evitar duplicados. Si Meta nunca devuelve recibo, requiere revisión técnica.
- Máximo de 40 intentos salientes por 24 horas para todo el piloto, con bloqueo PostgreSQL.

No se ha cambiado `whatsapp.js`, los grupos actuales, Sara ni los workers de campañas.
La bandeja del piloto muestra SOLO mensajes Cloud posteriores a su configuración. No presenta
historial de la app, conversaciones de Baileys ni historial fabricado como si estuviera importado.

## Cuenta de prueba localizada en Meta

En la app existente «Respuestas automáticas» (671839232558458), «Paso 1. Pruébalo»:
- Emisor de prueba: +1 (555) 131-0780.
- Phone Number ID: 169923672868154.
- WABA de prueba: 164103890119737.
- Versión mostrada en el ejemplo oficial del panel: v25.0.
- Token: «Not generated yet». Destinatario: sin seleccionar.

No se generó el token, no se concedieron nuevos permisos y no se enviaron mensajes.
La próxima intervención del propietario es generar/autorizar el token en esa pantalla y
verificar el móvil receptor elegido para las pruebas. No pegar secretos en la conversación.

## Configuración pendiente (secretos solo en servidor)

La aplicación ya depende de `pg` y `express`; no se añadieron dependencias al proyecto.
Configurar en un despliegue de pruebas separado de producción:

```
WA_CLOUD_MODE=pilot
WA_CLOUD_PHONE_NUMBER_ID=<id del número de prueba de Meta>
WA_CLOUD_WABA_ID=<id de su cuenta WhatsApp>
WA_CLOUD_API_VERSION=<versión vigente seleccionada en Meta>
WA_CLOUD_ACCESS_TOKEN=<token con whatsapp_business_messaging y whatsapp_business_management>
WA_CLOUD_APP_SECRET=<secreto de la app propietaria>
WA_CLOUD_VERIFY_TOKEN=<secreto aleatorio exclusivo del webhook>
WA_CLOUD_TEST_RECIPIENTS=<teléfonos de prueba con prefijo, separados por comas>
```

No guardar tokens en el repositorio, navegador, notas o capturas. Las respuestas de estado no
exponen credenciales. El webhook público HTTPS será:
`https://<despliegue-de-pruebas>/api/whatsapp/cloud/webhook`.
Suscribir `messages` y la WABA correcta a la app. No seleccionar otra cuenta solo porque se
llame «Familia del Amor»: la cuenta observada con +34 645 619 572 no es el número solicitado.

Pasos del piloto:

1. Confirmar app de Meta y número de prueba, con acceso del propietario.
2. El propietario completa creación/autorización de credenciales y verificaciones exigidas.
3. Desplegar con base separada y secretos de prueba; comprobar reto y firma del webhook.
4. Dar de alta un teléfono del equipo en la lista de prueba de Meta y del servidor.
5. Con consentimiento explícito, probar entrada, respuesta, plantilla, adjunto y recibos reales.
6. Mantener pausadas las automatizaciones del piloto (no existe ruta de activación en esta entrega).

No se requiere el número real ni borrar la cuenta del móvil para estos pasos.

## Trabajo posterior antes de poder migrar

Esta lista es una condición de salida, no funcionalidades ya terminadas:

- Separar el motor Sara del socket Baileys; todos sus envíos y herramientas deben pasar por el
  transporte oficial. Verificar pausa justo antes de enviar y antes de ejecutar herramientas,
  cancelación de trabajo pendiente, serialización por conversación y recuperación tras caída.
- Conectar reservas, cancelaciones, seguimiento, cumpleaños, campañas, formularios y documentos
  con plantillas y cola oficial. Hoy gran parte manda texto libre y algunas funciones tragan el
  error: no reutilizarlas sin cambiar esa semántica.
- Sustituir comprobación Baileys `onWhatsApp` por un flujo compatible con Cloud. Nunca afirmar
  que un teléfono existe si la API oficial no lo ha verificado. Mantener un cupón por persona.
- Avisos persistentes por local, confirmación de lectura y escalado. Además de reservas, los
  grupos actuales intervienen en facturas y horarios; auditar cada uso antes de retirarlos.
- Acceso por local y usuario para encargados; el piloto se restringe a dirección para no ampliar
  de forma involuntaria el acceso a datos privados.
- Adjuntos salientes, respuestas citadas, notas/asignación a local, ficha de cliente/reservas,
  borradores persistentes, indicadores de no leídos y alertas de atención.
- Exportar/inventariar el historial existente: `whatsapp_messages` almacena intercambios con
  mensaje/respuesta, no eventos individuales completos. Verificar restricciones NOT NULL:
  los callbacks actuales pueden intentar guardar `respuesta=null`. Comprobar datos reales.
- Establecer custodia, conservación y copias de medios y mensajes. Actualmente los medios
  Cloud se descargan bajo demanda y su enlace no es un archivo permanente propio.
- Configurar pagos, límites efectivos de la cuenta, consentimiento y bajas; presupuesto con
  tarifas vigentes, incluidas las de servicio anunciadas para el 1 de octubre de 2026.
- Revisar la cola acumulada. No reproducirla automáticamente al activar Cloud.
- Solo entonces programar corte, conservar/exportar chats importantes y pedir confirmación
  inmediata antes de eliminar la cuenta Business del móvil y registrar el número en Cloud.

## Validación realizada

- 16 pruebas de protocolo, HTTP y PostgreSQL real aprobadas en una base local separada.
- Verificación manual en navegador del panel con API simulada, a 1440×800 y 390×844:
  acceso a la bandeja, selección, toma y envío ficticio; sin desbordamiento horizontal móvil.
- La prueba general tuvo 5793 casos aprobados, 7 cancelados por no poder lanzar Chrome en el
  entorno y un caso de integración saltado por falta de variable de base. La prueba Cloud de
  PostgreSQL se ejecutó aparte con su base aislada y pasó. No equivale a validación en Meta.

Comandos:

```
node --test tests/whatsapp-cloud.test.js tests/whatsapp-cloud-http.test.js
WA_TEST_DATABASE_URL=postgresql://127.0.0.1/codex_whatsapp_cloud_test_<fecha> node --test tests/whatsapp-cloud-db.test.js
node tools/cloud-preview.mjs
```

La vista `http://127.0.0.1:5098/preview-panel` usa datos ficticios y una sesión local de prueba;
`tools/cloud-preview.mjs` solo escucha en localhost y no forma parte del arranque de producción.

## Fuentes oficiales

- API y permisos: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- Migración e historial: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account
- Ventana y cambio de tarifas: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/
