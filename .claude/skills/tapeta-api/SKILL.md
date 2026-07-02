---
name: tapeta-api
description: "Probar la API de La Tapeta (localhost:3000) con login automático y pretty-print. Usar cuando haya que verificar endpoints protegidos (reservas, leads, usuarios, whatsapp) sin reescribir el token JWT a mano."
---

# Probar la API de La Tapeta

El server corre en `http://localhost:3000` (arráncalo con `/restart-tapeta` si hace falta).
Los endpoints protegidos requieren `Authorization: Bearer <token>` obtenido de `/api/auth/login`.

## Credenciales de prueba
- Usuarios: `direccion` (admin), `encargado`. Contraseña: `tapeta2024`.

## Helper
Usa el script incluido en vez de reescribir el login+token cada vez:

```bash
bash ~/Desktop/latapeta/.claude/skills/tapeta-api/api.sh <endpoint> [usuario] [método] [json-body]
```

Ejemplos:
```bash
api.sh reservas                 # GET /api/reservas como direccion
api.sh leads encargado          # GET /api/leads como encargado
api.sh reservas direccion POST '{"local":"La Tapeta - Blanes","personas":4,"dia":"2026-07-10","hora":"13:30","telefono":"600111222","nombre_reserva":"García"}'
```

## Endpoints habituales
- `POST /api/auth/login` — devuelve `{ token }`.
- `GET  /api/reservas` — reservas (por local/fecha).
- `GET  /api/leads` — leads del formulario del 10% descuento.
- `GET  /api/health` — health check (sin auth).
- `POST /api/users` — crear usuario (rol requerido).

## Notas
- La contraseña seed `tapeta2024` y el `JWT_SECRET` con fallback `tapeta-secret-dev` son **deuda de seguridad** conocida — no usarlos en producción.
- No hardcodear tokens ni credenciales en el allowlist de permisos (se retiraron por seguridad).
