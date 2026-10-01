// Read model only: does not apply or consume rewards.
export const SQL_CANJES = `
SELECT 'cupon:' || c.id AS id, 'cupon:' || c.promocion_id AS promocion_clave,
 p.nombre AS promocion, q.id AS qr_id, q.nombre AS titular, q.telefono, q.codigo,
 c.local, c.worker_nombre, c.epoch_ms AS epoch_ms, NULL::integer AS factura_id, 'Cupón' AS origen
FROM pro_canjes c LEFT JOIN pro_qr q ON q.id=c.qr_id
LEFT JOIN pro_promociones p ON p.id=c.promocion_id
WHERE c.promocion_id IS NOT NULL
UNION ALL
SELECT 'agora:' || u.id, 'agora:' || u.clave, p.nombre, q.id, q.nombre,q.telefono,q.codigo,
 u.local, 'Ágora', EXTRACT(EPOCH FROM u.creado_en::timestamptz)*1000, u.factura_id, 'Ágora'
FROM fid_promo_usos u JOIN fid_facturas f ON f.id=u.factura_id
JOIN fid_promos p ON p.id=u.promo_id LEFT JOIN pro_qr q ON q.id=u.qr_id
WHERE u.estado='usado' AND f.es_prueba=FALSE AND f.devolucion=FALSE AND f.revertida_en IS NULL`;
const tel = v => String(v || '').replace(/\D/g,'').slice(-9);
export function filtrarCanjes(rows, filtros={}) {
  const fecha=String(filtros.fecha||'');
  if(fecha && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)))) throw new Error('Fecha no válida');
  const dia=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'});
  return rows.filter(c=>(!filtros.local || c.local===filtros.local) &&
    (!filtros.promocion || c.promocion_clave===filtros.promocion) &&
    (!fecha || dia.format(new Date(Number(c.epoch_ms)))===fecha));
}
export function resumenCanjes(rows) {
  return {canjes:rows.length,clientes:new Set(rows.map(c=>tel(c.telefono)|| (c.qr_id ? 'qr:'+c.qr_id : null)).filter(Boolean)).size};
}
export function destinatariosCanjes(rows, contactos) {
  const telefonos=new Set(rows.map(c=>tel(c.telefono)).filter(Boolean));
  const grupos=new Map();
  for(const c of contactos) {
    const key=tel(c.telefono); if(!telefonos.has(key)) continue;
    if(!grupos.has(key)) grupos.set(key,[]); grupos.get(key).push(c);
  }
  const salida=new Map(), bloqueados=new Set();
  for(const c of contactos) if(Number(c.baja)===1 && c.correo) bloqueados.add(String(c.correo).trim().toLowerCase());
  for(const grupo of grupos.values()) {
    if(grupo.some(c=>Number(c.baja)===1)) continue;
    for(const c of grupo) {
      const correo=String(c.correo||'').trim().toLowerCase();
      if(Number(c.opt_in_email)!==1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || bloqueados.has(correo)) continue;
      if(!salida.has(correo)) salida.set(correo,{nombre:c.nombre||'',correo});
    }
  }
  return [...salida.values()];
}
