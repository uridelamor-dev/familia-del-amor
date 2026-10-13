import { REPASO_ID, POLITICA, INTERVALO_ENVIO_MS, huellaResena, edadResena, validarPropuesta, promptRepaso, revisarOriginal } from './repaso-politica.js';
import { esNombreResena } from './business-profile.js';

// Una campaña única. PostgreSQL conserva autorización, decisiones y envíos entre despliegues.
export function crearRepaso({ pool, analizar, google, enabled = false }) {
  let ready = false, busy = false;
  const query = (sql, values = []) => pool.query(sql, values);
  async function lock(fn) {
    const c = await pool.connect();
    let held = false;
    try {
      held = (await c.query('SELECT pg_try_advisory_lock(73992013) AS locked')).rows[0].locked;
      if (!held) return null;
      return await fn(c);
    } finally { try { if (held) await c.query('SELECT pg_advisory_unlock(73992013)'); } finally { c.release(); } }
  }
  async function init() {
    // El esquema debe existir también en desarrollo: Replit compara ambos esquemas
    // al publicar y puede eliminar tablas que solo existen en producción.
    await query(`CREATE TABLE IF NOT EXISTS reviews_repaso (
      id TEXT PRIMARY KEY, cutoff TEXT NOT NULL, seen_at TIMESTAMPTZ,
      state TEXT NOT NULL DEFAULT 'nuevo', paused BOOLEAN NOT NULL DEFAULT FALSE,
      approved_by TEXT, approved_at TIMESTAMPTZ, policy TEXT,
      next_send_at TIMESTAMPTZ, retry_at TIMESTAMPTZ, error TEXT)`);
    await query(`CREATE TABLE IF NOT EXISTS reviews_repaso_items (
      campaign_id TEXT NOT NULL REFERENCES reviews_repaso(id), review_id TEXT NOT NULL,
      snapshot JSONB NOT NULL, fingerprint TEXT, state TEXT NOT NULL DEFAULT 'pendiente',
      reason TEXT, reply TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ, PRIMARY KEY(campaign_id, review_id))`);
    await query('CREATE INDEX IF NOT EXISTS reviews_repaso_estado ON reviews_repaso_items(campaign_id,state)');
    if (!enabled) return; // Sin campaña ni trabajo automático fuera de producción.
    await query('INSERT INTO reviews_repaso(id,cutoff) VALUES($1,$2) ON CONFLICT DO NOTHING', [REPASO_ID, new Date().toISOString()]);
    ready = true;
  }
  async function cutoff() {
    if (!ready) return null;
    return (await query('SELECT cutoff FROM reviews_repaso WHERE id=$1', [REPASO_ID])).rows[0]?.cutoff || null;
  }
  async function status(offset = 0) {
    if (!ready) return { available: false };
    const campaign = (await query('SELECT * FROM reviews_repaso WHERE id=$1', [REPASO_ID])).rows[0];
    const counts = (await query('SELECT state,COUNT(*)::int AS n FROM reviews_repaso_items WHERE campaign_id=$1 GROUP BY state', [REPASO_ID])).rows;
    const items = (await query(`SELECT review_id,state,reason,reply,snapshot->>'author' AS author,
      snapshot->>'location_name' AS local,snapshot->>'text' AS text,snapshot->>'fecha' AS fecha
      FROM reviews_repaso_items WHERE campaign_id=$1 ORDER BY review_id LIMIT 25 OFFSET $2`, [REPASO_ID, offset])).rows;
    const n = (await query(`SELECT COUNT(*)::int AS n FROM google_reviews WHERE COALESCE(google_reply,'')='' AND COALESCE(fecha,creado_en) < $1`, [campaign.cutoff])).rows[0].n;
    return { available: true, campaign, counts: Object.fromEntries(counts.map(x => [x.state,x.n])), items, offset, historical: n, policy: POLITICA };
  }
  async function notice() {
    if (!ready) return false;
    return !!(await query(`UPDATE reviews_repaso SET seen_at=NOW() WHERE id=$1 AND seen_at IS NULL RETURNING id`, [REPASO_ID])).rowCount;
  }
  async function authorize(actor, policy) {
    if (!ready || policy !== POLITICA) throw Error('Revisa las condiciones del repaso');
    return lock(async c => {
      await c.query('BEGIN');
      try {
        const campaign = (await c.query('SELECT * FROM reviews_repaso WHERE id=$1 FOR UPDATE', [REPASO_ID])).rows[0];
        if (campaign.state === 'nuevo') {
          await c.query(`INSERT INTO reviews_repaso_items(campaign_id,review_id,snapshot)
            SELECT $1,id,to_jsonb(r) FROM google_reviews r
            WHERE COALESCE(google_reply,'')='' AND COALESCE(fecha,creado_en)<$2
            ON CONFLICT DO NOTHING`, [REPASO_ID, campaign.cutoff]);
          await c.query(`UPDATE reviews_repaso SET state='analizando',approved_at=NOW(),approved_by=$2,policy=$3,seen_at=NOW() WHERE id=$1`, [REPASO_ID, actor, policy]);
        }
        await c.query('COMMIT'); return true;
      } catch (e) { await c.query('ROLLBACK'); throw e; }
    });
  }
  async function control(action) {
    if (!ready || !['pausar','reanudar','cancelar'].includes(action)) throw Error('Acción no válida');
    return lock(async c => {
      await c.query(`UPDATE reviews_repaso SET paused=$2,retry_at=NULL,
        state=CASE WHEN $3 THEN 'cancelada' ELSE state END,error=NULL
        WHERE id=$1 AND approved_at IS NOT NULL AND state IN ('analizando','cola')`, [REPASO_ID, action !== 'reanudar', action === 'cancelar']);
      return true;
    });
  }
  async function step(c) {
    const campaign = (await c.query('SELECT * FROM reviews_repaso WHERE id=$1', [REPASO_ID])).rows[0];
    if (campaign?.retry_at && new Date(campaign.retry_at).getTime()>Date.now()) return;
    if (!campaign?.approved_at || campaign.policy !== POLITICA || campaign.paused || !['analizando','cola'].includes(campaign.state)) return;
    const set = (id,state,reason,reply='') => c.query(`UPDATE reviews_repaso_items SET state=$3,reason=$4,reply=$5 WHERE campaign_id=$1 AND review_id=$2`, [REPASO_ID,id,state,reason,reply]);
    if (campaign.state === 'analizando') {
      const item = (await c.query(`SELECT * FROM reviews_repaso_items WHERE campaign_id=$1 AND state='pendiente' ORDER BY snapshot->>'fecha' DESC,review_id LIMIT 1`, [REPASO_ID])).rows[0];
      if (!item) { await c.query("UPDATE reviews_repaso SET state='cola' WHERE id=$1", [REPASO_ID]); return; }
      const r = item.snapshot, age = edadResena(r.fecha);
      if (r.reply || !esNombreResena(r.google_name) || age === null || age > 30 || Number(r.rating) < 4) {
        const why = r.reply ? 'Se conserva el borrador del equipo; no se publica automáticamente.' : !esNombreResena(r.google_name) ? 'Sin identificador verificable de Google.' : age === null ? 'Fecha desconocida.' : age > 30 ? 'Más de 30 días: no reabrir una visita antigua.' : 'Valoración crítica o mixta: se conserva en el histórico sin respuesta automática.';
        await set(r.id,'omitir',why); return;
      }
      await c.query('UPDATE reviews_repaso_items SET attempts=attempts+1 WHERE campaign_id=$1 AND review_id=$2', [REPASO_ID,r.id]);
      try {
        const examples = (await c.query(`SELECT ai_example FROM google_reviews WHERE location_name=$1 AND id<>$2 AND COALESCE(ai_example,'')<>'' ORDER BY fecha DESC LIMIT 3`, [r.location_name,r.id])).rows;
        const result = validarPropuesta(await analizar(promptRepaso(r,examples)),r);
        await set(r.id,result.decision==='responder'?'cola':'omitir',result.reason,result.reply);
        await c.query('UPDATE reviews_repaso_items SET fingerprint=$3 WHERE campaign_id=$1 AND review_id=$2', [REPASO_ID,r.id,huellaResena(r)]);
      } catch {
        if (item.attempts >= 2) await set(r.id,'error','No se pudo analizar con certeza tras tres intentos. No se publica.');
      }
      return;
    }
    // Una marca de envío sobrevive a un corte. Se comprueba, nunca se reenvía a ciegas.
    const item = (await c.query(`SELECT * FROM reviews_repaso_items WHERE campaign_id=$1 AND state IN ('enviando','cola') ORDER BY CASE WHEN state='enviando' THEN 0 ELSE 1 END,snapshot->>'fecha' DESC,review_id LIMIT 1`, [REPASO_ID])).rows[0];
    if (!item) { await c.query("UPDATE reviews_repaso SET state='terminada' WHERE id=$1",[REPASO_ID]); return; }
    if (item.state==='cola' && campaign.next_send_at && new Date(campaign.next_send_at).getTime()>Date.now()) return;
    const api = await google();
    const remote = await api.leer(item.snapshot.google_name);
    const original = revisarOriginal(item,remote);
    async function sent(reply,at) {
      await c.query('BEGIN');
      try {
        await c.query(`UPDATE google_reviews SET google_reply=$2,google_replied_at=$3 WHERE id=$1`, [item.review_id,reply,at]);
        await c.query(`UPDATE reviews_repaso_items SET state='enviada',sent_at=NOW() WHERE campaign_id=$1 AND review_id=$2`,[REPASO_ID,item.review_id]);
        await c.query('COMMIT');
      } catch(e) { await c.query('ROLLBACK'); throw e; }
    }
    if (original==='ya_enviada') { await sent(remote.reviewReply.comment,remote.reviewReply.updateTime); return; }
    if (item.state==='enviando') { await set(item.review_id,'incierta','El envío quedó sin confirmación. No se repetirá automáticamente.',item.reply); return; }
    const current = (await c.query('SELECT * FROM google_reviews WHERE id=$1',[item.review_id])).rows[0];
    if (original!=='sin_respuesta' || !current || current.google_reply || current.reply || huellaResena(current)!==item.fingerprint || edadResena(current.fecha)>30) {
      await set(item.review_id,'omitir','La reseña ya tiene respuesta, cambió, tiene un borrador o dejó de ser reciente. Se preserva el trabajo del equipo.',item.reply); return;
    }
    await c.query('BEGIN');
    try {
      await c.query("UPDATE reviews_repaso_items SET state='enviando' WHERE campaign_id=$1 AND review_id=$2",[REPASO_ID,item.review_id]);
      await c.query('UPDATE reviews_repaso SET next_send_at=NOW()+($2 * interval \'1 millisecond\') WHERE id=$1',[REPASO_ID,INTERVALO_ENVIO_MS]);
      await c.query('COMMIT');
    } catch(e) { await c.query('ROLLBACK'); throw e; }
    try {
      const result = await api.publicar(current.google_name,item.reply);
      await sent(result.comment,result.updateTime);
    } catch(e) {
      // Mantener enviando permite verificar el resultado en el siguiente ciclo, incluso tras reiniciar.
      if (/HTTP (401|403|429)/.test(e.message)) await c.query('UPDATE reviews_repaso SET paused=TRUE,error=$2 WHERE id=$1',[REPASO_ID,'Google ha rechazado la petición. Revisa conexión o cuota antes de reanudar.']);
    }
  }
  async function tick() {
    if (!ready || busy) return;
    busy=true;
    try { await lock(step); }
    catch { await query("UPDATE reviews_repaso SET error=$2,retry_at=NOW()+interval '5 minutes' WHERE id=$1",[REPASO_ID,'No se pudo completar la comprobación. Se reintentará sin repetir envíos no confirmados.']).catch(()=>{}); }
    finally { busy=false; }
  }
  async function exclusive(fn) {
    const value = await lock(fn);
    if (value === null) throw Error('Hay otra operación de reseñas en curso');
    return value;
  }
  return { init, cutoff, status, notice, authorize, control, tick, exclusive };
}
