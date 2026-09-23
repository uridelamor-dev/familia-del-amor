import {validarReceta,calcularReceta} from './coste.js';

// Dependencias explícitas: consultas, autenticación y ámbito conservan las reglas del panel.
export function registrarEscandallos(app, {auth,scope,dbAll,dbGet,pool,albaranContado,hoy}) {
  const wrap = fn => async(req,res) => {
    try {
      const ambito=scope(req);
      if(!ambito) return res.status(403).json({ok:false,error:'Elige un establecimiento al que tengas acceso.'});
      res.setHeader('Cache-Control','private, no-store');
      await fn(req,res,ambito);
    } catch(e) { console.error('[escandallos]',e.code||'error'); res.status(500).json({ok:false,error:'No se pudo completar la operación del escandallo.'}); }
  };
  async function fuentes(ambito,{claves=null,q=''}={}) {
    if(claves && !claves.length) return [];
    // La última compra válida del MISMO proveedor y formato. No sustituir kg por cajas.
    return dbAll(`SELECT DISTINCT ON (l.clave,f.proveedor,l.unidad)
      l.clave,f.proveedor,l.unidad AS unidad_compra,l.descripcion AS nombre,
      (l.importe/l.cantidad)::float AS precio,f.fecha,f.id AS factura_id
      FROM factura_lineas l JOIN facturas f ON f.id=l.factura_id
      WHERE f.local = ANY(?) AND f.fecha <= ? AND f.fecha ~ '^\\d{4}-\\d{2}-\\d{2}$'
        AND COALESCE(f.dup_estado,'') <> 'duda' AND NOT l.dudosa
        AND COALESCE(f.tipo,'factura') IN ('factura','albaran','ticket')
        AND COALESCE(l.clave,'') <> '' AND COALESCE(f.proveedor,'') <> '' AND COALESCE(l.unidad,'') <> ''
        AND l.cantidad > 0 AND l.importe > 0
        AND NOT EXISTS(SELECT 1 FROM producto_alias a WHERE a.clave=l.clave AND a.descartado)
        AND NOT ${albaranContado}
        ${claves?'AND l.clave = ANY(?)':'AND l.descripcion ILIKE ?'}
      ORDER BY l.clave,f.proveedor,l.unidad,f.fecha DESC,l.id DESC ${claves?'':'LIMIT 501'}`,
      [ambito.locales,hoy(),claves || '%'+String(q).slice(0,100)+'%']);
  }
  app.get('/api/escandallos/fuentes',auth,wrap(async(req,res,ambito)=>{
    const data=await fuentes(ambito,{q:req.query.q});
    res.json({ok:true,data:data.slice(0,500),limitado:data.length>500});
  }));
  app.get('/api/escandallos',auth,wrap(async(req,res,ambito)=>{
    const filas=await dbAll('SELECT * FROM esc_recetas WHERE local = ? AND activo = ? ORDER BY nombre,id',[ambito.local,req.query.archivadas==='1'?false:true]);
    const precios=await fuentes(ambito,{claves:[...new Set(filas.flatMap(r=>r.ingredientes.map(i=>i.clave)))]});
    res.json({ok:true,local:ambito.local,data:filas.map(r=>({...r,calculo:calcularReceta(r,precios)}))});
  }));
  app.post('/api/escandallos',auth,wrap(async(req,res,ambito)=>{
    const v=validarReceta(req.body);
    if(!v.ok) return res.status(400).json({ok:false,error:v.errores.join(' ')});
    await guardar(req,res,ambito,v.datos);
  }));
  app.put('/api/escandallos/:id',auth,wrap(async(req,res,ambito)=>{
    const v=validarReceta(req.body);
    if(!v.ok) return res.status(400).json({ok:false,error:v.errores.join(' ')});
    await guardar(req,res,ambito,v.datos);
  }));
  app.get('/api/escandallos/:id/versiones',auth,wrap(async(req,res,ambito)=>{
    const receta=await dbGet('SELECT id FROM esc_recetas WHERE id = ? AND local = ?',[Number(req.params.id)||0,ambito.local]);
    if(!receta) return res.status(404).json({ok:false,error:'Escandallo no encontrado.'});
    const data=await dbAll('SELECT version,datos,autor,creado_en FROM esc_versiones WHERE receta_id = ? ORDER BY version DESC',[receta.id]);
    res.json({ok:true,data});
  }));
  app.post('/api/escandallos/:id/estado',auth,wrap(async(req,res,ambito)=>{
    if(typeof req.body.activo!=='boolean') return res.status(400).json({ok:false,error:'Estado inválido.'});
    await guardar(req,res,ambito,null,req.body.activo);
  }));
  async function guardar(req,res,ambito,datos,activo) {
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      let fila;
      if(req.params.id) {
        const old=(await c.query('SELECT * FROM esc_recetas WHERE id=$1 AND local=$2 FOR UPDATE',[Number(req.params.id)||0,ambito.local])).rows[0];
        if(!old) {await c.query('ROLLBACK');return res.status(404).json({ok:false,error:'Escandallo no encontrado.'});}
        if(Number(req.body.version)!==old.version) {await c.query('ROLLBACK');return res.status(409).json({ok:false,error:'Otra persona ha cambiado esta receta. Recarga antes de guardar.'});}
        const d=datos||old;
        fila=(await c.query(`UPDATE esc_recetas SET nombre=$1,raciones=$2,pvp=$3,iva=$4,ingredientes=$5,
          activo=$6,version=version+1,actualizado_por=$7,actualizado_en=NOW() WHERE id=$8 RETURNING *`,
          [d.nombre,d.raciones,d.pvp,d.iva,JSON.stringify(d.ingredientes),activo??old.activo,req.user.username,old.id])).rows[0];
      } else {
        const d=datos;
        fila=(await c.query(`INSERT INTO esc_recetas(local,nombre,raciones,pvp,iva,ingredientes,creado_por,actualizado_por)
          VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,[ambito.local,d.nombre,d.raciones,d.pvp,d.iva,JSON.stringify(d.ingredientes),req.user.username])).rows[0];
      }
      await c.query('INSERT INTO esc_versiones(receta_id,version,datos,autor) VALUES($1,$2,$3,$4)',[fila.id,fila.version,JSON.stringify(fila),req.user.username]);
      await c.query('COMMIT');
      res.json({ok:true,receta:fila});
    } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
  }
}
