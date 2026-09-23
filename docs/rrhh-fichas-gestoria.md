# Fichas de personal y preparación de altas

## Uso

En Equipo → Añadir se pueden introducir los datos personales y laborales, incluidos dirección, IBAN, talla, jornada completa/parcial y contrato indefinido/temporal/fijo discontinuo. La jornada lleva horas semanales, conservadas en el contrato de horarios existente.

Para guardar siguen bastando nombre, usuario y establecimiento; la fecha de incorporación se propone como hoy y puede elegirse otra en el alta. Los campos administrativos vacíos quedan pendientes. Un valor introducido con formato inválido se señala antes de guardar.

La ficha muestra por separado:

- **Pendiente de completar / ficha completa:** incluye todos los datos solicitados y PIN.
- **Datos básicos listos para gestoría:** DNI/NIE, nombre completo, jornada, tipo de contrato, establecimiento, puesto, fecha de incorporación y horas semanales.

Dirección, nacimiento, IBAN, talla, teléfono, correo y PIN no bloquean la preparación para gestoría. **No hay conexión de correo ni envío a gestoría en esta entrega.** Guardar la ficha no constituye un alta laboral ni confirma una solicitud.

Los datos se completan desde Editar. Las horas conservan su editor de contrato y el PIN se asigna desde Acceso; no se duplican las horas en una segunda tabla. La edición genérica no ofrece fechas de alta/baja que el servidor ignoraba; las modificaciones del historial laboral siguen en su circuito específico.

## Privacidad e historial

DNI, dirección, IBAN, jornada, tipo de contrato y talla se muestran a RR. HH. y dirección. Los campos nuevos viven en `rrhh_datos_alta`, para no filtrarse por listados genéricos de usuarios. El PIN elegido por el trabajador se introduce con cuatro dígitos, respeta los bloqueos de PIN existentes y se guarda con bcrypt, nunca como texto legible.

Las notas antiguas se conservan. El historial incorpora fecha de conversación, asunto, interlocutor, canal, contenido y acuerdos. El autor del registro procede de la sesión autenticada. Las rutas de notas y las fichas agregadas excluyen estas notas para encargados; no basta con esconder el formulario.

## Cumpleaños

Equipo → Avisos de cumpleaños. Viene **apagado** hasta que se decida empezar a utilizar RR. HH. Activarlo habilita un resumen diario a Nerea, +34 622 065 974, a partir de las 09:00 Europe/Madrid (comprobación cada minuto mientras el servidor esté activo).

Solo se incluyen trabajadores y encargados activos en la fecha del cumpleaños. Se comparan día y mes exactos; el 29 de febrero se avisa el 29 de febrero en años bisiestos, sin trasladarlo automáticamente a otra fecha.

Sin WhatsApp conectado, espera y vuelve a comprobar durante el mismo día. No manda cumpleaños atrasados. La reserva diaria se guarda en PostgreSQL antes del envío y evita duplicados entre procesos o reinicios. Un resultado incierto se deja como «revisar», o «enviando» si el proceso murió: aparece en los últimos avisos y no se reenvía a ciegas. No se ha enviado ningún WhatsApp real durante las pruebas.

## Despliegue y comprobaciones

Migraciones aditivas e idempotentes al arrancar: nueva tabla administrativa, campos adicionales de notas y registro de avisos. Sin dependencias nuevas. Sin cambios en datos laborales existentes. La conexión de gestoría queda para otra entrega.

Pruebas nuevas: guardado incompleto, criterios de gestoría, formato de campos, PIN, roles, autor autenticado, edición transaccional/rollback, cumpleaños activos, hora de Madrid, desconexión, concurrencia y resultado incierto.

Revisadas alta, edición, ficha, historial y configuración en navegador local con datos ficticios a 1440×800 y 390×844. La prueba visual no utiliza la base de producción.

Al publicar en Replit se reinicia el servidor y puede ser necesario volver a vincular WhatsApp. Los avisos seguirán apagados hasta activarlos expresamente en el panel.
