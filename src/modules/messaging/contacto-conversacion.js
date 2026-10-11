// Normalización conservadora: nunca comparar solo los últimos nueve dígitos.
export function telefonoContacto(valor) {
 if (String(valor||'').includes('@')) return null;
 let t=String(valor||'').replace(/[^0-9]/g,'').replace(/^00/,'');
 if (/^[6789][0-9]{8}$/.test(t)) t='34'+t;
 return /^[1-9][0-9]{9,14}$/.test(t)?t:null;
}
export const VINCULOS_SCHEMA=`CREATE TABLE IF NOT EXISTS wa_contacto_vinculos (
 jid TEXT PRIMARY KEY, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
 actualizado_por TEXT, actualizado_en TIMESTAMPTZ DEFAULT now())`;
const limpio=x=>`regexp_replace(COALESCE(${x},''),'[^0-9]','','g')`;
export function telefonoSQL(x){const t=`regexp_replace(${limpio(x)},'^00','')`;return `CASE WHEN COALESCE(${x},'') LIKE '%@%' THEN NULL WHEN ${t} ~ '^[6789][0-9]{8}$' THEN '34'||${t} WHEN ${t} ~ '^[1-9][0-9]{9,14}$' THEN ${t} ELSE NULL END`;}
// Un LID no es un teléfono. Solo usar otro número guardado, nunca sus propios dígitos.
export const IDENTIDAD_CTE=`telefonos AS (
 SELECT w.*,c.nombre AS nombre_wa,c.estado_ia,c.pausado_por,c.pausa_motivo,
 CASE WHEN w.jid LIKE '%@s.whatsapp.net' THEN ${telefonoSQL("split_part(w.jid,'@',1)")}
 ELSE COALESCE(${telefonoSQL("NULLIF(c.telefono,split_part(w.jid,'@',1))")},${telefonoSQL("NULLIF(w.telefono,split_part(w.jid,'@',1))")}) END AS tel
 FROM ultimos w LEFT JOIN wa_clientes c ON c.jid=w.jid
), identidades AS (
 SELECT t.*,l.id AS lead_id,l.telefono AS telefono_ficha,
 COALESCE(NULLIF(trim(concat_ws(' ',l.nombre,l.apellidos)),''),NULLIF(trim(t.nombre_wa),''),t.tel,'Contacto de WhatsApp') AS nombre,
 COALESCE(t.tel,${telefonoSQL('l.telefono')}) AS telefono_visible,
 v.lead_id IS NOT NULL AS vinculo_manual
 FROM telefonos t LEFT JOIN wa_contacto_vinculos v ON v.jid=t.jid
 LEFT JOIN LATERAL (SELECT a.*,count(*) OVER() AS coincidencias FROM leads a WHERE ${telefonoSQL('a.telefono')}=t.tel) auto ON auto.coincidencias=1
 LEFT JOIN leads l ON l.id=COALESCE(v.lead_id,auto.id)
)`;
