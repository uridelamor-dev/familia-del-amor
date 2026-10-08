Actúa como responsable de desarrollo del proyecto existente de Família de l’Amor. Quiero añadir una tienda de lotes de Navidad integrada en la web y gestionada desde marketing.

Lee este prompt completo antes de actuar. Tu primera tarea es auditar el repositorio, presentar un plan y esperar mi aprobación.

## 0. INSTRUCCIÓN CRÍTICA: conservar íntegramente el proyecto existente

La tienda debe ser un apartado NUEVO de la landing actual, y su administración debe ser un módulo NUEVO dentro del panel existente, accesible desde marketing.

NO debes borrar, reconstruir, sustituir ni alterar funcionalidades existentes de la landing o del panel. Tampoco debes crear una aplicación independiente, reemplazar la navegación general, cambiar el sistema de usuarios o rehacer el diseño actual.

La integración debe ser aditiva y compatible con lo que ya funciona.

Antes de modificar código, datos o configuración:

1. Audita el repositorio y la aplicación.
2. Identifica los puntos de integración.
3. Presenta un plan con los cambios propuestos, sus riesgos y fases.
4. Espera mi aprobación explícita.

Si necesitas tocar un componente compartido, explica previamente el cambio mínimo y cómo protegerás sus funciones actuales.

Antes de implementar, prepara una copia de seguridad verificable, un punto de restauración y un procedimiento de reversión. Conserva los cambios previos del proyecto.

No publiques nada en producción sin mostrar antes una demo completa y recibir mi aprobación.

## 1. Auditoría inicial obligatoria

Revisa:

- Arquitectura, tecnologías, dependencias e instrucciones del repositorio.
- Landing, rutas, navegación, estilos y componentes actuales.
- Panel y apartado de marketing.
- Autenticación, usuarios y permisos.
- Base de datos y almacenamiento de archivos.
- Correo, traducciones, configuración y despliegue.
- Pruebas existentes y funciones que deben permanecer intactas.

Tu primera respuesta debe explicar:

- Qué existe actualmente.
- Cómo integrarás la tienda y su administración.
- Qué archivos, rutas, tablas o servicios propones añadir o modificar.
- Qué cambios compartidos serían necesarios.
- El modelo de datos y permisos.
- Las fases de implementación.
- Los riesgos, pruebas de regresión y procedimiento de reversión.
- Los datos operativos pendientes.

Después, detente y espera mi aprobación para implementar.

## 2. Nombre y alcance

Nombre comercial:

**Família de l’Amor · Lots de Nadal**

La tienda venderá inicialmente lotes de Navidad y deberá poder reutilizarse para futuras campañas.

Decisiones fijadas:

- Público principal: empresas con pedidos de 100, 200, 500 o más lotes.
- Venta también a particulares.
- Catalán y castellano.
- Configurador visual de lotes.
- Cuatro lotes preparados y personalizables.
- Recomendaciones por presupuesto.
- Catálogo inicial de exactamente 60 productos.
- Entrega a domicilio y recogida.
- Sin control cuantitativo de stock inicialmente.
- Pago por transferencia bancaria.
- Compra directa y solicitud de presupuesto disponibles simultáneamente a cualquier volumen.
- Demo completa antes de producción.

No incluyas una pasarela de tarjeta como requisito de esta fase.

## 3. Nuevo apartado de la landing

Añade un apartado de Navidad respetando la identidad y estructura actuales.

Debe incluir:

- Presentación atractiva de la campaña.
- Acceso destacado para empresas.
- Los cuatro lotes preparados.
- Botón para crear un lote desde cero.
- Acceso a recomendaciones por presupuesto.
- Información de entrega y recogida.
- Acceso a compra directa y solicitud de presupuesto.

Reutiliza los componentes y estilos existentes cuando sea posible. Evita cambios globales que afecten a otras secciones.

## 4. Idiomas

Toda la experiencia debe funcionar en catalán y castellano:

