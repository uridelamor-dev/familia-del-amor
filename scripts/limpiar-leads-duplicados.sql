-- ═══════════════════════════════════════════════════════════════════════════
--  Fusión de clientes/leads duplicados por teléfono
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUÉ: hasta ahora los leads se buscaban comparando el teléfono como texto
--  exacto, así que "600112233", "600 11 22 33" y "+34 600 11 22 33" creaban tres
--  fichas de la misma persona. El código ya está arreglado (compara por los
--  últimos 9 dígitos), pero los duplicados que ya existen siguen en la base.
--
--  QUÉ HACE: agrupa los leads por los últimos 9 dígitos del móvil, se queda con
--  la ficha más antigua de cada grupo, le vuelca los datos que le falten (el
--  valor más reciente que no esté vacío) y borra las demás.
--
--  QUÉ NO TOCA:
--    · Leads con teléfono vacío o de menos de 9 dígitos → se dejan como están.
--    · Leads que comparten correo pero tienen móviles distintos → solo se avisa
--      (pueden ser dos personas de la misma casa). Se revisan a mano.
--    · Las reservas: no se borra ni una.
--    · El teléfono de la ficha que sobrevive: se queda tal cual está escrito.
--
--  CÓMO USARLO (desde la shell de Replit):
--
--    1) Informe, no cambia nada:
--         psql "$DATABASE_URL" -f scripts/limpiar-leads-duplicados.sql
--
--    2) Si el informe cuadra, aplicar de verdad:
--         psql "$DATABASE_URL" -v aplicar=1 -f scripts/limpiar-leads-duplicados.sql
--
--  Todo va dentro de una transacción: sin `-v aplicar=1` termina en ROLLBACK y
--  la base queda exactamente igual que estaba.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\if :{?aplicar} \else \set aplicar 0 \endif

BEGIN;

-- ── 1. Qué se fusionaría ───────────────────────────────────────────────────
-- Un grupo = todas las fichas cuyo móvil acaba en los mismos 9 dígitos.
-- Exigimos 9 dígitos reales para no juntar teléfonos basura o vacíos.
CREATE TEMP TABLE dup_merge ON COMMIT DROP AS
SELECT
  RIGHT(regexp_replace(telefono, '[^0-9]', '', 'g'), 9) AS tel9,
  MIN(id)   AS conservar,
  COUNT(*)  AS fichas,
  -- De cada campo nos quedamos con el valor no vacío más reciente. El COALESCE final
  -- es imprescindible: si NINGUNA ficha del grupo tiene ese dato, array_agg devuelve
  -- NULL y estas columnas son NOT NULL (reventaría al aplicar).
  COALESCE((array_agg(nombre     ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC) FILTER (WHERE COALESCE(nombre, '')     <> ''))[1], '') AS nombre,
  COALESCE((array_agg(apellidos  ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC) FILTER (WHERE COALESCE(apellidos, '')  <> ''))[1], '') AS apellidos,
  COALESCE((array_agg(nacimiento ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC) FILTER (WHERE COALESCE(nacimiento, '') <> ''))[1], '') AS nacimiento,
  COALESCE((array_agg(poblacion  ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC) FILTER (WHERE COALESCE(poblacion, '')  <> ''))[1], '') AS poblacion,
  COALESCE((array_agg(correo     ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC) FILTER (WHERE COALESCE(correo, '')     <> ''))[1], '') AS correo,
  COALESCE((array_agg(premio     ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC) FILTER (WHERE COALESCE(premio, '')     <> ''))[1], '') AS premio,
  -- genero sí admite NULL: lo dejamos como está.
  (array_agg(genero ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC) FILTER (WHERE COALESCE(genero, '') <> ''))[1] AS genero,
  MIN(creado_en) AS creado_en,
  MAX(COALESCE(actualizado_en, creado_en)) AS actualizado_en,
  -- 'web' = rellenó el formulario del descuento; manda sobre 'reserva'.
  CASE WHEN bool_or(fuente = 'web') THEN 'web' ELSE MIN(fuente) END AS fuente
