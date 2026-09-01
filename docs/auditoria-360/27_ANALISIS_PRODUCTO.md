# 27 · Análisis de producto

## ¿Qué problema resuelve?

**El problema real: un grupo familiar de 6 locales de restauración gestionado con WhatsApp, papeles
y cabeza.** El sistema sustituye, uno a uno, los sitios donde esa información se perdía:

| Antes | Ahora |
|---|---|
| Reservas por teléfono en una libreta | `reservas` + confirmación automática + agenda |
| «¿Quién ha entrado hoy?» | Registro de jornada con validez legal |
| Facturas en una carpeta y un Excel | 4 canales de entrada + lectura automática + IVA + vencimientos |
| «¿Cuánto hemos vendido?» | Ágora sincronizado cada 5 minutos |
| Clientes en la cabeza del encargado | CRM con RFM, hechos, segmentación |
| Cuadrantes en un papel | Horarios con generador, conflictos y PDF |
| «¿Cómo está el equipo?» | Pulso anónimo mensual |

## Funcionalidades centrales vs. añadidas

### Núcleo (lo que sostiene el negocio)
1. **Fichajes/horarios** — obligación legal, el módulo mejor construido
2. **Facturas/compras** — 24 % de los endpoints; es donde está el dinero
3. **Reservas** — la cara visible al cliente
4. **Ventas (Ágora)** — el otro lado de la cuenta de resultados

### Añadido después, con estrategia clara
5. **CRM + campañas** — muy desarrollado, con protecciones serias
6. **Dashboard narrado** — la pieza más diferenciadora
7. **Promociones con QR** (2026-09) — cierra el círculo: campaña → cupón → canje en barra

### Añadido oportunistamente (INFERENCIA)
8. **Sara** — potente pero sin módulo propio ni tests
9. **Reseñas de Google** — bien resuelto, algo aislado
10. **Inventarios** — el más incompleto (ver abajo)
11. **Pulso del equipo** — idea excelente, poco conectada con el resto
12. **Web pública** — necesaria, pero es otro producto dentro del mismo repo

## Qué convertiría esto en un ERP de restauración serio

El sistema tiene **casi todas las piezas caras** y le falta **el pegamento**:

```
        COMPRAS                    INVENTARIO                  VENTAS
   (83 endpoints ✅)            (6 tablas, básico)        (Ágora ✅ por día)
   precios reales                  cuánto hay              cuánto se vendió
   productos_canonicos             stock objetivo          agora_product_id
   precio-referencia.js            temporada
         │                              │                         │
         └──────────────  ❌ FALTA EL PUENTE  ────────────────────┘
                                    │
                         ESCANDALLO (receta) — no existe
                                    │
                    ┌───────────────┴────────────────┐
              COSTE REAL POR PLATO           CONSUMO TEÓRICO vs REAL
              (margen de verdad)              (mermas, robos, raciones)
```

**Esas dos cifras — el coste real de un plato y la merma — son literalmente por lo que se paga un
ERP de restauración.** Y el sistema está a un módulo de distancia:
- Precios reales: ya están en `factura_lineas`
- Normalización de productos: ya está (`productos_canonicos`, `producto_alias`)
- Ventas por producto: Ágora las tiene
- Cálculo puro y testeado: `inventario/calculo.js`
- **Falta**: `receta` (plato → ingredientes × cantidad) y el cruce.

## Piezas reutilizables ya construidas

| Pieza | Reutilizable para |
|---|---|
| `sqlContactosUnificados` (30 filtros) | Cualquier segmentación futura |
| `messaging/queue.js` | Cualquier canal (email cuando se active) |
| `dashboard.service.js` (narrativas) | Alertas, informes semanales, resúmenes por WhatsApp |
| `horarios/solver.js` | Planificación de cualquier recurso |
| Pipeline de facturas | Cualquier documento (albaranes, nóminas, contratos) |
| Kiosko (token+PIN+ticket) | Cualquier terminal sin sesión (comandero, encuesta en mesa) |
| Promociones con QR | Fidelización, entradas a eventos, vales regalo |
| `core/access.js` (apagado) | Multi-empresa / franquicia |

## Oportunidades, por relación valor/esfuerzo

| # | Oportunidad | Valor | Esfuerzo | Piezas que faltan |
|---|---|---|---|---|
| 1 | **Escandallo + coste por plato** | 🔥🔥🔥 | Medio | Tabla `recetas` + cruce. Todo lo demás existe |
| 2 | **Aforo y turnos en reservas** | 🔥🔥🔥 | Medio | Capacidad por local/franja. Es la carencia más visible |
| 3 | **Consumo teórico vs. real** | 🔥🔥🔥 | Medio-alto | Depende de (1) |
| 4 | **Entradas de stock desde facturas** | 🔥🔥 | Medio | Puente `factura_lineas` → `inv_lineas` |
| 5 | **Fidelización sobre el carné QR** | 🔥🔥 | Bajo | Ya existe el carné; falta puntos/niveles |
| 6 | **Canal email** | 🔥🔥 | Bajo | El esquema está listo; falta transporte (vía `fetch`, sin paquete) |
| 7 | **Pantalla «Hoy» del encargado** | 🔥🔥 | **Muy bajo** | Solo agregar datos existentes |
| 8 | **Bandeja de RR.HH.** (contratos que caducan) | 🔥🔥 | **Muy bajo** | `documentosPorCaducar()` ya escrito |
| 9 | **Informe semanal por WhatsApp** | 🔥🔥 | Bajo | Dashboard + `sendMensajeLibre`, ambos existen |
| 10 | **Multi-empresa / franquicia** | 🔥 | Alto | `core/access.js` escrito; el CRM global lo bloquea |

## ¿Es vendible a otros restaurantes?

**INFERENCIA, con evidencia:**

**A favor**: cubre un espectro que ningún producto único cubre (reservas + TPV + compras + RR.HH. +
fichajes + CRM + marketing); el dashboard narrado es genuinamente diferencial; entiende el dominio
de verdad.

**En contra, hoy**:
1. **Multi-tenant incompleto** — `PERMISOS_V2` apagado, CRM global sin `local`
2. **Los nombres de los locales están hardcodeados** (`INV_LOCALES`, `server.js:3732`)
3. **Dependencia de Baileys** — insostenible como producto comercial
4. **Ágora por scraping** — solo sirve para quien use ese TPV
5. **Sin observabilidad** — no se puede operar como servicio para terceros
6. **Sin aforo en reservas** — comparación desfavorable inmediata

**Conclusión**: es un **producto interno excelente** y un **producto comercial a medio camino**. El
camino más corto a lo segundo pasa por multi-tenant real, y ese trabajo ya está escrito y apagado.
