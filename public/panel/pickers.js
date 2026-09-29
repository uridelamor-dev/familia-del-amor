// Shared rounded menus. Original controls keep their value, form submission and events.
(() => {
  let control = null, menu = null, options = [], active = -1;
  const selector = 'select:not([multiple]):not([size]),input[data-picker-list]';
  function enhance() {
    document.querySelectorAll('input[list]').forEach(input => {
      input.dataset.pickerList = input.getAttribute('list');
      input.removeAttribute('list');
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false');
    });
  }
  function close() {
    if (control) {
      control.setAttribute('aria-expanded','false');
      control.removeAttribute('aria-controls');
      control.removeAttribute('aria-activedescendant');
    }
    menu?.remove(); menu = null; control = null;
  }
  function position() {
    if (!menu || !control?.isConnected) return close();
    const r = control.getBoundingClientRect();
    const w = Math.min(Math.max(r.width, 180), innerWidth - 24);
    menu.style.width = w + 'px';
    menu.style.left = Math.max(12,Math.min(r.left,innerWidth-w-12)) + 'px';
    const below = innerHeight-r.bottom-16, above = r.top-16;
    const up = below < 180 && above > below;
    menu.style.maxHeight = Math.min(320,Math.max(80,up?above:below)) + 'px';
    menu.style.top = (up ? Math.max(12,r.top-menu.offsetHeight-6) : r.bottom+6) + 'px';
  }
  function highlight(i) {
    active=i;
    menu.querySelectorAll('[role=option]').forEach((el,n)=>el.classList.toggle('is-active',n===i));
    const el=menu.querySelector(`[data-index="${i}"]`);
    if(el) {control.setAttribute('aria-activedescendant',el.id);if(el.offsetTop<menu.scrollTop)menu.scrollTop=el.offsetTop;else if(el.offsetTop+el.offsetHeight>menu.scrollTop+menu.clientHeight)menu.scrollTop=el.offsetTop+el.offsetHeight-menu.clientHeight;}
  }
  function choose(i) {
    const option=options[i]; if(!option || option.disabled)return;
    const target=control;
    if(target.tagName==='SELECT')target.selectedIndex=option.index;
    else target.value=option.value;
    close(); target.focus({preventScroll:true});
    target.dispatchEvent(new Event('input',{bubbles:true}));
    target.dispatchEvent(new Event('change',{bubbles:true}));
    // Input handlers may synchronously open suggestions again.
    close();
  }
  function paint() {
    if(!control || !menu)return;
    const source=control.tagName==='SELECT'?control:document.getElementById(control.dataset.pickerList);
    options=Array.from(source?.options||[]).filter(o=>!o.hidden);
    menu.replaceChildren();
    if(!options.length) {
      const empty=document.createElement('div');empty.className='picker-empty';
      empty.textContent=control.value.length<2?'Escribe una población o código postal':'Sin sugerencias disponibles';menu.append(empty);
    }
    options.forEach((o,i)=>{
      const row=document.createElement('div');row.className='picker-option';row.id='panel-picker-option-'+i;
      row.setAttribute('role','option');row.dataset.index=i;
      row.setAttribute('aria-selected',String(o.value===control.value));
      row.setAttribute('aria-disabled',String(o.disabled || o.parentElement?.disabled || false));
      const label=document.createElement('span');label.textContent=control.tagName==='SELECT'?o.label:o.value;row.append(label);
      if(control.tagName!=='SELECT' && o.label!==o.value){const sub=document.createElement('small');sub.textContent=o.label;row.append(sub);}
      const check=document.createElement('span');check.className='picker-check';check.textContent=o.value===control.value?'✓':'';check.setAttribute('aria-hidden','true');row.append(check);
      row.addEventListener('pointerdown',e=>e.preventDefault());
      row.addEventListener('click',()=>{if(row.getAttribute('aria-disabled')!=='true')choose(i);});
      menu.append(row);
    });
    active=options.findIndex(o=>o.value===control.value);
    position();if(active>=0)highlight(active);
  }
  function open(target) {
    if(target.disabled)return;
    close(); control=target;
    menu=document.createElement('div');menu.id='panel-picker-menu';menu.className='picker-menu';menu.setAttribute('role','listbox');
    const label=target.labels?.[0]?.textContent || target.getAttribute('aria-label') || 'Opciones';menu.setAttribute('aria-label',label);
    (target.closest('dialog[open]')||document.body).append(menu);
    target.setAttribute('aria-expanded','true');target.setAttribute('aria-controls',menu.id);
    target.focus({preventScroll:true});paint();
  }
  document.addEventListener('pointerdown',e=>{
    const target=e.target.closest(selector);
    if(target && target.tagName==='SELECT') {e.preventDefault(); if(control===target)close();else open(target);}
    else if(!menu?.contains(e.target) && e.target!==control)close();
  });
  document.addEventListener('click',e=>{const t=e.target.closest('input[data-picker-list]');if(t && control!==t)open(t);});
  document.addEventListener('input',e=>{if(e.target.matches('input[data-picker-list]')){if(control!==e.target)open(e.target);else paint();}});
  document.addEventListener('keydown',e=>{
    const target=e.target.closest(selector);if(!target)return;
    if(e.key==='Escape'){if(menu){e.preventDefault();e.stopPropagation();close();}return;}
    if(e.key==='Tab'){close();return;}
    if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key) && (target.tagName==='SELECT' || e.key!==' ')) {
      if(!menu && e.key==='Enter' && target.tagName!=='SELECT')return;
      e.preventDefault();if(control!==target){open(target);return;}
      if(e.key==='Enter'||e.key===' '){if(active>=0)choose(active);return;}
      const step=e.key==='ArrowDown'?1:-1;
      let i=active;
      for(let n=0;n<options.length;n++){i=(i+step+options.length)%options.length;if(!options[i].disabled && !options[i].parentElement?.disabled){highlight(i);break;}}
    }
  },true);
  document.addEventListener('focusin',e=>{if(control && e.target!==control && !menu?.contains(e.target))close();});
  window.addEventListener('resize',close);
  window.addEventListener('scroll',e=>{if(menu && !menu.contains(e.target))close();},true);
  new MutationObserver(records=>{
    enhance();
    if(control && !control.isConnected)close();
    else if(control && records.some(r=>r.target===document.getElementById(control.dataset.pickerList)||r.target===control))paint();
  }).observe(document.body,{childList:true,subtree:true});
  enhance();
})();
