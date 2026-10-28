/* Bancos: importación guiada. Los datos quedan en la base privada, nunca en uploads públicos. */
let BANCO={empresa:'',cuenta:'',mes:'',config:null,datos:[],version:0,lectura:0,pendientes:false};
const banEuro=n=>((Number(n)||0)/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const banMesAnterior=()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
function banPeriodo(id,valor){
 const [ano,mes]=valor.split('-'),actual=new Date().getFullYear();
 const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 return `<div class="ban-periodo"><label>Mes<select id="${id}Mes">${meses.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${Number(mes)===i+1?'selected':''}>${m}</option>`).join('')}</select></label><label>Año<select id="${id}Ano">${Array.from({length:actual-1999},(_,i)=>actual-i).map(a=>`<option ${String(a)===ano?'selected':''}>${a}</option>`).join('')}</select></label></div>`;
}
function banLeerPeriodo(root,id){return root.querySelector('#'+id+'Ano').value+'-'+root.querySelector('#'+id+'Mes').value;}
async function loadBancos(){
 const version=++BANCO.version;BANCO.mes||=banMesAnterior();
 const view=document.getElementById('view');view.innerHTML='<p class="mut">Cargando cuentas…</p>';
 try{
  const c=await apiRaw('/api/bancos');if(CURRENT!=='bancos'||version!==BANCO.version)return;BANCO.config=c;
  if(!c.empresas.includes(BANCO.empresa))BANCO.empresa='';
  const cuentas=c.cuentas.filter(x=>x.empresa===BANCO.empresa);
  if(!cuentas.some(x=>String(x.id)===String(BANCO.cuenta)))BANCO.cuenta=cuentas[0]?.id||'';
  BANCO.datos=[];
  view.innerHTML=`<div class="ph"><div class="eyebrow">Contabilidad</div><h1>Bancos</h1><p class="sub">Sube el extracto del mes y revisa qué cobros y pagos están justificados.</p></div>
   <div class="toolbar"><button class="btn primary" id="banSubir">Subir extracto</button><button class="btn" id="banCuentaNueva">Añadir cuenta</button></div>
   <div class="card ban-card"><div class="toolbar"><label>Empresa o titular fiscal<select id="banEmpresa"><option value="">Elige el titular fiscal</option>${c.empresas.map(e=>`<option value="${esc(e)}" ${e===BANCO.empresa?'selected':''}>${esc(e)}</option>`).join('')}</select></label><label>Cuenta<select id="banCuenta" ${!cuentas.length?'disabled':''}>${!cuentas.length?'<option>Sin cuentas para este titular</option>':''}${cuentas.map(x=>`<option value="${x.id}" ${String(x.id)===String(BANCO.cuenta)?'selected':''}>${esc(x.nombre)} · ${esc(x.empresa)} · •••• ${esc(x.ultimos4)}</option>`).join('')}</select></label>${banPeriodo('banFiltro',BANCO.mes)}<label><input type="checkbox" id="banPend" ${BANCO.pendientes?'checked':''}> Mostrar solo movimientos pendientes</label></div><p class="mut">Importes en euros. Las entradas y salidas de banco no equivalen al beneficio. La cuenta bancaria distingue las cuentas del mismo titular (por ejemplo, Sabadell y CaixaBank). El filtro de pendientes oculta los movimientos ya clasificados o conciliados.</p><div id="banResumen"></div></div>
   <div id="banMovimientos"></div><details class="card ban-card"><summary>Importaciones y ayuda</summary><div id="banHistorial"></div><p>Descarga Excel (.xlsx o .xls) o CSV de tu banco con los movimientos de un mes. No se admite PDF ni Norma 43.</p><p>Se comprueban coincidencias por fecha, concepto, importe, saldo y referencia. Revisa la vista previa si hay operaciones idénticas o exportaciones con un formato distinto.</p><p>Silvia recibirá un recordatorio mensual por WhatsApp a partir de las 10:00 del día 1. Si WhatsApp está desconectado, se intentará al reconectar. ${c.recordatorio?'Último estado: '+esc(c.recordatorio.mes)+' · '+esc(c.recordatorio.estado)+'.':''}</p></details>`;
  document.getElementById('banEmpresa').onchange=async e=>{BANCO.empresa=e.target.value;BANCO.cuenta='';await loadBancos();};
  document.getElementById('banCuentaNueva').onclick=()=>banCrearCuenta();
  document.getElementById('banSubir').onclick=banImportar;
  document.getElementById('banCuenta').onchange=e=>{BANCO.cuenta=e.target.value;banCargar();};
  for(const id of ['banFiltroMes','banFiltroAno'])document.getElementById(id).onchange=()=>{BANCO.mes=banLeerPeriodo(document,'banFiltro');banCargar();};
  document.getElementById('banPend').onchange=banPintar;
  await banCargar();
 }catch(e){if(CURRENT==='bancos')view.innerHTML=`<p role="alert">${esc(e.message)}</p>`;}
}
async function banCargar(){
 if(!BANCO.cuenta){document.getElementById('banMovimientos').innerHTML='<div class="card ban-card">Selecciona el titular fiscal y añade una de sus cuentas para empezar. Nunca pedimos claves del banco.</div>';return;}
 if(!BANCO.mes)return;
 const lectura=++BANCO.lectura,version=BANCO.version,cuenta=BANCO.cuenta,mes=BANCO.mes;
 BANCO.datos=[];document.getElementById('banResumen').innerHTML='';document.getElementById('banMovimientos').innerHTML='<p class="mut">Cargando movimientos…</p>';document.getElementById('banHistorial').innerHTML='';
 try{
 const r=await apiRaw('/api/bancos/movimientos?cuenta='+cuenta+'&mes='+encodeURIComponent(mes));
 if(CURRENT!=='bancos'||lectura!==BANCO.lectura||version!==BANCO.version||cuenta!==BANCO.cuenta||mes!==BANCO.mes)return;
 BANCO.datos=r.data;banPintar();
 document.getElementById('banHistorial').innerHTML=r.importaciones.map(i=>`<p>${esc(i.archivo)} · ${Number(i.nuevos)} nuevos · ${Number(i.duplicados)} coincidencias omitidas${i.completo?' · Declarado completo':''} · ${esc(i.estado)} ${i.estado==='confirmada'?`<button class="btn sm" data-anular-importacion="${i.id}">Anular importación</button>`:''}</p>`).join('')||'<p>Sin extractos confirmados para este mes.</p>';
 document.querySelectorAll('[data-anular-importacion]').forEach(b=>b.onclick=async()=>{if(!await confirmModal('¿Anular los movimientos nuevos de esta importación? Se conservará el historial. Si hay facturas conciliadas, primero deberás desvincularlas.'))return;b.disabled=true;try{await apiSend('POST','/api/bancos/anular-importacion',{id:b.dataset.anularImportacion});await banCargar();}catch(e){toast(e.message);b.disabled=false;}});
 }catch(e){toast(e.message);}
}
function banPintar(){
 BANCO.pendientes=document.getElementById('banPend').checked;
 const datos=BANCO.pendientes?BANCO.datos.filter(m=>!m.revisado):BANCO.datos,entradas=datos.filter(m=>Number(m.importe)>0).reduce((a,m)=>a+Number(m.importe),0),salidas=-datos.filter(m=>Number(m.importe)<0).reduce((a,m)=>a+Number(m.importe),0);
 document.getElementById('banResumen').innerHTML=`<div class="ban-totales"><div>Entradas<strong>${banEuro(entradas)}</strong></div><div>Salidas<strong>${banEuro(salidas)}</strong></div><div>Por revisar<strong>${datos.filter(m=>!m.revisado).length}</strong></div></div><p class="mut">${datos.length} movimientos ${BANCO.pendientes?'pendientes mostrados':'mostrados'}. Diferencia de entradas y salidas: ${banEuro(entradas-salidas)}; no es el saldo de la cuenta.</p>`;
 const filas=datos;
 document.getElementById('banMovimientos').innerHTML=filas.length?`<div class="card ban-card"><div class="ban-scroll"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${filas.map(m=>`<tr><td>${esc(m.fecha)}</td><td>${esc(m.concepto)}</td><td class="ban-num">${banEuro(m.importe)}</td><td>${m.factura_id?'Factura #'+Number(m.factura_id):esc(m.categoria)}</td><td><button class="btn sm" data-ban="${m.id}">Revisar</button></td></tr>`).join('')}</tbody></table></div></div>`:'<p class="mut">No hay movimientos con estos filtros.</p>';
 document.querySelectorAll('[data-ban]').forEach(b=>b.onclick=()=>banRevisar(BANCO.datos.find(m=>String(m.id)===b.dataset.ban)));
}
function banCrearCuenta(continuar=false){
 const c=BANCO.config,ov=modal('Añadir cuenta bancaria',`${continuar?'<p>Primero registra la cuenta de la que procede el extracto. Solo tendrás que hacerlo una vez; después podrás subir el archivo.</p>':''}<form id="banNueva" class="ban-form"><label>Nombre para reconocerla<input name="nombre" maxlength="100" placeholder="Sabadell · cuenta principal" required></label><label>Banco<select name="banco"><option>Sabadell</option><option>CaixaBank</option><option>BBVA</option><option>Santander</option><option>Otro banco</option></select></label><label>Empresa o titular fiscal<select name="empresa" required><option value="">Elige empresa</option>${c.empresas.map(e=>`<option ${e===BANCO.empresa?'selected':''}>${esc(e)}</option>`).join('')}</select></label><label>Últimos cuatro dígitos<input name="ultimos4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label><p class="mut">Solo cuentas en euros. No introduzcas contraseñas ni el IBAN completo. La empresa no se podrá cambiar después de importar.</p><p role="alert" id="banErr"></p><button class="btn primary">Guardar cuenta</button></form>`);
 ov.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const r=await apiSend('POST','/api/bancos/cuentas',Object.fromEntries(new FormData(e.target)));BANCO.empresa=e.target.elements.empresa.value;BANCO.cuenta=r.id;ov.remove();await loadBancos();if(continuar)banImportar();}catch(err){ov.querySelector('#banErr').textContent=err.message;}finally{b.disabled=false;}};
}
function banImportar(){
 let empresa=BANCO.empresa,cuenta=null,fichero=null;
 let mesCarga=BANCO.mes||banMesAnterior(),texto='',archivo='',mapa={separador:';',cabecera:0,decimal:',',formatoFecha:'dmy'},filas=[];
 const ov=modal('Subir extracto','<div id="banPaso"></div>');ov.classList.add('ban-modal');const box=ov.querySelector('#banPaso');
 const fallo=e=>{box.querySelector('[role="alert"]').textContent=e.message;};
 function titular(){
  box.innerHTML=`<p class="mut">1 de 6 · Titular fiscal</p><h3>¿De quién es el extracto?</h3><label>Empresa o titular fiscal<select id="banTitular"><option value="">Selecciona un titular</option>${BANCO.config.empresas.map(e=>`<option ${e===empresa?'selected':''}>${esc(e)}</option>`).join('')}</select></label><p role="alert"></p><button class="btn primary" id="banSiguiente">Continuar</button>`;
  box.querySelector('#banSiguiente').onclick=()=>{const valor=box.querySelector('select').value;if(!valor){fallo(Error('Selecciona el titular fiscal.'));return;}if(valor!==empresa)cuenta=null;empresa=valor;elegirCuenta();};
 }
 function elegirCuenta(){
  const cuentas=BANCO.config.cuentas.filter(c=>c.empresa===empresa);
  box.innerHTML=`<p class="mut">2 de 6 · Cuenta bancaria</p><h3>${esc(empresa)}</h3><p>Elige la cuenta de la que has descargado el archivo.</p><label>Cuenta bancaria<select id="banOrigen"><option value="">Selecciona una cuenta</option>${cuentas.map(c=>`<option value="${c.id}" ${c.id===cuenta?.id?'selected':''}>${esc(c.nombre)} · ${esc(c.banco)} · •••• ${esc(c.ultimos4)}</option>`).join('')}<option value="nueva">Añadir una cuenta nueva…</option></select></label><div id="banAlta"></div><p role="alert"></p><div class="toolbar"><button class="btn" id="banAnterior">Atrás</button><button class="btn primary" id="banSiguiente">Continuar</button></div>`;
  const sel=box.querySelector('#banOrigen');
  sel.onchange=()=>{box.querySelector('#banAlta').innerHTML=sel.value==='nueva'?`<div class="ban-form"><label>Nombre de la cuenta<input id="banNombre" maxlength="100" placeholder="Cuenta principal"></label><label>Banco<select id="banBanco">${['Sabadell','CaixaBank','BBVA','Santander','Otro banco'].map(b=>`<option>${b}</option>`).join('')}</select></label><label>Últimos cuatro dígitos<input id="banDigitos" maxlength="4" inputmode="numeric"></label><p>Al continuar se guardará la cuenta. Los movimientos no se importan hasta la confirmación final.</p></div>`:'';};
  if(!cuentas.length){sel.value='nueva';sel.onchange();}
  box.querySelector('#banAnterior').onclick=titular;
  box.querySelector('#banSiguiente').onclick=async e=>{e.target.disabled=true;try{
   let elegida;
   if(sel.value==='nueva'){
    const datos={empresa,nombre:box.querySelector('#banNombre').value.trim(),banco:box.querySelector('#banBanco').value,ultimos4:box.querySelector('#banDigitos').value};
    if(!datos.nombre||!/^\d{4}$/.test(datos.ultimos4))throw Error('Indica el nombre y los cuatro últimos dígitos.');
    const r=await apiSend('POST','/api/bancos/cuentas',datos);elegida={...datos,id:r.id};BANCO.config.cuentas.push(elegida);
   }else elegida=cuentas.find(c=>String(c.id)===sel.value);
   if(!elegida)throw Error('Selecciona una cuenta.');
   if(cuenta?.id!==elegida.id)mapa=elegida.mapa||{separador:';',cabecera:0,decimal:',',formatoFecha:'dmy'};
   cuenta=elegida;periodo();
  }catch(err){fallo(err);}finally{if(e.target.isConnected)e.target.disabled=false;}};
 }
 function periodo(){
  box.innerHTML=`<p class="mut">3 de 6 · Periodo</p><h3>¿De qué mes son los movimientos?</h3>${banPeriodo('banCarga',mesCarga)}<p role="alert"></p><div class="toolbar"><button class="btn" id="banAnterior">Atrás</button><button class="btn primary" id="banSiguiente">Continuar</button></div>`;
  box.querySelector('#banAnterior').onclick=()=>{mesCarga=banLeerPeriodo(box,'banCarga');elegirCuenta();};
  box.querySelector('#banSiguiente').onclick=()=>{mesCarga=banLeerPeriodo(box,'banCarga');inicio();};
 }
 function inicio(){box.innerHTML=`<p class="mut">4 de 6 · Archivo</p><p>${esc(cuenta.empresa)} · •••• ${esc(cuenta.ultimos4)}</p><div class="ban-form"><p>Periodo: ${esc(mesCarga)}</p><label>Archivo Excel o CSV<input id="banArchivo" type="file" accept=".xlsx,.xls,.csv,.txt"></label><p>Descarga los movimientos completos de ese mes. Admite Excel (.xlsx y .xls) y CSV. No se admite PDF ni Norma 43.</p><label>Separador<select id="banSep"><option value=";">Punto y coma (;)</option><option value=",">Coma (,)</option><option value="tab">Tabulador</option></select></label>${fichero?`<p>Archivo seleccionado: ${esc(fichero.name)}</p>`:''}<p role="alert"></p><button class="btn" id="banArchivoAtras">Atrás</button><button class="btn primary" id="banLeer">Continuar</button></div>`;
 box.querySelector('#banArchivoAtras').onclick=()=>{fichero=box.querySelector('#banArchivo').files[0]||fichero;periodo();};
 box.querySelector('#banSep').value=mapa.separador==='\t'?'tab':mapa.separador;
 box.querySelector('#banLeer').onclick=async e=>{e.target.disabled=true;try{
  const f=box.querySelector('#banArchivo').files[0]||fichero;fichero=f;if(!f||!f.name.match(/\.(xlsx|xls|csv|txt)$/i))throw Error('Selecciona un Excel (.xlsx o .xls) o CSV.');if(f.size>2000000)throw Error('Máximo 2 MB. Exporta un mes cada vez.');
  const bytes=new Uint8Array(await f.arrayBuffer());
  if(/\.xlsx?$/i.test(f.name)){
   archivo=f.name;if(!mesCarga)throw Error('Elige el mes.');
   const hojas=await banLeerExcel(bytes);mapa={...mapa,separador:';',decimal:',',formatoFecha:'dmy'};
   async function elegir(h){texto=h.texto;const r=await apiSend('POST','/api/bancos/columnas',{texto,separador:';'});filas=r.filas;columnas();}
   if(hojas.length===1)await elegir(hojas[0]);
   else{box.innerHTML=`<p>Elige la hoja que contiene los movimientos.</p><label>Hoja<select id="banHoja">${hojas.map((h,i)=>`<option value="${i}">${esc(h.nombre)}</option>`).join('')}</select></label><p role="alert"></p><button class="btn primary" id="banElegirHoja">Continuar</button>`;box.querySelector('button').onclick=async()=>{try{await elegir(hojas[Number(box.querySelector('select').value)]);}catch(err){fallo(err);}};}
   return;
  }
  texto=new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8').decode(bytes);if(texto.includes('\uFFFD'))texto=new TextDecoder('windows-1252').decode(bytes);
  archivo=f.name;const sep=box.querySelector('#banSep').value;mapa={...mapa,separador:sep==='tab'?'\t':sep};const mes=mesCarga;if(!mes)throw Error('Elige el mes.');mesCarga=mes;
  const r=await apiSend('POST','/api/bancos/columnas',{texto,separador:mapa.separador});filas=r.filas;if(!filas.length)throw Error('El archivo está vacío.');columnas();
 }catch(err){fallo(err);}finally{if(e.target.isConnected)e.target.disabled=false;}};}
 function columnas(){
  let cab=Number(mapa.cabecera)||0;if(cab>=filas.length)cab=0;
  box.innerHTML=`<p class="mut">5 de 6 · Revisar columnas</p><div class="ban-form"><label>Fila que contiene los títulos<select id="banCab">${filas.slice(0,31).map((f,i)=>`<option value="${i}" ${i===cab?'selected':''}>${i+1}: ${esc(f.join(' · ').slice(0,100))}</option>`).join('')}</select></label><div id="banCols"></div><label>Decimales<select id="banDecimal"><option value=",">1.234,56</option><option value=".">1,234.56</option></select></label><label>Fecha<select id="banFechaFmt"><option value="dmy">Día/mes/año</option><option value="ymd">Año-mes-día</option></select></label><p class="mut">Importe único: negativo para salidas y positivo para entradas. O elige columnas separadas de cargo y abono. El saldo y la referencia ayudan a distinguir operaciones iguales.</p><p role="alert"></p><div class="toolbar"><button class="btn" id="banAtras">Atrás</button><button class="btn primary" id="banVista">Ver resumen</button></div></div>`;
  box.querySelector('#banDecimal').value=mapa.decimal;box.querySelector('#banFechaFmt').value=mapa.formatoFecha;
  function pintarCols(){const headers=filas[Number(box.querySelector('#banCab').value)],campos={fecha:'Fecha de operación',concepto:'Concepto',importe:'Importe único',cargo:'Cargo / debe',abono:'Abono / haber',saldo:'Saldo (opcional)',referencia:'Referencia (opcional)'};
   box.querySelector('#banCols').innerHTML=Object.entries(campos).map(([k,label])=>`<label>${label}<select data-col="${k}"><option value="-1">Sin columna</option>${headers.map((h,i)=>`<option value="${i}" ${mapa[k]===i?'selected':''}>${i+1} · ${esc(h)}</option>`).join('')}</select></label>`).join('');}
  pintarCols();box.querySelector('#banCab').onchange=pintarCols;box.querySelector('#banAtras').onclick=()=>{mapa={...mapa,cabecera:Number(box.querySelector('#banCab').value),decimal:box.querySelector('#banDecimal').value,formatoFecha:box.querySelector('#banFechaFmt').value};box.querySelectorAll('[data-col]').forEach(x=>mapa[x.dataset.col]=Number(x.value));inicio();};
  box.querySelector('#banVista').onclick=async e=>{e.target.disabled=true;try{
   mapa={...mapa,cabecera:Number(box.querySelector('#banCab').value),decimal:box.querySelector('#banDecimal').value,formatoFecha:box.querySelector('#banFechaFmt').value};box.querySelectorAll('[data-col]').forEach(x=>mapa[x.dataset.col]=Number(x.value));
   const r=await apiSend('POST','/api/bancos/previsualizar',{cuenta_id:cuenta.id,mes:mesCarga,archivo,texto,mapa});
   if(r.errores?.length)throw Error(`${r.totalErrores} filas por corregir. `+r.errores.slice(0,5).map(e=>'Fila '+e.fila+': '+e.error).join(' · '));resumen(r);
  }catch(err){fallo(err);}finally{if(e.target.isConnected)e.target.disabled=false;}};
 }
 function resumen(r){box.innerHTML=`<p class="mut">6 de 6 · Confirmar</p><h3>${esc(empresa)}</h3><p>${esc(cuenta.nombre)} · ${esc(cuenta.banco)} · •••• ${esc(cuenta.ultimos4)} · ${esc(mesCarga)}</p><p><b>${r.nuevos} nuevos</b> · ${r.duplicados} coincidencias ya importadas · ${r.total} filas leídas</p><p>Entradas nuevas: <b>${banEuro(r.entradas)}</b><br>Salidas nuevas: <b>${banEuro(r.salidas)}</b></p>${r.repetidos?`<p role="status">Hay ${r.repetidos} filas idénticas dentro del archivo. Se conservan como operaciones distintas. Comprueba que el banco no las haya repetido.</p>`:''}<p class="mut">Las coincidencias se omiten por sus datos, no por el nombre del archivo. En extractos solapados con movimientos idénticos, comprueba las operaciones y el saldo.</p><div class="ban-scroll"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th></tr></thead><tbody>${r.muestra.map(m=>`<tr><td>${esc(m.fecha)}</td><td>${esc(m.concepto)}</td><td>${banEuro(m.importe)}</td></tr>`).join('')}</tbody></table></div><p class="mut">Muestra de las primeras diez filas. Las facturas solo cambiarán a pagadas al confirmar una conciliación.</p><label><input id="banCompleto" type="checkbox"> He comprobado que es el extracto completo de este mes.</label><p role="alert"></p><div class="toolbar"><button class="btn" id="banVolver">Revisar columnas</button><button class="btn primary" id="banConfirmar">Confirmar importación</button></div>`;
  box.querySelector('#banVolver').onclick=columnas;box.querySelector('#banConfirmar').onclick=async e=>{e.target.disabled=true;try{const x=await apiSend('POST','/api/bancos/confirmar',{id:r.id,completo:box.querySelector('#banCompleto').checked});BANCO.empresa=empresa;BANCO.cuenta=cuenta.id;BANCO.mes=mesCarga;ov.remove();toast(`${x.nuevos} movimientos guardados; ${x.duplicados} coincidencias omitidas.`);await loadBancos();}catch(err){fallo(err);}finally{if(e.target.isConnected)e.target.disabled=false;}};
 }
 titular();
}
async function banRevisar(m){
 const ov=modal('Revisar movimiento',`<p>${esc(m.fecha)} · <b>${banEuro(m.importe)}</b></p><p>${esc(m.concepto)}</p><div id="banPropuestas">Buscando facturas…</div><p role="alert" id="banRevErr"></p>`);ov.classList.add('ban-modal');const box=ov.querySelector('#banPropuestas');
 async function accion(path,body){const buttons=ov.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{const resultado=await apiSend('POST','/api/bancos/'+path,body);if(resultado.advertencia)toast(resultado.advertencia);ov.remove();await banCargar();}catch(e){ov.querySelector('#banRevErr').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}}
 if(m.factura_id){box.innerHTML=`<p>Conciliado con la factura #${Number(m.factura_id)}. Se marcó pagada con fecha ${esc(m.fecha)}.</p><button class="btn" id="banDeshacer">Deshacer conciliación</button>`;box.querySelector('button').onclick=async()=>{if(await confirmModal('¿Deshacer el vínculo? Se restaurará el pago anterior salvo que alguien lo haya modificado después.'))accion('desconciliar',{id:m.id});};return;}
 try{const r=await apiRaw('/api/bancos/propuestas/'+m.id);if(!ov.isConnected)return;
 box.innerHTML=`<h3>Facturas del mismo importe y empresa</h3><p class="mut">Son propuestas. Comprueba el proveedor y la referencia antes de confirmar; un importe igual no demuestra un pago.</p>${r.data.length?r.data.map(f=>`<div class="card ban-card"><strong>${esc(f.proveedor)} · ${esc(f.numero_factura||'#'+f.id)}</strong><p>${esc(f.fecha||'Sin fecha')} · ${banEuro(Math.round(Number(f.total)*100))}</p><p>${esc(f.motivo)}${f.pagado?' · Ya marcada pagada':''}</p><button class="btn" data-factura="${f.id}">Vincular y confirmar pago</button></div>`).join(''):'<p>No hay una coincidencia exacta disponible. Puede faltar la factura o tratarse de un pago agrupado, parcial o de otro tipo. Déjalo por revisar si no lo puedes justificar.</p>'}<h3>Clasificación</h3><p class="mut">Clasificar organiza el movimiento; no confirma que exista una factura ni concilia ventas del TPV.</p><div class="ban-form"><label>Tipo de movimiento<select id="banCategoria">${BANCO.config.categorias.map(c=>`<option ${c===m.categoria?'selected':''}>${esc(c)}</option>`).join('')}</select></label><button class="btn" id="banGuardarCat">Guardar clasificación</button></div>`;
 box.querySelectorAll('[data-factura]').forEach(b=>b.onclick=async()=>{if(await confirmModal('¿Has comprobado que este cargo corresponde a esta factura? Se marcará como pagada.'))accion('conciliar',{movimiento_id:m.id,factura_id:Number(b.dataset.factura)});});box.querySelector('#banGuardarCat').onclick=()=>accion('clasificar',{id:m.id,categoria:box.querySelector('#banCategoria').value});
 }catch(e){box.textContent=e.message;}
}

function banLeerExcel(bytes){
 return new Promise((resolve,reject)=>{
  const worker=new Worker('/panel/bancos-excel-worker.js');
  const fin=(err,hojas)=>{clearTimeout(timer);worker.terminate();err?reject(Error(err)):resolve(hojas);};
  const timer=setTimeout(()=>fin('El Excel tarda demasiado en leerse. Descarga un extracto más pequeño.'),15000);
  worker.onerror=()=>fin('No se pudo abrir el lector de Excel. Actualiza el panel e inténtalo otra vez.');
  worker.onmessage=({data})=>fin(data.error,data.hojas);worker.postMessage(bytes);
 });
}
