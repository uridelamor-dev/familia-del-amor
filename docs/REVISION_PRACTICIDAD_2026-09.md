# Revisión de practicidad y diseño — 23/09/2026

Alcance comprobado: horarios, ficha de trabajador, preparación de firmas, productos/escandallos y formulario público de reservas. Además, revisión estructural de locales, nosotros, eventos, trabaja, detalle de La Tapeta Blanes y privacidad a 390 y 1440 px: sin desbordamiento horizontal ni campos visibles sin etiqueta. La revisión completa de todos los módulos sigue pendiente; no se equipara el pase de pruebas técnicas a una auditoría integral de experiencia de uso.

## Corregido

- Horarios: se conserva la semana por áreas y personas. Se añaden día/mes y una lista por persona utilizable en móvil.
- Las vacantes se distinguen de los trabajadores. La cobertura expresa personas disponibles simultáneamente y tiempo sin cobertura.
- Las semanas cerradas se consultan sin ofrecer edición.
- Fichas RRHH: si se cambia rápido de persona, una respuesta tardía de la anterior ya no mezcla ficha laboral, documentos o notas. También se descarta si se cambia de centro o de sección.
- Escandallos: formulario adaptable, unidades y conversión visibles, coste incompleto explícito, IVA introducido y margen limitado a ingredientes.
- Firma: el borrador dice claramente que no se ha enviado; no aparece un falso botón de firmar.
- Diálogos del panel: nombre accesible, foco dentro del diálogo, Tab/Shift+Tab contenidos y Escape como cancelación. Al cerrar se recupera el foco anterior cuando sigue disponible.
- Reservas públicas: fecha, teléfono y nombre tienen etiquetas accesibles; los botones de cantidad tienen nombres en español, catalán e inglés.
- Idioma: corregidos interrogantes iniciales en catalán, llamadas a la acción y pies de página que quedaban en español. El enlace de privacidad lleva a la versión catalana existente cuando se elige catalán.

## Hallazgos por revisar antes de dar por finalizada la web

- En el HTML público existen tres testimonios de Google y una valoración de cinco estrellas escritos directamente. Falta verificar su procedencia/vigencia; la vista local los muestra como respaldo cuando no hay datos dinámicos. No se han cambiado testimonios ni contenido comercial sin comprobar la fuente.
- La ficha RRHH sigue siendo larga: datos, laboral, PIN, Ágora, documentos y conversaciones. Conviene priorizar acciones de alta, jornada y documentos, manteniendo el resto plegado.
- Contratación/pulso/preguntas siguen presentes en el código y en navegación de Dirección. Su aplazamiento funcional no se ha convertido en una migración que borre datos o elimine módulos.
- La publicación parcial, reparto masivo de nóminas y cambios de turno solicitados por trabajadores requieren acordar un flujo; la pregunta previa no quedó resuelta.
- En compras hacen falta pruebas con documentos representativos para confirmar conversiones de paquetes. No inferir automáticamente que «caja» significa una cantidad fija.
- Reservas, campañas, envíos, pagos y otras acciones externas no se han ejercitado con clientes/proveedores reales.

## Entorno de verificación

Datos ficticios, servidor local y esquemas PostgreSQL desechables. No se accedió a tablas de producción ni se enviaron mensajes. Verificación visual de los nuevos recorridos en escritorio y móvil. El test visual antiguo que lanza Chrome externo no arranca en este entorno; se utilizó el navegador integrado para los recorridos revisados.

Resultado final de pruebas (23/09/2026): 5952 pruebas automáticas superadas con PostgreSQL local, 0 fallos y 0 saltos en la ejecución que excluye `css-regresiones-visuales.test.js` por el fallo de arranque de su Chrome. Teclado verificado en navegador integrado: Tab al primer control, Shift+Tab al último, Escape cierra y devuelve el foco al botón de apertura. La revisión no envió reservas ni documentos.
