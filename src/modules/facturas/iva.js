export const IVA_SCHEMA = `
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_desglose TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_estado TEXT NOT NULL DEFAULT 'pendiente';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_aviso TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_intentos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_intento_en TIMESTAMPTZ;
ALTER TABLE facturas_pendientes ADD COLUMN IF NOT EXISTS iva_desglose TEXT;
`;
const numero=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
const cents=v=>Math.round(Number(v)*100);
export function validarIva(raw,f) {
 let partes=raw;
 try {if(typeof partes==='string')partes=JSON.parse(partes);}catch{partes=null;}
 const mal=aviso=>({ok:false,partes:[],aviso});
 if(!Array.isArray(partes)||!partes.length)return mal('Falta identificar las bases y cuotas de IVA del original.');
 const grupos=new Map();
 for(const p of partes){
  if(!p||!['base','tipo','cuota'].every(k=>numero(p[k])))return mal('Hay importes de IVA sin identificar.');
  const base=Number(p.base),tipo=Number(p.tipo),cuota=Number(p.cuota);
  if(tipo<0||tipo>100||Math.abs(cents(base*tipo/100)-cents(cuota))>2)return mal('Una cuota no coincide con su base y tipo de IVA.');
  const g=grupos.get(tipo)||{base:0,tipo,cuota:0};g.base+=cents(base);g.cuota+=cents(cuota);grupos.set(tipo,g);
 }
 const salida=[...grupos.values()].sort((a,b)=>a.tipo-b.tipo).map(g=>({...g,base:g.base/100,cuota:g.cuota/100}));
 const base=salida.reduce((n,p)=>n+cents(p.base),0),cuota=salida.reduce((n,p)=>n+cents(p.cuota),0);
 if(!['base_imponible','cuota_iva','total'].every(k=>numero(f[k])))return mal('Faltan totales para comprobar el desglose.');
 if(base!==cents(f.base_imponible)||cuota!==cents(f.cuota_iva)||base+cuota!==cents(f.total))
  return mal('El desglose de IVA no coincide con los importes guardados. Revisa el original: puede incluir otros impuestos o retenciones.');
 return {ok:true,partes:salida,aviso:null};
}
// No altera la cabecera ni las correcciones del usuario durante la relectura.
export async function guardarIvaLeido(deps,f,raw) {
 const v=validarIva(raw,f);
 await deps.dbRun(`UPDATE facturas SET iva_desglose = ?, iva_estado = ?, iva_aviso = ?, sheet_synced = 0
 WHERE id = ? AND iva_estado <> 'manual' AND ROW(base_imponible,cuota_iva,total,drive_url,iva_desglose)
 IS NOT DISTINCT FROM ROW(?,?,?,?,?)`,[JSON.stringify(v.ok?v.partes:raw??null),v.ok?'ok':'revisar',v.aviso,f.id,f.base_imponible,f.cuota_iva,f.total,f.drive_url,f.iva_desglose??null]);
 return v;
}
let activo=false;
export async function repasarIva(deps,leer) {
 if(activo)return;activo=true;
 try {
  const filas=await deps.dbAll(`SELECT * FROM facturas WHERE iva_estado IN ('pendiente','error') AND iva_intentos < 3
   AND tipo IN ('factura','ticket') AND COALESCE(drive_url,'') <> ''
   AND (iva_intento_en IS NULL OR iva_intento_en < CURRENT_TIMESTAMP - INTERVAL '15 minutes')
   ORDER BY iva_intento_en ASC NULLS FIRST,id LIMIT 2`);
  for(const f of filas){
   // Reclamo persistente evita duplicar la lectura entre procesos y permite recuperarla al reiniciar.
   const claim=await deps.dbRun(`UPDATE facturas SET iva_intentos=iva_intentos+1,iva_intento_en=CURRENT_TIMESTAMP,iva_estado='error',iva_aviso='Relectura de IVA pendiente de completar.'
    WHERE id=? AND iva_estado IN ('pendiente','error') AND iva_intentos=?
    AND (iva_intento_en IS NULL OR iva_intento_en < CURRENT_TIMESTAMP - INTERVAL '15 minutes') RETURNING id`,[f.id,f.iva_intentos]);
   if(!claim?.id)continue;
   try {await guardarIvaLeido(deps,f,await leer(f));}
   catch(e){await deps.dbRun("UPDATE facturas SET iva_estado='error',iva_aviso=? WHERE id=? AND iva_estado IN ('pendiente','error')",['No se pudo releer el IVA del original. '+String(e.message).slice(0,200),f.id]);}
  }
 }finally{activo=false;}
}
