# 25 · Flujos de negocio

Formato: **ACTOR → UI → REQUEST → ENDPOINT → LÓGICA → BD → INTEGRACIÓN → RESPUESTA → UI**

---

## 1 · Crear reserva
```
Cliente → index.html (form) o WhatsApp/Sara
→ POST /api/reservas  (PÚBLICO, sin rate limit ⚠️)
→ estaBloqueado(local,dia)? → 409 con motivo
→ INSERT reservas  ⚠️ SIN comprobar aforo
→ WhatsApp: sendConfirmacion(Pendiente)Cliente + sendNotificacionGrupo(local)  [sin await]
→ upsertLead() → el cliente entra en el CRM
→ {ok:true} → mensaje de éxito en la web
```
🔴 Sin aforo · 🟠 sin rate limit · 🟡 envíos sin esperar ni reintentar

## 2 · Modificar reserva
```
Encargado → panel #reservas → PUT/PATCH
→ requireAuth(["direccion","encargado"]) → localScope
→ modificacion.js: cambiosDe() → validarModificacion() → quedaPendiente()?
→ UPDATE reservas  ⚠️ sin histórico
→ sendModificacionGrupo(groupJid, reserva, cambios)
```
🟡 No queda rastro de qué cambió ni quién

## 3 · Cliente entrando al sistema
```
Tres puertas:
 a) Formulario web  → POST /api/leads → INSERT/UPDATE leads (dedup por tel9 O correo)
                    → setMarketingPref() → emite cupón de bienvenida → WhatsApp
 b) Reserva         → upsertLead()
 c) WhatsApp        → setOnContactoLead() → wa_clientes + leads
→ Unificados en sqlContactosUnificados() por RIGHT(tel,9)
→ cliente_metricas (RFM) recalculado cada 30 min
→ cliente_hechos extraídos por IA cada 6 h, en estado 'propuesto'
```

## 4 · Fichaje de empleado
```
Trabajador → tablet /fichar.html?t=TOKEN
→ GET /api/fichar/:token → equipo + estados + servidorMs + reservas del día
→ toca su nombre → PIN (entra solo al completar)
→ POST /pin  {worker_id, pin}   [12/min]
   bloqueo? → bcrypt → ficEmitirTicket(2 min, atado a la tablet)
→ toca Entrar/Pausa/Salir
→ POST /evento {ticket, tipo, cliente_id, cliente_ms}   [30/min]
   ficLeerTicket → ficMomento(local, ahora) → día de negocio
   evaluarFichaje(eventos, tipo) → ¿duplicado? ¿incidencia? ¿cierra pausa?
→ INSERT fic_eventos  (INMUTABLE, hora del SERVIDOR)
→ ¿periodo cerrado? → se registra igual + aviso + fic_auditoria
→ confirmación a pantalla completa 3,2 s → vuelve al inicio a los 20 s
SIN LÍNEA: IndexedDB → reintento cada 30 s → origen='kiosco_offline' + desfase_ms
```
✅ El flujo más robusto del sistema

## 5 · Alta de empleado
```
RR.HH. → panel #rrhh → «Dar de alta» (4 campos, antes 7 — commit b2b198c)
→ POST /api/rrhh/...  requireAuth(RRHH_ROLES)
→ TRANSACCIÓN (server.js:8199): «si falla el contrato, no queda un usuario sin contrato»
   INSERT users (rol, local, pass_temporal) + rrhh_periodos (fecha_alta) + hor_contratos
→ primerUsuarioLibre() genera el username
→ PIN asignado aparte: PUT /api/fichajes/pin/:workerId
```
✅ Transaccional

## 6 · Baja de empleado
```
RR.HH. → ficha → «Dar de baja»
→ planDeBaja() + firmaPlan() → se ENSEÑA qué va a pasar
→ confirmación → UPDATE rrhh_periodos SET fecha_baja (último día trabajado, inclusive)
→ turnosTrasLaBaja() → avisa de turnos posteriores
→ El usuario NO se borra: bajaEfectiva() lo saca de cuadrantes y kiosko
⚠️ Su JWT sigue siendo válido hasta 8 h (sin revocación)
```
🟠 Sin revocación de sesión

## 7 · Cambio de establecimiento
```
Usuario con varios locales → selector de la barra superior
→ ?local=X en cada petición
→ localScope(req) → localPermitido(user, X)
   · X es suyo → X
   · X NO es suyo → SU LOCAL PRINCIPAL, en silencio
→ centros.js: Blanes+Cooperativa = un centro para personal, dos barras para ventas
```
🟡 El intento de acceder a un local ajeno no se registra en ningún sitio

