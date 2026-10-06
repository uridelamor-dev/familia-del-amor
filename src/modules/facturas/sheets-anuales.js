import { createHash } from 'node:crypto';
import { fetchFactura as fetch, conPlazoFactura } from './red.js';
import {carpetaEjercicio,carpetaDrive,moverVerificado,respaldoDatos} from './archivo-drive.js';

const PREFIX = 'facturas_anual_v1:';
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const HEADERS = ['Fecha','Nº documento','Tipo','Proveedor','NIF proveedor','Concepto','Base (€)','IVA (%)','Cuota IVA (€)','Total (€)','Canal','PDF original','Registrado','Local','Empresa','ID panel','Estado','Avisos','Contabiliza'];
const norm = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().replace(/\s+/g,' ').toLowerCase();
const iso = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v || '').slice(0,10);
const dateOK = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
let bloqueo;
// La conexión PostgreSQL mantiene el cerrojo incluso entre procesos del servidor.
export function configurarBloqueoSheets(fn) { bloqueo = fn; }

export function agruparAnuales(rows, locales) {
  const grupos = new Map();
  const cifs = new Map();
  for (const l of locales) {
    const cif = String(l.cif || '').replace(/[\s.-]/g,'').toUpperCase();
    if (l.empresa && cif) { const k=norm(l.empresa); const set=cifs.get(k)||new Set(); set.add(cif); cifs.set(k,set); }
  }
  for (const f of rows) {
    const vinculada=f.tipo==='albaran' && /^\d+$/.test(String(f.conciliado_con||'')) ? rows.find(r=>String(r.id)===String(f.conciliado_con)&&r.tipo==='factura'&&r.dup_estado!=='duda') : null;
    const config = locales.find(l => l.local === f.local);
    const empresa = String(f.empresa || config?.empresa || '').trim();
    const fecha = iso(f.fecha), valida = dateOK(fecha), year = valida ? fecha.slice(0,4) : 'Sin fecha';
    const candidatos = cifs.get(norm(empresa));
    if (candidatos?.size > 1) throw new Error(`La empresa ${empresa} tiene varios NIF: revisa su configuración antes de agrupar.`);
    const identidad = empresa ? (candidatos?.values().next().value || norm(empresa)) : `sin-empresa:${norm(f.local)}`;
    const key = createHash('sha256').update(identidad+'|'+year).digest('hex').slice(0,32);
    if (!grupos.has(key)) grupos.set(key,{key,empresa:empresa || `Sin empresa · ${f.local || 'Sin local'}`,year,rows:[],locales:[]});
    const g=grupos.get(key); g.rows.push({...f,_albaranContado:!!vinculada,_fechaOriginal:f.fecha,fecha:valida ? fecha : String(f.fecha || ''),_mes:valida ? Number(fecha.slice(5,7)) : 0});
    if (!g.locales.includes(f.local)) g.locales.push(f.local);
  }
  for (const g of grupos.values()) g.rows.sort((a,b)=>a.fecha.localeCompare(b.fecha)||Number(a.id)-Number(b.id));
  return [...grupos.values()];
}

