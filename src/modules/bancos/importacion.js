import {createHash} from 'node:crypto';
export const hash=v=>createHash('sha256').update(v).digest('hex');
export const categorias=['Por revisar','Pago a proveedor','Cobro de tarjeta','Ingreso','Comisión bancaria','Impuestos','Nóminas','Transferencia entre cuentas','Otros'];
export function leerCSV(texto,separador=';') {
 if(typeof texto!=='string'||Buffer.byteLength(texto)>2000000)throw Error('El CSV debe ocupar como máximo 2 MB.');
 if(![';',',','\t'].includes(separador))throw Error('Separador no válido.');
 texto=texto.replace(/^\uFEFF/,'');const filas=[];let fila=[],valor='',entre=false;
 for(let i=0;i<texto.length;i++){
  const c=texto[i];
  if(c==='"'){if(entre&&texto[i+1]==='"'){valor+='"';i++;}else if(entre||valor==='')entre=!entre;else throw Error('Comillas no válidas en el CSV.');}
  else if(!entre&&(c===separador||c==='\n'||c==='\r')){
   fila.push(valor.trim());valor='';if(c!==separador){if(fila.some(Boolean))filas.push(fila);fila=[];if(c==='\r'&&texto[i+1]==='\n')i++;}
  }else valor+=c;
 }
 if(entre)throw Error('El CSV tiene comillas sin cerrar.');
 fila.push(valor.trim());if(fila.some(Boolean))filas.push(fila);
 if(filas.length>10002)throw Error('Máximo 10.000 movimientos por archivo.');return filas;
}
export function centimos(valor,decimal=',') {
 let s=String(valor??'').trim().replace(/[€\s\u00a0]/g,'');if(!s)return null;
 if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1);
 const re=decimal===','?/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/:/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
 if(!re.test(s))throw Error('Importe no válido: '+String(valor).slice(0,30));
 s=s.replaceAll(decimal===','?'.':',','').replace(decimal,'.');
 const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||Math.abs(n)>1e12)throw Error('Importe fuera de rango.');return n;
}
export function fechaBanco(valor,formato='dmy') {
 const s=String(valor||'').trim();let y,m,d;
 if(formato==='ymd'){const v=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);if(v)[,y,m,d]=v;}
 else {const v=/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);if(v)[,d,m,y]=v;}
 const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 if(!y||+y<2000||+y>2100||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)throw Error('Fecha no válida: '+s.slice(0,30));return iso;
}
export function normalizarExtracto(texto,mapa) {
 const filas=leerCSV(texto,mapa.separador),cab=Number(mapa.cabecera??0);
 if(!Number.isInteger(cab)||cab<0||cab>30||!filas[cab])throw Error('Selecciona la fila de cabeceras.');
 const headers=filas[cab],idx=k=>Number.isInteger(mapa[k])&&mapa[k]>=0&&mapa[k]<headers.length?mapa[k]:null;
 if(idx('fecha')===null||idx('concepto')===null||(idx('importe')===null&&(idx('cargo')===null||idx('abono')===null)))throw Error('Selecciona fecha, concepto e importe (o cargo y abono).');
 const ocurrencias=new Map(),movimientos=[],errores=[];
 for(let n=cab+1;n<filas.length;n++){
  try{
   const f=filas[n];if(f.length!==headers.length)throw Error('El número de columnas no coincide con la cabecera.');
   const get=k=>idx(k)===null?'':f[idx(k)];
   const fecha=fechaBanco(get('fecha'),mapa.formatoFecha),concepto=get('concepto').trim();
   if(!concepto||concepto.length>2000)throw Error('Falta el concepto o supera 2.000 caracteres.');
   let importe;
   if(idx('importe')!==null)importe=centimos(get('importe'),mapa.decimal);
   else {const cargo=centimos(get('cargo'),mapa.decimal)||0,abono=centimos(get('abono'),mapa.decimal)||0;if(cargo&&abono)throw Error('Hay cargo y abono en la misma fila.');importe=Math.abs(abono)-Math.abs(cargo);}
   if(importe===null||importe===0)throw Error('Importe vacío o cero: revisa la fila.');
   const saldo=centimos(get('saldo'),mapa.decimal),referencia=get('referencia').trim();
   const base=hash(JSON.stringify([fecha,concepto.normalize('NFKC').replace(/\s+/g,' ').toUpperCase(),importe,saldo,referencia]));
   const ocurrencia=(ocurrencias.get(base)||0)+1;ocurrencias.set(base,ocurrencia);
   movimientos.push({fecha,concepto,importe,saldo,referencia,huella:hash(base+':'+ocurrencia),fila:n+1});
  }catch(e){errores.push({fila:n+1,error:e.message});}
 }
 if(!movimientos.length&&!errores.length)throw Error('No hay movimientos después de las cabeceras.');
 return {movimientos,errores,repetidos:[...ocurrencias.values()].filter(n=>n>1).reduce((a,b)=>a+b,0)};
}
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function propuestas(m, facturas) {
 if(Number(m.importe)>=0)return [];
 return facturas.filter(f=>f.empresa===m.empresa&&f.tipo!=='albaran'&&f.dup_estado!=='duda'&&!f.dup_de&&Math.round(Number(f.total)*100)===-Number(m.importe))
 .map(f=>{const texto=norm(m.concepto),numero=norm(f.numero_factura),nif=norm(f.nif),prov=norm(f.proveedor);
 const referencia=numero.length>=4&&texto.includes(numero),proveedor=(nif.length>=8&&texto.includes(nif))||(prov.length>=6&&texto.includes(prov));
 return {...f,motivo:referencia?'Coinciden importe y número de factura':proveedor?'Coinciden importe y proveedor':'Solo coincide el importe',puntuacion:referencia?3:proveedor?2:1};})
 .sort((a,b)=>b.puntuacion-a.puntuacion).slice(0,10);
}
