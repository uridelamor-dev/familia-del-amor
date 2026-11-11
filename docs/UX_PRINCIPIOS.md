# Principios de UX

> Cómo se comporta **todo** el panel. Son reglas obligatorias: cada módulo futuro debe respetarlas. Si un flujo no las cumple, el flujo está mal, no el principio.

## 1. Los 10 principios

1. **≤3 clics para cualquier acción frecuente.** Desde cualquier punto, lo que se hace a diario está a tres clics o menos. Lo muy frecuente, a uno (o por command palette ⌘K).
2. **Navegación instantánea.** Cambiar de módulo/pantalla es inmediato (sin recarga completa, sin esperas). La percepción de velocidad es prioritaria.
3. **Acciones previsibles.** El mismo control hace lo mismo en todas partes. Nada de sorpresas ni efectos ocultos. Antes de una acción irreversible, se avisa.
4. **Feedback inmediato.** Toda acción confirma al instante qué pasó (optimista + confirmación). Nunca un clic "al vacío".
5. **Nunca una pantalla vacía sin salida.** Todo estado vacío explica qué es y ofrece la acción para llenarlo.
6. **Formularios mínimos.** Se pide lo imprescindible, por pasos, con valores por defecto inteligentes. Cero formularios-cuestionario.
7. **Mínima carga cognitiva.** Una decisión por pantalla. Lo secundario, escondido tras "más"/"avanzado". El usuario no debe "recordar" nada entre pantallas.
8. **Contexto primero.** El sistema trae la información relevante al momento (la reserva del cliente, el local del usuario, lo pendiente) en vez de obligar a buscarla.
9. **Consistencia absoluta.** Botones, tablas, estados, colores y patrones idénticos en todos los módulos (ver `DESIGN_SYSTEM.md`).
10. **Reversibilidad y seguridad.** Deshacer siempre que se pueda; confirmar lo irreversible; nada se pierde por un clic accidental.

## 2. Reglas de navegación

- **Sidebar por módulos** filtrada por permisos + feature flags: el usuario solo ve lo que puede usar.
- **Command palette (⌘K):** ir a cualquier módulo o ejecutar acciones frecuentes tecleando. Acelerador clave para power users (Dirección).
- **Selector de establecimiento** global, siempre visible, respetando permisos. Cambiarlo re-contextualiza todo el panel al instante.
- **Estado preservado:** filtros, pestaña y contexto se recuerdan al volver a un módulo.
- **URL con estado** (deep-linking): cada vista es enlazable/compartible (habilita el rediseño SPA y el soporte).

## 3. Reglas de interacción

- **Optimista por defecto:** la UI refleja el resultado ya; si el backend falla, revierte y avisa con claridad y reintento.
- **Loading = skeleton**, no spinner de pantalla completa. La estructura aparece de inmediato.
- **Errores accionables:** qué pasó + cómo solucionarlo + reintentar. Nunca el mensaje técnico crudo.
- **Confirmaciones solo cuando importan:** borrar, cancelar reserva, cambios de permisos. El resto, fluido; con opción de **deshacer** (toast "Hecho · Deshacer").
- **Atajos de teclado** para acciones frecuentes; nunca imprescindibles (siempre hay ruta con ratón/táctil).

## 4. Reglas de contenido y microcopy

- **Claro y humano**, en el idioma del usuario. Nada de jerga técnica ("error 500", "payload inválido").
- **Verbos de acción** en botones ("Crear reserva", no "Aceptar").
- **Vacíos que invitan** ("Aún no hay candidatos — cuando lleguen, aparecerán aquí").
- **Números legibles** (formato local, tabulares, unidades claras).

## 5. Reglas de datos y densidad

- Mostrar **lo relevante primero**; el detalle, bajo demanda (expandir/panel lateral).
- **Filtros y búsqueda** donde el volumen lo pida; resultados al instante.
- **Nunca obligar a exportar** para entender algo básico: el panel debe responder por sí mismo.
- Tablas grandes: paginación/scroll virtual + skeleton; nunca cargar 10.000 filas de golpe.

## 6. Rendimiento como UX (presupuesto)

- **Objetivo percibido:** interacción <100ms; navegación entre vistas <300ms; dashboard útil <5s (idealmente <2s con datos cacheados).
- **Cómo se consigue:** carga optimista, skeletons, datos agregados **precalculados** (no calcular KPIs pesados en cada carga), paginación, y evitar traer payloads gigantes (lección aprendida: fotos base64 enormes degradaban páginas — nunca servir binarios embebidos en listados).
- Lento se considera un **bug**, no una molestia.

## 7. Accesibilidad e inclusión

- Teclado completo, foco visible, contraste AA, `reduced-motion`, targets táctiles amplios, textos alternativos. Un panel excelente es usable por todos.

## 8. Cómo se aplica esto a cada módulo (checklist obligatorio)

Antes de dar por bueno cualquier módulo o pantalla, debe cumplir:
- [ ] Acciones frecuentes en ≤3 clics (o ⌘K).
- [ ] Estado vacío diseñado con acción.
- [ ] Skeleton en carga; sin spinners de pantalla completa.
- [ ] Feedback inmediato + deshacer donde aplique.
- [ ] Formulario mínimo, por pasos, con defaults.
- [ ] Componentes y estados del `DESIGN_SYSTEM.md` (sin estilos propios).
- [ ] Respeta permisos, establecimiento y flags (no muestra lo que el usuario no puede usar).
- [ ] Errores accionables; nada de mensajes técnicos.
- [ ] Responsive y accesible.
- [ ] Rendimiento dentro del presupuesto.

## 9. Relación con el resto de documentos

- Estos principios **guían** el `DESIGN_SYSTEM.md` (las reglas visuales) y el `DASHBOARD_V2.md` (la pantalla estrella).
- La velocidad e instantaneidad plena requieren el **panel rediseñado (SPA)**; en el front actual se adoptan de forma parcial (perf, feedback, estados vacíos) — ver `VISION_DISENO_Y_FRONTEND.md`. Es una evolución, no una ruptura.
