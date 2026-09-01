# 26 · Fortalezas — lo que NO hay que romper

> Esta sección es tan importante como la de riesgos. Una refactorización que pierda esto habría
> empeorado el sistema aunque quedara «más limpio».

## 1 · Los comentarios explican el *porqué*, no el *qué* 🏆

**El activo más valioso del repositorio.** Ejemplos textuales:

> «Ya no hay tecla *Entrar*: se entra solo al completar el PIN. […] El hueco a la IZQUIERDA: así el
> 0 queda centrado y el borrar a la derecha, que es donde los tiene cualquier teclado numérico de
> móvil. Al revés el 0 se descoloca.»

> «EL FALLO QUE ARREGLA: `{local}` salía VACÍO en todas las campañas enviadas hasta hoy. […] la
> plantilla de cumpleaños llegaba al cliente como "¡Felicidades, Erika! 🎂 Desde queremos
> celebrarlo contigo".»

> «Lo irónico es que justo encima de aquel objeto había un comentario explicando por qué esto es
> peligroso. […] La lección no es "acordarse de la lista": es que no puede haber una lista escrita
> a mano.»

**Por qué importa**: hacen navegables 16.000 líneas y evitan que se deshaga una decisión sin
entenderla. **Una reescritura que los pierda destruye más valor del que crea.**

## 2 · Tests de introspección como candados 🏆

Tests que leen el código fuente **como texto** y fallan si un invariante se rompe. Protegen
*decisiones*, no implementaciones, y sobreviven a los refactors.

Durante **esta misma sesión** uno de ellos detectó una entrada de menú que faltaba, antes de llegar
a producción.

## 3 · Invariantes de datos bien elegidos

| Invariante | Por qué es correcto |
|---|---|
| `fic_eventos` inmutable | Un registro de jornada editable no prueba nada; es exactamente lo que un inspector espera encontrar en uno falsificado |
| Bolsa de horas = libro de movimientos, sin campo `saldo` | El saldo siempre se puede explicar minuto a minuto |
| Nunca copiar planificado ↔ fichado | La desviación **es** la señal |
| `pro_canjes` inmutable | Protege al camarero de quien insinúe que un cupón se validó solo |
| `dup_estado='duda'` saca la factura de todos los totales | Prefiere un total incompleto a uno falso |

## 4 · Módulos puros y testeables

`src/modules/**` no importa Express ni toca el DOM; recibe la conexión por parámetro. Por eso hay
3.373 tests que corren en 60 segundos sin levantar nada.

## 5 · El patrón «di la verdad» 🏆

- `sanearSegmento`/`sanearPromocion` devuelven `{ resultado, descartados }` — **lo que se cae se dice**
- El kiosko dice «Ya lo usó el 3 de septiembre a las 21:40», no «no válido» — *«un "no válido" a
  secas provoca una discusión con el cliente delante»*
- «Vas a escribir a 340 personas de golpe: repásalo dos veces»
- Estimación de valor de cliente **con intervalo**, no con un número falsamente preciso
- `mensajeDeErrorIA` distingue «espera un minuto» de «la clave no vale»

## 6 · «Mirar» separado de «aplicar»

Toda operación destructiva enseña primero exactamente qué va a pasar y solo después deja aplicar.
Y al aplicar se manda de vuelta el número que se vio: si algo cambió en medio, se niega.
(Fichas repetidas de Clientes; anulación en masa de cupones.)

## 7 · Protecciones de WhatsApp

Jitter 6-15 s, tope diario con reanudación, deduplicación por destinatario, `excluir_baja`
**inyectado a la fuerza** en todo segmento, exclusión del equipo, opt-out automático que **además
borra los datos personales derivados**.

## 8 · La sincronización de Ágora

Idempotente, sin estado propio («el estado en BD ES la fuente de verdad»), tolerante a un TPV
apagado, con la parte difícil en una función pura testeable.

## 9 · El kiosko de fichaje

Reloj del servidor + `performance.now()`. Cola offline en IndexedDB. Service worker que nunca cachea
`/api/`. Todo se borra a los 20 s, también del DOM. Cero campos de texto. Botones de 88 px.
«Se prefiere un dato marcado a un dato falso.»

## 10 · El dashboard narrado

No dice «3 incidencias abiertas»: dice qué pasa, qué haría en tu lugar y cuánto cuesta no hacerlo.
Es la pieza más diferenciadora frente a un ERP genérico.

## 11 · Decisiones de producto finas

- Pedir reseña de Google **solo a quien salió contento**
- Las reservas del día visibles en el kiosko **antes del PIN**, y **sin teléfonos**
- `marketing_faltan`: libreta de «filtros que nos piden y no tenemos», alimentada por el uso real
- El pulso del equipo **anónimo de verdad**, con la promesa escrita en la primera pantalla
- `pass_temporal` no bloquea: *«el encargado que llega a las siete con el local abriendo no puede
  quedarse fuera del panel por un formulario»*

## 12 · Consistencia de interfaz

`esc`, `num`, `modal`, `toast`, `skeleton`, `errorCard`, `confirmModal` usados en las 24 vistas.
Móvil exigido por norma (390×844) con herramienta de barrido.

## 13 · Superficie de dependencias mínima

13 paquetes para 84.000 líneas. **Cero dependencias de frontend.** Menos superficie de ataque, menos
mantenimiento, menos sorpresas. La restricción de no añadir paquetes, siendo una molestia, ha
producido un sistema notablemente autónomo.

---

## ⛔ Lista corta: no romper bajo ningún concepto

1. La inmutabilidad de `fic_eventos`, `fic_bolsa_movimientos` y `pro_canjes`
2. Los tests de introspección
3. Los comentarios explicativos
4. `excluir_baja` inyectado a la fuerza en `segmentoDelBody`
5. El tope diario y el jitter de WhatsApp
6. Que la hora del fichaje la ponga el servidor
7. Que `localPermitido()` nunca devuelva un local ajeno
8. Que la IA pase siempre por el mismo saneador que el formulario
9. Que el kiosko no encole canjes de cupón
10. Que el kiosko no muestre teléfonos
