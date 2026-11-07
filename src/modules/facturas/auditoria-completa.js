import {createHash} from 'node:crypto';

export const AUDITORIA_COMPLETA_SCHEMA = `CREATE TABLE IF NOT EXISTS facturas_auditoria_completa (
 id SERIAL PRIMARY KEY,
 factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
 huella TEXT NOT NULL, autor TEXT NOT NULL, fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 comprobaciones JSONB NOT NULL, archivo_nombre TEXT NOT NULL, archivo_ruta TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facturas_auditoria_completa ON facturas_auditoria_completa(factura_id,id DESC);`;

export const COMPROBACIONES = ['original','identidad','fechas','importes','lineas','duplicados','drive'];
const CABECERA = 'id tipo proveedor nif concepto fecha numero_factura local empresa base_imponible porcentaje_iva cuota_iva total iva_desglose vencimiento periodo_facturado drive_url file_hash conciliado_con reparto'.split(' ');
const LINEA = 'id orden descripcion cantidad unidad precio_unitario importe precio_bruto importe_bruto descuento_pct factor_unidad'.split(' ');
function normalizar(v) {
 if(Array.isArray(v))return v.map(normalizar);
 if(v && typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalizar(v[k])]));
 return v ?? null;
}
const NUMEROS=new Set('id orden base_imponible porcentaje_iva cuota_iva total conciliado_con cantidad precio_unitario importe precio_bruto importe_bruto descuento_pct factor_unidad'.split(' '));
function campos(obj,keys) {return Object.fromEntries(keys.map(k=>[k,obj[k]==null?null:NUMEROS.has(k)?Number(obj[k]):obj[k]]));}
export function huellaAuditoria(f,lineas) {
 const cabecera=campos(f,CABECERA);
 if(typeof cabecera.iva_desglose==='string'){try{cabecera.iva_desglose=JSON.parse(cabecera.iva_desglose);}catch{}}
 return createHash('sha256').update(JSON.stringify(normalizar({cabecera,lineas:[...lineas].sort((a,b)=>a.id-b.id).map(l=>campos(l,LINEA))}))).digest('hex');
}
export function validarConfirmacion(body,huella) {
 if(!COMPROBACIONES.every(k=>body.comprobaciones?.[k]===true))throw Object.assign(new Error('Comprueba todos los puntos antes de marcar la revisión completa.'),{status:400});
 if(body.huella!==huella)throw Object.assign(new Error('El documento ha cambiado. Vuelve a abrirlo y revisa los datos actuales.'),{status:409});
 for(const campo of ['archivo_nombre','archivo_ruta'])if(typeof body[campo]!=='string'||!body[campo].trim()||body[campo].length>2000)throw Object.assign(new Error('Indica el nombre y la carpeta de Drive que has comprobado.'),{status:400});
}

export async function cargarDistintivos(rows,dbAll) {
 if(!rows.length)return;
 // Solo recupera líneas de documentos con una auditoría explícita, en una consulta.
 const auditorias=await dbAll(`SELECT DISTINCT ON(a.factura_id) a.*,to_jsonb(f) - 'drive_thumb' AS factura,
 COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM factura_lineas l WHERE l.factura_id=f.id),'[]'::jsonb) AS lineas
 FROM facturas_auditoria_completa a JOIN facturas f ON f.id=a.factura_id
 WHERE a.factura_id=ANY(?::int[]) ORDER BY a.factura_id,a.id DESC`,[rows.map(f=>f.id)]);
 const porId=new Map(auditorias.map(a=>[String(a.factura_id),a]));
 for(const f of rows){const a=porId.get(String(f.id));if(a)f.auditoria_completa={vigente:a.huella===huellaAuditoria(a.factura,a.lineas),autor:a.autor,fecha:a.fecha};}
}

export function registrarAuditoriaCompleta(app,{auth,pool,puedeAccederLocal}) {
 async function leer(client,req){
  const f=(await client.query('SELECT * FROM facturas WHERE id=$1',[req.params.id])).rows[0];
  if(!f)throw Object.assign(new Error('Factura no encontrada'),{status:404});
  if(!puedeAccederLocal(req,f.local))throw Object.assign(new Error('Sin acceso a esta factura'),{status:403});
  const lineas=(await client.query('SELECT * FROM factura_lineas WHERE factura_id=$1 ORDER BY id',[f.id])).rows;
  return {f,huella:huellaAuditoria(f,lineas)};
 }
 app.get('/api/facturas/:id/auditoria-completa',auth,async(req,res)=>{
  try{const {f,huella}=await leer(pool,req);res.json({ok:true,data:{huella,proveedor:f.proveedor,numero:f.numero_factura}});}
  catch(e){res.status(e.status||500).json({ok:false,error:e.message});}
 });
 app.post('/api/facturas/:id/auditoria-completa',auth,async(req,res)=>{
  const client=await pool.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
   const {f,huella}=await leer(client,req);
   validarConfirmacion(req.body,huella);
   if(!f.drive_url)throw Object.assign(new Error('Falta el original guardado en Drive.'),{status:400});
   await client.query(`INSERT INTO facturas_auditoria_completa(factura_id,huella,autor,comprobaciones,archivo_nombre,archivo_ruta) VALUES($1,$2,$3,$4,$5,$6)`,[f.id,huella,String(req.user.username||req.user.nombre||req.user.id),JSON.stringify(req.body.comprobaciones),req.body.archivo_nombre.trim(),req.body.archivo_ruta.trim()]);
   await client.query('COMMIT');res.json({ok:true});
  }catch(e){await client.query('ROLLBACK');res.status(e.status||500).json({ok:false,error:e.message});}
  finally{client.release();}
 });
}
