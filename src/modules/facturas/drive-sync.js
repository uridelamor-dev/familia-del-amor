// La revisión se guarda en la misma operación que cambia la factura, incluso si el proceso cae.
export const DRIVE_SYNC_SCHEMA = `
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS drive_revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS drive_revision_sync BIGINT NOT NULL DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS drive_sync_intento TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION facturas_marcar_drive() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW.local,NEW.empresa,NEW.fecha,NEW.proveedor,NEW.numero_factura,NEW.drive_url)
     IS DISTINCT FROM ROW(OLD.local,OLD.empresa,OLD.fecha,OLD.proveedor,OLD.numero_factura,OLD.drive_url) THEN
    NEW.drive_revision := OLD.drive_revision + 1;
    NEW.sheet_synced := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS facturas_marcar_drive ON facturas;
CREATE TRIGGER facturas_marcar_drive BEFORE UPDATE ON facturas
FOR EACH ROW EXECUTE FUNCTION facturas_marcar_drive();
`;
let bloqueo;
export function configurarBloqueoDrive(fn) { bloqueo=fn; }
export async function sincronizarArchivo(deps,id,mover) {
  try {
    if(!bloqueo) throw new Error('Bloqueo de archivos no configurado');
    return await bloqueo(id,async()=>{
      const actual=await deps.dbGet('SELECT * FROM facturas WHERE id = ?',[id]);
      if(!actual) return {movido:false,motivo:'Factura eliminada'};
      if(!actual.drive_url) return {movido:false,motivo:'sin archivo en Drive'};
      await deps.dbRun('UPDATE facturas SET drive_sync_intento = CURRENT_TIMESTAMP WHERE id = ?',[id]);
      const resultado=await mover(actual);
      if(resultado.movido || resultado.motivo==='ya estaba en su sitio') {
        // Una edición durante la llamada a Google deja su nueva revisión pendiente.
        await deps.dbRun('UPDATE facturas SET drive_revision_sync = ? WHERE id = ? AND drive_revision = ?',
          [actual.drive_revision,id,actual.drive_revision]);
      }
      return resultado;
    });
  } catch(e) { return {movido:false,motivo:e.message}; }
}
export async function reintentarArchivos(deps,mover) {
  const pendientes=await deps.dbAll("SELECT id FROM facturas WHERE drive_revision_sync < drive_revision AND COALESCE(drive_url,'') <> '' ORDER BY drive_sync_intento ASC NULLS FIRST, id LIMIT 50");
  let fallidos=0;
  for(const f of pendientes) {
    const r=await mover(f);
    if(!r.movido && r.motivo!=='ya estaba en su sitio') { fallidos++; console.warn(`[Drive] #${f.id} sigue pendiente: ${r.motivo}`); }
  }
  return {revisados:pendientes.length,fallidos};
}
