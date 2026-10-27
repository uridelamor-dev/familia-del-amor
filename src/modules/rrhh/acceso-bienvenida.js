export const ACCESO_SCHEMA = `ALTER TABLE rrhh_confirmaciones ADD COLUMN IF NOT EXISTS acceso_envio TEXT;
ALTER TABLE rrhh_confirmaciones ADD COLUMN IF NOT EXISTS acceso_intento_en TIMESTAMPTZ;`;
export function mensajeAccesoInicial({nombre,username,password,pin}){
 return `Hola ${nombre} 👋\n\n*¡Bienvenido/a a Familia del Amor!*\nTus datos ya están confirmados. Estos son tus datos de acceso:\n\n🌐 *Acceso al panel*\nhttps://familiadelamor.org/panel/\n\n👤 *Usuario:* ${username}\n🔑 *Contraseña inicial:* ${password}\n⏱️ *PIN para fichar en el sistema de tu local:* ${pin}\n\nLa contraseña es para entrar al panel; el PIN es para registrar tus entradas y salidas en el sistema de fichajes de tu local.\n\nAl entrar por primera vez tendrás que cambiar la contraseña. También podrás cambiar tu PIN desde tu espacio personal.\nGuarda este mensaje y no compartas tus datos de acceso.`;
}
// La cola solo guarda estado e identidad, nunca contraseñas ni PIN en claro.
// Reclamar antes de enviar evita duplicados entre procesos. Un envío incierto no se repite.
export function crearEnvioAccesos({pool,listo,credenciales,enviar}){
 let ocupado=false;
 return async function procesar(){
  if(ocupado||!listo())return;
  ocupado=true;
  try{
   await pool.query("UPDATE rrhh_confirmaciones SET acceso_envio='revisar' WHERE acceso_envio='enviando' AND acceso_intento_en<NOW()-INTERVAL '5 minutes'");
   const {rows:[r]}=await pool.query(`UPDATE rrhh_confirmaciones SET acceso_envio='enviando',acceso_intento_en=NOW() WHERE id=(
    SELECT id FROM rrhh_confirmaciones WHERE estado='confirmada' AND acceso_envio='pendiente' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
   ) AND acceso_envio='pendiente' RETURNING id,worker_id,datos`);
   if(!r)return;
   let estado='revisar';
   try{
    const d=await credenciales(r.worker_id);
    if(d&&d.username===r.datos.username&&d.telefono===r.datos.telefono&&d.password&&d.pin){
     await enviar(d.telefono,mensajeAccesoInicial(d),{tipoMensaje:'rrhh_acceso_inicial'});
     estado='enviado';
    }
   }catch{} // No registrar excepciones que puedan contener el mensaje o sus credenciales.
   await pool.query('UPDATE rrhh_confirmaciones SET acceso_envio=$1 WHERE id=$2',[estado,r.id]);
  }finally{ocupado=false;}
 };
}
