export function sanearPerfil(body = {}, hoy = new Date().toISOString().slice(0,10)) {
  const poblacion=String(body.poblacion||'').trim();
  const nacimiento=String(body.nacimiento||'').trim();
  if(poblacion.length>80) throw new Error('La población no puede superar los 80 caracteres.');
  if(nacimiento){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) throw new Error('Revisa la fecha de nacimiento.');
    const date=new Date(nacimiento+'T12:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==nacimiento||nacimiento>hoy||Number(nacimiento.slice(0,4))<Number(hoy.slice(0,4))-120) throw new Error('Revisa la fecha de nacimiento.');
  }
  return {poblacion,nacimiento};
}

// El token completo del carnet acredita el acceso; un teléfono o código corto no basta.
export async function guardarPerfil(pool, token, perfil) {
  if(typeof token!=='string'||token.length<24||token.length>256) return false;
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    const {rows}=await c.query("SELECT id, telefono, nombre FROM pro_qr WHERE token=$1 AND clase='carnet' AND anulado_en IS NULL AND (caduca_en IS NULL OR caduca_en >= $2) FOR UPDATE",[token,new Date().toISOString().slice(0,10)]);
    const qr=rows[0];
    if(!qr){await c.query('ROLLBACK');return false;}
    const tel=String(qr.telefono||'').replace(/\D/g,'').slice(-9);
    if(tel.length!==9){await c.query('ROLLBACK');return false;}
    const lead=await c.query("SELECT id FROM leads WHERE RIGHT(regexp_replace(telefono,'[^0-9]','','g'),9)=$1 ORDER BY id LIMIT 1 FOR UPDATE",[tel]);
    const now=new Date().toISOString();
    if(lead.rows.length) await c.query("UPDATE leads SET poblacion=COALESCE(NULLIF($1,''),poblacion), nacimiento=COALESCE(NULLIF($2,''),nacimiento), actualizado_en=$3 WHERE id=$4",[perfil.poblacion,perfil.nacimiento,now,lead.rows[0].id]);
    else await c.query("INSERT INTO leads(nombre,telefono,poblacion,nacimiento,fuente,creado_en,actualizado_en) VALUES($1,$2,$3,$4,'club',$5,$5)",[qr.nombre||'',qr.telefono,perfil.poblacion,perfil.nacimiento,now]);
    await c.query('COMMIT');return true;
  } catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
}
