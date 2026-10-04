// Solo condiciones publicadas. Nunca expone tokens, destinatarios ni datos del TPV.
const valor = v => v == null || v === '' ? 'No consta; no asumir' : v;
export function condicionesPromociones(cupones = [], caja = []) {
  return JSON.stringify({
    criterio: 'Condiciones informativas; NO acreditan que un cliente tenga derecho, saldo, cupo o usos disponibles. No autorizar excepciones. Si hay varias promociones posibles, preguntar cuál. Las fechas de envío de campañas NO son fechas de validez. Un valor ausente no significa sin límite.',
    cupones: cupones.map(p => ({ referencia: `cupon:${p.id}`, nombre: p.nombre, descripcion: valor(p.descripcion),
      activa: p.activa, locales: valor(p.locales), desde: valor(p.desde), hasta: valor(p.hasta), usos_por_cliente: valor(p.usos_por_cliente) })),
    promociones_en_caja: caja.map(p => ({ referencia: `caja:${p.id}`, nombre: p.nombre, campana: p.campana,
      estado: p.estado, local: valor(p.local), descripcion: valor(p.texto_cliente), desde: valor(p.desde), hasta: valor(p.hasta),
      dias_configurados: valor(p.dias), hora_desde: valor(p.hora_desde), hora_hasta: valor(p.hora_hasta),
      compra_minima: valor(p.compra_minima), coste_puntos: valor(p.coste_puntos), acumulable: p.acumulable,
      limite_cuenta: valor(p.limite_cuenta), tipo: valor(p.tipo), valor: valor(p.valor) })),
  });
}

export const ADJUNTOS_SCHEMA = `CREATE TABLE IF NOT EXISTS wa_adjuntos (
  id UUID PRIMARY KEY, jid TEXT NOT NULL, mensaje_id TEXT NOT NULL, nombre TEXT NOT NULL,
  mime TEXT NOT NULL, datos BYTEA NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (jid, mensaje_id)
);
CREATE INDEX IF NOT EXISTS wa_adjuntos_caducidad ON wa_adjuntos(creado_en);
ALTER TABLE whatsapp_messages ALTER COLUMN respuesta DROP NOT NULL;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb;`;
