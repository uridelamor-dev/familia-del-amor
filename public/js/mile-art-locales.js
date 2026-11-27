// La foto acompaña al puntero en el directorio de escritorio.
(() => {
  const escritorio = matchMedia('(min-width:901px) and (hover:hover) and (prefers-reduced-motion:no-preference)');
  const visor = document.createElement('div');
  visor.className = 'mile-peek';
  visor.hidden = true;
  visor.setAttribute('aria-hidden', 'true');
  const foto = document.createElement('img');
  foto.alt = '';
  visor.append(foto);
  document.body.append(visor);

  function ocultar() { visor.hidden = true; }
  for (const tarjeta of document.querySelectorAll('.place-card')) {
    tarjeta.addEventListener('pointermove', event => {
      if (!escritorio.matches || event.pointerType === 'touch') return;
      const acciones = tarjeta.querySelector('.place-actions');
      if (event.target.closest('.place-actions') || acciones?.contains(document.activeElement)) {
        ocultar();
        return;
      }
      const origen = tarjeta.querySelector('.place-photo img');
      if (!origen) return;
      if (foto.getAttribute('src') !== (origen.currentSrc || origen.src)) {
        foto.src = origen.currentSrc || origen.src;
      }
      visor.hidden = false;
      const limite = (acciones?.getBoundingClientRect().left ?? innerWidth) - visor.offsetWidth - 14;
      if (limite < 8) { ocultar(); return; }
      const x = Math.min(limite, Math.max(8, event.clientX + 20));
      const y = Math.max(8, Math.min(event.clientY - 100, innerHeight - visor.offsetHeight - 8));
      visor.style.transform = `translate(${x}px, ${y}px)`;
    });
    tarjeta.addEventListener('pointerleave', ocultar);
    tarjeta.querySelector('.place-actions')?.addEventListener('focusin', ocultar);
  }
  addEventListener('scroll', ocultar, {passive:true});
  escritorio.addEventListener('change', ocultar);
})();
