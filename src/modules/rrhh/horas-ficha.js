// Se ejecuta dentro de la misma transacción que la ficha administrativa.
function error(message){return Object.assign(new Error(message),{status:400});}
export async function guardarHorasFicha(client,{workerId,horas,desde,hoy,autor,tipoJornada}) {
  if(horas===undefined){if(tipoJornada==='parcial')throw error('Indica las horas semanales de la jornada parcial.');return;}
  if(horas===null || String(horas).trim()==='') {
    if(tipoJornada==='parcial')throw error('Indica las horas semanales de la jornada parcial.');
    return;
  }
  const n=Number(horas);
  if(!Number.isFinite(n)||n<1||n>60||n*2!==Math.round(n*2))throw error('Indica entre 1 y 60 horas semanales, en pasos de media hora.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(desde||'') || !Number.isFinite(Date.parse(desde+'T12:00:00Z')) || new Date(desde+'T12:00:00Z').toISOString().slice(0,10)!==desde)throw error('Indica desde qué fecha se aplican las horas.');
  // También serializa con los escritores antiguos de contratos que no bloquean users.
  await client.query('LOCK TABLE hor_contratos IN SHARE ROW EXCLUSIVE MODE');
  const {rows}=await client.query('SELECT * FROM hor_contratos WHERE worker_id=$1 ORDER BY desde,id FOR UPDATE',[workerId]);
  const vigentes=rows.filter(c=>c.desde<=desde && (!c.hasta || c.hasta>=desde));
  if(vigentes.length>1)throw error('Hay contratos solapados. Revísalos en la ficha laboral antes de cambiar las horas.');
  const actual=vigentes[0];
  if(actual && Number(actual.horas_semana)===n)return;
  if(rows.some(c=>c.desde>desde && (!c.hasta || c.hasta>=c.desde)))throw error('Ya existe un cambio de contrato posterior. Revísalo en la ficha laboral.');
  if(desde<hoy)throw error('Para conservar el histórico, aplica el cambio desde hoy o una fecha posterior.');
  const anterior=new Date(desde+'T12:00:00Z');anterior.setUTCDate(anterior.getUTCDate()-1);
  if(actual)await client.query('UPDATE hor_contratos SET hasta=$1 WHERE id=$2',[anterior.toISOString().slice(0,10),actual.id]);
  await client.query('INSERT INTO hor_contratos(worker_id,desde,hasta,horas_semana,dias_semana,creado_en,creado_por) VALUES($1,$2,$3,$4,$5,$6,$7)',[workerId,desde,actual?.hasta||null,n,actual?.dias_semana||null,new Date().toISOString(),autor]);
}
