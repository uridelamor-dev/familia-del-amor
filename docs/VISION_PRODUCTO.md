# Visión de producto

> Este documento no habla de arquitectura. Habla de **qué queremos que sea** el sistema y **cómo se debe sentir**. Es la estrella polar del producto: cuando una decisión técnica entre en conflicto con esta visión, gana la visión (y se busca la forma técnica de servirla).

## 1. Qué estamos construyendo

No estamos construyendo "un ERP". Estamos construyendo el **sistema operativo interno de Grupo Familia del Amor**: el lugar único desde el que, con los años, se gestione prácticamente toda la empresa (reservas, WhatsApp, Sara, RRHH, facturación, contabilidad, marketing, clientes, mantenimiento, compras, inventario, IA, dashboard ejecutivo, comunicación interna, documentación e integraciones).

La ambición no es "tener más funciones que un ERP tradicional", sino que **usarlo sea un placer**: rápido, claro, previsible y silencioso. Que la gente **quiera** entrar, no que tenga que entrar.

## 2. Qué sentirá un usuario al entrar

- **Calma.** Una pantalla que respira, sin saturación. Lo importante, primero; lo demás, a un clic.
- **Velocidad.** Todo responde al instante. Nada de esperas, spinners eternos ni recargas completas.
- **Control.** Entiende de un vistazo "cómo va todo" y "qué necesita su atención".
- **Confianza.** Las acciones son previsibles; nada sorprende; siempre hay feedback y siempre se puede deshacer o revisar.
- **Pertenencia.** Se siente una herramienta **suya**, hecha para su trabajo, no un software genérico impuesto.

La vara de medir: que se sienta más cerca de **Apple, Linear, Notion o Stripe** que de un ERP clásico (SAP, tablas infinitas, menús de 40 opciones, formularios de 30 campos).

## 3. Filosofía del producto

1. **Menos, pero mejor.** Cada pantalla hace pocas cosas, excelentemente. Preferimos quitar antes que añadir.
2. **El sistema trabaja para la persona.** El software se adapta al flujo de trabajo real, no al revés.
3. **Claridad sobre densidad.** Información jerarquizada; el dato relevante destaca; el ruido desaparece.
4. **Rapidez como funcionalidad.** La velocidad no es un extra: es parte del producto. Lento = roto.
5. **Cero complejidad innecesaria.** Nada de opciones que nadie usa, ajustes crípticos ni pantallas "por si acaso".
6. **Contexto, no navegación.** El sistema lleva la información a la persona; no la obliga a ir a buscarla.
7. **Consistencia absoluta.** Un botón, una tabla, un estado vacío se comportan igual en todos los módulos.
8. **Inteligente por defecto.** La IA (Sara) y los datos anticipan, resumen y proponen; el usuario decide.
9. **Configurable, no programable.** Dirección adapta el sistema (locales, permisos, módulos, parámetros) sin tocar código.
10. **Evolutivo y reversible.** Se crece por capas, sin romper nada de lo que hoy funciona; todo cambio se puede deshacer.

## 4. Qué lo diferencia de un ERP tradicional

| ERP tradicional | Este sistema |
|---|---|
| Pantallas saturadas de campos y tablas | Pantallas limpias, jerarquizadas, foco en lo relevante |
| Navegación profunda y lenta | Navegación instantánea; lo frecuente, a ≤3 clics |
| "Rellena este formulario de 30 campos" | Formularios mínimos, por pasos, con valores inteligentes |
| El usuario busca los datos | El sistema trae el contexto y avisa de lo que importa |
| Configuración por consultoría/código | Configuración desde Dirección, en el propio panel |
| La IA es un añadido | La IA (Sara) es un **compañero operativo** integrado |
| Reporting estático | Dashboard ejecutivo que responde preguntas en segundos |
| Módulos acoplados y frágiles | Módulos independientes; activables/desactivables |

## 5. Principios de simplicidad (innegociables)

- **Máxima productividad con mínima fricción:** cada acción frecuente, en pocos clics y sin pensar.
- **Cero pantallas saturadas:** si una pantalla necesita scroll infinito o "buscar dónde está X", está mal diseñada.
- **Cero complejidad innecesaria:** toda opción debe justificar su existencia; ante la duda, se elimina o se esconde tras "avanzado".
- **Rapidez percibida:** carga optimista, skeletons, respuestas inmediatas; el sistema nunca "se queda pensando" en silencio.
- **Una forma de hacer cada cosa:** no tres caminos para lo mismo. Consistencia > flexibilidad superflua.

## 6. Cómo debe evolucionar (próximos años)

- **Año 1 — Cimientos y confianza.** Panel interno sólido: seguridad, aislamiento por local, permisos, dashboard ejecutivo v1, Sara operativa dentro del panel. Se gana la confianza del equipo por fiabilidad y velocidad.
- **Año 2 — El centro de operaciones.** RRHH, facturación/contabilidad, mantenimiento, compras e inventario maduros. Sara pasa de responder a **actuar** (con permisos y auditoría). Dashboard con recomendaciones de IA reales.
- **Año 3+ — El sistema operativo del grupo.** Integraciones (Ágora/Skello/Haddock y otras) por establecimiento; automatizaciones; documentación y comunicación interna; analítica avanzada. Añadir un local o una empresa nueva es cuestión de minutos, no de meses.

En todo momento: **no romper nada** de lo que ya funciona (reservas, WhatsApp, Sara, web pública), crecer de forma **evolutiva y reversible**, y mantener la sensación de producto excelente.

## 7. Anti-visión (lo que NO queremos ser)

- Un panel con 50 entradas de menú y 10 pestañas por pantalla.
- Formularios interminables y tablas que obligan a exportar a Excel para entender algo.
- Un sistema que hay que "aprender" con un manual de 80 páginas.
- Colores, botones y comportamientos distintos en cada módulo.
- Un producto que, dentro de un año, haya que rehacer.

## 8. Criterio de éxito

- Un encargado nuevo entiende su panel **sin formación**.
- Dirección abre el sistema y en **5 segundos** sabe cómo va la empresa y qué requiere su atención.
- Las acciones diarias se hacen en **segundos**, no minutos.
- El equipo lo prefiere a WhatsApp/Excel/papel porque es **más rápido y más claro**.
