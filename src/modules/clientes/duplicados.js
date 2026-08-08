// Clientes — unificar fichas duplicadas por teléfono.
//
// POR QUÉ: hasta hace poco los leads se buscaban comparando el teléfono como texto exacto,
// así que "600112233", "600 11 22 33" y "+34 600 11 22 33" creaban tres fichas de la misma
// persona. El código ya está arreglado (compara por los últimos 9 dígitos), pero los
// duplicados que se crearon entonces siguen ahí.
//
// Este fichero es el MISMO trabajo que scripts/limpiar-leads-duplicados.sql, expuesto para
// poder lanzarlo desde el panel en vez de tener que abrir una shell. Las consultas están
// aquí una sola vez y el script las importa conceptualmente; hay un test que compara ambos
// ficheros y falla si dejan de decir lo mismo.
//
// QUÉ NO TOCA, a propósito:
//   · Fichas con teléfono vacío o de menos de 9 dígitos: no hay forma de saber si son la
//     misma persona, y juntarlas por parecido crearía un problema peor del que arregla.
//   · Fichas que comparten correo pero tienen móviles distintos: pueden ser dos personas de
//     la misma casa. Solo se avisa, para mirarlas a mano.
//   · Las reservas: no se borra ni una.

// Los últimos 9 dígitos del móvil. Es la misma regla que MATCH_TEL9 en el servidor.
export const TEL9 = (col) => `RIGHT(regexp_replace(${col}, '[^0-9]', '', 'g'), 9)`;
export const TIENE_MOVIL = (col) => `LENGTH(regexp_replace(COALESCE(${col}, ''), '[^0-9]', '', 'g')) >= 9`;

// De cada campo se conserva el valor no vacío MÁS RECIENTE. El COALESCE final no es
// decorativo: si ninguna ficha del grupo tiene ese dato, array_agg devuelve NULL y esas
// columnas son NOT NULL — reventaría justo al aplicar, después de haber borrado.
const ultimoNoVacio = (col) =>
  `COALESCE((array_agg(${col} ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC) ` +
  `FILTER (WHERE COALESCE(${col}, '') <> ''))[1], '')`;

export const SQL_GRUPOS = `
  SELECT
    ${TEL9("telefono")} AS tel9,
    MIN(id)  AS conservar,
    COUNT(*) AS fichas,
    ${ultimoNoVacio("nombre")}     AS nombre,
    ${ultimoNoVacio("apellidos")}  AS apellidos,
    ${ultimoNoVacio("nacimiento")} AS nacimiento,
    ${ultimoNoVacio("poblacion")}  AS poblacion,
    ${ultimoNoVacio("correo")}     AS correo,
    ${ultimoNoVacio("premio")}     AS premio,
    (array_agg(genero ORDER BY COALESCE(actualizado_en, creado_en) DESC, id DESC)
      FILTER (WHERE COALESCE(genero, '') <> ''))[1] AS genero,
    MIN(creado_en) AS creado_en,
    MAX(COALESCE(actualizado_en, creado_en)) AS actualizado_en,
    CASE WHEN bool_or(fuente = 'web') THEN 'web' ELSE MIN(fuente) END AS fuente
  FROM leads
  WHERE ${TIENE_MOVIL("telefono")}
  GROUP BY 1
  HAVING COUNT(*) > 1`;

// Las fichas concretas que desaparecerían, para poder mirarlas antes.
export const SQL_A_BORRAR = `
  SELECT l.id, l.nombre, l.apellidos, l.telefono, l.correo, l.creado_en, l.fuente, g.tel9
  FROM leads l
  JOIN (${SQL_GRUPOS}) g ON ${TEL9("l.telefono")} = g.tel9
  WHERE l.id <> g.conservar
  ORDER BY g.tel9, l.id`;

// Mismo correo, móviles distintos: NO se tocan. Puede ser una pareja o una familia.
export const SQL_AVISO_CORREO = `
  SELECT LOWER(TRIM(correo)) AS correo, COUNT(*) AS fichas,
         string_agg(DISTINCT telefono, ' | ') AS telefonos
  FROM leads
  WHERE COALESCE(correo, '') <> ''
  GROUP BY 1
  HAVING COUNT(DISTINCT ${TEL9("telefono")}) > 1
  ORDER BY 2 DESC`;

export const SQL_RESUMEN = `
  SELECT
    (SELECT COUNT(*) FROM leads) AS total,
    (SELECT COUNT(*) FROM leads WHERE NOT ${TIENE_MOVIL("telefono")}) AS sin_movil`;