FROM leads
WHERE LENGTH(regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')) >= 9
GROUP BY 1
HAVING COUNT(*) > 1;

\echo ''
\echo '── Grupos de fichas duplicadas ────────────────────────────────────────'
SELECT tel9 AS "móvil (9 dígitos)", fichas, nombre, apellidos,
       nacimiento, poblacion, correo, conservar AS "id que se conserva"
FROM dup_merge ORDER BY fichas DESC, tel9;

\echo ''
\echo '── Fichas que se borrarían ────────────────────────────────────────────'
SELECT l.id, l.nombre, l.apellidos, l.telefono, l.correo, l.creado_en, l.fuente
FROM leads l
JOIN dup_merge m ON RIGHT(regexp_replace(l.telefono, '[^0-9]', '', 'g'), 9) = m.tel9
WHERE l.id <> m.conservar
ORDER BY m.tel9, l.id;

\echo ''
\echo '── Resumen ────────────────────────────────────────────────────────────'
SELECT (SELECT COUNT(*) FROM leads)                                   AS "fichas ahora",
       (SELECT COUNT(*) FROM dup_merge)                               AS "personas duplicadas",
       (SELECT COALESCE(SUM(fichas - 1), 0) FROM dup_merge)           AS "fichas a borrar",
       (SELECT COUNT(*) FROM leads
         WHERE LENGTH(regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')) < 9)
                                                                      AS "sin móvil válido (no se tocan)";

-- ── 2. Avisos: casos que NO se tocan y conviene mirar a mano ───────────────
\echo ''
\echo '── AVISO: mismo correo con móviles distintos (revisar a mano) ─────────'
SELECT LOWER(TRIM(correo)) AS correo,
       COUNT(*) AS fichas,
       string_agg(DISTINCT telefono, ' | ') AS telefonos
FROM leads
WHERE COALESCE(correo, '') <> ''
GROUP BY 1 HAVING COUNT(DISTINCT RIGHT(regexp_replace(telefono, '[^0-9]', '', 'g'), 9)) > 1
ORDER BY 2 DESC;

\echo ''
\echo '── AVISO: preferencias de marketing duplicadas ────────────────────────'
SELECT RIGHT(regexp_replace(telefono, '[^0-9]', '', 'g'), 9) AS tel9,
       COUNT(*) AS filas, string_agg(telefono, ' | ') AS formatos
FROM marketing_prefs
WHERE LENGTH(regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')) >= 9
GROUP BY 1 HAVING COUNT(*) > 1;

-- ── 3. Aplicar (solo con -v aplicar=1) ─────────────────────────────────────
\if :aplicar

  -- Volcamos a la ficha que sobrevive todo lo recopilado del grupo.
  UPDATE leads l SET
    nombre = m.nombre, apellidos = m.apellidos, nacimiento = m.nacimiento,
    poblacion = m.poblacion, correo = m.correo, genero = m.genero,
    premio = m.premio, creado_en = m.creado_en,
    actualizado_en = m.actualizado_en, fuente = m.fuente
  FROM dup_merge m
  WHERE l.id = m.conservar;

  -- Y borramos las demás del grupo.
  DELETE FROM leads l
  USING dup_merge m
  WHERE RIGHT(regexp_replace(l.telefono, '[^0-9]', '', 'g'), 9) = m.tel9
    AND l.id <> m.conservar;

  -- Preferencias de marketing repetidas: se queda la más restrictiva (si en alguna
  -- fila pidió la baja, la baja manda) y se borran las otras.
  CREATE TEMP TABLE pref_merge ON COMMIT DROP AS
  SELECT RIGHT(regexp_replace(telefono, '[^0-9]', '', 'g'), 9) AS tel9,
         MIN(telefono) AS conservar,
         MAX(baja) AS baja, MAX(opt_in_wa) AS opt_in_wa, MAX(opt_in_email) AS opt_in_email,
         (array_agg(correo ORDER BY updated_at DESC) FILTER (WHERE COALESCE(correo, '') <> ''))[1] AS correo,
         (array_agg(idioma ORDER BY updated_at DESC) FILTER (WHERE COALESCE(idioma, '') <> ''))[1] AS idioma
  FROM marketing_prefs
  WHERE LENGTH(regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')) >= 9
  GROUP BY 1 HAVING COUNT(*) > 1;

  UPDATE marketing_prefs mp SET
    baja = p.baja, opt_in_wa = p.opt_in_wa, opt_in_email = p.opt_in_email,
    correo = COALESCE(p.correo, mp.correo), idioma = COALESCE(p.idioma, mp.idioma)
  FROM pref_merge p WHERE mp.telefono = p.conservar;

  DELETE FROM marketing_prefs mp
  USING pref_merge p
  WHERE RIGHT(regexp_replace(mp.telefono, '[^0-9]', '', 'g'), 9) = p.tel9
    AND mp.telefono <> p.conservar;

  -- Y dejamos la fila superviviente en el formato canónico que usa setMarketingPref
  -- ('34' + 9 dígitos). Si no, esa función no la encontraría y volvería a insertar
  -- una fila nueva: el duplicado reaparecería solo.
  -- Es copia exacta de formatTelefonoES() para no estropear números extranjeros:
  -- solo se antepone el 34 a móviles españoles de 9 dígitos que empiezan por 6/7/9.
  UPDATE marketing_prefs mp SET telefono = c.canonico
  FROM (
    SELECT telefono,
           CASE
             WHEN LEFT(d, 2) = '34' THEN d
             WHEN LENGTH(d) = 9 AND LEFT(d, 1) IN ('6', '7', '9') THEN '34' || d
             ELSE d
           END AS canonico
    FROM marketing_prefs,
         LATERAL (SELECT regexp_replace(regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g'), '^00', '') AS d) x
    WHERE LENGTH(regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')) >= 9
  ) c
  WHERE mp.telefono = c.telefono
    AND mp.telefono <> c.canonico
    AND NOT EXISTS (SELECT 1 FROM marketing_prefs o WHERE o.telefono = c.canonico);

  \echo ''
  \echo '── APLICADO ───────────────────────────────────────────────────────────'
  SELECT COUNT(*) AS "fichas tras la limpieza" FROM leads;
  COMMIT;

\else

  \echo ''
  \echo '── SIMULACIÓN: no se ha cambiado nada ─────────────────────────────────'
  \echo '   Para aplicarlo:  psql "$DATABASE_URL" -v aplicar=1 -f scripts/limpiar-leads-duplicados.sql'
  ROLLBACK;

\endif