- Navegación y textos comerciales.
- Categorías y productos.
- Configurador.
- Formularios, validaciones y errores.
- Resúmenes y checkout.
- Correos.
- Presupuestos y documentos de pedido.
- Información de entrega y condiciones.

Cambiar de idioma no debe perder el lote configurado ni el carrito.

Marketing debe poder editar los contenidos en ambos idiomas.

## 5. Configurador visual premium

Quiero una experiencia de preparación de regalos, no solamente un listado de productos.

El cliente tendrá cuatro caminos:

1. Elegir un lote preparado.
2. Crear su lote desde cero.
3. Personalizar un lote preparado.
4. Indicar un presupuesto y recibir propuestas.

La caja y los productos deben representarse visualmente mientras se configura el lote.

En ordenador, mantén visible la caja o el resumen durante la selección. En móvil, incorpora un acceso flotante al lote sin tapar controles.

Incluye:

- Fotografías individuales nítidas.
- Filtros por categoría y precio.
- Añadir y quitar artículos.
- Modificar unidades de cada artículo.
- Cambiar embalaje.
- Dedicatoria y opciones corporativas.
- Recomendaciones para completar el lote.
- Precio actualizado en tiempo real.
- Resumen visual final compartible sin datos personales.
- Animaciones discretas y accesibilidad.

Distingue claramente:

- Unidades de cada producto dentro de un lote.
- Número de lotes idénticos que se comprarán.

Configurar un lote y pedir 150 unidades debe multiplicar correctamente productos, embalajes y extras.

Permite cantidades superiores a 500 sin un límite arbitrario del selector.

Valida la compatibilidad del embalaje. Un jamón entero no puede aparecer dentro de una caja pequeña.

## 6. Catálogo EXACTO de 60 productos

Carga los siguientes artículos con sus nombres y precios de venta sin IVA.

Son precios iniciales de demostración, no tarifas verificadas de proveedores. No sustituyas artículos, no cambies sus precios y no recuperes el catálogo anterior de 30 productos.

Los embalajes se gestionan aparte y no cuentan entre los 60 productos.

### Jamones y paletillas — 8 productos

1. Paletilla Duroc — 59,90 €
2. Jamón Duroc — 99,90 €
3. Paletilla ibérica de cebo — 89,90 €
4. Jamón ibérico de cebo — 169,90 €
5. Paletilla ibérica de cebo de campo — 119,90 €
6. Jamón ibérico de cebo de campo — 219,90 €
7. Paletilla ibérica de bellota 100% — 199,90 €
8. Jamón ibérico de bellota 100% — 399,90 €

### Embutidos — 9 productos

9. Fuet artesano — 4,50 €
10. Chorizo Duroc — 6,90 €
11. Salchichón Duroc — 6,90 €
12. Chorizo ibérico de cebo — 9,90 €
13. Salchichón ibérico de cebo — 9,90 €
14. Lomo embuchado Duroc — 14,90 €
15. Lomo ibérico de cebo — 29,90 €
16. Chorizo ibérico de bellota — 24,90 €
17. Lomo ibérico de bellota — 54,90 €

### Quesos — 7 productos

18. Cuña de queso semicurado — 5,90 €
19. Cuña de queso curado — 7,90 €
20. Queso de oveja artesano 250 g — 9,90 €
21. Queso manchego curado 500 g — 17,90 €
22. Queso de cabra artesano — 14,90 €
23. Queso de oveja reserva entero — 49,90 €
24. Queso añejo premium entero — 74,90 €

### Vinos — 12 productos

25. Vino tinto joven — 5,00 €
26. Vino blanco joven — 5,90 €
27. Vino rosado — 6,50 €
28. Vino blanco verdejo — 7,90 €
29. Vino tinto crianza Rioja — 9,90 €
30. Vino tinto crianza Ribera del Duero — 12,90 €
31. Vino blanco Albariño — 14,90 €
32. Vino tinto reserva Rioja — 17,90 €
33. Vino tinto Priorat — 24,90 €
34. Vino tinto reserva premium — 29,90 €
35. Vino tinto gran reserva — 39,90 €
36. Vino tinto selección especial — 50,00 €

