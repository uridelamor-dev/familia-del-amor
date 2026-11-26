(() => {
  const abrir = document.getElementById('reviewOpen');
  const dialog = document.getElementById('reviewDialog');
  const estado = document.getElementById('reviewStatus');
  const lista = document.getElementById('reviewVenues');
  let enlaces;
  let cargando = false;

  abrir.addEventListener('click', async () => {
    dialog.showModal();
    if (enlaces || cargando) return;
    cargando = true;
    estado.textContent = 'Cargando locales…';
    try {
      const respuesta = await fetch('/api/publico/resenas/locales');
      if (!respuesta.ok) throw new Error();
      const { data } = await respuesta.json();
      enlaces = new Map(data.map(({ local, url }) => [local, url]));
      lista.replaceChildren(...Array.from(document.querySelectorAll('.place-card'), ficha => {
        const url = enlaces.get(ficha.querySelector('[data-reserva-local]').dataset.reservaLocal);
        const opcion = document.createElement(url ? 'a' : 'span');
        opcion.className = 'review-venue';
        if (url) {
          opcion.href = url;
          opcion.target = '_blank';
          opcion.rel = 'noopener noreferrer';
        } else {
          opcion.setAttribute('aria-disabled', 'true');
        }
        const nombre = document.createElement('span');
        nombre.textContent = ficha.querySelector('h3').textContent;
        const poblacion = document.createElement('small');
        poblacion.textContent = ficha.querySelector('.place-city').textContent + (url ? ' ↗' : ' · Sin enlace');
        opcion.append(nombre, poblacion);
        return opcion;
      }));
      estado.textContent = enlaces.size ? '' : 'Los enlaces de Google aún no están disponibles.';
    } catch {
      enlaces = undefined;
      estado.textContent = 'No se han podido cargar los enlaces. Cierra y vuelve a intentarlo.';
    } finally {
      cargando = false;
    }
  });
})();
