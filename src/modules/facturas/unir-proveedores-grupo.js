import {TABLES,fingerprint,aplicarUnion} from './unir-proveedores.js';
import {claveProveedor} from './categorias.js';
const empty=v=>v==null||v===''||Array.isArray(v)&&!v.length;
export async function prepararUnionGrupo(q,nombres,elecciones={}){
 if(!Array.isArray(nombres)||nombres.length<2||nombres.length>50||nombres.some(n=>typeof n!=='string'||!n.trim()))throw Error('Selecciona entre 2 y 50 proveedores.');
 nombres=[...new Set(nombres)].sort();
 const claves=nombres.map(claveProveedor);
 if(nombres.length<2||new Set(claves).size!==nombres.length)throw Error('Hay nombres equivalentes en la selección. Selecciona una ficha por proveedor.');
 const snapshot={};
 for(const table of TABLES){
  snapshot[table]=(await q(`SELECT * FROM ${table}`)).rows.filter(r=>table==='inv_proveedores'?claves.includes(claveProveedor(r.factura_proveedor)):table==='facturas_proveedor_alias'?claves.includes(r.clave)||claves.includes(claveProveedor(r.proveedor)):table==='facturas_proveedor_fichas'?claves.includes(r.clave):r.prov_clave?claves.includes(r.prov_clave):claves.includes(claveProveedor(r.proveedor))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 }
 if(nombres.some(n=>!snapshot.facturas.some(f=>claveProveedor(f.proveedor)===claveProveedor(n))))throw Error('Un proveedor ya no está disponible. Actualiza la lista.');
 const campos=[],faltan=[];
 const elegir=(id,etiqueta,values)=>{
  const opciones=[];
  values.forEach((valor,i)=>{if(!empty(valor)&&!opciones.some(o=>JSON.stringify(o.valor)===JSON.stringify(valor)))opciones.push({proveedor:nombres[i],valor});});
  if(!opciones.length)return undefined;
  campos.push({id,etiqueta,opciones});
  if(opciones.length===1)return opciones[0].valor;
  const choice=opciones.find(o=>o.proveedor===elecciones[id]);
  if(!choice)faltan.push(id);
  return (choice||opciones[0]).valor;
 };
 const destino=elegir('nombre','Nombre del proveedor',nombres);
 const fichas=claves.map(k=>snapshot.facturas_proveedor_fichas.find(r=>r.clave===k)?.datos||{}),datos={};
 for(const key of new Set(fichas.flatMap(Object.keys))){
  if(key==='condiciones'){
   datos.condiciones=[...new Set(fichas.flatMap(f=>f.condiciones||[]).map(c=>c.local))].map(local=>elegir('local:'+local,'Pedidos y entregas · '+local,fichas.map(f=>f.condiciones?.find(c=>c.local===local))));
  }else datos[key]=elegir('ficha:'+key,key.replaceAll('_',' '),fichas.map(f=>f[key]));
 }
 const categorias=elegir('categorias','Categorías',claves.map(k=>snapshot.facturas_proveedor_cats.filter(r=>r.prov_clave===k).map(r=>({categoria:r.categoria,subcategoria:r.subcategoria||''})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))))||[];
 const pagoVal=r=>r&&Object.fromEntries(['modo','dias','dia_pago','meses_despues','domiciliado'].map(k=>[k,r[k]]));
 const reglas=[...new Set(snapshot.facturas_pago_reglas.map(r=>r.empresa))].map(empresa=>({empresa,...elegir('pago:'+empresa,'Pago · '+(empresa||'General'),claves.map(k=>pagoVal(snapshot.facturas_pago_reglas.find(r=>r.prov_clave===k&&r.empresa===empresa))))}));
 const pago=elegir('pago:legacy','Condiciones anteriores',claves.map(k=>pagoVal(snapshot.facturas_proveedor_pago.find(r=>r.prov_clave===k))));
 const nifs=[...new Set([...snapshot.facturas,...snapshot.facturas_pendientes].map(r=>String(r.nif||'').replace(/[\s.\-/]/g,'').toUpperCase()).filter(Boolean))];
 if(nifs.length>1&&elecciones.nifs!==true)faltan.push('nifs');
 return {nombres,destino,b:claveProveedor(destino),origen:nombres.filter(n=>n!==destino).join(', '),origenClaves:claves.filter(k=>k!==claveProveedor(destino)),snapshot,revision:fingerprint(snapshot),campos,conflictos:campos.filter(c=>c.opciones.length>1),faltan,datos,categorias,reglas,pago,nifs,facturas:snapshot.facturas.length,pendientes:snapshot.facturas_pendientes.length};
}
export function resumenGrupo(p){return {nombres:p.nombres,revision:p.revision,campos:p.campos,nifs:p.nifs,facturas:p.facturas,pendientes:p.pendientes};}
export async function ejecutarUnionGrupo(q,body,autor){
 await q(`LOCK TABLE ${TABLES.join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
 const p=await prepararUnionGrupo(q,body.nombres,body.elecciones);
 if(body.revision!==p.revision)throw Error('Los datos han cambiado. Revisa de nuevo los proveedores.');
 if(p.faltan.length)throw Error('Elige qué datos conservar en todas las diferencias.');
 await aplicarUnion(q,p,autor);return {destino:p.destino,unidos:p.nombres.length};
}
