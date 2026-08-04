# Revisión crítica — fase de producto vs arquitectura aprobada

> Autocrítica de los 6 documentos de producto (VISION_PRODUCTO, DESIGN_SYSTEM, UX_PRINCIPIOS, DASHBOARD_V2, IA_ROADMAP, EVENT_ARCHITECTURE) frente a los 16 documentos técnicos ya aprobados. Objetivo: detectar contradicciones, resolverlas y proponer mejoras **antes** de escribir código.

## 1. Contradicciones detectadas y su resolución

### C1 · Eventos vs efectos ya existentes → riesgo de **doble notificación** (el más importante)
- **Tensión:** el flujo actual de reservas ya notifica al grupo de WhatsApp de forma **síncrona**. Si añadimos un suscriptor a `reserva.creada` que también notifique, el cliente/grupo recibiría **mensajes duplicados** → rompería confianza y viola "no romper nada".
- **Resolución (ya escrita en `EVENT_ARCHITECTURE.md` §4):** los eventos se adoptan primero para **consumidores nuevos** (dashboard, analytics, contexto de IA). Migrar un efecto existente a suscriptor se hace **moviéndolo, no duplicándolo**, con prueba de regresión de "una sola notificación". El flujo actual no se toca en esta fase.

### C2 · Dos dashboards (`DASHBOARD_EJECUTIVO.md` v1 vs `DASHBOARD_V2.md`)
- **Tensión:** documentos solapados podrían confundir.
- **Resolución:** V2 **supersede** a v1 como estrella polar; v1 queda como **milestone** (primera versión, solo datos reales). Anotado en ambos.

### C3 · Sistema de diseño "completo ahora" vs "conservar identidad actual esta fase"
- **Tensión:** `VISION_DISENO_Y_FRONTEND.md` dice mantener beige/verde hasta el rediseño; `DESIGN_SYSTEM.md` define un sistema nuevo.
- **Resolución:** el design system es el **objetivo del rediseño**; en fases intermedias solo se **centralizan tokens**. La paleta actual es la **semilla** de la marca (no se sustituye por genérico). Anotado en `DESIGN_SYSTEM.md` (nota de fase).

### C4 · UX "navegación instantánea / ≤3 clics" vs front actual (multipágina con iframes)
- **Tensión:** el panel actual (Dirección embebe otros por iframe, recargas completas) **no puede** cumplir el listón de velocidad/fluidez.
- **Resolución honesta:** el cumplimiento pleno requiere el **panel rediseñado (SPA)**, que es una fase futura. En el front actual se adoptan los principios **parcialmente** (rendimiento, feedback, estados vacíos, skeletons). Es evolución, no ruptura. Anotado en `UX_PRINCIPIOS.md` §9.
- **Implicación de planificación:** los principios UX **empujan el rediseño SPA** antes en el tiempo de lo que sugería la arquitectura. No es contradicción, pero conviene decidir cuándo se aborda esa fase (ver mejora M4).

### C5 · IA que consulta facturación/RRHH vs "financiero denegado por defecto"
- **Tensión:** `IA_ROADMAP` prevé que la IA consulte datos sensibles; la política es denegar lo financiero por defecto.
- **Resolución:** la IA es **un actor con ámbito de permisos explícito**; para tocar datos financieros necesita el permiso financiero explícito, igual que un humano. No hay excepción para la IA. Coherente con `MODELO_MODULOS_Y_PERMISOS.md`.

### C6 · "Todo configurable desde Dirección" vs diseño/UX definidos en código
- **Tensión:** "todo configurable" podría interpretarse como que también el diseño se administra.
- **Resolución/aclaración:** lo **configurable** es el **negocio** (locales, empresas, permisos, módulos, flags, parámetros). El **sistema de diseño y las reglas de UX son producto**, definidos en código (tokens/componentes). No todo es config; esto no es contradicción sino delimitación de alcance.

