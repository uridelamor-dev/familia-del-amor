import {leerCargosBase} from './cargos-base.js';
import {recordarProveedorRevision} from './aprendizaje-revision.js';
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
 const cargos=leerCargosBase(f.cargos_base);if(cargos.length)cabecera.cargos_base=cargos;
 if(f.lineas_iva_incluido===true)cabecera.lineas_iva_incluido=true;
 for(const k of ['recargo_equivalencia','retencion','otros_cargos'])if(Number(f[k]))cabecera[k]=Number(f[k]);
 if(typeof cabecera.iva_desglose==='string'){try{cabecera.iva_desglose=JSON.parse(cabecera.iva_desglose);}catch{}}
 return createHash('sha256').update(JSON.stringify(normalizar({cabecera,lineas:[...lineas].sort((a,b)=>a.id-b.id).map(l=>campos(l,LINEA))}))).digest('hex');
}
// Declaración manual ligada a la misma huella que el resto de la auditoría.
// No convierte referencias de albaranes en productos ni modifica el resultado OCR.
export function validarDetalleResumen(detalle,f,lineas) {
 if(detalle==null)return null;
 if(detalle.tipo!=='resumen_albaranes' || detalle.confirmado_original!==true
   || f?.tipo!=='factura' || !Array.isArray(lineas) || lineas.length || leerCargosBase(f.cargos_base).length
   || typeof detalle.referencias!=='string' || !detalle.referencias.trim() || detalle.referencias.length>2000)
  throw Object.assign(new Error('El resumen requiere una factura sin productos, referencias del original y confirmación expresa.'),{status:400});
 return {tipo:'resumen_albaranes',confirmado_original:true,referencias:detalle.referencias.trim()};
}
export function resumenDocumentalVigente(f) {
 return f?.auditoria_completa?.vigente===true
   && f.auditoria_completa.detalle_documento?.tipo==='resumen_albaranes'
   && f.auditoria_completa.detalle_documento.confirmado_original===true;
}
export function validarConfirmacion(body,huella,documento={}) {
 if(!COMPROBACIONES.every(k=>body.comprobaciones?.[k]===true))throw Object.assign(new Error('Comprueba todos los puntos antes de marcar la revisión completa.'),{status:400});
 if(body.huella!==huella)throw Object.assign(new Error('El documento ha cambiado. Vuelve a abrirlo y revisa los datos actuales.'),{status:409});
 validarDetalleResumen(body.comprobaciones?.detalle_documento,documento.f,documento.lineas);
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
 for(const f of rows){
  // Nunca reutilizar una clasificación de una respuesta anterior sin recotejarla.
  delete f.auditoria_completa;
  const a=porId.get(String(f.id));if(!a)continue;
  const vigente=a.huella===huellaAuditoria(a.factura,a.lineas);
  f.auditoria_completa={vigente,autor:a.autor,fecha:a.fecha};
  if(vigente){
   try{
    const comprobaciones=typeof a.comprobaciones==='string'?JSON.parse(a.comprobaciones):a.comprobaciones;
    const detalle=validarDetalleResumen(comprobaciones?.detalle_documento,a.factura,a.lineas);
    if(detalle)f.auditoria_completa.detalle_documento=detalle;
   }catch{} // Declaraciones antiguas o inválidas no conceden una excepción.
  }
 }
}

export function registrarAuditoriaCompleta(app,{auth,pool,puedeAccederLocal}) {
 async function leer(client,req){
  const f=(await client.query('SELECT * FROM facturas WHERE id=$1',[req.params.id])).rows[0];
  if(!f)throw Object.assign(new Error('Factura no encontrada'),{status:404});
  if(!puedeAccederLocal(req,f.local))throw Object.assign(new Error('Sin acceso a esta factura'),{status:403});
  const lineas=(await client.query('SELECT * FROM factura_lineas WHERE factura_id=$1 ORDER BY id',[f.id])).rows;
  return {f,lineas,huella:huellaAuditoria(f,lineas)};
 }
 app.get('/api/facturas/:id/auditoria-completa',auth,async(req,res)=>{
  try{const {f,lineas,huella}=await leer(pool,req);res.json({ok:true,data:{huella,proveedor:f.proveedor,numero:f.numero_factura,permite_resumen:f.tipo==='factura'&&lineas.length===0&&leerCargosBase(f.cargos_base).length===0}});}
  catch(e){res.status(e.status||500).json({ok:false,error:e.message});}
 });
 app.post('/api/facturas/:id/auditoria-completa',auth,async(req,res)=>{
  const client=await pool.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
   const {f,lineas,huella}=await leer(client,req);
   validarConfirmacion(req.body,huella,{f,lineas});
   if(!f.drive_url)throw Object.assign(new Error('Falta el original guardado en Drive.'),{status:400});
   await client.query(`INSERT INTO facturas_auditoria_completa(factura_id,huella,autor,comprobaciones,archivo_nombre,archivo_ruta) VALUES($1,$2,$3,$4,$5,$6)`,[f.id,huella,String(req.user.username||req.user.nombre||req.user.id),JSON.stringify(req.body.comprobaciones),req.body.archivo_nombre.trim(),req.body.archivo_ruta.trim()]);
   await recordarProveedorRevision((sql,p)=>client.query(sql,p),f,String(req.user.username||req.user.nombre||req.user.id));
   await client.query('COMMIT');res.json({ok:true});
  }catch(e){await client.query('ROLLBACK');res.status(e.status||500).json({ok:false,error:e.message});}
  finally{client.release();}
 });
}
