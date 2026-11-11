# Sistema de diseño

> Reglas, no pantallas. Un sistema de diseño coherente para que todo el panel se vea y se comporte como **un solo producto**. Adopta la identidad actual del grupo (beige, verde oscuro, blanco, negro) como marca, elevada a un estándar tipo Linear/Stripe/Notion/Apple.
> **Nota de fase:** esto es el objetivo del rediseño. Durante las fases intermedias solo se **centralizan tokens**; la identidad actual se conserva hasta la fase de rediseño (ver `VISION_DISENO_Y_FRONTEND.md`).

## 1. Design tokens (fuente única de verdad)

Todo valor visual vive como **token** (variable CSS), nunca hardcodeado en componentes. Cambiar la "piel" (incluido dark mode) = cambiar tokens.

```
--color-*        colores
--font-*         tipografía
--space-*        espaciado (escala 4/8)
--radius-*       redondeos
--shadow-*       elevación
--z-*            capas
--dur-*          duraciones de animación
```

## 2. Color

### Marca (semilla de la identidad actual)
- **Verde oscuro** — color primario/acento y de acción principal.
- **Beige** — fondo cálido de superficies/lienzo.
- **Blanco** — superficies y tarjetas.
- **Negro** — texto principal (casi-negro, no #000 puro).

### Roles semánticos (no usar el color "crudo", usar el rol)
```
--color-bg            lienzo de la app
--color-surface       tarjetas/paneles
--color-surface-2     superficies elevadas/hover
--color-border        separadores sutiles
--color-text          texto principal
--color-text-muted    texto secundario
--color-primary       acción principal (verde oscuro)
--color-primary-contrast  texto sobre primary
--color-focus         anillo de foco (accesible)
--color-success / --color-warning / --color-danger / --color-info
```
- **Estados semánticos** con moderación: verde éxito, ámbar aviso, rojo peligro, azul info. Nunca decorativos.
- **Contraste AA mínimo** (4.5:1 texto normal, 3:1 texto grande). Validar cada par texto/fondo.
- **Dark mode**: cada token tiene su valor claro y oscuro. No se "invierte"; se diseña. Superficies oscuras cálidas (no gris azulado frío) para respetar la calidez de la marca.

## 3. Tipografía

- **Familia:** una sans-serif moderna, legible y neutra (system-ui / Inter como referencia). Una sola familia para UI; monoespaciada solo para datos técnicos/códigos.
- **Escala tipográfica** (modular, jerárquica):
  ```
  --font-display  28–32px / 700   títulos de página
  --font-h1       22–24px / 600
  --font-h2       18–20px / 600
  --font-h3       16px  / 600
  --font-body     14–15px / 400   base
  --font-sm       13px  / 400     secundario
  --font-xs       12px  / 500     etiquetas/badges
  ```
- **Interlineado:** 1.4–1.6 en texto; 1.2 en títulos.
- **Peso:** 400 base, 500 énfasis, 600 títulos, 700 solo display. Evitar 300 (poco legible).
- **Números tabulares** en tablas y KPIs (`font-variant-numeric: tabular-nums`).
- **Longitud de línea** máx. ~72 caracteres en texto largo.

## 4. Espaciado y grid

- **Escala base de 4px** (múltiplos): `4, 8, 12, 16, 24, 32, 48, 64`. Nada "a ojo".
- **Grid de contenido:** 12 columnas, gutter 24px, ancho máximo de lectura contenido (~1200–1280px) centrado; el dashboard puede usar todo el ancho.
- **Densidad:** cómoda por defecto; modo compacto opcional para tablas grandes (solo cambia paddings vía token).
- **Ritmo vertical** consistente: separación entre secciones múltiplo de 8.

## 5. Elevación, radios y bordes

- **Radios:** `--radius-sm 6px` (inputs/botones), `--radius-md 10px` (cards), `--radius-lg 16px` (modales), `--radius-full` (avatares/badges).
- **Sombras sutiles** (nunca duras): `--shadow-sm` para cards, `--shadow-md` para menús/popover, `--shadow-lg` para modales. En dark mode, la elevación se comunica con superficie más clara, no con sombra fuerte.
- **Bordes** de 1px `--color-border` para separar sin ruido; preferir espacio en blanco a líneas.

## 6. Componentes (reglas)

### Botones
- Jerarquía clara: **primario** (uno por vista/acción principal), **secundario** (contorno/sutil), **terciario/ghost** (texto), **peligro** (rojo, con confirmación). 
- Un solo botón primario visible por contexto.
- Estados obligatorios: default, hover, active, focus (anillo visible), disabled, **loading** (spinner inline + texto, sin cambiar tamaño).
- Tamaños: sm/md/lg vía token de padding; altura mínima táctil 40px en móvil.

### Inputs y formularios
- Label siempre visible (no solo placeholder). Placeholder = ejemplo, no instrucción.
- Estados: default, focus, error (mensaje debajo, específico y accionable), disabled, con icono opcional.
- **Validación en tiempo real** y no destructiva; el error explica cómo arreglarlo.
- Formularios **cortos y por pasos**; agrupar; autofoco en el primer campo; enviar con Enter.

### Tablas
- Cabeceras fijas, tipografía tabular, alineación (texto izq., números der.).
- Filas con hover; acción principal por fila accesible; selección múltiple opcional.
- **Sin sobrecarga:** columnas esenciales visibles; el resto en detalle/expandible.
- Paginación o scroll virtual para grandes volúmenes; **skeleton** al cargar; **estado vacío** cuidado.
- Ordenar/filtrar donde aporte; filtros persistentes y claros.

### Cards
- Unidad básica de composición del dashboard. Padding generoso, título + contenido + acción opcional.
- Una idea por card. Nada de cards que hacen cinco cosas.

### Modales / Diálogos
- Solo para foco puntual (confirmar, crear rápido). No para flujos largos (esos, en pantalla/panel lateral).
- Cierre por X, Esc y clic fuera (salvo formularios con cambios sin guardar → confirmar).
- Trap de foco, título claro, acción primaria a la derecha.
- **Confirmación destructiva** siempre para borrar/cancelar.

### Navegación
- Barra lateral con módulos (filtrada por permisos + flags), colapsable. Ítem activo evidente.
- **Selector de establecimiento** siempre accesible (respeta permisos).
- **Command palette** (⌘K) como acelerador: ir a cualquier módulo o ejecutar acciones frecuentes tecleando.
- Breadcrumbs solo cuando haya profundidad real.

### Badges / etiquetas / estados
- Colores semánticos, texto corto, forma pill. Un estado = un color consistente en todo el sistema (p.ej. "pendiente" siempre ámbar).

## 7. Iconografía

- **Un solo set** de iconos (línea, grosor uniforme, estilo Lucide/Feather como referencia). Nunca mezclar estilos.
- Icono siempre acompañado de texto en navegación y acciones (salvo acciones universales evidentes).
- Tamaños alineados a la escala (16/20/24). Color heredado del texto, no decorativo.

## 8. Movimiento y animación

- **Sutil y con propósito.** Comunicar cambio de estado, jerarquía y continuidad; nunca decorar.
- Duraciones: `--dur-fast 120ms` (hover/estados), `--dur-base 200ms` (entradas/paneles), `--dur-slow 320ms` (modales). Easing естественo (ease-out para entradas).
- **Respetar `prefers-reduced-motion`**: desactivar animaciones no esenciales.
- Nada de animaciones que retrasen la interacción; la velocidad manda.

## 9. Estados de carga y vacíos

- **Skeleton loaders** en vez de spinners a pantalla completa: la estructura aparece de inmediato y se rellena.
- **Carga optimista** donde sea seguro (la UI responde ya; se revierte si falla).
- **Estados vacíos con intención:** ilustración/icono sobrio + una frase clara + **acción primaria** ("Aún no hay incidencias — Crear la primera"). Nunca una tabla vacía sin explicación.
- **Estados de error** claros y con reintento; nunca un `error interno` crudo.

## 10. Responsive

- **Mobile-first en los flujos operativos** (sala, mantenimiento, encargados usan móvil).
- Breakpoints por tokens: `sm 640 / md 768 / lg 1024 / xl 1280`.
- Patrones: la sidebar colapsa a barra inferior/menú; las tablas pasan a tarjetas apiladas en móvil; los modales a hojas (bottom sheets).
- Áreas táctiles ≥40px; nada que dependa de hover en móvil.

## 11. Jerarquía visual (reglas)

- **Una acción primaria** por pantalla, visualmente dominante.
- Tamaño, peso y color guían la mirada: dato clave grande y con contraste; secundario atenuado.
- Espacio en blanco como herramienta de jerarquía, no relleno.
- Agrupar por proximidad; separar por espacio, no por líneas.

## 12. Accesibilidad (transversal)

- Contraste AA, foco visible, navegación por teclado completa, roles/labels ARIA en componentes, targets táctiles amplios, `reduced-motion`. La accesibilidad es parte de "producto excelente", no un extra.

## 13. Gobernanza del sistema

- Los tokens y componentes viven en un único lugar (design tokens + librería de componentes). Ningún módulo define estilos propios.
- Cambiar un token propaga a todo el sistema (incluido dark mode) sin tocar componentes.
- Esto es lo que hace que el **rediseño futuro sea barato** y que todo sea **consistente por construcción**.
