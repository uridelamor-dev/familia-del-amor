# Control de costes al estilo Haddock — 23/09/2026

Trabajo local en rama de desarrollo; no se han modificado facturas reales, importado histórico ni desplegado. No se afirma equivalencia completa con Haddock.

## Referencia funcional

La documentación oficial describe captura de facturas/albaranes/tickets, productos y cambios de precio, conciliación, TPV, escandallos dinámicos, pedidos, inventario y gestión multilocal. En este contexto «contabilidad como Haddock» se aborda como control operativo de compras y rentabilidad; no se añade un libro contable fiscal ni se cambian liquidaciones.

Fuentes consultadas:
- https://www.haddock.app/funcionalidades
- https://haddock.app/escandallos
- https://support.haddock.app/es/article/crea-tu-inventario-teorico-10xwxjy/

## Mapa del sistema propio

| Área | Evidencia en el sistema | Trabajo pendiente |
|---|---|---|
| Entrada de documentos | Foto/PDF, correo/Drive, lectura de líneas | Comprobar cobertura con muestras reales al aceptar |
| Control documental | Duplicados, fechas dudosas, correcciones, vencimientos y pagos | Recorrido de cierre mensual con contabilidad |
| Conciliación | Factura-albarán, control para no contar dos veces | Aceptación con los proveedores habituales |
| Productos | Diccionario, proveedores, historial y avisos de subidas | Revisar formatos reales y conversiones de presentación |
| Ventas | Integración Ágora y analítica | Enlace plato TPV ↔ receta |
| Escandallos | Añadidos en esta rama | Preparaciones anidadas, comparativas históricas de margen, impresión de fichas |
| Inventario y pedidos | Módulo existente, niveles y pedidos | No se ha implementado descuento automático de ingredientes según ventas TPV |
| Multilocal | Ámbito por centro y permisos | Copiar recetas entre centros mediante acción explícita |

## Escandallos añadidos

Productos → Escandallos. Recetas por centro con nombre, raciones por elaboración, PVP por ración e IVA introducido por el usuario. Ingredientes desde compras reales; se seleccionan producto, proveedor y unidad de compra. La conversión a unidad de uso se confirma explícitamente. Ejemplo: caja de 6 litros = 6000 ml.

El coste usa el importe neto de la línea dividido por la cantidad, del último documento válido del mismo proveedor, clave y unidad. Se excluyen líneas dudosas, duplicados dudosos, compras futuras, abonos, productos descartados y albaranes conciliados con factura que ya tiene detalle. Una presentación diferente no reemplaza automáticamente a la elegida.

Cantidad de receta = producto aprovechable. Compra necesaria = cantidad / (1 − merma/100). El coste de elaboración se divide por las raciones. El margen se compara con el PVP sin IVA y **solo descuenta ingredientes**, no personal, energía u otros gastos. Una receta con precios pendientes no enseña margen ni coste completo. El desglose muestra fecha y documento de origen; no se inventa un precio para ingredientes desconocidos.

Los precios se recalculan al consultar, sin editar recetas guardadas. Cada modificación, archivo o recuperación guarda una versión. El control de versión impide que dos personas sobrescriban cambios sin saberlo. Archivar se puede deshacer. No se altera ninguna factura ni se crea ningún movimiento contable.

Limitaciones explícitas: la clave de producto es la de la línea original; no se cambia de proveedor automáticamente. Si una caja cambia contenido manteniendo nombre/unidad, se debe corregir la conversión. El histórico conserva recetas, no una certificación del margen calculado en cada fecha. No hay preparaciones anidadas ni consumo de stock por ventas todavía.

## Pruebas

Cálculo de raciones, merma, conversión, IVA y precio incompleto. PostgreSQL aislado: actualización por nuevas compras, aislamiento entre centros, centro compartido, formatos, exclusiones, versiones, archivo y conflictos de edición. Prueba en navegador con datos ficticios a 1440×800 y 390×844: alta real de receta y lectura del coste desde PostgreSQL.
