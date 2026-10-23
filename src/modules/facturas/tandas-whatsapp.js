// Estado persistente: un reinicio no pierde los documentos recibidos ni repite avisos confirmados.
export const TANDAS_SCHEMA = `CREATE TABLE IF NOT EXISTS facturas_avisos_grupo (
 id BIGSERIAL PRIMARY KEY, grupo TEXT NOT NULL, mensaje TEXT NOT NULL,
 recepcion_id BIGINT NOT NULL REFERENCES facturas_recepciones(id), citado JSONB NOT NULL,
 recibido TIMESTAMPTZ NOT NULL DEFAULT NOW(), avisado BOOLEAN NOT NULL DEFAULT FALSE,
 solicitud_id TEXT, solicitud_estado TEXT, reemplaza BIGINT, resumen_error TEXT,
 UNIQUE(grupo,mensaje)
)`;
export function resumenTanda(filas) {
 const n=estado=>filas.filter(f=>f.estado===estado).length;
 const pendientes=filas.filter(f=>['pendiente','leyendo'].includes(f.estado)).length;
 return `📥 *Documentos recibidos*\n\n${filas.length} documento(s) guardado(s).`+
   (n('registrado')?`\n✅ ${n('registrado')} registrado(s).`:'')+
   (n('duplicado')?`\n${n('duplicado')} ya estaba(n) registrado(s).`:'')+
   (n('revision')?`\n🔎 ${n('revision')} para comprobar en el panel; aún no contabilizados.`:'')+
   (n('error')?`\n⚠️ ${n('error')} con un problema de lectura; conservamos los originales para revisarlos.`:'')+
   (pendientes?`\n⏳ ${pendientes} en cola de lectura. No hace falta reenviarlos.`:'')+
   '\n\nSi necesitamos repetir una foto, la citaremos aquí para que sepas cuál es.';
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
    const filas=await db.all(`SELECT a.id,r.estado FROM facturas_avisos_grupo a JOIN facturas_recepciones r ON r.id=a.recepcion_id WHERE a.grupo=? AND NOT a.avisado ORDER BY a.id`,[grupo]);
    if(filas.length) {
     const ids=filas.map(f=>f.id);
     await db.run('UPDATE facturas_avisos_grupo SET avisado=TRUE,resumen_error=? WHERE id=ANY(?::bigint[])',['Envío iniciado; pendiente de confirmación',ids]);
     try {
       await enviar(grupo,resumenTanda(filas));
       await db.run('UPDATE facturas_avisos_grupo SET resumen_error=NULL WHERE id=ANY(?::bigint[])',[ids]);
     } catch(e) {
       const desconectado=/WhatsApp no conectado/.test(e.message || '');
       await db.run('UPDATE facturas_avisos_grupo SET avisado=?,resumen_error=? WHERE id=ANY(?::bigint[])',[!desconectado,desconectado?'Se enviará al reconectar WhatsApp':'Resultado del envío incierto: comprobar el grupo antes de repetir',ids]);
       if(desconectado) continue;
     }
    }
    const fotos=await db.all(`SELECT a.id,a.citado,r.id AS recepcion_id FROM facturas_avisos_grupo a JOIN facturas_recepciones r ON r.id=a.recepcion_id
      WHERE a.grupo=? AND r.estado='revision' AND r.resultado->>'solicitarFoto'='true' AND a.solicitud_estado IS NULL ORDER BY a.id`,[grupo]);
    for(const f of fotos) {
     // No repetir automáticamente un envío de resultado incierto tras caída de conexión.
     await db.run("UPDATE facturas_avisos_grupo SET solicitud_estado='enviando' WHERE id=?",[f.id]);
     try {
      const quoted=structuredClone(f.citado);
      if(quoted.miniatura && quoted.message?.imageMessage) quoted.message.imageMessage.jpegThumbnail=Buffer.from(quoted.miniatura,"base64");
      delete quoted.miniatura;
      const r=await enviar(grupo,`📷 *Necesitamos repetir esta foto · #${f.recepcion_id}*\n\nNo se distinguen todos los datos. Envía una foto completa, enfocada y sin reflejos respondiendo a este mensaje. Así podremos asociarla al documento correcto.`,{quoted});
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
