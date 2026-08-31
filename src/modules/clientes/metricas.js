// Quién viene, cuántas veces y hace cuánto. PURO.
//
// EL SALTO QUE FALTABA: hasta ahora se podía preguntar «mujeres de Blanes de 35 a 50» —quién es
// la gente— y no «los que han venido tres veces y llevan cuatro meses sin aparecer» —lo que
// hace—. La segunda es la pregunta que trae dinero, y no había forma de hacerla porque la base
// de clientes se recalcula entera en cada petición y no hay dónde colgar nada de una persona.
//
// POR QUÉ UNA TABLA Y NO UNA CONSULTA MÁS: `sqlContactosUnificados` ya recorre `reservas` y
// `leads` enteras cada vez; añadirle otra agregación encima lo multiplica. Y esa consulta está
// en el camino del ENVÍO de una campaña: si tarda, no es una pantalla lenta, es un envío
// colgado. Recencia y frecuencia se mueven en días, así que recalcularlas cada pocas horas no
// pierde nada real.
//
// LA REGLA DE FORMA: aquí solo entran hechos CON FECHA, nunca cantidades relativas a hoy.
// Guardar «días desde la última visita» sería un número que envejece en silencio: si un
// recálculo falla tres días, la tabla seguiría diciendo 90 cuando ya son 93 y nadie se entera.
// Los días se restan contra hoy en el momento de preguntar.

/** Cada cuánto se recalcula. */
export const CADA_HORAS = 6;

/** A partir de cuántos días sin venir se considera que alguien se ha dormido, y perdido. */
export const DIAS_DORMIDO = 90;
export const DIAS_PERDIDO = 180;

/** Cuántas visitas en doce meses hacen a un cliente habitual. */
export const VISITAS_HABITUAL = 4;

/**
 * El hueco entre dos visitas a partir del cual el patrón es ANUAL y no un abandono.
 *
 * Blanes y Lloret son costa. Quien viene cada agosto lleva 300 días sin aparecer en junio y no
 * está perdido: está esperando a las vacaciones. Con umbrales fijos, el «te echamos de menos»
 * le llega en marzo a media base de veraneantes, y ese mensaje a un cliente fiel es el que hace
 * que te marque como pesado.
 */
export const HUECO_ESTACIONAL = 300;

