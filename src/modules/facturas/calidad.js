// Señales de revisión, nunca correcciones automáticas ni una prueba de duplicidad.
const limpio = v => String(v ?? '').normalize('NFKC').trim().toLocaleLowerCase('es');
export function fechaValida(value) {
  const s = String(value ?? '').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T12:00:00Z')) && new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
}
export function revisarFacturas(rows, hoy) {
  const grupos=new Map();
  const clave=f => {
    const numero=limpio(f.numero_factura), proveedor=limpio(f.nif || f.proveedor);
    if(!numero || !proveedor || !fechaValida(f.fecha)) return null;
    return JSON.stringify([proveedor,numero,limpio(f.local),String(f.fecha).slice(0,4),f.tipo || 'factura']);
  };
  for(const f of rows) { const k=clave(f); if(k) grupos.set(k,(grupos.get(k)||0)+1); }
  return rows.map(f=> {
    const avisos=[];
    if(!fechaValida(f.fecha)) avisos.push('Fecha pendiente de verificar');
    else if(String(f.fecha).slice(0,10)>hoy) avisos.push('Fecha futura');
    if(!limpio(f.local)) avisos.push('Falta asignar local');
    if(f.total===null || f.total===undefined || f.total==='' || !Number.isFinite(Number(f.total))) avisos.push('Importe no disponible');
    else if(Number(f.total)===0) avisos.push('Importe cero: comprobar original');
    if(f.lineas_estado==='descuadre' || f.revisar) avisos.push('Lectura pendiente de revisión');
    if((grupos.get(clave(f)) || 0)>1) avisos.push('Mismo proveedor y número en esta lista');
    return {...f, calidad:avisos};
  });
}
