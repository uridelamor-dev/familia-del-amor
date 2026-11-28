// Estado persistente: un reinicio no pierde los documentos recibidos ni repite avisos confirmados.
export const TANDAS_SCHEMA = `CREATE TABLE IF NOT EXISTS facturas_avisos_grupo (
 id BIGSERIAL PRIMARY KEY, grupo TEXT NOT NULL, mensaje TEXT NOT NULL,
 recepcion_id BIGINT NOT NULL REFERENCES facturas_recepciones(id), citado JSONB NOT NULL,
 recibido TIMESTAMPTZ NOT NULL DEFAULT NOW(), avisado BOOLEAN NOT NULL DEFAULT FALSE,
 solicitud_id TEXT, solicitud_estado TEXT, reemplaza BIGINT, resumen_error TEXT,
 UNIQUE(grupo,mensaje)
)`;
export const TANDAS_RESULTADO_SCHEMA = `ALTER TABLE facturas_avisos_grupo ADD COLUMN IF NOT EXISTS estado_avisado TEXT`;
export function citarOriginalFactura(citado) {
 if (!citado?.key?.id || !citado.message) return {};
 const {miniatura,...quoted}=structuredClone(citado);
 if(miniatura && quoted.message.imageMessage)quoted.message.imageMessage.jpegThumbnail=Buffer.from(miniatura,'base64');
 return {quoted};
}

const instruccionesReenvio = {
 vacio:'Vuelve a enviar una foto completa o el PDF original.',
 demasiado_grande:'Envía una foto legible o un PDF de hasta 20 MB.',
 formato:'Envía el documento como foto o PDF.',
};

export function avisoReenvioFactura(error) {
 const instruccion = error?.codigoOriginal && Object.hasOwn(instruccionesReenvio,error.codigoOriginal)
   ? instruccionesReenvio[error.codigoOriginal] : null;
 return instruccion ? `⚠️ *Necesitamos que reenvíes este documento*

El archivo no se ha guardado. ${instruccion}` : null;
}

export function crearTandas({db,enviar,lock,permitido=async()=>true}) {
 async function registrar({grupo,mensaje,recepcionId,citado,respondeA}) {
   // Solo relacionar una respuesta explícita, dentro del mismo grupo, a una solicitud nuestra.
   const anterior=respondeA ? await db.get("SELECT a.recepcion_id FROM facturas_avisos_grupo a JOIN facturas_recepciones r ON r.id=a.recepcion_id WHERE a.grupo=? AND (a.solicitud_id=? OR a.mensaje=?) AND a.solicitud_estado='enviado' AND r.estado='revision' LIMIT 1",[grupo,respondeA,respondeA]) : null;
   await db.run(`INSERT INTO facturas_avisos_grupo(grupo,mensaje,recepcion_id,citado,reemplaza) VALUES (?,?,?,?::jsonb,?) ON CONFLICT(grupo,mensaje) DO NOTHING`,[grupo,mensaje,recepcionId,JSON.stringify(citado),anterior?.recepcion_id || null]);
 }
 async function revisar() {
  return lock(async()=>{
   // La nueva foto solo sustituye la anterior cuando se ha registrado de verdad.
   await db.run(`UPDATE facturas_recepciones r SET estado='sustituido',actualizado=NOW(),error='Sustituido por una nueva foto ya registrada'
     WHERE r.estado='revision' AND EXISTS(SELECT 1 FROM facturas_avisos_grupo a JOIN facturas_recepciones nueva ON nueva.id=a.recepcion_id WHERE a.reemplaza=r.id AND nueva.estado IN ('registrado','duplicado'))`);
   const grupos=await db.all(`SELECT grupo FROM facturas_avisos_grupo GROUP BY grupo HAVING MAX(recibido)<NOW()-INTERVAL '2 minutes'`);
   for(const {grupo} of grupos) {
    if(!await permitido(grupo)) continue;
    const fotos=await db.all(`SELECT DISTINCT ON (r.id) a.id,a.citado,r.id AS recepcion_id
      FROM facturas_avisos_grupo a JOIN facturas_recepciones r ON r.id=a.recepcion_id
      WHERE a.grupo=? AND r.estado='revision' AND r.resultado->>'solicitarFoto'='true' AND a.solicitud_estado IS NULL
        AND NOT EXISTS (SELECT 1 FROM facturas_avisos_grupo anterior
          WHERE anterior.grupo=a.grupo AND anterior.recepcion_id=r.id AND anterior.solicitud_estado IS NOT NULL)
      ORDER BY r.id,a.id`,[grupo]);
    for(const f of fotos) {
     // No repetir automáticamente un envío de resultado incierto tras caída de conexión.
     await db.run("UPDATE facturas_avisos_grupo SET solicitud_estado='enviando' WHERE id=?",[f.id]);
     try {
      const r=await enviar(grupo,`📷 *Necesitamos repetir esta foto · #${f.recepcion_id}*\n\nNo se distinguen todos los datos. Envía una foto completa, enfocada y sin reflejos respondiendo a este mensaje. Así podremos asociarla al documento correcto.`,citarOriginalFactura(f.citado));
      await db.run("UPDATE facturas_avisos_grupo SET solicitud_estado='enviado',solicitud_id=? WHERE id=?",[r?.key?.id || null,f.id]);
     } catch(e) {
      await db.run("UPDATE facturas_avisos_grupo SET solicitud_estado=? WHERE id=?",[/WhatsApp no conectado/.test(e.message || "") ? null : "comprobar_envio",f.id]);
     }
    }
   }
  });
 }
 return {registrar,revisar};
}
