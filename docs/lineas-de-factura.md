# Leer las líneas de las facturas

*Análisis, no plan de obra. Escrito con el código delante, agosto de 2026.*

## La pregunta

«¿Podrías leer todas las líneas de las facturas, desglosar cada concepto y saber qué
cantidades compramos de cada producto, para tener una línea entre lo que compramos, lo que
vendemos y el stock?»

Respuesta corta: **sí, y la parte de leerlas es la fácil.** Lo difícil viene después.

## Lo que ya hay

No partimos de cero, y eso cambia el cálculo:

- `facturas.js` **ya lee facturas con Claude** (`extraerDatosDocumento`, Haiku). Le pasamos
  el PDF o la foto y devuelve JSON. Hoy solo saca la cabecera: proveedor, fecha, número,
  base, IVA, total.
- La ingesta ya funciona por tres canales: WhatsApp al grupo, carpeta de Drive y subida a
  mano. Las facturas ya llegan solas.
- `inv_productos` ya existe, con `nombre`, `unidad`, `proveedor_id` y —esto es importante—
  un campo `agora_product_id` que nadie rellena todavía pero que estaba pensado justo para
  esto.
- Ágora ya nos da las ventas por día en `ventas_diarias`.

O sea: **las tres esquinas del triángulo ya están**. Lo que falta son los puentes.

## Por qué leer las líneas es la parte fácil

Añadir las líneas es cambiar el prompt y crear una tabla:

```
factura_lineas(factura_id, orden, descripcion, cantidad, unidad,
               precio_unitario, importe, producto_id NULL)
```

Y un control que **no puede faltar**: la suma de las líneas tiene que cuadrar con la base
imponible. Si no cuadra, la factura queda marcada para que la mire una persona, no se
guarda como si tal cosa.

Ese control es la diferencia entre un dato y un adorno. Un total se puede verificar solo
(base + IVA = total). **Una cantidad de línea no se puede verificar contra nada**: si el
modelo lee «12» donde pone «1,2», nadie se entera nunca, y ese error se propaga a todo lo
que venga detrás. Con la suma cuadrando, un error en una línea casi siempre descuadra el
total y salta.

Regla que va con esto: **si una línea no se lee bien, hay que decirlo, no adivinarla.** Una
factura con 18 de 20 líneas leídas y 2 marcadas es útil. Una con 20 líneas de las que 2 son
inventadas es peor que no tener nada, porque no se sabe cuáles.

## Por qué lo demás no es fácil

### 1. El mismo producto se llama de tres maneras

| Dónde | Cómo aparece |
|---|---|
| Factura | `COCA COLA ZERO 33CL LATA CAJA 24U` |
| Inventario | `Coca-Cola Zero` |
| Ágora | `Refresco lata` |

Nadie va a normalizar eso a mano cada semana. Y sin normalizarlo, «cuánto compramos de
Coca-Cola» no se puede contestar.

La salida razonable es un **diccionario de productos con alias**, que se construye solo y
confirma una persona: la primera vez que aparece `COCA COLA ZERO 33CL LATA CAJA 24U`, el
sistema propone el producto de inventario más parecido y alguien dice sí o no. A partir de
ahí ese texto exacto ya está resuelto para siempre.

Es trabajo humano, pero **es finito y decreciente**: los proveedores repiten descripciones.
Con las facturas de dos meses probablemente queden cubiertos el 90 % de los casos.

### 2. Las unidades no coinciden con nada

La factura dice **1 caja**. El inventario cuenta **botellas**. Ágora vende **copas**.

Sin un factor de conversión por producto (`1 caja = 24 latas`, `1 barril = 100 cañas`),
todo lo que se calcule encima está mal, y encima está mal en silencio. Esto no lo puede
adivinar el sistema: lo tiene que decir alguien una vez por producto. Otra vez, trabajo
finito.

### 3. El eslabón que no existe: los escandallos

Para cerrar el triángulo del todo —comprado, vendido, en stock— haría falta saber cuánto
producto consume cada plato. Eso son los **escandallos**, y no los tenemos.

Y esto sí es trabajo de verdad: un escandallo por plato, hecho por alguien que sepa de
cocina. **No lo haría para toda la carta.** Los 25 o 30 platos que más se venden explican
la mayor parte del consumo; el resto no compensa.

## Lo que se puede tener sin llegar al final

Esto es lo importante, porque el orden decide si el proyecto sirve o se queda a medias.

### A. Solo leyendo las líneas — sin diccionario, sin unidades, sin escandallos

Ya se puede contestar: **«¿a cómo nos está cobrando cada proveedor cada cosa, y cómo ha
cambiado?»**

Agrupando por proveedor + descripción exacta, sin normalizar nada, sale el histórico de
precio unitario. Y con eso salta solo lo que hoy no ve nadie: que el aceite subió un 8 % en
marzo y nadie se dio cuenta, o que el mismo producto se está pagando a dos precios distintos
en dos locales.

**Esta fase sola probablemente se paga a sí misma**, y no depende de ninguna de las otras.

### B. Con el diccionario de productos

- Cuánto compramos de cada cosa al mes, por local y comparable entre locales.
- Qué proveedor sale mejor para el mismo producto.
- Alertas de compra rara: «este mes se han comprado 40 kg de gambas donde siempre son 15».

### C. Con las unidades y el inventario

Sin escandallos ya se puede calcular el **consumo real**:

```
consumo = stock inicial + compras − stock final
```

Comparado con las ventas del periodo, da el coste de materia sobre ventas por familia. Que
es, en la práctica, el número que de verdad se mira.

### D. Con escandallos, solo en los platos fuertes

Consumo teórico contra consumo real = **merma**. Aquí es donde se ve si se está sirviendo de
más, si se rompe, o si desaparece.

## Lo que costaría y lo que no

**Lo barato**: leer las líneas. El modelo ya está integrado, es Haiku y una factura de 20
líneas sigue costando céntimos. Guardar y validar es una tabla y una comprobación.

**Lo caro no es código**: es el diccionario (una persona confirmando emparejamientos las
primeras semanas), las unidades (una vez por producto) y los escandallos (solo si se llega
a la fase D).

**El riesgo real** no es técnico, es de confianza. Si esto da un número de merma que la
gente no se cree —porque venía de una unidad mal puesta o de una línea mal leída— deja de
mirarse para siempre. Por eso la validación de la suma y el «si no se lee, se dice» no son
detalles: son lo que hace que el resto tenga sentido.

## Lo que yo haría

La fase A, y parar ahí a mirar. Da valor sola, no depende de nada y es la que enseña qué
tal se leen las facturas de verdad. Con dos meses de líneas reales delante se decide mucho
mejor si merece la pena seguir a B, y con qué proveedores empezar el diccionario.

Lo que **no** haría es montar el triángulo entero de golpe. Sería mucho trabajo antes del
primer dato útil, y con tres puentes a medio hacer no se puede confiar en ninguna cifra.
