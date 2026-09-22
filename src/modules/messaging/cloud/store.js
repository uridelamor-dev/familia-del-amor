import { createHash } from 'node:crypto';
import { CloudError, nextStatus, validateOutgoing, phone } from './protocol.js';

export async function ensureCloudSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS wa_cloud_conversations (
      phone TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','human','resolved')),
      owner TEXT, last_inbound_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      version INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS wa_cloud_messages (
      id BIGSERIAL PRIMARY KEY, phone TEXT NOT NULL REFERENCES wa_cloud_conversations(phone),
      meta_id TEXT UNIQUE, request_id TEXT UNIQUE, request_hash TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('in','out')),
      type TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
      author TEXT, error_code TEXT, media_id TEXT, mime TEXT, filename TEXT, reply_to TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS wa_cloud_messages_phone_id ON wa_cloud_messages(phone,id DESC);
    CREATE TABLE IF NOT EXISTS wa_cloud_statuses (
      meta_id TEXT NOT NULL, status TEXT NOT NULL, error_code TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(meta_id,status)
    );
    CREATE TABLE IF NOT EXISTS wa_cloud_audit (
      id BIGSERIAL PRIMARY KEY, phone TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export function createStore(pool, api, cfg) {
  const query = (...a) => pool.query(...a);
  async function transaction(fn) {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const r = await fn(db); await db.query('COMMIT'); return r; }
    catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
  }
  async function updateStatus(db, id) {
    const current = (await db.query('SELECT status FROM wa_cloud_messages WHERE meta_id=$1 FOR UPDATE', [id])).rows[0];
    if (!current) return;
    const statuses = (await db.query('SELECT status,error_code FROM wa_cloud_statuses WHERE meta_id=$1', [id])).rows;
    const status = statuses.reduce((s,v) => nextStatus(s,v.status), current.status);
    await db.query('UPDATE wa_cloud_messages SET status=$2,error_code=$3 WHERE meta_id=$1', [id,status,statuses.find(s => s.status === 'failed')?.error_code || null]);
  }
  return {
    async ingest(items) {
      return transaction(async db => {
        for (const e of items) {
          if (e.kind === 'status') {
            if (e.reference && e.phone) await db.query(`UPDATE wa_cloud_messages SET meta_id=$3
              WHERE request_id=$1 AND phone=$2 AND direction='out' AND meta_id IS NULL`, [e.reference,e.phone,e.id]);
            await db.query(`INSERT INTO wa_cloud_statuses(meta_id,status,error_code) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [e.id,e.status,e.error]);
            await updateStatus(db,e.id); continue;
          }
          await db.query(`INSERT INTO wa_cloud_conversations(phone,name) VALUES($1,$2) ON CONFLICT DO NOTHING`, [e.phone,e.name]);
          const added = await db.query(`INSERT INTO wa_cloud_messages(phone,meta_id,direction,type,body,status,media_id,mime,filename,reply_to,created_at)
            VALUES($1,$2,'in',$3,$4,'received',$5,$6,$7,$8,$9) ON CONFLICT(meta_id) DO NOTHING RETURNING id`,
            [e.phone,e.id,e.type,e.text,e.mediaId,e.mime,e.filename,e.replyTo,e.at]);
          if (added.rowCount) await db.query(`UPDATE wa_cloud_conversations SET
            name=CASE WHEN $2='' THEN name ELSE $2 END,
            last_inbound_at=GREATEST(last_inbound_at,$3::timestamptz), updated_at=NOW(),
            state=CASE WHEN state='resolved' THEN 'pending' ELSE state END WHERE phone=$1`, [e.phone,e.name,e.at]);
        }
      });
    },
    async list(search = '', state = '', page = 0) {
      return (await query(`SELECT c.*,m.body AS preview,m.direction AS last_direction,m.status AS last_status
        FROM wa_cloud_conversations c LEFT JOIN LATERAL
          (SELECT body,direction,status FROM wa_cloud_messages WHERE phone=c.phone ORDER BY id DESC LIMIT 1) m ON TRUE
        WHERE ($1='' OR c.phone ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%') AND ($2='' OR c.state=$2)
        ORDER BY c.updated_at DESC,c.phone LIMIT 101 OFFSET $3`, [search.slice(0,100),state,page*100])).rows;
    },
    async conversation(number, before = null) {
      const c = (await query('SELECT * FROM wa_cloud_conversations WHERE phone=$1', [number])).rows[0];
      if (!c) throw new CloudError('Conversación no encontrada.',404);
      const messages = (await query(`SELECT * FROM wa_cloud_messages WHERE phone=$1 AND ($2::bigint IS NULL OR id<$2)
        ORDER BY id DESC LIMIT 100`, [number,before])).rows.reverse();
      return { conversation:c, messages };
    },
    async create(number, actor) {
      number = phone(number);
      if (!cfg.recipients.has(number)) throw new CloudError('Ese teléfono no está autorizado para el piloto.',403);
      await query(`INSERT INTO wa_cloud_conversations(phone) VALUES($1) ON CONFLICT DO NOTHING`,[number]);
      return this.take(number,actor);
    },
    async take(number, actor) {
      return transaction(async db => {
        const c=(await db.query('SELECT * FROM wa_cloud_conversations WHERE phone=$1 FOR UPDATE',[number])).rows[0];
        if (!c) throw new CloudError('Conversación no encontrada.',404);
        if(c.owner && c.owner!==actor && c.state==='human') throw new CloudError('Otra persona está atendiendo esta conversación.',409);
        await db.query(`UPDATE wa_cloud_conversations SET state='human',owner=$2,version=version+1,updated_at=NOW() WHERE phone=$1`,[number,actor]);
        await db.query(`INSERT INTO wa_cloud_audit(phone,action,actor) VALUES($1,'take',$2)`,[number,actor]);
      });
    },
    async resolve(number, actor) {
      const r=await query(`UPDATE wa_cloud_conversations SET state='resolved',owner=NULL,version=version+1,updated_at=NOW()
        WHERE phone=$1 AND state='human' AND owner=$2
        AND NOT EXISTS (SELECT 1 FROM wa_cloud_messages m WHERE m.phone=$1 AND m.status IN ('sending','uncertain')) RETURNING phone`,[number,actor]);
      if (!r.rowCount) throw new CloudError('Toma la conversación y comprueba los envíos pendientes antes de resolverla.',409);
      await query(`INSERT INTO wa_cloud_audit(phone,action,actor) VALUES($1,'resolve',$2)`,[number,actor]);
    },
    async send(number, body, actor) {
      if (!cfg.ready || !cfg.recipients.has(number)) throw new CloudError('Envío no habilitado para ese teléfono de prueba.',403);
      if (!/^[0-9a-f-]{36}$/i.test(body.requestId || '')) throw new CloudError('Falta el identificador del envío.');
      const hash=createHash('sha256').update(JSON.stringify([number,actor,body.type,body.text,body.name,body.language,body.parameters])).digest('hex');
      const templates=body.type==='template' ? await api.templates() : [];
      // Un único bloqueo limita todos los envíos del piloto, incluso con varios procesos.
      const attempt = await transaction(async db => {
        await db.query("SELECT pg_advisory_xact_lock(633129031,1)");
        const old=(await db.query('SELECT * FROM wa_cloud_messages WHERE request_id=$1',[body.requestId])).rows[0];
        if(old) { if(old.request_hash!==hash) throw new CloudError('Ese envío ya se usó para otro mensaje.',409); return {existing:old}; }
        const c=(await db.query('SELECT * FROM wa_cloud_conversations WHERE phone=$1 FOR UPDATE',[number])).rows[0];
        if(!c || c.state!=='human' || c.owner!==actor) throw new CloudError('Toma la conversación antes de enviar.',409);
        const count=(await db.query(`SELECT COUNT(*) n FROM wa_cloud_messages WHERE direction='out' AND created_at>NOW()-INTERVAL '24 hours'`)).rows[0];
        if(Number(count.n)>=40) throw new CloudError('Se ha alcanzado el máximo de 40 intentos diarios del piloto.',429);
        const pending=(await db.query(`SELECT id FROM wa_cloud_messages WHERE phone=$1 AND status IN ('sending','uncertain') LIMIT 1`,[number])).rows[0];
        if(pending) throw new CloudError('Hay un envío sin confirmar. Revisa su estado antes de enviar otro.',409);
        const message=validateOutgoing(body,c,templates);
        const row=(await db.query(`INSERT INTO wa_cloud_messages(phone,request_id,request_hash,direction,type,body,status,author)
          VALUES($1,$2,$3,'out',$4,$5,'sending',$6) RETURNING *`,[number,body.requestId,hash,body.type,
          body.type==='text' ? body.text.trim() : `[Plantilla ${body.name} · ${body.language}] ${(body.parameters || []).join(' · ')}`,actor])).rows[0];
        return {row,message};
      });
      if(attempt.existing) return attempt.existing;
      // La intención está confirmada en disco ANTES de contactar con Meta. Nunca reenvío ciego.
      try {
        const identity=await api.identity();
        if(phone(identity.display_phone_number)==='34633129031') throw new CloudError('El número real está excluido del piloto.',409,'real_number');
        const id=await api.send(number,attempt.message,body.requestId);
        return await transaction(async db => {
          await db.query(`UPDATE wa_cloud_messages SET meta_id=$2,status=CASE WHEN status IN ('sending','uncertain') THEN 'accepted' ELSE status END WHERE id=$1`,[attempt.row.id,id]);
          await updateStatus(db,id);
          await db.query('UPDATE wa_cloud_conversations SET updated_at=NOW() WHERE phone=$1',[number]);
          return (await db.query('SELECT * FROM wa_cloud_messages WHERE id=$1',[attempt.row.id])).rows[0];
        });
      } catch(e) {
        await query(`UPDATE wa_cloud_messages SET status=$2,error_code=$3 WHERE id=$1 AND status='sending'`,
          [attempt.row.id,['meta_rejected','real_number'].includes(e.code) ? 'failed':'uncertain',e.code || 'uncertain']);
        throw e;
      }
    },
    async media(id) {
      const row=(await query('SELECT media_id,mime,filename FROM wa_cloud_messages WHERE id=$1',[id])).rows[0];
      if(!row?.media_id) throw new CloudError('Adjunto no encontrado.',404);
      return {...await api.media(row.media_id),filename:row.filename};
    },
  };
}
