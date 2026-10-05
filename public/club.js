/* Una entrada al registro existente; nunca crea ni revela carnets por su cuenta. */
(() => {
  const host = document.createElement('div');
  host.innerHTML = `<button type="button" class="club-launch" aria-label="Tu carnet gratis: unirme al Club" aria-haspopup="dialog" aria-controls="clubDialog"><span class="club-launch-icon" aria-hidden="true"><svg viewBox="0 0 32 24" width="30" height="24" fill="none"><rect x="1" y="2" width="30" height="20" rx="5" stroke="currentColor" stroke-width="1.5"/><path d="M6 15h8M6 18h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M23 9c-3-3-5 1 0 4 5-3 3-7 0-4Z" fill="currentColor"/></svg></span><span><strong>Tu carnet gratis</strong><small>Descuentos y novedades</small></span><span aria-hidden="true">↗</span></button>
  <dialog id="clubDialog" class="club-dialog" aria-labelledby="clubTitle">
    <button type="button" class="club-close" aria-label="Cerrar el Club">×</button>
    <div class="club-layout"><section class="club-story">
      <span class="club-eyebrow">EL CLUB · FAMILIA DEL AMOR</span>
      <h2 id="clubTitle">Aquí, tú también<br> eres de la familia.</h2>
      <p>Los buenos momentos se disfrutan más cuando vuelves. Hazte el carnet y forma parte de nuestro Club.</p>
      <div class="club-card" aria-hidden="true"><span>FAMILIA DEL AMOR</span><b>Un sitio para ti.</b><div>MIEMBRO DEL CLUB <span>♡</span></div></div>
      <ul class="club-benefits"><li><span aria-hidden="true">↗</span><div><strong>Más motivos para volver</strong><small>Descuentos, premios y vales en las promociones que activemos.</small></div></li><li><span aria-hidden="true">✦</span><div><strong>Las novedades, cerca</strong><small>Recibe nuestras novedades y propuestas por WhatsApp y correo.</small></div></li></ul>
      <p class="club-note">Los beneficios dependen de cada promoción y de sus condiciones.</p>
    </section><section class="club-registration" aria-label="Registro en el Club"><div id="clubFormHost" aria-live="polite"><p>Cargando el formulario…</p></div></section></div>
  </dialog>`;
  document.body.append(host);
  const dialog = host.querySelector('dialog');
  const launch = host.querySelector('.club-launch');
  let ready = false, loading = false, previousOverflow = '';
  const close = () => dialog.close();
  host.querySelector('.club-close').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) close(); } });
  dialog.addEventListener('close', () => { document.body.style.overflow=previousOverflow; launch.focus({preventScroll:true}); });
  async function loadForm() {
    if (ready || loading) return;
    loading = true;
    const target = host.querySelector('#clubFormHost');
    try {
      const response = await fetch('/alta.html');
      if (!response.ok) throw new Error();
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const form = page.querySelector('#altaForm'), success = page.querySelector('#altaHecho');
      if (!form || !success) throw new Error();
      target.replaceChildren(form, success);
      form.querySelector('h1').textContent = 'Tu carnet empieza aquí';
      form.querySelector('#altaSub').textContent = 'Regístrate gratis con tu móvil. Si ya tienes carnet, te enviaremos el enlace para recuperarlo.';
      const acceptance = document.createElement('p');
      acceptance.className = 'club-acceptance';
      acceptance.id = 'clubAcceptance';
      acceptance.textContent = 'Al pulsar «Unirme al Club», aceptas recibir comunicaciones de Familia del Amor por WhatsApp y correo electrónico: novedades, promociones y ventajas del Club. Puedes darte de baja cuando quieras.';
      form.querySelector('.alta-check').replaceWith(acceptance);
      form.querySelector('#altaBtn').textContent = 'Unirme al Club';
      form.querySelector('#altaBtn').setAttribute('aria-describedby', 'clubAcceptance');
      form.querySelector('#altaError').setAttribute('role','alert');
      const script = document.createElement('script'); script.src='/alta.js';
      await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;document.body.append(script);});
      ready = true;
    } catch {
      target.innerHTML='<p>No hemos podido cargar el formulario.</p><a class="alta-btn" href="/alta.html">Abrir el registro</a>';
    } finally { loading = false; }
  }
  function openClub() {
    if(dialog.open) return;
    previousOverflow=document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow='hidden';
    host.querySelector('.club-close').focus();
    loadForm();
  }
  launch.addEventListener('click', openClub);
  const entry=new URLSearchParams(location.search).get('club');
  if(entry==='1') openClub();
  if(entry==='perfil'){
    const profileToken=new URLSearchParams(location.hash.slice(1)).get('t');
    if(profileToken){
      history.replaceState(null,'',location.pathname+location.search);
      previousOverflow=document.body.style.overflow;dialog.showModal();document.body.style.overflow='hidden';
      window.showClubProfile(profileToken,host.querySelector('#clubFormHost')).then(()=>{ready=true;}).catch(()=>{host.querySelector('#clubFormHost').textContent='No se ha podido cargar el perfil. Vuelve a abrirlo desde tu carnet.';});
    }else openClub();
  }
})();