## 8 · Entrada de factura
```
4 canales: subida manual · Gmail (5 min) · Drive (5 min) · WhatsApp (adjunto en grupo)
→ el CANAL determina el local  ⚠️ (facturas_grupos / _email_reglas / _drive_carpetas)
→ combinarArchivosEnPdf (ghostscript) → pdf-texto.js → CLAUDE (lectura estructurada)
→ json-cortado (repara truncado) → emisor + local-canonico → no-es-producto
→ lineas + validarSuma → fecha-documento → duplicados → categorias → vencimiento → reparto
→ INSERT facturas + factura_lineas
→ espejo a Google Sheets (reintento 10 min) + archivo en Drive
→ ¿duda de duplicado? → dup_estado='duda' → FUERA de todos los totales
```

## 9 · Proveedor
```
Se crea implícitamente al leer una factura (emisor.js)
→ facturas_proveedor_alias unifica las grafías
→ facturas_somos_nosotros evita tratarse a uno mismo como proveedor (commits 6e1a351, 4d09e18)
→ facturas_proveedor_cats (categoría de gasto) + _pago (condiciones)
⚠️ inv_proveedores (inventario) es un catálogo DISTINTO y separado
```

## 10 · Inventario
```
Encargado → #inventarios → abre sesión de recuento (inv_sesiones, su local)
→ productos activos ordenados por `orden` → introduce cantidades (inv_lineas)
→ stockNecesario(producto, hoy)  ← con temporada (soporta cruzar fin de año)
→ cantidad a pedir = necesario − contado  (si ≤0, no se pide)
→ propuesta por proveedor → inv_pedidos + inv_pedido_lineas
```
🔴 Sin precio, sin consumo, sin enlace con facturas ni ventas — ver `13_INVENTARIOS.md`

## 11 · Venta importada de Ágora
```
setInterval 5 min → agoraSyncSiToca
→ loadAgoraConfigs (credenciales descifradas ⚠️ con clave inválida)
→ por local: ping → getVersion → auth (cookie) → getAllPosGroups
→ diasFaltantes(BD, hoy)  ← PURA, hasta AYER, rellena huecos, tope 800 días
→ GetGlobalSalesReportRequest(rango completo, UNA consulta)
→ agregarVentasPorDia → UPSERT ventas_diarias solo de los días que faltaban
→ analítica · dashboard · conciliación
```
✅ Idempotente y tolerante a fallos

## 12 · Dashboard
```
Usuario entra → GET /api/dashboard?local=…
→ dashboard.service.js: KPIs (ventas, reservas, gasto, incidencias)
→ construye ~10 «atenciones»: {sev, tipo, titulo, narrativa, decision, impacto, go}
   escapando cada dato con esc() y devolviendo HTML confiable
→ fusion.js + periodos.js: comparación con el periodo anterior
→ panel: attRow() → innerHTML (sin escapar, por contrato)
```

## 13 · Google Review
```
setInterval 30 min → reviewsSyncSiToca
→ OAuth Business Profile → /v4/accounts/*/reviews
→ mapManageRow → INSERT/UPDATE google_reviews
→ panel #reviews: leer, filtrar, RESPONDER
→ draftRequest() → Claude Haiku genera un borrador de respuesta
→ el usuario revisa y publica
→ GET /api/reviews (PÚBLICO) → portada, solo columnas seguras
```

## 14 · WhatsApp entrante
```
Baileys → sock.ev.on("messages.upsert")
→ ¿es del equipo? esTelefonoInterno → se ignora para marketing
→ ¿BAJA|STOP|…? → marketing_prefs.baja=1 + BORRA cliente_hechos
→ ¿adjunto en grupo de facturas? → setOnGroupAttachment → pipeline de facturas
→ ¿esperando seguimiento? → clasificarRespuesta → CONTENTO/DESCONTENTO
→ si no: SARA → historial → Claude Sonnet 5 con tool-use
   herramientas: reservar / modificar / cancelar / enviar carta
→ INSERT whatsapp_messages
```

## 15 · Login
```
Usuario → /login.html → POST /api/auth/login  [20/min por IP]
→ estadoFreno(user)? → 5 fallos = 30 s / 2 / 5 / 15 min
→ bcrypt.compare
→ jwt.sign({id, username, rol, nombre, local, modulos: modulosEfectivos(), locales, pass_temporal}, 8h)
→ localStorage → TODOS los roles al MISMO panel (public/login.js:1)
```

## 16 · Recuperación de sesión
```
Al abrir el panel: auth.js lee localStorage
→ GET /api/auth/me con el Bearer
→ 401 → login. 403 → NO cierra sesión (hay test: panel-403-no-cierra-sesion)
→ Caducado (8 h) → volver a entrar
⚠️ Sin refresh token. Sin revocación.
```

## 17 · Cambio de permisos
```
Dirección → #usuarios → editar usuario
→ sanearModulos(rol, seleccionados) → intersección con modulosDeRol(rol)
→ UPDATE users SET modulos = ?  ⚠️ SIN registro de auditoría
→ ⚠️ EL CAMBIO NO SURTE EFECTO HASTA QUE EL USUARIO VUELVE A ENTRAR:
   `modulos` viaja DENTRO del JWT, que dura 8 h
```
🟠 **Consecuencia práctica**: quitarle un permiso a alguien puede tardar hasta 8 horas en aplicarse.
