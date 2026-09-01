# DATA_MODEL · Modelo conceptual

```
                        empresas  (V2, inactivo)
                            │
                    establecimientos  (V2, inactivo)
                            ╎ …hoy el discriminante real es la columna `local TEXT`
                            ╎
   ┌────────────────────────┴───────────────────────────────────┐
   │                    ESTABLECIMIENTO («local»)               │
   │  Blanes · Lloret · Girona · Can Mateu · Tapa Ibérica ·     │
   │  Botiga d'en Mateu · Oficina        (INV_LOCALES, hardcode)│
   └──┬──────────┬──────────┬──────────┬──────────┬─────────────┘
      │          │          │          │          │
   PERSONAS   RESERVAS   COMPRAS   INVENTARIO   VENTAS
      │          │          │          │          │
```

## Personas

```
users  (id, username, password_hash, rol, local, modulos, locales_extra,
        pin_hash, pin_len, pin_intentos, pin_bloqueado_hasta, pass_temporal)
  ⚠️ cuenta de acceso + ficha de trabajador + credencial de kiosko, todo en una
  │
  ├─ rrhh_periodos     ── «trabajó aquí entre estas fechas» (1 abierto máx., índice único)
  ├─ hor_contratos     ── horas, área, sueldo (puede cambiar dentro de un periodo)
  ├─ hor_disponibilidad, hor_worker_areas
  ├─ hr_documentos     ── con marca `sensible` (el encargado no la ve)
  ├─ hr_worker_notes, hr_llamadas_mes
  ├─ fic_eventos       ── ⛔ INMUTABLE (salvo anulado_por)
  │    └─ fic_correcciones (append-only, motivo obligatorio ≥5 car.)
  ├─ fic_jornadas      ── proyección RECALCULABLE (solo min_validado es verdad)
  ├─ fic_bolsa_movimientos ── ⛔ APPEND-ONLY, saldo = SUM(minutos)
  └─ hor_asignaciones  ── turnos del cuadrante

fic_dispositivos (tablets: token_hash, local, revocado_en)
fic_cierres (periodo cerrado por local; reabrir deja rastro)
pulso_invitaciones (token hasheado) → pulso_respuestas  ⚠️ SIN relación entre sí (anonimato)
```

## Clientes (⚠️ GLOBALES, sin `local`)

```
        ╔═══════════════════════════════════════════════╗
        ║  LA CLAVE DE UNIÓN NO ES UNA FK:              ║
        ║  RIGHT(regexp_replace(tel,'[^0-9]','','g'),9) ║
        ╚═══════════════════════════════════════════════╝
                              │
   leads ──────────┬──────────┴──────────┬─────────── reservas
   (web/reserva/wa)│                     │            (SÍ tiene local)
                   │                     │
        marketing_prefs            cliente_metricas
        (opt_in, BAJA, idioma)     (RFM, visitas, gasto con intervalo)
                   │                     │
             cliente_hechos         wa_clientes ── whatsapp_messages
             (dieta, alergias;
              estado propuesto→confirmado)

   sqlContactosUnificados() = leads UNION reservas-sin-lead + LEFT JOINs
   → la usan 9 endpoints, incluido el envío de campañas
```

## Marketing y promociones

```
campanas_wa (segmento_json, mensaje, estado, programada_para, promocion_id →)
  └─ campana_envios (por destinatario: estado, error)   ← deduplicación
plantillas_mensaje · audiencias · traducciones · marketing_faltan

pro_promociones (nombre, locales TEXT, desde/hasta, usos_por_cliente, automatica)
  └─ pro_qr (clase cupon|carnet, token, codigo 8 dígitos, telefono tel9, usos/usos_max)
       └─ pro_canjes ── ⛔ INMUTABLE
          índice único (promocion_id, telefono, uso_n) ← el candado del límite por persona
```

## Compras

```
facturas (local, proveedor, fecha, total, base_imponible, reparto, dup_estado)
  └─ factura_lineas ── FK ON DELETE CASCADE
facturas_proveedor_alias / _cats / _pago  ── normalización y condiciones
facturas_grupos / _email_reglas / _drive_carpetas   ← LOS CANALES DEFINEN EL `local`
facturas_emails_procesados / _drive_procesados      ← idempotencia
facturas_somos_nosotros · facturas_pendientes · facturas_conciliacion_descartes
productos_canonicos ─ producto_alias
```

## Inventario (⭐ el dominio con mejor integridad referencial)

```
inv_proveedores  ⚠️ catálogo DISTINTO del de facturas
  └─ inv_productos (local, unidad, stock_minimo/objetivo, temporada_*, agora_product_id)
       ├─ inv_lineas ── inv_sesiones (recuento)
       └─ inv_pedido_lineas ── inv_pedidos
   ❌ SIN PRECIO · ❌ SIN CONSUMO · ❌ SIN ESCANDALLO
```

## Ventas

```
agora_locales (host, usuario, password ⚠️ cifrada con clave inválida)
  → ventas_diarias (local, dia, ventas, tickets)   ← UPSERT solo de días que faltan
  → agora_cache (caché persistente de «ventas en vivo»)
```

## Otros

```
google_reviews · maintenance_issues · announcements
contents (textos i18n de la web: clave `base_lang`) · config (clave-valor)
hr_jobs → hr_applications · hr_preguntas_mes
wa_links · pending_whatsapp · followup_scheduled · sara_respuestas
leads_backup_* · marketing_prefs_backup_*   🧟 PII duplicada sin política de borrado
```

## Reglas de integridad que NO están en la base

| Regla | Dónde vive |
|---|---|
| Un `worker_id` existe en `users` | En el código (`historicoLaboralDe` recorre 10 tablas al borrar) |
| Un `promocion_id` existe | En el código |
| `local` es uno de los 7 canónicos | `INV_LOCALES` + `esLocalCanonico()` |
| Cliente = últimos 9 dígitos del teléfono | `MATCH_TEL9`, en SQL, sin índice funcional |
| Un solo periodo laboral abierto | ✅ **Índice único parcial** |
| Un solo carné vivo por persona | ✅ **Índice único parcial** |
| Una vez por cliente y promoción | ✅ **Índice único sobre `uso_n`** |
