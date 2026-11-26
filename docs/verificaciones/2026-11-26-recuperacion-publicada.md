# Comprobación posterior a publicación — 26/11/2026

Publicación confirmada por usuario. Primer reencolado observado: 18:10:12 UTC. Consultas autenticadas de solo lectura al panel y consulta de producción mediante Replit.

## Corte 18:17:08 UTC (19:17 Madrid)

De los 73 previstos: 14 procesados, 59 aún sin reencolar. Resultado de los 14: 4 registrados, 4 apartados, 6 vuelven a revisión. No son 67 nuevos errores: hay que distinguir los todavía no procesados de los que ya fallaron la comprobación nueva.

Registrados comprobados por API: 946, 948, 949, 950. Sus datos llevan `_contraste.version=4` y `estado=lectura_validada`; conservan el historial de recuperación y enlaces Drive/Sheets. No se cotejaron originales ni carpetas Drive manualmente; no se concede revisión humana al 100%. Compras registradas: 542→546 en corte API 18:15:13. Recepciones pendientes: 578→572 en ese corte anterior.

Pendientes tras relectura:
- 947 (Peix Ros): unidades vacías en primera lectura, kg en segunda/tercera, líneas 1 y 3. No asumir equivalencia entre vacío y kg.
- 951 (Transgourmet): cantidad 2 × precio 1,166 no explica importe 33,92; también discrepancia 1/2 páginas y unidad unidades/ud. No resolver solo normalizando unidad.
- 977 y 978 (Peix Ros): falso aviso por la palabra «línea» en «Recuadro de Impuestos, línea Total factura». Todas las lecturas sitúan el importe en cuadro fiscal. Corrección puntual preparada localmente; sigue sin publicar y estas recepciones siguen pendientes.
- 1426 y 1427 (Premier Foods & Meat): discrepancias aritméticas de líneas. 1426 además discrepa en recargo de equivalencia. Confirmados por consulta de solo lectura a producción; no se han revisado sus originales.

No ha llegado ninguna recepción nueva desde 18:10 UTC hasta 18:17:08 UTC, según consulta a producción. Por tanto, aún no se puede certificar el funcionamiento con entradas nuevas reales. No se generaron documentos ficticios ni se reenviaron documentos para simularlo.

## Corrección local adicional

`avisosEvidenciaCabecera` distingue una línea del cuadro fiscal de una línea de producto: exige contexto explícito de cuadro/recuadro/resumen y total/impuestos/fiscal. Mantiene bloqueados subtotal, base, neto, ubicación de producto/artículo y discrepancia entre importe literal y total.

24 pruebas específicas aprobadas; `git diff --check` correcto. No se ha hecho push ni publicado esta corrección. Los IDs 977/978 ya tienen marcador de recuperación: una publicación por sí sola no los reencolará otra vez. Tras publicar el arreglo, preparar una reevaluación puntual y auditada de estos IDs, sin quitar marcadores ni aprobar manualmente sus importes.

## Continuidad

El trabajador publicado continúa con el lote a dos reencolados por ciclo, sin aprobación manual y sin bucles de relectura. Volver a consultar los mismos 73 IDs cuando termine y comparar con esta fotografía. Comprobar recepción nueva creada después de la publicación antes de afirmar que la entrada nueva está validada. Priorizar extracción de unidades/formatos y lectura del cuadro fiscal; no relajar recargos ni discrepancias aritméticas para reducir contadores.
