# Auditoría de identidad de proveedores — 6 noviembre 2026

## Evidencia confirmada

- Factura 330033, 03/09/2026, Blanes, 496,73 €, ID 174: el original es de Vins i Licors Grau, S.A. (CIF A17127630, margen vertical). Estaba guardada como Transgourmet sin CIF.
- En producción existía la regla `grau → Transgourmet Ibérica, S.A.U. · ESA17371758`. También se observaron asociaciones a Transgourmet desde `del amor uriel`, `congelats salma`, `francisco puig masjoan`, `montabalt`, `nova costasalt` y `salma food service`. Estas últimas requieren contraste individual; no se han cambiado por deducción.
- La capa de texto del PDF de GRAU omite su logo y datos fiscales laterales, pero contiene el CIF del cliente. No debe prevalecer automáticamente sobre la imagen.
- El código podía aplicar memoria de proveedores después de verificar una lectura. Las uniones múltiples permitían elegir un CIF entre varios y extenderlo a los alias.

## Correcciones realizadas en producción

- Factura 330033: proveedor Vins i Licors Grau, S.A.; CIF A17127630. Guardado confirmado por el panel. Se conservaron fecha, importes, local y estado de pago.
- Regla `grau`: corregida al mismo proveedor y CIF; verificada en Reglas aprendidas.
- Drive: acceso directo denegado a la cuenta del navegador. No se ha verificado todavía el renombrado/reubicación que solicita el guardado del panel.

## Código preparado

- La memoria no sustituye una identidad distinta ni modifica una revisión humana/verificada.
- Lectura del emisor con evidencia del original; advertencia ante contradicción con memoria o CIF del destinatario.
- El repaso histórico lee sin usar aliases anteriores.
- No se aprende un CIF propio como proveedor.
- Las uniones y renombrados masivos rechazan CIF diferentes o una empresa destinataria; primero deben corregirse los originales afectados.

## Pendiente: no considerar concluida la reparación histórica

- Publicar esta corrección antes de continuar el repaso.
- El repaso de producción está en primera tanda terminada: 25/487 documentos; 21 incidencias, 4 sin discrepancias; 0 revisiones humanas. No se continuó con el lector antiguo.
- Revisar de nuevo los resultados previos con el criterio corregido; auditar el resto, corregir solo con respaldo del original y comprobar Drive.
- Revisar las asociaciones sospechosas restantes y el rastro de uniones para determinar el alcance. No consta aún el número total de documentos mal asignados.

Validación: 47 pruebas focalizadas correctas; prueba de panel de unión correcta. Integración de unión en PostgreSQL omitida por falta de TEST_DATABASE_URL. Otras pruebas de lectura y altas ya ejecutadas en esta tarea constan en los logs temporales.
