# 10 · UX / UI

> Evaluación desde el uso, no desde el código. Marcada como **INFERENCIA** salvo donde hay evidencia
> directa en el repositorio.

## Por perfil

### 👑 PROPIETARIO / DIRECCIÓN
**Qué ve al entrar**: Dashboard con KPIs + «atenciones» narradas.

✅ **Lo mejor del producto.** `dashboard.service.js` no dice «3 incidencias abiertas»: dice
*««La cámara no enfría» se repite en Blanes — se ha repetido 3 veces. No es mala suerte: es un
equipo que no está resolviendo el problema de raíz. No la repararía otra vez: a partir de la 3ª
intervención, sustituir sale más a cuenta»*. Con severidad, impacto en dinero y botón «Abrir» que
lleva a la vista correcta.

⚠️ **Problemas**:
- Tiene acceso a **24 módulos**. El menú es largo y sin jerarquía de uso: «Ágora (TPV)»
  (configuración que se toca una vez al año) pesa lo mismo que «Reservas» (a diario).
- **No hay vista de grupo consolidada** para ventas: la analítica es por local.

### 🧑‍💼 ENCARGADO
**Qué ve**: Dashboard, Reservas, Comunicados, Equipo, Horarios, Fichajes, Subir factura,
Inventarios, Incidencias, Reseñas, WhatsApp.

✅ Su local queda fijado automáticamente. No puede equivocarse de establecimiento.

⚠️ **Problemas**:
- **«Subir factura» es un módulo suelto solo para él** — decisión documentada y correcta, pero
  significa que su tarea más frecuente está en el menú principal compitiendo con todo lo demás.
- **INFERENCIA**: para el turno diario necesita Reservas + Horarios + Fichajes, tres vistas
  distintas. No hay una pantalla «hoy» que junte quién trabaja, qué mesas hay y quién ha fichado.

### 💰 CONTABILIDAD
**Qué ve**: Dashboard, Compras, Productos, Analítica, Fichajes ⚠️, Reseñas.

🔴 **BUG CONFIRMADO**: «Fichajes» aparece en su menú y **la API le devuelve 403 en todos los
endpoints**. Entra y la vista falla entera. Ver `06_AUTH_PERMISOS.md` §1.

✅ Compras es el módulo más desarrollado (83 endpoints): conciliación, duplicados, alias de
proveedor, categorías, vencimientos, IVA, reparto por local, Drive y Gmail.

### 👥 RR.HH.
**Qué ve**: Equipo (+ Contratación, Pulso, Preguntas), Horarios, Fichajes.

✅ **El «Pulso del equipo» es una idea de producto excelente**: encuesta anónima mensual por enlace
de WhatsApp, con promesa de anonimato **escrita en la primera pantalla** (`pulso.html`), token
hasheado en BD y agregación que no permite reconstruir quién dijo qué.

⚠️ Falta la vista «qué tengo que hacer esta semana»: contratos que caducan, documentos por renovar,
periodos de prueba que terminan. Los datos existen (`documentosPorCaducar` en `rrhh/ficha.js`) pero
la entrada está dentro de la ficha de cada persona.

### 🧑‍🍳 TRABAJADOR
**Qué ve**: **el kiosko** (si no tiene cuenta) o el panel con los 17 endpoints `/api/mi-*`.

✅ **El kiosko es ejemplar**: 3 toques para fichar (nombre → PIN → acción), sin campos de texto,
botones de 88-96 px, entra solo al completar el PIN, confirmación a pantalla completa 3,2 s.
Las reservas del día se ven **antes del PIN**, a propósito: es lo que se mira al entrar a currar.

⚠️ **Problema**: `/api/mi-cuadrante`, `/api/mis-ausencias`, `/api/mi-disponibilidad` existen en la
API pero **INFERENCIA**: no hay una vista clara del panel dedicada al trabajador. Un trabajador con
cuenta entra al mismo panel con casi todo vacío.

## Evaluación transversal

| Aspecto | Nota | Comentario |
|---|---|---|
| **Jerarquía** | 🟡 | Menú plano con 24 entradas en 5 grupos. Sin distinción diario/ocasional |
| **Navegación** | 🟢 | Hash en la URL, botón atrás funciona, enlaces guardables |
| **Consistencia** | 🟢 | `esc`, `num`, `modal`, `toast`, `skeleton`, `errorCard` se usan en todas las vistas |
| **Formularios** | 🟢 | `descartados` viaja hasta la pantalla: **un filtro que no se puede aplicar se dice, no se tira en silencio**. Patrón excelente y raro |
| **Densidad** | 🟡 | Tablas anchas; hay comentarios sobre la primera columna pegajosa dejando el dinero fuera de vista |
| **Móvil** | 🟢 | Exigido a 390×844 por norma del proyecto, con herramienta de barrido |
| **Feedback** | 🟢 | `toast()` en cada acción; skeletons; el kiosko vibra al leer un QR |
| **Estados vacíos** | 🟢 | Cuidados y en lenguaje natural («Todavía no hay nadie con PIN en X. Los PINes se asignan desde el panel, en Fichajes») |
| **Errores** | 🟢 | `errorCard` con reintentar. `mensajeDeErrorIA` distingue clave caducada / sin saldo / demasiadas peticiones |
| **Confirmaciones** | 🟢 | `confirmModal` con `danger: true`. **Dos pasos** en operaciones destructivas: primero se enseña qué va a pasar, luego se aplica |
| **Filtros** | 🟢 | 30 filtros de segmentación, audiencias guardadas, y una libreta de «filtros que nos piden y no tenemos» |
| **Accesibilidad** | 🔴 | 23 `aria-` en 12.351 líneas. Sin gestión de foco, sin navegación por teclado |

## El patrón «di la verdad» — la mejor decisión de UX del sistema

Se repite por todo el código y merece nombrarse:

- `sanearSegmento` devuelve `{ segmento, descartados }` — lo que se cae **se dice**
- `sanearPromocion` hace lo mismo
- El kiosko dice *«Ya lo usó el 3 de septiembre a las 21:40»*, no «no válido» — porque un «no
  válido» a secas **provoca una discusión con el cliente delante**
- El cupón caducado se **apaga visualmente** en el móvil del cliente para que no lo enseñe convencido
- La vista previa de campaña avisa *«Vas a escribir a 340 personas de golpe: repásalo dos veces»*
- «Estimación honesta con intervalo» en el valor del cliente (`clientes/valor.js`)

**INFERENCIA**: quien escribió esto ha estado detrás de una barra. Es la señal más clara de que el
producto entiende su dominio.

## Mejoras de alto impacto (detalle en `29_QUICK_WINS.md`)

1. 🔴 Arreglar «Fichajes» para contabilidad (o quitarlo del menú).
2. 🟠 **Pantalla «Hoy» para el encargado**: quién trabaja, quién ha fichado, qué reservas hay,
   incidencias abiertas. Todos los datos existen ya.
3. 🟠 **Bandeja de RR.HH.**: contratos que caducan, documentos por renovar, periodos de prueba.
   `documentosPorCaducar()` ya está escrito.
4. 🟡 Separar el menú en «diario» / «semanal» / «configuración».
5. 🟡 Vista propia del trabajador con cuenta (cuadrante, horas, ausencias) en vez del panel vacío.
6. 🟡 Consolidado de grupo en analítica.
