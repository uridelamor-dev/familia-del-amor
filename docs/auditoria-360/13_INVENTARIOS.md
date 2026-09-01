# 13 · Inventarios

## Qué existe (HECHO)

**6 tablas** con **integridad referencial real** (8 FKs con `ON DELETE CASCADE`/`SET NULL`) — de los
dominios mejor modelados del sistema.

| Tabla | Contenido |
|---|---|
| `inv_proveedores` | Proveedores del inventario (**distintos** de los proveedores de facturas) |
| `inv_productos` | `proveedor_id` FK · `local` · nombre · `unidad` · `stock_minimo` · `stock_objetivo` · `temporada_stock`/`temporada_inicio`/`temporada_fin` · `activo` · `orden` · `observaciones` · **`agora_product_id`** |
| `inv_sesiones` | Una sesión de recuento (quién, cuándo, qué local) |
| `inv_lineas` | Lo contado en cada sesión |
| `inv_pedidos` | Pedido propuesto a un proveedor |
| `inv_pedido_lineas` | Líneas del pedido |

**20 endpoints** bajo `/api/inventario` y `/api/inv/`, con `INV_ROLES = ["direccion","encargado"]`.

## La lógica (`src/modules/inventario/`, 345 líneas, pura y testeada)

`calculo.js`:
```
cantidad a pedir = stock necesario − cantidad contada   (si ≤ 0, no se pide)
```
- `sanitizarCantidad(v)` — nunca negativa, basura → 0
- `enTemporada(hoy, inicio, fin)` — **soporta temporadas que cruzan el fin de año** (11-01 → 02-15).
  Detalle real de hostelería, bien resuelto
- `stockNecesario` — usa el stock de temporada si toca, si no el objetivo
- `construirRevision`, `lineasPropuestaPedido`

`catalogo.js` (200 L) — gestión del catálogo. `unidades.js` (52 L) — unidades de medida.

## El flujo actual

```
Encargado abre una sesión de recuento en su local
  → recorre los productos activos de ese local, ordenados por `orden`
  → introduce cantidades (`invqty`, guardado incremental)
  → el sistema calcula qué falta hasta el stock necesario (con temporada)
  → propone un pedido por proveedor
  → se revisa y se confirma → inv_pedidos + inv_pedido_lineas
```

## Qué FALTA para ser un inventario de restauración usable

Esto es lo importante de esta sección: **hoy es un sistema de recuento y reposición, no un sistema
de inventario**. Sabe *cuánto hay* y *cuánto pedir*. No sabe *cuánto se ha consumido* ni *cuánto
vale*.

| Falta | Por qué importa | ¿Hay piezas? |
|---|---|---|
| 🔴 **Valoración económica** | `inv_productos` **no tiene precio**. No se puede saber el valor del stock ni el coste de lo consumido | Sí: `facturas`/`factura_lineas` tienen precios reales, y `src/modules/facturas/precio-referencia.js` (89 L) ya calcula precios de referencia. **Falta unirlos** |
| 🔴 **Consumo teórico vs. real** | El indicador que de verdad importa en hostelería: mermas, robos, raciones mal servidas | Faltaría escandallo (receta → ingredientes). **No existe** |
| 🔴 **Entradas automáticas desde facturas** | Hoy contar es manual. Cada albarán debería sumar stock | `factura_lineas` existe, `productos_canonicos`+`producto_alias` normalizan nombres. **Falta el puente** |
| 🟠 **Relación con ventas** | `agora_product_id` está en el esquema pero **INFERENCIA**: sin explotar. Con él se podría descontar stock al vender | La columna existe |
| 🟠 **Dos catálogos de proveedores** | `inv_proveedores` e (implícitamente) los de `facturas` son universos distintos. Duplicidad conceptual | `facturas_proveedor_alias` ya resuelve el problema del lado de compras |
| 🟠 **Histórico y tendencia** | No hay serie temporal: cuánto se consumió el mes pasado, si sube | Los datos están en `inv_lineas` por sesión |
| 🟡 **Caducidades y lotes** | Trazabilidad alimentaria | No existe |
| 🟡 **Múltiples ubicaciones** | Cámara / almacén / barra | `local` es la única dimensión |

## Diagnóstico

**El inventario es la mayor oportunidad de producto no explotada del sistema**, porque:
1. Las piezas caras ya están: precios reales de factura, normalización de productos, ventas del TPV
   por producto, y un módulo de cálculo puro y testeado.
2. Lo que falta es **el puente entre compras, inventario y ventas** — y ese puente es exactamente
   lo que convierte un ERP de restauración en algo por lo que se paga.
3. El escandallo (receta) es la única pieza que habría que construir de cero.

Ver `27_ANALISIS_PRODUCTO.md`.
