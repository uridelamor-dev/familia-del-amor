# Modelo de acceso por establecimiento

> El panel debe ser **realmente multiestablecimiento**: que un usuario solo vea los datos de los locales que tiene asignados, comprobado **siempre en backend**. Sin asumir que "como son del mismo grupo, todos ven todo".

## 1. Jerarquía conceptual

```
Organización            Grupo Familia del Amor
  └─ Empresa jurídica    (p.ej. Del Amor Uriel SLU, y otras sociedades del grupo)
       └─ Establecimiento (cada restaurante / unidad operativa)
            └─ Usuario ↔ Establecimiento  (asignación con rol-por-local, activo, fechas)
```

- **Organización:** una (el grupo).
- **Empresa jurídica:** para contabilidad/facturación (cada establecimiento pertenece a una).
- **Establecimiento:** unidad operativa; es la clave del aislamiento.
- **Usuario:** cuenta de panel. **Perfil de trabajador:** información laboral de una persona (RRHH) — entidad distinta del usuario.

## 2. Establecimientos canónicos (semilla desde `LOCALES`, `whatsapp.js`)

| # | Establecimiento (string actual) | Empresa jurídica |
|---|---|---|
| 1 | La Tapeta - Blanes | *a confirmar* |
| 2 | Cooperativa - Blanes | *a confirmar* |
| 3 | La Tapeta - Lloret | *a confirmar* |
| 4 | La Tapeta - Girona | *a confirmar* |
| 5 | Can Mateu - Tordera | *a confirmar* |
| 6 | La Tapa Ibérica - Tordera | *a confirmar* |
| 7 | Botiga d'en Mateu - Tordera | *a confirmar* |

> La relación establecimiento→empresa se tomará de `facturas_locales` (empresa/CIF) en **producción** (la copia local está vacía) y se confirmará con Dirección. El usuario mencionó **Del Amor Uriel SLU** como una de las sociedades.
> Nota: *La Tapeta - Blanes* y *Cooperativa - Blanes* comparten grupo de WhatsApp de reservas a propósito (no confundir con compartir empresa/aislamiento).

## 3. Modelo de datos (objetivo, migraciones aditivas)

```
empresas(id, nombre, cif, activo)
establecimientos(id, nombre, empresa_id, alias, activo,
                 -- puente con el modelo actual:
                 local_text UNIQUE)     -- el string actual ("La Tapeta - Blanes")
user_locations(id, usuario_id, establecimiento_id, rol_local NULL,
               activo, desde, hasta)    -- un usuario, uno o varios locales
```

- `establecimientos.local_text` mapea 1:1 con los strings que hoy viven en 13 tablas → permite filtrar sin renombrar nada todavía.
- `user_locations` permite: **un usuario con un local**, **con varios**, **rol distinto por local** (opcional), **activación/desactivación** y **fechas de inicio/fin**.
- Se evita depender del único `users.local`. Ese campo se conserva (no se borra) durante la transición.

## 4. Backfill inicial
- Poblar `establecimientos` desde `LOCALES` (7 filas) y `empresas` desde `facturas_locales`/confirmación.
- Poblar `user_locations` para los **43 trabajadores** con su `users.local` actual (coincidencia por `local_text`).
- Cuentas de gestión genéricas (encargado, marketing…) → **sin asignación** por ahora (ver grandfather).

## 5. Estrategia *grandfather* (cero rotura — decisión del usuario)
- Usuario **sin** filas en `user_locations` → se comporta como hoy (**ve todo**), hasta que Dirección le asigne locales.
- En cuanto tenga ≥1 asignación, el backend **restringe** a esos locales.
- **Dirección** siempre tiene acceso **global** (no depende de asignaciones).
- La activación del filtrado va detrás de **feature flag** para poder desactivarla sin desplegar.

## 6. Dónde se aplica el aislamiento (evitar fugas indirectas)
El filtro por establecimiento debe alcanzar TODO lo que revele datos de un local:
KPIs y contadores · buscadores · reservas · clientes · trabajadores · candidaturas · comunicados · incidencias · facturas · archivos · **exportaciones (CSV)** · grupos de WhatsApp · nombres de locales en selectores/autocompletados · filtros · estadísticas · logs visibles.

Regla dura: **el `local`/`establecimiento_id` que llegue del frontend nunca concede acceso**; el backend intersecta siempre con los locales efectivos del usuario y responde 403 (o filtra) si no procede.

## 7. Casos de prueba (ver `PLAN_PRUEBAS_REGRESION.md`)
Encargado Blanes solo Blanes · Encargado Lloret solo Lloret · Trabajador Blanes no ve Girona · Trabajador no ve facturación · Sin permiso → 403 · Manipular `establecimiento_id` no da acceso · Dirección ve todo · Usuario con dos locales ve solo esos dos.
