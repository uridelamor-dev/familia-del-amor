/* Bandeja de atención humana. No se envía al pulsar Enter: siempre con el botón. */
let CONV={jid:null,version:0,timer:null,busy:false};
const CONV_BORRADORES=new Map();
function convGuardarBorrador(){const input=document.getElementById('convTexto');if(CONV.jid&&input){if(input.value.trim())CONV_BORRADORES.set(CONV.jid,input.value);else CONV_BORRADORES.delete(CONV.jid);}}
async function loadConversaciones(){
 convGuardarBorrador();clearInterval(CONV.timer);CONV={jid:null,version:CONV.version+1,timer:null,busy:false};
 const view=document.getElementById('view');
 view.innerHTML=`<div class="ph"><div class="eyebrow">Atención al cliente</div><h1>Conversaciones</h1><div class="sub">Historial de WhatsApp y atención del equipo.</div></div>
 <div class="conv-layout"><section class="card conv-list" aria-label="Lista de conversaciones"><div class="conv-list-head"><form id="convBuscar">${USER.rol==='direccion'?'<label for="convTipo">Mostrar</label><select id="convTipo"><option value="clientes">Clientes</option><option value="internas">Grupos e internas</option><option value="todos">Todas las conversaciones</option></select>':''}<label for="convQ">Buscar cliente o teléfono</label><div class="toolbar"><input id="convQ" maxlength="100" placeholder="Nombre o teléfono"><button class="btn sm" type="submit">Buscar</button><button class="btn sm" type="button" id="convLimpiar" aria-label="Limpiar búsqueda">✕</button></div><label><input id="convPendientes" type="checkbox"> Solo necesitan atención</label></form><p id="convResumen" class="mut" role="status">Cargando conversaciones…</p></div><div id="convLista"></div><button class="btn" id="convMas" hidden>Ver más conversaciones</button></section><section class="card conv-detail" id="convDetalle"><div class="conv-empty"><span aria-hidden="true">☏</span><h3>Tu bandeja de atención</h3><p>Selecciona una conversación para leer el historial y responder.</p><small>Los mensajes solo se envían al pulsar «Enviar respuesta».</small></div></section></div>`;
 let offset=0,peticion=0,cargando=false,repetir=false,ultimaLista='';
 document.getElementById('convBuscar').onsubmit=e=>{e.preventDefault();offset=0;lista(false);};
 document.getElementById('convLimpiar').onclick=()=>{document.getElementById('convQ').value='';offset=0;lista(false);};
 const tipo=document.getElementById('convTipo');if(tipo)tipo.onchange=()=>{offset=0;lista(false);};
 document.getElementById('convPendientes').onchange=()=>{offset=0;lista(false);};
 document.getElementById('convMas').onclick=()=>{if(!cargando)lista(true);};
 document.querySelector('.conv-list').onscroll=e=>{const el=e.currentTarget;if(!cargando&&!document.getElementById('convMas').hidden&&el.scrollHeight-el.scrollTop-el.clientHeight<180)lista(true);};
 async function lista(append,refrescar=false){
  if(cargando){if(!append&&!refrescar)repetir=true;return;}cargando=true;
  const nuevaPagina=append?offset+50:0;
  const solicitud=++peticion,version=CONV.version,q=document.getElementById('convQ').value,pend=document.getElementById('convPendientes').checked,tipo=document.getElementById('convTipo')?.value||'clientes';
  try{
   const url='/api/conversaciones?q='+encodeURIComponent(q)+'&pendientes='+(pend?'1':'0')+'&tipo='+tipo;
   let r=await apiRaw(url+'&offset='+nuevaPagina);
   if(refrescar){const cargadas=offset+50;for(let pagina=50;pagina<cargadas&&r.mas;pagina+=50){const siguiente=await apiRaw(url+'&offset='+pagina);r={...siguiente,data:[...r.data,...siguiente.data]};}}
   if(CURRENT!=='conversaciones'||version!==CONV.version||solicitud!==peticion)return;
   if(tipo!==(document.getElementById('convTipo')?.value||'clientes')||q!==document.getElementById('convQ').value||pend!==document.getElementById('convPendientes').checked){repetir=true;return;}
   offset=refrescar?Math.max(0,Math.floor((r.data.length-1)/50)*50):nuevaPagina;
   const firma=JSON.stringify([q,pend,tipo,r.data,r.total,r.mas,r.sync]);
   if(refrescar&&firma===ultimaLista)return;ultimaLista=append?'':firma;
   const box=document.getElementById('convLista');if(!append)box.innerHTML='';
   if(!r.data.length&&!append)box.innerHTML='<p class="mut">No hay conversaciones con estos filtros.</p>';
   for(const c of r.data){if([...box.children].some(el=>el.dataset.jid===c.jid))continue;const b=document.createElement('button');b.className='conv-contact'+(CONV.jid===c.jid?' selected':'');b.setAttribute('aria-pressed',String(CONV.jid===c.jid));b.dataset.jid=c.jid;b.type='button';b.innerHTML=`<strong>${esc(c.nombre)}</strong>${c.telefono&&c.telefono!==c.nombre?`<span class="conv-phone">+${esc(c.telefono)}</span>`:''}<span class="pill ${c.pendiente?'warn':''}">${c.solo_lectura?(c.jid.endsWith('@g.us')?'Grupo · solo lectura':'Interna · solo lectura'):c.atencion_estado==='en_curso'?'En atención':c.pendiente?'Pendiente de resolver':'Sara activa'}${Number(c.archivado)>0?' · Archivada':''}${Number(c.fijado)>0?' · Fijada':''}</span><small>${esc(convFecha(c.creado_en))}</small><span class="conv-preview">${esc((c.pendiente?(c.mensaje||c.respuesta||'Adjunto'):(c.respuesta||c.mensaje||'Adjunto')).slice(0,140))}</span>`;b.onclick=()=>convAbrir(c.jid,c.nombre);box.appendChild(b);}
   document.getElementById('convMas').hidden=!r.mas;
   document.getElementById('convResumen').textContent=box.querySelectorAll('.conv-contact').length+' de '+r.total+' conversaciones guardadas. '+(r.sync?'Historial recibido de WhatsApp.':'Pendiente de recibir el historial de WhatsApp.');
  }catch(e){if(CURRENT==='conversaciones'&&version===CONV.version)document.getElementById('convResumen').textContent='No se pudo actualizar la lista. Pulsa Buscar para reintentarlo.';}finally{cargando=false;if(repetir&&CURRENT==='conversaciones'){repetir=false;lista(false);}}
 }
 CONV.actualizarLista=()=>{offset=0;return lista(false);};
 await lista(false);
 CONV.timer=setInterval(()=>{if(CURRENT!=='conversaciones'){clearInterval(CONV.timer);return;}if(!CONV.busy){if(CONV.jid)convRefrescar();lista(false,true);}},15000);
}
function convFecha(v){if(!v)return '';const d=new Date(v);return Number.isNaN(+d)?String(v||''):d.toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function convMensajes(filas){return filas.map(m=>{
 const recibido=!['saliente','manual'].includes(m.tipo);
 const burbuja=(texto,clase,autor)=>`<div class="conv-bubble ${clase}"><small>${esc(autor)} · ${esc(convFecha(m.creado_en))}</small><div>${esc(texto)}</div></div>`;
 return (recibido?burbuja(m.mensaje||'Adjunto recibido','cliente','Cliente'):'')+
 (Array.isArray(m.adjuntos)&&m.adjuntos.length?'<p class="mut">Este mensaje contiene adjuntos. Consulta el original en WhatsApp.</p>':'')+
 (m.respuesta&&m.respuesta!=='(sin respuesta registrada)'?burbuja(m.respuesta,'equipo',m.tipo==='manual'?'Equipo':m.tipo==='saliente'?'Mensaje enviado':'Sara'):'');
 }).join('');}
async function convAbrir(jid,nombre){
 if(CONV.busy)return;
 if(CONV.jid===jid){document.querySelector('.conv-layout').classList.add('has-selection');return;}
 convGuardarBorrador();
 CONV.jid=jid;CONV.version++;CONV.antes=null;CONV.ids='';CONV.filas=new Map();CONV.cargandoHilo=false;CONV.connected=false;
 document.querySelector('.conv-layout').classList.add('has-selection');
 for(const b of document.querySelectorAll('#convLista .conv-contact')){b.classList.toggle('selected',b.dataset.jid===jid);b.setAttribute('aria-pressed',String(b.dataset.jid===jid));}
 document.getElementById('convDetalle').innerHTML=`<button class="btn sm conv-back" id="convVolver" type="button">← Conversaciones</button><div class="ch"><div><h3 id="convNombre">${esc(nombre)}</h3><div id="convTelefono" class="conv-phone"></div></div><span id="convEstado"></span></div><details class="conv-contact-options"><summary>Datos del contacto</summary><div class="toolbar"><button class="btn sm" id="convFicha" hidden>Ver ficha</button><button class="btn sm" id="convVincular">Vincular contacto</button></div></details><p id="convConexion" class="mut"></p><div class="toolbar"><button class="btn" id="convControl" disabled>Cargando…</button><button class="btn" id="convActualizar">Actualizar</button><button class="btn" id="convResolver" hidden>Marcar como resuelta</button></div><p id="convTarea" class="mut" role="status"></p><button class="btn sm" id="convAnteriores" hidden>Ver mensajes anteriores</button><div id="convHilo" class="conv-hilo" role="log" aria-label="Historial de mensajes" aria-live="polite"><p class="mut">Cargando historial…</p></div><form id="convEnviar"><label for="convTexto">Tu respuesta</label><textarea id="convTexto" rows="3" maxlength="4000" placeholder="Escribe aquí…"></textarea><p class="mut">Al enviar, Sara quedará pausada hasta que pulses «Volver a Sara» o marques la consulta como resuelta.</p><div class="conv-compose-footer"><small id="convBorrador">Borrador temporal · se conserva al cambiar de conversación</small><button class="btn primary" id="convSend" type="submit" disabled>Enviar respuesta</button></div><p id="convError" role="status"></p></form>`;
 document.getElementById('convTexto').value=CONV_BORRADORES.get(jid)||'';
 document.getElementById('convTexto').oninput=()=>{convGuardarBorrador();document.getElementById('convSend').disabled=!CONV.connected||CONV.busy||!document.getElementById('convTexto').value.trim();};
 document.getElementById('convVolver').onclick=()=>document.querySelector('.conv-layout').classList.remove('has-selection');
 document.getElementById('convResolver').onclick=async()=>{
  if(CONV.busy||!confirm('¿La consulta ya está resuelta? Se cerrará el pendiente y Sara atenderá los próximos mensajes.'))return;
  CONV.busy=true;try{await apiSend('POST','/api/conversaciones/resolver',{jid:CONV.jid});await convRefrescar();await CONV.actualizarLista?.();}catch(e){toast(e.message);}finally{CONV.busy=false;const send=document.getElementById('convSend');if(send)send.disabled=!CONV.connected||!document.getElementById('convTexto')?.value.trim();}
 };
 document.getElementById('convVincular').onclick=convVincular;
 document.getElementById('convFicha').onclick=()=>cliFicha(CONV.contacto.telefono_ficha);
 document.getElementById('convActualizar').onclick=()=>convRefrescar();
 document.getElementById('convAnteriores').onclick=()=>convRefrescar(true);
 document.getElementById('convControl').onclick=async()=>{
  if(CONV.busy)return;CONV.busy=true;
  try{await apiSend('POST','/api/conversaciones/control',{jid:CONV.jid,pausa:!CONV.pausada});await convRefrescar();await CONV.actualizarLista?.();}catch(e){toast(e.message);}finally{CONV.busy=false;const send=document.getElementById('convSend');if(send)send.disabled=!CONV.connected||!document.getElementById('convTexto')?.value.trim();}
 };
 document.getElementById('convEnviar').onsubmit=async e=>{
  e.preventDefault();if(CONV.busy)return;const input=document.getElementById('convTexto'),mensaje=input.value.trim(),destino=CONV.jid;if(!mensaje)return;
  CONV.busy=true;input.readOnly=true;document.getElementById('convSend').disabled=true;document.getElementById('convError').textContent='Enviando…';
  try{await apiSend('POST','/api/conversaciones/enviar',{jid:destino,mensaje});CONV_BORRADORES.delete(destino);input.value='';if(document.getElementById('convError'))document.getElementById('convError').textContent='Mensaje enviado.';await convRefrescar();await CONV.actualizarLista?.();}
  catch(e){if(document.getElementById('convError'))document.getElementById('convError').textContent=e.message;else toast(e.message);}
  finally{input.readOnly=false;CONV.busy=false;if(document.getElementById('convSend'))document.getElementById('convSend').disabled=!CONV.connected||!document.getElementById('convTexto')?.value.trim();}
 };
 await convRefrescar();
}
async function convRefrescar(anteriores=false){
 const jid=CONV.jid,version=CONV.version;if(!jid||CONV.cargandoHilo)return;CONV.cargandoHilo=true;
 try{const r=await apiRaw('/api/conversaciones/detalle?jid='+encodeURIComponent(jid)+(anteriores?'&cursor='+encodeURIComponent(JSON.stringify(CONV.antes)):''));
  if(CURRENT!=='conversaciones'||version!==CONV.version)return;
  CONV.contacto=r.cliente;
  document.getElementById('convNombre').textContent=r.cliente.nombre||'Contacto de WhatsApp';
  document.getElementById('convTelefono').textContent=r.cliente.telefono?'+'+r.cliente.telefono:'Teléfono no disponible';
  document.getElementById('convFicha').hidden=!(r.cliente.lead_id&&r.cliente.telefono_ficha&&puedeVer('clientes'));
  document.getElementById('convVincular').textContent=r.cliente.lead_id?'Cambiar contacto':'Vincular contacto';
  document.getElementById('convEnviar').hidden=!!r.cliente.solo_lectura;
  document.getElementById('convControl').hidden=!!r.cliente.solo_lectura;
  document.getElementById('convVincular').hidden=!!r.cliente.solo_lectura;
  const pendiente=r.pendiente??(r.atencion&&r.atencion.estado!=='resuelta');
  document.getElementById('convResolver').hidden=!!r.cliente.solo_lectura||!pendiente;
  document.getElementById('convTarea').textContent=pendiente?
   `Necesita atención · ${r.atencion?.responsable||'Equipo'}. ${r.atencion?.resumen||'Revisa el último mensaje del cliente y comprueba si la gestión se ha completado.'}${r.atencion?.aviso_error?' No se pudo confirmar el aviso por WhatsApp; revisar esta consulta.':''}`:'';
  document.getElementById('convTarea').hidden=!pendiente;
  CONV.connected=r.connected;document.getElementById('convSend').disabled=!r.connected||CONV.busy||!document.getElementById('convTexto').value.trim();
  document.getElementById('convControl').disabled=false;
  CONV.pausada=r.cliente.estado_ia==='pausada';
  const consultaAuto=CONV.pausada&&r.cliente.pausado_por==='sara'&&r.cliente.pausa_motivo==='consulta';
  if(consultaAuto)CONV.pausada=false;
  document.getElementById('convEstado').textContent=r.cliente.solo_lectura?'Solo lectura':consultaAuto?'Sara activa · consulta pendiente':CONV.pausada?'Atiende el equipo':'Sara activa';
  document.getElementById('convControl').textContent=CONV.pausada&&!consultaAuto?'Volver a Sara':'Responder yo · pausar Sara';
  document.getElementById('convConexion').textContent=r.connected?'': 'WhatsApp está desconectado. Puedes revisar el historial, pero no enviar.';
  const hilo=document.getElementById('convHilo'),h=hilo.scrollHeight,top=hilo.scrollTop;
  const alFinal=h-top-hilo.clientHeight<80;
  const primera=CONV.filas.size===0;
  for(const m of r.data)CONV.filas.set(String(m.id),m);
  const filas=[...CONV.filas.values()].sort((a,b)=>new Date(a.creado_en)-new Date(b.creado_en)||String(a.id).localeCompare(String(b.id)));
  const ids=JSON.stringify(filas);
  if(ids!==CONV.ids){
   hilo.innerHTML=convMensajes(filas)||'<p class="mut">WhatsApp todavía no ha enviado los mensajes de esta conversación.</p>';
   hilo.scrollTop=anteriores?top+hilo.scrollHeight-h:primera||alFinal?hilo.scrollHeight:top;
   CONV.ids=ids;
  }
  if(anteriores||primera){CONV.antes=r.cursor;document.getElementById('convAnteriores').hidden=!r.mas;}
 }catch(e){if(CURRENT==='conversaciones'&&version===CONV.version)document.getElementById('convConexion').textContent='No se pudo cargar la conversación. Pulsa Actualizar para reintentarlo.';}finally{if(version===CONV.version)CONV.cargandoHilo=false;}
}

async function convVincular(){
 const jid=CONV.jid;
 const ov=modal('Vincular contacto',`<p>Elige la ficha de Clientes que corresponde a esta conversación. Los mensajes seguirán enviándose a la misma conversación de WhatsApp.</p><form id="convLinkSearch"><label for="convLinkQ">Nombre o teléfono</label><div class="toolbar"><input id="convLinkQ" placeholder="Escribe al menos 2 caracteres" maxlength="100"><button class="btn">Buscar</button></div></form><div id="convLinkResultados" role="status"></div>${CONV.contacto?.vinculo_manual?'<button class="btn sm" id="convLinkAuto">Quitar vínculo manual</button>':''}`);
 let request=0;
 const vincular=async(id)=>{try{await apiSend('POST','/api/conversaciones/vincular',{jid,lead_id:id});ov.remove();if(CONV.jid===jid)await convRefrescar();await CONV.actualizarLista?.();toast('Contacto actualizado');}catch(e){toast(e.message);ov.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 ov.querySelector('#convLinkAuto')?.addEventListener('click',()=>{if(confirm('Se quitará el vínculo manual y se volverá a buscar una coincidencia por teléfono.'))vincular(null);});
 ov.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const n=++request,q=ov.querySelector('input').value.trim(),box=ov.querySelector('#convLinkResultados');
  if(q.length<2){box.textContent='Escribe al menos 2 caracteres.';return;}
  box.textContent='Buscando…';
  try{const r=await apiRaw('/api/conversaciones/contactos?q='+encodeURIComponent(q));if(n!==request||!ov.isConnected)return;
   box.innerHTML='';if(!r.data.length)box.textContent='No hay contactos con estos datos.';
   for(const c of r.data){const b=document.createElement('button');b.className='conv-contact';b.type='button';b.innerHTML=`<strong>${esc(c.nombre||'Sin nombre')}</strong><span>${esc(c.telefono||'Sin teléfono')}</span>`;b.onclick=()=>{if(confirm('¿Vincular esta conversación con '+(c.nombre||'este contacto')+' ('+(c.telefono||'sin teléfono')+')?')){b.disabled=true;vincular(c.id);}};box.appendChild(b);}
  }catch(e){box.textContent=e.message;}
 };
}