// ── Aplicar ──────────────────────────────────────────────────────────────────
// Todo va dentro de una transacción y SIEMPRE precedido de una copia de seguridad.
export const SQL_BACKUP = (sufijo) => [
  `CREATE TABLE IF NOT EXISTS leads_backup_${sufijo} AS SELECT * FROM leads`,
  `CREATE TABLE IF NOT EXISTS marketing_prefs_backup_${sufijo} AS SELECT * FROM marketing_prefs`,
];

export const SQL_APLICAR = [
  // 1. Volcar a la ficha que sobrevive todo lo recopilado del grupo.
  `UPDATE leads l SET
     nombre = g.nombre, apellidos = g.apellidos, nacimiento = g.nacimiento,
     poblacion = g.poblacion, correo = g.correo, genero = g.genero,
     premio = g.premio, creado_en = g.creado_en,
     actualizado_en = g.actualizado_en, fuente = g.fuente
   FROM (${SQL_GRUPOS}) g
   WHERE l.id = g.conservar`,

  // 2. Y borrar las demás del grupo.
  `DELETE FROM leads l
   USING (${SQL_GRUPOS}) g
   WHERE ${TEL9("l.telefono")} = g.tel9 AND l.id <> g.conservar`,
];

// Preferencias de marketing repetidas. Dos reglas que apuntan en direcciones distintas y
// las dos son correctas:
//
//   · `baja` con MAX: si en ALGUNA fila pidió la baja, la baja manda. Equivocarse hacia el
//     silencio se arregla con una llamada; equivocarse hacia el envío es escribirle a quien
//     pidió expresamente que no le escribieras.
//   · `opt_in_*` también con MAX, aunque parezca lo contrario: un `false` casi nunca
//     significa «dijo que no», significa «nunca dijo nada» (es el valor por defecto de la
//     fila). Con MIN se perdería un consentimiento real solo por existir otra fila en
//     blanco. El «no» explícito ya lo recoge `baja`.
const PREF_GRUPOS = `
  SELECT ${TEL9("telefono")} AS tel9, MIN(telefono) AS conservar,
         MAX(baja::int)::boolean AS baja,
         MAX(opt_in_wa::int)::boolean AS opt_in_wa,
         MAX(opt_in_email::int)::boolean AS opt_in_email,
         (array_agg(correo ORDER BY updated_at DESC) FILTER (WHERE COALESCE(correo, '') <> ''))[1] AS correo,
         (array_agg(idioma ORDER BY updated_at DESC) FILTER (WHERE COALESCE(idioma, '') <> ''))[1] AS idioma
  FROM marketing_prefs
  WHERE ${TIENE_MOVIL("telefono")}
  GROUP BY 1 HAVING COUNT(*) > 1`;

export const SQL_APLICAR_PREFS = [
  `UPDATE marketing_prefs mp SET
     baja = p.baja, opt_in_wa = p.opt_in_wa, opt_in_email = p.opt_in_email,
     correo = COALESCE(p.correo, mp.correo), idioma = COALESCE(p.idioma, mp.idioma)
   FROM (${PREF_GRUPOS}) p WHERE mp.telefono = p.conservar`,

  `DELETE FROM marketing_prefs mp
   USING (${PREF_GRUPOS}) p
   WHERE ${TEL9("mp.telefono")} = p.tel9 AND mp.telefono <> p.conservar`,

  // La fila superviviente se deja en el formato canónico que usa setMarketingPref
  // ('34' + 9 dígitos). Si no, esa función no la encontraría y volvería a insertar una fila
  // nueva: el duplicado reaparecería solo a la primera de cambio.
  // Copia exacta de formatTelefonoES() para no estropear números extranjeros.
  `UPDATE marketing_prefs mp SET telefono = c.canonico
   FROM (
     SELECT telefono,
            CASE
              WHEN LEFT(d, 2) = '34' THEN d
              WHEN LENGTH(d) = 9 AND LEFT(d, 1) IN ('6', '7', '9') THEN '34' || d
              ELSE d
            END AS canonico
     FROM marketing_prefs,
          LATERAL (SELECT regexp_replace(regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g'), '^00', '') AS d) x
     WHERE ${TIENE_MOVIL("telefono")}
   ) c
   WHERE mp.telefono = c.telefono AND mp.telefono <> c.canonico
     AND NOT EXISTS (SELECT 1 FROM marketing_prefs o WHERE o.telefono = c.canonico)`,
];

// Sufijo de la copia: AAAAMMDD_HHMM. Se pasa el instante desde fuera para poder probarlo.
export function sufijoCopia(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
