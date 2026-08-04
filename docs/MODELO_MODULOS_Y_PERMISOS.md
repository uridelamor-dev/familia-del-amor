# Modelo de módulos y permisos

> La pieza central del ERP: **la autorización se basa en permisos por módulo, no en el rol**. El rol solo sirve como **plantilla** de permisos por defecto al crear un usuario. Después, Dirección puede editar cualquier permiso de cualquier usuario sin tocar código.

## 1. Cadena de decisión

```
Usuario
  → Locales asignados          (¿sobre qué establecimientos?)
  → Permisos efectivos         (¿qué puede hacer en cada módulo?)
  → Rol                        (solo plantilla inicial de permisos)
```

**Prohibido** `if (rol === "encargado")`. La pregunta siempre es: *¿este usuario tiene el permiso `modulo.accion` sobre este establecimiento?*

## 2. Módulos (dominios)

Cada módulo es independiente y activable por feature flag. Catálogo inicial (ampliable sin cambiar arquitectura):

`reservas`, `clientes`, `whatsapp`, `sara`, `rrhh`, `facturacion`, `contabilidad`, `marketing`, `mantenimiento`, `comunicados`, `kpis`, `web`, `usuarios`, `roles`, `permisos`, `integraciones`, `configuracion`, `ia`.

## 3. Acciones por módulo

Set estándar de acciones (cada módulo usa las que le apliquen):

| Acción | Significado |
|---|---|
| `ver` | Leer/listar |
| `crear` | Alta |
| `editar` | Modificar |
| `eliminar` | Borrar/cancelar |
| `exportar` | Descargar (CSV/…) |
| `administrar` | Configurar el módulo (ajustes, conexiones) |

Permiso = **`modulo.accion`**. Ejemplos: `reservas.ver`, `reservas.crear`, `reservas.editar`, `reservas.eliminar`, `clientes.exportar`, `whatsapp.responder`, `facturacion.administrar`.

### Permisos sensibles (financieros)
Los datos financieros (ventas, facturación, ticket medio, costes, márgenes, beneficio, facturas, pagos, IVA, gastos, costes laborales, escandallos, compras) requieren un permiso **explícito**: `facturacion.verFinancieros` / `contabilidad.verFinancieros` / `kpis.verFinancieros`. **El acceso a un establecimiento NO concede acceso financiero.** Por defecto: Dirección permitido; Contabilidad según permiso; resto denegado.

Acciones especiales de módulo (además de las estándar) cuando haga falta, p.ej.:
`whatsapp.gestionarGrupos`, `whatsapp.gestionarConexion`, `facturacion.marcarPagado`, `rrhh.verDatosPrivados`, `marketing.gestionarCampanas`, `marketing.gestionarWeb`, `usuarios.gestionar`, `roles.gestionar`, `permisos.gestionar`, `integraciones.gestionar`.

## 4. Permisos efectivos (cálculo)

```
permisos_efectivos(usuario) =
   plantilla_de_rol(usuario.rol)          # defaults al crear
   ⊕ concesiones_personalizadas(usuario)  # overrides que suman
   ⊖ restricciones_explícitas(usuario)    # overrides que restan (ganan)
   ∩ acotado por locales asignados        # cada permiso se evalúa por establecimiento
```

- **La plantilla de rol es solo la semilla**: se copia a permisos del usuario en el alta. A partir de ahí, el usuario tiene sus propios permisos editables; cambiar la plantilla no altera retroactivamente a los usuarios ya creados (salvo acción explícita "restaurar valores por defecto").
- Las **restricciones explícitas** siempre ganan sobre las concesiones.
- El permiso se comprueba **junto con el local**: `requirePermission('reservas.editar', { establecimiento })`.

## 5. Modelo de datos (objetivo, migraciones aditivas)

```
role_templates(rol PK, permisos_json)                  # plantilla por rol
permisos(id, usuario_id, permiso, efecto ENUM(allow,deny), establecimiento_id NULL)
                                                       # NULL = aplica a todos los locales del usuario
```
(Se puede empezar simple con `permisos_json` por usuario y evolucionar a filas si se requiere granularidad por local.)

## 6. Contrato de los middlewares (core)

- `requirePermission('modulo.accion')` — 403 si el usuario no tiene el permiso.
- `requireLocationAccess()` — resuelve los locales efectivos y **filtra**; ignora cualquier `local`/`establecimiento_id` del cliente no autorizado.
- `requireFinancialAccess()` — exige el permiso financiero explícito.
- Toda denegación y todo acceso sensible → **auditoría** (`AUDITORIA_PROFESIONAL.md`).
- **Grandfather:** un usuario sin permisos/locales asignados conserva el comportamiento actual (por compatibilidad) hasta que Dirección lo configure; Dirección siempre tiene acceso global.

## 7. Plantillas de rol iniciales (propuesta a validar)

| Rol | Permisos por defecto (resumen) |
|---|---|
| **direccion** | Todo, incluido `*.administrar` y financieros. Acceso global. |
| **encargado** | `reservas.*`, `whatsapp.ver/responder/gestionarGrupos`, `mantenimiento.*`, `comunicados.ver/crear`, `clientes.ver`, `kpis.ver` (no financieros). Acotado a sus locales. |
| **marketing** | `marketing.*`, `web.*`, `clientes.ver/editar/exportar`, `campanas.*`, `sara.administrar`, reseñas. Global o por local. |
| **rrhh** | `rrhh.*` (incl. vacantes/candidaturas), `comunicados.*`. Global o por local. |
| **contabilidad** | `facturacion.ver/marcarPagado/exportar`, `contabilidad.*`, `kpis.ver` + financieros **según permiso explícito**. Por local/empresa. |
| **trabajador** | Configurable por Dirección: `comunicados.ver`, `mantenimiento.crear`, "ver mis incidencias", y futuros (horarios/vacaciones) solo como permisos preparados. |

## 8. Preparación para trabajadores (solo permisos, sin funciones aún)
Dirección podrá decidir por trabajador: ver comunicados, crear incidencias, ver sus propias incidencias, y (cuando existan las integraciones) ver horarios/horas, solicitar vacaciones o cambios de turno, consultar documentos e información propia. **No se implementan esas funciones ahora**; solo se reservan los permisos para no rehacer el sistema.