### Cavas y espumosos — 4 productos

37. Cava brut — 7,90 €
38. Cava brut nature reserva — 12,90 €
39. Cava rosado premium — 19,90 €
40. Cava gran reserva — 34,90 €

### Conservas gourmet — 8 productos

41. Mejillones en escabeche — 4,90 €
42. Sardinillas en aceite de oliva — 5,90 €
43. Bonito del norte — 7,90 €
44. Anchoas del Cantábrico — 12,90 €
45. Berberechos al natural — 14,90 €
46. Navajas al natural — 13,90 €
47. Ventresca de bonito premium — 16,90 €
48. Conserva de marisco selección premium — 24,90 €

### Turrones y neules — 8 productos

49. Neules tradicionales — 4,50 €
50. Neules bañadas en chocolate — 6,90 €
51. Turrón de chocolate crujiente — 5,90 €
52. Turrón de Jijona — 7,90 €
53. Turrón de Alicante — 7,90 €
54. Turrón de yema tostada — 8,90 €
55. Turrón artesano premium — 14,90 €
56. Surtido de turrones artesanos — 17,90 €

### Otros gourmet — 4 productos

57. Aceitunas gourmet — 3,90 €
58. Paté artesano — 5,90 €
59. Aceite de oliva virgen extra 500 ml — 12,90 €
60. Foie mi-cuit — 24,90 €

Cada ficha tendrá:

- Identificador estable.
- Categoría.
- Nombre y descripción en ambos idiomas.
- Precio de venta sin IVA.
- Coste interno.
- IVA configurable.
- Fotografía individual.
- Estado visible u oculto.
- Orden de aparición.
- Formato y peso cuando estén confirmados.

No inventes marcas, pesos, certificaciones, alérgenos ni características no confirmadas.

## 7. Fotografías de los 60 artículos

Este trabajo incluye buscar o generar, preparar y cargar todas las fotografías. No necesitaré enviarte otro prompt para las imágenes.

Cada uno de los 60 productos debe tener una fotografía individual, nítida y correspondiente al artículo.

No sirven:

- Una imagen por categoría.
- La misma fotografía genérica para varios productos.
- Collages como sustituto de fotografías individuales.
- Imágenes borrosas.
- Enlaces temporales.
- Fotografías sin derechos de uso verificados.

Busca fotografías con licencia comercial adecuada o genera imágenes cuando sea necesario.

Conserva su procedencia, licencia y atribución cuando corresponda. Para imágenes generadas, registra su origen y comprueba que no representen características engañosas.

Usa preferentemente:

- Fondo blanco o neutro.
- Iluminación uniforme.
- Encuadre cuadrado.
- Producto completo visible.
- Resolución suficiente para ampliar.
- Archivos optimizados para web.

Guarda las imágenes en el proyecto o en su almacenamiento estable, sin depender de enlaces externos que puedan desaparecer.

Añade texto alternativo en ambos idiomas.

Marketing debe poder sustituir las imágenes y añadir varias fotografías por producto.

Incluye imágenes de embalajes y lotes preparados.

Entrega un inventario que relacione los 60 productos con sus imágenes y procedencia. Si falta alguna, identifícala y no declares completo el catálogo.

Las imágenes de demostración deberán revisarse antes de vender productos reales.

## 8. Embalajes y personalización

Carga estos cinco embalajes con los siguientes importes sin IVA:

| Embalaje | Coste | Venta |
|---|---:|---:|
| Caja kraft | 3,00 € | 4,29 € |
| Caja premium | 6,00 € | 8,57 € |
| Caja de madera | 9,00 € | 12,86 € |
| Cesta tradicional | 7,00 € | 10,00 € |
| Caja especial para jamón | 5,00 € | 7,14 € |

