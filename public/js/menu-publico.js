for (const boton of document.querySelectorAll('[data-menu-publico]')) {
  const menu = document.getElementById(boton.getAttribute('aria-controls'));
  if (!menu) continue;

  function mostrar(abierto) {
    menu.classList.toggle('open', abierto);
    boton.setAttribute('aria-expanded', String(abierto));
  }

  boton.addEventListener('click', () => mostrar(!menu.classList.contains('open')));
  menu.addEventListener('click', event => {
    if (event.target.closest('a, button')) mostrar(false);
  });
  boton.closest('header').addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.classList.contains('open')) {
      mostrar(false);
      boton.focus();
    }
  });
}