### C7 · Bus de eventos vs "sin sobreingeniería"
- **Tensión:** una arquitectura de eventos puede degenerar en infra pesada (brokers) impropia de una app SQLite/Replit de un solo proceso.
- **Resolución:** **bus en proceso**, ligero, aditivo y reversible; sin infraestructura externa. Anotado en `EVENT_ARCHITECTURE.md` §1 y §8.

### C8 · Rendimiento "<5s / instantáneo" vs realidad (SQLite en Replit; lección de payloads gigantes)
- **Tensión:** agregados pesados y payloads grandes (histórico: fotos base64 enormes degradaban páginas) chocan con el objetivo de velocidad.
- **Resolución:** KPIs **precalculados** y actualizados por eventos (no recalcular en cada carga), paginación/scroll virtual, y **nunca** servir binarios embebidos en listados. Anotado en `UX_PRINCIPIOS.md` §6 y `DASHBOARD_V2.md` §5.

### C9 · Dos "Saras" (la de WhatsApp actual vs el asistente operativo del ERP)
- **Tensión:** riesgo de confusión conceptual y de que se intente "mejorar" la Sara de producción rompiéndola.
- **Resolución:** la Sara de WhatsApp **se congela**; el asistente del ERP es una **capacidad nueva** sobre la capa de acciones; con el tiempo comparten núcleo. Anotado en `IA_ROADMAP.md` §2. (Ver mejora M5: decidir el nombre.)

## 2. Mejoras propuestas (oportunidades)

- **M1 · Modelar la IA como "principal" de primera clase en permisos.** Además de usuarios humanos, el sistema tendrá **actores** (cuentas de servicio / la IA) con su propio ámbito de permisos y traza de auditoría. Esto hace trivial y seguro ampliar lo que la IA puede hacer. → Añadir al `MODELO_MODULOS_Y_PERMISOS.md` en la fase de implementación.
- **M2 · `event_log` opcional (append-only).** Reservar el diseño de una tabla de eventos para reproceso/depuración/analytics histórico. No imprescindible al inicio; barato de prever. → Ya insinuado en `EVENT_ARCHITECTURE.md` §5.
- **M3 · Presupuesto de rendimiento explícito + caché de KPIs por eventos.** Formalizar el mecanismo: cada evento de dominio actualiza una tabla/estructura de KPIs; el dashboard solo **lee**. Es el puente concreto entre `EVENT_ARCHITECTURE` y el "<5s" de `DASHBOARD_V2`.
- **M4 · Decidir el momento del rediseño SPA.** Como los principios UX dependen de él, conviene fijar en el roadmap **cuándo** se aborda (probablemente tras estabilizar permisos + dashboard v1), para no prometer una experiencia que el front actual no da. Decisión de producto, no técnica.
- **M5 · Nombrar al asistente del ERP.** ¿"Sara" en todo el ERP, o un nombre propio para el asistente operativo y "Sara" solo para WhatsApp? Afecta a la comunicación con el equipo. Decisión de Dirección.
- **M6 · Command palette (⌘K) como acelerador transversal.** Ya recogido en diseño/UX; se destaca como pieza clave para cumplir "≤3 clics" desde el día uno del rediseño.

## 3. Coherencia global (veredicto)
- Los 6 documentos de producto son **compatibles** con la arquitectura aprobada **siempre que** se respeten las resoluciones anteriores (especialmente C1, C4 y C7).
- Ninguna contradicción es estructural: todas se resuelven con **secuenciación** (qué antes que qué) y con **límites** (aditivo, reversible, sin duplicar efectos, sin infra innecesaria).
- **Riesgo principal a vigilar:** *scope creep*. La suma de "sistema operativo del grupo + design system + eventos + IA operativa" es enorme. Recomendación: construir **incrementalmente** (núcleo + módulo piloto primero), y no levantar todo el andamiaje (bus completo, design system completo) antes de entregar valor. La visión guía; la ejecución es por capas pequeñas y verificables.

## 4. Sin cambios funcionales
Esta fase sigue siendo **solo documentación**. No se ha tocado código de producción, ni reservas, ni WhatsApp, ni Sara, ni la web pública. Todo lo aquí descrito es diseño para ejecutar **después del gate**, en pasos reversibles.
