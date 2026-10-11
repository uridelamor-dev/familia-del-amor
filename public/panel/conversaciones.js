/* Bandeja de atención humana. No se envía al pulsar Enter: siempre con el botón. */
let CONV={jid:null,version:0,timer:null,busy:false};
async function loadConversaciones(){
 clearInterval(CONV.timer);CONV={jid:null,version:CONV.version+1,timer:null,busy:false};
 const view=document.getElementById('view');
 view.innerHTML=`<div class="ph"><div class="eyebrow">Atención al cliente</div><h1>Conversaciones</h1><div class="sub">Revisa las respuestas y toma el relevo de Sara cuando haga falta.</div></div>
 <div class="conv-layout"><section class="card conv-list"><form id="convBuscar"><label for="convQ">Buscar cliente o teléfono</label><div class="toolbar"><input id="convQ" maxlength="100" placeholder="Nombre o teléfono"><button class="btn" type="submit">Buscar</button></div><label><input id="convPendientes" type="checkbox"> Solo necesitan atención</label></form><div id="convLista"></div><button class="btn" id="convMas" hidden>Ver más conversaciones</button></section><section class="card conv-detail" id="convDetalle"><p class="mut">Elige una conversación para ver el historial.</p></section></div>`;
 let offset=0,peticion=0;
 document.getElementById('convBuscar').onsubmit=e=>{e.preventDefault();offset=0;lista(false);};
 document.getElementById('convPendientes').onchange=()=>{offset=0;lista(false);};
 document.getElementById('convMas').onclick=()=>{offset+=50;lista(true);};
 async function lista(append){
  const solicitud=++peticion,version=CONV.version,q=document.getElementById('convQ').value,pend=document.getElementById('convPendientes').checked;
  try{const r=await apiRaw('/api/conversaciones?q='+encodeURIComponent(q)+'&pendientes='+(pend?'1':'0')+'&offset='+offset);
   if(CURRENT!=='conversaciones'||version!==CONV.version||solicitud!==peticion)return;
   const box=document.getElementById('convLista');if(!append)box.innerHTML='';
   if(!r.data.length&&!append)box.innerHTML='<p class="mut">No hay conversaciones con estos filtros.</p>';
   for(const c of r.data){const b=document.createElement('button');b.className='conv-contact';b.type='button';b.innerHTML=`<strong>${esc(c.nombre)}</strong>${c.telefono&&c.telefono!==c.nombre?`<span class="conv-phone">+${esc(c.telefono)}</span>`:''}<span class="pill ${c.pendiente?'warn':''}">${c.pendiente?'Necesita atención':'Sara activa'}</span><small>${esc(convFecha(c.creado_en))}</small><span class="conv-preview">${esc((c.respuesta||c.mensaje||'Adjunto').slice(0,100))}</span>`;b.onclick=()=>convAbrir(c.jid,c.nombre);box.appendChild(b);}
   document.getElementById('convMas').hidden=!r.mas;
  }catch(e){toast(e.message);}
 }
 CONV.actualizarLista=()=>{offset=0;return lista(false);};
 await lista(false);
 CONV.timer=setInterval(()=>{if(CURRENT!=='conversaciones'){clearInterval(CONV.timer);return;}if(!CONV.busy){if(CONV.jid)convRefrescar();if(offset===0)lista(false);}},15000);
}
function convFecha(v){const d=new Date(v);return Number.isNaN(+d)?String(v||''):d.toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function convMensajes(filas){return filas.map(m=>{
 const recibido=!['saliente','manual'].includes(m.tipo);
 const burbuja=(texto,clase,autor)=>`<div class="conv-bubble ${clase}"><small>${esc(autor)} · ${esc(convFecha(m.creado_en))}</small><div>${esc(texto)}</div></div>`;
 return (recibido?burbuja(m.mensaje||'Adjunto recibido','cliente','Cliente'):'')+
 (Array.isArray(m.adjuntos)&&m.adjuntos.length?'<p class="mut">Este mensaje contiene adjuntos. Consulta el original en WhatsApp.</p>':'')+
 (m.respuesta&&m.respuesta!=='(sin respuesta registrada)'?burbuja(m.respuesta,'equipo',m.tipo==='manual'?'Equipo':m.tipo==='saliente'?'Mensaje enviado':'Sara'):'');
 }).join('');}
async function convAbrir(jid,nombre){
 if(CONV.busy)return;
 if(document.getElementById('convTexto')?.value.trim()&&!confirm('Hay un mensaje sin enviar. ¿Cambiar de conversación?'))return;
 CONV.jid=jid;CONV.version++;CONV.antes=null;CONV.ids='';
 document.getElementById('convDetalle').innerHTML=`<div class="ch"><div><h3 id="convNombre">${esc(nombre)}</h3><div id="convTelefono" class="conv-phone"></div></div><span id="convEstado"></span></div><div class="toolbar"><button class="btn sm" id="convFicha" hidden>Ver ficha</button><button class="btn sm" id="convVincular">Vincular contacto</button></div><p id="convConexion" class="mut"></p><div class="toolbar"><button class="btn" id="convControl">Cargando…</button><button class="btn" id="convActualizar">Actualizar</button></div><button class="btn sm" id="convAnteriores" hidden>Ver mensajes anteriores</button><div id="convHilo" class="conv-hilo" aria-live="polite"></div><form id="convEnviar"><label for="convTexto">Tu respuesta</label><textarea id="convTexto" rows="3" maxlength="4000" placeholder="Escribe aquí…"></textarea><p class="mut">Al enviar, Sara quedará pausada hasta que pulses «Volver a Sara».</p><button class="btn primary" id="convSend" type="submit">Enviar respuesta</button><p id="convError" role="status"></p></form>`;
 document.getElementById('convVincular').onclick=convVincular;
 document.getElementById('convFicha').onclick=()=>cliFicha(CONV.contacto.telefono_ficha);
 document.getElementById('convActualizar').onclick=()=>convRefrescar();
 document.getElementById('convAnteriores').onclick=()=>convRefrescar(true);
 document.getElementById('convControl').onclick=async()=>{
  if(CONV.busy)return;CONV.busy=true;
  try{await apiSend('POST','/api/conversaciones/control',{jid:CONV.jid,pausa:!CONV.pausada});await convRefrescar();}catch(e){toast(e.message);}finally{CONV.busy=false;}
 };
 document.getElementById('convEnviar').onsubmit=async e=>{
  e.preventDefault();if(CONV.busy)return;const input=document.getElementById('convTexto'),mensaje=input.value.trim();if(!mensaje)return;
  CONV.busy=true;document.getElementById('convSend').disabled=true;document.getElementById('convError').textContent='Enviando…';
  try{await apiSend('POST','/api/conversaciones/enviar',{jid:CONV.jid,mensaje});input.value='';if(document.getElementById('convError'))document.getElementById('convError').textContent='Mensaje enviado.';await convRefrescar();}
  catch(e){if(document.getElementById('convError'))document.getElementById('convError').textContent=e.message;else toast(e.message);}
  finally{CONV.busy=false;if(document.getElementById('convSend'))document.getElementById('convSend').disabled=false;}
 };
 await convRefrescar();
}
async function convRefrescar(anteriores=false){
 const jid=CONV.jid,version=CONV.version;if(!jid)return;
 try{const r=await apiRaw('/api/conversaciones/detalle?jid='+encodeURIComponent(jid)+(anteriores?'&antes='+CONV.antes:''));
  if(CURRENT!=='conversaciones'||version!==CONV.version)return;
  CONV.contacto=r.cliente;
  document.getElementById('convNombre').textContent=r.cliente.nombre||'Contacto de WhatsApp';
  document.getElementById('convTelefono').textContent=r.cliente.telefono?'+'+r.cliente.telefono:'Teléfono no disponible';
  document.getElementById('convFicha').hidden=!(r.cliente.lead_id&&r.cliente.telefono_ficha&&puedeVer('clientes'));
  document.getElementById('convVincular').textContent=r.cliente.lead_id?'Cambiar contacto':'Vincular contacto';
  CONV.pausada=r.cliente.estado_ia==='pausada';
  document.getElementById('convEstado').textContent=CONV.pausada?'Atiende el equipo':'Sara activa';
  document.getElementById('convControl').textContent=CONV.pausada?'Volver a Sara':'Responder yo · pausar Sara';
  document.getElementById('convConexion').textContent=r.connected?'': 'WhatsApp está desconectado. Puedes revisar el historial, pero no enviar.';
  const hilo=document.getElementById('convHilo'),ids=r.data.map(x=>x.id).join(',');
  if(anteriores){const h=hilo.scrollHeight;hilo.insertAdjacentHTML('afterbegin',convMensajes(r.data));hilo.scrollTop=hilo.scrollHeight-h;}
  else if(ids!==CONV.ids){hilo.innerHTML=convMensajes(r.data)||'<p class="mut">Sin mensajes.</p>';hilo.scrollTop=hilo.scrollHeight;CONV.ids=ids;}
  else return;
  CONV.antes=r.data[0]?.id;document.getElementById('convAnteriores').hidden=!r.mas;
 }catch(e){if(version===CONV.version)toast(e.message);}
}

async function convVincular(){
 const jid=CONV.jid;
 const ov=modal('Vincular contacto',`<p>Elige la ficha de Clientes que corresponde a esta conversación. Los mensajes seguirán enviándose a la misma conversación de WhatsApp.</p><form id="convLinkSearch"><label for="convLinkQ">Nombre o teléfono</label><div class="toolbar"><input id="convLinkQ" placeholder="Escribe al menos 2 caracteres" maxlength="100"><button class="btn">Buscar</button></div></form><div id="convLinkResultados" role="status"></div>${CONV.contacto?.vinculo_manual?'<button class="btn sm" id="convLinkAuto">Quitar vínculo manual</button>':''}`);
 let request=0;
 const vincular=async(id)=>{try{await apiSend('POST','/api/conversaciones/vincular',{jid,lead_id:id});ov.remove();if(CONV.jid===jid)await convRefrescar();await CONV.actualizarLista?.();toast('Contacto actualizado');}catch(e){toast(e.message);}};
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
