export async function abrirPaginas(id,{apiRaw,apiSend,modal,token,esc,toast,facVistaDocumento,revisarDatos,marcarDuplicado,actualizar}){
 const {data:p}=await apiRaw(`/api/facturas/paginas/${encodeURIComponent(id)}`);
 const unidas=p.estado==='unidas';
 const revisable=d=>['revision','paginas'].includes(d.estado);
 const ov=modal(unidas?'Páginas unidas':'¿Son páginas de la misma factura?',`<p class="mut">${esc(p.motivo||'Compara los originales antes de decidir.')}</p><div class="fac-paginas-grid">${p.documentos.map((d,i)=>`<section><h3>${i+1}. ${esc(d.nombre||'Documento')}</h3><div data-original="${esc(d.id)}" class="fac-pagina-original">Cargando original…</div>${!unidas&&revisable(d)?`<div class="fac-paginas-acciones"><button class="btn sm" data-revisar="${esc(d.id)}">Revisar datos</button><button class="btn sm" data-duplicado="${esc(d.id)}">Duplicado de una compra registrada</button></div>`:''}</section>`).join('')}</div><p class="mut">${unidas?'Los originales se conservan.':p.accionable?'Al unir, se leerán todas las páginas como un único documento. Los originales se conservan.':'La propuesta ya no admite una unión. Puedes revisar cada documento pendiente por separado.'}</p>${unidas?'<p class="mut">Puedes deshacer mientras el documento unido no se haya registrado. Si se completó una factura existente, se puede restaurar mientras no haya sido editada después.</p>':''}<p class="fac-paginas-estado" role="status"></p><div class="fac-paginas-acciones">${unidas?'<button class="btn" data-decision="deshacer">Deshacer unión</button>':'<button class="btn" data-decision="separar">Son documentos distintos</button>' +(p.accionable?'<button class="btn primary" data-decision="unir">Unir como páginas</button>':'')+ ''}</div>`);
 ov.querySelector('.modal').classList.add('fac-paginas-modal');
 for(const btn of ov.querySelectorAll('[data-revisar]')) btn.onclick=()=>{
  ov.querySelector('[data-close]')?.click();
  revisarDatos(btn.dataset.revisar);
 };
 for(const btn of ov.querySelectorAll('[data-duplicado]')) btn.onclick=()=>marcarDuplicado(btn.dataset.duplicado,ov);
 const urls=[];const observer=new MutationObserver(()=>{if(!ov.isConnected){urls.forEach(u=>URL.revokeObjectURL(u));observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
 for(const btn of ov.querySelectorAll('[data-decision]'))btn.onclick=async()=>{
  const estado=ov.querySelector('.fac-paginas-estado');
  ov.querySelectorAll('[data-decision]').forEach(b=>b.disabled=true);
  estado.textContent=btn.dataset.decision==='unir'?'Uniendo y comprobando las páginas… Puede tardar un momento.':'Guardando decisión…';
  try{
   await apiSend('POST',`/api/facturas/paginas/${encodeURIComponent(id)}/${btn.dataset.decision}`,{});
   ov.querySelector('[data-close]')?.click();
   toast(btn.dataset.decision==='unir'?'Páginas unidas. Se conserva un único documento.':btn.dataset.decision==='deshacer'?'Unión deshecha. Los originales están disponibles.':'Se mantendrán separados.');
   await actualizar();
  }catch(e){estado.textContent=e.message;estado.scrollIntoView({block:'nearest'});ov.querySelectorAll('[data-decision]').forEach(b=>b.disabled=false);}
 };
 await Promise.all(p.documentos.map(async d=>{
  const caja=ov.querySelector(`[data-original="${d.id}"]`);
  try{
   const r=await fetch(`/api/facturas/recepciones/${encodeURIComponent(d.id)}/original?ver=1`,{headers:{Authorization:'Bearer '+token()}});
   if(!r.ok)throw new Error();const blob=await r.blob();if(!ov.isConnected)return;
   const url=URL.createObjectURL(blob);urls.push(url);
   const mime=blob.type.split(';')[0];
   if(mime==='application/pdf'){
    facVistaDocumento(caja,url,mime);
   }else{
    const el=document.createElement('img');el.src=url;el.alt='Página original';
    caja.replaceChildren(el);
    const ampliar=document.createElement('a');ampliar.href=url;ampliar.target='_blank';ampliar.rel='noopener';ampliar.textContent='Ampliar original';ampliar.className='btn sm';caja.after(ampliar);
   }
  }catch{if(ov.isConnected)caja.textContent='No se pudo cargar el original. Cierra y vuelve a abrir la propuesta.';}
 }));
}
