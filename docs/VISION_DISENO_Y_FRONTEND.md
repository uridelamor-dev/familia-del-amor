# Visión de diseño y estrategia de frontend

> Esta fase **no** hace rediseño visual. Pero la arquitectura debe garantizar que el **rediseño futuro** (panel moderno, muy limpio y profesional) no quede limitado por decisiones técnicas de ahora.

## 1. Norte de diseño (referencias)
**Linear · Stripe Dashboard · Notion · Apple · Vercel.** Atributos objetivo: limpio, denso pero legible, jerarquía visual clara, componentes consistentes, estados vacíos cuidados, microinteracciones sobrias, accesible, claro en claro y oscuro.

La identidad actual (beige, verde oscuro, blanco, negro) se conserva **durante esta fase**; el rediseño completo se abordará en su propia fase, y el sistema de diseño podrá evolucionar entonces.

## 2. Principio habilitador: **API-first**
La clave para no limitar el diseño futuro es **separar datos de presentación**:
- El backend expone **contratos JSON consistentes** (`{ok,data}` / `{ok:false,error,code}`), con permisos y locales resueltos en servidor.
- El frontend (el actual vanilla, y cualquier front futuro) es un **cliente** de esa API. No hay lógica de negocio ni HTML generado en el backend para el panel.
- Consecuencia: un rediseño puede sustituir el front sin tocar el backend.

## 3. Estrategia de transición (documentada, no ejecutada)
- **Ahora (esta fase):** solo docs + tests. No se toca el front.
- **Fases intermedias:** mejoras de **componentes compartidos** del panel actual sin rediseño (navegación, responsive, selector de establecimiento, estados vacíos, mensajes de error, cargas, "permiso denegado", tablas, formularios, consistencia de botones). Mantiene identidad actual.
- **Fase de rediseño (futura):** panel moderno. Opciones a decidir **en su momento** (no ahora):
  - (a) SPA nueva (p.ej. componentes modernos) montada **dentro del mismo proyecto/dominio**, consumiendo la misma API, conviviendo con las páginas actuales durante la migración pantalla a pantalla.
  - (b) Restyle progresivo del front actual con un sistema de diseño.
  - En ambos casos: **misma app, mismo backend, misma API**. Sin crear otra aplicación ni otro dominio.

## 4. Requisitos que imponemos ahora para habilitar el rediseño
- Endpoints consistentes y versionables; nada de acoplar respuestas a una vista concreta.
- Sin estado de sesión en el servidor que impida un cliente distinto (hoy ya es JWT en header → compatible con SPA).
- Componentes del panel actual que se toquen: dejarlos **desacoplados de los datos** (render a partir de la API) para facilitar su futura sustitución.
- Design tokens (colores/espaciados/tipografía) centralizados cuando se trabajen componentes compartidos, para que el cambio de "piel" sea barato.

## 5. Límite explícito
- **No** se rediseña ni se toca la **web pública** (marketing/reservas/SEO) en ninguna de estas fases del panel interno.
- El rediseño del panel es una **fase aparte** con su propio plan y aprobación.
