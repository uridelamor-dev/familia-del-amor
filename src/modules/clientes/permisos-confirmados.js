// Confirmación de Dirección recibida el 02-10-2026. Es una declaración administrativa,
// no un consentimiento atribuido al cliente ni una modificación de su formulario original.
export const PERMISOS_CONFIRMADOS_SCHEMA = `CREATE TABLE IF NOT EXISTS marketing_confirmaciones_admin (
 version TEXT PRIMARY KEY, motivo TEXT NOT NULL, anteriores JSONB NOT NULL,
 actualizados INTEGER NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
export const CONFIRMACION_VERSION='direccion-2026-10-02';

export async function registrarPermisosConfirmados(pool) {
 const c=await pool.connect();
 try {
   await c.query('BEGIN');
   await c.query('SELECT pg_advisory_xact_lock(810022)');
   await c.query('ALTER TABLE marketing_prefs ALTER COLUMN opt_in_wa SET DEFAULT 1, ALTER COLUMN opt_in_email SET DEFAULT 1');
   const done=await c.query('SELECT version FROM marketing_confirmaciones_admin WHERE version=$1',[CONFIRMACION_VERSION]);
   if(done.rows.length){await c.query('COMMIT');return 0;}
   // Never reactivate any normalized phone or address with an explicit unsubscribe.
   const eligible=`SELECT p.* FROM marketing_prefs p WHERE COALESCE(p.baja,0)=0
     AND NOT EXISTS (SELECT 1 FROM marketing_prefs b WHERE b.baja=1 AND (
       RIGHT(regexp_replace(b.telefono,'[^0-9]','','g'),9)=RIGHT(regexp_replace(p.telefono,'[^0-9]','','g'),9)
       OR (NULLIF(trim(p.correo),'') IS NOT NULL AND lower(trim(b.correo))=lower(trim(p.correo)))))
     AND EXISTS (SELECT 1 FROM (
       SELECT telefono FROM leads UNION SELECT telefono FROM reservas
       UNION SELECT telefono FROM whatsapp_messages WHERE tipo='intercambio'
     ) origen WHERE RIGHT(regexp_replace(origen.telefono,'[^0-9]','','g'),9)=RIGHT(regexp_replace(p.telefono,'[^0-9]','','g'),9))`;
   const prev=(await c.query(eligible)).rows;
   await c.query(`UPDATE marketing_prefs SET opt_in_wa=1,opt_in_email=1,updated_at=CURRENT_TIMESTAMP::text
     WHERE telefono IN (SELECT telefono FROM (${eligible}) permitidos)`);
   await c.query(`INSERT INTO marketing_confirmaciones_admin(version,motivo,anteriores,actualizados) VALUES($1,$2,$3::jsonb,$4)`,
     [CONFIRMACION_VERSION,'Dirección confirma permiso de email y WhatsApp de contactos de formularios, reservas y conversaciones entrantes. Se conservan las bajas explícitas.',JSON.stringify(prev),prev.length]);
   await c.query('COMMIT');return prev.length;
 } catch(e){await c.query('ROLLBACK');throw e;}
 finally{c.release();}
}
