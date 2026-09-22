/* Bandeja de pruebas: no se mezcla con el número operativo ni activa a Sara. */
window.CloudInbox = (() => {
  let dispose = () => {};
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {pending:'Pendiente',human:'Atención humana',resolved:'Resuelta',received:'Recibido',sending:'Confirmando envío…',uncertain:'Sin confirmar · no reenviar',accepted:'Aceptado por Meta',sent:'Enviado',delivered:'Entregado',read:'Leído',failed:'No enviado'};
  const date = value => new Date(value).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  async function mount(root, {get,post,token,user}) {
    dispose(); let active=true, selected=null, detail=null, seq=0, templates=[], busy=false;
    const drafts=new Map(); let request=null; let listPage=0;
    dispose=()=>{active=false;clearInterval(timer);};
    let timer;
    root.innerHTML='<div class="ph"><div class="eyebrow">Comunicación</div><h1>Bandeja WhatsApp</h1><p class="sub">Piloto de la conexión oficial · atención humana</p></div><div class="card">Comprobando la configuración…</div>';
    let status;
    try{status=await get('/api/whatsapp/cloud/status');}catch(e){if(active)root.innerHTML=`<div class="card">${escape(e.message)}</div>`;return;}
    if(!active)return;
    if(!status.configured){root.innerHTML=`<div class="ph"><h1>Bandeja WhatsApp</h1><p class="sub">Preparada para las pruebas de conexión oficial</p></div><div class="card"><h2>Falta conectar el número de prueba</h2><p>El número habitual sigue funcionando con su configuración actual. Esta bandeja se habilitará al completar la configuración de Meta.</p><p class="mut">Sara y las campañas están desactivadas en el piloto.</p><a class="btn" href="#whatsapp">Volver a WhatsApp</a></div>`;return;}
    root.innerHTML=`<div class="ph"><div><div class="eyebrow">Comunicación · piloto</div><h1>Bandeja WhatsApp</h1><p class="sub">Solo teléfonos de prueba. Sara y campañas desactivadas.</p></div><a href="#whatsapp" class="btn">Conexión actual</a></div>
      <div class="cloud-notice" role="status" aria-live="polite"></div>
      <div class="cloud-inbox"><aside class="cloud-sidebar card"><form class="cloud-search"><label>Buscar conversación<input name="search" type="search" placeholder="Nombre o teléfono"></label><label>Estado<select name="state"><option value="">Todas</option><option value="pending">Pendientes</option><option value="human">Atención humana</option><option value="resolved">Resueltas</option></select></label><button class="btn" type="submit">Buscar</button></form><button class="btn" data-new>Nuevo chat de prueba</button><div class="cloud-list" aria-label="Conversaciones"></div></aside>
      <section class="cloud-chat card"><div class="cloud-empty">Selecciona una conversación para leerla y responder.</div></section></div>`;
    const chat=root.querySelector('.cloud-chat'), list=root.querySelector('.cloud-list'), notice=root.querySelector('.cloud-notice');
    const say=text=>{notice.textContent=text;};
    async function refreshList(append=false){
      const form=root.querySelector('.cloud-search'); if(!active || !form)return;
      if(!append)listPage=0;
      const query=new URLSearchParams({q:form.search.value,state:form.state.value,page:String(listPage)});
      const r=await get('/api/whatsapp/cloud/conversations?'+query);
      if(!active)return;
      const html=r.data.length ? r.data.map(c=>`<button class="cloud-contact ${c.phone===selected?'selected':''}" data-phone="${escape(c.phone)}"><b>${escape(c.name || '+'+c.phone)}</b><span>${escape(c.preview || 'Sin mensajes todavía')}</span><small>${escape(labels[c.state])}${c.owner?' · '+escape(c.owner):''}</small></button>`).join(''):'<p class="mut">No hay conversaciones con ese filtro.</p>';
      const more=r.nextPage!==null && r.nextPage!==undefined ? '<button class="btn" data-more>Más conversaciones</button>' : '';
      if(append){list.querySelector('[data-more]')?.remove();list.insertAdjacentHTML('beforeend',html+more);}else if(list.innerHTML!==html+more){list.innerHTML=html+more;}
    }
    function saveDraft(){const box=chat.querySelector('textarea');if(selected && box)drafts.set(selected,box.value);}
    function renderDetail(){
      const c=detail.conversation, owned=c.state==='human' && c.owner===user.username;
      const open=c.last_inbound_at && Date.now()-new Date(c.last_inbound_at).getTime()<86400000;
      chat.innerHTML=`<div class="cloud-chat-head"><button class="btn cloud-back" data-back>Conversaciones</button><div class="grow"><h2>${escape(c.name || '+'+c.phone)}</h2><span class="mut">+${escape(c.phone)} · ${escape(labels[c.state])}${c.owner?' · '+escape(c.owner):''}</span></div><button class="btn" data-refresh>Actualizar</button>${owned?'<button class="btn" data-resolve>Resolver</button>':`<button class="btn primary" data-take ${c.owner && c.state==='human'?'disabled':''}>Tomar conversación</button>`}</div>
        <div class="cloud-messages" aria-label="Mensajes"><button class="btn sm" data-older ${detail.messages.length<100?'hidden':''}>Cargar anteriores</button>${bubbles(detail.messages)}</div>
        <form class="cloud-compose"><p class="mut">${open?'Puedes responder dentro de las 24 horas desde el último mensaje del cliente.':'Para iniciar o retomar el contacto necesitas una plantilla aprobada.'}</p>
        <label>Tipo de mensaje<select name="kind" ${!owned?'disabled':''}><option value="text" ${!open?'disabled':''}>Respuesta libre</option><option value="template" ${!open?'selected':''}>Plantilla aprobada</option></select></label>
        <div data-free><label>Mensaje<textarea name="text" rows="3" maxlength="4096" placeholder="Escribe tu respuesta" ${!owned?'disabled':''}>${escape(drafts.get(selected)||'')}</textarea></label></div>
        <div data-template hidden><label>Plantilla<select name="template" ${!owned?'disabled':''}><option value="">Selecciona una plantilla</option>${templates.map((t,i)=>`<option value="${i}">${escape(t.name)} · ${escape(t.language)}</option>`).join('')}</select></label><p data-preview class="mut"></p><div data-parameters></div></div>
        <div class="cloud-compose-foot"><span class="mut">${owned?'Responderás como '+escape(user.nombre || user.username):'Toma la conversación para responder.'}</span><button class="btn primary" type="submit" ${!owned?'disabled':''}>Enviar</button></div></form>`;
      kindChanged(); const messages=chat.querySelector('.cloud-messages');messages.scrollTop=messages.scrollHeight;
    }
    function bubbles(messages){return messages.map(m=>`<article class="cloud-bubble ${m.direction==='out'?'out':''}"><div>${escape(m.body)}</div>${m.media_id?`<button class="btn sm" data-media="${escape(m.id)}" data-filename="${escape(m.filename || ({audio:"audio.ogg",image:"imagen.jpg",video:"video.mp4",sticker:"sticker.webp"}[m.type]) || "adjunto")}">Descargar ${escape(m.type==='audio'?'audio':m.filename || 'adjunto')}</button>`:''}<small>${escape(m.author || (m.direction==='in'?'Cliente':'Equipo'))} · ${escape(date(m.created_at))} · ${escape(labels[m.status] || m.status)}</small></article>`).join('');}
    function kindChanged(){const form=chat.querySelector('.cloud-compose');if(!form)return;const t=form.kind.value==='template';form.querySelector('[data-free]').hidden=t;form.querySelector('[data-template]').hidden=!t;}
    async function select(number){saveDraft();selected=number;request=null;const current=++seq;const r=await get('/api/whatsapp/cloud/conversations/'+number);if(!active || current!==seq)return;detail=r;root.querySelector('.cloud-inbox').classList.add('show-chat');renderDetail();await refreshList();}
    root.querySelector('.cloud-search').onsubmit=e=>{e.preventDefault();refreshList().catch(e=>say(e.message));};
    root.querySelector('[data-new]').onclick=async()=>{
      const n=prompt('Teléfono de prueba con prefijo internacional (ej. +34…).');if(!n)return;
      try{await post('/api/whatsapp/cloud/conversations',{phone:n});await select(n.replace(/[ +().-]/g,'').replace(/^00/,''));}catch(e){say(e.message);}
    };
    list.onclick=e=>{if(e.target.closest('[data-more]')){listPage++;refreshList(true).catch(e=>say(e.message));return;}const b=e.target.closest('[data-phone]');if(b)select(b.dataset.phone).catch(e=>say(e.message));};
    chat.onchange=e=>{
      if(e.target.name==='kind')kindChanged();
      if(e.target.name==='template'){
        const t=templates[e.target.value], text=t?.components?.find(c=>c.type==='BODY')?.text || '';
        chat.querySelector('[data-preview]').textContent=text;
        const n=new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map(m=>m[1])).size;
        chat.querySelector('[data-parameters]').innerHTML=Array.from({length:n},(_,i)=>`<label>Variable ${i+1}<input data-param required maxlength="500"></label>`).join('');
      }
    };
    chat.onclick=async e=>{
      const b=e.target.closest('button');if(!b || busy)return;
      try{
        if(b.hasAttribute('data-back'))root.querySelector('.cloud-inbox').classList.remove('show-chat');
        if(b.hasAttribute('data-take') || b.hasAttribute('data-resolve')){busy=true;await post(`/api/whatsapp/cloud/conversations/${selected}/${b.hasAttribute('data-take')?'take':'resolve'}`,{});await select(selected);}
        if(b.hasAttribute('data-refresh'))await select(selected);
        if(b.hasAttribute('data-older')){
          const number=selected, r=await get(`/api/whatsapp/cloud/conversations/${number}?before=${detail.messages[0].id}`);if(!active || selected!==number)return;
          detail.messages=[...r.messages,...detail.messages];b.insertAdjacentHTML('afterend',bubbles(r.messages));b.hidden=r.messages.length<100;
        }
        if(b.dataset.media){
          const r=await fetch('/api/whatsapp/cloud/media/'+b.dataset.media,{headers:{Authorization:'Bearer '+token()}});if(!r.ok)throw new Error('No se pudo descargar el adjunto.');
          const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=b.dataset.filename || 'adjunto';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
        }
      }catch(e){say(e.message);}finally{busy=false;}
    };
    chat.onsubmit=async e=>{
      e.preventDefault();if(busy)return;const form=e.target,number=selected;
      let body;
      if(form.kind.value==='text')body={type:'text',text:form.text.value};
      else{const t=templates[form.template.value];if(!t){say('Selecciona una plantilla.');return;}body={type:'template',name:t.name,language:t.language,parameters:[...form.querySelectorAll('[data-param]')].map(x=>x.value)};}
      const fingerprint=JSON.stringify(body);
      if(!request || request.fingerprint!==fingerprint)request={fingerprint,id:crypto.randomUUID()};
      busy=true;form.querySelector('[type=submit]').disabled=true;
      try{
        const r=await post(`/api/whatsapp/cloud/conversations/${number}/messages`,{...body,requestId:request.id});
        say(labels[r.message.status] || 'Estado actualizado.');
        if(['accepted','sent','delivered','read'].includes(r.message.status)){drafts.delete(number);form.text.value='';request=null;}
        const r2=await get('/api/whatsapp/cloud/conversations/'+number);
        if(active && selected===number){detail=r2;renderDetail();}await refreshList();
      }catch(e){say(e.message);saveDraft();}finally{busy=false;const button=chat.querySelector('[type=submit]');if(button)button.disabled=false;}
    };
    try{
      const r=await get('/api/whatsapp/cloud/templates');templates=r.data.filter(t=>t.status==='APPROVED' && (t.components || []).every(c=>['BODY','FOOTER'].includes(c.type)));
      await refreshList();
    }catch(e){say(e.message);await refreshList().catch(e=>say(e.message));}
    timer=setInterval(async()=>{
      if(!active || busy || document.hidden)return;
      try{if(listPage===0)await refreshList();if(selected){const number=selected,r=await get('/api/whatsapp/cloud/conversations/'+number);if(!active || number!==selected)return;
        const messages=chat.querySelector('.cloud-messages');if(messages){
          const changed=detail.conversation.state!==r.conversation.state || detail.conversation.owner!==r.conversation.owner;
          const merged=new Map(detail.messages.map(m=>[m.id,m]));for(const m of r.messages)merged.set(m.id,m);
          r.messages=[...merged.values()].sort((a,b)=>Number(a.id)-Number(b.id));
          if(changed){saveDraft();detail=r;renderDetail();}
          else if(JSON.stringify(detail.messages)!==JSON.stringify(r.messages)){
            const bottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<60;
            messages.innerHTML=`<button class="btn sm" data-older ${r.messages.length<100?'hidden':''}>Cargar anteriores</button>${bubbles(r.messages)}`;
            if(bottom)messages.scrollTop=messages.scrollHeight;detail=r;
          }
        }
      }}catch(e){say(e.message);}
    },5000);
  }
  return {mount,unmount:()=>dispose()};
})();
