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

## 4. Backfill inicial (con reconciliación estricta)
- **Reconciliación previa OBLIGATORIA:** antes de poblar nada, un paso verifica que **todos** los valores `local` presentes en las 13 tablas casan con un establecimiento canónico. Si aparece un string que no casa (espacios finales, acentos, guion `-` vs `–`, variantes), el backfill **falla ruidosamente** y se corrige el dato antes de continuar. **Nunca** se asume la coincidencia.
- Poblar `establecimientos` desde `LOCALES` (7 filas) y `empresas` desde `facturas_locales`/confirmación.
- Poblar `user_locations` para los **43 trabajadores** con su `users.local` actual (match exacto por `local_text`, ya reconciliado).
- Cuentas de gestión genéricas (encargado, marketing…) → ver §5 (grandfather acotado).
- **Prioridad ALTA — sustituir texto libre por FK:** introducir `establecimiento_id` (clave foránea) en las tablas con `local` lo antes posible, dejando `local_text` solo como puente durante la transición. Mientras el aislamiento dependa de strings es frágil; el objetivo es que dependa de `establecimiento_id` (coherente con Single Source of Truth, `ARQUITECTURA_OBJETIVO_ERP.md` §8).

## 5. Grandfather acotado + default-deny (revisado)
- **Grandfather = lista blanca puntual, SOLO para las cuentas que YA existen en el momento de la migración.** A esas cuentas concretas (y solo a ellas) se les conserva el acceso actual hasta que Dirección les asigne establecimientos. Se materializa como una asignación explícita en la migración, no como una regla permanente.
- **Usuario NUEVO = default-deny:** nace **sin acceso** a ningún establecimiento hasta que Dirección le asigne uno o varios. "Sin asignación" **NO** significa "ve todo" — eso convertiría cada olvido de configuración en una **fuga de datos**. El default seguro es **denegar**.
- **Dirección** siempre tiene acceso **global** (no depende de asignaciones).
- La activación del filtrado va detrás de **feature flag** para poder desactivarla sin desplegar.

## 6. Dónde se aplica el aislamiento (evitar fugas indirectas)
El filtro por establecimiento debe alcanzar TODO lo que revele datos de un local:
KPIs y contadores · buscadores · reservas · clientes · trabajadores · candidaturas · comunicados · incidencias · facturas · archivos · **exportaciones (CSV)** · grupos de WhatsApp · nombres de locales en selectores/autocompletados · filtros · estadísticas · logs visibles.

Regla dura: **el `local`/`establecimiento_id` que llegue del frontend nunca concede acceso**; el backend intersecta siempre con los locales efectivos del usuario y responde 403 (o filtra) si no procede.

## 7. Modelo de clientes (decisión explícita)
Los `clientes`/`leads`/`wa_clientes` **no tienen** columna de establecimiento y un cliente puede visitar varios locales. **Decisión:** los clientes son **globales del grupo** (fuente única de verdad a nivel de organización), **no se aíslan por establecimiento**.
- La relación cliente ↔ establecimiento es **derivada** (de sus reservas/interacciones) y sirve para **segmentación de marketing**, no como frontera de aislamiento ni de propiedad.
- Implicación: "marketing por local" filtra por esa relación derivada; el acceso al CRM completo es un **permiso** (`clientes.ver`/`clientes.exportar`), no un asunto de local.
- **Candidaturas** (`hr_applications`, sin `local`) se asocian al establecimiento **a través de la vacante** (`hr_jobs.local`, que sí lo tiene).
- **Revisable:** si en el futuro se quiere aislar clientes por local, requerirá un modelo de asociación explícito (hoy inexistente) y se documentará entonces. No queda implícito.

## 8. Casos de prueba (ver `PLAN_PRUEBAS_REGRESION.md`)
Encargado Blanes solo Blanes · Encargado Lloret solo Lloret · Trabajador Blanes no ve Girona · Trabajador no ve facturación · Sin permiso → 403 · Manipular `establecimiento_id` no da acceso · Dirección ve todo · Usuario con dos locales ve solo esos dos.
