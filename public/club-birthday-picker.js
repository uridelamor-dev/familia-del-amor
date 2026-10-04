/* Mejora visual progresiva: conserva los selectores como fuente de valores. */
(() => {
  const dialog=document.querySelector('.profile-preview');
  if(!dialog)return;
  const controls=[...dialog.querySelectorAll('.birthday-row select')];
  const panel=document.createElement('div');
  panel.className='birthday-popover';panel.hidden=true;
  panel.innerHTML='<div class="birthday-popover-head"><strong></strong><button type="button" aria-label="Cerrar selector">×</button></div><input class="birthday-year-search" type="search" inputmode="numeric" placeholder="Buscar año…" aria-label="Buscar año"><div class="birthday-options" role="listbox"></div>';
  dialog.append(panel);
  const list=panel.querySelector('.birthday-options'),search=panel.querySelector('input');
  let active=null,trigger=null;
  function close(focus=false){panel.hidden=true;if(trigger){trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus({preventScroll:true});}active=null;}
  function render(){
    list.replaceChildren();
    const term=search.hidden?'':search.value.trim();
    [...active.options].filter(o=>!term||o.text.includes(term)).forEach(o=>{
      const button=document.createElement('button');button.type='button';button.role='option';button.setAttribute('aria-selected',String(o.selected));button.textContent=o.value?o.text:'Sin indicar';button.dataset.value=o.value;
      if(!o.value)button.className='birthday-empty';
      button.onclick=()=>{active.value=o.value;trigger.querySelector('span').textContent=o.value?o.text:active.options[0].text;active.dispatchEvent(new Event('change',{bubbles:true}));close(true);};
      list.append(button);
    });
    if(!list.children.length){const p=document.createElement('p');p.textContent='No hay años con ese número.';list.append(p);}
  }
  function open(select,button){
    if(active===select&&!panel.hidden){close(true);return;}
    close();active=select;trigger=button;
    button.setAttribute('aria-expanded','true');
    const label=select.getAttribute('aria-label');panel.querySelector('strong').textContent=label;list.setAttribute('aria-label',label);
    search.hidden=select.id!=='profileYear';search.value='';list.classList.toggle('birthday-days',select.id==='profileDay');
    panel.hidden=false;panel.style.visibility='hidden';render();
    const bounds=dialog.getBoundingClientRect(),rect=button.getBoundingClientRect();
    const width=Math.min(300,bounds.width-24);panel.style.width=width+'px';
    const height=Math.min(310,bounds.height-24);panel.style.maxHeight=height+'px';
    const actual=panel.getBoundingClientRect().height;
    const top=rect.bottom+8+actual<=bounds.bottom-12?rect.bottom+8:Math.max(bounds.top+12,rect.top-actual-8);
    panel.style.left=Math.max(bounds.left+12,Math.min(rect.left,bounds.right-width-12))+'px';panel.style.top=top+'px';panel.style.visibility='visible';
    if(!search.hidden)search.focus({preventScroll:true});else (list.querySelector('[aria-selected="true"]')||list.querySelector('button'))?.focus({preventScroll:true});
  }
  controls.forEach(select=>{
    const button=document.createElement('button');button.type='button';button.className='birthday-trigger';button.setAttribute('aria-label',select.getAttribute('aria-label'));button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
    const span=document.createElement('span');span.textContent=select.selectedOptions[0].text;button.append(span);button.insertAdjacentHTML('beforeend','<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    select.hidden=true;select.after(button);button.onclick=()=>open(select,button);
    button.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open(select,button);}});
  });
  search.addEventListener('input',render);
  panel.querySelector('.birthday-popover-head button').onclick=()=>close(true);
  panel.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
    const buttons=[...list.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(e.key)&&e.target!==search){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(['ArrowUp','ArrowLeft'].includes(e.key)?-1:1)));buttons[next]?.focus();}
  });
  dialog.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!trigger?.contains(e.target))close();});
  dialog.addEventListener('focusin',e=>{if(!panel.hidden&&!panel.contains(e.target)&&e.target!==trigger)close();});
  dialog.querySelector('.club-layout').addEventListener('scroll',()=>close(),{passive:true});
  dialog.addEventListener('close',()=>close());window.addEventListener('resize',()=>close());
})();
