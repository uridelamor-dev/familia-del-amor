# Contabilidad y paridad funcional con Haddock — 30/09/2026

## Dictamen y alcance

**No validado para operar al 100% sin supervisión.** Hay una base importante, pero hay defectos verificables de recepción, asignación y unidades, y faltan partes del circuito de existencias. Pasar pruebas existentes no equivale a validar documentos reales ni conexiones externas.

Base examinada: repositorio `clientes-publicacion-20260929`, commit `4d816ec`, última versión enviada durante esta tarea previa a GitHub. No se ha confirmado que Replit esté ejecutando exactamente este commit. La copia `correccion-captacion-sara` contiene mejoras no trasladadas íntegramente a esta versión, incluida recepción persistente. No dar por entregada una mejora solo porque existe en otra copia.

Trabajo realizado: lectura de rutas y módulos, comparación con documentación oficial vigente de Haddock, 843 pruebas automatizadas de 38 archivos de facturas/compras/inventario/escandallos (843 pasan, sin saltos), y reproducciones adicionales de tres defectos. Las pruebas de alta emplean servicios simulados. No se ha realizado una certificación contra PostgreSQL real, buzón, Drive, WhatsApp o TPV de producción. No se han modificado facturas ni enviado mensajes. Para ejecutar las pruebas se enlazaron temporalmente dependencias ya instaladas; el enlace se retiró después.

## Fallos prioritarios comprobados

| ID | Prioridad | Evidencia | Impacto y solución propuesta |
|---|---|---|---|
| C01 | Bloquea arranque autónomo | `server.js:2433`, `markGmailRead` envía `removeLabelIds:[UNREAD]`. | Marca los correos como leídos, incumpliendo la necesidad de la contable. No modificar su estado de lectura; recordar procesamiento internamente por mensaje y adjunto. |
| C02 | Bloquea arranque autónomo | `server.js:2454`, `pollDriveFacturas`, registra procesado incluso en error. Gmail registra el mensaje al terminar aunque falle un adjunto (`server.js:2587`). | Un fallo temporal puede dejar una factura sin importar y sin reintento. Guardar original antes de procesar, estados por archivo, reintento seguro y bandeja de errores visible. |
| C03 | Alta | Gmail lista 60 mensajes; Drive 100 archivos. No recorre `nextPageToken` en estas funciones. | Un lote grande puede quedar incompleto. Paginar hasta terminar y mostrar recibidos/procesados/pendientes/errores. |
| C04 | Bloquea costes fiables | `src/modules/facturas/lineas.js:51`. Reproducción: tomate, cantidad 2, kg, precio 3, importe 60 devuelve cantidad 20, unidad ud, factor 10, `dudosa:false`. | Una incoherencia aritmética se interpreta como pack sin evidencia. No inferir el formato solo porque sale un entero; conservar origen y pedir revisión. |
| C05 | Bloquea asignación autónoma | `src/modules/facturas/asignacion.js:95`. Con CIF compartido de Blanes/Girona y dos compras históricas en Can Mateu, sugiere Can Mateu con confianza alta. | Puede sugerir otro titular contra el CIF receptor. Limitar candidatos al titular y exigir dirección/local para separar establecimientos con mismo CIF. La reproducción corresponde al motor de sugerencias; no demuestra una factura real mal asignada. |
| C06 | Alta | `src/modules/inventario/calculo.js:62`. Producto sin cantidad contada y objetivo 20 devuelve contado 0 y sugerido 20. La ruta de propuesta usa este cálculo. | Confunde no contado con agotado. Exigir conteo explícito o excluir pendientes; mostrar porcentaje contado antes de generar pedido. |
| C07 | Alta | `facturas.js:189`, `referenciasDeProveedor`, agrupa por clave y proveedor sin unidad/formato. | El histórico puede comparar precio por caja con precio por unidad. Comparar coste normalizado compatible y conservar presentación, cantidad y factor verificado. |
| C08 | Alta; riesgo por inspección | `server.js:19386`, pedido creado en múltiples operaciones sin transacción; no hay unicidad por sesión para pedido activo. | Una interrupción puede dejar cabecera sin todas las líneas; dos peticiones simultáneas pueden duplicar pedido. Transacción, restricción e idempotencia. No se ha provocado el fallo en una base real. |

