import {createHash} from 'node:crypto';
export const claveRechazo = origen => 'rechazo:' + createHash('sha256').update(String(origen)).digest('hex');
export async function registrarRechazo(dbRun,{origen,canal,local,nombre,mime,motivo}) {
  const clave=claveRechazo(origen);
  await dbRun(`INSERT INTO facturas_recepciones (clave,hash,canal,local,nombre,mime,estado,error)
    VALUES (?,?,?,?,?,?,'error',?) ON CONFLICT(clave) DO UPDATE SET error=EXCLUDED.error,actualizado=NOW()`,
    [clave,clave,canal,local||null,String(nombre||'documento').slice(0,240),mime||'application/octet-stream',motivo]);
}