Las cajas para jamón ya existen y cuestan aproximadamente 5 €.

No presupongas que ese coste incluye relleno, protección, decoración o manipulación: deja esta cuestión pendiente de validación antes de producción.

Cada embalaje tendrá fotografía, descripción bilingüe, coste, precio, disponibilidad comercial y compatibilidad con los productos.

Si un lote requiere varios embalajes, muestra y calcula todas sus unidades.

Incluye opciones editables de:

- Dedicatoria.
- Tarjeta personalizada.
- Logotipo de empresa.
- Presentación o caja personalizada.

Sus precios, costes, mínimos y plazos serán configurables. No inventes tarifas definitivas ni presentes como gratuito un servicio pendiente de valorar.

## 9. Cuatro lotes preparados

Crea estos cuatro lotes:

1. **El Detallet:** económico, adecuado para regalos a empleados.
2. **El Nostre Nadal:** selección equilibrada de dulce, salado y bebida.
3. **La Gran Família:** mayor variedad y productos premium.
4. **El Gran Regal:** selección de mayor categoría.

Propón sus composiciones usando exclusivamente el catálogo y embalajes compatibles.

La composición exacta no está fijada todavía: preséntala en la demo para revisión.

Calcula su precio sumando productos, cantidades, embalaje y extras. No introduzcas un precio fijo desconectado de sus componentes ni apliques el margen dos veces.

El cliente podrá modificarlos.

Marketing podrá editar nombres, traducciones, composición, cantidades, fotografías, orden y visibilidad.

## 10. Margen, presupuesto, descuentos e IVA

### Margen bruto

El objetivo es un **30% de margen bruto sobre venta sin IVA**, no un recargo del 30% sobre el coste.

Fórmulas:

- Venta sin IVA = coste sin IVA / 0,70.
- Margen bruto = (venta sin IVA − coste sin IVA) / venta sin IVA.

Ejemplo: un coste de 10,00 € da una venta de 14,29 € al redondear.

Respeta los precios de venta del catálogo. No vuelvas a aplicarles el margen.

Si necesitas costes para la demo, puedes calcular un coste teórico de venta × 0,70, claramente identificado como estimado.

Marketing podrá editar costes y ventas, recalcular precios y consultar el margen efectivo.

### Recomendaciones por presupuesto

Permite indicar un presupuesto y recibir combinaciones editables.

Distingue presupuesto por lote y presupuesto total del pedido. Explica si incluye IVA, embalaje, extras y transporte.

Muestra importe usado y restante. No anuncies que una propuesta cumple el presupuesto si los conceptos incluidos lo superan.

Permite preferencias como excluir alcohol, utilizando únicamente información confirmada.

### Descuentos automáticos

Aplica estos tramos sobre el subtotal elegible de productos y embalajes, antes del IVA y sin transporte:

- Menos de 500,00 €: 0%.
- Desde 500,00 € hasta 999,99 €: 5%.
- Desde 1.000,00 €: 10%.

Los descuentos NO son acumulativos. Aplica solo el tramo mayor correspondiente.

El umbral se determina sobre la base elegible anterior al descuento.

Marketing podrá editar o desactivar umbrales, porcentajes y conceptos elegibles.

Los extras de personalización no se incluirán automáticamente en la base elegible salvo configuración explícita.

Los descuentos especiales autorizados en presupuestos deberán tener un tratamiento explícito y no acumularse automáticamente con los tramos.

Muestra base, porcentaje, ahorro y total.

El descuento reduce el margen: con margen inicial del 30%, un descuento del 5% deja aproximadamente un 26,32%; uno del 10%, un 22,22%, antes de otros gastos.

### IVA mixto

Configura el IVA por producto y concepto. No apliques un único tipo a todo el lote.

Reparte los descuentos entre las líneas elegibles y calcula bases e impuestos por tipo.

