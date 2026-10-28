// Utilidades compartidas por la revisión del lote y sus pruebas.
export function nombreLote(mes,nombre){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(mes))throw Error('Selecciona el mes y año.');
 const n=String(nombre||'').replace(/[\\/<>:"|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
 if(!n)throw Error('Selecciona un trabajador.');
 return `${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][Number(mes.slice(5))-1]} ${mes.slice(0,4)} - ${n}.pdf`;
}
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function buscarTrabajadores(workers,query,candidatos=[]){
 const tokens=normal(query).trim().split(/\s+/);
 const sugeridos=new Set(candidatos.map(String));
 return workers.filter(w=>tokens.every(t=>normal(`${w.nombre} ${w.local||''}`).includes(t))).sort((a,b)=>Number(sugeridos.has(String(b.id)))-Number(sugeridos.has(String(a.id)))||a.nombre.localeCompare(b.nombre,'es'));
}
export function renombrarLote(docs,workers,mes){
 nombreLote(mes,'validar');
 let cambiados=0,pendientes=0;
 for(const d of docs.filter(d=>d.seleccionado)){
  d.mes=mes;d.autoNombre=true;
  const w=workers.find(w=>String(w.id)===String(d.worker_id));
  if(w){d.nombre=nombreLote(mes,w.nombre);cambiados++;}else pendientes++;
 }
 return {cambiados,pendientes};
}
export function erroresRevision(docs,workers){
 const ids=new Set(workers.map(w=>String(w.id))),errores=[];
 docs.forEach((d,i)=>{
  if(!d.seleccionado)return;
  if(!d.worker_id||!ids.has(String(d.worker_id)))errores.push({i,campo:'trabajador',mensaje:'Selecciona un trabajador o excluye este documento.'});
  const n=String(d.nombre||'').trim();
  if(!n||n.length>220||/[\\/\x00-\x1f]/.test(n)||!n.toLowerCase().endsWith('.pdf'))errores.push({i,campo:'nombre',mensaje:'Escribe un nombre válido terminado en .pdf, sin barras.'});
 });
 return errores;
}
export function validarArchivosLote(files){
 if(!files.length)throw Error('Selecciona al menos un archivo PDF.');
 if(files.length>10)throw Error('Solo puedes subir hasta 10 archivos PDF a la vez.');
 for(const f of files){if(f.size>15*1024*1024)throw Error(`«${f.name}» supera los 15 MB permitidos.`);if(!/\.pdf$/i.test(f.name))throw Error(`«${f.name}» no tiene extensión PDF.`);}
 if(files.reduce((n,f)=>n+f.size,0)>50*1024*1024)throw Error('Los archivos superan los 50 MB en total. Súbelos en varios lotes.');
}
export async function leerRespuestaLote(r){
 let j;try{j=await r.json();}catch{
  throw Error(r.status===413?'El servidor ha rechazado el tamaño de la subida. Reduce el tamaño o el número de archivos.':[502,503,504].includes(r.status)?'El servidor no ha podido terminar la operación. Conserva esta ventana y vuelve a intentarlo; si estabas guardando, revisa antes los documentos del trabajador.':`El servidor ha devuelto una respuesta inesperada (${r.status}). Conserva esta ventana y vuelve a intentarlo.`);
 }
 if(!r.ok||!j.ok){const e=Error(j.error||`No se pudo completar la operación (${r.status}).`);for(const k of ['etapa','documento','campo','pagina','archivo','referencia'])if(j[k]!=null)e[k]=j[k];throw e;}
 return j;
}
