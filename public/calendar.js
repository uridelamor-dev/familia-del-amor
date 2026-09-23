/* Calendario compartido. Conserva los inputs originales, valores ISO, validación y eventos. */
(() => {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = () => new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Madrid'});
  const parse = s => new Date(`${s.slice(0,10)}T12:00:00`);
  const labels = {
    es: {title:'Elegir fecha',month:'Mes',year:'Año',prev:'Mes anterior',next:'Mes siguiente',today:'Hoy',clear:'Quitar fecha',close:'Cerrar',apply:'Aplicar',time:'Hora'},
    ca: {title:'Tria una data',month:'Mes',year:'Any',prev:'Mes anterior',next:'Mes següent',today:'Avui',clear:'Esborra la data',close:'Tanca',apply:'Aplica',time:'Hora'},
    en: {title:'Choose date',month:'Month',year:'Year',prev:'Previous month',next:'Next month',today:'Today',clear:'Clear date',close:'Close',apply:'Apply',time:'Time'}
  };
  let active;
  const el = (tag, attrs={}, text='') => {
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    node.textContent=text;return node;
  };
  function close() {
    if(!active)return;
    const {dialog,trigger}=active; active=null;
    dialog.close();dialog.remove();
    trigger.removeAttribute('aria-expanded');
    if(trigger.isConnected)trigger.focus({preventScroll:true});
  }
  function open(trigger, input, options={}) {
    if(!input || input.disabled || (input.readOnly && !options.legacy)) return;
    close();
    const lang=window.currentLang || document.documentElement.lang || 'es';
    const t=labels[lang.slice(0,2)] || labels.es;
    const locale=lang==='ca'?'ca-ES':lang==='en'?'en-GB':'es-ES';
    const mode=input.type==='month'?'month':input.type==='datetime-local'?'datetime':'date';
    const min=input.min || input.dataset.min || options.min || '';
    const nacimiento=/nac|birth/i.test(input.name || input.id || '');
    const ayer=parse(today());ayer.setDate(ayer.getDate()-1);
    const max=input.max || input.dataset.max || options.max || (nacimiento ? iso(ayer) : '');
    let selected=input.value || '', month=(selected || today()).slice(0,7);
    if(min && month<min.slice(0,7))month=min.slice(0,7);
    if(max && month>max.slice(0,7))month=max.slice(0,7);
    const dialog=el('dialog',{class:'fa-calendar','aria-label':t.title});
    const head=el('div',{class:'fc-head'}), controls=el('div',{class:'fc-controls'});
    const monthSelect=el('select',{'aria-label':t.month});
    for(let i=0;i<12;i++)monthSelect.append(el('option',{value:pad(i+1)},new Intl.DateTimeFormat(locale,{month:'long'}).format(new Date(2024,i,1))));
    const yearInput=el('input',{type:'number',inputmode:'numeric','aria-label':t.year,min:'1',max:'9999',class:'fc-year'});
    const button=(text,label)=>el('button',{type:'button','aria-label':label || text},text);
    const prev=button('‹',t.prev),next=button('›',t.next),dismiss=button('×',t.close);
    dismiss.className='fc-dismiss'; dismiss.onclick=close;
    controls.append(monthSelect,yearInput); head.append(controls,prev,next,dismiss);
    const weekdays=el('div',{class:'fc-weekdays','aria-hidden':'true'});
    for(let i=0;i<7;i++)weekdays.append(el('span',{},new Intl.DateTimeFormat(locale,{weekday:'short'}).format(new Date(2024,0,1+i))));
    const days=el('div',{class:'fc-days',role:'group','aria-label':t.title});
    const footer=el('div',{class:'fc-footer'}),clear=button(t.clear),now=button(t.today);
    footer.append(clear,now);
    let time;
    if(mode==='datetime') {
      time=el('input',{type:'time','aria-label':t.time,value:selected.slice(11)||'12:00'});
      const timeRow=el('label',{class:'fc-time'},t.time);timeRow.append(time);dialog.append(timeRow);
    }
    dialog.prepend(head);dialog.append(weekdays,days,footer);
    let apply;
    if(mode!=='date') {apply=button(t.apply);apply.className='fc-apply';footer.append(apply);}
    const allowed=value=>!((min && value<min) || (max && value>max));
    const valueFor=day=>mode==='month'?day.slice(0,7):mode==='datetime'?`${day}T${time.value || '12:00'}`:day;
    const write=value=> {
      if(value && !allowed(value))return;
      input.value=value;
      if(value && !input.validity.valid) {input.value=selected;return;}
      if(options.set)options.set(value);
      else {
        if(options.legacy)trigger.value=value?value.split('-').reverse().join('/'):'';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
      }
      close();
    };
    const position=()=> {
      if(!trigger.isConnected){close();return;}
      const r=trigger.getBoundingClientRect();
      const width=dialog.offsetWidth,height=dialog.offsetHeight;
      const left=Math.max(12,Math.min(r.left,innerWidth-width-12));
      const top=innerWidth<=520?Math.max(12,innerHeight-height-18):Math.max(12,Math.min(r.bottom+8,innerHeight-height-12));
      dialog.style.left=`${left}px`;dialog.style.top=`${top}px`;
    };
    const draw=()=> {
      const [y,m]=month.split('-').map(Number);monthSelect.value=pad(m);yearInput.value=y;
      prev.disabled=month<=(min.slice(0,7)||'0001-01');next.disabled=month>=(max.slice(0,7)||'9999-12');
      weekdays.hidden=mode==='month';days.hidden=mode==='month';
      days.replaceChildren();
      if(mode!=='month') {
        const start=parse(`${String(y).padStart(4,'0')}-${pad(m)}-01`),offset=(start.getDay()+6)%7;
        start.setDate(1-offset);
        for(let i=0;i<42;i++) {
          const d=new Date(start);d.setDate(start.getDate()+i);const value=iso(d);
          const b=button(String(d.getDate()),new Intl.DateTimeFormat(locale,{dateStyle:'full'}).format(d));
          b.dataset.day=value;b.disabled=!allowed(valueFor(value));
          b.className=[d.getMonth()!==m-1?'fc-out':'',value===today()?'fc-today':'',value===selected.slice(0,10)?'fc-selected':''].join(' ');
          b.setAttribute('aria-pressed',String(value===selected.slice(0,10)));
          b.onclick=()=>{if(mode==='datetime'){selected=valueFor(value);draw();}else write(value);};
          days.append(b);
        }
      }
      now.disabled=!allowed(valueFor(today()));clear.hidden=input.required;
      if(apply)apply.disabled=!allowed(mode==='month'?month:valueFor(selected.slice(0,10)||today()));
      if(dialog.open)position();
    };
    const shift=n=> {const d=parse(month+'-01');d.setMonth(d.getMonth()+n);month=iso(d).slice(0,7);draw();};
    prev.onclick=()=>shift(-1);next.onclick=()=>shift(1);
    const changeMonth=()=> {
      const year=Number(yearInput.value);
      if(!Number.isInteger(year)||year<1||year>9999)return;
      month=`${String(year).padStart(4,'0')}-${monthSelect.value}`;draw();
    };
    monthSelect.onchange=changeMonth;yearInput.onchange=changeMonth;
    clear.onclick=()=>write('');now.onclick=()=>write(valueFor(today()));
    if(apply)apply.onclick=()=>write(mode==='month'?month:valueFor(selected.slice(0,10)||today()));
    if(time)time.oninput=draw;
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
    dialog.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
      if(e.key==='Tab') {
        const items=[...dialog.querySelectorAll('button,input,select')].filter(n=>!n.disabled && n.getClientRects().length);
        if(e.shiftKey && document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}
        else if(!e.shiftKey && document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
      }
      const day=e.target.closest('[data-day]'),steps={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
      if(day && steps[e.key]) {
        e.preventDefault();const d=parse(day.dataset.day);d.setDate(d.getDate()+steps[e.key]);const value=iso(d);
        month=value.slice(0,7);draw();const target=days.querySelector(`[data-day="${value}"]`);if(target&&!target.disabled)target.focus();
      }
    });
    document.body.append(dialog);active={dialog,trigger,position};draw();dialog.showModal();position();
    trigger.setAttribute('aria-expanded','true');
    (days.querySelector('.fc-selected:not(:disabled)') || days.querySelector('.fc-today:not(:disabled)') || monthSelect).focus({preventScroll:true});
  }
  function targetInfo(target) {
    const trigger=target.closest('input[type="date"],input[type="month"],input[type="datetime-local"],[data-date-input],.dpt');
    if(!trigger || trigger.closest('.fa-calendar') || target.closest('.dpx'))return null;
    if(trigger.matches('.dpt'))return {trigger,input:document.getElementById(trigger.dataset.for),options:{set:value=>window.dpSet(trigger.dataset.for,value)}};
    if(trigger.hasAttribute('data-date-input')) {
      const birth=trigger.dataset.dateMode==='birth';
      return {trigger,input:document.getElementById(trigger.dataset.dateInput+'Value'),options:{legacy:true,min:birth?'':today(),max:birth?today():''}};
    }
    return {trigger,input:trigger};
  }
  document.addEventListener('click',e=>{
    const info=targetInfo(e.target);if(!info||info.input?.disabled)return;
    e.preventDefault();e.stopImmediatePropagation();open(info.trigger,info.input,info.options);
  },true);
  document.addEventListener('keydown',e=>{
    if(!['Enter',' '].includes(e.key) && !(e.altKey&&e.key==='ArrowDown'))return;
    const info=targetInfo(e.target);if(!info)return;e.preventDefault();e.stopImmediatePropagation();open(info.trigger,info.input,info.options);
  },true);
  window.addEventListener('resize',()=>active?.position());
  new MutationObserver(()=>{if(active&&!active.trigger.isConnected)close();}).observe(document.documentElement,{childList:true,subtree:true});
  window.FACalendar={open,close};
})();