export function filaAnual(f, empresa) {
  for(const k of ['base_imponible','porcentaje_iva','cuota_iva','total']) if(f[k]!=null&&!Number.isFinite(Number(f[k]))) throw new Error(`Importe no válido en factura #${f.id}`);
  const pendiente = f.dup_estado === 'duda';
  const avisoFecha = !dateOK(iso(f.fecha)) ? 'Fecha pendiente de revisar' : Number(iso(f.fecha).slice(0,4)) > new Date().getFullYear() ? 'Fecha futura: revisar PDF' : '';
  return [f.fecha??'',f.numero_factura??'',f.tipo??'',f.proveedor??'',f.nif??'',f.concepto??'',
    ...['base_imponible','porcentaje_iva','cuota_iva','total'].map(k=> f[k]==null ? '' : Number(f[k])),
    f.canal??'',f.drive_url??'',String(f.creado_en??''),f.local??'',empresa,String(f.id),
    pendiente ? 'Posible duplicado' : f._albaranContado ? `Albarán incluido en factura #${f.conciliado_con}` : 'Registrada',[f.revisar,avisoFecha].filter(Boolean).join(' · '),pendiente||f._albaranContado ? 'No' : 'Sí'];
}
const cell = v => ({userEnteredValue: typeof v === 'number' ? {numberValue:v} : {stringValue:String(v ?? '')}});
const api = async (token,url,method='GET',body) => {
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json(); if(d.error) throw new Error(d.error.message || 'Google rechazó el cambio'); return d;
};
const sheets = id => `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
const drive = 'https://www.googleapis.com/drive/v3/files';
export async function verificarHistoricos(token, rows) {
  const porPdf=new Map();
  for(const f of rows) if(f.drive_url) { const key=idPdf(f.drive_url); const list=porPdf.get(key)||[]; list.push(f); porPdf.set(key,list); }
  let page, documentos=0, registros=0; const diferencias=[],archivos=[];
  do {
    const q="trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and name contains 'Facturas'";
    const listed=await api(token,drive+'?q='+encodeURIComponent(q)+'&fields=nextPageToken,files(id,name,appProperties)&pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):''));
    for(const file of listed.files||[]) {
      if(file.appProperties?.facturasAnualV1 || !file.name.startsWith('Facturas · ')) continue;
      const meta=await api(token,sheets(file.id)+'?fields=sheets.properties');
      const tabs=(meta.sheets||[]).map(s=>s.properties).filter(p=>p.title!=='RESUMEN');
      for(const t of tabs) {
        if(!t.gridProperties?.rowCount || t.gridProperties.rowCount>100000) throw new Error(`No se puede comprobar de forma completa ${file.name}`);
        const range=`'${t.title.replaceAll("'","''")}'!A1:O${t.gridProperties.rowCount}`;
        const d=await api(token,sheets(file.id)+'/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE');
        const values=d.values||[]; if(!values.length) continue;
        const header=values[0], pdf=header.findIndex(v=>/Archivo Drive|PDF original/i.test(String(v)));
        if(pdf<0) throw new Error(`La pestaña ${file.name} / ${t.title} tiene un formato no reconocido. Se conserva sin modificar.`);
        for(const [i,r] of values.slice(1).entries()) {
          if(!r.some(v=>v!==''&&v!=null)) continue;
          const match=porPdf.get(idPdf(r[pdf]));
          if(!match || match.length!==1) throw new Error(`Hay una factura sin correspondencia única en el panel: ${file.name}, ${t.title}, fila ${i+2}. No se ha alterado el original.`);
          const f=match[0];
          for(const [col,k] of [[6,'base_imponible'],[8,'cuota_iva'],[9,'total']]) {
            const a=r[col],b=f[k];
            if((a==null||a==='')!==(b==null||b==='') || (a!=null&&a!==''&&(!Number.isFinite(Number(a))||Math.abs(Number(a)-Number(b))>.005))) throw new Error(`El importe de la factura #${f.id} difiere del histórico ${file.name}. Revisar antes de migrar.`);
          }
          if(String(r[3]??'')!==String(f.proveedor??'')||String(r[4]??'')!==String(f.nif??'')) diferencias.push({id:f.id,archivo:file.id,pestana:t.title,fila:i+2,proveedor:r[3],nif:r[4]});
          registros++;
        }
      }
      documentos++;
      archivos.push({id:file.id,nombre:file.name});
    }
    page=listed.nextPageToken;
  } while(page);
  return {documentos,registros,diferencias,archivos,verificado_en:new Date().toISOString()};
}
const idPdf = url => String(url||'').match(/\/d\/([^/?]+)/)?.[1] || String(url||'');
async function guardar(deps,key,value) {
  await deps.dbRun('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[PREFIX+key,JSON.stringify(value)]);
}

async function obtenerLibro(token,deps,g,prev) {
  const root=await deps.dbGet('SELECT value FROM config WHERE key = ?',['drive_facturas_root_id']);
  const parent=root?.value ? await carpetaEjercicio(token,root.value,g,deps.crearCarpeta) : null;
  if(prev?.id) {
    if(parent)await moverVerificado(token,deps,prev.id,parent);
    return prev;
  }
  // La marca se escribe al crear el archivo. Si el proceso cae antes de guardar el ID,
  // el siguiente intento recupera el mismo archivo en lugar de crear otro.
  const q=`trashed = false and appProperties has { key='facturasAnualV1' and value='${g.key}' }`;
  const found=await api(token,drive+'?q='+encodeURIComponent(q)+'&fields=files(id,name)&pageSize=100');
  if(found.files?.length>1) throw new Error('Hay varios libros anuales con la misma identidad; no se elige uno arbitrariamente.');
  let id=found.files?.[0]?.id;
  if(!id) {
    const d=await api(token,drive+'?fields=id','POST',{name:`Facturas · ${g.empresa} · ${g.year}`,mimeType:'application/vnd.google-apps.spreadsheet',appProperties:{facturasAnualV1:g.key},...(parent?{parents:[parent]}:{})});
    id=d.id;
  }
  if(!id) throw new Error('Google no devolvió el documento anual');
  const reg={id,empresa:g.empresa,year:g.year,locales:g.locales};
  await guardar(deps,g.key,reg); return reg;
}

async function escribirLibro(token,id,g) {
  const meta=await api(token,sheets(id)+'?fields=sheets.properties');
  const props=(meta.sheets||[]).map(s=>s.properties);
  const nombres=g.year==='Sin fecha' ? ['Sin fecha'] : MESES;
  const requests=[], datos=[]; let next=Math.max(0,...props.map(p=>p.sheetId))+1;
  for(const [index,title] of [...nombres,'Resumen anual'].entries()) {
    let p=props.find(p=>p.title===title);
    if(!p) { p={sheetId:next++,title,gridProperties:{rowCount:1000,columnCount:HEADERS.length}}; requests.push({addSheet:{properties:p}}); }
    let values;
    if(title==='Resumen anual') {
      values=[[`Resumen · ${g.empresa} · ${g.year}`],['No suman los posibles duplicados ni los albaranes ya vinculados a una factura registrada. Se conservan todos los documentos.'],
        ['Mes','Documentos registrados','Base contabilizada (€)','IVA contabilizado (€)','Total contabilizado (€)','Documentos fuera del total'],
        ...nombres.map(m=>[m,`=COUNTA('${m}'!P2:P)`,`=SUMIF('${m}'!S2:S,"Sí",'${m}'!G2:G)`,`=SUMIF('${m}'!S2:S,"Sí",'${m}'!I2:I)`,`=SUMIF('${m}'!S2:S,"Sí",'${m}'!J2:J)`,`=COUNTIF('${m}'!S2:S,"No")`]),
        ['TOTAL',...['B','C','D','E','F'].map(c=>`=SUM(${c}4:${c}${3+nombres.length})`)]];
    } else values=[HEADERS,...g.rows.filter(f=>g.year==='Sin fecha'||f._mes===index+1).map(f=>filaAnual(f,g.empresa))];
    datos.push({title,values});
    const rowCount=Math.max(p.gridProperties?.rowCount||1000,values.length+1);
    requests.push({updateSheetProperties:{properties:{sheetId:p.sheetId,index,gridProperties:{rowCount,columnCount:Math.max(HEADERS.length,p.gridProperties?.columnCount||0),frozenRowCount:title==='Resumen anual'?3:1}},fields:'index,gridProperties'}});
    // Un único batch atómico: sustituye datos sin la ventana vacía de clear+write.
    requests.push({updateCells:{range:{sheetId:p.sheetId,startRowIndex:0,endRowIndex:rowCount,startColumnIndex:0,endColumnIndex:HEADERS.length},rows:values.map((row,ri)=>({values:row.map((v,ci)=> title==='Resumen anual'&&ri>=3&&ci>0&&typeof v==='string'&&v.startsWith('=') ? {userEnteredValue:{formulaValue:v}} : cell(v))})),fields:'userEnteredValue'}});
    requests.push({repeatCell:{range:{sheetId:p.sheetId,startRowIndex:title==='Resumen anual'?2:0,endRowIndex:title==='Resumen anual'?3:1},cell:{userEnteredFormat:{backgroundColor:{red:.15,green:.29,blue:.25},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}},wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}});
    requests.push({updateDimensionProperties:{range:{sheetId:p.sheetId,dimension:'COLUMNS',startIndex:0,endIndex:HEADERS.length},properties:{pixelSize:155},fields:'pixelSize'}});
    if(title!=='Resumen anual') {
      requests.push({setBasicFilter:{filter:{range:{sheetId:p.sheetId,startRowIndex:0,endRowIndex:Math.max(2,values.length),startColumnIndex:0,endColumnIndex:HEADERS.length}}}});
      for(const col of [6,8,9]) requests.push({repeatCell:{range:{sheetId:p.sheetId,startRowIndex:1,startColumnIndex:col,endColumnIndex:col+1},cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}});
    }
  }
  // Drive puede crear una hoja vacía inicial. Se conserva oculta; nunca borramos pestañas ajenas.
  for(const p of props.filter(p=>![...nombres,'Resumen anual'].includes(p.title))) requests.push({updateSheetProperties:{properties:{sheetId:p.sheetId,hidden:true,index:0},fields:'hidden,index'}});
  await api(token,sheets(id)+':batchUpdate','POST',{requests});
  const totalRow=datos.at(-1).values.length;
  const query=[...datos.filter(d=>d.title!=='Resumen anual').map(d=>`'${d.title}'!A1:S${d.values.length}`),`'Resumen anual'!B${totalRow}:F${totalRow}`].map(range=>'ranges='+encodeURIComponent(range)).join('&');
  const actual=await api(token,sheets(id)+'/values:batchGet?'+query+'&valueRenderOption=UNFORMATTED_VALUE');
  const expected=datos.filter(d=>d.title!=='Resumen anual');
  if(actual.valueRanges?.length!==expected.length+1) throw new Error('No se pudo verificar el libro anual');
  for(let i=0;i<expected.length;i++) {
    const a=actual.valueRanges[i].values||[],e=expected[i].values;
    if(a.length!==e.length || a.some((row,ri)=>e[ri].some((v,ci)=>String(v??'')!==String(row[ci]??'')))) throw new Error(`La verificación de ${expected[i].title} no coincide; se reintentará.`);
  }
  const contabilizadas=g.rows.filter(f=>f.dup_estado!=='duda'&&!f._albaranContado);
  const totales=[g.rows.length,...['base_imponible','cuota_iva','total'].map(k=>contabilizadas.reduce((n,f)=>n+Number(f[k]||0),0)),g.rows.length-contabilizadas.length];
  const leidos=actual.valueRanges.at(-1).values?.[0]||[];
  if(totales.some((n,i)=>typeof leidos[i]!=='number'||Math.abs(n-leidos[i])>.005)) throw new Error('Los totales del resumen anual no coinciden; no se marca como sincronizado.');
  return {id,url:`https://docs.google.com/spreadsheets/d/${id}`,empresa:g.empresa,year:g.year,facturas:g.rows.length};
}

export async function sincronizarAnuales(deps, filtro=null) {
  if(!bloqueo) throw new Error('El bloqueo de libros anuales no está configurado');
  const revision=Date.now()+':'+Math.random().toString(36).slice(2);
  await deps.dbRun('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['facturas_anuales_reintentar',revision]);
  return bloqueo(()=>conPlazoFactura(async()=>{
    const rows=await deps.dbAll('SELECT * FROM facturas ORDER BY id');
    const locales=await deps.dbAll('SELECT local, empresa, cif FROM facturas_locales');
    const grupos=agruparAnuales(rows,locales);
    const token=await deps.getToken();
    if(!filtro) {
      const root=await deps.dbGet('SELECT value FROM config WHERE key = ?',['drive_facturas_root_id']);
      if(root?.value) await respaldoDatos(token,deps,root.value,rows);
    }
    const control=await deps.dbGet('SELECT value FROM config WHERE key = ?',['facturas_anuales_historico_verificado']);
    if(!control?.value) {
      const informe=await verificarHistoricos(token,rows);
      await deps.dbRun('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['facturas_anuales_historico_verificado',JSON.stringify(informe)]);
    }
    const regs=await deps.dbAll('SELECT key,value FROM config WHERE key LIKE ?',[PREFIX+'%']);
    const registry=new Map(regs.map(r=>[r.key.slice(PREFIX.length),JSON.parse(r.value)]));
    // Si una corrección cambia empresa/año, también vaciamos la proyección anterior creada
    // por nosotros. Las hojas antiguas nunca entran en este registro y no se modifican.
    for(const [key,r] of registry) if(!grupos.some(g=>g.key===key)) grupos.push({key,...r,rows:[]});
    const selected=grupos.filter(g=>!control?.value || !filtro || (g.locales.includes(filtro.local)||registry.get(g.key)?.locales?.includes(filtro.local)) && (!filtro.fecha || g.year===iso(filtro.fecha).slice(0,4)));
    const libros=[];
    for(const g of selected) {
      const reg=await obtenerLibro(token,deps,g,registry.get(g.key));
      const libro=await escribirLibro(token,reg.id,g); libros.push(libro);
      await guardar(deps,g.key,{...reg,empresa:g.empresa,year:g.year,locales:g.locales,verificado_en:new Date().toISOString()});
      // No marca filas llegadas mientras Google trabajaba: sólo la instantánea verificada.
      const keys=['fecha','numero_factura','tipo','proveedor','nif','concepto','base_imponible','porcentaje_iva','cuota_iva','total','canal','drive_url','local','empresa','dup_estado','revisar','conciliado_con'];
      for(const f of g.rows) await deps.dbRun(`UPDATE facturas SET sheet_id = ?, sheet_synced = 1 WHERE id = ? AND ROW(${keys.join(',')}) IS NOT DISTINCT FROM ROW(${keys.map(()=>'?').join(',')})`,[reg.id,f.id,...keys.map(k=>(k==='fecha'?f._fechaOriginal:f[k])??null)]);
    }
    const archivos=deps.trasVerificar ? await deps.trasVerificar() : {};
    if(!filtro) await deps.dbRun('DELETE FROM config WHERE key = ? AND value = ?',['facturas_anuales_reintentar',revision]);
    return {libros,total:libros.reduce((n,l)=>n+l.facturas,0),...archivos};
  }, (deps.trasVerificar ? 30 : 8)*60*1000));
}

export async function planAnuales(deps) {
  const rows=await deps.dbAll('SELECT * FROM facturas ORDER BY id');
  const grupos=agruparAnuales(rows,await deps.dbAll('SELECT local,empresa,cif FROM facturas_locales'));
  return {total:rows.length,libros:grupos.map(g=>({empresa:g.empresa,year:g.year,locales:g.locales,facturas:g.rows.length})),sinFecha:rows.filter(f=>!dateOK(iso(f.fecha))).length};
}

export async function avisoAnualesUnaVez(deps) {
  // Haber visto el aviso no significa haber completado la migración.
  const terminado=await deps.dbGet('SELECT value FROM config WHERE key = ?',['facturas_drive_organizacion_completada_v1']);
  const pendiente=await deps.dbGet('SELECT value FROM config WHERE key = ?',['facturas_drive_organizacion_pendiente']);
  if(terminado?.value && !pendiente?.value) return {mostrar:false};
  const plan=await planAnuales(deps);
  const error=await deps.dbGet('SELECT value FROM config WHERE key = ?',['facturas_drive_organizacion_error']);
  return plan.total ? {mostrar:true,plan,error:error?.value||null} : {mostrar:false};
}

// Sólo se invoca tras verificar todos los libros y los PDF. Nunca borra archivos.
export async function archivarHistoricos(deps) {
 const token=await deps.getToken(),rows=await deps.dbAll('SELECT * FROM facturas ORDER BY id');
 const root=await deps.dbGet('SELECT value FROM config WHERE key = ?',['drive_facturas_root_id']);
 if(!root?.value)throw new Error('Falta la carpeta raíz de contabilidad');
 const informe=await verificarHistoricos(token,rows);
 const backup=await respaldoDatos(token,deps,root.value,rows);
 const parent=await carpetaDrive(token,'Histórico anterior a la reorganización',root.value);
 let archivados=0;
 for(const f of informe.archivos)if(await moverVerificado(token,deps,f.id,parent))archivados++;
 await deps.dbRun('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['facturas_drive_organizado_v1',JSON.stringify({fecha:new Date().toISOString(),backup,informe})]);
 return {archivados,backup};
}
