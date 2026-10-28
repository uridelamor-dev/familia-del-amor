import {createHash} from 'node:crypto';
import {normalizarTexto, normalizarNif} from './asignacion.js';
import {nifValido} from './emisor.js';

export const PREFIJO_MEMORIA='contabilidad_local_';
export function prepararReglaLocal(f,locales,autor){
 const nif=normalizarNif(f.nif),empresa=String(f.empresa||'').trim();
 if(!nifValido(nif)||!empresa||!f.proveedor)throw Error('Para recordar el local, completa proveedor, CIF válido y empresa.');
 const destino=locales.find(l=>(l.local===f.local||l.local_contable===f.local)&&normalizarTexto(l.empresa)===normalizarTexto(empresa));
 if(!destino)throw Error('El local debe pertenecer a la empresa indicada. Revisa la configuración de establecimientos.');
 const clave=PREFIJO_MEMORIA+createHash('sha256').update(JSON.stringify([nif,normalizarTexto(empresa)])).digest('hex');
 return {clave,nif,proveedor:f.proveedor,empresa:destino.empresa,local:destino.local,activo:true,autor,actualizado:new Date().toISOString()};
}
export async function guardarReglaLocal(dbRun,regla){
 await dbRun(`INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,[regla.clave,JSON.stringify(regla)]);
}
export async function reglasLocales(dbAll){
 const rows=await dbAll('SELECT key,value FROM config WHERE key LIKE ?',[PREFIJO_MEMORIA+'%']);
 return rows.flatMap(r=>{try{const d=JSON.parse(r.value);return [{...d,clave:r.key,revision:r.value}];}catch{return [];}});
}
export function aplicarReglaLocal(datos,empresa,reglas,locales){
 const nif=normalizarNif(datos.nif_proveedor);
 if(!nifValido(nif)||!empresa)return null;
 const matches=reglas.filter(r=>r.activo&&r.nif===nif&&normalizarTexto(r.empresa)===normalizarTexto(empresa));
 if(matches.length!==1)return null;
 const r=matches[0];
 // No aplicar una regla obsoleta si el establecimiento cambió de empresa.
 const destino=locales.find(l=>l.local===r.local&&normalizarTexto(l.empresa)===normalizarTexto(empresa));
 return destino?destino.local:null;
}

export function registrarMemoria(app,{auth,dbAll,dbGet,dbRun,global,locales}){
 const acceso=(req,res)=>{if(!global(req)){res.status(403).json({error:'Las reglas compartidas requieren acceso a todos los locales.'});return false;}return true;};
 app.get('/api/facturas/memoria',auth,async(req,res)=>{
  if(!acceso(req,res))return;
  try{
   const [local,proveedores,categorias,productos,catalogoProductos]=await Promise.all([
    reglasLocales(dbAll),dbAll('SELECT clave,nif,proveedor,autor,creado_en FROM facturas_proveedor_alias ORDER BY proveedor,clave'),
    dbAll('SELECT prov_clave,proveedor,categoria,subcategoria FROM facturas_proveedor_cats ORDER BY proveedor'),
    dbAll(`SELECT a.clave,a.producto_id,a.descripcion,a.confirmado_por,a.confirmado_en,a.descartado,p.nombre FROM producto_alias a LEFT JOIN productos_canonicos p ON p.id=a.producto_id ORDER BY a.descripcion`),dbAll('SELECT id,nombre FROM productos_canonicos ORDER BY nombre')
   ]);
   res.json({ok:true,local,proveedores,categorias,productos,catalogoProductos,locales:await locales()});
  }catch{res.status(500).json({error:'No se pudieron cargar las reglas.'});}
 });
 app.put('/api/facturas/memoria/proveedor',auth,async(req,res)=>{
  if(!acceso(req,res))return;
  try{
   const {clave,proveedor,revision}=req.body;
   if(typeof clave!=='string'||typeof proveedor!=='string'||!proveedor.trim())throw Error('Selecciona el proveedor correcto.');
   const anterior=await dbGet('SELECT clave,nif,proveedor,autor,creado_en FROM facturas_proveedor_alias WHERE clave=?',[clave]);
   if(!anterior||JSON.stringify(anterior)!==revision)return res.status(409).json({error:'La regla cambió. Actualiza la lista.'});
   const existe=await dbGet('SELECT proveedor FROM facturas WHERE proveedor=? LIMIT 1',[proveedor]);
   if(!existe)throw Error('Ese proveedor ya no existe. Actualiza la lista.');
   const nif=normalizarNif(req.body.nif);
   if(nif&&!nifValido(nif))throw Error('Revisa el CIF. Puedes dejarlo vacío si no está confirmado.');
   const updated=await dbRun("UPDATE facturas_proveedor_alias SET proveedor=?,nif=?,autor=?,creado_en=? WHERE clave=? AND proveedor=? AND COALESCE(nif,'')=? AND autor IS NOT DISTINCT FROM ? AND creado_en IS NOT DISTINCT FROM ? RETURNING clave",[proveedor,nif||null,req.user.nombre||req.user.username,new Date().toISOString(),clave,anterior.proveedor,anterior.nif||'',anterior.autor,anterior.creado_en]);
   if(!updated)return res.status(409).json({error:'La regla cambió. Actualiza la lista.'});
   res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
 });
 app.put('/api/facturas/memoria/local',auth,async(req,res)=>{
  if(!acceso(req,res))return;
  try{
   const {clave,revision}=req.body;
   if(typeof clave!=='string'||!new RegExp('^'+PREFIJO_MEMORIA+'[a-f0-9]{64}$').test(clave))throw Error('Regla no válida');
   const anterior=await dbGet('SELECT value FROM config WHERE key=?',[clave]);
   if(!anterior||anterior.value!==revision)return res.status(409).json({error:'La regla cambió. Actualiza la lista.'});
   const r=JSON.parse(anterior.value);
   if(typeof req.body.activo!=='boolean')throw Error('Indica si la regla está activa.');
   const nueva=req.body.activo?{...prepararReglaLocal({...r,nif:r.nif,local:req.body.local},await locales(),req.user.nombre||req.user.username),activo:true}:{...r,activo:false,autor:req.user.nombre||req.user.username,actualizado:new Date().toISOString()};
   const updated=await dbRun('UPDATE config SET value=? WHERE key=? AND value=? RETURNING key',[JSON.stringify(nueva),clave,revision]);
   if(!updated)return res.status(409).json({error:'La regla cambió. Actualiza la lista.'});
   res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
 });
}