Estos problemas no quedan refutados por las 843 pruebas aprobadas: faltan esos escenarios en su cobertura. Hay correcciones parciales en otra copia; deben revisarse, integrarse y probarse antes de publicar.

## Comparación funcional

Referencias oficiales, consultadas 30/09/2026:
- [Funciones de Haddock](https://haddock.app/funcionalidades): digitalización, precios, escandallos, pedidos, conciliación, familias y varios restaurantes.
- [Pedidos](https://haddock.app/pedidos).
- [Inventario teórico](https://support.haddock.app/es/article/crea-tu-inventario-teorico-10xwxjy/): parte de un conteo, añade compras y resta ventas mediante recetas y desperdicios; compara con inventario real.

| Área | Estado encontrado en nuestro código | Qué completaría para equivalencia operativa |
|---|---|---|
| Entrada documental | Web, Gmail, Drive y WhatsApp alimentan procesamiento de facturas. Hay originales en Drive y detección de duplicados. | Una bandeja de recepción única, persistente, con estado por archivo y recuperación de fallos. Probar mismo documento por los cuatro canales. |
| Facturas y albaranes | Lectura de cabecera/detalle, revisión, fechas, asignación, duplicados, conciliación y exportaciones. | Revisión visual original/datos en paralelo; diferencias por línea; factura multipágina y varios documentos separados; abonos y conciliaciones parciales validados con casos reales. |
| Productos | Diccionario, alias, familias e histórico de compra. | Identidad única del producto con presentaciones por proveedor y equivalencias verificadas. Evitar que cambiar de nombre o formato cree costes incomparables. |
| Proveedores | Datos de facturas, condiciones de pago y catálogo de proveedores de inventario. | Ficha conectada: identidad fiscal, contactos, formatos, pedidos, recepción, facturas, incidencias, vencimientos y precios comparables. |
| Costes | Neto/descuento y seguimiento de referencias históricas. | Último coste para recetas, coste medio ponderado para valoración si se elige, y mediana para alertas claramente diferenciados. Rechazar comparaciones entre unidades incompatibles. |
| Escandallos | Existen; factores de compra/uso, merma, raciones, IVA/PVP, último precio compatible e historial de versiones. | Verificar recetas reales y vinculación a artículos/modificadores del TPV. Una receta calculada no acredita descuento de stock por ventas. |
| Inventarios | Conteos, mínimos/objetivos, temporada y propuesta de compra. | Libro de movimientos, entradas, consumos, mermas, transferencias y ajustes; valoración y diferencias real/teórico. No he encontrado implementado el circuito completo equivalente al documentado por Haddock. |
| Pedidos | Borrador, aprobado y cancelado, líneas editables. | Enviado, recepción parcial/completa, discrepancias, devolución y enlace pedido→albarán→factura. Aprobado no debe significar recibido. |
| Pagos | Rutas de registro de pagos y condiciones/vencimientos. | Verificar pagos parciales, anticipos, abonos, saldo pendiente y exportación para la contable. No confundir conciliación albarán/factura con conciliación bancaria. |
| Multilocal/empresas | Configuración fiscal, locales contables y reparto. | Restricciones por titular en todos los caminos, trazabilidad de decisiones, permisos y pruebas con la estructura real. |

No se ha entrado en una cuenta privada de Haddock: la comparación es funcional, basada en su documentación oficial, no una certificación de igualdad pantalla a pantalla.

## Cómo organizaría la herramienta

Un único apartado **Contabilidad**, con vistas conectadas:

1. **Bandeja de entrada**: por revisar, sin local, posibles duplicados, errores. Contador rojo solo cuando requiere acción.
2. **Compras**: pedidos y recepción; diferencias entre pedido, entregado y facturado.
3. **Documentos**: facturas, albaranes, tickets y abonos; pendientes de pago y exportación.
4. **Productos y costes**: ficha única; formatos, conversiones, evolución y proveedores.
5. **Proveedores**: condiciones, documentos, pedidos, deuda registrada e incidencias.
6. **Inventario**: conteos rápidos en móvil, stock teórico, valoración, mermas y diferencias.
7. **Escandallos**: ingredientes, rendimiento, coste por ración, margen y vínculo con Ágora.

No repetir el mismo dato en módulos desconectados. Desde cualquier coste se debe poder abrir la línea de compra y el documento original que lo justifica. Distinguir dato pendiente de cero real. Mostrar la última actualización y qué datos faltan antes de dar un margen por bueno.

### Ejemplo de unidades que debe superar

Compra: 2 cajas × 6 botellas × 1 L = 12 L, total neto 24 €. Coste: 12 €/caja, 2 €/botella y 2 €/L. Una receta que consume 200 ml cuesta 0,40 € antes de otras materias. Si otra compra llega en caja de 12 botellas, no debe interpretarse como una subida del doble. Una merma debe aumentar el coste útil con su fórmula y quedar explicada. No convertir piezas en kg sin peso conocido.

### Reglas de esta empresa que deben quedar fijadas

- Del Amor Uriel SLU, B70799135: Blanes, Lloret y Girona. El CIF solo identifica sociedad; no el local.
- Cooperativa se contabiliza junto con Blanes.
- Can Mateu y Botiga de'n Mateu: Pilar Ayllon Torres, establecimientos separados.
- La Tapa Ibérica: Mateo Del Amor Salinas.
- Oficina: Uriel del Amor Ayllon.
- Gastos compartidos separados y repartidos exclusivamente entre centros del mismo titular.
- Carpeta y grupo de WhatsApp aportan contexto de local; si contradicen receptor fiscal, revisión.
- Buzón común: conservar estado de lectura; no tomar el proveedor como prueba suficiente de local.

## Condiciones para autorizar la puesta en marcha

### Primero: integridad de recepción y lectura

Corregir C01–C07 e integrar lo pendiente de la copia de trabajo. Asegurar que cada original acaba en registrado, pendiente de revisión o error recuperable. Ninguna desaparición silenciosa.

### Segundo: ensayo con documentos representativos

Preparar al menos 30 documentos reales representativos, en entorno de prueba: cada titular/local, varias páginas, albarán y factura posterior, abono, IVA mixto, descuentos de línea/globales, portes, envases, kg/g, L/ml, cajas y unidades, fechas antiguas/futuras, duplicado por canales distintos y documento ilegible. La contable compara original y resultado. No extrapolar una tasa de acierto de unos pocos ejemplos.

Pruebas de aceptación obligatorias:
- Lote de más de 60 correos y más de 100 archivos, sin omisiones.
- Correo con varios adjuntos: uno falla y solo ese se reintenta, sin marcar leído ni duplicar los otros.
- Caída de OCR/Drive y reinicio: original conservado y recuperación visible.
- CIF compartido sin dirección: queda pendiente, no decide el local por intuición.
- Totales, impuestos, descuentos y cantidades contrastados; errores excluidos de costes fiables.
- Albarán y factura no duplican compra, gasto ni entrada de stock.
- Dos personas guardando a la vez no duplican ni sobrescriben en silencio.
- Encargado solo accede a sus centros; contable y dirección acceden según permiso.

### Tercero: circuito completo de operación

Pedido → recepción parcial → albarán → factura → coste → escandallo → venta Ágora → inventario teórico → conteo → diferencia → pago/exportación. Si un eslabón no existe, se identifica como no disponible, no como validado.

Antes de publicar: confirmar versión exacta de Replit, migraciones, copias recuperables y ensayo de reversión. Tras publicar: comprobar con un documento controlado y revisar el resultado con la contable. Pilotar un local y una jornada antes de generalizar.

## Prioridad y alcance de la semana próxima

Prioridad absoluta: recepción sin pérdidas, correos sin leer, titular/local correctos, detalle y costes fiables, revisión cómoda y exportación contrastada. Son requisitos de arranque.

Paridad completa con Haddock: además, pedidos con recepción, catálogo unificado y stock teórico conectado a compras/recetas/Ágora. Es un alcance mayor; no prometerlo para una fecha sin estimar implementación, datos maestros y pruebas. Puede arrancar un circuito documental supervisado antes que el inventario automático, pero debe decirse expresamente qué está listo y qué no.


## Implementación local — 30 de septiembre de 2026

Este apartado actualiza el dictamen inicial. Las referencias de líneas anteriores corresponden a la versión auditada, no a la modificada.

Aplicado en la copia de publicación, todavía sin desplegar:

- C01: Gmail no modifica etiquetas ni marca correos como leídos.
- C02–C03: recepción persistente del original antes de OCR/Drive, recuperación con reintentos limitados, rechazo visible de archivos excesivos y paginación de ambos conectores. Bandeja plegada «Documentos recibidos», error rojo, descarga y reintento, con alcance por local.
- C04: el cociente aritmético no convierte kilos en unidades. Una conversión automática de envase exige contenido explícito coherente. Las correcciones propagadas exigen formato compatible y permiso de local. Precios unitarios con seis decimales; importes monetarios con dos.
- C05: las sugerencias respetan el CIF receptor; el histórico de proveedor no permite autoasignar. Pendiente completar y ensayar la protección de todos los caminos de entrada con local prefijado si el receptor contradice ese local.
- C06: vacío significa «Sin contar» y cero significa agotado contado. El panel espera el guardado antes de revisar. No genera pedido con recuento incompleto.
- C07: referencia por producto y unidad comparable; lecturas dudosas o anteriores a la versión actual excluidas. Al agrupar locales se conserva el importe, pero no se suman cantidades ni se comparan precios de unidades incompatibles o desconocidas. No equivale todavía a un catálogo de conversiones verificadas de todos los proveedores.
- C08: cabecera, líneas y finalización en una transacción con bloqueo de sesión e idempotencia. El guardado de recuento toma el mismo bloqueo y rechaza modificaciones posteriores a finalizar. Pendiente ensayo de concurrencia real entre varios procesos; no se ha añadido un índice parcial de unicidad.
- Panel: Inventarios dentro de Contabilidad, lectura de productos y costes plegada con aviso, y cálculo de cuota de IVA sin sobrescribir el total del documento.

### Verificación de esta entrega

- 2.704 pruebas de módulos y correo visible aprobadas.
- 74 comprobaciones de la vista de Compras aprobadas.
- 13 pruebas SQL aprobadas con PostgreSQL embebido (PGlite) aislado: originales conservados, reintentos, rollback de pedido tras fallo intermedio, repetición idempotente, recuento incompleto bloqueado y guardado posterior al cierre rechazado. No son una validación de concurrencia multiproceso ni una conexión a la base de producción.
- Vista previa con datos ficticios: recepción plegada, error rojo y reintento visible; inventario sin contar bloquea pedido y cero explícito permite revisión; navegación de Inventarios bajo Contabilidad.
- Sintaxis de servidor y panel y comprobación de diferencias sin errores.
- La batería general no está verde: el navegador automatizado no pudo arrancar y aparecieron fallos en pruebas de fidelización, tokens CSS, alertas y menú. Se corrige la aserción de Compras afectada por conservar unidades desconocidas. Los demás fallos requieren contraste separado; no se declara el sistema completamente validado.

### Trabajo restante

Completar entradas con contradicción fiscal, recepción parcial de pedidos, catálogo y equivalencias verificadas, movimientos de stock y stock teórico conectado a recetas/ventas. Ensayar los conectores con cuentas reales y los 30 documentos representativos indicados arriba; validar exportaciones con la contable. Revisar la versión y migraciones de Replit antes de publicar. Los cambios de esta entrega no se han enviado ni publicado y no se ha modificado información de producción.