Valida antes de producción el tratamiento fiscal de productos, embalajes, extras y transporte.

Usa aritmética decimal y una política consistente de redondeo.

Los importes deben coincidir en configurador, servidor, checkout, correos, PDF y panel.

Identifica claramente los precios sin IVA y muestra el total final con los impuestos y transporte correspondientes antes de confirmar una compra.

## 11. Venta corporativa

El flujo principal debe facilitar que una empresa configure una vez y compre 100, 150, 250, 500 o más lotes idénticos.

Debe ver:

- Composición por lote.
- Precio unitario.
- Cantidad de lotes.
- Subtotal.
- Descuento.
- Personalización.
- Transporte.
- IVA.
- Total.

Las dos opciones deben estar disponibles **SIMULTÁNEAMENTE Y A CUALQUIER VOLUMEN**:

1. Comprar directamente por transferencia.
2. Solicitar presupuesto personalizado.

No impongas presupuesto obligatorio al llegar a 100 o 500 lotes. No ocultes la compra directa por volumen. Tampoco reserves los presupuestos únicamente para pedidos grandes.

Recoge los datos empresariales y de facturación necesarios, sin exigir campos de empresa a particulares.

Permite logotipo, tarjeta y felicitación corporativa.

## 12. Compra directa y transferencia

El cliente revisará su pedido, datos, entrega, impuestos y condiciones antes de confirmar.

Al confirmar:

- Genera una referencia única.
- Crea el pedido como **Pendiente de transferencia**.
- Muestra y envía titular, IBAN, importe, concepto y plazo de pago.
- Usa la referencia del pedido como concepto identificativo.
- Envía confirmación al cliente y aviso a los responsables configurados.

Los datos bancarios y correos serán editables con permisos restringidos.

No inventes datos bancarios reales para la demo.

Distingue confirmación del pedido de confirmación del cobro.

Si el cliente comunica que ha transferido o adjunta un justificante, registra el aviso como pendiente de verificación. **No marques el pedido como pagado.**

Solo un usuario autorizado podrá confirmar manualmente el pago después de comprobar el ingreso.

Registra quién verificó el pago, cuándo y por qué importe.

Evita pedidos y correos duplicados por recargas o doble clic.

Define el tratamiento de vencimientos, cancelaciones y pagos con importes distintos antes del lanzamiento.

## 13. Solicitud de presupuesto

Permite solicitar presupuesto conservando:

- Productos y unidades por lote.
- Número de lotes.
- Embalajes.
- Personalización.
- Idioma.
- Contacto y datos empresariales.
- Entrega y fecha deseada.
- Observaciones.

Confirma la recepción al cliente y avisa a marketing.

Marketing podrá:

- Revisar y modificar la oferta.
- Añadir transporte o servicios.
- Aplicar descuentos autorizados.
- Fijar validez y condiciones.
- Emitir el presupuesto.
- Registrar aceptación o rechazo.
- Convertir un presupuesto aceptado en pedido.

Mantén versiones e historial.

La conversión debe conservar los datos e importes aceptados y evitar duplicados.

El pedido resultante seguirá el flujo de transferencia y verificación manual.

Si cambian condiciones materiales después de aceptarse, solicita nueva aceptación.

## 14. Entrega y recogida

Ofrece:

- Entrega a domicilio.
- Recogida.

Marketing podrá configurar zonas, tarifas, puntos de recogida, horarios, fechas, plazos y condiciones.

No asumas transporte gratuito ni cobertura no confirmada.

Para multidestino, permite recoger las necesidades y cotizar el transporte. Protege los datos de los destinatarios.

Un transporte pendiente de cotizar no debe aparecer como gratuito ni formar parte de un total presentado como definitivo.

Mantén ambos recorridos comerciales; si falta valorar un servicio, confirma el total final antes de solicitar la transferencia.

Las tarifas, puntos de recogida y plazos reales están pendientes de concretar antes de producción.

## 15. Pedidos y conservación de datos

