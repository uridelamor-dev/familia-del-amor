// Carta aprobada: primeras ocho páginas, solo Lloret y Girona.
// Instalación atómica y única; respeta posteriores ediciones o bajas del equipo.
export const CARTA_TAPETA_SQL = `
WITH primera_instalacion AS (
  INSERT INTO config (key, value)
  VALUES ('sara_carta_tapeta_lloret_girona_20261005', '1')
  ON CONFLICT (key) DO NOTHING
  RETURNING key
), carta_web AS (
  INSERT INTO contents (key, value, updated_at)
  SELECT 'local_' || slug || '_menu_pdf', '/documentos/carta-la-tapeta-lloret-girona.pdf', CURRENT_TIMESTAMP::text
  FROM primera_instalacion
  CROSS JOIN (VALUES ('la-tapeta-lloret'), ('la-tapeta-girona')) AS locales(slug)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  RETURNING key
)
INSERT INTO sara_respuestas (tema, disparadores, respuesta, documento_url, local, activo)
SELECT 'Carta de ' || locales.local,
  'Enviar cuando el cliente pida la carta de ' || locales.local || '. Si no está claro el local, preguntarlo antes de enviar. No usar para otros locales.',
  'Carta en catalán, castellano, inglés y francés. No inventar disponibilidad, cambios, fechas ni condiciones adicionales. No confirmar excepciones a los menús u ofertas.',
  '/documentos/carta-la-tapeta-lloret-girona.pdf', locales.local, 1
FROM primera_instalacion
CROSS JOIN (VALUES ('La Tapeta - Lloret'), ('La Tapeta - Girona')) AS locales(local)
WHERE NOT EXISTS (
  SELECT 1 FROM sara_respuestas r
  WHERE r.documento_url = '/documentos/carta-la-tapeta-lloret-girona.pdf'
    AND r.local = locales.local
);`;
