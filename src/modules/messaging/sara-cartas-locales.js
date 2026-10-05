// One-time installation per document, shared by the website and Sara.
// Subsequent administrative changes and deactivations remain authoritative.
const weeklyLocales = [['la-tapeta-blanes','La Tapeta - Blanes'],['la-tapeta-lloret','La Tapeta - Lloret'],['la-tapeta-girona','La Tapeta - Girona'],['cooperativa','Cooperativa - Blanes']];
export const CARTAS_LOCALES = [
  {id:'carta-can-mateu',locales:[['can-mateu','Can Mateu - Tordera']]},
  {id:'carta-cooperativa-tapeta-blanes',locales:[['cooperativa','Cooperativa - Blanes'],['la-tapeta-blanes','La Tapeta - Blanes']]},
  {id:'carta-tapa-iberica',locales:[['la-tapa-iberica','La Tapa Ibérica - Tordera']]},
  {id:'menu-semanal-tapeta-cooperativa',locales:weeklyLocales,weekly:true}
];
const quote = value => "'" + value.replaceAll("'", "''") + "'";
export const CARTAS_LOCALES_SQL = CARTAS_LOCALES.map(doc => {
  const url=quote(`/documentos/${doc.id}.pdf`);
  const title=doc.weekly?'Menú semanal':'Carta';
  const rules=doc.weekly
    ? 'Menú semanal de lunes a viernes de 13:00 a 16:00, 18,50 €. Vino, agua y refresco incluidos. Secreto ibérico: suplemento 3 €; carrilleras: suplemento 2 €. No confirmar disponibilidad del primero o segundo del día sin información del local. No extenderlo a fines de semana, otros horarios o locales. No asumir condiciones de festivos: consultar al local.'
    : 'Carta del local. Respetar los precios, suplementos y condiciones del documento. No inventar disponibilidad, cambios, fechas ni excepciones.';
  return `WITH primera_instalacion AS (
    INSERT INTO config(key,value) VALUES (${quote('sara_'+doc.id+'_20261005')},'1')
    ON CONFLICT(key) DO NOTHING RETURNING key
  ), locales(slug,local) AS (VALUES ${doc.locales.map(pair=>'('+pair.map(quote).join(',')+')').join(',')}), carta_web AS (
    INSERT INTO contents(key,value,updated_at)
    SELECT 'local_'||slug||'_${doc.weekly?'weekly':'menu'}_pdf',${url},CURRENT_TIMESTAMP::text FROM primera_instalacion CROSS JOIN locales
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at RETURNING key
  )
  INSERT INTO sara_respuestas(tema,disparadores,respuesta,documento_url,local,activo)
  SELECT ${quote(title+' de ')}||local,
    ${quote('Enviar cuando el cliente pida '+title.toLowerCase()+' de ')}||local||${quote('. Si no está claro el local, preguntarlo antes de enviar. No usar para otros locales. '+(doc.weekly?'Es distinto de la carta habitual.':'Si pide menú semanal, usar el documento específico cuando exista.'))},
    ${quote(rules)},${url},local,1 FROM primera_instalacion CROSS JOIN locales
  WHERE NOT EXISTS(SELECT 1 FROM sara_respuestas r WHERE r.documento_url=${url} AND r.local=locales.local);`;
}).join('\n');
