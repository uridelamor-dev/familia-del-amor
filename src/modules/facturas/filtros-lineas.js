// Mismo conjunto de líneas para avisos, cobertura y correcciones de Productos.
export async function filtrosLineas(query,{locales=[],proveedoresDeCategorias,claveProducto}){
 const condiciones=["COALESCE(f.dup_estado,'') <> 'duda'"],params=[];
 if(locales.length){condiciones.push('f.local = ANY(?)');params.push(locales);}
 for(const [campo,op] of [['from','>='],['to','<=']])if(/^\d{4}-\d{2}-\d{2}$/.test(String(query[campo]||''))){condiciones.push(`f.fecha ${op} ?`);params.push(query[campo]);}
 if(query.proveedor){condiciones.push('LOWER(f.proveedor) = LOWER(?)');params.push(String(query.proveedor).trim());}
 if(query.categoria||query.subcategoria){
  const categorias=String(query.categoria||'').split(',').filter(Boolean),subs=String(query.subcategoria||'').split(',').filter(Boolean);
  condiciones.push('f.proveedor = ANY(?)');params.push(await proveedoresDeCategorias(categorias,subs));
 }
 if(query.q){condiciones.push('l.clave LIKE ?');params.push('%'+claveProducto(query.q)+'%');}
 return {sql:condiciones.join(' AND '),params};
}
