# Reinicio del repaso al publicar · 13/10/2026

## Causa comprobada

Logs del despliegue Replit 3d826215, 16:29:05 UTC: migración automática con seis operaciones destructivas. Eliminó reviews_repaso y reviews_repaso_items (CASCADE) y las columnas google_reply, google_replied_at, ai_context y ai_example de google_reviews. Estas estructuras no existían en desarrollo. El arranque recreó el repaso a las 16:31:13 UTC; producción registra autorización a las 16:31:40 UTC. No era un contador visual.

## Corrección

- Esquema del repaso también en desarrollo, sin crear campaña ni activar trabajadores.
- Añadidas en desarrollo las dos tablas, índice y cuatro columnas que faltaban, mediante CREATE/ADD IF NOT EXISTS. Confirmado 11 y 9 columnas respectivamente.
- Prueba de reinicio conserva las decisiones ya evaluadas y analiza únicamente pendientes.
- Modal distingue evaluadas, cola y publicadas; el envío empieza después del análisis.

## Precaución para publicar

Antes de republicar: actualizar código y esquema de desarrollo. Revisar el plan de migración de Replit: no debe eliminar tablas ni columnas de reseñas. No restaurar toda la base para recuperar este análisis: podría perder operaciones posteriores de otros módulos. No se han recuperado las decisiones borradas; el repaso actualmente autorizado sigue trabajando. Las respuestas reales de Google deben recuperarse mediante sincronización; los contextos/ejemplos internos borrados no se reconstruyen desde Google.

La prueba final consiste en guardar cutoff y autorización actuales, publicar sin migraciones destructivas y comprobar que ambos siguen iguales y disminuye el número pendiente.