const dias = (a, b) => {
  const x = Date.parse(String(a || "").slice(0, 10) + "T00:00:00Z");
  const y = Date.parse(String(b || "").slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : null;
};

/**
 * ¿Toca recalcular?
 *
 * Contra una marca guardada en la base, no un temporizador: en Replit el proceso se reinicia
 * tanto que un `setInterval` largo no llega a dispararse. Mismo patrón que el repaso de
 * facturas y la caché de Ágora.
 */
export function tocaRecalcular({ ultimo = null, ahora = null, cadaHoras = CADA_HORAS } = {}) {
  const t = Date.parse(ahora || "");
  if (!Number.isFinite(t)) return false;      // sin reloj no se decide nada
  if (!ultimo) return true;                    // nunca se ha hecho
  const u = Date.parse(ultimo);
  if (!Number.isFinite(u)) return true;        // marca ilegible: como si no hubiera
  return t - u >= Math.max(1, cadaHoras) * 3600 * 1000;
}

/**
 * El SQL del recálculo completo.
 *
 * Se escribe aquí, y no suelto en `server.js`, para poder leerlo entero de una vez y probar sus
 * piezas. Los parámetros van por `$1…$n` en el orden: hoy, hace12m, suelo, techo, ahora.
 *
 * Tres decisiones que están en el propio texto:
 *  · `dia <= hoy` — una reserva de la semana que viene NO es una visita. Sin esto, quien acaba
 *    de reservar para Navidad aparecería como cliente recientísimo.
 *  · el gasto se estima por día y local, con la horquilla de `valor.js`, y se acota. Un día con
 *    las ventas mal sincronizadas contaminaría a todo el que estuvo ese día.
 *  · `IS DISTINCT FROM` en el UPDATE: sin él son decenas de miles de filas reescritas cada seis
 *    horas para dejarlas igual, y eso en Neon es hinchazón y limpieza constante para nada. La
 *    mayoría de clientes no cambia entre dos pasadas.
 */
export const SQL_RECALCULO = `
WITH r AS (
  SELECT RIGHT(regexp_replace(telefono, '[^0-9]', '', 'g'), 9) AS tel9,
         telefono, local, dia, personas, creado_en
    FROM reservas
   WHERE LENGTH(regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')) >= 9
     AND dia <= $1
),
dia_local AS (
  SELECT local, dia, SUM(personas)::numeric AS comensales, COUNT(*)::numeric AS mesas
    FROM r GROUP BY local, dia
),
por_comensal AS (
  SELECT dl.local, dl.dia,
         LEAST(GREATEST((v.ventas::numeric / NULLIF(v.tickets, 0))
                        / NULLIF(dl.comensales / NULLIF(dl.mesas, 0), 0), $3), $4) AS pc_min,
         -- Espejo de porComensalDelDia (valor.js), incluido el techo del ticket medio:
         -- nadie gasta por cabeza más que una cuenta media, porque toda cuenta la paga al
         -- menos una persona. Sin ese LEAST, un día con una sola reserva de dos personas les
         -- atribuía la venta entera del local.
         LEAST(GREATEST(LEAST(v.ventas::numeric / NULLIF(dl.comensales, 0),
                              v.ventas::numeric / NULLIF(v.tickets, 0)), $3), $4) AS pc_max
    FROM dia_local dl
    JOIN ventas_diarias v ON v.local = dl.local AND v.dia = dl.dia
   WHERE v.ventas > 0 AND v.tickets > 0
),
visitas AS (
  SELECT r.*, pc.pc_min, pc.pc_max, (pc.local IS NOT NULL) AS con_tpv
    FROM r LEFT JOIN por_comensal pc ON pc.local = r.local AND pc.dia = r.dia
),
-- El hueco entre dos visitas seguidas necesita mirar la fila anterior de esa persona, y eso es
-- una función de ventana: no puede ir dentro de un MAX(), así que se calcula aparte y después
-- se agrega. Es lo que distingue a un veraneante de alguien que se ha ido.
huecos AS (
  SELECT tel9, MAX(hueco) AS hueco_max FROM (
    SELECT tel9, dia::date - LAG(dia::date) OVER (PARTITION BY tel9 ORDER BY dia) AS hueco
      FROM (SELECT DISTINCT tel9, dia FROM visitas) d
  ) x GROUP BY tel9
)
INSERT INTO cliente_metricas (
  tel9, telefono_muestra, visitas, comensales_total, primera_visita, ultima_visita,
  visitas_12m, locales, local_habitual, ultimo_local,
  gasto_est_min, gasto_est_max, visitas_con_tpv, hueco_max, calculado_en)
SELECT
  v2.tel9,
  (array_agg(telefono ORDER BY dia DESC))[1],
  COUNT(*),
  SUM(personas),
  MIN(dia),
  MAX(dia),
  COUNT(*) FILTER (WHERE dia >= $2),
  string_agg(DISTINCT local, ' | '),
  mode() WITHIN GROUP (ORDER BY local),
  (array_agg(local ORDER BY dia DESC))[1],
  SUM(personas * pc_min),
  SUM(personas * pc_max),
  COUNT(*) FILTER (WHERE con_tpv),
  COALESCE(MAX(h.hueco_max), 0),
  $5
  FROM visitas v2 LEFT JOIN huecos h ON h.tel9 = v2.tel9
 GROUP BY v2.tel9
ON CONFLICT (tel9) DO UPDATE SET
  telefono_muestra = EXCLUDED.telefono_muestra,
  visitas = EXCLUDED.visitas,
  comensales_total = EXCLUDED.comensales_total,
  primera_visita = EXCLUDED.primera_visita,
  ultima_visita = EXCLUDED.ultima_visita,
  visitas_12m = EXCLUDED.visitas_12m,
  locales = EXCLUDED.locales,
  local_habitual = EXCLUDED.local_habitual,
  ultimo_local = EXCLUDED.ultimo_local,
  gasto_est_min = EXCLUDED.gasto_est_min,
  gasto_est_max = EXCLUDED.gasto_est_max,
  visitas_con_tpv = EXCLUDED.visitas_con_tpv,
  hueco_max = EXCLUDED.hueco_max,
  calculado_en = EXCLUDED.calculado_en
WHERE (cliente_metricas.visitas, cliente_metricas.ultima_visita, cliente_metricas.comensales_total,
       cliente_metricas.gasto_est_min, cliente_metricas.ultimo_local)
   IS DISTINCT FROM
      (EXCLUDED.visitas, EXCLUDED.ultima_visita, EXCLUDED.comensales_total,
       EXCLUDED.gasto_est_min, EXCLUDED.ultimo_local)
`;

/**
 * Los que ya no tienen ninguna reserva se van.
 *
 * Pasa cuando se cancela la única reserva de alguien o cuando se unifican fichas repetidas. Sin
 * esto, la tabla acumularía clientes fantasma que seguirían saliendo en los segmentos.
 */
export const SQL_PODAR = `
DELETE FROM cliente_metricas cm
 WHERE NOT EXISTS (
   SELECT 1 FROM reservas r
    WHERE RIGHT(regexp_replace(r.telefono, '[^0-9]', '', 'g'), 9) = cm.tel9
      AND r.dia <= $1)
`;

/**
 * En qué situación está esta persona.
 *
 * → { visitas, diasSinVenir, segmento, etiqueta, estacional }
 *
 * NO se guarda en la tabla: se deriva al preguntar. Si estuviera guardado, cambiar un umbral
 * obligaría a recalcularlo todo y, mientras tanto, la etiqueta y el número no cuadrarían.
 */
export function segmentoDe(m = {}, { hoy = null, diasDormido = DIAS_DORMIDO, diasPerdido = DIAS_PERDIDO,
  visitasHabitual = VISITAS_HABITUAL, huecoEstacional = HUECO_ESTACIONAL } = {}) {
  const visitas = Number(m.visitas) || 0;
  if (!visitas) return { visitas: 0, diasSinVenir: null, segmento: "nunca", etiqueta: "No ha venido nunca", estacional: false };

  const diasSinVenir = hoy && m.ultima_visita ? dias(m.ultima_visita, hoy) : null;
  // Quien ya se ha ausentado así de largo alguna vez y ha vuelto no está perdido: viene por
  // temporadas. Es el veraneante, y en la costa son muchos.
  const estacional = (Number(m.hueco_max) || 0) >= huecoEstacional;

  if (diasSinVenir != null && diasSinVenir >= diasPerdido && !estacional) {
    return { visitas, diasSinVenir, segmento: "perdido", etiqueta: `Sin venir ${meses(diasSinVenir)}`, estacional };
  }
  if (diasSinVenir != null && diasSinVenir >= diasDormido && !estacional) {
    return { visitas, diasSinVenir, segmento: "dormido", etiqueta: `Sin venir ${meses(diasSinVenir)}`, estacional };
  }
  if (estacional && diasSinVenir != null && diasSinVenir >= diasDormido) {
    return { visitas, diasSinVenir, segmento: "estacional", etiqueta: "Viene por temporadas", estacional: true };
  }
  if ((Number(m.visitas_12m) || 0) >= visitasHabitual) {
    return { visitas, diasSinVenir, segmento: "habitual", etiqueta: `${m.visitas_12m} visitas este año`, estacional };
  }
  if (visitas === 1) return { visitas, diasSinVenir, segmento: "nuevo", etiqueta: "Ha venido una vez", estacional };
  return { visitas, diasSinVenir, segmento: "recurrente", etiqueta: `${visitas} visitas`, estacional };
}

const meses = (d) => {
  if (d < 60) return `${d} días`;
  const m = Math.round(d / 30);
  return m < 12 ? `${m} meses` : `más de un año`;
};

/** «Calculado hace 4 horas», para que la pantalla pueda decir de cuándo es el dato. */
export function edadDelCalculo({ calculadoEn = null, ahora = null } = {}) {
  const a = Date.parse(calculadoEn || ""), b = Date.parse(ahora || "");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const min = Math.max(0, Math.round((b - a) / 60000));
  if (min < 2) return "hace un momento";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}
