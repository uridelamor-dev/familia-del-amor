(() => {
  const dialog = document.getElementById('reservaDialog');
  if (!dialog) return;
  const select = dialog.querySelector('#localSelect');
  if (select) {
    const picker = document.createElement('div');
    picker.className = 'reserva-local-picker';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'reserva-local-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Local: elige local');
    const list = document.createElement('div');
    list.id = 'reservaLocalOptions';
    list.className = 'reserva-local-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Locales');
    list.hidden = true;
    trigger.setAttribute('aria-controls', list.id);
    select.after(picker);
    picker.append(trigger, list);
    select.hidden = true;
    function closeList() { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
    function render() {
      const label = select.selectedOptions[0]?.textContent || 'Elige local…';
      trigger.textContent = label;
      trigger.setAttribute('aria-label', 'Local: ' + label);
      list.replaceChildren();
      for (const option of select.options) {
        if (!option.value || option.disabled) continue;
        const item = document.createElement('button');
        item.type = 'button'; item.textContent = option.textContent;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.tabIndex = -1;
        item.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', {bubbles:true}));
          render(); closeList(); trigger.focus();
        });
        list.append(item);
      }
    }
    function openList(last = false) {
      render(); list.hidden = false; trigger.setAttribute('aria-expanded', 'true');
      const items = [...list.children];
      (last ? items.at(-1) : list.querySelector('[aria-selected="true"]') || items[0])?.focus();
    }
    trigger.addEventListener('click', () => list.hidden ? openList() : closeList());
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openList(event.key === 'ArrowUp'); }
    });
    list.addEventListener('keydown', event => {
      const items = [...list.children], index = items.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeList(); trigger.focus(); }
      else if (event.key === 'Tab') closeList();
    });
    document.addEventListener('click', event => { if (!picker.contains(event.target)) closeList(); });
    dialog.addEventListener('close', closeList);
    select.addEventListener('change', render);
    select.form?.addEventListener('reset', () => setTimeout(render, 0));
    new MutationObserver(render).observe(select, {childList:true, subtree:true, characterData:true});
    render();
  }
  let opener = null, previousOverflow = '';
  function open(trigger) {
    if (dialog.open) return;
    opener = trigger || document.activeElement;
    document.querySelector('.nav')?.classList.remove('open');
    document.getElementById('navToggle')?.setAttribute('aria-expanded', 'false');
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.scrollTop = 0;
    dialog.querySelector('.reserva-dialog-close').focus();
  }
  document.querySelectorAll('a[href="#reservas"]').forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.setAttribute('aria-controls', 'reservaDialog');
    link.addEventListener('click', event => {
      event.preventDefault();
      open(link);
    });
  });
  dialog.querySelector('.reserva-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    if (opener?.isConnected) opener.focus({preventScroll:true});
  });
  const openFromHash = () => { if (location.hash === '#reservas') open(); };
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();