Separa estados de pago y logística.

Contempla:

- Pendiente de transferencia.
- Pendiente de verificación.
- Pagado.
- En preparación.
- Listo para recoger o enviar.
- Enviado, cuando corresponda.
- Entregado.
- Cancelado.

Conserva motivo y trazabilidad de los cambios.

Cada pedido debe guardar una instantánea de productos, precios, cantidades, impuestos, descuentos, embalajes, extras y condiciones aceptadas.

Modificar el catálogo no debe cambiar pedidos históricos ni presupuestos aceptados.

Inicialmente no habrá control cuantitativo de stock. Sí se podrán ocultar o desactivar productos.

No muestres existencias inventadas.

## 16. Panel completo de marketing

Añade el módulo **Tienda / Lotes** dentro del panel actual.

Debe permitir:

- Crear, editar, ordenar, ocultar y archivar productos.
- Eliminar únicamente cuando no perjudique históricos.
- Gestionar categorías y traducciones.
- Editar costes, precios e IVA.
- Subir y sustituir fotografías.
- Gestionar embalajes y personalizaciones.
- Configurar los cuatro lotes preparados.
- Gestionar recomendaciones por presupuesto.
- Editar descuentos y condiciones comerciales.
- Consultar pedidos y clientes.
- Buscar y filtrar pedidos por referencia, empresa, fecha, campaña y estado.
- Verificar transferencias manualmente.
- Gestionar presupuestos y convertirlos en pedidos.
- Gestionar entregas, recogidas y multidestino.
- Descargar pedidos y presupuestos en PDF.
- Exportar pedidos a Excel.
- Configurar datos bancarios y correos.
- Editar textos y plantillas bilingües.
- Configurar campañas y sus fechas.
- Activar o desactivar tienda y módulo de gestión por separado.
- Consultar ventas confirmadas, cobros pendientes y solicitudes, sin confundirlos.

Los artículos relacionados con históricos deben archivarse o usar borrado lógico.

## 17. Permisos

Reutiliza autenticación y permisos existentes.

Distingue permisos para:

- Consultar.
- Editar catálogo.
- Gestionar pedidos y presupuestos.
- Confirmar pagos.
- Autorizar descuentos especiales.
- Exportar datos.
- Editar datos bancarios.
- Activar o desactivar módulos.

No concedas automáticamente todas las capacidades a cualquier usuario de marketing.

Valida permisos en servidor, no solo ocultando botones.

Protege costes internos, márgenes, datos personales, justificantes y configuración bancaria.

Registra las operaciones sensibles.

## 18. Activación independiente y campañas

Implementa dos controles independientes:

1. Tienda pública activa o inactiva.
2. Módulo de marketing activo o inactivo.

Desactivar uno no debe desactivar automáticamente el otro.

Mantén un control administrativo superior para poder reactivar el módulo aunque esté oculto para marketing.

Prueba las cuatro combinaciones de ambos controles.

Con la tienda apagada y marketing activo, debe poder gestionarse el histórico.

Si la tienda sigue activa y el módulo de marketing está desactivado, conserva una vía de gestión para un administrador autorizado.

Apagar la campaña:

- Debe impedir nuevas compras y solicitudes también en servidor.
- No debe afectar al resto de la landing.
- No debe borrar productos, imágenes, pedidos, presupuestos ni clientes.
- Debe conservar configuraciones e históricos.
- Debe permitir reactivar la tienda posteriormente.

El sistema debe poder reutilizarse para próximas campañas.

## 19. Privacidad y seguridad

Integra los avisos de privacidad y condiciones en ambos idiomas, con validación antes de producción.

Recoge solo los datos necesarios.

Separa el consentimiento comercial opcional de la gestión del pedido.

Protege direcciones, listas multidestino y justificantes.

No expongas datos personales en enlaces compartidos, archivos públicos o registros técnicos.

Implementa:

- Validación en servidor.
- Control de acceso por operación y recurso.
- Protección de formularios frente a abuso.
- Validación de archivos y tamaños.
- Protección de secretos.
- Conexiones seguras.
- Medidas adecuadas frente a inyección, XSS, CSRF y accesos indebidos.
- Copias de seguridad y trazabilidad.

Antes de vender productos reales, valida información alimentaria, alérgenos, formatos, fiscalidad, condiciones de venta y requisitos aplicables al alcohol.

No inventes datos legales o comerciales para completar campos.

## 20. Implementación por fases

Tras aprobar el plan:

1. Preparación, copia de seguridad y estructura de datos.
2. Permisos, cálculo comercial y catálogo en marketing.
3. Apartado público, fotografías y configurador bilingüe.
4. Pedidos, transferencia, presupuestos y entrega.
5. Gestión completa, exportaciones y campañas.
6. QA, demo, correcciones y aprobación de producción.

Usa migraciones aditivas y una carga inicial que no duplique registros ni sobrescriba datos reales.

Centraliza el cálculo de precios y valida todo en servidor.

No confíes en importes enviados por el navegador.

Justifica cualquier dependencia nueva o modificación compartida.

## 21. Pruebas y criterios de aceptación

Comprueba y documenta:

- La landing y el panel existentes siguen funcionando.
- Hay exactamente 60 productos, con distribución 8/9/7/12/4/8/8/4.
- Los nombres y precios coinciden con este prompt.
- Hay 60 fotografías individuales y editables.
- Los cinco embalajes tienen costes y precios correctos.
- Los cuatro lotes preparados se pueden modificar.
- El configurador funciona en móvil y ordenador.
- Cambiar de idioma conserva la configuración.
- Funcionan pedidos de 1, 10, 100, 150, 500 y más de 500 lotes.
- Compra directa y presupuesto están disponibles en todos esos volúmenes.
- Los umbrales 499,99 €, 500,00 €, 999,99 € y 1.000,00 € aplican respectivamente 0%, 5%, 5% y 10%.
- Los descuentos no se acumulan.
- El margen se calcula sobre venta.
- El IVA mixto y los redondeos cuadran.
- Un aviso de transferencia no confirma automáticamente el pago.
- La verificación manual exige permiso.
- Un presupuesto aceptado se convierte una sola vez en pedido.
- Los cambios del catálogo no alteran históricos.
- Funcionan domicilio, recogida y cotización multidestino.
- Apagar la campaña conserva todos los datos.
- Funcionan las cuatro combinaciones de activación.
- PDF, Excel, correos y pantallas muestran importes coherentes.
- Se bloquean accesos no autorizados.
- La demo no genera pedidos ni comunicaciones reales.

## 22. Demo y aprobación de producción

Entrega primero una demo completa y navegable.

Debe incluir los 60 artículos, todas las fotografías, los cuatro lotes, configurador, ambas vías comerciales, transferencia simulada, panel y controles de campaña.

Muestra al menos:

- Compra de un particular.
- Compra empresarial de 150 lotes idénticos.
- Solicitud de presupuesto y conversión en pedido.
- Verificación manual de transferencia.
- Desactivación y reactivación de campaña.

Antes de publicar, debemos confirmar productos reales, formatos, costes, información fiscal, imágenes, composición de lotes, extras, capacidades de embalaje, datos bancarios, correos, plazos de pago, transporte, recogidas y condiciones.

Entrega un resumen de cambios, resultados de pruebas, guía de marketing, inventario de imágenes, pendientes y procedimiento de reversión.

Espera mi aprobación explícita antes de activar producción.

## 23. Tu siguiente acción

Empieza únicamente por auditar el repositorio y presentar el diagnóstico y plan.

No implementes todavía.

Recuerda la condición principal: **añadir un nuevo apartado a la landing y un nuevo módulo de marketing, conservando íntegramente las funcionalidades existentes.**

Después de presentar el plan, espera mi aprobación.