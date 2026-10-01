// Datos de contacto y suministro, independientes de la corrección de facturas históricas.
export const FICHA_COMERCIAL_SCHEMA = `CREATE TABLE IF NOT EXISTS facturas_proveedor_fichas (
 clave TEXT PRIMARY KEY, datos JSONB NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
 actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
export function validarFichaComercial(body) {
 const campos = ['razon_social','direccion','contacto_comercial','telefono_comercial','email_comercial','contacto_administracion','telefono_administracion','email_administracion','contacto_reparto','telefono_reparto','email_reparto','notas'];
 const datos = {};
 for(const campo of campos) { const v=body[campo]??''; if(typeof v!=='string'||v.length>2000) throw new Error('Revisa el campo '+campo); datos[campo]=v.trim(); }
 for(const campo of campos.filter(c=>c.startsWith('email_'))) if(datos[campo]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos[campo])) throw new Error('Revisa el correo de contacto');
 if(!Array.isArray(body.condiciones)||body.condiciones.length>30) throw new Error('Revisa los locales del proveedor');
 const vistos=new Set();
 datos.condiciones=body.condiciones.map(c=>{
  if(typeof c.local!=='string'||!c.local||vistos.has(c.local)) throw new Error('Cada local debe aparecer una sola vez'); vistos.add(c.local);
  const o={local:c.local};
  for(const k of ['dias_pedido','hora_limite','dias_entrega','plazo','pedido_minimo']) { if(typeof (c[k]??'')!=='string'||(c[k]??'').length>300)throw new Error('Revisa las condiciones de suministro');o[k]=(c[k]??'').trim(); }
  if(o.hora_limite&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(o.hora_limite))throw new Error('Hora límite no válida');
  if(o.pedido_minimo&&(!Number.isFinite(Number(o.pedido_minimo.replace(',','.')))||Number(o.pedido_minimo.replace(',','.'))<0))throw new Error('Pedido mínimo no válido');
  return o;
 });
 return datos;
}
