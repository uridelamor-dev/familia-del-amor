import { createHash } from 'node:crypto';
import { claveProveedor } from './categorias.js';

const TABLES = ['facturas', 'facturas_pendientes', 'facturas_proveedor_fichas', 'facturas_proveedor_cats', 'facturas_pago_reglas', 'facturas_proveedor_pago', 'facturas_proveedor_alias', 'inv_proveedores'];
const fingerprint = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const nif = x => String(x || '').replace(/[\s.\-/]/g, '').toUpperCase();
export async function proveedoresUnibles(q) {
  return (await q("SELECT DISTINCT proveedor FROM facturas WHERE proveedor IS NOT NULL AND proveedor<>'' ORDER BY proveedor")).rows.map(x => x.proveedor);
}
export async function prepararUnion(q, origen, destino, elecciones = {}) {
  const a = claveProveedor(origen), b = claveProveedor(destino);
  if (!a || !b || a === b) throw new Error('Elige dos proveedores distintos.');
  const nombres = await proveedoresUnibles(q);
  if (!nombres.includes(origen) || !nombres.includes(destino)) throw new Error('El proveedor ya no existe con ese nombre. Actualiza la lista.');
  const pertenece = n => [a,b].includes(claveProveedor(n));
  const snapshot = {};
  for (const table of TABLES) {
    const rows = (await q(`SELECT * FROM ${table}`)).rows;
    snapshot[table] = rows.filter(r => table === 'inv_proveedores' ? pertenece(r.factura_proveedor) :
      table === 'facturas_proveedor_alias' ? [a,b].includes(r.clave) || pertenece(r.proveedor) :
      table === 'facturas_proveedor_fichas' ? [a,b].includes(r.clave) :
      r.prov_clave ? [a,b].includes(r.prov_clave) : pertenece(r.proveedor))
      .sort((x,y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  }
  const conflictos = [];
  const elegir = (id, etiqueta, source, target) => {
    const vacio = x => x == null || x === '' || Array.isArray(x) && !x.length;
    if (vacio(source)) return target;
    if (vacio(target) || JSON.stringify(source) === JSON.stringify(target)) return source;
    conflictos.push({id, etiqueta, origen: source, destino: target});
    return elecciones[id] === 'origen' ? source : target;
  };
  const fichas = snapshot.facturas_proveedor_fichas;
  const sa = fichas.find(r=>r.clave===a)?.datos || {}, sb = fichas.find(r=>r.clave===b)?.datos || {};
  const datos = {};
  for (const key of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (key === 'condiciones') {
      const locales = new Set([...(sa[key]||[]), ...(sb[key]||[])].map(c=>c.local));
      datos[key] = [...locales].map(local=>elegir('local:'+local,'Pedidos y entregas · '+local,sa[key]?.find(c=>c.local===local),sb[key]?.find(c=>c.local===local)));
    } else datos[key] = elegir('ficha:'+key,key.replaceAll('_',' '),sa[key],sb[key]);
  }
  const cats = k => snapshot.facturas_proveedor_cats.filter(r=>r.prov_clave===k).map(r=>({categoria:r.categoria,subcategoria:r.subcategoria||''})).sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
  const categorias = elegir('categorias','Categorías',cats(a),cats(b));
  const reglas = [];
  const rs = snapshot.facturas_pago_reglas;
  const valor = r => r && Object.fromEntries(['modo','dias','dia_pago','meses_despues','domiciliado'].map(k=>[k,r[k]]));
  for (const empresa of new Set(rs.map(r=>r.empresa))) reglas.push({empresa,...elegir('pago:'+empresa,'Pago · '+(empresa||'Regla general'),valor(rs.find(r=>r.prov_clave===a&&r.empresa===empresa)),valor(rs.find(r=>r.prov_clave===b&&r.empresa===empresa)))});
  const legacy = k => snapshot.facturas_proveedor_pago.find(r=>r.prov_clave===k);
  const pago = elegir('pago:legacy','Condiciones de pago anteriores',valor(legacy(a)),valor(legacy(b)));
  const nifs = [...new Set([...snapshot.facturas,...snapshot.facturas_pendientes].map(r=>nif(r.nif)).filter(Boolean))];
  if (nifs.length > 1) conflictos.push({id:'nifs',etiqueta:'NIF diferentes: confirma que pertenecen al mismo proveedor. Se conservarán los NIF originales de cada factura.',origen:nifs,destino:nifs});
  const faltan = conflictos.filter(c=>!['origen','destino'].includes(elecciones[c.id])).map(c=>c.id);
  return {origen,destino,a,b,snapshot,revision:fingerprint(snapshot),conflictos,faltan,datos,categorias,reglas,pago,nifs,
    facturas:snapshot.facturas.length,pendientes:snapshot.facturas_pendientes.length};
}
export function resumenUnion(p) {
  return {origen:p.origen,destino:p.destino,revision:p.revision,conflictos:p.conflictos,facturas:p.facturas,pendientes:p.pendientes};
}
export async function ejecutarUnion(q, body, autor) {
  // Bloqueo corto: impide que una edición concurrente quede fuera de la revisión confirmada.
  await q(`LOCK TABLE ${TABLES.join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
  const p = await prepararUnion(q,body.origen,body.destino,body.elecciones);
  if (p.revision !== body.revision) throw new Error('Los datos han cambiado. Revisa de nuevo la unión antes de confirmar.');
  if (p.faltan.length) throw new Error('Resuelve todas las diferencias antes de unir.');
  const stamp = new Date().toISOString();
  await q("INSERT INTO config(key,value) VALUES ($1,$2)", ['proveedores_union_'+Date.now()+'_'+p.revision.slice(0,12),JSON.stringify({autor,fecha:stamp,...p})]);
  const nombres = [...new Set([...p.snapshot.facturas,...p.snapshot.facturas_pendientes].map(r=>r.proveedor))];
  await q('UPDATE facturas SET proveedor=$1,sheet_synced=0 WHERE proveedor=ANY($2)',[p.destino,nombres]);
  await q('UPDATE facturas_pendientes SET proveedor=$1 WHERE proveedor=ANY($2)',[p.destino,nombres]);
  await q('UPDATE inv_proveedores SET factura_proveedor=$1 WHERE factura_proveedor=ANY($2)',[p.destino,[...nombres,...p.snapshot.inv_proveedores.map(r=>r.factura_proveedor)]]);
  await q(`INSERT INTO facturas_proveedor_fichas(clave,datos) VALUES ($1,$2::jsonb) ON CONFLICT(clave) DO UPDATE SET datos=excluded.datos,version=facturas_proveedor_fichas.version+1,actualizado=NOW()`,[p.b,JSON.stringify(p.datos)]);
  await q('DELETE FROM facturas_proveedor_fichas WHERE clave=$1',[p.a]);
  await q('DELETE FROM facturas_proveedor_cats WHERE prov_clave=ANY($1)',[[p.a,p.b]]);
  for(const c of p.categorias) await q('INSERT INTO facturas_proveedor_cats(prov_clave,proveedor,categoria,subcategoria,creado_en) VALUES ($1,$2,$3,$4,$5)',[p.b,p.destino,c.categoria,c.subcategoria,stamp]);
  await q('DELETE FROM facturas_pago_reglas WHERE prov_clave=ANY($1)',[[p.a,p.b]]);
  for(const r of p.reglas) await q('INSERT INTO facturas_pago_reglas(prov_clave,proveedor,empresa,modo,dias,dia_pago,meses_despues,domiciliado,actualizado_por,actualizado_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[p.b,p.destino,r.empresa,r.modo,r.dias,r.dia_pago,r.meses_despues,r.domiciliado,autor,stamp]);
  // La tabla antigua se mantiene por compatibilidad con instalaciones anteriores.
  await q('DELETE FROM facturas_proveedor_pago WHERE prov_clave=ANY($1)',[[p.a,p.b]]);
  if(p.pago) await q('INSERT INTO facturas_proveedor_pago(prov_clave,proveedor,dias,dia_pago,modo,meses_despues,domiciliado,actualizado_por,actualizado_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[p.b,p.destino,p.pago.dias,p.pago.dia_pago,p.pago.modo,p.pago.meses_despues,p.pago.domiciliado,autor,stamp]);
  for(const r of p.snapshot.facturas_proveedor_alias) await q('UPDATE facturas_proveedor_alias SET proveedor=$1 WHERE clave=$2',[p.destino,r.clave]);
  // Con NIF contradictorios se aprende por nombre, sin extender la unión a otras empresas.
  const anchor = p.nifs.length === 1 ? p.nifs[0] : null;
  for(const key of new Set([p.a,p.b,...nombres.map(claveProveedor)])) await q(`INSERT INTO facturas_proveedor_alias(clave,nif,proveedor,autor,creado_en) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(clave) DO UPDATE SET proveedor=excluded.proveedor,nif=excluded.nif,autor=excluded.autor`,[key,anchor,p.destino,autor,stamp]);
  await q("INSERT INTO config(key,value) VALUES ('facturas_anuales_reintentar',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[stamp]);
  return resumenUnion(p);
}
