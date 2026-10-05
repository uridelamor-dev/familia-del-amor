import {fetchFactura as fetch} from './red.js';
import {createHash} from 'node:crypto';
const BASE='https://www.googleapis.com/drive/v3/files';
const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const limpio=v=>String(v||'').replace(/[\\/:*?"<>|\r\n]/g,'-').trim().slice(0,90);
export function rutaArchivo(f) {
 const fecha=String(f.fecha||'').slice(0,10);
 const valida=/^\d{4}-\d{2}-\d{2}$/.test(fecha)&&!isNaN(Date.parse(fecha))&&new Date(fecha).toISOString().slice(0,10)===fecha;
 return [limpio(f.empresa)||'Sin empresa asignada',valida?fecha.slice(0,4):'Sin fecha',valida?`${fecha.slice(5,7)} · ${meses[Number(fecha.slice(5,7))-1]}`:'Por revisar',limpio(f.local)||'Sin local'];
}
export function nombreArchivo(f,ext='.pdf') {
 const fecha=String(f.fecha||'').slice(0,10)||'Sin fecha';
 return [fecha,limpio(f.proveedor)||'Proveedor sin identificar',limpio(f.numero_factura)||'Sin número',limpio(f.local),f.id?`ID-${f.id}`:'Pendiente de registro'].filter(Boolean).join(' · ')+ext;
}
async function api(token,url,method='GET',body) {
 const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return r.json();
}
const locks=new Map();
export async function carpetaDrive(token,nombre,padre='root') {
 const key=padre+'|'+nombre;
 if(locks.has(key))return locks.get(key);
 const p=(async()=>{
  const escape=s=>String(s).replaceAll('\\','\\\\').replaceAll("'","\\'");
  const q=`name = '${escape(nombre)}' and '${escape(padre)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const d=await api(token,BASE+'?q='+encodeURIComponent(q)+'&fields=files(id)&pageSize=100');
  if(d.files?.length>1)throw new Error(`Hay varias carpetas llamadas ${nombre}; revisar antes de mover documentos.`);
  if(d.files?.[0])return d.files[0].id;
  const made=await api(token,BASE+'?fields=id','POST',{name:nombre,mimeType:'application/vnd.google-apps.folder',parents:[padre]});
  if(!made.id)throw new Error('No se pudo crear la carpeta');return made.id;
 })();locks.set(key,p);try{return await p;}finally{locks.delete(key);}
}
export async function carpetaDocumento(token,root,f,crear=carpetaDrive) {
 let id=root;for(const nombre of rutaArchivo(f))id=await crear(token,nombre,id);return id;
}
export async function carpetaEjercicio(token,root,g,crear=carpetaDrive) {
 let id=root;for(const nombre of [limpio(g.empresa),g.year])id=await crear(token,nombre,id);return id;
}
export async function moverVerificado(token,deps,id,parent,name) {
 const meta=await api(token,`${BASE}/${id}?fields=id,name,parents,md5Checksum,size`);
 if(meta.parents?.includes(parent)&&(!name||meta.name===name))return false;
 // Diario previo: permite reconstruir nombre y ubicación sin cambiar el contenido.
 const key='facturas_drive_origen_v1:'+id;
 await deps.dbRun('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING',[key,JSON.stringify(meta)]);
 const query=new URLSearchParams({fields:'id,name,parents,md5Checksum,size',addParents:parent});
 if(meta.parents?.length)query.set('removeParents',meta.parents.filter(p=>p!==parent).join(','));
 const moved=await api(token,`${BASE}/${id}?${query}`,'PATCH',name?{name}:{});
 const check=await api(token,`${BASE}/${id}?fields=id,name,parents,md5Checksum,size`);
 if(moved.id!==id||check.id!==id||!check.parents?.includes(parent)||(name&&check.name!==name)||(meta.md5Checksum&&check.md5Checksum!==meta.md5Checksum)||(meta.size&&check.size!==meta.size))throw new Error(`No se ha podido verificar el movimiento de ${meta.name}. Se conserva el diario original.`);
 return true;
}
export async function respaldoDatos(token,deps,root,rows) {
 const lineas=await deps.dbAll('SELECT * FROM factura_lineas ORDER BY id');
 const body=JSON.stringify({version:1,facturas:rows,lineas}),hash=createHash('sha256').update(body).digest('hex');
 const q=`trashed = false and appProperties has { key='facturasSnapshot' and value='${hash}' }`;
 const found=await api(token,BASE+'?q='+encodeURIComponent(q)+'&fields=files(id)');
 let id=found.files?.[0]?.id;
 if(!id){
  const parent=await carpetaDrive(token,'Copias de seguridad',root);
  const boundary='facturas_snapshot_boundary';
  const meta={name:`Datos facturas · ${new Date().toISOString().slice(0,10)} · ${hash.slice(0,8)}.json`,mimeType:'application/json',parents:[parent],appProperties:{facturasSnapshot:hash}};
  const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body:`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`});id=(await r.json()).id;
 }
 if(!id)throw new Error('No se pudo guardar el respaldo');
 const r=await fetch(`${BASE}/${id}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});
 const data=await r.json();
 if(JSON.stringify(data)!==body)throw new Error('La lectura de la copia no coincide con los datos originales');
 return id;
}
